"""
MEPALE ERP — Services Logistique (logique métier)
Gestion du stock : FIFO par date de péremption, mouvements, réceptions.
"""

import logging
from decimal import Decimal
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger('mepale')


def _maj_stock_article(article, quantite: Decimal, sens: int) -> None:
    """
    Met à jour le solde de StockArticle.
    sens = +1 (entrée) ou -1 (sortie).
    """
    from .models import StockArticle
    stock, _ = StockArticle.objects.select_for_update().get_or_create(
        article=article,
        defaults={'quantite_disponible': 0, 'quantite_reservee': 0, 'seuil_alerte': 0}
    )
    stock.quantite_disponible += sens * quantite
    stock.save(update_fields=['quantite_disponible', 'derniere_maj'])

    if stock.est_sous_seuil:
        logger.warning(
            "ALERTE STOCK : %s — quantité dispo %s < seuil %s",
            article.designation, stock.quantite_disponible, stock.seuil_alerte
        )


@transaction.atomic
def entrer_stock_lot(lot) -> None:
    """
    Entrée en stock d'un lot (produit fini ou réception).
    Crée un MouvementStock et met à jour StockArticle.

    P1-A — Méthode V (Prix moyen mobile / CMUP) :
    Si l'article utilise la méthode V, recalcule le CMUP avant d'incrémenter
    le stock selon la formule :
        cmup_nouveau = (qté_avant × cmup_avant + qté_entrée × prix_entrée)
                       / (qté_avant + qté_entrée)
    La méthode S (prix standard) ne déclenche aucun recalcul automatique.
    """
    from .models import MouvementStock, StockArticle

    type_mvt = (
        MouvementStock.Type.ENTREE_PRODUCTION
        if lot.ordre_fabrication is not None
        else MouvementStock.Type.ENTREE_RECEPTION
    )

    MouvementStock.objects.create(
        article=lot.article,
        lot=lot,
        type=type_mvt,
        quantite=lot.quantite_initiale,
        sens=1,
        cout_unitaire=lot.cout_unitaire,
        reference_doc=lot.numero_lot,
    )

    # ── P1-A : Recalcul CMUP (méthode V uniquement) ─────────────────────────
    if lot.article.methode_valorisation == 'V':
        try:
            stock_actuel = StockArticle.objects.select_for_update().get(article=lot.article)
            qte_avant = max(stock_actuel.quantite_disponible, Decimal('0'))
        except StockArticle.DoesNotExist:
            qte_avant = Decimal('0')

        cmup_avant  = Decimal(str(lot.article.prix_standard or 0))
        qte_entree  = Decimal(str(lot.quantite_initiale))
        prix_entree = Decimal(str(lot.cout_unitaire))
        denom = qte_avant + qte_entree

        if denom > 0:
            nouveau_cmup = (qte_avant * cmup_avant + qte_entree * prix_entree) / denom
            nouveau_cmup = nouveau_cmup.quantize(Decimal('0.0001'))
            lot.article.prix_standard = nouveau_cmup
            lot.article.save(update_fields=['prix_standard'])
            logger.info(
                "CMUP %s : %s → %s FCFA (réception %s × %s FCFA/u)",
                lot.article.code, float(cmup_avant), float(nouveau_cmup),
                float(qte_entree), float(prix_entree),
            )

    _maj_stock_article(lot.article, lot.quantite_initiale, 1)
    logger.info("Entrée stock : %s × %s (%s)", lot.article.designation, lot.quantite_initiale, lot.numero_lot)


