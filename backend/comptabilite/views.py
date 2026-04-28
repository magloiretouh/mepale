"""
MEPALE ERP — Views Comptabilité
ViewSets : CategorieComptable, EcritureComptable.
Vues     : ReportView, ReportExportPdfView.
"""

import calendar
from datetime import date, datetime

from django.db.models import Sum
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter

from authentication.permissions import IsComptableStaff

from .filters import EcritureFilter
from .models import CategorieComptable, EcritureComptable
from .serializers import (
    CategorieComptableSerializer,
    EcritureComptableListSerializer,
    EcritureComptableSerializer,
)
from .utils.accounting_exports import export_entries_excel, export_report_pdf


# ---------------------------------------------------------------------------
# Helpers période
# ---------------------------------------------------------------------------

def _period_bounds(params):
    """
    Priorité : date_from + date_to > month (YYYY-MM) > mois courant.
    Retourne (date_from, date_to) en objets date.
    """
    date_from_str = params.get('date_from')
    date_to_str   = params.get('date_to')
    month_str     = params.get('month')

    if date_from_str and date_to_str:
        try:
            return (
                datetime.strptime(date_from_str, '%Y-%m-%d').date(),
                datetime.strptime(date_to_str,   '%Y-%m-%d').date(),
            )
        except ValueError:
            pass

    if month_str:
        try:
            year, month = map(int, month_str.split('-'))
            last_day    = calendar.monthrange(year, month)[1]
            return date(year, month, 1), date(year, month, last_day)
        except (ValueError, AttributeError):
            pass

    # Défaut : mois courant
    today    = date.today()
    last_day = calendar.monthrange(today.year, today.month)[1]
    return today.replace(day=1), today.replace(day=last_day)


def _build_report_data(date_from, date_to):
    """
    Agrège les écritures en groupes recettes / charges par catégorie.
    Les écritures sans catégorie (catégorie supprimée) apparaissent sous
    "Non catégorisé" à la fin de chaque section.
    """
    qs = EcritureComptable.objects.filter(date__gte=date_from, date__lte=date_to)

    def _group(queryset):
        # Avec catégorie
        with_cat = (
            queryset
            .filter(category__isnull=False)
            .values('category__id', 'category__name')
            .annotate(total=Sum('amount'))
            .order_by('category__name')
        )
        rows = [
            {
                'category':    row['category__name'],
                'category_id': str(row['category__id']),
                'total':       float(row['total']),
            }
            for row in with_cat
        ]

        # Sans catégorie (catégorie supprimée)
        uncategorized = queryset.filter(category__isnull=True).aggregate(total=Sum('amount'))['total']
        if uncategorized:
            rows.append({'category': 'Non catégorisé', 'category_id': None, 'total': float(uncategorized)})

        return rows

    income_rows  = _group(qs.filter(type=EcritureComptable.Type.RECETTE))
    expense_rows = _group(qs.filter(type=EcritureComptable.Type.CHARGE))

    total_income  = sum(r['total'] for r in income_rows)
    total_expense = sum(r['total'] for r in expense_rows)

    return {
        'income':     {'rows': income_rows,  'total': total_income},
        'expense':    {'rows': expense_rows, 'total': total_expense},
        'net_result': total_income - total_expense,
    }


# ---------------------------------------------------------------------------
# CategorieComptable
# ---------------------------------------------------------------------------

class CategorieComptableViewSet(ModelViewSet):
    """
    CRUD catégories comptables.
    - Doublon insensible à la casse → 409
    - Suppression bloquée si is_system=True → 403
    - Suppression bloquée si écritures référencées → 409
    """
    queryset         = CategorieComptable.objects.all()
    serializer_class = CategorieComptableSerializer
    permission_classes = [IsComptableStaff]
    filter_backends  = [OrderingFilter]
    ordering_fields  = ['name', 'type', 'created_at']

    def create(self, request, *args, **kwargs):
        name = request.data.get('name', '').strip()
        if CategorieComptable.objects.filter(name__iexact=name).exists():
            return Response(
                {'detail': f"Une catégorie nommée « {name} » existe déjà."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        name = request.data.get('name', '').strip()
        if name:
            obj = self.get_object()
            if CategorieComptable.objects.filter(name__iexact=name).exclude(pk=obj.pk).exists():
                return Response(
                    {'detail': f"Une catégorie nommée « {name} » existe déjà."},
                    status=status.HTTP_409_CONFLICT,
                )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.is_system:
            return Response(
                {'detail': 'Les catégories système ne peuvent pas être supprimées.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        count = obj.ecritures.count()
        if count > 0:
            return Response(
                {'detail': f"Impossible de supprimer : {count} écriture(s) utilisent cette catégorie."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)


# ---------------------------------------------------------------------------
# EcritureComptable
# ---------------------------------------------------------------------------

class EcritureComptableViewSet(ModelViewSet):
    """
    CRUD écritures comptables.
    - Les écritures source='auto' ne peuvent pas être modifiées ni supprimées → 403
    - Export Excel via GET /entries/export/excel/
    """
    queryset = EcritureComptable.objects.select_related('category').order_by('-date', '-created_at')
    permission_classes = [IsComptableStaff]
    filterset_class    = EcritureFilter
    filter_backends    = [DjangoFilterBackend, OrderingFilter]
    ordering_fields    = ['date', 'amount', 'created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return EcritureComptableListSerializer
        return EcritureComptableSerializer

    def perform_create(self, serializer):
        serializer.save(source=EcritureComptable.Source.MANUAL)

    def update(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.source == EcritureComptable.Source.AUTO:
            return Response(
                {'detail': 'Les écritures automatiques ne peuvent pas être modifiées.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.source == EcritureComptable.Source.AUTO:
            return Response(
                {'detail': 'Les écritures automatiques ne peuvent pas être supprimées.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='export/excel')
    def export_excel(self, request):
        """Télécharge les écritures filtrées en .xlsx."""
        date_from, date_to = _period_bounds(request.query_params)
        entries = self.filter_queryset(self.get_queryset()).filter(
            date__gte=date_from, date__lte=date_to,
        )
        content  = export_entries_excel(list(entries), date_from, date_to)
        filename = f"ecritures_{date_from}_{date_to}.xlsx"
        response = HttpResponse(
            content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

class ReportView(APIView):
    """GET /report/ — Compte de résultats pour une période."""
    permission_classes = [IsComptableStaff]

    def get(self, request):
        date_from, date_to = _period_bounds(request.query_params)
        data = _build_report_data(date_from, date_to)
        data['period'] = {'from': str(date_from), 'to': str(date_to)}
        return Response(data)


class ReportExportPdfView(APIView):
    """GET /report/export/pdf/ — Télécharge le compte de résultats en PDF."""
    permission_classes = [IsComptableStaff]

    def get(self, request):
        date_from, date_to = _period_bounds(request.query_params)
        data     = _build_report_data(date_from, date_to)
        content  = export_report_pdf(data, date_from, date_to)
        filename = f"compte_resultat_{date_from}_{date_to}.pdf"
        response = HttpResponse(content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
