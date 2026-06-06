from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated

from authentication.permissions import IsAdminOrDirecteur
from .models import ParametresEntreprise
from .serializers import ParametresEntrepriseSerializer


class ParametresEntrepriseView(RetrieveUpdateAPIView):
    """
    GET  /api/v1/administration/parametres-entreprise/  → retourne la config (tout staff)
    PATCH                                               → met à jour (admin/directeur seulement)
    """
    serializer_class  = ParametresEntrepriseSerializer
    parser_classes    = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsAdminOrDirecteur()]
        return [IsAuthenticated()]

    def get_object(self):
        return ParametresEntreprise.get_instance()
