"""
MEPALE ERP — Serializers Caisses
"""

from decimal import Decimal
from rest_framework import serializers

from .models import (
    CategorieMouvement, Caisse, SessionCaisse,
    MouvementCaisse, TransfertCaisse, ParametresCaisse,
)


# ---------------------------------------------------------------------------
# CategorieMouvement
# ---------------------------------------------------------------------------

class CategorieMouvementSerializer(serializers.ModelSerializer):

    class Meta:
        model  = CategorieMouvement
        fields = ['id', 'nom', 'code', 'type', 'is_system', 'actif', 'ordre']
        read_only_fields = ['id', 'is_system']

    def validate_code(self, value):
        """Le code est immuable après création."""
        if self.instance and self.instance.code != value:
            raise serializers.ValidationError(
                "Le code interne ne peut pas être modifié après création."
            )
        return value


# ---------------------------------------------------------------------------
# Caisse
# ---------------------------------------------------------------------------

class CaisseListSerializer(serializers.ModelSerializer):
    responsable_nom = serializers.SerializerMethodField()
    session_ouverte = serializers.SerializerMethodField()
    alerte_plafond  = serializers.BooleanField(read_only=True)

    class Meta:
        model  = Caisse
        fields = [
            'id', 'nom', 'responsable', 'responsable_nom',
            'solde_actuel', 'plafond_alerte', 'alerte_plafond',
            'actif', 'session_ouverte',
        ]

    def get_responsable_nom(self, obj):
        if obj.responsable:
            return f"{obj.responsable.prenom} {obj.responsable.nom}"
        return None

    def get_session_ouverte(self, obj):
        s = obj.session_ouverte
        if s:
            return {'id': str(s.id), 'date_ouverture': s.date_ouverture}
        return None


class CaisseSerializer(CaisseListSerializer):
    class Meta(CaisseListSerializer.Meta):
        fields = CaisseListSerializer.Meta.fields + ['created_at']


class CaisseCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Caisse
        fields = ['nom', 'responsable', 'plafond_alerte', 'actif']


# ---------------------------------------------------------------------------
# SessionCaisse
# ---------------------------------------------------------------------------

class SessionCaisseListSerializer(serializers.ModelSerializer):
    caisse_nom                = serializers.CharField(source='caisse.nom', read_only=True)
    ouvert_par_nom            = serializers.SerializerMethodField()
    solde_fermeture_theorique = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )
    nb_mouvements_en_attente  = serializers.IntegerField(read_only=True)

    class Meta:
        model  = SessionCaisse
        fields = [
            'id', 'caisse', 'caisse_nom',
            'date_ouverture', 'date_fermeture',
            'solde_ouverture', 'solde_fermeture_theorique',
            'solde_fermeture_reel', 'ecart',
            'statut', 'ouvert_par', 'ouvert_par_nom',
            'nb_mouvements_en_attente',
        ]

    def get_ouvert_par_nom(self, obj):
        u = obj.ouvert_par
        return f"{u.prenom} {u.nom}" if u else None


class SessionCaisseSerializer(SessionCaisseListSerializer):
    ferme_par_nom = serializers.SerializerMethodField()

    class Meta(SessionCaisseListSerializer.Meta):
        fields = SessionCaisseListSerializer.Meta.fields + [
            'ferme_par', 'ferme_par_nom', 'notes_cloture',
        ]

    def get_ferme_par_nom(self, obj):
        u = obj.ferme_par
        return f"{u.prenom} {u.nom}" if u else None


class OuvrirSessionSerializer(serializers.Serializer):
    solde_ouverture = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False,
        help_text='Laisser vide pour utiliser le report automatique si activé.',
    )


class FermerSessionSerializer(serializers.Serializer):
    solde_fermeture_reel = serializers.DecimalField(max_digits=14, decimal_places=2)
    notes_cloture        = serializers.CharField(required=False, allow_blank=True, default='')


# ---------------------------------------------------------------------------
# MouvementCaisse
# ---------------------------------------------------------------------------

class CategorieMouvementMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CategorieMouvement
        fields = ['id', 'nom', 'code', 'type']


class MouvementCaisseListSerializer(serializers.ModelSerializer):
    categorie_detail = CategorieMouvementMiniSerializer(source='categorie', read_only=True)
    created_by_nom   = serializers.SerializerMethodField()
    approuve_par_nom = serializers.SerializerMethodField()

    class Meta:
        model  = MouvementCaisse
        fields = [
            'id', 'session', 'type', 'categorie', 'categorie_detail',
            'montant', 'libelle', 'statut',
            'approuve_par', 'approuve_par_nom', 'date_approbation',
            'created_by', 'created_by_nom', 'created_at',
            'facture_vente', 'bon_commande', 'ordre_fabrication', 'transfert',
        ]

    def get_created_by_nom(self, obj):
        u = obj.created_by
        return f"{u.prenom} {u.nom}" if u else None

    def get_approuve_par_nom(self, obj):
        u = obj.approuve_par
        return f"{u.prenom} {u.nom}" if u else None


