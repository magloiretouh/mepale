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
import { type Employee, type SocialRates, type PrimeType, rhApi } from '@/services/rh'

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

function calcNet(
  gross: number,
  taxablePrimes: number,
  rates: SocialRates,
  hasSocial: boolean,
): { cnssEmp: number; amuEmp: number; net: number } {
  if (!hasSocial) return { cnssEmp: 0, amuEmp: 0, net: gross }
  const base = gross + taxablePrimes
  const cnssEmp = Math.round(base * parseFloat(rates.cnss_employee_rate) / 100)
  const amuEmp  = Math.round(base * parseFloat(rates.amu_employee_rate)  / 100)
  return { cnssEmp, amuEmp, net: gross - cnssEmp - amuEmp }
}

const now = new Date()
const todayStr = now.toISOString().slice(0, 10)
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

  const [employeeId, setEmployeeId]         = useState('')
  const [paymentDate, setPaymentDate]       = useState(todayStr)
  const [type, setType]                     = useState('salaire')
  const [periodMonth, setPeriodMonth]       = useState(currentMonth)
  const [grossAmount, setGrossAmount]       = useState('')
  const [taxablePrimes, setTaxablePrimes]   = useState('')
  const [advanceDeducted, setAdvanceDeducted] = useState('')
  const [amount, setAmount]                 = useState('')
  const [label, setLabel]                   = useState('')
  const [primeTypeId, setPrimeTypeId]       = useState('')
  const [error, setError]                   = useState('')

  // Types de primes (pour le select quand type=prime)
  const { data: primeTypes = [] } = useQuery({
    queryKey: ['rh-prime-types-admin'],
    queryFn: () => rhApi.adminListPrimeTypes().then(r => r.data),
    enabled: isOpen && type === 'prime',
  })

  // Avance en attente pour l'employé sélectionné
  const { data: pendingAdv } = useQuery({
    queryKey: ['rh-pending-advances', employeeId],
    queryFn: () => rhApi.getPendingAdvances(parseInt(employeeId)).then(r => r.data),
    enabled: isOpen && !!employeeId && type === 'salaire',
  })

  const selectedEmployee = useMemo(
    () => employees.find(e => String(e.id) === employeeId) ?? null,
    [employees, employeeId]
  )

  // Calcul net en temps réel
  const netInfo = useMemo(() => {
    if (type !== 'salaire' || !grossAmount || !selectedEmployee) return null
    const gross = parseFloat(grossAmount) || 0
    const taxable = parseFloat(taxablePrimes) || 0
    return calcNet(gross, taxable, socialRates, selectedEmployee.has_social_contributions)
  }, [type, grossAmount, taxablePrimes, selectedEmployee, socialRates])

  useEffect(() => {
    if (!isOpen) {
      setEmployeeId(''); setPaymentDate(todayStr); setType('salaire')
      setPeriodMonth(currentMonth); setGrossAmount(''); setTaxablePrimes('')
      setAdvanceDeducted(''); setAmount(''); setLabel(''); setPrimeTypeId(''); setError('')
    }
  }, [isOpen])

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
          taxable_primes_amount: parseFloat(taxablePrimes) || undefined,
          advance_deducted:      parseFloat(advanceDeducted) || undefined,
        })
      } else if (type === 'avance') {
        return rhApi.createPayment({ ...base, amount: parseFloat(amount) })
      } else {
        return rhApi.createPayment({
          ...base,
          period_month: periodMonth || undefined,
          amount:       parseFloat(amount),
          prime_type_id: primeTypeId ? parseInt(primeTypeId) : undefined,
        })
      }
    },
    onSuccess: () => {
      toast.success('Paiement enregistré.')
      qc.invalidateQueries({ queryKey: ['rh-payments'] })
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
    setError('')
    save()
  }

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
          <select className={SELECT_CLASS} value={employeeId} onChange={e => { setEmployeeId(e.target.value); setError('') }}>
            <option value="">— Sélectionner —</option>
            {employees.filter(e => e.is_active).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        {/* Date + Type */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date de paiement *" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
          <div>
            <label className={LABEL}>Type *</label>
            <select className={SELECT_CLASS} value={type} onChange={e => { setType(e.target.value); setError('') }}>
              <option value="salaire">Salaire</option>
              <option value="prime">Prime</option>
              <option value="avance">Avance</option>
              <option value="autre">Autre</option>
            </select>
          </div>
        </div>

        {/* Période (sauf avance) */}
        {type !== 'avance' && (
          <Input label="Période" type="month" value={periodMonth} onChange={e => setPeriodMonth(e.target.value)} />
        )}

        {/* ── Salaire ─────────────────────────────────────────────────────────── */}
        {type === 'salaire' && (
          <>
            <Input
              label="Salaire brut (F CFA) *"
              type="number"
              step="1"
              min="0"
              value={grossAmount}
              onChange={e => setGrossAmount(e.target.value)}
              placeholder="0"
            />

            <Input
              label="Primes imposables incluses dans la base CNSS/AMU (F CFA)"
              type="number"
              step="1"
              min="0"
              value={taxablePrimes}
              onChange={e => setTaxablePrimes(e.target.value)}
              placeholder="0"
            />

            {/* Calcul en temps réel */}
            {netInfo && (
              <div
                className="rounded text-sm px-3 py-2.5 space-y-1"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                {selectedEmployee?.has_social_contributions ? (
                  <>
                    <div className="flex justify-between text-[--text-secondary]">
                      <span>CNSS salarié ({socialRates.cnss_employee_rate}%)</span>
                      <span className="font-data">−{fmtXOF(netInfo.cnssEmp)}</span>
                    </div>
                    <div className="flex justify-between text-[--text-secondary]">
                      <span>AMU salarié ({socialRates.amu_employee_rate}%)</span>
                      <span className="font-data">−{fmtXOF(netInfo.amuEmp)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-[--status-warning]">
                    Employé exonéré de cotisations sociales
                  </p>
                )}
                <div
                  className="flex justify-between font-semibold pt-1"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <span>Net calculé</span>
                  <span className="font-data text-[--accent]">
                    {fmtXOF(netInfo.net - (parseFloat(advanceDeducted) || 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Avance en attente */}
            {pendingAdv && pendingAdv.pending_amount > 0 && (
              <div>
                <Input
                  label={`Avance à déduire (en attente : ${fmtXOF(pendingAdv.pending_amount)})`}
                  type="number"
                  step="1"
                  min="0"
                  max={String(pendingAdv.pending_amount)}
                  value={advanceDeducted}
                  onChange={e => setAdvanceDeducted(e.target.value)}
                  placeholder="0"
                />
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
            <select className={SELECT_CLASS} value={primeTypeId} onChange={e => setPrimeTypeId(e.target.value)}>
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
