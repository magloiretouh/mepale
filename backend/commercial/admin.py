from django.contrib import admin
from .models import (
    CategorieClient, Client, ContactClient,
    Devis, LigneDevis,
    CommandeClient, LigneCommandeClient,
    BonLivraison, LigneBL,
    FactureVente, LigneFactureVente, ReglementClient,
    RetourClient, LigneRetourClient,
)


# ---------------------------------------------------------------------------
# Inlines
# ---------------------------------------------------------------------------

class ContactClientInline(admin.TabularInline):
    model  = ContactClient
    extra  = 0
    fields = ['nom', 'poste', 'telephone', 'email', 'principal']


class LigneDevisInline(admin.TabularInline):
    model  = LigneDevis
    extra  = 0
    fields = ['article', 'quantite', 'prix_unitaire', 'remise_pct']
    readonly_fields = ['montant_ht']


class LigneCommandeClientInline(admin.TabularInline):
    model  = LigneCommandeClient
    extra  = 0
    fields = ['article', 'quantite_commandee', 'quantite_livree', 'prix_unitaire', 'remise_pct', 'stock_disponible_confirmation']
    readonly_fields = ['quantite_livree', 'stock_disponible_confirmation']


class LigneBLInline(admin.TabularInline):
    model  = LigneBL
    extra  = 0
    fields = ['article', 'lot', 'quantite', 'mouvement']
    readonly_fields = ['mouvement']


class LigneFactureVenteInline(admin.TabularInline):
    model  = LigneFactureVente
    extra  = 0
    fields = ['article', 'designation', 'quantite', 'prix_unitaire', 'remise_pct']


class ReglementClientInline(admin.TabularInline):
    model  = ReglementClient
    extra  = 0
    fields = ['date_reglement', 'montant', 'mode_paiement', 'reference_paiement']
    readonly_fields = ['date_creation']


class LigneRetourClientInline(admin.TabularInline):
    model  = LigneRetourClient
    extra  = 0
    fields = ['article', 'lot', 'quantite', 'etat', 'action']


# ---------------------------------------------------------------------------
# ModelAdmin
# ---------------------------------------------------------------------------

@admin.register(CategorieClient)
class CategorieClientAdmin(admin.ModelAdmin):
    list_display  = ['code', 'libelle', 'actif']
    list_filter   = ['actif']
    search_fields = ['code', 'libelle']


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display   = ['code', 'raison_sociale', 'type', 'categorie', 'telephone', 'statut', 'commercial']
    list_filter    = ['statut', 'type', 'categorie']
    search_fields  = ['code', 'raison_sociale', 'nif', 'email']
    readonly_fields = ['code', 'date_creation', 'date_modif']
    inlines        = [ContactClientInline]
    fieldsets = (
        ('Identification', {'fields': ('code', 'raison_sociale', 'type', 'categorie', 'secteur_activite')}),
        ('Contact', {'fields': ('telephone', 'email', 'adresse_facturation', 'adresse_livraison')}),
        ('Informations légales', {'fields': ('nif', 'rccm', 'numero_contribuable')}),
        ('Conditions commerciales', {'fields': ('delai_paiement', 'mode_paiement', 'plafond_credit', 'commercial')}),
        ('Statut', {'fields': ('statut', 'actif', 'notes')}),
        ('Dates', {'fields': ('date_creation', 'date_modif')}),
    )


@admin.register(Devis)
class DevisAdmin(admin.ModelAdmin):
    list_display   = ['reference', 'client', 'commercial', 'statut', 'version', 'montant_ht', 'date_validite']
    list_filter    = ['statut']
    search_fields  = ['reference', 'client__raison_sociale']
    readonly_fields = ['reference', 'montant_ht', 'date_creation', 'date_modif']
    inlines        = [LigneDevisInline]


@admin.register(CommandeClient)
class CommandeClientAdmin(admin.ModelAdmin):
    list_display   = ['reference', 'client', 'commercial', 'statut', 'montant_ht', 'stock_warning', 'date_commande']
    list_filter    = ['statut', 'stock_warning']
    search_fields  = ['reference', 'client__raison_sociale', 'reference_client']
    readonly_fields = ['reference', 'montant_ht', 'date_creation', 'date_modif']
    inlines        = [LigneCommandeClientInline]


@admin.register(BonLivraison)
class BonLivraisonAdmin(admin.ModelAdmin):
    list_display   = ['reference', 'commande', 'statut', 'date_preparation', 'date_expedition']
    list_filter    = ['statut']
    search_fields  = ['reference', 'commande__reference']
    readonly_fields = ['reference', 'date_creation', 'date_modif']
    inlines        = [LigneBLInline]


@admin.register(FactureVente)
class FactureVenteAdmin(admin.ModelAdmin):
    list_display   = ['reference', 'client', 'statut', 'montant_ht', 'montant_regle', 'date_echeance']
    list_filter    = ['statut']
    search_fields  = ['reference', 'client__raison_sociale']
    readonly_fields = ['reference', 'montant_ht', 'montant_regle', 'date_creation', 'date_modif']
    inlines        = [LigneFactureVenteInline, ReglementClientInline]


@admin.register(RetourClient)
class RetourClientAdmin(admin.ModelAdmin):
    list_display   = ['reference', 'client', 'statut', 'date_demande']
    list_filter    = ['statut']
    search_fields  = ['reference', 'client__raison_sociale']
    readonly_fields = ['reference', 'date_creation', 'date_modif']
    inlines        = [LigneRetourClientInline]
