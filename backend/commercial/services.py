"""
MEPALE ERP — Services Commercial (logique métier)
Génération de références, vérification stock, mouvements de vente.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('mepale')


# ---------------------------------------------------------------------------
# Génération de références (thread-safe via SELECT FOR UPDATE)
# ---------------------------------------------------------------------------

@transaction.atomic
def generer_reference_client() -> str:
    """CLI-XXXX — Séquentiel global (pas de date dans le préfixe)."""
    from .models import Client
    dernier = (
        Client.objects
        .select_for_update()
        .filter(code__startswith='CLI-')
        .order_by('-code')
        .first()
    )
    seq = int(dernier.code.split('-')[-1]) + 1 if dernier else 1
    return f"CLI-{seq:04d}"


@transaction.atomic
def generer_reference_devis() -> str:
    """DEV-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import Devis
    today = timezone.now()
    prefix = f"DEV-{today.strftime('%y%m')}-"
    dernier = (
        Devis.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_cc() -> str:
    """CC-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import CommandeClient
    today = timezone.now()
    prefix = f"CC-{today.strftime('%y%m')}-"
    dernier = (
        CommandeClient.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_bl() -> str:
    """BL-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import BonLivraison
    today = timezone.now()
    prefix = f"BL-{today.strftime('%y%m')}-"
    dernier = (
        BonLivraison.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_facture_vente() -> str:
    """FVTE-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE.
    Préfixe FVTE pour distinguer des factures fournisseurs (FAC-).
    """
    from .models import FactureVente
    today = timezone.now()
    prefix = f"FVTE-{today.strftime('%y%m')}-"
    dernier = (
        FactureVente.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_retour_client() -> str:
    """RMA-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import RetourClient
    today = timezone.now()
    prefix = f"RMA-{today.strftime('%y%m')}-"
    dernier = (
        RetourClient.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


# ---------------------------------------------------------------------------
# Vérification stock (à la confirmation CC)
# ---------------------------------------------------------------------------

def verifier_stock_commande(commande) -> dict:
    """
    Vérifie la disponibilité du stock pour chaque ligne d'une commande client.
    Non bloquant — retourne des warnings seulement.

    Returns:
        {
            'tout_disponible': bool,
            'lignes': [
                {
                    'ligne_id': str,
                    'article': str,
                    'code': str,
                    'unite': str,
                    'quantite_commandee': float,
                    'quantite_disponible': float,
                    'suffisant': bool,
                    'ecart': float,
                }
            ]
        }
    """
    from logistique.models import StockArticle

    lignes_result = []
    tout_ok = True

    for ligne in commande.lignes.select_related('article__unite').all():
        try:
            stock = StockArticle.objects.get(article=ligne.article)
            qte_dispo = float(stock.quantite_disponible)
        except StockArticle.DoesNotExist:
            qte_dispo = 0.0

        qte_cmd = float(ligne.quantite_commandee)
        suffisant = qte_dispo >= qte_cmd
        if not suffisant:
            tout_ok = False

        lignes_result.append({
            'ligne_id':           str(ligne.id),
            'article':            ligne.article.designation,
            'code':               ligne.article.code,
            'unite':              ligne.article.unite.code if ligne.article.unite else '',
            'quantite_commandee': round(qte_cmd, 3),
            'quantite_disponible': round(qte_dispo, 3),
            'suffisant':          suffisant,
            'ecart':              round(max(0.0, qte_cmd - qte_dispo), 3),
        })

    return {
        'tout_disponible': tout_ok,
        'lignes': lignes_result,
    }


# ---------------------------------------------------------------------------
# Mouvement de vente (à l'expédition du BL)
# ---------------------------------------------------------------------------

@transaction.atomic
def creer_mouvement_vente(ligne_bl, user) -> 'logistique.MouvementStock':
    """
    Crée un MouvementStock de type SORTIE_VENTE et décrémente le stock.
    Lève ValueError si le stock est insuffisant (blocage BL).

    Args:
        ligne_bl: instance de LigneBL
        user: utilisateur qui effectue l'opération

    Returns:
        MouvementStock créé
    """
    from logistique.models import MouvementStock, StockArticle

    article = ligne_bl.article
    quantite = ligne_bl.quantite
    reference_doc = ligne_bl.bon_livraison.reference

    # Verrouillage optimiste du stock
    stock, _ = StockArticle.objects.select_for_update().get_or_create(
        article=article,
        defaults={'quantite_disponible': Decimal('0'), 'quantite_reservee': Decimal('0')}
    )

    if stock.quantite_disponible < quantite:
        raise ValueError(
            f"Stock insuffisant pour « {article.designation} » "
            f"(disponible : {stock.quantite_disponible} / demandé : {quantite})."
        )

    # Créer le mouvement
    mouvement = MouvementStock.objects.create(
        article=article,
        lot=ligne_bl.lot,
        type=MouvementStock.Type.SORTIE_VENTE,
        quantite=quantite,
        sens=-1,
        cout_unitaire=article.prix_standard or Decimal('0'),
        reference_doc=reference_doc,
        effectue_par=user,
    )

    # Décrémenter le stock
    stock.quantite_disponible -= quantite
    stock.save(update_fields=['quantite_disponible', 'derniere_maj'])

    logger.info(
        "VENTE — Sortie stock : %s × %s %s → BL %s",
        article.designation, quantite, article.unite.code if article.unite else '', reference_doc,
    )

    return mouvement


# ---------------------------------------------------------------------------
# Traitement d'un retour client (remise en stock)
# ---------------------------------------------------------------------------

@transaction.atomic
def traiter_retour_client(retour, user) -> list:
    """
    Traite un retour client en phase 'recu' :
    - Pour chaque ligne avec action=REMISE_EN_STOCK : crée un mouvement RETOUR_CLIENT (entrée)
    - Pour les autres actions : log uniquement (pas de mouvement stock)

    Returns:
        Liste des MouvementStock créés
    """
    from logistique.models import MouvementStock, StockArticle
    from .models import LigneRetourClient

    if retour.statut != 'recu':
        raise ValueError("Le retour doit être dans l'état 'recu' pour être traité.")

    mouvements = []

    for ligne in retour.lignes.select_related('article__unite').all():
        if ligne.action == LigneRetourClient.Action.REMISE_EN_STOCK:
            # Créer mouvement entrant
            # Note : RETOUR_CLIENT n'est pas dans MouvementStock.Type pour l'instant ;
            # on utilise AJUSTEMENT_POS en attendant un type dédié, ou on peut l'ajouter.
            # Pour l'instant, on crée un ajust_pos avec reference_doc = reference retour.
            mouvement = MouvementStock.objects.create(
                article=ligne.article,
                lot=ligne.lot,
                type=MouvementStock.Type.AJUSTEMENT_POS,
                quantite=ligne.quantite,
                sens=1,
                cout_unitaire=ligne.article.prix_standard or Decimal('0'),
                reference_doc=retour.reference,
                notes=f"Retour client — état : {ligne.get_etat_display()}",
                effectue_par=user,
            )
            # Incrémenter stock
            stock, _ = StockArticle.objects.select_for_update().get_or_create(
                article=ligne.article,
                defaults={'quantite_disponible': Decimal('0'), 'quantite_reservee': Decimal('0')}
            )
            stock.quantite_disponible += ligne.quantite
            stock.save(update_fields=['quantite_disponible', 'derniere_maj'])
            mouvements.append(mouvement)

            logger.info(
                "RETOUR CLIENT %s — Remise en stock : %s × %s",
                retour.reference, ligne.quantite, ligne.article.designation,
            )
        else:
            logger.info(
                "RETOUR CLIENT %s — %s : %s × %s (pas de mouvement stock)",
                retour.reference, ligne.get_action_display(), ligne.quantite, ligne.article.designation,
            )

    retour.statut = 'traite'
    retour.save(update_fields=['statut', 'date_modif'])

    return mouvements
