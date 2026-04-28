import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Search, RefreshCw, Copy, ChevronDown, ChevronRight,
  Layers, Plus, Trash2, Edit2, EyeOff, Eye, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { cn, formatDate } from '@/lib/utils'
import { productionApi, type Nomenclature } from '@/services/production'

// ── Styles partagés ───────────────────────────────────────────────────────────

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)

const FIELD_LABEL = 'text-xs font-medium text-[--text-secondary] uppercase tracking-wider'

const INPUT_INLINE = cn(
  'h-8 w-full bg-[--bg-elevated] border border-[--border] rounded text-xs px-2',
  'text-[--text-primary] transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_2px_var(--accent-dim)]',
)

// ── Types locaux ──────────────────────────────────────────────────────────────

interface LigneForm {
  _key:       string
  matiere:    string
  quantite:   string
  taux_perte: string
  notes:      string
}

interface NomForm {
  produit_fini:   string
  quantite_base:  string
  notes:          string
  active:         boolean
}

const NOM_DEFAULT: NomForm = {
  produit_fini:  '',
  quantite_base: '1',
  notes:         '',
  active:        true,
}

const newLigne = (): LigneForm => ({
  _key:       crypto.randomUUID(),
  matiere:    '',
  quantite:   '',
  taux_perte: '0',
  notes:      '',
})

// ── Sous-composant : lignes expandées (lecture) ───────────────────────────────

