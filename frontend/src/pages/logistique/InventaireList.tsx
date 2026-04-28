/**
 * MEPALE ERP — Inventaires Physiques
 * Liste des sessions d'inventaire — cliquer une ligne ouvre la page de détail
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Plus, CheckCircle2, AlertTriangle,
  X, ListChecks, SlidersHorizontal, Zap, ChevronRight,
  Layers, Tag, Package, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'
import { logistiqueApi, type StatutInventaire, type TypePerimetre } from '@/services/logistique'
import { productionApi, type TypeArticle, type Article } from '@/services/production'

// ─── Design tokens locaux ─────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Config statuts ───────────────────────────────────────────────────────────

const STATUT_CONFIG: Record<StatutInventaire, { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  en_cours: { label: 'En cours',  variant: 'warning' },
  valide:   { label: 'Validé',    variant: 'success' },
  annule:   { label: 'Annulé',    variant: 'danger'  },
}

// ─── Périmètres disponibles ───────────────────────────────────────────────────

const PERIMETRE_OPTIONS: {
  value: TypePerimetre
  label: string
  desc:  string
  icon:  React.ReactNode
  step1: string
}[] = [
  {
    value: 'complet',
    label: 'Inventaire complet',
    desc:  'Tous les lots et articles actifs',
    icon:  <Layers size={15} />,
    step1: 'Tous les lots disponibles et bloqués sont chargés dans la session',
  },
  {
    value: 'categorie',
    label: 'Par catégorie',
    desc:  'Filtrer par type d\'article',
    icon:  <Tag size={15} />,
    step1: 'Seuls les lots et articles des catégories sélectionnées seront chargés',
  },
  {
    value: 'articles',
    label: 'Articles ciblés',
    desc:  'Sélection manuelle d\'articles',
    icon:  <Package size={15} />,
    step1: 'Seuls les articles explicitement sélectionnés seront chargés',
  },
]

// ─── Payload création ─────────────────────────────────────────────────────────

interface CreateInventairePayload {
  notes?:           string
  type_perimetre:   TypePerimetre
  categories?:      string[]
  articles_cibles?: string[]
}

// ─── Modal création inventaire ────────────────────────────────────────────────

function CreateInventaireModal({
  onClose,
  onSave,
  isPending,
}: {
  onClose:   () => void
  onSave:    (data: CreateInventairePayload) => void
  isPending: boolean
}) {
  const [typePerimetre,      setTypePerimetre]      = useState<TypePerimetre>('complet')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedArticles,   setSelectedArticles]   = useState<string[]>([])
  const [articleSearch,      setArticleSearch]      = useState('')
  const [notes,              setNotes]              = useState('')

  // Types d'articles (pour mode "categorie")
  const { data: types, isLoading: typesLoading } = useQuery({
    queryKey: ['types-articles-inventaire'],
    queryFn:  () => productionApi.listTypesArticles().then((r) => r.data),
    enabled:  typePerimetre === 'categorie',
  })

  // Articles (pour mode "articles")
  const { data: articlesData, isLoading: articlesLoading } = useQuery({
    queryKey: ['articles-inventaire', articleSearch],
    queryFn:  () => productionApi.listArticles({ search: articleSearch || undefined, page_size: 100 }).then((r) => r.data),
    enabled:  typePerimetre === 'articles',
  })
  const articles = articlesData?.results ?? []

  const toggleCategorie = (id: string) =>
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const toggleArticle = (id: string) =>
    setSelectedArticles((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const canSubmit =
    typePerimetre === 'complet' ||
    (typePerimetre === 'categorie' && selectedCategories.length > 0) ||
    (typePerimetre === 'articles'  && selectedArticles.length > 0)

  const handleSave = () => {
    onSave({
      notes:           notes || undefined,
      type_perimetre:  typePerimetre,
      categories:      typePerimetre === 'categorie' ? selectedCategories : undefined,
      articles_cibles: typePerimetre === 'articles'  ? selectedArticles   : undefined,
    })
  }

  const perimetre = PERIMETRE_OPTIONS.find((p) => p.value === typePerimetre)!

  const STEPS = [
    {
      icon:  <ListChecks size={13} />,
      label: 'Chargement automatique',
      desc:  perimetre.step1,
    },
    {
      icon:  <SlidersHorizontal size={13} />,
      label: 'Saisie des comptages',
      desc:  'Renseignez les quantités comptées ligne par ligne depuis la page de la session',
    },
    {
      icon:  <AlertTriangle size={13} />,
      label: 'Détection des écarts',
      desc:  'Les écarts entre stock théorique et compté sont calculés automatiquement',
    },
    {
      icon:  <Zap size={13} />,
      label: 'Validation & ajustements',
      desc:  'La validation crée les mouvements d\'ajustement et met à jour le stock',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />

      <div
        className="relative z-10 w-full max-w-lg rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
          maxHeight:       '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <ClipboardCheck size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouvel inventaire physique</h3>
              <p className="text-xs text-[--text-muted] mt-0.5">Une référence sera générée automatiquement</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* ── Périmètre ── */}
            <div>
              <p className={FIELD_LABEL}>Périmètre de l'inventaire</p>
              <div className="grid grid-cols-3 gap-2">
                {PERIMETRE_OPTIONS.map((opt) => {
                  const active = typePerimetre === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setTypePerimetre(opt.value)
                        setSelectedCategories([])
                        setSelectedArticles([])
                        setArticleSearch('')
                      }}
                      className="flex flex-col items-start gap-1.5 px-3 py-2.5 rounded-lg text-left transition-all"
                      style={{
                        backgroundColor: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        border:          `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      <span style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {opt.icon}
                      </span>
                      <span
                        className="text-[11px] font-semibold leading-tight"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {opt.label}
                      </span>
                      <span className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                        {opt.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Sélection catégories ── */}
            {typePerimetre === 'categorie' && (
              <div>
                <p className={FIELD_LABEL}>
                  Catégories ciblées
                  <span className="text-[--status-danger] ml-0.5">*</span>
                </p>
                {typesLoading ? (
                  <div className="flex gap-2">
                    {[1,2,3].map((i) => (
                      <div key={i} className="skeleton h-7 w-24 rounded-full" />
                    ))}
                  </div>
                ) : !types?.length ? (
                  <p className="text-xs text-[--text-muted]">Aucune catégorie disponible</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {types.map((t) => {
                      const active = selectedCategories.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleCategorie(t.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all"
                          style={{
                            backgroundColor: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                            border:          `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                            color:           active ? 'var(--accent)' : 'var(--text-secondary)',
                          }}
                        >
                          {active && <CheckCircle2 size={11} />}
                          {t.libelle}
                        </button>
                      )
                    })}
                  </div>
                )}
                {selectedCategories.length === 0 && !typesLoading && (
                  <p className="text-[10px] text-[--text-muted] mt-1.5">Sélectionnez au moins une catégorie</p>
                )}
              </div>
            )}

            {/* ── Sélection articles ── */}
            {typePerimetre === 'articles' && (
              <div>
                <p className={FIELD_LABEL}>
                  Articles ciblés
                  <span className="text-[--status-danger] ml-0.5">*</span>
                  {selectedArticles.length > 0 && (
                    <span
                      className="ml-2 px-1.5 py-0.5 rounded font-data normal-case font-normal"
                      style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                    >
                      {selectedArticles.length} sélectionné{selectedArticles.length > 1 ? 's' : ''}
                    </span>
                  )}
                </p>

                <Input
                  icon={<Search size={13} />}
                  placeholder="Rechercher un article…"
                  value={articleSearch}
                  onChange={(e) => setArticleSearch(e.target.value)}
                />

                <div
                  className="mt-2 rounded-lg overflow-hidden"
                  style={{ border: '1px solid var(--border)', maxHeight: '180px', overflowY: 'auto' }}
                >
                  {articlesLoading ? (
                    <div className="px-3 py-3 flex flex-col gap-2">
                      {[1,2,3,4].map((i) => (
                        <div key={i} className="skeleton h-4 rounded w-full" />
                      ))}
                    </div>
                  ) : articles.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-[--text-muted]">
                      {articleSearch ? 'Aucun résultat' : 'Aucun article'}
                    </div>
                  ) : (
                    articles.map((a, i) => {
                      const checked = selectedArticles.includes(a.id)
                      return (
                        <div
                          key={a.id}
                          onClick={() => toggleArticle(a.id)}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors"
                          style={{
                            borderTop:       i > 0 ? '1px solid var(--border-subtle)' : undefined,
                            backgroundColor: checked ? 'var(--accent-dim)' : undefined,
                          }}
                        >
                          {/* Checkbox visuel */}
                          <div
                            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                            style={{
                              backgroundColor: checked ? 'var(--accent)' : 'var(--bg-elevated)',
                              border:          `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                            }}
                          >
                            {checked && <CheckCircle2 size={10} color="white" />}
                          </div>

                          {/* Infos article */}
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-[--text-primary] truncate block">{a.designation}</span>
                          </div>
                          <span className="font-data text-[10px] text-[--text-muted] flex-shrink-0">{a.code}</span>
                        </div>
                      )
                    })
                  )}
                </div>
                {selectedArticles.length === 0 && (
                  <p className="text-[10px] text-[--text-muted] mt-1.5">Sélectionnez au moins un article</p>
                )}
              </div>
            )}

            {/* ── Étapes ── */}
            <div>
              <p className={FIELD_LABEL}>Déroulement de la session</p>
              <div className="flex flex-col gap-2">
                {STEPS.map((step, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                        style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ color: 'var(--accent)' }}>{step.icon}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[--text-primary] leading-tight">{step.label}</p>
                      <p className="text-[11px] text-[--text-muted] mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Notes ── */}
            <div>
              <label className={FIELD_LABEL}>
                Notes <span className="text-[--text-muted] normal-case font-normal">(optionnel)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Zone concernée, contexte de l'inventaire, équipe en charge…"
                className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
              />
            </div>

            {/* ── Avertissement ── */}
            <div
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
              style={{ backgroundColor: 'rgba(var(--accent-rgb, 0,201,167),0.06)', border: '1px solid var(--accent)' }}
            >
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                La <strong className="text-[--text-primary]">validation</strong> est irréversible — les ajustements de stock appliqués ne peuvent pas être annulés.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            loading={isPending}
            disabled={!canSubmit}
            icon={<Plus size={13} />}
            onClick={handleSave}
          >
            Lancer l'inventaire
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function InventaireList() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const [page, setPage]             = useState(1)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['inventaires', page],
    queryFn:  () => logistiqueApi.listInventaires({ page }).then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (payload: CreateInventairePayload) => logistiqueApi.createInventaire(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['inventaires'] })
      setShowCreate(false)
      toast.success(`Inventaire ${res.data.reference} créé — ${res.data.nb_lignes} ligne(s) chargée(s)`)
      navigate(`/logistique/inventaires/${res.data.id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la création'),
  })

  const inventaires = data?.results ?? []
  const pages       = Math.ceil((data?.count ?? 0) / 25)

  return (
    <>
      {showCreate && (
        <CreateInventaireModal
          onClose={() => setShowCreate(false)}
          onSave={(payload) => createMut.mutate(payload)}
          isPending={createMut.isPending}
        />
      )}

      <div className="flex flex-col h-full gap-4 animate-fade-in">

        {/* ── En-tête ── */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Inventaires Physiques</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">
              {data?.count ?? 0} session{(data?.count ?? 0) > 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Nouvel inventaire
          </Button>
        </div>

        {/* ── Table card ── */}
        <div className="surface overflow-hidden flex flex-col flex-1 min-h-0" style={{ boxShadow: 'var(--shadow-card)' }}>

        {/* ── Table ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr
                className="sticky top-0 z-10 text-left"
                style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}
              >
                {['Référence', 'Statut', 'Progression', 'Écarts', 'Créé par', 'Début', 'Fin', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-6 py-5"><div className="skeleton h-3 rounded w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                : inventaires.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-20 text-center">
                      <ClipboardCheck size={36} className="mx-auto mb-3 text-[--text-muted]" />
                      <p className="text-sm text-[--text-secondary]">Aucune session d'inventaire</p>
                      <p className="text-xs text-[--text-muted] mt-1">
                        Créez-en une pour démarrer le comptage
                      </p>
                    </td>
                  </tr>
                )
                : inventaires.map((inv) => {
                    const cfg      = STATUT_CONFIG[inv.statut]
                    const lignes   = inv.lignes ?? []
                    const total    = lignes.length
                    const comptees = lignes.filter((l) => l.quantite_comptee !== null).length
                    const pct      = total > 0 ? Math.round((comptees / total) * 100) : 0

                    return (
                      <tr
                        key={inv.id}
                        className="cursor-pointer transition-colors hover:bg-[--bg-elevated] group"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        onClick={() => navigate(`/logistique/inventaires/${inv.id}`)}
                      >
                        {/* Référence + périmètre */}
                        <td className="px-6 py-5">
                          <span className="font-data text-xs font-bold text-[--accent]">{inv.reference}</span>
                          {inv.type_perimetre !== 'complet' && (
                            <p className="text-[10px] text-[--text-muted] mt-0.5">{inv.type_perimetre_label}</p>
                          )}
                        </td>

                        {/* Statut */}
                        <td className="px-6 py-5">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </td>

                        {/* Progression */}
                        <td className="px-6 py-5">
                          {total > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width:           `${pct}%`,
                                    backgroundColor: pct === 100 ? 'var(--status-success)' : 'var(--accent)',
                                  }}
                                />
                              </div>
                              <span className="font-data text-[10px] text-[--text-muted]">{comptees}/{total}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[--text-muted]">0 ligne</span>
                          )}
                        </td>

                        {/* Écarts */}
                        <td className="px-6 py-5">
                          {inv.nb_ecarts > 0 ? (
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--status-warning)' }}>
                              <AlertTriangle size={11} />
                              {inv.nb_ecarts} écart{inv.nb_ecarts > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[--text-muted]">—</span>
                          )}
                        </td>

                        {/* Créé par */}
                        <td className="px-4 py-3 text-xs text-[--text-secondary]">{inv.cree_par_nom ?? '—'}</td>

                        {/* Début */}
                        <td className="px-4 py-3 font-data text-xs text-[--text-muted]">{formatDate(inv.date_debut)}</td>

                        {/* Fin */}
                        <td className="px-4 py-3 font-data text-xs text-[--text-muted]">
                          {inv.date_fin ? formatDate(inv.date_fin) : '—'}
                        </td>

                        {/* Chevron */}
                        <td className="px-4 py-3 text-right">
                          <ChevronRight
                            size={14}
                            className="text-[--border] group-hover:text-[--accent] transition-colors"
                          />
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
          </div>
        </div>

        {/* ── Pagination ── */}
        {pages > 1 && (
          <div
            className="flex items-center justify-between px-6 py-2.5 flex-shrink-0 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
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
