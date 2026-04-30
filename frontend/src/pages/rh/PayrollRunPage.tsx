/**
 * MEPALE ERP — Lancer la paie
 * Grille mensuelle de préparation des salaires.
 * Brouillon collaboratif : auto-sauvegarde vers le backend, visible par tous.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Play, CheckCircle2, AlertTriangle,
  XCircle, ChevronDown, ChevronRight, Save, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { type Employee, type SocialRates, type CategoryPrimeSetting, rhApi } from '@/services/rh'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now          = new Date()
const todayStr     = now.toISOString().slice(0, 10)
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

function fmtXOF(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return Math.round(n).toLocaleString('fr-FR') + ' F'
}

function fmtMonth(m: string): string {
  const d = new Date(m + '-02')
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + fmtTime(iso)
}

const CELL_INPUT = cn(
  'w-32 h-8 bg-[--bg-surface] border border-[--border] rounded px-2',
  'text-sm text-right text-[--text-primary] transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:shadow-[0_0_0_2px_var(--accent-dim)]',
  'disabled:opacity-30 disabled:cursor-not-allowed',
  'placeholder:text-[--text-muted]',
)


// ─── CalcRow ──────────────────────────────────────────────────────────────────

function CalcRow({
  label, value, sub, bold, accent, danger, separator,
}: {
  label: string; value: string; sub?: string
  bold?: boolean; accent?: boolean; danger?: boolean; separator?: boolean
}) {
  return (
    <div
      className={cn('flex items-baseline justify-between gap-2 py-1', separator && 'mt-1 pt-2')}
      style={separator ? { borderTop: '1px solid var(--border)' } : undefined}
    >
      <span
        className={cn('text-sm', bold && 'font-semibold')}
        style={{ color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        {label}
        {sub && <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
      </span>
      <span
        className={cn('font-data text-sm whitespace-nowrap', bold && 'font-semibold')}
        style={{
          color: accent ? 'var(--accent)' : danger ? 'var(--status-danger)' : 'var(--text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Calcul par ligne ─────────────────────────────────────────────────────────

interface RowCalc {
  fiscalBase:       number
  taxablePrimes:    number
  nonTaxablePrimes: number
  cnssEmp:          number
  amuEmp:           number
  netComptable:     number
  netAPayer:        number
  cnssEr:           number
  amuEr:            number
  totalCost:        number
}

function computeRow(
  gross:     number,
  advance:   number,
  catPrimes: { taxable: number; nonTaxable: number },
  rates:     SocialRates,
  hasSocial: boolean,
): RowCalc {
  const fiscalBase   = gross + catPrimes.taxable
  const cnssEmp      = hasSocial ? Math.round(fiscalBase * parseFloat(rates.cnss_employee_rate) / 100) : 0
  const amuEmp       = hasSocial ? Math.round(fiscalBase * parseFloat(rates.amu_employee_rate)  / 100) : 0
  const netComptable = fiscalBase - cnssEmp - amuEmp
  const cnssEr       = hasSocial ? Math.round(fiscalBase * parseFloat(rates.cnss_employer_rate) / 100) : 0
  const amuEr        = hasSocial ? Math.round(fiscalBase * parseFloat(rates.amu_employer_rate)  / 100) : 0
  return {
    fiscalBase,
    taxablePrimes:    catPrimes.taxable,
    nonTaxablePrimes: catPrimes.nonTaxable,
    cnssEmp, amuEmp, netComptable,
    netAPayer: netComptable + catPrimes.nonTaxable - advance,
    cnssEr, amuEr,
    totalCost: gross + catPrimes.taxable + catPrimes.nonTaxable + cnssEr + amuEr,
  }
}

// ─── État par ligne ───────────────────────────────────────────────────────────

interface RowState {
  included: boolean
  gross:    string
  advance:  string
  expanded: boolean
}

// ─── Résultat soumission ──────────────────────────────────────────────────────

interface RunResult {
  created:       number
  conflicts:     number
  errors:        number
  conflictNames: string[]
  errorNames:    string[]
}

// ─── Breakdown dépliable ──────────────────────────────────────────────────────

function RowBreakdown({
  emp, gross, advance, calc, settings, socialRates,
}: {
  emp:         Employee
  gross:       number
  advance:     number
  calc:        RowCalc
  settings:    CategoryPrimeSetting[]
  socialRates: SocialRates
}) {
  const taxableSettings    = settings.filter(s => s.prime_type_is_taxable)
  const nonTaxableSettings = settings.filter(s => !s.prime_type_is_taxable)

  return (
    <div
      className="rounded-lg px-4 py-3 space-y-0.5 my-1"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <CalcRow label="Salaire brut" value={fmtXOF(gross)} />

      {taxableSettings.map(s => (
        <CalcRow key={s.id} label={s.prime_type_name} sub="(imposable)"
          value={`+${fmtXOF(parseFloat(s.default_amount))}`} accent />
      ))}

      {taxableSettings.length > 0 && (
        <CalcRow label="Base fiscale" value={fmtXOF(calc.fiscalBase)} bold separator />
      )}

      {emp.has_social_contributions ? (
        <>
          <CalcRow label="CNSS salarié" sub={`(${socialRates.cnss_employee_rate}%)`}
            value={`−${fmtXOF(calc.cnssEmp)}`} separator={taxableSettings.length === 0} />
          <CalcRow label="AMU salarié" sub={`(${socialRates.amu_employee_rate}%)`}
            value={`−${fmtXOF(calc.amuEmp)}`} />
        </>
      ) : (
        <p className="text-xs py-1 mt-1" style={{ color: 'var(--status-warning)' }}>
          Employé exonéré de cotisations sociales
        </p>
      )}

      <CalcRow label="Net comptable" value={fmtXOF(calc.netComptable)} bold separator />

      {nonTaxableSettings.map(s => (
        <CalcRow key={s.id} label={s.prime_type_name}
          value={`+${fmtXOF(parseFloat(s.default_amount))}`} accent />
      ))}

      {(advance > 0 || nonTaxableSettings.length > 0) && (
        <>
          {advance > 0 && (
            <CalcRow label="Avance déduite" value={`−${fmtXOF(advance)}`} danger />
          )}
          <CalcRow label="Net à payer" value={fmtXOF(calc.netAPayer)} bold accent separator />
        </>
      )}

      {emp.has_social_contributions && (
        <>
          <CalcRow label="CNSS patronal" sub={`(${socialRates.cnss_employer_rate}%)`}
            value={fmtXOF(calc.cnssEr)} separator />
          <CalcRow label="AMU patronal" sub={`(${socialRates.amu_employer_rate}%)`}
            value={fmtXOF(calc.amuEr)} />
          <CalcRow label="Coût total employeur" value={fmtXOF(calc.totalCost)} bold separator />
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PayrollRunPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()

  // ── State principal ──────────────────────────────────────────────────────────

  const [paymentDate, setPaymentDate] = useState(todayStr)
  const [periodMonth, setPeriodMonth] = useState(currentMonth)
  const [rows,        setRows       ] = useState<Record<number, RowState>>({})
  const [result,      setResult     ] = useState<RunResult | null>(null)
  const [error,       setError      ] = useState('')

  // ── Refs brouillon ───────────────────────────────────────────────────────────

  // true une fois que les lignes ont été initialisées (employés chargés)
  const rowsReady    = useRef(false)
  // true une fois que le brouillon a été appliqué sur les lignes
  const draftApplied = useRef(false)
  // état de la dernière sauvegarde (pour l'affichage)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [savedBy, setSavedBy] = useState<string | null>(null)

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: employees, isLoading: empLoading } = useQuery({
    queryKey: ['rh-employees-active'],
    queryFn:  () => rhApi.listEmployees({ active: 1 }).then(r => r.data),
  })

  const { data: socialRates } = useQuery({
    queryKey: ['rh-social-rates'],
    queryFn:  () => rhApi.getSocialRates().then(r => r.data),
  })

  const { data: categories } = useQuery({
    queryKey: ['rh-admin-categories'],
    queryFn:  () => rhApi.adminListCategories().then(r => r.data),
  })

  const empIds = useMemo(() => employees?.map(e => e.id) ?? [], [employees])

  const { data: advancesMap = {}, isLoading: advLoading } = useQuery({
    queryKey: ['rh-all-pending-advances', empIds],
    queryFn:  async () => {
      const results = await Promise.all(
        (employees ?? []).map(emp =>
          rhApi.getPendingAdvances(emp.id)
            .then(r => ({ id: emp.id, pending: r.data.pending_amount }))
            .catch(() => ({ id: emp.id, pending: 0 })),
        ),
      )
      return Object.fromEntries(results.map(r => [r.id, r.pending])) as Record<number, number>
    },
    enabled: empIds.length > 0,
  })

  // ── Query brouillon ──────────────────────────────────────────────────────────

  const { data: draft } = useQuery({
    queryKey: ['rh-payroll-draft', periodMonth],
    queryFn:  () =>
      rhApi.getPayrollDraft(periodMonth)
        .then(r => r.data)
        .catch((e: { response?: { status?: number } }) => {
          // 404 = aucun brouillon pour cette période, c'est normal
          if (e?.response?.status === 404) return null
          throw e
        }),
    retry:    false,
    staleTime: 30_000,
  })

  // ── Primes de catégorie ──────────────────────────────────────────────────────

  const categoryPrimesMap = useMemo(() => {
    if (!categories) return {} as Record<number, { taxable: number; nonTaxable: number; settings: CategoryPrimeSetting[] }>
    const map: Record<number, { taxable: number; nonTaxable: number; settings: CategoryPrimeSetting[] }> = {}
    for (const cat of categories) {
      const settings = cat.prime_settings ?? []
      map[cat.id] = {
        settings,
        taxable:    settings.filter(p => p.prime_type_is_taxable).reduce((s, p) => s + parseFloat(p.default_amount), 0),
        nonTaxable: settings.filter(p => !p.prime_type_is_taxable).reduce((s, p) => s + parseFloat(p.default_amount), 0),
      }
    }
    return map
  }, [categories])

  // ── Initialisation 1 : employés → lignes par défaut ──────────────────────────

  useEffect(() => {
    if (!employees || employees.length === 0) return
    setRows(prev => {
      const next = { ...prev }
      for (const emp of employees) {
        if (!next[emp.id]) {
          next[emp.id] = {
            included: true,
            gross:    emp.monthly_salary ? String(Math.round(parseFloat(emp.monthly_salary))) : '',
            advance:  '',
            expanded: false,
          }
        }
      }
      rowsReady.current = true
      return next
    })
  }, [employees])

  // ── Initialisation 2 : avances → pré-remplir avances ────────────────────────

  useEffect(() => {
    if (!advancesMap || Object.keys(advancesMap).length === 0) return
    setRows(prev => {
      const next = { ...prev }
      for (const [empIdStr, pending] of Object.entries(advancesMap)) {
        const empId = parseInt(empIdStr)
        if (next[empId] && (pending as number) > 0 && !next[empId].advance) {
          next[empId] = { ...next[empId], advance: String(pending) }
        }
      }
      return next
    })
  }, [advancesMap])

  // ── Initialisation 3 : appliquer le brouillon par-dessus les defaults ────────

  useEffect(() => {
    // Attendre que les lignes de base soient prêtes ET que le brouillon soit chargé
    if (!rowsReady.current || !draft || draftApplied.current) return
    draftApplied.current = true

    const draftRows = draft.data?.rows ?? {}
    if (Object.keys(draftRows).length === 0) return

    setPaymentDate(draft.payment_date)
    setRows(prev => {
      const next = { ...prev }
      for (const [empIdStr, draftRow] of Object.entries(draftRows)) {
        const empId = parseInt(empIdStr)
        if (next[empId]) {
          next[empId] = {
            ...next[empId],
            included: draftRow.included,
            gross:    draftRow.gross,
            advance:  draftRow.advance,
            // expanded reste false (UI-only)
          }
        }
      }
      return next
    })

    // Afficher les infos de la dernière sauvegarde
    setSavedAt(draft.updated_at)
    setSavedBy(draft.updated_by_name)
  }, [draft, rows])   // rows dans dep pour attendre rowsReady

  // ── Reset quand la période change ────────────────────────────────────────────
  // Les employés et avances ne changent pas quand la période change → on
  // réinitialise les lignes directement ici (l'effect employees ne se re-déclenche pas).

  useEffect(() => {
    draftApplied.current = false
    rowsReady.current    = false
    setSavedAt(null)
    setSavedBy(null)

    if (!employees?.length) {
      setRows({})
      return
    }

    // Reconstruire les lignes avec les valeurs par défaut
    const next: Record<number, RowState> = {}
    for (const emp of employees) {
      next[emp.id] = {
        included: true,
        gross:    emp.monthly_salary ? String(Math.round(parseFloat(emp.monthly_salary))) : '',
        advance:  '',
        expanded: false,
      }
    }
    // Ré-appliquer les avances en attente
    for (const [empIdStr, pending] of Object.entries(advancesMap)) {
      const empId = parseInt(empIdStr)
      if (next[empId] && (pending as number) > 0) {
        next[empId] = { ...next[empId], advance: String(pending) }
      }
    }
    setRows(next)
    rowsReady.current = true
    // employees et advancesMap intentionnellement absents des deps :
    // leurs changements sont gérés par leurs propres effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMonth])

  // ── Mutation sauvegarde brouillon ─────────────────────────────────────────────

  const { mutate: saveDraft, isPending: isSaving } = useMutation({
    mutationFn: (payload: { payment_date: string; period_month: string; rows: Record<number, RowState> }) => {
      const draftRows: Record<string, { included: boolean; gross: string; advance: string }> = {}
      for (const [id, row] of Object.entries(payload.rows)) {
        draftRows[id] = { included: row.included, gross: row.gross, advance: row.advance }
      }
      return rhApi.savePayrollDraft({
        period_month: payload.period_month,
        payment_date: payload.payment_date,
        data: { rows: draftRows },
      })
    },
    onSuccess: res => {
      setSavedAt(res.data.updated_at)
      setSavedBy(res.data.updated_by_name)
      qc.setQueryData(['rh-payroll-draft', periodMonth], res.data)
      toast.success('Brouillon sauvegardé.')
    },
    onError: () => {
      toast.error('Échec de la sauvegarde du brouillon.')
    },
  })

  const handleSaveDraft = () => {
    if (Object.keys(rows).length === 0) return
    saveDraft({ payment_date: paymentDate, period_month: periodMonth, rows })
  }

  // ── Mutation suppression brouillon ────────────────────────────────────────────

  const { mutate: deleteDraft, isPending: isDeleting } = useMutation({
    mutationFn: () => rhApi.deletePayrollDraft(periodMonth),
    onSuccess: () => {
      toast.success('Brouillon supprimé.')
      setSavedAt(null)
      setSavedBy(null)
      qc.removeQueries({ queryKey: ['rh-payroll-draft', periodMonth] })
    },
    onError: () => toast.error('Impossible de supprimer le brouillon.'),
  })

  // ── Dérivés ──────────────────────────────────────────────────────────────────

  const activeEmployees = useMemo(() => employees?.filter(e => e.is_active) ?? [], [employees])
  const includedEmps    = useMemo(() => activeEmployees.filter(e => rows[e.id]?.included), [activeEmployees, rows])
  const allChecked      = activeEmployees.length > 0 && activeEmployees.every(e => rows[e.id]?.included)
  const someChecked     = activeEmployees.some(e => rows[e.id]?.included)

  const setRow = (id: number, field: keyof RowState, val: string | boolean) =>
    setRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))

  const toggleAll = (checked: boolean) =>
    setRows(prev => {
      const next = { ...prev }
      for (const emp of activeEmployees) next[emp.id] = { ...next[emp.id], included: checked }
      return next
    })

  // ── Totaux ───────────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    if (!socialRates) return null
    let brut = 0, netAPayer = 0, coutTotal = 0, cnssEmpTotal = 0, amuEmpTotal = 0, cnssErTotal = 0, amuErTotal = 0
    for (const emp of includedEmps) {
      const row = rows[emp.id]
      if (!row) continue
      const gross   = parseFloat(row.gross)   || 0
      const advance = parseFloat(row.advance) || 0
      if (!gross) continue
      const catPrimes = categoryPrimesMap[emp.category ?? -1] ?? { taxable: 0, nonTaxable: 0 }
      const calc      = computeRow(gross, advance, catPrimes, socialRates, emp.has_social_contributions)
      brut += gross; netAPayer += calc.netAPayer; coutTotal += calc.totalCost
      cnssEmpTotal += calc.cnssEmp; amuEmpTotal += calc.amuEmp
      cnssErTotal  += calc.cnssEr;  amuErTotal  += calc.amuEr
    }
    return { brut, netAPayer, coutTotal, cnssEmpTotal, amuEmpTotal, cnssErTotal, amuErTotal }
  }, [includedEmps, rows, categoryPrimesMap, socialRates])

  // ── Validation ───────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!paymentDate) return 'La date de paiement est requise.'
    if (includedEmps.length === 0) return 'Sélectionnez au moins un employé.'
    const missing = includedEmps.filter(e => !rows[e.id]?.gross || parseFloat(rows[e.id].gross) <= 0)
    if (missing.length) return `Brut manquant : ${missing.map(e => e.name).join(', ')}`
    for (const emp of includedEmps) {
      const row     = rows[emp.id]
      const advance = parseFloat(row.advance) || 0
      const pending = advancesMap[emp.id] ?? 0
      if (advance > pending && pending > 0)
        return `Avance de ${emp.name} (${fmtXOF(advance)}) dépasse le solde (${fmtXOF(pending)}).`
    }
    return null
  }

  // ── Mutation paie ─────────────────────────────────────────────────────────────

  const { mutate: runPayroll, isPending } = useMutation({
    mutationFn: () => {
      const payments = includedEmps.map(emp => {
        const row       = rows[emp.id]
        const catPrimes = categoryPrimesMap[emp.category ?? -1] ?? { taxable: 0, nonTaxable: 0 }
        return {
          employee_id:           emp.id,
          gross_amount:          parseFloat(row.gross) || 0,
          taxable_primes_amount: catPrimes.taxable || undefined,
          advance_deducted:      parseFloat(row.advance) || undefined,
        }
      })
      return rhApi.bulkPayments({ payment_date: paymentDate, period_month: periodMonth, type: 'salaire', payments })
    },
    onSuccess: res => {
      const empMap = Object.fromEntries((employees ?? []).map(e => [e.id, e.name]))
      setResult({
        created:       res.data.summary.created,
        conflicts:     res.data.summary.conflicts ?? 0,
        errors:        res.data.summary.errors,
        conflictNames: (res.data.conflicts ?? []).map((c: { employee_id: number }) => empMap[c.employee_id] ?? `#${c.employee_id}`),
        errorNames:    res.data.errors.map((e: { employee_id: number }) => empMap[e.employee_id] ?? `#${e.employee_id}`),
      })
      if (res.data.summary.created > 0) {
        toast.success(`${res.data.summary.created} salaire(s) enregistré(s).`)
        qc.invalidateQueries({ queryKey: ['rh-payments'] })
        qc.invalidateQueries({ queryKey: ['rh-pending-advances'] })
        // Supprimer le brouillon après soumission réussie
        rhApi.deletePayrollDraft(periodMonth).catch(() => null)
        qc.removeQueries({ queryKey: ['rh-payroll-draft', periodMonth] })
        setSavedAt(null)
        setSavedBy(null)
      }
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail ?? 'Erreur lors du traitement.')
    },
  })

  const handleSubmit = () => {
    const err = validate()
    if (err) return setError(err)
    setError('')
    runPayroll()
  }

  // ── Rendu : résultat ──────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="space-y-5 animate-fade-in">
        <button onClick={() => navigate('/rh/employes')}
          className="flex items-center gap-1.5 text-xs font-medium hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Retour aux employés
        </button>

        <div className="rounded-xl p-6 space-y-5"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Résultat — Paie {fmtMonth(periodMonth)}
          </h1>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Créés',            value: result.created,   color: 'var(--status-success)', bg: 'var(--status-success-bg)' },
              { label: 'Doublons ignorés', value: result.conflicts, color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' },
              { label: 'Erreurs',          value: result.errors,    color: 'var(--status-danger)',  bg: 'var(--status-danger-bg)'  },
            ].map(s => (
              <div key={s.label} className="rounded-lg px-4 py-4 text-center"
                style={{ backgroundColor: s.bg, border: `1px solid ${s.color}` }}>
                <div className="text-3xl font-bold font-data" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {result.conflictNames.length > 0 && (
            <div className="rounded px-4 py-3 flex gap-2"
              style={{ backgroundColor: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--status-warning)' }} />
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--status-warning)' }}>
                  Salaire déjà enregistré pour cette période :
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{result.conflictNames.join(', ')}</p>
              </div>
            </div>
          )}

          {result.errorNames.length > 0 && (
            <div className="rounded px-4 py-3 flex gap-2"
              style={{ backgroundColor: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)' }}>
              <XCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--status-danger)' }} />
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--status-danger)' }}>Erreurs :</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{result.errorNames.join(', ')}</p>
              </div>
            </div>
          )}

          {result.created > 0 && result.conflicts === 0 && result.errors === 0 && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-success)' }}>
              <CheckCircle2 size={16} /> Tous les salaires ont été traités avec succès.
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/rh/employes')}>Retour aux employés</Button>
            {(result.conflicts > 0 || result.errors > 0) && (
              <Button variant="secondary" size="sm" onClick={() => setResult(null)}>Corriger et relancer</Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Rendu : grille ────────────────────────────────────────────────────────────

  const loading    = empLoading || advLoading || !socialRates
  const COL_COUNT  = 7
  const hasDraft   = !!savedAt

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Navigation ── */}
      <button onClick={() => navigate('/rh/employes')}
        className="flex items-center gap-1.5 text-xs font-medium hover:opacity-70 transition-opacity"
        style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={14} /> Retour aux employés
      </button>

      {/* ── Bannière brouillon collaboratif ── */}
      {hasDraft && (
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}
        >
          <div className="flex items-center gap-2">
            <Save size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Brouillon sauvegardé
              {savedBy && <> par <strong style={{ color: 'var(--text-primary)' }}>{savedBy}</strong></>}
              {savedAt && <> le {fmtDateTime(savedAt)}</>}
            </span>
          </div>
          <button
            onClick={() => {
              if (confirm('Supprimer ce brouillon ? Les données saisies seront perdues.')) {
                deleteDraft()
              }
            }}
            disabled={isDeleting}
            className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--status-danger)' }}
          >
            <Trash2 size={11} />
            {isDeleting ? 'Suppression…' : 'Effacer le brouillon'}
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="rounded-xl px-5 py-4"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Lancer la paie
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Les modifications sont sauvegardées automatiquement et visibles par tous.
            </p>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <Input
              label="Date de paiement"
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
            />
            <Input
              label="Période"
              type="month"
              value={periodMonth}
              onChange={e => setPeriodMonth(e.target.value)}
            />
            <Button
              variant="secondary" size="sm"
              icon={<Save size={13} />}
              loading={isSaving}
              disabled={loading || Object.keys(rows).length === 0}
              onClick={handleSaveDraft}
            >
              Sauvegarder
            </Button>
            <Button
              variant="primary" size="sm"
              icon={<Play size={13} />}
              loading={isPending}
              disabled={!someChecked || loading}
              onClick={handleSubmit}
            >
              Lancer la paie ({includedEmps.length})
            </Button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm rounded px-3 py-2"
            style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}>
            {error}
          </p>
        )}
      </div>

      {/* ── Grille ── */}
      {loading ? (
        <p className="text-sm text-center py-16" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
      ) : activeEmployees.length === 0 ? (
        <p className="text-sm text-center py-16" style={{ color: 'var(--text-muted)' }}>Aucun employé actif.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">

              {/* En-tête */}
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '2px solid var(--border)' }}>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                      onChange={e => toggleAll(e.target.checked)}
                      style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  </th>
                  {[
                    { label: 'Employé',        align: 'left'  },
                    { label: 'Brut (F CFA)',   align: 'right' },
                    { label: 'Avance',         align: 'right' },
                    { label: 'Net à payer',    align: 'right', accent: true },
                    { label: 'Coût employeur', align: 'right' },
                  ].map((col, i) => (
                    <th key={i}
                      className="px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ textAlign: col.align as 'left' | 'right', color: col.accent ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {col.label}
                    </th>
                  ))}
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>

              {/* Corps */}
              <tbody>
                {activeEmployees.map((emp, i) => {
                  const row       = rows[emp.id]
                  if (!row) return null
                  const disabled  = !row.included
                  const gross     = parseFloat(row.gross)   || 0
                  const advance   = parseFloat(row.advance) || 0
                  const catPrimes = categoryPrimesMap[emp.category ?? -1] ?? { taxable: 0, nonTaxable: 0, settings: [] }
                  const calc      = gross > 0 && socialRates
                    ? computeRow(gross, advance, catPrimes, socialRates, emp.has_social_contributions)
                    : null
                  const hasPrimes = catPrimes.taxable > 0 || catPrimes.nonTaxable > 0
                  const rowBg     = i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent'

                  return (
                    <React.Fragment key={emp.id}>
                      <tr style={{
                        backgroundColor: rowBg,
                        borderBottom:    row.expanded ? 'none' : '1px solid var(--border)',
                        opacity:         disabled ? 0.35 : 1,
                        transition:      'opacity 0.15s',
                      }}>
                        {/* Checkbox */}
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={row.included}
                            onChange={e => setRow(emp.id, 'included', e.target.checked)}
                            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                        </td>

                        {/* Nom + badges */}
                        <td className="px-3 py-2.5 min-w-[160px]">
                          <span className="font-medium block" style={{ color: 'var(--text-primary)' }}>
                            {emp.name}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            {(emp.role || emp.category_name) && (
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {emp.role ?? emp.category_name}
                              </span>
                            )}
                            {hasPrimes && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{
                                color: 'var(--accent)',
                                backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                              }}>
                                {catPrimes.settings.length} prime{catPrimes.settings.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Brut */}
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end">
                            <input type="number" step="1" min="0"
                              value={row.gross} disabled={disabled}
                              onChange={e => setRow(emp.id, 'gross', e.target.value)}
                              className={CELL_INPUT} placeholder="0" />
                          </div>
                        </td>

                        {/* Avance */}
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col items-end">
                            <input type="number" step="1" min="0"
                              max={String(advancesMap[emp.id] ?? 0)}
                              value={row.advance} disabled={disabled}
                              onChange={e => setRow(emp.id, 'advance', e.target.value)}
                              className={CELL_INPUT} placeholder="0" />
                            {advancesMap[emp.id] > 0 && (
                              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                solde : {fmtXOF(advancesMap[emp.id])}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Net à payer */}
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-data font-semibold text-sm" style={{
                            color: calc ? (calc.netAPayer < 0 ? 'var(--status-danger)' : 'var(--accent)') : 'var(--text-muted)',
                          }}>
                            {calc ? fmtXOF(calc.netAPayer) : '—'}
                          </span>
                        </td>

                        {/* Coût employeur */}
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-data text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {calc ? fmtXOF(calc.totalCost) : '—'}
                          </span>
                        </td>

                        {/* Expand */}
                        <td className="px-2 py-2.5 text-center">
                          {calc && (
                            <button
                              onClick={() => setRow(emp.id, 'expanded', !row.expanded)}
                              className="rounded p-1 transition-all hover:opacity-70"
                              style={{ color: 'var(--text-muted)' }}
                              title={row.expanded ? 'Masquer le détail' : 'Voir le détail du calcul'}
                            >
                              {row.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Détail dépliable */}
                      {row.expanded && calc && socialRates && (
                        <tr style={{ backgroundColor: rowBg, borderBottom: '1px solid var(--border)' }}>
                          <td />
                          <td colSpan={COL_COUNT - 1} className="px-3 pb-3">
                            <RowBreakdown
                              emp={emp} gross={gross} advance={advance}
                              calc={calc} settings={catPrimes.settings} socialRates={socialRates}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>

              {/* Totaux */}
              {totals && (
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderTop: '2px solid var(--border)' }}>
                    <td />
                    <td className="px-3 py-3">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Total ({includedEmps.length} employé{includedEmps.length > 1 ? 's' : ''})
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-data font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {fmtXOF(totals.brut)}
                    </td>
                    <td />
                    <td className="px-3 py-3 text-right font-data font-bold text-sm" style={{ color: 'var(--accent)' }}>
                      {fmtXOF(totals.netAPayer)}
                    </td>
                    <td className="px-3 py-3 text-right font-data font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {fmtXOF(totals.coutTotal)}
                    </td>
                    <td />
                  </tr>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}>
                    <td />
                    <td className="px-3 py-2">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>dont cotisations salariales</span>
                    </td>
                    <td /><td />
                    <td className="px-3 py-2 text-right font-data text-xs" style={{ color: 'var(--text-muted)' }}>
                      −{fmtXOF(totals.cnssEmpTotal + totals.amuEmpTotal)}
                    </td>
                    <td className="px-3 py-2 text-right font-data text-xs" style={{ color: 'var(--text-muted)' }}>
                      +{fmtXOF(totals.cnssErTotal + totals.amuErTotal)} patronal
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
