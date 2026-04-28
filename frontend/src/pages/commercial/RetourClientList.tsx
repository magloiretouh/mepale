/**
 * MEPALE ERP — Retours / SAV
 * Liste + filtres + créer / approuver / recevoir / traiter
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search, Plus, RotateCcw, Filter, MoreHorizontal, ExternalLink,
  CheckCircle2, PackageCheck, Wrench, X, Trash2,
} from 'lucide-react'

import {
  commercialApi,
  type RetourClientList as RetourListType,
  type RetourClientCreatePayload,
  type LigneRetourCreatePayload,
  type StatutRetour,
  type EtatRetour,
  type ActionRetour,
} from '@/services/commercial'
import { productionApi, type Article } from '@/services/production'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutRetour, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  demande:  { variant: 'warning', label: 'Demandé'  },
  approuve: { variant: 'accent',  label: 'Approuvé' },
  recu:     { variant: 'info',    label: 'Reçu'     },
  traite:   { variant: 'success', label: 'Traité'   },
}

const ETAT_OPTIONS: { value: EtatRetour; label: string }[] = [
  { value: 'bon',             label: 'Bon état'        },
  { value: 'defectueux',      label: 'Défectueux'      },
  { value: 'a_reconditionner', label: 'À reconditionner' },
]

const ACTION_OPTIONS: { value: ActionRetour; label: string }[] = [
  { value: 'remise_en_stock', label: 'Remise en stock' },
  { value: 'mise_en_rebut',   label: 'Mise en rebut'  },
  { value: 'renvoi_client',   label: 'Renvoi client'  },
]

// ─── Types internes ───────────────────────────────────────────────────────────

interface LigneTmp {
  article:  string
  lot:      string
  quantite: string
  etat:     EtatRetour
  action:   ActionRetour
}

const EMPTY_LIGNE: LigneTmp = { article: '', lot: '', quantite: '1', etat: 'defectueux', action: 'remise_en_stock' }

// ─── Modal Création Retour ────────────────────────────────────────────────────

function RetourCreateModal({
  onClose,
  onSave,
  isPending,
}: {
  onClose:   () => void
  onSave:    (data: RetourClientCreatePayload) => void
  isPending: boolean
}) {
  const [client, setClient]     = useState('')
  const [motif, setMotif]       = useState('')
  const [notes, setNotes]       = useState('')
  const [lignes, setLignes]     = useState<LigneTmp[]>([{ ...EMPTY_LIGNE }])

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

  const handleSubmit = () => {
    if (!client) { toast.error('Sélectionnez un client'); return }
    if (!motif.trim()) { toast.error('Le motif est obligatoire'); return }
    const lignesValides = lignes.filter((l) => l.article && Number(l.quantite) > 0)
    if (!lignesValides.length) { toast.error('Ajoutez au moins une ligne'); return }
    onSave({
      client,
      motif,
      notes: notes || undefined,
      lignes: lignesValides.map((l): LigneRetourCreatePayload => ({
        article:  l.article,
        lot:      l.lot || undefined,
        quantite: Number(l.quantite),
        etat:     l.etat,
        action:   l.action,
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-4xl rounded-lg animate-scale-in flex flex-col overflow-hidden"
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
              <RotateCcw size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouveau retour / SAV</h3>
              <p className="text-xs text-[--text-muted]">Enregistrez une demande de retour client</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1">
            <X size={15} />
          </button>
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
                    {clients?.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.raison_sociale}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Motif <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                  <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Raison du retour…" />
                </div>
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Notes internes</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations complémentaires…" />
                </div>
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Articles retournés</p>
                <Button variant="ghost" size="xs" icon={<Plus size={11} />}
                  onClick={() => setLignes((p) => [...p, { ...EMPTY_LIGNE }])}>
                  Ajouter
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Article', 'Lot', 'Qté', 'État', 'Action', ''].map((h) => (
                      <th key={h} className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left px-1">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="py-2 px-1">
                        <select
                          className={SELECT_CLASS}
                          style={{ height: '34px' }}
                          value={l.article}
                          onChange={(e) => setLigne(i, 'article', e.target.value)}
                        >
                          <option value="">— Article —</option>
                          {articles?.map((a: Article) => (
                            <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-1 w-24">
                        <Input value={l.lot} onChange={(e) => setLigne(i, 'lot', e.target.value)} placeholder="Lot" className="font-data" />
                      </td>
                      <td className="py-2 px-1 w-20">
                        <Input type="number" min={0} step="0.001" value={l.quantite}
                          onChange={(e) => setLigne(i, 'quantite', e.target.value)} className="font-data" />
                      </td>
                      <td className="py-2 px-1 w-36">
                        <select className={SELECT_CLASS} style={{ height: '34px' }} value={l.etat}
                          onChange={(e) => setLigne(i, 'etat', e.target.value)}>
                          {ETAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-1 w-40">
                        <select className={SELECT_CLASS} style={{ height: '34px' }} value={l.action}
                          onChange={(e) => setLigne(i, 'action', e.target.value)}>
                          {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-1 w-8">
                        {lignes.length > 1 && (
                          <button
                            onClick={() => setLignes((p) => p.filter((_, idx) => idx !== i))}
                            className="p-1 rounded text-[--text-muted] hover:text-[--status-danger] transition-colors"
                          >
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
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>Créer le retour</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Menu actions ─────────────────────────────────────────────────────────────

function ActionMenu({
  retour,
  onApprouver,
  onRecevoir,
  onTraiter,
}: {
  retour:      RetourListType
  onApprouver: () => void
  onRecevoir:  () => void
  onTraiter:   () => void
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

  const hasActions = retour.statut !== 'traite'

  const dropdown = rect && open && hasActions && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
      <div
        className="rounded-md py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position:        'fixed',
          top:    rect.bottom + 200 < window.innerHeight ? rect.bottom + 4 : undefined,
          bottom: rect.bottom + 200 < window.innerHeight ? undefined : window.innerHeight - rect.top + 4,
          left:            rect.right - 176,
          width:           176,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {retour.statut === 'demande'  && item('Approuver',         <CheckCircle2  size={13} style={{ color: 'var(--status-success)' }} />, onApprouver)}
        {retour.statut === 'approuve' && item('Marquer reçu',      <PackageCheck  size={13} style={{ color: 'var(--accent)' }} />, onRecevoir)}
        {retour.statut === 'recu'     && item('Traiter le retour', <Wrench        size={13} style={{ color: 'var(--accent)' }} />, onTraiter)}
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
        disabled={!hasActions}
        style={!hasActions ? { opacity: 0.3, cursor: 'default' } : {}}
      >
        <MoreHorizontal size={14} />
      </button>
    </>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

type FiltreStatut = 'tous' | StatutRetour

const FILTRES: { label: string; value: FiltreStatut }[] = [
  { label: 'Tous',      value: 'tous'     },
  { label: 'Demandés',  value: 'demande'  },
  { label: 'Approuvés', value: 'approuve' },
  { label: 'Reçus',     value: 'recu'     },
  { label: 'Traités',   value: 'traite'   },
]

export function RetourClientList() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [search, setSearch]       = useState('')
  const [filtre, setFiltre]       = useState<FiltreStatut>('tous')
  const [showModal, setShowModal] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['retours-client'] })

  const params: Record<string, string> = {}
  if (search)          params.search = search
  if (filtre !== 'tous') params.statut = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['retours-client', search, filtre],
    queryFn:  () => commercialApi.listRetoursClient(params),
    select:   (r) => r.data,
  })

  const createMut = useMutation({
    mutationFn: (data: RetourClientCreatePayload) => commercialApi.createRetourClient(data),
    onSuccess:  () => { toast.success('Retour créé.'); invalidate(); setShowModal(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const approuverMut = useMutation({
    mutationFn: (id: string) => commercialApi.approuverRetour(id),
    onSuccess:  () => { toast.success('Retour approuvé.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const recevoirMut = useMutation({
    mutationFn: (id: string) => commercialApi.recevoirRetour(id),
    onSuccess:  () => { toast.success('Retour marqué reçu.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const traiterMut = useMutation({
    mutationFn: (id: string) => commercialApi.traiterRetour(id),
    onSuccess:  () => { toast.success('Retour traité. Mouvements créés.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const retours = data?.results ?? []

  return (
    <>
      {showModal && (
        <RetourCreateModal
          onClose={() => setShowModal(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}

      <div className="space-y-5 animate-fade-in">

        {/* Header standalone */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Retours / SAV</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">{data?.count ?? 0} retour{(data?.count ?? 0) > 1 ? 's' : ''}</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>
            Nouveau retour
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
                    ? 'text-[--accent]'
                    : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
                )}
                style={
                  filtre === f.value
                    ? { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                    : { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left" style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
              {['Référence', 'Client', 'Motif', 'Date demande', 'Statut', ''].map((h) => (
                <th key={h} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-6 py-5">
                        <div className="skeleton h-4 rounded" style={{ width: `${50 + j * 9}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : retours.length === 0
              ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <RotateCcw size={32} className="mx-auto mb-3 text-[--text-muted]" />
                    <p className="text-sm text-[--text-secondary]">Aucun retour enregistré</p>
                  </td>
                </tr>
              )
              : retours.map((r) => (
                <tr
                  key={r.id}
                  className="group hover:bg-[--bg-elevated] transition-colors"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold text-[--accent]">{r.reference}</span>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs font-medium text-[--text-primary]">{r.client_nom}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs text-[--text-secondary] truncate max-w-[220px]">{r.motif_court}</p>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{formatDate(r.date_demande)}</span>
                  </td>
                  <td className="px-6 py-5">
                    <Badge variant={STATUT_CFG[r.statut].variant}>{STATUT_CFG[r.statut].label}</Badge>
                  </td>
                  <td className="px-6 py-5">
                    <ActionMenu
                      retour={r}
                      onApprouver={() => approuverMut.mutate(r.id)}
                      onRecevoir={() => recevoirMut.mutate(r.id)}
                      onTraiter={() => traiterMut.mutate(r.id)}
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
