# Generated manually — 2026-03-22
# P3-B : Champs d'analyse des écarts sur CoutRevient.
# P3-C : Champs priorité et séquence sur OrdreFabrication.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0006_reservationlot'),
    ]

    operations = [
        # ── P3-C : Priorité et séquence ────────────────────────────────────
        migrations.AddField(
            model_name='ordrefabrication',
            name='priorite',
            field=models.CharField(
                choices=[
                    ('urgente',   'Urgente'),
                    ('normale',   'Normale'),
                    ('planifiee', 'Planifiée'),
                ],
                default='normale',
                max_length=10,
                verbose_name='Priorité',
            ),
        ),
        migrations.AddField(
            model_name='ordrefabrication',
            name='sequence',
            field=models.PositiveIntegerField(
                default=100,
                verbose_name='Séquence',
                help_text='Ordre de traitement sur la ligne de production (plus petit = prioritaire).',
            ),
        ),
        # Mirror sur HistoricalOrdreFabrication (django-simple-history)
        migrations.AddField(
            model_name='historicalordrefabrication',
            name='priorite',
            field=models.CharField(
                choices=[
                    ('urgente',   'Urgente'),
                    ('normale',   'Normale'),
                    ('planifiee', 'Planifiée'),
                ],
                default='normale',
                max_length=10,
                verbose_name='Priorité',
            ),
        ),
        migrations.AddField(
            model_name='historicalordrefabrication',
            name='sequence',
            field=models.PositiveIntegerField(
                default=100,
                verbose_name='Séquence',
                help_text='Ordre de traitement sur la ligne de production (plus petit = prioritaire).',
            ),
        ),

        # ── P3-B : Écarts de coût (Variance Analysis) ──────────────────────
        migrations.AddField(
            model_name='coutrevient',
            name='ecart_rendement',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=14,
                verbose_name='Écart rendement (FCFA)',
                help_text='(qté produite bonne − qté prévue) × coût_standard.',
            ),
        ),
        migrations.AddField(
            model_name='coutrevient',
            name='ecart_cout',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=14,
                verbose_name='Écart coût global (FCFA)',
                help_text='Coût total réel − (qté bonne × coût_standard).',
            ),
        ),
    ]
