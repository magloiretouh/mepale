"""
MEPALE ERP — Views Caisses
ViewSets : CategorieMouvement, Caisse, SessionCaisse,
           MouvementCaisse, TransfertCaisse.
Vue singleton : ParametresCaisse.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from authentication.permissions import IsAdminOrDirecteur, IsCaissierStaff

from .filters import (
    CategorieMouvementFilter, SessionCaisseFilter,
    MouvementCaisseFilter, TransfertCaisseFilter,
)
from .models import (
    CategorieMouvement, Caisse, SessionCaisse,
    MouvementCaisse, TransfertCaisse, ParametresCaisse,
)
from .serializers import (
    CategorieMouvementSerializer,
    CaisseListSerializer, CaisseSerializer, CaisseCreateSerializer,
    SessionCaisseListSerializer, SessionCaisseSerializer,
    OuvrirSessionSerializer, FermerSessionSerializer,
    MouvementCaisseListSerializer, MouvementCaisseSerializer, MouvementCaisseCreateSerializer,
    RejeterMouvementSerializer,
    TransfertCaisseListSerializer, TransfertCaisseSerializer, TransfertCaisseCreateSerializer,
    ParametresCaisseSerializer,
)
from .services import approuver_mouvement


# ---------------------------------------------------------------------------
# CategorieMouvement
# ---------------------------------------------------------------------------

class CategorieMouvementViewSet(ModelViewSet):
    """
    Catégories de mouvement — lecture : IsCaissierStaff, écriture : IsAdminOrDirecteur.
    Suppression bloquée si is_system=True ou mouvements existants.
    """
    filterset_class = CategorieMouvementFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields   = ['nom', 'code']
    ordering_fields = ['type', 'ordre', 'nom']
    ordering        = ['type', 'ordre', 'nom']

    def get_queryset(self):
        return CategorieMouvement.objects.all()

    def get_serializer_class(self):
        return CategorieMouvementSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrDirecteur()]
        return [IsCaissierStaff()]

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.is_system:
            return Response(
                {'detail': 'Les catégories système ne peuvent pas être supprimées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if obj.mouvements.exists():
            return Response(
                {'detail': 'Impossible de supprimer une catégorie liée à des mouvements. Désactivez-la à la place.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


# ---------------------------------------------------------------------------
# Caisse
# ---------------------------------------------------------------------------

class CaisseViewSet(ModelViewSet):
    """
    Caisses — CRUD.
    Actions : ouvrir-session, fermer-session, session-courante, stats.
    """
    permission_classes = [IsCaissierStaff]
    filter_backends    = [SearchFilter, OrderingFilter]
    search_fields      = ['nom']
    ordering_fields    = ['nom', 'solde_actuel']
    ordering           = ['nom']

    def get_queryset(self):
        return Caisse.objects.select_related('responsable').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return CaisseListSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return CaisseCreateSerializer
        return CaisseSerializer

    # ── Ouverture de session ────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='ouvrir-session')
    def ouvrir_session(self, request, pk=None):
        caisse = self.get_object()

        if not caisse.actif:
            return Response(
                {'detail': 'Cette caisse est inactive.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if caisse.session_ouverte:
            return Response(
                {'detail': 'Cette caisse a déjà une session ouverte.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OuvrirSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        solde_fourni = serializer.validated_data.get('solde_ouverture')

        if solde_fourni is not None:
            solde_ouverture = solde_fourni
        else:
            params = ParametresCaisse.get()
            if params.report_automatique_solde:
                derniere = (
                    caisse.sessions
                    .filter(statut=SessionCaisse.Statut.FERMEE)
                    .order_by('-date_fermeture')
                    .first()
                )
                if derniere and derniere.solde_fermeture_reel is not None:
                    solde_ouverture = derniere.solde_fermeture_reel
                else:
                    solde_ouverture = caisse.solde_actuel
            else:
                return Response(
                    {'detail': "Le solde d'ouverture est requis (report automatique désactivé)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        session = SessionCaisse.objects.create(
            caisse=caisse,
            solde_ouverture=solde_ouverture,
            ouvert_par=request.user,
        )

        return Response(
            SessionCaisseSerializer(session).data,
            status=status.HTTP_201_CREATED,
        )

    # ── Fermeture de session ────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='fermer-session')
    def fermer_session(self, request, pk=None):
        caisse  = self.get_object()
        session = caisse.session_ouverte

        if not session:
            return Response(
                {'detail': 'Aucune session ouverte pour cette caisse.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = FermerSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        solde_theorique = session.solde_fermeture_theorique
        solde_reel      = data['solde_fermeture_reel']

        session.solde_fermeture_reel = solde_reel
        session.ecart                = solde_theorique - solde_reel
        session.statut               = SessionCaisse.Statut.FERMEE
        session.date_fermeture       = timezone.now()
        session.ferme_par            = request.user
        session.notes_cloture        = data.get('notes_cloture', '')
        session.save()

        return Response(SessionCaisseSerializer(session).data)

    # ── Session courante ────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='session-courante')
    def session_courante(self, request, pk=None):
        session = self.get_object().session_ouverte
        if not session:
            return Response(
                {'detail': 'Aucune session ouverte.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(SessionCaisseSerializer(session).data)

    # ── Stats dashboard ─────────────────────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """Dashboard : solde total, alertes plafond, mouvements en attente."""
        from django.db.models import Sum

        caisses       = Caisse.objects.filter(actif=True).select_related('responsable')
        total_solde   = caisses.aggregate(total=Sum('solde_actuel'))['total'] or 0
        nb_en_attente = MouvementCaisse.objects.filter(
            statut=MouvementCaisse.Statut.EN_ATTENTE,
        ).count()

        alertes_plafond = [
            {
                'id': str(c.id),
                'nom': c.nom,
                'solde_actuel': c.solde_actuel,
                'plafond_alerte': c.plafond_alerte,
            }
            for c in caisses if c.alerte_plafond
        ]

        return Response({
            'nb_caisses_actives': caisses.count(),
            'total_solde':        total_solde,
            'nb_en_attente':      nb_en_attente,
            'alertes_plafond':    alertes_plafond,
        })


# ---------------------------------------------------------------------------
# SessionCaisse (lecture seule)
# ---------------------------------------------------------------------------

class SessionCaisseViewSet(ReadOnlyModelViewSet):
    """
    Sessions de caisse — lecture seule.
    Ouverture/fermeture via CaisseViewSet.
    """
    permission_classes = [IsCaissierStaff]
    filterset_class    = SessionCaisseFilter
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    ordering_fields    = ['date_ouverture', 'date_fermeture']
    ordering           = ['-date_ouverture']

    def get_queryset(self):
        return SessionCaisse.objects.select_related(
            'caisse', 'ouvert_par', 'ferme_par',
        ).all()

    def get_serializer_class(self):
        if self.action == 'list':
            return SessionCaisseListSerializer
        return SessionCaisseSerializer


# ---------------------------------------------------------------------------
# MouvementCaisse
# ---------------------------------------------------------------------------

class MouvementCaisseViewSet(ModelViewSet):
    """
    Mouvements de caisse — création + lecture + suppression (si en_attente).
    Actions : approuver, rejeter, en-attente.
    """
    permission_classes = [IsCaissierStaff]
    filterset_class    = MouvementCaisseFilter
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields      = ['libelle']
    ordering_fields    = ['created_at', 'montant']
    ordering           = ['-created_at']
    http_method_names  = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        return MouvementCaisse.objects.select_related(
            'session__caisse', 'categorie', 'created_by', 'approuve_par',
        ).all()

    def get_serializer_class(self):
        if self.action == 'list':
            return MouvementCaisseListSerializer
        if self.action == 'create':
            return MouvementCaisseCreateSerializer
        return MouvementCaisseSerializer

    def destroy(self, request, *args, **kwargs):
        mvt = self.get_object()
        if mvt.statut != MouvementCaisse.Statut.EN_ATTENTE:
            return Response(
                {'detail': 'Seuls les mouvements en attente peuvent être supprimés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='approuver')
    def approuver(self, request, pk=None):
        mvt = self.get_object()
        try:
            approuver_mouvement(mvt, request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Si mouvement lié à un transfert : vérifier si les deux sont maintenant approuvés
        if mvt.transfert:
            transfert = mvt.transfert
            if all(
                m.statut == MouvementCaisse.Statut.APPROUVE
                for m in transfert.mouvements.all()
            ):
                transfert.statut = TransfertCaisse.Statut.APPROUVE
                transfert.save(update_fields=['statut'])

        return Response(MouvementCaisseSerializer(mvt).data)

    @action(detail=True, methods=['post'], url_path='rejeter')
    def rejeter(self, request, pk=None):
        mvt = self.get_object()
        if mvt.statut != MouvementCaisse.Statut.EN_ATTENTE:
            return Response(
                {'detail': "Ce mouvement n'est pas en attente d'approbation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RejeterMouvementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mvt.statut      = MouvementCaisse.Statut.REJETE
        mvt.motif_rejet = serializer.validated_data['motif_rejet']
        mvt.save(update_fields=['statut', 'motif_rejet'])

        # Propager le rejet au transfert et à l'autre mouvement
        if mvt.transfert:
            transfert = mvt.transfert
            transfert.statut = TransfertCaisse.Statut.REJETE
            transfert.save(update_fields=['statut'])
            for m in transfert.mouvements.filter(
                statut=MouvementCaisse.Statut.EN_ATTENTE,
            ).exclude(pk=mvt.pk):
                m.statut      = MouvementCaisse.Statut.REJETE
                m.motif_rejet = f"Transfert rejeté : {mvt.motif_rejet}"
                m.save(update_fields=['statut', 'motif_rejet'])

        return Response(MouvementCaisseSerializer(mvt).data)

    @action(detail=False, methods=['get'], url_path='en-attente')
    def en_attente(self, request):
        """Liste tous les mouvements en attente d'approbation."""
        qs   = self.get_queryset().filter(statut=MouvementCaisse.Statut.EN_ATTENTE)
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(
                MouvementCaisseListSerializer(page, many=True).data,
            )
        return Response(MouvementCaisseListSerializer(qs, many=True).data)


