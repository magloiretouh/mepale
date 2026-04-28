"""
MEPALE ERP — Module Commercial (Vente) : Modèles
Cycle order-to-cash : Clients → Devis → Commandes → BL → Facturation → Retours.

Règles métier :
- Pas de TVA, FCFA uniquement
- Confirmation CC : warning stock seulement (non bloquant)
- Expédition BL : blocage si stock insuffisant
- Mouvement sortie_vente créé à l'expédition du BL
"""

import uuid
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords


# ---------------------------------------------------------------------------
# 1. CATÉGORIES CLIENT (admin-managed)
# ---------------------------------------------------------------------------

class CategorieClient(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code        = models.CharField('Code', max_length=20, unique=True)
    libelle     = models.CharField('Libellé', max_length=100)
    description = models.TextField('Description', blank=True)
    actif       = models.BooleanField('Actif', default=True)

    class Meta:
        db_table            = 'commercial_categorie_client'
        verbose_name        = 'Catégorie client'
        verbose_name_plural = 'Catégories client'
        ordering            = ['libelle']

    def __str__(self):
        return f"{self.code} — {self.libelle}"


# ---------------------------------------------------------------------------
# 2. CLIENTS
# ---------------------------------------------------------------------------

class Client(models.Model):
    class Type(models.TextChoices):
        ENTREPRISE  = 'entreprise',  'Entreprise'
        PARTICULIER = 'particulier', 'Particulier'

    class Statut(models.TextChoices):
        ACTIF    = 'actif',    'Actif'
        INACTIF  = 'inactif',  'Inactif'
        SUSPENDU = 'suspendu', 'Suspendu'

    class ModePaiement(models.TextChoices):
        COMPTANT   = 'comptant',     'Comptant'
        TRENTE_J   = '30j',          '30 jours'
        SOIXANTE_J = '60j',          '60 jours'
        VIREMENT   = 'virement',     'Virement bancaire'
        CHEQUE     = 'cheque',       'Chèque'
        MOBILE     = 'mobile_money', 'Mobile Money'

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code                = models.CharField('Code', max_length=20, unique=True)
    raison_sociale      = models.CharField('Raison sociale', max_length=200)
    type                = models.CharField('Type', max_length=20, choices=Type.choices, default=Type.ENTREPRISE)
    categorie           = models.ForeignKey(
        CategorieClient,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='clients',
        verbose_name='Catégorie',
    )
    secteur_activite    = models.CharField("Secteur d'activité", max_length=100, blank=True)

    # Contact
    telephone           = models.CharField('Téléphone', max_length=20, blank=True)
    email               = models.EmailField('Email', blank=True)

    # Adresses
    adresse_facturation = models.TextField('Adresse de facturation', blank=True)
    adresse_livraison   = models.TextField(
        'Adresse de livraison', blank=True,
        help_text="Laisser vide pour utiliser l'adresse de facturation",
    )

    # Informations légales
    nif                 = models.CharField('NIF', max_length=30, blank=True)
    rccm                = models.CharField('RCCM', max_length=50, blank=True)
    numero_contribuable = models.CharField('N° Contribuable', max_length=50, blank=True)

    # Conditions commerciales
    delai_paiement      = models.PositiveIntegerField('Délai de paiement (jours)', default=30)
    mode_paiement       = models.CharField(
        'Mode de paiement', max_length=20,
        choices=ModePaiement.choices, default=ModePaiement.COMPTANT,
    )
    plafond_credit      = models.DecimalField(
        'Plafond de crédit (FCFA)', max_digits=14, decimal_places=2,
        null=True, blank=True,
    )

    # Commercial référent (lien RH)
    commercial          = models.ForeignKey(
        'rh.Employee',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='clients_assignes',
        verbose_name='Commercial référent',
    )

    statut              = models.CharField('Statut', max_length=20, choices=Statut.choices, default=Statut.ACTIF)
    notes               = models.TextField('Notes', blank=True)
    actif               = models.BooleanField('Actif', default=True)
    date_creation       = models.DateTimeField('Date création', auto_now_add=True)
    date_modif          = models.DateTimeField('Date modification', auto_now=True)
    history             = HistoricalRecords()

    class Meta:
        db_table            = 'commercial_client'
        verbose_name        = 'Client'
        verbose_name_plural = 'Clients'
        ordering            = ['raison_sociale']

    def __str__(self):
        return f"{self.code} — {self.raison_sociale}"

    @property
    def adresse_livraison_effective(self):
        """Retourne l'adresse de livraison ou, à défaut, l'adresse de facturation."""
        return self.adresse_livraison or self.adresse_facturation

    @property
    def solde_factures(self) -> Decimal:
        """Montant total des factures impayées (emises + partiellement_payees)."""
        from django.db.models import Sum
        result = self.factures_vente.filter(
            statut__in=[FactureVente.Statut.EMISE, FactureVente.Statut.PARTIELLEMENT_PAYEE]
        ).aggregate(total=Sum(models.F('montant_ht') - models.F('montant_regle')))
        return result['total'] or Decimal('0')


class ContactClient(models.Model):
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client    = models.ForeignKey(Client, on_delete=models.CASCADE,
                                  related_name='contacts', verbose_name='Client')
    nom       = models.CharField('Nom complet', max_length=150)
    poste     = models.CharField('Poste', max_length=100, blank=True)
    telephone = models.CharField('Téléphone', max_length=20, blank=True)
    email     = models.EmailField('Email', blank=True)
    principal = models.BooleanField('Contact principal', default=False)

    class Meta:
        db_table            = 'commercial_contact_client'
        verbose_name        = 'Contact client'
        verbose_name_plural = 'Contacts client'
        ordering            = ['-principal', 'nom']

    def __str__(self):
        return f"{self.nom} ({self.client.raison_sociale})"


# ---------------------------------------------------------------------------
# 3. DEVIS
# ---------------------------------------------------------------------------

class Devis(models.Model):
    class Statut(models.TextChoices):
        BROUILLON = 'brouillon', 'Brouillon'
        ENVOYE    = 'envoye',    'Envoyé'
        ACCEPTE   = 'accepte',   'Accepté'
        REFUSE    = 'refuse',    'Refusé'
        EXPIRE    = 'expire',    'Expiré'

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference        = models.CharField('Référence', max_length=25, unique=True)
    client           = models.ForeignKey(Client, on_delete=models.PROTECT,
                                         related_name='devis', verbose_name='Client')
    commercial       = models.ForeignKey(
        'rh.Employee',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='devis_assignes',
        verbose_name='Commercial',
    )
    statut           = models.CharField('Statut', max_length=20, choices=Statut.choices, default=Statut.BROUILLON)
    version          = models.PositiveSmallIntegerField('Version', default=1)
    date_devis       = models.DateField('Date du devis', default=date.today)
    date_validite    = models.DateField('Date de validité')
    reference_client = models.CharField('Référence client', max_length=100, blank=True)
    notes_internes   = models.TextField('Notes internes', blank=True)
    notes_client     = models.TextField('Notes client (visible sur PDF)', blank=True)
    montant_ht       = models.DecimalField('Montant HT (FCFA)', max_digits=14, decimal_places=2, default=0)
    cree_par         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True,
        related_name='devis_crees',
        verbose_name='Créé par',
    )
    date_creation    = models.DateTimeField('Date création', auto_now_add=True)
    date_modif       = models.DateTimeField('Date modification', auto_now=True)
    history          = HistoricalRecords()

    class Meta:
        db_table            = 'commercial_devis'
        verbose_name        = 'Devis'
        verbose_name_plural = 'Devis'
        ordering            = ['-date_creation']

    def __str__(self):
        return f"{self.reference} — {self.client.raison_sociale}"

    def recalculer_montant(self):
        total = sum(l.montant_ht for l in self.lignes.all())
        self.montant_ht = total
        self.save(update_fields=['montant_ht', 'date_modif'])


