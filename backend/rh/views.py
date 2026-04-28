"""
MEPALE ERP — Vues API Ressources Humaines
Base URL : /api/v1/rh/
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdmin, IsRHStaff

from .models import (
    CategoryPrimeSetting,
    DemandeConge,
    Employee,
    EmployeeCategory,
    Pointage,
    PrimeType,
    SalaryPayment,
    SocialRates,
    SoldeConge,
    TypeConge,
)
from .serializers import (
    CategoryPrimeSettingSerializer,
    DemandeCongeSerializer,
    EmployeeCategorySerializer,
    EmployeeSerializer,
    PointageSerializer,
    PrimeTypeSerializer,
    SalaryPaymentSerializer,
    SocialRatesSerializer,
    SoldeCongeSerializer,
    TypeCongeSerializer,
)

logger = logging.getLogger("mepale")


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════


def _get_rates():
    """Retourne l'instance singleton des taux sociaux."""
    return SocialRates.get_instance()


def _calculate_cotisations(gross, taxable_primes, rates, has_social_contributions):
    """
    Calcule les cotisations CNSS/AMU et le salaire net.
    Retourne un dict : cnss_employee, amu_employee, cnss_employer, amu_employer, net.
    """
    gross = Decimal(str(gross))
    taxable_primes = Decimal(str(taxable_primes or 0))
    fiscal_base = gross + taxable_primes

    if has_social_contributions:
        cnss_emp = Decimal(
            round(float(fiscal_base) * float(rates.cnss_employee_rate) / 100)
        )
        amu_emp = Decimal(
            round(float(fiscal_base) * float(rates.amu_employee_rate) / 100)
        )
        cnss_er = Decimal(
            round(float(fiscal_base) * float(rates.cnss_employer_rate) / 100)
        )
        amu_er = Decimal(
            round(float(fiscal_base) * float(rates.amu_employer_rate) / 100)
        )
    else:
        cnss_emp = amu_emp = cnss_er = amu_er = None

    net = gross - (cnss_emp or Decimal("0")) - (amu_emp or Decimal("0"))

    return {
        "cnss_employee": cnss_emp,
        "amu_employee": amu_emp,
        "cnss_employer": cnss_er,
        "amu_employer": amu_er,
        "net": net,
    }


def _get_pending_advance(employee):
    """Retourne le montant d'avance en attente de déduction (toujours >= 0)."""
    agg = employee.salary_payments.aggregate(
        total_advanced=Sum(
            "amount", filter=Q(type=SalaryPayment.PaymentType.AVANCE)
        ),
        total_deducted=Sum("advance_deducted"),
    )
    total_advanced = agg["total_advanced"] or Decimal("0")
    total_deducted = agg["total_deducted"] or Decimal("0")
    return max(Decimal("0"), total_advanced - total_deducted)


def _fmt_amount(n):
    """Formate un Decimal en entier lisible (pour messages d'erreur)."""
    return f"{int(round(float(n))):,}".replace(",", " ")


def _create_payment(data, rates):
    """
    Crée un SalaryPayment à partir des données.
    Retourne (payment, None) ou (None, {'detail': ..., 'conflict': bool}).
    """
    try:
        employee = Employee.objects.get(pk=data["employee_id"])
    except Employee.DoesNotExist:
        return None, {"detail": f"Employé {data['employee_id']} introuvable."}

    ptype = data.get("type")
    payment_date = data.get("payment_date")

    if not ptype:
        return None, {"detail": "type requis."}
    if not payment_date:
        return None, {"detail": "payment_date requis."}

    # ── Salaire ───────────────────────────────────────────────────────────────
    if ptype == SalaryPayment.PaymentType.SALAIRE:
        gross = data.get("gross_amount")
        if not gross:
            return None, {"detail": "gross_amount obligatoire pour un salaire."}
        gross = Decimal(str(gross))
        if gross <= 0:
            return None, {"detail": "gross_amount doit être > 0."}

        taxable_primes = Decimal(str(data.get("taxable_primes_amount") or 0))
        period = data.get("period_month") or None

        # Doublon : un seul salaire par (employee, period_month)
        if period:
            exists = SalaryPayment.objects.filter(
                employee=employee, type="salaire", period_month=period
            ).exists()
            if exists:
                return None, {
                    "detail": (
                        f"Un salaire existe déjà pour {employee.name} "
                        f"sur la période {period}."
                    ),
                    "conflict": True,
                }

        cotis = _calculate_cotisations(
            gross, taxable_primes, rates, employee.has_social_contributions
        )

        # Avance à déduire
        advance_deducted = Decimal(str(data.get("advance_deducted") or 0))
        if advance_deducted > 0:
            pending = _get_pending_advance(employee)
            if advance_deducted > pending:
                return None, {
                    "detail": (
                        f"Avance déduite ({_fmt_amount(advance_deducted)} F CFA) "
                        f"dépasse l'avance en attente ({_fmt_amount(pending)} F CFA)."
                    )
                }

        net_verse = cotis["net"] - advance_deducted

        payment = SalaryPayment.objects.create(
            employee=employee,
            type=SalaryPayment.PaymentType.SALAIRE,
            label=data.get("label"),
            amount=net_verse,
            gross_amount=gross,
            cnss_employee_amount=cotis["cnss_employee"],
            amu_employee_amount=cotis["amu_employee"],
            cnss_employer_amount=cotis["cnss_employer"],
            amu_employer_amount=cotis["amu_employer"],
            advance_deducted=advance_deducted if advance_deducted > 0 else None,
            taxable_primes_amount=taxable_primes if taxable_primes > 0 else None,
            period_month=period,
            payment_date=payment_date,
            prime_type_id=data.get("prime_type_id"),
            linked_salary_id=data.get("linked_salary_id"),
        )
        return payment, None

    # ── Avance ────────────────────────────────────────────────────────────────
    elif ptype == SalaryPayment.PaymentType.AVANCE:
        amount = data.get("amount")
        if not amount:
            return None, {"detail": "amount obligatoire pour une avance."}
        amount = Decimal(str(amount))
        if amount <= 0:
            return None, {"detail": "amount doit être > 0."}

        payment = SalaryPayment.objects.create(
            employee=employee,
            type=SalaryPayment.PaymentType.AVANCE,
            label=data.get("label"),
            amount=amount,
            payment_date=payment_date,
        )
        return payment, None

    # ── Prime / Autre ──────────────────────────────────────────────────────────
    elif ptype in (SalaryPayment.PaymentType.PRIME, SalaryPayment.PaymentType.AUTRE):
        amount = data.get("amount")
        if not amount:
            return None, {
                "detail": f"amount obligatoire pour un paiement de type {ptype}."
            }
        amount = Decimal(str(amount))
        if amount <= 0:
            return None, {"detail": "amount doit être > 0."}

        payment = SalaryPayment.objects.create(
            employee=employee,
            type=ptype,
            label=data.get("label"),
            amount=amount,
            period_month=data.get("period_month") or None,
            payment_date=payment_date,
            prime_type_id=data.get("prime_type_id"),
            linked_salary_id=data.get("linked_salary_id"),
        )
        return payment, None

    else:
        return None, {"detail": f"Type de paiement inconnu : {ptype}."}