# ---------------------------------------------------------------------------
# TransfertCaisse
# ---------------------------------------------------------------------------

class TransfertCaisseViewSet(ModelViewSet):
    """
    Transferts inter-caisses — création + lecture.
    Pas de modification ni suppression après création.
    """
    permission_classes = [IsCaissierStaff]
    filterset_class    = TransfertCaisseFilter
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    ordering_fields    = ['created_at', 'montant']
    ordering           = ['-created_at']
    http_method_names  = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        return TransfertCaisse.objects.select_related(
            'caisse_source', 'caisse_destination', 'created_by',
        ).prefetch_related('mouvements').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return TransfertCaisseListSerializer
        if self.action == 'create':
            return TransfertCaisseCreateSerializer
        return TransfertCaisseSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transfert = serializer.save()
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            TransfertCaisseSerializer(transfert).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# ParametresCaisse (singleton)
# ---------------------------------------------------------------------------

class ParametresCaisseView(RetrieveUpdateAPIView):
    """
    Paramètres globaux des caisses — singleton GET/PATCH.
    Lecture : IsCaissierStaff | Écriture : IsAdminOrDirecteur.
    """
    serializer_class = ParametresCaisseSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsAdminOrDirecteur()]
        return [IsCaissierStaff()]

    def get_object(self):
        return ParametresCaisse.get()