@transaction.atomic
def reserver_stock_of(of) -> None:
    """
    P2-D — Réservation granulaire par lot (lot-level picking).

    Au lieu de simplement incrémenter StockArticle.quantite_reservee de façon
    globale, on alloue des lots MP précis à l'OF via le modèle ReservationLot :

    1. Pour chaque composant (via snapshot BOM ou live), on sélectionne les lots
       disponibles en FIFO en déduisant les quantités déjà réservées par d'autres OFs.
    2. On crée un enregistrement ReservationLot par lot retenu.
    3. On met à jour le compteur global StockArticle (disponible → réservé).

    Avantage : deux OFs ne peuvent pas réserver les mêmes unités physiques d'un lot.
    """
    from production.models import Lot, ReservationLot
    from .models import StockArticle
    from django.db.models import Sum

    for article, unite_code, qap, quantite_base in _iter_lignes_of(of):
        qte_a_reserver = Decimal(str(
            float(qap) * float(of.quantite_prevue) / float(quantite_base)
        ))

        # Pré-calculer les réservations existantes PAR LOT (sans select_for_update
        # pour éviter "FOR UPDATE n'est pas autorisé avec la clause GROUP BY" sur PG)
        lots_disponibles_ids = list(
            Lot.objects
            .filter(article=article, statut=Lot.Statut.DISPONIBLE)
            .values_list('id', flat=True)
        )
        reservations_par_lot = dict(
            ReservationLot.objects
            .filter(lot_id__in=lots_disponibles_ids)
            .values('lot_id')
            .annotate(total=Sum('quantite_reservee'))
            .values_list('lot_id', 'total')
        )

        # Verrouiller les lots (sans annotation pour éviter le GROUP BY)
        lots_mp = (
            Lot.objects
            .select_for_update()
            .filter(article=article, statut=Lot.Statut.DISPONIBLE)
            .order_by('date_peremption', 'date_creation')
        )

        total_reserve_article = Decimal('0')

        for lot in lots_mp:
            if qte_a_reserver <= Decimal('0'):
                break
            qty_deja_reservee = Decimal(str(reservations_par_lot.get(lot.id, 0)))
            qty_nette = lot.quantite_restante - qty_deja_reservee
            if qty_nette <= Decimal('0'):
                continue
            qty_prise = min(qty_nette, qte_a_reserver)

            ReservationLot.objects.create(
                ordre_fabrication=of,
                lot=lot,
                article=article,
                quantite_reservee=qty_prise,
            )
            total_reserve_article += qty_prise
            qte_a_reserver        -= qty_prise

        # Mettre à jour le compteur global (disponible → réservé) pour la part via lots
        if total_reserve_article > 0:
            stock, _ = StockArticle.objects.select_for_update().get_or_create(
                article=article,
                defaults={
                    'quantite_disponible': Decimal('0'),
                    'quantite_reservee':   Decimal('0'),
                    'seuil_alerte':        Decimal('0'),
                },
            )
            stock.quantite_disponible -= total_reserve_article
            stock.quantite_reservee   += total_reserve_article
            stock.save(update_fields=['quantite_disponible', 'quantite_reservee', 'derniere_maj'])

        # Fallback : réservation sans lot (stock global, article non géré par lot)
        if qte_a_reserver > Decimal('0'):
            try:
                # .get() uniquement — on ne crée PAS de StockArticle avec quantite=0
                stock_global = StockArticle.objects.select_for_update().get(article=article)
            except StockArticle.DoesNotExist:
                stock_global = None

            if stock_global and stock_global.quantite_disponible > Decimal('0'):
                qte_sans_lot = min(stock_global.quantite_disponible, qte_a_reserver)
                stock_global.quantite_disponible -= qte_sans_lot
                stock_global.quantite_reservee   += qte_sans_lot
                stock_global.save(update_fields=['quantite_disponible', 'quantite_reservee', 'derniere_maj'])
                qte_a_reserver -= qte_sans_lot
                logger.info(
                    "OF %s : réservation sans lot %s — %s %s (stock global)",
                    of.reference, article.designation, qte_sans_lot, unite_code,
                )

            if qte_a_reserver > Decimal('0.001'):
                logger.warning(
                    "OF %s : réservation partielle pour %s — %s %s non couverts "
                    "(ni lots disponibles ni stock global suffisant).",
                    of.reference, article.designation, qte_a_reserver, unite_code,
                )

    count = of.reservations.count() if hasattr(of, 'reservations') else '?'
    logger.info("OF %s : %s réservation(s) lot + fallback sans lot traité(s).", of.reference, count)


@transaction.atomic
def liberer_reservation_of(of) -> None:
    """
    Libère la réservation de stock d'un OF (annulation ou avant clôture).

    Chemin P2-D (nouveaux OFs avec ReservationLot) :
        → Supprime les ReservationLot, restaure StockArticle par article.

    Chemin héritage (anciens OFs sans ReservationLot) :
        → Recalcule depuis BOM/snapshot et restaure globalement.

    Protégé contre les doubles appels dans les deux chemins.
    """
    from production.models import ReservationLot
    from .models import StockArticle
    from django.db.models import Sum

    reservations_qs = ReservationLot.objects.filter(ordre_fabrication=of)

    if reservations_qs.exists():
        # ── Chemin P2-D : libération granulaire ────────────────────────────
        # Construire le dict article_id → quantite_reservee_via_lots AVANT suppression
        par_article_lot = {
            res['article']: Decimal(str(res['total']))
            for res in reservations_qs.values('article').annotate(total=Sum('quantite_reservee'))
        }

        # Libérer la part via lots
        for article_id, qte_lot in par_article_lot.items():
            try:
                stock = StockArticle.objects.select_for_update().get(article_id=article_id)
                liberation = min(stock.quantite_reservee, qte_lot)
                stock.quantite_reservee   -= liberation
                stock.quantite_disponible += liberation
                stock.save(update_fields=['quantite_disponible', 'quantite_reservee', 'derniere_maj'])
            except StockArticle.DoesNotExist:
                pass

        deleted_count = reservations_qs.delete()[0]
        logger.info("OF %s : %d réservation(s) lot libérée(s) (P2-D).", of.reference, deleted_count)

        # Libérer aussi la part "sans lot" = BOM requis − couverts par lots
        for article, unite_code, qap, quantite_base in _iter_lignes_of(of):
            qte_bom     = Decimal(str(float(qap) * float(of.quantite_prevue) / float(quantite_base)))
            qte_via_lot = par_article_lot.get(article.id, Decimal('0'))
            qte_sans_lot = qte_bom - qte_via_lot
            if qte_sans_lot > Decimal('0.001'):
                try:
                    stock = StockArticle.objects.select_for_update().get(article=article)
                    liberation = min(stock.quantite_reservee, qte_sans_lot)
                    if liberation > Decimal('0'):
                        stock.quantite_reservee   -= liberation
                        stock.quantite_disponible += liberation
                        stock.save(update_fields=['quantite_disponible', 'quantite_reservee', 'derniere_maj'])
                        logger.info(
                            "OF %s : libération sans lot %s — %s %s",
                            of.reference, article.designation, liberation, unite_code,
                        )
                except StockArticle.DoesNotExist:
                    pass

    else:
        # ── Chemin héritage : libération globale par composant ──────────────
        for article, unite_code, qap, quantite_base in _iter_lignes_of(of):
            qte = Decimal(str(
                float(qap) * float(of.quantite_prevue) / float(quantite_base)
            ))
            try:
                stock = StockArticle.objects.select_for_update().get(article=article)
                liberation = min(stock.quantite_reservee, qte)
                stock.quantite_reservee   -= liberation
                stock.quantite_disponible += liberation
                stock.save(update_fields=['quantite_disponible', 'quantite_reservee', 'derniere_maj'])
            except StockArticle.DoesNotExist:
                pass

        logger.info("OF %s : réservation stock libérée (mode héritage).", of.reference)


