"""
MEPALE ERP — Configuration Celery

Ce fichier est chargé uniquement quand Celery tourne réellement.
Il ne doit PAS être importé dans les settings Django pour ne pas
ralentir les commandes de gestion (makemigrations, migrate, etc.).

Usage :
    celery -A config worker --loglevel=info
    celery -A config beat --loglevel=info
"""
import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')

app = Celery('mepale')

# Charge les settings CELERY_* depuis django.conf.settings
app.config_from_object('django.conf:settings', namespace='CELERY')

# Découvre automatiquement les tâches dans chaque app (tasks.py)
app.autodiscover_tasks()


# =============================================================================
# BEAT SCHEDULE — Tâches périodiques
# =============================================================================

app.conf.beat_schedule = {
    # Production — lots périmés bloqués à minuit
    'bloquer-lots-expires-quotidien': {
        'task': 'production.bloquer_lots_expires',
        'schedule': crontab(hour=0, minute=1),
    },
    # Production — alerte J-7 à 8h
    'alerte-peremption-j7': {
        'task': 'production.alerte_peremption_j7',
        'schedule': crontab(hour=8, minute=0),
    },
    # Production — alerte J-3 à 8h
    'alerte-peremption-j3': {
        'task': 'production.alerte_peremption_j3',
        'schedule': crontab(hour=8, minute=5),
    },
    # Logistique — alerte stock sous seuil à 8h
    'alerte-stock-sous-seuil': {
        'task': 'logistique.alerte_stock_sous_seuil',
        'schedule': crontab(hour=8, minute=10),
    },
    # Logistique — alerte factures échues à 8h
    'alerte-factures-echeance': {
        'task': 'logistique.alerte_factures_echeance',
        'schedule': crontab(hour=8, minute=15),
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
