"""
MEPALE ERP — Modèle Utilisateur personnalisé
Remplace le User Django standard.
"""

import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models


class UtilisateurManager(BaseUserManager):
    """Manager personnalisé pour le modèle Utilisateur."""

    def create_user(self, username, email, password=None, **extra_fields):
        if not username:
            raise ValueError("Le nom d'utilisateur est obligatoire.")
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', Utilisateur.Role.ADMIN)
        return self.create_user(username, email, password, **extra_fields)


class Utilisateur(AbstractBaseUser, PermissionsMixin):
    """
    Utilisateur MEPALE avec RBAC (rôles métier).
    UUID comme clé primaire pour éviter l'énumération.
    """

    class Role(models.TextChoices):
        ADMIN           = 'admin',           'Administrateur'
        DIRECTEUR       = 'directeur',       'Directeur'
        RESP_PRODUCTION = 'resp_production', 'Responsable Production'
        OPERATEUR       = 'operateur',       'Opérateur de Production'
        RESP_LOGISTIQUE = 'resp_logistique', 'Responsable Logistique'
        MAGASINIER      = 'magasinier',      'Magasinier'
        COMMERCIAL      = 'commercial',      'Commercial'
        RESP_RH         = 'resp_rh',         'Responsable RH'
        COMPTABLE       = 'comptable',       'Comptable'
        CAISSIER        = 'caissier',        'Caissier'

    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username  = models.CharField('Identifiant', max_length=80, unique=True)
    email     = models.EmailField('Email', unique=True)
    nom       = models.CharField('Nom', max_length=100)
    prenom    = models.CharField('Prénom', max_length=100)
    role      = models.CharField(
        'Rôle', max_length=30, choices=Role.choices, default=Role.OPERATEUR
    )
    telephone = models.CharField('Téléphone', max_length=20, blank=True)
    avatar    = models.ImageField('Avatar', upload_to='avatars/', blank=True, null=True)

    is_active = models.BooleanField('Actif', default=True)
    is_staff  = models.BooleanField('Staff Django', default=False)

    date_creation        = models.DateTimeField('Date de création', auto_now_add=True)
    derniere_connexion_ip = models.GenericIPAddressField(
        'Dernière IP', null=True, blank=True
    )

    objects = UtilisateurManager()

    USERNAME_FIELD  = 'username'
    REQUIRED_FIELDS = ['email', 'nom', 'prenom']

    class Meta:
        verbose_name        = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'
        ordering            = ['nom', 'prenom']

    def __str__(self):
        return f"{self.prenom} {self.nom} ({self.get_role_display()})"

    @property
    def nom_complet(self):
        return f"{self.prenom} {self.nom}"

    @property
    def initiales(self):
        if self.prenom and self.nom:
            return f"{self.prenom[0]}{self.nom[0]}".upper()
        return '??'
