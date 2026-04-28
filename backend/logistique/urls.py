"""
MEPALE ERP — URLs Logistique
Base : /api/v1/logistique/
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    FournisseurViewSet,
    ContactFournisseurViewSet,
    FournisseurArticleViewSet,
    ContratFournisseurViewSet,
    EvaluationFournisseurViewSet,
    StockArticleViewSet,
    MouvementStockViewSet,
    DemandeAchatViewSet,
    BonCommandeViewSet,
    LigneBonCommandeViewSet,
    ConditionTarifaireViewSet,
    ConditionAppliqueeBCViewSet,
    ReceptionViewSet,
    RetourFournisseurViewSet,
    FactureFournisseurViewSet,
    InventaireSessionViewSet,
)

router = DefaultRouter()
router.register('fournisseurs',          FournisseurViewSet,          basename='fournisseur')
router.register('contacts-fournisseur',  ContactFournisseurViewSet,   basename='contact-fournisseur')
router.register('articles-fournisseur',  FournisseurArticleViewSet,   basename='article-fournisseur')
router.register('contrats-fournisseur',  ContratFournisseurViewSet,   basename='contrat-fournisseur')
router.register('evaluations',           EvaluationFournisseurViewSet, basename='evaluation')
router.register('stock',                 StockArticleViewSet,          basename='stock')
router.register('mouvements',            MouvementStockViewSet,        basename='mouvement-stock')
router.register('demandes-achat',        DemandeAchatViewSet,          basename='demande-achat')
router.register('bons-commande',         BonCommandeViewSet,           basename='bon-commande')
router.register('lignes-bc',             LigneBonCommandeViewSet,      basename='ligne-bc')
router.register('conditions-tarifaires', ConditionTarifaireViewSet,    basename='condition-tarifaire')
router.register('conditions-bc',         ConditionAppliqueeBCViewSet,  basename='condition-bc')
router.register('receptions',            ReceptionViewSet,             basename='reception')
router.register('retours-fournisseur',   RetourFournisseurViewSet,     basename='retour-fournisseur')
router.register('factures',              FactureFournisseurViewSet,    basename='facture')
router.register('inventaires',           InventaireSessionViewSet,     basename='inventaire')

urlpatterns = [
    path('', include(router.urls)),
]
