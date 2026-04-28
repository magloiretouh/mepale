"""
MEPALE ERP — Utilitaire d'écritures automatiques (source='auto').

Usage :
    from comptabilite.utils.accounting_auto import create_auto_entry

    create_auto_entry(
        type         = 'income',
        label        = 'Paiement facture FV-2024-001',
        amount       = Decimal('150000'),
        date         = date.today(),
        category_name= 'Ventes de produits finis',
        ref_type     = 'facture_vente',
        ref_id       = facture.id,
    )
"""

from ..models import CategorieComptable, EcritureComptable


def create_auto_entry(
    *,
    type: str,
    label: str,
    amount,
    date,
    category_name: str | None = None,
    ref_type: str = '',
    ref_id=None,
    notes: str = '',
):
    """
    Crée une EcritureComptable (source='auto') uniquement si aucune n'existe
    déjà pour le couple (ref_type, ref_id).
    Idempotente : retourne None si l'écriture existe déjà.

    Paramètres
    ----------
    type          : 'income' ou 'expense'
    label         : libellé de l'écriture
    amount        : montant (Decimal ou float)
    date          : date de l'écriture (objet date)
    category_name : nom de la catégorie (recherche insensible à la casse)
    ref_type      : type de l'objet source ('facture_vente', 'bon_commande', …)
    ref_id        : UUID de l'objet source
    notes         : notes libres

    Retourne
    --------
    EcritureComptable | None
    """
    # Idempotence : une seule écriture auto par référence
    if ref_type and ref_id:
        existing = EcritureComptable.objects.filter(
            ref_type=ref_type, ref_id=ref_id,
        ).first()
        if existing:
            return None

    # Résolution de la catégorie par nom
    category = None
    if category_name:
        category = CategorieComptable.objects.filter(name__iexact=category_name).first()

    entry = EcritureComptable.objects.create(
        type     = type,
        label    = label,
        amount   = amount,
        date     = date,
        category = category,
        source   = EcritureComptable.Source.AUTO,
        ref_type = ref_type or '',
        ref_id   = ref_id,
        notes    = notes,
    )
    return entry
