"""
MEPALE ERP — Filtres Commercial (Vente)
"""

import django_filters
from django.utils import timezone

from .models import (
    Client, Devis, CommandeClient,
    BonLivraison, FactureVente, RetourClient,
)


class ClientFilter(django_filters.FilterSet):
    statut    = django_filters.MultipleChoiceFilter(choices=Client.Statut.choices)
    type      = django_filters.MultipleChoiceFilter(choices=Client.Type.choices)
    categorie = django_filters.UUIDFilter(field_name='categorie__id')
    commercial = django_filters.NumberFilter(field_name='commercial__id')
    actif     = django_filters.BooleanFilter()

    class Meta:
        model  = Client
        fields = ['statut', 'type', 'categorie', 'commercial', 'actif']


class DevisFilter(django_filters.FilterSet):
    statut           = django_filters.MultipleChoiceFilter(choices=Devis.Statut.choices)
    client           = django_filters.UUIDFilter(field_name='client__id')
    commercial       = django_filters.NumberFilter(field_name='commercial__id')
    date_devis_min   = django_filters.DateFilter(field_name='date_devis', lookup_expr='gte')
    date_devis_max   = django_filters.DateFilter(field_name='date_devis', lookup_expr='lte')
    date_validite_max = django_filters.DateFilter(field_name='date_validite', lookup_expr='lte')

    class Meta:
        model  = Devis
        fields = ['statut', 'client', 'commercial', 'date_devis_min', 'date_devis_max', 'date_validite_max']


class CommandeClientFilter(django_filters.FilterSet):
    statut              = django_filters.MultipleChoiceFilter(choices=CommandeClient.Statut.choices)
    client              = django_filters.UUIDFilter(field_name='client__id')
    commercial          = django_filters.NumberFilter(field_name='commercial__id')
    stock_warning       = django_filters.BooleanFilter()
    date_commande_min   = django_filters.DateFilter(field_name='date_commande', lookup_expr='gte')
    date_commande_max   = django_filters.DateFilter(field_name='date_commande', lookup_expr='lte')

    class Meta:
        model  = CommandeClient
        fields = ['statut', 'client', 'commercial', 'stock_warning', 'date_commande_min', 'date_commande_max']


class BonLivraisonFilter(django_filters.FilterSet):
    statut  = django_filters.MultipleChoiceFilter(choices=BonLivraison.Statut.choices)
    commande = django_filters.UUIDFilter(field_name='commande__id')
    client  = django_filters.UUIDFilter(field_name='commande__client__id')

    class Meta:
        model  = BonLivraison
        fields = ['statut', 'commande', 'client']


class FactureVenteFilter(django_filters.FilterSet):
    statut             = django_filters.MultipleChoiceFilter(choices=FactureVente.Statut.choices)
    client             = django_filters.UUIDFilter(field_name='client__id')
    date_echeance_min  = django_filters.DateFilter(field_name='date_echeance', lookup_expr='gte')
    date_echeance_max  = django_filters.DateFilter(field_name='date_echeance', lookup_expr='lte')
    en_retard          = django_filters.BooleanFilter(method='filter_en_retard')

    class Meta:
        model  = FactureVente
        fields = ['statut', 'client', 'date_echeance_min', 'date_echeance_max', 'en_retard']

    def filter_en_retard(self, queryset, name, value):
        today = timezone.now().date()
        if value:
            # Factures échues et non payées / non annulées
            return queryset.filter(
                date_echeance__lt=today,
            ).exclude(statut__in=[FactureVente.Statut.PAYEE, FactureVente.Statut.ANNULEE, FactureVente.Statut.BROUILLON])
        return queryset


class RetourClientFilter(django_filters.FilterSet):
    statut = django_filters.MultipleChoiceFilter(choices=RetourClient.Statut.choices)
    client = django_filters.UUIDFilter(field_name='client__id')

    class Meta:
        model  = RetourClient
        fields = ['statut', 'client']
