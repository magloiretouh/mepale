"""
MEPALE ERP — Module Logistique : Modèles
Couvre : Fournisseurs, Demandes d'Achat, Commandes Fournisseur,
         Réceptions, Stock (par article + par lot), Mouvements.
"""

import uuid
from django.db import models
from django.core.validators import MinValueValidator
from django.conf import settings
from simple_history.models import HistoricalRecords


# ---------------------------------------------------------------------------
# 1. FOURNISSEURS
# ---------------------------------------------------------------------------

class Fournisseur(models.Model):
    class Categorie(models.TextChoices):
        MATIERES_PREMIERES = 'mp',    'Matières premières'
        SERVICES           = 'serv',  'Services'
        IMMOBILISATIONS    = 'immo',  'Immobilisations'
        GENERAL            = 'gen',   'Général'

    class Qualification(models.TextChoices):
        EN_EVALUATION = 'en_evaluation', 'En évaluation'
        APPROUVE      = 'approuve',      'Approuvé'
        SUSPENDU      = 'suspendu',      'Suspendu'
        BLACKLISTE    = 'blackliste',    'Blacklisté'

    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code          = models.CharField('Code', max_length=20, unique=True)
    raison_sociale = models.CharField('Raison sociale', max_length=200)
    nif           = models.CharField('NIF Togo', max_length=20, blank=True)
    categorie     = models.CharField('Catégorie', max_length=10, choices=Categorie.choices, default=Categorie.GENERAL)
    qualification  = models.CharField(
        'Qualification', max_length=20,
        choices=Qualification.choices,
        default=Qualification.EN_EVALUATION,
    )

    # Contact principal (conservé pour rétro-compatibilité — voir ContactFournisseur pour les contacts multiples)
    telephone     = models.CharField('Téléphone', max_length=20, blank=True)
    email         = models.EmailField('Email', blank=True)
    adresse       = models.TextField('Adresse', blank=True)
    ville         = models.CharField('Ville', max_length=100, blank=True, default='Lomé')
    pays          = models.CharField('Pays', max_length=50, default='Togo')

    # Conditions commerciales
    delai_livraison = models.PositiveSmallIntegerField('Délai livraison (jours)', default=7)
    conditions_paiement = models.CharField('Conditions de paiement', max_length=100, blank=True)
    banque         = models.CharField('Banque', max_length=100, blank=True)
    rib            = models.CharField('RIB', max_length=50, blank=True)

    # Statut
    actif          = models.BooleanField('Actif', default=True)
    blackliste     = models.BooleanField('Blacklisté', default=False)
    motif_blacklist = models.TextField('Motif blacklist', blank=True)
    notes          = models.TextField('Notes', blank=True)

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name        = 'Fournisseur'
        verbose_name_plural = 'Fournisseurs'
        ordering            = ['raison_sociale']

    def __str__(self):
        return f"[{self.code}] {self.raison_sociale}"

    @property
    def solde_ouvert(self):
        """
        Solde dû au fournisseur = (factures + frais non soldés) − avoirs disponibles.
        Les avoirs réduisent le solde uniquement s'ils ne sont pas encore entièrement imputés.
        """
        from django.db.models import Sum
        OUVERTS = ['en_attente', 'partiellement_payee']

        # Factures normales + frais
        r_fac = self.factures.filter(
            type_document__in=['facture', 'frais'],
            statut__in=OUVERTS,
        ).aggregate(total=Sum('montant_ttc'), paye=Sum('montant_paye'))
        total = float(r_fac['total'] or 0)
        paye  = float(r_fac['paye']  or 0)

        # Avoirs disponibles (crédit non encore imputé)
        r_av = self.factures.filter(
            type_document='avoir',
            statut__in=OUVERTS,
        ).aggregate(total_av=Sum('montant_ttc'), paye_av=Sum('montant_paye'))
        avoir_dispo = float(r_av['total_av'] or 0) - float(r_av['paye_av'] or 0)

        return max(0.0, total - paye - avoir_dispo)

    @classmethod
    def prochain_code(cls):
        """Génère le prochain code fournisseur de la forme FOUR-0001."""
        import re
        derniers = (
            cls.objects.filter(code__startswith='FOUR-')
            .values_list('code', flat=True)
        )
        max_num = 0
        for code in derniers:
            m = re.match(r'^FOUR-(\d+)$', code)
            if m:
                max_num = max(max_num, int(m.group(1)))
        return f"FOUR-{max_num + 1:04d}"


# ---------------------------------------------------------------------------
# 2. STOCK PAR ARTICLE (solde global par article)
# ---------------------------------------------------------------------------