# ══════════════════════════════════════════════════════════════════════════════
# VUES EMPLOYÉS
# ══════════════════════════════════════════════════════════════════════════════


class EmployeeListCreateView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        qs = Employee.objects.select_related("category").order_by("name")
        active = request.query_params.get("active")
        if active == "1":
            qs = qs.filter(is_active=True)
        return Response(EmployeeSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data
        if not data.get("name", "").strip():
            return Response({"detail": "Le champ name est obligatoire."}, status=400)

        emp = Employee.objects.create(
            name=data["name"].strip(),
            role=data.get("role") or None,
            contract_type=data.get("contract_type") or None,
            monthly_salary=data.get("monthly_salary") or None,
            hire_date=data.get("hire_date") or None,
            birth_date=data.get("birth_date") or None,
            phone=data.get("phone") or None,
            email=data.get("email") or None,
            nif=data.get("nif") or None,
            cnss_number=data.get("cnss_number") or None,
            category_id=data.get("category_id") or None,
            has_social_contributions=data.get("has_social_contributions", True),
        )
        return Response(EmployeeSerializer(emp).data, status=201)


class EmployeeDetailView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request, pk):
        emp = get_object_or_404(Employee.objects.select_related("category"), pk=pk)
        return Response(EmployeeSerializer(emp).data)

    def put(self, request, pk):
        emp = get_object_or_404(Employee, pk=pk)
        data = request.data

        # Mise à jour partielle — seuls les champs présents sont modifiés
        nullable_str = ["role", "contract_type", "monthly_salary",
                        "hire_date", "birth_date", "phone",
                        "email", "nif", "cnss_number"]
        for field in nullable_str:
            if field in data:
                setattr(emp, field, data[field] or None)

        if "name" in data:
            if not data["name"].strip():
                return Response({"detail": "name ne peut pas être vide."}, status=400)
            emp.name = data["name"].strip()

        if "category_id" in data:
            emp.category_id = data["category_id"] or None

        if "has_social_contributions" in data:
            emp.has_social_contributions = bool(data["has_social_contributions"])

        emp.save()
        emp.refresh_from_db()
        return Response(EmployeeSerializer(emp).data)

    def delete(self, request, pk):
        emp = get_object_or_404(Employee, pk=pk)

        if emp.salary_payments.exists():
            return Response(
                {
                    "detail": (
                        "Impossible de supprimer un employé avec des paiements "
                        "enregistrés. Désactivez-le à la place."
                    )
                },
                status=409,
            )

        emp.delete()
        return Response(status=204)


class EmployeeToggleView(APIView):
    permission_classes = [IsRHStaff]

    def patch(self, request, pk):
        emp = get_object_or_404(Employee, pk=pk)
        emp.is_active = not emp.is_active
        emp.save(update_fields=["is_active"])
        return Response({"id": emp.pk, "is_active": emp.is_active})


class EmployeePendingAdvancesView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request, pk):
        emp = get_object_or_404(Employee, pk=pk)
        advances = emp.salary_payments.filter(
            type=SalaryPayment.PaymentType.AVANCE
        ).order_by("-payment_date")

        agg = emp.salary_payments.aggregate(
            total_advanced=Sum(
                "amount", filter=Q(type=SalaryPayment.PaymentType.AVANCE)
            ),
            total_deducted=Sum("advance_deducted"),
        )
        total_advanced = agg["total_advanced"] or Decimal("0")
        total_deducted = agg["total_deducted"] or Decimal("0")
        pending = max(Decimal("0"), total_advanced - total_deducted)

        return Response(
            {
                "employee_id": emp.pk,
                "employee_name": emp.name,
                "total_advanced": total_advanced,
                "total_deducted": total_deducted,
                "pending_amount": int(round(float(pending))),
                "advances": SalaryPaymentSerializer(advances, many=True).data,
            }
        )