class LigneDevis(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    devis         = models.ForeignKey(Devis, on_delete=models.CASCADE,
                                      related_name='lignes', verbose_name='Devis')
    article       = models.ForeignKey(
        'production.Article',
        on_delete=models.PROTECT,
        related_name='lignes_devis',
        verbose_name='Article',
    )
    quantite      = models.DecimalField('Quantité', max_digits=12, decimal_places=3,
                                        validators=[MinValueValidator(Decimal('0.001'))])
    prix_unitaire = models.DecimalField('Prix unitaire (FCFA)', max_digits=14, decimal_places=2,
                                        validators=[MinValueValidator(Decimal('0'))])
    remise_pct    = models.DecimalField('Remise (%)', max_digits=5, decimal_places=2, default=0,
                                        validators=[MinValueValidator(Decimal('0'))])

    class Meta:
        db_table            = 'commercial_ligne_devis'
        verbose_name        = 'Ligne de devis'
        verbose_name_plural = 'Lignes de devis'

    def __str__(self):
        return f"{self.devis.reference} — {self.article.designation}"

    @property
    def montant_ht(self) -> Decimal:
        return (self.quantite * self.prix_unitaire * (1 - self.remise_pct / 100)).quantize(Decimal('0.01'))

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.devis.recalculer_montant()

    def delete(self, *args, **kwargs):
        devis = self.devis
        super().delete(*args, **kwargs)
        devis.recalculer_montant()


# ---------------------------------------------------------------------------
# 4. COMMANDES CLIENT
# ---------------------------------------------------------------------------

class CommandeClient(models.Model):
    class Statut(models.TextChoices):
        BROUILLON            = 'brouillon',           'Brouillon'
        CONFIRMEE            = 'confirmee',            'Confirmée'
        EN_COURS_LIVRAISON   = 'en_cours_livraison',   'En cours de livraison'
        PARTIELLEMENT_LIVREE = 'partiellement_livree', 'Partiellement livrée'
        LIVREE               = 'livree',               'Livrée'
        ANNULEE              = 'annulee',              'Annulée'

    id                       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference                = models.CharField('Référence', max_length=25, unique=True)
    client                   = models.ForeignKey(Client, on_delete=models.PROTECT,
                                                 related_name='commandes', verbose_name='Client')
    devis                    = models.ForeignKey(
        Devis,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='commandes_issues',
        verbose_name="Devis d'origine",
    )
    commercial               = models.ForeignKey(
        'rh.Employee',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='commandes_client_assignees',
        verbose_name='Commercial',
    )
    statut                   = models.CharField('Statut', max_length=30, choices=Statut.choices, default=Statut.BROUILLON)
    date_commande            = models.DateField('Date de commande', default=date.today)
    date_livraison_souhaitee = models.DateField('Date de livraison souhaitée', null=True, blank=True)
    date_livraison_confirmee = models.DateField('Date de livraison confirmée', null=True, blank=True)
    reference_client         = models.CharField('Référence client (PO)', max_length=100, blank=True)
    conditions_paiement      = models.CharField('Conditions de paiement', max_length=100, blank=True)
    notes_internes           = models.TextField('Notes internes', blank=True)
    notes_client             = models.TextField('Notes client', blank=True)
    stock_warning            = models.BooleanField(
        'Avertissement stock', default=False,
        help_text='True si stock insuffisant détecté à la confirmation',
    )
    montant_ht               = models.DecimalField('Montant HT (FCFA)', max_digits=14, decimal_places=2, default=0)
    cree_par                 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True,
        related_name='commandes_client_crees',
        verbose_name='Créé par',
    )
    date_creation            = models.DateTimeField('Date création', auto_now_add=True)
    date_modif               = models.DateTimeField('Date modification', auto_now=True)
    history                  = HistoricalRecords()

    class Meta:
        db_table            = 'commercial_commande_client'
        verbose_name        = 'Commande client'
        verbose_name_plural = 'Commandes client'
        ordering            = ['-date_creation']

    def __str__(self):
        return f"{self.reference} — {self.client.raison_sociale}"

    def recalculer_montant(self):
        total = sum(l.montant_ht for l in self.lignes.all())
        self.montant_ht = total
        self.save(update_fields=['montant_ht', 'date_modif'])


