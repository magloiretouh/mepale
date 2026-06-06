/**
 * MEPALE ERP — Service API Ressources Humaines
 */

import api from './api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmployeeCategory {
  id: number
  name: string
  description: string | null
  created_at: string
  prime_settings?: CategoryPrimeSetting[]
}

export interface PrimeType {
  id: number
  name: string
  description: string | null
  is_taxable: boolean
  created_at: string
}

export interface CategoryPrimeSetting {
  id: number
  category: number
  prime_type: number
  prime_type_name: string
  prime_type_is_taxable: boolean
  default_amount: string
}

export interface Employee {
  id: number
  name: string
  role: string | null
  contract_type: 'CDI' | 'CDD' | 'temps_partiel' | 'extra' | 'stage' | null
  contract_type_display: string | null
  monthly_salary: string | null
  hire_date: string | null
  birth_date: string | null
  phone: string | null
  email: string | null
  nif: string | null
  cnss_number: string | null
  is_active: boolean
  category: number | null
  category_name: string | null
  has_social_contributions: boolean
  created_at: string
}

export interface SalaryPayment {
  id: number
  employee: number
  employee_name: string
  type: 'salaire' | 'prime' | 'avance' | 'autre'
  type_display: string
  label: string | null
  amount: string
  gross_amount: string | null
  cnss_employee_amount: string | null
  amu_employee_amount: string | null
  cnss_employer_amount: string | null
  amu_employer_amount: string | null
  advance_deducted: string | null
  taxable_primes_amount: string | null
  period_month: string | null
  payment_date: string
  prime_type: number | null
  prime_type_name: string | null
  linked_salary: number | null
  created_at: string
}

// ── Brouillon de paie ──────────────────────────────────────────────────────

export interface PayrollDraftRow {
  included: boolean
  gross:    string
  advance:  string
}

export interface PayrollDraftData {
  rows: Record<string, PayrollDraftRow>
}

export interface PayrollDraft {
  id:               number
  period_month:     string
  payment_date:     string
  data:             PayrollDraftData
  status:           'draft' | 'submitted'
  updated_by:       string | null
  updated_by_name:  string | null
  updated_at:       string
  created_at:       string
}

export interface SocialRates {
  cnss_employee_rate: string
  amu_employee_rate: string
  cnss_employer_rate: string
  amu_employer_rate: string
  company_name: string
  company_address: string | null
  updated_at: string
}

export interface PendingAdvances {
  employee_id: number
  employee_name: string
  total_advanced: string
  total_deducted: string
  pending_amount: number
  advances: SalaryPayment[]
}

export interface EmployeePrime {
  prime_type_id: number
  prime_type_name: string
  is_taxable: boolean
  default_amount: string
  calculated_amount: string
}

export interface CnssRow {
  employee_id: number
  employee_name: string
  cnss_number: string
  gross: string
  cnss_employee: string
  amu_employee: string
  cnss_employer: string
  amu_employer: string
  net: string
  total_to_declare: string
}

export interface CnssDeclaration {
  month: string
  rows: CnssRow[]
  totals: {
    gross: string
    cnss_employee: string
    amu_employee: string
    cnss_employer: string
    amu_employer: string
    net: string
    total_to_declare: string
  }
}

// ── Jours fériés ──────────────────────────────────────────────────────────────

export interface JourFerie {
  id: number
  date: string
  name: string
  is_recurrent: boolean
}

// ── Congés ────────────────────────────────────────────────────────────────────

export type ModeAcquisition = 'mensuel' | 'annuel' | 'libre'

export interface TypeConge {
  id: number
  name: string
  description: string | null
  quota_annuel: string
  mode_acquisition: ModeAcquisition
  est_paye: boolean
  is_active: boolean
  created_at: string
}

export type StatutDemande = 'brouillon' | 'soumise' | 'approuvee' | 'refusee' | 'annulee'

export interface DemandeConge {
  id: number
  employee: number
  employee_name: string
  type_conge: number
  type_conge_name: string
  date_debut: string
  date_fin: string
  nb_jours: string
  statut: StatutDemande
  statut_display: string
  motif: string
  commentaire_rh: string
  approuve_par: number | null
  approuve_par_name: string | null
  approuve_le: string | null
  created_at: string
}

export interface SoldeConge {
  id: number
  employee: number
  employee_name: string
  type_conge: number
  type_conge_name: string
  mode_acquisition: ModeAcquisition
  jours_acquis: string
  jours_pris: string
  solde_actuel: number
  date_derniere_acquisition: string | null
}

// ── Présences ─────────────────────────────────────────────────────────────────

export type StatutPointage = 'present' | 'absent' | 'retard' | 'demi_journee' | 'conge'

export interface Pointage {
  id: number
  employee: number
  employee_name: string
  date: string
  statut: StatutPointage
  statut_display: string
  heure_arrivee: string | null
  heure_depart: string | null
  note: string
  created_at: string
}

