"""
MEPALE ERP — URLs Commercial
Base : /api/v1/commercial/
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CategorieClientViewSet,
    ClientViewSet,
    ContactClientViewSet,
    DevisViewSet,
    LigneDevisViewSet,
    CommandeClientViewSet,
    BonLivraisonViewSet,
    FactureVenteViewSet,
    RetourClientViewSet,
)

router = DefaultRouter()
router.register('categories-client', CategorieClientViewSet, basename='categorie-client')
router.register('clients',           ClientViewSet,           basename='client')
router.register('contacts-client',   ContactClientViewSet,    basename='contact-client')
router.register('devis',             DevisViewSet,            basename='devis')
router.register('lignes-devis',      LigneDevisViewSet,       basename='ligne-devis')
router.register('commandes',         CommandeClientViewSet,   basename='commande-client')
router.register('bons-livraison',    BonLivraisonViewSet,     basename='bon-livraison')
router.register('factures',          FactureVenteViewSet,     basename='facture-vente')
router.register('retours',           RetourClientViewSet,     basename='retour-client')

urlpatterns = [
    path('', include(router.urls)),
]
