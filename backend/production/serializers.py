"""
MEPALE ERP — Serializers Production
"""

from rest_framework import serializers
from .models import (
    TypeArticle, UniteMesure, Article, Nomenclature, LigneNomenclature,
    OrdreFabrication, AffectationEmployeOF, Lot, ConsommationLot,
    Perte, CoutRevient,
)


# ---------------------------------------------------------------------------
# Unités de mesure
# ---------------------------------------------------------------------------

class UniteMesureSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UniteMesure
        fields = '__all__'


# ---------------------------------------------------------------------------
# Types d'articles  (P2-A)
# ---------------------------------------------------------------------------

class TypeArticleSerializer(serializers.ModelSerializer):
    """
    Sérialise un TypeArticle avec ses 3 capacités métier.
    Utilisé en lecture imbriquée dans ArticleSerializer et en CRUD autonome.
    """
    prefixe_effectif = serializers.SerializerMethodField(
        help_text='Préfixe effectif pour la génération des codes articles.'
    )

    class Meta:
        model  = TypeArticle
        fields = [
            'id', 'code', 'libelle', 'prefixe', 'prefixe_effectif',
            'peut_composer_bom', 'peut_etre_produit_of', 'peut_etre_achete',
        ]

    def get_prefixe_effectif(self, obj):
        return obj.get_prefixe_effectif()


# ---------------------------------------------------------------------------
# Articles
# ---------------------------------------------------------------------------

class ArticleSerializer(serializers.ModelSerializer):
    unite_detail        = UniteMesureSerializer(source='unite', read_only=True)
    unite_code          = serializers.CharField(source='unite.code', read_only=True)
    unite_achat_detail  = UniteMesureSerializer(source='unite_achat', read_only=True)
    unite_achat_code    = serializers.SerializerMethodField()

    # P2-A : type comme FK — on expose le détail complet + accès rapide au code/libellé
    type_detail  = TypeArticleSerializer(source='type', read_only=True)
    type_code    = serializers.CharField(source='type.code', read_only=True)
    type_label   = serializers.CharField(source='type.libelle', read_only=True)

    methode_valorisation_label = serializers.CharField(
        source='get_methode_valorisation_display', read_only=True
    )

    # P2-A : capacités métier par type (read-only, dérivées du TypeArticle associé)
    peut_composer_bom    = serializers.ReadOnlyField()
    peut_etre_produit_of = serializers.ReadOnlyField()
    peut_etre_achete     = serializers.ReadOnlyField()

    # True si l'article a au moins un lot disponible ou bloqué
    has_lots = serializers.SerializerMethodField()
    # True si l'article est référencé dans une nomenclature ou un OF
    # → sert à verrouiller le champ "Type" en édition
    has_ofs_ou_bom = serializers.SerializerMethodField()
    # True si au moins une ligne de BC a été (partiellement) réceptionnée
    # → sert à verrouiller le champ "Unité d'achat" en édition
    has_receptions = serializers.SerializerMethodField()

    class Meta:
        model  = Article
        fields = [
            'id', 'code', 'designation',
            # type : ID (writable) + détail imbriqué + accès rapide code/libellé
            'type', 'type_detail', 'type_code', 'type_label',
            'unite', 'unite_detail', 'unite_code',
            'description', 'actif', 'gere_par_lot', 'has_lots',
            'has_ofs_ou_bom', 'has_receptions',
            # P1-A
            'methode_valorisation', 'methode_valorisation_label', 'prix_standard',
            # P2-A
            'peut_composer_bom', 'peut_etre_produit_of', 'peut_etre_achete',
            # P2-C
            'code_barre', 'reference_externe',
            # P2-D
            'duree_vie_jours', 'conditions_stockage',
            # P3-E
            'unite_achat', 'unite_achat_detail', 'unite_achat_code', 'coefficient_conversion',
            'date_creation',
        ]
        read_only_fields = [
            'peut_composer_bom', 'peut_etre_produit_of', 'peut_etre_achete',
        ]

    def get_has_lots(self, obj):
        """L'article a-t-il des lots actifs (disponibles ou bloqués) ?"""
        return obj.lots.filter(statut__in=['disponible', 'bloque']).exists()

    def get_has_ofs_ou_bom(self, obj):
        """
        True si l'article est référencé dans une nomenclature (produit fini ou matière)
        ou dans un OF. Sert à verrouiller le champ Type en édition : changer le type
        d'un article impliqué dans la production invaliderait les flux existants.
        """
        from production.models import Nomenclature, LigneNomenclature
        return (
            Nomenclature.objects.filter(produit_fini=obj).exists()
            or LigneNomenclature.objects.filter(matiere=obj).exists()
        )

    def get_has_receptions(self, obj):
        """
        True si au moins une ligne de BC a été partiellement ou totalement réceptionnée.
        Sert à verrouiller l'unité d'achat en édition : changer l'unité après réception
        fausserait les quantités historiques et le coefficient de conversion.
        """
        from logistique.models import LigneBonCommande
        return LigneBonCommande.objects.filter(
            article=obj,
            quantite_recue__gt=0,
        ).exists()

    def get_unite_achat_code(self, obj):
        """Code de l'unité d'achat, ou code de l'unité de stock si non définie."""
        if obj.unite_achat_id:
            return obj.unite_achat.code
        return obj.unite.code

    def validate(self, data):
        # Empêcher le passage à gere_par_lot=False si des lots actifs existent
        if (
            self.instance is not None
            and 'gere_par_lot' in data
            and data['gere_par_lot'] is False
            and self.instance.gere_par_lot is True
        ):
            if self.instance.lots.filter(statut__in=['disponible', 'bloque']).exists():
                raise serializers.ValidationError({
                    'gere_par_lot': (
                        "Impossible de désactiver la gestion par lot : "
                        "cet article possède des lots actifs (disponibles ou bloqués). "
                        "Épuisez ou archivez tous ses lots avant de modifier ce paramètre."
                    )
                })
        # P3-E : coefficient_conversion doit être > 0 si unite_achat est définie
        unite_achat = data.get('unite_achat', getattr(self.instance, 'unite_achat', None))
        coeff       = data.get('coefficient_conversion',
                               getattr(self.instance, 'coefficient_conversion', 1))
        if unite_achat is not None and (coeff is None or coeff <= 0):
            raise serializers.ValidationError({
                'coefficient_conversion': "Le coefficient de conversion doit être > 0 quand une unité d'achat est définie."
            })
        return data