class StockArticle(models.Model):
    """
    Solde de stock agrégé par article.
    Mis à jour à chaque mouvement de stock.
    """
    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article             = models.OneToOneField(
        'production.Article', on_delete=models.CASCADE,
        related_name='stock', verbose_name='Article'
    )
    quantite_disponible = models.DecimalField(
        'Quantité disponible', max_digits=14, decimal_places=3, default=0
    )
    quantite_reservee   = models.DecimalField(
        'Quantité réservée (OFs confirmés)', max_digits=14, decimal_places=3, default=0
    )
    seuil_alerte        = models.DecimalField(
        'Seuil d\'alerte', max_digits=14, decimal_places=3, default=0,
        help_text='Déclenche une alerte si quantité dispo < seuil'
    )
    stock_min           = models.DecimalField(
        'Stock minimum', max_digits=14, decimal_places=3, default=0,
        help_text='Niveau en dessous duquel réapprovisionner immédiatement'
    )
    stock_securite      = models.DecimalField(
        'Stock de sécurité', max_digits=14, decimal_places=3, default=0,
        help_text='Tampon pour absorber les aléas de livraison'
    )
    qte_reappro         = models.DecimalField(
        'Quantité de réapprovisionnement', max_digits=14, decimal_places=3, default=0,
        help_text='Quantité standard à commander pour le réappro'
    )
    derniere_maj        = models.DateTimeField('Dernière mise à jour', auto_now=True)

    class Meta:
        verbose_name        = 'Stock article'
        verbose_name_plural = 'Stocks articles'

    def __str__(self):
        return f"Stock {self.article.designation}: {self.quantite_disponible} {self.article.unite.code}"

    @property
    def est_sous_seuil(self):
        """True si quantite_disponible < seuil_alerte (alerte préventive)."""
        return self.seuil_alerte > 0 and self.quantite_disponible < self.seuil_alerte

    @property
    def est_critique(self):
        """
        S6 — True si quantite_disponible < stock_min (commande immédiate requise).
        Niveau d'urgence supérieur à est_sous_seuil.
        """
        return self.stock_min > 0 and self.quantite_disponible < self.stock_min

    @property
    def niveau_alerte(self):
        """
        S6 — Niveau d'alerte multi-paliers :
          'critique' : dispo < stock_min  → action immédiate
          'warning'  : dispo < seuil_alerte → planifier une commande
          'ok'       : tout va bien
        """
        if self.est_critique:
            return 'critique'
        if self.est_sous_seuil:
            return 'warning'
        return 'ok'

    @property
    def quantite_physique(self):
        return self.quantite_disponible + self.quantite_reservee

    @property
    def quantite_quarantaine(self):
        """
        M4 — Quantité physiquement présente mais bloquée (lots non conformes qualité).
        Lots avec statut=BLOQUE créés lors des réceptions NC (non jamais entrés en disponible).
        """
        from production.models import Lot
        from django.db.models import Sum, Value
        from django.db.models.functions import Coalesce
        from django.db.models import DecimalField as DBDecimalField
        from decimal import Decimal
        result = Lot.objects.filter(
            article=self.article,
            statut=Lot.Statut.BLOQUE,
        ).aggregate(
            total=Coalesce(Sum('quantite_restante'), Value(Decimal('0'), output_field=DBDecimalField()))
        )
        return result['total']

    @property
    def quantite_en_commande(self):
        """
        M5 — Quantité commandée en BC ouverts (envoyé / confirmé / partiellement reçu)
        mais pas encore réceptionnée. Correspond au stock « on-order » (SAP : qté commandée).
        """
        from .models import LigneBonCommande, BonCommande
        from django.db.models import Sum, Value, F, ExpressionWrapper
        from django.db.models.functions import Coalesce
        from django.db.models import DecimalField as DBDecimalField
        from decimal import Decimal
        result = LigneBonCommande.objects.filter(
            article=self.article,
            bon_commande__statut__in=[
                BonCommande.Statut.ENVOYE,
                BonCommande.Statut.CONFIRME,
                BonCommande.Statut.PARTIELLEMENT_RECU,
            ],
        ).annotate(
            qte_restante_field=ExpressionWrapper(
                F('quantite_commandee') - F('quantite_recue'),
                output_field=DBDecimalField(max_digits=14, decimal_places=3),
            )
        ).aggregate(
            total=Coalesce(
                Sum('qte_restante_field'),
                Value(Decimal('0'), output_field=DBDecimalField()),
            )
        )
        return result['total']

    @property
    def valeur_stock(self):
        """
        M6 — Valeur financière du stock disponible = quantite_disponible × prix_standard.
        Utilise Article.prix_standard (coût moyen mobile si méthode V, fixe si méthode S).
        """
        from decimal import Decimal
        return round(
            float(self.quantite_disponible) * float(self.article.prix_standard or Decimal('0')),
            2,
        )

    history = HistoricalRecords()                               # I10


# ---------------------------------------------------------------------------
# 3. MOUVEMENTS DE STOCK
# ---------------------------------------------------------------------------

class MouvementStock(models.Model):
    class Type(models.TextChoices):
        ENTREE_RECEPTION   = 'entree_recep',  'Entrée — Réception fournisseur'
        ENTREE_PRODUCTION  = 'entree_prod',   'Entrée — Production (PF)'
        SORTIE_PRODUCTION  = 'sortie_prod',   'Sortie — Consommation production'
        SORTIE_VENTE       = 'sortie_vente',  'Sortie — Vente client'
        AJUSTEMENT_POS     = 'ajust_pos',     'Ajustement positif (inventaire)'
        AJUSTEMENT_NEG     = 'ajust_neg',     'Ajustement négatif (inventaire)'
        TRANSFERT          = 'transfert',     'Transfert inter-entrepôt'
        RETOUR_FOURNISSEUR = 'retour_fourn',  'Retour — Fournisseur'  # GAP R4

    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article   = models.ForeignKey(
        'production.Article', on_delete=models.PROTECT,
        related_name='mouvements_stock'
    )
    lot       = models.ForeignKey(
        'production.Lot', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='mouvements'
    )
    type      = models.CharField('Type de mouvement', max_length=20, choices=Type.choices)
    quantite  = models.DecimalField(
        'Quantité', max_digits=12, decimal_places=3,
        validators=[MinValueValidator(0.001)]
    )
    # Sens : +1 = entrée, -1 = sortie
    sens      = models.SmallIntegerField('Sens', choices=[(1, 'Entrée'), (-1, 'Sortie')])
    cout_unitaire = models.DecimalField(
        'Coût unitaire (FCFA)', max_digits=14, decimal_places=2, default=0
    )
    reference_doc = models.CharField('Référence document', max_length=50, blank=True)
    notes         = models.TextField('Notes', blank=True)
    piece_jointe  = models.FileField(
        'Pièce jointe', upload_to='mouvements/',
        null=True, blank=True,
        help_text='Bon, facture ou tout justificatif du mouvement',
    )

    effectue_par  = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    date_mouvement = models.DateTimeField('Date du mouvement', auto_now_add=True)
    # M9 — Date comptable optionnelle (saisie rétroactive, corrections a posteriori)
    # Si null, date_mouvement fait foi dans les rapports et filtres de période.
    date_comptable = models.DateField(
        'Date comptable',
        null=True, blank=True,
        help_text=(
            'Date économique réelle du mouvement (ex : réception livrée vendredi, '
            'saisie lundi). Si vide, date_mouvement est utilisée pour les rapports.'
        ),
    )

    class Meta:
        verbose_name        = 'Mouvement de stock'
        verbose_name_plural = 'Mouvements de stock'
        ordering            = ['-date_mouvement']
        indexes             = [
            models.Index(fields=['article', '-date_mouvement']),
            models.Index(fields=['article', 'date_comptable']),   # M9 — filtre par période
        ]

    def __str__(self):
        sens_str = '↑' if self.sens == 1 else '↓'
        return f"{sens_str} {self.quantite} {self.article.unite.code} — {self.get_type_display()}"


# ---------------------------------------------------------------------------
# 4. DEMANDES D'ACHAT (DA)
# ---------------------------------------------------------------------------

