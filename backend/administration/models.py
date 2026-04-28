"""
MEPALE ERP — Module Administration
Modèles : ParametresEntreprise (singleton).
"""

from django.db import models
from simple_history.models import HistoricalRecords


class ParametresEntreprise(models.Model):
    """
    Singleton — paramètres globaux de l'entreprise.
    Toujours accéder via ParametresEntreprise.get_instance().
    """

    nom         = models.CharField(max_length=200, default='')
    slogan      = models.CharField(max_length=300, blank=True, default='')
    logo        = models.ImageField(upload_to='administration/logo/', blank=True, null=True)
    adresse     = models.TextField(blank=True, default='')
    ville       = models.CharField(max_length=100, blank=True, default='')
    pays        = models.CharField(max_length=100, blank=True, default='Sénégal')
    ninea       = models.CharField(max_length=50, blank=True, default='')
    telephone   = models.CharField(max_length=30, blank=True, default='')
    telephone2  = models.CharField(max_length=30, blank=True, default='')
    email       = models.EmailField(blank=True, default='')
    site_web    = models.URLField(blank=True, default='')

    history = HistoricalRecords()

    class Meta:
        verbose_name        = 'Paramètres Entreprise'
        verbose_name_plural = 'Paramètres Entreprise'

    def __str__(self):
        return self.nom or 'Entreprise'

    @classmethod
    def get_instance(cls):
        """Retourne (ou crée) l'unique instance de configuration."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
