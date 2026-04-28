/**
 * MEPALE ERP — Factures Vente
 * Liste + indicateurs de retard + émettre / ajouter règlement
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search, Plus, Receipt, Filter, MoreHorizontal, ExternalLink,
  Send, CreditCard, AlertTriangle, AlertCircle, X, Trash2,
  Truck, PenLine, ChevronRight,
} from 'lucide-react'

import {
  commercialApi,
  type FactureVenteList as FVListType,
  type BonLivraisonList,
  type FactureVenteCreatePayload,
  type LigneFVCreatePayload,
  type AjouterReglementPayload,
  type StatutFacture,
  type NiveauRetard,
  type ModePaiementReglem,
} from '@/services/commercial'
import { productionApi, type Article } from '@/services/production'
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

// ─── Types internes ───────────────────────────────────────────────────────────

interface LigneTmp {
  article?:      string
  designation:   string
  quantite:      string
  prix_unitaire: string
  remise_pct:    string
}

const EMPTY_LIGNE: LigneTmp = { article: '', designation: '', quantite: '1', prix_unitaire: '0', remise_pct: '0' }

// ─── Modal Choix du mode ──────────────────────────────────────────────────────

function ChoixModeModal({
  onClose,
  onManuel,
  onDepuisBL,
}: {
  onClose:    () => void
  onManuel:   () => void
  onDepuisBL: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative z-10 w-full max-w-sm flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold text-[--text-primary]">Nouvelle facture</h2>
          <button onClick={onClose} className="p-1 rounded text-[--text-muted] hover:text-[--text-primary] transition-colors">
            <X size={15} />
          </button>
        </header>
        <div className="p-4 flex flex-col gap-3">
          <button
            onClick={onDepuisBL}
            className="flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all hover:scale-[1.01]"
            style={{ backgroundColor: 'var(--accent-dim)', border: '1px solid var(--accent)' }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent)' }}>
              <Truck size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Depuis un bon de livraison</p>
              <p className="text-xs text-[--text-muted] mt-0.5">Lignes copiées automatiquement</p>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--accent)' }} />
          </button>
          <button
            onClick={onManuel}
            className="flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all hover:bg-[--bg-elevated]"
            style={{ border: '1px solid var(--border)' }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <PenLine size={16} className="text-[--text-secondary]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[--text-primary]">Saisie manuelle</p>
              <p className="text-xs text-[--text-muted] mt-0.5">Lignes à saisir librement</p>
            </div>
            <ChevronRight size={14} className="text-[--text-muted]" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Depuis BL ─────────────────────────────────────────────────────────

function DepuisBLModal({
  onClose,
  onConfirm,
  isPending,
}: {
  onClose:   () => void
  onConfirm: (blId: string, data: { date_echeance: string; notes: string }) => void
  isPending: boolean
}) {
  const { data: bls } = useQuery({
    queryKey: ['bls-facturables'],
    queryFn:  () => commercialApi.listBonsLivraison({ page_size: 300 }).then(r =>
      r.data.results.filter((b: BonLivraisonList) => b.statut === 'expedie' || b.statut === 'livre')
    ),
  })

  const defaultDate = new Date()
  defaultDate.setDate(defaultDate.getDate() + 30)

  const [blId, setBlId]               = useState('')
  const [dateEcheance, setDateEch]    = useState(defaultDate.toISOString().slice(0, 10))
  const [notes, setNotes]             = useState('')

  const selectedBL = (bls as BonLivraisonList[] | undefined)?.find(b => b.id === blId)
  const canSubmit = blId && dateEcheance

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative z-10 w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}
      >
        <header className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Truck size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[--text-primary]">Depuis un bon de livraison</h2>
              <p className="text-xs text-[--text-muted]">Les lignes livrées seront copiées automatiquement</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[--text-muted] hover:text-[--text-primary] transition-colors">
            <X size={15} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-5">
            <div>
              <label className={FIELD_LABEL}>Bon de livraison *</label>
              <select
                value={blId}
                onChange={e => setBlId(e.target.value)}
                className={SELECT_CLASS}
                style={{ height: '38px' }}
              >
                <option value="">— Sélectionner un BL —</option>
                {(bls as BonLivraisonList[] | undefined)?.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.reference} · {b.client_nom} ({b.statut === 'expedie' ? 'Expédié' : 'Livré'})
                  </option>
                ))}
              </select>
              {bls?.length === 0 && (
                <p className="mt-1.5 text-xs text-[--text-muted]">Aucun BL expédié ou livré disponible.</p>
              )}
            </div>

            {selectedBL && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <Truck size={13} className="text-[--text-muted] flex-shrink-0" />
                <div className="text-xs text-[--text-secondary]">
                  <span className="font-data font-semibold text-[--text-primary]">{selectedBL.commande_reference}</span>
                  {' · '}{selectedBL.client_nom}
                </div>
              </div>
            )}

            <div>
              <label className={FIELD_LABEL}>Date d'échéance *</label>
              <input
                type="date"
                value={dateEcheance}
                onChange={e => setDateEch(e.target.value)}
                className={SELECT_CLASS}
                style={{ height: '38px' }}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Commentaires, conditions…"
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
            disabled={!canSubmit}
            onClick={() => onConfirm(blId, { date_echeance: dateEcheance, notes })}
          >
            Créer la facture
          </Button>
        </footer>
      </div>
    </div>
  )
}

// ─── Modal Création Facture ───────────────────────────────────────────────────

function FVCreateModal({
  onClose,
  onSave,
  isPending,
}: {
  onClose:   () => void
  onSave:    (data: FactureVenteCreatePayload) => void
  isPending: boolean
}) {
  const [client, setClient]       = useState('')
  const [dateEcheance, setDate]   = useState('')
  const [notes, setNotes]         = useState('')
  const [lignes, setLignes]       = useState<LigneTmp[]>([{ ...EMPTY_LIGNE }])

  const { data: articles } = useQuery({
    queryKey: ['articles-select'],
    queryFn:  () => productionApi.listArticles({ page_size: 200 }).then((r) => r.data.results),
  })

  const { data: clients } = useQuery({
    queryKey: ['clients-select'],
    queryFn:  () => commercialApi.listClients({ page_size: 200, statut: 'actif' }).then((r) => r.data.results),
  })

  const setLigne = (i: number, field: keyof LigneTmp, val: string) =>
    setLignes((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)))

  const handleArticleChange = (i: number, articleId: string) => {
    setLigne(i, 'article', articleId)
    const art = articles?.find((a: Article) => a.id === articleId)
    if (art) {
      setLigne(i, 'designation', art.designation)
      if (art.prix_standard) setLigne(i, 'prix_unitaire', String(art.prix_standard))
    }
  }

  const handleSubmit = () => {
    if (!client)       { toast.error('Sélectionnez un client'); return }
    if (!dateEcheance) { toast.error("La date d'échéance est obligatoire"); return }
    const lignesValides = lignes.filter((l) => l.designation.trim() && Number(l.quantite) > 0)
    if (!lignesValides.length) { toast.error('Ajoutez au moins une ligne'); return }
    onSave({
      client,
      date_echeance: dateEcheance,
      notes:         notes || undefined,
      lignes: lignesValides.map((l): LigneFVCreatePayload => ({
        article:       l.article || undefined,
        designation:   l.designation,
        quantite:      Number(l.quantite),
        prix_unitaire: Number(l.prix_unitaire),
        remise_pct:    Number(l.remise_pct) || undefined,
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-3xl rounded-lg animate-scale-in flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Receipt size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouvelle facture vente</h3>
              <p className="text-xs text-[--text-muted]">Créez une facture client</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1"><X size={15} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">Informations générales</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Client <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                  <select className={SELECT_CLASS} style={{ height: '36px' }} value={client} onChange={(e) => setClient(e.target.value)}>
                    <option value="">— Sélectionner un client —</option>
                    {clients?.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.raison_sociale}</option>)}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>Date d'échéance <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                  <Input type="date" value={dateEcheance} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Notes</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commentaires…" />
                </div>
              </div>
            </div>
            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Lignes</p>
                <Button variant="ghost" size="xs" icon={<Plus size={11} />} onClick={() => setLignes((p) => [...p, { ...EMPTY_LIGNE }])}>Ajouter</Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Article', 'Qté', 'P.U.', 'Remise %', ''].map((h) => (
                      <th key={h} className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left px-1">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="py-2 px-1">
                        <select className={SELECT_CLASS} style={{ height: '34px' }} value={l.article ?? ''} onChange={(e) => handleArticleChange(i, e.target.value)}>
                          <option value="">— Libre —</option>
                          {articles?.map((a: Article) => <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-1 w-20">
                        <Input type="number" min={0} step="0.001" value={l.quantite} onChange={(e) => setLigne(i, 'quantite', e.target.value)} className="font-data" />
                      </td>
                      <td className="py-2 px-1 w-28">
                        <Input type="number" min={0} value={l.prix_unitaire} onChange={(e) => setLigne(i, 'prix_unitaire', e.target.value)} className="font-data" />
                      </td>
                      <td className="py-2 px-1 w-16">
                        <Input type="number" min={0} max={100} value={l.remise_pct} onChange={(e) => setLigne(i, 'remise_pct', e.target.value)} className="font-data" />
                      </td>
                      <td className="py-2 px-1 w-8">
                        {lignes.length > 1 && (
                          <button onClick={() => setLignes((p) => p.filter((_, idx) => idx !== i))}
                            className="p-1 rounded text-[--text-muted] hover:text-[--status-danger] transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>Créer la facture</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutFacture, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon:           { variant: 'neutral', label: 'Brouillon'     },
  emise:               { variant: 'accent',  label: 'Émise'         },
  partiellement_payee: { variant: 'warning', label: 'Part. payée'   },
  payee:               { variant: 'success', label: 'Payée'         },
  annulee:             { variant: 'danger',  label: 'Annulée'       },
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

// ─── Modal Règlement rapide ───────────────────────────────────────────────────

function ReglementModal({
  facture,
  onClose,
  onSave,
  isPending,
}: {
  facture:   FVListType
  onClose:   () => void
  onSave:    (data: AjouterReglementPayload) => void
  isPending: boolean
}) {
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [montant, setMontant]   = useState(facture.montant_restant)
  const [mode, setMode]         = useState<ModePaiementReglem>('virement')
  const [ref, setRef]           = useState('')
  const [notes, setNotes]       = useState('')

  const handleSubmit = () => {
    if (!date)                      { toast.error('Date obligatoire'); return }
    if (Number(montant) <= 0)       { toast.error('Montant invalide'); return }
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
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Ajouter un règlement</h3>
              <p className="text-xs text-[--text-muted] font-data">{facture.reference}</p>
            </div>
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
                {formatXOF(Number(facture.montant_restant))}
              </span>
            </div>
            <div>
              <label className={FIELD_LABEL}>Date de règlement <span style={{ color: 'var(--status-danger)' }}>*</span></label>
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

// ─── Menu actions ─────────────────────────────────────────────────────────────

function ActionMenu({
  facture,
  onView,
  onEmettre,
  onReglement,
}: {
  facture:     FVListType
  onView:      () => void
  onEmettre:   () => void
  onReglement: () => void
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

  const item = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button
      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]"
      onClick={() => { setOpen(false); onClick() }}
    >
      {icon}{label}
    </button>
  )

  const dropdown = rect && open && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
      <div
        className="rounded-md py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position:        'fixed',
          top:    rect.bottom + 200 < window.innerHeight ? rect.bottom + 4 : undefined,
          bottom: rect.bottom + 200 < window.innerHeight ? undefined : window.innerHeight - rect.top + 4,
          left:            rect.right - 208,
          width:           208,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {item('Voir la facture', <ExternalLink size={13} style={{ color: 'var(--accent)' }} />, onView)}
        {(facture.statut === 'brouillon' || ['emise', 'partiellement_payee'].includes(facture.statut)) && (
          <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
        )}
        {facture.statut === 'brouillon' && item('Émettre', <Send size={13} style={{ color: 'var(--accent)' }} />, onEmettre)}
        {['emise', 'partiellement_payee'].includes(facture.statut) && item('Ajouter règlement', <CreditCard size={13} style={{ color: 'var(--status-success)' }} />, onReglement)}
      </div>
    </>,
    document.body
  )

  return (
    <>
      {dropdown}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="w-7 h-7 rounded flex items-center justify-center text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
      >
        <MoreHorizontal size={14} />
      </button>
    </>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

type FiltreStatut = 'tous' | StatutFacture | 'en_retard'

const FILTRES: { label: string; value: FiltreStatut }[] = [
  { label: 'Toutes',      value: 'tous'                },
  { label: 'Brouillon',   value: 'brouillon'           },
  { label: 'Émises',      value: 'emise'               },
  { label: 'Part. payées', value: 'partiellement_payee' },
  { label: 'Payées',      value: 'payee'               },
  { label: 'En retard',   value: 'en_retard'           },
]

export function FactureVenteList() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [search, setSearch]             = useState('')
  const [filtre, setFiltre]             = useState<FiltreStatut>('tous')
  const [showChoix, setShowChoix]       = useState(false)
  const [showCreate, setShowCreate]     = useState(false)
  const [showDepuisBL, setShowDepuisBL] = useState(false)
  const [reglementTarget, setRegTarget] = useState<FVListType | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['factures-vente'] })

  const params: Record<string, string> = {}
  if (search)               params.search    = search
  if (filtre === 'en_retard') params.en_retard = 'true'
  else if (filtre !== 'tous') params.statut  = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['factures-vente', search, filtre],
    queryFn:  () => commercialApi.listFacturesVente(params),
    select:   (r) => r.data,
  })

  const createMut = useMutation({
    mutationFn: (data: FactureVenteCreatePayload) => commercialApi.createFactureVente(data),
    onSuccess:  () => { toast.success('Facture créée.'); invalidate(); setShowCreate(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const facturerBLMut = useMutation({
    mutationFn: ({ blId, data }: { blId: string; data: { date_echeance: string; notes: string } }) =>
      commercialApi.facturer(blId, data),
    onSuccess: (r) => {
      toast.success('Facture créée.')
      invalidate()
      setShowDepuisBL(false)
      navigate(`/commercial/factures/${r.data.facture_id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const emettresMut = useMutation({
    mutationFn: (id: string) => commercialApi.emettreFacture(id),
    onSuccess:  () => { toast.success('Facture émise.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const reglementMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AjouterReglementPayload }) =>
      commercialApi.ajouterReglement(id, data),
    onSuccess:  () => { toast.success('Règlement enregistré.'); invalidate(); setRegTarget(null) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const factures = data?.results ?? []

  return (
    <>
      {showChoix && (
        <ChoixModeModal
          onClose={() => setShowChoix(false)}
          onManuel={() => { setShowChoix(false); setShowCreate(true) }}
          onDepuisBL={() => { setShowChoix(false); setShowDepuisBL(true) }}
        />
      )}
      {showCreate && (
        <FVCreateModal
          onClose={() => setShowCreate(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}
      {showDepuisBL && (
        <DepuisBLModal
          onClose={() => setShowDepuisBL(false)}
          onConfirm={(blId, data) => facturerBLMut.mutate({ blId, data })}
          isPending={facturerBLMut.isPending}
        />
      )}
      {reglementTarget && (
        <ReglementModal
          facture={reglementTarget}
          onClose={() => setRegTarget(null)}
          onSave={(d) => reglementMut.mutate({ id: reglementTarget.id, data: d })}
          isPending={reglementMut.isPending}
        />
      )}

      <div className="space-y-5 animate-fade-in">

        {/* Header standalone */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Factures vente</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">{data?.count ?? 0} facture{(data?.count ?? 0) > 1 ? 's' : ''}</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowChoix(true)}>
            Nouvelle facture
          </Button>
        </div>

        {/* Table card */}
        <div className="surface overflow-hidden">

        <div
          className="flex items-center gap-3 px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-64">
            <Input
              placeholder="Référence, client…"
              icon={<Search size={13} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-[--text-muted] mr-1" />
            {FILTRES.map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltre(f.value)}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all',
                  filtre === f.value
                    ? f.value === 'en_retard' ? 'text-[--status-danger]' : 'text-[--accent]'
                    : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
                )}
                style={
                  filtre === f.value
                    ? f.value === 'en_retard'
                      ? { backgroundColor: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)' }
                      : { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                    : { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                }
              >
                {f.value === 'en_retard' && <AlertTriangle size={10} className="inline mr-1" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left" style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
              {['Référence', 'Client', 'Montant HT', 'Réglé', 'Restant', 'Échéance', 'Statut', ''].map((h) => (
                <th key={h} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-6 py-5">
                        <div className="skeleton h-4 rounded" style={{ width: `${50 + j * 6}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : factures.length === 0
              ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Receipt size={32} className="mx-auto mb-3 text-[--text-muted]" />
                    <p className="text-sm text-[--text-secondary]">Aucune facture trouvée</p>
                  </td>
                </tr>
              )
              : factures.map((f) => (
                <tr
                  key={f.id}
                  className="group hover:bg-[--bg-elevated] transition-colors cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: f.est_en_retard && f.niveau_retard === 'danger' ? 'rgba(var(--status-danger-rgb, 239 68 68) / 0.03)' : undefined,
                  }}
                  onClick={() => navigate(`/commercial/factures/${f.id}`)}
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-1.5">
                      {f.est_en_retard && f.niveau_retard === 'danger' && (
                        <AlertCircle size={12} style={{ color: 'var(--status-danger)', flexShrink: 0 }} />
                      )}
                      {f.est_en_retard && f.niveau_retard === 'soon' && (
                        <AlertTriangle size={12} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />
                      )}
                      <span className="font-data text-xs font-semibold text-[--accent]">{f.reference}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs font-medium text-[--text-primary]">{f.client_nom}</p>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold">{formatXOF(Number(f.montant_ht))}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-data text-xs" style={{ color: 'var(--status-success)' }}>
                      {formatXOF(Number(f.montant_regle))}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className="font-data text-xs"
                      style={{ color: Number(f.montant_restant) > 0 ? 'var(--status-warning)' : 'var(--text-muted)' }}
                    >
                      {formatXOF(Number(f.montant_restant))}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div>
                      <span
                        className="text-xs"
                        style={{ color: RETARD_COLOR[f.niveau_retard] }}
                      >
                        {formatDate(f.date_echeance)}
                      </span>
                      {f.est_en_retard && (
                        <p className="text-[10px] font-semibold" style={{ color: RETARD_COLOR[f.niveau_retard] }}>
                          +{f.jours_retard}j
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <Badge variant={STATUT_CFG[f.statut].variant}>{STATUT_CFG[f.statut].label}</Badge>
                  </td>
                  <td className="px-6 py-5">
                    <ActionMenu
                      facture={f}
                      onView={() => navigate(`/commercial/factures/${f.id}`)}
                      onEmettre={() => emettresMut.mutate(f.id)}
                      onReglement={() => setRegTarget(f)}
                    />
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
        </div>
      </div>
    </>
  )
}
