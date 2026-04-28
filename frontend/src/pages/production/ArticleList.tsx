/**
 * MEPALE ERP — Catalogue des Articles
 * Création, modification et recherche du référentiel article.
 * Types chargés dynamiquement depuis l'API (plus de hardcode).
 */

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Package, Edit2, Layers, Tag,
  RotateCcw, Zap, PenLine, Loader2, Lock, Eye, Trash2,
} from 'lucide-react'
import { toast }   from 'sonner'
import { Badge }   from '@/components/ui/Badge'
import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { cn }      from '@/lib/utils'
import { productionApi, type Article, type TypeArticle } from '@/services/production'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)

const FIELD_LABEL = 'text-xs font-medium text-[--text-secondary] uppercase tracking-wider'

// ─── Méthodes de valorisation ─────────────────────────────────────────────────

const METHODES_VALORISATION = [
  { value: 'S', label: 'Prix standard (S) — prix fixe' },
  { value: 'V', label: 'Prix moyen mobile (V) — CMUP auto' },
]

// ─── Badge couleur par type ────────────────────────────────────────────────────

const TYPE_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  pf: 'success', mp: 'info', emballage: 'warning', sf: 'neutral',
}
function getBadgeVariant(typeCode: string): 'success' | 'info' | 'warning' | 'neutral' {
  return TYPE_VARIANT[typeCode] ?? 'neutral'
}

// ─── Section separator ────────────────────────────────────────────────────────

function SectionSep({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.15em] whitespace-nowrap"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
    </div>
  )
}

// ─── Champ verrouillé (lecture seule en édition) ──────────────────────────────

function LockedField({
  label, value, raison,
}: {
  label: React.ReactNode
  value: string
  raison?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={FIELD_LABEL}>{label}</span>
        <Lock size={8} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div
        className="h-9 flex items-center px-3 rounded text-sm"
        title={raison}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border:          '1px solid var(--border-subtle)',
          color:           'var(--text-secondary)',
          cursor:          'default',
        }}
      >
        {value || '—'}
      </div>
      {raison && (
        <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>
          {raison}
        </p>
      )}
    </div>
  )
}

// ─── Formulaire ───────────────────────────────────────────────────────────────

interface ArticleForm {
  // Identification
  code:         string
  designation:  string
  type:         string   // UUID TypeArticle
  unite:        string   // UUID UniteMesure
  description:  string
  gere_par_lot: boolean
  // Valorisation
  methode_valorisation: string
  prix_standard:        string   // string input → parseFloat au submit
  // Codes & Références
  code_barre:        string
  reference_externe: string
  // Stockage
  duree_vie_jours:    string   // string input → parseInt au submit
  conditions_stockage: string
  // Approvisionnement
  unite_achat:            string   // UUID ou ''
  coefficient_conversion: string   // string input → parseFloat au submit
}