class DemandeAchat(models.Model):
    class Statut(models.TextChoices):
        BROUILLON = 'brouillon', 'Brouillon'
        SOUMISE   = 'soumise',   'Soumise'
        APPROUVEE = 'approuvee', 'Approuvée'
        REFUSEE   = 'refusee',   'Refusée'
        TRAITEE   = 'traitee',   'Traitée (BC émis)'
        ATTENTE_DIRECTION = 'attente_direction', 'En attente approbation direction'

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference  = models.CharField('Référence', max_length=20, unique=True)
    statut     = models.CharField('Statut', max_length=20, choices=Statut.choices, default=Statut.BROUILLON)
    urgence    = models.BooleanField('Urgente', default=False)
    montant_estime = models.DecimalField(
        'Montant estimé (FCFA)', max_digits=14, decimal_places=2,
        null=True, blank=True,
        help_text='Montant estimé de la commande — au-delà de 5 000 000 FCFA, approbation direction requise'
    )
    notes      = models.TextField('Notes', blank=True)

    # Versioning — da_parente pointe toujours vers la V1 (racine)
    version    = models.PositiveSmallIntegerField('Version', default=1)
    da_parente = models.ForeignKey(
        'self', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='versions',
        verbose_name='DA parente (V1)',
    )

    demandeur  = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='demandes_achat'
    )
    approuve_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='da_approuvees'
    )
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name        = "Demande d'achat"
        verbose_name_plural = "Demandes d'achat"
        ordering            = ['-date_creation']

    def __str__(self):
        return f"{self.reference} — {self.get_statut_display()}"

    @property
    def peut_etre_modifie(self) -> bool:
        """
        Brouillon → toujours modifiable.
        Approuvée → modifiable seulement si aucune ligne n'est déjà commandée en BC.
        """
        if self.statut == self.Statut.BROUILLON:
            return True
        if self.statut == self.Statut.APPROUVEE:
            # Utilise le prefetch cache si disponible (évite N+1 en liste)
            return not any(l.quantite_commandee > 0 for l in self.lignes.all())
        return False


