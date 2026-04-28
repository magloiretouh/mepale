"""
MEPALE ERP — Filtres Logistique
"""

import django_filters
from .models import Fournisseur, StockArticle, MouvementStock, BonCommande, FactureFournisseur, InventaireSession


class FournisseurFilter(django_filters.FilterSet):
    categorie     = django_filters.MultipleChoiceFilter(choices=Fournisseur.Categorie.choices)
    qualification = django_filters.ChoiceFilter(choices=Fournisseur.Qualification.choices)
    blackliste    = django_filters.BooleanFilter()
    actif         = django_filters.BooleanFilter()

    class Meta:
        model  = Fournisseur
        fields = ['categorie', 'qualification', 'blackliste', 'actif']


class StockFilter(django_filters.FilterSet):
    sous_seuil = django_filters.BooleanFilter(method='filter_sous_seuil', label='Sous seuil')
    article_type = django_filters.CharFilter(field_name='article__type')

    def filter_sous_seuil(self, queryset, name, value):
        if value:
            from django.db.models import F
            return queryset.filter(quantite_disponible__lt=F('seuil_alerte'))
        return queryset

    class Meta:
        model  = StockArticle
        fields = []


class MouvementFilter(django_filters.FilterSet):
    """
    M1 — Filtres enrichis pour les mouvements de stock.
    Remplace filterset_fields = ['article', 'type', 'sens'] par un FilterSet complet.
    """
    article       = django_filters.UUIDFilter(field_name='article__id')
    lot           = django_filters.UUIDFilter(field_name='lot__id')
    type          = django_filters.MultipleChoiceFilter(choices=MouvementStock.Type.choices)
    sens          = django_filters.ChoiceFilter(choices=[(1, 'Entrée'), (-1, 'Sortie')])
    effectue_par  = django_filters.UUIDFilter(field_name='effectue_par__id')
    reference_doc = django_filters.CharFilter(lookup_expr='icontains')

    # M9 — Filtres sur date comptable (prioritaire) et date système
    # Filtre principal : date_comptable si renseignée, sinon date_mouvement
    date_min = django_filters.DateFilter(method='filter_date_min', label='Date min (comptable ou système)')
    date_max = django_filters.DateFilter(method='filter_date_max', label='Date max (comptable ou système)')

    # Filtres directs sur chaque date (pour les rapports comptables stricts)
    date_mouvement_min  = django_filters.DateTimeFilter(field_name='date_mouvement', lookup_expr='date__gte')
    date_mouvement_max  = django_filters.DateTimeFilter(field_name='date_mouvement', lookup_expr='date__lte')
    date_comptable_min  = django_filters.DateFilter(field_name='date_comptable', lookup_expr='gte')
    date_comptable_max  = django_filters.DateFilter(field_name='date_comptable', lookup_expr='lte')

    def filter_date_min(self, queryset, name, value):
        """
        Filtre min sur la date économique :
        - Si date_comptable est renseignée → utilise date_comptable
        - Sinon → utilise date_mouvement
        Combine les deux conditions avec OR.
        """
        from django.db.models import Q
        return queryset.filter(
            Q(date_comptable__isnull=False, date_comptable__gte=value) |
            Q(date_comptable__isnull=True,  date_mouvement__date__gte=value)
        )

    def filter_date_max(self, queryset, name, value):
        from django.db.models import Q
        return queryset.filter(
            Q(date_comptable__isnull=False, date_comptable__lte=value) |
            Q(date_comptable__isnull=True,  date_mouvement__date__lte=value)
        )

    class Meta:
        model  = MouvementStock
        fields = []


class BonCommandeFilter(django_filters.FilterSet):
    statut       = django_filters.MultipleChoiceFilter(choices=BonCommande.Statut.choices)
    fournisseur  = django_filters.UUIDFilter(field_name='fournisseur__id')
    date_min     = django_filters.DateFilter(field_name='date_commande', lookup_expr='gte')
    date_max     = django_filters.DateFilter(field_name='date_commande', lookup_expr='lte')

    class Meta:
        model  = BonCommande
        fields = ['statut', 'fournisseur']


class FactureFilter(django_filters.FilterSet):
    """
    F12 — Filtres enrichis pour les factures fournisseurs.
    Permet de filtrer par statut, type, fournisseur, plages de dates et retard.
    """
    statut         = django_filters.MultipleChoiceFilter(choices=FactureFournisseur.Statut.choices)
    type_document  = django_filters.MultipleChoiceFilter(choices=FactureFournisseur.TypeDocument.choices)
    fournisseur    = django_filters.UUIDFilter(field_name='fournisseur__id')
    bon_commande   = django_filters.UUIDFilter(field_name='bon_commande__id')

    # Plages sur date_facture
    date_facture_min = django_filters.DateFilter(field_name='date_facture', lookup_expr='gte')
    date_facture_max = django_filters.DateFilter(field_name='date_facture', lookup_expr='lte')

    # Plages sur date_echeance
    date_echeance_min = django_filters.DateFilter(field_name='date_echeance', lookup_expr='gte')
    date_echeance_max = django_filters.DateFilter(field_name='date_echeance', lookup_expr='lte')

    # Filtre "en retard" calculé
    en_retard = django_filters.BooleanFilter(method='filter_en_retard', label='En retard')

    def filter_en_retard(self, queryset, name, value):
        from django.utils import timezone
        today = timezone.now().date()
        OUVERTS = ['en_attente', 'partiellement_payee']
        if value:
            return queryset.filter(statut__in=OUVERTS, date_echeance__lt=today)
        return queryset

    class Meta:
        model  = FactureFournisseur
        fields = ['statut', 'type_document', 'fournisseur', 'bon_commande']


class InventaireFilter(django_filters.FilterSet):
    """
    I6 — Filtres enrichis pour les sessions d'inventaire.
    """
    statut         = django_filters.MultipleChoiceFilter(choices=InventaireSession.Statut.choices)
    type_perimetre = django_filters.MultipleChoiceFilter(choices=InventaireSession.TypePerimetre.choices)
    aveugle        = django_filters.BooleanFilter()
    cree_par       = django_filters.UUIDFilter(field_name='cree_par__id')

    # Plages sur date_debut
    date_debut_min = django_filters.DateFilter(field_name='date_debut', lookup_expr='gte')
    date_debut_max = django_filters.DateFilter(field_name='date_debut', lookup_expr='lte')

    # Sessions ayant au moins un écart constaté
    avec_ecarts = django_filters.BooleanFilter(method='filter_avec_ecarts', label='Avec écarts')

    def filter_avec_ecarts(self, queryset, name, value):
        """Filtre les sessions dont au moins une ligne a quantite_comptee != quantite_theorique."""
        from django.db.models import F, Q
        if value:
            return queryset.filter(
                lignes__quantite_comptee__isnull=False,
            ).exclude(
                lignes__quantite_comptee=F('lignes__quantite_theorique'),
            ).distinct()
        return queryset

    class Meta:
        model  = InventaireSession
        fields = []
