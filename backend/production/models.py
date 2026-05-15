"""
MEPALE ERP — Module Production : Modèles
Couvre : Nomenclatures (BOM), Ordres de Fabrication, Lots, Coût de revient.
"""

import uuid
from django.db import models
from django.core.validators import MinValueValidator
from django.conf import settings
from simple_history.models import HistoricalRecords


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def generer_numero_lot(date_fab, sequence):
    """LOT-AAAAMMJJ-XXXX"""
    return f"LOT-{date_fab.strftime('%Y%m%d')}-{sequence:04d}"


# ---------------------------------------------------------------------------
# 1. UNITÉS DE MESURE
# ---------------------------------------------------------------------------

class UniteMesure(models.Model):
    id     = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code   = models.CharField('Code', max_length=10, unique=True)   # kg, L, pcs, sac...
    libelle = models.CharField('Libellé', max_length=50)
    type   = models.CharField('Type', max_length=20, choices=[
        ('masse',   'Masse'),
        ('volume',  'Volume'),
        ('longueur','Longueur'),
        ('surface', 'Surface'),
        ('unite',   'Unité'),
    ], default='unite')

    class Meta:
        verbose_name        = 'Unité de mesure'
        verbose_name_plural = 'Unités de mesure'
        ordering            = ['code']

    def __str__(self):
        return f"{self.code} — {self.libelle}"


# ---------------------------------------------------------------------------
# 2. TYPES D'ARTICLES — géré depuis l'administration
# ---------------------------------------------------------------------------

class TypeArticle(models.Model):
    """
    Type d'article configurable depuis l'administration Django.

    Remplace l'enum Article.Type hardcodé. Chaque type expose ses capacités
    métier (peut_composer_bom, peut_etre_produit_of, peut_etre_achete) qui
    pilotent les filtres BOM et les règles de validation des OF.

    Les 4 types initiaux (mp, pf, sf, emballage) sont créés par migration de
    données et peuvent être modifiés ou complétés librement depuis l'admin.
    """

    id                   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code                 = models.CharField(
        'Code', max_length=20, unique=True,
        help_text='Identifiant court unique (ex : mp, pf, sf, emballage). '
                  'Utilisé pour les intégrations et recherches rapides.'
    )
    libelle              = models.CharField('Libellé', max_length=100)
    prefixe              = models.CharField(
        'Préfixe code article', max_length=10, blank=True,
        help_text='Préfixe utilisé pour la génération automatique des codes articles '
                  '(ex : MP → MP-0001). Si vide, le code du type en majuscules est utilisé.'
    )
    # ── Capacités métier ────────────────────────────────────────────────────
    peut_composer_bom    = models.BooleanField(
        'Peut être composant BOM', default=False,
        help_text='Si coché, les articles de ce type peuvent être ajoutés comme '
                  'composants (lignes) dans une nomenclature.'
    )
    peut_etre_produit_of = models.BooleanField(
        "Peut être produit d'un OF", default=False,
        help_text="Si coché, les articles de ce type peuvent être le produit fini "
                  "d'un Ordre de Fabrication."
    )
    peut_etre_achete     = models.BooleanField(
        "Peut faire l'objet d'un achat", default=True,
        help_text='Si coché, les articles de ce type peuvent apparaître dans les '
                  'Demandes d\'Achat et Bons de Commande.'
    )

    class Meta:
        verbose_name        = "Type d'article"
        verbose_name_plural = "Types d'articles"
        ordering            = ['code']

    def __str__(self):
        return f"[{self.code}] {self.libelle}"

    def get_prefixe_effectif(self) -> str:
        """Retourne le préfixe effectif : prefixe si défini, sinon code.upper()."""
        return self.prefixe if self.prefixe else self.code.upper()


# ---------------------------------------------------------------------------
# 3. ARTICLES (Matières premières & Produits finis)
# ---------------------------------------------------------------------------

