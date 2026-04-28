/**
 * MEPALE ERP — Devis
 * Liste + filtres + créer / envoyer / accepter / refuser / convertir en CC / révision
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search, Plus, FileText, Filter, MoreHorizontal, ExternalLink,
  Send, CheckCircle2, XCircle, RefreshCw, ShoppingCart, X, Trash2,
} from 'lucide-react'

import {
  commercialApi,
  type DevisList as DevisListType,
  type DevisCreatePayload,
  type LigneDevisCreatePayload,
  type StatutDevis,
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

const STATUT_CFG: Record<StatutDevis, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon: { variant: 'neutral', label: 'Brouillon' },
  envoye:    { variant: 'accent',  label: 'Envoyé'    },
  accepte:   { variant: 'success', label: 'Accepté'   },
  refuse:    { variant: 'danger',  label: 'Refusé'    },
  expire:    { variant: 'neutral', label: 'Expiré'    },
}

// ─── Types internes ───────────────────────────────────────────────────────────

interface LigneTmp {
  article:       string
  quantite:      string
  prix_unitaire: string
  remise_pct:    string
}

const EMPTY_LIGNE: LigneTmp = { article: '', quantite: '1', prix_unitaire: '0', remise_pct: '0' }

// ─── Modal Création Devis ─────────────────────────────────────────────────────

function DevisCreateModal({
  onClose,
  onSave,
  isPending,
}: {
  onClose:   () => void
  onSave:    (data: DevisCreatePayload) => void
  isPending: boolean
}) {
  const [client, setClient]         = useState('')
  const [dateValidite, setDate]     = useState('')
  const [notesClient, setNotes]     = useState('')
  const [lignes, setLignes]         = useState<LigneTmp[]>([{ ...EMPTY_LIGNE }])

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

  const addLigne = () => setLignes((prev) => [...prev, { ...EMPTY_LIGNE }])
  const removeLigne = (i: number) => setLignes((prev) => prev.filter((_, idx) => idx !== i))

  // Auto-remplissage prix depuis article
  const handleArticleChange = (i: number, articleId: string) => {
    setLigne(i, 'article', articleId)
    const art = articles?.find((a: Article) => a.id === articleId)
    if (art?.prix_standard) setLigne(i, 'prix_unitaire', String(art.prix_standard))
  }

  const handleSubmit = () => {
    if (!client)       { toast.error('Sélectionnez un client'); return }
    if (!dateValidite) { toast.error('La date de validité est obligatoire'); return }
    const lignesValides = lignes.filter((l) => l.article && Number(l.quantite) > 0)
    if (!lignesValides.length) { toast.error('Ajoutez au moins une ligne'); return }
    onSave({
      client,
      date_validite: dateValidite,
      notes_client:  notesClient || undefined,
      lignes: lignesValides.map((l): LigneDevisCreatePayload => ({
        article:       l.article,
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
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
          maxHeight:       '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <FileText size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouveau devis</h3>
              <p className="text-xs text-[--text-muted]">Créez un devis client</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">
            {/* Entête */}
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
                  <label className={FIELD_LABEL}>Date de validité <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                  <Input type="date" value={dateValidite} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Notes client</label>
                  <Input value={notesClient} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions particulières…" />
                </div>
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Lignes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Lignes</p>
                <Button variant="ghost" size="xs" icon={<Plus size={11} />} onClick={addLigne}>Ajouter</Button>
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
                        <Input
                          type="number" min={0} step="0.001"
                          value={l.quantite}
                          onChange={(e) => setLigne(i, 'quantite', e.target.value)}
                          className="font-data"
                        />
                      </td>
                      <td className="py-2 px-1 w-32">
                        <Input
                          type="number" min={0} step="1"
                          value={l.prix_unitaire}
                          onChange={(e) => setLigne(i, 'prix_unitaire', e.target.value)}
                          className="font-data"
                        />
                      </td>
                      <td className="py-2 px-1 w-20">
                        <Input
                          type="number" min={0} max={100} step="1"
                          value={l.remise_pct}
                          onChange={(e) => setLigne(i, 'remise_pct', e.target.value)}
                          className="font-data"
                        />
                      </td>
                      <td className="py-2 px-1 w-8">
                        {lignes.length > 1 && (
                          <button
                            onClick={() => removeLigne(i)}
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>Créer le devis</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Menu actions ─────────────────────────────────────────────────────────────

function ActionMenu({
  devis,
  onView,
  onEnvoyer,
  onAccepter,
  onRefuser,
  onConvertir,
  onRevision,
}: {
  devis:      DevisListType
  onView:     () => void
  onEnvoyer:  () => void
  onAccepter: () => void
  onRefuser:  () => void
  onConvertir: () => void
  onRevision: () => void
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
          left:            rect.right - 208,
          width:           208,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {item('Voir le devis', <ExternalLink size={13} style={{ color: 'var(--accent)' }} />, onView)}
        {['brouillon', 'envoye', 'accepte'].includes(devis.statut) && (
          <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
        )}
        {devis.statut === 'brouillon' && item('Envoyer', <Send size={13} />, onEnvoyer)}
        {devis.statut === 'envoye' && item('Accepter', <CheckCircle2 size={13} style={{ color: 'var(--status-success)' }} />, onAccepter)}
        {devis.statut === 'envoye' && item('Refuser', <XCircle size={13} />, onRefuser, true)}
        {devis.statut === 'accepte' && item('Convertir en CC', <ShoppingCart size={13} style={{ color: 'var(--accent)' }} />, onConvertir)}
        {['brouillon', 'envoye', 'accepte'].includes(devis.statut) && item('Révision (v+1)', <RefreshCw size={13} />, onRevision)}
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

type FiltreStatut = 'tous' | StatutDevis

const FILTRES: { label: string; value: FiltreStatut }[] = [
  { label: 'Tous',      value: 'tous'      },
  { label: 'Brouillon', value: 'brouillon' },
  { label: 'Envoyés',   value: 'envoye'    },
  { label: 'Acceptés',  value: 'accepte'   },
  { label: 'Refusés',   value: 'refuse'    },
  { label: 'Expirés',   value: 'expire'    },
]

export function DevisList() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [search, setSearch]       = useState('')
  const [filtre, setFiltre]       = useState<FiltreStatut>('tous')
  const [showModal, setShowModal] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['devis'] })

  const params: Record<string, string> = {}
  if (search)          params.search = search
  if (filtre !== 'tous') params.statut = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['devis', search, filtre],
    queryFn:  () => commercialApi.listDevis(params),
    select:   (r) => r.data,
  })

  const createMut = useMutation({
    mutationFn: (data: DevisCreatePayload) => commercialApi.createDevis(data),
    onSuccess:  () => { toast.success('Devis créé.'); invalidate(); setShowModal(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la création'),
  })

  const envoyerMut = useMutation({
    mutationFn: (id: string) => commercialApi.envoyerDevis(id),
    onSuccess:  () => { toast.success('Devis envoyé.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const accepterMut = useMutation({
    mutationFn: (id: string) => commercialApi.accepterDevis(id),
    onSuccess:  () => { toast.success('Devis accepté.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const refuserMut = useMutation({
    mutationFn: (id: string) => commercialApi.refuserDevis(id),
    onSuccess:  () => { toast.success('Devis refusé.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const convertirMut = useMutation({
    mutationFn: (id: string) => commercialApi.convertirDevisEnCC(id),
    onSuccess:  (r, id) => {
      toast.success('Devis converti en commande.')
      invalidate()
      qc.invalidateQueries({ queryKey: ['commandes-client'] })
      navigate(`/commercial/commandes/${r.data.commande_id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const revisionMut = useMutation({
    mutationFn: (id: string) => commercialApi.revisionDevis(id),
    onSuccess:  (r) => {
      toast.success('Nouvelle révision créée.')
      invalidate()
      navigate(`/commercial/devis/${r.data.devis_id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const devis = data?.results ?? []

  return (
    <>
      {showModal && (
        <DevisCreateModal
          onClose={() => setShowModal(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}

      <div className="space-y-5 animate-fade-in">

        {/* Header standalone */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Devis</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">
              {data?.count ?? 0} devis
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>
            Nouveau devis
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
              {['Référence', 'Client', 'Commercial', 'Version', 'Montant HT', 'Validité', 'Date', 'Statut', ''].map((h) => (
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
                        <div className="skeleton h-4 rounded" style={{ width: `${50 + j * 6}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : devis.length === 0
              ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <FileText size={32} className="mx-auto mb-3 text-[--text-muted]" />
                    <p className="text-sm text-[--text-secondary]">Aucun devis trouvé</p>
                  </td>
                </tr>
              )
              : devis.map((d) => (
                <tr
                  key={d.id}
                  className="group hover:bg-[--bg-elevated] transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onClick={() => navigate(`/commercial/devis/${d.id}`)}
                >
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold text-[--accent]">{d.reference}</span>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs font-medium text-[--text-primary]">{d.client_nom}</p>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{d.commercial_nom ?? '—'}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-data text-xs text-[--text-muted]">v{d.version}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold">{formatXOF(Number(d.montant_ht))}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{formatDate(d.date_validite)}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{formatDate(d.date_devis)}</span>
                  </td>
                  <td className="px-6 py-5">
                    <Badge variant={STATUT_CFG[d.statut].variant}>{STATUT_CFG[d.statut].label}</Badge>
                  </td>
                  <td className="px-6 py-5">
                    <ActionMenu
                      devis={d}
                      onView={() => navigate(`/commercial/devis/${d.id}`)}
                      onEnvoyer={() => envoyerMut.mutate(d.id)}
                      onAccepter={() => accepterMut.mutate(d.id)}
                      onRefuser={() => refuserMut.mutate(d.id)}
                      onConvertir={() => convertirMut.mutate(d.id)}
                      onRevision={() => revisionMut.mutate(d.id)}
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