class LigneDemandeAchat(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    demande      = models.ForeignKey(DemandeAchat, on_delete=models.CASCADE, related_name='lignes')
    article      = models.ForeignKey('production.Article', on_delete=models.PROTECT)
    quantite     = models.DecimalField('Quantité', max_digits=12, decimal_places=3,
                                       validators=[MinValueValidator(0.001)])
    quantite_commandee = models.DecimalField(
        'Quantité déjà commandée (BCs)', max_digits=12, decimal_places=3, default=0
    )
    fournisseur_suggere = models.ForeignKey(
        Fournisseur, on_delete=models.SET_NULL, null=True, blank=True
    )
    prix_unitaire_estime = models.DecimalField(
        'Prix unitaire estimé (FCFA)', max_digits=14, decimal_places=2,
        null=True, blank=True,
        help_text='Prix estimé pour calculer le montant total de la DA',
    )
    notes        = models.CharField('Notes', max_length=200, blank=True)

    class Meta:
        unique_together = ('demande', 'article')

    def __str__(self):
        return f"{self.article.designation} × {self.quantite}"

    @property
    def quantite_restante(self):
        """Quantité encore non commandée dans un BC."""
        from decimal import Decimal
        return max(self.quantite - self.quantite_commandee, Decimal('0'))


# ---------------------------------------------------------------------------
# 1b. CONTACTS FOURNISSEUR (multiples)
# ---------------------------------------------------------------------------

class ContactFournisseur(models.Model):
    """Contacts multiples d'un fournisseur (commercial, technique, direction…)."""

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fournisseur = models.ForeignKey(
        Fournisseur, on_delete=models.CASCADE, related_name='contacts'
    )
    nom         = models.CharField('Nom complet', max_length=100)
    role        = models.CharField('Rôle / fonction', max_length=100, blank=True)
    telephone   = models.CharField('Téléphone', max_length=20, blank=True)
    email       = models.EmailField('Email', blank=True)
    principal   = models.BooleanField(
        'Contact principal', default=False,
        help_text='Un seul contact principal par fournisseur.'
    )
    notes       = models.TextField('Notes', blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Contact fournisseur'
        verbose_name_plural = 'Contacts fournisseur'
        ordering            = ['-principal', 'nom']

    def __str__(self):
        return f"{self.nom} ({self.fournisseur.raison_sociale})"

    def save(self, *args, **kwargs):
        # Garantir l'unicité du contact principal par fournisseur
        if self.principal:
            ContactFournisseur.objects.filter(
                fournisseur=self.fournisseur, principal=True
            ).exclude(pk=self.pk).update(principal=False)
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# 1c. CATALOGUE ARTICLES FOURNISSEUR
# ---------------------------------------------------------------------------

class FournisseurArticle(models.Model):
    """
    Catalogue des articles qu'un fournisseur est capable de livrer,
    avec ses propres références, prix et délais.
    """

    id                   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fournisseur          = models.ForeignKey(
        Fournisseur, on_delete=models.CASCADE, related_name='articles_fournis'
    )
    article              = models.ForeignKey(
        'production.Article', on_delete=models.CASCADE, related_name='fournisseurs'
    )
    reference_fournisseur = models.CharField('Référence fournisseur', max_length=100, blank=True)
    prix_unitaire        = models.DecimalField(
        'Prix unitaire (FCFA)', max_digits=14, decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    delai_livraison      = models.PositiveSmallIntegerField(
        'Délai livraison (jours)', default=7
    )
    quantite_min_commande = models.DecimalField(
        'Quantité minimum de commande', max_digits=12, decimal_places=3,
        default=1, validators=[MinValueValidator(0.001)]
    )
    actif                = models.BooleanField('Actif', default=True)
    date_derniere_commande = models.DateField(
        'Dernière commande', null=True, blank=True
    )
    notes                = models.TextField('Notes', blank=True)
    date_creation        = models.DateTimeField(auto_now_add=True)
    date_modif           = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = 'Article fournisseur'
        verbose_name_plural = 'Articles fournisseurs'
        unique_together     = ('fournisseur', 'article')
        ordering            = ['article__designation']

    def __str__(self):
        return f"{self.fournisseur.code} → {self.article.designation} ({self.prix_unitaire} FCFA)"


# ---------------------------------------------------------------------------
# 1d. CONTRATS-CADRES FOURNISSEUR
# ---------------------------------------------------------------------------

class ContratFournisseur(models.Model):
    class TypeContrat(models.TextChoices):
        CADRE      = 'cadre',      'Contrat-cadre'
        EXCLUSIVITE = 'exclusivite', 'Exclusivité'
        ANNUEL     = 'annuel',     'Accord annuel'
        PONCTUEL   = 'ponctuel',   'Achat ponctuel'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fournisseur = models.ForeignKey(
        Fournisseur, on_delete=models.CASCADE, related_name='contrats'
    )
    reference   = models.CharField('Référence contrat', max_length=50, unique=True)
    type_contrat = models.CharField(
        'Type', max_length=20, choices=TypeContrat.choices, default=TypeContrat.CADRE
    )
    date_debut  = models.DateField('Date de début')
    date_fin    = models.DateField('Date de fin', null=True, blank=True)
    montant_max = models.DecimalField(
        'Montant maximum (FCFA)', max_digits=14, decimal_places=2,
        null=True, blank=True,
        help_text='Plafond du contrat ; laisser vide si illimité.'
    )
    actif       = models.BooleanField('Actif', default=True)
    description = models.TextField('Description / conditions', blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = 'Contrat fournisseur'
        verbose_name_plural = 'Contrats fournisseurs'
        ordering            = ['-date_debut']

    def __str__(self):
        return f"{self.reference} — {self.fournisseur.raison_sociale}"

    @property
    def est_expire(self):
        from django.utils import timezone
        if self.date_fin is None:
            return False
        return self.date_fin < timezone.now().date()


# ---------------------------------------------------------------------------
# 5. BON DE COMMANDE FOURNISSEUR (BC)
# ---------------------------------------------------------------------------

class ConditionTarifaire(models.Model):
    """
    Catalogue des conditions tarifaires gérées par l'administration.
    Applicables en majoration ou réduction, en pourcentage ou montant fixe,
    au niveau du BC global ou de chaque ligne.
    """
    class ModeCalcul(models.TextChoices):
        POURCENTAGE  = 'pourcentage',  'Pourcentage (%)'
        MONTANT_FIXE = 'montant_fixe', 'Montant fixe (FCFA)'

    class TypeEffet(models.TextChoices):
        MAJORATION = 'majoration', 'Majoration (frais, taxe)'
        REDUCTION  = 'reduction',  'Réduction (remise, escompte)'

    class Niveau(models.TextChoices):
        BC    = 'bc',    'Bon de commande (global)'
        LIGNE = 'ligne', 'Ligne de commande'

    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom           = models.CharField('Nom', max_length=100, unique=True)
    mode_calcul   = models.CharField('Mode de calcul', max_length=15,
                                     choices=ModeCalcul.choices, default=ModeCalcul.POURCENTAGE)
    type_effet    = models.CharField('Type d\'effet', max_length=15,
                                     choices=TypeEffet.choices, default=TypeEffet.MAJORATION)
    niveau        = models.CharField('Niveau d\'application', max_length=10,
                                     choices=Niveau.choices, default=Niveau.BC)
    valeur_defaut = models.DecimalField('Valeur par défaut', max_digits=14, decimal_places=4, default=0)
    description   = models.TextField('Description', blank=True)
    actif         = models.BooleanField('Actif', default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = 'Condition tarifaire'
        verbose_name_plural = 'Conditions tarifaires'
        ordering            = ['nom']

    def __str__(self):
        return f"{self.nom} ({self.get_mode_calcul_display()}, {self.get_type_effet_display()})"


class BonCommande(models.Model):
    class Statut(models.TextChoices):
        BROUILLON  = 'brouillon',  'Brouillon'
        ENVOYE     = 'envoye',     'Envoyé'
        CONFIRME   = 'confirme',   'Confirmé par le fournisseur'
        PARTIELLEMENT_RECU = 'partiel', 'Partiellement reçu'
        RECU       = 'recu',       'Reçu intégralement'
        ANNULE     = 'annule',     'Annulé'

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference    = models.CharField('Référence', max_length=20, unique=True)
    fournisseur  = models.ForeignKey(Fournisseur, on_delete=models.PROTECT, related_name='bons_commande')
    statut       = models.CharField('Statut', max_length=15, choices=Statut.choices, default=Statut.BROUILLON)
    version      = models.PositiveSmallIntegerField('Version (amendements)', default=1)
    date_commande    = models.DateField('Date commande')
    date_livraison_prev = models.DateField('Date livraison prévue', null=True, blank=True)
    adresse_livraison   = models.TextField('Adresse de livraison', blank=True,
                                           help_text='Laisser vide pour utiliser l\'adresse par défaut de l\'entreprise.')

    montant_ht   = models.DecimalField('Montant HT (FCFA)', max_digits=14, decimal_places=2, default=0)
    montant_ttc  = models.DecimalField('Montant TTC (FCFA)', max_digits=14, decimal_places=2, default=0)

    notes        = models.TextField('Notes', blank=True)
    cree_par     = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='bcs_crees'
    )
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name        = 'Bon de commande'
        verbose_name_plural = 'Bons de commande'
        ordering            = ['-date_creation']

    def __str__(self):
        return f"{self.reference} — {self.fournisseur.raison_sociale}"

    def calculer_totaux(self):
        """
        Calcul séquentiel par ordre d'application.
        1. Lignes : chaque ligne accumule ses conditions (niveau 'ligne') → montant net.
        2. BC : running_total = Σ montants nets, puis conditions BC appliquées dans l'ordre.
        """
        from decimal import Decimal
        ZERO = Decimal('0')

        # ── Étape 1 : montant net par ligne ───────────────────────────────────
        montant_ht_total = ZERO
        for ligne in self.lignes.prefetch_related('conditions').all():
            running = ligne.montant_ht
            for cond in ligne.conditions.order_by('ordre'):
                if cond.mode_calcul_snapshot == ConditionTarifaire.ModeCalcul.POURCENTAGE:
                    amount = (running * Decimal(str(cond.valeur)) / Decimal('100')).quantize(Decimal('0.01'))
                else:
                    amount = Decimal(str(cond.valeur)).quantize(Decimal('0.01'))
                if cond.type_effet_snapshot == ConditionTarifaire.TypeEffet.MAJORATION:
                    running += amount
                else:
                    running = max(ZERO, running - amount)
            montant_ht_total += running

        # ── Étape 2 : conditions BC séquentielles ─────────────────────────────
        running_ttc = montant_ht_total
        for cond in self.conditions.order_by('ordre'):
            if cond.mode_calcul_snapshot == ConditionTarifaire.ModeCalcul.POURCENTAGE:
                amount = (running_ttc * Decimal(str(cond.valeur)) / Decimal('100')).quantize(Decimal('0.01'))
            else:
                amount = Decimal(str(cond.valeur)).quantize(Decimal('0.01'))
            if cond.type_effet_snapshot == ConditionTarifaire.TypeEffet.MAJORATION:
                running_ttc += amount
            else:
                running_ttc = max(ZERO, running_ttc - amount)

        self.montant_ht  = montant_ht_total
        self.montant_ttc = running_ttc
        self.save(update_fields=['montant_ht', 'montant_ttc'])


class LigneBonCommande(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bon_commande   = models.ForeignKey(BonCommande, on_delete=models.CASCADE, related_name='lignes')
    article        = models.ForeignKey('production.Article', on_delete=models.PROTECT)
    quantite_commandee = models.DecimalField('Quantité commandée', max_digits=12, decimal_places=3,
                                              validators=[MinValueValidator(0.001)])
    quantite_recue = models.DecimalField('Quantité reçue', max_digits=12, decimal_places=3, default=0)
    prix_unitaire  = models.DecimalField('Prix unitaire (FCFA)', max_digits=14, decimal_places=2,
                                          validators=[MinValueValidator(0)])
    ligne_da       = models.ForeignKey(
        'LigneDemandeAchat', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='lignes_bc',
        verbose_name='Ligne DA d\'origine',
    )

    class Meta:
        unique_together = ('bon_commande', 'article')

    def __str__(self):
        return f"{self.article.designation} × {self.quantite_commandee}"

    @property
    def montant_ht(self):
        return self.quantite_commandee * self.prix_unitaire

    @property
    def quantite_restante(self):
        return self.quantite_commandee - self.quantite_recue


class ConditionAppliqueeBC(models.Model):
    """
    Application d'une condition tarifaire à un BC (niveau BC) ou à une ligne BC (niveau ligne).
    Exactement l'un des deux FKs doit être renseigné.
    Les champs *_snapshot immunisent le calcul contre les modifications futures du catalogue.
    """
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    condition    = models.ForeignKey(
        ConditionTarifaire, on_delete=models.PROTECT, related_name='applications'
    )
    bon_commande = models.ForeignKey(
        BonCommande, on_delete=models.CASCADE,
        null=True, blank=True, related_name='conditions'
    )
    ligne_bc     = models.ForeignKey(
        LigneBonCommande, on_delete=models.CASCADE,
        null=True, blank=True, related_name='conditions'
    )
    ordre        = models.PositiveSmallIntegerField('Ordre d\'application', default=0)
    valeur       = models.DecimalField(
        'Valeur', max_digits=14, decimal_places=4,
        validators=[MinValueValidator(0)],
        help_text='Valeur capturée au moment de l\'application (snapshot).',
    )
    nom_snapshot         = models.CharField('Nom (snapshot)', max_length=100)
    mode_calcul_snapshot = models.CharField('Mode calcul (snapshot)', max_length=15)
    type_effet_snapshot  = models.CharField('Type effet (snapshot)', max_length=15)

    class Meta:
        verbose_name        = 'Condition appliquée BC'
        verbose_name_plural = 'Conditions appliquées BC'
        ordering            = ['ordre']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(bon_commande__isnull=False, ligne_bc__isnull=True) |
                    models.Q(bon_commande__isnull=True,  ligne_bc__isnull=False)
                ),
                name='condition_appliquee_bc_exclusif',
            )
        ]

    def __str__(self):
        return f"{self.nom_snapshot} — {self.valeur}"

    def clean(self):
        from django.core.exceptions import ValidationError
        if not self.bon_commande_id and not self.ligne_bc_id:
            raise ValidationError('Préciser bon_commande ou ligne_bc.')
        if self.bon_commande_id and self.ligne_bc_id:
            raise ValidationError('bon_commande et ligne_bc sont mutuellement exclusifs.')


# ---------------------------------------------------------------------------
# 6. RÉCEPTIONS
# ---------------------------------------------------------------------------

class Reception(models.Model):
    class Statut(models.TextChoices):
        EN_COURS = 'en_cours', 'En cours'
        VALIDEE  = 'validee',  'Validée'
        REJETEE  = 'rejetee',  'Rejetée (retour fournisseur)'   # GAP R13

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference    = models.CharField('Référence', max_length=20, unique=True)
    bon_commande = models.ForeignKey(
        BonCommande, on_delete=models.PROTECT, related_name='receptions'
    )
    statut       = models.CharField('Statut', max_length=10, choices=Statut.choices, default=Statut.EN_COURS)
    date_reception        = models.DateField('Date de réception')
    numero_bl_fournisseur = models.CharField(                         # GAP R16
        'N° BL fournisseur', max_length=50, blank=True,
        help_text='Numéro du bon de livraison fournisseur.',
    )
    piece_jointe_bl = models.FileField(                               # GAP R8
        'BL fournisseur (scan)', upload_to='receptions/bl/',
        null=True, blank=True,
        help_text='Scan ou photo du bon de livraison fournisseur.',
    )
    notes    = models.TextField('Notes', blank=True)
    recue_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='receptions_effectuees'
    )
    date_creation = models.DateTimeField(auto_now_add=True)
    history       = HistoricalRecords()                               # GAP R10

    class Meta:
        verbose_name        = 'Réception'
        verbose_name_plural = 'Réceptions'
        ordering            = ['-date_reception']

    def __str__(self):
        return f"{self.reference} — {self.bon_commande.fournisseur.raison_sociale}"

    @property
    def est_livraison_a_temps(self):
        """True si la réception est arrivée à la date prévue ou avant."""
        date_prev = self.bon_commande.date_livraison_prev
        if date_prev is None:
            return None  # Pas de date prévue : non déterminable
        return self.date_reception <= date_prev

    @property
    def jours_retard(self):
        """Nombre de jours de retard (0 si à l'heure ou en avance, négatif si en avance)."""
        date_prev = self.bon_commande.date_livraison_prev
        if date_prev is None:
            return None
        delta = (self.date_reception - date_prev).days
        return max(delta, 0)  # 0 si à l'heure ou en avance


class LigneReception(models.Model):
    """
    Chaque ligne de réception crée un lot MP en stock (traçabilité).
    """
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reception       = models.ForeignKey(Reception, on_delete=models.CASCADE, related_name='lignes')
    ligne_bc        = models.ForeignKey(LigneBonCommande, on_delete=models.PROTECT)
    quantite_recue  = models.DecimalField('Quantité reçue', max_digits=12, decimal_places=3,
                                           validators=[MinValueValidator(0.001)])
    numero_lot_fournisseur = models.CharField('N° lot fournisseur', max_length=50, blank=True)
    date_peremption = models.DateField('Date de péremption', null=True, blank=True)
    conforme        = models.BooleanField('Conforme', default=True)
    motif_non_conformite = models.TextField('Motif non-conformité', blank=True)
    lot_cree        = models.ForeignKey(
        'production.Lot', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reception_source'
    )

    def __str__(self):
        return f"{self.ligne_bc.article.designation} × {self.quantite_recue}"


# ---------------------------------------------------------------------------
# 6b. RETOURS FOURNISSEURS (GAP R4)
# ---------------------------------------------------------------------------

class RetourFournisseur(models.Model):
    """
    Retour de marchandises au fournisseur après réception non conforme
    ou livraison erronée.
    Chaque ligne de retour cible une LigneReception spécifique et son lot.
    La validation crée un MouvementStock (sens=-1, type=RETOUR_FOURNISSEUR).
    """
    class Statut(models.TextChoices):
        EN_COURS = 'en_cours', 'En cours'
        VALIDE   = 'valide',   'Validé'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference   = models.CharField('Référence', max_length=20, unique=True)
    reception   = models.ForeignKey(
        Reception, on_delete=models.PROTECT, related_name='retours',
        verbose_name='Réception d\'origine',
    )
    fournisseur = models.ForeignKey(
        Fournisseur, on_delete=models.PROTECT, related_name='retours',
        help_text='Dénormalisé depuis la réception pour faciliter les requêtes.',
    )
    statut      = models.CharField('Statut', max_length=10, choices=Statut.choices, default=Statut.EN_COURS)
    date_retour = models.DateField('Date de retour')
    motif       = models.TextField('Motif du retour')
    notes       = models.TextField('Notes', blank=True)
    cree_par    = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='retours_crees',
    )
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)
    history       = HistoricalRecords()

    class Meta:
        verbose_name        = 'Retour fournisseur'
        verbose_name_plural = 'Retours fournisseur'
        ordering            = ['-date_creation']

    def __str__(self):
        return f"{self.reference} — {self.fournisseur.raison_sociale}"


