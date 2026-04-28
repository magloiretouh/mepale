"""
MEPALE ERP — Tâches Celery : Module Logistique
Alertes stock sous seuil + factures échues.
"""

import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger('mepale')


def _envoyer_alerte_email(sujet: str, message: str) -> None:
    """Envoie un email d'alerte aux responsables configurés dans ALERTES_EMAIL."""
    try:
        from django.core.mail import send_mail
        from django.conf import settings
        destinataires = getattr(settings, 'ALERTES_EMAIL', [])
        if not destinataires:
            destinataires = [email for _, email in getattr(settings, 'MANAGERS', [])]
        if destinataires:
            send_mail(
                subject=f"[MEPALE] {sujet}",
                message=message,
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@mepale.tg'),
                recipient_list=destinataires,
                fail_silently=True,
            )
    except Exception as exc:
        logger.error("Erreur envoi email alerte : %s", exc)


@shared_task(name='logistique.alerte_stock_sous_seuil')
def alerte_stock_sous_seuil():
    """
    Tous les jours à 08h00 — logue et envoie un email pour les articles sous seuil.
    """
    from .models import StockArticle
    stocks = [s for s in StockArticle.objects.select_related('article__unite') if s.est_sous_seuil]
    if stocks:
        details = '\n'.join(
            f"  - {s.article.designation} : {s.quantite_disponible} {s.article.unite.code} "
            f"(seuil : {s.seuil_alerte}, stock min : {s.stock_min})"
            for s in stocks
        )
        msg = (
            f"{len(stocks)} article(s) sont sous le seuil d'alerte :\n\n{details}\n\n"
            f"Veuillez lancer une demande d'achat ou vérifier les approvisionnements en cours."
        )
        logger.warning(
            "[ALERTE STOCK] %d article(s) sous le seuil d'alerte : %s",
            len(stocks),
            ', '.join(f"{s.article.designation} ({s.quantite_disponible}/{s.seuil_alerte})" for s in stocks),
        )
        _envoyer_alerte_email(
            sujet=f"ALERTE STOCK : {len(stocks)} article(s) sous le seuil",
            message=msg,
        )
    return f"{len(stocks)} article(s) sous seuil"


@shared_task(name='logistique.alerte_factures_echeance')
def alerte_factures_echeance():
    """
    Tous les jours à 08h00 — logue et envoie un email pour les factures échues non payées.
    """
    from .models import FactureFournisseur
    aujourd_hui = timezone.now().date()
    factures = FactureFournisseur.objects.filter(
        statut__in=[
            FactureFournisseur.Statut.EN_ATTENTE,
            FactureFournisseur.Statut.PARTIELLEMENT_PAYEE,
        ],
        date_echeance__lt=aujourd_hui,
    ).select_related('fournisseur')

    if factures.exists():
        details = '\n'.join(
            f"  - {f.reference} | {f.fournisseur.raison_sociale} | "
            f"{f.montant_restant:,.0f} FCFA restants | échue le {f.date_echeance}"
            for f in factures
        )
        total_restant = sum(f.montant_restant for f in factures)
        msg = (
            f"{factures.count()} facture(s) fournisseur en retard de paiement :\n\n{details}\n\n"
            f"Total restant à payer : {total_restant:,.0f} FCFA\n"
            f"Veuillez régulariser ces paiements."
        )
        logger.warning(
            "[ALERTE FACTURES] %d facture(s) en retard : %s",
            factures.count(),
            ', '.join(f"{f.reference} ({f.fournisseur.raison_sociale}, échue le {f.date_echeance})" for f in factures),
        )
        _envoyer_alerte_email(
            sujet=f"ALERTE PAIEMENT : {factures.count()} facture(s) en retard",
            message=msg,
        )
    return f"{factures.count()} facture(s) en retard"
