from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated

from .models import ParametresEntreprise
from .serializers import ParametresEntrepriseSerializer


class ParametresEntrepriseView(RetrieveUpdateAPIView):
    """
    GET  /api/v1/administration/parametres-entreprise/  → retourne la config
    PATCH                                               → met à jour (partiel)
    """
    serializer_class   = ParametresEntrepriseSerializer
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]
    http_method_names  = ['get', 'patch', 'head', 'options']

    def get_object(self):
        return ParametresEntreprise.get_instance()