class Article(models.Model):

    # ── P1-A : Valorisation SAP S/V ────────────────────────────────────────
    class MethodeValorisation(models.TextChoices):
        STANDARD     = 'S', 'Prix standard (S) — fixé manuellement, écarts comptabilisés'
        MOYEN_MOBILE = 'V', 'Prix moyen mobile (V) — recalculé automatiquement à chaque réception'

    # ── Champs de base ──────────────────────────────────────────────────────
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code        = models.CharField('Code article', max_length=30, unique=True)
    designation = models.CharField('Désignation', max_length=200)
    type        = models.ForeignKey(
        TypeArticle, on_delete=models.PROTECT,
        verbose_name='Type',
        related_name='articles',
        help_text="Type de l'article — gère les capacités métier (BOM, OF, achat)."
    )
    unite       = models.ForeignKey(
        UniteMesure, on_delete=models.PROTECT, related_name='articles',
        verbose_name='Unité de mesure'
    )
    description  = models.TextField('Description', blank=True)
    actif        = models.BooleanField('Actif', default=True)
    gere_par_lot = models.BooleanField(
        'Géré par lot', default=True,
        help_text='Si activé, le stock est suivi lot par lot (numéro, FIFO, péremption). '
                  'Sinon, le stock est suivi en quantité globale sans notion de lot.',
    )

    # ── P1-A : Valorisation ─────────────────────────────────────────────────
    methode_valorisation = models.CharField(
        'Méthode de valorisation', max_length=1,
        choices=MethodeValorisation.choices,
        default=MethodeValorisation.MOYEN_MOBILE,
        help_text='S = prix fixe standard. V = coût moyen pondéré recalculé à chaque réception.'
    )
    prix_standard = models.DecimalField(
        'Prix standard / CMUP (FCFA)', max_digits=14, decimal_places=4,
        default=0, validators=[MinValueValidator(0)],
        help_text='Méthode S : prix fixé manuellement. '
                  'Méthode V : mis à jour automatiquement (CMUP) à chaque entrée en stock.'
    )

    # ── P2-C : Code-barres & référence externe ──────────────────────────────
    code_barre        = models.CharField(
        'Code-barres (EAN/QR)', max_length=50, blank=True, null=True, unique=True,
        help_text='EAN-13, QR ou tout autre code de scan physique.'
    )
    reference_externe = models.CharField(
        'Réf. externe / constructeur', max_length=100, blank=True,
        help_text='Référence fabricant ou code article fournisseur principal.'
    )

    # ── P2-D : Durée de vie & conditions de stockage ────────────────────────
    duree_vie_jours = models.PositiveIntegerField(
        'Durée de vie (jours)', null=True, blank=True,
        help_text='Si renseigné, la date de péremption est calculée automatiquement '
                  'à la réception (date_réception + durée_vie_jours).'
    )
    conditions_stockage = models.CharField(
        'Conditions de stockage', max_length=200, blank=True,
        help_text='Ex : Conserver au frais entre 2 °C et 8 °C, à l\'abri de la lumière.'
    )

    # ── P3-E : Unité d'achat (multi-UoM) ────────────────────────────────────
    # Permet d'acheter en "carton" mais de stocker en "pcs".
    # Si unite_achat est null, on suppose unite_achat == unite.
    unite_achat = models.ForeignKey(
        UniteMesure, on_delete=models.PROTECT,
        null=True, blank=True, related_name='articles_en_achat',
        verbose_name="Unité d'achat",
        help_text="Unité utilisée pour les commandes/réceptions (ex : carton). "
                  "Si vide, identique à l'unité de stock."
    )
    coefficient_conversion = models.DecimalField(
        "Coefficient de conversion (achat → stock)", max_digits=10, decimal_places=4,
        default=1, validators=[MinValueValidator(0.0001)],
        help_text="Nombre d'unités de stock par unité d'achat. "
                  "Ex : 24 si 1 carton = 24 pcs."
    )

    date_creation = models.DateTimeField(auto_now_add=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name        = 'Article'
        verbose_name_plural = 'Articles'
        ordering            = ['designation']

    def __str__(self):
        return f"[{self.code}] {self.designation}"

    # ── P2-A : Propriétés de capacité métier (délèguent au TypeArticle) ────

    @property
    def peut_composer_bom(self) -> bool:
        """Ce type peut-il être composant (ligne) d'une nomenclature BOM ?"""
        return self.type.peut_composer_bom

    @property
    def peut_etre_produit_of(self) -> bool:
        """Ce type peut-il être le produit fini d'un Ordre de Fabrication ?"""
        return self.type.peut_etre_produit_of

    @property
    def peut_etre_achete(self) -> bool:
        """Ce type peut-il faire l'objet d'une Demande / Bon de Commande ?"""
        return self.type.peut_etre_achete

    # ── P3-E : Conversion UoM ───────────────────────────────────────────────

    def convertir_achat_vers_stock(self, quantite_achat):
        """Convertit une quantité exprimée en unité d'achat vers l'unité de stock.
        Ex : 5 cartons × 24 = 120 pcs."""
        from decimal import Decimal
        return Decimal(str(quantite_achat)) * self.coefficient_conversion

    def prix_achat_vers_stock(self, prix_par_unite_achat):
        """Convertit un prix unitaire d'achat en prix par unité de stock.
        Ex : 1 000 FCFA/carton ÷ 24 = 41,67 FCFA/pcs."""
        from decimal import Decimal
        if self.coefficient_conversion and self.coefficient_conversion > 0:
            return Decimal(str(prix_par_unite_achat)) / self.coefficient_conversion
        return Decimal(str(prix_par_unite_achat))


# ---------------------------------------------------------------------------
# 4. NOMENCLATURES (BOM — Bill of Materials)
# ---------------------------------------------------------------------------

class Nomenclature(models.Model):
    """En-tête de nomenclature — un produit fini, une version."""

    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    produit_fini  = models.ForeignKey(
        Article, on_delete=models.CASCADE, related_name='nomenclatures',
        limit_choices_to={'type__peut_etre_produit_of': True},
        verbose_name='Produit fini'
    )
    version       = models.PositiveSmallIntegerField('Version', default=1)
    quantite_base = models.DecimalField(
        'Quantité produite (base)', max_digits=12, decimal_places=3,
        validators=[MinValueValidator(0.001)]
    )
    active        = models.BooleanField('Active', default=True)
    cout_standard = models.DecimalField(
        'Coût standard (FCFA/unité produite)', max_digits=14, decimal_places=2, default=0,
        help_text='Coût de revient standard par unité — référence pour comparer avec le coût réel'
    )
    notes         = models.TextField('Notes', blank=True)
    cree_par      = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='nomenclatures_creees'
    )
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name        = 'Nomenclature'
        verbose_name_plural = 'Nomenclatures'
        unique_together     = ('produit_fini', 'version')
        ordering            = ['produit_fini__designation', '-version']

    def __str__(self):
        return f"{self.produit_fini.designation} — v{self.version}"


