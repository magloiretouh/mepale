"""
MEPALE ERP — Administration Django — Module RH
"""

from django.contrib import admin

from .models import (
    CategoryPrimeSetting,
    Employee,
    EmployeeCategory,
    PrimeType,
    SalaryPayment,
    SocialRates,
)


# ─── Inlines ──────────────────────────────────────────────────────────────────


class CategoryPrimeSettingInline(admin.TabularInline):
    model = CategoryPrimeSetting
    extra = 0
    fields = ["prime_type", "default_amount"]
    raw_id_fields = ["prime_type"]


# ─── EmployeeCategory ─────────────────────────────────────────────────────────


@admin.register(EmployeeCategory)
class EmployeeCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "description", "employee_count", "created_at"]
    search_fields = ["name"]
    inlines = [CategoryPrimeSettingInline]

    @admin.display(description="Nb employés")
    def employee_count(self, obj):
        return obj.employees.count()


# ─── PrimeType ────────────────────────────────────────────────────────────────


@admin.register(PrimeType)
class PrimeTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "is_taxable", "created_at"]
    list_filter = ["is_taxable"]
    search_fields = ["name"]


# ─── Employee ─────────────────────────────────────────────────────────────────


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "role",
        "contract_type",
        "category",
        "monthly_salary",
        "has_social_contributions",
        "is_active",
    ]
    list_filter = [
        "is_active",
        "contract_type",
        "category",
        "has_social_contributions",
    ]
    search_fields = ["name", "phone", "email", "nif", "cnss_number"]
    list_select_related = ["category"]
    fieldsets = (
        (
            "Informations générales",
            {
                "fields": (
                    "name",
                    "role",
                    "contract_type",
                    "category",
                    "is_active",
                )
            },
        ),
        (
            "Rémunération",
            {
                "fields": (
                    "monthly_salary",
                    "has_social_contributions",
                )
            },
        ),
        (
            "Identité & contact",
            {
                "fields": (
                    "hire_date",
                    "birth_date",
                    "phone",
                    "email",
                    "nif",
                    "cnss_number",
                )
            },
        ),
    )


# ─── SalaryPayment ────────────────────────────────────────────────────────────


@admin.register(SalaryPayment)
class SalaryPaymentAdmin(admin.ModelAdmin):
    list_display = [
        "employee",
        "type",
        "amount",
        "gross_amount",
        "period_month",
        "payment_date",
    ]
    list_filter = ["type", "period_month", "payment_date"]
    search_fields = ["employee__name", "label"]
    list_select_related = ["employee", "prime_type"]
    readonly_fields = ["created_at"]
    date_hierarchy = "payment_date"


# ─── SocialRates ──────────────────────────────────────────────────────────────


@admin.register(SocialRates)
class SocialRatesAdmin(admin.ModelAdmin):
    list_display = [
        "company_name",
        "cnss_employee_rate",
        "amu_employee_rate",
        "cnss_employer_rate",
        "amu_employer_rate",
        "updated_at",
    ]
    readonly_fields = ["updated_at"]

    def has_add_permission(self, request):
        # Singleton : empêcher la création d'un 2e enregistrement
        return not SocialRates.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
