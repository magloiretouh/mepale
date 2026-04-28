"""
Data migration — Catégories de mouvement pré-installées (is_system=True).
Ces catégories sont requises par le workflow (transferts, intégrations).
"""

from django.db import migrations

CATEGORIES = [
    # ── Entrées ─────────────────────────────────────────────────────────────
    {'code': 'reglement_client',            'nom': 'Règlement client',            'type': 'entree', 'ordre': 1},
    {'code': 'versement_banque',            'nom': 'Versement banque',            'type': 'entree', 'ordre': 2},
    {'code': 'transfert_entree',            'nom': 'Transfert (entrée)',           'type': 'entree', 'ordre': 99},
    {'code': 'autre_entree',                'nom': 'Autre entrée',                'type': 'entree', 'ordre': 100},
    # ── Sorties ─────────────────────────────────────────────────────────────
    {'code': 'paiement_fournisseur',        'nom': 'Paiement fournisseur',        'type': 'sortie', 'ordre': 1},
    {'code': 'achat_urgent_production',     'nom': 'Achat urgent production',     'type': 'sortie', 'ordre': 2},
    {'code': 'frais_carburant',             'nom': 'Frais carburant',             'type': 'sortie', 'ordre': 3},
    {'code': 'frais_maintenance',           'nom': 'Frais maintenance',           'type': 'sortie', 'ordre': 4},
    {'code': 'frais_fournitures',           'nom': 'Frais fournitures',           'type': 'sortie', 'ordre': 5},
    {'code': 'remise_banque',               'nom': 'Remise en banque',            'type': 'sortie', 'ordre': 6},
    {'code': 'transfert_sortie',            'nom': 'Transfert (sortie)',          'type': 'sortie', 'ordre': 99},
    {'code': 'autre_sortie',               'nom': 'Autre sortie',                'type': 'sortie', 'ordre': 100},
]


def create_categories(apps, schema_editor):
    CategorieMouvement = apps.get_model('caisses', 'CategorieMouvement')
    for cat in CATEGORIES:
        CategorieMouvement.objects.get_or_create(
            code=cat['code'],
            defaults={
                'nom':       cat['nom'],
                'type':      cat['type'],
                'ordre':     cat['ordre'],
                'is_system': True,
                'actif':     True,
            },
        )


def remove_categories(apps, schema_editor):
    CategorieMouvement = apps.get_model('caisses', 'CategorieMouvement')
    CategorieMouvement.objects.filter(
        code__in=[c['code'] for c in CATEGORIES],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('caisses', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_categories, remove_categories),
    ]