class LigneNomenclature(models.Model):
    """Une matière première et sa quantité dans une nomenclature."""

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nomenclature = models.ForeignKey(
        Nomenclature, on_delete=models.CASCADE, related_name='lignes'
    )
    matiere      = models.ForeignKey(
        Article, on_delete=models.PROTECT, related_name='utilisations_bom',
        limit_choices_to={'type__peut_composer_bom': True},
        verbose_name='Matière première'
    )
    quantite     = models.DecimalField(
        'Quantité', max_digits=12, decimal_places=4,
        validators=[MinValueValidator(0.0001)]
    )
    taux_perte   = models.DecimalField(
        'Taux de perte (%)', max_digits=5, decimal_places=2, default=0,
        help_text='Pourcentage de perte standard pour cette composante'
    )
    notes        = models.CharField('Notes', max_length=200, blank=True)

    class Meta:
        verbose_name        = 'Ligne de nomenclature'
        verbose_name_plural = 'Lignes de nomenclature'
        unique_together     = ('nomenclature', 'matiere')

    def __str__(self):
        return f"{self.matiere.designation} × {self.quantite} {self.matiere.unite.code}"

    @property
    def quantite_avec_perte(self):
        """Quantité réelle à consommer en tenant compte du taux de perte."""
        return self.quantite * (1 + self.taux_perte / 100)


# ---------------------------------------------------------------------------
# 5. ORDRES DE FABRICATION (OF)
# ---------------------------------------------------------------------------

