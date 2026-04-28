"""
MEPALE ERP — URLs Comptabilité
Base : /api/v1/comptabilite/

Routes :
  GET/POST        /categories/
  GET/PUT/DELETE  /categories/<id>/
  GET/POST        /entries/
  GET/PUT/DELETE  /entries/<id>/
  GET             /entries/export/excel/
  GET             /report/
  GET             /report/export/pdf/
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import (
    CategorieComptableViewSet,
    EcritureComptableViewSet,
    ReportView,
    ReportExportPdfView,
)

router = SimpleRouter()
router.register('categories', CategorieComptableViewSet, basename='categorie-comptable')
router.register('entries',    EcritureComptableViewSet,  basename='ecriture-comptable')

urlpatterns = [
    # Routes fixes en premier (avant le router pour éviter les conflits)
    path('report/export/pdf/', ReportExportPdfView.as_view(), name='report-export-pdf'),
    path('report/',            ReportView.as_view(),          name='report'),
    path('',                   include(router.urls)),
]
