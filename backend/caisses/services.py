"""
MEPALE ERP — Services Caisses
Logique métier : approbation, mise à jour solde, création de transferts.
"""

from decimal import Decimal
from django.db import transaction
from django.utils import timezone


def get_seuil_approbation() -> Decimal:
    from .models import ParametresCaisse
    return ParametresCaisse.get().seuil_approbation


@transaction.atomic
def _appliquer_mouvement_au_solde(mouvement, user):
    """
    Met à jour le solde de la caisse et marque le mouvement APPROUVE.
    Utilise select_for_update pour éviter les race conditions.
    """
    from .models import MouvementCaisse, Caisse

    caisse = Caisse.objects.select_for_update().get(pk=mouvement.session.caisse_id)

    if mouvement.type == MouvementCaisse.Type.SORTIE:
        if caisse.solde_actuel < mouvement.montant:
            raise ValueError(
                f"Solde insuffisant : {caisse.solde_actuel:,.0f} FCFA disponible, "
                f"{mouvement.montant:,.0f} FCFA demandé."
            )
        caisse.solde_actuel -= mouvement.montant
    else:
        caisse.solde_actuel += mouvement.montant

    caisse.save(update_fields=['solde_actuel'])

    mouvement.statut           = MouvementCaisse.Statut.APPROUVE
    mouvement.approuve_par     = user
    mouvement.date_approbation = timezone.now()
    mouvement.save(update_fields=['statut', 'approuve_par', 'date_approbation'])

    return mouvement


@transaction.atomic
def creer_et_traiter_mouvement(session, categorie, montant, libelle, type_mvt, user, **kwargs):
    """
    Crée un MouvementCaisse et l'auto-approuve si montant ≤ seuil_approbation.
    """
    from .models import MouvementCaisse

    mvt = MouvementCaisse.objects.create(
        session=session,
        type=type_mvt,
        categorie=categorie,
        montant=montant,
        libelle=libelle,
        statut=MouvementCaisse.Statut.EN_ATTENTE,
        created_by=user,
        **kwargs,
    )

    seuil = get_seuil_approbation()
    if Decimal(str(montant)) <= seuil:
        _appliquer_mouvement_au_solde(mvt, user)

    return mvt


@transaction.atomic
def approuver_mouvement(mouvement, user):
    """Approuve un mouvement en attente."""
    from .models import MouvementCaisse

    if mouvement.statut != MouvementCaisse.Statut.EN_ATTENTE:
        raise ValueError("Ce mouvement n'est pas en attente d'approbation.")

    _appliquer_mouvement_au_solde(mouvement, user)
    return mouvement


@transaction.atomic
def creer_transfert(caisse_source, caisse_destination, montant, libelle, user):
    """
    Crée un TransfertCaisse et les deux MouvementCaisse associés.
    Les mouvements sont auto-approuvés si montant ≤ seuil.
    """
    from .models import TransfertCaisse, CategorieMouvement, MouvementCaisse

    # Catégories système requises
    try:
        cat_sortie = CategorieMouvement.objects.get(code='transfert_sortie')
        cat_entree = CategorieMouvement.objects.get(code='transfert_entree')
    except CategorieMouvement.DoesNotExist:
        raise ValueError(
            "Les catégories système 'transfert_sortie' / 'transfert_entree' sont introuvables. "
            "Vérifiez les données initiales."
        )

    # Sessions ouvertes obligatoires sur les deux caisses
    session_source = caisse_source.session_ouverte
    session_dest   = caisse_destination.session_ouverte
    if not session_source:
        raise ValueError(f"La caisse « {caisse_source.nom} » n'a pas de session ouverte.")
    if not session_dest:
        raise ValueError(f"La caisse « {caisse_destination.nom} » n'a pas de session ouverte.")

    # Créer le transfert
    transfert = TransfertCaisse.objects.create(
        caisse_source=caisse_source,
        caisse_destination=caisse_destination,
        montant=montant,
        libelle=libelle,
        created_by=user,
    )

    # Créer les deux mouvements liés
    mvt_sortie = creer_et_traiter_mouvement(
        session=session_source,
        categorie=cat_sortie,
        montant=montant,
        libelle=f"Transfert → {caisse_destination.nom} : {libelle}",
        type_mvt=MouvementCaisse.Type.SORTIE,
        user=user,
        transfert=transfert,
    )
    mvt_entree = creer_et_traiter_mouvement(
        session=session_dest,
        categorie=cat_entree,
        montant=montant,
        libelle=f"Transfert ← {caisse_source.nom} : {libelle}",
        type_mvt=MouvementCaisse.Type.ENTREE,
        user=user,
        transfert=transfert,
    )

    # Si les deux mouvements sont auto-approuvés, le transfert aussi
    if (mvt_sortie.statut == MouvementCaisse.Statut.APPROUVE
            and mvt_entree.statut == MouvementCaisse.Statut.APPROUVE):
        transfert.statut = TransfertCaisse.Statut.APPROUVE
        transfert.save(update_fields=['statut'])

    return transfert
