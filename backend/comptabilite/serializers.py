"""
MEPALE ERP — Serializers Comptabilité
"""

from rest_framework import serializers
from .models import CategorieComptable, EcritureComptable


# ---------------------------------------------------------------------------
# CategorieComptable
# ---------------------------------------------------------------------------

class CategorieComptableSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model            = CategorieComptable
        fields           = ['id', 'name', 'type', 'type_display', 'is_system', 'actif', 'created_at']
        read_only_fields = ['id', 'is_system', 'created_at']


# ---------------------------------------------------------------------------
# EcritureComptable
# ---------------------------------------------------------------------------

class EcritureComptableListSerializer(serializers.ModelSerializer):
    """Léger — utilisé pour la liste."""
    category_name = serializers.SerializerMethodField()
    type_display  = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model  = EcritureComptable
        fields = [
            'id', 'date', 'type', 'type_display',
            'category', 'category_name',
            'label', 'amount', 'source', 'created_at',
        ]

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None


class EcritureComptableSerializer(serializers.ModelSerializer):
    """Complet — utilisé pour create/retrieve/update."""
    category_name = serializers.SerializerMethodField()
    type_display  = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model            = EcritureComptable
        fields           = [
            'id', 'date', 'type', 'type_display',
            'category', 'category_name',
            'label', 'amount', 'notes',
            'source', 'ref_type', 'ref_id',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'source', 'ref_type', 'ref_id', 'created_at', 'updated_at']

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def validate(self, data):
        # Récupère le type et la catégorie (gère les mises à jour partielles)
        entry_type = data.get('type') or (self.instance.type if self.instance else None)
        category   = data.get('category')
        if category is None and self.instance:
            category = self.instance.category

        if category and entry_type and category.type != entry_type:
            raise serializers.ValidationError({
                'category': (
                    f"La catégorie « {category.name} » est de type "
                    f"« {category.get_type_display()} » — incompatible avec "
                    f"le type « {dict(EcritureComptable.Type.choices).get(entry_type, entry_type)} »."
                )
            })
        return data