class OrdreFabrication(models.Model):
    class Statut(models.TextChoices):
        BROUILLON = 'brouillon', 'Brouillon'
        CONFIRME  = 'confirme',  'Confirmé'
        EN_COURS  = 'en_cours',  'En cours'
        TERMINE   = 'termine',   'Terminé'
        CLOTURE   = 'cloture',   'Clôturé'
        ANNULE    = 'annule',    'Annulé'

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference    = models.CharField('Référence', max_length=20, unique=True)
    nomenclature = models.ForeignKey(
        Nomenclature, on_delete=models.PROTECT, related_name='ordres',
        verbose_name='Nomenclature'
    )
    quantite_prevue  = models.DecimalField(
        'Quantité prévue', max_digits=12, decimal_places=3,
        validators=[MinValueValidator(0.001)]
    )
    quantite_produite = models.DecimalField(
        'Quantité produite', max_digits=12, decimal_places=3,
        default=0, validators=[MinValueValidator(0)]
    )
    statut       = models.CharField(
        'Statut', max_length=15, choices=Statut.choices, default=Statut.BROUILLON
    )
    date_prevue  = models.DateField('Date prévue')
    date_debut   = models.DateTimeField('Date début réelle', null=True, blank=True)
    date_fin     = models.DateTimeField('Date fin réelle', null=True, blank=True)
    ligne_prod   = models.CharField('Ligne de production', max_length=50, blank=True)
    seuil_rendement = models.DecimalField(
        'Seuil rendement alerte (%)', max_digits=5, decimal_places=2, default=80.00,
        help_text='Alerte si rendement réel < seuil (en %)'
    )
    seuil_perte = models.DecimalField(
        'Seuil perte alerte (%)', max_digits=5, decimal_places=2, default=10.00,
        help_text='Alerte si les pertes cumulées dépassent ce % de la quantité prévue'
    )
    notes        = models.TextField('Notes', blank=True)

    # ── P3-C : Priorité et séquençage ──────────────────────────────────────
    class Priorite(models.TextChoices):
        URGENTE   = 'urgente',   'Urgente'
        NORMALE   = 'normale',   'Normale'
        PLANIFIEE = 'planifiee', 'Planifiée'

    priorite = models.CharField(
        'Priorité', max_length=10, choices=Priorite.choices, default=Priorite.NORMALE
    )
    sequence = models.PositiveIntegerField(
        'Séquence', default=100,
        help_text='Ordre de traitement sur la ligne de production (plus petit = prioritaire).'
    )

    # ── P1-A : Snapshot figé de la nomenclature à la confirmation ──────────
    # Stocke une copie JSON des lignes BOM (quantités scalées sur quantite_prevue)
    # au moment de la confirmation. Garantit que toute modification ultérieure
    # de la nomenclature n'affecte pas cet OF en cours.
    lignes_snapshot = models.JSONField(
        'Snapshot BOM', null=True, blank=True,
        help_text='Copie figée de la nomenclature enregistrée lors de la confirmation.'
    )

    cree_par     = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='ofs_crees'
    )
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name        = "Ordre de fabrication"
        verbose_name_plural = "Ordres de fabrication"
        ordering            = ['-date_creation']

    def __str__(self):
        return f"{self.reference} — {self.nomenclature.produit_fini.designation}"

    @property
    def rendement(self):
        """Rendement en % = (produit / prévu) × 100"""
        if self.quantite_prevue and self.quantite_prevue > 0:
            return round(float(self.quantite_produite) / float(self.quantite_prevue) * 100, 2)
        return 0

    @property
    def est_en_retard(self):
        from django.utils import timezone
        return (
            self.statut in [self.Statut.CONFIRME, self.Statut.EN_COURS]
            and self.date_prevue < timezone.now().date()
        )


class AffectationEmployeOF(models.Model):
    """Affectation d'un employé à un ordre de fabrication."""

    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    of      = models.ForeignKey(
        OrdreFabrication, on_delete=models.CASCADE, related_name='affectations'
    )
    employe = models.ForeignKey(
        'rh.Employee', on_delete=models.CASCADE,
        related_name='affectations_of'
    )
    role_prod = models.CharField('Rôle sur OF', max_length=100, blank=True)

    class Meta:
        unique_together = ('of', 'employe')

    def __str__(self):
        return f"{self.employe} → {self.of.reference}"


# ---------------------------------------------------------------------------
# 5b. RÉSERVATIONS DE LOTS (P2-D)
# ---------------------------------------------------------------------------

class ReservationLot(models.Model):
    """
    Réservation granulaire : attache un lot MP spécifique à un OF confirmé.

    Résout le problème de réservation non-granulaire (P2-D) : au lieu de
    simplement incrémenter StockArticle.quantite_reservee, on enregistre
    exactement quel lot est réservé pour quel OF et en quelle quantité.

    Garantit que deux OFs ne peuvent pas consommer les mêmes lots physiques
    à la clôture.
    """

    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ordre_fabrication = models.ForeignKey(
        OrdreFabrication, on_delete=models.CASCADE, related_name='reservations'
    )
    lot               = models.ForeignKey(
        'Lot', on_delete=models.CASCADE, related_name='reservations'
    )
    article           = models.ForeignKey(
        Article, on_delete=models.PROTECT, related_name='reservations_lot'
    )
    quantite_reservee = models.DecimalField(
        'Quantité réservée', max_digits=12, decimal_places=4,
        validators=[MinValueValidator(0.0001)]
    )
    date_reservation  = models.DateTimeField('Date réservation', auto_now_add=True)

    class Meta:
        verbose_name        = 'Réservation de lot'
        verbose_name_plural = 'Réservations de lots'
        unique_together     = ['ordre_fabrication', 'lot']

    def __str__(self):
        return f"{self.ordre_fabrication.reference} ← {self.lot} × {self.quantite_reservee}"


