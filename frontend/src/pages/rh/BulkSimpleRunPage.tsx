/**
 * MEPALE ERP — Paiement en masse (Prime / Avance / Autre)
 * Grille légère sans calculs CNSS/AMU.
 */

import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Play, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { type Employee, type PrimeType, rhApi } from '@/services/rh'

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

const SELECT_CLASS = cn(
  'h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8',
  'text-[--text-primary] appearance-none transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
)

const CELL_INPUT = cn(
  'w-36 h-8 bg-[--bg-surface] border border-[--border] rounded px-2',
  'text-sm text-right text-[--text-primary] transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:shadow-[0_0_0_2px_var(--accent-dim)]',
  'disabled:opacity-30 disabled:cursor-not-allowed',
  'placeholder:text-[--text-muted]',
)

// ─── Config par type ──────────────────────────────────────────────────────────

type PayType = 'prime' | 'avance' | 'autre'

const TYPE_CONFIG: Record<PayType, {
  label:      string
  color:      string
  hasPeriod:  boolean
  hasPrime:   boolean
  hasLabel:   boolean
}> = {
  prime:  { label: 'Prime',  color: 'var(--accent)',          hasPeriod: true,  hasPrime: true,  hasLabel: true  },
  avance: { label: 'Avance', color: 'var(--status-warning)',  hasPeriod: false, hasPrime: false, hasLabel: false },
  autre:  { label: 'Autre',  color: 'var(--text-secondary)',  hasPeriod: true,  hasPrime: false, hasLabel: true  },
}

// ─── État par ligne ───────────────────────────────────────────────────────────

interface RowState {
  included: boolean
  amount:   string
  label:    string
}

// ─── Résultat ─────────────────────────────────────────────────────────────────

