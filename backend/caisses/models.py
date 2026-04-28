"""
MEPALE ERP — Module Caisses
Modèles : CategorieMouvement, Caisse, SessionCaisse,
          MouvementCaisse, TransfertCaisse, ParametresCaisse.
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from simple_history.models import HistoricalRecords


# ---------------------------------------------------------------------------
# Catégorie de mouvement (CRUD admin)
# ---------------------------------------------------------------------------

class CategorieMouvement(models.Model):
    """Catégorie de mouvement de caisse — gérée par l'admin."""

    class Type(models.TextChoices):
        ENTREE = 'entree', 'Entrée'
        SORTIE = 'sortie', 'Sortie'

    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom       = models.CharField('Nom', max_length=100)
    code      = models.SlugField(
        'Code interne', max_length=60, unique=True,
        help_text='Identifiant technique immuable (utilisé par les intégrations).',
    )
    type      = models.CharField('Type', max_length=10, choices=Type.choices)
    is_system = models.BooleanField(
        'Catégorie système', default=False,
        help_text='Les catégories système ne peuvent pas être supprimées.',
    )
    actif     = models.BooleanField('Active', default=True)
    ordre     = models.PositiveSmallIntegerField("Ordre d'affichage", default=0)

    class Meta:
        verbose_name        = 'Catégorie de mouvement'
        verbose_name_plural = 'Catégories de mouvement'
        ordering            = ['type', 'ordre', 'nom']

    def __str__(self):
        return f"{self.nom} ({self.get_type_display()})"


# ---------------------------------------------------------------------------
# Caisse
# ---------------------------------------------------------------------------

class Caisse(models.Model):
    """Caisse physique ou virtuelle."""

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom            = models.CharField('Nom', max_length=100)
    responsable    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='caisses_responsable',
        verbose_name='Responsable',
    )
    solde_actuel   = models.DecimalField(
        'Solde actuel (FCFA)', max_digits=14, decimal_places=2,
        default=Decimal('0'),
    )
    plafond_alerte = models.DecimalField(
        'Plafond alerte (FCFA)', max_digits=14, decimal_places=2,
        null=True, blank=True,
        help_text='Alerte si le solde dépasse ce montant.',
    )
    actif      = models.BooleanField('Active', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    history    = HistoricalRecords()

    class Meta:
        verbose_name        = 'Caisse'
        verbose_name_plural = 'Caisses'
        ordering            = ['nom']

    def __str__(self):
        return self.nom

    @property
    def session_ouverte(self):
        return self.sessions.filter(statut=SessionCaisse.Statut.OUVERTE).first()

    @property
    def alerte_plafond(self):
        return bool(self.plafond_alerte and self.solde_actuel > self.plafond_alerte)


# ---------------------------------------------------------------------------
# Session de caisse
# ---------------------------------------------------------------------------

class SessionCaisse(models.Model):
    """Session journalière d'une caisse (ouverture → mouvements → clôture)."""

    class Statut(models.TextChoices):
        OUVERTE = 'ouverte', 'Ouverte'
        FERMEE  = 'fermee',  'Fermée'

    id                   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    caisse               = models.ForeignKey(
        Caisse, on_delete=models.PROTECT, related_name='sessions', verbose_name='Caisse',
    )
    date_ouverture       = models.DateTimeField('Date ouverture', auto_now_add=True)
    date_fermeture       = models.DateTimeField('Date fermeture', null=True, blank=True)
    solde_ouverture      = models.DecimalField('Solde ouverture (FCFA)', max_digits=14, decimal_places=2)
    solde_fermeture_reel = models.DecimalField(
        'Solde réel clôture (FCFA)', max_digits=14, decimal_places=2,
        null=True, blank=True,
    )
    ecart     = models.DecimalField('Écart (FCFA)', max_digits=14, decimal_places=2, null=True, blank=True)
    statut    = models.CharField('Statut', max_length=10, choices=Statut.choices, default=Statut.OUVERTE)
    ouvert_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='sessions_ouvertes', verbose_name='Ouvert par',
    )
    ferme_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='sessions_fermees', verbose_name='Fermé par',
    )
    notes_cloture = models.TextField('Notes de clôture', blank=True)

    class Meta:
        verbose_name        = 'Session de caisse'
        verbose_name_plural = 'Sessions de caisse'
        ordering            = ['-date_ouverture']

    def __str__(self):
        return f"Session {self.caisse.nom} — {self.date_ouverture.date()}"

    @property
    def solde_fermeture_theorique(self):
        from django.db.models import Sum
        entrees = self.mouvements.filter(
            statut=MouvementCaisse.Statut.APPROUVE,
            type=MouvementCaisse.Type.ENTREE,
        ).aggregate(total=Sum('montant'))['total'] or Decimal('0')
        sorties = self.mouvements.filter(
            statut=MouvementCaisse.Statut.APPROUVE,
            type=MouvementCaisse.Type.SORTIE,
        ).aggregate(total=Sum('montant'))['total'] or Decimal('0')
        return self.solde_ouverture + entrees - sorties

    @property
    def nb_mouvements_en_attente(self):
        return self.mouvements.filter(statut=MouvementCaisse.Statut.EN_ATTENTE).count()


