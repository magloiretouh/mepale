"""
MEPALE ERP — Modèles Ressources Humaines
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

User = get_user_model()


class EmployeeCategory(models.Model):
    """Catégorie RH (ex : Service, Cuisine, Management)."""

    name = models.CharField(max_length=100, unique=True, verbose_name="Nom")
    description = models.TextField(null=True, blank=True, verbose_name="Description")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "employee_categories"
        verbose_name = "Catégorie RH"
        verbose_name_plural = "Catégories RH"
        ordering = ["name"]

    def __str__(self):
        return self.name


class PrimeType(models.Model):
    """Type de prime (montant fixe en F CFA)."""

    name = models.CharField(max_length=100, verbose_name="Nom")
    description = models.TextField(null=True, blank=True, verbose_name="Description")
    is_taxable = models.BooleanField(
        default=False,
        verbose_name="Imposable (incluse dans la base CNSS/AMU)",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "prime_types"
        verbose_name = "Type de prime"
        verbose_name_plural = "Types de primes"
        ordering = ["name"]

    def __str__(self):
        return self.name


class CategoryPrimeSetting(models.Model):
    """Montant par défaut d'une prime pour une catégorie RH donnée."""

    category = models.ForeignKey(
        EmployeeCategory,
        on_delete=models.CASCADE,
        related_name="prime_settings",
        verbose_name="Catégorie",
    )
    prime_type = models.ForeignKey(
        PrimeType,
        on_delete=models.PROTECT,
        related_name="category_settings",
        verbose_name="Type de prime",
    )
    default_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name="Montant par défaut (F CFA)",
    )

    class Meta:
        db_table = "category_prime_settings"
        unique_together = [("category", "prime_type")]
        verbose_name = "Paramètre prime catégorie"
        verbose_name_plural = "Paramètres primes catégories"

    def __str__(self):
        return f"{self.category.name} — {self.prime_type.name} : {self.default_amount}"


class Employee(models.Model):
    """Employé de l'entreprise."""

    class ContractType(models.TextChoices):
        CDI = "CDI", "CDI"
        CDD = "CDD", "CDD"
        TEMPS_PARTIEL = "temps_partiel", "Temps partiel"
        EXTRA = "extra", "Extra"
        STAGE = "stage", "Stage"

    name = models.CharField(max_length=150, verbose_name="Nom complet")
    role = models.CharField(max_length=100, null=True, blank=True, verbose_name="Poste")
    contract_type = models.CharField(
        max_length=20,
        choices=ContractType.choices,
        null=True,
        blank=True,
        verbose_name="Type de contrat",
    )
    monthly_salary = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Salaire mensuel fixe (F CFA)",
    )
    hire_date = models.DateField(null=True, blank=True, verbose_name="Date d'embauche")
    birth_date = models.DateField(
        null=True, blank=True, verbose_name="Date de naissance"
    )
    phone = models.CharField(
        max_length=30, null=True, blank=True, verbose_name="Téléphone"
    )
    email = models.EmailField(
        max_length=150, null=True, blank=True, verbose_name="Email"
    )
    nif = models.CharField(max_length=50, null=True, blank=True, verbose_name="NIF")
    cnss_number = models.CharField(
        max_length=50, null=True, blank=True, verbose_name="N° CNSS"
    )
    is_active = models.BooleanField(default=True, verbose_name="Actif")
    category = models.ForeignKey(
        EmployeeCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
        verbose_name="Catégorie RH",
    )
    has_social_contributions = models.BooleanField(
        default=True,
        verbose_name="Soumis aux cotisations sociales (CNSS/AMU)",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "employees"
        verbose_name = "Employé"
        verbose_name_plural = "Employés"
        ordering = ["name"]

    def __str__(self):
        return self.name


class SalaryPayment(models.Model):
    """Paiement salarial (salaire, prime, avance, autre)."""

    class PaymentType(models.TextChoices):
        SALAIRE = "salaire", "Salaire"
        PRIME = "prime", "Prime"
        AVANCE = "avance", "Avance"
        AUTRE = "autre", "Autre"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.RESTRICT,
        related_name="salary_payments",
        verbose_name="Employé",
    )
    type = models.CharField(
        max_length=20, choices=PaymentType.choices, verbose_name="Type"
    )
    label = models.CharField(
        max_length=255, null=True, blank=True, verbose_name="Libellé"
    )
    # Net versé à l'employé (après cotisations et avance)
    amount = models.DecimalField(
        max_digits=10, decimal_places=2, verbose_name="Montant net versé"
    )
    # Brut — uniquement pour type=salaire
    gross_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Brut",
    )
    cnss_employee_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="CNSS salarié"
    )
    amu_employee_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="AMU salarié"
    )
    cnss_employer_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="CNSS patronal"
    )
    amu_employer_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="AMU patronal"
    )
    advance_deducted = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Avance déduite",
    )
    taxable_primes_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Total primes imposables incluses dans la base",
    )
    period_month = models.CharField(
        max_length=7, null=True, blank=True, verbose_name="Période (YYYY-MM)"
    )
    payment_date = models.DateField(verbose_name="Date de paiement")
    prime_type = models.ForeignKey(
        PrimeType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
        verbose_name="Type de prime",
    )
    linked_salary = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_payments",
        verbose_name="Fiche de salaire liée",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "salary_payments"
        verbose_name = "Paiement salarial"
        verbose_name_plural = "Paiements salariaux"
        ordering = ["-payment_date", "-created_at"]

    def __str__(self):
        return f"{self.employee.name} — {self.get_type_display()} — {self.payment_date}"