class MouvementCaisseSerializer(MouvementCaisseListSerializer):
    class Meta(MouvementCaisseListSerializer.Meta):
        fields = MouvementCaisseListSerializer.Meta.fields + ['motif_rejet', 'justificatif']


class MouvementCaisseCreateSerializer(serializers.ModelSerializer):

    class Meta:
        model  = MouvementCaisse
        fields = [
            'session', 'categorie', 'montant', 'libelle',
            'justificatif',
            'facture_vente', 'bon_commande', 'ordre_fabrication',
        ]

    def validate_categorie(self, value):
        if value.code in ('transfert_sortie', 'transfert_entree'):
            raise serializers.ValidationError(
                "Cette catégorie est réservée aux transferts inter-caisses."
            )
        if not value.actif:
            raise serializers.ValidationError("Cette catégorie est désactivée.")
        return value

    def validate_session(self, value):
        if value.statut == SessionCaisse.Statut.FERMEE:
            raise serializers.ValidationError(
                "Impossible d'ajouter un mouvement à une session fermée."
            )
        return value

    def validate_montant(self, value):
        if value <= 0:
            raise serializers.ValidationError("Le montant doit être supérieur à zéro.")
        return value

    def validate(self, attrs):
        # Le type est déduit de la catégorie (dénormalisé pour performance)
        attrs['type'] = attrs['categorie'].type
        return attrs

    def create(self, validated_data):
        from .services import creer_et_traiter_mouvement

        user      = self.context['request'].user
        session   = validated_data.pop('session')
        categorie = validated_data.pop('categorie')
        montant   = validated_data.pop('montant')
        libelle   = validated_data.pop('libelle')
        type_mvt  = validated_data.pop('type')

        try:
            return creer_et_traiter_mouvement(
                session=session,
                categorie=categorie,
                montant=montant,
                libelle=libelle,
                type_mvt=type_mvt,
                user=user,
                **validated_data,
            )
        except ValueError as e:
            raise serializers.ValidationError({'detail': str(e)})


class RejeterMouvementSerializer(serializers.Serializer):
    motif_rejet = serializers.CharField(min_length=5)


# ---------------------------------------------------------------------------
# TransfertCaisse
# ---------------------------------------------------------------------------

class TransfertCaisseListSerializer(serializers.ModelSerializer):
    caisse_source_nom      = serializers.CharField(source='caisse_source.nom', read_only=True)
    caisse_destination_nom = serializers.CharField(source='caisse_destination.nom', read_only=True)
    created_by_nom         = serializers.SerializerMethodField()

    class Meta:
        model  = TransfertCaisse
        fields = [
            'id',
            'caisse_source', 'caisse_source_nom',
            'caisse_destination', 'caisse_destination_nom',
            'montant', 'libelle', 'statut',
            'created_by', 'created_by_nom', 'created_at',
        ]

    def get_created_by_nom(self, obj):
        u = obj.created_by
        return f"{u.prenom} {u.nom}" if u else None


class TransfertCaisseSerializer(TransfertCaisseListSerializer):
    mouvements = MouvementCaisseListSerializer(many=True, read_only=True)

    class Meta(TransfertCaisseListSerializer.Meta):
        fields = TransfertCaisseListSerializer.Meta.fields + ['mouvements']


class TransfertCaisseCreateSerializer(serializers.ModelSerializer):

    class Meta:
        model  = TransfertCaisse
        fields = ['caisse_source', 'caisse_destination', 'montant', 'libelle']

    def validate(self, attrs):
        if attrs['caisse_source'] == attrs['caisse_destination']:
            raise serializers.ValidationError(
                "La caisse source et la caisse destination doivent être différentes."
            )
        if attrs['montant'] <= 0:
            raise serializers.ValidationError("Le montant doit être supérieur à zéro.")
        return attrs

    def create(self, validated_data):
        from .services import creer_transfert
        user = self.context['request'].user
        return creer_transfert(
            caisse_source=validated_data['caisse_source'],
            caisse_destination=validated_data['caisse_destination'],
            montant=validated_data['montant'],
            libelle=validated_data['libelle'],
            user=user,
        )


# ---------------------------------------------------------------------------
# ParametresCaisse
# ---------------------------------------------------------------------------

class ParametresCaisseSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ParametresCaisse
        fields = ['seuil_approbation', 'seuil_alerte_solde_max', 'report_automatique_solde']
