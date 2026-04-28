"""
MEPALE ERP — Filtres Production (django-filter)
"""

import django_filters
from .models import Article, OrdreFabrication, Lot


class ArticleFilter(django_filters.FilterSet):
    """
    Filtre avancé pour les articles.

    Permet de filtrer par :
      - type    : UUID du TypeArticle (exact match)
      - type_code : code texte du TypeArticle (ex : mp, pf) — compatible avec
                    l'ancienne interface frontend qui envoyait le code string
      - actif
      - capacités métier booléennes
    """
    type       = django_filters.UUIDFilter(field_name='type__id')
    type_code  = django_filters.CharFilter(
        field_name='type__code', lookup_expr='exact',
        label='Code du type article (ex : mp, pf, sf, emballage)',
    )
    actif                = django_filters.BooleanFilter()
    peut_composer_bom    = django_filters.BooleanFilter(field_name='type__peut_composer_bom')
    peut_etre_produit_of = django_filters.BooleanFilter(field_name='type__peut_etre_produit_of')
    peut_etre_achete     = django_filters.BooleanFilter(field_name='type__peut_etre_achete')

    class Meta:
        model  = Article
        fields = ['type', 'type_code', 'actif',
                  'peut_composer_bom', 'peut_etre_produit_of', 'peut_etre_achete']


class OrdreFabricationFilter(django_filters.FilterSet):
    statut          = django_filters.MultipleChoiceFilter(choices=OrdreFabrication.Statut.choices)
    priorite        = django_filters.MultipleChoiceFilter(choices=OrdreFabrication.Priorite.choices)  # P3-C
    date_prevue_min = django_filters.DateFilter(field_name='date_prevue', lookup_expr='gte')
    date_prevue_max = django_filters.DateFilter(field_name='date_prevue', lookup_expr='lte')
    produit         = django_filters.UUIDFilter(field_name='nomenclature__produit_fini__id')

    class Meta:
        model  = OrdreFabrication
        fields = ['statut', 'priorite', 'ligne_prod', 'date_prevue_min', 'date_prevue_max', 'produit']


class LotFilter(django_filters.FilterSet):
    statut              = django_filters.MultipleChoiceFilter(choices=Lot.Statut.choices)
    article             = django_filters.UUIDFilter(field_name='article__id')
    expire_avant        = django_filters.DateFilter(field_name='date_peremption', lookup_expr='lte')
    expire_apres        = django_filters.DateFilter(field_name='date_peremption', lookup_expr='gte')
    non_vides           = django_filters.BooleanFilter(
        field_name='quantite_restante', lookup_expr='gt', label='Lots non vides'
    )

    class Meta:
        model  = Lot
        fields = ['statut', 'article', 'ordre_fabrication']