class LigneCommandeClient(models.Model):
    id                            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    commande                      = models.ForeignKey(CommandeClient, on_delete=models.CASCADE,
                                                      related_name='lignes', verbose_name='Commande')
    article                       = models.ForeignKey(
        'production.Article',
        on_delete=models.PROTECT,
        related_name='lignes_commande_client',
        verbose_name='Article',
    )
    quantite_commandee            = models.DecimalField('Quantité commandée', max_digits=12, decimal_places=3,
                                                        validators=[MinValueValidator(Decimal('0.001'))])
    quantite_livree               = models.DecimalField('Quantité livrée', max_digits=12, decimal_places=3, default=0)
    prix_unitaire                 = models.DecimalField('Prix unitaire (FCFA)', max_digits=14, decimal_places=2,
                                                        validators=[MinValueValidator(Decimal('0'))])
    remise_pct                    = models.DecimalField('Remise (%)', max_digits=5, decimal_places=2, default=0)
    stock_disponible_confirmation = models.DecimalField(
        'Stock dispo à la confirmation',
        max_digits=12, decimal_places=3,
        null=True, blank=True,
        help_text='Snapshot du stock disponible au moment de la confirmation',
    )

    class Meta:
        db_table            = 'commercial_ligne_commande_client'
        verbose_name        = 'Ligne de commande client'
        verbose_name_plural = 'Lignes de commande client'

    def __str__(self):
        return f"{self.commande.reference} — {self.article.designation}"

    @property
    def quantite_restante(self) -> Decimal:
        return max(Decimal('0'), self.quantite_commandee - self.quantite_livree)

    @property
    def montant_ht(self) -> Decimal:
        return (self.quantite_commandee * self.prix_unitaire * (1 - self.remise_pct / 100)).quantize(Decimal('0.01'))

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.commande.recalculer_montant()

    def delete(self, *args, **kwargs):
        commande = self.commande
        super().delete(*args, **kwargs)
        commande.recalculer_montant()


