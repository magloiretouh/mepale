"""
MEPALE ERP — Vues Logistique
"""

import io
import logging
from django.db import models
from django.utils import timezone
from django.db import transaction
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from authentication.permissions import IsLogistiqueStaff, IsAdminOrDirecteur
from .models import (
    Fournisseur, ContactFournisseur, FournisseurArticle, ContratFournisseur,
    StockArticle, MouvementStock,
    DemandeAchat, LigneDemandeAchat, BonCommande, LigneBonCommande, Reception,
    ConditionTarifaire, ConditionAppliqueeBC,
    RetourFournisseur,
    EvaluationFournisseur,
    FactureFournisseur, PaiementFacture, LigneFactureFournisseur, EcheanceFacture,
    InventaireSession, LigneInventaire,
)
from .serializers import (
    FournisseurSerializer, FournisseurListSerializer,
    ContactFournisseurSerializer, FournisseurArticleSerializer, ContratFournisseurSerializer,
    EvaluationFournisseurSerializer,
    StockArticleSerializer, MouvementStockSerializer, MouvementStockCreateSerializer,
    DemandeAchatSerializer, DemandeAchatCreateSerializer, DemandeAchatUpdateSerializer,
    BonCommandeSerializer, BonCommandeCreateSerializer,
    LigneBCSerializer, LigneBCUpdateSerializer, LigneBCStandaloneCreateSerializer,
    ConditionTarifaireSerializer, ConditionAppliqueeBCSerializer, ConditionAppliqueeBCCreateSerializer,
    ReceptionSerializer, ReceptionCreateSerializer,
    RetourFournisseurSerializer,
    FactureFournisseurSerializer, FactureFournisseurCreateSerializer, PaiementFactureSerializer,
    InventaireSessionSerializer, LigneInventaireSerializer,
)
from .services import (
    valider_reception, valider_retour, verifier_gel_stock,
    propositions_reappro,
    verifier_coherence_reservations, recalculer_reservations_article,
    auditer_stock_article, recalculer_stock_depuis_mouvements,
)
from .filters import FournisseurFilter, StockFilter, MouvementFilter, BonCommandeFilter, FactureFilter, InventaireFilter

logger = logging.getLogger('mepale')


# ---------------------------------------------------------------------------
# Fournisseurs
# ---------------------------------------------------------------------------

class FournisseurViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = FournisseurFilter
    search_fields      = ['raison_sociale', 'code', 'nif']
    ordering_fields    = ['raison_sociale', 'code', 'date_creation']
    ordering           = ['raison_sociale']

    def get_queryset(self):
        return Fournisseur.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return FournisseurListSerializer
        return FournisseurSerializer

    def perform_destroy(self, instance):
        instance.actif = False
        instance.save()

    @action(detail=True, methods=['post'], url_path='blacklister')
    def blacklister(self, request, pk=None):
        fournisseur = self.get_object()
        motif = request.data.get('motif', '')
        if not motif:
            return Response(
                {'detail': 'Le motif est obligatoire.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        fournisseur.blackliste      = True
        fournisseur.motif_blacklist = motif
        fournisseur.actif           = False
        fournisseur.save(update_fields=['blackliste', 'motif_blacklist', 'actif'])
        return Response({'detail': f"{fournisseur.raison_sociale} blacklisté."})

    @action(detail=True, methods=['post'], url_path='reactiver')
    def reactiver(self, request, pk=None):
        fournisseur = self.get_object()
        fournisseur.blackliste      = False
        fournisseur.motif_blacklist = ''
        fournisseur.actif           = True
        fournisseur.save(update_fields=['blackliste', 'motif_blacklist', 'actif'])
        return Response({'detail': f"{fournisseur.raison_sociale} réactivé."})

    @action(detail=False, methods=['get'], url_path='prochain-code')
    def prochain_code(self, request):
        """GET /fournisseurs/prochain-code/ — Génère le prochain code FOUR-XXXX."""
        code = Fournisseur.prochain_code()
        return Response({'code': code})


# ---------------------------------------------------------------------------
# Contacts Fournisseur
# ---------------------------------------------------------------------------

class ContactFournisseurViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    serializer_class   = ContactFournisseurSerializer
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    filterset_fields   = ['fournisseur', 'principal']
    ordering           = ['-principal', 'nom']

    def get_queryset(self):
        return ContactFournisseur.objects.select_related('fournisseur')


# ---------------------------------------------------------------------------
# Articles Fournisseur (catalogue)
# ---------------------------------------------------------------------------

class FournisseurArticleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    serializer_class   = FournisseurArticleSerializer
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['fournisseur', 'article', 'actif']
    search_fields      = ['reference_fournisseur', 'article__designation']
    ordering           = ['article__designation']

    def get_queryset(self):
        return FournisseurArticle.objects.select_related(
            'fournisseur', 'article__unite',
        )


# ---------------------------------------------------------------------------
# Contrats Fournisseur
# ---------------------------------------------------------------------------

class ContratFournisseurViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    serializer_class   = ContratFournisseurSerializer
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['fournisseur', 'type_contrat', 'actif']
    search_fields      = ['reference', 'description']
    ordering           = ['-date_debut']

    def get_queryset(self):
        return ContratFournisseur.objects.select_related('fournisseur')


# ---------------------------------------------------------------------------
# Évaluations Fournisseurs
# ---------------------------------------------------------------------------

class EvaluationFournisseurViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    serializer_class   = EvaluationFournisseurSerializer
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    filterset_fields   = ['fournisseur', 'bon_commande']
    ordering           = ['-date_evaluation']

    def get_queryset(self):
        return EvaluationFournisseur.objects.select_related(
            'fournisseur', 'bon_commande', 'evaluateur',
        )

    def perform_create(self, serializer):
        serializer.save(evaluateur=self.request.user)


# ---------------------------------------------------------------------------
# Stock
# ---------------------------------------------------------------------------

class StockArticleViewSet(viewsets.ModelViewSet):
    """Stock — lecture + mise à jour des seuils."""
    permission_classes = [IsAuthenticated]
    serializer_class   = StockArticleSerializer
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = StockFilter
    search_fields      = ['article__designation', 'article__code']
    ordering_fields    = ['quantite_disponible', 'article__designation']
    ordering           = ['article__designation']
    http_method_names  = ['get', 'patch', 'head', 'options']   # pas de POST/DELETE

    def get_queryset(self):
        return StockArticle.objects.select_related('article__unite')

    @action(detail=False, methods=['get'], url_path='sous-seuil')
    def sous_seuil(self, request):
        """GET /stock/sous-seuil/ — Articles sous le seuil d'alerte."""
        stocks = [s for s in StockArticle.objects.select_related('article__unite') if s.est_sous_seuil]
        return Response(StockArticleSerializer(stocks, many=True).data)

    @action(detail=False, methods=['get'], url_path='valeur-totale')
    def valeur_totale(self, request):
        """
        M6 — GET /stock/valeur-totale/
        Retourne la valeur financière totale du stock disponible (tous articles).
        Utile pour le bilan de stock, les rapports de clôture et la comptabilité.
        """
        from django.db.models import Sum, F, ExpressionWrapper
        from django.db.models import DecimalField as DBDecimalField
        result = StockArticle.objects.annotate(
            valeur=ExpressionWrapper(
                F('quantite_disponible') * F('article__prix_standard'),
                output_field=DBDecimalField(max_digits=20, decimal_places=2),
            )
        ).aggregate(total=Sum('valeur'))
        return Response({
            'valeur_totale': float(result['total'] or 0),
            'nb_articles':   StockArticle.objects.count(),
        })

    @action(detail=True, methods=['post'], url_path='generer-da')
    def generer_da(self, request, pk=None):
        """POST /stock/<id>/generer-da/ — Génère une DA depuis un article sous seuil."""
        stock = self.get_object()
        if not stock.est_sous_seuil:
            return Response(
                {'detail': "Le stock n'est pas sous le seuil d'alerte."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qte = stock.qte_reappro if stock.qte_reappro > 0 else stock.seuil_alerte

        from logistique.services import generer_reference_da
        with transaction.atomic():
            da = DemandeAchat.objects.create(
                reference=generer_reference_da(),
                urgence=True,
                notes=f"Générée automatiquement — stock {stock.quantite_disponible} < seuil {stock.seuil_alerte}",
                demandeur=request.user,
            )
            LigneDemandeAchat.objects.create(
                demande=da,
                article=stock.article,
                quantite=qte,
            )

        return Response(DemandeAchatSerializer(da).data, status=status.HTTP_201_CREATED)

    # ── S3 — Propositions de réapprovisionnement (MD07-like) ─────────────────

    @action(detail=False, methods=['get'], url_path='propositions-reappro')
    def propositions_reappro(self, request):
        """
        S3 — GET /stock/propositions-reappro/
        Liste tous les articles sous seuil avec quantité suggérée + meilleur fournisseur.
        Équivalent SAP MD07 (liste des propositions de réapprovisionnement).
        """
        props = propositions_reappro()
        data = []
        for p in props:
            stock = p['stock']
            fa    = p['fournisseur_article']
            data.append({
                'stock_id':          str(stock.pk),
                'article_id':        str(stock.article.pk),
                'article_code':      stock.article.code,
                'article_designation': stock.article.designation,
                'unite':             stock.article.unite.code,
                'quantite_disponible': float(stock.quantite_disponible),
                'seuil_alerte':      float(stock.seuil_alerte),
                'stock_min':         float(stock.stock_min),
                'stock_securite':    float(stock.stock_securite),
                'niveau_alerte':     p['niveau_alerte'],
                'qte_suggeree':      float(p['qte_suggeree']),
                'fournisseur_id':    str(fa.fournisseur.pk) if fa else None,
                'fournisseur_nom':   fa.fournisseur.raison_sociale if fa else None,
                'fournisseur_ref':   fa.reference_fournisseur if fa else None,
                'prix_unitaire':     float(fa.prix_unitaire) if fa else None,
                'delai_livraison':   fa.delai_livraison if fa else None,
            })
        return Response({'count': len(data), 'results': data})

    @action(detail=False, methods=['post'], url_path='creer-da-groupee',
            permission_classes=[IsLogistiqueStaff])
    def creer_da_groupee(self, request):
        """
        S3 — POST /stock/creer-da-groupee/
        Crée une DA groupée depuis une liste de propositions sélectionnées.

        Body : { "urgence": true, "lignes": [{"article": "<uuid>", "quantite": 10}, ...] }
        """
        from .services import generer_reference_da
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from production.models import Article

        lignes_data = request.data.get('lignes', [])
        urgence     = request.data.get('urgence', False)
        notes       = request.data.get('notes', '')

        if not lignes_data:
            raise DRFValidationError({'lignes': 'Au moins une ligne est requise.'})

        with transaction.atomic():
            da = DemandeAchat.objects.create(
                reference=generer_reference_da(),
                urgence=urgence,
                notes=notes or 'Générée depuis propositions de réapprovisionnement.',
                demandeur=request.user,
            )
            for ligne in lignes_data:
                try:
                    article = Article.objects.get(pk=ligne['article'])
                except (Article.DoesNotExist, KeyError):
                    raise DRFValidationError({'lignes': f"Article introuvable : {ligne.get('article')}"})
                quantite = ligne.get('quantite', 0)
                if not quantite or float(quantite) <= 0:
                    raise DRFValidationError({'lignes': f"Quantité invalide pour {article.designation}."})
                LigneDemandeAchat.objects.create(
                    demande=da,
                    article=article,
                    quantite=quantite,
                )

        logger.info(
            "DA groupée %s créée par %s (%d lignes)",
            da.reference, request.user, da.lignes.count(),
        )
        return Response(DemandeAchatSerializer(da).data, status=status.HTTP_201_CREATED)

    # ── S4 — Audit cohérence quantite_reservee ↔ ReservationLot ─────────────

    @action(detail=False, methods=['get'], url_path='audit-reservations',
            permission_classes=[IsAdminOrDirecteur])
    def audit_reservations(self, request):
        """
        S4 — GET /stock/audit-reservations/
        Liste les articles dont quantite_reservee diffère de la somme des ReservationLot.
        """
        ecarts = verifier_coherence_reservations()
        data = [{
            'stock_id':          str(e['stock'].pk),
            'article':           e['stock'].article.designation,
            'reservee_compteur': float(e['reservee_compteur']),
            'reservee_lots':     float(e['reservee_lots']),
            'delta':             float(e['delta']),
        } for e in ecarts]
        return Response({
            'nb_ecarts': len(data),
            'ecarts':    data,
        })

    @action(detail=True, methods=['post'], url_path='recalculer-reservations',
            permission_classes=[IsAdminOrDirecteur])
    def recalculer_reservations(self, request, pk=None):
        """
        S4 — POST /stock/<id>/recalculer-reservations/
        Corrige la dérive de quantite_reservee pour cet article.
        """
        stock = self.get_object()
        resultat = recalculer_reservations_article(stock.article)
        return Response(resultat)

    # ── S5 — Audit + recalcul stock depuis les mouvements ────────────────────

    @action(detail=False, methods=['get'], url_path='audit-stock',
            permission_classes=[IsAdminOrDirecteur])
    def audit_stock(self, request):
        """
        S5 — GET /stock/audit-stock/
        Compare StockArticle.quantite_physique avec la somme algébrique des mouvements.
        Retourne uniquement les articles incohérents.
        """
        from production.models import Article
        articles = Article.objects.filter(stock__isnull=False).select_related('stock')
        resultats = [auditer_stock_article(a) for a in articles]
        incoherents = [r for r in resultats if r.get('existe') and not r['coherent']]
        return Response({
            'nb_articles_verifies': len(resultats),
            'nb_incoherents':       len(incoherents),
            'incoherents':          incoherents,
        })

    @action(detail=True, methods=['post'], url_path='recalculer',
            permission_classes=[IsAdminOrDirecteur])
    def recalculer(self, request, pk=None):
        """
        S5 — POST /stock/<id>/recalculer/
        Recalcule et corrige quantite_disponible depuis la somme des mouvements.
        Action admin — irréversible sans log.
        """
        stock = self.get_object()
        resultat = recalculer_stock_depuis_mouvements(stock.article)
        return Response(resultat)

    # ── S7 — Alertes stock multi-niveaux ─────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='alertes')
    def alertes(self, request):
        """
        S7 — GET /stock/alertes/
        Liste tous les articles en alerte (warning ou critique) avec contexte complet
        et action recommandée. Classés par niveau d'urgence (critique en premier).
        """
        from django.db.models import Q
        stocks_en_alerte = (
            StockArticle.objects
            .select_related('article__unite')
            .filter(
                Q(seuil_alerte__gt=0, quantite_disponible__lt=models.F('seuil_alerte')) |
                Q(stock_min__gt=0,    quantite_disponible__lt=models.F('stock_min'))
            )
            .order_by('article__designation')
        )

        data = []
        for stock in stocks_en_alerte:
            niveau = stock.niveau_alerte
            if niveau == 'critique':
                action_recommandee = 'Commande urgente — stock sous le minimum absolu'
            else:
                action_recommandee = 'Planifier une commande — stock sous le seuil d\'alerte'

            data.append({
                'stock_id':            str(stock.pk),
                'article_id':          str(stock.article.pk),
                'article_code':        stock.article.code,
                'article_designation': stock.article.designation,
                'unite':               stock.article.unite.code,
                'niveau_alerte':       niveau,
                'quantite_disponible': float(stock.quantite_disponible),
                'quantite_physique':   float(stock.quantite_physique),
                'seuil_alerte':        float(stock.seuil_alerte),
                'stock_min':           float(stock.stock_min),
                'stock_securite':      float(stock.stock_securite),
                'valeur_stock':        stock.valeur_stock,
                'action_recommandee':  action_recommandee,
            })

        # Critiques en premier, puis warnings
        data.sort(key=lambda x: (0 if x['niveau_alerte'] == 'critique' else 1))
        return Response({'count': len(data), 'results': data})

    # ── S8 — Lots proches de la péremption ───────────────────────────────────

    @action(detail=False, methods=['get'], url_path='lots-peremption')
    def lots_peremption(self, request):
        """
        S8 — GET /stock/lots-peremption/?jours=30
        Liste les lots disponibles dont la date de péremption est dans les <jours> prochains jours.
        Par défaut : 30 jours. Triés par date_peremption ASC (les plus urgents en premier).
        """
        from production.models import Lot
        from django.utils import timezone
        import datetime

        try:
            jours = int(request.query_params.get('jours', 30))
            if jours <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response(
                {'detail': 'Le paramètre jours doit être un entier positif.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        aujourd_hui  = timezone.now().date()
        date_limite  = aujourd_hui + datetime.timedelta(days=jours)

        lots = (
            Lot.objects
            .filter(
                statut=Lot.Statut.DISPONIBLE,
                date_peremption__isnull=False,
                date_peremption__lte=date_limite,
                quantite_restante__gt=0,
            )
            .select_related('article__unite')
            .order_by('date_peremption')
        )

        data = []
        for lot in lots:
            jours_restants = (lot.date_peremption - aujourd_hui).days
            data.append({
                'lot_id':              str(lot.pk),
                'numero_lot':          lot.numero_lot,
                'article_id':          str(lot.article.pk),
                'article_code':        lot.article.code,
                'article_designation': lot.article.designation,
                'unite':               lot.article.unite.code,
                'quantite_restante':   float(lot.quantite_restante),
                'date_peremption':     lot.date_peremption.isoformat(),
                'jours_restants':      jours_restants,
                'urgence':             jours_restants <= 7,
            })

        return Response({'count': len(data), 'jours': jours, 'results': data})

    # ── S10 — Rapport stock périodique par article ────────────────────────────

    @action(detail=False, methods=['get'], url_path='rapport-periodique')
    def rapport_periodique(self, request):
        """
        S10 — GET /stock/rapport-periodique/?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD&article=<uuid>
        Retourne le kardex agrégé par article sur la période :
          - stock_ouverture  : solde avant date_debut (somme des mouvements antérieurs)
          - total_entrees    : somme des entrées sur la période
          - total_sorties    : somme des sorties sur la période
          - stock_cloture    : stock_ouverture + entrees - sorties
          - valeur_cloture   : stock_cloture × prix_standard
        Si article est fourni, retourne uniquement cet article.
        """
        from django.db.models import Sum, Q, ExpressionWrapper, F, Case, When, Value
        from django.db.models import DecimalField as DBDecimalField
        import datetime

        date_debut_str = request.query_params.get('date_debut')
        date_fin_str   = request.query_params.get('date_fin')
        article_id     = request.query_params.get('article')

        if not date_debut_str or not date_fin_str:
            return Response(
                {'detail': 'Les paramètres date_debut et date_fin sont obligatoires (YYYY-MM-DD).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            date_debut = datetime.date.fromisoformat(date_debut_str)
            date_fin   = datetime.date.fromisoformat(date_fin_str)
        except ValueError:
            return Response(
                {'detail': 'Format de date invalide. Utilisez YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if date_debut > date_fin:
            return Response(
                {'detail': 'date_debut doit être antérieure à date_fin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .models import MouvementStock
        from production.models import Article

        # Sélectionner la date effective : date_comptable si définie, sinon date_mouvement.date()
        def date_effective_q(borne, comparateur):
            """Filtre sur la date effective (comptable si dispo, sinon système)."""
            from django.db.models import Q
            if comparateur == 'lt':
                return Q(date_comptable__isnull=False, date_comptable__lt=borne) | \
                       Q(date_comptable__isnull=True,  date_mouvement__date__lt=borne)
            else:  # lte + range
                return Q(date_comptable__isnull=False, date_comptable__gte=borne,
                         date_comptable__lte=date_fin) | \
                       Q(date_comptable__isnull=True,  date_mouvement__date__gte=borne,
                         date_mouvement__date__lte=date_fin)

        articles_qs = Article.objects.filter(stock__isnull=False).select_related('stock', 'unite')
        if article_id:
            articles_qs = articles_qs.filter(pk=article_id)

        rapport = []
        for article in articles_qs:
            # Stock d'ouverture = somme des mouvements AVANT date_debut
            q_avant = MouvementStock.objects.filter(
                article=article
            ).filter(date_effective_q(date_debut, 'lt')).aggregate(
                total=Sum(ExpressionWrapper(F('quantite') * F('sens'), output_field=DBDecimalField(max_digits=14, decimal_places=3)))
            )
            stock_ouverture = float(q_avant['total'] or 0)

            # Entrées et sorties sur la période
            mvts_periode = MouvementStock.objects.filter(
                article=article
            ).filter(date_effective_q(date_debut, 'range'))

            q_entrees = mvts_periode.filter(sens=1).aggregate(
                total=Sum('quantite')
            )
            q_sorties = mvts_periode.filter(sens=-1).aggregate(
                total=Sum('quantite')
            )
            total_entrees = float(q_entrees['total'] or 0)
            total_sorties = float(q_sorties['total'] or 0)
            stock_cloture = stock_ouverture + total_entrees - total_sorties
            prix_std      = float(article.prix_standard or 0)

            rapport.append({
                'article_id':          str(article.pk),
                'article_code':        article.code,
                'article_designation': article.designation,
                'unite':               article.unite.code,
                'prix_standard':       prix_std,
                'stock_ouverture':     round(stock_ouverture, 3),
                'total_entrees':       round(total_entrees, 3),
                'total_sorties':       round(total_sorties, 3),
                'stock_cloture':       round(stock_cloture, 3),
                'valeur_cloture':      round(stock_cloture * prix_std, 2),
            })

        rapport.sort(key=lambda x: x['article_designation'])
        return Response({
            'date_debut': date_debut_str,
            'date_fin':   date_fin_str,
            'nb_articles': len(rapport),
            'rapport':    rapport,
        })


class MouvementStockViewSet(viewsets.ModelViewSet):
    """
    Mouvements de stock — lecture + saisie manuelle (ajust_pos / ajust_neg).
    La création met automatiquement à jour le stock agrégé (StockArticle).
    """
    permission_classes = [IsLogistiqueStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]   # M1
    filterset_class    = MouvementFilter                                        # M1
    search_fields      = ['reference_doc', 'notes', 'lot__numero_lot']          # M1
    ordering_fields    = ['date_mouvement', 'date_comptable', 'quantite']       # M1
    ordering           = ['-date_mouvement']
    http_method_names  = ['get', 'post', 'head', 'options']   # pas de PUT/PATCH/DELETE

    def get_queryset(self):
        return MouvementStock.objects.select_related('article__unite', 'lot', 'effectue_par')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return MouvementStockCreateSerializer
        return MouvementStockSerializer

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from .models import StockArticle

        article  = serializer.validated_data.get('article')
        quantite = serializer.validated_data.get('quantite')
        # sens est déjà inféré par MouvementStockCreateSerializer.validate()
        sens     = serializer.validated_data.get('sens', 1)

        # I1 — Gel du stock : refuser tout mouvement sur article en inventaire actif
        if article:
            session_ref = verifier_gel_stock(article)
            if session_ref:
                raise DRFValidationError({
                    'article': (
                        f"Le stock de '{article.designation}' est gelé — "
                        f"inventaire {session_ref} en cours. "
                        "Valider ou annuler l'inventaire avant de saisir un mouvement."
                    )
                })

        with transaction.atomic():
            # M2 — Verrouiller le stock AVANT de créer le mouvement
            # pour prévenir les race conditions et détecter le stock insuffisant
            stock, _ = StockArticle.objects.select_for_update().get_or_create(
                article=article,
                defaults={'quantite_disponible': 0},
            )
            delta   = float(quantite) * sens
            new_qty = float(stock.quantite_disponible) + delta

            # M2 — Blocage explicite (ne plus clipper silencieusement à 0)
            if new_qty < 0:
                raise DRFValidationError({
                    'quantite': (
                        f"Stock insuffisant pour '{article.designation}' : "
                        f"{stock.quantite_disponible} disponible, "
                        f"{quantite} demandé en sortie."
                    )
                })

            instance = serializer.save(effectue_par=self.request.user)
            stock.quantite_disponible = new_qty
            stock.save(update_fields=['quantite_disponible', 'derniere_maj'])

            if stock.est_sous_seuil:
                logger.warning(
                    "ALERTE STOCK : %s — quantité dispo %.3f < seuil %.3f",
                    article.designation,
                    float(stock.quantite_disponible),
                    float(stock.seuil_alerte),
                )

            logger.info(
                "Mouvement manuel [%s] %s × %s par %s",
                instance.get_type_display(), instance.quantite,
                instance.article.designation, self.request.user,
            )

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """
        M10 — GET /mouvements/export/?<filtres>
        Exporte les mouvements filtrés en CSV (streaming).
        Supporte les mêmes paramètres de filtre que la liste.
        UTF-8 BOM pour compatibilité Excel.
        """
        import csv
        from django.http import StreamingHttpResponse

        qs = self.filter_queryset(
            self.get_queryset().order_by('-date_mouvement')
        )

        class Echo:
            """Pseudo-buffer : csv.writer.writerow() retourne la ligne au lieu d'écrire."""
            def write(self, value):
                return value

        def stream_rows():
            writer = csv.writer(Echo(), delimiter=';')
            # En-tête
            yield '\ufeff'   # BOM UTF-8
            yield writer.writerow([
                'Date système', 'Date comptable', 'Type', 'Sens',
                'Article (code)', 'Article (désignation)', 'N° lot',
                'Quantité', 'Unité', 'Coût unitaire (FCFA)',
                'Référence document', 'Effectué par', 'Notes',
            ])
            for m in qs.select_related('article__unite', 'lot', 'effectue_par').iterator(chunk_size=500):
                yield writer.writerow([
                    m.date_mouvement.strftime('%Y-%m-%d %H:%M'),
                    m.date_comptable.strftime('%Y-%m-%d') if m.date_comptable else '',
                    m.get_type_display(),
                    'Entrée' if m.sens == 1 else 'Sortie',
                    m.article.code,
                    m.article.designation,
                    m.lot.numero_lot if m.lot_id else '',
                    str(m.quantite).replace('.', ','),
                    m.article.unite.code,
                    str(m.cout_unitaire).replace('.', ','),
                    m.reference_doc,
                    m.effectue_par.nom_complet if m.effectue_par_id else '',
                    m.notes,
                ])

        response = StreamingHttpResponse(stream_rows(), content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = 'attachment; filename="mouvements_stock.csv"'
        return response


# ---------------------------------------------------------------------------
# Demandes d'Achat
# ---------------------------------------------------------------------------

class DemandeAchatViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['statut', 'urgence']
    search_fields      = ['reference']
    ordering           = ['-date_creation']

    def get_queryset(self):
        return DemandeAchat.objects.select_related('demandeur', 'approuve_par').prefetch_related(
            'lignes__article__unite', 'lignes__fournisseur_suggere',
        )

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DemandeAchatCreateSerializer
        return DemandeAchatSerializer

    def partial_update(self, request, pk=None):
        da = self.get_object()
        if not da.peut_etre_modifie:
            return Response(
                {'detail': 'Cette demande ne peut plus être modifiée.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = DemandeAchatUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            if 'urgence' in data:
                da.urgence = data['urgence']
            if 'notes' in data:
                da.notes = data['notes']

            if 'lignes' in data:
                from decimal import Decimal
                lignes_data = data['lignes']
                ids_fournis = {str(l['id']) for l in lignes_data if l.get('id')}

                da.lignes.exclude(id__in=ids_fournis).delete()

                montant = Decimal('0')
                for l in lignes_data:
                    prix = l.get('prix_unitaire_estime')
                    if prix:
                        montant += prix * l['quantite']

                    champs = {
                        'article':              l['article'],
                        'quantite':             l['quantite'],
                        'prix_unitaire_estime': l.get('prix_unitaire_estime'),
                        'notes':                l.get('notes', ''),
                    }
                    if l.get('id'):
                        LigneDemandeAchat.objects.filter(id=l['id'], demande=da).update(**champs)
                    else:
                        LigneDemandeAchat.objects.create(demande=da, **champs)

                da.montant_estime = montant if montant > 0 else None

            # Si la DA était approuvée, la remettre en brouillon
            if da.statut == DemandeAchat.Statut.APPROUVEE:
                da.statut      = DemandeAchat.Statut.BROUILLON
                da.approuve_par = None

            da.save()

        da.refresh_from_db()
        return Response(DemandeAchatSerializer(da, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='reviser')
    def reviser(self, request, pk=None):
        """
        Crée une nouvelle version (V+1) d'une DA refusée.
        L'ancienne DA reste en statut 'refusee'.
        """
        from logistique.services import generer_reference_da
        from decimal import Decimal

        da = self.get_object()
        if da.statut != DemandeAchat.Statut.REFUSEE:
            return Response(
                {'detail': 'Seules les DA refusées peuvent être révisées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # La racine est da_parente si elle existe, sinon da elle-même
        racine = da.da_parente if da.da_parente_id else da

        with transaction.atomic():
            nouvelle = DemandeAchat.objects.create(
                reference    = generer_reference_da(),
                statut       = DemandeAchat.Statut.BROUILLON,
                urgence      = da.urgence,
                notes        = da.notes,
                demandeur    = request.user,
                version      = da.version + 1,
                da_parente   = racine,
            )

            montant = Decimal('0')
            for ligne in da.lignes.all():
                LigneDemandeAchat.objects.create(
                    demande              = nouvelle,
                    article              = ligne.article,
                    quantite             = ligne.quantite,
                    prix_unitaire_estime = ligne.prix_unitaire_estime,
                    notes                = ligne.notes,
                )
                if ligne.prix_unitaire_estime:
                    montant += ligne.prix_unitaire_estime * ligne.quantite

            if montant > 0:
                nouvelle.montant_estime = montant
                nouvelle.save(update_fields=['montant_estime'])

        nouvelle.refresh_from_db()
        return Response(
            DemandeAchatSerializer(nouvelle, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='soumettre')
    def soumettre(self, request, pk=None):
        da = self.get_object()
        if da.statut != DemandeAchat.Statut.BROUILLON:
            return Response(
                {'detail': 'Seuls les brouillons peuvent être soumis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        da.statut = DemandeAchat.Statut.SOUMISE
        da.save(update_fields=['statut'])
        return Response({'detail': f"DA {da.reference} soumise."})

    SEUIL_DIRECTION_FCFA = 5_000_000  # DA > 5 M FCFA → approbation direction requise

    @action(detail=True, methods=['post'], url_path='approuver')
    def approuver(self, request, pk=None):
        da = self.get_object()
        if da.statut != DemandeAchat.Statut.SOUMISE:
            return Response(
                {'detail': 'Seules les DA soumises peuvent être approuvées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Recalculer le montant estimé depuis les prix unitaires des lignes
        from decimal import Decimal
        total = sum(
            (ligne.prix_unitaire_estime or Decimal('0')) * ligne.quantite
            for ligne in da.lignes.all()
            if ligne.prix_unitaire_estime
        )
        if total > 0:
            da.montant_estime = total
            da.save(update_fields=['montant_estime'])

        # Si montant estimé > seuil direction → passer en ATTENTE_DIRECTION
        if da.montant_estime and float(da.montant_estime) > self.SEUIL_DIRECTION_FCFA:
            da.statut = DemandeAchat.Statut.ATTENTE_DIRECTION
            da.save(update_fields=['statut'])
            return Response({
                'detail': (
                    f"DA {da.reference} transmise à la Direction pour approbation "
                    f"(montant estimé {float(da.montant_estime):,.0f} FCFA "
                    f"> seuil {self.SEUIL_DIRECTION_FCFA:,.0f} FCFA)."
                )
            })
        da.statut       = DemandeAchat.Statut.APPROUVEE
        da.approuve_par = request.user
        da.save(update_fields=['statut', 'approuve_par'])
        return Response({'detail': f"DA {da.reference} approuvée."})

    @action(detail=True, methods=['post'], url_path='approuver-direction',
            permission_classes=[IsAdminOrDirecteur])
    def approuver_direction(self, request, pk=None):
        """Approbation direction pour les DA dont le montant dépasse le seuil."""
        da = self.get_object()
        if da.statut != DemandeAchat.Statut.ATTENTE_DIRECTION:
            return Response(
                {'detail': "Cette action est réservée aux DA en attente d'approbation direction."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        da.statut       = DemandeAchat.Statut.APPROUVEE
        da.approuve_par = request.user
        da.save(update_fields=['statut', 'approuve_par'])
        return Response({'detail': f"DA {da.reference} approuvée par la Direction."})

    @action(detail=True, methods=['post'], url_path='refuser')
    def refuser(self, request, pk=None):
        da    = self.get_object()
        motif = request.data.get('motif', '')
        if da.statut not in [DemandeAchat.Statut.SOUMISE, DemandeAchat.Statut.APPROUVEE]:
            return Response(
                {'detail': 'Seules les DA soumises ou approuvées peuvent être refusées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        da.statut = DemandeAchat.Statut.REFUSEE
        if motif:
            da.notes = f"{da.notes}\n[REFUS] {motif}".strip()
        da.save(update_fields=['statut', 'notes'])
        return Response({'detail': f"DA {da.reference} refusée."})

    @action(detail=True, methods=['post'], url_path='convertir-bc')
    def convertir_bc(self, request, pk=None):
        """Convertit une DA approuvée en Bon de Commande (avec tracking quantite_commandee)."""
        da = self.get_object()
        if da.statut != DemandeAchat.Statut.APPROUVEE:
            return Response(
                {'detail': 'Seules les DA approuvées peuvent être converties en BC.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Déterminer le fournisseur (via request ou fournisseur_suggere)
        fournisseur_id = request.data.get('fournisseur')
        if not fournisseur_id:
            premiere_ligne = da.lignes.filter(fournisseur_suggere__isnull=False).first()
            if premiere_ligne:
                fournisseur_id = str(premiere_ligne.fournisseur_suggere.id)

        if not fournisseur_id:
            return Response(
                {'detail': 'Veuillez spécifier un fournisseur (aucun suggéré dans la DA).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            fournisseur = Fournisseur.objects.get(id=fournisseur_id)
        except Fournisseur.DoesNotExist:
            return Response({'detail': 'Fournisseur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        from logistique.services import generer_reference_bc
        from django.utils import timezone as tz
        with transaction.atomic():
            bc = BonCommande.objects.create(
                reference=generer_reference_bc(),
                fournisseur=fournisseur,
                date_commande=tz.now().date(),
                notes=f"Généré depuis DA {da.reference}",
                cree_par=request.user,
            )
            from .models import LigneBonCommande
            for ligne in da.lignes.select_related('article').select_for_update().all():
                qte = ligne.quantite_restante
                if qte <= 0:
                    continue   # ligne déjà entièrement commandée
                LigneBonCommande.objects.create(
                    bon_commande=bc,
                    article=ligne.article,
                    quantite_commandee=qte,
                    prix_unitaire=0,
                    ligne_da=ligne,
                )
                # Marquer la ligne comme entièrement commandée
                ligne.quantite_commandee = ligne.quantite
                ligne.save(update_fields=['quantite_commandee'])

            bc.calculer_totaux()
            da.statut = DemandeAchat.Statut.TRAITEE
            da.save(update_fields=['statut'])

        return Response(BonCommandeSerializer(bc).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='lignes-disponibles')
    def lignes_disponibles(self, request):
        """
        GET /demandes-achat/lignes-disponibles/?fournisseur=<id>
        Retourne les lignes de DAs approuvées dont la quantite_restante > 0.
        Filtre optionnel par fournisseur_suggere (inclut aussi les lignes sans fournisseur suggéré).
        """
        from django.db.models import Q
        from .serializers import LigneDASerializer

        fournisseur_id = request.query_params.get('fournisseur')

        qs = LigneDemandeAchat.objects.filter(
            demande__statut=DemandeAchat.Statut.APPROUVEE,
        ).select_related(
            'article__unite', 'demande', 'fournisseur_suggere',
        ).order_by('demande__date_creation', 'article__designation')

        if fournisseur_id:
            qs = qs.filter(
                Q(fournisseur_suggere__isnull=True) | Q(fournisseur_suggere__id=fournisseur_id)
            )

        # Filtrer sur la propriété Python (champ calculé, pas de champ DB direct)
        lignes = [l for l in qs if l.quantite_restante > 0]

        return Response(LigneDASerializer(lignes, many=True).data)


# ---------------------------------------------------------------------------
# Bons de Commande
# ---------------------------------------------------------------------------

class BonCommandeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = BonCommandeFilter
    search_fields      = ['reference', 'fournisseur__raison_sociale']
    ordering           = ['-date_creation']

    def get_queryset(self):
        return BonCommande.objects.select_related('fournisseur', 'cree_par').prefetch_related(
            'lignes__article__unite',
            'lignes__conditions',
            'conditions',
        )

    def get_serializer_class(self):
        if self.action == 'create':
            return BonCommandeCreateSerializer
        return BonCommandeSerializer

    def partial_update(self, request, *args, **kwargs):
        """PATCH restreint au statut brouillon — champs : fournisseur, date_commande, date_livraison_prev, adresse_livraison, notes."""
        bc = self.get_object()
        if bc.statut != BonCommande.Statut.BROUILLON:
            return Response(
                {'detail': 'Seuls les BCs en brouillon peuvent être modifiés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        CHAMPS_AUTORISÉS = {'fournisseur', 'date_commande', 'date_livraison_prev', 'adresse_livraison', 'notes'}
        data = {k: v for k, v in request.data.items() if k in CHAMPS_AUTORISÉS}
        serializer = BonCommandeSerializer(bc, data=data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(BonCommandeSerializer(
            BonCommande.objects.select_related('fournisseur', 'cree_par')
                               .prefetch_related('lignes__article__unite', 'lignes__conditions', 'conditions')
                               .get(pk=bc.pk),
            context={'request': request},
        ).data)

    def create(self, request, *args, **kwargs):
        """Crée le BC et retourne la représentation complète (avec IDs lignes)."""
        serializer = BonCommandeCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        bc = serializer.save()
        # Re-fetch avec prefetch pour avoir lignes + conditions
        bc.refresh_from_db()
        response_serializer = BonCommandeSerializer(
            BonCommande.objects.select_related('fournisseur', 'cree_par')
                               .prefetch_related('lignes__article__unite', 'lignes__conditions', 'conditions')
                               .get(pk=bc.pk),
            context={'request': request},
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='envoyer')
    def envoyer(self, request, pk=None):
        """Marque un BC brouillon comme envoyé au fournisseur."""
        bc = self.get_object()
        if bc.statut != BonCommande.Statut.BROUILLON:
            return Response(
                {'detail': 'Seuls les BCs en brouillon peuvent être envoyés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bc.statut = BonCommande.Statut.ENVOYE
        bc.save(update_fields=['statut'])
        logger.info("BC %s envoyé par %s", bc.reference, request.user)
        return Response({'detail': f"BC {bc.reference} marqué comme envoyé."})

    @action(detail=True, methods=['post'], url_path='confirmer')
    def confirmer(self, request, pk=None):
        """Marque un BC envoyé comme confirmé par le fournisseur."""
        bc = self.get_object()
        if bc.statut != BonCommande.Statut.ENVOYE:
            return Response(
                {'detail': 'Seuls les BCs envoyés peuvent être confirmés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bc.statut = BonCommande.Statut.CONFIRME
        bc.save(update_fields=['statut'])
        logger.info("BC %s confirmé par fournisseur — saisi par %s", bc.reference, request.user)
        return Response({'detail': f"BC {bc.reference} confirmé par le fournisseur."})

    @action(detail=True, methods=['post'], url_path='annuler')
    def annuler(self, request, pk=None):
        """Annule un BC (brouillon, envoyé ou confirmé uniquement)."""
        bc = self.get_object()
        if bc.statut not in [BonCommande.Statut.BROUILLON, BonCommande.Statut.ENVOYE, BonCommande.Statut.CONFIRME]:
            return Response(
                {'detail': 'Seuls les BCs brouillon, envoyés ou confirmés peuvent être annulés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bc.statut = BonCommande.Statut.ANNULE
        bc.save(update_fields=['statut'])
        logger.info("BC %s annulé par %s", bc.reference, request.user)
        return Response({'detail': f"BC {bc.reference} annulé."})

    @action(detail=True, methods=['post'], url_path='cloturer')
    def cloturer(self, request, pk=None):
        """
        GAP 4 — Clôture manuelle d'un BC partiellement reçu.
        Force le statut à 'recu' même si toutes les quantités commandées n'ont pas été reçues.
        Utile pour les reliquats définitivement abandonnés.
        """
        bc = self.get_object()
        if bc.statut not in [
            BonCommande.Statut.ENVOYE,
            BonCommande.Statut.CONFIRME,
            BonCommande.Statut.PARTIELLEMENT_RECU,
        ]:
            return Response(
                {'detail': 'Seuls les BCs envoyés, confirmés ou partiellement reçus peuvent être clôturés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        motif = request.data.get('motif', '').strip()
        note_cloture = f"[CLÔTURE MANUELLE] {motif}" if motif else "[CLÔTURE MANUELLE]"
        bc.statut = BonCommande.Statut.RECU
        bc.notes  = f"{bc.notes}\n{note_cloture}".strip()
        bc.save(update_fields=['statut', 'notes'])
        logger.info("BC %s clôturé manuellement par %s. Motif : %s", bc.reference, request.user, motif)
        return Response({'detail': f"BC {bc.reference} clôturé manuellement.", 'statut': bc.statut})

    @action(detail=True, methods=['post'], url_path='amender')
    def amender(self, request, pk=None):
        """
        GAP 6 — Amendment BC après envoi.
        Permet de modifier les notes, la date de livraison prévue et l'adresse de livraison
        d'un BC déjà envoyé/confirmé, en incrémentant le numéro de version et en traçant l'amendement.
        """
        bc = self.get_object()
        ETATS_AMENDABLES = [
            BonCommande.Statut.ENVOYE,
            BonCommande.Statut.CONFIRME,
            BonCommande.Statut.PARTIELLEMENT_RECU,
        ]
        if bc.statut not in ETATS_AMENDABLES:
            return Response(
                {'detail': 'Seuls les BCs envoyés, confirmés ou partiellement reçus peuvent être amendés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        champs_autorisés = ['date_livraison_prev', 'adresse_livraison', 'notes']
        modifs = {k: v for k, v in request.data.items() if k in champs_autorisés}
        if not modifs:
            return Response(
                {'detail': f"Aucune modification. Champs amendables : {', '.join(champs_autorisés)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        motif = request.data.get('motif', '').strip()
        note_amendement = (
            f"[AMENDEMENT v{bc.version + 1}] {motif}"
            if motif else f"[AMENDEMENT v{bc.version + 1}]"
        )

        for champ, valeur in modifs.items():
            setattr(bc, champ, valeur)

        bc.version += 1
        bc.notes   = f"{bc.notes}\n{note_amendement}".strip()
        bc.save(update_fields=['version', 'notes'] + list(modifs.keys()))

        logger.info(
            "BC %s amendé (v%d) par %s. Champs : %s",
            bc.reference, bc.version, request.user, ', '.join(modifs.keys())
        )
        return Response(BonCommandeSerializer(bc, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='en-retard',
            permission_classes=[IsAuthenticated])
    def en_retard(self, request):
        """
        GAP 7 — GET /bons-commande/en-retard/
        Retourne les BCs dont la date de livraison prévue est dépassée
        et qui ne sont pas encore entièrement reçus ou annulés.
        """
        from django.utils import timezone as tz
        today = tz.now().date()
        qs = BonCommande.objects.filter(
            date_livraison_prev__lt=today,
            date_livraison_prev__isnull=False,
        ).exclude(
            statut__in=[BonCommande.Statut.RECU, BonCommande.Statut.ANNULE]
        ).select_related('fournisseur', 'cree_par').prefetch_related('lignes__article__unite')
        serializer = BonCommandeSerializer(qs, many=True, context={'request': request})
        return Response({
            'count': qs.count(),
            'results': serializer.data,
        })

    @action(detail=False, methods=['get'], url_path='stats',
            permission_classes=[IsAuthenticated])
    def stats(self, request):
        """
        GAP 12 — Statistiques logistique enrichies pour le Dashboard.
        Ajoute : da_soumises, da_approuvees, da_attente_direction, bc_en_retard.
        """
        from django.db.models import F
        from django.utils import timezone as tz
        from .models import StockArticle, FactureFournisseur

        today = tz.now().date()

        bc_brouillon = BonCommande.objects.filter(statut='brouillon').count()
        bc_envoye    = BonCommande.objects.filter(statut='envoye').count()

        # BCs en retard de livraison (GAP 12)
        bc_en_retard = BonCommande.objects.filter(
            date_livraison_prev__lt=today,
            date_livraison_prev__isnull=False,
        ).exclude(statut__in=['recu', 'annule']).count()

        factures_en_retard = FactureFournisseur.objects.filter(
            statut__in=['en_attente', 'partiellement_payee'],
            date_echeance__lt=today,
        ).count()

        articles_sous_seuil = StockArticle.objects.filter(
            seuil_alerte__gt=0,
            quantite_disponible__lt=F('seuil_alerte'),
        ).count()

        # Indicateurs DA (GAP 12)
        da_soumises          = DemandeAchat.objects.filter(statut='soumise').count()
        da_approuvees        = DemandeAchat.objects.filter(statut='approuvee').count()
        da_attente_direction = DemandeAchat.objects.filter(statut='attente_direction').count()

        # ── GAP R12 : Statistiques réceptions ────────────────────────────────
        from .models import Reception, LigneReception
        receptions_en_cours = Reception.objects.filter(statut='en_cours').count()

        debut_mois = today.replace(day=1)
        receptions_mois = list(Reception.objects.filter(
            date_reception__gte=debut_mois,
            statut__in=['validee', 'rejetee'],
        ).select_related('bon_commande'))

        total_rec = len(receptions_mois)
        otd_rec   = sum(1 for r in receptions_mois if r.est_livraison_a_temps)
        taux_otd  = round(otd_rec / total_rec * 100, 1) if total_rec else None

        lignes_nc_mois = LigneReception.objects.filter(
            reception__date_reception__gte=debut_mois,
            conforme=False,
        ).count()

        return Response({
            # BC
            'bc_brouillon':    bc_brouillon,
            'bc_envoye':       bc_envoye,
            'bc_en_retard':    bc_en_retard,
            # Factures
            'factures_en_retard': factures_en_retard,
            # Stock
            'articles_sous_seuil': articles_sous_seuil,
            # DA
            'da_soumises':          da_soumises,
            'da_approuvees':        da_approuvees,
            'da_attente_direction': da_attente_direction,
            # Réceptions (GAP R12)
            'receptions_en_cours': receptions_en_cours,
            'taux_otd_mois':       taux_otd,
            'lignes_nc_mois':      lignes_nc_mois,
        })

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Génère le PDF complet du bon de commande (en-tête, lignes + conditions, récapitulatif)."""
        bc = self.get_object()
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.lib.units import cm
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
        except ImportError:
            return Response(
                {'detail': 'ReportLab non installé. Exécutez : pip install reportlab'},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        from decimal import Decimal

        # ── Palette ───────────────────────────────────────────────────────────
        C_HEADER  = colors.HexColor('#00A88C')   # accent teal
        C_HEADER2 = colors.HexColor('#007A65')   # teal foncé
        C_LIGHT   = colors.HexColor('#F0FAF8')   # teal très clair
        C_GREY    = colors.HexColor('#F4F5F9')
        C_BORDER  = colors.HexColor('#D1D5E0')
        C_TEXT    = colors.HexColor('#1A1D2E')
        C_MUTED   = colors.HexColor('#6B7280')
        C_DANGER  = colors.HexColor('#EF4444')
        C_SUCCESS = colors.HexColor('#10B981')
        WHITE     = colors.white

        # ── Styles ────────────────────────────────────────────────────────────
        ss = getSampleStyleSheet()
        def S(name, **kw):
            base = ss.get(name, ss['Normal'])
            return ParagraphStyle(name + str(id(kw)), parent=base, **kw)

        sTitle    = S('Title',  fontSize=18, textColor=C_TEXT,   spaceAfter=2,  fontName='Helvetica-Bold')
        sRef      = S('Normal', fontSize=11, textColor=C_HEADER, fontName='Helvetica-Bold')
        sLabel    = S('Normal', fontSize=7,  textColor=C_MUTED,  fontName='Helvetica',      spaceAfter=1)
        sValue    = S('Normal', fontSize=9,  textColor=C_TEXT,   fontName='Helvetica-Bold')
        sNormal   = S('Normal', fontSize=9,  textColor=C_TEXT,   fontName='Helvetica')
        sSmall    = S('Normal', fontSize=7,  textColor=C_MUTED,  fontName='Helvetica')
        sSect     = S('Normal', fontSize=8,  textColor=C_HEADER, fontName='Helvetica-Bold',  spaceBefore=4)
        sRight    = S('Normal', fontSize=9,  textColor=C_TEXT,   fontName='Helvetica', alignment=TA_RIGHT)
        sRightB   = S('Normal', fontSize=9,  textColor=C_TEXT,   fontName='Helvetica-Bold', alignment=TA_RIGHT)
        sRightSm  = S('Normal', fontSize=7,  textColor=C_MUTED,  fontName='Helvetica', alignment=TA_RIGHT)

        PAGE_W = A4[0] - 4*cm   # largeur utile

        # ── Helper conditions ─────────────────────────────────────────────────
        def apply_conds(base, conds):
            running = Decimal(str(base))
            for c in sorted(conds, key=lambda x: x.ordre):
                val = Decimal(str(c.valeur))
                amt = (running * val / 100) if c.mode_calcul_snapshot == 'pourcentage' else val
                running = (running + amt) if c.type_effet_snapshot == 'majoration' else max(Decimal('0'), running - amt)
            return running

        def fmt(n):
            return f"{float(n):,.0f} FCFA".replace(',', ' ')

        def fmt_qty(n):
            v = float(n)
            return f"{v:,.3f}".rstrip('0').rstrip('.').replace(',', ' ')

        # ── Données ──────────────────────────────────────────────────────────
        lignes     = list(bc.lignes.select_related('article__unite').prefetch_related('conditions').order_by('article__designation'))
        conditions = list(bc.conditions.order_by('ordre'))

        buffer = io.BytesIO()
        doc    = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm,
        )
        elements = []

        # ════════════════════════════════════════════════════════════════════
        # 1. EN-TÊTE : titre + bandeau statut
        # ════════════════════════════════════════════════════════════════════
        version_str = f"  v{bc.version}" if bc.version > 1 else ""
        statut_color = {
            'brouillon': C_MUTED, 'envoye': colors.HexColor('#F59E0B'),
            'confirme':  C_HEADER, 'partiel': colors.HexColor('#3B82F6'),
            'recu': C_SUCCESS, 'annule': C_DANGER,
        }.get(bc.statut, C_MUTED)

        header_data = [[
            Paragraph(f"BON DE COMMANDE", sTitle),
            Paragraph(f"{bc.reference}{version_str}", sRef),
            Paragraph(bc.get_statut_display().upper(), S('Normal', fontSize=8, fontName='Helvetica-Bold',
                      textColor=WHITE, alignment=TA_CENTER)),
        ]]
        header_t = Table(header_data, colWidths=[PAGE_W * 0.45, PAGE_W * 0.35, PAGE_W * 0.20])
        header_t.setStyle(TableStyle([
            ('VALIGN',      (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN',       (2, 0), (2, 0),   'CENTER'),
            ('BACKGROUND',  (2, 0), (2, 0),   statut_color),
            ('ROUNDEDCORNERS', [4]),
            ('PADDING',     (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (0, -1),  0),
        ]))
        elements.append(header_t)
        elements.append(HRFlowable(width='100%', thickness=2, color=C_HEADER, spaceAfter=8))

        # ════════════════════════════════════════════════════════════════════
        # 2. BLOC INFO : fournisseur (gauche) + détails BC (droite)
        # ════════════════════════════════════════════════════════════════════
        def info_block(rows):
            """rows = [(label, value), ...]"""
            data = [[Paragraph(l, sLabel), Paragraph(str(v), sValue)] for l, v in rows if v]
            if not data:
                return Paragraph('—', sNormal)
            t = Table(data, colWidths=[3*cm, (PAGE_W/2 - 3.5*cm)])
            t.setStyle(TableStyle([
                ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING',  (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING',(0, 0), (-1, -1), 3),
                ('TOPPADDING',   (0, 0), (-1, -1), 0),
            ]))
            return t

        cree_par = getattr(bc.cree_par, 'nom_complet', None) or getattr(bc.cree_par, 'username', '—') if bc.cree_par else '—'
        livraison_prev = str(bc.date_livraison_prev) if bc.date_livraison_prev else None
        en_retard = bc.date_livraison_prev and bc.date_livraison_prev < timezone.now().date() and bc.statut not in ('recu', 'annule')

        left = info_block([
            ('FOURNISSEUR',         bc.fournisseur.raison_sociale),
            ('TÉLÉPHONE',           getattr(bc.fournisseur, 'telephone', None)),
            ('EMAIL',               getattr(bc.fournisseur, 'email', None)),
            ('ADRESSE LIVRAISON',   bc.adresse_livraison or 'Adresse par défaut'),
        ])
        right = info_block([
            ('DATE COMMANDE',       str(bc.date_commande)),
            ('LIVRAISON PRÉVUE',    f"{livraison_prev} ⚠ EN RETARD" if en_retard else livraison_prev),
            ('CRÉÉ PAR',            cree_par),
            ('DATE CRÉATION',       str(bc.date_creation.strftime('%d/%m/%Y %H:%M'))),
            ('LIGNES',              f"{len(lignes)} article{'s' if len(lignes) > 1 else ''}"),
        ])

        info_t = Table([[left, right]], colWidths=[PAGE_W / 2, PAGE_W / 2])
        info_t.setStyle(TableStyle([
            ('VALIGN',      (0, 0), (-1, -1), 'TOP'),
            ('BACKGROUND',  (0, 0), (0, -1),  C_GREY),
            ('BACKGROUND',  (1, 0), (1, -1),  C_LIGHT),
            ('BOX',         (0, 0), (0, -1),  0.5, C_BORDER),
            ('BOX',         (1, 0), (1, -1),  0.5, C_BORDER),
            ('PADDING',     (0, 0), (-1, -1), 10),
        ]))
        elements.append(info_t)
        elements.append(Spacer(1, 0.5*cm))

        # ════════════════════════════════════════════════════════════════════
        # 3. TABLEAU DES LIGNES (avec conditions et prix net)
        # ════════════════════════════════════════════════════════════════════
        elements.append(Paragraph("LIGNES DE COMMANDE", sSect))
        elements.append(Spacer(1, 0.15*cm))

        COL_W = [PAGE_W*0.28, PAGE_W*0.07, PAGE_W*0.07, PAGE_W*0.13, PAGE_W*0.13, PAGE_W*0.14, PAGE_W*0.18]
        ligne_data = [[
            Paragraph('Article',         S('Normal', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE)),
            Paragraph('Code',            S('Normal', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE)),
            Paragraph('Unité',           S('Normal', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE)),
            Paragraph('Qté cmd.',        S('Normal', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE, alignment=TA_RIGHT)),
            Paragraph('Prix unit.',      S('Normal', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE, alignment=TA_RIGHT)),
            Paragraph('Montant HT',      S('Normal', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE, alignment=TA_RIGHT)),
            Paragraph('Net ligne',       S('Normal', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE, alignment=TA_RIGHT)),
        ]]
        row_styles = []
        row_idx    = 1

        for i, ligne in enumerate(lignes):
            conds_ligne = list(ligne.conditions.order_by('ordre'))
            raw_ht      = ligne.montant_ht
            net_ligne   = apply_conds(raw_ht, conds_ligne)
            has_conds   = bool(conds_ligne)
            bg          = WHITE if i % 2 == 0 else C_GREY

            # Ligne principale
            ligne_data.append([
                Paragraph(ligne.article.designation, sNormal),
                Paragraph(ligne.article.code,        sSmall),
                Paragraph(ligne.article.unite.code,  sSmall),
                Paragraph(fmt_qty(ligne.quantite_commandee), sRight),
                Paragraph(fmt(ligne.prix_unitaire),  sRight),
                Paragraph(fmt(raw_ht),               sRight),
                Paragraph(fmt(net_ligne), S('Normal', fontSize=9, fontName='Helvetica-Bold',
                           textColor=C_HEADER if has_conds else C_TEXT, alignment=TA_RIGHT)),
            ])
            row_styles.append(('BACKGROUND', (0, row_idx), (-1, row_idx), bg))
            row_idx += 1

            # Sous-lignes conditions
            for c in conds_ligne:
                val     = float(c.valeur)
                is_pct  = c.mode_calcul_snapshot == 'pourcentage'
                is_maj  = c.type_effet_snapshot  == 'majoration'
                sign    = '+' if is_maj else '−'
                val_str = f"{sign} {val:.2f} %" if is_pct else f"{sign} {val:,.0f} FCFA"
                ligne_data.append([
                    Paragraph(f"  ↳ {c.nom_snapshot}", sSmall),
                    '', '', '', '',
                    Paragraph(val_str, sRightSm),
                    '',
                ])
                row_styles.append(('BACKGROUND', (0, row_idx), (-1, row_idx), C_LIGHT))
                row_styles.append(('SPAN',       (0, row_idx), (4, row_idx)))
                row_styles.append(('SPAN',       (6, row_idx), (6, row_idx)))
                row_idx += 1

        ligne_t = Table(ligne_data, colWidths=COL_W, repeatRows=1)
        base_style = [
            ('BACKGROUND',   (0, 0), (-1, 0),  C_HEADER2),
            ('FONTSIZE',     (0, 0), (-1, -1), 9),
            ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID',         (0, 0), (-1, -1), 0.3, C_BORDER),
            ('PADDING',      (0, 0), (-1, -1), 5),
            ('TOPPADDING',   (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING',(0, 0), (-1, -1), 4),
        ]
        ligne_t.setStyle(TableStyle(base_style + row_styles))
        elements.append(ligne_t)
        elements.append(Spacer(1, 0.5*cm))

        # ════════════════════════════════════════════════════════════════════
        # 4. RÉCAPITULATIF FINANCIER
        # ════════════════════════════════════════════════════════════════════
        elements.append(Paragraph("RÉCAPITULATIF", sSect))
        elements.append(Spacer(1, 0.15*cm))

        # Sous-total brut = somme montant_ht lignes (avant conditions ligne)
        sous_total_brut = sum((l.montant_ht for l in lignes), Decimal('0'))
        # Montant HT = après conditions ligne = bc.montant_ht
        montant_ht = Decimal(str(bc.montant_ht))

        recap_data = []
        recap_data.append([
            Paragraph('Sous-total brut (Σ lignes)', sRight),
            Paragraph(fmt(sous_total_brut), sRight),
        ])

        # Conditions par ligne (agrégées)
        if sous_total_brut != montant_ht:
            diff_lignes = montant_ht - sous_total_brut
            sign = '+' if diff_lignes >= 0 else '−'
            recap_data.append([
                Paragraph('Conditions appliquées aux lignes', S('Normal', fontSize=8, textColor=C_MUTED, alignment=TA_RIGHT)),
                Paragraph(f"{sign} {fmt(abs(diff_lignes))}", S('Normal', fontSize=8, textColor=C_MUTED, alignment=TA_RIGHT)),
            ])

        recap_data.append([
            Paragraph('<b>Sous-total HT (après conditions ligne)</b>', sRightB),
            Paragraph(f'<b>{fmt(montant_ht)}</b>', sRightB),
        ])

        # Conditions BC
        if conditions:
            recap_data.append([Paragraph('', sNormal), Paragraph('', sNormal)])  # spacer row
            running = montant_ht
            for c in conditions:
                val     = Decimal(str(c.valeur))
                is_pct  = c.mode_calcul_snapshot == 'pourcentage'
                is_maj  = c.type_effet_snapshot  == 'majoration'
                amt     = (running * val / 100) if is_pct else val
                running = (running + amt) if is_maj else max(Decimal('0'), running - amt)
                sign    = '+' if is_maj else '−'
                val_str = f"{sign} {float(val):.2f} %" if is_pct else f"{sign} {fmt(amt)}"
                recap_data.append([
                    Paragraph(f"Condition BC : {c.nom_snapshot}  ({val_str})", S('Normal', fontSize=8, textColor=C_MUTED, alignment=TA_RIGHT)),
                    Paragraph(fmt(running), S('Normal', fontSize=8, textColor=C_MUTED, alignment=TA_RIGHT)),
                ])

        # Total net final
        total_net = Decimal(str(bc.montant_ttc))
        recap_data.append([
            Paragraph('<b>TOTAL NET</b>', S('Normal', fontSize=11, fontName='Helvetica-Bold',
                      textColor=WHITE, alignment=TA_RIGHT)),
            Paragraph(f'<b>{fmt(total_net)}</b>', S('Normal', fontSize=11, fontName='Helvetica-Bold',
                      textColor=WHITE, alignment=TA_RIGHT)),
        ])

        n = len(recap_data)
        recap_t = Table(recap_data, colWidths=[PAGE_W * 0.68, PAGE_W * 0.32])
        recap_styles = [
            ('ALIGN',        (0, 0), (-1, -1), 'RIGHT'),
            ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING',      (0, 0), (-1, -1), 5),
            ('LINEABOVE',    (0, n-1), (-1, n-1), 1.5, C_HEADER),
            ('BACKGROUND',   (0, n-1), (-1, n-1), C_HEADER),
            ('GRID',         (0, 0), (-1, n-2), 0.3, C_BORDER),
        ]
        recap_t.setStyle(TableStyle(recap_styles))
        elements.append(recap_t)

        # ════════════════════════════════════════════════════════════════════
        # 5. NOTES
        # ════════════════════════════════════════════════════════════════════
        if bc.notes:
            elements.append(Spacer(1, 0.5*cm))
            elements.append(HRFlowable(width='100%', thickness=0.5, color=C_BORDER, spaceAfter=6))
            elements.append(Paragraph('<b>Notes :</b>', sNormal))
            elements.append(Spacer(1, 0.1*cm))
            elements.append(Paragraph(bc.notes.replace('\n', '<br/>'), sNormal))

        # ════════════════════════════════════════════════════════════════════
        # 6. PIED DE PAGE
        # ════════════════════════════════════════════════════════════════════
        elements.append(Spacer(1, 0.6*cm))
        elements.append(HRFlowable(width='100%', thickness=0.5, color=C_BORDER, spaceAfter=4))
        elements.append(Paragraph(
            f"Document généré le {timezone.now().strftime('%d/%m/%Y à %H:%M')} · MEPALE ERP",
            S('Normal', fontSize=7, textColor=C_MUTED, alignment=TA_CENTER),
        ))

        doc.build(elements)
        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="BC_{bc.reference}.pdf"'
        return response


# ---------------------------------------------------------------------------
# Lignes Bon de Commande — CRUD restreint au statut brouillon
# ---------------------------------------------------------------------------

class LigneBonCommandeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    http_method_names  = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return LigneBonCommande.objects.select_related(
            'bon_commande', 'article__unite',
        ).prefetch_related('conditions')

    def get_serializer_class(self):
        if self.action == 'create':
            return LigneBCStandaloneCreateSerializer
        if self.action == 'partial_update':
            return LigneBCUpdateSerializer
        return LigneBCSerializer

    def _check_brouillon(self, ligne):
        if ligne.bon_commande.statut != BonCommande.Statut.BROUILLON:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Modifications réservées aux BCs en brouillon.'})

    def create(self, request, *args, **kwargs):
        serializer = LigneBCStandaloneCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bc = serializer.validated_data['bon_commande']
        if bc.statut != BonCommande.Statut.BROUILLON:
            return Response(
                {'detail': 'Impossible d\'ajouter une ligne : le BC n\'est pas en brouillon.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ligne = serializer.save()
        bc.calculer_totaux()
        return Response(
            LigneBCSerializer(ligne, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        ligne = self.get_object()
        self._check_brouillon(ligne)
        serializer = LigneBCUpdateSerializer(ligne, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        ligne.bon_commande.calculer_totaux()
        return Response(LigneBCSerializer(ligne, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        ligne = self.get_object()
        self._check_brouillon(ligne)
        if ligne.quantite_recue > 0:
            return Response(
                {'detail': 'Cette ligne a déjà des réceptions enregistrées et ne peut pas être supprimée.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bc = ligne.bon_commande
        ligne.delete()
        bc.calculer_totaux()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GAP 9 — Types de frais annexes (admin) + Frais annexes par BC
# ---------------------------------------------------------------------------

class ConditionTarifaireViewSet(viewsets.ModelViewSet):
    """
    Catalogue des conditions tarifaires — géré par l'administration.
    Lecture : tout le staff. Écriture : admins/directeurs uniquement.
    Suppression protégée si des applications existent.
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = ConditionTarifaireSerializer
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['actif', 'mode_calcul', 'type_effet', 'niveau']
    search_fields      = ['nom', 'description']
    ordering           = ['nom']

    def get_queryset(self):
        return ConditionTarifaire.objects.all()

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrDirecteur()]
        return [IsAuthenticated()]

    def perform_destroy(self, instance):
        if instance.applications.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                f"La condition « {instance.nom} » est utilisée sur "
                f"{instance.applications.count()} bon(s) de commande et ne peut pas être supprimée."
            )
        instance.delete()


class ConditionAppliqueeBCViewSet(viewsets.ModelViewSet):
    """
    Conditions tarifaires appliquées à un BC ou à une ligne BC.
    Recalcule automatiquement les totaux du BC après toute modification.
    """
    permission_classes = [IsLogistiqueStaff]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['bon_commande', 'ligne_bc']

    def get_queryset(self):
        return ConditionAppliqueeBC.objects.select_related('condition', 'bon_commande', 'ligne_bc')

    def get_serializer_class(self):
        if self.request.method in ['POST', 'PUT', 'PATCH']:
            return ConditionAppliqueeBCCreateSerializer
        return ConditionAppliqueeBCSerializer

    def _get_bc(self, instance):
        if instance.bon_commande_id:
            return instance.bon_commande
        return instance.ligne_bc.bon_commande

    def perform_create(self, serializer):
        instance = serializer.save()
        self._get_bc(instance).calculer_totaux()

    def perform_update(self, serializer):
        instance = serializer.save()
        self._get_bc(instance).calculer_totaux()

    def perform_destroy(self, instance):
        bc = self._get_bc(instance)
        instance.delete()
        bc.calculer_totaux()


# ---------------------------------------------------------------------------
# Réceptions
# ---------------------------------------------------------------------------

class ReceptionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    filterset_fields   = ['statut', 'bon_commande']
    ordering           = ['-date_reception']

    def get_queryset(self):
        return Reception.objects.select_related(
            'bon_commande__fournisseur', 'recue_par',
        ).prefetch_related('lignes__ligne_bc__article__unite', 'lignes__lot_cree')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ReceptionCreateSerializer
        return ReceptionSerializer

    @action(detail=True, methods=['post'], url_path='valider')
    def valider(self, request, pk=None):
        reception = self.get_object()
        try:
            with transaction.atomic():
                valider_reception(reception, request.user)
            serializer = ReceptionSerializer(reception, context={'request': request})
            return Response({
                'detail': f"Réception {reception.reference} validée et stock mis à jour.",
                'reception': serializer.data,
            })
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """
        GAP R7 — Génère le bon de réception (GRN) en PDF.
        """
        reception = self.get_object()
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

        # En-tête
        elements.append(Paragraph(f"BON DE RÉCEPTION — {reception.reference}", styles['Title']))
        elements.append(Spacer(1, 0.3*cm))
        bc = reception.bon_commande
        bl = f" | BL : {reception.numero_bl_fournisseur}" if reception.numero_bl_fournisseur else ""
        elements.append(Paragraph(
            f"BC : <b>{bc.reference}</b> | Fournisseur : <b>{bc.fournisseur.raison_sociale}</b>"
            f" | Date réception : {reception.date_reception}{bl}"
            f" | Statut : {reception.get_statut_display()}",
            styles['Normal'],
        ))
        elements.append(Spacer(1, 0.5*cm))

        # Tableau des lignes
        data = [['Article', 'Code', 'Qté reçue', 'N° Lot fourn.', 'Péremption', 'Conforme', 'Lot créé']]
        for ligne in reception.lignes.select_related('ligne_bc__article', 'lot_cree').all():
            art = ligne.ligne_bc.article
            data.append([
                art.designation,
                art.code,
                f"{ligne.quantite_recue}",
                ligne.numero_lot_fournisseur or '—',
                str(ligne.date_peremption) if ligne.date_peremption else '—',
                'OUI' if ligne.conforme else f"NON — {ligne.motif_non_conformite or ''}",
                ligne.lot_cree.numero_lot if ligne.lot_cree else '—',
            ])

        t = Table(data, colWidths=[4.5*cm, 2*cm, 2*cm, 2.5*cm, 2.5*cm, 3*cm, 2.5*cm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0A0B10')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f8f8')]),
        ]))
        elements.append(t)

        if reception.notes:
            elements.append(Spacer(1, 0.5*cm))
            elements.append(Paragraph(f"<b>Notes :</b> {reception.notes}", styles['Normal']))

        doc.build(elements)
        buffer.seek(0)
        resp = HttpResponse(buffer, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="GRN_{reception.reference}.pdf"'
        return resp


# ---------------------------------------------------------------------------
# GAP R4 — Retours Fournisseurs
# ---------------------------------------------------------------------------

class RetourFournisseurViewSet(viewsets.ModelViewSet):
    """
    CRUD retours fournisseur + action valider.
    Un retour ne peut être validé qu'une seule fois.
    """
    permission_classes = [IsLogistiqueStaff]
    serializer_class   = RetourFournisseurSerializer
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    filterset_fields   = ['statut', 'fournisseur', 'reception']
    ordering           = ['-date_creation']

    def get_queryset(self):
        return RetourFournisseur.objects.select_related(
            'reception__bon_commande__fournisseur', 'fournisseur', 'cree_par',
        ).prefetch_related(
            'lignes__ligne_reception__ligne_bc__article__unite',
            'lignes__ligne_reception__lot_cree',
        )

    @action(detail=True, methods=['post'], url_path='valider')
    def valider(self, request, pk=None):
        retour = self.get_object()
        try:
            with transaction.atomic():
                valider_retour(retour, request.user)
            serializer = RetourFournisseurSerializer(retour, context={'request': request})
            return Response({
                'detail': f"Retour {retour.reference} validé. Stock mis à jour.",
                'retour': serializer.data,
            })
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Factures Fournisseurs
# ---------------------------------------------------------------------------

class FactureFournisseurViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = FactureFilter
    search_fields      = ['reference', 'ref_fournisseur', 'fournisseur__raison_sociale']
    ordering           = ['-date_facture']

    def get_queryset(self):
        return FactureFournisseur.objects.select_related(
            'fournisseur', 'bon_commande', 'reception', 'cree_par',
            'approuve_par', 'facture_origine',
        ).prefetch_related(
            'paiements__effectue_par',
            'lignes__ligne_bc__article__unite',
            'echeances',
        )

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return FactureFournisseurCreateSerializer
        return FactureFournisseurSerializer

    def perform_create(self, serializer):
        serializer.save(cree_par=self.request.user)

    # ── F1 : Workflow approbation ─────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='soumettre')
    def soumettre(self, request, pk=None):
        """BROUILLON → SOUMISE."""
        facture = self.get_object()
        if facture.statut != FactureFournisseur.Statut.BROUILLON:
            return Response(
                {'detail': 'Seuls les brouillons peuvent être soumis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        facture.statut = FactureFournisseur.Statut.SOUMISE
        facture.save(update_fields=['statut'])
        logger.info("Facture %s soumise par %s", facture.reference, request.user)
        return Response({'detail': f"Facture {facture.reference} soumise."})

    @action(detail=True, methods=['post'], url_path='approuver')
    def approuver(self, request, pk=None):
        """SOUMISE → EN_ATTENTE (ou ATTENTE_DIRECTION si montant > seuil)."""
        facture = self.get_object()
        if facture.statut != FactureFournisseur.Statut.SOUMISE:
            return Response(
                {'detail': 'Seules les factures soumises peuvent être approuvées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if float(facture.montant_ttc) > FactureFournisseur.SEUIL_DIRECTION_FCFA:
            facture.statut = FactureFournisseur.Statut.ATTENTE_DIRECTION
            facture.save(update_fields=['statut'])
            return Response({
                'detail': (
                    f"Facture {facture.reference} transmise à la Direction "
                    f"(montant {float(facture.montant_ttc):,.0f} FCFA "
                    f"> seuil {FactureFournisseur.SEUIL_DIRECTION_FCFA:,.0f} FCFA)."
                )
            })
        facture.statut           = FactureFournisseur.Statut.EN_ATTENTE
        facture.approuve_par     = request.user
        facture.date_approbation = timezone.now()
        facture.save(update_fields=['statut', 'approuve_par', 'date_approbation'])
        logger.info("Facture %s approuvée par %s", facture.reference, request.user)
        return Response({'detail': f"Facture {facture.reference} approuvée."})

    @action(detail=True, methods=['post'], url_path='approuver-direction',
            permission_classes=[IsAdminOrDirecteur])
    def approuver_direction(self, request, pk=None):
        """ATTENTE_DIRECTION → EN_ATTENTE — réservé Direction/Admin."""
        facture = self.get_object()
        if facture.statut != FactureFournisseur.Statut.ATTENTE_DIRECTION:
            return Response(
                {'detail': "Cette action est réservée aux factures en attente d'approbation direction."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        facture.statut           = FactureFournisseur.Statut.EN_ATTENTE
        facture.approuve_par     = request.user
        facture.date_approbation = timezone.now()
        facture.save(update_fields=['statut', 'approuve_par', 'date_approbation'])
        logger.info("Facture %s approuvée direction (%s)", facture.reference, request.user)
        return Response({'detail': f"Facture {facture.reference} approuvée par la Direction."})

    @action(detail=True, methods=['post'], url_path='rejeter')
    def rejeter(self, request, pk=None):
        """SOUMISE / ATTENTE_DIRECTION → REJETEE."""
        facture = self.get_object()
        ETATS_REJETABLES = [
            FactureFournisseur.Statut.SOUMISE,
            FactureFournisseur.Statut.ATTENTE_DIRECTION,
        ]
        if facture.statut not in ETATS_REJETABLES:
            return Response(
                {'detail': 'Seules les factures soumises ou en attente direction peuvent être rejetées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        motif = request.data.get('motif', '').strip()
        if not motif:
            return Response(
                {'detail': 'Le motif de rejet est obligatoire.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        facture.statut = FactureFournisseur.Statut.REJETEE
        facture.notes  = f"{facture.notes}\n[REJET] {motif}".strip() if facture.notes else f"[REJET] {motif}"
        facture.save(update_fields=['statut', 'notes'])
        logger.info("Facture %s rejetée par %s. Motif : %s", facture.reference, request.user, motif)
        return Response({'detail': f"Facture {facture.reference} rejetée."})

    @action(detail=True, methods=['post'], url_path='annuler')
    def annuler(self, request, pk=None):
        """Annule une facture non encore payée."""
        facture = self.get_object()
        if facture.statut == FactureFournisseur.Statut.PAYEE:
            return Response(
                {'detail': 'Une facture déjà payée ne peut pas être annulée.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if facture.statut == FactureFournisseur.Statut.ANNULEE:
            return Response({'detail': 'Facture déjà annulée.'}, status=status.HTTP_400_BAD_REQUEST)
        facture.statut = FactureFournisseur.Statut.ANNULEE
        facture.save(update_fields=['statut'])
        logger.info("Facture %s annulée par %s", facture.reference, request.user)
        return Response({'detail': f"Facture {facture.reference} annulée."})

    # ── F5 + F6 : Paiement avec contrôle surpaiement + intégrité ─────────────

    @action(detail=True, methods=['post'], url_path='payer')
    def payer(self, request, pk=None):
        """Enregistre un paiement (F5: contrôle surpaiement, F6: recalcul intègre)."""
        facture = self.get_object()
        ETATS_PAYABLES = [
            FactureFournisseur.Statut.EN_ATTENTE,
            FactureFournisseur.Statut.PARTIELLEMENT_PAYEE,
        ]
        if facture.statut not in ETATS_PAYABLES:
            return Response(
                {'detail': f"La facture doit être en attente ou partiellement payée (statut : {facture.statut})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PaiementFactureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        montant = float(serializer.validated_data['montant'])
        restant = float(facture.montant_ttc) - float(facture.montant_paye)

        # F5 — Contrôle surpaiement
        if montant > restant + 0.01:
            return Response(
                {
                    'detail': (
                        f"Surpaiement détecté : montant saisi {montant:,.0f} FCFA "
                        f"> restant dû {restant:,.0f} FCFA."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            paiement = serializer.save(facture=facture, effectue_par=request.user)
            # F6 — Recalcul depuis la base (intégrité garantie)
            facture.recalculer_montant_paye()

        from comptabilite.utils.accounting_auto import create_auto_entry
        create_auto_entry(
            type          = 'expense',
            label         = f"Paiement facture {facture.reference} — {facture.fournisseur.raison_sociale}",
            amount        = paiement.montant,
            date          = paiement.date_paiement,
            category_name = 'Achats de matières premières',
            ref_type      = 'paiement_fournisseur',
            ref_id        = paiement.id,
        )

        logger.info(
            "Paiement %s FCFA sur facture %s par %s",
            paiement.montant, facture.reference, request.user,
        )
        return Response(PaiementFactureSerializer(paiement).data, status=status.HTTP_201_CREATED)

    # ── F8 : Imputation avoir ─────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='appliquer-avoir')
    def appliquer_avoir(self, request, pk=None):
        """
        Impute un avoir fournisseur sur cette facture.
        body: { "avoir_id": "<uuid>", "montant": <decimal> }
        """
        from decimal import Decimal as D
        facture = self.get_object()

        ETATS_PAYABLES = [FactureFournisseur.Statut.EN_ATTENTE, FactureFournisseur.Statut.PARTIELLEMENT_PAYEE]
        if facture.statut not in ETATS_PAYABLES:
            return Response(
                {'detail': 'La facture doit être en attente ou partiellement payée.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        avoir_id = request.data.get('avoir_id')
        montant  = request.data.get('montant')
        if not avoir_id or montant is None:
            return Response(
                {'detail': 'avoir_id et montant sont obligatoires.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            avoir = FactureFournisseur.objects.select_for_update().get(
                id=avoir_id,
                type_document=FactureFournisseur.TypeDocument.AVOIR,
                fournisseur=facture.fournisseur,
            )
        except FactureFournisseur.DoesNotExist:
            return Response(
                {'detail': 'Avoir introuvable pour ce fournisseur.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        montant          = D(str(montant))
        avoir_disponible = D(str(avoir.montant_ttc)) - D(str(avoir.montant_paye))
        restant_facture  = D(str(facture.montant_ttc)) - D(str(facture.montant_paye))

        if montant <= 0:
            return Response({'detail': 'Le montant doit être positif.'}, status=status.HTTP_400_BAD_REQUEST)
        if montant > avoir_disponible + D('0.01'):
            return Response(
                {'detail': f"Montant ({montant:,.0f}) dépasse l'avoir disponible ({avoir_disponible:,.0f} FCFA)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if montant > restant_facture + D('0.01'):
            return Response(
                {'detail': f"Montant ({montant:,.0f}) dépasse le restant dû ({restant_facture:,.0f} FCFA)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.now().date()
        with transaction.atomic():
            # Paiement sur la facture cible (mode avoir)
            PaiementFacture.objects.create(
                facture=facture,
                montant=montant,
                mode_paiement=PaiementFacture.Mode.AVOIR,
                reference_paiement=avoir.reference,
                date_paiement=today,
                effectue_par=request.user,
                notes=f"Imputation avoir {avoir.reference}",
            )
            facture.recalculer_montant_paye()
            # Consommation de l'avoir (tracking)
            PaiementFacture.objects.create(
                facture=avoir,
                montant=montant,
                mode_paiement=PaiementFacture.Mode.AVOIR,
                reference_paiement=facture.reference,
                date_paiement=today,
                effectue_par=request.user,
                notes=f"Imputation sur facture {facture.reference}",
            )
            avoir.recalculer_montant_paye()

        logger.info(
            "Avoir %s imputé (%s FCFA) sur facture %s par %s",
            avoir.reference, montant, facture.reference, request.user,
        )
        return Response({
            'detail': (
                f"Avoir {avoir.reference} imputé pour {montant:,.0f} FCFA "
                f"sur la facture {facture.reference}."
            ),
            'facture': FactureFournisseurSerializer(facture, context={'request': request}).data,
        })

    # ── F14 : Annulation paiement ─────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path=r'paiements/(?P<paiement_id>[^/.]+)/annuler')
    def annuler_paiement(self, request, pk=None, paiement_id=None):
        """Annule un paiement (soft-delete via annule=True) et recalcule montant_paye."""
        facture = self.get_object()
        try:
            paiement = PaiementFacture.objects.select_for_update().get(
                id=paiement_id, facture=facture,
            )
        except PaiementFacture.DoesNotExist:
            return Response({'detail': 'Paiement introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if paiement.annule:
            return Response({'detail': 'Paiement déjà annulé.'}, status=status.HTTP_400_BAD_REQUEST)

        motif = request.data.get('motif', '').strip()
        with transaction.atomic():
            paiement.annule = True
            if motif:
                paiement.notes = f"{paiement.notes or ''}\n[ANNULATION] {motif}".strip()
            paiement.save(update_fields=['annule', 'notes'])
            facture.recalculer_montant_paye()

        logger.info(
            "Paiement %s annulé sur facture %s par %s",
            paiement_id, facture.reference, request.user,
        )
        return Response({
            'detail': f"Paiement annulé. Montant recalculé : {facture.montant_paye:,.0f} FCFA.",
        })

    # ── F12 : Factures en retard ──────────────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='en-retard')
    def en_retard(self, request):
        """GET /factures/en-retard/ — Factures échues non intégralement payées."""
        today  = timezone.now().date()
        OUVERTS = [FactureFournisseur.Statut.EN_ATTENTE, FactureFournisseur.Statut.PARTIELLEMENT_PAYEE]
        qs = FactureFournisseur.objects.filter(
            statut__in=OUVERTS,
            date_echeance__lt=today,
        ).select_related('fournisseur', 'bon_commande', 'cree_par', 'approuve_par')
        return Response({
            'count': qs.count(),
            'results': FactureFournisseurSerializer(qs, many=True, context={'request': request}).data,
        })

    # ── F15 : PDF facture + paiements ─────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Génère le PDF de la facture fournisseur avec ses paiements."""
        facture = self.get_object()
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.lib.units import cm
            from reportlab.platypus import (
                SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
            )
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

        # ── En-tête ───────────────────────────────────────────────────────────
        type_label = facture.get_type_document_display()
        elements.append(Paragraph(
            f"{type_label.upper()} FOURNISSEUR — {facture.reference}", styles['Title'],
        ))
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph(
            f"Fournisseur : <b>{facture.fournisseur.raison_sociale}</b> | "
            f"Réf. fourn. : {facture.ref_fournisseur or '—'} | "
            f"Date : {facture.date_facture} | "
            f"Échéance : {facture.date_echeance or '—'} | "
            f"Statut : <b>{facture.get_statut_display()}</b>",
            styles['Normal'],
        ))
        if facture.bon_commande_id:
            elements.append(Spacer(1, 0.2*cm))
            elements.append(Paragraph(
                f"BC lié : {facture.bon_commande.reference}", styles['Normal'],
            ))
        elements.append(Spacer(1, 0.5*cm))

        # ── Lignes de facture ─────────────────────────────────────────────────
        lignes = list(facture.lignes.select_related('ligne_bc__article').all())
        if lignes:
            elements.append(Paragraph("<b>Détail des lignes</b>", styles['Normal']))
            elements.append(Spacer(1, 0.2*cm))
            data = [['Désignation', 'Qté', 'P.U. HT (FCFA)', 'TVA %', 'Total TTC']]
            for lg in lignes:
                data.append([
                    lg.designation,
                    f"{lg.quantite}",
                    f"{lg.prix_unitaire:,.0f}",
                    f"{lg.taux_tva}%",
                    f"{lg.montant_ttc:,.0f}",
                ])
            t = Table(data, colWidths=[6*cm, 2*cm, 3*cm, 2*cm, 3.5*cm])
            t.setStyle(TableStyle([
                ('BACKGROUND',    (0, 0), (-1,  0), colors.HexColor('#0A0B10')),
                ('TEXTCOLOR',     (0, 0), (-1,  0), colors.white),
                ('FONTNAME',      (0, 0), (-1,  0), 'Helvetica-Bold'),
                ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE',      (0, 0), (-1, -1), 9),
                ('GRID',          (0, 0), (-1, -1), 0.5, colors.grey),
                ('ALIGN',         (1, 0), (-1, -1), 'RIGHT'),
                ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING',       (0, 0), (-1, -1), 5),
                ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f8f8')]),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 0.4*cm))

        # ── Totaux ────────────────────────────────────────────────────────────
        restant = max(0, float(facture.montant_ttc) - float(facture.montant_paye))
        totaux  = [
            ['Montant HT :',   f"{facture.montant_ht:,.0f} FCFA"],
            ['TVA :',          f"{facture.tva:,.0f} FCFA"],
            ['Montant TTC :',  f"{facture.montant_ttc:,.0f} FCFA"],
            ['Déjà payé :',    f"{facture.montant_paye:,.0f} FCFA"],
            ['Restant dû :',   f"{restant:,.0f} FCFA"],
        ]
        tt = Table(totaux, colWidths=[14*cm, 4*cm])
        tt.setStyle(TableStyle([
            ('ALIGN',    (0, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 2), (-1,  2), 'Helvetica-Bold'),
            ('FONTNAME', (0, 4), (-1,  4), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('LINEABOVE',(0, 2), (-1,  2), 1,   colors.black),
            ('LINEABOVE',(0, 4), (-1,  4), 0.5, colors.grey),
            ('PADDING',  (0, 0), (-1, -1), 4),
        ]))
        elements.append(tt)

        # ── Paiements ─────────────────────────────────────────────────────────
        paiements = list(
            facture.paiements.filter(annule=False)
            .select_related('effectue_par')
            .order_by('date_paiement')
        )
        if paiements:
            elements.append(Spacer(1, 0.5*cm))
            elements.append(Paragraph("<b>Paiements enregistrés</b>", styles['Normal']))
            elements.append(Spacer(1, 0.2*cm))
            data_p = [['Date', 'Mode', 'Référence', 'Montant (FCFA)', 'Saisi par']]
            for p in paiements:
                data_p.append([
                    str(p.date_paiement),
                    p.get_mode_paiement_display(),
                    p.reference_paiement or '—',
                    f"{p.montant:,.0f}",
                    str(p.effectue_par) if p.effectue_par else '—',
                ])
            tp = Table(data_p, colWidths=[2.5*cm, 3*cm, 3.5*cm, 3.5*cm, 4*cm])
            tp.setStyle(TableStyle([
                ('BACKGROUND',    (0, 0), (-1,  0), colors.HexColor('#1a1a2e')),
                ('TEXTCOLOR',     (0, 0), (-1,  0), colors.white),
                ('FONTNAME',      (0, 0), (-1,  0), 'Helvetica-Bold'),
                ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE',      (0, 0), (-1, -1), 9),
                ('GRID',          (0, 0), (-1, -1), 0.5, colors.grey),
                ('ALIGN',         (3, 0), ( 3, -1), 'RIGHT'),
                ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING',       (0, 0), (-1, -1), 5),
                ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f8f8')]),
            ]))
            elements.append(tp)

        if facture.notes:
            elements.append(Spacer(1, 0.5*cm))
            elements.append(Paragraph(f"<b>Notes :</b> {facture.notes}", styles['Normal']))

        doc.build(elements)
        buffer.seek(0)
        resp = HttpResponse(buffer, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="FAC_{facture.reference}.pdf"'
        return resp


# ---------------------------------------------------------------------------
# Inventaires Physiques
# ---------------------------------------------------------------------------

class InventaireSessionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLogistiqueStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = InventaireFilter
    search_fields      = ['reference', 'notes']
    ordering           = ['-date_debut']

    def get_queryset(self):
        return InventaireSession.objects.select_related('cree_par').prefetch_related(
            'lignes__lot__article__unite',
            'lignes__article__unite',
            'articles_cibles',
        )

    def get_serializer_class(self):
        return InventaireSessionSerializer

    def perform_create(self, serializer):
        """
        Crée la session et génère les lignes selon le périmètre (I4) :
        – COMPLET   → tous les lots actifs + tous les articles globaux
        – CATEGORIE → filtrés par type d'article (field article.type)
        – ARTICLES  → uniquement les articles ciblés (M2M articles_cibles)
        """
        from production.models import Lot, Article
        from logistique.services import generer_reference_inventaire
        from .models import StockArticle

        # Récupérer le périmètre depuis les données validées
        type_perimetre = serializer.validated_data.get(
            'type_perimetre', InventaireSession.TypePerimetre.COMPLET
        )
        categories     = serializer.validated_data.get('categories', [])
        articles_cibles_ids = [
            a.id for a in serializer.validated_data.get('articles_cibles', [])
        ]

        with transaction.atomic():
            session = serializer.save(
                reference=generer_reference_inventaire(),
                cree_par=self.request.user,
            )

            lignes = []

            # ── Construire les querysets selon le périmètre ─────────────────────
            lots_qs = Lot.objects.filter(
                statut__in=['disponible', 'bloque'],
                quantite_restante__gt=0,
                article__gere_par_lot=True,
            ).select_related('article__unite')

            articles_qs = Article.objects.filter(
                actif=True,
                gere_par_lot=False,
            ).select_related('stock')

            if type_perimetre == InventaireSession.TypePerimetre.CATEGORIE and categories:
                lots_qs     = lots_qs.filter(article__type__in=categories)
                articles_qs = articles_qs.filter(type__in=categories)
            elif type_perimetre == InventaireSession.TypePerimetre.ARTICLES and articles_cibles_ids:
                lots_qs     = lots_qs.filter(article__id__in=articles_cibles_ids)
                articles_qs = articles_qs.filter(id__in=articles_cibles_ids)

            # ── I3 — Prix de valorisation : dernier prix d'achat connu ──────────
            from .models import LigneBonCommande

            def get_prix_valorisation(article):
                """Retourne le dernier prix d'achat connu pour un article."""
                ligne = (
                    LigneBonCommande.objects
                    .filter(article=article, prix_unitaire__gt=0)
                    .order_by('-bon_commande__date_commande')
                    .values_list('prix_unitaire', flat=True)
                    .first()
                )
                return ligne or 0

            # ── Articles gérés par lot ──────────────────────────────────────────
            for lot in lots_qs:
                lignes.append(LigneInventaire(
                    session=session,
                    lot=lot,
                    quantite_theorique=lot.quantite_restante,
                    prix_unitaire_valorisation=lot.cout_unitaire or get_prix_valorisation(lot.article),
                ))

            # ── Articles en stock global (sans lot) ─────────────────────────────
            for article in articles_qs:
                stock    = getattr(article, 'stock', None)
                qte_theo = float(stock.quantite_disponible) if stock else 0
                lignes.append(LigneInventaire(
                    session=session,
                    article=article,
                    quantite_theorique=qte_theo,
                    prix_unitaire_valorisation=get_prix_valorisation(article),
                ))

            LigneInventaire.objects.bulk_create(lignes)

        logger.info(
            "Inventaire %s créé par %s — périmètre : %s — %d lignes",
            session.reference, self.request.user, type_perimetre, len(lignes),
        )

    # ── I7 + I12 : Saisie comptage ────────────────────────────────────────────

    @action(detail=True, methods=['patch'], url_path=r'lignes/(?P<ligne_id>[^/.]+)')
    def saisir_comptage(self, request, pk=None, ligne_id=None):
        """PATCH /inventaires/<id>/lignes/<ligne_id>/ — Saisit la quantité comptée."""
        session = self.get_object()
        try:
            ligne = LigneInventaire.objects.get(id=ligne_id, session=session)
        except LigneInventaire.DoesNotExist:
            return Response({'detail': 'Ligne introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if session.statut != InventaireSession.Statut.EN_COURS:
            return Response(
                {'detail': 'La session est clôturée.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quantite_comptee = request.data.get('quantite_comptee')
        justification    = request.data.get('justification', '')

        if quantite_comptee is None:
            return Response(
                {'detail': 'quantite_comptee est obligatoire.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ligne.quantite_comptee = quantite_comptee
        ligne.justification    = justification
        ligne.statut_saisie    = LigneInventaire.StatutSaisie.SAISIE     # I7
        ligne.save(update_fields=['quantite_comptee', 'justification', 'statut_saisie'])
        return Response(LigneInventaireSerializer(ligne, context={'request': request}).data)

    # ── I1 + I2 + I3 + I5 + I7 : Validation inventaire ──────────────────────

    @action(detail=True, methods=['post'], url_path='valider')
    def valider(self, request, pk=None):
        """
        Valide l'inventaire — applique les écarts au stock.
        I1 : recalcul qté système courante avant posting.
        I2 : bloque si lignes non comptées (sauf forcer_non_comptees=true).
        I3 : utilise prix_unitaire_valorisation.
        I7 : met à jour statut_saisie → VALIDEE.
        """
        session = self.get_object()
        if session.statut != InventaireSession.Statut.EN_COURS:
            return Response(
                {'detail': 'Seules les sessions en cours peuvent être validées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        forcer_non_comptees = str(request.data.get('forcer_non_comptees', 'false')).lower() == 'true'

        lignes_all = list(session.lignes.select_related(
            'lot__article__unite', 'article__unite',
        ).select_for_update().all())

        # ── I2 — Vérification lignes non comptées ────────────────────────────
        lignes_nc = [l for l in lignes_all if l.quantite_comptee is None]
        if lignes_nc and not forcer_non_comptees:
            refs = [
                l.lot.numero_lot if l.lot_id else (l.article.code if l.article_id else '?')
                for l in lignes_nc
            ]
            return Response(
                {
                    'detail': (
                        f"{len(lignes_nc)} ligne(s) non comptée(s). "
                        "Saisir les quantités ou passer forcer_non_comptees=true "
                        "pour les confirmer sans écart."
                    ),
                    'lignes_non_comptees': refs,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Pré-validation : justification écarts > 5% ───────────────────────
        lignes_sans_justif = []
        for ligne in lignes_all:
            if ligne.quantite_comptee is None:
                continue
            ecart = float(ligne.quantite_comptee) - float(ligne.quantite_theorique)
            if abs(ecart) > 0.001:
                seuil_abs = max(float(ligne.quantite_theorique) * 0.05, 0.001)
                if abs(ecart) > seuil_abs and not (ligne.justification or '').strip():
                    ref = (
                        ligne.lot.numero_lot if ligne.lot_id
                        else (ligne.article.code if ligne.article_id else '?')
                    )
                    lignes_sans_justif.append(f"{ref} (écart : {ecart:+.3f})")

        if lignes_sans_justif:
            return Response(
                {
                    'detail': (
                        "Justification obligatoire pour les écarts significatifs (>5%) : "
                        + ", ".join(lignes_sans_justif)
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            from .models import StockArticle

            # I2 — Forcer les lignes non comptées à quantite_theorique (zéro écart)
            if forcer_non_comptees:
                for ligne in lignes_nc:
                    ligne.quantite_comptee = ligne.quantite_theorique
                    ligne.statut_saisie    = LigneInventaire.StatutSaisie.SAISIE
                    ligne.save(update_fields=['quantite_comptee', 'statut_saisie'])

            for ligne in lignes_all:
                if ligne.quantite_comptee is None:
                    continue

                # I1 — Recalcule la quantité système COURANTE au moment du posting
                if ligne.lot_id:
                    qte_systeme_courante = float(ligne.lot.quantite_restante)
                else:
                    stock_obj = StockArticle.objects.filter(article=ligne.article).first()
                    qte_systeme_courante = float(stock_obj.quantite_disponible) if stock_obj else 0
                # Stocker dans le champ d'audit
                ligne.quantite_systeme_validation = qte_systeme_courante
                # Écart réel = comptée − stock courant (I1)
                ecart = float(ligne.quantite_comptee) - qte_systeme_courante

                if abs(ecart) < 0.001:
                    ligne.statut_saisie = LigneInventaire.StatutSaisie.VALIDEE   # I7
                    ligne.valide = True
                    ligne.save(update_fields=['quantite_systeme_validation', 'statut_saisie', 'valide'])
                    continue

                sens     = 1 if ecart > 0 else -1
                type_mvt = (
                    MouvementStock.Type.AJUSTEMENT_POS if ecart > 0
                    else MouvementStock.Type.AJUSTEMENT_NEG
                )

                article_effectif = ligne.lot.article if ligne.lot_id else ligne.article
                # I3 — Utiliser le prix de valorisation (jamais 0 sauf si vraiment inconnu)
                cout = float(ligne.prix_unitaire_valorisation or 0)

                MouvementStock.objects.create(
                    article=article_effectif,
                    lot=ligne.lot,
                    type=type_mvt,
                    quantite=abs(ecart),
                    sens=sens,
                    cout_unitaire=cout,
                    reference_doc=f"INV/{session.reference}",
                    notes=ligne.justification or f"Inventaire {session.reference}",
                    effectue_par=request.user,
                )

                # Mise à jour du lot (si géré par lot)
                if ligne.lot_id:
                    nouveau_restant = max(0, float(ligne.lot.quantite_restante) + ecart)
                    ligne.lot.quantite_restante = nouveau_restant
                    if nouveau_restant == 0:
                        ligne.lot.statut = 'epuise'
                    ligne.lot.save(update_fields=['quantite_restante', 'statut'])

                # Mise à jour du stock agrégé
                stock, _ = StockArticle.objects.select_for_update().get_or_create(
                    article=article_effectif,
                    defaults={'quantite_disponible': 0},
                )
                stock.quantite_disponible = max(0, float(stock.quantite_disponible) + ecart)
                stock.save(update_fields=['quantite_disponible', 'derniere_maj'])

                ligne.statut_saisie = LigneInventaire.StatutSaisie.VALIDEE       # I7
                ligne.valide = True
                ligne.save(update_fields=['quantite_systeme_validation', 'statut_saisie', 'valide'])

            session.statut   = InventaireSession.Statut.VALIDE
            session.date_fin = timezone.now()
            session.save(update_fields=['statut', 'date_fin'])

        logger.info("Inventaire %s validé par %s", session.reference, request.user)
        return Response({'detail': f"Inventaire {session.reference} validé et stock ajusté."})

    @action(detail=True, methods=['post'], url_path='annuler')
    def annuler(self, request, pk=None):
        """Annule la session d'inventaire — uniquement si elle est encore en cours."""
        session = self.get_object()
        if session.statut != InventaireSession.Statut.EN_COURS:
            return Response(
                {'detail': 'Seules les sessions en cours peuvent être annulées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session.statut   = InventaireSession.Statut.ANNULE
        session.date_fin = timezone.now()
        session.save(update_fields=['statut', 'date_fin'])
        logger.info("Inventaire %s annulé par %s", session.reference, request.user)
        return Response({'detail': f"Inventaire {session.reference} annulé."})

    # ── I5 : Rapport d'écarts ────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='rapport')
    def rapport(self, request, pk=None):
        """
        GET /inventaires/<id>/rapport/
        Rapport structuré : métriques globales + liste des écarts triés par valeur absolue.
        """
        session = self.get_object()
        lignes  = list(session.lignes.select_related(
            'lot__article__unite', 'article__unite',
        ).all())

        lignes_ecart    = []
        total_ajust_pos = 0.0
        total_ajust_neg = 0.0
        valeur_ajust_pos = 0.0
        valeur_ajust_neg = 0.0

        for ligne in lignes:
            ecart = ligne.ecart
            if ecart is None or abs(ecart) < 0.001:
                continue
            article_eff = ligne.lot.article if ligne.lot_id else ligne.article
            ref         = ligne.lot.numero_lot if ligne.lot_id else (
                article_eff.code if article_eff else '?'
            )
            designation = article_eff.designation if article_eff else '?'
            unite       = article_eff.unite.code if article_eff and article_eff.unite_id else '?'
            pvu         = float(ligne.prix_unitaire_valorisation or 0)
            valeur_ecart = abs(ecart) * pvu
            qte_ref     = float(
                ligne.quantite_systeme_validation
                if ligne.quantite_systeme_validation is not None
                else ligne.quantite_theorique
            )
            pct         = round(ecart / qte_ref * 100, 1) if qte_ref else None

            lignes_ecart.append({
                'ligne_id':          str(ligne.id),
                'reference':         ref,
                'designation':       designation,
                'unite':             unite,
                'quantite_theorique': float(ligne.quantite_theorique),
                'quantite_systeme_validation': (
                    float(ligne.quantite_systeme_validation)
                    if ligne.quantite_systeme_validation is not None else None
                ),
                'quantite_comptee':  float(ligne.quantite_comptee),
                'ecart':             round(ecart, 3),
                'ecart_pct':         pct,
                'prix_valorisation': pvu,
                'valeur_ecart':      round(valeur_ecart, 2),
                'justification':     ligne.justification,
            })
            if ecart > 0:
                total_ajust_pos  += ecart
                valeur_ajust_pos += valeur_ecart
            else:
                total_ajust_neg  += abs(ecart)
                valeur_ajust_neg += valeur_ecart

        # Tri par valeur absolue d'écart financier (les plus impactants en premier)
        lignes_ecart.sort(key=lambda x: x['valeur_ecart'], reverse=True)

        nb_non_comptees = sum(1 for l in lignes if l.quantite_comptee is None)

        return Response({
            'session':               {'id': str(session.id), 'reference': session.reference, 'statut': session.statut},
            'nb_lignes_total':       len(lignes),
            'nb_lignes_ecart':       len(lignes_ecart),
            'nb_lignes_non_comptees': nb_non_comptees,
            'total_ajustements_pos': round(total_ajust_pos, 3),
            'total_ajustements_neg': round(total_ajust_neg, 3),
            'valeur_ajust_pos_fcfa': round(valeur_ajust_pos, 2),
            'valeur_ajust_neg_fcfa': round(valeur_ajust_neg, 2),
            'impact_net_fcfa':       round(valeur_ajust_pos - valeur_ajust_neg, 2),
            'lignes':                lignes_ecart,
        })

    # ── I5 : PDF rapport inventaire ───────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Génère le PDF de la session d'inventaire avec le rapport d'écarts."""
        session = self.get_object()
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.lib.units import cm
            from reportlab.platypus import (
                SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
            )
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

        # ── En-tête ───────────────────────────────────────────────────────────
        elements.append(Paragraph(
            f"INVENTAIRE PHYSIQUE — {session.reference}", styles['Title'],
        ))
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph(
            f"Statut : <b>{session.get_statut_display()}</b> | "
            f"Début : {session.date_debut.strftime('%d/%m/%Y %H:%M')} | "
            f"Fin : {session.date_fin.strftime('%d/%m/%Y %H:%M') if session.date_fin else '—'} | "
            f"Périmètre : {session.get_type_perimetre_display()} | "
            f"Aveugle : {'Oui' if session.aveugle else 'Non'}",
            styles['Normal'],
        ))
        elements.append(Spacer(1, 0.5*cm))

        # ── Toutes les lignes ─────────────────────────────────────────────────
        lignes = list(session.lignes.select_related(
            'lot__article__unite', 'article__unite',
        ).order_by('statut_saisie'))

        data = [['Article / Lot', 'Qté système', 'Qté comptée', 'Écart', 'Valeur écart (FCFA)', 'Statut']]
        for ligne in lignes:
            art = ligne.lot.article if ligne.lot_id else ligne.article
            ref = (ligne.lot.numero_lot if ligne.lot_id else (art.code if art else '?'))
            ecart = ligne.ecart
            pvu   = float(ligne.prix_unitaire_valorisation or 0)
            valeur = f"{abs(ecart) * pvu:,.0f}" if ecart is not None else '—'
            data.append([
                f"{art.designation if art else '?'}\n({ref})",
                f"{float(ligne.quantite_theorique):g}",
                f"{float(ligne.quantite_comptee):g}" if ligne.quantite_comptee is not None else '—',
                f"{ecart:+.3f}" if ecart is not None else '—',
                valeur,
                ligne.get_statut_saisie_display(),
            ])

        t = Table(data, colWidths=[5.5*cm, 2.5*cm, 2.5*cm, 2*cm, 3*cm, 2.5*cm])
        t.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1,  0), colors.HexColor('#0A0B10')),
            ('TEXTCOLOR',     (0, 0), (-1,  0), colors.white),
            ('FONTNAME',      (0, 0), (-1,  0), 'Helvetica-Bold'),
            ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE',      (0, 0), (-1, -1), 8),
            ('GRID',          (0, 0), (-1, -1), 0.5, colors.grey),
            ('ALIGN',         (1, 0), (-1, -1), 'RIGHT'),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING',       (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f8f8')]),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 0.5*cm))

        # ── Synthèse ──────────────────────────────────────────────────────────
        lignes_ecart   = [l for l in lignes if l.ecart is not None and abs(l.ecart) > 0.001]
        val_pos = sum(float(l.ecart) * float(l.prix_unitaire_valorisation or 0)
                      for l in lignes_ecart if l.ecart > 0)
        val_neg = sum(abs(float(l.ecart)) * float(l.prix_unitaire_valorisation or 0)
                      for l in lignes_ecart if l.ecart < 0)
        synthese = [
            ['Lignes totales :',      f"{len(lignes)}"],
            ['Lignes avec écart :',   f"{len(lignes_ecart)}"],
            ['Lignes non comptées :', f"{sum(1 for l in lignes if l.quantite_comptee is None)}"],
            ['Valeur ajust. + :',     f"{val_pos:,.0f} FCFA"],
            ['Valeur ajust. − :',     f"{val_neg:,.0f} FCFA"],
            ['Impact net :',          f"{val_pos - val_neg:+,.0f} FCFA"],
        ]
        ts = Table(synthese, colWidths=[10*cm, 6*cm])
        ts.setStyle(TableStyle([
            ('ALIGN',    (0, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 5), (-1,  5), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('LINEABOVE',(0, 5), (-1,  5), 1, colors.black),
            ('PADDING',  (0, 0), (-1, -1), 4),
        ]))
        elements.append(ts)

        if session.notes:
            elements.append(Spacer(1, 0.4*cm))
            elements.append(Paragraph(f"<b>Notes :</b> {session.notes}", styles['Normal']))

        doc.build(elements)
        buffer.seek(0)
        resp = HttpResponse(buffer, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="INV_{session.reference}.pdf"'
        return resp
