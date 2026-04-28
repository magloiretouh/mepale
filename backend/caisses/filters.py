"""
MEPALE ERP — Filtres Caisses
"""

import django_filters

from .models import CategorieMouvement, MouvementCaisse, SessionCaisse, TransfertCaisse


class CategorieMouvementFilter(django_filters.FilterSet):
    type      = django_filters.ChoiceFilter(choices=CategorieMouvement.Type.choices)
    actif     = django_filters.BooleanFilter()
    is_system = django_filters.BooleanFilter()

    class Meta:
        model  = CategorieMouvement
        fields = ['type', 'actif', 'is_system']


class SessionCaisseFilter(django_filters.FilterSet):
    caisse = django_filters.UUIDFilter(field_name='caisse__id')
    statut = django_filters.ChoiceFilter(choices=SessionCaisse.Statut.choices)
    date   = django_filters.DateFilter(field_name='date_ouverture', lookup_expr='date')

    class Meta:
        model  = SessionCaisse
        fields = ['caisse', 'statut']


class MouvementCaisseFilter(django_filters.FilterSet):
    session    = django_filters.UUIDFilter(field_name='session__id')
    caisse     = django_filters.UUIDFilter(field_name='session__caisse__id')
    type       = django_filters.ChoiceFilter(choices=MouvementCaisse.Type.choices)
    statut     = django_filters.MultipleChoiceFilter(choices=MouvementCaisse.Statut.choices)
    categorie  = django_filters.UUIDFilter(field_name='categorie__id')
    date_debut = django_filters.DateFilter(field_name='created_at', lookup_expr='date__gte')
    date_fin   = django_filters.DateFilter(field_name='created_at', lookup_expr='date__lte')

    class Meta:
        model  = MouvementCaisse
        fields = ['session', 'caisse', 'type', 'statut', 'categorie']


class TransfertCaisseFilter(django_filters.FilterSet):
    statut             = django_filters.MultipleChoiceFilter(choices=TransfertCaisse.Statut.choices)
    caisse_source      = django_filters.UUIDFilter(field_name='caisse_source__id')
    caisse_destination = django_filters.UUIDFilter(field_name='caisse_destination__id')

    class Meta:
        model  = TransfertCaisse
        fields = ['statut', 'caisse_source', 'caisse_destination']
