"""
MEPALE ERP — Serializers Authentication
"""

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Utilisateur


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT enrichi avec les infos utilisateur dans le payload."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Données embarquées dans le token (accessibles côté front sans appel API)
        token['username']  = user.username
        token['nom_complet'] = user.nom_complet
        token['role']      = user.role
        token['initiales'] = user.initiales
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Ajouter les infos user dans la réponse login
        data['utilisateur'] = UtilisateurMeSerializer(self.user).data
        return data


class UtilisateurMeSerializer(serializers.ModelSerializer):
    """Profil complet de l'utilisateur connecté."""

    nom_complet = serializers.ReadOnlyField()
    initiales   = serializers.ReadOnlyField()
    role_label  = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model  = Utilisateur
        fields = [
            'id', 'username', 'email', 'nom', 'prenom', 'nom_complet',
            'initiales', 'role', 'role_label', 'telephone', 'avatar',
            'is_active', 'date_creation',
        ]
        read_only_fields = ['id', 'date_creation', 'is_active']


class UtilisateurListSerializer(serializers.ModelSerializer):
    """Version allégée pour les listes."""

    nom_complet = serializers.ReadOnlyField()
    role_label  = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model  = Utilisateur
        fields = ['id', 'username', 'nom_complet', 'role', 'role_label',
                  'email', 'telephone', 'is_active']


class UtilisateurCreateSerializer(serializers.ModelSerializer):
    """Création d'un utilisateur (admin uniquement)."""

    password  = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, label='Confirmation mot de passe')

    class Meta:
        model  = Utilisateur
        fields = ['username', 'email', 'nom', 'prenom', 'role',
                  'telephone', 'password', 'password2']

    def validate(self, data):
        if data['password'] != data.pop('password2'):
            raise serializers.ValidationError(
                {'password2': 'Les mots de passe ne correspondent pas.'}
            )
        return data

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = Utilisateur(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UtilisateurAdminUpdateSerializer(serializers.ModelSerializer):
    """Mise à jour d'un utilisateur par un admin (role, statut inclus)."""

    class Meta:
        model  = Utilisateur
        fields = ['nom', 'prenom', 'email', 'telephone', 'role', 'is_active']


class ChangePasswordSerializer(serializers.Serializer):
    """Changement de mot de passe."""

    ancien_mdp  = serializers.CharField(write_only=True)
    nouveau_mdp = serializers.CharField(write_only=True, min_length=8)
    confirm_mdp = serializers.CharField(write_only=True)

    def validate(self, data):
        if data['nouveau_mdp'] != data['confirm_mdp']:
            raise serializers.ValidationError(
                {'confirm_mdp': 'Les nouveaux mots de passe ne correspondent pas.'}
            )
        return data