class LigneRetour(models.Model):
    """
    Ligne d'un retour fournisseur : quelle LigneReception (et son lot) est retournée,
    et en quelle quantité.
    La quantite_retournee ne peut pas dépasser la quantite_recue de la ligne d'origine.
    """
    id                 = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    retour             = models.ForeignKey(
        RetourFournisseur, on_delete=models.CASCADE, related_name='lignes',
    )
    ligne_reception    = models.ForeignKey(
        LigneReception, on_delete=models.PROTECT, related_name='retours',
    )
    quantite_retournee = models.DecimalField(
        'Quantité retournée', max_digits=12, decimal_places=3,
        validators=[MinValueValidator(0.001)],
    )

    class Meta:
        verbose_name        = 'Ligne retour'
        verbose_name_plural = 'Lignes retour'

    def __str__(self):
        return f"{self.ligne_reception.ligne_bc.article.designation} × {self.quantite_retournee}"


# ---------------------------------------------------------------------------
# 7. ÉVALUATIONS FOURNISSEURS
# ---------------------------------------------------------------------------

class EvaluationFournisseur(models.Model):
    """Évaluation qualitative d'un fournisseur après réception."""

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fournisseur     = models.ForeignKey(Fournisseur, on_delete=models.CASCADE, related_name='evaluations')
    bon_commande    = models.ForeignKey(
        BonCommande, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='evaluations'
    )
    note_qualite    = models.PositiveSmallIntegerField(
        'Note qualité (1-5)', choices=[(i, str(i)) for i in range(1, 6)]
    )
    note_delai      = models.PositiveSmallIntegerField(
        'Note délai (1-5)', choices=[(i, str(i)) for i in range(1, 6)]
    )
    note_prix       = models.PositiveSmallIntegerField(
        'Note prix (1-5)', choices=[(i, str(i)) for i in range(1, 6)]
    )
    commentaire     = models.TextField('Commentaire', blank=True)
    evaluateur      = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    date_evaluation = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Évaluation fournisseur'
        verbose_name_plural = 'Évaluations fournisseurs'
        ordering            = ['-date_evaluation']

    def __str__(self):
        return f"Éval. {self.fournisseur.raison_sociale} — Q:{self.note_qualite} D:{self.note_delai} P:{self.note_prix}"

    @property
    def note_moyenne(self):
        return round((self.note_qualite + self.note_delai + self.note_prix) / 3, 1)


