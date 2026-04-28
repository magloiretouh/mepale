/**
 * MEPALE ERP — Bons de Livraison
 * Liste + filtres + expédier / confirmer livraison / voir détail
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search, Plus, Truck, Filter, MoreHorizontal, ExternalLink,
  Send, CheckCircle2, X, Trash2,
} from 'lucide-react'

import {
  commercialApi,
  type BonLivraisonList as BLListType,
  type BonLivraisonCreatePayload,
  type LigneBLCreatePayload,
  type StatutBL,
} from '@/services/commercial'
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

const STATUT_CFG: Record<StatutBL, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  prepare:  { variant: 'warning', label: 'Préparé'  },
  expedie:  { variant: 'accent',  label: 'Expédié'  },
  livre:    { variant: 'success', label: 'Livré'    },
  retourne: { variant: 'danger',  label: 'Retourné' },
}

// ─── Modal Création BL ────────────────────────────────────────────────────────

interface LigneTmp {
  ligne_commande: string
  article:        string
  lot:            string
  quantite:       string
}

function BLCreateModal({
  onClose,
  onSave,
  isPending,
}: {
  onClose:   () => void
  onSave:    (data: BonLivraisonCreatePayload) => void
  isPending: boolean
}) {
  const [commande, setCommande]     = useState('')
  const [datePrepa, setDatePrepa]   = useState('')
  const [notes, setNotes]           = useState('')
  const [lignes, setLignes]         = useState<LigneTmp[]>([
    { ligne_commande: '', article: '', lot: '', quantite: '1' },
  ])

  // Fetch commande detail when commande selected
  const { data: commandeData } = useQuery({
    queryKey: ['commande-client', commande],
    queryFn:  () => commercialApi.getCommandeClient(commande).then((r) => r.data),
    enabled:  !!commande,
  })

  const { data: commandes } = useQuery({
    queryKey: ['commandes-client-confirmees'],
    queryFn:  () => commercialApi.listCommandesClient({ statut: 'confirmee', page_size: 200 }).then((r) => r.data.results),
  })

  // Auto-populate lines when commande is selected
  const handleCommandeChange = (commandeId: string) => {
    setCommande(commandeId)
    setLignes([{ ligne_commande: '', article: '', lot: '', quantite: '1' }])
  }

  const setLigne = (i: number, field: keyof LigneTmp, val: string) =>
    setLignes((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)))

  const handleSubmit = () => {
    if (!commande) { toast.error('Sélectionnez une commande'); return }
    const lignesValides = lignes.filter((l) => l.ligne_commande && l.article && Number(l.quantite) > 0)
    if (!lignesValides.length) { toast.error('Ajoutez au moins une ligne'); return }
    onSave({
      commande,
      date_preparation: datePrepa  || undefined,
      notes:            notes      || undefined,
      lignes: lignesValides.map((l): LigneBLCreatePayload => ({
        ligne_commande: l.ligne_commande,
        article:        l.article,
        lot:            l.lot || undefined,
        quantite:       Number(l.quantite),
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-3xl rounded-lg animate-scale-in flex flex-col overflow-hidden"
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
              <Truck size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouveau bon de livraison</h3>
              <p className="text-xs text-[--text-muted]">Créez un BL depuis une commande confirmée</p>
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
                  <label className={FIELD_LABEL}>Commande <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                  <select className={SELECT_CLASS} style={{ height: '36px' }} value={commande} onChange={(e) => handleCommandeChange(e.target.value)}>
                    <option value="">— Sélectionner une commande confirmée —</option>
                    {commandes?.map((c) => (
                      <option key={c.id} value={c.id}>{c.reference} — {c.client_nom}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>Date de préparation</label>
                  <Input type="date" value={datePrepa} onChange={(e) => setDatePrepa(e.target.value)} />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Notes</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions de livraison…" />
                </div>
              </div>
            </div>

            {commande && commandeData && (
              <>
                <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Lignes</p>
                    <Button variant="ghost" size="xs" icon={<Plus size={11} />}
                      onClick={() => setLignes((p) => [...p, { ligne_commande: '', article: '', lot: '', quantite: '1' }])}>
                      Ajouter
                    </Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Ligne CC', 'Article', 'Lot', 'Quantité', ''].map((h) => (
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
                              value={l.ligne_commande}
                              onChange={(e) => {
                                const ligneCC = commandeData.lignes.find((lcc) => lcc.id === e.target.value)
                                setLigne(i, 'ligne_commande', e.target.value)
                                if (ligneCC) setLigne(i, 'article', ligneCC.article)
                              }}
                            >
                              <option value="">— Sélectionner —</option>
                              {commandeData.lignes.map((lcc) => (
                                <option key={lcc.id} value={lcc.id}>
                                  {lcc.article_code} (reste : {lcc.quantite_restante} {lcc.unite_code})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-1 w-28">
                            <Input value={l.article} readOnly className="font-data text-xs opacity-70" />
                          </td>
                          <td className="py-2 px-1 w-28">
                            <Input
                              value={l.lot}
                              onChange={(e) => setLigne(i, 'lot', e.target.value)}
                              placeholder="N° lot"
                              className="font-data"
                            />
                          </td>
                          <td className="py-2 px-1 w-24">
                            <Input
                              type="number" min={0} step="0.001"
                              value={l.quantite}
                              onChange={(e) => setLigne(i, 'quantite', e.target.value)}
                              className="font-data"
                            />
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
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>Créer le BL</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Menu actions ─────────────────────────────────────────────────────────────

function ActionMenu({
  bl,
  onView,
  onExpedier,
  onConfirmerLivraison,
}: {
  bl:                  BLListType
  onView:              () => void
  onExpedier:          () => void
  onConfirmerLivraison: () => void
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
        {item('Voir le détail', <ExternalLink size={13} style={{ color: 'var(--accent)' }} />, onView)}
        {(bl.statut === 'prepare' || bl.statut === 'expedie') && (
          <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
        )}
        {bl.statut === 'prepare'  && item('Expédier', <Send size={13} style={{ color: 'var(--accent)' }} />, onExpedier)}
        {bl.statut === 'expedie'  && item('Confirmer livraison', <CheckCircle2 size={13} style={{ color: 'var(--status-success)' }} />, onConfirmerLivraison)}
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

type FiltreStatut = 'tous' | StatutBL

const FILTRES: { label: string; value: FiltreStatut }[] = [
  { label: 'Tous',      value: 'tous'     },
  { label: 'Préparés',  value: 'prepare'  },
  { label: 'Expédiés',  value: 'expedie'  },
  { label: 'Livrés',    value: 'livre'    },
  { label: 'Retournés', value: 'retourne' },
]

export function BonLivraisonList() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [search, setSearch]       = useState('')
  const [filtre, setFiltre]       = useState<FiltreStatut>('tous')
  const [showModal, setShowModal] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bons-livraison'] })

  const params: Record<string, string> = {}
  if (search)          params.search = search
  if (filtre !== 'tous') params.statut = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['bons-livraison', search, filtre],
    queryFn:  () => commercialApi.listBonsLivraison(params),
    select:   (r) => r.data,
  })

  const createMut = useMutation({
    mutationFn: (data: BonLivraisonCreatePayload) => commercialApi.createBonLivraison(data),
    onSuccess:  () => { toast.success('BL créé.'); invalidate(); setShowModal(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const expedierMut = useMutation({
    mutationFn: (id: string) => commercialApi.expedierBL(id),
    onSuccess:  () => { toast.success('BL expédié. Sortie stock créée.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Stock insuffisant ou erreur'),
  })

  const confirmerMut = useMutation({
    mutationFn: (id: string) => commercialApi.confirmerLivraison(id),
    onSuccess:  () => { toast.success('Livraison confirmée.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const bls = data?.results ?? []

  return (
    <>
      {showModal && (
        <BLCreateModal
          onClose={() => setShowModal(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}

      <div className="space-y-5 animate-fade-in">

        {/* Header standalone */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Bons de livraison</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">{data?.count ?? 0} BL</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>
            Nouveau BL
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
              placeholder="Référence, commande, client…"
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
              {['Référence', 'Commande', 'Client', 'Préparation', 'Expédition', 'Statut', ''].map((h) => (
                <th key={h} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-6 py-5">
                        <div className="skeleton h-4 rounded" style={{ width: `${50 + j * 8}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : bls.length === 0
              ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Truck size={32} className="mx-auto mb-3 text-[--text-muted]" />
                    <p className="text-sm text-[--text-secondary]">Aucun bon de livraison trouvé</p>
                  </td>
                </tr>
              )
              : bls.map((bl) => (
                <tr
                  key={bl.id}
                  className="group hover:bg-[--bg-elevated] transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onClick={() => navigate(`/commercial/bons-livraison/${bl.id}`)}
                >
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold text-[--accent]">{bl.reference}</span>
                  </td>
                  <td className="px-6 py-5">
                    <button
                      className="font-data text-xs text-[--accent] hover:underline"
                      onClick={(e) => { e.stopPropagation(); navigate(`/commercial/commandes/${bl.commande}`) }}
                    >
                      {bl.commande_reference}
                    </button>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs font-medium text-[--text-primary]">{bl.client_nom}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{formatDate(bl.date_preparation)}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">
                      {bl.date_expedition ? formatDate(bl.date_expedition) : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <Badge variant={STATUT_CFG[bl.statut].variant}>{STATUT_CFG[bl.statut].label}</Badge>
                  </td>
                  <td className="px-6 py-5">
                    <ActionMenu
                      bl={bl}
                      onView={() => navigate(`/commercial/bons-livraison/${bl.id}`)}
                      onExpedier={() => expedierMut.mutate(bl.id)}
                      onConfirmerLivraison={() => confirmerMut.mutate(bl.id)}
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
