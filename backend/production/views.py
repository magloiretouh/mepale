"""
MEPALE ERP — Vues Production
"""

import io
import logging
from django.utils import timezone
from django.db import transaction
from django.db.models import ProtectedError
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from authentication.permissions import IsProductionStaff
from .models import (
    TypeArticle, UniteMesure, Article, Nomenclature, OrdreFabrication,
    AffectationEmployeOF, Lot, Perte, CoutRevient, ConsommationLot,
)
from .serializers import (
    TypeArticleSerializer,
    UniteMesureSerializer,
    ArticleSerializer, ArticleListSerializer,
    NomenclatureSerializer, NomenclatureCreateSerializer,
    OrdreFabricationSerializer, OrdreFabricationListSerializer,
    AffectationSerializer,
    LotSerializer, ConsommationLotSerializer,
    PerteSerializer, CoutRevientSerializer,
)
from .services import (
    verifier_disponibilite_matieres,
    confirmer_of,
    demarrer_of,
    terminer_of,
    cloture_of,
    annuler_of,
    generer_reference_of,
)
from .filters import ArticleFilter, OrdreFabricationFilter, LotFilter

logger = logging.getLogger('mepale')


# ---------------------------------------------------------------------------
# Types d'articles  (P2-A — géré depuis l'administration et l'API)
# ---------------------------------------------------------------------------

class TypeArticleViewSet(viewsets.ModelViewSet):
    """
    CRUD complet sur les types d'articles.

    Ces données de référence sont maintenues par l'administration.
    L'API les expose en lecture à tous les utilisateurs authentifiés et
    en écriture aux administrateurs (IsProductionStaff).

    GET  /types-articles/          → liste tous les types
    GET  /types-articles/<id>/     → détail d'un type
    POST /types-articles/          → crée un nouveau type (admin)
    PUT  /types-articles/<id>/     → met à jour un type (admin)
    DEL  /types-articles/<id>/     → supprime un type (admin, si aucun article ne l'utilise)
    """
    queryset           = TypeArticle.objects.all()
    serializer_class   = TypeArticleSerializer
    filter_backends    = [SearchFilter, OrderingFilter]
    search_fields      = ['code', 'libelle']
    ordering           = ['code']
    pagination_class   = None  # Données de référence : tout retourner d'un coup

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsProductionStaff()]

    def perform_destroy(self, instance):
        from django.db.models import ProtectedError
        try:
            instance.delete()
        except ProtectedError:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                f"Le type '{instance.libelle}' est utilisé par des articles et ne peut pas être supprimé. "
                "Réaffectez ou désactivez les articles concernés avant de le supprimer."
            )


# ---------------------------------------------------------------------------
# Unités de mesure
# ---------------------------------------------------------------------------

class UniteMesureViewSet(viewsets.ModelViewSet):
    queryset           = UniteMesure.objects.all()
    serializer_class   = UniteMesureSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [SearchFilter, OrderingFilter]
    search_fields      = ['code', 'libelle']
    ordering           = ['code']
    # Données de référence : pas de pagination, tout retourner d'un coup
    pagination_class   = None


# ---------------------------------------------------------------------------
# Articles
# ---------------------------------------------------------------------------

class ArticleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = ArticleFilter
    search_fields      = ['code', 'designation']
    ordering_fields    = ['designation', 'code', 'date_creation']
    ordering           = ['designation']

    def get_queryset(self):
        return Article.objects.select_related('unite', 'type', 'unite_achat').filter(actif=True)

    def get_serializer_class(self):
        if self.action == 'list':
            return ArticleListSerializer
        return ArticleSerializer

    def destroy(self, request, *args, **kwargs):
        """
        Soft-delete d'un article avec garde-fous métier.
        Bloqué si l'article a des lots, des nomenclatures/OFs ou des réceptions.
        """
        article = self.get_object()
        from logistique.models import LigneBonCommande
        from .models import Lot, Nomenclature, LigneNomenclature

        raisons = []
        if Lot.objects.filter(article=article).exists():
            raisons.append("des lots de stock actifs")
        if (Nomenclature.objects.filter(produit_fini=article).exists()
                or LigneNomenclature.objects.filter(matiere=article).exists()):
            raisons.append("une nomenclature ou un OF")
        if LigneBonCommande.objects.filter(article=article, quantite_recue__gt=0).exists():
            raisons.append("des réceptions enregistrées")

        if raisons:
            return Response(
                {'detail': f"Impossible de supprimer : cet article est lié à {' et à '.join(raisons)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        # Soft delete — appelé par destroy() après les garde-fous ci-dessus
        instance.actif = False
        instance.save()

    @action(detail=False, methods=['get'], url_path='prochain-code',
            permission_classes=[IsAuthenticated])
    def prochain_code(self, request):
        """
        P2-E — Génère le prochain code article côté serveur (séquence sécurisée).

        GET /articles/prochain-code/?type=<uuid>   → par UUID de TypeArticle
        GET /articles/prochain-code/?type=mp        → par code de TypeArticle (rétrocompat.)

        Garantit l'unicité même en cas de créations simultanées : scanne TOUS les
        articles (actifs + inactifs) pour trouver le max actuel et incrémente de 1.

        Retourne : {"code": "MP-0042", "prefix": "MP", "sequence": 42}
        """
        import re

        type_param = request.query_params.get('type', '').strip()
        if not type_param:
            return Response(
                {'detail': 'Le paramètre ?type= est obligatoire (UUID ou code du type article).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Résolution du type — UUID en priorité, puis code texte (rétrocompat.)
        type_obj = None
        try:
            import uuid as _uuid
            _uuid.UUID(type_param)  # Valide si c'est un UUID
            type_obj = TypeArticle.objects.filter(id=type_param).first()
        except ValueError:
            type_obj = TypeArticle.objects.filter(code=type_param.lower()).first()

        if not type_obj:
            return Response(
                {'detail': f"Type article introuvable : '{type_param}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prefix  = type_obj.get_prefixe_effectif()
        pattern = re.compile(rf'^{re.escape(prefix)}-(\d+)$')

        # Scanner TOUS les articles (actifs + inactifs) pour éviter de réutiliser un code
        max_seq = 0
        for code in Article.objects.filter(
            code__startswith=f'{prefix}-'
        ).values_list('code', flat=True):
            m = pattern.match(code)
            if m:
                max_seq = max(max_seq, int(m.group(1)))

        next_seq  = max_seq + 1
        next_code = f'{prefix}-{next_seq:04d}'

        return Response({
            'code':     next_code,
            'prefix':   prefix,
            'sequence': next_seq,
            'type_id':  str(type_obj.id),
            'type_code': type_obj.code,
        })


# ---------------------------------------------------------------------------
# Nomenclatures
# ---------------------------------------------------------------------------

class NomenclatureViewSet(viewsets.ModelViewSet):
    permission_classes = [IsProductionStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['active', 'produit_fini']
    search_fields      = ['produit_fini__designation', 'produit_fini__code']
    ordering           = ['-date_creation']

    def get_queryset(self):
        return Nomenclature.objects.select_related(
            'produit_fini', 'produit_fini__unite', 'cree_par'
        ).prefetch_related('lignes__matiere__unite')

    def get_serializer_class(self):
        if self.request.method in ('POST', 'PUT', 'PATCH'):
            return NomenclatureCreateSerializer
        return NomenclatureSerializer

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                "Cette nomenclature est utilisée par des ordres de fabrication et ne peut pas être supprimée. "
                "Désactivez-la plutôt."
            )

    @action(detail=True, methods=['post'], url_path='dupliquer')
    def dupliquer(self, request, pk=None):
        """POST /nomenclatures/<id>/dupliquer/ — Crée une nouvelle version."""
        source = self.get_object()
        nouvelle_version = Nomenclature.objects.filter(
            produit_fini=source.produit_fini
        ).order_by('-version').first().version + 1

        with transaction.atomic():
            nouvelle = Nomenclature.objects.create(
                produit_fini=source.produit_fini,
                version=nouvelle_version,
                quantite_base=source.quantite_base,
                active=False,
                notes=f"Copie de v{source.version}",
                cree_par=request.user,
            )
            for ligne in source.lignes.all():
                from .models import LigneNomenclature
                LigneNomenclature.objects.create(
                    nomenclature=nouvelle,
                    matiere=ligne.matiere,
                    quantite=ligne.quantite,
                    taux_perte=ligne.taux_perte,
                    notes=ligne.notes,
                )

        serializer = NomenclatureSerializer(nouvelle, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Ordres de Fabrication
# ---------------------------------------------------------------------------

class OrdreFabricationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsProductionStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = OrdreFabricationFilter
    search_fields      = ['reference', 'nomenclature__produit_fini__designation']
    ordering_fields    = ['date_creation', 'date_prevue', 'statut', 'priorite', 'sequence']  # P3-C
    ordering           = ['sequence', '-date_creation']

    def get_queryset(self):
        return OrdreFabrication.objects.select_related(
            'nomenclature__produit_fini__unite',
            'cree_par',
        ).prefetch_related('affectations__employe')

    def get_serializer_class(self):
        if self.action == 'list':
            return OrdreFabricationListSerializer
        return OrdreFabricationSerializer

    def perform_create(self, serializer):
        reference = generer_reference_of()
        serializer.save(cree_par=self.request.user, reference=reference)

    # ── Champs modifiables par statut ────────────────────────────────────────

    _CHAMPS_MODIFIABLES = {
        OrdreFabrication.Statut.CONFIRME: {
            'date_prevue', 'ligne_prod', 'priorite', 'sequence',
            'seuil_rendement', 'seuil_perte', 'notes',
        },
        OrdreFabrication.Statut.EN_COURS: {
            'seuil_rendement', 'seuil_perte', 'notes',
        },
    }

    def destroy(self, request, *args, **kwargs):
        of = self.get_object()
        if of.statut != OrdreFabrication.Statut.BROUILLON:
            return Response(
                {'detail': (
                    f"Impossible de supprimer un OF en statut « {of.get_statut_display()} ». "
                    "Seuls les brouillons peuvent être supprimés."
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        of = self.get_object()
        statut = of.statut
        if 'nomenclature' in request.data:
            return Response(
                {'detail': "La nomenclature d'un OF ne peut pas être modifiée après création."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if statut in (
            OrdreFabrication.Statut.TERMINE,
            OrdreFabrication.Statut.CLOTURE,
            OrdreFabrication.Statut.ANNULE,
        ):
            return Response(
                {'detail': f"Un OF en statut « {of.get_statut_display()} » est en lecture seule."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if statut in self._CHAMPS_MODIFIABLES:
            autorises = self._CHAMPS_MODIFIABLES[statut]
            interdits = set(request.data.keys()) - autorises
            if interdits:
                return Response(
                    {'detail': (
                        f"En statut « {of.get_statut_display()} », seuls ces champs sont modifiables : "
                        f"{', '.join(sorted(autorises))}."
                    )},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return super().update(request, *args, **kwargs)

    # ── Actions métier ──

    @action(detail=True, methods=['post'], url_path='verifier-matieres')
    def verifier_matieres(self, request, pk=None):
        """Vérifie la disponibilité des matières avant lancement."""
        of = self.get_object()
        resultat = verifier_disponibilite_matieres(of)
        return Response(resultat)

    @action(detail=True, methods=['post'], url_path='confirmer')
    def confirmer(self, request, pk=None):
        of = self.get_object()
        try:
            confirmer_of(of)
            return Response({'detail': f"OF {of.reference} confirmé."})
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='demarrer')
    def demarrer(self, request, pk=None):
        of = self.get_object()
        try:
            demarrer_of(of)
            return Response({'detail': f"OF {of.reference} démarré."})
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='terminer')
    def terminer(self, request, pk=None):
        """Saisit la quantité réellement produite."""
        of = self.get_object()
        quantite = request.data.get('quantite_produite')
        if not quantite:
            return Response(
                {'detail': 'quantite_produite est obligatoire.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            terminer_of(of, float(quantite), request.user)
            return Response({'detail': f"OF {of.reference} terminé."})
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='cloturer')
    def cloturer(self, request, pk=None):
        """Clôture l'OF — génère mouvements de stock + coût de revient."""
        of = self.get_object()
        try:
            with transaction.atomic():
                cout = cloture_of(of, request.user)
            serializer = CoutRevientSerializer(cout)
            return Response(serializer.data)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='annuler')
    def annuler(self, request, pk=None):
        """Annule l'OF et libère la réservation de stock si nécessaire."""
        of = self.get_object()
        try:
            annuler_of(of)
            return Response({'detail': f"OF {of.reference} annulé."})
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='stats',
            permission_classes=[IsAuthenticated])
    def stats(self, request):
        """Statistiques production pour le Dashboard."""
        from django.utils import timezone as tz
        from django.db.models import Sum, F
        from django.db.models.functions import TruncDate

        today          = tz.now().date()
        seven_days_ago = today - tz.timedelta(days=6)

        # Compteurs OF
        of_en_cours  = OrdreFabrication.objects.filter(statut='en_cours').count()
        of_confirmes = OrdreFabrication.objects.filter(statut='confirme').count()
        of_en_retard = OrdreFabrication.objects.filter(
            statut__in=['confirme', 'en_cours'], date_prevue__lt=today
        ).count()

        # Rendement moyen (OFs terminés/clôturés)
        ofs_finis   = list(OrdreFabrication.objects.filter(
            statut__in=['termine', 'cloture'], quantite_prevue__gt=0
        ))
        rendements  = [of.rendement for of in ofs_finis if of.rendement > 0]
        rendement_moyen = round(sum(rendements) / len(rendements), 1) if rendements else 0.0

        # 5 derniers OFs terminés/clôturés avec rendement (graphique barres)
        derniers_finis = (
            OrdreFabrication.objects
            .filter(statut__in=['termine', 'cloture'])
            .order_by('-date_fin')[:5]
        )
        rendement_ofs = [{'of': of.reference, 'rendement': of.rendement} for of in derniers_finis]

        # 5 OFs récents pour la table
        ofs_recents = (
            OrdreFabrication.objects
            .select_related('nomenclature__produit_fini__unite')
            .order_by('-date_creation')[:5]
        )
        ofs_data = [
            {
                'reference':         of.reference,
                'produit':           of.nomenclature.produit_fini.designation,
                'quantite_prevue':   float(of.quantite_prevue),
                'quantite_produite': float(of.quantite_produite),
                'unite':             of.nomenclature.produit_fini.unite.code,
                'statut':            of.statut,
                'statut_label':      of.get_statut_display(),
                'rendement':         of.rendement,
            }
            for of in ofs_recents
        ]

        # Production 7 derniers jours via MouvementStock
        from logistique.models import MouvementStock, StockArticle
        mvts = (
            MouvementStock.objects
            .filter(type='entree_prod', date_mouvement__date__gte=seven_days_ago)
            .annotate(jour=TruncDate('date_mouvement'))
            .values('jour')
            .annotate(total=Sum('quantite'))
            .order_by('jour')
        )
        mvt_dict  = {str(m['jour']): float(m['total']) for m in mvts}
        jours_fr  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
        production_7j = [
            {
                'jour':    jours_fr[(seven_days_ago + tz.timedelta(days=i)).weekday()],
                'produit': mvt_dict.get(str(seven_days_ago + tz.timedelta(days=i)), 0),
                'cible':   450,
            }
            for i in range(7)
        ]

        # Alertes péremption
        alertes_peremption = Lot.objects.filter(
            statut='disponible',
            date_peremption__lte=today + tz.timedelta(days=7),
            date_peremption__gte=today,
        ).count()

        # Alertes stock (sous seuil)
        alertes_stock = StockArticle.objects.filter(
            seuil_alerte__gt=0, quantite_disponible__lt=F('seuil_alerte')
        ).count()

        # Alertes rendement
        alertes_rendement = []
        for of in ofs_finis[-20:]:
            seuil = float(of.seuil_rendement)
            if 0 < of.rendement < seuil:
                alertes_rendement.append({
                    'reference': of.reference,
                    'rendement': of.rendement,
                    'seuil':     seuil,
                    'message':   f"OF {of.reference} : rendement {of.rendement}% < seuil {seuil}%",
                })

        return Response({
            'of_en_cours':        of_en_cours,
            'of_confirmes':       of_confirmes,
            'of_en_retard':       of_en_retard,
            'rendement_moyen':    rendement_moyen,
            'rendement_ofs':      rendement_ofs,
            'ofs_recents':        ofs_data,
            'production_7j':      production_7j,
            'alertes_peremption': alertes_peremption,
            'alertes_stock':      alertes_stock,
            'alertes_rendement':  alertes_rendement,
        })

    @action(detail=True, methods=['get'], url_path='tracabilite')
    def tracabilite(self, request, pk=None):
        """Traçabilité complète d'un OF (lots MP consommés + lots PF produits)."""
        of = self.get_object()
        consommations = ConsommationLot.objects.filter(of=of).select_related(
            'lot_mp__article', 'lot_pf__article'
        )
        lots_pf = of.lots_produits.select_related('article')

        return Response({
            'of': of.reference,
            'lots_pf': LotSerializer(lots_pf, many=True).data,
            'consommations': ConsommationLotSerializer(consommations, many=True).data,
        })

    @action(detail=True, methods=['get'], url_path='historique')
    def historique(self, request, pk=None):
        """
        P3-A — Historique des modifications d'un OF (django-simple-history).

        GET /ordres-fabrication/<id>/historique/

        Retourne les 50 dernières entrées d'historique avec :
          - date, utilisateur, type d'opération
          - liste des champs modifiés (ancien → nouveau) pour les mises à jour
        """
        HISTORY_TYPE_LABELS = {
            '+': 'Création',
            '~': 'Modification',
            '-': 'Suppression',
        }
        CHAMPS_LABELS = {
            'statut':             'Statut',
            'quantite_prevue':    'Quantité prévue',
            'quantite_produite':  'Quantité produite',
            'date_prevue':        'Date prévue',
            'ligne_prod':         'Ligne de prod.',
            'notes':              'Notes',
            'priorite':           'Priorité',
            'sequence':           'Séquence',
            'seuil_rendement':    'Seuil rendement',
            'seuil_perte':        'Seuil perte',
        }

        of      = self.get_object()
        records = of.history.select_related('history_user').order_by('-history_date')[:50]

        result = []
        for h in records:
            champs_modifies = []
            if h.history_type == '~' and h.prev_record:
                try:
                    delta = h.diff_against(h.prev_record)
                    for change in delta.changes:
                        # Ignorer les champs techniques / snapshots volumineux
                        if change.field in ('lignes_snapshot', 'date_modif'):
                            continue
                        champs_modifies.append({
                            'champ':        CHAMPS_LABELS.get(change.field, change.field),
                            'champ_raw':    change.field,
                            'ancien':       str(change.old) if change.old is not None else '—',
                            'nouveau':      str(change.new) if change.new is not None else '—',
                        })
                except Exception:
                    pass  # diff impossible (premier enregistrement ou données corrompues)

            result.append({
                'id':              h.history_id,
                'date':            h.history_date,
                'user':            (
                    h.history_user.get_full_name() or h.history_user.username
                    if h.history_user else 'Système'
                ),
                'type':            HISTORY_TYPE_LABELS.get(h.history_type, h.history_type),
                'statut':          h.statut,
                'champs_modifies': champs_modifies,
            })

        return Response(result)

    @action(detail=True, methods=['post'], url_path='affecter')
    def affecter(self, request, pk=None):
        """POST /ordres-fabrication/<id>/affecter/ — Affecte un employé à l'OF."""
        of = self.get_object()
        employe_id = request.data.get('employe')
        role_prod  = request.data.get('role_prod', '')
        if not employe_id:
            return Response(
                {'detail': 'employe est obligatoire.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from authentication.models import Utilisateur
        try:
            employe = Utilisateur.objects.get(id=employe_id)
        except Utilisateur.DoesNotExist:
            return Response({'detail': 'Employé introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        aff, created = AffectationEmployeOF.objects.get_or_create(
            of=of, employe=employe,
            defaults={'role_prod': role_prod},
        )
        if not created:
            aff.role_prod = role_prod
            aff.save(update_fields=['role_prod'])
        code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(AffectationSerializer(aff).data, status=code)

    @action(detail=True, methods=['delete'], url_path=r'retirer/(?P<aff_id>[^/.]+)')
    def retirer(self, request, pk=None, aff_id=None):
        """DELETE /ordres-fabrication/<id>/retirer/<aff_id>/ — Retire une affectation."""
        of = self.get_object()
        try:
            aff = AffectationEmployeOF.objects.get(id=aff_id, of=of)
            aff.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except AffectationEmployeOF.DoesNotExist:
            return Response({'detail': 'Affectation introuvable.'}, status=status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Lots
# ---------------------------------------------------------------------------

class LotViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = LotFilter
    search_fields      = ['numero_lot', 'article__designation', 'article__code']
    ordering_fields    = ['date_peremption', 'date_fabrication', 'quantite_restante']
    ordering           = ['article', 'date_peremption']
    serializer_class   = LotSerializer

    def get_queryset(self):
        return Lot.objects.select_related('article__unite', 'ordre_fabrication')

    @action(detail=False, methods=['get'], url_path='alertes-peremption')
    def alertes_peremption(self, request):
        """GET /lots/alertes-peremption/?jours=7 — Lots proches de péremption."""
        jours = int(request.query_params.get('jours', 7))
        date_limite = timezone.now().date() + timezone.timedelta(days=jours)
        lots = Lot.objects.filter(
            statut=Lot.Statut.DISPONIBLE,
            date_peremption__lte=date_limite,
            date_peremption__gte=timezone.now().date(),
        ).select_related('article__unite').order_by('date_peremption')
        return Response(LotSerializer(lots, many=True).data)

    @action(detail=True, methods=['post'], url_path='bloquer')
    def bloquer(self, request, pk=None):
        """Met un lot en quarantaine."""
        lot   = self.get_object()
        motif = request.data.get('motif', '')
        if not motif:
            return Response(
                {'detail': 'Le motif de blocage est obligatoire.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if lot.statut == Lot.Statut.EPUISE:
            return Response(
                {'detail': 'Impossible de bloquer un lot épuisé.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lot.statut = Lot.Statut.BLOQUE
        lot.notes  = f"{lot.notes}\n[BLOQUÉ {timezone.now().strftime('%Y-%m-%d')}] {motif}".strip()
        lot.save(update_fields=['statut', 'notes'])
        logger.info("Lot %s bloqué par %s — %s", lot.numero_lot, request.user, motif)
        return Response({'detail': f"Lot {lot.numero_lot} mis en quarantaine."})

    @action(detail=True, methods=['post'], url_path='debloquer')
    def debloquer(self, request, pk=None):
        """Remet un lot bloqué en disponible."""
        lot = self.get_object()
        if lot.statut != Lot.Statut.BLOQUE:
            return Response(
                {'detail': 'Seuls les lots bloqués peuvent être débloqués.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lot.statut = Lot.Statut.DISPONIBLE
        lot.save(update_fields=['statut'])
        logger.info("Lot %s débloqué par %s", lot.numero_lot, request.user)
        return Response({'detail': f"Lot {lot.numero_lot} remis en disponible."})

    @action(detail=True, methods=['post'], url_path='detruire')
    def detruire(self, request, pk=None):
        """Destruction définitive — retire les unités du stock."""
        lot           = self.get_object()
        justification = request.data.get('justification', '')
        if not justification:
            return Response(
                {'detail': 'La justification est obligatoire pour la destruction.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if lot.statut == Lot.Statut.EPUISE:
            return Response({'detail': 'Ce lot est déjà épuisé.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            qte_restante = lot.quantite_restante
            lot.quantite_restante = 0
            lot.statut = Lot.Statut.EPUISE
            lot.notes  = f"{lot.notes}\n[DÉTRUIT {timezone.now().strftime('%Y-%m-%d')}] {justification}".strip()
            lot.save(update_fields=['quantite_restante', 'statut', 'notes'])

            if qte_restante > 0:
                from logistique.models import MouvementStock, StockArticle
                MouvementStock.objects.create(
                    article=lot.article,
                    lot=lot,
                    type=MouvementStock.Type.AJUSTEMENT_NEG,
                    quantite=qte_restante,
                    sens=-1,
                    cout_unitaire=lot.cout_unitaire,
                    reference_doc=f"DETRUCT/{lot.numero_lot}",
                    notes=justification,
                    effectue_par=request.user,
                )
                stock, _ = StockArticle.objects.select_for_update().get_or_create(
                    article=lot.article,
                    defaults={'quantite_disponible': 0},
                )
                stock.quantite_disponible = max(0, stock.quantite_disponible - qte_restante)
                stock.save(update_fields=['quantite_disponible', 'derniere_maj'])

        logger.warning("Lot %s DÉTRUIT par %s — %s unités", lot.numero_lot, request.user, qte_restante)
        return Response({'detail': f"Lot {lot.numero_lot} détruit. {qte_restante} unités retirées du stock."})

    @action(detail=True, methods=['get'], url_path='tracabilite')
    def tracabilite_lot(self, request, pk=None):
        """Traçabilité bidirectionnelle du lot (MP→PF et PF→MP)."""
        lot  = self.get_object()
        data = {'lot': LotSerializer(lot).data}

        # Lot MP : trouver les OFs qui l'ont consommé
        consos_mp = ConsommationLot.objects.filter(lot_mp=lot).select_related(
            'of', 'lot_pf__article',
        )
        if consos_mp.exists():
            data['utilise_dans_ofs'] = [
                {
                    'of_reference': c.of.reference,
                    'lot_pf': c.lot_pf.numero_lot if c.lot_pf else None,
                    'quantite': str(c.quantite),
                    'date_consommation': str(c.date_consommation),
                }
                for c in consos_mp
            ]

        # Lot PF : trouver les MP consommés pour le produire
        if lot.ordre_fabrication:
            consos_pf = ConsommationLot.objects.filter(
                of=lot.ordre_fabrication,
            ).select_related('lot_mp__article')
            data['of_source']          = lot.ordre_fabrication.reference
            data['matieres_consommees'] = [
                {
                    'lot_mp': c.lot_mp.numero_lot,
                    'article_mp': c.lot_mp.article.designation,
                    'quantite': str(c.quantite),
                    'date': str(c.date_consommation),
                }
                for c in consos_pf
            ]

        return Response(data)

    @action(detail=True, methods=['get'], url_path='rapport-pdf')
    def rapport_pdf(self, request, pk=None):
        """Génère un rapport PDF pour un lot (requiert reportlab)."""
        lot = self.get_object()
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.lib.units import cm
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
        except ImportError:
            return Response(
                {'detail': 'ReportLab non installé. Exécutez : pip install reportlab'},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        buffer = io.BytesIO()
        doc    = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm,
        )
        styles   = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph("MEPALE ERP — Rapport de lot", styles['Title']))
        elements.append(Spacer(1, 0.5*cm))

        info_data = [
            ['Numéro de lot',    lot.numero_lot],
            ['Article',          f"{lot.article.code} — {lot.article.designation}"],
            ['Statut',           lot.get_statut_display()],
            ['Date fabrication', str(lot.date_fabrication)],
            ['Date péremption',  str(lot.date_peremption) if lot.date_peremption else '—'],
            ['Qté initiale',     f"{lot.quantite_initiale} {lot.article.unite.code}"],
            ['Qté restante',     f"{lot.quantite_restante} {lot.article.unite.code}"],
            ['Coût unitaire',    f"{lot.cout_unitaire:,.0f} FCFA"],
        ]
        t = Table(info_data, colWidths=[6*cm, 11*cm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f0f0f0')),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)

        if lot.notes:
            elements.append(Spacer(1, 0.5*cm))
            elements.append(Paragraph(f"<b>Notes :</b> {lot.notes}", styles['Normal']))

        doc.build(elements)
        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="lot_{lot.numero_lot}.pdf"'
        return response


# ---------------------------------------------------------------------------
# Pertes & Rebuts
# ---------------------------------------------------------------------------

class PerteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsProductionStaff]
    serializer_class   = PerteSerializer
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    filterset_fields   = ['of', 'type']
    ordering           = ['-date_saisie']

    def get_queryset(self):
        return Perte.objects.select_related('article', 'saisie_par')

    def perform_create(self, serializer):
        from django.db.models import Sum
        perte = serializer.save(saisie_par=self.request.user)

        # Alerte si les pertes cumulées dépassent le seuil paramétré sur l'OF
        of = perte.of
        total_pertes = of.pertes.aggregate(total=Sum('quantite'))['total'] or 0
        if float(of.quantite_prevue) > 0:
            pct_perte = float(total_pertes) / float(of.quantite_prevue) * 100
            seuil     = float(of.seuil_perte)
            if pct_perte > seuil:
                logger.warning(
                    "ALERTE PERTE : OF %s — pertes cumulées %.2f%% > seuil %.2f%% "
                    "(total %s %s sur %s %s prévus)",
                    of.reference, round(pct_perte, 2), seuil,
                    float(total_pertes), perte.article.unite.code,
                    float(of.quantite_prevue), perte.article.unite.code,
                )


# ---------------------------------------------------------------------------
# Coût de revient
# ---------------------------------------------------------------------------

class CoutRevientViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsProductionStaff]
    serializer_class   = CoutRevientSerializer
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    filterset_fields   = ['of']
    ordering           = ['-date_calcul']

    def get_queryset(self):
        return CoutRevient.objects.select_related('of')