# ---------------------------------------------------------------------------
# 8. FACTURES FOURNISSEURS
# ---------------------------------------------------------------------------

class FactureFournisseur(models.Model):
    """
    Facture, avoir ou frais de service fournisseur.
    Workflow : BROUILLON → SOUMISE → (ATTENTE_DIRECTION) → EN_ATTENTE → PARTIELLEMENT_PAYEE → PAYEE
               à tout moment → ANNULEE ou REJETEE
    """

    class TypeDocument(models.TextChoices):
        FACTURE = 'facture', 'Facture'
        AVOIR   = 'avoir',   'Avoir / Note de crédit'
        FRAIS   = 'frais',   'Facture de frais (hors BC)'

    class Statut(models.TextChoices):
        BROUILLON           = 'brouillon',           'Brouillon'
        SOUMISE             = 'soumise',             'Soumise pour approbation'
        ATTENTE_DIRECTION   = 'attente_direction',   'En attente approbation direction'
        EN_ATTENTE          = 'en_attente',          'Approuvée — En attente de paiement'
        PARTIELLEMENT_PAYEE = 'partiellement_payee', 'Partiellement payée'
        PAYEE               = 'payee',               'Payée intégralement'
        ANNULEE             = 'annulee',             'Annulée'
        REJETEE             = 'rejetee',             'Rejetée'

    # Seuil direction : > 2 000 000 FCFA → approbation direction requise
    SEUIL_DIRECTION_FCFA = 2_000_000

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference    = models.CharField('Référence interne', max_length=20, unique=True)
    ref_fournisseur = models.CharField('Réf. facture fournisseur', max_length=50, blank=True)
    fournisseur  = models.ForeignKey(Fournisseur, on_delete=models.PROTECT, related_name='factures')
    bon_commande = models.ForeignKey(
        BonCommande, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='factures'
    )
    reception    = models.ForeignKey(
        Reception, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='factures'
    )
    # F7 — Type de document
    type_document = models.CharField(
        'Type de document', max_length=10,
        choices=TypeDocument.choices, default=TypeDocument.FACTURE,
    )
    # F8 — Avoir : lien vers la facture d'origine
    facture_origine = models.ForeignKey(
        'self', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='avoirs',
        verbose_name='Facture d\'origine (avoirs uniquement)',
    )
    # F1 — Workflow : statut commence à BROUILLON
    statut       = models.CharField(
        'Statut', max_length=25, choices=Statut.choices, default=Statut.BROUILLON
    )
    montant_ht   = models.DecimalField('Montant HT (FCFA)', max_digits=14, decimal_places=2, default=0)
    tva          = models.DecimalField('TVA (FCFA)', max_digits=14, decimal_places=2, default=0)
    montant_ttc  = models.DecimalField('Montant TTC (FCFA)', max_digits=14, decimal_places=2, default=0)
    montant_paye = models.DecimalField('Montant payé (FCFA)', max_digits=14, decimal_places=2, default=0)
    date_facture = models.DateField('Date de la facture')
    date_echeance = models.DateField('Date d\'échéance')
    # F2 — Pièce jointe scan facture
    piece_jointe = models.FileField(
        'Scan facture', upload_to='factures/',
        null=True, blank=True,
        help_text='Scan ou photo de la facture papier reçue.',
    )
    notes        = models.TextField('Notes', blank=True)
    # F1 — Approbation
    approuve_par     = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='factures_approuvees',
    )
    date_approbation = models.DateTimeField('Date d\'approbation', null=True, blank=True)
    cree_par     = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='factures_creees',
    )
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modif    = models.DateTimeField(auto_now=True)

    # F4 — Audit trail
    history = HistoricalRecords()

    class Meta:
        verbose_name        = 'Facture fournisseur'
        verbose_name_plural = 'Factures fournisseurs'
        ordering            = ['-date_facture']

    def __str__(self):
        return f"{self.reference} [{self.get_type_document_display()}] — {self.fournisseur.raison_sociale} — {self.montant_ttc} FCFA"

    @property
    def montant_restant(self):
        from decimal import Decimal
        return max(self.montant_ttc - self.montant_paye, Decimal('0'))

    @property
    def est_en_retard(self):
        """
        True si la facture a des paiements en attente ET dépassés.
        Vérifie d'abord l'échéancier multi-échéances, puis la date_echeance directe.
        """
        from django.utils import timezone
        OUVERTS = [self.Statut.EN_ATTENTE, self.Statut.PARTIELLEMENT_PAYEE]
        if self.statut not in OUVERTS:
            return False
        today = timezone.now().date()
        # Échéancier multi-échéances (F10)
        if self.echeances.filter(payee=False, date_echeance__lt=today).exists():
            return True
        # Fallback date_echeance directe
        return self.date_echeance < today

    @property
    def est_avoir(self):
        return self.type_document == self.TypeDocument.AVOIR

    def calculer_totaux(self):
        """
        F9 — Recalcule montant_ht / tva / montant_ttc depuis les lignes.
        Sans effet si aucune ligne n'est présente (saisie manuelle conservée).
        """
        from decimal import Decimal
        lignes = list(self.lignes.all())
        if not lignes:
            return
        montant_ht = sum((l.montant_ht for l in lignes), Decimal('0'))
        tva        = sum((l.montant_tva for l in lignes), Decimal('0'))
        self.montant_ht  = montant_ht
        self.tva         = tva
        self.montant_ttc = montant_ht + tva
        self.save(update_fields=['montant_ht', 'tva', 'montant_ttc'])

    def recalculer_montant_paye(self):
        """
        F6 — Recalcule montant_paye depuis les paiements non annulés.
        Garantit l'intégrité même si un PaiementFacture est supprimé directement.
        Met également à jour le statut de paiement.
        """
        from django.db.models import Sum, Value
        from django.db.models.functions import Coalesce
        from decimal import Decimal
        from django.db.models import DecimalField as DBDecimalField
        result = self.paiements.filter(annule=False).aggregate(
            total=Coalesce(Sum('montant'), Value(Decimal('0'), output_field=DBDecimalField()))
        )
        self.montant_paye = result['total']
        # Mise à jour statut (hors ANNULEE / REJETEE)
        IMMUABLES = [self.Statut.ANNULEE, self.Statut.REJETEE]
        if self.statut not in IMMUABLES:
            if self.montant_paye >= self.montant_ttc and self.montant_ttc > 0:
                self.statut = self.Statut.PAYEE
            elif self.montant_paye > 0:
                self.statut = self.Statut.PARTIELLEMENT_PAYEE
            elif self.statut in [self.Statut.PARTIELLEMENT_PAYEE, self.Statut.PAYEE]:
                # Tous les paiements ont été annulés → retour EN_ATTENTE
                self.statut = self.Statut.EN_ATTENTE
        self.save(update_fields=['montant_paye', 'statut'])

    def maj_statut(self):
        """Alias de compatibilité — délègue à recalculer_montant_paye."""
        self.recalculer_montant_paye()


