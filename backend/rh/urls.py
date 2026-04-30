"""
MEPALE ERP — URLs Ressources Humaines
Base : /api/v1/rh/
"""

from django.urls import path

from . import views

urlpatterns = [
    # ─── Employés ─────────────────────────────────────────────────────────────
    path("employees/", views.EmployeeListCreateView.as_view()),
    path("employees/<int:pk>/", views.EmployeeDetailView.as_view()),
    path("employees/<int:pk>/toggle/", views.EmployeeToggleView.as_view()),
    path(
        "employees/<int:pk>/pending-advances/",
        views.EmployeePendingAdvancesView.as_view(),
    ),
    path("employees/<int:pk>/primes/", views.EmployeePrimesView.as_view()),
    path("employees/<int:pk>/payslip/", views.EmployeePayslipView.as_view()),
    # ─── Catégories (lecture seule pour le staff RH) ──────────────────────────
    path("categories/", views.EmployeeCategoryListView.as_view()),
    # ─── Taux sociaux ─────────────────────────────────────────────────────────
    path("social-rates/", views.SocialRatesView.as_view()),
    # ─── Paiements salariaux ──────────────────────────────────────────────────
    # IMPORTANT : bulk/* doit précéder <int:pk>/ dans l'ordre des patterns
    path("salary-payments/", views.SalaryPaymentListCreateView.as_view()),
    path("salary-payments/bulk/", views.SalaryPaymentBulkView.as_view()),
    path(
        "salary-payments/bulk-primes/",
        views.SalaryPaymentBulkPrimesView.as_view(),
    ),
    path("salary-payments/<int:pk>/", views.SalaryPaymentDeleteView.as_view()),
    # ─── CNSS & Journal PDF ───────────────────────────────────────────────────
    path("cnss-declaration/", views.CnssDeclarationView.as_view()),
    path("payroll-journal/", views.PayrollJournalView.as_view()),
    # ─── Admin — Catégories ───────────────────────────────────────────────────
    path(
        "admin/employee-categories/",
        views.AdminEmployeeCategoryListCreateView.as_view(),
    ),
    path(
        "admin/employee-categories/<int:pk>/",
        views.AdminEmployeeCategoryDetailView.as_view(),
    ),
    path(
        "admin/employee-categories/<int:category_id>/prime-settings/",
        views.AdminPrimeSettingListCreateView.as_view(),
    ),
    path(
        "admin/employee-categories/<int:category_id>/prime-settings/<int:pk>/",
        views.AdminPrimeSettingDetailView.as_view(),
    ),
    # ─── Admin — Types de primes ──────────────────────────────────────────────
    path("admin/prime-types/", views.AdminPrimeTypeListCreateView.as_view()),
    path(
        "admin/prime-types/<int:pk>/",
        views.AdminPrimeTypeDetailView.as_view(),
    ),
    # ─── Admin — Taux sociaux ─────────────────────────────────────────────────
    path("admin/social-rates/", views.AdminSocialRatesView.as_view()),

    # ─── Brouillon de paie ───────────────────────────────────────────────────
    path("payroll-draft/", views.PayrollDraftView.as_view()),

    # ─── Types de congé ───────────────────────────────────────────────────────
    path("types-conge/",        views.TypeCongeListCreateView.as_view()),
    path("types-conge/<int:pk>/", views.TypeCongeDetailView.as_view()),

    # ─── Demandes de congé ────────────────────────────────────────────────────
    path("demandes-conge/",           views.DemandeCongeListCreateView.as_view()),
    path("demandes-conge/<int:pk>/",  views.DemandeCongeDetailView.as_view()),
    path("demandes-conge/<int:pk>/action/", views.DemandeCongeActionView.as_view()),

    # ─── Soldes de congé ──────────────────────────────────────────────────────
    path("soldes-conge/",          views.SoldeCongeListView.as_view()),
    path("soldes-conge/<int:pk>/", views.SoldeCongeDetailView.as_view()),

    # ─── Pointages (présences) ────────────────────────────────────────────────
    # IMPORTANT : bulk/ et summary/ doivent précéder <int:pk>/
    path("pointages/",             views.PointageListCreateView.as_view()),
    path("pointages/bulk/",        views.PointageBulkView.as_view()),
    path("pointages/summary/",     views.PointageSummaryView.as_view()),
    path("pointages/<int:pk>/",    views.PointageDetailView.as_view()),
]