def _iter_lignes_of(of):
    """
    P1-A — Générateur qui yield des tuples (article, unite_code, qte_avec_perte_par_base, quantite_base)
    en privilégiant le snapshot figé à la confirmation plutôt que la BOM live.

    Cas 1 — Snapshot disponible (OF confirmé après déploiement de la migration 0005) :
        → utilise les données copiées au moment de la confirmation.
    Cas 2 — Pas de snapshot (OFs antérieurs) :
        → lecture directe de la nomenclature (comportement historique).

    Chaque élément yielded :
        (article_obj, unite_code_str, quantite_avec_perte_float, quantite_base_decimal)
    """
    from production.models import Article

    if of.lignes_snapshot:
        # Chemin P1-A : données figées
        quantite_base = Decimal(str(of.lignes_snapshot['quantite_base']))
        for snap in of.lignes_snapshot['lignes']:
            article = Article.objects.get(pk=snap['article_id'])
            yield article, snap['unite_code'], snap['quantite_avec_perte'], quantite_base
    else:
        # Chemin héritage : BOM live (OFs sans snapshot)
        nomen  = of.nomenclature
        lignes = nomen.lignes.select_related('matiere__unite').all()
        for ligne in lignes:
            yield ligne.matiere, ligne.matiere.unite.code, float(ligne.quantite_avec_perte), nomen.quantite_base


@transaction.atomic
def sortir_stock_matieres(of, lot_pf, utilisateur) -> Decimal:
    """
    Consomme les matières premières de l'OF en FIFO (date_peremption ASC).

    P1-A : si un snapshot BOM est disponible (confirmé après migration 0005),
    les quantités à consommer proviennent du snapshot et non de la BOM live.
    Garantit que toute modification de nomenclature postérieure à la confirmation
    n'affecte pas la consommation réelle.

    Commence par libérer la réservation (disponible → réservé avait été fait à la
    confirmation), puis consomme réellement depuis quantite_disponible via FIFO.
    Crée les ConsommationLot et MouvementStock pour chaque lot MP consommé.
    Retourne le coût total des matières consommées (FCFA).
    """
    # Libérer d'abord la réservation pour que le FIFO travaille sur disponible
    liberer_reservation_of(of)
    from production.models import Lot, ConsommationLot
    from .models import MouvementStock

    source = "snapshot figé" if of.lignes_snapshot else "nomenclature live (héritage)"
    logger.info("OF %s — sortie stock MP via %s.", of.reference, source)

    cout_total = Decimal('0')

    for article, unite_code, qap, quantite_base in _iter_lignes_of(of):
        qte_a_consommer = Decimal(str(
            float(qap) * float(of.quantite_produite) / float(quantite_base)
        ))

        # Récupérer les lots MP disponibles en FIFO (date_peremption ASC)
        lots_mp = (
            Lot.objects
            .select_for_update()
            .filter(article=article, statut=Lot.Statut.DISPONIBLE)
            .order_by('date_peremption', 'date_creation')
        )

        for lot_mp in lots_mp:
            if qte_a_consommer <= 0:
                break

            qte_prise = min(lot_mp.quantite_restante, qte_a_consommer)
            cout_total += qte_prise * lot_mp.cout_unitaire

            # Consommation
            lot_mp.quantite_restante -= qte_prise
            if lot_mp.quantite_restante == 0:
                lot_mp.statut = Lot.Statut.EPUISE
            lot_mp.save(update_fields=['quantite_restante', 'statut'])

            # Traçabilité
            ConsommationLot.objects.create(
                of=of, lot_mp=lot_mp, lot_pf=lot_pf, quantite=qte_prise
            )

            # Mouvement de stock
            MouvementStock.objects.create(
                article=article,
                lot=lot_mp,
                type=MouvementStock.Type.SORTIE_PRODUCTION,
                quantite=qte_prise,
                sens=-1,
                cout_unitaire=lot_mp.cout_unitaire,
                reference_doc=of.reference,
                effectue_par=utilisateur,
            )
            _maj_stock_article(article, qte_prise, -1)
            qte_a_consommer -= qte_prise

        # Fallback : consommation sans lot (stock global, article non géré par lot)
        if qte_a_consommer > Decimal('0.001'):
            from .models import StockArticle
            try:
                stock = StockArticle.objects.select_for_update().get(article=article)
                qte_sans_lot = min(stock.quantite_disponible, qte_a_consommer)
                if qte_sans_lot > Decimal('0'):
                    prix_u = Decimal(str(article.prix_standard or 0))
                    cout_total += qte_sans_lot * prix_u
                    _maj_stock_article(article, qte_sans_lot, -1)
                    MouvementStock.objects.create(
                        article=article,
                        lot=None,
                        type=MouvementStock.Type.SORTIE_PRODUCTION,
                        quantite=qte_sans_lot,
                        sens=-1,
                        cout_unitaire=prix_u,
                        reference_doc=of.reference,
                        effectue_par=utilisateur,
                    )
                    qte_a_consommer -= qte_sans_lot
                    logger.info(
                        "OF %s : consommation sans lot %s — %s %s",
                        of.reference, article.designation, qte_sans_lot, unite_code,
                    )
            except StockArticle.DoesNotExist:
                pass

            if qte_a_consommer > Decimal('0.001'):
                logger.warning(
                    "OF %s : stock insuffisant pour %s — manque %s %s",
                    of.reference, article.designation,
                    qte_a_consommer, unite_code,
                )

    return cout_total