# ---------------------------------------------------------------------------
# 5. BONS DE LIVRAISON
# ---------------------------------------------------------------------------

class BonLivraison(models.Model):
    class Statut(models.TextChoices):
        PREPARE  = 'prepare',  'Préparé'
        EXPEDIE  = 'expedie',  'Expédié'
        LIVRE    = 'livre',    'Livré (confirmé client)'
        RETOURNE = 'retourne', 'Retourné'

    id                       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference                = models.CharField('Référence', max_length=25, unique=True)
    commande                 = models.ForeignKey(CommandeClient, on_delete=models.PROTECT,
                                                 related_name='bons_livraison', verbose_name='Commande client')
    statut                   = models.CharField('Statut', max_length=20, choices=Statut.choices, default=Statut.PREPARE)
    date_preparation         = models.DateField('Date de préparation', default=date.today)
    date_expedition          = models.DateField("Date d'expédition", null=True, blank=True)
    date_livraison_confirmee = models.DateField('Date livraison confirmée (client)', null=True, blank=True)
    notes                    = models.TextField('Notes', blank=True)
    cree_par                 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True,
        related_name='bons_livraison_crees',
        verbose_name='Créé par',
    )
    date_creation            = models.DateTimeField('Date création', auto_now_add=True)
    date_modif               = models.DateTimeField('Date modification', auto_now=True)
    history                  = HistoricalRecords()

    class Meta:
        db_table            = 'commercial_bon_livraison'
        verbose_name        = 'Bon de livraison'
        verbose_name_plural = 'Bons de livraison'
        ordering            = ['-date_creation']

    def __str__(self):
        return f"{self.reference} — {self.commande.client.raison_sociale}"


