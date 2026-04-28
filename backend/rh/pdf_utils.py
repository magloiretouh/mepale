"""
MEPALE ERP — Génération PDF fiches de paie et journal de paie
Utilise ReportLab avec la police Helvetica (Latin-1 uniquement).
Aucun caractère Unicode étendu (pas de ✓, ✗, etc.) — utiliser 'Oui'/'Non'.
"""

import io
from datetime import date
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ─── Constantes ───────────────────────────────────────────────────────────────

MONTHS_FR = {
    "01": "Janvier",
    "02": "Fevrier",
    "03": "Mars",
    "04": "Avril",
    "05": "Mai",
    "06": "Juin",
    "07": "Juillet",
    "08": "Aout",
    "09": "Septembre",
    "10": "Octobre",
    "11": "Novembre",
    "12": "Decembre",
}

COLOR_DARK = colors.HexColor("#1F2937")
COLOR_HEADER = colors.HexColor("#374151")
COLOR_LIGHT = colors.HexColor("#F9FAFB")
COLOR_BORDER = colors.HexColor("#E5E7EB")
COLOR_GREEN = colors.HexColor("#D1FAE5")
COLOR_YELLOW = colors.HexColor("#FEF3C7")
COLOR_RED_LIGHT = colors.HexColor("#FEE2E2")


# ─── Helpers ──────────────────────────────────────────────────────────────────


def fmt_fcfa(n):
    """Formate un montant en F CFA (entier, séparateur espace)."""
    if n is None:
        return "0 F CFA"
    n_int = int(round(float(n)))
    formatted = f"{n_int:,}".replace(",", " ")
    return f"{formatted} F CFA"


def fmt_month(month_str):
    """'2026-03' -> 'Mars 2026'"""
    if not month_str or len(month_str) != 7:
        return month_str or ""
    year, mon = month_str.split("-")
    return f"{MONTHS_FR.get(mon, mon)} {year}"


def fmt_date(d):
    """Formate une date Python en dd/mm/YYYY."""
    if d is None:
        return "-"
    return d.strftime("%d/%m/%Y")


# ─── Styles ───────────────────────────────────────────────────────────────────


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "RHTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=15,
            alignment=TA_CENTER,
            spaceAfter=2,
            textColor=COLOR_DARK,
        ),
        "subtitle": ParagraphStyle(
            "RHSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            alignment=TA_CENTER,
            textColor=colors.grey,
            spaceAfter=2,
        ),
        "section": ParagraphStyle(
            "RHSection",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=colors.white,
            backColor=COLOR_HEADER,
            leading=14,
            leftIndent=6,
            spaceAfter=0,
            spaceBefore=4,
        ),
        "normal": ParagraphStyle(
            "RHNormal",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
        ),
        "footer": ParagraphStyle(
            "RHFooter",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER,
        ),
    }


