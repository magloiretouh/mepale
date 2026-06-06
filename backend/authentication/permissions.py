"""
MEPALE ERP — Permissions RBAC personnalisées
"""

from rest_framework.permissions import BasePermission
from .models import Utilisateur


class IsAdmin(BasePermission):
    """Réservé aux administrateurs."""
    message = "Action réservée aux administrateurs."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == Utilisateur.Role.ADMIN
        )


class IsAdminOrDirecteur(BasePermission):
    """Administrateurs et directeurs."""
    message = "Action réservée aux administrateurs et directeurs."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in [
                Utilisateur.Role.ADMIN,
                Utilisateur.Role.DIRECTEUR,
            ]
        )


class IsProductionStaff(BasePermission):
    """Rôles autorisés à accéder au module Production."""
    ROLES_AUTORISES = [
        Utilisateur.Role.ADMIN,
        Utilisateur.Role.DIRECTEUR,
        Utilisateur.Role.RESP_PRODUCTION,
        Utilisateur.Role.OPERATEUR,
    ]

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.ROLES_AUTORISES
        )


class IsLogistiqueStaff(BasePermission):
    """Rôles autorisés pour la Logistique."""
    ROLES_AUTORISES = [
        Utilisateur.Role.ADMIN,
        Utilisateur.Role.DIRECTEUR,
        Utilisateur.Role.RESP_LOGISTIQUE,
        Utilisateur.Role.MAGASINIER,
    ]

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.ROLES_AUTORISES
        )


class IsLogistiqueManager(BasePermission):
    """Responsables logistique — excluent le magasinier pour les actions sensibles (ex: seuils de stock)."""
    ROLES_AUTORISES = [
        Utilisateur.Role.ADMIN,
        Utilisateur.Role.DIRECTEUR,
        Utilisateur.Role.RESP_LOGISTIQUE,
    ]

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.ROLES_AUTORISES
        )


class IsCommercialStaff(BasePermission):
    """Rôles autorisés pour le Commercial."""
    ROLES_AUTORISES = [
        Utilisateur.Role.ADMIN,
        Utilisateur.Role.DIRECTEUR,
        Utilisateur.Role.COMMERCIAL,
    ]

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.ROLES_AUTORISES
        )


class IsRHStaff(BasePermission):
    """Rôles autorisés pour les RH."""
    ROLES_AUTORISES = [
        Utilisateur.Role.ADMIN,
        Utilisateur.Role.DIRECTEUR,
        Utilisateur.Role.RESP_RH,
    ]

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.ROLES_AUTORISES
        )


class IsCaissierStaff(BasePermission):
    """Rôles autorisés pour les Caisses."""
    ROLES_AUTORISES = [
        Utilisateur.Role.ADMIN,
        Utilisateur.Role.DIRECTEUR,
        Utilisateur.Role.COMPTABLE,
        Utilisateur.Role.CAISSIER,
    ]

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.ROLES_AUTORISES
        )


class IsComptableStaff(BasePermission):
    """Rôles autorisés pour la Comptabilité."""
    ROLES_AUTORISES = [
        Utilisateur.Role.ADMIN,
        Utilisateur.Role.DIRECTEUR,
        Utilisateur.Role.COMPTABLE,
    ]

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.ROLES_AUTORISES
        )


class ReadOnly(BasePermission):
    """Lecture seule pour tous les utilisateurs authentifiés."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.method in ('GET', 'HEAD', 'OPTIONS')
        )
