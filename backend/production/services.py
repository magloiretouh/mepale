"""
MEPALE ERP — Services Production (logique métier)
Séparation claire entre la logique et les vues (Clean Code).
"""

import logging
from datetime import date
from decimal import Decimal
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger('mepale')


def generer_reference_of() -> str:
    """Génère une référence unique OF-YYMM-XXXX."""
    from .models import OrdreFabrication
    today = timezone.now()
    prefix = f"OF-{today.strftime('%y%m')}-"
    dernier = (
        OrdreFabrication.objects
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = 1
    if dernier:
        try:
            seq = int(dernier.reference.split('-')[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    return f"{prefix}{seq:04d}"


def generer_numero_lot(article_code: str) -> str:
    """Génère un numéro de lot unique LOT-AAAAMMJJ-XXXX."""
    from .models import Lot
    today = timezone.now().date()
    prefix = f"LOT-{today.strftime('%Y%m%d')}-"
    dernier = (
        Lot.objects
        .filter(numero_lot__startswith=prefix)
        .order_by('-numero_lot')
        .first()
    )
    seq = 1
    if dernier:
        try:
            seq = int(dernier.numero_lot.split('-')[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    return f"{prefix}{seq:04d}"


def verifier_disponibilite_matieres(of) -> dict:
    """
    Vérifie que chaque matière première de la nomenclature
    est disponible en stock suffisant avant de lancer l'OF.
    Retourne un dict avec statut et détail par composant.
    """
    from logistique.models import StockArticle

    lignes = of.nomenclature.lignes.select_related('matiere__unite').all()
    resultats = []
    tout_ok = True

    for ligne in lignes:
        # Quantité nécessaire (avec perte)
        qte_necessaire = float(ligne.quantite_avec_perte) * float(of.quantite_prevue) / float(of.nomenclature.quantite_base)

        try:
            stock = StockArticle.objects.get(article=ligne.matiere)
            qte_dispo = float(stock.quantite_disponible)
        except Exception:
            qte_dispo = 0

        ok = qte_dispo >= qte_necessaire
        if not ok:
            tout_ok = False

        resultats.append({
            'matiere_id':        str(ligne.matiere.id),
            'matiere':           ligne.matiere.designation,
            'unite':             ligne.matiere.unite.code,
            'quantite_necessaire': round(qte_necessaire, 3),
            'quantite_disponible': round(qte_dispo, 3),
            'suffisant':         ok,
            'manque':            round(max(0, qte_necessaire - qte_dispo), 3),
        })

    return {
        'tout_disponible': tout_ok,
        'composants':      resultats,
    }


def _construire_snapshot_bom(of) -> dict:
    """
    P1-A — Construit un snapshot JSON figé de la nomenclature au moment de la
    confirmation. Ainsi toute modification ultérieure de la BOM n'impacte pas
    cet OF en cours.

    Structure retournée :
    {
        "quantite_base": float,
        "lignes": [
            {
                "article_id":          str (UUID),
                "article_code":        str,
                "article_designation": str,
                "unite_code":          str,
                "quantite":            float,   # par quantite_base
                "taux_perte":          float,   # %
                "quantite_avec_perte": float,   # = quantite × (1 + taux_perte/100)
            },
            ...
        ]
    }
    """
    nomen  = of.nomenclature
    lignes = nomen.lignes.select_related('matiere__unite').all()
    return {
        'quantite_base': float(nomen.quantite_base),
        'lignes': [
            {
                'article_id':          str(l.matiere_id),
                'article_code':        l.matiere.code,
                'article_designation': l.matiere.designation,
                'unite_code':          l.matiere.unite.code,
                'quantite':            float(l.quantite),
                'taux_perte':          float(l.taux_perte),
                'quantite_avec_perte': float(l.quantite_avec_perte),
            }
            for l in lignes
        ],
    }


@transaction.atomic
def confirmer_of(of) -> None:
    """
    Passe un OF de Brouillon → Confirmé :
    1. Construit et enregistre le snapshot BOM figé (P1-A)
    2. Réserve les composants en stock
    """
    from .models import OrdreFabrication
    from logistique.services import reserver_stock_of

    if of.statut != OrdreFabrication.Statut.BROUILLON:
        raise ValueError(f"L'OF {of.reference} n'est pas en statut Brouillon.")

    # P1-A : figer la nomenclature avant tout changement de statut
    of.lignes_snapshot = _construire_snapshot_bom(of)
    of.statut          = OrdreFabrication.Statut.CONFIRME
    of.save(update_fields=['statut', 'lignes_snapshot'])

    reserver_stock_of(of)
    logger.info("OF %s confirmé (snapshot BOM figé : %d lignes).",
                of.reference, len(of.lignes_snapshot['lignes']))


@transaction.atomic
def annuler_of(of) -> None:
    """
    Annule un OF (quel que soit son statut sauf Clôturé / déjà Annulé).
    Si l'OF était Confirmé ou En cours, libère la réservation de stock.
    """
    from .models import OrdreFabrication
    from logistique.services import liberer_reservation_of
    if of.statut in [OrdreFabrication.Statut.CLOTURE, OrdreFabrication.Statut.ANNULE]:
        raise ValueError(
            f"L'OF {of.reference} ne peut pas être annulé "
            f"(statut actuel : {of.get_statut_display()})."
        )
    # Libérer la réservation si le stock avait été alloué
    if of.statut in [OrdreFabrication.Statut.CONFIRME, OrdreFabrication.Statut.EN_COURS]:
        liberer_reservation_of(of)
    of.statut = OrdreFabrication.Statut.ANNULE
    of.save(update_fields=['statut'])
    logger.info("OF %s annulé.", of.reference)


def demarrer_of(of) -> None:
    """Passe un OF de Confirmé → En cours, après vérification obligatoire des stocks MP."""
    from .models import OrdreFabrication
    if of.statut != OrdreFabrication.Statut.CONFIRME:
        raise ValueError(f"L'OF {of.reference} doit être Confirmé pour démarrer.")

    # Vérification obligatoire : stock MP suffisant
    disponibilite = verifier_disponibilite_matieres(of)
    if not disponibilite['tout_disponible']:
        matieres_manquantes = [
            f"{c['matiere']} (manque {c['manque']} {c['unite']})"
            for c in disponibilite['composants']
            if not c['suffisant']
        ]
        raise ValueError(
            f"Stock MP insuffisant pour démarrer l'OF {of.reference}. "
            f"Matières manquantes : {', '.join(matieres_manquantes)}"
        )

    of.statut     = OrdreFabrication.Statut.EN_COURS
    of.date_debut = timezone.now()
    of.save(update_fields=['statut', 'date_debut'])
    logger.info("OF %s démarré.", of.reference)


@transaction.atomic
def terminer_of(of, quantite_produite: float, utilisateur) -> None:
    """Saisit la quantité produite et passe l'OF à Terminé."""
    from .models import OrdreFabrication
    if of.statut != OrdreFabrication.Statut.EN_COURS:
        raise ValueError(f"L'OF {of.reference} doit être En cours pour être terminé.")
    if quantite_produite <= 0:
        raise ValueError("La quantité produite doit être positive.")

    of.quantite_produite = Decimal(str(quantite_produite))
    of.statut            = OrdreFabrication.Statut.TERMINE
    of.date_fin          = timezone.now()
    of.save(update_fields=['quantite_produite', 'statut', 'date_fin'])
    logger.info("OF %s terminé. Quantité produite: %s", of.reference, quantite_produite)

    # Alerte si le rendement est inférieur au seuil paramétré
    rendement = of.rendement
    if rendement < float(of.seuil_rendement):
        logger.warning(
            "ALERTE RENDEMENT : OF %s — rendement %.2f%% < seuil %.2f%%",
            of.reference, rendement, float(of.seuil_rendement)
        )


@transaction.atomic
def cloture_of(of, utilisateur) -> 'CoutRevient':
    """
    Clôture un OF Terminé :
    1. [P1-B] Vérifie que les pertes PF ne dépassent pas le seuil configuré
    2. Génère un lot de produit fini
    3. Consomme les MP (FIFO, en utilisant le snapshot BOM si disponible — P1-A)
    4. [P1-C] Calcule le coût de revient en imputant les rebuts PF sur le coût unitaire
    5. Passe le statut à Clôturé
    """
    from django.db.models import Sum
    from .models import OrdreFabrication, Lot, CoutRevient
    from logistique.services import sortir_stock_matieres, entrer_stock_lot

    if of.statut != OrdreFabrication.Statut.TERMINE:
        raise ValueError(f"L'OF {of.reference} doit être Terminé pour être clôturé.")

    # ── P1-B : Vérification bloquante du seuil de pertes ───────────────────
    # On comptabilise uniquement les pertes du produit fini (rebuts PF)
    # et on vérifie que leur taux ne dépasse pas le seuil paramétré sur l'OF.
    rebuts_pf_qte = (
        of.pertes
        .filter(article=of.nomenclature.produit_fini)
        .aggregate(total=Sum('quantite'))['total']
        or Decimal('0')
    )
    if of.quantite_prevue and of.quantite_prevue > 0:
        pct_rebut = float(rebuts_pf_qte / of.quantite_prevue * 100)
    else:
        pct_rebut = 0.0

    if pct_rebut > float(of.seuil_perte):
        raise ValueError(
            f"Clôture bloquée — les rebuts enregistrés ({pct_rebut:.1f}% de la "
            f"quantité prévue) dépassent le seuil configuré ({of.seuil_perte}%). "
            f"Réduisez les pertes ou ajustez le seuil avant de clôturer l'OF {of.reference}."
        )

    # ── 1. Créer le lot de produit fini ────────────────────────────────────
    numero_lot = generer_numero_lot(of.nomenclature.produit_fini.code)
    lot_pf = Lot.objects.create(
        article=of.nomenclature.produit_fini,
        numero_lot=numero_lot,
        date_fabrication=timezone.now().date(),
        quantite_initiale=of.quantite_produite,
        quantite_restante=of.quantite_produite,
        cout_unitaire=0,  # sera mis à jour après calcul coût
        statut=Lot.Statut.DISPONIBLE,
        ordre_fabrication=of,
    )
    logger.info("Lot PF créé : %s", numero_lot)

    # ── 2. Sortir les matières premières (FIFO + snapshot P1-A) ────────────
    cout_matieres = sortir_stock_matieres(of, lot_pf, utilisateur)

    # ── 3. Calculer le coût de revient ──────────────────────────────────────
    cout, _ = CoutRevient.objects.get_or_create(of=of)
    cout.cout_matieres = cout_matieres
    cout.cout_standard = float(of.nomenclature.cout_standard)
    # Main d'œuvre et charges : 0 par défaut (à saisir manuellement si besoin)

    # ── P1-C : Imputer les rebuts PF sur le coût unitaire réel ─────────────
    # Si des unités PF ont été rebutées, le coût total est réparti sur les
    # seules unités bonnes (quantite_produite − rebuts), ce qui donne un
    # coût unitaire correct par unité commercialisable.
    quantite_bonne = max(
        Decimal('0.001'),
        of.quantite_produite - rebuts_pf_qte
    )
    cout.calculer(quantite_base_override=quantite_bonne)

    if rebuts_pf_qte > 0:
        logger.info(
            "OF %s — P1-C : %s unité(s) rebutée(s) imputées au coût. "
            "Coût calculé sur %s unités bonnes.",
            of.reference, rebuts_pf_qte, quantite_bonne
        )

    # ── 4. Mettre à jour le coût unitaire du lot PF ─────────────────────────
    lot_pf.cout_unitaire = cout.cout_unitaire
    lot_pf.save(update_fields=['cout_unitaire'])

    # ── 5. Entrée stock PF ──────────────────────────────────────────────────
    entrer_stock_lot(lot_pf)

    # ── 6. Clôturer l'OF ────────────────────────────────────────────────────
    of.statut = OrdreFabrication.Statut.CLOTURE
    of.save(update_fields=['statut'])
    logger.info(
        "OF %s clôturé. Coût unitaire : %s FCFA (rebuts PF : %s, unités bonnes : %s).",
        of.reference, cout.cout_unitaire, rebuts_pf_qte, quantite_bonne
    )

    return cout