def _base_table_style():
    return TableStyle(
        [
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, COLOR_LIGHT]),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("ALIGN", (0, 0), (0, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
    )


# ─── Fiche de paie individuelle ───────────────────────────────────────────────


def generate_payslip_pdf(employee, salary, primes, month, rates):
    """
    Génère le PDF d'une fiche de paie individuelle.
    Retourne les bytes du PDF.
    """
    buf = io.BytesIO()
    W_PAGE, H_PAGE = A4
    MARGIN = 20 * mm
    W = W_PAGE - 2 * MARGIN

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )
    S = _styles()
    story = []

    # ── En-tête entreprise ────────────────────────────────────────────────────
    story.append(Paragraph(rates.company_name, S["title"]))
    if rates.company_address:
        story.append(Paragraph(rates.company_address, S["subtitle"]))
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width=W, thickness=2, color=COLOR_DARK))
    story.append(Spacer(1, 3 * mm))

    story.append(Paragraph("BULLETIN DE PAIE", S["title"]))
    story.append(Paragraph(f"Periode : {fmt_month(month)}", S["subtitle"]))
    story.append(Spacer(1, 5 * mm))

    # ── Informations employé ──────────────────────────────────────────────────
    story.append(Paragraph("INFORMATIONS EMPLOYE", S["section"]))

    contract_label = employee.get_contract_type_display() if employee.contract_type else "-"
    emp_rows = [
        ["Nom complet", employee.name],
        ["Poste", employee.role or "-"],
        ["Contrat", contract_label],
        ["N CNSS", employee.cnss_number or "-"],
        ["NIF", employee.nif or "-"],
    ]
    emp_table = Table(emp_rows, colWidths=[W * 0.35, W * 0.65])
    emp_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, COLOR_LIGHT]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(emp_table)
    story.append(Spacer(1, 4 * mm))

    # ── Rémunération brute ────────────────────────────────────────────────────
    gross = salary.gross_amount or Decimal("0")
    taxable_p = salary.taxable_primes_amount or Decimal("0")
    fiscal_base = gross + taxable_p

    story.append(Paragraph("REMUNERATION", S["section"]))

    rem_rows = [["Salaire brut de base", fmt_fcfa(gross)]]
    if taxable_p > 0:
        rem_rows.append(["Primes incluses dans la base de cotisations", fmt_fcfa(taxable_p)])
        rem_rows.append(["  => Base de calcul CNSS/AMU", fmt_fcfa(fiscal_base)])

    # Primes versées ce mois
    for prime in primes:
        label = prime.label or (
            prime.prime_type.name if prime.prime_type else "Prime"
        )
        rem_rows.append([f"  Prime : {label}", fmt_fcfa(prime.amount)])

    rem_table = Table(rem_rows, colWidths=[W * 0.65, W * 0.35])
    rem_table.setStyle(_base_table_style())
    story.append(rem_table)
    story.append(Spacer(1, 3 * mm))

    # ── Cotisations salariales ────────────────────────────────────────────────
    cnss_emp = salary.cnss_employee_amount
    amu_emp = salary.amu_employee_amount
    cnss_er = salary.cnss_employer_amount
    amu_er = salary.amu_employer_amount

    if employee.has_social_contributions and (cnss_emp or amu_emp):
        story.append(Paragraph("COTISATIONS SALARIALES", S["section"]))

        cotis_rows = []
        if cnss_emp:
            cotis_rows.append(
                [f"CNSS salarie ({rates.cnss_employee_rate}%)", fmt_fcfa(cnss_emp)]
            )
        if amu_emp:
            cotis_rows.append(
                [f"AMU salarie ({rates.amu_employee_rate}%)", fmt_fcfa(amu_emp)]
            )
        total_cotis_emp = (cnss_emp or Decimal("0")) + (amu_emp or Decimal("0"))
        cotis_rows.append(["Total retenues salariales", fmt_fcfa(total_cotis_emp)])

        cotis_table = Table(cotis_rows, colWidths=[W * 0.65, W * 0.35])
        style = _base_table_style()
        style.add("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold")
        style.add("BACKGROUND", (0, -1), (-1, -1), COLOR_YELLOW)
        cotis_table.setStyle(style)
        story.append(cotis_table)
        story.append(Spacer(1, 3 * mm))

    # ── Net à payer ───────────────────────────────────────────────────────────
    story.append(Paragraph("NET A PAYER", S["section"]))

    advance = salary.advance_deducted or Decimal("0")
    net_brut = salary.amount + advance  # net avant déduction avance
    net_rows = [["Salaire net (brut - cotisations)", fmt_fcfa(net_brut)]]
    if advance > 0:
        net_rows.append(["Avance deduite", f"- {fmt_fcfa(advance)}"])
    net_rows.append(["NET VERSE A L'EMPLOYE", fmt_fcfa(salary.amount)])

    net_table = Table(net_rows, colWidths=[W * 0.65, W * 0.35])
    net_style = _base_table_style()
    net_style.add("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold")
    net_style.add("FONTSIZE", (0, -1), (-1, -1), 10)
    net_style.add("BACKGROUND", (0, -1), (-1, -1), COLOR_GREEN)
    net_table.setStyle(net_style)
    story.append(net_table)
    story.append(Spacer(1, 3 * mm))

    # ── Charges patronales (information) ──────────────────────────────────────
    if employee.has_social_contributions and (cnss_er or amu_er):
        story.append(Paragraph("CHARGES PATRONALES (pour information)", S["section"]))

        patro_rows = []
        if cnss_er:
            patro_rows.append(
                [f"CNSS patronal ({rates.cnss_employer_rate}%)", fmt_fcfa(cnss_er)]
            )
        if amu_er:
            patro_rows.append(
                [f"AMU patronal ({rates.amu_employer_rate}%)", fmt_fcfa(amu_er)]
            )
        total_patro = (cnss_er or Decimal("0")) + (amu_er or Decimal("0"))
        patro_rows.append(["Total charges patronales", fmt_fcfa(total_patro)])

        patro_table = Table(patro_rows, colWidths=[W * 0.65, W * 0.35])
        pstyle = _base_table_style()
        pstyle.add("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold")
        pstyle.add("BACKGROUND", (0, -1), (-1, -1), COLOR_RED_LIGHT)
        patro_table.setStyle(pstyle)
        story.append(patro_table)
        story.append(Spacer(1, 4 * mm))

    # ── Pied de page ──────────────────────────────────────────────────────────
    story.append(HRFlowable(width=W, thickness=1, color=COLOR_BORDER))
    story.append(Spacer(1, 4 * mm))

    sign_rows = [
        [
            f"Date de paiement : {fmt_date(salary.payment_date)}",
            "Signature employeur",
            "Signature employe",
        ],
        ["", "", ""],
        ["", "_____________________", "_____________________"],
    ]
    sign_table = Table(sign_rows, colWidths=[W * 0.4, W * 0.3, W * 0.3])
    sign_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(sign_table)

    doc.build(story)
    return buf.getvalue()


# ─── Journal de paie (tous employés du mois) ──────────────────────────────────