def verifier_pas_inventaire_en_cours() -> None:
    """
    Lève une ValueError si une session d'inventaire physique est en cours.
    À appeler avant tout mouvement de stock (réceptions, destructions...).
    """
    from .models import InventaireSession
    if InventaireSession.objects.filter(statut='en_cours').exists():
        raise ValueError(
            "Opération bloquée : une session d'inventaire est en cours. "
            "Veuillez la finaliser ou l'annuler avant d'effectuer des mouvements de stock."
        )


@transaction.atomic
def valider_reception(reception, utilisateur) -> None:
    """
    Valide une réception :
    1. Vérifie qu'aucun inventaire n'est en cours
    2. Crée un lot MP par ligne de réception
       P2-D → date de péremption calculée automatiquement si non saisie
       P3-E → quantité et prix convertis en unité de stock si unite_achat ≠ unite
    3. GAP R2 — Lots CONFORMES → DISPONIBLE (entrer_stock_lot appelé).
                Lots NON CONFORMES → BLOQUÉ (lot créé mais PAS entré en stock dispo).
    4. GAP R14 — Appendice note + log si lignes NC.
    5. Met à jour les quantités reçues sur le BC.
    """
    from datetime import timedelta
    from production.models import Lot
    from production.services import generer_numero_lot

    if reception.statut != 'en_cours':
        raise ValueError("La réception est déjà validée.")

    # M3 — Gel granulaire : vérifier article par article plutôt que bloquer toute réception
    # si un inventaire partiel (CATEGORIE/ARTICLES) est en cours sur d'autres articles.
    lignes_all = list(reception.lignes.select_related('ligne_bc__article').all())
    bloquees = []
    for ligne in lignes_all:
        session_ref = verifier_gel_stock(ligne.ligne_bc.article)
        if session_ref:
            bloquees.append(
                f"'{ligne.ligne_bc.article.designation}' (inventaire {session_ref} en cours)"
            )
    if bloquees:
        raise ValueError(
            "Réception bloquée — les articles suivants sont gelés :\n"
            + "\n".join(f"  • {b}" for b in bloquees)
        )

    lignes_nc = []   # GAP R14 — collecte des non-conformités

    for ligne in reception.lignes.select_related(
        'ligne_bc__article__unite',
        'ligne_bc__article__unite_achat',
    ).all():
        article = ligne.ligne_bc.article

        # ── P2-D : Date de péremption automatique ──────────────────────────
        date_peremption = ligne.date_peremption
        if date_peremption is None and article.duree_vie_jours:
            date_peremption = reception.date_reception + timedelta(days=article.duree_vie_jours)
            logger.info(
                "Péremption auto %s : %s + %d j = %s",
                article.code, reception.date_reception,
                article.duree_vie_jours, date_peremption,
            )

        # ── P3-E : Conversion unité achat → unité stock ─────────────────────
        prix_u = ligne.ligne_bc.prix_unitaire
        quantite_en_stock = ligne.quantite_recue

        if (
            article.unite_achat_id is not None
            and article.unite_achat_id != article.unite_id
            and article.coefficient_conversion != 1
        ):
            quantite_en_stock = article.convertir_achat_vers_stock(ligne.quantite_recue)
            prix_u            = article.prix_achat_vers_stock(prix_u)
            logger.info(
                "Conversion UoM %s : %s %s → %s %s | prix %s → %s FCFA/u",
                article.code,
                float(ligne.quantite_recue), article.unite_achat.code,
                float(quantite_en_stock),    article.unite.code,
                float(ligne.ligne_bc.prix_unitaire), float(prix_u),
            )

        # ── GAP R2 : statut lot selon conformité ────────────────────────────
        statut_lot = Lot.Statut.DISPONIBLE if ligne.conforme else Lot.Statut.BLOQUE

        numero_lot = generer_numero_lot(article.code)
        lot = Lot.objects.create(
            article=article,
            numero_lot=numero_lot,
            date_fabrication=reception.date_reception,
            date_peremption=date_peremption,
            quantite_initiale=quantite_en_stock,
            quantite_restante=quantite_en_stock,
            cout_unitaire=prix_u,
            statut=statut_lot,
        )

        # Lien réception → lot
        ligne.lot_cree = lot
        ligne.save(update_fields=['lot_cree'])

        # Mettre à jour le BC (quantité en unite_achat pour cohérence BC)
        ligne_bc = ligne.ligne_bc
        ligne_bc.quantite_recue += ligne.quantite_recue
        ligne_bc.save(update_fields=['quantite_recue'])

        if ligne.conforme:
            # Entrée stock dispo (déclenche recalcul CMUP si méthode V — P1-A)
            entrer_stock_lot(lot)
        else:
            # GAP R2 : lot BLOQUÉ → pas d'entrée en stock disponible,
            # mais on trace quand même un mouvement de quarantaine.
            from .models import MouvementStock
            MouvementStock.objects.create(
                article=article,
                lot=lot,
                type=MouvementStock.Type.ENTREE_RECEPTION,
                quantite=quantite_en_stock,
                sens=1,
                cout_unitaire=prix_u,
                reference_doc=reception.reference,
                notes=f"[QUARANTAINE NC] {ligne.motif_non_conformite or 'Non conforme'}",
                effectue_par=utilisateur,
            )
            lignes_nc.append(
                f"{article.designation} × {ligne.quantite_recue} "
                f"({ligne.motif_non_conformite or 'sans motif'})"
            )
            logger.warning(
                "LOT NC [%s] %s — article %s — motif : %s",
                lot.numero_lot, reception.reference,
                article.code, ligne.motif_non_conformite or 'non précisé',
            )

    # ── GAP R14 : note NC + log fournisseur ────────────────────────────────
    if lignes_nc:
        note_nc = (
            f"[NON-CONFORMITÉS] {len(lignes_nc)} ligne(s) NC — lots mis en quarantaine :\n"
            + "\n".join(f"  • {l}" for l in lignes_nc)
        )
        reception.notes = f"{reception.notes}\n{note_nc}".strip()
        reception.save(update_fields=['notes'])
        logger.warning(
            "Réception %s — %d ligne(s) NC (fournisseur : %s).",
            reception.reference, len(lignes_nc),
            reception.bon_commande.fournisseur.raison_sociale,
        )

    reception.statut = 'validee'
    reception.save(update_fields=['statut'])
    logger.info("Réception %s validée (%d NC).", reception.reference, len(lignes_nc))

    # Mettre à jour le statut du BC selon les quantités reçues cumulées
    from .models import BonCommande
    bc = reception.bon_commande
    lignes_bc = list(bc.lignes.all())
    if all(l.quantite_recue >= l.quantite_commandee for l in lignes_bc):
        bc.statut = BonCommande.Statut.RECU
    elif any(l.quantite_recue > 0 for l in lignes_bc):
        bc.statut = BonCommande.Statut.PARTIELLEMENT_RECU
    bc.save(update_fields=['statut'])
    logger.info("BC %s statut mis à jour → %s", bc.reference, bc.statut)