class EmployeePrimesView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request, pk):
        emp = get_object_or_404(
            Employee.objects.select_related("category"), pk=pk
        )
        if not emp.category_id:
            return Response([])

        settings = CategoryPrimeSetting.objects.filter(
            category=emp.category
        ).select_related("prime_type")

        result = []
        for setting in settings:
            result.append(
                {
                    "prime_type_id": setting.prime_type_id,
                    "prime_type_name": setting.prime_type.name,
                    "is_taxable": setting.prime_type.is_taxable,
                    "default_amount": setting.default_amount,
                    "calculated_amount": setting.default_amount,
                }
            )

        return Response(result)


class EmployeePayslipView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request, pk):
        emp = get_object_or_404(
            Employee.objects.select_related("category"), pk=pk
        )
        month = request.query_params.get("month")
        if not month:
            return Response(
                {"detail": "Paramètre month requis (YYYY-MM)."},
                status=400,
            )

        salary = (
            emp.salary_payments.filter(type="salaire", period_month=month)
            .select_related("prime_type")
            .first()
        )
        if not salary:
            return Response(
                {
                    "detail": (
                        f"Aucun salaire trouvé pour {emp.name} "
                        f"sur la période {month}."
                    )
                },
                status=404,
            )

        primes = emp.salary_payments.filter(
            type__in=["prime", "autre"], period_month=month
        ).select_related("prime_type")

        rates = _get_rates()

        try:
            from .pdf_utils import generate_payslip_pdf

            pdf_bytes = generate_payslip_pdf(emp, salary, primes, month, rates)
        except ImportError:
            return Response(
                {
                    "detail": (
                        "ReportLab non installé. "
                        "Exécutez : pip install reportlab"
                    )
                },
                status=503,
            )
        except Exception as e:
            logger.error(
                "Erreur génération fiche de paie : %s", e, exc_info=True
            )
            return Response(
                {"detail": "Erreur lors de la génération du PDF."},
                status=500,
            )

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'inline; filename="fiche-paie-{emp.pk}-{month}.pdf"'
        )
        return response


# ══════════════════════════════════════════════════════════════════════════════
# CATÉGORIES (lecture seule pour le staff RH)
# ══════════════════════════════════════════════════════════════════════════════


class EmployeeCategoryListView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        cats = EmployeeCategory.objects.order_by("name")
        return Response(EmployeeCategorySerializer(cats, many=True).data)


# ══════════════════════════════════════════════════════════════════════════════
# TAUX SOCIAUX (lecture pour le staff RH)
# ══════════════════════════════════════════════════════════════════════════════


class SocialRatesView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        return Response(SocialRatesSerializer(_get_rates()).data)


# ══════════════════════════════════════════════════════════════════════════════
# PAIEMENTS SALARIAUX
# ══════════════════════════════════════════════════════════════════════════════


