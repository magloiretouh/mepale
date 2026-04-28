/**
 * MEPALE ERP — Commandes Client
 * Liste + filtres + créer / confirmer / annuler / voir détail
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search, Plus, ClipboardList, Filter, MoreHorizontal, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, X, Trash2,
} from 'lucide-react'

import {
  commercialApi,
  type CommandeClientList as CCListType,
  type CommandeClientCreatePayload,
  type LigneCCCreatePayload,
  type StatutCC,
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

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutCC, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon:            { variant: 'neutral', label: 'Brouillon'     },
  confirmee:            { variant: 'accent',  label: 'Confirmée'     },
  en_cours_livraison:   { variant: 'warning', label: 'En livraison'  },
  partiellement_livree: { variant: 'info',    label: 'Part. livrée'  },
  livree:               { variant: 'success', label: 'Livrée'        },
  annulee:              { variant: 'danger',  label: 'Annulée'       },
}

// ─── Types internes ───────────────────────────────────────────────────────────

interface LigneTmp {
  article:           string
  quantite_commandee: string
  prix_unitaire:     string
  remise_pct:        string
}

const EMPTY_LIGNE: LigneTmp = { article: '', quantite_commandee: '1', prix_unitaire: '0', remise_pct: '0' }

// ─── Modal Création CC ────────────────────────────────────────────────────────

function CCCreateModal({
  onClose,
  onSave,
  isPending,
}: {
  onClose:   () => void
  onSave:    (data: CommandeClientCreatePayload) => void
  isPending: boolean
}) {
  const [client, setClient]           = useState('')
  const [dateLivraison, setDateLiv]   = useState('')
  const [condPaiement, setCondPay]    = useState('')
  const [notesClient, setNotes]       = useState('')
  const [lignes, setLignes]           = useState<LigneTmp[]>([{ ...EMPTY_LIGNE }])

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
    if (art?.prix_standard) setLigne(i, 'prix_unitaire', String(art.prix_standard))
  }

  const handleSubmit = () => {
    if (!client) { toast.error('Sélectionnez un client'); return }
    const lignesValides = lignes.filter((l) => l.article && Number(l.quantite_commandee) > 0)
    if (!lignesValides.length) { toast.error('Ajoutez au moins une ligne'); return }
    onSave({
      client,
      date_livraison_souhaitee: dateLivraison || undefined,
      conditions_paiement:      condPaiement  || undefined,
      notes_client:             notesClient   || undefined,
      lignes: lignesValides.map((l): LigneCCCreatePayload => ({
        article:           l.article,
        quantite_commandee: Number(l.quantite_commandee),
        prix_unitaire:     Number(l.prix_unitaire),
        remise_pct:        Number(l.remise_pct) || undefined,
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
              <ClipboardList size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouvelle commande client</h3>
              <p className="text-xs text-[--text-muted]">Créez une commande</p>
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
                <div>
                  <label className={FIELD_LABEL}>Livraison souhaitée</label>
                  <Input type="date" value={dateLivraison} onChange={(e) => setDateLiv(e.target.value)} />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Conditions de paiement</label>
                  <Input value={condPaiement} onChange={(e) => setCondPay(e.target.value)} placeholder="Ex : 30 jours net" />
                </div>
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Notes client</label>
                  <Input value={notesClient} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions particulières…" />
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
                    {['Article', 'Quantité', 'Prix unitaire', 'Remise %', ''].map((h) => (
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
                          onChange={(e) => handleArticleChange(i, e.target.value)}
                        >
                          <option value="">— Article —</option>
                          {articles?.map((a: Article) => (
                            <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-1 w-24">
                        <Input type="number" min={0} step="0.001" value={l.quantite_commandee}
                          onChange={(e) => setLigne(i, 'quantite_commandee', e.target.value)} className="font-data" />
                      </td>
                      <td className="py-2 px-1 w-32">
                        <Input type="number" min={0} step="1" value={l.prix_unitaire}
                          onChange={(e) => setLigne(i, 'prix_unitaire', e.target.value)} className="font-data" />
                      </td>
                      <td className="py-2 px-1 w-20">
                        <Input type="number" min={0} max={100} value={l.remise_pct}
                          onChange={(e) => setLigne(i, 'remise_pct', e.target.value)} className="font-data" />
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
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>Créer la commande</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Menu actions ─────────────────────────────────────────────────────────────

function ActionMenu({
  cc,
  onView,
  onConfirmer,
  onAnnuler,
}: {
  cc:          CCListType
  onView:      () => void
  onConfirmer: () => void
  onAnnuler:   () => void
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

  const item = (label: string, icon: React.ReactNode, onClick: () => void, danger?: boolean) => (
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
          left:            rect.right - 176,
          width:           176,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {item('Voir le détail', <ExternalLink size={13} style={{ color: 'var(--accent)' }} />, onView)}
        {!['livree', 'annulee'].includes(cc.statut) && (
          <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
        )}
        {cc.statut === 'brouillon' && item('Confirmer', <CheckCircle2 size={13} style={{ color: 'var(--status-success)' }} />, onConfirmer)}
        {!['livree', 'annulee'].includes(cc.statut) && item('Annuler', <XCircle size={13} />, onAnnuler, true)}
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

type FiltreStatut = 'tous' | StatutCC

const FILTRES: { label: string; value: FiltreStatut }[] = [
  { label: 'Toutes',       value: 'tous'                },
  { label: 'Brouillon',    value: 'brouillon'           },
  { label: 'Confirmées',   value: 'confirmee'           },
  { label: 'En livraison', value: 'en_cours_livraison'  },
  { label: 'Livrées',      value: 'livree'              },
  { label: 'Annulées',     value: 'annulee'             },
]

export function CommandeClientList() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [search, setSearch]       = useState('')
  const [filtre, setFiltre]       = useState<FiltreStatut>('tous')
  const [showModal, setShowModal] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['commandes-client'] })

  const params: Record<string, string> = {}
  if (search)          params.search = search
  if (filtre !== 'tous') params.statut = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['commandes-client', search, filtre],
    queryFn:  () => commercialApi.listCommandesClient(params),
    select:   (r) => r.data,
  })

  const createMut = useMutation({
    mutationFn: (data: CommandeClientCreatePayload) => commercialApi.createCommandeClient(data),
    onSuccess:  () => { toast.success('Commande créée.'); invalidate(); setShowModal(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const confirmerMut = useMutation({
    mutationFn: (id: string) => commercialApi.confirmerCommande(id),
    onSuccess:  (r) => {
      if (!r.data.tout_disponible) {
        toast.warning(`Commande confirmée avec ${r.data.warnings.length} alerte(s) stock.`)
      } else {
        toast.success('Commande confirmée.')
      }
      invalidate()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const annulerMut = useMutation({
    mutationFn: (id: string) => commercialApi.annulerCommande(id),
    onSuccess:  () => { toast.success('Commande annulée.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const commandes = data?.results ?? []

  return (
    <>
      {showModal && (
        <CCCreateModal
          onClose={() => setShowModal(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}

      <div className="space-y-5 animate-fade-in">

        {/* Header standalone */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Commandes client</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">{data?.count ?? 0} commande{(data?.count ?? 0) > 1 ? 's' : ''}</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>
            Nouvelle commande
          </Button>
        </div>

        {/* Table card */}
        <div className="surface overflow-hidden">

        {/* Filtres */}
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

        {/* Table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left" style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
              {['Référence', 'Client', 'Commercial', 'Montant HT', 'Date', 'Livraison souhaitée', 'Stock', 'Statut', ''].map((h) => (
                <th key={h} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-6 py-5">
                        <div className="skeleton h-4 rounded" style={{ width: `${50 + j * 5}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : commandes.length === 0
              ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <ClipboardList size={32} className="mx-auto mb-3 text-[--text-muted]" />
                    <p className="text-sm text-[--text-secondary]">Aucune commande trouvée</p>
                  </td>
                </tr>
              )
              : commandes.map((cc) => (
                <tr
                  key={cc.id}
                  className="group hover:bg-[--bg-elevated] transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onClick={() => navigate(`/commercial/commandes/${cc.id}`)}
                >
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold text-[--accent]">{cc.reference}</span>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs font-medium text-[--text-primary]">{cc.client_nom}</p>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{cc.commercial_nom ?? '—'}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold">{formatXOF(Number(cc.montant_ht))}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{formatDate(cc.date_commande)}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">
                      {cc.date_livraison_souhaitee ? formatDate(cc.date_livraison_souhaitee) : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    {cc.stock_warning ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--status-warning)' }}>
                        <AlertTriangle size={11} />Alerte
                      </span>
                    ) : (
                      <span className="text-xs text-[--text-muted]">OK</span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <Badge variant={STATUT_CFG[cc.statut].variant}>{STATUT_CFG[cc.statut].label}</Badge>
                  </td>
                  <td className="px-6 py-5">
                    <ActionMenu
                      cc={cc}
                      onView={() => navigate(`/commercial/commandes/${cc.id}`)}
                      onConfirmer={() => confirmerMut.mutate(cc.id)}
                      onAnnuler={() => annulerMut.mutate(cc.id)}
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