class SocialRates(models.Model):
    """
    Table singleton : taux CNSS/AMU et informations entreprise.
    Toujours accéder via SocialRates.get_instance().
    """

    cnss_employee_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("4.0"),
        verbose_name="Taux CNSS salarié (%)",
    )
    amu_employee_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("5.0"),
        verbose_name="Taux AMU salarié (%)",
    )
    cnss_employer_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("17.5"),
        verbose_name="Taux CNSS patronal (%)",
    )
    amu_employer_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("5.0"),
        verbose_name="Taux AMU patronal (%)",
    )
    company_name = models.CharField(
        max_length=200,
        default="MANZAY",
        verbose_name="Nom de l'entreprise",
    )
    company_address = models.CharField(
        max_length=300,
        null=True,
        blank=True,
        verbose_name="Adresse de l'entreprise",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "social_rates"
        verbose_name = "Taux sociaux"
        verbose_name_plural = "Taux sociaux"

    def __str__(self):
        return "Taux sociaux et paramètres RH"

    @classmethod
    def get_instance(cls):
        """Retourne l'unique instance, la crée avec les valeurs par défaut si inexistante."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


# ══════════════════════════════════════════════════════════════════════════════
# BROUILLON DE PAIE
# ══════════════════════════════════════════════════════════════════════════════


class PayrollDraft(models.Model):
    """
    Brouillon de traitement de paie mensuel.
    Un seul brouillon par période (period_month unique).
    Permet la collaboration : plusieurs utilisateurs peuvent modifier
    le même brouillon avant de lancer la paie définitive.
    """

    class Status(models.TextChoices):
        DRAFT     = "draft",     "Brouillon"
        SUBMITTED = "submitted", "Soumis"

    period_month = models.CharField(
        max_length=7,
        unique=True,
        verbose_name="Période (YYYY-MM)",
    )
    payment_date = models.DateField(verbose_name="Date de paiement prévue")
    # Structure JSON : {"rows": {"<employee_id>": {"included": bool, "gross": "str", "advance": "str"}}}
    data = models.JSONField(default=dict, verbose_name="Données de la grille")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name="Statut",
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="Dernière modification par",
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Dernière modification")
    created_at = models.DateTimeField(default=timezone.now, verbose_name="Créé le")

    class Meta:
        db_table = "payroll_drafts"
        verbose_name = "Brouillon de paie"
        verbose_name_plural = "Brouillons de paie"
        ordering = ["-period_month"]

    def __str__(self):
        return f"Brouillon paie {self.period_month} ({self.get_status_display()})"


# ══════════════════════════════════════════════════════════════════════════════
# CONGÉS & ABSENCES
# ══════════════════════════════════════════════════════════════════════════════


def _calc_jours_ouvres(date_debut, date_fin):
    """Compte les jours ouvrés (lun-ven) entre date_debut et date_fin inclus."""
    jours = 0
    current = date_debut
    while current <= date_fin:
        if current.weekday() < 5:
            jours += 1
        current += timedelta(days=1)
    return jours


class TypeConge(models.Model):
    """Type de congé (ex : Congé annuel, Maladie, Maternité, Sans solde…)."""

    name = models.CharField(max_length=100, unique=True, verbose_name="Nom")
    description = models.TextField(null=True, blank=True, verbose_name="Description")
    quota_annuel = models.DecimalField(
        max_digits=5, decimal_places=1, default=0,
        verbose_name="Quota annuel par défaut (jours ouvrés)",
    )
    est_paye = models.BooleanField(default=True, verbose_name="Congé payé")
    is_active = models.BooleanField(default=True, verbose_name="Actif")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "types_conge"
        verbose_name = "Type de congé"
        verbose_name_plural = "Types de congé"
        ordering = ["name"]

    def __str__(self):
        return self.name


class DemandeConge(models.Model):
    """Demande de congé soumise par (ou pour) un employé."""

    class Statut(models.TextChoices):
        BROUILLON = "brouillon", "Brouillon"
        SOUMISE   = "soumise",   "Soumise"
        APPROUVEE = "approuvee", "Approuvée"
        REFUSEE   = "refusee",   "Refusée"
        ANNULEE   = "annulee",   "Annulée"

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE,
        related_name="demandes_conge", verbose_name="Employé",
    )
    type_conge = models.ForeignKey(
        TypeConge, on_delete=models.PROTECT,
        related_name="demandes", verbose_name="Type de congé",
    )
    date_debut = models.DateField(verbose_name="Date de début")
    date_fin   = models.DateField(verbose_name="Date de fin")
    nb_jours   = models.DecimalField(
        max_digits=5, decimal_places=1, default=0,
        verbose_name="Nombre de jours ouvrés",
    )
    statut = models.CharField(
        max_length=20, choices=Statut.choices,
        default=Statut.BROUILLON, verbose_name="Statut",
    )
    motif = models.TextField(blank=True, verbose_name="Motif")
    commentaire_rh = models.TextField(
        blank=True, verbose_name="Commentaire RH (approbation / refus)",
    )
    approuve_par = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+", verbose_name="Approuvé / refusé par",
    )
    approuve_le = models.DateTimeField(
        null=True, blank=True, verbose_name="Date de décision",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "demandes_conge"
        verbose_name = "Demande de congé"
        verbose_name_plural = "Demandes de congé"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.employee.name} — {self.type_conge.name} ({self.date_debut} → {self.date_fin})"

    def calculer_nb_jours(self):
        self.nb_jours = _calc_jours_ouvres(self.date_debut, self.date_fin)


class SoldeConge(models.Model):
    """Solde de congé d'un employé pour un type et une année donnés."""

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE,
        related_name="soldes_conge", verbose_name="Employé",
    )
    type_conge = models.ForeignKey(
        TypeConge, on_delete=models.PROTECT,
        related_name="soldes", verbose_name="Type de congé",
    )
    annee = models.IntegerField(verbose_name="Année")
    jours_acquis = models.DecimalField(
        max_digits=6, decimal_places=1, default=0,
        verbose_name="Jours acquis",
    )
    jours_pris = models.DecimalField(
        max_digits=6, decimal_places=1, default=0,
        verbose_name="Jours pris",
    )

    class Meta:
        db_table = "soldes_conge"
        unique_together = [("employee", "type_conge", "annee")]
        verbose_name = "Solde de congé"
        verbose_name_plural = "Soldes de congé"
        ordering = ["employee__name", "type_conge__name"]

    def __str__(self):
        return f"{self.employee.name} — {self.type_conge.name} {self.annee}"

    @property
    def jours_restants(self):
        return self.jours_acquis - self.jours_pris