@transaction.atomic
def valider_retour(retour, utilisateur) -> None:
    """
    GAP R4 — Valide un retour fournisseur :
    1. Pour chaque LigneRetour :
       - Réduit la quantité du lot source (lot_cree sur LigneReception)
       - Si lot DISPONIBLE → soustrait de StockArticle.quantite_disponible
       - Si lot BLOQUÉ    → aucune soustraction (jamais entré en disponible)
       - Crée un MouvementStock (RETOUR_FOURNISSEUR, sens=-1)
    2. Marque le retour comme validé.
    3. Si toutes les lignes de la réception sont retournées → marque la réception REJETEE.
    """
    from production.models import Lot
    from .models import MouvementStock

    if retour.statut != 'en_cours':
        raise ValueError("Ce retour est déjà validé.")

    # M3 — Gel granulaire : vérifier article par article
    lignes_ret = list(retour.lignes.select_related(
        'ligne_reception__lot_cree__article'
    ).all())
    bloquees = []
    for ligne in lignes_ret:
        lot = ligne.ligne_reception.lot_cree
        if lot:
            session_ref = verifier_gel_stock(lot.article)
            if session_ref:
                bloquees.append(
                    f"'{lot.article.designation}' (inventaire {session_ref} en cours)"
                )
    if bloquees:
        raise ValueError(
            "Retour bloqué — les articles suivants sont gelés :\n"
            + "\n".join(f"  • {b}" for b in bloquees)
        )

    for ligne in retour.lignes.select_related(
        'ligne_reception__lot_cree__article__unite',
        'ligne_reception__ligne_bc__article',
    ).all():
        lot = ligne.ligne_reception.lot_cree
        if lot is None:
            raise ValueError(
                f"La ligne de réception {ligne.ligne_reception_id} n'a pas de lot associé. "
                "Validez d'abord la réception avant de créer un retour."
            )

        article = lot.article
        qte     = Decimal(str(ligne.quantite_retournee))

        if qte > lot.quantite_restante:
            raise ValueError(
                f"Quantité retournée ({qte}) supérieure à la quantité restante "
                f"du lot {lot.numero_lot} ({lot.quantite_restante})."
            )

        # Réduire le lot
        lot.quantite_restante -= qte
        if lot.quantite_restante <= Decimal('0'):
            lot.statut = Lot.Statut.EPUISE
        lot.save(update_fields=['quantite_restante', 'statut'])

        # Mouvement de retour
        MouvementStock.objects.create(
            article=article,
            lot=lot,
            type=MouvementStock.Type.RETOUR_FOURNISSEUR,
            quantite=qte,
            sens=-1,
            cout_unitaire=lot.cout_unitaire,
            reference_doc=retour.reference,
            notes=f"Retour fournisseur — {retour.motif}",
            effectue_par=utilisateur,
        )

        # Mettre à jour le stock disponible uniquement si le lot était DISPONIBLE
        # (les lots BLOQUÉ n'avaient jamais été ajoutés à quantite_disponible)
        if lot.statut != Lot.Statut.BLOQUE:
            _maj_stock_article(article, qte, -1)

        logger.info(
            "Retour %s : %s × %s %s (lot %s, statut : %s) retourné à %s.",
            retour.reference, float(qte), article.unite.code, article.designation,
            lot.numero_lot, lot.statut, retour.fournisseur.raison_sociale,
        )

    retour.statut = 'valide'
    retour.save(update_fields=['statut'])

    # Marquer la réception REJETEE si toutes ses lignes sont désormais entièrement retournées
    reception = retour.reception
    toutes_retournees = all(
        _quantite_retournee_ligne(l) >= l.quantite_recue
        for l in reception.lignes.all()
    )
    if toutes_retournees and reception.statut == 'validee':
        reception.statut = 'rejetee'
        reception.save(update_fields=['statut'])
        logger.info("Réception %s marquée REJETÉE (toutes lignes retournées).", reception.reference)

    logger.info("Retour %s validé.", retour.reference)


