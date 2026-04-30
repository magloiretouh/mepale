/**
 * MEPALE ERP — Modal paiement individuel
 */

import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { type Employee, type SocialRates, type PrimeType, type EmployeePrime, rhApi } from '@/services/rh'

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] appearance-none transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)
const LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1'

const fmtXOF = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return Math.round(num).toLocaleString('fr-FR') + ' F CFA'
}

// ─── Calcul complet ────────────────────────────────────────────────────────────

interface CalcResult {
  fiscalBase:   number
  cnssEmp:      number
  amuEmp:       number
  netComptable: number
  netAPayer:    number
  cnssEr:       number
  amuEr:        number
  totalCost:    number
}

function calcAll(
  gross: number,
  taxablePrimes: number,
  nonTaxablePrimes: number,
  advance: number,
  rates: SocialRates,
  hasSocial: boolean,
): CalcResult {
  const fiscalBase   = gross + taxablePrimes
  const cnssEmp      = hasSocial ? Math.round(fiscalBase * parseFloat(rates.cnss_employee_rate) / 100) : 0
  const amuEmp       = hasSocial ? Math.round(fiscalBase * parseFloat(rates.amu_employee_rate)  / 100) : 0
  const netComptable = fiscalBase - cnssEmp - amuEmp
  const cnssEr       = hasSocial ? Math.round(fiscalBase * parseFloat(rates.cnss_employer_rate) / 100) : 0
  const amuEr        = hasSocial ? Math.round(fiscalBase * parseFloat(rates.amu_employer_rate)  / 100) : 0
  return {
    fiscalBase,
    cnssEmp,
    amuEmp,
    netComptable,
    netAPayer: netComptable + nonTaxablePrimes - advance,
    cnssEr,
    amuEr,
    totalCost: gross + taxablePrimes + nonTaxablePrimes + cnssEr + amuEr,
  }
}

// ─── Ligne du tableau de calcul ────────────────────────────────────────────────

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

// ─── Constantes ────────────────────────────────────────────────────────────────

const now          = new Date()
const todayStr     = now.toISOString().slice(0, 10)
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

interface Props {
  isOpen:      boolean
  onClose:     () => void
  employees:   Employee[]
  socialRates: SocialRates
  onSuccess:   () => void
}

