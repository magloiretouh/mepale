"""
MEPALE ERP — URLs Authentication
Base : /api/v1/auth/
"""

from django.urls import path
from .views import (
    LoginView,
    LogoutView,
    RefreshTokenView,
    profil_view,
    update_profil_view,
    change_password_view,
    UtilisateurListCreateView,
    UtilisateurListeAffectationView,
    UtilisateurDetailView,
    UtilisateurToggleView,
    UtilisateurResetPasswordView,
)

urlpatterns = [
    # ── Tokens JWT ──
    path('login/',          LoginView.as_view(),        name='auth-login'),
    path('logout/',         LogoutView.as_view(),        name='auth-logout'),
    path('refresh/',        RefreshTokenView.as_view(),  name='auth-refresh'),

    # ── Profil utilisateur connecté ──
    path('me/',             profil_view,                 name='auth-me'),
    path('me/update/',      update_profil_view,          name='auth-me-update'),
    path('change-password/', change_password_view,       name='auth-change-password'),

    # ── Gestion utilisateurs (admin) ──
    path('utilisateurs/liste-affectation/',            UtilisateurListeAffectationView.as_view(), name='utilisateurs-liste-affectation'),
    path('utilisateurs/',                              UtilisateurListCreateView.as_view(),    name='utilisateurs-list'),
    path('utilisateurs/<uuid:pk>/',                    UtilisateurDetailView.as_view(),        name='utilisateurs-detail'),
    path('utilisateurs/<uuid:pk>/toggle/',             UtilisateurToggleView.as_view(),        name='utilisateurs-toggle'),
    path('utilisateurs/<uuid:pk>/reset-password/',     UtilisateurResetPasswordView.as_view(), name='utilisateurs-reset-password'),
]
