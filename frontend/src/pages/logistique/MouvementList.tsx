/**
 * MEPALE ERP — Mouvements de Stock
 * Historique + saisie manuelle (ajust_pos / ajust_neg) avec pièce jointe
 */

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Search, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight,
  Plus, Paperclip, X, Filter,
} from 'lucide-react'

import { logistiqueApi, type TypeMouvementManuel } from '@/services/logistique'
import { productionApi, type Article }              from '@/services/production'
import { Badge }   from '@/components/ui/Badge'
import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { cn, formatDate, formatXOF } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Types de mouvement manuel ─────────────────────────────────────────────────

interface TypeOption {
  value: TypeMouvementManuel
  label: string
  sens: 1 | -1 | null
  note: string
}

const TYPE_OPTIONS: TypeOption[] = [
  { value: 'ajust_pos', label: 'Entrée',  sens: 1,  note: 'Augmente le stock disponible' },
  { value: 'ajust_neg', label: 'Sortie',  sens: -1, note: 'Diminue le stock disponible'  },
]

// ─── Interface formulaire ─────────────────────────────────────────────────────

interface MouvForm {
  article: string
  type: TypeMouvementManuel | ''
  sens: '1' | '-1'
  quantite: string
  cout_unitaire: string
  reference_doc: string
  notes: string
  piece_jointe: File | null
}

const EMPTY_FORM: MouvForm = {
  article: '', type: '', sens: '1',
  quantite: '', cout_unitaire: '',
  reference_doc: '', notes: '',
  piece_jointe: null,
}

// ─── Modal Saisie Manuelle ────────────────────────────────────────────────────