class SalaryPaymentListCreateView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        qs = SalaryPayment.objects.select_related(
            "employee", "prime_type"
        ).order_by("-payment_date", "-created_at")

        emp_id = request.query_params.get("employee_id")
        month = request.query_params.get("month")

        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        if month:
            qs = qs.filter(period_month=month)

        return Response(SalaryPaymentSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data

        for required in ["employee_id", "payment_date", "type"]:
            if not data.get(required):
                return Response({"detail": f"{required} requis."}, status=400)

        rates = _get_rates()
        payment, error = _create_payment(data, rates)

        if error:
            if error.get("conflict"):
                return Response({"detail": error["detail"]}, status=409)
            if "avance en attente" in error.get("detail", "").lower():
                return Response({"detail": error["detail"]}, status=422)
            return Response({"detail": error["detail"]}, status=400)

        return Response(SalaryPaymentSerializer(payment).data, status=201)


class SalaryPaymentDeleteView(APIView):
    permission_classes = [IsRHStaff]

    def delete(self, request, pk):
        payment = get_object_or_404(SalaryPayment, pk=pk)
        # TODO : vérifier les écritures comptables liées quand le module sera prêt
        payment.delete()
        return Response(status=204)


class SalaryPaymentBulkView(APIView):
    """POST /salary-payments/bulk/ — Paiement en masse."""

    permission_classes = [IsRHStaff]

    def post(self, request):
        data = request.data
        payment_date = data.get("payment_date")
        period_month = data.get("period_month")
        ptype = data.get("type", "salaire")
        payments_data = data.get("payments", [])

        if not payment_date:
            return Response({"detail": "payment_date requis."}, status=400)
        if not payments_data:
            return Response(
                {"detail": "payments[] requis et non vide."}, status=400
            )

        rates = _get_rates()
        created = []
        conflicts = []
        errors = []

        for item in payments_data:
            emp_id = item.get("employee_id")
            sp = transaction.savepoint()
            try:
                row = {
                    "employee_id": emp_id,
                    "payment_date": payment_date,
                    "period_month": period_month,
                    "type": ptype,
                    "gross_amount": item.get("gross_amount"),
                    "amount": item.get("amount"),
                    "label": item.get("label"),
                    "taxable_primes_amount": item.get("taxable_primes_amount"),
                    "advance_deducted": item.get("advance_deducted"),
                    "prime_type_id": item.get("prime_type_id"),
                    "linked_salary_id": item.get("linked_salary_id"),
                }
                payment, error = _create_payment(row, rates)

                if error:
                    transaction.savepoint_rollback(sp)
                    if error.get("conflict"):
                        conflicts.append(
                            {"employee_id": emp_id, "detail": error["detail"]}
                        )
                    else:
                        errors.append(
                            {"employee_id": emp_id, "detail": error["detail"]}
                        )
                else:
                    transaction.savepoint_commit(sp)
                    created.append(SalaryPaymentSerializer(payment).data)

            except Exception as e:
                transaction.savepoint_rollback(sp)
                logger.exception(
                    "Erreur bulk payment pour employé %s", emp_id
                )
                errors.append({"employee_id": emp_id, "detail": str(e)})

        return Response(
            {
                "created": created,
                "conflicts": conflicts,
                "errors": errors,
                "summary": {
                    "total": len(payments_data),
                    "created": len(created),
                    "conflicts": len(conflicts),
                    "errors": len(errors),
                },
            },
            status=207,
        )


class SalaryPaymentBulkPrimesView(APIView):
    """POST /salary-payments/bulk-primes/ — Versement de primes en masse."""

    permission_classes = [IsRHStaff]

    def post(self, request):
        data = request.data
        payment_date = data.get("payment_date")
        period_month = data.get("period_month")
        payments_data = data.get("payments", [])

        if not payment_date:
            return Response({"detail": "payment_date requis."}, status=400)
        if not payments_data:
            return Response(
                {"detail": "payments[] requis et non vide."}, status=400
            )

        rates = _get_rates()
        created = []
        errors = []

        for item in payments_data:
            emp_id = item.get("employee_id")
            sp = transaction.savepoint()
            try:
                row = {
                    "employee_id": emp_id,
                    "payment_date": payment_date,
                    "period_month": period_month,
                    "type": SalaryPayment.PaymentType.PRIME,
                    "amount": item.get("amount"),
                    "label": item.get("label"),
                    "prime_type_id": item.get("prime_type_id"),
                    "linked_salary_id": item.get("linked_salary_id"),
                }
                payment, error = _create_payment(row, rates)

                if error:
                    transaction.savepoint_rollback(sp)
                    errors.append(
                        {"employee_id": emp_id, "detail": error["detail"]}
                    )
                else:
                    transaction.savepoint_commit(sp)
                    created.append(SalaryPaymentSerializer(payment).data)

            except Exception as e:
                transaction.savepoint_rollback(sp)
                logger.exception(
                    "Erreur bulk-primes pour employé %s", emp_id
                )
                errors.append({"employee_id": emp_id, "detail": str(e)})

        return Response(
            {
                "created": created,
                "errors": errors,
                "summary": {
                    "total": len(payments_data),
                    "created": len(created),
                    "errors": len(errors),
                },
            },
            status=207,
        )


# ══════════════════════════════════════════════════════════════════════════════
# DÉCLARATION CNSS
# ══════════════════════════════════════════════════════════════════════════════


class CnssDeclarationView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        month = request.query_params.get("month")
        if not month:
            return Response(
                {"detail": "Paramètre month requis (YYYY-MM)."},
                status=400,
            )

        payments = (
            SalaryPayment.objects.filter(type="salaire", period_month=month)
            .select_related("employee")
            .order_by("employee__name")
        )

        rows = []
        totals = {
            k: Decimal("0")
            for k in [
                "gross",
                "cnss_employee",
                "amu_employee",
                "cnss_employer",
                "amu_employer",
                "net",
                "total_to_declare",
            ]
        }

        for p in payments:
            gross = p.gross_amount or Decimal("0")
            cnss_emp = p.cnss_employee_amount or Decimal("0")
            amu_emp = p.amu_employee_amount or Decimal("0")
            cnss_er = p.cnss_employer_amount or Decimal("0")
            amu_er = p.amu_employer_amount or Decimal("0")
            net = p.amount or Decimal("0")
            total_declare = cnss_emp + amu_emp + cnss_er + amu_er

            rows.append(
                {
                    "employee_id": p.employee_id,
                    "employee_name": p.employee.name,
                    "cnss_number": p.employee.cnss_number or "",
                    "gross": gross,
                    "cnss_employee": cnss_emp,
                    "amu_employee": amu_emp,
                    "cnss_employer": cnss_er,
                    "amu_employer": amu_er,
                    "net": net,
                    "total_to_declare": total_declare,
                }
            )

            for key, val in [
                ("gross", gross),
                ("cnss_employee", cnss_emp),
                ("amu_employee", amu_emp),
                ("cnss_employer", cnss_er),
                ("amu_employer", amu_er),
                ("net", net),
                ("total_to_declare", total_declare),
            ]:
                totals[key] += val

        return Response({"month": month, "rows": rows, "totals": totals})


# ══════════════════════════════════════════════════════════════════════════════
# JOURNAL DE PAIE PDF
# ══════════════════════════════════════════════════════════════════════════════


class PayrollJournalView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        month = request.query_params.get("month")
        if not month:
            return Response(
                {"detail": "Paramètre month requis (YYYY-MM)."},
                status=400,
            )

        payments = (
            SalaryPayment.objects.filter(period_month=month)
            .select_related("employee", "prime_type")
            .order_by("employee__name", "type", "-payment_date")
        )

        if not payments.exists():
            return Response(
                {"detail": f"Aucun paiement trouvé pour la période {month}."},
                status=404,
            )

        rates = _get_rates()

        try:
            from .pdf_utils import generate_payroll_journal_pdf

            pdf_bytes = generate_payroll_journal_pdf(payments, month, rates)
        except ImportError:
            return Response(
                {
                    "detail": (
                        "ReportLab non installé. "
                        "Exécutez : pip install reportlab"
                    )
                },
                status=503,
            )
        except Exception as e:
            logger.error(
                "Erreur génération journal de paie : %s", e, exc_info=True
            )
            return Response(
                {"detail": "Erreur lors de la génération du PDF."},
                status=500,
            )

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'inline; filename="journal-paie-{month}.pdf"'
        )
        return response


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — CATÉGORIES RH
# ══════════════════════════════════════════════════════════════════════════════


class AdminEmployeeCategoryListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        cats = EmployeeCategory.objects.prefetch_related(
            "prime_settings__prime_type"
        ).order_by("name")

        data = []
        for cat in cats:
            cat_data = EmployeeCategorySerializer(cat).data
            cat_data["prime_settings"] = CategoryPrimeSettingSerializer(
                cat.prime_settings.all(), many=True
            ).data
            data.append(cat_data)
        return Response(data)

    def post(self, request):
        name = request.data.get("name", "").strip()
        if not name:
            return Response({"detail": "name requis."}, status=400)
        if EmployeeCategory.objects.filter(name__iexact=name).exists():
            return Response(
                {"detail": f"La catégorie « {name} » existe déjà."},
                status=409,
            )
        cat = EmployeeCategory.objects.create(
            name=name,
            description=request.data.get("description") or None,
        )
        return Response(EmployeeCategorySerializer(cat).data, status=201)


class AdminEmployeeCategoryDetailView(APIView):
    permission_classes = [IsAdmin]

    def put(self, request, pk):
        cat = get_object_or_404(EmployeeCategory, pk=pk)
        name = request.data.get("name", cat.name).strip()
        if (
            EmployeeCategory.objects.filter(name__iexact=name)
            .exclude(pk=pk)
            .exists()
        ):
            return Response(
                {"detail": f"La catégorie « {name} » existe déjà."},
                status=409,
            )
        cat.name = name
        cat.description = request.data.get("description", cat.description)
        cat.save()
        return Response(EmployeeCategorySerializer(cat).data)

    def delete(self, request, pk):
        cat = get_object_or_404(EmployeeCategory, pk=pk)
        if cat.employees.exists():
            return Response(
                {
                    "detail": (
                        "Impossible de supprimer une catégorie "
                        "assignée à des employés."
                    )
                },
                status=409,
            )
        cat.delete()
        return Response(status=204)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — PARAMÈTRES DE PRIMES PAR CATÉGORIE
# ══════════════════════════════════════════════════════════════════════════════


class AdminPrimeSettingListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, category_id):
        cat = get_object_or_404(EmployeeCategory, pk=category_id)
        settings = cat.prime_settings.select_related("prime_type").all()
        return Response(CategoryPrimeSettingSerializer(settings, many=True).data)

    def post(self, request, category_id):
        cat = get_object_or_404(EmployeeCategory, pk=category_id)
        prime_type_id = request.data.get("prime_type_id")
        default_amount = request.data.get("default_amount")

        if not prime_type_id or default_amount is None:
            return Response(
                {"detail": "prime_type_id et default_amount sont requis."},
                status=400,
            )
        if not PrimeType.objects.filter(pk=prime_type_id).exists():
            return Response({"detail": "Type de prime introuvable."}, status=404)
        if CategoryPrimeSetting.objects.filter(
            category=cat, prime_type_id=prime_type_id
        ).exists():
            return Response(
                {
                    "detail": (
                        "Ce type de prime est déjà configuré "
                        "pour cette catégorie."
                    )
                },
                status=409,
            )

        setting = CategoryPrimeSetting.objects.create(
            category=cat,
            prime_type_id=prime_type_id,
            default_amount=Decimal(str(default_amount)),
        )
        return Response(CategoryPrimeSettingSerializer(setting).data, status=201)


class AdminPrimeSettingDetailView(APIView):
    permission_classes = [IsAdmin]

    def put(self, request, category_id, pk):
        setting = get_object_or_404(
            CategoryPrimeSetting, pk=pk, category_id=category_id
        )
        default_amount = request.data.get("default_amount")
        if default_amount is None:
            return Response({"detail": "default_amount requis."}, status=400)
        setting.default_amount = Decimal(str(default_amount))
        setting.save()
        return Response(CategoryPrimeSettingSerializer(setting).data)

    def delete(self, request, category_id, pk):
        setting = get_object_or_404(
            CategoryPrimeSetting, pk=pk, category_id=category_id
        )
        setting.delete()
        return Response(status=204)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — TYPES DE PRIMES
# ══════════════════════════════════════════════════════════════════════════════


class AdminPrimeTypeListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(
            PrimeTypeSerializer(
                PrimeType.objects.order_by("name"), many=True
            ).data
        )

    def post(self, request):
        name = request.data.get("name", "").strip()
        if not name:
            return Response({"detail": "name requis."}, status=400)

        pt = PrimeType.objects.create(
            name=name,
            description=request.data.get("description") or None,
            is_taxable=request.data.get("is_taxable", False),
        )
        return Response(PrimeTypeSerializer(pt).data, status=201)


class AdminPrimeTypeDetailView(APIView):
    permission_classes = [IsAdmin]

    def put(self, request, pk):
        pt = get_object_or_404(PrimeType, pk=pk)
        if "name" in request.data:
            pt.name = request.data["name"].strip() or pt.name
        if "description" in request.data:
            pt.description = request.data["description"]
        if "is_taxable" in request.data:
            pt.is_taxable = bool(request.data["is_taxable"])
        pt.save()
        return Response(PrimeTypeSerializer(pt).data)

    def delete(self, request, pk):
        pt = get_object_or_404(PrimeType, pk=pk)
        if pt.payments.exists():
            return Response(
                {
                    "detail": (
                        "Impossible de supprimer un type de prime "
                        "déjà utilisé dans des paiements."
                    )
                },
                status=409,
            )
        if pt.category_settings.exists():
            return Response(
                {
                    "detail": (
                        "Impossible de supprimer un type de prime "
                        "configuré dans des catégories. "
                        "Retirez-le d'abord des catégories concernées."
                    )
                },
                status=409,
            )
        pt.delete()
        return Response(status=204)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — TAUX SOCIAUX
# ══════════════════════════════════════════════════════════════════════════════


class AdminSocialRatesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(SocialRatesSerializer(_get_rates()).data)

    def put(self, request):
        rates = _get_rates()
        numeric_fields = [
            "cnss_employee_rate",
            "amu_employee_rate",
            "cnss_employer_rate",
            "amu_employer_rate",
        ]
        text_fields = ["company_name", "company_address"]

        for field in numeric_fields:
            if field in request.data:
                try:
                    setattr(rates, field, Decimal(str(request.data[field])))
                except Exception:
                    return Response(
                        {"detail": f"Valeur invalide pour {field}."},
                        status=400,
                    )

        for field in text_fields:
            if field in request.data:
                setattr(rates, field, request.data[field] or None)

        rates.save()
        return Response(SocialRatesSerializer(rates).data)


# ══════════════════════════════════════════════════════════════════════════════
# CONGÉS — TYPES
# ══════════════════════════════════════════════════════════════════════════════


class TypeCongeListCreateView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        qs = TypeConge.objects.all()
        if request.query_params.get("actif_only") == "1":
            qs = qs.filter(is_active=True)
        return Response(TypeCongeSerializer(qs, many=True).data)

    def post(self, request):
        ser = TypeCongeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=201)


class TypeCongeDetailView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request, pk):
        tc = get_object_or_404(TypeConge, pk=pk)
        return Response(TypeCongeSerializer(tc).data)

    def put(self, request, pk):
        tc = get_object_or_404(TypeConge, pk=pk)
        ser = TypeCongeSerializer(tc, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk):
        tc = get_object_or_404(TypeConge, pk=pk)
        if tc.demandes.exists():
            return Response(
                {"detail": "Impossible de supprimer un type ayant des demandes."},
                status=400,
            )
        tc.delete()
        return Response(status=204)


# ══════════════════════════════════════════════════════════════════════════════
# CONGÉS — DEMANDES
# ══════════════════════════════════════════════════════════════════════════════


class DemandeCongeListCreateView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        qs = DemandeConge.objects.select_related("employee", "type_conge", "approuve_par")
        emp_id = request.query_params.get("employee_id")
        statut = request.query_params.get("statut")
        type_id = request.query_params.get("type_conge_id")
        annee = request.query_params.get("annee")
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        if statut:
            qs = qs.filter(statut=statut)
        if type_id:
            qs = qs.filter(type_conge_id=type_id)
        if annee:
            qs = qs.filter(date_debut__year=annee)
        return Response(DemandeCongeSerializer(qs, many=True).data)

    def post(self, request):
        d = request.data
        employee = get_object_or_404(Employee, pk=d.get("employee"))
        type_conge = get_object_or_404(TypeConge, pk=d.get("type_conge"))
        try:
            from datetime import date as date_type
            date_debut = date_type.fromisoformat(str(d.get("date_debut", "")))
            date_fin   = date_type.fromisoformat(str(d.get("date_fin", "")))
        except (ValueError, TypeError):
            return Response({"detail": "Dates invalides (format YYYY-MM-DD)."}, status=400)
        if date_fin < date_debut:
            return Response({"detail": "La date de fin doit être ≥ à la date de début."}, status=400)

        demande = DemandeConge(
            employee=employee,
            type_conge=type_conge,
            date_debut=date_debut,
            date_fin=date_fin,
            motif=d.get("motif", ""),
        )
        demande.calculer_nb_jours()
        demande.save()
        return Response(DemandeCongeSerializer(demande).data, status=201)


