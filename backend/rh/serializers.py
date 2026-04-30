"""
MEPALE ERP — Sérialiseurs Ressources Humaines
"""

from rest_framework import serializers

from .models import (
    CategoryPrimeSetting,
    DemandeConge,
    Employee,
    EmployeeCategory,
    PayrollDraft,
    Pointage,
    PrimeType,
    SalaryPayment,
    SocialRates,
    SoldeConge,
    TypeConge,
)


class EmployeeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeCategory
        fields = ["id", "name", "description", "created_at"]


class PrimeTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrimeType
        fields = ["id", "name", "description", "is_taxable", "created_at"]


class CategoryPrimeSettingSerializer(serializers.ModelSerializer):
    prime_type_name = serializers.CharField(source="prime_type.name", read_only=True)
    prime_type_is_taxable = serializers.BooleanField(
        source="prime_type.is_taxable", read_only=True
    )

    class Meta:
        model = CategoryPrimeSetting
        fields = [
            "id",
            "category",
            "prime_type",
            "prime_type_name",
            "prime_type_is_taxable",
            "default_amount",
        ]
        read_only_fields = ["category"]


class EmployeeSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(
        source="category.name", read_only=True, allow_null=True
    )
    contract_type_display = serializers.CharField(
        source="get_contract_type_display", read_only=True, allow_null=True
    )

    class Meta:
        model = Employee
        fields = [
            "id",
            "name",
            "role",
            "contract_type",
            "contract_type_display",
            "monthly_salary",
            "hire_date",
            "birth_date",
            "phone",
            "email",
            "nif",
            "cnss_number",
            "is_active",
            "category",
            "category_name",
            "has_social_contributions",
            "created_at",
        ]


class SalaryPaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    prime_type_name = serializers.CharField(
        source="prime_type.name", read_only=True, allow_null=True
    )

    class Meta:
        model = SalaryPayment
        fields = [
            "id",
            "employee",
            "employee_name",
            "type",
            "type_display",
            "label",
            "amount",
            "gross_amount",
            "cnss_employee_amount",
            "amu_employee_amount",
            "cnss_employer_amount",
            "amu_employer_amount",
            "advance_deducted",
            "taxable_primes_amount",
            "period_month",
            "payment_date",
            "prime_type",
            "prime_type_name",
            "linked_salary",
            "created_at",
        ]


class SocialRatesSerializer(serializers.ModelSerializer):
    class Meta:
        model = SocialRates
        fields = [
            "cnss_employee_rate",
            "amu_employee_rate",
            "cnss_employer_rate",
            "amu_employer_rate",
            "company_name",
            "company_address",
            "updated_at",
        ]


# ── Congés ────────────────────────────────────────────────────────────────────

class TypeCongeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TypeConge
        fields = ["id", "name", "description", "quota_annuel", "est_paye", "is_active", "created_at"]


class DemandeCongeSerializer(serializers.ModelSerializer):
    employee_name  = serializers.CharField(source="employee.name", read_only=True)
    type_conge_name = serializers.CharField(source="type_conge.name", read_only=True)
    statut_display  = serializers.CharField(source="get_statut_display", read_only=True)
    approuve_par_name = serializers.SerializerMethodField()

    def get_approuve_par_name(self, obj):
        if not obj.approuve_par:
            return None
        return obj.approuve_par.get_full_name() or obj.approuve_par.username

    class Meta:
        model = DemandeConge
        fields = [
            "id", "employee", "employee_name",
            "type_conge", "type_conge_name",
            "date_debut", "date_fin", "nb_jours",
            "statut", "statut_display",
            "motif", "commentaire_rh",
            "approuve_par", "approuve_par_name", "approuve_le",
            "created_at",
        ]
        read_only_fields = ["nb_jours", "statut", "approuve_par", "approuve_le"]


class SoldeCongeSerializer(serializers.ModelSerializer):
    employee_name   = serializers.CharField(source="employee.name", read_only=True)
    type_conge_name = serializers.CharField(source="type_conge.name", read_only=True)
    jours_restants  = serializers.SerializerMethodField()

    def get_jours_restants(self, obj):
        return float(obj.jours_acquis) - float(obj.jours_pris)

    class Meta:
        model = SoldeConge
        fields = [
            "id", "employee", "employee_name",
            "type_conge", "type_conge_name",
            "annee", "jours_acquis", "jours_pris", "jours_restants",
        ]


# ── Brouillon de paie ─────────────────────────────────────────────────────────

class PayrollDraftSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    def get_updated_by_name(self, obj):
        if not obj.updated_by:
            return None
        u = obj.updated_by
        if u.prenom or u.nom:
            return f"{u.prenom} {u.nom}".strip()
        return u.username

    class Meta:
        model = PayrollDraft
        fields = [
            "id",
            "period_month",
            "payment_date",
            "data",
            "status",
            "updated_by",
            "updated_by_name",
            "updated_at",
            "created_at",
        ]
        read_only_fields = ["id", "updated_by", "updated_at", "created_at"]


# ── Présences ─────────────────────────────────────────────────────────────────

class PointageSerializer(serializers.ModelSerializer):
    employee_name  = serializers.CharField(source="employee.name", read_only=True)
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)

    class Meta:
        model = Pointage
        fields = [
            "id", "employee", "employee_name",
            "date", "statut", "statut_display",
            "heure_arrivee", "heure_depart", "note",
            "created_at",
        ]