export function PaymentModal({ isOpen, onClose, employees, socialRates, onSuccess }: Props) {
  const qc = useQueryClient()

  const [employeeId,      setEmployeeId     ] = useState('')
  const [paymentDate,     setPaymentDate    ] = useState(todayStr)
  const [type,            setType           ] = useState('salaire')
  const [periodMonth,     setPeriodMonth    ] = useState(currentMonth)
  const [grossAmount,     setGrossAmount    ] = useState('')
  const [advanceDeducted, setAdvanceDeducted] = useState('')
  const [amount,          setAmount         ] = useState('')
  const [label,           setLabel          ] = useState('')
  const [primeTypeId,     setPrimeTypeId    ] = useState('')
  const [error,           setError          ] = useState('')
  const [checkedPrimes,   setCheckedPrimes  ] = useState<Set<number>>(new Set())

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: primeTypes = [] } = useQuery({
    queryKey: ['rh-prime-types-admin'],
    queryFn:  () => rhApi.adminListPrimeTypes().then(r => r.data),
    enabled:  isOpen && type === 'prime',
  })

  const { data: pendingAdv } = useQuery({
    queryKey: ['rh-pending-advances', employeeId],
    queryFn:  () => rhApi.getPendingAdvances(parseInt(employeeId)).then(r => r.data),
    enabled:  isOpen && !!employeeId && type === 'salaire',
  })

  const { data: employeePrimes = [] } = useQuery({
    queryKey: ['rh-employee-primes', employeeId],
    queryFn:  () => rhApi.getEmployeePrimes(parseInt(employeeId)).then(r => r.data),
    enabled:  isOpen && !!employeeId && type === 'salaire',
  })

  // ── Dérivés ─────────────────────────────────────────────────────────────────

  const selectedEmployee = useMemo(
    () => employees.find(e => String(e.id) === employeeId) ?? null,
    [employees, employeeId],
  )

  const selectedPrimes        = employeePrimes.filter(p => checkedPrimes.has(p.prime_type_id))
  const taxablePrimesList     = selectedPrimes.filter(p => p.is_taxable)
  const nonTaxablePrimesList  = selectedPrimes.filter(p => !p.is_taxable)
  const taxablePrimesTotal    = taxablePrimesList.reduce((s, p) => s + parseFloat(p.calculated_amount), 0)
  const nonTaxablePrimesTotal = nonTaxablePrimesList.reduce((s, p) => s + parseFloat(p.calculated_amount), 0)
  const totalPrimesAmount     = taxablePrimesTotal + nonTaxablePrimesTotal

  const calcResult = useMemo((): CalcResult | null => {
    if (type !== 'salaire' || !grossAmount || !selectedEmployee) return null
    const gross   = parseFloat(grossAmount) || 0
    const advance = parseFloat(advanceDeducted) || 0
    return calcAll(gross, taxablePrimesTotal, nonTaxablePrimesTotal, advance, socialRates, selectedEmployee.has_social_contributions)
  }, [type, grossAmount, advanceDeducted, taxablePrimesTotal, nonTaxablePrimesTotal, selectedEmployee, socialRates])

  const allChecked = employeePrimes.length > 0 && employeePrimes.every(p => checkedPrimes.has(p.prime_type_id))

  // ── Effets ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      if (employees.length === 1) setEmployeeId(String(employees[0].id))
    } else {
      setEmployeeId(''); setPaymentDate(todayStr); setType('salaire')
      setPeriodMonth(currentMonth); setGrossAmount('')
      setAdvanceDeducted(''); setAmount(''); setLabel(''); setPrimeTypeId('')
      setError(''); setCheckedPrimes(new Set())
    }
  }, [isOpen])

  // Cocher toutes les primes par défaut dès qu'elles chargent
  useEffect(() => {
    if (employeePrimes.length > 0) {
      setCheckedPrimes(new Set(employeePrimes.map(p => p.prime_type_id)))
    }
  }, [employeePrimes])

  // Pré-remplir l'avance avec le solde en attente
  useEffect(() => {
    if (pendingAdv && pendingAdv.pending_amount > 0) {
      setAdvanceDeducted(String(pendingAdv.pending_amount))
    }
  }, [pendingAdv])

  // ── Mutation ─────────────────────────────────────────────────────────────────

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => {
      const base = {
        employee_id:  parseInt(employeeId),
        payment_date: paymentDate,
        type,
        label: label.trim() || undefined,
      }
      if (type === 'salaire') {
        return rhApi.createPayment({
          ...base,
          period_month:          periodMonth || undefined,
          gross_amount:          parseFloat(grossAmount),
          taxable_primes_amount: taxablePrimesTotal || undefined,
          advance_deducted:      parseFloat(advanceDeducted) || undefined,
        })
      } else if (type === 'avance') {
        return rhApi.createPayment({ ...base, amount: parseFloat(amount) })
      } else {
        return rhApi.createPayment({
          ...base,
          period_month:  periodMonth || undefined,
          amount:        parseFloat(amount),
          prime_type_id: primeTypeId ? parseInt(primeTypeId) : undefined,
        })
      }
    },
    onSuccess: () => {
      toast.success('Paiement enregistré.')
      qc.invalidateQueries({ queryKey: ['rh-payments'] })
      qc.invalidateQueries({ queryKey: ['rh-pending-advances'] })
      onSuccess()
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail ?? 'Erreur lors de la création.')
    },
  })

  const handleSubmit = () => {
    if (!employeeId) return setError('Sélectionnez un employé.')
    if (!paymentDate) return setError('La date de paiement est requise.')
    if (type === 'salaire' && !grossAmount) return setError('Le salaire brut est requis.')
    if (type !== 'salaire' && !amount) return setError('Le montant est requis.')
    if (type === 'salaire' && advanceDeducted && pendingAdv) {
      if (parseFloat(advanceDeducted) > pendingAdv.pending_amount) {
        return setError(
          `L'avance à déduire (${fmtXOF(advanceDeducted)}) dépasse le solde en attente (${fmtXOF(pendingAdv.pending_amount)}).`,
        )
      }
    }
    setError('')
    save()
  }

  const togglePrime = (id: number) => {
    setCheckedPrimes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nouveau paiement"
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Employé */}
        <div>
          <label className={LABEL}>Employé *</label>
          <select
            className={SELECT_CLASS}
            value={employeeId}
            onChange={e => { setEmployeeId(e.target.value); setError('') }}
          >
            <option value="">— Sélectionner —</option>
            {employees.filter(e => e.is_active).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        {/* Date + Type */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date de paiement *"
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
          />
          <div>
            <label className={LABEL}>Type *</label>
            <select
              className={SELECT_CLASS}
              value={type}
              onChange={e => { setType(e.target.value); setError('') }}
            >
              <option value="salaire">Salaire</option>
              <option value="prime">Prime</option>
              <option value="avance">Avance</option>
              <option value="autre">Autre</option>
            </select>
          </div>
        </div>

        {/* Période (sauf avance) */}
        {type !== 'avance' && (
          <Input
            label="Période"
            type="month"
            value={periodMonth}
            onChange={e => setPeriodMonth(e.target.value)}
          />
        )}

        {/* ── Salaire ─────────────────────────────────────────────────────────── */}
        {type === 'salaire' && (
          <>
            {/* Salaire brut */}
            <div>
              <Input
                label="Salaire brut (F CFA) *"
                type="number"
                step="1"
                min="0"
                value={grossAmount}
                onChange={e => setGrossAmount(e.target.value)}
                placeholder="0"
              />
              {selectedEmployee?.monthly_salary && (
                <button
                  type="button"
                  onClick={() =>
                    setGrossAmount(String(Math.round(parseFloat(selectedEmployee.monthly_salary!))))
                  }
                  className="mt-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: 'var(--accent)' }}
                >
                  ↑ Utiliser le salaire mensuel ({fmtXOF(selectedEmployee.monthly_salary)})
                </button>
              )}
            </div>

            {/* Primes de catégorie */}
            {employeePrimes.length > 0 && (
              <div
                className="rounded-lg px-3 py-3"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Primes de catégorie
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ color: 'var(--accent)' }}
                    onClick={() =>
                      setCheckedPrimes(
                        allChecked ? new Set() : new Set(employeePrimes.map(p => p.prime_type_id)),
                      )
                    }
                  >
                    {allChecked ? 'Tout décocher' : 'Tout cocher'}
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  {employeePrimes.map((p: EmployeePrime) => (
                    <label
                      key={p.prime_type_id}
                      className="flex items-center justify-between gap-3 py-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checkedPrimes.has(p.prime_type_id)}
                          onChange={() => togglePrime(p.prime_type_id)}
                          className="rounded"
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                          {p.prime_type_name}
                        </span>
                        {p.is_taxable && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{
                              color:           'var(--status-warning)',
                              backgroundColor: 'color-mix(in srgb, var(--status-warning) 12%, transparent)',
                            }}
                          >
                            imposable
                          </span>
                        )}
                      </div>
                      <span
                        className="font-data text-sm flex-shrink-0"
                        style={{
                          color: checkedPrimes.has(p.prime_type_id)
                            ? 'var(--text-primary)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {fmtXOF(p.calculated_amount)}
                      </span>
                    </label>
                  ))}
                </div>

                <div
                  className="flex justify-between pt-2 mt-1"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Total primes
                  </span>
                  <span className="font-data text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                    {fmtXOF(totalPrimesAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* Avance en attente */}
            {selectedEmployee && pendingAdv && (
              <div>
                <Input
                  label={
                    pendingAdv.pending_amount > 0
                      ? `Avance à déduire — solde en attente : ${fmtXOF(pendingAdv.pending_amount)}`
                      : 'Avance à déduire (aucune avance en attente)'
                  }
                  type="number"
                  step="1"
                  min="0"
                  max={String(pendingAdv.pending_amount)}
                  value={advanceDeducted}
                  onChange={e => setAdvanceDeducted(e.target.value)}
                  placeholder="0"
                  disabled={pendingAdv.pending_amount === 0}
                />
                {advanceDeducted && parseFloat(advanceDeducted) > pendingAdv.pending_amount && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--status-danger)' }}>
                    Dépasse le solde en attente ({fmtXOF(pendingAdv.pending_amount)})
                  </p>
                )}
              </div>
            )}

            {/* Tableau de calcul */}
            {calcResult && (
              <div
                className="rounded-lg px-3 py-3 space-y-0.5"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                {/* Brut */}
                <CalcRow label="Salaire brut" value={fmtXOF(grossAmount)} />

                {/* Primes imposables */}
                {taxablePrimesList.map(p => (
                  <CalcRow
                    key={p.prime_type_id}
                    label={p.prime_type_name}
                    sub="(imposable)"
                    value={`+${fmtXOF(p.calculated_amount)}`}
                    accent
                  />
                ))}

                {/* CNSS / AMU salarié calculés sur la base imposable */}
                {selectedEmployee?.has_social_contributions ? (
                  <>
                    <CalcRow
                      label="CNSS salarié"
                      sub={`(${socialRates.cnss_employee_rate}%)`}
                      value={`−${fmtXOF(calcResult.cnssEmp)}`}
                      separator
                    />
                    <CalcRow
                      label="AMU salarié"
                      sub={`(${socialRates.amu_employee_rate}%)`}
                      value={`−${fmtXOF(calcResult.amuEmp)}`}
                    />
                  </>
                ) : (
                  <p className="text-xs py-1 mt-1" style={{ color: 'var(--status-warning)' }}>
                    Employé exonéré de cotisations sociales
                  </p>
                )}

                {/* Net comptable */}
                <CalcRow
                  label="Net comptable"
                  value={fmtXOF(calcResult.netComptable)}
                  bold
                  separator
                />

                {/* Primes non imposables */}
                {nonTaxablePrimesList.map(p => (
                  <CalcRow
                    key={p.prime_type_id}
                    label={p.prime_type_name}
                    value={`+${fmtXOF(p.calculated_amount)}`}
                    accent
                  />
                ))}

                {/* Avance + Net à payer */}
                {(parseFloat(advanceDeducted) > 0 || nonTaxablePrimesList.length > 0) && (
                  <>
                    {parseFloat(advanceDeducted) > 0 && (
                      <CalcRow
                        label="Avance déduite"
                        value={`−${fmtXOF(advanceDeducted)}`}
                        danger
                      />
                    )}
                    <CalcRow
                      label="Net à payer"
                      value={fmtXOF(calcResult.netAPayer)}
                      bold
                      accent
                      separator
                    />
                  </>
                )}

                {/* Cotisations patronales */}
                {selectedEmployee?.has_social_contributions && (
                  <>
                    <CalcRow
                      label="CNSS patronal"
                      sub={`(${socialRates.cnss_employer_rate}%)`}
                      value={fmtXOF(calcResult.cnssEr)}
                      separator
                    />
                    <CalcRow
                      label="AMU patronal"
                      sub={`(${socialRates.amu_employer_rate}%)`}
                      value={fmtXOF(calcResult.amuEr)}
                    />
                    <CalcRow
                      label="Coût total employeur"
                      value={fmtXOF(calcResult.totalCost)}
                      bold
                      separator
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Avance / Prime / Autre ────────────────────────────────────────── */}
        {type !== 'salaire' && (
          <Input
            label="Montant (F CFA) *"
            type="number"
            step="1"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
          />
        )}

        {/* Type de prime */}
        {type === 'prime' && primeTypes.length > 0 && (
          <div>
            <label className={LABEL}>Type de prime</label>
            <select
              className={SELECT_CLASS}
              value={primeTypeId}
              onChange={e => setPrimeTypeId(e.target.value)}
            >
              <option value="">— Non spécifié —</option>
              {primeTypes.map((pt: PrimeType) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}{pt.is_taxable ? ' (imposable)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Libellé */}
        <Input
          label="Libellé (optionnel)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Description du paiement…"
        />

        {/* Erreur */}
        {error && (
          <p className="text-sm text-[--status-danger] bg-[--status-danger-bg] rounded px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
