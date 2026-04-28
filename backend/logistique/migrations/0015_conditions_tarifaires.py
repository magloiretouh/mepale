"""
Migration 0015 — Conditions tarifaires
- Crée ConditionTarifaire (remplace TypeFraisAnnexe)
- Crée ConditionAppliqueeBC (remplace FraisAnnexeBC)
- Supprime montant_frais et tva de BonCommande
- Supprime taux_tva de LigneBonCommande
- Data migration : TypeFraisAnnexe → ConditionTarifaire (majoration/pourcentage/bc)
                   FraisAnnexeBC   → ConditionAppliqueeBC
                   TVA de chaque BC → ConditionAppliqueeBC (taux calculé depuis montant_ht)
- Supprime TypeFraisAnnexe et FraisAnnexeBC
"""
import uuid
import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.db import migrations, models


def migrate_forward(apps, schema_editor):
    TypeFraisAnnexe    = apps.get_model('logistique', 'TypeFraisAnnexe')
    FraisAnnexeBC      = apps.get_model('logistique', 'FraisAnnexeBC')
    ConditionTarifaire = apps.get_model('logistique', 'ConditionTarifaire')
    ConditionAppliqueeBC = apps.get_model('logistique', 'ConditionAppliqueeBC')
    BonCommande        = apps.get_model('logistique', 'BonCommande')

    # 1. TypeFraisAnnexe → ConditionTarifaire (tous en majoration, niveau bc)
    mapping = {}  # old_id → new ConditionTarifaire
    for tfa in TypeFraisAnnexe.objects.all():
        mode = 'pourcentage' if tfa.type_calcul == 'pourcentage' else 'montant_fixe'
        ct = ConditionTarifaire.objects.create(
            nom=tfa.nom,
            mode_calcul=mode,
            type_effet='majoration',
            niveau='bc',
            valeur_defaut=tfa.type_calcul == 'pourcentage' and 0 or 0,
            description=tfa.description,
            actif=tfa.actif,
        )
        mapping[str(tfa.id)] = ct

    # 2. FraisAnnexeBC → ConditionAppliqueeBC
    for frais in FraisAnnexeBC.objects.select_related('type_frais', 'bon_commande').all():
        ct = mapping.get(str(frais.type_frais_id))
        if not ct:
            continue
        ConditionAppliqueeBC.objects.create(
            condition=ct,
            bon_commande=frais.bon_commande,
            ligne_bc=None,
            ordre=10,
            valeur=frais.valeur,
            nom_snapshot=frais.type_frais.nom,
            mode_calcul_snapshot=ct.mode_calcul,
            type_effet_snapshot='majoration',
        )

    # 3. TVA existante → ConditionAppliqueeBC (si montant_ht > 0 et tva > 0)
    # Crée d'abord une condition TVA catalogue si elle n'existe pas
    tva_ct, _ = ConditionTarifaire.objects.get_or_create(
        nom='TVA',
        defaults={
            'mode_calcul': 'pourcentage',
            'type_effet': 'majoration',
            'niveau': 'bc',
            'valeur_defaut': Decimal('18.0000'),
            'description': 'Taxe sur la Valeur Ajoutée',
            'actif': True,
        },
    )

    for bc in BonCommande.objects.all():
        if bc.montant_ht and bc.montant_ht > 0 and bc.tva and bc.tva > 0:
            taux = (Decimal(str(bc.tva)) / Decimal(str(bc.montant_ht)) * 100).quantize(Decimal('0.0001'))
            ConditionAppliqueeBC.objects.create(
                condition=tva_ct,
                bon_commande=bc,
                ligne_bc=None,
                ordre=20,
                valeur=taux,
                nom_snapshot='TVA',
                mode_calcul_snapshot='pourcentage',
                type_effet_snapshot='majoration',
            )