def _quantite_retournee_ligne(ligne_reception) -> Decimal:
    """Somme des quantités retournées validées pour une LigneReception."""
    from django.db.models import Sum, Value
    from django.db.models.functions import Coalesce
    from django.db.models import DecimalField as DBDecimal
    result = LigneRetour_qs(ligne_reception).filter(
        retour__statut='valide'
    ).aggregate(
        total=Coalesce(Sum('quantite_retournee'), Value(Decimal('0'), output_field=DBDecimal()))
    )
    return result['total']


def LigneRetour_qs(ligne_reception):
    """Helper pour éviter l'import circulaire."""
    from .models import LigneRetour
    return LigneRetour.objects.filter(ligne_reception=ligne_reception)


@transaction.atomic
def generer_reference_retour() -> str:
    """RET-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import RetourFournisseur
    today = timezone.now()
    prefix = f"RET-{today.strftime('%y%m')}-"
    dernier = (
        RetourFournisseur.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_da() -> str:
    """
    DA-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE.
    Le verrou de lignes empêche deux transactions concurrentes de lire
    le même dernier numéro et de générer un doublon.
    """
    from .models import DemandeAchat
    today = timezone.now()
    prefix = f"DA-{today.strftime('%y%m')}-"
    dernier = (
        DemandeAchat.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_bc() -> str:
    """BC-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import BonCommande
    today = timezone.now()
    prefix = f"BC-{today.strftime('%y%m')}-"
    dernier = (
        BonCommande.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_reception() -> str:
    """REC-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import Reception
    today = timezone.now()
    prefix = f"REC-{today.strftime('%y%m')}-"
    dernier = (
        Reception.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_facture() -> str:
    """FAC-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import FactureFournisseur
    today = timezone.now()
    prefix = f"FAC-{today.strftime('%y%m')}-"
    dernier = (
        FactureFournisseur.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_avoir() -> str:
    """
    F8 — AVO-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE.
    Utilise le même modèle FactureFournisseur filtré sur le préfixe AVO-.
    """
    from .models import FactureFournisseur
    today = timezone.now()
    prefix = f"AVO-{today.strftime('%y%m')}-"
    dernier = (
        FactureFournisseur.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def generer_reference_inventaire() -> str:
    """INV-YYMM-XXXX — Thread-safe via SELECT FOR UPDATE."""
    from .models import InventaireSession
    today = timezone.now()
    prefix = f"INV-{today.strftime('%y%m')}-"
    dernier = (
        InventaireSession.objects
        .select_for_update()
        .filter(reference__startswith=prefix)
        .order_by('-reference')
        .first()
    )
    seq = int(dernier.reference.split('-')[-1]) + 1 if dernier else 1
    return f"{prefix}{seq:04d}"


def verifier_gel_stock(article) -> str | None:
    """
    I1 — Retourne la référence de la session EN_COURS qui gèle cet article,
    ou None si l'article est libre.
    Un article est gelé si une LigneInventaire active le référence
    (directement ou via un lot).
    """
    from .models import LigneInventaire, InventaireSession
    # Article en stock global (gere_par_lot=False)
    ligne = LigneInventaire.objects.filter(
        session__statut=InventaireSession.Statut.EN_COURS,
        article=article,
    ).select_related('session').first()
    if ligne:
        return ligne.session.reference
    # Article via lot (gere_par_lot=True)
    ligne = LigneInventaire.objects.filter(
        session__statut=InventaireSession.Statut.EN_COURS,
        lot__article=article,
    ).select_related('session').first()
    if ligne:
        return ligne.session.reference
    return None


# ---------------------------------------------------------------------------
# S3 — Propositions de réapprovisionnement (MD07-like)
# ---------------------------------------------------------------------------

def propositions_reappro() -> list[dict]:
    """
    S3 — Retourne la liste de tous les articles nécessitant un réapprovisionnement,
    avec la quantité suggérée et le meilleur fournisseur actif.

    Un article est proposé si :
      - quantite_disponible < seuil_alerte  (alerte préventive)
      - OU quantite_disponible < stock_min  (commande urgente)
      - OU seuil_alerte == 0 et stock_min == 0 : exclus (pas de seuils configurés)

    Pour chaque article, on sélectionne le FournisseurArticle actif avec le
    délai_livraison le plus court, à égalité le prix_unitaire le plus bas.

    Retourne une liste de dicts (non sérialisée) exploitable par la vue.
    """
    from .models import StockArticle, FournisseurArticle
    from django.db.models import Q

    # Articles avec au moins un seuil configuré ET en-dessous de ce seuil
    stocks = (
        StockArticle.objects
        .select_related('article__unite')
        .filter(
            Q(seuil_alerte__gt=0, quantite_disponible__lt=models.F('seuil_alerte')) |
            Q(stock_min__gt=0,    quantite_disponible__lt=models.F('stock_min'))
        )
        .order_by('article__designation')
    )

    propositions = []
    for stock in stocks:
        # Quantité à commander : qte_reappro si défini, sinon seuil_alerte - dispo
        if stock.qte_reappro > 0:
            qte_suggeree = stock.qte_reappro
        elif stock.stock_min > 0:
            qte_suggeree = max(stock.stock_min - stock.quantite_disponible, Decimal('0'))
        elif stock.seuil_alerte > 0:
            qte_suggeree = max(stock.seuil_alerte - stock.quantite_disponible, Decimal('0'))
        else:
            qte_suggeree = Decimal('0')

        # Meilleur fournisseur actif : délai le plus court, puis prix le plus bas
        fa = (
            FournisseurArticle.objects
            .filter(article=stock.article, actif=True, fournisseur__actif=True, fournisseur__blackliste=False)
            .select_related('fournisseur')
            .order_by('delai_livraison', 'prix_unitaire')
            .first()
        )

        propositions.append({
            'stock':             stock,
            'niveau_alerte':     stock.niveau_alerte,
            'qte_suggeree':      qte_suggeree,
            'fournisseur_article': fa,
        })

    return propositions


# ---------------------------------------------------------------------------
# S4 — Vérification cohérence quantite_reservee ↔ ReservationLot
# ---------------------------------------------------------------------------

def verifier_coherence_reservations(article=None) -> list[dict]:
    """
    S4 — Compare sum(ReservationLot.quantite_reservee) par article
    avec StockArticle.quantite_reservee.

    Si article est fourni, vérifie uniquement cet article.
    Retourne la liste des articles en dérive avec la delta.
    """
    from .models import StockArticle
    from production.models import ReservationLot
    from django.db.models import Sum, Q
    from django.db.models.functions import Coalesce
    from django.db.models import Value, DecimalField as DBDecimalField

    qs = StockArticle.objects.select_related('article')
    if article:
        qs = qs.filter(article=article)

    ecarts = []
    for stock in qs:
        total_rl = ReservationLot.objects.filter(
            article=stock.article
        ).aggregate(
            total=Coalesce(Sum('quantite_reservee'), Value(Decimal('0'), output_field=DBDecimalField()))
        )['total']

        delta = stock.quantite_reservee - total_rl
        if abs(delta) > Decimal('0.001'):
            ecarts.append({
                'stock':               stock,
                'reservee_compteur':   stock.quantite_reservee,
                'reservee_lots':       total_rl,
                'delta':               delta,
            })

    return ecarts


@transaction.atomic
def recalculer_reservations_article(article) -> dict:
    """
    S4 — Corrige la dérive de quantite_reservee pour un article donné.
    Recalcule depuis la somme réelle des ReservationLot actives.
    Retourne le résultat de la correction.
    """
    from .models import StockArticle
    from production.models import ReservationLot
    from django.db.models import Sum
    from django.db.models.functions import Coalesce
    from django.db.models import Value, DecimalField as DBDecimalField

    stock = StockArticle.objects.select_for_update().get(article=article)
    avant_reservee   = stock.quantite_reservee
    avant_disponible = stock.quantite_disponible

    total_rl = ReservationLot.objects.filter(
        article=article
    ).aggregate(
        total=Coalesce(Sum('quantite_reservee'), Value(Decimal('0'), output_field=DBDecimalField()))
    )['total']

    delta = avant_reservee - total_rl
    if abs(delta) > Decimal('0.001'):
        # Réajuster disponible dans le sens inverse de la correction réservée
        stock.quantite_reservee   = total_rl
        stock.quantite_disponible = avant_disponible + delta   # compense la dérive
        stock.save(update_fields=['quantite_reservee', 'quantite_disponible', 'derniere_maj'])
        logger.warning(
            "S4 recalcul réservations %s : réservée %s → %s (delta %s), dispo %s → %s",
            article.designation, avant_reservee, total_rl, delta,
            avant_disponible, stock.quantite_disponible,
        )

    return {
        'article':           article.designation,
        'avant_reservee':    float(avant_reservee),
        'apres_reservee':    float(stock.quantite_reservee),
        'avant_disponible':  float(avant_disponible),
        'apres_disponible':  float(stock.quantite_disponible),
        'delta_corrige':     float(delta),
        'corrige':           abs(delta) > Decimal('0.001'),
    }


# ---------------------------------------------------------------------------
# S5 — Audit + recalcul stock depuis les mouvements
# ---------------------------------------------------------------------------

def auditer_stock_article(article) -> dict:
    """
    S5 — Compare StockArticle.quantite_disponible avec la somme algébrique
    de tous les MouvementStock (sens × quantite).

    Note : quantite_disponible dans StockArticle = stock libre HORS réservations.
    La somme des mouvements donne le stock physique total (libre + réservé).
    On compare donc à quantite_physique = disponible + reservee.
    """
    from .models import StockArticle, MouvementStock
    from django.db.models import Sum, ExpressionWrapper, F
    from django.db.models import DecimalField as DBDecimalField

    try:
        stock = StockArticle.objects.get(article=article)
    except StockArticle.DoesNotExist:
        return {'article': article.designation, 'existe': False}

    result = MouvementStock.objects.filter(article=article).aggregate(
        total=Sum(
            ExpressionWrapper(
                F('quantite') * F('sens'),
                output_field=DBDecimalField(max_digits=14, decimal_places=3),
            )
        )
    )
    total_mouvements = result['total'] or Decimal('0')
    physique_compteur = stock.quantite_physique
    delta = physique_compteur - total_mouvements

    return {
        'article':             article.designation,
        'existe':              True,
        'physique_compteur':   float(physique_compteur),
        'physique_mouvements': float(total_mouvements),
        'delta':               float(delta),
        'coherent':            abs(delta) <= Decimal('0.001'),
    }


@transaction.atomic
def recalculer_stock_depuis_mouvements(article) -> dict:
    """
    S5 — Recalcule et corrige quantite_disponible depuis la somme des mouvements.
    Conserve quantite_reservee intacte (les réservations sont gérées séparément via S4).
    quantite_disponible_recalcule = total_mouvements - quantite_reservee
    """
    from .models import StockArticle, MouvementStock
    from django.db.models import Sum, ExpressionWrapper, F
    from django.db.models import DecimalField as DBDecimalField

    stock = StockArticle.objects.select_for_update().get_or_create(
        article=article,
        defaults={'quantite_disponible': 0, 'quantite_reservee': 0, 'seuil_alerte': 0},
    )[0]

    result = MouvementStock.objects.filter(article=article).aggregate(
        total=Sum(
            ExpressionWrapper(
                F('quantite') * F('sens'),
                output_field=DBDecimalField(max_digits=14, decimal_places=3),
            )
        )
    )
    total_mouvements = result['total'] or Decimal('0')

    avant = stock.quantite_disponible
    nouveau_dispo = total_mouvements - stock.quantite_reservee
    stock.quantite_disponible = max(nouveau_dispo, Decimal('0'))
    stock.save(update_fields=['quantite_disponible', 'derniere_maj'])

    logger.warning(
        "S5 recalcul stock %s : dispo %s → %s (mouvements=%s, réservée=%s)",
        article.designation, float(avant), float(stock.quantite_disponible),
        float(total_mouvements), float(stock.quantite_reservee),
    )

    return {
        'article':            article.designation,
        'avant':              float(avant),
        'apres':              float(stock.quantite_disponible),
        'total_mouvements':   float(total_mouvements),
        'quantite_reservee':  float(stock.quantite_reservee),
    }
