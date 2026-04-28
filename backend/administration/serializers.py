from rest_framework import serializers

from .models import ParametresEntreprise


class ParametresEntrepriseSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model  = ParametresEntreprise
        fields = [
            'id', 'nom', 'slogan', 'logo', 'logo_url',
            'adresse', 'ville', 'pays',
            'ninea', 'telephone', 'telephone2',
            'email', 'site_web',
        ]
        extra_kwargs = {
            'logo': {'write_only': True, 'required': False},
        }

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.logo.url) if request else obj.logo.url
        return None