class Migration(migrations.Migration):

    dependencies = [
        ('logistique', '0014_ligne_da_prix_unitaire_estime'),
    ]

    operations = [
        # ── Créer ConditionTarifaire ──────────────────────────────────────────
        migrations.CreateModel(
            name='ConditionTarifaire',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('nom', models.CharField(max_length=100, unique=True, verbose_name='Nom')),
                ('mode_calcul', models.CharField(
                    choices=[('pourcentage', 'Pourcentage (%)'), ('montant_fixe', 'Montant fixe (FCFA)')],
                    default='pourcentage', max_length=15, verbose_name='Mode de calcul',
                )),
                ('type_effet', models.CharField(
                    choices=[('majoration', 'Majoration (frais, taxe)'), ('reduction', 'Réduction (remise, escompte)')],
                    default='majoration', max_length=15, verbose_name="Type d'effet",
                )),
                ('niveau', models.CharField(
                    choices=[('bc', 'Bon de commande (global)'), ('ligne', 'Ligne de commande')],
                    default='bc', max_length=10, verbose_name="Niveau d'application",
                )),
                ('valeur_defaut', models.DecimalField(decimal_places=4, default=0, max_digits=14, verbose_name='Valeur par défaut')),
                ('description', models.TextField(blank=True, verbose_name='Description')),
                ('actif', models.BooleanField(default=True, verbose_name='Actif')),
                ('date_creation', models.DateTimeField(auto_now_add=True)),
                ('date_modif', models.DateTimeField(auto_now=True)),
            ],
            options={'verbose_name': 'Condition tarifaire', 'verbose_name_plural': 'Conditions tarifaires', 'ordering': ['nom']},
        ),

        # ── Créer ConditionAppliqueeBC ────────────────────────────────────────
        migrations.CreateModel(
            name='ConditionAppliqueeBC',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('condition', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='applications', to='logistique.conditiontarifaire',
                )),
                ('bon_commande', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                    related_name='conditions', to='logistique.boncommande',
                )),
                ('ligne_bc', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                    related_name='conditions', to='logistique.ligneboncommande',
                )),
                ('ordre', models.PositiveSmallIntegerField(default=0, verbose_name="Ordre d'application")),
                ('valeur', models.DecimalField(
                    decimal_places=4, max_digits=14,
                    validators=[django.core.validators.MinValueValidator(0)],
                    verbose_name='Valeur',
                )),
                ('nom_snapshot', models.CharField(max_length=100, verbose_name='Nom (snapshot)')),
                ('mode_calcul_snapshot', models.CharField(max_length=15, verbose_name='Mode calcul (snapshot)')),
                ('type_effet_snapshot', models.CharField(max_length=15, verbose_name='Type effet (snapshot)')),
            ],
            options={'verbose_name': 'Condition appliquée BC', 'verbose_name_plural': 'Conditions appliquées BC', 'ordering': ['ordre']},
        ),
        migrations.AddConstraint(
            model_name='conditionappliqueebc',
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(bon_commande__isnull=False, ligne_bc__isnull=True) |
                    models.Q(bon_commande__isnull=True,  ligne_bc__isnull=False)
                ),
                name='condition_appliquee_bc_exclusif',
            ),
        ),

        # ── Data migration ────────────────────────────────────────────────────
        migrations.RunPython(migrate_forward, migrations.RunPython.noop),

        # ── Supprimer montant_frais et tva de BonCommande ─────────────────────
        migrations.RemoveField(model_name='boncommande',      name='montant_frais'),
        migrations.RemoveField(model_name='boncommande',      name='tva'),

        # ── Supprimer taux_tva de LigneBonCommande ────────────────────────────
        migrations.RemoveField(model_name='ligneboncommande', name='taux_tva'),

        # ── Supprimer FraisAnnexeBC et TypeFraisAnnexe ────────────────────────
        migrations.DeleteModel(name='FraisAnnexeBC'),
        migrations.DeleteModel(name='TypeFraisAnnexe'),
    ]