class PaiementFacture(models.Model):
    class Mode(models.TextChoices):
        VIREMENT      = 'virement',      'Virement bancaire'
        CHEQUE        = 'cheque',        'Chèque'
        ESPECES       = 'especes',       'Espèces'
        MOBILE_MONEY  = 'mobile_money',  'Mobile Money'
        AVOIR         = 'avoir',         'Imputation avoir fournisseur'   # F8

    id                 = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facture            = models.ForeignKey(FactureFournisseur, on_delete=models.CASCADE, related_name='paiements')
    montant            = models.DecimalField('Montant (FCFA)', max_digits=14, decimal_places=2,
                                             validators=[MinValueValidator(0.01)])
    date_paiement      = models.DateField('Date du paiement')
    mode_paiement      = models.CharField('Mode', max_length=15, choices=Mode.choices)
    reference_paiement = models.CharField('Référence', max_length=100, blank=True)
    # F13 — Pièce jointe justificatif paiement
    piece_jointe       = models.FileField(
        'Justificatif paiement', upload_to='paiements/',
        null=True, blank=True,
        help_text='Reçu virement, copie chèque, confirmation Mobile Money…',
    )
    # F6 — Annulation paiement (soft-delete)
    annule             = models.BooleanField('Annulé', default=False)
    effectue_par       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    date_saisie        = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Paiement'
        verbose_name_plural = 'Paiements'
        ordering            = ['-date_paiement']

    def __str__(self):
        annule_tag = ' [ANNULÉ]' if self.annule else ''
        return f"Paiement {self.montant} FCFA — {self.facture.reference}{annule_tag}"

    def delete(self, *args, **kwargs):
        """F6 — Recalcule montant_paye sur la facture parente après suppression physique."""
        facture = self.facture
        super().delete(*args, **kwargs)
        facture.recalculer_montant_paye()


# ---------------------------------------------------------------------------
# 8b. LIGNES DE FACTURE FOURNISSEUR (F9)
# ---------------------------------------------------------------------------

