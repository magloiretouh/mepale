from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Utilisateur


@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin):
    list_display  = ['username', 'nom_complet', 'role', 'email', 'is_active']
    list_filter   = ['role', 'is_active']
    search_fields = ['username', 'nom', 'prenom', 'email']
    ordering      = ['nom', 'prenom']

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Informations personnelles', {'fields': ('nom', 'prenom', 'email', 'telephone', 'avatar')}),
        ('Rôle & Permissions', {'fields': ('role', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Dates', {'fields': ('last_login', 'date_creation')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'nom', 'prenom', 'role', 'password1', 'password2'),
        }),
    )
    readonly_fields = ['date_creation', 'last_login']
