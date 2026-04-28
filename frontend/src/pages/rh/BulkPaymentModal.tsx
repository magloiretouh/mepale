/**
 * MEPALE ERP — Modal paiement en masse (salaires / avances)
 * Permet de saisir les paiements de tous les employés actifs en une seule opération.
 */

import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { type Employee, type SocialRates, rhApi } from '@/services/rh'

// ─── Styles partagés ──────────────────────────────────────────────────────────

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] appearance-none transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)

const LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1'

const CELL_INPUT = cn(
  'w-28 h-8 bg-[--bg-surface] border border-[--border] rounded px-2',
  'text-sm text-right text-[--text-primary] transition-all duration-150',
  'focus:outline-none focus:border-[--accent]',
  'disabled:opacity-30 disabled:cursor-not-allowed',
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now       = new Date()
const todayStr  = now.toISOString().slice(0, 10)
const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

function fmtXOF(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return Math.round(n).toLocaleString('fr-FR') + ' F'
}

function calcNet(
  gross:   number,
  taxable: number,
  rates:   SocialRates,
  hasSocial: boolean,
): number {
  if (!hasSocial) return gross
  const base    = gross + taxable
  const cnssEmp = Math.round(base * parseFloat(rates.cnss_employee_rate) / 100)
  const amuEmp  = Math.round(base * parseFloat(rates.amu_employee_rate)  / 100)
  return gross - cnssEmp - amuEmp
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RowState {
  checked:  boolean
  gross:    string
  taxable:  string
  advance:  string
  amount:   string
}

interface BulkResult {
  created:       number
  conflicts:     number
  errors:        number
  total:         number
  conflictNames: string[]
  errorNames:    string[]
}

interface Props {
  isOpen:      boolean
  onClose:     () => void
  employees:   Employee[]
  socialRates: SocialRates
  onSuccess:   () => void
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function BulkPaymentModal({ isOpen, onClose, employees, socialRates, onSuccess }: Props) {
  const qc = useQueryClient()

  // ── État du formulaire ─────────────────────────────────────────────────────
  const [paymentDate, setPaymentDate] = useState(todayStr)
  const [periodMonth, setPeriodMonth] = useState(currMonth)
  const [type,        setType       ] = useState('salaire')
  const [rows,        setRows       ] = useState<Record<number, RowState>>({})
  const [error,       setError      ] = useState('')
  const [result,      setResult     ] = useState<BulkResult | null>(null)

  const activeEmployees = useMemo(() => employees.filter(e => e.is_active), [employees])

  // ── Initialisation des lignes ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      // Reset au prochain open
      setPaymentDate(todayStr)
      setPeriodMonth(currMonth)
      setType('salaire')
      setError('')
      setResult(null)
      return
    }
    const init: Record<number, RowState> = {}
    for (const emp of activeEmployees) {
      init[emp.id] = {
        checked: true,
        gross:   emp.monthly_salary
          ? String(Math.round(parseFloat(emp.monthly_salary)))
          : '',
        taxable: '',
        advance: '',
        amount:  '',
      }
    }
    setRows(init)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers de mutation d'état ─────────────────────────────────────────────
  const setRow = (id: number, field: keyof RowState, val: string | boolean) =>
    setRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))

  const allChecked    = activeEmployees.length > 0
    && activeEmployees.every(e => rows[e.id]?.checked)
  const someChecked   = activeEmployees.some(e => rows[e.id]?.checked)
  const checkedEmps   = activeEmployees.filter(e => rows[e.id]?.checked)

  // ── Mutation ───────────────────────────────────────────────────────────────
  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => {
      const payments = checkedEmps.map(emp => {
        const row = rows[emp.id]
        if (type === 'salaire') {
          return {
            employee_id:           emp.id,
            gross_amount:          parseFloat(row.gross)   || undefined,
            taxable_primes_amount: parseFloat(row.taxable) || undefined,
            advance_deducted:      parseFloat(row.advance) || undefined,
          }
        }
        return {
          employee_id: emp.id,
          amount:      parseFloat(row.amount) || undefined,
        }
      })
      return rhApi.bulkPayments({
        payment_date: paymentDate,
        period_month: periodMonth || undefined,
        type,
        payments,
      })
    },
    onSuccess: res => {
      const data    = res.data
      const empMap  = Object.fromEntries(employees.map(e => [e.id, e.name]))
      const bulkRes: BulkResult = {
        created:       data.summary.created,
        conflicts:     data.summary.conflicts ?? 0,
        errors:        data.summary.errors,
        total:         data.summary.total,
        conflictNames: (data.conflicts ?? []).map((c: { employee_id: number }) =>
          empMap[c.employee_id] ?? `#${c.employee_id}`),
        errorNames:    data.errors.map((e: { employee_id: number }) =>
          empMap[e.employee_id] ?? `#${e.employee_id}`),
      }
      setResult(bulkRes)
      if (bulkRes.created > 0) {
        toast.success(`${bulkRes.created} paiement(s) enregistré(s).`)
        qc.invalidateQueries({ queryKey: ['rh-payments'] })
        onSuccess()
      }
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail ?? 'Erreur lors du traitement.')
    },
  })

  const handleSubmit = () => {
    if (!paymentDate)         return setError('La date de paiement est requise.')
    if (checkedEmps.length === 0) return setError('Sélectionnez au moins un employé.')
    if (type === 'salaire') {
      const missing = checkedEmps.filter(e => !rows[e.id]?.gross || parseFloat(rows[e.id].gross) <= 0)
      if (missing.length)     return setError(`Brut manquant : ${missing.map(e => e.name).join(', ')}`)
    } else {
      const missing = checkedEmps.filter(e => !rows[e.id]?.amount || parseFloat(rows[e.id].amount) <= 0)
      if (missing.length)     return setError(`Montant manquant : ${missing.map(e => e.name).join(', ')}`)
    }
    setError('')
    submit()
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = result ? (
    <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
  ) : (
    <>
      <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
      <Button
        variant="primary"
        size="sm"
        loading={isPending}
        onClick={handleSubmit}
        disabled={!someChecked}
      >
        Enregistrer ({checkedEmps.length})
      </Button>
    </>
  )

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={result ? 'Résultat du traitement' : 'Paiement en masse'}
      size="xl"
      footer={footer}
    >
      {/* ══ Vue résultat ════════════════════════════════════════════════════ */}
      {result ? (
        <div className="flex flex-col gap-4">
          {/* Compteurs */}
          <div className="grid grid-cols-3 gap-3">
            <div
              className="rounded-lg px-4 py-4 text-center"
              style={{ backgroundColor: 'var(--status-success-bg)', border: '1px solid var(--status-success)' }}
            >
              <div
                className="text-3xl font-bold font-data"
                style={{ color: 'var(--status-success)' }}
              >
                {result.created}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Créés
              </div>
            </div>
            <div
              className="rounded-lg px-4 py-4 text-center"
              style={{ backgroundColor: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)' }}
            >
              <div
                className="text-3xl font-bold font-data"
                style={{ color: 'var(--status-warning)' }}
              >
                {result.conflicts}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Doublons ignorés
              </div>
            </div>
            <div
              className="rounded-lg px-4 py-4 text-center"
              style={{ backgroundColor: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)' }}
            >
              <div
                className="text-3xl font-bold font-data"
                style={{ color: 'var(--status-danger)' }}
              >
                {result.errors}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Erreurs
              </div>
            </div>
          </div>

          {result.conflictNames.length > 0 && (
            <div
              className="rounded px-4 py-3"
              style={{ backgroundColor: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--status-warning)' }}>
                Doublons — salaire déjà existant pour cette période :
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {result.conflictNames.join(', ')}
              </p>
            </div>
          )}

          {result.errorNames.length > 0 && (
            <div
              className="rounded px-4 py-3"
              style={{ backgroundColor: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--status-danger)' }}>
                Erreurs :
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {result.errorNames.join(', ')}
              </p>
            </div>
          )}

          {result.created === result.total && (
            <p className="text-sm text-center" style={{ color: 'var(--status-success)' }}>
              Tous les paiements ont été traités avec succès.
            </p>
          )}
        </div>

      ) : (
        /* ══ Formulaire ════════════════════════════════════════════════════ */
        <div className="flex flex-col gap-4">

          {/* En-tête : date, période, type */}
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Date de paiement *"
              type="date"
              value={paymentDate}
              onChange={e => { setPaymentDate(e.target.value); setError('') }}
            />
            <Input
              label="Période (AAAA-MM)"
              type="month"
              value={periodMonth}
              onChange={e => { setPeriodMonth(e.target.value); setError('') }}
            />
            <div>
              <label className={LABEL}>Type *</label>
              <select
                className={SELECT_CLASS}
                value={type}
                onChange={e => { setType(e.target.value); setError('') }}
              >
                <option value="salaire">Salaire</option>
                <option value="avance">Avance</option>
              </select>
            </div>
          </div>

          {/* Info */}
          {activeEmployees.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
              Aucun employé actif.
            </p>
          ) : (
            <div
              className="rounded border overflow-hidden"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderBottom:    '1px solid var(--border)',
                      }}
                    >
                      {/* Checkbox tout sélectionner */}
                      <th className="w-10 px-3 py-2.5 text-left">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                          onChange={e =>
                            setRows(prev => {
                              const next = { ...prev }
                              for (const emp of activeEmployees) {
                                next[emp.id] = { ...next[emp.id], checked: e.target.checked }
                              }
                              return next
                            })
                          }
                          className="accent-[--accent] cursor-pointer"
                        />
                      </th>

                      <th
                        className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Employé
                      </th>

                      {type === 'salaire' ? (
                        <>
                          <th
                            className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Brut (F CFA)
                          </th>
                          <th
                            className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Primes imp.
                          </th>
                          <th
                            className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Déd. avance
                          </th>
                          <th
                            className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--accent)' }}
                          >
                            Net estimé
                          </th>
                        </>
                      ) : (
                        <th
                          className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Montant (F CFA)
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {activeEmployees.map((emp, i) => {
                      const row      = rows[emp.id]
                      if (!row) return null
                      const disabled = !row.checked
                      const gross    = parseFloat(row.gross)   || 0
                      const taxable  = parseFloat(row.taxable) || 0
                      const advance  = parseFloat(row.advance) || 0
                      const netEst   = type === 'salaire' && gross > 0
                        ? calcNet(gross, taxable, socialRates, emp.has_social_contributions) - advance
                        : null

                      return (
                        <tr
                          key={emp.id}
                          style={{
                            backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent',
                            borderBottom:    '1px solid var(--border)',
                            opacity:         disabled ? 0.4 : 1,
                            transition:      'opacity 0.15s',
                          }}
                        >
                          {/* Checkbox ligne */}
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={row.checked}
                              onChange={e => setRow(emp.id, 'checked', e.target.checked)}
                              className="accent-[--accent] cursor-pointer"
                            />
                          </td>

                          {/* Nom + type contrat */}
                          <td className="px-3 py-2 min-w-[160px]">
                            <span
                              className="font-medium block"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {emp.name}
                            </span>
                            {(emp.role || emp.contract_type_display) && (
                              <span
                                className="text-xs block"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {emp.role ?? emp.contract_type_display}
                              </span>
                            )}
                          </td>

                          {type === 'salaire' ? (
                            <>
                              {/* Brut */}
                              <td className="px-3 py-2">
                                <input
                                  type="number" step="1" min="0"
                                  value={row.gross}
                                  disabled={disabled}
                                  onChange={e => setRow(emp.id, 'gross', e.target.value)}
                                  className={CELL_INPUT}
                                  placeholder="0"
                                />
                              </td>
                              {/* Primes imposables */}
                              <td className="px-3 py-2">
                                <input
                                  type="number" step="1" min="0"
                                  value={row.taxable}
                                  disabled={disabled}
                                  onChange={e => setRow(emp.id, 'taxable', e.target.value)}
                                  className={CELL_INPUT}
                                  placeholder="0"
                                />
                              </td>
                              {/* Avance à déduire */}
                              <td className="px-3 py-2">
                                <input
                                  type="number" step="1" min="0"
                                  value={row.advance}
                                  disabled={disabled}
                                  onChange={e => setRow(emp.id, 'advance', e.target.value)}
                                  className={CELL_INPUT}
                                  placeholder="0"
                                />
                              </td>
                              {/* Net estimé */}
                              <td className="px-3 py-2 text-right">
                                <span
                                  className="font-data font-semibold text-sm"
                                  style={{
                                    color: netEst !== null
                                      ? (netEst < 0 ? 'var(--status-danger)' : 'var(--accent)')
                                      : 'var(--text-muted)',
                                  }}
                                >
                                  {netEst !== null ? fmtXOF(netEst) : '—'}
                                </span>
                              </td>
                            </>
                          ) : (
                            /* Avance — montant seul */
                            <td className="px-3 py-2">
                              <input
                                type="number" step="1" min="0"
                                value={row.amount}
                                disabled={disabled}
                                onChange={e => setRow(emp.id, 'amount', e.target.value)}
                                className={CELL_INPUT}
                                placeholder="0"
                              />
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Résumé */}
          {type === 'salaire' && checkedEmps.length > 0 && (() => {
            const totalBrut = checkedEmps.reduce((acc, emp) => {
              const row = rows[emp.id]
              return acc + (parseFloat(row?.gross) || 0)
            }, 0)
            const totalNet = checkedEmps.reduce((acc, emp) => {
              const row     = rows[emp.id]
              const gross   = parseFloat(row?.gross)   || 0
              const taxable = parseFloat(row?.taxable) || 0
              const advance = parseFloat(row?.advance) || 0
              if (!gross) return acc
              return acc + calcNet(gross, taxable, socialRates, emp.has_social_contributions) - advance
            }, 0)
            if (!totalBrut) return null
            return (
              <div
                className="flex items-center justify-between rounded px-4 py-2.5 text-sm"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>
                  Total brut ({checkedEmps.length} emp.) :
                </span>
                <span className="font-data font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {fmtXOF(totalBrut)}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>Total net estimé :</span>
                <span
                  className="font-data font-semibold"
                  style={{ color: 'var(--accent)' }}
                >
                  {fmtXOF(totalNet)}
                </span>
              </div>
            )
          })()}

          {/* Erreur */}
          {error && (
            <p
              className="text-sm rounded px-3 py-2"
              style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
