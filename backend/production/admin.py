from django.contrib import admin
from .models import (
    TypeArticle, UniteMesure, Article, Nomenclature, LigneNomenclature,
    OrdreFabrication, AffectationEmployeOF, Lot, ConsommationLot,
    Perte, CoutRevient,
)


# ---------------------------------------------------------------------------
# Types d'articles  (P2-A — géré depuis l'administration)
# ---------------------------------------------------------------------------

@admin.register(TypeArticle)
class TypeArticleAdmin(admin.ModelAdmin):
    list_display  = [
        'code', 'libelle', 'prefixe',
        'peut_composer_bom', 'peut_etre_produit_of', 'peut_etre_achete',
    ]
    list_editable = ['peut_composer_bom', 'peut_etre_produit_of', 'peut_etre_achete']
    search_fields = ['code', 'libelle']
    ordering      = ['code']
    fieldsets = [
        (None, {
            'fields': ['code', 'libelle', 'prefixe'],
        }),
        ('Capacités métier', {
            'description': (
                'Ces cases à cocher définissent ce qu\'un article de ce type '
                'peut faire dans le système (apparaître en nomenclature BOM, '
                'être produit par un OF, faire l\'objet d\'une commande achat).'
            ),
            'fields': ['peut_composer_bom', 'peut_etre_produit_of', 'peut_etre_achete'],
        }),
    ]


# ---------------------------------------------------------------------------
# Unités de mesure
# ---------------------------------------------------------------------------

@admin.register(UniteMesure)
class UniteMesureAdmin(admin.ModelAdmin):
    list_display  = ['code', 'libelle', 'type']
    list_filter   = ['type']
    search_fields = ['code', 'libelle']


# ---------------------------------------------------------------------------
# Articles
# ---------------------------------------------------------------------------

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display  = ['code', 'designation', 'type', 'unite', 'actif']
    list_filter   = ['type', 'actif']
    search_fields = ['code', 'designation']
    autocomplete_fields = ['type', 'unite', 'unite_achat']


# ---------------------------------------------------------------------------
# Nomenclatures
# ---------------------------------------------------------------------------

class LigneNomenclatureInline(admin.TabularInline):
    model  = LigneNomenclature
    extra  = 1
    fields = ['matiere', 'quantite', 'taux_perte', 'notes']
    autocomplete_fields = ['matiere']


@admin.register(Nomenclature)
class NomenclatureAdmin(admin.ModelAdmin):
    list_display  = ['produit_fini', 'version', 'quantite_base', 'active']
    list_filter   = ['active']
    search_fields = ['produit_fini__designation']
    inlines       = [LigneNomenclatureInline]
    autocomplete_fields = ['produit_fini']


# ---------------------------------------------------------------------------
# Ordres de Fabrication
# ---------------------------------------------------------------------------

@admin.register(OrdreFabrication)
class OrdreFabricationAdmin(admin.ModelAdmin):
    list_display  = ['reference', 'nomenclature', 'quantite_prevue', 'statut', 'date_prevue']
    list_filter   = ['statut']
    search_fields = ['reference', 'nomenclature__produit_fini__designation']
    readonly_fields = ['reference', 'date_creation', 'date_modif']


# ---------------------------------------------------------------------------
# Lots
# ---------------------------------------------------------------------------

@admin.register(Lot)
class LotAdmin(admin.ModelAdmin):
    list_display  = ['numero_lot', 'article', 'quantite_restante', 'statut', 'date_peremption']
    list_filter   = ['statut']
    search_fields = ['numero_lot', 'article__designation']


# ---------------------------------------------------------------------------
# Pertes & Coût de revient
# ---------------------------------------------------------------------------

@admin.register(Perte)
class PerteAdmin(admin.ModelAdmin):
    list_display  = ['of', 'article', 'type', 'quantite', 'date_saisie']
    list_filter   = ['type']


@admin.register(CoutRevient)
class CoutRevientAdmin(admin.ModelAdmin):
    list_display  = ['of', 'cout_total', 'cout_unitaire', 'date_calcul']
    readonly_fields = ['date_calcul']