function CreateMouvementModal({
  onClose,
  onSave,
  isPending,
}: {
  onClose: () => void
  onSave: (fd: FormData) => void
  isPending: boolean
}) {
  const [form, setForm] = useState<MouvForm>(EMPTY_FORM)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: articleData } = useQuery({
    queryKey: ['articles-select'],
    queryFn:  () => productionApi.listArticles({ page_size: 500 }),
    select:   (r) => r.data.results,
    staleTime: 0,
  })

  const articles = (articleData ?? []) as Article[]

  const setField = <K extends keyof MouvForm>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: (e.target as HTMLInputElement).value }))

  const selectedOpt = TYPE_OPTIONS.find((t) => t.value === form.type) ?? null

  const handleTypeChange = (val: TypeMouvementManuel | '') => {
    const opt = TYPE_OPTIONS.find((t) => t.value === val)
    setForm((prev) => ({
      ...prev,
      type: val,
      sens: opt?.sens === 1 ? '1' : opt?.sens === -1 ? '-1' : prev.sens,
    }))
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setForm((prev) => ({ ...prev, piece_jointe: file }))
  }

  const removeFile = () => {
    setForm((prev) => ({ ...prev, piece_jointe: null }))
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSubmit = () => {
    if (!form.article)                    { toast.error('Sélectionnez un article'); return }
    if (!form.type)                       { toast.error('Sélectionnez un type de mouvement'); return }
    if (!(parseFloat(form.quantite) > 0)) { toast.error('Quantité invalide'); return }

    const computedSens = String(selectedOpt?.sens ?? 1)

    const fd = new FormData()
    fd.append('article',       form.article)
    fd.append('type',          form.type)
    fd.append('quantite',      form.quantite)
    fd.append('sens',          computedSens)
    fd.append('cout_unitaire', form.cout_unitaire || '0')
    if (form.reference_doc)  fd.append('reference_doc', form.reference_doc)
    if (form.notes)          fd.append('notes',         form.notes)
    if (form.piece_jointe)   fd.append('piece_jointe',  form.piece_jointe)

    onSave(fd)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-lg animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <ArrowLeftRight size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Saisie manuelle de mouvement</h3>
              <p className="text-xs text-[--text-muted]">Ajustement manuel de stock</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* Article */}
            <div>
              <label className={FIELD_LABEL}>
                Article <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <select className={SELECT_CLASS} style={{ height: '36px' }} value={form.article} onChange={setField('article')}>
                <option value="">— Sélectionner un article —</option>
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>{a.designation} ({a.code})</option>
                ))}
              </select>
            </div>

            {/* Type de mouvement (dropdown) */}
            <div>
              <label className={FIELD_LABEL}>
                Type de mouvement <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <select
                className={SELECT_CLASS}
                style={{ height: '36px' }}
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value as TypeMouvementManuel | '')}
              >
                <option value="">— Sélectionner un type —</option>
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Description contextuelle de l'option sélectionnée */}
              {selectedOpt && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }}>
                  <span style={{ color: 'var(--accent)', flexShrink: 0 }}>
                    {selectedOpt.value === 'ajust_pos'
                      ? <ArrowUpCircle   size={13} />
                      : <ArrowDownCircle size={13} />
                    }
                  </span>
                  <p className="text-[11px]" style={{ color: 'var(--accent)' }}>{selectedOpt.note}</p>
                </div>
              )}
            </div>

            {/* Quantité + Coût */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>
                  Quantité <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <Input
                  type="number" min={0.001} step="any"
                  value={form.quantite} onChange={setField('quantite')}
                  placeholder="0" className="font-data"
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>Coût unitaire (FCFA)</label>
                <Input
                  type="number" min={0} step="any"
                  value={form.cout_unitaire} onChange={setField('cout_unitaire')}
                  placeholder="0" className="font-data"
                />
              </div>
            </div>

            {/* Référence document */}
            <div>
              <label className={FIELD_LABEL}>Référence document</label>
              <Input
                value={form.reference_doc} onChange={setField('reference_doc')}
                placeholder="PV-INVENTAIRE-2024-01…"
                className="font-data"
              />
            </div>

            {/* Notes */}
            <div>
              <label className={FIELD_LABEL}>Notes / Justification</label>
              <textarea
                value={form.notes} onChange={setField('notes')}
                placeholder="Motif du mouvement, observations…"
                rows={3}
                className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
              />
            </div>

            {/* Pièce jointe */}
            <div>
              <label className={FIELD_LABEL}>Pièce jointe</label>
              {form.piece_jointe ? (
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }}
                >
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent)' }}>
                    <Paperclip size={12} />
                    <span className="truncate max-w-[260px]">{form.piece_jointe.name}</span>
                    <span className="text-[--text-muted]">({(form.piece_jointe.size / 1024).toFixed(1)} Ko)</span>
                  </div>
                  <button onClick={removeFile} className="text-[--text-muted] hover:text-[--status-danger] transition-colors ml-2">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <label
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                  style={{ border: '1px dashed var(--border)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <Paperclip size={13} />
                  <span className="text-xs">Attacher un bon, une facture, un PV d'inventaire…</span>
                  <input
                    ref={fileRef} type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
                    className="sr-only"
                    onChange={handleFile}
                  />
                </label>
              )}
              <p className="text-[10px] text-[--text-muted] mt-1.5">
                Formats acceptés : PDF, image, Word, Excel
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>
            Enregistrer le mouvement
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

const SENS_FILTRES = [
  { v: '',   label: 'Tous'    },
  { v: '1',  label: 'Entrées' },
  { v: '-1', label: 'Sorties' },
]

