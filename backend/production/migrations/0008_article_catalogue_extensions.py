# Generated manually — 2026-03-22
# P1-A : Valorisation SAP S/V (prix_standard, methode_valorisation)
# P2-C : Code-barres et référence externe (code_barre, reference_externe)
# P2-D : Durée de vie et conditions de stockage (duree_vie_jours, conditions_stockage)
# P3-E : Unité d'achat et coefficient de conversion (unite_achat, coefficient_conversion)

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0007_of_priorite_sequence_coutrevient_ecarts'),
    ]

    operations = [

        # ── P1-A : Valorisation ─────────────────────────────────────────────
        migrations.AddField(
            model_name='article',
            name='methode_valorisation',
            field=models.CharField(
                choices=[
                    ('S', 'Prix standard (S) — fixé manuellement, écarts comptabilisés'),
                    ('V', 'Prix moyen mobile (V) — recalculé automatiquement à chaque réception'),
                ],
                default='V',
                max_length=1,
                verbose_name='Méthode de valorisation',
            ),
        ),
        migrations.AddField(
            model_name='article',
            name='prix_standard',
            field=models.DecimalField(
                decimal_places=4, default=0, max_digits=14,
                validators=[django.core.validators.MinValueValidator(0)],
                verbose_name='Prix standard / CMUP (FCFA)',
            ),
        ),
        # Mirror HistoricalArticle
        migrations.AddField(
            model_name='historicalarticle',
            name='methode_valorisation',
            field=models.CharField(
                choices=[
                    ('S', 'Prix standard (S) — fixé manuellement, écarts comptabilisés'),
                    ('V', 'Prix moyen mobile (V) — recalculé automatiquement à chaque réception'),
                ],
                default='V',
                max_length=1,
                verbose_name='Méthode de valorisation',
            ),
        ),
        migrations.AddField(
            model_name='historicalarticle',
            name='prix_standard',
            field=models.DecimalField(
                decimal_places=4, default=0, max_digits=14,
                validators=[django.core.validators.MinValueValidator(0)],
                verbose_name='Prix standard / CMUP (FCFA)',
            ),
        ),

        # ── P2-C : Code-barres & référence externe ──────────────────────────
        migrations.AddField(
            model_name='article',
            name='code_barre',
            field=models.CharField(
                blank=True, max_length=50, null=True, unique=True,
                verbose_name='Code-barres (EAN/QR)',
            ),
        ),
        migrations.AddField(
            model_name='article',
            name='reference_externe',
            field=models.CharField(blank=True, max_length=100, verbose_name='Réf. externe / constructeur'),
        ),
        migrations.AddField(
            model_name='historicalarticle',
            name='code_barre',
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name='Code-barres (EAN/QR)'),
        ),
        migrations.AddField(
            model_name='historicalarticle',
            name='reference_externe',
            field=models.CharField(blank=True, max_length=100, verbose_name='Réf. externe / constructeur'),
        ),

        # ── P2-D : Durée de vie & conditions de stockage ────────────────────
        migrations.AddField(
            model_name='article',
            name='duree_vie_jours',
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name='Durée de vie (jours)'),
        ),
        migrations.AddField(
            model_name='article',
            name='conditions_stockage',
            field=models.CharField(blank=True, max_length=200, verbose_name='Conditions de stockage'),
        ),
        migrations.AddField(
            model_name='historicalarticle',
            name='duree_vie_jours',
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name='Durée de vie (jours)'),
        ),
        migrations.AddField(
            model_name='historicalarticle',
            name='conditions_stockage',
            field=models.CharField(blank=True, max_length=200, verbose_name='Conditions de stockage'),
        ),

        # ── P3-E : Unité d'achat & coefficient de conversion ────────────────
        migrations.AddField(
            model_name='article',
            name='unite_achat',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='articles_en_achat',
                to='production.unitemesure',
                verbose_name="Unité d'achat",
            ),
        ),
        migrations.AddField(
            model_name='article',
            name='coefficient_conversion',
            field=models.DecimalField(
                decimal_places=4, default=1, max_digits=10,
                validators=[django.core.validators.MinValueValidator(0.0001)],
                verbose_name='Coefficient de conversion (achat → stock)',
            ),
        ),
        migrations.AddField(
            model_name='historicalarticle',
            name='unite_achat',
            field=models.ForeignKey(
                blank=True, db_constraint=False, null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name='+',
                to='production.unitemesure',
                verbose_name="Unité d'achat",
            ),
        ),
        migrations.AddField(
            model_name='historicalarticle',
            name='coefficient_conversion',
            field=models.DecimalField(
                decimal_places=4, default=1, max_digits=10,
                validators=[django.core.validators.MinValueValidator(0.0001)],
                verbose_name='Coefficient de conversion (achat → stock)',
            ),
        ),
    ]
