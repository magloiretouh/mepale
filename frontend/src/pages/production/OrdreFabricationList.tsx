import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Plus, Search, RefreshCw, Play, CheckCircle2,
  Clock, PauseCircle, XCircle, Eye, ChevronDown, Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CreateOFModal } from '@/components/production/CreateOFModal'
import { formatDate } from '@/lib/utils'
import { productionApi, type OrdreFabrication, type StatutOF } from '@/services/production'

// ── Config statuts ────────────────────────────────────────────────────────────

const STATUT_CONFIG: Record<StatutOF, {
  label: string
  variant: 'neutral' | 'info' | 'warning' | 'success' | 'danger'
  icon: React.ReactNode
}> = {
  brouillon: { label: 'Brouillon',  variant: 'neutral',  icon: <Clock size={12} />       },
  confirme:  { label: 'Confirmé',   variant: 'info',     icon: <PauseCircle size={12} /> },
  en_cours:  { label: 'En cours',   variant: 'warning',  icon: <Play size={12} />        },
  termine:   { label: 'Terminé',    variant: 'success',  icon: <CheckCircle2 size={12} /> },
  cloture:   { label: 'Clôturé',    variant: 'neutral',  icon: <CheckCircle2 size={12} /> },
  annule:    { label: 'Annulé',     variant: 'danger',   icon: <XCircle size={12} />     },
}

// ── Composant rendement ───────────────────────────────────────────────────────

function Rendement({ value }: { value: number }) {
  const color = value >= 90
    ? 'var(--status-success)'
    : value >= 80
    ? 'var(--status-warning)'
    : 'var(--status-danger)'

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="font-data text-[11px] font-semibold" style={{ color }}>{value}%</span>
    </div>
  )
}

// ── Actions rapides sur un OF ─────────────────────────────────────────────────