export function MouvementList() {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [sens, setSens]             = useState('')
  const [page, setPage]             = useState(1)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['mouvements', search, sens, page],
    queryFn:  () =>
      logistiqueApi
        .listMouvements({ search: search || undefined, sens: sens || undefined, page })
        .then((r) => r.data),
  })

  const { mutate: createMvt, isPending: creating } = useMutation({
    mutationFn: (fd: FormData) => logistiqueApi.createMouvement(fd),
    onSuccess: () => {
      toast.success('Mouvement enregistré et stock mis à jour.')
      qc.invalidateQueries({ queryKey: ['mouvements'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      setShowCreate(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de l\'enregistrement'),
  })

  const mouvements = data?.results ?? []
  const pages      = Math.ceil((data?.count ?? 0) / 25)

  return (
    <>
      {showCreate && (
        <CreateMouvementModal
          onClose={() => setShowCreate(false)}
          onSave={(fd) => createMvt(fd)}
          isPending={creating}
        />
      )}

      <div className="flex flex-col h-full gap-4 animate-fade-in">

        {/* ── En-tête ── */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Mouvements de Stock</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">
              {data?.count ?? 0} mouvement{(data?.count ?? 0) > 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Saisir un mouvement
          </Button>
        </div>

        {/* ── Table card ── */}
        <div className="surface overflow-hidden flex flex-col flex-1 min-h-0" style={{ boxShadow: 'var(--shadow-card)' }}>

        {/* ── Filtres ── */}
        <div
          className="flex flex-wrap items-center gap-3 px-6 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-56">
            <Input
              placeholder="Rechercher un article…"
              icon={<Search size={13} />}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-[--text-muted] mr-1" />
            {SENS_FILTRES.map(({ v, label }) => (
              <button
                key={v}
                onClick={() => { setSens(v); setPage(1) }}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all',
                  sens === v
                    ? 'text-[--accent]'
                    : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
                )}
                style={
                  sens === v
                    ? { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                    : { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left sticky top-0 z-10"
                style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                {['Sens', 'Article', 'Lot', 'Type', 'Quantité', 'Coût unitaire', 'Réf. doc', 'Effectué par', 'Date', ''].map((h) => (
                  <th key={h} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-6 py-5"><div className="skeleton h-3 rounded w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                : mouvements.length === 0
                ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center">
                      <ArrowLeftRight size={32} className="mx-auto mb-3 text-[--text-muted]" />
                      <p className="text-sm text-[--text-secondary]">Aucun mouvement de stock</p>
                    </td>
                  </tr>
                )
                : mouvements.map((m) => (
                    <tr key={m.id} className="transition-colors hover:bg-[--bg-elevated]"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {/* Sens */}
                      <td className="px-4 py-2.5">
                        {m.sens === 1
                          ? <ArrowUpCircle   size={16} style={{ color: 'var(--status-success)' }} />
                          : <ArrowDownCircle size={16} style={{ color: 'var(--status-danger)'  }} />
                        }
                      </td>

                      {/* Article */}
                      <td className="px-4 py-2.5 text-xs font-medium text-[--text-primary] max-w-[160px] truncate">
                        {m.article_designation}
                      </td>

                      {/* Lot */}
                      <td className="px-4 py-2.5 font-data text-xs text-[--accent]">{m.lot_numero ?? '—'}</td>

                      {/* Type */}
                      <td className="px-4 py-2.5">
                        <Badge variant="neutral">{m.type_label}</Badge>
                      </td>

                      {/* Quantité */}
                      <td className="px-4 py-2.5 font-data text-xs font-semibold"
                        style={{ color: m.sens === 1 ? 'var(--status-success)' : 'var(--status-danger)' }}>
                        {m.sens === 1 ? '+' : '-'}{m.quantite.toLocaleString('fr-TG')}
                      </td>

                      {/* Coût unitaire */}
                      <td className="px-4 py-2.5 font-data text-xs text-[--text-secondary]">
                        {m.cout_unitaire > 0 ? formatXOF(m.cout_unitaire) : '—'}
                      </td>

                      {/* Réf. doc */}
                      <td className="px-4 py-2.5 font-data text-xs text-[--text-muted]">{m.reference_doc || '—'}</td>

                      {/* Effectué par */}
                      <td className="px-4 py-2.5 text-xs text-[--text-secondary]">{m.effectue_par_nom ?? '—'}</td>

                      {/* Date */}
                      <td className="px-4 py-2.5 font-data text-xs text-[--text-muted]">{formatDate(m.date_mouvement)}</td>

                      {/* Pièce jointe */}
                      <td className="px-4 py-2.5">
                        {m.piece_jointe && (
                          <a
                            href={m.piece_jointe}
                            target="_blank" rel="noreferrer"
                            title="Voir la pièce jointe"
                            className="text-[--text-muted] hover:text-[--accent] transition-colors"
                          >
                            <Paperclip size={13} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
          </div>
        </div>

        {/* ── Pagination ── */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-6 py-2.5 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs text-[--text-muted]">Page {page} / {pages}</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="xs" disabled={page === 1}    onClick={() => setPage((p) => p - 1)}>Précédent</Button>
              <Button variant="secondary" size="xs" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
            </div>
          </div>
        )}

        </div>
      </div>
    </>
  )
}