# ---------------------------------------------------------------------------
# Mouvement de caisse
# ---------------------------------------------------------------------------

class MouvementCaisse(models.Model):
    """Mouvement de caisse (entrée ou sortie)."""

    class Type(models.TextChoices):
        ENTREE = 'entree', 'Entrée'
        SORTIE = 'sortie', 'Sortie'

    class Statut(models.TextChoices):
        EN_ATTENTE = 'en_attente', 'En attente'
        APPROUVE   = 'approuve',   'Approuvé'
        REJETE     = 'rejete',     'Rejeté'

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session          = models.ForeignKey(
        SessionCaisse, on_delete=models.PROTECT, related_name='mouvements', verbose_name='Session',
    )
    type             = models.CharField('Type', max_length=10, choices=Type.choices)
    categorie        = models.ForeignKey(
        CategorieMouvement, on_delete=models.PROTECT, related_name='mouvements', verbose_name='Catégorie',
    )
    montant          = models.DecimalField('Montant (FCFA)', max_digits=14, decimal_places=2)
    libelle          = models.CharField('Libellé', max_length=255)
    statut           = models.CharField(
        'Statut', max_length=15, choices=Statut.choices, default=Statut.EN_ATTENTE,
    )
    approuve_par     = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='mouvements_approuves', verbose_name='Approuvé par',
    )
    date_approbation = models.DateTimeField('Date approbation', null=True, blank=True)
    motif_rejet      = models.TextField('Motif de rejet', blank=True)
    justificatif     = models.FileField(
        'Justificatif', upload_to='caisses/justificatifs/', null=True, blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='mouvements_crees', verbose_name='Créé par',
    )
    created_at = models.DateTimeField('Date de création', auto_now_add=True)

    # Liens contextuels (tous optionnels)
    facture_vente = models.ForeignKey(
        'commercial.FactureVente', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='encaissements_caisse',
    )
    bon_commande = models.ForeignKey(
        'logistique.BonCommande', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='paiements_caisse',
    )
    ordre_fabrication = models.ForeignKey(
        'production.OrdreFabrication', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='depenses_caisse',
    )
    transfert = models.ForeignKey(
        'TransfertCaisse', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='mouvements',
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name        = 'Mouvement de caisse'
        verbose_name_plural = 'Mouvements de caisse'
        ordering            = ['-created_at']

    def __str__(self):
        return f"{self.get_type_display()} {self.montant:,.0f} FCFA — {self.libelle}"


# ---------------------------------------------------------------------------
# Transfert inter-caisses
# ---------------------------------------------------------------------------

class TransfertCaisse(models.Model):
    """Transfert inter-caisses — génère automatiquement deux MouvementCaisse liés."""

    class Statut(models.TextChoices):
        EN_ATTENTE = 'en_attente', 'En attente'
        APPROUVE   = 'approuve',   'Approuvé'
        REJETE     = 'rejete',     'Rejeté'

    id                 = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    caisse_source      = models.ForeignKey(
        Caisse, on_delete=models.PROTECT, related_name='transferts_sortants', verbose_name='Caisse source',
    )
    caisse_destination = models.ForeignKey(
        Caisse, on_delete=models.PROTECT, related_name='transferts_entrants', verbose_name='Caisse destination',
    )
    montant    = models.DecimalField('Montant (FCFA)', max_digits=14, decimal_places=2)
    libelle    = models.CharField('Libellé', max_length=255)
    statut     = models.CharField('Statut', max_length=15, choices=Statut.choices, default=Statut.EN_ATTENTE)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='transferts_crees', verbose_name='Créé par',
    )
    created_at = models.DateTimeField('Date de création', auto_now_add=True)
    history    = HistoricalRecords()

    class Meta:
        verbose_name        = 'Transfert de caisse'
        verbose_name_plural = 'Transferts de caisse'
        ordering            = ['-created_at']

    def __str__(self):
        return f"Transfert {self.caisse_source} → {self.caisse_destination} ({self.montant:,.0f} FCFA)"


# ---------------------------------------------------------------------------
# Paramètres globaux (singleton)
# ---------------------------------------------------------------------------

class ParametresCaisse(models.Model):
    """Paramètres globaux du module Caisses — instance unique (pk=1)."""

    seuil_approbation = models.DecimalField(
        'Seuil approbation (FCFA)', max_digits=14, decimal_places=2,
        default=Decimal('50000'),
        help_text='Montant au-delà duquel un mouvement nécessite une approbation manuelle.',
    )
    seuil_alerte_solde_max = models.DecimalField(
        'Seuil alerte solde max (FCFA)', max_digits=14, decimal_places=2,
        default=Decimal('5000000'),
        help_text='Alerte si le solde d\'une caisse dépasse ce montant.',
    )
    report_automatique_solde = models.BooleanField(
        'Report automatique du solde', default=True,
        help_text=(
            'Si activé, le solde réel de clôture devient automatiquement '
            'le solde d\'ouverture de la prochaine session.'
        ),
    )

    class Meta:
        verbose_name        = 'Paramètres caisses'
        verbose_name_plural = 'Paramètres caisses'

    def __str__(self):
        return 'Paramètres Caisses'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
