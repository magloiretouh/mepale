"""
MEPALE ERP — Filters Comptabilité
"""

import django_filters
from .models import EcritureComptable


class EcritureFilter(django_filters.FilterSet):
    date_from   = django_filters.DateFilter(field_name='date', lookup_expr='gte')
    date_to     = django_filters.DateFilter(field_name='date', lookup_expr='lte')
    type        = django_filters.ChoiceFilter(choices=EcritureComptable.Type.choices)
    category_id = django_filters.UUIDFilter(field_name='category__id')

    class Meta:
        model  = EcritureComptable
        fields = ['date_from', 'date_to', 'type', 'category_id']