class LigneBL(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bon_livraison  = models.ForeignKey(BonLivraison, on_delete=models.CASCADE,
                                       related_name='lignes', verbose_name='Bon de livraison')
    ligne_commande = models.ForeignKey(LigneCommandeClient, on_delete=models.PROTECT,
                                       related_name='lignes_bl', verbose_name='Ligne de commande')
    article        = models.ForeignKey(
        'production.Article',
        on_delete=models.PROTECT,
        related_name='lignes_bl',
        verbose_name='Article',
    )
    lot            = models.ForeignKey(
        'production.Lot',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='lignes_bl',
        verbose_name='Lot',
    )
    quantite       = models.DecimalField('Quantité', max_digits=12, decimal_places=3,
                                         validators=[MinValueValidator(Decimal('0.001'))])
    mouvement      = models.ForeignKey(
        'logistique.MouvementStock',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='lignes_bl',
        verbose_name='Mouvement de stock',
    )

    class Meta:
        db_table            = 'commercial_ligne_bl'
        verbose_name        = 'Ligne de bon de livraison'
        verbose_name_plural = 'Lignes de bon de livraison'

    def __str__(self):
        return f"{self.bon_livraison.reference} — {self.article.designation}"


# ---------------------------------------------------------------------------
# 6. FACTURES VENTE
# ---------------------------------------------------------------------------

class FactureVente(models.Model):
    class Statut(models.TextChoices):
        BROUILLON           = 'brouillon',           'Brouillon'
        EMISE               = 'emise',               'Émise'
        PARTIELLEMENT_PAYEE = 'partiellement_payee', 'Partiellement payée'
        PAYEE               = 'payee',               'Payée'
        ANNULEE             = 'annulee',             'Annulée'

    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference     = models.CharField('Référence', max_length=25, unique=True)
    client        = models.ForeignKey(Client, on_delete=models.PROTECT,
                                      related_name='factures_vente', verbose_name='Client')
    commande      = models.ForeignKey(
        CommandeClient,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='factures',
        verbose_name="Commande client d'origine",
    )
    statut        = models.CharField('Statut', max_length=25, choices=Statut.choices, default=Statut.BROUILLON)
    date_facture  = models.DateField('Date de facture', default=date.today)
    date_echeance = models.DateField("Date d'échéance")
    montant_ht    = models.DecimalField('Montant HT (FCFA)', max_digits=14, decimal_places=2, default=0)
    montant_regle = models.DecimalField('Montant réglé (FCFA)', max_digits=14, decimal_places=2, default=0)
    notes         = models.TextField('Notes', blank=True)
    cree_par      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True,
        related_name='factures_vente_crees',
        verbose_name='Créé par',
    )
    date_creation = models.DateTimeField('Date création', auto_now_add=True)
    date_modif    = models.DateTimeField('Date modification', auto_now=True)
    history       = HistoricalRecords()

    class Meta:
        db_table            = 'commercial_facture_vente'
        verbose_name        = 'Facture vente'
        verbose_name_plural = 'Factures vente'
        ordering            = ['-date_facture']

    def __str__(self):
        return f"{self.reference} — {self.client.raison_sociale}"

    def recalculer_montant(self):
        total = sum(l.montant_ht for l in self.lignes.all())
        self.montant_ht = total
        self.save(update_fields=['montant_ht', 'date_modif'])

    def recalculer_reglement(self):
        """Recalcule montant_regle et met à jour le statut automatiquement."""
        from django.db.models import Sum, Value
        from django.db.models import DecimalField as DBDecimalField
        from django.db.models.functions import Coalesce
        total = self.reglements.aggregate(
            total=Coalesce(Sum('montant'), Value(Decimal('0'), output_field=DBDecimalField()))
        )['total']
        self.montant_regle = total
        if self.statut != self.Statut.ANNULEE:
            if total >= self.montant_ht and self.montant_ht > 0:
                self.statut = self.Statut.PAYEE
            elif total > 0:
                self.statut = self.Statut.PARTIELLEMENT_PAYEE
            elif self.statut in [self.Statut.PARTIELLEMENT_PAYEE, self.Statut.PAYEE]:
                self.statut = self.Statut.EMISE
        self.save(update_fields=['montant_regle', 'statut', 'date_modif'])

    @property
    def montant_restant(self) -> Decimal:
        return max(Decimal('0'), self.montant_ht - self.montant_regle)

    @property
    def est_en_retard(self) -> bool:
        if self.statut in [self.Statut.PAYEE, self.Statut.ANNULEE, self.Statut.BROUILLON]:
            return False
        return self.date_echeance < timezone.now().date()

    @property
    def jours_retard(self) -> int:
        if not self.est_en_retard:
            return 0
        return (timezone.now().date() - self.date_echeance).days

    @property
    def niveau_retard(self) -> str:
        """ok / soon (≤7 jours avant échéance) / danger (en retard)."""
        if self.statut in [self.Statut.PAYEE, self.Statut.ANNULEE, self.Statut.BROUILLON]:
            return 'ok'
        today = timezone.now().date()
        delta = (self.date_echeance - today).days
        if delta < 0:
            return 'danger'
        if delta <= 7:
            return 'soon'
        return 'ok'


