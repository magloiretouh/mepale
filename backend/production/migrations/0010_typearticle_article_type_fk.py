# Generated manually — 2026-03-22
# P2-A : Remplacement de Article.type (CharField TextChoices) par une FK vers TypeArticle.
#
# Stratégie de migration :
#   1. Créer le modèle TypeArticle
#   2. Ajouter Article.type_article_fk (FK nullable temporaire)
#   3. RunPython : créer les 4 types initiaux + peupler type_article_fk depuis l'ancien champ type
#   4. Supprimer l'ancien Article.type (CharField)
#   5. Renommer type_article_fk → type
#   6. AlterField → non-null + mettre à jour limit_choices_to de Nomenclature et LigneNomenclature
#   Même séquence pour HistoricalArticle.

import uuid
import django.db.models.deletion
from django.db import migrations, models


# ---------------------------------------------------------------------------
# Données initiales — 4 types reproduisant l'ancien Article.Type enum
# ---------------------------------------------------------------------------

TYPES_INITIAUX = [
    {
        'code': 'mp',
        'libelle': 'Matière première',
        'prefixe': 'MP',
        'peut_composer_bom': True,
        'peut_etre_produit_of': False,
        'peut_etre_achete': True,
    },
    {
        'code': 'pf',
        'libelle': 'Produit fini',
        'prefixe': 'PF',
        'peut_composer_bom': False,
        'peut_etre_produit_of': True,
        'peut_etre_achete': False,
    },
    {
        'code': 'sf',
        'libelle': 'Semi-fini',
        'prefixe': 'SF',
        'peut_composer_bom': True,
        'peut_etre_produit_of': True,
        'peut_etre_achete': True,
    },
    {
        'code': 'emballage',
        'libelle': 'Emballage/Consommable',
        'prefixe': 'EMB',
        'peut_composer_bom': True,
        'peut_etre_produit_of': False,
        'peut_etre_achete': True,
    },
]


def creer_types_et_migrer(apps, schema_editor):
    """
    1. Crée les 4 TypeArticle initiaux.
    2. Pour chaque Article existant, copie l'ancienne valeur string du champ type
       vers le nouveau FK type_article_fk.
    3. Idem pour HistoricalArticle (historique simple-history).
    """
    TypeArticle = apps.get_model('production', 'TypeArticle')
    Article = apps.get_model('production', 'Article')
    HistoricalArticle = apps.get_model('production', 'HistoricalArticle')

    # Créer les types et construire le mapping code → objet
    types_map = {}
    for td in TYPES_INITIAUX:
        t = TypeArticle.objects.create(
            id=uuid.uuid4(),
            code=td['code'],
            libelle=td['libelle'],
            prefixe=td['prefixe'],
            peut_composer_bom=td['peut_composer_bom'],
            peut_etre_produit_of=td['peut_etre_produit_of'],
            peut_etre_achete=td['peut_etre_achete'],
        )
        types_map[td['code']] = t

    # Migrer les articles courants
    for article in Article.objects.all():
        type_obj = types_map.get(article.type)
        if type_obj is None:
            # Type inconnu — fallback vers 'mp' pour ne pas bloquer
            type_obj = types_map.get('mp')
        article.type_article_fk = type_obj
        article.save(update_fields=['type_article_fk'])

    # Migrer les enregistrements historiques
    for h in HistoricalArticle.objects.all():
        type_obj = types_map.get(h.type)
        if type_obj is None:
            type_obj = types_map.get('mp')
        h.type_article_fk = type_obj
        h.save(update_fields=['type_article_fk'])


