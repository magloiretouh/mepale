from django.urls import path

from .views import ParametresEntrepriseView

urlpatterns = [
    path('parametres-entreprise/', ParametresEntrepriseView.as_view(), name='parametres-entreprise'),
]
