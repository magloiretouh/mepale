from django.contrib import admin
from .models import (
    Fournisseur, StockArticle, MouvementStock,
    DemandeAchat, LigneDemandeAchat,
    BonCommande, LigneBonCommande, ConditionTarifaire, ConditionAppliqueeBC,
    Reception, LigneReception, RetourFournisseur, LigneRetour,
    EvaluationFournisseur,
    FactureFournisseur, PaiementFacture, LigneFactureFournisseur, EcheanceFacture,
    InventaireSession, LigneInventaire,
)


@admin.register(Fournisseur)
class FournisseurAdmin(admin.ModelAdmin):
    list_display  = ['code', 'raison_sociale', 'categorie', 'telephone', 'actif', 'blackliste']
    list_filter   = ['categorie', 'actif', 'blackliste']
    search_fields = ['code', 'raison_sociale', 'nif']


@admin.register(StockArticle)
class StockArticleAdmin(admin.ModelAdmin):
    list_display  = ['article', 'quantite_disponible', 'quantite_reservee',
                     'seuil_alerte', 'stock_min', 'stock_securite', 'derniere_maj']
    search_fields = ['article__designation', 'article__code']
    readonly_fields = ['derniere_maj', 'quantite_disponible', 'quantite_reservee']


@admin.register(MouvementStock)
class MouvementStockAdmin(admin.ModelAdmin):
    list_display  = ['article', 'type', 'quantite', 'sens', 'reference_doc', 'date_mouvement']
    list_filter   = ['type', 'sens']
    readonly_fields = ['date_mouvement']


class LigneDAInline(admin.TabularInline):
    model = LigneDemandeAchat
    extra = 1


@admin.register(DemandeAchat)
class DemandeAchatAdmin(admin.ModelAdmin):
    list_display  = ['reference', 'statut', 'urgence', 'demandeur', 'date_creation']
    list_filter   = ['statut', 'urgence']
    inlines       = [LigneDAInline]
    readonly_fields = ['reference', 'date_creation']


@admin.register(ConditionTarifaire)
class ConditionTarifaireAdmin(admin.ModelAdmin):
    list_display   = ['nom', 'mode_calcul', 'type_effet', 'niveau', 'valeur_defaut', 'actif', 'date_modif']
    list_filter    = ['mode_calcul', 'type_effet', 'niveau', 'actif']
    search_fields  = ['nom', 'description']
    readonly_fields = ['date_creation', 'date_modif']


class LigneBCInline(admin.TabularInline):
    model = LigneBonCommande
    extra = 1


class ConditionAppliqueeBCInline(admin.TabularInline):
    model  = ConditionAppliqueeBC
    extra  = 0
    fields = ['condition', 'ordre', 'valeur', 'nom_snapshot', 'mode_calcul_snapshot', 'type_effet_snapshot']
    readonly_fields = ['nom_snapshot', 'mode_calcul_snapshot', 'type_effet_snapshot']


@admin.register(BonCommande)
class BonCommandeAdmin(admin.ModelAdmin):
    list_display  = ['reference', 'fournisseur', 'statut', 'version', 'montant_ttc', 'date_commande']
    list_filter   = ['statut']
    inlines       = [LigneBCInline, ConditionAppliqueeBCInline]
    readonly_fields = ['reference', 'version', 'montant_ht', 'montant_ttc', 'date_creation']


class LigneRecepInline(admin.TabularInline):
    model           = LigneReception
    extra           = 1
    fields          = [
        'ligne_bc', 'quantite_recue', 'numero_lot_fournisseur',
        'date_peremption', 'conforme', 'motif_non_conformite', 'lot_cree',
    ]
    readonly_fields = ['lot_cree']


@admin.register(Reception)
class ReceptionAdmin(admin.ModelAdmin):
    list_display    = ['reference', 'bon_commande', 'statut', 'numero_bl_fournisseur', 'date_reception']
    list_filter     = ['statut']
    search_fields   = ['reference', 'numero_bl_fournisseur', 'bon_commande__reference']
    inlines         = [LigneRecepInline]
    readonly_fields = ['reference', 'date_creation']


class LigneRetourInline(admin.TabularInline):
    model  = LigneRetour
    extra  = 1
    fields = ['ligne_reception', 'quantite_retournee']


@admin.register(RetourFournisseur)
class RetourFournisseurAdmin(admin.ModelAdmin):
    list_display    = ['reference', 'fournisseur', 'reception', 'statut', 'date_retour', 'cree_par']
    list_filter     = ['statut', 'fournisseur']
    search_fields   = ['reference', 'fournisseur__raison_sociale', 'reception__reference']
    inlines         = [LigneRetourInline]
    readonly_fields = ['reference', 'fournisseur', 'cree_par', 'date_creation', 'date_modif']


@admin.register(EvaluationFournisseur)
class EvaluationFournisseurAdmin(admin.ModelAdmin):
    list_display    = ['fournisseur', 'note_qualite', 'note_delai', 'note_prix',
                       'evaluateur', 'date_evaluation']
    list_filter     = ['fournisseur']
    readonly_fields = ['date_evaluation']


class PaiementInline(admin.TabularInline):
    model           = PaiementFacture
    extra           = 0
    fields          = ['montant', 'date_paiement', 'mode_paiement', 'reference_paiement', 'piece_jointe', 'annule']
    readonly_fields = ['date_saisie', 'annule']


class LigneFactureInline(admin.TabularInline):
    """F9 — Lignes de facture fournisseur."""
    model   = LigneFactureFournisseur
    extra   = 1
    fields  = ['ligne_bc', 'designation', 'quantite', 'prix_unitaire', 'taux_tva']


class EcheanceInline(admin.TabularInline):
    """F10 — Échéancier multi-échéances."""
    model   = EcheanceFacture
    extra   = 0
    fields  = ['montant', 'date_echeance', 'payee', 'notes']


@admin.register(FactureFournisseur)
class FactureFournisseurAdmin(admin.ModelAdmin):
    list_display    = [
        'reference', 'type_document', 'fournisseur', 'statut',
        'montant_ttc', 'montant_paye', 'date_echeance', 'approuve_par',
    ]
    list_filter     = ['statut', 'type_document', 'fournisseur']
    search_fields   = ['reference', 'ref_fournisseur', 'fournisseur__raison_sociale']
    inlines         = [LigneFactureInline, EcheanceInline, PaiementInline]
    readonly_fields = [
        'reference', 'montant_paye', 'date_creation', 'date_modif',
        'approuve_par', 'date_approbation',
    ]


class LigneInventaireInline(admin.TabularInline):
    model           = LigneInventaire
    extra           = 0
    readonly_fields = ['quantite_theorique', 'valide']


@admin.register(InventaireSession)
class InventaireSessionAdmin(admin.ModelAdmin):
    list_display  = ['reference', 'statut', 'date_debut', 'date_fin', 'cree_par']
    list_filter   = ['statut']
    inlines       = [LigneInventaireInline]
    readonly_fields = ['reference', 'date_debut']
