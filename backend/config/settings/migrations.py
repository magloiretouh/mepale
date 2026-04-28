"""
Settings temporaires pour générer les migrations sans connexion PostgreSQL.
Utilise SQLite en mémoire — uniquement pour makemigrations.
"""
from .base import *  # noqa

SECRET_KEY = 'migrations-only-key-not-used-in-production'
DEBUG = True

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME':   ':memory:',
    }
}

# Désactiver l'historique simple pour les migrations
SIMPLE_HISTORY_REVERT_DISABLED = True