function ActionsMenu({ of, onAction }: { of: OrdreFabrication; onAction: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const qc = useQueryClient()

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current)
      setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
    setConfirmDelete(false)
  }

  const mutation = useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ofs'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      onAction()
      setOpen(false)
    },
  })

  const { mutate: deleteOF, isPending: deleting } = useMutation({
    mutationFn: () => productionApi.deleteOF(of.id),
    onSuccess: () => {
      toast.success(`OF ${of.reference} supprimé`)
      qc.invalidateQueries({ queryKey: ['ofs'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      setOpen(false)
      setConfirmDelete(false)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la suppression'),
  })

  const actions: Array<{ label: string; statuts: StatutOF[]; fn: () => void }> = [
    { label: 'Confirmer', statuts: ['brouillon'], fn: () => mutation.mutate(productionApi.confirmerOF(of.id) as any) },
    { label: 'Démarrer',  statuts: ['confirme'],  fn: () => mutation.mutate(productionApi.demarrerOF(of.id) as any) },
    { label: 'Terminer',  statuts: ['en_cours'],  fn: () => {
      const q = prompt('Quantité réellement produite :')
      if (q) mutation.mutate(productionApi.terminerOF(of.id, parseFloat(q)) as any)
    }},
    { label: 'Clôturer',  statuts: ['termine'],   fn: () => mutation.mutate(productionApi.cloturerOF(of.id) as any) },
  ]

  const available = actions.filter((a) => a.statuts.includes(of.statut))
  const canDelete  = of.statut === 'brouillon'

  if (!available.length && !canDelete) return null

  const dropdown = rect && open && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpen(false); setConfirmDelete(false) }} />
      <div
        className="rounded py-1 animate-scale-in"
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
        {available.map((a) => (
          <button
            key={a.label}
            onClick={a.fn}
            className="w-full text-left px-3 py-1.5 text-xs text-[--text-secondary] hover:bg-[--bg-elevated] hover:text-[--text-primary] transition-colors"
          >
            {a.label}
          </button>
        ))}

        {canDelete && (
          <>
            {available.length > 0 && (
              <div className="my-1 mx-2" style={{ borderTop: '1px solid var(--border-subtle)' }} />
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5"
                style={{ color: 'var(--status-danger)' }}
              >
                <Trash2 size={11} /> Supprimer
              </button>
            ) : (
              <div className="px-3 py-2">
                <p className="text-[10px] text-[--text-muted] mb-1.5">Supprimer définitivement ?</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => deleteOF()}
                    disabled={deleting}
                    className="flex-1 text-center text-[10px] font-medium py-1 rounded transition-colors"
                    style={{ backgroundColor: 'var(--status-danger)', color: '#fff' }}
                  >
                    {deleting ? '…' : 'Oui'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 text-center text-[10px] py-1 rounded transition-colors"
                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                  >
                    Non
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>,
    document.body
  )

  return (
    <>
      {dropdown}
      <Button
        ref={btnRef}
        variant="ghost" size="xs"
        icon={<ChevronDown size={11} />}
        onClick={handleToggle}
      >
        Actions
      </Button>
    </>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export function OrdreFabricationList() {
  const navigate  = useNavigate()
  const [search, setSearch]         = useState('')
  const [statut, setStatut]         = useState<string>('')
  const [page, setPage]             = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const PAGE_SIZE = 20

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ofs', search, statut, page],
    queryFn: () => productionApi.listOFs({
      search: search || undefined,
      statut: statut || undefined,
      page,
      page_size: PAGE_SIZE,
    }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  const ofs    = data?.results ?? []
  const total  = data?.count   ?? 0
  const pages  = Math.ceil(total / PAGE_SIZE)

  return (
    <>
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[--text-primary]">Ordres de Fabrication</h1>
          <p className="text-sm text-[--text-muted] mt-0.5">
            {total} ordre{total > 1 ? 's' : ''} au total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => refetch()}>
            Actualiser
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
            Nouvel OF
          </Button>
        </div>
      </div>

      {/* Table card */}
      <div className="surface overflow-hidden">

      {/* Filtres */}
      <div
        className="flex flex-wrap gap-2 items-center px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
      >
        <div className="w-56">
          <Input
            placeholder="Rechercher un OF ou produit…"
            icon={<Search size={13} />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        {/* Filtre statut */}
        <div className="flex gap-1 flex-wrap">
          {(['', 'brouillon', 'confirme', 'en_cours', 'termine', 'cloture'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatut(s); setPage(1) }}
              className="px-2.5 py-1 rounded text-xs font-medium transition-all"
              style={{
                backgroundColor: statut === s ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                color: statut === s ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${statut === s ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {s === '' ? 'Tous' : STATUT_CONFIG[s as StatutOF]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                {['Référence', 'Produit', 'Qté prévue', 'Qté produite', 'Statut', 'Rendement', 'Date prévue', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-6 py-5">
                        <div className="skeleton h-3 rounded" style={{ width: `${60 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ofs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-[--text-muted]">
                    Aucun ordre de fabrication trouvé.
                  </td>
                </tr>
              ) : (
                ofs.map((of) => {
                  const cfg = STATUT_CONFIG[of.statut]
                  return (
                    <tr
                      key={of.id}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      className="transition-colors hover:bg-[--bg-elevated] cursor-pointer"
                      onClick={() => navigate(`/production/ordres-de-fabrication/${of.id}`)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {of.est_en_retard && (
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 status-dot-pulse" style={{ backgroundColor: 'var(--status-danger)' }} />
                          )}
                          <span className="font-data text-xs font-semibold text-[--accent]">{of.reference}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium text-[--text-primary] max-w-[180px] truncate">
                        {of.produit_designation}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                        {of.quantite_prevue.toLocaleString('fr-TG')}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                        {of.quantite_produite > 0 ? of.quantite_produite.toLocaleString('fr-TG') : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {of.rendement > 0 ? <Rendement value={of.rendement} /> : <span className="text-[--text-muted] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                        {formatDate(of.date_prevue)}
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="xs" icon={<Eye size={12} />}
                            onClick={() => navigate(`/production/ordres-de-fabrication/${of.id}`)} />
                          <ActionsMenu of={of} onAction={() => toast.success('Action effectuée.')} />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs text-[--text-muted]">
              Page {page} / {pages} — {total} résultats
            </span>
            <div className="flex gap-1">
              <Button variant="secondary" size="xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Précédent
              </Button>
              <Button variant="secondary" size="xs" disabled={page === pages} onClick={() => setPage(p => p + 1)}>
                Suivant
              </Button>
            </div>
          </div>
        )}
      </div>

    </div>

    <CreateOFModal
      isOpen={createOpen}
      onClose={() => setCreateOpen(false)}
    />
    </>
  )
}
