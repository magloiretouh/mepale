"""
MEPALE ERP — Configuration Production (On-Premise Windows)
Charger via : DJANGO_SETTINGS_MODULE=config.settings.production
"""

from .base import *  # noqa: F401, F403
import os

# =============================================================================
# SÉCURITÉ
# =============================================================================

DEBUG      = False
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost').split(',')

SECURE_BROWSER_XSS_FILTER      = True
SECURE_CONTENT_TYPE_NOSNIFF    = True
X_FRAME_OPTIONS                = 'DENY'

# =============================================================================
# BASE DE DONNÉES
# =============================================================================

DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.postgresql',
        'NAME':     os.environ.get('DB_NAME',     'mepale_db'),
        'USER':     os.environ.get('DB_USER',     'mepale_user'),
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST':     os.environ.get('DB_HOST',     'localhost'),
        'PORT':     os.environ.get('DB_PORT',     '5432'),
        'CONN_MAX_AGE': 120,
    }
}

# =============================================================================
# REDIS
# =============================================================================

REDIS_URL = os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379')

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': f'{REDIS_URL}/1',
        'OPTIONS': {'CLIENT_CLASS': 'django_redis.client.DefaultClient'},
        'KEY_PREFIX': 'mepale',
        'TIMEOUT': 300,
    }
}

CELERY_BROKER_URL     = f'{REDIS_URL}/0'
CELERY_RESULT_BACKEND = f'{REDIS_URL}/0'

# =============================================================================
# CORS
# =============================================================================

CORS_ALLOWED_ORIGINS   = os.environ.get('CORS_ORIGINS', '').split(',')
CORS_ALLOW_CREDENTIALS = True

# =============================================================================
# EMAIL (configurer SMTP selon votre FAI)
# =============================================================================

EMAIL_BACKEND  = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST     = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT     = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS  = True
EMAIL_HOST_USER     = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL  = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@mepale.tg')

# =============================================================================
# LOGGING — Fichier en production
# =============================================================================

LOGGING['root']['handlers'] = ['console', 'file']  # type: ignore[name-defined]  # noqa: F405