class ArticleListSerializer(serializers.ModelSerializer):
    """Version allégée pour les listes déroulantes et les champs FK."""
    unite_code           = serializers.CharField(source='unite.code', read_only=True)
    # P2-A : type comme FK
    type_code            = serializers.CharField(source='type.code', read_only=True)
    type_label           = serializers.CharField(source='type.libelle', read_only=True)
    # Capacités exposées même en liste légère (utile pour filtrer les dropdowns BOM)
    peut_composer_bom    = serializers.ReadOnlyField()
    peut_etre_produit_of = serializers.ReadOnlyField()
    peut_etre_achete     = serializers.ReadOnlyField()

    class Meta:
        model  = Article
        fields = [
            'id', 'code', 'designation',
            'type', 'type_code', 'type_label',
            'unite_code', 'gere_par_lot',
            'peut_composer_bom', 'peut_etre_produit_of', 'peut_etre_achete',
            'prix_standard',
        ]


# ---------------------------------------------------------------------------
# Nomenclatures
# ---------------------------------------------------------------------------

class LigneNomenclatureSerializer(serializers.ModelSerializer):
    matiere_detail          = ArticleListSerializer(source='matiere', read_only=True)
    quantite_avec_perte     = serializers.ReadOnlyField()

    class Meta:
        model  = LigneNomenclature
        fields = [
            'id', 'matiere', 'matiere_detail', 'quantite',
            'taux_perte', 'quantite_avec_perte', 'notes',
        ]


class NomenclatureSerializer(serializers.ModelSerializer):
    lignes          = LigneNomenclatureSerializer(many=True, read_only=True)
    produit_detail  = ArticleListSerializer(source='produit_fini', read_only=True)
    cree_par_nom    = serializers.CharField(source='cree_par.nom_complet', read_only=True)
    ordres_count    = serializers.SerializerMethodField()

    def get_ordres_count(self, obj):
        return obj.ordres.count()

    class Meta:
        model  = Nomenclature
        fields = [
            'id', 'produit_fini', 'produit_detail', 'version', 'quantite_base',
            'active', 'notes', 'lignes', 'cree_par', 'cree_par_nom',
            'date_creation', 'date_modif', 'ordres_count',
        ]
        read_only_fields = ['cree_par', 'date_creation', 'date_modif']


class NomenclatureCreateSerializer(serializers.ModelSerializer):
    """Création et modification avec lignes imbriquées."""
    lignes = LigneNomenclatureSerializer(many=True)

    class Meta:
        model  = Nomenclature
        fields = ['produit_fini', 'version', 'quantite_base', 'active', 'notes', 'lignes']

    def create(self, validated_data):
        lignes_data = validated_data.pop('lignes')
        validated_data['cree_par'] = self.context['request'].user
        nomenclature = Nomenclature.objects.create(**validated_data)
        for ligne in lignes_data:
            LigneNomenclature.objects.create(nomenclature=nomenclature, **ligne)
        return nomenclature

    def update(self, instance, validated_data):
        # None = absent du payload (PATCH partiel) ; [] = envoyé vide intentionnellement
        lignes_data = validated_data.pop('lignes', None)
        # Mise à jour des champs d'en-tête
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # Remplacement des lignes UNIQUEMENT si le champ a été explicitement fourni
        if lignes_data is not None:
            instance.lignes.all().delete()
            for ligne in lignes_data:
                LigneNomenclature.objects.create(nomenclature=instance, **ligne)
        return instance


