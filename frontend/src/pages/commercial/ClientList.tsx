/**
 * MEPALE ERP — Clients
 * Liste, recherche, filtres + actions : créer / suspendre / réactiver / voir fiche
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search, Plus, UserRound, Phone, Mail, Filter,
  MoreHorizontal, ExternalLink, PauseCircle, PlayCircle,
  Building2, User, Pencil, PowerOff,
} from 'lucide-react'


import {
  commercialApi,
  type ClientList as ClientListType,
  type ClientCreatePayload,
  type StatutClient,
} from '@/services/commercial'
import { ClientFormModal } from '@/components/commercial/ClientFormModal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutClient, { variant: 'success' | 'warning' | 'neutral'; label: string }> = {
  actif:    { variant: 'success', label: 'Actif'     },
  inactif:  { variant: 'neutral', label: 'Inactif'   },
  suspendu: { variant: 'warning', label: 'Suspendu'  },
}


// ─── Menu actions ─────────────────────────────────────────────────────────────

function ActionMenu({
  client,
  onView,
  onEdit,
  onSuspendre,
  onDesactiver,
  onReactiver,
}: {
  client:       ClientListType
  onView:       () => void
  onEdit:       () => void
  onSuspendre:  () => void
  onDesactiver: () => void
  onReactiver:  () => void
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
          left:            rect.right - 192,
          width:           192,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {item('Voir la fiche',  <ExternalLink size={13} style={{ color: 'var(--accent)' }} />, onView)}
        {item('Modifier',       <Pencil size={13} />, onEdit)}
        <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
        {client.statut !== 'actif' && item('Réactiver',  <PlayCircle size={13} style={{ color: 'var(--status-success)' }} />, onReactiver)}
        {client.statut === 'actif' && item('Suspendre',  <PauseCircle size={13} />, onSuspendre, true)}
        {client.statut !== 'inactif' && item('Désactiver', <PowerOff size={13} />, onDesactiver, true)}
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

type FiltreStatut = 'tous' | StatutClient

const FILTRES: { label: string; value: FiltreStatut }[] = [
  { label: 'Tous',      value: 'tous'     },
  { label: 'Actifs',    value: 'actif'    },
  { label: 'Suspendus', value: 'suspendu' },
  { label: 'Inactifs',  value: 'inactif'  },
]

export function ClientList() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [search, setSearch]             = useState('')
  const [filtre, setFiltre]             = useState<FiltreStatut>('tous')
  const [showCreate, setShowCreate]     = useState(false)
  const [editClientId, setEditClientId] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clients'] })

  const params: Record<string, string> = {}
  if (search)            params.search = search
  if (filtre !== 'tous') params.statut = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search, filtre],
    queryFn:  () => commercialApi.listClients(params),
    select:   (r) => r.data,
  })

  // Charge le client complet pour l'édition
  const { data: editClientData } = useQuery({
    queryKey: ['client', editClientId],
    queryFn:  () => commercialApi.getClient(editClientId!).then((r) => r.data),
    enabled:  !!editClientId,
  })

  const createMut = useMutation({
    mutationFn: (data: ClientCreatePayload) => commercialApi.createClient(data),
    onSuccess:  () => { toast.success('Client créé.'); invalidate(); setShowCreate(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la création'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClientCreatePayload }) =>
      commercialApi.updateClient(id, data),
    onSuccess: () => {
      toast.success('Client mis à jour.')
      invalidate()
      qc.invalidateQueries({ queryKey: ['client', editClientId] })
      setEditClientId(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la mise à jour'),
  })

  const suspendreMut = useMutation({
    mutationFn: (id: string) => commercialApi.suspendreClient(id),
    onSuccess:  () => { toast.success('Client suspendu.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const desactiverMut = useMutation({
    mutationFn: (id: string) => commercialApi.desactiverClient(id),
    onSuccess:  () => { toast.success('Client désactivé.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const reactiverMut = useMutation({
    mutationFn: (id: string) => commercialApi.reactiverClient(id),
    onSuccess:  () => { toast.success('Client réactivé.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const clients = data?.results ?? []

  return (
    <>
      {showCreate && (
        <ClientFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}
      {editClientId && editClientData && (
        <ClientFormModal
          mode="edit"
          initialData={editClientData}
          onClose={() => setEditClientId(null)}
          onSave={(d) => updateMut.mutate({ id: editClientId, data: d })}
          isPending={updateMut.isPending}
        />
      )}

      <div className="space-y-5 animate-fade-in">

        {/* Header standalone */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Clients</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">
              {data?.count ?? 0} client{(data?.count ?? 0) > 1 ? 's' : ''} enregistré{(data?.count ?? 0) > 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Nouveau client
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
              placeholder="Rechercher un client…"
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
              {['Code', 'Raison Sociale', 'Type', 'Contact', 'Commercial', 'Statut', ''].map((h) => (
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
              : clients.length === 0
              ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <UserRound size={32} className="mx-auto mb-3 text-[--text-muted]" />
                    <p className="text-sm text-[--text-secondary]">Aucun client trouvé</p>
                    <p className="text-xs text-[--text-muted] mt-1">
                      Créez votre premier client en cliquant sur « Nouveau client »
                    </p>
                  </td>
                </tr>
              )
              : clients.map((c) => (
                <tr
                  key={c.id}
                  className="group hover:bg-[--bg-elevated] transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onClick={() => navigate(`/commercial/clients/${c.id}`)}
                >
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold text-[--accent]">{c.code}</span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                        style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                      >
                        {c.raison_sociale.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="text-xs font-semibold text-[--text-primary]">{c.raison_sociale}</p>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-1 text-xs text-[--text-secondary]">
                      {c.type === 'entreprise' ? <Building2 size={11} /> : <User size={11} />}
                      {c.type_label}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-0.5">
                      {c.telephone && (
                        <div className="flex items-center gap-1.5 text-xs text-[--text-secondary]">
                          <Phone size={10} className="text-[--text-muted]" />{c.telephone}
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-xs text-[--text-secondary]">
                          <Mail size={10} className="text-[--text-muted]" />{c.email}
                        </div>
                      )}
                      {!c.telephone && !c.email && <span className="text-xs text-[--text-muted]">—</span>}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{c.commercial_nom ?? '—'}</span>
                  </td>
                  <td className="px-6 py-5">
                    <Badge variant={STATUT_CFG[c.statut].variant}>{STATUT_CFG[c.statut].label}</Badge>
                  </td>
                  <td className="px-6 py-5">
                    <ActionMenu
                      client={c}
                      onView={() => navigate(`/commercial/clients/${c.id}`)}
                      onEdit={() => setEditClientId(c.id)}
                      onSuspendre={() => suspendreMut.mutate(c.id)}
                      onDesactiver={() => desactiverMut.mutate(c.id)}
                      onReactiver={() => reactiverMut.mutate(c.id)}
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