class DemandeCongeDetailView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request, pk):
        demande = get_object_or_404(
            DemandeConge.objects.select_related("employee", "type_conge", "approuve_par"), pk=pk
        )
        return Response(DemandeCongeSerializer(demande).data)

    def put(self, request, pk):
        demande = get_object_or_404(DemandeConge, pk=pk)
        if demande.statut != DemandeConge.Statut.BROUILLON:
            return Response({"detail": "Seules les demandes en brouillon peuvent être modifiées."}, status=400)
        d = request.data
        if "date_debut" in d or "date_fin" in d:
            try:
                from datetime import date as date_type
                date_debut = date_type.fromisoformat(str(d.get("date_debut", demande.date_debut)))
                date_fin   = date_type.fromisoformat(str(d.get("date_fin",   demande.date_fin)))
            except (ValueError, TypeError):
                return Response({"detail": "Dates invalides."}, status=400)
            if date_fin < date_debut:
                return Response({"detail": "La date de fin doit être ≥ à la date de début."}, status=400)
            demande.date_debut = date_debut
            demande.date_fin   = date_fin
            demande.calculer_nb_jours()
        if "motif" in d:
            demande.motif = d["motif"]
        if "type_conge" in d:
            demande.type_conge = get_object_or_404(TypeConge, pk=d["type_conge"])
        demande.save()
        return Response(DemandeCongeSerializer(demande).data)

    def delete(self, request, pk):
        demande = get_object_or_404(DemandeConge, pk=pk)
        if demande.statut not in (DemandeConge.Statut.BROUILLON, DemandeConge.Statut.ANNULEE):
            return Response({"detail": "Seules les demandes en brouillon ou annulées peuvent être supprimées."}, status=400)
        demande.delete()
        return Response(status=204)


class DemandeCongeActionView(APIView):
    """POST /rh/demandes-conge/{pk}/action/ — action dans le workflow."""
    permission_classes = [IsRHStaff]

    def post(self, request, pk):
        action = request.data.get("action")
        demande = get_object_or_404(DemandeConge, pk=pk)
        commentaire = request.data.get("commentaire_rh", "")

        if action == "soumettre":
            if demande.statut != DemandeConge.Statut.BROUILLON:
                return Response({"detail": "La demande n'est pas en brouillon."}, status=400)
            demande.statut = DemandeConge.Statut.SOUMISE
            demande.save(update_fields=["statut"])

        elif action == "approuver":
            if demande.statut != DemandeConge.Statut.SOUMISE:
                return Response({"detail": "La demande n'est pas soumise."}, status=400)
            with transaction.atomic():
                demande.statut        = DemandeConge.Statut.APPROUVEE
                demande.approuve_par  = request.user
                demande.approuve_le   = timezone.now()
                demande.commentaire_rh = commentaire
                demande.save(update_fields=["statut", "approuve_par", "approuve_le", "commentaire_rh"])
                # Débiter le solde
                solde, _ = SoldeConge.objects.get_or_create(
                    employee=demande.employee,
                    type_conge=demande.type_conge,
                    annee=demande.date_debut.year,
                    defaults={"jours_acquis": demande.type_conge.quota_annuel},
                )
                solde.jours_pris = solde.jours_pris + demande.nb_jours
                solde.save(update_fields=["jours_pris"])

        elif action == "refuser":
            if demande.statut != DemandeConge.Statut.SOUMISE:
                return Response({"detail": "La demande n'est pas soumise."}, status=400)
            demande.statut         = DemandeConge.Statut.REFUSEE
            demande.approuve_par   = request.user
            demande.approuve_le    = timezone.now()
            demande.commentaire_rh = commentaire
            demande.save(update_fields=["statut", "approuve_par", "approuve_le", "commentaire_rh"])

        elif action == "annuler":
            if demande.statut not in (DemandeConge.Statut.BROUILLON, DemandeConge.Statut.SOUMISE, DemandeConge.Statut.APPROUVEE):
                return Response({"detail": "Cette demande ne peut pas être annulée."}, status=400)
            with transaction.atomic():
                # Recréditer le solde si déjà approuvée
                if demande.statut == DemandeConge.Statut.APPROUVEE:
                    try:
                        solde = SoldeConge.objects.get(
                            employee=demande.employee,
                            type_conge=demande.type_conge,
                            annee=demande.date_debut.year,
                        )
                        solde.jours_pris = max(0, solde.jours_pris - demande.nb_jours)
                        solde.save(update_fields=["jours_pris"])
                    except SoldeConge.DoesNotExist:
                        pass
                demande.statut = DemandeConge.Statut.ANNULEE
                demande.save(update_fields=["statut"])
        else:
            return Response({"detail": f"Action inconnue : {action}."}, status=400)

        return Response(DemandeCongeSerializer(demande).data)


# ══════════════════════════════════════════════════════════════════════════════
# CONGÉS — SOLDES
# ══════════════════════════════════════════════════════════════════════════════


class SoldeCongeListView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        qs = SoldeConge.objects.select_related("employee", "type_conge")
        emp_id  = request.query_params.get("employee_id")
        annee   = request.query_params.get("annee")
        type_id = request.query_params.get("type_conge_id")
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        if annee:
            qs = qs.filter(annee=annee)
        if type_id:
            qs = qs.filter(type_conge_id=type_id)
        return Response(SoldeCongeSerializer(qs, many=True).data)

    def post(self, request):
        """Initialise (ou met à jour) les soldes pour tous les employés actifs pour une année."""
        annee = request.data.get("annee")
        if not annee:
            return Response({"detail": "Champ 'annee' requis."}, status=400)
        types = TypeConge.objects.filter(is_active=True)
        employees = Employee.objects.filter(is_active=True)
        created = updated = 0
        for emp in employees:
            for tc in types:
                solde, is_new = SoldeConge.objects.get_or_create(
                    employee=emp, type_conge=tc, annee=annee,
                    defaults={"jours_acquis": tc.quota_annuel},
                )
                if is_new:
                    created += 1
                else:
                    updated += 1
        return Response({"detail": f"{created} soldes créés, {updated} existants non modifiés."}, status=201)