def reverse_migration(apps, schema_editor):
    """
    Rollback : repopule l'ancien champ type (CharField) depuis type_article_fk.code,
    puis supprime les TypeArticle créés.
    """
    TypeArticle = apps.get_model('production', 'TypeArticle')
    Article = apps.get_model('production', 'Article')
    HistoricalArticle = apps.get_model('production', 'HistoricalArticle')

    for article in Article.objects.select_related('type_article_fk').all():
        if article.type_article_fk:
            article.type = article.type_article_fk.code
            article.save(update_fields=['type'])

    for h in HistoricalArticle.objects.select_related('type_article_fk').all():
        if h.type_article_fk:
            h.type = h.type_article_fk.code
            h.save(update_fields=['type'])

    TypeArticle.objects.filter(code__in=[t['code'] for t in TYPES_INITIAUX]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0009_remove_reservationlot_unique_reservation_of_lot_and_more'),
    ]

    operations = [

        # ── 1. Créer le modèle TypeArticle ──────────────────────────────────
        migrations.CreateModel(
            name='TypeArticle',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('code', models.CharField(
                    help_text='Identifiant court unique (ex : mp, pf, sf, emballage). '
                              'Utilisé pour les intégrations et recherches rapides.',
                    max_length=20, unique=True, verbose_name='Code',
                )),
                ('libelle', models.CharField(max_length=100, verbose_name='Libellé')),
                ('prefixe', models.CharField(
                    blank=True, max_length=10,
                    help_text='Préfixe utilisé pour la génération automatique des codes articles '
                              '(ex : MP → MP-0001). Si vide, le code du type en majuscules est utilisé.',
                    verbose_name='Préfixe code article',
                )),
                ('peut_composer_bom', models.BooleanField(
                    default=False,
                    help_text='Si coché, les articles de ce type peuvent être ajoutés comme '
                              'composants (lignes) dans une nomenclature.',
                    verbose_name='Peut être composant BOM',
                )),
                ('peut_etre_produit_of', models.BooleanField(
                    default=False,
                    help_text="Si coché, les articles de ce type peuvent être le produit fini "
                              "d'un Ordre de Fabrication.",
                    verbose_name="Peut être produit d'un OF",
                )),
                ('peut_etre_achete', models.BooleanField(
                    default=True,
                    help_text="Si coché, les articles de ce type peuvent apparaître dans les "
                              "Demandes d'Achat et Bons de Commande.",
                    verbose_name="Peut faire l'objet d'un achat",
                )),
            ],
            options={
                'verbose_name': "Type d'article",
                'verbose_name_plural': "Types d'articles",
                'ordering': ['code'],
            },
        ),

        # ── 2. Ajouter Article.type_article_fk (nullable, temporaire) ───────
        migrations.AddField(
            model_name='article',
            name='type_article_fk',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='articles',
                to='production.typearticle',
                verbose_name='Type',
                help_text="Type de l'article — gère les capacités métier (BOM, OF, achat).",
            ),
        ),

        # ── 3. Ajouter HistoricalArticle.type_article_fk ────────────────────
        migrations.AddField(
            model_name='historicalarticle',
            name='type_article_fk',
            field=models.ForeignKey(
                blank=True, db_constraint=False, null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name='+',
                to='production.typearticle',
                verbose_name='Type',
            ),
        ),

        # ── 4. Migration de données ──────────────────────────────────────────
        migrations.RunPython(creer_types_et_migrer, reverse_migration),

        # ── 5. Supprimer l'ancien champ type (CharField) ────────────────────
        migrations.RemoveField(
            model_name='article',
            name='type',
        ),
        migrations.RemoveField(
            model_name='historicalarticle',
            name='type',
        ),

        # ── 6. Renommer type_article_fk → type ──────────────────────────────
        migrations.RenameField(
            model_name='article',
            old_name='type_article_fk',
            new_name='type',
        ),
        migrations.RenameField(
            model_name='historicalarticle',
            old_name='type_article_fk',
            new_name='type',
        ),

        # ── 7. Rendre type non-null (toutes les lignes sont maintenant peuplées)
        migrations.AlterField(
            model_name='article',
            name='type',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='articles',
                to='production.typearticle',
                verbose_name='Type',
                help_text="Type de l'article — gère les capacités métier (BOM, OF, achat).",
            ),
        ),
        migrations.AlterField(
            model_name='historicalarticle',
            name='type',
            field=models.ForeignKey(
                blank=True, db_constraint=False, null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name='+',
                to='production.typearticle',
                verbose_name='Type',
            ),
        ),

        # ── 8. Mettre à jour limit_choices_to sur Nomenclature et LigneNomenclature
        migrations.AlterField(
            model_name='nomenclature',
            name='produit_fini',
            field=models.ForeignKey(
                limit_choices_to={'type__peut_etre_produit_of': True},
                on_delete=django.db.models.deletion.CASCADE,
                related_name='nomenclatures',
                to='production.article',
                verbose_name='Produit fini',
            ),
        ),
        migrations.AlterField(
            model_name='historicalnomenclature',
            name='produit_fini',
            field=models.ForeignKey(
                blank=True, db_constraint=False,
                limit_choices_to={'type__peut_etre_produit_of': True},
                null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name='+',
                to='production.article',
                verbose_name='Produit fini',
            ),
        ),
        migrations.AlterField(
            model_name='lignenomenclature',
            name='matiere',
            field=models.ForeignKey(
                limit_choices_to={'type__peut_composer_bom': True},
                on_delete=django.db.models.deletion.PROTECT,
                related_name='utilisations_bom',
                to='production.article',
                verbose_name='Matière première',
            ),
        ),
    ]
