"""
MEPALE ERP — Serializers Commercial (Vente)
Pattern : ListSerializer (léger) / DetailSerializer (complet) / CreateSerializer.
"""

from decimal import Decimal

from rest_framework import serializers
from .models import (
    CategorieClient, Client, ContactClient,
    Devis, LigneDevis,
    CommandeClient, LigneCommandeClient,
    BonLivraison, LigneBL,
    FactureVente, LigneFactureVente, ReglementClient,
    RetourClient, LigneRetourClient,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _employe_nom(obj, field='commercial'):
    emp = getattr(obj, field, None)
    return emp.name if emp else None


# ---------------------------------------------------------------------------
# CategorieClient
# ---------------------------------------------------------------------------

class CategorieClientSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CategorieClient
        fields = ['id', 'code', 'libelle', 'description', 'actif']


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

class ContactClientSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ContactClient
        fields = ['id', 'client', 'nom', 'poste', 'telephone', 'email', 'principal']


class ContactClientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ContactClient
        fields = ['client', 'nom', 'poste', 'telephone', 'email', 'principal']


class ContactClientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ContactClient
        fields = ['nom', 'poste', 'telephone', 'email', 'principal']


class ClientListSerializer(serializers.ModelSerializer):
    categorie_libelle = serializers.CharField(source='categorie.libelle', read_only=True, default=None)
    type_label        = serializers.CharField(source='get_type_display', read_only=True)
    statut_label      = serializers.CharField(source='get_statut_display', read_only=True)
    commercial_nom    = serializers.SerializerMethodField()

    class Meta:
        model  = Client
        fields = [
            'id', 'code', 'raison_sociale', 'type', 'type_label',
            'categorie', 'categorie_libelle', 'telephone', 'email',
            'statut', 'statut_label', 'commercial', 'commercial_nom',
            'date_creation',
        ]

    def get_commercial_nom(self, obj):
        return _employe_nom(obj)


class ClientSerializer(serializers.ModelSerializer):
    categorie_detail  = CategorieClientSerializer(source='categorie', read_only=True)
    type_label        = serializers.CharField(source='get_type_display', read_only=True)
    statut_label      = serializers.CharField(source='get_statut_display', read_only=True)
    mode_paiement_label = serializers.CharField(source='get_mode_paiement_display', read_only=True)
    commercial_nom    = serializers.SerializerMethodField()
    contacts          = ContactClientSerializer(many=True, read_only=True)
    solde_factures    = serializers.ReadOnlyField()

    class Meta:
        model  = Client
        fields = [
            'id', 'code', 'raison_sociale', 'type', 'type_label',
            'categorie', 'categorie_detail',
            'secteur_activite', 'telephone', 'email',
            'adresse_facturation', 'adresse_livraison', 'adresse_livraison_effective',
            'nif', 'rccm', 'numero_contribuable',
            'delai_paiement', 'mode_paiement', 'mode_paiement_label', 'plafond_credit',
            'commercial', 'commercial_nom',
            'statut', 'statut_label', 'notes', 'actif',
            'contacts', 'solde_factures',
            'date_creation', 'date_modif',
        ]
        read_only_fields = ['code', 'date_creation', 'date_modif']

    def get_commercial_nom(self, obj):
        return _employe_nom(obj)


class ClientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Client
        fields = [
            'raison_sociale', 'type', 'categorie', 'secteur_activite',
            'telephone', 'email', 'adresse_facturation', 'adresse_livraison',
            'nif', 'rccm', 'numero_contribuable',
            'delai_paiement', 'mode_paiement', 'plafond_credit',
            'commercial', 'notes',
        ]


# ---------------------------------------------------------------------------
# Devis
# ---------------------------------------------------------------------------

class LigneDevisSerializer(serializers.ModelSerializer):
    article_code        = serializers.CharField(source='article.code', read_only=True)
    article_designation = serializers.CharField(source='article.designation', read_only=True)
    unite_code          = serializers.CharField(source='article.unite.code', read_only=True)
    montant_ht          = serializers.ReadOnlyField()

    class Meta:
        model  = LigneDevis
        fields = [
            'id', 'article', 'article_code', 'article_designation', 'unite_code',
            'quantite', 'prix_unitaire', 'remise_pct', 'montant_ht',
        ]


class LigneDevisCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LigneDevis
        fields = ['article', 'quantite', 'prix_unitaire', 'remise_pct']


class LigneDevisStandaloneCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LigneDevis
        fields = ['devis', 'article', 'quantite', 'prix_unitaire', 'remise_pct']


class LigneDevisUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LigneDevis
        fields = ['quantite', 'prix_unitaire', 'remise_pct']


class DevisListSerializer(serializers.ModelSerializer):
    client_nom     = serializers.CharField(source='client.raison_sociale', read_only=True)
    statut_label   = serializers.CharField(source='get_statut_display', read_only=True)
    commercial_nom = serializers.SerializerMethodField()

    class Meta:
        model  = Devis
        fields = [
            'id', 'reference', 'client', 'client_nom', 'commercial', 'commercial_nom',
            'statut', 'statut_label', 'version', 'montant_ht',
            'date_devis', 'date_validite', 'date_creation',
        ]

    def get_commercial_nom(self, obj):
        return _employe_nom(obj)


class DevisSerializer(serializers.ModelSerializer):
    client_detail  = ClientListSerializer(source='client', read_only=True)
    statut_label   = serializers.CharField(source='get_statut_display', read_only=True)
    commercial_nom = serializers.SerializerMethodField()
    lignes         = LigneDevisSerializer(many=True, read_only=True)

    class Meta:
        model  = Devis
        fields = [
            'id', 'reference', 'client', 'client_detail',
            'commercial', 'commercial_nom',
            'statut', 'statut_label', 'version',
            'date_devis', 'date_validite', 'reference_client',
            'notes_internes', 'notes_client', 'montant_ht',
            'lignes',
            'date_creation', 'date_modif',
        ]
        read_only_fields = ['reference', 'montant_ht', 'date_creation', 'date_modif']

    def get_commercial_nom(self, obj):
        return _employe_nom(obj)


class DevisCreateSerializer(serializers.ModelSerializer):
    lignes = LigneDevisCreateSerializer(many=True)

    class Meta:
        model  = Devis
        fields = [
            'client', 'commercial', 'date_validite', 'reference_client',
            'notes_internes', 'notes_client', 'lignes',
        ]

    def validate_lignes(self, value):
        if not value:
            raise serializers.ValidationError('Le devis doit contenir au moins une ligne.')
        return value

    def create(self, validated_data):
        from django.db import transaction as db_transaction
        from .services import generer_reference_devis
        lignes_data = validated_data.pop('lignes')
        with db_transaction.atomic():
            devis = Devis.objects.create(
                reference=generer_reference_devis(),
                **validated_data,
            )
            for ld in lignes_data:
                LigneDevis.objects.create(devis=devis, **ld)
            devis.recalculer_montant()
        return devis


# ---------------------------------------------------------------------------
# Commande Client
# ---------------------------------------------------------------------------

class LigneCommandeClientSerializer(serializers.ModelSerializer):
    article_code        = serializers.CharField(source='article.code', read_only=True)
    article_designation = serializers.CharField(source='article.designation', read_only=True)
    unite_code          = serializers.CharField(source='article.unite.code', read_only=True)
    quantite_restante   = serializers.ReadOnlyField()
    montant_ht          = serializers.ReadOnlyField()

    class Meta:
        model  = LigneCommandeClient
        fields = [
            'id', 'article', 'article_code', 'article_designation', 'unite_code',
            'quantite_commandee', 'quantite_livree', 'quantite_restante',
            'prix_unitaire', 'remise_pct', 'montant_ht',
            'stock_disponible_confirmation',
        ]


class LigneCommandeClientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LigneCommandeClient
        fields = ['article', 'quantite_commandee', 'prix_unitaire', 'remise_pct']


class CommandeClientListSerializer(serializers.ModelSerializer):
    client_nom     = serializers.CharField(source='client.raison_sociale', read_only=True)
    statut_label   = serializers.CharField(source='get_statut_display', read_only=True)
    commercial_nom = serializers.SerializerMethodField()

    class Meta:
        model  = CommandeClient
        fields = [
            'id', 'reference', 'client', 'client_nom',
            'commercial', 'commercial_nom',
            'statut', 'statut_label', 'montant_ht', 'stock_warning',
            'date_commande', 'date_livraison_souhaitee', 'date_creation',
        ]

    def get_commercial_nom(self, obj):
        return _employe_nom(obj)


class CommandeClientSerializer(serializers.ModelSerializer):
    client_detail  = ClientListSerializer(source='client', read_only=True)
    statut_label   = serializers.CharField(source='get_statut_display', read_only=True)
    commercial_nom = serializers.SerializerMethodField()
    devis_reference = serializers.CharField(source='devis.reference', read_only=True, default=None)
    lignes         = LigneCommandeClientSerializer(many=True, read_only=True)

    class Meta:
        model  = CommandeClient
        fields = [
            'id', 'reference', 'client', 'client_detail',
            'devis', 'devis_reference',
            'commercial', 'commercial_nom',
            'statut', 'statut_label', 'stock_warning',
            'date_commande', 'date_livraison_souhaitee', 'date_livraison_confirmee',
            'reference_client', 'conditions_paiement',
            'notes_internes', 'notes_client', 'montant_ht',
            'lignes',
            'date_creation', 'date_modif',
        ]
        read_only_fields = ['reference', 'montant_ht', 'stock_warning', 'date_creation', 'date_modif']

    def get_commercial_nom(self, obj):
        return _employe_nom(obj)


class CommandeClientCreateSerializer(serializers.ModelSerializer):
    lignes = LigneCommandeClientCreateSerializer(many=True)

    class Meta:
        model  = CommandeClient
        fields = [
            'client', 'devis', 'commercial',
            'date_commande', 'date_livraison_souhaitee',
            'reference_client', 'conditions_paiement',
            'notes_internes', 'notes_client',
            'lignes',
        ]

    def validate_lignes(self, value):
        if not value:
            raise serializers.ValidationError('La commande doit contenir au moins une ligne.')
        return value

    def create(self, validated_data):
        from django.db import transaction as db_transaction
        from .services import generer_reference_cc
        lignes_data = validated_data.pop('lignes')
        with db_transaction.atomic():
            cc = CommandeClient.objects.create(
                reference=generer_reference_cc(),
                **validated_data,
            )
            for ld in lignes_data:
                LigneCommandeClient.objects.create(commande=cc, **ld)
            cc.recalculer_montant()
        return cc


# ---------------------------------------------------------------------------
# Bon de Livraison
# ---------------------------------------------------------------------------

class LigneBLSerializer(serializers.ModelSerializer):
    article_code        = serializers.CharField(source='article.code', read_only=True)
    article_designation = serializers.CharField(source='article.designation', read_only=True)
    unite_code          = serializers.CharField(source='article.unite.code', read_only=True)
    lot_numero          = serializers.CharField(source='lot.numero', read_only=True, default=None)

    class Meta:
        model  = LigneBL
        fields = [
            'id', 'article', 'article_code', 'article_designation', 'unite_code',
            'lot', 'lot_numero', 'quantite',
            'ligne_commande', 'mouvement',
        ]
        read_only_fields = ['mouvement']


class LigneBLCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LigneBL
        fields = ['ligne_commande', 'article', 'lot', 'quantite']


class BonLivraisonListSerializer(serializers.ModelSerializer):
    commande_reference = serializers.CharField(source='commande.reference', read_only=True)
    client_nom         = serializers.CharField(source='commande.client.raison_sociale', read_only=True)
    statut_label       = serializers.CharField(source='get_statut_display', read_only=True)

    class Meta:
        model  = BonLivraison
        fields = [
            'id', 'reference', 'commande', 'commande_reference', 'client_nom',
            'statut', 'statut_label',
            'date_preparation', 'date_expedition', 'date_creation',
        ]


class BonLivraisonSerializer(serializers.ModelSerializer):
    commande_reference = serializers.CharField(source='commande.reference', read_only=True)
    client_nom         = serializers.CharField(source='commande.client.raison_sociale', read_only=True)
    statut_label       = serializers.CharField(source='get_statut_display', read_only=True)
    lignes             = LigneBLSerializer(many=True, read_only=True)

    class Meta:
        model  = BonLivraison
        fields = [
            'id', 'reference', 'commande', 'commande_reference', 'client_nom',
            'statut', 'statut_label',
            'date_preparation', 'date_expedition', 'date_livraison_confirmee',
            'notes', 'lignes',
            'date_creation', 'date_modif',
        ]
        read_only_fields = ['reference', 'date_creation', 'date_modif']


class BonLivraisonCreateSerializer(serializers.ModelSerializer):
    lignes = LigneBLCreateSerializer(many=True)

    class Meta:
        model  = BonLivraison
        fields = ['commande', 'date_preparation', 'notes', 'lignes']

    def validate_lignes(self, value):
        if not value:
            raise serializers.ValidationError('Le bon de livraison doit contenir au moins une ligne.')
        return value

    def validate(self, data):
        commande = data.get('commande')
        if commande and commande.statut not in [
            CommandeClient.Statut.CONFIRMEE,
            CommandeClient.Statut.EN_COURS_LIVRAISON,
            CommandeClient.Statut.PARTIELLEMENT_LIVREE,
        ]:
            raise serializers.ValidationError({
                'commande': f"Impossible de créer un BL pour une commande en statut '{commande.get_statut_display()}'."
            })
        return data

    def create(self, validated_data):
        from django.db import transaction as db_transaction
        from .services import generer_reference_bl
        lignes_data = validated_data.pop('lignes')
        with db_transaction.atomic():
            bl = BonLivraison.objects.create(
                reference=generer_reference_bl(),
                **validated_data,
            )
            for ld in lignes_data:
                LigneBL.objects.create(bon_livraison=bl, **ld)
        return bl


# ---------------------------------------------------------------------------
# Facture Vente
# ---------------------------------------------------------------------------

class LigneFactureVenteSerializer(serializers.ModelSerializer):
    article_code = serializers.CharField(source='article.code', read_only=True, default=None)
    montant_ht   = serializers.ReadOnlyField()

    class Meta:
        model  = LigneFactureVente
        fields = [
            'id', 'article', 'article_code', 'designation',
            'quantite', 'prix_unitaire', 'remise_pct', 'montant_ht',
        ]


class LigneFactureVenteCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LigneFactureVente
        fields = ['article', 'designation', 'quantite', 'prix_unitaire', 'remise_pct']


class ReglementClientSerializer(serializers.ModelSerializer):
    mode_paiement_label = serializers.CharField(source='get_mode_paiement_display', read_only=True)
    saisi_par_nom       = serializers.SerializerMethodField()

    class Meta:
        model  = ReglementClient
        fields = [
            'id', 'facture', 'date_reglement', 'montant',
            'mode_paiement', 'mode_paiement_label', 'reference_paiement',
            'notes', 'saisi_par', 'saisi_par_nom', 'date_creation',
        ]
        read_only_fields = ['date_creation']

    def get_saisi_par_nom(self, obj):
        if obj.saisi_par:
            return obj.saisi_par.nom_complet or obj.saisi_par.username
        return None


class FactureVenteListSerializer(serializers.ModelSerializer):
    client_nom    = serializers.CharField(source='client.raison_sociale', read_only=True)
    statut_label  = serializers.CharField(source='get_statut_display', read_only=True)
    montant_restant = serializers.ReadOnlyField()
    est_en_retard   = serializers.ReadOnlyField()
    jours_retard    = serializers.ReadOnlyField()
    niveau_retard   = serializers.ReadOnlyField()

    class Meta:
        model  = FactureVente
        fields = [
            'id', 'reference', 'client', 'client_nom',
            'statut', 'statut_label',
            'montant_ht', 'montant_regle', 'montant_restant',
            'date_facture', 'date_echeance',
            'est_en_retard', 'jours_retard', 'niveau_retard',
            'date_creation',
        ]


class FactureVenteSerializer(serializers.ModelSerializer):
    client_detail     = ClientListSerializer(source='client', read_only=True)
    commande_reference = serializers.CharField(source='commande.reference', read_only=True, default=None)
    statut_label      = serializers.CharField(source='get_statut_display', read_only=True)
    montant_restant   = serializers.ReadOnlyField()
    est_en_retard     = serializers.ReadOnlyField()
    jours_retard      = serializers.ReadOnlyField()
    niveau_retard     = serializers.ReadOnlyField()
    lignes            = LigneFactureVenteSerializer(many=True, read_only=True)
    reglements        = ReglementClientSerializer(many=True, read_only=True)

    class Meta:
        model  = FactureVente
        fields = [
            'id', 'reference', 'client', 'client_detail',
            'commande', 'commande_reference',
            'statut', 'statut_label',
            'date_facture', 'date_echeance',
            'montant_ht', 'montant_regle', 'montant_restant',
            'est_en_retard', 'jours_retard', 'niveau_retard',
            'notes', 'lignes', 'reglements',
            'date_creation', 'date_modif',
        ]
        read_only_fields = ['reference', 'montant_ht', 'montant_regle', 'date_creation', 'date_modif']


class FactureVenteCreateSerializer(serializers.ModelSerializer):
    lignes = LigneFactureVenteCreateSerializer(many=True)

    class Meta:
        model  = FactureVente
        fields = ['client', 'commande', 'date_echeance', 'notes', 'lignes']

    def validate_lignes(self, value):
        if not value:
            raise serializers.ValidationError('La facture doit contenir au moins une ligne.')
        return value

    def create(self, validated_data):
        from django.db import transaction as db_transaction
        from .services import generer_reference_facture_vente
        lignes_data = validated_data.pop('lignes')
        with db_transaction.atomic():
            facture = FactureVente.objects.create(
                reference=generer_reference_facture_vente(),
                **validated_data,
            )
            for ld in lignes_data:
                LigneFactureVente.objects.create(facture=facture, **ld)
            facture.recalculer_montant()
        return facture


class AjouterReglementSerializer(serializers.Serializer):
    """Serializer dédié à l'action 'ajouter-reglement' sur FactureVente."""
    date_reglement     = serializers.DateField()
    montant            = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    mode_paiement      = serializers.ChoiceField(choices=ReglementClient.ModePaiement.choices)
    reference_paiement = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    notes              = serializers.CharField(required=False, allow_blank=True, default='')


# ---------------------------------------------------------------------------
# Retour Client
# ---------------------------------------------------------------------------

class LigneRetourClientSerializer(serializers.ModelSerializer):
    article_code        = serializers.CharField(source='article.code', read_only=True)
    article_designation = serializers.CharField(source='article.designation', read_only=True)
    etat_label          = serializers.CharField(source='get_etat_display', read_only=True)
    action_label        = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model  = LigneRetourClient
        fields = [
            'id', 'article', 'article_code', 'article_designation',
            'lot', 'quantite', 'etat', 'etat_label', 'action', 'action_label',
        ]


class LigneRetourClientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LigneRetourClient
        fields = ['article', 'lot', 'quantite', 'etat', 'action']


class RetourClientListSerializer(serializers.ModelSerializer):
    client_nom   = serializers.CharField(source='client.raison_sociale', read_only=True)
    statut_label = serializers.CharField(source='get_statut_display', read_only=True)
    motif_court  = serializers.SerializerMethodField()

    class Meta:
        model  = RetourClient
        fields = [
            'id', 'reference', 'client', 'client_nom',
            'statut', 'statut_label', 'date_demande', 'motif_court',
            'date_creation',
        ]

    def get_motif_court(self, obj):
        return obj.motif[:80] + '…' if len(obj.motif) > 80 else obj.motif


class RetourClientSerializer(serializers.ModelSerializer):
    client_detail      = ClientListSerializer(source='client', read_only=True)
    commande_reference = serializers.CharField(source='commande.reference', read_only=True, default=None)
    facture_reference  = serializers.CharField(source='facture.reference', read_only=True, default=None)
    statut_label       = serializers.CharField(source='get_statut_display', read_only=True)
    lignes             = LigneRetourClientSerializer(many=True, read_only=True)

    class Meta:
        model  = RetourClient
        fields = [
            'id', 'reference', 'client', 'client_detail',
            'commande', 'commande_reference',
            'facture', 'facture_reference',
            'statut', 'statut_label', 'date_demande',
            'motif', 'notes', 'lignes',
            'date_creation', 'date_modif',
        ]
        read_only_fields = ['reference', 'date_creation', 'date_modif']


class RetourClientCreateSerializer(serializers.ModelSerializer):
    lignes = LigneRetourClientCreateSerializer(many=True)

    class Meta:
        model  = RetourClient
        fields = ['client', 'commande', 'facture', 'date_demande', 'motif', 'notes', 'lignes']

    def validate_lignes(self, value):
        if not value:
            raise serializers.ValidationError('Le retour doit contenir au moins une ligne.')
        return value

    def create(self, validated_data):
        from django.db import transaction as db_transaction
        from .services import generer_reference_retour_client
        lignes_data = validated_data.pop('lignes')
        with db_transaction.atomic():
            retour = RetourClient.objects.create(
                reference=generer_reference_retour_client(),
                **validated_data,
            )
            for ld in lignes_data:
                LigneRetourClient.objects.create(retour=retour, **ld)
        return retour