const EMPTY_FORM: ArticleForm = {
  code: '', designation: '', type: '', unite: '', description: '', gere_par_lot: true,
  methode_valorisation: 'S', prix_standard: '',
  code_barre: '', reference_externe: '',
  duree_vie_jours: '', conditions_stockage: '',
  unite_achat: '', coefficient_conversion: '1',
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none"
      style={{
        backgroundColor: checked ? 'var(--accent)' : 'var(--bg-elevated)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <span
        className="pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow transition duration-200"
        style={{
          backgroundColor: checked ? '#0A0B10' : 'var(--text-muted)',
          transform: `translateX(${checked ? '18px' : '2px'}) translateY(1px)`,
        }}
      />
    </button>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ArticleList() {
  const qc = useQueryClient()

  const [search,     setSearch]   = useState('')
  const [typeFilter, setType]     = useState('')   // code du TypeArticle
  const [page,       setPage]     = useState(1)
  const [showModal,     setShowModal]     = useState(false)
  const [editing,       setEditing]       = useState<Article | null>(null)
  const [viewOnly,      setViewOnly]      = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [form,          setForm]          = useState<ArticleForm>(EMPTY_FORM)
  const [codeMode,      setCodeMode]      = useState<'auto' | 'manuel'>('auto')
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null)

  // ── Types d'articles ──────────────────────────────────────────────────────

  const { data: types = [] } = useQuery({
    queryKey: ['types-articles'],
    queryFn:  () => productionApi.listTypesArticles().then((r) => r.data),
    staleTime: 10 * 60 * 1000,
  })

  useEffect(() => {
    if (types.length > 0 && !editing && !form.type) {
      const defaultType = types.find((t) => t.code === 'mp') ?? types[0]
      setForm((f) => ({ ...f, type: defaultType.id }))
    }
  }, [types, editing, form.type])

  // ── Prochain code ─────────────────────────────────────────────────────────

  const { data: prochainCodeData, isFetching: fetchingCode, refetch: refetchCode } = useQuery({
    queryKey: ['prochain-code', form.type],
    queryFn:  () => productionApi.prochainCodeArticle(form.type).then((r) => r.data.code),
    enabled:   codeMode === 'auto' && !editing && !!form.type,
    staleTime: 0,
  })

  // Applique le code dès que la donnée est disponible OU quand le modal s'ouvre.
  // showModal est en dépendance pour re-déclencher l'effet à l'ouverture même si
  // prochainCodeData n'a pas changé (la query key était inchangée → pas de refetch).
  useEffect(() => {
    if (showModal && codeMode === 'auto' && !editing && prochainCodeData) {
      setForm((f) => ({ ...f, code: prochainCodeData }))
    }
  }, [prochainCodeData, codeMode, editing, showModal])

  // ── Articles paginés ──────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['articles', search, typeFilter, page],
    queryFn:  () =>
      productionApi.listArticles({
        search:    search || undefined,
        type_code: typeFilter || undefined,
        page,
      }).then((r) => r.data),
  })

  // ── Unités de mesure ──────────────────────────────────────────────────────

  const { data: unites = [] } = useQuery({
    queryKey: ['unites'],
    queryFn:  () =>
      productionApi.listUnites().then((r) => {
        const d = r.data as unknown
        return Array.isArray(d) ? d : ((d as { results?: typeof d }).results ?? [])
      }),
  })

  // ── Payload de sauvegarde (conversions numériques) ────────────────────────

  const getSavePayload = () => ({
    ...form,
    prix_standard:
      form.prix_standard !== '' ? parseFloat(form.prix_standard) : null,
    duree_vie_jours:
      form.duree_vie_jours !== '' ? parseInt(form.duree_vie_jours, 10) : null,
    unite_achat:
      form.unite_achat || null,
    coefficient_conversion:
      form.coefficient_conversion !== '' ? parseFloat(form.coefficient_conversion) : 1,
    // code_barre : null=True en BDD → null accepté si vide
    code_barre:
      form.code_barre || null,
    // reference_externe / conditions_stockage : blank=True mais null=False
    // → envoyer '' (chaîne vide) et non null pour éviter le rejet backend
    reference_externe:  form.reference_externe,
    conditions_stockage: form.conditions_stockage,
  })

  // ── Mutation save ─────────────────────────────────────────────────────────

  const closeModal = () => {
    setShowModal(false)
    setEditing(null)
    setViewOnly(false)
    setForm(EMPTY_FORM)
    setCodeMode('auto')
  }

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      editing
        ? productionApi.updateArticle(editing.id, getSavePayload())
        : productionApi.createArticle(getSavePayload() as ArticleForm & { unite: string }),
    onSuccess: () => {
      toast.success(editing ? 'Article modifié' : 'Article créé')
      qc.invalidateQueries({ queryKey: ['articles'] })
      closeModal()
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.code?.[0] ??
        e?.response?.data?.designation?.[0] ??
        e?.response?.data?.detail ??
        'Erreur lors de la sauvegarde'
      toast.error(msg)
    },
  })

  // ── Supprimer ─────────────────────────────────────────────────────────────

  const canDelete = (a: Article) => !a.has_lots && !a.has_ofs_ou_bom && !a.has_receptions

  const { mutate: deleteArticle, isPending: deleting } = useMutation({
    mutationFn: (id: string) => productionApi.deleteArticle(id),
    onSuccess: () => {
      toast.success('Article supprimé')
      qc.invalidateQueries({ queryKey: ['articles'] })
      setDeleteConfirm(null)
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail ?? 'Impossible de supprimer cet article'
      toast.error(msg)
      setDeleteConfirm(null)
    },
  })

  // ── Ouvrir édition ────────────────────────────────────────────────────────

  const openEdit = (a: Article, readonly = false) => {
    setEditing(a)
    setCodeMode('manuel')
    setViewOnly(readonly)
    setForm({
      code:         a.code,
      designation:  a.designation,
      type:         a.type,
      unite:        a.unite,
      description:  a.description ?? '',
      gere_par_lot: a.gere_par_lot ?? true,
      methode_valorisation: a.methode_valorisation ?? 'standard',
      prix_standard:        a.prix_standard != null ? String(a.prix_standard) : '',
      code_barre:           a.code_barre ?? '',
      reference_externe:    a.reference_externe ?? '',
      duree_vie_jours:      a.duree_vie_jours != null ? String(a.duree_vie_jours) : '',
      conditions_stockage:  a.conditions_stockage ?? '',
      unite_achat:          a.unite_achat ?? '',
      coefficient_conversion:
        a.coefficient_conversion != null ? String(a.coefficient_conversion) : '1',
    })
    setShowModal(true)
  }

  const openView = (a: Article) => openEdit(a, true)

  // Fetch l'article complet (ArticleSerializer) avant d'ouvrir la modal,
  // car la liste utilise ArticleListSerializer (allégé) qui ne retourne pas
  // unite (UUID), has_lots, has_ofs_ou_bom, has_receptions, prix_standard…
  const handleOpenEdit = async (a: Article, readonly = false) => {
    setLoadingEditId(a.id)
    try {
      const { data: full } = await productionApi.getArticle(a.id)
      openEdit(full, readonly)
    } catch {
      toast.error("Impossible de charger les données de l'article")
    } finally {
      setLoadingEditId(null)
    }
  }
  const handleOpenView = (a: Article) => handleOpenEdit(a, true)

  const openCreate = () => {
    setEditing(null)
    setCodeMode('auto')
    const defaultType = types.find((t) => t.code === 'mp') ?? types[0]
    setForm({ ...EMPTY_FORM, type: defaultType?.id ?? '' })
    setShowModal(true)
  }

  // Verrouillages en mode édition
  // Champs modifiables : désignation, code-barres, réf. externe, durée de vie,
  // conditions de stockage, description — tout le reste est immuable.
  const editLocked       = editing !== null   // alias lisible : "on est en édition"
  const codeLocked       = editLocked
  const uniteLocked      = editLocked
  const methodeLocked    = editLocked
  const typeVerrouille   = editLocked && !!(editing?.has_lots || editing?.has_ofs_ou_bom)
  const uniteAchatLocked = editLocked && editing?.has_receptions === true

  const articles = data?.results ?? []
  const pages    = Math.ceil((data?.count ?? 0) / 25)

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Modal création / édition — EN DEHORS de animate-fade-in ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={closeModal}
          />

          {/* Conteneur modal — max-w-xl pour les sections 2 colonnes */}
          <div
            className="relative z-10 w-full max-w-xl rounded-xl animate-scale-in flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border:          '1px solid var(--border)',
              boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
              maxHeight:       '90vh',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-5 py-4 flex-shrink-0 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-dim)' }}
              >
                <Package size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[--text-primary]">
                  {viewOnly
                    ? `Consulter — ${editing!.code}`
                    : editing
                    ? `Modifier — ${editing.code}`
                    : 'Nouvel article'}
                </h3>
                <p className="text-xs text-[--text-muted]">Référentiel article</p>
              </div>
            </div>

            {/* Body scrollable */}
            <div className="overflow-y-auto flex-1 px-5 py-5">
              <div className="flex flex-col gap-5">

                {/* ════════════════ Identification ════════════════ */}
                <SectionSep label="Identification" />

                {/* Code + Type */}
                <div className="grid grid-cols-2 gap-4">

                  {/* Champ Code */}
                  <div>
                    {codeLocked ? (
                      <LockedField
                        label={<>Code <span style={{ color: 'var(--status-danger)' }}>*</span></>}
                        value={form.code}
                      />
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className={FIELD_LABEL}>
                            Code <span style={{ color: 'var(--status-danger)' }}>*</span>
                          </label>
                          <div
                            className="flex items-center rounded-md overflow-hidden"
                            style={{ border: '1px solid var(--border)' }}
                          >
                            {(['auto', 'manuel'] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  setCodeMode(m)
                                  if (m === 'auto') refetchCode()
                                }}
                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold transition-all"
                                style={
                                  codeMode === m
                                    ? { backgroundColor: 'var(--accent)', color: '#fff' }
                                    : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }
                                }
                              >
                                {m === 'auto'
                                  ? <><Zap size={9} /> Auto</>
                                  : <><PenLine size={9} /> Manuel</>
                                }
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="relative">
                          <Input
                            placeholder="Ex : MP-0001"
                            value={form.code}
                            readOnly={codeMode === 'auto'}
                            onChange={(e) => {
                              if (codeMode === 'auto') return
                              setForm((f) => ({ ...f, code: e.target.value }))
                            }}
                            className="font-data"
                            style={
                              codeMode === 'auto'
                                ? { backgroundColor: 'var(--bg-elevated)', cursor: 'default', opacity: 0.8 }
                                : {}
                            }
                          />
                          {codeMode === 'auto' && fetchingCode && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                              <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                            </span>
                          )}
                          {codeMode === 'auto' && !fetchingCode && (
                            <button
                              type="button"
                              title="Régénérer un nouveau code"
                              onClick={() => refetchCode()}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-all"
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                            >
                              <RotateCcw size={11} />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Champ Type */}
                  <div>
                    {(typeVerrouille || viewOnly) ? (
                      <LockedField
                        label={<>Type <span style={{ color: 'var(--status-danger)' }}>*</span></>}
                        value={editing?.type_label ?? ''}
                      />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>
                          Type <span style={{ color: 'var(--status-danger)' }}>*</span>
                        </label>
                        <select
                          value={form.type}
                          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                          className={SELECT_CLASS}
                        >
                          <option value="">— Sélectionner —</option>
                          {types.map((t) => (
                            <option key={t.id} value={t.id}>{t.libelle}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </div>

                {/* Désignation */}
                <div>
                  {viewOnly ? (
                    <LockedField
                      label={<>Désignation <span style={{ color: 'var(--status-danger)' }}>*</span></>}
                      value={form.designation}
                    />
                  ) : (
                    <>
                      <label className={`${FIELD_LABEL} block mb-1.5`}>
                        Désignation <span style={{ color: 'var(--status-danger)' }}>*</span>
                      </label>
                      <Input
                        placeholder="Nom complet de l'article"
                        value={form.designation}
                        onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                      />
                    </>
                  )}
                </div>

                {/* Unité de mesure */}
                <div>
                  {uniteLocked ? (
                    <LockedField
                      label={<>Unité de mesure <span style={{ color: 'var(--status-danger)' }}>*</span></>}
                      value={(() => {
                        const u = (unites ?? []).find((u) => u.id === form.unite)
                        return u ? `${u.code} — ${u.libelle}` : (editing?.unite_code ?? '')
                      })()}
                    />
                  ) : (
                    <>
                      <label className={`${FIELD_LABEL} block mb-1.5`}>
                        Unité de mesure <span style={{ color: 'var(--status-danger)' }}>*</span>
                      </label>
                      <select
                        value={form.unite}
                        onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))}
                        className={SELECT_CLASS}
                      >
                        <option value="">— Sélectionner une unité —</option>
                        {(unites ?? []).map((u) => (
                          <option key={u.id} value={u.id}>{u.code} — {u.libelle}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>

                {/* Toggle Géré par lot */}
                {editing !== null ? (
                  <LockedField
                    label="Géré par lot"
                    value={form.gere_par_lot
                      ? 'Par lot — numéro, FIFO, péremption'
                      : 'Quantité globale — sans numéro de lot'}
                  />
                ) : (
                  <div
                    className="flex items-start justify-between gap-4 px-4 py-3.5 rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <p className="text-xs font-semibold text-[--text-primary] flex items-center gap-1.5">
                        <Layers size={12} style={{ color: 'var(--accent)' }} />
                        Géré par lot
                      </p>
                      <p className="text-[11px] text-[--text-muted] mt-0.5 leading-relaxed">
                        {form.gere_par_lot
                          ? 'Stock suivi lot par lot — numéro, FIFO, péremption'
                          : 'Stock suivi en quantité globale — pas de numéro de lot'}
                      </p>
                    </div>
                    <Toggle
                      checked={form.gere_par_lot}
                      onChange={(v) => setForm((f) => ({ ...f, gere_par_lot: v }))}
                    />
                  </div>
                )}

                {/* ════════════════ Valorisation ════════════════ */}
                <SectionSep label="Valorisation" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {methodeLocked ? (
                      <LockedField
                        label={<>Méthode <span style={{ color: 'var(--status-danger)' }}>*</span></>}
                        value={
                          METHODES_VALORISATION.find((m) => m.value === form.methode_valorisation)?.label
                          ?? form.methode_valorisation
                        }
                      />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>
                          Méthode <span style={{ color: 'var(--status-danger)' }}>*</span>
                        </label>
                        <select
                          value={form.methode_valorisation}
                          onChange={(e) => setForm((f) => ({ ...f, methode_valorisation: e.target.value }))}
                          className={SELECT_CLASS}
                        >
                          {METHODES_VALORISATION.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                  <div>
                    {editLocked ? (
                      <LockedField
                        label={<>
                          {form.methode_valorisation === 'V' ? 'CMUP (FCFA)' : 'Prix standard (FCFA)'}
                          {' '}<span style={{ color: 'var(--status-danger)' }}>*</span>
                        </>}
                        value={
                          form.prix_standard
                            ? `${parseFloat(form.prix_standard).toLocaleString('fr-FR')} FCFA`
                            : '—'
                        }
                      />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>
                          {form.methode_valorisation === 'V' ? 'CMUP (FCFA)' : 'Prix standard (FCFA)'}
                          {' '}<span style={{ color: 'var(--status-danger)' }}>*</span>
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={form.prix_standard}
                          onChange={(e) => setForm((f) => ({ ...f, prix_standard: e.target.value }))}
                          className="font-data"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* ════════════════ Codes & Références ════════════════ */}
                <SectionSep label="Codes & Références" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {viewOnly ? (
                      <LockedField label="Code-barres (EAN/QR)" value={form.code_barre} />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>Code-barres (EAN/QR)</label>
                        <Input
                          placeholder="Ex : 3701234567890"
                          value={form.code_barre}
                          onChange={(e) => setForm((f) => ({ ...f, code_barre: e.target.value }))}
                          className="font-data"
                        />
                      </>
                    )}
                  </div>
                  <div>
                    {viewOnly ? (
                      <LockedField label="Réf. externe / constructeur" value={form.reference_externe} />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>Réf. externe / constructeur</label>
                        <Input
                          placeholder="Ex : REF-FOUR-001"
                          value={form.reference_externe}
                          onChange={(e) => setForm((f) => ({ ...f, reference_externe: e.target.value }))}
                          className="font-data"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* ════════════════ Stockage ════════════════ */}
                <SectionSep label="Stockage" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {viewOnly ? (
                      <LockedField
                        label="Durée de vie"
                        value={form.duree_vie_jours ? `${form.duree_vie_jours} jours` : ''}
                      />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>Durée de vie (jours)</label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Ex : 365"
                          value={form.duree_vie_jours}
                          onChange={(e) => setForm((f) => ({ ...f, duree_vie_jours: e.target.value }))}
                          className="font-data"
                        />
                      </>
                    )}
                  </div>
                  <div>
                    {viewOnly ? (
                      <LockedField label="Conditions de stockage" value={form.conditions_stockage} />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>Conditions de stockage</label>
                        <Input
                          placeholder="Ex : Temp. ambiante, sec"
                          value={form.conditions_stockage}
                          onChange={(e) => setForm((f) => ({ ...f, conditions_stockage: e.target.value }))}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* ════════════════ Approvisionnement ════════════════ */}
                <SectionSep label="Approvisionnement" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {(uniteAchatLocked || viewOnly) ? (
                      <LockedField
                        label="Unité d'achat"
                        value={(() => {
                          const u = (unites ?? []).find((u) => u.id === form.unite_achat)
                          return u ? `${u.code} — ${u.libelle}` : '— Même unité que le stock —'
                        })()}
                      />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>Unité d'achat</label>
                        <select
                          value={form.unite_achat}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              unite_achat: e.target.value,
                              // Reset coeff si on repasse sur "même que stock"
                              coefficient_conversion: e.target.value ? f.coefficient_conversion : '1',
                            }))
                          }
                          className={SELECT_CLASS}
                        >
                          <option value="">— Même unité que le stock —</option>
                          {(unites ?? []).map((u) => (
                            <option key={u.id} value={u.id}>{u.code} — {u.libelle}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                  <div>
                    {(uniteAchatLocked || viewOnly) ? (
                      <LockedField
                        label="Coeff. conversion (achat → stock)"
                        value={form.unite_achat ? form.coefficient_conversion : ''}
                      />
                    ) : (
                      <>
                        <label className={`${FIELD_LABEL} block mb-1.5`}>
                          Coeff. conversion (achat → stock)
                        </label>
                        <Input
                          type="number"
                          min="0.0001"
                          step="0.001"
                          placeholder="1"
                          value={form.coefficient_conversion}
                          disabled={!form.unite_achat}
                          onChange={(e) => setForm((f) => ({ ...f, coefficient_conversion: e.target.value }))}
                          className="font-data"
                          style={!form.unite_achat ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
                        />
                        {!form.unite_achat && (
                          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                            Disponible si unité d'achat ≠ unité de stock
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* ════════════════ Description ════════════════ */}
                <SectionSep label="Description" />

                <div>
                  {viewOnly ? (
                    <div
                      className="min-h-[4.5rem] px-3 py-2.5 rounded text-sm leading-relaxed"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: form.description ? 'var(--text-secondary)' : 'var(--text-muted)',
                      }}
                    >
                      {form.description || 'Aucune description'}
                    </div>
                  ) : (
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={3}
                      placeholder="Description optionnelle…"
                      className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
                    />
                  )}
                </div>

              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
            >
              {viewOnly ? (
                <>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setViewOnly(false)}
                  >
                    Modifier
                  </Button>
                  <Button variant="primary" size="sm" onClick={closeModal}>Fermer</Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={closeModal}>Annuler</Button>
                  <Button
                    variant="primary" size="sm"
                    loading={isPending}
                    disabled={
                      !form.code || !form.designation || !form.unite || !form.type ||
                      (!editing && !form.prix_standard)
                    }
                    onClick={() => save()}
                  >
                    {editing ? 'Enregistrer' : "Créer l'article"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Page ── */}
      <div className="space-y-5 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Catalogue Articles</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">
              {data?.count ?? 0} article{(data?.count ?? 0) > 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openCreate}>
            Nouvel article
          </Button>
        </div>

        {/* ── Table card : filtres + tableau + pagination ── */}
        <div className="surface overflow-hidden">

          {/* Barre de filtres */}
          <div
            className="flex flex-wrap gap-2 items-center px-6 py-4 border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
          >
            <div className="w-56">
              <Input
                placeholder="Rechercher…"
                icon={<Search size={13} />}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
            </div>

            {/* Chips filtre par type — dynamiques */}
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => { setType(''); setPage(1) }}
                className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                style={{
                  backgroundColor: typeFilter === '' ? 'var(--accent-dim)' : 'var(--bg-surface)',
                  color:           typeFilter === '' ? 'var(--accent)' : 'var(--text-secondary)',
                  border:          `1px solid ${typeFilter === '' ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                Tous
              </button>
              {types.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setType(t.code); setPage(1) }}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                  style={{
                    backgroundColor: typeFilter === t.code ? 'var(--accent-dim)' : 'var(--bg-surface)',
                    color:           typeFilter === t.code ? 'var(--accent)' : 'var(--text-secondary)',
                    border:          `1px solid ${typeFilter === t.code ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {t.libelle}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  style={{
                    borderBottom:    '1px solid var(--border)',
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                >
                  {['Code', 'Désignation', 'Type', 'Unité', 'Stock', 'Description', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-6 py-5">
                            <div className="skeleton h-3 rounded w-3/4" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : articles.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Package size={28} style={{ color: 'var(--text-muted)' }} />
                          <p className="text-sm text-[--text-muted]">Aucun article trouvé</p>
                        </div>
                      </td>
                    </tr>
                  )
                  : articles.map((a) => (
                    <tr
                      key={a.id}
                      className="transition-colors hover:bg-[--bg-elevated]"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td className="px-4 py-2.5 font-data text-xs font-semibold text-[--accent]">
                        {a.code}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-[--text-primary] max-w-[200px] truncate">
                        {a.designation}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={getBadgeVariant(a.type_code)}>
                          {a.type_label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[--text-secondary] font-data">
                        {a.unite_code}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                          style={
                            a.gere_par_lot
                              ? { backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }
                              : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                          }
                        >
                          {a.gere_par_lot
                            ? <><Tag size={9} /> Par lot</>
                            : <><Layers size={9} /> Global</>
                          }
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[--text-muted] max-w-[200px] truncate">
                        {a.description || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {deleteConfirm === a.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              Supprimer ?
                            </span>
                            <button
                              onClick={() => deleteArticle(a.id)}
                              disabled={deleting}
                              className="text-[10px] font-semibold"
                              style={{ color: 'var(--status-danger)' }}
                            >
                              {deleting ? '…' : 'Oui'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-[10px] font-semibold"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Non
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => handleOpenView(a)}
                              disabled={loadingEditId === a.id}
                              title="Consulter"
                              className="p-1.5 rounded hover:opacity-70 transition-opacity disabled:opacity-40"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(a)}
                              disabled={loadingEditId === a.id}
                              title="Modifier"
                              className="p-1.5 rounded hover:opacity-70 transition-opacity disabled:opacity-40"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {loadingEditId === a.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Edit2 size={13} />
                              }
                            </button>
                            <button
                              onClick={() => canDelete(a) && setDeleteConfirm(a.id)}
                              title={
                                canDelete(a)
                                  ? "Supprimer l'article"
                                  : "Cet article a des données liées (lots, OFs/BOM, réceptions)"
                              }
                              className="p-1.5 rounded transition-opacity"
                              style={{
                                color:   canDelete(a) ? 'var(--status-danger)' : 'var(--border)',
                                opacity: canDelete(a) ? 1 : 0.45,
                                cursor:  canDelete(a) ? 'pointer' : 'not-allowed',
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-2.5 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-xs text-[--text-muted]">Page {page} / {pages}</span>
              <div className="flex gap-1">
                <Button variant="secondary" size="xs" disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}>
                  Précédent
                </Button>
                <Button variant="secondary" size="xs" disabled={page === pages}
                  onClick={() => setPage((p) => p + 1)}>
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