export interface PointageBulkResult {
  saved: Pointage[]
  errors: { employee_id: number; detail: string }[]
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const rhApi = {
  // ── Employés ────────────────────────────────────────────────────────────────
  listEmployees: (params?: { active?: 1 }) =>
    api.get<Employee[]>('/rh/employees/', { params }),

  getEmployee: (id: number) =>
    api.get<Employee>(`/rh/employees/${id}/`),

  createEmployee: (data: Partial<Employee>) =>
    api.post<Employee>('/rh/employees/', data),

  updateEmployee: (id: number, data: Partial<Employee>) =>
    api.put<Employee>(`/rh/employees/${id}/`, data),

  deleteEmployee: (id: number) =>
    api.delete(`/rh/employees/${id}/`),

  toggleEmployee: (id: number) =>
    api.patch<{ id: number; is_active: boolean }>(`/rh/employees/${id}/toggle/`),

  getPendingAdvances: (id: number) =>
    api.get<PendingAdvances>(`/rh/employees/${id}/pending-advances/`),

  getEmployeePrimes: (id: number) =>
    api.get<EmployeePrime[]>(`/rh/employees/${id}/primes/`),

  getPayslipPdf: (id: number, month: string) =>
    api.get(`/rh/employees/${id}/payslip/`, {
      params: { month },
      responseType: 'blob',
    }),

  // ── Catégories ────────────────────────────────────────────────────────────
  listCategories: () =>
    api.get<EmployeeCategory[]>('/rh/categories/'),

  // ── Taux sociaux ──────────────────────────────────────────────────────────
  getSocialRates: () =>
    api.get<SocialRates>('/rh/social-rates/'),

  // ── Paiements ─────────────────────────────────────────────────────────────
  listPayments: (params?: { employee_id?: number | string; month?: string }) =>
    api.get<SalaryPayment[]>('/rh/salary-payments/', { params }),

  createPayment: (data: {
    employee_id: number
    payment_date: string
    type: string
    period_month?: string
    gross_amount?: number
    amount?: number
    label?: string
    advance_deducted?: number
    taxable_primes_amount?: number
    prime_type_id?: number
  }) => api.post<SalaryPayment>('/rh/salary-payments/', data),

  deletePayment: (id: number) =>
    api.delete(`/rh/salary-payments/${id}/`),

  bulkPayments: (data: {
    payment_date: string
    period_month?: string
    type: string
    payments: {
      employee_id: number
      gross_amount?: number
      amount?: number
      label?: string
      taxable_primes_amount?: number
      advance_deducted?: number
    }[]
  }) => api.post<{
    created: SalaryPayment[]
    conflicts: { employee_id: number; detail: string }[]
    errors: { employee_id: number; detail: string }[]
    summary: { total: number; created: number; conflicts: number; errors: number }
  }>('/rh/salary-payments/bulk/', data),

  bulkPrimes: (data: {
    payment_date: string
    period_month?: string
    payments: {
      employee_id: number
      prime_type_id: number
      amount: number
      label?: string
      linked_salary_id?: number
    }[]
  }) => api.post('/rh/salary-payments/bulk-primes/', data),

  // ── CNSS ──────────────────────────────────────────────────────────────────
  getCnssDeclaration: (month: string) =>
    api.get<CnssDeclaration>('/rh/cnss-declaration/', { params: { month } }),

  getPayrollJournalPdf: (month: string) =>
    api.get(`/rh/payroll-journal/`, {
      params: { month },
      responseType: 'blob',
    }),

  // ── Admin — Catégories ────────────────────────────────────────────────────
  adminListCategories: () =>
    api.get<EmployeeCategory[]>('/rh/admin/employee-categories/'),

  adminCreateCategory: (data: { name: string; description?: string }) =>
    api.post<EmployeeCategory>('/rh/admin/employee-categories/', data),

  adminUpdateCategory: (id: number, data: { name?: string; description?: string }) =>
    api.put<EmployeeCategory>(`/rh/admin/employee-categories/${id}/`, data),

  adminDeleteCategory: (id: number) =>
    api.delete(`/rh/admin/employee-categories/${id}/`),

  adminCreatePrimeSetting: (categoryId: number, data: { prime_type_id: number; default_amount: number }) =>
    api.post<CategoryPrimeSetting>(
      `/rh/admin/employee-categories/${categoryId}/prime-settings/`, data
    ),

  adminUpdatePrimeSetting: (categoryId: number, settingId: number, data: { default_amount: number }) =>
    api.put<CategoryPrimeSetting>(
      `/rh/admin/employee-categories/${categoryId}/prime-settings/${settingId}/`, data
    ),

  adminDeletePrimeSetting: (categoryId: number, settingId: number) =>
    api.delete(`/rh/admin/employee-categories/${categoryId}/prime-settings/${settingId}/`),

  // ── Admin — Types de primes ────────────────────────────────────────────────
  adminListPrimeTypes: () =>
    api.get<PrimeType[]>('/rh/admin/prime-types/'),

  adminCreatePrimeType: (data: { name: string; description?: string; is_taxable?: boolean }) =>
    api.post<PrimeType>('/rh/admin/prime-types/', data),

  adminUpdatePrimeType: (id: number, data: Partial<PrimeType>) =>
    api.put<PrimeType>(`/rh/admin/prime-types/${id}/`, data),

  adminDeletePrimeType: (id: number) =>
    api.delete(`/rh/admin/prime-types/${id}/`),

  // ── Admin — Taux sociaux ───────────────────────────────────────────────────
  adminGetSocialRates: () =>
    api.get<SocialRates>('/rh/admin/social-rates/'),

  adminUpdateSocialRates: (data: Partial<SocialRates & { company_name: string; company_address: string }>) =>
    api.put<SocialRates>('/rh/admin/social-rates/', data),

  // ── Jours fériés ──────────────────────────────────────────────────────────
  listJoursFeries: () =>
    api.get<JourFerie[]>('/rh/jours-feries/'),

  createJourFerie: (data: Omit<JourFerie, 'id'>) =>
    api.post<JourFerie>('/rh/jours-feries/', data),

  updateJourFerie: (id: number, data: Partial<Omit<JourFerie, 'id'>>) =>
    api.put<JourFerie>(`/rh/jours-feries/${id}/`, data),

  deleteJourFerie: (id: number) =>
    api.delete(`/rh/jours-feries/${id}/`),

  // ── Types de congé ────────────────────────────────────────────────────────
  listTypesConge: (actifOnly = false) =>
    api.get<TypeConge[]>('/rh/types-conge/', { params: actifOnly ? { actif_only: 1 } : undefined }),

  createTypeConge: (data: Partial<TypeConge>) =>
    api.post<TypeConge>('/rh/types-conge/', data),

  updateTypeConge: (id: number, data: Partial<TypeConge>) =>
    api.put<TypeConge>(`/rh/types-conge/${id}/`, data),

  deleteTypeConge: (id: number) =>
    api.delete(`/rh/types-conge/${id}/`),

  // ── Demandes de congé ─────────────────────────────────────────────────────
  listDemandesConge: (params?: {
    employee_id?: number | string
    statut?: StatutDemande
    type_conge_id?: number
    annee?: number | string
  }) => api.get<DemandeConge[]>('/rh/demandes-conge/', { params }),

  createDemandeConge: (data: {
    employee: number
    type_conge: number
    date_debut: string
    date_fin: string
    motif?: string
  }) => api.post<DemandeConge>('/rh/demandes-conge/', data),

  updateDemandeConge: (id: number, data: Partial<{
    type_conge: number
    date_debut: string
    date_fin: string
    motif: string
  }>) => api.put<DemandeConge>(`/rh/demandes-conge/${id}/`, data),

  deleteDemandeConge: (id: number) =>
    api.delete(`/rh/demandes-conge/${id}/`),

  actionDemandeConge: (id: number, action: 'soumettre' | 'approuver' | 'refuser' | 'annuler', commentaire_rh?: string) =>
    api.post<DemandeConge>(`/rh/demandes-conge/${id}/action/`, { action, commentaire_rh }),

  // ── Soldes de congé ───────────────────────────────────────────────────────
  listSoldesConge: (params?: { employee_id?: number | string; type_conge_id?: number }) =>
    api.get<SoldeConge[]>('/rh/soldes-conge/', { params }),

  actualiserSoldes: () =>
    api.post<{ detail: string; date: string }>('/rh/soldes-conge/actualiser/'),

  corrigerSolde: (id: number, solde_actuel: number) =>
    api.put<SoldeConge>(`/rh/soldes-conge/${id}/`, { solde_actuel }),

  // ── Pointages ─────────────────────────────────────────────────────────────
  listPointages: (params?: { date?: string; employee_id?: number | string; mois?: string }) =>
    api.get<Pointage[]>('/rh/pointages/', { params }),

  bulkPointages: (data: {
    date: string
    pointages: { employee: number; statut: StatutPointage; heure_arrivee?: string; heure_depart?: string; note?: string }[]
  }) => api.post<PointageBulkResult>('/rh/pointages/bulk/', data),

  updatePointage: (id: number, data: Partial<Pick<Pointage, 'statut' | 'heure_arrivee' | 'heure_depart' | 'note'>>) =>
    api.put<Pointage>(`/rh/pointages/${id}/`, data),

  deletePointage: (id: number) =>
    api.delete(`/rh/pointages/${id}/`),

  // ── Brouillon de paie ─────────────────────────────────────────────────────
  getPayrollDraft: (period_month: string) =>
    api.get<PayrollDraft>('/rh/payroll-draft/', { params: { period_month }, skipErrorToast: true }),

  savePayrollDraft: (payload: {
    period_month: string
    payment_date: string
    data: PayrollDraftData
  }) => api.put<PayrollDraft>('/rh/payroll-draft/', payload),

  deletePayrollDraft: (period_month: string) =>
    api.delete('/rh/payroll-draft/', { params: { period_month } }),
}
