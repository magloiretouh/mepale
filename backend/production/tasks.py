"""
MEPALE ERP — Tâches Celery : Module Production
Alertes de péremption + blocage automatique des lots expirés.
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
            # Fallback sur MANAGERS Django
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


@shared_task(name='production.alerte_peremption_j7')
def alerte_peremption_j7():
    """
    Tous les jours à 08h00 — alerte pour les lots expirant dans 7 jours.
    """
    from .models import Lot
    date_limite = timezone.now().date() + timezone.timedelta(days=7)
    lots = Lot.objects.filter(
        statut=Lot.Statut.DISPONIBLE,
        date_peremption__lte=date_limite,
        date_peremption__gte=timezone.now().date(),
    ).select_related('article')

    if lots.exists():
        details = ', '.join(
            f"{l.numero_lot} ({l.article.designation}, exp. {l.date_peremption})"
            for l in lots
        )
        msg = (
            f"{lots.count()} lot(s) expireront dans 7 jours :\n\n{details}\n\n"
            f"Veuillez prévoir leur utilisation ou destruction avant péremption."
        )
        logger.warning("[ALERTE J-7] %d lot(s) expirent dans 7 jours : %s", lots.count(), details)
        _envoyer_alerte_email(
            sujet=f"ALERTE J-7 : {lots.count()} lot(s) proche(s) de péremption",
            message=msg,
        )
    return f"{lots.count()} lot(s) en alerte J-7"


@shared_task(name='production.alerte_peremption_j3')
def alerte_peremption_j3():
    """
    Tous les jours à 08h00 — alerte urgente pour les lots expirant dans 3 jours.
    """
    from .models import Lot
    date_limite = timezone.now().date() + timezone.timedelta(days=3)
    lots = Lot.objects.filter(
        statut=Lot.Statut.DISPONIBLE,
        date_peremption__lte=date_limite,
        date_peremption__gte=timezone.now().date(),
    ).select_related('article')

    if lots.exists():
        details = ', '.join(
            f"{l.numero_lot} ({l.article.designation}, exp. {l.date_peremption})"
            for l in lots
        )
        msg = (
            f"URGENT — {lots.count()} lot(s) expireront dans 3 jours :\n\n{details}\n\n"
            f"Action immédiate requise : utilisation, blocage ou destruction."
        )
        logger.warning("[ALERTE URGENTE J-3] %d lot(s) expirent dans 3 jours : %s", lots.count(), details)
        _envoyer_alerte_email(
            sujet=f"⚠️ URGENT J-3 : {lots.count()} lot(s) expirent dans 3 jours",
            message=msg,
        )
    return f"{lots.count()} lot(s) en alerte J-3"


@shared_task(name='production.bloquer_lots_expires')
def bloquer_lots_expires():
    """
    Tous les jours à 00h01 — bloque automatiquement les lots dont la date
    de péremption est dépassée.
    """
    from .models import Lot
    aujourd_hui = timezone.now().date()
    lots_expires = Lot.objects.filter(
        statut=Lot.Statut.DISPONIBLE,
        date_peremption__lt=aujourd_hui,
    )
    count = lots_expires.count()
    if count:
        details = ', '.join(
            f"{l.numero_lot} ({l.article.designation})"
            for l in lots_expires.select_related('article')
        )
        lots_expires.update(statut=Lot.Statut.PERIME)
        logger.warning("[AUTO-BLOCK] %d lot(s) périmés bloqués automatiquement.", count)
        _envoyer_alerte_email(
            sujet=f"{count} lot(s) périmé(s) bloqué(s) automatiquement",
            message=(
                f"{count} lot(s) ont été automatiquement passés au statut PÉRIMÉ :\n\n{details}\n\n"
                f"Ces lots ne sont plus disponibles pour la production."
            ),
        )
    return f"{count} lot(s) périmés bloqués"
