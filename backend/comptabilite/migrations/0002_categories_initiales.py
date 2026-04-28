import uuid
from django.db import migrations


CATEGORIES = [
    # ── Recettes ────────────────────────────────────────────────────────────────
    {'name': 'Ventes de produits finis',     'type': 'income'},
    {'name': 'Ventes de marchandises',        'type': 'income'},
    {'name': 'Prestations de services',       'type': 'income'},
    {'name': 'Autres recettes',               'type': 'income'},
    # ── Charges ─────────────────────────────────────────────────────────────────
    {'name': 'Achats de matières premières',  'type': 'expense'},
    {'name': 'Charges de personnel',          'type': 'expense'},
    {'name': 'Charges locatives',             'type': 'expense'},
    {'name': 'Énergie et eau',                'type': 'expense'},
    {'name': 'Transport et déplacements',     'type': 'expense'},
    {'name': 'Entretien et réparations',      'type': 'expense'},
    {'name': 'Fournitures et consommables',   'type': 'expense'},
    {'name': 'Amortissements',                'type': 'expense'},
    {'name': 'Charges fiscales et taxes',     'type': 'expense'},
    {'name': 'Autres charges',                'type': 'expense'},
]


def create_categories(apps, schema_editor):
    CategorieComptable = apps.get_model('comptabilite', 'CategorieComptable')
    CategorieComptable.objects.bulk_create([
        CategorieComptable(id=uuid.uuid4(), is_system=True, **cat)
        for cat in CATEGORIES
    ])


def delete_categories(apps, schema_editor):
    CategorieComptable = apps.get_model('comptabilite', 'CategorieComptable')
    CategorieComptable.objects.filter(
        name__in=[c['name'] for c in CATEGORIES],
        is_system=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('comptabilite', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_categories, reverse_code=delete_categories),
    ]
