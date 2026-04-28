"""
MEPALE ERP — Configuration Développement
"""

from .base import *  # noqa: F401, F403

# =============================================================================
# SÉCURITÉ
# =============================================================================

DEBUG       = True
SECRET_KEY  = 'dev-secret-key-mepale-2026-change-in-production'
ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

# =============================================================================
# BASE DE DONNÉES — PostgreSQL
# =============================================================================

DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.postgresql',
        'NAME':     'mepale_dev',
        'USER':     'mepale_dev_user',
        'PASSWORD': 'qP%$t@3cSvCLvMQ',
        'HOST':     'localhost',
        'PORT':     '5432',
        'OPTIONS': {
            'connect_timeout': 10,
            'options': '-c client_encoding=utf8',   # fix encodage Windows
        },
        'CONN_MAX_AGE': 60,
    }
}

# =============================================================================
# REDIS & CACHE
# =============================================================================

REDIS_URL = 'redis://127.0.0.1:6379'

# Cache : Redis si disponible, sinon mémoire locale (dev sans Redis)
try:
    import redis as _redis
    _redis.Redis(host='127.0.0.1', port=6379, socket_connect_timeout=1, socket_timeout=1).ping()
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': f'{REDIS_URL}/1',
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
                'CONNECTION_POOL_KWARGS': {'max_connections': 50},
            },
            'KEY_PREFIX': 'mepale',
            'TIMEOUT': 300,
        }
    }
except Exception:
    # Redis non disponible — cache en mémoire (dev uniquement)
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }


# =============================================================================
# CELERY
# =============================================================================

CELERY_BROKER_URL    = f'{REDIS_URL}/0'
CELERY_RESULT_BACKEND = f'{REDIS_URL}/0'

# =============================================================================
# CORS — Autorise le frontend Vite en dev
# =============================================================================

CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
]

# =============================================================================
# EMAIL — Console en dev (affiche dans le terminal)
# =============================================================================

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
