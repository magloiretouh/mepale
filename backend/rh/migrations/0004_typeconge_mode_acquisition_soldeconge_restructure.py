"""
Migration 0004 — Restructuration des congés
- TypeConge : ajout mode_acquisition
- SoldeConge : suppression du champ annee, ajout date_derniere_acquisition,
               nouvelle unique_together (employee, type_conge)
Les données existantes de SoldeConge sont effacées (système non encore en
production pour cette fonctionnalité).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rh", "0003_payroll_draft"),
    ]

    operations = [
        # ── 1. Ajouter mode_acquisition à TypeConge ───────────────────────────
        migrations.AddField(
            model_name="typeconge",
            name="mode_acquisition",
            field=models.CharField(
                choices=[
                    ("mensuel", "Mensuel (quota ÷ 12 par mois)"),
                    ("annuel",  "Annuel (quota crédité au 1er janvier)"),
                    ("libre",   "Libre (pas de calcul automatique)"),
                ],
                default="libre",
                max_length=10,
                verbose_name="Mode d'acquisition",
            ),
        ),

        # ── 2. Vider SoldeConge avant de changer le schéma ───────────────────
        migrations.RunSQL(
            sql="DELETE FROM soldes_conge;",
            reverse_sql=migrations.RunSQL.noop,
        ),

        # ── 3. Supprimer l'ancienne unique_together ───────────────────────────
        migrations.AlterUniqueTogether(
            name="soldeconge",
            unique_together=set(),
        ),

        # ── 4. Supprimer le champ annee ───────────────────────────────────────
        migrations.RemoveField(
            model_name="soldeconge",
            name="annee",
        ),

        # ── 5. Ajouter date_derniere_acquisition ──────────────────────────────
        migrations.AddField(
            model_name="soldeconge",
            name="date_derniere_acquisition",
            field=models.DateField(
                blank=True, null=True,
                verbose_name="Date de la dernière acquisition",
            ),
        ),

        # ── 6. Augmenter max_digits pour accumulation multi-années ────────────
        migrations.AlterField(
            model_name="soldeconge",
            name="jours_acquis",
            field=models.DecimalField(
                decimal_places=1, default=0, max_digits=7,
                verbose_name="Jours acquis (cumulatif)",
            ),
        ),
        migrations.AlterField(
            model_name="soldeconge",
            name="jours_pris",
            field=models.DecimalField(
                decimal_places=1, default=0, max_digits=7,
                verbose_name="Jours pris (cumulatif)",
            ),
        ),

        # ── 7. Nouvelle unique_together sans annee ────────────────────────────
        migrations.AlterUniqueTogether(
            name="soldeconge",
            unique_together={("employee", "type_conge")},
        ),
    ]