# ---------------------------------------------------------------------------
# 6. LOTS
# ---------------------------------------------------------------------------

class Lot(models.Model):
    class Statut(models.TextChoices):
        DISPONIBLE  = 'disponible',  'Disponible'
        EPUISE      = 'epuise',      'Épuisé'
        BLOQUE      = 'bloque',      'Bloqué (qualité)'
        PERIME      = 'perime',      'Périmé'

    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article           = models.ForeignKey(
        Article, on_delete=models.PROTECT, related_name='lots'
    )
    numero_lot        = models.CharField('N° de lot', max_length=50, unique=True)
    date_fabrication  = models.DateField('Date de fabrication')
    date_peremption   = models.DateField('Date de péremption', null=True, blank=True)
    quantite_initiale = models.DecimalField(
        'Quantité initiale', max_digits=12, decimal_places=3,
        validators=[MinValueValidator(0.001)]
    )
    quantite_restante = models.DecimalField(
        'Quantité restante', max_digits=12, decimal_places=3,
        validators=[MinValueValidator(0)]
    )
    cout_unitaire     = models.DecimalField(
        'Coût unitaire (FCFA)', max_digits=14, decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    statut = models.CharField(
        'Statut', max_length=15, choices=Statut.choices, default=Statut.DISPONIBLE
    )

    # Traçabilité : lot de PF → OF de fabrication
    ordre_fabrication = models.ForeignKey(
        OrdreFabrication, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='lots_produits'
    )
    notes = models.TextField('Notes', blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Lot'
        verbose_name_plural = 'Lots'
        ordering            = ['article', 'date_peremption']
        indexes = [
            # Index FIFO : consommer les lots les plus proches de péremption en premier
            models.Index(
                fields=['article', 'date_peremption'],
                name='idx_lot_fifo',
                condition=models.Q(statut='disponible'),
            ),
        ]

    def __str__(self):
        return f"{self.numero_lot} — {self.article.designation}"

    @property
    def jours_avant_peremption(self):
        if self.date_peremption:
            from django.utils import timezone
            delta = self.date_peremption - timezone.now().date()
            return delta.days
        return None

    @property
    def est_proche_peremption(self):
        j = self.jours_avant_peremption
        return j is not None and 0 <= j <= 7

    @property
    def valeur_residuelle(self):
        """Valeur résiduelle du lot = quantité restante × coût unitaire (FCFA)."""
        return round(float(self.quantite_restante) * float(self.cout_unitaire), 2)


class ConsommationLot(models.Model):
    """
    Traçabilité bidirectionnelle :
    - Lot MP consommé dans un OF → Lot PF produit
    """

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    of          = models.ForeignKey(
        OrdreFabrication, on_delete=models.CASCADE, related_name='consommations'
    )
    lot_mp      = models.ForeignKey(
        Lot, on_delete=models.PROTECT, related_name='consommations_comme_mp',
        verbose_name='Lot matière première'
    )
    lot_pf      = models.ForeignKey(
        Lot, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='composants_mp', verbose_name='Lot produit fini'
    )
    quantite    = models.DecimalField(
        'Quantité consommée', max_digits=12, decimal_places=4,
        validators=[MinValueValidator(0.0001)]
    )
    date_consommation = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Consommation de lot'
        verbose_name_plural = 'Consommations de lots'

    def __str__(self):
        return f"OF {self.of.reference} : {self.lot_mp.numero_lot} → {self.quantite}"


# ---------------------------------------------------------------------------
# 7. PERTES & REBUTS
# ---------------------------------------------------------------------------

class Perte(models.Model):
    class Type(models.TextChoices):
        REBUT   = 'rebut',   'Rebut'
        DECHET  = 'dechet',  'Déchet'
        PERTE   = 'perte',   'Perte process'
        CASSE   = 'casse',   'Casse'

    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    of       = models.ForeignKey(
        OrdreFabrication, on_delete=models.CASCADE, related_name='pertes'
    )
    article  = models.ForeignKey(Article, on_delete=models.PROTECT)
    type     = models.CharField('Type', max_length=10, choices=Type.choices)
    quantite = models.DecimalField(
        'Quantité', max_digits=12, decimal_places=3,
        validators=[MinValueValidator(0.001)]
    )
    motif    = models.TextField('Motif')
    saisie_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    date_saisie = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Perte / Rebut'
        verbose_name_plural = 'Pertes & Rebuts'

    def __str__(self):
        return f"{self.get_type_display()} — {self.quantite} {self.article.unite.code} ({self.of.reference})"


# ---------------------------------------------------------------------------
# 8. COÛT DE REVIENT
# ---------------------------------------------------------------------------

class CoutRevient(models.Model):
    """Calcul du coût de revient par OF (calculé à la clôture)."""

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    of               = models.OneToOneField(
        OrdreFabrication, on_delete=models.CASCADE, related_name='cout_revient'
    )
    cout_matieres    = models.DecimalField('Coût matières (FCFA)', max_digits=14, decimal_places=2, default=0)
    cout_main_oeuvre = models.DecimalField('Coût main d\'œuvre (FCFA)', max_digits=14, decimal_places=2, default=0)
    cout_charges     = models.DecimalField('Charges indirectes (FCFA)', max_digits=14, decimal_places=2, default=0)
    cout_total       = models.DecimalField('Coût total (FCFA)', max_digits=14, decimal_places=2, default=0)
    cout_unitaire    = models.DecimalField('Coût unitaire (FCFA)', max_digits=14, decimal_places=2, default=0)
    cout_standard    = models.DecimalField('Coût standard (FCFA)', max_digits=14, decimal_places=2, default=0)

    # ── P3-B : Analyse des écarts (Variance Analysis) ──────────────────────
    # Écart de rendement : impact financier de la différence de production
    #   = (qté_bonne − qté_prévue) × coût_standard_unitaire
    #   Négatif → sous-production (défavorable) / Positif → sur-production
    ecart_rendement = models.DecimalField(
        'Écart rendement (FCFA)', max_digits=14, decimal_places=2, default=0,
        help_text='(qté produite bonne − qté prévue) × coût_standard. '
                  'Négatif = sous-production défavorable.'
    )
    # Écart de coût global : surcoût ou économie réel vs standard
    #   = coût_total_réel − (qté_bonne × coût_standard_unitaire)
    #   Positif → surcoût / Négatif → économie
    ecart_cout = models.DecimalField(
        'Écart coût global (FCFA)', max_digits=14, decimal_places=2, default=0,
        help_text='Coût total réel − (qté bonne × coût_standard). '
                  'Positif = surcoût, négatif = économie.'
    )

    date_calcul      = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Coût de revient'

    def __str__(self):
        return f"Coût revient — {self.of.reference} : {self.cout_unitaire} FCFA/u"

    def calculer(self, quantite_base_override=None):
        """
        Recalcule le coût total, unitaire et les écarts de variance (P3-B).

        quantite_base_override (Decimal | None) — P1-C :
            Si fourni, le coût unitaire est calculé sur cette quantité
            (ex : quantite_produite − rebuts PF) plutôt que sur
            quantite_produite brute.

        P3-B — Écarts calculés :
            ecart_rendement = (qté_bonne − qté_prévue) × cout_standard
            ecart_cout      = cout_total_réel − (qté_bonne × cout_standard)
        """
        self.cout_total = self.cout_matieres + self.cout_main_oeuvre + self.cout_charges
        quantite = quantite_base_override if quantite_base_override is not None else self.of.quantite_produite
        if quantite and quantite > 0:
            self.cout_unitaire = round(self.cout_total / quantite, 2)

        # ── P3-B : Calcul des écarts ────────────────────────────────────────
        if self.cout_standard and self.cout_standard > 0 and quantite and quantite > 0:
            from decimal import Decimal
            qte_bonne   = Decimal(str(quantite))
            qte_prevue  = self.of.quantite_prevue
            std         = Decimal(str(self.cout_standard))
            self.ecart_rendement = round((qte_bonne - qte_prevue) * std, 2)
            self.ecart_cout      = round(self.cout_total - (qte_bonne * std), 2)
        else:
            self.ecart_rendement = 0
            self.ecart_cout      = 0

        self.save()
