"""
MEPALE ERP — URLs Production
Base : /api/v1/production/
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TypeArticleViewSet,
    UniteMesureViewSet,
    ArticleViewSet,
    NomenclatureViewSet,
    OrdreFabricationViewSet,
    LotViewSet,
    PerteViewSet,
    CoutRevientViewSet,
)

router = DefaultRouter()
router.register('types-articles',          TypeArticleViewSet,         basename='type-article')
router.register('unites-mesure',           UniteMesureViewSet,         basename='unite-mesure')
router.register('articles',               ArticleViewSet,              basename='article')
router.register('nomenclatures',          NomenclatureViewSet,         basename='nomenclature')
router.register('ordres-fabrication',     OrdreFabricationViewSet,     basename='of')
router.register('lots',                   LotViewSet,                  basename='lot')
router.register('pertes',                 PerteViewSet,                basename='perte')
router.register('couts-revient',          CoutRevientViewSet,          basename='cout-revient')

urlpatterns = [
    path('', include(router.urls)),
]
