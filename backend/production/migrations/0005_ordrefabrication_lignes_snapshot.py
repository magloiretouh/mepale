# Generated manually — 2026-03-22
# P1-A : Snapshot figé de la nomenclature BOM à la confirmation de l'OF.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0004_article_gere_par_lot'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordrefabrication',
            name='lignes_snapshot',
            field=models.JSONField(
                blank=True,
                null=True,
                verbose_name='Snapshot BOM',
                help_text='Copie figée de la nomenclature enregistrée lors de la confirmation.',
            ),
        ),
        migrations.AddField(
            model_name='historicalordrefabrication',
            name='lignes_snapshot',
            field=models.JSONField(
                blank=True,
                null=True,
                verbose_name='Snapshot BOM',
                help_text='Copie figée de la nomenclature enregistrée lors de la confirmation.',
            ),
        ),
    ]