class LigneFactureVente(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facture       = models.ForeignKey(FactureVente, on_delete=models.CASCADE,
                                      related_name='lignes', verbose_name='Facture')
    article       = models.ForeignKey(
        'production.Article',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='lignes_facture_vente',
        verbose_name='Article',
    )
    designation   = models.CharField('Désignation', max_length=200,
                                     help_text="Peut surcharger la désignation de l'article")
    quantite      = models.DecimalField('Quantité', max_digits=12, decimal_places=3,
                                        validators=[MinValueValidator(Decimal('0.001'))])
    prix_unitaire = models.DecimalField('Prix unitaire (FCFA)', max_digits=14, decimal_places=2,
                                        validators=[MinValueValidator(Decimal('0'))])
    remise_pct    = models.DecimalField('Remise (%)', max_digits=5, decimal_places=2, default=0)

    class Meta:
        db_table            = 'commercial_ligne_facture_vente'
        verbose_name        = 'Ligne de facture vente'
        verbose_name_plural = 'Lignes de facture vente'

    def __str__(self):
        return f"{self.facture.reference} — {self.designation}"

    @property
    def montant_ht(self) -> Decimal:
        return (self.quantite * self.prix_unitaire * (1 - self.remise_pct / 100)).quantize(Decimal('0.01'))

    def save(self, *args, **kwargs):
        if not self.designation and self.article:
            self.designation = self.article.designation
        super().save(*args, **kwargs)
        self.facture.recalculer_montant()

    def delete(self, *args, **kwargs):
        facture = self.facture
        super().delete(*args, **kwargs)
        facture.recalculer_montant()


class ReglementClient(models.Model):
    class ModePaiement(models.TextChoices):
        ESPECES      = 'especes',      'Espèces'
        CHEQUE       = 'cheque',       'Chèque'
        VIREMENT     = 'virement',     'Virement bancaire'
        MOBILE_MONEY = 'mobile_money', 'Mobile Money'

    id                 = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facture            = models.ForeignKey(FactureVente, on_delete=models.CASCADE,
                                           related_name='reglements', verbose_name='Facture')
    date_reglement     = models.DateField('Date de règlement', default=date.today)
    montant            = models.DecimalField('Montant (FCFA)', max_digits=14, decimal_places=2,
                                             validators=[MinValueValidator(Decimal('0.01'))])
    mode_paiement      = models.CharField('Mode de paiement', max_length=20,
                                          choices=ModePaiement.choices, default=ModePaiement.VIREMENT)
    reference_paiement = models.CharField('Référence paiement', max_length=100, blank=True)
    notes              = models.TextField('Notes', blank=True)
    saisi_par          = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True,
        related_name='reglements_clients_saisis',
        verbose_name='Saisi par',
    )
    date_creation      = models.DateTimeField('Date création', auto_now_add=True)

    class Meta:
        db_table            = 'commercial_reglement_client'
        verbose_name        = 'Règlement client'
        verbose_name_plural = 'Règlements client'
        ordering            = ['-date_reglement']

    def __str__(self):
        return f"{self.facture.reference} — {self.montant} FCFA"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.facture.recalculer_reglement()

    def delete(self, *args, **kwargs):
        facture = self.facture
        super().delete(*args, **kwargs)
        facture.recalculer_reglement()


