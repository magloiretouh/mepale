/**
 * MEPALE ERP — Détail Commande Client
 * Actions : Confirmer (avec vérif stock) / Annuler
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, ClipboardList, CheckCircle2, XCircle,
  AlertTriangle, CheckCircle, Calendar, User, FileText, Package,
} from 'lucide-react'

import { commercialApi, type StatutCC } from '@/services/commercial'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate, formatXOF } from '@/lib/utils'

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutCC, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon:            { variant: 'neutral', label: 'Brouillon'    },
  confirmee:            { variant: 'accent',  label: 'Confirmée'    },
  en_cours_livraison:   { variant: 'warning', label: 'En livraison' },
  partiellement_livree: { variant: 'info',    label: 'Part. livrée' },
  livree:               { variant: 'success', label: 'Livrée'       },
  annulee:              { variant: 'danger',  label: 'Annulée'      },
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span className="text-xs text-[--text-muted] w-36 flex-shrink-0 pt-px">{label}</span>
      <span className="text-xs text-[--text-primary] font-medium">{value}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CommandeClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: cc, isLoading } = useQuery({
    queryKey: ['commande-client', id],
    queryFn:  () => commercialApi.getCommandeClient(id!).then((r) => r.data),
    enabled:  !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['commande-client', id] })
    qc.invalidateQueries({ queryKey: ['commandes-client'] })
  }

  const confirmerMut = useMutation({
    mutationFn: () => commercialApi.confirmerCommande(id!),
    onSuccess:  (r) => {
      if (!r.data.tout_disponible) {
        toast.warning(`Confirmée avec ${r.data.warnings.length} alerte(s) stock.`)
      } else {
        toast.success('Commande confirmée.')
      }
      invalidate()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const annulerMut = useMutation({
    mutationFn: () => commercialApi.annulerCommande(id!),
    onSuccess:  () => { toast.success('Commande annulée.'); invalidate() },
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

  if (!cc) return (
    <div className="animate-fade-in px-6 py-16 text-center">
      <p className="text-sm text-[--text-secondary]">Commande introuvable.</p>
      <button className="mt-3 text-xs text-[--accent] hover:underline" onClick={() => navigate('/commercial/commandes')}>
        Retour à la liste
      </button>
    </div>
  )

  const cfg = STATUT_CFG[cc.statut]
  const totalHT = cc.lignes.reduce((acc, l) => acc + Number(l.montant_ht), 0)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/commercial/commandes')}
            className="p-1.5 rounded-lg text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-dim)' }}
          >
            <ClipboardList size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[--text-primary] font-data">{cc.reference}</h1>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              {cc.stock_warning && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}
                >
                  <AlertTriangle size={10} /> Alerte stock
                </span>
              )}
            </div>
            <p className="text-xs text-[--text-muted] mt-0.5">{cc.client_nom}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cc.statut === 'brouillon' && (
            <Button
              variant="primary" size="sm"
              icon={<CheckCircle2 size={13} />}
              loading={confirmerMut.isPending}
              onClick={() => confirmerMut.mutate()}
            >
              Confirmer
            </Button>
          )}
          {!['livree', 'annulee'].includes(cc.statut) && (
            <Button
              variant="danger" size="sm"
              icon={<XCircle size={13} />}
              loading={annulerMut.isPending}
              onClick={() => annulerMut.mutate()}
            >
              Annuler
            </Button>
          )}
        </div>
      </div>

      {/* Contenu */}
      <div className="px-6 py-5 grid grid-cols-3 gap-5">
        {/* Infos */}
        <div className="col-span-1 space-y-5">
          <div className="surface rounded-xl p-5">
            <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">Informations</p>
            <InfoRow icon={<User size={13} />}     label="Client"             value={cc.client_nom} />
            <InfoRow icon={<User size={13} />}     label="Commercial"         value={cc.commercial_nom ?? '—'} />
            <InfoRow icon={<Calendar size={13} />} label="Date commande"      value={formatDate(cc.date_commande)} />
            <InfoRow icon={<Calendar size={13} />} label="Livr. souhaitée"    value={cc.date_livraison_souhaitee ? formatDate(cc.date_livraison_souhaitee) : '—'} />
            <InfoRow icon={<Calendar size={13} />} label="Livr. confirmée"    value={cc.date_livraison_confirmee ? formatDate(cc.date_livraison_confirmee) : '—'} />
            {cc.devis_reference && (
              <InfoRow
                icon={<FileText size={13} />}
                label="Devis origine"
                value={
                  <button
                    className="font-data text-xs text-[--accent] hover:underline"
                    onClick={() => navigate(`/commercial/devis/${cc.devis}`)}
                  >
                    {cc.devis_reference}
                  </button>
                }
              />
            )}
          </div>

          {cc.conditions_paiement && (
            <div className="surface rounded-xl p-5">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-2">Conditions paiement</p>
              <p className="text-xs text-[--text-secondary]">{cc.conditions_paiement}</p>
            </div>
          )}

          {cc.notes_client && (
            <div className="surface rounded-xl p-5">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-2">Notes client</p>
              <p className="text-xs text-[--text-secondary] whitespace-pre-wrap leading-relaxed">{cc.notes_client}</p>
            </div>
          )}
        </div>

        {/* Lignes */}
        <div className="col-span-2">
          <div className="surface rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Lignes</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                  {['Article', 'Désignation', 'Commandée', 'Livrée', 'Restante', 'P.U.', 'Montant HT', 'Stock confir.'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cc.lignes.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: i < cc.lignes.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <td className="px-3 py-3">
                      <span className="font-data text-xs text-[--accent]">{l.article_code}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-[--text-primary]">{l.article_designation}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-data text-xs">{l.quantite_commandee} {l.unite_code}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-data text-xs text-[--status-success]">{l.quantite_livree} {l.unite_code}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="font-data text-xs"
                        style={{ color: Number(l.quantite_restante) > 0 ? 'var(--status-warning)' : 'var(--text-muted)' }}
                      >
                        {l.quantite_restante} {l.unite_code}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-data text-xs">{formatXOF(Number(l.prix_unitaire))}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-data text-xs font-semibold">{formatXOF(Number(l.montant_ht))}</span>
                    </td>
                    <td className="px-3 py-3">
                      {l.stock_disponible_confirmation !== null ? (
                        <div className="flex items-center gap-2">
                          {Number(l.stock_disponible_confirmation) >= Number(l.quantite_commandee) ? (
                            <CheckCircle size={12} style={{ color: 'var(--status-success)' }} />
                          ) : (
                            <AlertTriangle size={12} style={{ color: 'var(--status-warning)' }} />
                          )}
                          <span className="font-data text-xs text-[--text-muted]">{l.stock_disponible_confirmation}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-[--text-muted]">—</span>
                      )}
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
        </div>
      </div>
    </div>
  )
}