interface RunResult {
  created:       number
  conflicts:     number
  errors:        number
  conflictNames: string[]
  errorNames:    string[]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BulkSimpleRunPage() {
  const { type }  = useParams<{ type: string }>()
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const payType   = (type ?? 'prime') as PayType
  const config    = TYPE_CONFIG[payType] ?? TYPE_CONFIG.prime

  // ── State ────────────────────────────────────────────────────────────────────

  const [paymentDate,   setPaymentDate  ] = useState(todayStr)
  const [periodMonth,   setPeriodMonth  ] = useState(currentMonth)
  const [primeTypeId,   setPrimeTypeId  ] = useState('')
  const [globalAmount,  setGlobalAmount ] = useState('')
  const [globalLabel,   setGlobalLabel  ] = useState('')
  const [rows,          setRows         ] = useState<Record<number, RowState>>({})
  const [result,        setResult       ] = useState<RunResult | null>(null)
  const [error,         setError        ] = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ['rh-employees-active'],
    queryFn:  () => rhApi.listEmployees({ active: 1 }).then(r => r.data),
    select:   (data: Employee[]) => data.filter(e => e.is_active),
  })

  const { data: primeTypes = [] } = useQuery({
    queryKey: ['rh-prime-types-admin'],
    queryFn:  () => rhApi.adminListPrimeTypes().then(r => r.data),
    enabled:  payType === 'prime',
  })

  // ── Init lignes quand les employés arrivent ───────────────────────────────────

  const initializedIds = useMemo(() => new Set(Object.keys(rows).map(Number)), [rows])
  useMemo(() => {
    if (employees.length === 0) return
    setRows(prev => {
      const next = { ...prev }
      for (const emp of employees) {
        if (!next[emp.id]) {
          next[emp.id] = { included: true, amount: '', label: '' }
        }
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.map(e => e.id).join(',')])

  // ── Dérivés ──────────────────────────────────────────────────────────────────

  const activeEmployees = employees
  const includedEmps    = activeEmployees.filter(e => rows[e.id]?.included)
  const allChecked      = activeEmployees.length > 0 && activeEmployees.every(e => rows[e.id]?.included)
  const someChecked     = activeEmployees.some(e => rows[e.id]?.included)

  const totalAmount = includedEmps.reduce((s, e) => {
    const a = parseFloat(rows[e.id]?.amount || '0') || 0
    return s + a
  }, 0)

  // ── Helpers lignes ────────────────────────────────────────────────────────────

  const setRow = (id: number, field: keyof RowState, val: string | boolean) =>
    setRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))

  const toggleAll = (checked: boolean) =>
    setRows(prev => {
      const next = { ...prev }
      for (const emp of activeEmployees) next[emp.id] = { ...next[emp.id], included: checked }
      return next
    })

  const applyGlobalAmount = () => {
    if (!globalAmount) return
    setRows(prev => {
      const next = { ...prev }
      for (const emp of includedEmps) next[emp.id] = { ...next[emp.id], amount: globalAmount }
      return next
    })
  }

  const applyGlobalLabel = () => {
    if (!globalLabel) return
    setRows(prev => {
      const next = { ...prev }
      for (const emp of includedEmps) next[emp.id] = { ...next[emp.id], label: globalLabel }
      return next
    })
  }

  // ── Mutation ──────────────────────────────────────────────────────────────────

  const { mutate: run, isPending } = useMutation({
    mutationFn: () => {
      const payments = includedEmps
        .filter(e => parseFloat(rows[e.id]?.amount) > 0)
        .map(emp => ({
          employee_id:    emp.id,
          amount:         parseFloat(rows[emp.id].amount),
          label:          rows[emp.id].label.trim() || undefined,
          prime_type_id:  (payType === 'prime' && primeTypeId) ? parseInt(primeTypeId) : undefined,
        }))
      return rhApi.bulkPayments({
        payment_date: paymentDate,
        period_month: config.hasPeriod ? periodMonth : undefined,
        type:         payType,
        payments,
      })
    },
    onSuccess: res => {
      const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]))
      setResult({
        created:       res.data.summary.created,
        conflicts:     res.data.summary.conflicts ?? 0,
        errors:        res.data.summary.errors,
        conflictNames: (res.data.conflicts ?? []).map((c: { employee_id: number }) => empMap[c.employee_id] ?? `#${c.employee_id}`),
        errorNames:    res.data.errors.map((e: { employee_id: number }) => empMap[e.employee_id] ?? `#${e.employee_id}`),
      })
      if (res.data.summary.created > 0) {
        toast.success(`${res.data.summary.created} paiement(s) enregistré(s).`)
        qc.invalidateQueries({ queryKey: ['rh-payments'] })
      }
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail ?? 'Erreur lors du traitement.')
    },
  })

  const handleSubmit = () => {
    if (!paymentDate) return setError('La date de paiement est requise.')
    if (includedEmps.length === 0) return setError('Sélectionnez au moins un employé.')
    const missing = includedEmps.filter(e => !rows[e.id]?.amount || parseFloat(rows[e.id].amount) <= 0)
    if (missing.length) return setError(`Montant manquant : ${missing.map(e => e.name).join(', ')}`)
    setError('')
    run()
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
            Résultat — {config.label}{config.hasPeriod ? ` ${fmtMonth(periodMonth)}` : ''}
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
                  Paiement déjà enregistré :
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
              <CheckCircle2 size={16} /> Tous les paiements ont été traités avec succès.
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

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Navigation */}
      <button onClick={() => navigate('/rh/employes')}
        className="flex items-center gap-1.5 text-xs font-medium hover:opacity-70 transition-opacity"
        style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={14} /> Retour aux employés
      </button>

      {/* Header */}
      <div className="rounded-xl px-5 py-4"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {config.label} en masse
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Saisissez les montants pour chaque employé, ou utilisez "Appliquer à tous".
            </p>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <Input
              label="Date de paiement"
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
            />
            {config.hasPeriod && (
              <Input
                label="Période"
                type="month"
                value={periodMonth}
                onChange={e => setPeriodMonth(e.target.value)}
              />
            )}
            {config.hasPrime && (
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1"
                  style={{ color: 'var(--text-secondary)' }}>
                  Type de prime
                </label>
                <select
                  className={SELECT_CLASS}
                  style={{ minWidth: 180 }}
                  value={primeTypeId}
                  onChange={e => setPrimeTypeId(e.target.value)}
                >
                  <option value="">— Non spécifié —</option>
                  {(primeTypes as PrimeType[]).map(pt => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}{pt.is_taxable ? ' (imposable)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button
              variant="primary" size="sm"
              icon={<Play size={13} />}
              loading={isPending}
              disabled={!someChecked || empLoading}
              onClick={handleSubmit}
            >
              Enregistrer ({includedEmps.length})
            </Button>
          </div>
        </div>

        {/* Barre "Appliquer à tous" */}
        <div className="flex items-end gap-3 mt-4 pt-4 flex-wrap"
          style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-end gap-2">
            <Input
              label="Montant commun (F CFA)"
              type="number"
              step="1"
              min="0"
              value={globalAmount}
              onChange={e => setGlobalAmount(e.target.value)}
              placeholder="0"
            />
            <Button variant="secondary" size="sm" onClick={applyGlobalAmount}
              disabled={!globalAmount || includedEmps.length === 0}>
              Appliquer à tous
            </Button>
          </div>
          {config.hasLabel && (
            <div className="flex items-end gap-2">
              <Input
                label="Libellé commun"
                value={globalLabel}
                onChange={e => setGlobalLabel(e.target.value)}
                placeholder="Description…"
              />
              <Button variant="ghost" size="sm" onClick={applyGlobalLabel}
                disabled={!globalLabel || includedEmps.length === 0}>
                Appliquer
              </Button>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm rounded px-3 py-2"
            style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}>
            {error}
          </p>
        )}
      </div>

      {/* Totaux rapides */}
      {includedEmps.length > 0 && totalAmount > 0 && (
        <div className="flex items-center gap-4 px-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {includedEmps.length} employé{includedEmps.length > 1 ? 's' : ''} sélectionné{includedEmps.length > 1 ? 's' : ''}
          </span>
          <span className="text-xs font-semibold font-data" style={{ color: config.color }}>
            Total : {fmtXOF(totalAmount)}
          </span>
        </div>
      )}

      {/* Grille */}
      {empLoading ? (
        <p className="text-sm text-center py-16" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
      ) : activeEmployees.length === 0 ? (
        <p className="text-sm text-center py-16" style={{ color: 'var(--text-muted)' }}>Aucun employé actif.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '2px solid var(--border)' }}>
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                    onChange={e => toggleAll(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-left"
                  style={{ color: 'var(--text-secondary)' }}>
                  Employé
                </th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-right"
                  style={{ color: config.color }}>
                  Montant (F CFA)
                </th>
                {config.hasLabel && (
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-left"
                    style={{ color: 'var(--text-secondary)' }}>
                    Libellé
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {activeEmployees.map((emp, i) => {
                const row      = rows[emp.id]
                if (!row) return null
                const disabled = !row.included
                return (
                  <tr key={emp.id} style={{
                    backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent',
                    borderBottom:    '1px solid var(--border)',
                    opacity:         disabled ? 0.35 : 1,
                    transition:      'opacity 0.15s',
                  }}>
                    {/* Checkbox */}
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={row.included}
                        onChange={e => setRow(emp.id, 'included', e.target.checked)}
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    </td>

                    {/* Nom */}
                    <td className="px-3 py-2.5 min-w-[160px]">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</span>
                      {(emp.role || emp.category_name) && (
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {emp.role ?? emp.category_name}
                        </span>
                      )}
                    </td>

                    {/* Montant */}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end">
                        <input
                          type="number" step="1" min="0"
                          value={row.amount}
                          disabled={disabled}
                          onChange={e => setRow(emp.id, 'amount', e.target.value)}
                          className={CELL_INPUT}
                          placeholder="0"
                        />
                      </div>
                    </td>

                    {/* Libellé */}
                    {config.hasLabel && (
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={row.label}
                          disabled={disabled}
                          onChange={e => setRow(emp.id, 'label', e.target.value)}
                          placeholder="Optionnel…"
                          className={cn(
                            'w-full h-8 bg-[--bg-surface] border border-[--border] rounded px-2',
                            'text-sm text-[--text-primary] transition-all duration-150',
                            'focus:outline-none focus:border-[--accent]',
                            'disabled:opacity-30 disabled:cursor-not-allowed',
                            'placeholder:text-[--text-muted]',
                          )}
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>

            {/* Pied de tableau */}
            {totalAmount > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: 'var(--bg-elevated)', borderTop: '2px solid var(--border)' }}>
                  <td />
                  <td className="px-3 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}>
                      Total ({includedEmps.length} employé{includedEmps.length > 1 ? 's' : ''})
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-data font-bold text-sm"
                    style={{ color: config.color }}>
                    {fmtXOF(totalAmount)}
                  </td>
                  {config.hasLabel && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
