/**
 * MEPALE ERP — Détail Bon de Livraison
 * Actions : Expédier (bloquant si stock insuffisant) / Confirmer livraison
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Truck, Send, CheckCircle2, Calendar, Package, Receipt, X,
} from 'lucide-react'

import { commercialApi, type StatutBL } from '@/services/commercial'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'
const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 h-[38px] outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

// ─── Modal Facturer ───────────────────────────────────────────────────────────

function ModalFacturer({
  blReference,
  clientNom,
  onClose,
  onConfirm,
  isPending,
}: {
  blReference: string
  clientNom:   string
  onClose:     () => void
  onConfirm:   (data: { date_echeance: string; notes: string }) => void
  isPending:   boolean
}) {
  const defaultDate = new Date()
  defaultDate.setDate(defaultDate.getDate() + 30)
  const [dateEcheance, setDateEcheance] = useState(defaultDate.toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative z-10 w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}
      >
        <header className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Receipt size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[--text-primary]">Créer la facture</h2>
              <p className="text-xs text-[--text-muted]">{blReference} · {clientNom}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[--text-muted] hover:text-[--text-primary] transition-colors">
            <X size={15} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-5">
            <div
              className="flex items-start gap-3 px-4 py-3 rounded-lg text-xs"
              style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
            >
              <Receipt size={13} className="flex-shrink-0 mt-0.5" />
              <p>Les lignes livrées seront copiées automatiquement avec les prix et remises de la commande.</p>
            </div>
            <div>
              <label className={FIELD_LABEL}>Date d'échéance *</label>
              <input
                type="date"
                value={dateEcheance}
                onChange={e => setDateEcheance(e.target.value)}
                className={SELECT_CLASS}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Commentaires, conditions particulières…"
                rows={3}
                className={SELECT_CLASS + ' h-auto py-2.5 resize-none leading-relaxed'}
              />
            </div>
          </div>
        </div>
        <footer className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            icon={<Receipt size={13} />}
            loading={isPending}
            disabled={!dateEcheance}
            onClick={() => onConfirm({ date_echeance: dateEcheance, notes })}
          >
            Créer la facture
          </Button>
        </footer>
      </div>
    </div>
  )
}

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutBL, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  prepare:  { variant: 'warning', label: 'Préparé'  },
  expedie:  { variant: 'accent',  label: 'Expédié'  },
  livre:    { variant: 'success', label: 'Livré'    },
  retourne: { variant: 'danger',  label: 'Retourné' },
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

export function BonLivraisonDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showFacturer, setShowFacturer] = useState(false)

  const { data: bl, isLoading } = useQuery({
    queryKey: ['bon-livraison', id],
    queryFn:  () => commercialApi.getBonLivraison(id!).then((r) => r.data),
    enabled:  !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bon-livraison', id] })
    qc.invalidateQueries({ queryKey: ['bons-livraison'] })
    qc.invalidateQueries({ queryKey: ['commandes-client'] })
  }

  const expedierMut = useMutation({
    mutationFn: () => commercialApi.expedierBL(id!),
    onSuccess:  () => { toast.success('BL expédié. Sortie stock enregistrée.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur — stock insuffisant possible'),
  })

  const confirmerMut = useMutation({
    mutationFn: () => commercialApi.confirmerLivraison(id!),
    onSuccess:  () => { toast.success('Livraison confirmée.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const facturerMut = useMutation({
    mutationFn: (data: { date_echeance: string; notes: string }) => commercialApi.facturer(id!, data),
    onSuccess:  (r) => {
      toast.success('Facture créée.')
      qc.invalidateQueries({ queryKey: ['factures-vente'] })
      navigate(`/commercial/factures/${r.data.facture_id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
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

  if (!bl) return (
    <div className="animate-fade-in px-6 py-16 text-center">
      <p className="text-sm text-[--text-secondary]">Bon de livraison introuvable.</p>
      <button className="mt-3 text-xs text-[--accent] hover:underline" onClick={() => navigate('/commercial/bons-livraison')}>
        Retour à la liste
      </button>
    </div>
  )

  const cfg = STATUT_CFG[bl.statut]

  return (
    <>
    {showFacturer && (
      <ModalFacturer
        blReference={bl.reference}
        clientNom={bl.client_nom}
        onClose={() => setShowFacturer(false)}
        onConfirm={(data) => facturerMut.mutate(data)}
        isPending={facturerMut.isPending}
      />
    )}
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/commercial/bons-livraison')}
            className="p-1.5 rounded-lg text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-dim)' }}
          >
            <Truck size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[--text-primary] font-data">{bl.reference}</h1>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <button
                className="text-xs text-[--accent] hover:underline font-data"
                onClick={() => navigate(`/commercial/commandes/${bl.commande}`)}
              >
                {bl.commande_reference}
              </button>
              <span className="text-xs text-[--text-muted]">{bl.client_nom}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bl.statut === 'prepare' && (
            <Button
              variant="primary" size="sm"
              icon={<Send size={13} />}
              loading={expedierMut.isPending}
              onClick={() => expedierMut.mutate()}
            >
              Expédier
            </Button>
          )}
          {bl.statut === 'expedie' && (
            <Button
              variant="primary" size="sm"
              icon={<CheckCircle2 size={13} />}
              loading={confirmerMut.isPending}
              onClick={() => confirmerMut.mutate()}
            >
              Confirmer livraison
            </Button>
          )}
          {(bl.statut === 'expedie' || bl.statut === 'livre') && (
            <Button
              variant="outline" size="sm"
              icon={<Receipt size={13} />}
              onClick={() => setShowFacturer(true)}
            >
              Facturer
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
            <InfoRow icon={<Calendar size={13} />} label="Préparation"    value={formatDate(bl.date_preparation)} />
            <InfoRow
              icon={<Calendar size={13} />}
              label="Expédition"
              value={bl.date_expedition ? formatDate(bl.date_expedition) : '—'}
            />
            <InfoRow
              icon={<Calendar size={13} />}
              label="Livraison confirmée"
              value={bl.date_livraison_confirmee ? formatDate(bl.date_livraison_confirmee) : '—'}
            />
          </div>

          {bl.notes && (
            <div className="surface rounded-xl p-5">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-2">Notes</p>
              <p className="text-xs text-[--text-secondary] whitespace-pre-wrap leading-relaxed">{bl.notes}</p>
            </div>
          )}
        </div>

        {/* Lignes */}
        <div className="col-span-2">
          <div className="surface rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Lignes livrées</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                  {['Article', 'Désignation', 'Lot', 'Quantité', 'Mouvement'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bl.lignes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center">
                      <Package size={24} className="mx-auto mb-2 text-[--text-muted]" />
                      <p className="text-xs text-[--text-muted]">Aucune ligne</p>
                    </td>
                  </tr>
                ) : bl.lignes.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: i < bl.lignes.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <td className="px-6 py-5">
                      <span className="font-data text-xs text-[--accent]">{l.article_code}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-xs text-[--text-primary]">{l.article_designation}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="font-data text-xs text-[--text-secondary]">{l.lot_numero ?? '—'}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="font-data text-xs font-semibold">{l.quantite}</span>
                    </td>
                    <td className="px-6 py-5">
                      {l.mouvement ? (
                        <span className="font-data text-[10px] px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
                          OK
                        </span>
                      ) : (
                        <span className="text-xs text-[--text-muted]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
