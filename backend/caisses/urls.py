"""
MEPALE ERP — URLs Caisses
Base : /api/v1/caisses/
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import (
    CategorieMouvementViewSet,
    CaisseViewSet,
    SessionCaisseViewSet,
    MouvementCaisseViewSet,
    TransfertCaisseViewSet,
    ParametresCaisseView,
)

router = SimpleRouter()
# Ordre important : les routes nommées avant le ViewSet sans préfixe
# (SimpleRouter n'a pas de vue racine API, donc pas de conflit sur ^$)
router.register('categories', CategorieMouvementViewSet, basename='categorie-mouvement')
router.register('sessions',   SessionCaisseViewSet,      basename='session-caisse')
router.register('mouvements', MouvementCaisseViewSet,    basename='mouvement-caisse')
router.register('transferts', TransfertCaisseViewSet,    basename='transfert-caisse')
# CaisseViewSet enregistré en dernier avec prefix vide
# SimpleRouter génère : ^$ (list), ^stats/$ (action), ^{pk}/$ (detail), etc.
# Les routes ci-dessus (categories, sessions...) sont prioritaires car listées en premier.
router.register('', CaisseViewSet, basename='caisse')

urlpatterns = [
    # Routes fixes en premier — avant le router qui a un prefix vide
    # (sinon ^(?P<pk>[^/.]+)/$ du SimpleRouter avalerait 'parametres' comme pk)
    path('parametres/', ParametresCaisseView.as_view(), name='parametres-caisse'),
    path('', include(router.urls)),
]
