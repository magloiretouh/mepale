/**
 * MEPALE ERP — Gestion des Lots
 * Alertes péremption, traçabilité bidirectionnelle, quarantaine, destruction.
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Search, RefreshCw, Package, Plus, Edit2,
  Lock, Unlock, Trash2, GitBranch, FileText, MoreVertical,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { cn, formatDate, formatXOF } from '@/lib/utils'
import { productionApi, type Lot, type StatutLot } from '@/services/production'

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)

const FIELD_LABEL = 'text-xs font-medium text-[--text-secondary] uppercase tracking-wider'

const EMPTY_FORM = {
  article:           '',
  numero_lot:        '',
  quantite_initiale: '',
  cout_unitaire:     '',
  date_fabrication:  '',
  date_peremption:   '',
  notes:             '',
}

const STATUT_CONFIG: Record<StatutLot, { label: string; variant: 'success' | 'neutral' | 'danger' | 'warning' }> = {
  disponible: { label: 'Disponible', variant: 'success' },
  epuise:     { label: 'Épuisé',     variant: 'neutral' },
  bloque:     { label: 'Bloqué',     variant: 'warning' },
  perime:     { label: 'Périmé',     variant: 'danger'  },
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function PeremptionBadge({ lot }: { lot: Lot }) {
  if (!lot.date_peremption) return <span className="text-[--text-muted] text-xs">—</span>
  const j     = lot.jours_avant_peremption
  const color = j === null ? '' : j <= 3 ? 'var(--status-danger)' : j <= 7 ? 'var(--status-warning)' : 'var(--text-secondary)'
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-data text-xs" style={{ color }}>{formatDate(lot.date_peremption)}</span>
      {j !== null && j <= 7 && j >= 0 && (
        <span className="text-[10px] font-semibold" style={{ color }}>J-{j}</span>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:opacity-80 transition-opacity"
      style={{ color: danger ? 'var(--status-danger)' : 'var(--text-primary)' }}
    >
      {icon}{label}
    </button>
  )
}

function ActionMenu({ lot, onAction }: {
  lot: Lot
  onAction: (action: 'edit' | 'bloquer' | 'debloquer' | 'detruire' | 'tracabilite' | 'pdf') => void
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)
  const act = (a: Parameters<typeof onAction>[0]) => { setOpen(false); onAction(a) }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current)
      setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  const dropdown = rect && open && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
      <div
        className="rounded py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position:        'fixed',
          top:    rect.bottom + 200 < window.innerHeight ? rect.bottom + 4 : undefined,
          bottom: rect.bottom + 200 < window.innerHeight ? undefined : window.innerHeight - rect.top + 4,
          left:            rect.right - 192,
          width:           192,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        <MenuItem icon={<Edit2 size={12} />}    label="Modifier"             onClick={() => act('edit')} />
        {lot.statut === 'disponible' && (
          <MenuItem icon={<Lock size={12} />}   label="Bloquer (quarantaine)" onClick={() => act('bloquer')} />
        )}
        {lot.statut === 'bloque' && (
          <MenuItem icon={<Unlock size={12} />} label="Débloquer"             onClick={() => act('debloquer')} />
        )}
        {lot.statut !== 'epuise' && (
          <MenuItem icon={<Trash2 size={12} />} label="Détruire"              onClick={() => act('detruire')} danger />
        )}
        <MenuItem icon={<GitBranch size={12} />} label="Traçabilité"          onClick={() => act('tracabilite')} />
        <MenuItem icon={<FileText size={12} />}  label="Rapport PDF"          onClick={() => act('pdf')} />
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
        className="p-1 rounded hover:opacity-70 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        <MoreVertical size={14} />
      </button>
    </>
  )
}

// ── Modal traçabilité ─────────────────────────────────────────────────────────

function TracabiliteModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tracabilite-lot', lot.id],
    queryFn:  () => productionApi.tracabiliteLot(lot.id).then(r => r.data as {
      lot?: object
      utilise_dans_ofs?: Array<{ of_reference: string; lot_pf: string | null; quantite: string; date_consommation: string }>
      of_source?: string
      matieres_consommees?: Array<{ lot_mp: string; article_mp: string; quantite: string; date: string }>
    }),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Traçabilité — ${lot.numero_lot}`} size="lg"
      footer={<Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>}>
      {isLoading ? (
        <p className="text-xs text-[--text-muted]">Chargement…</p>
      ) : (
        <div className="space-y-5">
          {data?.of_source && (
            <div>
              <p className="text-xs text-[--text-muted] mb-1">Produit par l'OF</p>
              <span className="font-data text-sm text-[--accent]">{data.of_source}</span>
            </div>
          )}
          {data?.matieres_consommees && data.matieres_consommees.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-2">
                Matières premières consommées
              </h4>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Lot MP', 'Article', 'Qté consommée', 'Date'].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left text-[--text-muted] font-semibold uppercase text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.matieres_consommees.map((m, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-3 py-2 font-data text-[--accent]">{m.lot_mp}</td>
                      <td className="px-3 py-2 text-[--text-primary]">{m.article_mp}</td>
                      <td className="px-3 py-2 font-data">{m.quantite}</td>
                      <td className="px-3 py-2 text-[--text-muted]">{formatDate(m.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data?.utilise_dans_ofs && data.utilise_dans_ofs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-2">
                Utilisé dans les OFs
              </h4>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['OF', 'Lot PF produit', 'Qté', 'Date'].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left text-[--text-muted] font-semibold uppercase text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.utilise_dans_ofs.map((u, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-3 py-2 font-data text-[--accent]">{u.of_reference}</td>
                      <td className="px-3 py-2 font-data text-[--text-secondary]">{u.lot_pf ?? '—'}</td>
                      <td className="px-3 py-2 font-data">{u.quantite}</td>
                      <td className="px-3 py-2 text-[--text-muted]">{formatDate(u.date_consommation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!data?.of_source && !data?.matieres_consommees?.length && !data?.utilise_dans_ofs?.length && (
            <p className="text-xs text-[--text-muted] text-center py-4">Aucune donnée de traçabilité disponible.</p>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────

export function LotList() {
  const qc = useQueryClient()
  const [search, setSearch]       = useState('')
  const [statut, setStatut]       = useState('')
  const [alertMode, setAlertMode] = useState(false)
  const [page, setPage]           = useState(1)

  // Modal CRUD
  const [showModal, setShowModal] = useState(false)
  const [editLot, setEditLot]     = useState<Lot | null>(null)
  const [form, setForm]           = useState(EMPTY_FORM)

  // Modals d'action
  const [blockerLot, setBlockerLot]         = useState<Lot | null>(null)
  const [motifBlocage, setMotifBlocage]     = useState('')
  const [detruireLot, setDetruireLot]       = useState<Lot | null>(null)
  const [justificationD, setJustificationD] = useState('')
  const [tracabilite, setTracabilite]       = useState<Lot | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['lots', search, statut, page],
    queryFn:  () => productionApi.listLots({
      search: search || undefined, statut: statut || undefined, page,
    }).then(r => r.data),
    enabled: !alertMode,
  })

  const { data: alertes, isLoading: alertLoading } = useQuery({
    queryKey: ['lots-alertes'],
    queryFn:  () => productionApi.alertesPeremption(7).then(r => r.data),
    enabled:  alertMode,
  })

  const { data: articlesData } = useQuery({
    queryKey: ['articles-select-lot'],
    queryFn:  () => productionApi.listArticles({ page_size: 200 }).then(r => r.data),
    enabled:  showModal,
    staleTime: 0,
  })
  const articles = articlesData?.results ?? []

  const lots    = alertMode ? (alertes ?? []) : (data?.results ?? [])
  const total   = alertMode ? (alertes?.length ?? 0) : (data?.count ?? 0)
  const pages   = Math.ceil((data?.count ?? 0) / 25)
  const loading = alertMode ? alertLoading : isLoading

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = (msg: string) => {
    toast.success(msg)
    qc.invalidateQueries({ queryKey: ['lots'] })
    qc.invalidateQueries({ queryKey: ['lots-alertes'] })
  }

  const { mutate: saveLot, isPending: saving } = useMutation({
    mutationFn: () => editLot
      ? productionApi.updateLot(editLot.id, {
          numero_lot:        form.numero_lot,
          quantite_initiale: parseFloat(form.quantite_initiale),
          cout_unitaire:     parseFloat(form.cout_unitaire),
          date_fabrication:  form.date_fabrication,
          date_peremption:   form.date_peremption || null,
          notes:             form.notes,
        })
      : productionApi.createLot({
          article:           form.article,
          numero_lot:        form.numero_lot,
          quantite_initiale: parseFloat(form.quantite_initiale),
          cout_unitaire:     parseFloat(form.cout_unitaire),
          date_fabrication:  form.date_fabrication,
          date_peremption:   form.date_peremption || null,
          notes:             form.notes,
        }),
    onSuccess: () => {
      invalidate(editLot ? 'Lot modifié' : 'Lot créé')
      closeModal()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la sauvegarde'),
  })

  const { mutate: bloquer, isPending: blocking } = useMutation({
    mutationFn: () => productionApi.bloquerLot(blockerLot!.id, motifBlocage),
    onSuccess:  () => { invalidate('Lot mis en quarantaine'); setBlockerLot(null); setMotifBlocage('') },
    onError:    (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: debloquer } = useMutation({
    mutationFn: (id: string) => productionApi.debloquerLot(id),
    onSuccess:  () => invalidate('Lot débloqué'),
    onError:    () => toast.error('Erreur lors du déblocage'),
  })

  const { mutate: detruire, isPending: destroying } = useMutation({
    mutationFn: () => productionApi.detruireLot(detruireLot!.id, justificationD),
    onSuccess:  () => { invalidate('Lot détruit'); setDetruireLot(null); setJustificationD('') },
    onError:    (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const closeModal = () => { setShowModal(false); setEditLot(null); setForm(EMPTY_FORM) }

  const openCreate = () => { setEditLot(null); setForm(EMPTY_FORM); setShowModal(true) }

  const openEdit = (lot: Lot) => {
    setEditLot(lot)
    setForm({
      article:           lot.article,
      numero_lot:        lot.numero_lot,
      quantite_initiale: String(lot.quantite_initiale),
      cout_unitaire:     String(lot.cout_unitaire),
      date_fabrication:  lot.date_fabrication?.slice(0, 10) ?? '',
      date_peremption:   lot.date_peremption?.slice(0, 10) ?? '',
      notes:             lot.notes ?? '',
    })
    setShowModal(true)
  }

  const handleAction = (lot: Lot, action: 'edit' | 'bloquer' | 'debloquer' | 'detruire' | 'tracabilite' | 'pdf') => {
    if (action === 'edit')        { openEdit(lot) }
    if (action === 'bloquer')     { setBlockerLot(lot) }
    if (action === 'debloquer')   { debloquer(lot.id) }
    if (action === 'detruire')    { setDetruireLot(lot) }
    if (action === 'tracabilite') { setTracabilite(lot) }
    if (action === 'pdf') {
      const token = localStorage.getItem('access_token')
      fetch(`/api/v1/production/lots/${lot.id}/rapport-pdf/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href     = url
        a.download = `lot_${lot.numero_lot}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }).catch(() => toast.error('Erreur lors du téléchargement PDF'))
    }
  }

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const canSave = !!form.numero_lot && !!form.quantite_initiale && !!form.cout_unitaire && !!form.date_fabrication
    && (editLot ? true : !!form.article)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[--text-primary]">Gestion des Lots</h1>
          <p className="text-sm text-[--text-muted] mt-0.5">{total} lot{total > 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={alertMode ? 'primary' : 'secondary'}
            size="sm"
            icon={<AlertTriangle size={13} />}
            onClick={() => setAlertMode(!alertMode)}
          >
            Alertes péremption
          </Button>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => refetch()}>
            Actualiser
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openCreate}>
            Nouveau lot
          </Button>
        </div>
      </div>

      {alertMode && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded"
          style={{ backgroundColor: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)' }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />
          <p className="text-sm text-[--text-primary]">
            Lots expirant dans les <strong>7 prochains jours</strong> — vérifiez et bloquez les lots périmés.
          </p>
        </div>
      )}

      {/* Table card */}
      <div className="surface overflow-hidden">

      {/* Filtres */}
      {!alertMode && (
        <div
          className="flex flex-wrap gap-2 items-center px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-56">
            <Input
              placeholder="Rechercher un lot ou article…"
              icon={<Search size={13} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex gap-1">
            {(['', 'disponible', 'epuise', 'bloque', 'perime'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setStatut(s); setPage(1) }}
                className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                style={{
                  backgroundColor: statut === s ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  color:           statut === s ? 'var(--accent)' : 'var(--text-secondary)',
                  border:          `1px solid ${statut === s ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {s === '' ? 'Tous' : STATUT_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                {['N° Lot', 'Article', 'Qté restante', 'Coût unitaire', 'Statut', 'Fabrication', 'Péremption', 'OF source', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-6 py-5"><div className="skeleton h-3 rounded w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                : lots.length === 0
                ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Package size={28} style={{ color: 'var(--text-muted)' }} />
                        <p className="text-sm text-[--text-muted]">
                          {alertMode ? 'Aucun lot proche de péremption 🎉' : 'Aucun lot trouvé.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )
                : (lots as Lot[]).map(lot => {
                    const cfg    = STATUT_CONFIG[lot.statut]
                    const urgent = lot.jours_avant_peremption !== null && lot.jours_avant_peremption <= 3
                    return (
                      <tr
                        key={lot.id}
                        className="transition-colors hover:bg-[--bg-elevated]"
                        style={{
                          borderBottom:    '1px solid var(--border-subtle)',
                          backgroundColor: urgent ? 'rgba(239,68,68,0.04)' : undefined,
                        }}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-data text-xs font-semibold text-[--accent]">{lot.numero_lot}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium text-[--text-primary] max-w-[160px] truncate">
                          {lot.article_detail?.designation ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                          {lot.quantite_restante.toLocaleString('fr-TG')}{' '}
                          <span className="text-[--text-muted]">{lot.article_detail?.unite_code}</span>
                        </td>
                        <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                          {formatXOF(lot.cout_unitaire)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                        </td>
                        <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                          {formatDate(lot.date_fabrication)}
                        </td>
                        <td className="px-4 py-2.5">
                          <PeremptionBadge lot={lot} />
                        </td>
                        <td className="px-4 py-2.5">
                          {lot.ordre_fabrication
                            ? <span className="font-data text-xs text-[--accent]">lié</span>
                            : <span className="text-[--text-muted] text-xs">Réception</span>
                          }
                        </td>
                        <td className="px-4 py-2.5">
                          <ActionMenu lot={lot} onAction={(a) => handleAction(lot, a)} />
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>

        {!alertMode && pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs text-[--text-muted]">Page {page} / {pages}</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="xs" disabled={page === 1}     onClick={() => setPage(p => p - 1)}>Précédent</Button>
              <Button variant="secondary" size="xs" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
            </div>
          </div>
        )}
      </div>

    </div>

    {/* ── Modal création / édition ─────────────────────────────────────────── */}
    <Modal
      isOpen={showModal}
      onClose={closeModal}
      title={editLot ? `Modifier — ${editLot.numero_lot}` : 'Nouveau lot'}
      size="md"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={closeModal}>Annuler</Button>
          <Button size="sm" variant="primary" loading={saving} disabled={!canSave} onClick={() => saveLot()}>
            {editLot ? 'Enregistrer' : 'Créer le lot'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Article — affiché seulement à la création */}
        {!editLot && (
          <div className="flex flex-col gap-2">
            <label className={FIELD_LABEL}>
              Article <span style={{ color: 'var(--status-danger)' }}>*</span>
            </label>
            <select value={form.article} onChange={set('article')} className={SELECT_CLASS}>
              <option value="">— Sélectionner un article —</option>
              {articles.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>
              ))}
            </select>
          </div>
        )}

        {/* Article en lecture seule en édition */}
        {editLot && (
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Article</span>
            <p className="text-sm text-[--text-primary] font-medium">
              {editLot.article_detail?.designation ?? '—'}
              <span className="ml-2 text-xs text-[--text-muted] font-data">{editLot.article_detail?.code}</span>
            </p>
          </div>
        )}

        {/* Numéro de lot */}
        <Input
          label="Numéro de lot *"
          placeholder="Ex : LOT-2025-001"
          value={form.numero_lot}
          onChange={set('numero_lot')}
        />

        {/* Quantité + Coût unitaire */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Quantité initiale *"
            type="number"
            min="0"
            step="0.01"
            placeholder="Ex : 1000"
            value={form.quantite_initiale}
            onChange={set('quantite_initiale')}
          />
          <Input
            label="Coût unitaire (FCFA) *"
            type="number"
            min="0"
            step="0.01"
            placeholder="Ex : 850"
            value={form.cout_unitaire}
            onChange={set('cout_unitaire')}
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date de fabrication *"
            type="date"
            value={form.date_fabrication}
            onChange={set('date_fabrication')}
          />
          <Input
            label="Date de péremption"
            type="date"
            value={form.date_peremption}
            onChange={set('date_peremption')}
          />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <label className={FIELD_LABEL}>Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={3}
            placeholder="Observations, numéro de commande source…"
            className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
          />
        </div>

      </div>
    </Modal>

    {/* ── Modal bloquer ────────────────────────────────────────────────────── */}
    <Modal
      isOpen={!!blockerLot}
      onClose={() => { setBlockerLot(null); setMotifBlocage('') }}
      title={`Bloquer — ${blockerLot?.numero_lot}`}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => { setBlockerLot(null); setMotifBlocage('') }}>
            Annuler
          </Button>
          <Button size="sm" variant="primary" loading={blocking} disabled={!motifBlocage} onClick={() => bloquer()}>
            Confirmer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-xs text-[--text-secondary]">
          Ce lot sera mis en quarantaine et ne pourra plus être consommé en production.
        </p>
        <div className="flex flex-col gap-2">
          <label className={FIELD_LABEL}>
            Motif de blocage <span style={{ color: 'var(--status-danger)' }}>*</span>
          </label>
          <textarea
            value={motifBlocage}
            onChange={e => setMotifBlocage(e.target.value)}
            rows={3}
            placeholder="Ex : Non-conformité qualité, contamination…"
            className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
          />
        </div>
      </div>
    </Modal>

    {/* ── Modal détruire ───────────────────────────────────────────────────── */}
    <Modal
      isOpen={!!detruireLot}
      onClose={() => { setDetruireLot(null); setJustificationD('') }}
      title={`Détruire — ${detruireLot?.numero_lot}`}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => { setDetruireLot(null); setJustificationD('') }}>
            Annuler
          </Button>
          <Button size="sm" variant="danger" loading={destroying} disabled={!justificationD} onClick={() => detruire()}>
            Détruire définitivement
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div
          className="flex items-start gap-3 px-4 py-3 rounded"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <AlertTriangle size={15} style={{ color: 'var(--status-danger)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs" style={{ color: 'var(--status-danger)' }}>
            Action irréversible.{' '}
            <strong>{detruireLot?.quantite_restante?.toLocaleString('fr-TG')} unités</strong>{' '}
            seront définitivement retirées du stock.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label className={FIELD_LABEL}>
            Justification <span style={{ color: 'var(--status-danger)' }}>*</span>
          </label>
          <textarea
            value={justificationD}
            onChange={e => setJustificationD(e.target.value)}
            rows={3}
            placeholder="Ex : Produit périmé, contamination avérée…"
            className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
          />
        </div>
      </div>
    </Modal>

    {/* ── Modal traçabilité ────────────────────────────────────────────────── */}
    {tracabilite && <TracabiliteModal lot={tracabilite} onClose={() => setTracabilite(null)} />}

    </>
  )
}
