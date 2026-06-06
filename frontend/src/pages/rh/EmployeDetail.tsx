/**
 * MEPALE ERP — Fiche employé
 * Informations personnelles + historique des paiements
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Pencil, Power, Plus, FileDown, Trash2,
  Phone, Mail, Calendar, Banknote, Hash, Shield,
  Building2, User,
} from 'lucide-react'
import { Button }       from '@/components/ui/Button'
import { Badge }        from '@/components/ui/Badge'
import { EmployeModal } from './EmployeModal'
import { PaymentModal } from './PaymentModal'
import { rhApi, type SalaryPayment, type StatutDemande } from '@/services/rh'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtXOF(n: string | number | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return Math.round(num).toLocaleString('fr-FR') + ' F'
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function fmtDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtMonth(m: string | null): string {
  if (!m) return '—'
  const d = new Date(m + '-02')
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

function computeAnciennete(hireDateStr: string | null): string {
  if (!hireDateStr) return '—'
  const hire        = new Date(hireDateStr)
  const now         = new Date()
  const totalMonths = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth())
  if (totalMonths < 1)  return "Moins d'1 mois"
  if (totalMonths < 12) return `${totalMonths} mois`
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  return m === 0 ? `${y} an${y > 1 ? 's' : ''}` : `${y} an${y > 1 ? 's' : ''} ${m} mois`
}

const PAY_COLORS: Record<string, string> = {
  salaire: 'var(--status-success)',
  prime:   'var(--accent)',
  avance:  'var(--status-warning)',
  autre:   'var(--text-muted)',
}

// ─── Bloc d'info ──────────────────────────────────────────────────────────────

function InfoRow({
  icon, label, value,
}: {
  icon:  React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
      <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

// ─── Carte stat ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, accent,
}: {
  label:  string
  value:  string
  accent?: boolean
}) {
  return (
    <div
      className="flex-1 rounded-lg px-4 py-3"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border:          '1px solid var(--border)',
      }}
    >
      <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p
        className="text-lg font-bold font-data mt-1"
        style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function EmployeDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const empId    = Number(id)

  const [tab,          setTab         ] = useState<'info' | 'paiements' | 'conges'>('info')
  const [editModal,    setEditModal   ] = useState(false)
  const [payModal,     setPayModal    ] = useState(false)
  const [confirmDelPay,  setConfirmDelPay  ] = useState<number | null>(null)
  const [downloadingSlip, setDownloadingSlip] = useState<number | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: emp, isLoading } = useQuery({
    queryKey: ['rh-employee', empId],
    queryFn:  () => rhApi.getEmployee(empId).then(r => r.data),
    enabled:  !!empId && !isNaN(empId),
  })

  const { data: socialRates } = useQuery({
    queryKey: ['rh-social-rates'],
    queryFn:  () => rhApi.getSocialRates().then(r => r.data),
  })

  const { data: payments = [], isLoading: payLoading } = useQuery({
    queryKey: ['rh-payments', String(empId), ''],
    queryFn:  () => rhApi.listPayments({ employee_id: empId }).then(r => r.data),
    enabled:  tab === 'paiements' && !!empId,
  })

  const congesAnnee = String(new Date().getFullYear())

  const { data: soldes = [], isLoading: soldesLoading } = useQuery({
    queryKey: ['rh-soldes-conge-emp', empId],
    queryFn:  () => rhApi.listSoldesConge({ employee_id: empId }).then(r => r.data),
    enabled:  tab === 'conges' && !!empId,
  })

  const { data: demandes = [], isLoading: demandesLoading } = useQuery({
    queryKey: ['rh-demandes-conge-emp', empId],
    queryFn:  () => rhApi.listDemandesConge({ employee_id: empId }).then(r => r.data),
    enabled:  tab === 'conges' && !!empId,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const { mutate: toggleEmp, isPending: toggling } = useMutation({
    mutationFn: () => rhApi.toggleEmployee(empId),
    onSuccess:  res => {
      toast.success(res.data.is_active ? 'Employé réactivé.' : 'Employé désactivé.')
      qc.invalidateQueries({ queryKey: ['rh-employee', empId] })
      qc.invalidateQueries({ queryKey: ['rh-employees'] })
    },
    onError: () => toast.error('Erreur lors du changement de statut.'),
  })

  const { mutate: deletePay } = useMutation({
    mutationFn: (pid: number) => rhApi.deletePayment(pid),
    onSuccess:  () => {
      toast.success('Paiement supprimé.')
      setConfirmDelPay(null)
      qc.invalidateQueries({ queryKey: ['rh-payments'] })
    },
    onError: () => { toast.error('Erreur.'); setConfirmDelPay(null) },
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

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 animate-fade-in">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
      </div>
    )
  }

  if (!emp) {
    return (
      <div className="flex flex-col items-center py-24 gap-3 animate-fade-in">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Employé introuvable.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/rh/employes')}>
          Retour à la liste
        </Button>
      </div>
    )
  }

  return (
    <>
      {/* ══ Modals ════════════════════════════════════════════════════════════ */}
      <EmployeModal
        isOpen={editModal}
        onClose={() => setEditModal(false)}
        employee={emp}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['rh-employee', empId] })
        }}
      />

      {socialRates && (
        <PaymentModal
          isOpen={payModal}
          onClose={() => setPayModal(false)}
          employees={[emp]}
          socialRates={socialRates}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['rh-payments', String(empId), ''] })
          }}
        />
      )}

      {/* ══ Page ══════════════════════════════════════════════════════════════ */}
      <div className="space-y-5 animate-fade-in">

        {/* ── Retour ── */}
        <button
          onClick={() => navigate('/rh/employes')}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft size={14} />
          Retour aux employés
        </button>

        {/* ── Header ── */}
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            {/* Identité */}
            <div className="flex items-center gap-4 min-w-0">
              {/* Avatar initiales */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-lg font-bold"
                style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
              >
                {emp.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                  {emp.name}
                </h1>
                {emp.role && (
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {emp.role}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant={emp.is_active ? 'success' : 'neutral'}>
                    {emp.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                  {emp.contract_type_display && (
                    <Badge variant="neutral">{emp.contract_type_display}</Badge>
                  )}
                  {emp.category_name && (
                    <Badge variant="accent">{emp.category_name}</Badge>
                  )}
                  {!emp.has_social_contributions && (
                    <Badge variant="warning">Exonéré CNSS</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => setEditModal(true)}
              >
                Modifier
              </Button>
              <Button
                variant={emp.is_active ? 'secondary' : 'ghost'}
                size="sm"
                icon={<Power size={13} />}
                loading={toggling}
                onClick={() => toggleEmp()}
              >
                {emp.is_active ? 'Désactiver' : 'Réactiver'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={13} />}
                onClick={() => setPayModal(true)}
              >
                Paiement
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-3 mt-4 flex-wrap">
            <StatCard
              label="Salaire mensuel"
              value={fmtXOF(emp.monthly_salary)}
              accent
            />
            <StatCard
              label="Ancienneté"
              value={computeAnciennete(emp.hire_date)}
            />
            {emp.cnss_number && (
              <StatCard
                label="N° CNSS"
                value={emp.cnss_number}
              />
            )}
          </div>
        </div>

        {/* ── Onglets ── */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex">
            {[
              { key: 'info',      label: 'Informations'  },
              { key: 'paiements', label: 'Paiements'     },
              { key: 'conges',    label: 'Congés'        },
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
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ONGLET INFORMATIONS                                               */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'info' && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>

            {/* Coordonnées */}
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Coordonnées
              </h3>
              <InfoRow icon={<Phone size={14} />}    label="Téléphone" value={emp.phone}  />
              <InfoRow icon={<Mail size={14} />}     label="Email"     value={emp.email}  />
              <div className="flex items-start gap-3 py-3">
                <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <Calendar size={14} />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
                    Date de naissance
                  </p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
                    {fmtDate(emp.birth_date)}
                  </p>
                </div>
              </div>
            </div>

            {/* Contrat */}
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Contrat & Poste
              </h3>
              <InfoRow icon={<User size={14} />}      label="Poste / Rôle"      value={emp.role}                  />
              <InfoRow icon={<Building2 size={14} />}  label="Catégorie"          value={emp.category_name}         />
              <InfoRow icon={<Banknote size={14} />}   label="Type de contrat"    value={emp.contract_type_display} />
              <div className="flex items-start gap-3 py-3">
                <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <Calendar size={14} />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
                    Date d'embauche
                  </p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
                    {fmtDate(emp.hire_date)}
                  </p>
                </div>
              </div>
            </div>

            {/* Identifiants administratifs */}
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Identifiants administratifs
              </h3>
              <InfoRow icon={<Hash size={14} />}    label="NIF"         value={emp.nif}                          />
              <InfoRow icon={<Hash size={14} />}    label="N° CNSS"     value={emp.cnss_number}                  />
              <InfoRow
                icon={<Shield size={14} />}
                label="Cotisations sociales"
                value={
                  <Badge variant={emp.has_social_contributions ? 'success' : 'warning'}>
                    {emp.has_social_contributions ? 'Assujetti CNSS / AMU' : 'Exonéré de cotisations'}
                  </Badge>
                }
              />
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ONGLET PAIEMENTS                                                  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'paiements' && (
          <>
            {payLoading && (
              <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>
                Chargement des paiements…
              </p>
            )}

            {!payLoading && payments.length === 0 && (
              <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-muted)' }}>
                <Banknote size={38} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p className="text-sm">Aucun paiement enregistré pour cet employé.</p>
                <button
                  onClick={() => setPayModal(true)}
                  className="text-xs mt-3 underline"
                  style={{ color: 'var(--accent)' }}
                >
                  Enregistrer un premier paiement
                </button>
              </div>
            )}

            {!payLoading && payments.length > 0 && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                        {[
                          { l: 'Date',          a: 'left'  },
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
                      {payments.map((pay, i) => {
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
                              {fmtDateShort(pay.payment_date)}
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
                                      onClick={() => deletePay(pay.id)}
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

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ONGLET CONGÉS                                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'conges' && (
          <>
            {/* Soldes {congesAnnee} */}
            {!soldesLoading && soldes.length > 0 && (
              <div
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--text-muted)' }}>
                  Soldes {congesAnnee}
                </h3>
                <div className="flex flex-wrap gap-3">
                  {soldes.map(s => (
                    <div key={s.id}
                      className="rounded-lg px-4 py-3 flex flex-col gap-0.5"
                      style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', minWidth: 140 }}>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {s.type_conge_name}
                      </p>
                      <p className="text-lg font-bold font-data"
                        style={{ color: s.solde_actuel < 0 ? 'var(--status-danger)' : s.solde_actuel === 0 ? 'var(--text-muted)' : 'var(--accent)' }}>
                        {s.solde_actuel.toFixed(1)}j
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {s.jours_pris}j pris / {s.jours_acquis}j acquis
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historique des demandes */}
            {(demandesLoading || soldesLoading) && (
              <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>
                Chargement…
              </p>
            )}

            {!demandesLoading && demandes.length === 0 && (
              <div className="flex flex-col items-center py-12" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">Aucune demande de congé enregistrée.</p>
              </div>
            )}

            {!demandesLoading && demandes.length > 0 && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                        {['Type', 'Période', 'Jours', 'Statut', 'Décision'].map((col, i) => (
                          <th key={i} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-left whitespace-nowrap"
                            style={{ color: 'var(--text-secondary)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {demandes.map((d, i) => {
                        const STATUT_BADGE: Record<StatutDemande, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
                          brouillon: 'neutral', soumise: 'info', approuvee: 'success', refusee: 'danger', annulee: 'warning',
                        }
                        const STATUT_LABEL: Record<StatutDemande, string> = {
                          brouillon: 'Brouillon', soumise: 'Soumise', approuvee: 'Approuvée', refusee: 'Refusée', annulee: 'Annulée',
                        }
                        return (
                          <tr key={d.id}
                            style={{ backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                            <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {d.type_conge_name}
                            </td>
                            <td className="px-3 py-2.5 font-data text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                              {new Date(d.date_debut).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })}
                              {' → '}
                              {new Date(d.date_fin).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })}
                            </td>
                            <td className="px-3 py-2.5 font-data font-semibold text-center" style={{ color: 'var(--accent)' }}>
                              {d.nb_jours}j
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge variant={STATUT_BADGE[d.statut]}>{STATUT_LABEL[d.statut]}</Badge>
                            </td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                              {d.approuve_par_name ?? '—'}
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