function LignesExpandees({ nomenclature }: { nomenclature: Nomenclature }) {
  return (
    <tr>
      <td colSpan={7} className="px-0 pb-0">
        <div
          className="mx-4 mb-3 rounded overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
        >
          {nomenclature.lignes.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[--text-muted] italic">Aucun composant défini.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Matière / Composant', 'Quantité', 'Taux perte', 'Qté avec perte', 'Notes'].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nomenclature.lignes.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-3 py-2 text-xs font-medium text-[--text-primary]">
                      {l.matiere_detail?.designation}
                      <span className="ml-1.5 text-[--text-muted] font-normal">{l.matiere_detail?.code}</span>
                    </td>
                    <td className="px-3 py-2 font-data text-xs text-[--text-secondary]">
                      {l.quantite} <span className="text-[--text-muted]">{l.matiere_detail?.unite_code}</span>
                    </td>
                    <td className="px-3 py-2 font-data text-xs text-[--text-secondary]">
                      {l.taux_perte > 0 ? `${l.taux_perte}%` : '—'}
                    </td>
                    <td className="px-3 py-2 font-data text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                      {Number(l.quantite_avec_perte).toFixed(4)} <span className="text-[--text-muted] font-normal">{l.matiere_detail?.unite_code}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[--text-muted]">{l.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export function NomenclatureList() {
  const qc = useQueryClient()
  const [search, setSearch]           = useState('')
  const [expanded, setExpanded]       = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen]     = useState(false)
  const [editing, setEditing]         = useState<Nomenclature | null>(null)
  const [form, setForm]               = useState<NomForm>(NOM_DEFAULT)
  const [lignes, setLignes]           = useState<LigneForm[]>([newLigne()])
  const [deleteTarget, setDeleteTarget] = useState<Nomenclature | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['nomenclatures', search],
    queryFn: () => productionApi.listNomenclatures({ search: search || undefined }).then((r) => r.data),
  })

  // Articles matières (mp + sf) pour le sélecteur de lignes
  const { data: matieresData } = useQuery({
    queryKey: ['articles-matieres'],
    queryFn: () => productionApi.listArticles({ page_size: 500 }).then((r) => r.data),
    enabled: modalOpen,
    staleTime: 0,
  })
  const matieres = (matieresData?.results ?? []).filter((a) =>
    ['mp', 'sf', 'emballage'].includes(a.type_code),   // type_code, pas type (UUID)
  )

  // Articles produits finis pour le sélecteur en-tête
  const { data: produitsData } = useQuery({
    queryKey: ['articles-pf'],
    queryFn: () => productionApi.listArticles({ type_code: 'pf', page_size: 500 }).then((r) => r.data),
    enabled: modalOpen,
    staleTime: 0,
  })
  const produitsFinis = produitsData?.results ?? []

  // ── Mutations ──────────────────────────────────────────────────────────────

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const payload = {
        produit_fini:  form.produit_fini,
        quantite_base: parseFloat(form.quantite_base),
        notes:         form.notes,
        active:        form.active,
        lignes: lignes
          .filter((l) => l.matiere && l.quantite)
          .map((l) => ({
            matiere:    l.matiere,
            quantite:   parseFloat(l.quantite),
            taux_perte: parseFloat(l.taux_perte) || 0,
            notes:      l.notes,
          })),
      }
      return editing
        ? productionApi.updateNomenclature(editing.id, payload)
        : productionApi.createNomenclature(payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Nomenclature mise à jour' : 'Nomenclature créée')
      qc.invalidateQueries({ queryKey: ['nomenclatures'] })
      closeModal()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la sauvegarde'),
  })

  const dupliquer = useMutation({
    mutationFn: (id: string) => productionApi.dupliquerNomenclature(id),
    onSuccess: () => {
      toast.success('Nomenclature dupliquée.')
      qc.invalidateQueries({ queryKey: ['nomenclatures'] })
    },
  })

  const { mutate: toggleActive, isPending: toggling } = useMutation({
    mutationFn: (n: Nomenclature) =>
      productionApi.updateNomenclature(n.id, { active: !n.active }),
    onSuccess: (_, n) => {
      toast.success(n.active ? 'Nomenclature désactivée' : 'Nomenclature réactivée')
      qc.invalidateQueries({ queryKey: ['nomenclatures'] })
    },
    onError: () => toast.error('Erreur lors du changement de statut'),
  })

  const { mutate: deleteNom, isPending: deleting } = useMutation({
    mutationFn: (id: string) => productionApi.deleteNomenclature(id),
    onSuccess: () => {
      toast.success('Nomenclature supprimée')
      qc.invalidateQueries({ queryKey: ['nomenclatures'] })
      setDeleteTarget(null)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la suppression'),
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const openCreate = () => {
    setEditing(null)
    setForm(NOM_DEFAULT)
    setLignes([newLigne()])
    setModalOpen(true)
  }

  const openEdit = (n: Nomenclature) => {
    setEditing(n)
    setForm({
      produit_fini:  n.produit_fini,
      quantite_base: String(n.quantite_base),
      notes:         n.notes ?? '',
      active:        n.active,
    })
    setLignes(
      n.lignes.length > 0
        ? n.lignes.map((l) => ({
            _key:       l.id,
            matiere:    l.matiere,
            quantite:   String(l.quantite),
            taux_perte: String(l.taux_perte),
            notes:      l.notes ?? '',
          }))
        : [newLigne()]
    )
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(NOM_DEFAULT)
    setLignes([newLigne()])
  }

  const addLigne   = () => setLignes((l) => [...l, newLigne()])
  const removeLigne = (key: string) => setLignes((l) => l.filter((x) => x._key !== key))
  const updateLigne = (key: string, field: keyof Omit<LigneForm, '_key'>, value: string) =>
    setLignes((l) => l.map((x) => x._key === key ? { ...x, [field]: value } : x))

  const handleSave = () => {
    if (!form.produit_fini) { toast.error('Sélectionner un produit fini.'); return }
    if (!form.quantite_base || parseFloat(form.quantite_base) <= 0) { toast.error('Quantité de base invalide.'); return }
    const validLignes = lignes.filter((l) => l.matiere && l.quantite)
    if (validLignes.length === 0) { toast.error('Ajouter au moins un composant.'); return }
    save()
  }

  const nomenclatures = data?.results ?? []

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[--text-primary]">Nomenclatures (BOM)</h1>
          <p className="text-sm text-[--text-muted] mt-0.5">
            {data?.count ?? 0} nomenclature{(data?.count ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => refetch()}>
            Actualiser
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openCreate}>
            Nouvelle nomenclature
          </Button>
        </div>
      </div>

      {/* Table card */}
      <div className="surface overflow-hidden">

        {/* Recherche */}
        <div
          className="flex flex-wrap gap-2 items-center px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-64">
            <Input
              placeholder="Rechercher un produit…"
              icon={<Search size={13} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
              {['', 'Produit fini', 'Version', 'Qté de base', 'Statut', 'Dernière modif', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-6 py-5"><div className="skeleton h-3 rounded w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : nomenclatures.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Layers size={28} style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm text-[--text-muted]">Aucune nomenclature. Créez-en une.</p>
                  </div>
                </td>
              </tr>
            ) : (
              nomenclatures.flatMap((n) => {
                const isOpen = expanded.has(n.id)
                return [
                  <tr
                    key={n.id}
                    style={{ borderBottom: isOpen ? 'none' : '1px solid var(--border-subtle)' }}
                    className="transition-colors hover:bg-[--bg-elevated]"
                  >
                    <td className="px-4 py-2.5 w-8">
                      <button
                        onClick={() => toggle(n.id)}
                        className="text-[--text-muted] hover:text-[--text-primary] transition-colors"
                        title={isOpen ? 'Replier' : `${n.lignes.length} composant(s)`}
                      >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium text-[--text-primary]">{n.produit_detail?.designation}</p>
                      <p className="text-[10px] text-[--text-muted] font-data mt-0.5">{n.lignes.length} composant{n.lignes.length > 1 ? 's' : ''}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-data text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        v{n.version}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                      {n.quantite_base} <span className="text-[--text-muted]">{n.produit_detail?.unite_code}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={n.active ? 'success' : 'neutral'} dot>
                        {n.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                      {formatDate(n.date_modif)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="xs" icon={<Edit2 size={12} />} onClick={() => openEdit(n)}>
                          Modifier
                        </Button>
                        <Button
                          variant="ghost" size="xs" icon={<Copy size={12} />}
                          loading={dupliquer.isPending}
                          onClick={() => dupliquer.mutate(n.id)}
                        >
                          Dupliquer
                        </Button>
                        <Button
                          variant="ghost" size="xs"
                          icon={n.active ? <EyeOff size={12} /> : <Eye size={12} />}
                          loading={toggling}
                          onClick={() => toggleActive(n)}
                          title={n.active ? 'Désactiver cette nomenclature' : 'Réactiver cette nomenclature'}
                        >
                          {n.active ? 'Désactiver' : 'Réactiver'}
                        </Button>
                        {n.ordres_count === 0 && (
                          <Button
                            variant="ghost" size="xs"
                            icon={<Trash2 size={12} />}
                            onClick={() => setDeleteTarget(n)}
                            className="text-[--status-danger] hover:text-[--status-danger]"
                            title="Supprimer définitivement"
                          >
                            Supprimer
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>,
                  isOpen && <LignesExpandees key={`${n.id}-lignes`} nomenclature={n} />,
                ].filter(Boolean)
              })
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* ── Modal confirmation suppression ── */}
    <Modal
      isOpen={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      title={`Supprimer — ${deleteTarget?.produit_detail?.designation}`}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(null)}>
            Annuler
          </Button>
          <Button
            size="sm" variant="danger"
            loading={deleting}
            onClick={() => deleteTarget && deleteNom(deleteTarget.id)}
          >
            Supprimer définitivement
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
            Action irréversible. La nomenclature{' '}
            <strong>v{deleteTarget?.version}</strong> et tous ses composants seront définitivement supprimés.
          </p>
        </div>
        <p className="text-xs text-[--text-secondary]">
          Cette suppression est possible car aucun ordre de fabrication n'a encore utilisé cette nomenclature.
        </p>
      </div>
    </Modal>

    {/* ── Modal création / édition ── */}
    <Modal
      isOpen={modalOpen}
      onClose={closeModal}
      title={editing ? `Modifier — ${editing.produit_detail?.designation}` : 'Nouvelle nomenclature (BOM)'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal}>Annuler</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
            {editing ? 'Enregistrer' : 'Créer la nomenclature'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">

        {/* ── Section En-tête ── */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="w-1 h-3.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            <p className="text-xs font-semibold text-[--text-secondary] uppercase tracking-wider">En-tête</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Produit fini */}
            <div className="flex flex-col gap-2">
              <label className={FIELD_LABEL}>Produit fini *</label>
              <select
                value={form.produit_fini}
                onChange={(e) => setForm((f) => ({ ...f, produit_fini: e.target.value }))}
                className={SELECT_CLASS}
              >
                <option value="">— Sélectionner un produit —</option>
                {produitsFinis.map((a) => (
                  <option key={a.id} value={a.id}>{a.designation} ({a.code})</option>
                ))}
              </select>
            </div>

            {/* Quantité de base */}
            <Input
              label="Quantité de base *"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Ex : 100"
              value={form.quantite_base}
              onChange={(e) => setForm((f) => ({ ...f, quantite_base: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Notes */}
            <div className="flex flex-col gap-2">
              <label className={FIELD_LABEL}>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Remarques sur cette nomenclature…"
                className={cn(SELECT_CLASS, 'h-auto py-2 resize-none')}
              />
            </div>

            {/* Statut actif */}
            <div className="flex flex-col gap-2">
              <label className={FIELD_LABEL}>Statut</label>
              <div className="flex items-center gap-3 h-9">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={cn(
                    'relative w-10 h-5.5 rounded-full transition-all duration-200 flex-shrink-0',
                    form.active ? 'bg-[--accent]' : 'bg-[--border]'
                  )}
                  style={{ height: '22px', width: '40px' }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ left: form.active ? '20px' : '2px' }}
                  />
                </button>
                <span className="text-sm text-[--text-secondary]">
                  {form.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section Composants ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between pb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <span className="w-1 h-3.5 rounded-full" style={{ backgroundColor: 'var(--status-info)' }} />
              <p className="text-xs font-semibold text-[--text-secondary] uppercase tracking-wider">
                Composants
                <span className="ml-2 px-1.5 py-0.5 rounded font-data text-[10px]"
                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {lignes.filter((l) => l.matiere && l.quantite).length}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={addLigne}
              className="flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              <Plus size={12} />
              Ajouter un composant
            </button>
          </div>

          {/* En-têtes colonnes */}
          <div className="grid gap-2 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] px-1"
            style={{ gridTemplateColumns: '1fr 90px 80px auto' }}>
            <span>Matière / Composant *</span>
            <span>Quantité *</span>
            <span>Taux perte %</span>
            <span />
          </div>

          {/* Lignes */}
          <div className="flex flex-col gap-2">
            {lignes.map((l, i) => (
              <div
                key={l._key}
                className="grid gap-2 items-center px-1"
                style={{ gridTemplateColumns: '1fr 90px 80px auto' }}
              >
                {/* Matière */}
                <select
                  value={l.matiere}
                  onChange={(e) => updateLigne(l._key, 'matiere', e.target.value)}
                  className={INPUT_INLINE}
                >
                  <option value="">— Sélectionner —</option>
                  {matieres.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.designation} ({a.unite_code})
                    </option>
                  ))}
                </select>

                {/* Quantité */}
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  placeholder="0.000"
                  value={l.quantite}
                  onChange={(e) => updateLigne(l._key, 'quantite', e.target.value)}
                  className={cn(INPUT_INLINE, 'font-data')}
                />

                {/* Taux perte */}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0"
                  value={l.taux_perte}
                  onChange={(e) => updateLigne(l._key, 'taux_perte', e.target.value)}
                  className={cn(INPUT_INLINE, 'font-data')}
                />

                {/* Supprimer */}
                <button
                  type="button"
                  onClick={() => removeLigne(l._key)}
                  disabled={lignes.length === 1 && i === 0}
                  className="p-1 rounded transition-colors disabled:opacity-30"
                  style={{ color: 'var(--status-danger)' }}
                  title="Supprimer ce composant"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Aide */}
          <p className="text-[11px] text-[--text-muted] px-1">
            Les lignes sans matière ou sans quantité sont ignorées.
          </p>
        </div>

      </div>
    </Modal>
    </>
  )
}