# ---------------------------------------------------------------------------
# Ordres de Fabrication
# ---------------------------------------------------------------------------

class AffectationSerializer(serializers.ModelSerializer):
    employe_nom = serializers.CharField(source='employe.nom_complet', read_only=True)

    class Meta:
        model  = AffectationEmployeOF
        fields = ['id', 'employe', 'employe_nom', 'role_prod']


class OrdreFabricationListSerializer(serializers.ModelSerializer):
    """Version légère pour les listes."""
    produit_designation = serializers.CharField(
        source='nomenclature.produit_fini.designation', read_only=True
    )
    statut_label    = serializers.CharField(source='get_statut_display', read_only=True)
    priorite_label  = serializers.CharField(source='get_priorite_display', read_only=True)
    rendement       = serializers.ReadOnlyField()
    est_en_retard   = serializers.ReadOnlyField()

    class Meta:
        model  = OrdreFabrication
        fields = [
            'id', 'reference', 'produit_designation', 'quantite_prevue',
            'quantite_produite', 'statut', 'statut_label', 'date_prevue',
            'date_debut', 'ligne_prod', 'rendement', 'est_en_retard',
            'priorite', 'priorite_label', 'sequence',  # P3-C
        ]


class OrdreFabricationSerializer(serializers.ModelSerializer):
    """Détail complet."""
    nomenclature_detail = NomenclatureSerializer(source='nomenclature', read_only=True)
    statut_label        = serializers.CharField(source='get_statut_display', read_only=True)
    priorite_label      = serializers.CharField(source='get_priorite_display', read_only=True)
    affectations        = AffectationSerializer(many=True, read_only=True)
    rendement           = serializers.ReadOnlyField()
    est_en_retard       = serializers.ReadOnlyField()
    cree_par_nom        = serializers.CharField(source='cree_par.nom_complet', read_only=True)

    class Meta:
        model  = OrdreFabrication
        fields = [
            'id', 'reference', 'nomenclature', 'nomenclature_detail',
            'quantite_prevue', 'quantite_produite', 'statut', 'statut_label',
            'date_prevue', 'date_debut', 'date_fin', 'ligne_prod', 'notes',
            'affectations', 'rendement', 'est_en_retard',
            'priorite', 'priorite_label', 'sequence',             # P3-C
            'seuil_rendement', 'seuil_perte',
            'cree_par', 'cree_par_nom', 'date_creation', 'date_modif',
        ]
        read_only_fields = ['cree_par', 'date_creation', 'date_modif', 'reference']


# ---------------------------------------------------------------------------
# Lots
# ---------------------------------------------------------------------------

class LotSerializer(serializers.ModelSerializer):
    article_detail           = ArticleListSerializer(source='article', read_only=True)
    statut_label             = serializers.CharField(source='get_statut_display', read_only=True)
    jours_avant_peremption   = serializers.ReadOnlyField()
    est_proche_peremption    = serializers.ReadOnlyField()

    class Meta:
        model  = Lot
        fields = [
            'id', 'numero_lot', 'article', 'article_detail',
            'date_fabrication', 'date_peremption',
            'quantite_initiale', 'quantite_restante', 'cout_unitaire',
            'statut', 'statut_label', 'ordre_fabrication',
            'jours_avant_peremption', 'est_proche_peremption',
            'notes', 'date_creation',
        ]
        read_only_fields = ['date_creation']


class ConsommationLotSerializer(serializers.ModelSerializer):
    lot_mp_numero = serializers.CharField(source='lot_mp.numero_lot', read_only=True)
    lot_pf_numero = serializers.CharField(source='lot_pf.numero_lot', read_only=True)

    class Meta:
        model  = ConsommationLot
        fields = [
            'id', 'of', 'lot_mp', 'lot_mp_numero',
            'lot_pf', 'lot_pf_numero', 'quantite', 'date_consommation',
        ]


# ---------------------------------------------------------------------------
# Pertes
# ---------------------------------------------------------------------------

class PerteSerializer(serializers.ModelSerializer):
    article_designation = serializers.CharField(source='article.designation', read_only=True)
    type_label          = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model  = Perte
        fields = [
            'id', 'of', 'article', 'article_designation',
            'type', 'type_label', 'quantite', 'motif', 'date_saisie',
        ]
        read_only_fields = ['date_saisie', 'saisie_par']


# ---------------------------------------------------------------------------
# Coût de revient
# ---------------------------------------------------------------------------

class CoutRevientSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CoutRevient
        fields = [
            'id', 'of',
            'cout_matieres', 'cout_main_oeuvre', 'cout_charges',
            'cout_total', 'cout_unitaire', 'cout_standard',
            # P3-B : Variance Analysis
            'ecart_rendement', 'ecart_cout',
            'date_calcul',
        ]
        read_only_fields = ['cout_total', 'cout_unitaire', 'ecart_rendement', 'ecart_cout', 'date_calcul']
