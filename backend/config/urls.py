"""
MEPALE ERP — Routage principal
Tous les endpoints sous /api/v1/
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

API_V1 = 'api/v1/'

urlpatterns = [
    # Interface admin Django
    path('admin/', admin.site.urls),

    # ── Authentification & Utilisateurs ──
    path(f'{API_V1}auth/', include('authentication.urls')),

    # ── Modules métier ──
    path(f'{API_V1}production/',   include('production.urls')),
    path(f'{API_V1}logistique/',   include('logistique.urls')),
    path(f'{API_V1}commercial/',   include('commercial.urls')),
    path(f'{API_V1}rh/',           include('rh.urls')),
    path(f'{API_V1}caisses/',      include('caisses.urls')),
    path(f'{API_V1}comptabilite/',   include('comptabilite.urls')),
    path(f'{API_V1}administration/', include('administration.urls')),
]

# Fichiers media en développement
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