class SoldeCongeDetailView(APIView):
    permission_classes = [IsRHStaff]

    def put(self, request, pk):
        solde = get_object_or_404(SoldeConge, pk=pk)
        if "jours_acquis" in request.data:
            try:
                solde.jours_acquis = Decimal(str(request.data["jours_acquis"]))
            except Exception:
                return Response({"detail": "Valeur invalide pour jours_acquis."}, status=400)
        if "jours_pris" in request.data:
            try:
                solde.jours_pris = Decimal(str(request.data["jours_pris"]))
            except Exception:
                return Response({"detail": "Valeur invalide pour jours_pris."}, status=400)
        solde.save()
        return Response(SoldeCongeSerializer(solde).data)


# ══════════════════════════════════════════════════════════════════════════════
# PRÉSENCES — POINTAGES
# ══════════════════════════════════════════════════════════════════════════════


class PointageListCreateView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request):
        qs = Pointage.objects.select_related("employee")
        date_param = request.query_params.get("date")
        emp_id     = request.query_params.get("employee_id")
        mois       = request.query_params.get("mois")   # YYYY-MM
        if date_param:
            qs = qs.filter(date=date_param)
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        if mois:
            qs = qs.filter(date__startswith=mois)
        return Response(PointageSerializer(qs, many=True).data)

    def post(self, request):
        employee = get_object_or_404(Employee, pk=request.data.get("employee"))
        d = request.data
        pointage, created = Pointage.objects.get_or_create(
            employee=employee,
            date=d.get("date"),
            defaults={
                "statut":       d.get("statut", Pointage.Statut.PRESENT),
                "heure_arrivee": d.get("heure_arrivee"),
                "heure_depart":  d.get("heure_depart"),
                "note":          d.get("note", ""),
            },
        )
        if not created:
            pointage.statut       = d.get("statut", pointage.statut)
            pointage.heure_arrivee = d.get("heure_arrivee", pointage.heure_arrivee)
            pointage.heure_depart  = d.get("heure_depart", pointage.heure_depart)
            pointage.note          = d.get("note", pointage.note)
            pointage.save()
        status_code = 201 if created else 200
        return Response(PointageSerializer(pointage).data, status=status_code)


class PointageDetailView(APIView):
    permission_classes = [IsRHStaff]

    def get(self, request, pk):
        p = get_object_or_404(Pointage.objects.select_related("employee"), pk=pk)
        return Response(PointageSerializer(p).data)

    def put(self, request, pk):
        p = get_object_or_404(Pointage, pk=pk)
        allowed = ["statut", "heure_arrivee", "heure_depart", "note"]
        for field in allowed:
            if field in request.data:
                setattr(p, field, request.data[field] or None if field != "statut" and field != "note" else request.data[field])
        p.save()
        return Response(PointageSerializer(p).data)

    def delete(self, request, pk):
        p = get_object_or_404(Pointage, pk=pk)
        p.delete()
        return Response(status=204)


class PointageBulkView(APIView):
    """POST /rh/pointages/bulk/ — crée ou met à jour les pointages pour une date donnée."""
    permission_classes = [IsRHStaff]

    def post(self, request):
        date_param = request.data.get("date")
        lignes     = request.data.get("pointages", [])
        if not date_param:
            return Response({"detail": "Champ 'date' requis."}, status=400)
        if not isinstance(lignes, list):
            return Response({"detail": "'pointages' doit être une liste."}, status=400)

        saved = []
        errors = []
        for ligne in lignes:
            emp_id = ligne.get("employee")
            try:
                employee = Employee.objects.get(pk=emp_id)
            except Employee.DoesNotExist:
                errors.append({"employee_id": emp_id, "detail": "Employé introuvable."})
                continue
            pointage, _ = Pointage.objects.update_or_create(
                employee=employee,
                date=date_param,
                defaults={
                    "statut":        ligne.get("statut", Pointage.Statut.PRESENT),
                    "heure_arrivee": ligne.get("heure_arrivee") or None,
                    "heure_depart":  ligne.get("heure_depart")  or None,
                    "note":          ligne.get("note", ""),
                },
            )
            saved.append(PointageSerializer(pointage).data)

        return Response({"saved": saved, "errors": errors}, status=200)


class PointageSummaryView(APIView):
    """GET /rh/pointages/summary/?employee_id=X&mois=YYYY-MM — résumé mensuel."""
    permission_classes = [IsRHStaff]

    def get(self, request):
        emp_id = request.query_params.get("employee_id")
        mois   = request.query_params.get("mois")
        if not emp_id or not mois:
            return Response({"detail": "Paramètres 'employee_id' et 'mois' requis."}, status=400)
        qs = Pointage.objects.filter(employee_id=emp_id, date__startswith=mois)
        counts = {s.value: 0 for s in Pointage.Statut}
        for p in qs:
            counts[p.statut] = counts.get(p.statut, 0) + 1
        return Response({
            "employee_id": emp_id,
            "mois": mois,
            "total_pointes": qs.count(),
            "counts": counts,
            "pointages": PointageSerializer(qs, many=True).data,
        })
