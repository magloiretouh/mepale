"""
MEPALE ERP — Vues Authentication
"""

from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Utilisateur
from .serializers import (
    CustomTokenObtainPairSerializer,
    UtilisateurMeSerializer,
    UtilisateurListSerializer,
    UtilisateurCreateSerializer,
    UtilisateurAdminUpdateSerializer,
    ChangePasswordSerializer,
)
from .permissions import IsAdmin, IsAdminOrDirecteur


class LoginView(TokenObtainPairView):
    """
    POST /api/v1/auth/login/
    Retourne access + refresh tokens + profil utilisateur.
    """
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            # Stocker le refresh token dans un cookie HttpOnly
            refresh_token = response.data.get('refresh')
            if refresh_token:
                response.set_cookie(
                    key='refresh_token',
                    value=refresh_token,
                    httponly=True,
                    samesite='Lax',
                    max_age=7 * 24 * 3600,  # 7 jours
                    secure=False,            # True en production (HTTPS)
                )
                del response.data['refresh']  # ne pas exposer dans le body
        return response


class LogoutView(generics.GenericAPIView):
    """
    POST /api/v1/auth/logout/
    Blackliste le refresh token.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass

        response = Response({'detail': 'Déconnexion réussie.'}, status=status.HTTP_200_OK)
        response.delete_cookie('refresh_token')
        return response


class RefreshTokenView(TokenRefreshView):
    """
    POST /api/v1/auth/refresh/
    Utilise le cookie HttpOnly si pas de body.
    """
    def post(self, request, *args, **kwargs):
        # Si pas de refresh dans le body, utiliser le cookie
        if 'refresh' not in request.data:
            cookie_refresh = request.COOKIES.get('refresh_token')
            if cookie_refresh:
                request.data._mutable = True  # type: ignore
                request.data['refresh'] = cookie_refresh
        return super().post(request, *args, **kwargs)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profil_view(request):
    """
    GET /api/v1/auth/me/
    Profil de l'utilisateur connecté.
    """
    serializer = UtilisateurMeSerializer(request.user)
    return Response(serializer.data)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def update_profil_view(request):
    """
    PUT/PATCH /api/v1/auth/me/update/
    Mise à jour du profil (nom, prénom, téléphone, avatar).
    """
    serializer = UtilisateurMeSerializer(
        request.user,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """
    POST /api/v1/auth/change-password/
    """
    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user = request.user
    if not user.check_password(serializer.validated_data['ancien_mdp']):
        return Response(
            {'ancien_mdp': 'Mot de passe actuel incorrect.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(serializer.validated_data['nouveau_mdp'])
    user.save()
    return Response({'detail': 'Mot de passe mis à jour avec succès.'})


class UtilisateurListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/auth/utilisateurs/       — Liste (admin/directeur)
    POST /api/v1/auth/utilisateurs/       — Créer (admin uniquement)
    """

    def get_queryset(self):
        qs = Utilisateur.objects.order_by('nom', 'prenom')
        active_param = self.request.query_params.get('active')
        if active_param == '1':
            qs = qs.filter(is_active=True)
        elif active_param == '0':
            qs = qs.filter(is_active=False)
        return qs

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAdminOrDirecteur()]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return UtilisateurCreateSerializer
        return UtilisateurListSerializer


class UtilisateurListeAffectationView(generics.GenericAPIView):
    """
    GET /api/v1/auth/utilisateurs/liste-affectation/
    Retourne la liste minimale (id + nom_complet) des utilisateurs actifs.
    Accessible à tout staff authentifié (pour les sélecteurs d'affectation).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Utilisateur.objects.filter(is_active=True).order_by('nom', 'prenom')
        data = [{'id': str(u.id), 'nom_complet': u.nom_complet} for u in qs]
        return Response(data)


class UtilisateurDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/auth/utilisateurs/<id>/
    PUT    /api/v1/auth/utilisateurs/<id>/
    DELETE /api/v1/auth/utilisateurs/<id>/  (soft delete — désactivation)
    """
    queryset           = Utilisateur.objects.all()
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return UtilisateurAdminUpdateSerializer
        return UtilisateurListSerializer

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()


class UtilisateurToggleView(generics.GenericAPIView):
    """POST /api/v1/auth/utilisateurs/<id>/toggle/ — Active / désactive."""
    queryset           = Utilisateur.objects.all()
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = self.get_object()
        if user == request.user:
            return Response(
                {'detail': 'Vous ne pouvez pas désactiver votre propre compte.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = not user.is_active
        user.save(update_fields=['is_active'])
        label = 'réactivé' if user.is_active else 'désactivé'
        return Response({'detail': f'Compte {label}.', 'is_active': user.is_active})


class UtilisateurResetPasswordView(generics.GenericAPIView):
    """POST /api/v1/auth/utilisateurs/<id>/reset-password/ — Reset par admin."""
    queryset           = Utilisateur.objects.all()
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = self.get_object()
        nouveau_mdp = request.data.get('nouveau_mdp', '')
        if len(nouveau_mdp) < 8:
            return Response(
                {'detail': 'Le mot de passe doit contenir au moins 8 caractères.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(nouveau_mdp)
        user.save()
        return Response({'detail': 'Mot de passe réinitialisé avec succès.'})
