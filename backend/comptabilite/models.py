"""
MEPALE ERP — Module Comptabilité
Modèles : CategorieComptable, EcritureComptable.
"""

import uuid
from django.db import models
from simple_history.models import HistoricalRecords


# ---------------------------------------------------------------------------
# Catégorie comptable
# ---------------------------------------------------------------------------

class CategorieComptable(models.Model):
    """Catégorie de recette ou de charge."""

    class Type(models.TextChoices):
        RECETTE = 'income',  'Recette'
        CHARGE  = 'expense', 'Charge'

    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name      = models.CharField('Nom', max_length=100, unique=True)
    type      = models.CharField('Type', max_length=10, choices=Type.choices)
    is_system = models.BooleanField(
        'Catégorie système', default=False,
        help_text="Les catégories système ne peuvent pas être supprimées via l'API.",
    )
    actif      = models.BooleanField('Active', default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'accounting_categories'
        verbose_name        = 'Catégorie comptable'
        verbose_name_plural = 'Catégories comptables'
        ordering            = ['type', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


# ---------------------------------------------------------------------------
# Écriture comptable
# ---------------------------------------------------------------------------

class EcritureComptable(models.Model):
    """Écriture comptable (recette ou charge, manuelle ou automatique)."""

    class Type(models.TextChoices):
        RECETTE = 'income',  'Recette'
        CHARGE  = 'expense', 'Charge'

    class Source(models.TextChoices):
        MANUAL = 'manual', 'Manuel'
        AUTO   = 'auto',   'Automatique'

    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date     = models.DateField('Date')
    type     = models.CharField('Type', max_length=10, choices=Type.choices)
    category = models.ForeignKey(
        CategorieComptable,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='ecritures',
        verbose_name='Catégorie',
    )
    label  = models.CharField('Libellé', max_length=255)
    amount = models.DecimalField('Montant (FCFA)', max_digits=14, decimal_places=2)
    notes  = models.TextField('Notes', blank=True)
    source = models.CharField(
        'Source', max_length=10,
        choices=Source.choices, default=Source.MANUAL,
    )

    # Références pour les écritures automatiques (idempotence)
    ref_type = models.CharField('Type référence', max_length=100, blank=True)
    ref_id   = models.UUIDField('ID référence', null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    history = HistoricalRecords()

    class Meta:
        db_table            = 'accounting_entries'
        verbose_name        = 'Écriture comptable'
        verbose_name_plural = 'Écritures comptables'
        ordering            = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['ref_type', 'ref_id'], name='accounting_ref_idx'),
            models.Index(fields=['date'],               name='accounting_date_idx'),
        ]

    def __str__(self):
        return f"{self.get_type_display()} {self.amount:,.0f} FCFA — {self.label}"
