/**
 * MEPALE ERP — Page Ressources Humaines
 * Onglet Employés : tableau + actions portail · Onglet Paiements : tableau filtré
 */

import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Users, Banknote, FileDown, Trash2, MoreHorizontal,
  ExternalLink, Pencil, Power,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { Badge }   from '@/components/ui/Badge'
import { EmployeModal }          from './EmployeModal'
import { PaymentModal }          from './PaymentModal'
import { BulkTypeChoiceModal }   from './BulkTypeChoiceModal'
import { CnssModal }             from './CnssModal'
import { type Employee, type SalaryPayment, rhApi } from '@/services/rh'

// ─── Styles ───────────────────────────────────────────────────────────────────

const SELECT = cn(
  'h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8',
  'text-[--text-primary] appearance-none transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtXOF(n: string | number | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return Math.round(num).toLocaleString('fr-FR') + ' F'
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtMonth(m: string | null): string {
  if (!m) return '—'
  const d = new Date(m + '-02')
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

const PAY_COLORS: Record<string, string> = {
  salaire: 'var(--status-success)',
  prime:   'var(--accent)',
  avance:  'var(--status-warning)',
  autre:   'var(--text-muted)',
}

// ─── Menu actions (portal) ────────────────────────────────────────────────────

function ActionMenu({
  emp, onView, onEdit, onToggle,
}: {
  emp:      Employee
  onView:   () => void
  onEdit:   () => void
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current)
      setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  const item = (
    label: string,
    icon:  React.ReactNode,
    onClick: () => void,
    danger?: boolean,
  ) => (
    <button
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
        danger
          ? 'hover:bg-[--status-danger-bg]'
          : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
      )}
      style={danger ? { color: 'var(--status-danger)' } : {}}
      onClick={() => { setOpen(false); onClick() }}
    >
      {icon}{label}
    </button>
  )

  const W = 192
  const dropdown = rect && open && createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onClick={(e) => { e.stopPropagation(); setOpen(false) }}
      />
      <div
        className="rounded-md py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position:        'fixed',
          top:             rect.bottom + 200 < window.innerHeight ? rect.bottom + 4 : undefined,
          bottom:          rect.bottom + 200 < window.innerHeight ? undefined : window.innerHeight - rect.top + 4,
          left:            rect.right - W,
          width:           W,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {item('Voir la fiche', <ExternalLink size={13} style={{ color: 'var(--accent)' }} />, onView)}
        {item('Modifier',      <Pencil size={13} />, onEdit)}
        <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
        {item(
          emp.is_active ? 'Désactiver' : 'Réactiver',
          <Power size={13} />,
          onToggle,
          emp.is_active,
        )}
      </div>
    </>,
    document.body,
  )

  return (
    <>
      {dropdown}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="w-7 h-7 rounded flex items-center justify-center transition-all text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated]"
      >
        <MoreHorizontal size={14} />
      </button>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Employes() {
  const navigate = useNavigate()
  const qc       = useQueryClient()

  // ── Onglet actif ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'employes' | 'paiements'>('employes')

  // ── Modals ────────────────────────────────────────────────────────────────
  const [empModal,  setEmpModal ] = useState<{ open: boolean; emp?: Employee | null }>({ open: false })
  const [payModal,  setPayModal ] = useState(false)
  const [bulkModal, setBulkModal] = useState(false)
  const [cnssModal, setCnssModal] = useState(false)

  // ── Filtres employés ──────────────────────────────────────────────────────
  const [search,       setSearch      ] = useState('')
  const [catFilter,    setCatFilter   ] = useState('')
  const [activeFilter, setActiveFilter] = useState('active')

  // ── Filtres paiements ─────────────────────────────────────────────────────
  const [payEmpId, setPayEmpId] = useState('')
  const [payMonth, setPayMonth] = useState('')
  const [payType,  setPayType ] = useState('')

  // ── Paiement delete ────────────────────────────────────────────────────────
  const [confirmDelPay,  setConfirmDelPay  ] = useState<number | null>(null)
  const [downloadingSlip, setDownloadingSlip] = useState<number | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: employees = [], isLoading: empsLoading } = useQuery({
    queryKey: ['rh-employees'],
    queryFn:  () => rhApi.listEmployees().then(r => r.data),
  })

  const { data: socialRates } = useQuery({
    queryKey: ['rh-social-rates'],
    queryFn:  () => rhApi.getSocialRates().then(r => r.data),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['rh-categories'],
    queryFn:  () => rhApi.listCategories().then(r => r.data),
  })

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['rh-payments', payEmpId, payMonth],
    queryFn:  () => rhApi.listPayments({
      employee_id: payEmpId || undefined,
      month:       payMonth || undefined,
    }).then(r => r.data),
    enabled: tab === 'paiements',
  })

  // ── Données dérivées ──────────────────────────────────────────────────────
  const filteredEmployees = useMemo(() => employees.filter(emp => {
    if (search      && !emp.name.toLowerCase().includes(search.toLowerCase())) return false
    if (catFilter   && String(emp.category) !== catFilter)                     return false
    if (activeFilter === 'active'   && !emp.is_active) return false
    if (activeFilter === 'inactive' &&  emp.is_active) return false
    return true
  }), [employees, search, catFilter, activeFilter])

  const filteredPayments = useMemo(() =>
    payType ? payments.filter(p => p.type === payType) : payments,
  [payments, payType])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const { mutate: toggleEmployee } = useMutation({
    mutationFn: (id: number) => rhApi.toggleEmployee(id),
    onSuccess:  res => {
      toast.success(res.data.is_active ? 'Employé réactivé.' : 'Employé désactivé.')
      qc.invalidateQueries({ queryKey: ['rh-employees'] })
    },
    onError: () => toast.error('Erreur lors du changement de statut.'),
  })

  const { mutate: deletePayment } = useMutation({
    mutationFn: (id: number) => rhApi.deletePayment(id),
    onSuccess:  () => {
      toast.success('Paiement supprimé.')
      setConfirmDelPay(null)
      qc.invalidateQueries({ queryKey: ['rh-payments'] })
    },
    onError: () => { toast.error('Erreur lors de la suppression.'); setConfirmDelPay(null) },
  })

  // ── Bulletin de paie ──────────────────────────────────────────────────────
  const handlePayslip = async (pay: SalaryPayment) => {
    if (!pay.period_month) return
    setDownloadingSlip(pay.id)
    try {
      const res = await rhApi.getPayslipPdf(pay.employee, pay.period_month)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a   = document.createElement('a')
      a.href     = url
      a.download = `fiche-paie-${pay.employee_name.replace(/\s+/g, '-')}-${pay.period_month}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Aucun bulletin disponible pour cette période.')
    } finally {
      setDownloadingSlip(null)
    }
  }

  const activeCount = employees.filter(e => e.is_active).length

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ══ Modals — EN DEHORS du div animate-fade-in ══════════════════════════ */}

      <EmployeModal
        isOpen={empModal.open}
        onClose={() => setEmpModal({ open: false })}
        employee={empModal.emp}
        onSuccess={() => {}}
      />

      {socialRates && (
        <PaymentModal
          isOpen={payModal}
          onClose={() => setPayModal(false)}
          employees={employees}
          socialRates={socialRates}
          onSuccess={() => {}}
        />
      )}

      <BulkTypeChoiceModal
        isOpen={bulkModal}
        onClose={() => setBulkModal(false)}
      />

      <CnssModal
        isOpen={cnssModal}
        onClose={() => setCnssModal(false)}
      />

      {/* ══ Page ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col h-full animate-fade-in">

        {/* ── En-tête ── */}
        <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Ressources Humaines
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {employees.length} employé{employees.length !== 1 ? 's' : ''}
              {' · '}
              <span style={{ color: 'var(--status-success)' }}>
                {activeCount} actif{activeCount !== 1 ? 's' : ''}
              </span>
            </p>
          </div>

          {tab === 'employes' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setEmpModal({ open: true, emp: null })}
            >
              + Nouvel employé
            </Button>
          )}

          {tab === 'paiements' && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCnssModal(true)}>
                CNSS / AMU
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setBulkModal(true)}>
                Paiement en masse
              </Button>
              <Button variant="primary" size="sm" onClick={() => setPayModal(true)}>
                + Paiement
              </Button>
            </div>
          )}
        </div>

        {/* ── Onglets ── */}
        <div
          className="flex"
          style={{ borderBottom: '1px solid var(--border)', marginBottom: 20 }}
        >
          {[
            { key: 'employes',  label: 'Employés'  },
            { key: 'paiements', label: 'Paiements' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className="px-4 pb-3 text-sm font-medium transition-colors"
              style={{
                color:        tab === t.key ? 'var(--accent)'           : 'var(--text-secondary)',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ONGLET EMPLOYÉS                                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'employes' && (
          <>
            {/* Filtres */}
            <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 16 }}>
              <div style={{ flex: '1 1 200px', maxWidth: 280 }}>
                <Input
                  placeholder="Rechercher par nom…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select
                className={SELECT}
                style={{ minWidth: 160 }}
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
              >
                <option value="">Toutes catégories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                className={SELECT}
                style={{ minWidth: 130 }}
                value={activeFilter}
                onChange={e => setActiveFilter(e.target.value)}
              >
                <option value="all">Tous</option>
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
              </select>
              {(search || catFilter || activeFilter !== 'active') && (
                <button
                  onClick={() => { setSearch(''); setCatFilter(''); setActiveFilter('active') }}
                  className="text-xs underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Réinitialiser
                </button>
              )}
            </div>

            {empsLoading && (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>
                Chargement des employés…
              </p>
            )}

            {!empsLoading && filteredEmployees.length === 0 && (
              <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-muted)' }}>
                <Users size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p className="text-sm">
                  {employees.length === 0
                    ? 'Aucun employé. Commencez par en créer un.'
                    : 'Aucun employé ne correspond aux filtres.'}
                </p>
              </div>
            )}

            {!empsLoading && filteredEmployees.length > 0 && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                        {[
                          { l: 'Employé',        a: 'left'  },
                          { l: 'Catégorie',      a: 'left'  },
                          { l: 'Contrat',        a: 'left'  },
                          { l: 'Salaire',        a: 'right', accent: true },
                          { l: 'Embauché le',    a: 'left'  },
                          { l: 'Cotisations',    a: 'left'  },
                          { l: 'Statut',         a: 'left'  },
                          { l: '',               a: 'right' },
                        ].map((col, ci) => (
                          <th
                            key={ci}
                            className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                            style={{
                              textAlign: col.a as 'left' | 'right',
                              color: col.accent ? 'var(--accent)' : 'var(--text-secondary)',
                            }}
                          >
                            {col.l}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((emp, i) => (
                        <tr
                          key={emp.id}
                          onClick={() => navigate(`/rh/employes/${emp.id}`)}
                          className="cursor-pointer transition-colors hover:bg-[--bg-elevated]"
                          style={{
                            backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent',
                            borderBottom:    '1px solid var(--border-subtle, var(--border))',
                            opacity:         emp.is_active ? 1 : 0.6,
                          }}
                        >
                          {/* Employé */}
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                              {emp.name}
                            </div>
                            {emp.role && (
                              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {emp.role}
                              </div>
                            )}
                          </td>

                          {/* Catégorie */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {emp.category_name ? (
                              <span
                                className="text-xs font-medium px-2 py-0.5 rounded"
                                style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                              >
                                {emp.category_name}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>

                          {/* Contrat */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {emp.contract_type_display ? (
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {emp.contract_type_display}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>

                          {/* Salaire */}
                          <td className="px-3 py-2.5 text-right font-data font-semibold whitespace-nowrap"
                            style={{ color: 'var(--accent)' }}>
                            {fmtXOF(emp.monthly_salary)}
                          </td>

                          {/* Embauché le */}
                          <td className="px-3 py-2.5 font-data text-xs whitespace-nowrap"
                            style={{ color: 'var(--text-muted)' }}>
                            {emp.hire_date ? fmtDate(emp.hire_date) : '—'}
                          </td>

                          {/* Cotisations */}
                          <td className="px-3 py-2.5">
                            <Badge variant={emp.has_social_contributions ? 'success' : 'warning'}>
                              {emp.has_social_contributions ? 'CNSS' : 'Exonéré'}
                            </Badge>
                          </td>

                          {/* Statut */}
                          <td className="px-3 py-2.5">
                            <Badge variant={emp.is_active ? 'success' : 'neutral'}>
                              {emp.is_active ? 'Actif' : 'Inactif'}
                            </Badge>
                          </td>

                          {/* Actions */}
                          <td
                            className="px-3 py-2.5 text-right"
                            onClick={e => e.stopPropagation()}
                          >
                            <ActionMenu
                              emp={emp}
                              onView={() => navigate(`/rh/employes/${emp.id}`)}
                              onEdit={() => setEmpModal({ open: true, emp })}
                              onToggle={() => toggleEmployee(emp.id)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ONGLET PAIEMENTS                                                  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'paiements' && (
          <>
            {/* Filtres */}
            <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 16 }}>
              <select
                className={SELECT}
                style={{ minWidth: 200 }}
                value={payEmpId}
                onChange={e => setPayEmpId(e.target.value)}
              >
                <option value="">Tous les employés</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <Input
                type="month"
                value={payMonth}
                onChange={e => setPayMonth(e.target.value)}
              />
              <select
                className={SELECT}
                style={{ minWidth: 140 }}
                value={payType}
                onChange={e => setPayType(e.target.value)}
              >
                <option value="">Tous types</option>
                <option value="salaire">Salaire</option>
                <option value="prime">Prime</option>
                <option value="avance">Avance</option>
                <option value="autre">Autre</option>
              </select>
              {(payEmpId || payMonth || payType) && (
                <button
                  onClick={() => { setPayEmpId(''); setPayMonth(''); setPayType('') }}
                  className="text-xs underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Réinitialiser
                </button>
              )}
            </div>

            {paymentsLoading && (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>
                Chargement…
              </p>
            )}

            {!paymentsLoading && filteredPayments.length === 0 && (
              <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-muted)' }}>
                <Banknote size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p className="text-sm">Aucun paiement enregistré pour ces filtres.</p>
              </div>
            )}

            {!paymentsLoading && filteredPayments.length > 0 && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          borderBottom:    '1px solid var(--border)',
                        }}
                      >
                        {[
                          { l: 'Date',          a: 'left'  },
                          { l: 'Employé',       a: 'left'  },
                          { l: 'Type',          a: 'left'  },
                          { l: 'Période',       a: 'left'  },
                          { l: 'Brut',          a: 'right' },
                          { l: 'Net / Montant', a: 'right', accent: true },
                          { l: 'Libellé',       a: 'left'  },
                          { l: '',              a: 'right' },
                        ].map((col, ci) => (
                          <th
                            key={ci}
                            className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                            style={{
                              textAlign: col.a as 'left' | 'right',
                              color: col.accent ? 'var(--accent)' : 'var(--text-secondary)',
                            }}
                          >
                            {col.l}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((pay, i) => {
                        const tc = PAY_COLORS[pay.type] ?? 'var(--text-muted)'
                        return (
                          <tr
                            key={pay.id}
                            style={{
                              backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent',
                              borderBottom:    '1px solid var(--border)',
                            }}
                          >
                            <td className="px-3 py-2.5 font-data text-xs whitespace-nowrap"
                              style={{ color: 'var(--text-muted)' }}>
                              {fmtDate(pay.payment_date)}
                            </td>

                            <td className="px-3 py-2.5 font-medium whitespace-nowrap"
                              style={{ color: 'var(--text-primary)' }}>
                              {pay.employee_name}
                            </td>

                            <td className="px-3 py-2.5">
                              <span
                                className="px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
                                style={{
                                  color:           tc,
                                  backgroundColor: `color-mix(in srgb, ${tc} 15%, transparent)`,
                                  border:          `1px solid color-mix(in srgb, ${tc} 30%, transparent)`,
                                }}
                              >
                                {pay.type_display}
                                {pay.prime_type_name && ` — ${pay.prime_type_name}`}
                              </span>
                            </td>

                            <td className="px-3 py-2.5 text-xs font-data"
                              style={{ color: 'var(--text-muted)' }}>
                              {fmtMonth(pay.period_month)}
                            </td>

                            <td className="px-3 py-2.5 text-right text-xs font-data"
                              style={{ color: 'var(--text-secondary)' }}>
                              {pay.gross_amount ? fmtXOF(pay.gross_amount) : '—'}
                            </td>

                            <td className="px-3 py-2.5 text-right font-data font-semibold"
                              style={{ color: 'var(--accent)' }}>
                              {fmtXOF(pay.amount)}
                            </td>

                            <td className="px-3 py-2.5 text-xs max-w-[160px] truncate"
                              style={{ color: 'var(--text-muted)' }}>
                              {pay.label || '—'}
                            </td>

                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {pay.type === 'salaire' && pay.period_month && (
                                  <button
                                    onClick={() => handlePayslip(pay)}
                                    disabled={downloadingSlip === pay.id}
                                    title="Bulletin de paie PDF"
                                    className="p-1.5 rounded transition-all hover:opacity-70 disabled:opacity-30"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    <FileDown size={13} />
                                  </button>
                                )}
                                {confirmDelPay === pay.id ? (
                                  <>
                                    <button
                                      onClick={() => deletePayment(pay.id)}
                                      className="px-2 py-1 rounded text-xs font-semibold transition-all hover:opacity-80"
                                      style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}
                                    >
                                      Oui
                                    </button>
                                    <button
                                      onClick={() => setConfirmDelPay(null)}
                                      className="px-2 py-1 rounded text-xs"
                                      style={{ color: 'var(--text-muted)' }}
                                    >
                                      Non
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDelPay(pay.id)}
                                    title="Supprimer"
                                    className="p-1.5 rounded transition-all hover:opacity-70"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
