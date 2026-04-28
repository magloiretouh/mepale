/**
 * MEPALE ERP — Service Comptabilité
 * Interfaces TypeScript + fonctions API pour le module Comptabilité.
 */

import api from './api'

// ─── Types union ────────────────────────────────────────────────────────────

export type EntryType   = 'income' | 'expense'
export type EntrySource = 'manual' | 'auto'

// ─── CategorieComptable ──────────────────────────────────────────────────────

export interface CategorieComptable {
  id:           string
  name:         string
  type:         EntryType
  type_display: string
  is_system:    boolean
  actif:        boolean
  created_at:   string
}

export interface CategorieComptablePayload {
  name:  string
  type:  EntryType
  actif?: boolean
}

export interface CategoriesGrouped {
  income:  CategorieComptable[]
  expense: CategorieComptable[]
}

// ─── EcritureComptable ───────────────────────────────────────────────────────

export interface EcritureComptableList {
  id:            string
  date:          string
  type:          EntryType
  type_display:  string
  category:      string | null
  category_name: string | null
  label:         string
  amount:        number
  source:        EntrySource
  created_at:    string
}

export interface EcritureComptable extends EcritureComptableList {
  notes:      string
  ref_type:   string
  ref_id:     string | null
  updated_at: string
}

export interface EcritureComptablePayload {
  date:        string          // YYYY-MM-DD
  type:        EntryType
  category:    string | null   // UUID
  label:       string
  amount:      number
  notes?:      string
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface ReportRow {
  category:    string
  category_id: string | null
  total:       number
}

export interface ReportSection {
  rows:  ReportRow[]
  total: number
}

export interface Report {
  income:     ReportSection
  expense:    ReportSection
  net_result: number
  period:     { from: string; to: string }
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count:    number
  next:     string | null
  previous: string | null
  results:  T[]
}

// ─── Params ──────────────────────────────────────────────────────────────────

export interface EntryFilterParams {
  date_from?:   string   // YYYY-MM-DD
  date_to?:     string   // YYYY-MM-DD
  type?:        EntryType
  category_id?: string
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = '/comptabilite'

export const comptabiliteApi = {

  // ── Catégories ─────────────────────────────────────────────────────────────

  listCategories: () =>
    api.get<PaginatedResponse<CategorieComptable>>(`${BASE}/categories/`),

  createCategorie: (data: CategorieComptablePayload) =>
    api.post<CategorieComptable>(`${BASE}/categories/`, data),

  updateCategorie: (id: string, data: Partial<CategorieComptablePayload>) =>
    api.patch<CategorieComptable>(`${BASE}/categories/${id}/`, data),

  deleteCategorie: (id: string) =>
    api.delete(`${BASE}/categories/${id}/`),

  // ── Écritures ──────────────────────────────────────────────────────────────

  listEntries: (params?: EntryFilterParams) =>
    api.get<PaginatedResponse<EcritureComptableList>>(`${BASE}/entries/`, { params }),

  getEntry: (id: string) =>
    api.get<EcritureComptable>(`${BASE}/entries/${id}/`),

  createEntry: (data: EcritureComptablePayload) =>
    api.post<EcritureComptable>(`${BASE}/entries/`, data),

  updateEntry: (id: string, data: Partial<EcritureComptablePayload>) =>
    api.patch<EcritureComptable>(`${BASE}/entries/${id}/`, data),

  deleteEntry: (id: string) =>
    api.delete(`${BASE}/entries/${id}/`),

  exportEntriesExcelUrl: (params?: EntryFilterParams): string => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return `/api/v1${BASE}/entries/export/excel/${qs ? `?${qs}` : ''}`
  },

  // ── Rapport ────────────────────────────────────────────────────────────────

  getReport: (params: { date_from: string; date_to: string }) =>
    api.get<Report>(`${BASE}/report/`, { params }),

  exportReportPdfUrl: (params: { date_from: string; date_to: string }): string => {
    const qs = new URLSearchParams(params).toString()
    return `/api/v1${BASE}/report/export/pdf/?${qs}`
  },
}
