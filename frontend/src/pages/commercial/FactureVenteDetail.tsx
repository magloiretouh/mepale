/**
 * MEPALE ERP — Détail Facture Vente
 * Actions : Émettre / Annuler / Ajouter règlement
 * Indicateurs de retard + tableau des règlements
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Receipt, Send, XCircle, CreditCard, AlertCircle, AlertTriangle,
  CheckCircle2, Calendar, User, FileText, X,
} from 'lucide-react'

import {
  commercialApi,
  type StatutFacture,
  type NiveauRetard,
  type AjouterReglementPayload,
  type ModePaiementReglem,
} from '@/services/commercial'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn, formatDate, formatXOF } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutFacture, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon:           { variant: 'neutral', label: 'Brouillon'   },
  emise:               { variant: 'accent',  label: 'Émise'       },
  partiellement_payee: { variant: 'warning', label: 'Part. payée' },
  payee:               { variant: 'success', label: 'Payée'       },
  annulee:             { variant: 'danger',  label: 'Annulée'     },
}

const RETARD_COLOR: Record<NiveauRetard, string> = {
  ok:     'var(--text-muted)',
  soon:   'var(--status-warning)',
  danger: 'var(--status-danger)',
}

const MODE_PAIEMENT_OPTIONS: { value: ModePaiementReglem; label: string }[] = [
  { value: 'especes',      label: 'Espèces'      },
  { value: 'cheque',       label: 'Chèque'       },
  { value: 'virement',     label: 'Virement'     },
  { value: 'mobile_money', label: 'Mobile Money' },
]

// ─── Modal Règlement ──────────────────────────────────────────────────────────

function ReglementModal({
  montantRestant,
  onClose,
  onSave,
  isPending,
}: {
  montantRestant: string
  onClose:        () => void
  onSave:         (data: AjouterReglementPayload) => void
  isPending:      boolean
}) {
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10))
  const [montant, setMontant] = useState(montantRestant)
  const [mode, setMode]       = useState<ModePaiementReglem>('virement')
  const [ref, setRef]         = useState('')
  const [notes, setNotes]     = useState('')

  const handleSubmit = () => {
    if (!date)                { toast.error('Date obligatoire'); return }
    if (Number(montant) <= 0) { toast.error('Montant invalide'); return }
    onSave({ date_reglement: date, montant: Number(montant), mode_paiement: mode, reference_paiement: ref || undefined, notes: notes || undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-lg animate-scale-in flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
          maxHeight:       '90vh',
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <CreditCard size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <h3 className="text-sm font-semibold text-[--text-primary]">Ajouter un règlement</h3>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-4">
            <div
              className="flex items-center justify-between p-3 rounded-lg"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            >
              <span className="text-xs text-[--text-muted]">Montant restant</span>
              <span className="font-data text-sm font-bold" style={{ color: 'var(--status-warning)' }}>
                {formatXOF(Number(montantRestant))}
              </span>
            </div>
            <div>
              <label className={FIELD_LABEL}>Date <span style={{ color: 'var(--status-danger)' }}>*</span></label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Montant (FCFA) <span style={{ color: 'var(--status-danger)' }}>*</span></label>
              <Input type="number" min={1} value={montant} onChange={(e) => setMontant(e.target.value)} className="font-data" />
            </div>
            <div>
              <label className={FIELD_LABEL}>Mode de paiement</label>
              <select className={SELECT_CLASS} style={{ height: '36px' }} value={mode} onChange={(e) => setMode(e.target.value as ModePaiementReglem)}>
                {MODE_PAIEMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL}>Référence paiement</label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="N° chèque, virement…" className="font-data" />
            </div>
            <div>
              <label className={FIELD_LABEL}>Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commentaire facultatif" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>Enregistrer</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span className="text-xs text-[--text-muted] w-32 flex-shrink-0 pt-px">{label}</span>
      <span className="text-xs text-[--text-primary] font-medium">{value}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FactureVenteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showReglement, setShowReglement] = useState(false)

  const { data: facture, isLoading } = useQuery({
    queryKey: ['facture-vente', id],
    queryFn:  () => commercialApi.getFactureVente(id!).then((r) => r.data),
    enabled:  !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['facture-vente', id] })
    qc.invalidateQueries({ queryKey: ['factures-vente'] })
  }

  const emettresMut = useMutation({
    mutationFn: () => commercialApi.emettreFacture(id!),
    onSuccess:  () => { toast.success('Facture émise.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const annulerMut = useMutation({
    mutationFn: () => commercialApi.annulerFacture(id!),
    onSuccess:  () => { toast.success('Facture annulée.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const reglementMut = useMutation({
    mutationFn: (data: AjouterReglementPayload) => commercialApi.ajouterReglement(id!, data),
    onSuccess:  () => { toast.success('Règlement enregistré.'); invalidate(); setShowReglement(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  if (isLoading) return (
    <div className="animate-fade-in px-6 py-8">
      <div className="skeleton h-6 w-48 rounded mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + i * 4}%` }} />
        ))}
      </div>
    </div>
  )

  if (!facture) return (
    <div className="animate-fade-in px-6 py-16 text-center">
      <p className="text-sm text-[--text-secondary]">Facture introuvable.</p>
      <button className="mt-3 text-xs text-[--accent] hover:underline" onClick={() => navigate('/commercial/factures')}>
        Retour à la liste
      </button>
    </div>
  )

  const cfg = STATUT_CFG[facture.statut]
  const totalHT = facture.lignes.reduce((acc, l) => acc + Number(l.montant_ht), 0)
  const canAddReglement = ['emise', 'partiellement_payee'].includes(facture.statut)

  return (
    <>
      {showReglement && (
        <ReglementModal
          montantRestant={facture.montant_restant}
          onClose={() => setShowReglement(false)}
          onSave={(d) => reglementMut.mutate(d)}
          isPending={reglementMut.isPending}
        />
      )}

      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/commercial/factures')}
              className="p-1.5 rounded-lg text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
            >
              <ArrowLeft size={16} />
            </button>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-dim)' }}
            >
              <Receipt size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-[--text-primary] font-data">{facture.reference}</h1>
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
                {facture.est_en_retard && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      backgroundColor: facture.niveau_retard === 'danger' ? 'var(--status-danger-bg)' : 'var(--status-warning-bg)',
                      color: RETARD_COLOR[facture.niveau_retard],
                    }}
                  >
                    {facture.niveau_retard === 'danger' ? <AlertCircle size={10} /> : <AlertTriangle size={10} />}
                    {facture.jours_retard}j de retard
                  </span>
                )}
              </div>
              <p className="text-xs text-[--text-muted] mt-0.5">{facture.client_nom}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {facture.statut === 'brouillon' && (
              <Button variant="primary" size="sm" icon={<Send size={13} />} loading={emettresMut.isPending} onClick={() => emettresMut.mutate()}>
                Émettre
              </Button>
            )}
            {canAddReglement && (
              <Button variant="primary" size="sm" icon={<CreditCard size={13} />} onClick={() => setShowReglement(true)}>
                Ajouter règlement
              </Button>
            )}
            {!['payee', 'annulee'].includes(facture.statut) && (
              <Button variant="danger" size="sm" icon={<XCircle size={13} />} loading={annulerMut.isPending} onClick={() => annulerMut.mutate()}>
                Annuler
              </Button>
            )}
          </div>
        </div>

        {/* Contenu */}
        <div className="px-6 py-5 grid grid-cols-3 gap-5">
          {/* Colonne infos */}
          <div className="col-span-1 space-y-5">
            <div className="surface rounded-xl p-5">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">Informations</p>
              <InfoRow icon={<User size={13} />}     label="Client"     value={facture.client_nom} />
              <InfoRow icon={<Calendar size={13} />} label="Date"       value={formatDate(facture.date_facture)} />
              <InfoRow
                icon={<Calendar size={13} />}
                label="Échéance"
                value={
                  <span style={{ color: RETARD_COLOR[facture.niveau_retard] }}>
                    {formatDate(facture.date_echeance)}
                    {facture.est_en_retard && ` (+${facture.jours_retard}j)`}
                  </span>
                }
              />
              {facture.commande_reference && (
                <InfoRow
                  icon={<FileText size={13} />}
                  label="Commande"
                  value={
                    <button
                      className="font-data text-xs text-[--accent] hover:underline"
                      onClick={() => navigate(`/commercial/commandes/${facture.commande}`)}
                    >
                      {facture.commande_reference}
                    </button>
                  }
                />
              )}
            </div>

            {/* Résumé financier */}
            <div className="surface rounded-xl p-5">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">Résumé financier</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-[--text-muted]">Total HT</span>
                  <span className="font-data text-xs font-semibold">{formatXOF(Number(facture.montant_ht))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[--text-muted]">Réglé</span>
                  <span className="font-data text-xs" style={{ color: 'var(--status-success)' }}>
                    {formatXOF(Number(facture.montant_regle))}
                  </span>
                </div>
                <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-[--text-secondary]">Restant</span>
                  <span
                    className="font-data text-sm font-bold"
                    style={{ color: Number(facture.montant_restant) > 0 ? 'var(--status-warning)' : 'var(--text-muted)' }}
                  >
                    {formatXOF(Number(facture.montant_restant))}
                  </span>
                </div>
              </div>
            </div>

            {facture.notes && (
              <div className="surface rounded-xl p-5">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-2">Notes</p>
                <p className="text-xs text-[--text-secondary] whitespace-pre-wrap leading-relaxed">{facture.notes}</p>
              </div>
            )}
          </div>

          {/* Colonne principale */}
          <div className="col-span-2 space-y-5">
            {/* Lignes */}
            <div className="surface rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Lignes</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                    {['Réf. article', 'Désignation', 'Qté', 'P.U.', 'Remise', 'Montant HT'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {facture.lignes.map((l, i) => (
                    <tr key={l.id} style={{ borderBottom: i < facture.lignes.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <td className="px-6 py-5">
                        <span className="font-data text-xs text-[--accent]">{l.article_code ?? '—'}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-xs text-[--text-primary]">{l.designation}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="font-data text-xs">{l.quantite}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="font-data text-xs">{formatXOF(Number(l.prix_unitaire))}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="font-data text-xs text-[--text-muted]">
                          {Number(l.remise_pct) > 0 ? `${l.remise_pct}%` : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="font-data text-xs font-semibold">{formatXOF(Number(l.montant_ht))}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                className="flex items-center justify-end gap-6 px-6 py-4 border-t"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
              >
                <span className="text-xs font-semibold text-[--text-secondary] uppercase tracking-wider">Total HT</span>
                <span className="font-data text-base font-bold text-[--text-primary]">{formatXOF(totalHT)}</span>
              </div>
            </div>

            {/* Règlements */}
            <div className="surface rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Règlements</p>
                {canAddReglement && (
                  <Button variant="ghost" size="xs" icon={<CreditCard size={11} />} onClick={() => setShowReglement(true)}>
                    Ajouter
                  </Button>
                )}
              </div>
              {facture.reglements.length === 0 ? (
                <div className="py-8 text-center">
                  <CreditCard size={24} className="mx-auto mb-2 text-[--text-muted]" />
                  <p className="text-xs text-[--text-muted]">Aucun règlement enregistré</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                      {['Date', 'Montant', 'Mode', 'Référence', 'Saisi par'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {facture.reglements.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: i < facture.reglements.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                        <td className="px-6 py-5">
                          <span className="text-xs text-[--text-secondary]">{formatDate(r.date_reglement)}</span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="font-data text-xs font-semibold" style={{ color: 'var(--status-success)' }}>
                            {formatXOF(Number(r.montant))}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs text-[--text-secondary]">{r.mode_paiement_label}</span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="font-data text-xs text-[--text-muted]">{r.reference_paiement || '—'}</span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs text-[--text-muted]">{r.saisi_par_nom ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