def generate_payroll_journal_pdf(payments, month, rates):
    """
    Génère le PDF du journal de paie consolidé pour un mois donné.
    Retourne les bytes du PDF.
    """
    buf = io.BytesIO()
    W_PAGE, _ = A4
    MARGIN = 15 * mm
    W = W_PAGE - 2 * MARGIN

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )
    S = _styles()
    story = []

    # ── En-tête ───────────────────────────────────────────────────────────────
    story.append(Paragraph(rates.company_name, S["title"]))
    story.append(
        Paragraph(f"Journal de Paie - {fmt_month(month)}", S["subtitle"])
    )
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width=W, thickness=2, color=COLOR_DARK))
    story.append(Spacer(1, 4 * mm))

    # ── Section Salaires ──────────────────────────────────────────────────────
    salary_payments = [p for p in payments if p.type == "salaire"]

    if salary_payments:
        story.append(Paragraph("SALAIRES DU MOIS", S["section"]))

        col_w = [W * 0.26, W * 0.12, W * 0.11, W * 0.11, W * 0.11, W * 0.11, W * 0.12, W * 0.06]
        headers = [
            "Employe",
            "Brut",
            "CNSS sal.",
            "AMU sal.",
            "CNSS pat.",
            "AMU pat.",
            "Net verse",
            "Social",
        ]

        rows = [headers]
        totals = {
            k: Decimal("0")
            for k in ["gross", "cnss_emp", "amu_emp", "cnss_er", "amu_er", "net"]
        }

        for p in salary_payments:
            gross = p.gross_amount or Decimal("0")
            cnss_emp = p.cnss_employee_amount or Decimal("0")
            amu_emp = p.amu_employee_amount or Decimal("0")
            cnss_er = p.cnss_employer_amount or Decimal("0")
            amu_er = p.amu_employer_amount or Decimal("0")
            net = p.amount or Decimal("0")
            social_flag = "Oui" if p.employee.has_social_contributions else "Non"

            rows.append(
                [
                    p.employee.name,
                    fmt_fcfa(gross),
                    fmt_fcfa(cnss_emp),
                    fmt_fcfa(amu_emp),
                    fmt_fcfa(cnss_er),
                    fmt_fcfa(amu_er),
                    fmt_fcfa(net),
                    social_flag,
                ]
            )
            totals["gross"] += gross
            totals["cnss_emp"] += cnss_emp
            totals["amu_emp"] += amu_emp
            totals["cnss_er"] += cnss_er
            totals["amu_er"] += amu_er
            totals["net"] += net

        rows.append(
            [
                "TOTAL",
                fmt_fcfa(totals["gross"]),
                fmt_fcfa(totals["cnss_emp"]),
                fmt_fcfa(totals["amu_emp"]),
                fmt_fcfa(totals["cnss_er"]),
                fmt_fcfa(totals["amu_er"]),
                fmt_fcfa(totals["net"]),
                "",
            ]
        )

        tbl = Table(rows, colWidths=col_w)
        tbl.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_LIGHT]),
                    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                    ("ALIGN", (0, 0), (0, -1), "LEFT"),
                    ("ALIGN", (-1, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    # Header row
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("BACKGROUND", (0, 0), (-1, 0), COLOR_HEADER),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    # Total row
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("BACKGROUND", (0, -1), (-1, -1), COLOR_LIGHT),
                    ("TOPPADDING", (0, -1), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, -1), (-1, -1), 5),
                ]
            )
        )
        story.append(tbl)
        story.append(Spacer(1, 5 * mm))

    # ── Section Autres paiements ──────────────────────────────────────────────
    other_payments = [p for p in payments if p.type != "salaire"]

    if other_payments:
        story.append(
            Paragraph("AUTRES PAIEMENTS (PRIMES, AVANCES, DIVERS)", S["section"])
        )

        col_w2 = [W * 0.30, W * 0.12, W * 0.10, W * 0.30, W * 0.18]
        headers2 = ["Employe", "Type", "Periode", "Libelle", "Montant"]

        rows2 = [headers2]
        total_autres = Decimal("0")

        for p in other_payments:
            rows2.append(
                [
                    p.employee.name,
                    p.get_type_display(),
                    p.period_month or "-",
                    p.label or "-",
                    fmt_fcfa(p.amount),
                ]
            )
            total_autres += p.amount or Decimal("0")

        rows2.append(["TOTAL", "", "", "", fmt_fcfa(total_autres)])

        tbl2 = Table(rows2, colWidths=col_w2)
        tbl2.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_LIGHT]),
                    ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
                    ("ALIGN", (0, 0), (-2, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("BACKGROUND", (0, 0), (-1, 0), COLOR_HEADER),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("BACKGROUND", (0, -1), (-1, -1), COLOR_LIGHT),
                ]
            )
        )
        story.append(tbl2)

    # ── Pied de page ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width=W, thickness=1, color=COLOR_BORDER))
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            f"Document genere le {date.today().strftime('%d/%m/%Y')} "
            f"- {rates.company_name}",
            S["footer"],
        )
    )

    doc.build(story)
    return buf.getvalue()
