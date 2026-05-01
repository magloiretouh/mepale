"""
MEPALE ERP — Views Commercial (Vente)
ViewSets : CategorieClient, Client, Devis, CommandeClient,
           BonLivraison, FactureVente, RetourClient.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import viewsets
from rest_framework.viewsets import ModelViewSet
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from authentication.permissions import IsAdminOrDirecteur, IsCommercialStaff

from .models import (
    CategorieClient, Client, ContactClient,
    Devis, LigneDevis,
    CommandeClient, LigneCommandeClient,
    BonLivraison, LigneBL,
    FactureVente, LigneFactureVente, ReglementClient,
    RetourClient,
)
from .serializers import (
    CategorieClientSerializer,
    ContactClientSerializer, ContactClientCreateSerializer, ContactClientUpdateSerializer,
    ClientListSerializer, ClientSerializer, ClientCreateSerializer,
    DevisListSerializer, DevisSerializer, DevisCreateSerializer,
    LigneDevisSerializer, LigneDevisStandaloneCreateSerializer, LigneDevisUpdateSerializer,
    CommandeClientListSerializer, CommandeClientSerializer, CommandeClientCreateSerializer,
    BonLivraisonListSerializer, BonLivraisonSerializer, BonLivraisonCreateSerializer,
    FactureVenteListSerializer, FactureVenteSerializer, FactureVenteCreateSerializer,
    AjouterReglementSerializer, ReglementClientSerializer,
    RetourClientListSerializer, RetourClientSerializer, RetourClientCreateSerializer,
)
from .filters import (
    ClientFilter, DevisFilter, CommandeClientFilter,
    BonLivraisonFilter, FactureVenteFilter, RetourClientFilter,
)
from .services import (
    generer_reference_cc,
    verifier_stock_commande,
    creer_mouvement_vente,
    traiter_retour_client,
)


# ---------------------------------------------------------------------------
# CategorieClient — admin uniquement
# ---------------------------------------------------------------------------

class CategorieClientViewSet(ModelViewSet):
    """Catégories client — administration uniquement (IsAdminOrDirecteur)."""
    queryset         = CategorieClient.objects.all().order_by('libelle')
    serializer_class = CategorieClientSerializer
    permission_classes = [IsAdminOrDirecteur]
    filter_backends  = [SearchFilter]
    search_fields    = ['code', 'libelle']


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

class ClientViewSet(ModelViewSet):
    """Clients — CRUD + actions suspendre/désactiver/réactiver."""
    permission_classes = [IsCommercialStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = ClientFilter
    search_fields      = ['code', 'raison_sociale', 'email', 'telephone', 'nif']
    ordering_fields    = ['raison_sociale', 'code', 'date_creation']
    ordering           = ['raison_sociale']

    def get_queryset(self):
        return Client.objects.select_related('categorie', 'commercial').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return ClientListSerializer
        if self.action in ['create']:
            return ClientCreateSerializer
        return ClientSerializer

    def perform_create(self, serializer):
        from .services import generer_reference_client
        with transaction.atomic():
            code = generer_reference_client()
            serializer.save(code=code)

    @action(detail=True, methods=['post'], url_path='suspendre')
    def suspendre(self, request, pk=None):
        client = self.get_object()
        if client.statut == Client.Statut.SUSPENDU:
            return Response({'detail': 'Le client est déjà suspendu.'}, status=status.HTTP_400_BAD_REQUEST)
        client.statut = Client.Statut.SUSPENDU
        client.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Client {client.code} suspendu.'})

    @action(detail=True, methods=['post'], url_path='desactiver')
    def desactiver(self, request, pk=None):
        client = self.get_object()
        if client.statut == Client.Statut.INACTIF:
            return Response({'detail': 'Le client est déjà inactif.'}, status=status.HTTP_400_BAD_REQUEST)
        client.statut = Client.Statut.INACTIF
        client.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Client {client.code} désactivé.'})

    @action(detail=True, methods=['post'], url_path='reactiver')
    def reactiver(self, request, pk=None):
        client = self.get_object()
        if client.statut == Client.Statut.ACTIF:
            return Response({'detail': 'Le client est déjà actif.'}, status=status.HTTP_400_BAD_REQUEST)
        client.statut = Client.Statut.ACTIF
        client.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Client {client.code} réactivé.'})


# ---------------------------------------------------------------------------
# Devis
# ---------------------------------------------------------------------------

class DevisViewSet(ModelViewSet):
    """Devis — CRUD + cycle de vie complet."""
    permission_classes = [IsCommercialStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = DevisFilter
    search_fields      = ['reference', 'client__raison_sociale', 'reference_client']
    ordering_fields    = ['date_creation', 'date_validite', 'montant_ht']
    ordering           = ['-date_creation']

    def get_queryset(self):
        return Devis.objects.select_related('client', 'commercial').prefetch_related('lignes__article__unite')

    def get_serializer_class(self):
        if self.action == 'list':
            return DevisListSerializer
        if self.action == 'create':
            return DevisCreateSerializer
        return DevisSerializer

    def perform_create(self, serializer):
        serializer.save(cree_par=self.request.user)

    # ── Actions ────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='envoyer')
    def envoyer(self, request, pk=None):
        devis = self.get_object()
        if devis.statut != Devis.Statut.BROUILLON:
            return Response(
                {'detail': 'Seul un devis en brouillon peut être envoyé.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        devis.statut = Devis.Statut.ENVOYE
        devis.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Devis {devis.reference} marqué comme envoyé.'})

    @action(detail=True, methods=['post'], url_path='accepter')
    def accepter(self, request, pk=None):
        devis = self.get_object()
        if devis.statut not in [Devis.Statut.ENVOYE, Devis.Statut.BROUILLON]:
            return Response(
                {'detail': 'Le devis doit être en brouillon ou envoyé pour être accepté.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        devis.statut = Devis.Statut.ACCEPTE
        devis.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Devis {devis.reference} accepté.'})

    @action(detail=True, methods=['post'], url_path='refuser')
    def refuser(self, request, pk=None):
        devis = self.get_object()
        if devis.statut in [Devis.Statut.ACCEPTE, Devis.Statut.REFUSE]:
            return Response(
                {'detail': 'Ce devis ne peut plus être refusé.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        devis.statut = Devis.Statut.REFUSE
        devis.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Devis {devis.reference} refusé.'})

    @action(detail=True, methods=['post'], url_path='convertir-en-commande')
    def convertir_en_commande(self, request, pk=None):
        """Crée une CommandeClient depuis ce devis (lignes copiées)."""
        devis = self.get_object()
        if devis.statut not in [Devis.Statut.ACCEPTE, Devis.Statut.ENVOYE, Devis.Statut.BROUILLON]:
            return Response(
                {'detail': 'Seul un devis accepté, envoyé ou en brouillon peut être converti.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            cc = CommandeClient.objects.create(
                reference=generer_reference_cc(),
                client=devis.client,
                devis=devis,
                commercial=devis.commercial,
                cree_par=request.user,
            )
            for ligne in devis.lignes.all():
                LigneCommandeClient.objects.create(
                    commande=cc,
                    article=ligne.article,
                    quantite_commandee=ligne.quantite,
                    prix_unitaire=ligne.prix_unitaire,
                    remise_pct=ligne.remise_pct,
                )
            cc.recalculer_montant()
            # Marquer le devis comme accepté si ce n'est pas déjà le cas
            if devis.statut != Devis.Statut.ACCEPTE:
                devis.statut = Devis.Statut.ACCEPTE
                devis.save(update_fields=['statut', 'date_modif'])
        return Response(
            {'detail': f'Commande {cc.reference} créée depuis le devis {devis.reference}.', 'commande_id': str(cc.id)},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='revision')
    def revision(self, request, pk=None):
        """Clone le devis en version+1 avec statut=brouillon."""
        devis = self.get_object()
        from .services import generer_reference_devis
        with transaction.atomic():
            nouvelle_ref = generer_reference_devis()
            nouveau_devis = Devis.objects.create(
                reference=nouvelle_ref,
                client=devis.client,
                commercial=devis.commercial,
                version=devis.version + 1,
                date_devis=timezone.now().date(),
                date_validite=devis.date_validite,
                reference_client=devis.reference_client,
                notes_internes=devis.notes_internes,
                notes_client=devis.notes_client,
                statut=Devis.Statut.BROUILLON,
                cree_par=request.user,
            )
            for ligne in devis.lignes.all():
                LigneDevis.objects.create(
                    devis=nouveau_devis,
                    article=ligne.article,
                    quantite=ligne.quantite,
                    prix_unitaire=ligne.prix_unitaire,
                    remise_pct=ligne.remise_pct,
                )
            nouveau_devis.recalculer_montant()
            devis.statut = Devis.Statut.EXPIRE
            devis.save(update_fields=['statut', 'date_modif'])
        return Response(
            {
                'detail': f'Révision {nouveau_devis.reference} (v{nouveau_devis.version}) créée.',
                'devis_id': str(nouveau_devis.id),
            },
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        devis = self.get_object()
        if devis.statut != Devis.Statut.BROUILLON:
            return Response(
                {'detail': 'Seul un devis en brouillon peut être modifié.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        CHAMPS = {'date_devis', 'date_validite', 'reference_client', 'notes_internes', 'notes_client'}
        data = {k: v for k, v in request.data.items() if k in CHAMPS}
        serializer = DevisSerializer(devis, data=data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            DevisSerializer(
                self.get_queryset().get(pk=devis.pk),
                context={'request': request},
            ).data
        )


# ---------------------------------------------------------------------------
# Ligne Devis
# ---------------------------------------------------------------------------

class LigneDevisViewSet(viewsets.ModelViewSet):
    """Lignes de devis — CRUD restreint aux devis en brouillon."""
    permission_classes = [IsCommercialStaff]
    http_method_names  = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return LigneDevis.objects.select_related('devis', 'article__unite')

    def get_serializer_class(self):
        if self.action == 'create':
            return LigneDevisStandaloneCreateSerializer
        if self.action == 'partial_update':
            return LigneDevisUpdateSerializer
        return LigneDevisSerializer

    def _check_brouillon(self, ligne):
        if ligne.devis.statut != Devis.Statut.BROUILLON:
            return Response(
                {'detail': 'Seules les lignes d\'un devis en brouillon peuvent être modifiées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        devis = serializer.validated_data['devis']
        if devis.statut != Devis.Statut.BROUILLON:
            return Response(
                {'detail': 'Seul un devis en brouillon peut recevoir de nouvelles lignes.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ligne = serializer.save()
        devis.recalculer_montant()
        return Response(LigneDevisSerializer(ligne).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        ligne = self.get_object()
        err = self._check_brouillon(ligne)
        if err:
            return err
        serializer = self.get_serializer(ligne, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        ligne.devis.recalculer_montant()
        return Response(LigneDevisSerializer(ligne).data)

    def destroy(self, request, *args, **kwargs):
        ligne = self.get_object()
        err = self._check_brouillon(ligne)
        if err:
            return err
        devis = ligne.devis
        ligne.delete()
        devis.recalculer_montant()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Commande Client
# ---------------------------------------------------------------------------

class CommandeClientViewSet(ModelViewSet):
    """Commandes client — CRUD + confirmer + annuler."""
    permission_classes = [IsCommercialStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = CommandeClientFilter
    search_fields      = ['reference', 'client__raison_sociale', 'reference_client']
    ordering_fields    = ['date_commande', 'date_creation', 'montant_ht']
    ordering           = ['-date_creation']

    def get_queryset(self):
        return (
            CommandeClient.objects
            .select_related('client', 'commercial', 'devis')
            .prefetch_related('lignes__article__unite')
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return CommandeClientListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return CommandeClientCreateSerializer
        return CommandeClientSerializer

    def perform_create(self, serializer):
        serializer.save(cree_par=self.request.user)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.statut != CommandeClient.Statut.BROUILLON:
            return Response(
                {'detail': "Seule une commande en brouillon peut être modifiée."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='confirmer')
    def confirmer(self, request, pk=None):
        """
        Confirme la commande et effectue la vérification stock.
        Retourne warnings si stock insuffisant (création toujours autorisée).
        """
        cc = self.get_object()
        if cc.statut != CommandeClient.Statut.BROUILLON:
            return Response(
                {'detail': f"Impossible de confirmer une commande en statut '{cc.get_statut_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Vérification stock
        stock_info = verifier_stock_commande(cc)

        with transaction.atomic():
            # Snapshot stock disponible sur chaque ligne
            for ligne_info in stock_info['lignes']:
                LigneCommandeClient.objects.filter(id=ligne_info['ligne_id']).update(
                    stock_disponible_confirmation=ligne_info['quantite_disponible']
                )
            cc.statut = CommandeClient.Statut.CONFIRMEE
            cc.stock_warning = not stock_info['tout_disponible']
            cc.save(update_fields=['statut', 'stock_warning', 'date_modif'])

        return Response({
            'detail': 'Commande confirmée.',
            'tout_disponible': stock_info['tout_disponible'],
            'warnings': [l for l in stock_info['lignes'] if not l['suffisant']],
        })

    @action(detail=True, methods=['post'], url_path='annuler')
    def annuler(self, request, pk=None):
        cc = self.get_object()
        # Bloquer si des BL ont déjà été expédiés
        if cc.bons_livraison.filter(statut__in=[BonLivraison.Statut.EXPEDIE, BonLivraison.Statut.LIVRE]).exists():
            return Response(
                {'detail': 'Impossible d\'annuler : des bons de livraison ont déjà été expédiés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if cc.statut == CommandeClient.Statut.ANNULEE:
            return Response({'detail': 'La commande est déjà annulée.'}, status=status.HTTP_400_BAD_REQUEST)
        cc.statut = CommandeClient.Statut.ANNULEE
        cc.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Commande {cc.reference} annulée.'})


# ---------------------------------------------------------------------------
# Bon de Livraison
# ---------------------------------------------------------------------------

class BonLivraisonViewSet(ModelViewSet):
    """Bons de livraison — CRUD + expédier + confirmer livraison."""
    permission_classes = [IsCommercialStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = BonLivraisonFilter
    search_fields      = ['reference', 'commande__reference', 'commande__client__raison_sociale']
    ordering_fields    = ['date_preparation', 'date_creation']
    ordering           = ['-date_creation']

    def get_queryset(self):
        return (
            BonLivraison.objects
            .select_related('commande__client')
            .prefetch_related('lignes__article__unite', 'lignes__lot')
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return BonLivraisonListSerializer
        if self.action == 'create':
            return BonLivraisonCreateSerializer
        return BonLivraisonSerializer

    def perform_create(self, serializer):
        serializer.save(cree_par=self.request.user)

    @action(detail=True, methods=['post'], url_path='expedier')
    def expedier(self, request, pk=None):
        """
        Expédie le BL : crée les mouvements de stock et décrémente les quantités.
        Bloqué si stock insuffisant pour une des lignes.
        """
        bl = self.get_object()
        if bl.statut != BonLivraison.Statut.PREPARE:
            return Response(
                {'detail': f"Impossible d'expédier un BL en statut '{bl.get_statut_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            with transaction.atomic():
                for ligne in bl.lignes.select_related('article__unite', 'lot').all():
                    mouvement = creer_mouvement_vente(ligne, request.user)
                    ligne.mouvement = mouvement
                    ligne.save(update_fields=['mouvement'])

                    # Mettre à jour quantite_livree sur la ligne de commande
                    ligne_cc = ligne.ligne_commande
                    ligne_cc.quantite_livree += ligne.quantite
                    ligne_cc.save(update_fields=['quantite_livree'])

                # Mettre à jour le statut du BL
                bl.statut = BonLivraison.Statut.EXPEDIE
                bl.date_expedition = timezone.now().date()
                bl.save(update_fields=['statut', 'date_expedition', 'date_modif'])

                # Mettre à jour le statut de la commande
                commande = bl.commande
                lignes_cc = list(commande.lignes.all())
                total_cmd = sum(l.quantite_commandee for l in lignes_cc)
                total_livree = sum(l.quantite_livree for l in lignes_cc)

                if total_livree >= total_cmd:
                    commande.statut = CommandeClient.Statut.LIVREE
                elif total_livree > 0:
                    commande.statut = CommandeClient.Statut.PARTIELLEMENT_LIVREE
                else:
                    commande.statut = CommandeClient.Statut.EN_COURS_LIVRAISON
                commande.save(update_fields=['statut', 'date_modif'])

        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': f'Bon de livraison {bl.reference} expédié. Stock mis à jour.'})

    @action(detail=True, methods=['post'], url_path='confirmer-livraison')
    def confirmer_livraison(self, request, pk=None):
        """Confirme la réception par le client (expédié → livré)."""
        bl = self.get_object()
        if bl.statut != BonLivraison.Statut.EXPEDIE:
            return Response(
                {'detail': "Seul un BL expédié peut être confirmé comme livré."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bl.statut = BonLivraison.Statut.LIVRE
        bl.date_livraison_confirmee = timezone.now().date()
        bl.save(update_fields=['statut', 'date_livraison_confirmee', 'date_modif'])
        return Response({'detail': f'Livraison {bl.reference} confirmée.'})

    @action(detail=True, methods=['post'], url_path='facturer')
    def facturer(self, request, pk=None):
        """Crée une FactureVente depuis ce BL en copiant les lignes livrées."""
        from datetime import date, timedelta
        from .services import generer_reference_facture_vente

        bl = self.get_object()
        if bl.statut not in [BonLivraison.Statut.EXPEDIE, BonLivraison.Statut.LIVRE]:
            return Response(
                {'detail': "Seul un BL expédié ou livré peut être facturé."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not bl.lignes.exists():
            return Response(
                {'detail': "Le BL ne contient aucune ligne à facturer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client = bl.commande.client
        date_echeance_raw = request.data.get('date_echeance')
        if date_echeance_raw:
            try:
                date_echeance = date.fromisoformat(date_echeance_raw)
            except ValueError:
                return Response({'detail': 'Format de date invalide (attendu : YYYY-MM-DD).'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            date_echeance = date.today() + timedelta(days=client.delai_paiement or 30)

        notes = request.data.get('notes', '')

        # Vérification : total déjà facturé + montant de ce BL ≤ montant commande
        from decimal import Decimal as D
        from django.db.models import Sum as DSum
        lignes_bl = list(bl.lignes.select_related('ligne_commande__article'))
        montant_bl = sum(
            l.ligne_commande.prix_unitaire * l.quantite * (1 - l.ligne_commande.remise_pct / 100)
            for l in lignes_bl
        )
        deja_facture = FactureVente.objects.filter(
            commande=bl.commande,
        ).exclude(statut=FactureVente.Statut.ANNULEE).aggregate(
            total=DSum('montant_ht')
        )['total'] or D('0')

        plafond = bl.commande.montant_ht
        if deja_facture + montant_bl > plafond:
            disponible = plafond - deja_facture
            return Response(
                {
                    'detail': (
                        f"Impossible de facturer : le montant de ce BL ({montant_bl:.0f} FCFA) "
                        f"dépasserait le montant de la commande ({plafond:.0f} FCFA). "
                        f"Déjà facturé : {deja_facture:.0f} FCFA — disponible : {disponible:.0f} FCFA."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            facture = FactureVente.objects.create(
                reference=generer_reference_facture_vente(),
                client=client,
                commande=bl.commande,
                date_echeance=date_echeance,
                notes=notes,
                cree_par=request.user,
            )
            for ligne in lignes_bl:
                lcc = ligne.ligne_commande
                LigneFactureVente.objects.create(
                    facture=facture,
                    article=lcc.article,
                    designation=lcc.article.designation,
                    quantite=ligne.quantite,
                    prix_unitaire=lcc.prix_unitaire,
                    remise_pct=lcc.remise_pct,
                )

        return Response(
            {
                'detail': f'Facture {facture.reference} créée depuis le BL {bl.reference}.',
                'facture_id': str(facture.id),
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Facture Vente
# ---------------------------------------------------------------------------

class FactureVenteViewSet(ModelViewSet):
    """Factures vente — CRUD + émettre + annuler + ajouter règlement."""
    permission_classes = [IsCommercialStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = FactureVenteFilter
    search_fields      = ['reference', 'client__raison_sociale']
    ordering_fields    = ['date_facture', 'date_echeance', 'montant_ht', 'date_creation']
    ordering           = ['-date_facture']

    def get_queryset(self):
        return (
            FactureVente.objects
            .select_related('client', 'commande')
            .prefetch_related('lignes__article', 'reglements')
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return FactureVenteListSerializer
        if self.action == 'create':
            return FactureVenteCreateSerializer
        return FactureVenteSerializer

    def perform_create(self, serializer):
        serializer.save(cree_par=self.request.user)

    @action(detail=True, methods=['post'], url_path='emettre')
    def emettre(self, request, pk=None):
        facture = self.get_object()
        if facture.statut != FactureVente.Statut.BROUILLON:
            return Response(
                {'detail': 'Seule une facture en brouillon peut être émise.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if facture.montant_ht <= 0:
            return Response(
                {'detail': 'La facture doit avoir un montant supérieur à 0.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        facture.statut = FactureVente.Statut.EMISE
        facture.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Facture {facture.reference} émise.'})

    @action(detail=True, methods=['post'], url_path='annuler')
    def annuler(self, request, pk=None):
        facture = self.get_object()
        if facture.statut == FactureVente.Statut.ANNULEE:
            return Response({'detail': 'La facture est déjà annulée.'}, status=status.HTTP_400_BAD_REQUEST)
        if facture.statut == FactureVente.Statut.PAYEE:
            return Response(
                {'detail': 'Une facture payée ne peut pas être annulée directement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        facture.statut = FactureVente.Statut.ANNULEE
        facture.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Facture {facture.reference} annulée.'})

    @action(detail=True, methods=['post'], url_path='ajouter-reglement')
    def ajouter_reglement(self, request, pk=None):
        """Ajoute un règlement et recalcule automatiquement le statut de la facture."""
        facture = self.get_object()
        if facture.statut not in [FactureVente.Statut.EMISE, FactureVente.Statut.PARTIELLEMENT_PAYEE]:
            return Response(
                {'detail': f"Impossible d'ajouter un règlement à une facture en statut '{facture.get_statut_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AjouterReglementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        montant_restant = facture.montant_ht - facture.montant_regle
        if d['montant'] > montant_restant:
            return Response(
                {'detail': f"Le montant ({d['montant']} FCFA) dépasse le solde restant ({montant_restant} FCFA)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            reglement = ReglementClient.objects.create(
                facture=facture,
                date_reglement=d['date_reglement'],
                montant=d['montant'],
                mode_paiement=d['mode_paiement'],
                reference_paiement=d.get('reference_paiement', ''),
                notes=d.get('notes', ''),
                saisi_par=request.user,
            )
            # recalculer_reglement() est appelé dans save() du ReglementClient
            facture.refresh_from_db()

        from comptabilite.utils.accounting_auto import create_auto_entry
        create_auto_entry(
            type          = 'income',
            label         = f"Règlement facture {facture.reference} — {facture.client.raison_sociale}",
            amount        = reglement.montant,
            date          = reglement.date_reglement,
            category_name = 'Ventes de produits finis',
            ref_type      = 'reglement_client',
            ref_id        = reglement.id,
        )

        return Response(
            {
                'detail': f'Règlement de {reglement.montant} FCFA enregistré.',
                'statut': facture.statut,
                'montant_regle': facture.montant_regle,
                'montant_restant': facture.montant_restant,
                'reglement': ReglementClientSerializer(reglement).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Retour Client
# ---------------------------------------------------------------------------

class RetourClientViewSet(ModelViewSet):
    """Retours client — CRUD + approuver + recevoir + traiter."""
    permission_classes = [IsCommercialStaff]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = RetourClientFilter
    search_fields      = ['reference', 'client__raison_sociale', 'motif']
    ordering_fields    = ['date_demande', 'date_creation']
    ordering           = ['-date_creation']

    def get_queryset(self):
        return (
            RetourClient.objects
            .select_related('client', 'commande', 'facture')
            .prefetch_related('lignes__article', 'lignes__lot')
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return RetourClientListSerializer
        if self.action == 'create':
            return RetourClientCreateSerializer
        return RetourClientSerializer

    def perform_create(self, serializer):
        serializer.save(cree_par=self.request.user)

    @action(detail=True, methods=['post'], url_path='approuver')
    def approuver(self, request, pk=None):
        retour = self.get_object()
        if retour.statut != RetourClient.Statut.DEMANDE:
            return Response(
                {'detail': 'Seul un retour en demande peut être approuvé.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        retour.statut = RetourClient.Statut.APPROUVE
        retour.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Retour {retour.reference} approuvé.'})

    @action(detail=True, methods=['post'], url_path='recevoir')
    def recevoir(self, request, pk=None):
        retour = self.get_object()
        if retour.statut != RetourClient.Statut.APPROUVE:
            return Response(
                {'detail': 'Seul un retour approuvé peut être reçu.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        retour.statut = RetourClient.Statut.RECU
        retour.save(update_fields=['statut', 'date_modif'])
        return Response({'detail': f'Marchandise du retour {retour.reference} reçue.'})

    @action(detail=True, methods=['post'], url_path='traiter')
    def traiter(self, request, pk=None):
        """
        Traite le retour :
        - Lignes REMISE_EN_STOCK → mouvement stock entrant
        - Autres actions → log seulement
        """
        retour = self.get_object()
        if retour.statut != RetourClient.Statut.RECU:
            return Response(
                {'detail': 'Seul un retour en état "reçu" peut être traité.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            mouvements = traiter_retour_client(retour, request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'detail': f'Retour {retour.reference} traité. {len(mouvements)} mouvement(s) de stock créé(s).',
        })


# ---------------------------------------------------------------------------
# ContactClient
# ---------------------------------------------------------------------------

class ContactClientViewSet(ModelViewSet):
    """Contacts client — CRUD complet, filtre ?client=<uuid>."""
    permission_classes = [IsCommercialStaff]
    http_method_names  = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = ContactClient.objects.select_related('client')
        client_id = self.request.query_params.get('client')
        if client_id:
            qs = qs.filter(client_id=client_id)
        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return ContactClientCreateSerializer
        if self.action == 'partial_update':
            return ContactClientUpdateSerializer
        return ContactClientSerializer

    def _ensure_single_principal(self, contact):
        """Si ce contact est principal, retirer le flag des autres contacts du même client."""
        if contact.principal:
            ContactClient.objects.filter(
                client=contact.client, principal=True
            ).exclude(pk=contact.pk).update(principal=False)

    def perform_create(self, serializer):
        contact = serializer.save()
        self._ensure_single_principal(contact)

    def perform_update(self, serializer):
        contact = serializer.save()
        self._ensure_single_principal(contact)