class LigneFactureFournisseur(models.Model):
    """
    F9 — Ligne détaillée d'une facture fournisseur.
    Lien optionnel vers la ligne BC d'origine pour le 3-way matching ligne à ligne.
    Si des lignes existent, FactureFournisseur.calculer_totaux() recompute les montants.
    """
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facture       = models.ForeignKey(
        FactureFournisseur, on_delete=models.CASCADE, related_name='lignes'
    )
    ligne_bc      = models.ForeignKey(
        LigneBonCommande, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='lignes_facture',
        verbose_name='Ligne BC d\'origine',
    )
    designation   = models.CharField('Désignation', max_length=200)
    quantite      = models.DecimalField(
        'Quantité', max_digits=12, decimal_places=3,
        validators=[MinValueValidator(0.001)],
    )
    prix_unitaire = models.DecimalField(
        'Prix unitaire (FCFA)', max_digits=14, decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    taux_tva      = models.DecimalField(
        'Taux TVA (%)', max_digits=5, decimal_places=2, default=18,
    )

    class Meta:
        verbose_name        = 'Ligne facture fournisseur'
        verbose_name_plural = 'Lignes facture fournisseur'

    def __str__(self):
        return f"{self.designation} × {self.quantite}"

    @property
    def montant_ht(self):
        return self.quantite * self.prix_unitaire

    @property
    def montant_tva(self):
        from decimal import Decimal
        return (self.montant_ht * Decimal(str(self.taux_tva)) / 100).quantize(Decimal('0.01'))

    @property
    def montant_ttc(self):
        return self.montant_ht + self.montant_tva

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Recalcule automatiquement les totaux de la facture parente
        self.facture.calculer_totaux()


# ---------------------------------------------------------------------------
# 8c. ÉCHÉANCIER MULTI-ÉCHÉANCES (F10)
# ---------------------------------------------------------------------------

class EcheanceFacture(models.Model):
    """
    F10 — Ligne d'échéancier pour une facture à paiements fractionnés.
    Exemple : 50 % à 30 jours + 50 % à 60 jours.
    La facture peut continuer à utiliser date_echeance pour les paiements simples ;
    EcheanceFacture est utilisée si plusieurs jalons sont nécessaires.
    """
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facture       = models.ForeignKey(
        FactureFournisseur, on_delete=models.CASCADE, related_name='echeances'
    )
    montant       = models.DecimalField(
        'Montant (FCFA)', max_digits=14, decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    date_echeance = models.DateField('Date d\'échéance')
    payee         = models.BooleanField('Payée', default=False)
    notes         = models.CharField('Notes', max_length=200, blank=True)

    class Meta:
        verbose_name        = 'Échéance facture'
        verbose_name_plural = 'Échéances facture'
        ordering            = ['date_echeance']

    def __str__(self):
        statut = 'Payée' if self.payee else 'En attente'
        return f"Échéance {self.montant} FCFA — {self.date_echeance} [{statut}]"

    @property
    def est_en_retard(self):
        from django.utils import timezone
        return not self.payee and self.date_echeance < timezone.now().date()


# ---------------------------------------------------------------------------
# 9. INVENTAIRES PHYSIQUES
# ---------------------------------------------------------------------------

class InventaireSession(models.Model):
    class Statut(models.TextChoices):
        EN_COURS = 'en_cours', 'En cours'
        VALIDE   = 'valide',   'Validé'
        ANNULE   = 'annule',   'Annulé'

    class TypePerimetre(models.TextChoices):        # I4 — Périmètre configurable
        COMPLET   = 'complet',   'Inventaire complet'
        CATEGORIE = 'categorie', "Par type d'article"
        ARTICLES  = 'articles',  'Articles spécifiques'

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference  = models.CharField('Référence', max_length=20, unique=True)
    statut     = models.CharField('Statut', max_length=10, choices=Statut.choices, default=Statut.EN_COURS)

    # I4 — Périmètre configurable
    type_perimetre  = models.CharField(
        'Type de périmètre', max_length=15,
        choices=TypePerimetre.choices, default=TypePerimetre.COMPLET,
    )
    categories      = models.JSONField(
        "Types d'articles ciblés", default=list, blank=True,
        help_text='Liste de types ex: ["mp","pf"] — actif si type_perimetre=categorie',
    )
    articles_cibles = models.ManyToManyField(
        'production.Article', blank=True,
        related_name='sessions_inventaire',
        verbose_name='Articles ciblés',
        help_text='Actif si type_perimetre=articles',
    )

    # I12 — Comptage en aveugle
    aveugle = models.BooleanField(
        'Comptage en aveugle', default=False,
        help_text='Si activé, la quantité théorique est masquée aux opérateurs lors de la saisie.',
    )

    notes      = models.TextField('Notes', blank=True)
    cree_par   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    date_debut = models.DateTimeField('Date début', auto_now_add=True)
    date_fin   = models.DateTimeField('Date fin', null=True, blank=True)

    class Meta:
        verbose_name        = 'Session d\'inventaire'
        verbose_name_plural = 'Sessions d\'inventaire'
        ordering            = ['-date_debut']

    def __str__(self):
        return f"{self.reference} — {self.get_statut_display()}"


class LigneInventaire(models.Model):
    """Ligne d'inventaire : un lot ou un article sans lot à compter."""

    class StatutSaisie(models.TextChoices):        # I7
        NON_SAISIE = 'non_saisie', 'Non saisie'
        SAISIE     = 'saisie',     'Saisie'
        VALIDEE    = 'validee',    'Validée'

    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(InventaireSession, on_delete=models.CASCADE, related_name='lignes')

    # ── Deux modes exclusifs ────────────────────────────────────────────────────
    # • lot     renseigné → article géré par lot   (gere_par_lot=True)
    # • article renseigné → article en stock global (gere_par_lot=False)
    lot     = models.ForeignKey(
        'production.Lot', on_delete=models.PROTECT,
        null=True, blank=True,
        verbose_name='Lot',
    )
    article = models.ForeignKey(
        'production.Article', on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='lignes_inventaire',
        verbose_name='Article (stock global)',
    )

    # Quantité système capturée à la création de la session (référence initiale)
    quantite_theorique         = models.DecimalField('Quantité système (gel)', max_digits=12, decimal_places=3)
    # I1 — Quantité système au moment effectif du posting (peut différer si gel imparfait)
    quantite_systeme_validation = models.DecimalField(
        'Quantité système à la validation', max_digits=12, decimal_places=3,
        null=True, blank=True,
    )
    quantite_comptee           = models.DecimalField('Quantité comptée', max_digits=12, decimal_places=3,
                                                     null=True, blank=True)
    # I3 — Prix pour valoriser l'ajustement (dernier prix d'achat connu)
    prix_unitaire_valorisation = models.DecimalField(
        'Prix unitaire valorisation (FCFA)', max_digits=14, decimal_places=2, default=0,
    )
    justification  = models.TextField('Justification écart', blank=True)
    statut_saisie  = models.CharField(                          # I7
        'Statut saisie', max_length=15,
        choices=StatutSaisie.choices, default=StatutSaisie.NON_SAISIE,
    )
    valide = models.BooleanField('Ligne validée', default=False)

    history = HistoricalRecords()                               # I10

    class Meta:
        verbose_name        = 'Ligne inventaire'
        verbose_name_plural = 'Lignes inventaire'
        constraints = [
            # Un lot ne peut figurer qu'une seule fois par session
            models.UniqueConstraint(
                fields=['session', 'lot'],
                condition=models.Q(lot__isnull=False),
                name='unique_ligne_inv_session_lot',
            ),
            # Un article sans lot ne peut figurer qu'une seule fois par session
            models.UniqueConstraint(
                fields=['session', 'article'],
                condition=models.Q(lot__isnull=True, article__isnull=False),
                name='unique_ligne_inv_session_article',
            ),
        ]

    def __str__(self):
        if self.lot_id:
            return f"Inv. {self.session.reference} — {self.lot.numero_lot}"
        return f"Inv. {self.session.reference} — {self.article.code if self.article_id else '?'}"

    @property
    def article_effectif(self):
        """Article associé, que ce soit via lot ou directement."""
        return self.lot.article if self.lot_id else self.article

    @property
    def ecart(self):
        """Écart = comptée − référence système.
        Utilise quantite_systeme_validation (valeur au posting) si disponible,
        sinon la quantite_theorique (valeur au gel)."""
        if self.quantite_comptee is not None:
            ref = (
                self.quantite_systeme_validation
                if self.quantite_systeme_validation is not None
                else self.quantite_theorique
            )
            return float(self.quantite_comptee) - float(ref)
        return None
