# Migration manuelle : change AffectationEmployeOF.employe de AUTH_USER_MODEL (UUID)
# vers rh.Employee (bigint). PostgreSQL ne peut pas caster UUID → bigint directement.
# Les affectations existantes (qui référençaient des UUID devenus invalides) sont supprimées.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0011_fournisseur_qualification_contacts_articles_contrats_otd'),
        ('rh', '0003_payroll_draft'),
    ]

    operations = [
        # 1. Vider les affectations existantes (UUID incompatibles avec bigint)
        migrations.RunSQL(
            sql='DELETE FROM production_affectationemployeof;',
            reverse_sql=migrations.RunSQL.noop,
        ),
        # 2. Supprimer l'ancienne colonne UUID
        migrations.RemoveField(
            model_name='affectationemployeof',
            name='employe',
        ),
        # 3. Ajouter la nouvelle colonne bigint FK vers rh.Employee
        migrations.AddField(
            model_name='affectationemployeof',
            name='employe',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='affectations_of',
                to='rh.employee',
            ),
            preserve_default=False,
        ),
    ]