# ══════════════════════════════════════════════════════════════════════════════
# PRÉSENCES
# ══════════════════════════════════════════════════════════════════════════════


class Pointage(models.Model):
    """Pointage journalier d'un employé."""

    class Statut(models.TextChoices):
        PRESENT      = "present",      "Présent"
        ABSENT       = "absent",       "Absent"
        RETARD       = "retard",       "Retard"
        DEMI_JOURNEE = "demi_journee", "Demi-journée"
        CONGE        = "conge",        "Congé"

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE,
        related_name="pointages", verbose_name="Employé",
    )
    date = models.DateField(verbose_name="Date")
    statut = models.CharField(
        max_length=20, choices=Statut.choices,
        default=Statut.PRESENT, verbose_name="Statut",
    )
    heure_arrivee = models.TimeField(null=True, blank=True, verbose_name="Heure d'arrivée")
    heure_depart  = models.TimeField(null=True, blank=True, verbose_name="Heure de départ")
    note = models.TextField(blank=True, verbose_name="Note")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "pointages"
        unique_together = [("employee", "date")]
        verbose_name = "Pointage"
        verbose_name_plural = "Pointages"
        ordering = ["-date", "employee__name"]

    def __str__(self):
        return f"{self.employee.name} — {self.date} — {self.get_statut_display()}"