# ---------------------------------------------------------------------------
# 7. RETOURS / SAV
# ---------------------------------------------------------------------------

class RetourClient(models.Model):
    class Statut(models.TextChoices):
        DEMANDE  = 'demande',  'Demande reçue'
        APPROUVE = 'approuve', 'Approuvé'
        RECU     = 'recu',     'Marchandise reçue'
        TRAITE   = 'traite',   'Traité'

    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference     = models.CharField('Référence', max_length=25, unique=True)
    client        = models.ForeignKey(Client, on_delete=models.PROTECT,
                                      related_name='retours', verbose_name='Client')
    commande      = models.ForeignKey(
        CommandeClient,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='retours',
        verbose_name="Commande d'origine",
    )
    facture       = models.ForeignKey(
        FactureVente,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='retours',
        verbose_name="Facture d'origine",
    )
    statut        = models.CharField('Statut', max_length=20, choices=Statut.choices, default=Statut.DEMANDE)
    date_demande  = models.DateField('Date de demande', default=date.today)
    motif         = models.TextField('Motif du retour')
    notes         = models.TextField('Notes internes', blank=True)
    cree_par      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True,
        related_name='retours_client_crees',
        verbose_name='Créé par',
    )
    date_creation = models.DateTimeField('Date création', auto_now_add=True)
    date_modif    = models.DateTimeField('Date modification', auto_now=True)
    history       = HistoricalRecords()

    class Meta:
        db_table            = 'commercial_retour_client'
        verbose_name        = 'Retour client'
        verbose_name_plural = 'Retours client'
        ordering            = ['-date_creation']

    def __str__(self):
        return f"{self.reference} — {self.client.raison_sociale}"


class LigneRetourClient(models.Model):
    class Etat(models.TextChoices):
        BON              = 'bon',              'Bon état'
        DEFECTUEUX       = 'defectueux',       'Défectueux'
        A_RECONDITIONNER = 'a_reconditionner', 'À reconditionner'

    class Action(models.TextChoices):
        REMISE_EN_STOCK = 'remise_en_stock', 'Remise en stock'
        MISE_EN_REBUT   = 'mise_en_rebut',   'Mise en rebut'
        RENVOI_CLIENT   = 'renvoi_client',   'Renvoi au client'

    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    retour   = models.ForeignKey(RetourClient, on_delete=models.CASCADE,
                                 related_name='lignes', verbose_name='Retour')
    article  = models.ForeignKey(
        'production.Article',
        on_delete=models.PROTECT,
        related_name='lignes_retour_client',
        verbose_name='Article',
    )
    lot      = models.ForeignKey(
        'production.Lot',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='lignes_retour_client',
        verbose_name='Lot',
    )
    quantite = models.DecimalField('Quantité', max_digits=12, decimal_places=3,
                                   validators=[MinValueValidator(Decimal('0.001'))])
    etat     = models.CharField('État du produit', max_length=20, choices=Etat.choices, default=Etat.BON)
    action   = models.CharField('Action post-retour', max_length=20, choices=Action.choices,
                                 default=Action.REMISE_EN_STOCK)

    class Meta:
        db_table            = 'commercial_ligne_retour_client'
        verbose_name        = 'Ligne de retour client'
        verbose_name_plural = 'Lignes de retour client'

    def __str__(self):
        return f"{self.retour.reference} — {self.article.designation}"
