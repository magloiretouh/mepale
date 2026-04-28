from django.contrib import admin

from .models import ParametresEntreprise


@admin.register(ParametresEntreprise)
class ParametresEntrepriseAdmin(admin.ModelAdmin):
    list_display = ['nom', 'email', 'telephone', 'ninea']
