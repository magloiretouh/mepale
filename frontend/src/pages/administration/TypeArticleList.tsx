/**
 * MEPALE ERP — Gestion des Types d'Articles
 * Page d'administration : CRUD complet sur les types et leurs capacités métier.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag, Plus, Edit2, Trash2, Check, X, Layers, Factory, ShoppingCart, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn }     from '@/lib/utils'
import { productionApi, type TypeArticle } from '@/services/production'

// ─── Design tokens locaux ─────────────────────────────────────────────────────

const FIELD_LABEL = 'text-xs font-medium text-[--text-secondary] uppercase tracking-wider'

// ─── Config des 3 capacités métier ────────────────────────────────────────────

interface CapConfig {
  key: keyof Pick<TypeArticle, 'peut_composer_bom' | 'peut_etre_produit_of' | 'peut_etre_achete'>
  label: string
  labelCourt: string
  desc: string
  Icon: React.ElementType
  activeColor: string
  activeBg: string
  activeBorder: string
}

const CAPS: CapConfig[] = [
  {
    key:          'peut_composer_bom',
    label:        'Composant BOM',
    labelCourt:   'BOM',
    desc:         'Les articles de ce type peuvent être ajoutés comme composants dans une nomenclature (Bill of Materials).',
    Icon:         Layers,
    activeColor:  'var(--status-info)',
    activeBg:     'rgba(59,130,246,0.10)',
    activeBorder: 'rgba(59,130,246,0.35)',
  },
  {
    key:          'peut_etre_produit_of',
    label:        'Produit d\'OF',
    labelCourt:   'OF',
    desc:         "Les articles de ce type peuvent être le produit fini d'un Ordre de Fabrication.",
    Icon:         Factory,
    activeColor:  'var(--status-success)',
    activeBg:     'rgba(16,185,129,0.10)',
    activeBorder: 'rgba(16,185,129,0.35)',
  },
  {
    key:          'peut_etre_achete',
    label:        'Achetable',
    labelCourt:   'Achat',
    desc:         "Les articles de ce type peuvent apparaître dans les Demandes d'Achat et Bons de Commande.",
    Icon:         ShoppingCart,
    activeColor:  'var(--status-warning)',
    activeBg:     'rgba(245,158,11,0.10)',
    activeBorder: 'rgba(245,158,11,0.35)',
  },
]

// ─── Formulaire ───────────────────────────────────────────────────────────────

interface TypeForm {
  code:                string
  libelle:             string
  prefixe:             string
  peut_composer_bom:    boolean
  peut_etre_produit_of: boolean
  peut_etre_achete:     boolean
}

const EMPTY_FORM: TypeForm = {
  code: '', libelle: '', prefixe: '',
  peut_composer_bom: false, peut_etre_produit_of: false, peut_etre_achete: true,
}

// ─── Chip capacité inline (dans la table) ─────────────────────────────────────

function CapChip({
  active, cap, onClick,
}: { active: boolean; cap: CapConfig; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? `Désactiver "${cap.label}"` : `Activer "${cap.label}"`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all duration-150"
      style={active
        ? { backgroundColor: cap.activeBg, color: cap.activeColor, border: `1px solid ${cap.activeBorder}` }
        : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
      }
    >
      {active ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={2} />}
      {cap.labelCourt}
    </button>
  )
}

// ─── Carte capacité (dans le modal) ──────────────────────────────────────────

function CapCard({
  cap, active, onChange,
}: { cap: CapConfig; active: boolean; onChange: (v: boolean) => void }) {
  const Icon = cap.Icon
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className="w-full flex items-start gap-3 px-4 py-3.5 rounded-lg text-left transition-all duration-150"
      style={active
        ? { backgroundColor: cap.activeBg, border: `1px solid ${cap.activeBorder}` }
        : { backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }
      }
    >
      {/* Icône */}
      <div
        className="mt-0.5 w-7 h-7 rounded flex items-center justify-center flex-shrink-0 transition-all"
        style={active
          ? { backgroundColor: cap.activeBg, border: `1px solid ${cap.activeBorder}` }
          : { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }
        }
      >
        <Icon size={13} style={{ color: active ? cap.activeColor : 'var(--text-muted)' }} />
      </div>

      {/* Texte */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-semibold transition-colors', active ? 'text-[--text-primary]' : 'text-[--text-secondary]')}>
          {cap.label}
        </p>
        <p className="text-[11px] text-[--text-muted] mt-0.5 leading-relaxed">{cap.desc}</p>
      </div>

      {/* Checkbox visuelle */}
      <div
        className="mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
        style={active
          ? { backgroundColor: cap.activeColor, border: `1px solid ${cap.activeColor}` }
          : { backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }
        }
      >
        {active && <Check size={11} color="#fff" strokeWidth={3} />}
      </div>
    </button>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function TypeArticleList() {
  const qc = useQueryClient()

  const [showModal,     setShowModal]     = useState(false)
  const [editing,       setEditing]       = useState<TypeArticle | null>(null)
  const [form,          setForm]          = useState<TypeForm>(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState<TypeArticle | null>(null)

  // ── Données ──────────────────────────────────────────────────────────────

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['types-articles'],
    queryFn:  () => productionApi.listTypesArticles().then((r) => r.data),
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () =>
      editing
        ? productionApi.updateTypeArticle(editing.id, form)
        : productionApi.createTypeArticle(form),
    onSuccess: () => {
      toast.success(editing ? 'Type modifié' : 'Type créé')
      qc.invalidateQueries({ queryKey: ['types-articles'] })
      // Invalider aussi les articles (leurs badges/filtres utilisent les types)
      qc.invalidateQueries({ queryKey: ['articles'] })
      closeModal()
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.code?.[0] ??
        e?.response?.data?.detail ??
        'Erreur lors de la sauvegarde'
      toast.error(msg)
    },
  })

  const { mutate: deleteType, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => productionApi.deleteTypeArticle(id),
    onSuccess: () => {
      toast.success('Type supprimé')
      qc.invalidateQueries({ queryKey: ['types-articles'] })
      setConfirmDelete(null)
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.detail ??
        'Ce type est utilisé par des articles — réaffectez-les avant de supprimer.'
      toast.error(msg)
      setConfirmDelete(null)
    },
  })

  // Bascule inline d'une capacité directement depuis la table
  const { mutate: toggleCap } = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: boolean }) =>
      productionApi.updateTypeArticle(id, { [field]: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['types-articles'] })
      qc.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })

  // ── Helpers modal ─────────────────────────────────────────────────────────

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(EMPTY_FORM) }

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }

  const openEdit = (t: TypeArticle) => {
    setEditing(t)
    setForm({
      code:                t.code,
      libelle:             t.libelle,
      prefixe:             t.prefixe,
      peut_composer_bom:    t.peut_composer_bom,
      peut_etre_produit_of: t.peut_etre_produit_of,
      peut_etre_achete:     t.peut_etre_achete,
    })
    setShowModal(true)
  }

  const canSave = form.code.trim() && form.libelle.trim()

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Modal création / édition ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={closeModal}
          />
          <div
            className="relative z-10 w-full max-w-lg rounded-xl animate-scale-in flex flex-col"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border:          '1px solid var(--border)',
              boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
              maxHeight:       '90vh',
            }}
          >
            {/* Header modal */}
            <div
              className="flex items-center gap-3 px-5 py-4 flex-shrink-0 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-dim)' }}
              >
                <Tag size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[--text-primary]">
                  {editing ? `Modifier — [${editing.code}] ${editing.libelle}` : "Nouveau type d'article"}
                </h3>
                <p className="text-xs text-[--text-muted]">
                  Configurez les capacités métier de ce type
                </p>
              </div>
            </div>

            {/* Body modal */}
            <div className="overflow-y-auto flex-1 px-5 py-5">
              <div className="flex flex-col gap-5">

                {/* Code + Préfixe */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`${FIELD_LABEL} block mb-1.5`}>
                      Code <span style={{ color: 'var(--status-danger)' }}>*</span>
                    </label>
                    <Input
                      placeholder="ex : mp, pf, sf"
                      value={form.code}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                        }))
                      }
                      className="font-data"
                    />
                    <p className="text-[11px] text-[--text-muted] mt-1">
                      Identifiant unique (minuscules, sans espaces).
                    </p>
                  </div>
                  <div>
                    <label className={`${FIELD_LABEL} block mb-1.5`}>Préfixe codes articles</label>
                    <Input
                      placeholder="ex : MP, PF, EMB"
                      value={form.prefixe}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          prefixe: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                        }))
                      }
                      className="font-data"
                    />
                    <p className="text-[11px] text-[--text-muted] mt-1">
                      Pour la génération auto des codes. Si vide → code en majuscules.
                    </p>
                  </div>
                </div>

                {/* Libellé */}
                <div>
                  <label className={`${FIELD_LABEL} block mb-1.5`}>
                    Libellé <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <Input
                    placeholder="ex : Matière première, Produit fini…"
                    value={form.libelle}
                    onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
                  />
                </div>

                {/* Capacités métier */}
                <div>
                  <label className={`${FIELD_LABEL} block mb-3`}>Capacités métier</label>
                  <div className="flex flex-col gap-2">
                    {CAPS.map((cap) => (
                      <CapCard
                        key={cap.key}
                        cap={cap}
                        active={form[cap.key]}
                        onChange={(v) => setForm((f) => ({ ...f, [cap.key]: v }))}
                      />
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Footer modal */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
            >
              <Button variant="ghost" size="sm" onClick={closeModal}>Annuler</Button>
              <Button
                variant="primary" size="sm"
                loading={isSaving}
                disabled={!canSave}
                onClick={() => save()}
              >
                {editing ? 'Enregistrer les modifications' : 'Créer le type'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmation suppression ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={() => setConfirmDelete(null)}
          />
          <div
            className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in p-6"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border:          '1px solid var(--border)',
              boxShadow:       'var(--shadow-lg)',
            }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}
              >
                <AlertTriangle size={15} style={{ color: 'var(--status-danger)' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[--text-primary]">Supprimer ce type ?</h3>
                <p className="text-xs text-[--text-muted] mt-1 leading-relaxed">
                  Le type{' '}
                  <strong className="text-[--text-primary] font-data">
                    [{confirmDelete.code}]
                  </strong>{' '}
                  <strong className="text-[--text-primary]">{confirmDelete.libelle}</strong>{' '}
                  sera supprimé définitivement. Cette action échouera s'il est encore utilisé
                  par des articles — réaffectez-les d'abord.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                Annuler
              </Button>
              <Button
                variant="danger" size="sm"
                loading={isDeleting}
                onClick={() => deleteType(confirmDelete.id)}
              >
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page ── */}
      <div className="space-y-4 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Types d'articles</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">
              Définissez les capacités métier de chaque type — BOM, Ordres de fabrication, Achats.
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openCreate}>
            Nouveau type
          </Button>
        </div>

        {/* Tableau */}
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  style={{
                    borderBottom:    '1px solid var(--border)',
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                >
                  {['Code', 'Libellé', 'Préfixe', 'Composant BOM', "Produit d'OF", 'Achetable', ''].map((h) => (
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
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-6 py-5">
                            <div className="skeleton h-3 rounded w-3/4" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : types.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Tag size={28} style={{ color: 'var(--text-muted)' }} />
                          <p className="text-sm text-[--text-muted]">Aucun type configuré</p>
                          <Button variant="secondary" size="xs" onClick={openCreate}>
                            Créer le premier type
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                  : types.map((t) => (
                    <tr
                      key={t.id}
                      className="transition-colors hover:bg-[--bg-elevated]"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      {/* Code */}
                      <td className="px-6 py-5">
                        <span className="font-data text-xs font-semibold text-[--accent]">
                          {t.code}
                        </span>
                      </td>

                      {/* Libellé */}
                      <td className="px-4 py-3 text-xs font-medium text-[--text-primary]">
                        {t.libelle}
                      </td>

                      {/* Préfixe */}
                      <td className="px-6 py-5">
                        <span className="font-data text-xs text-[--text-secondary]">
                          {t.prefixe_effectif}
                        </span>
                      </td>

                      {/* Capacités — toggle inline */}
                      {CAPS.map((cap) => (
                        <td key={cap.key} className="px-6 py-5">
                          <CapChip
                            active={t[cap.key]}
                            cap={cap}
                            onClick={() =>
                              toggleCap({ id: t.id, field: cap.key, value: !t[cap.key] })
                            }
                          />
                        </td>
                      ))}

                      {/* Actions */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(t)}
                            title="Modifier"
                            className="p-1.5 rounded transition-all hover:bg-[--bg-elevated]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(t)}
                            title="Supprimer"
                            className="p-1.5 rounded transition-all hover:bg-[--bg-elevated]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Note explicative */}
        <div
          className="rounded-lg px-4 py-3 text-xs text-[--text-muted] leading-relaxed"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border:          '1px solid var(--border)',
          }}
        >
          <span className="font-semibold text-[--text-secondary]">Capacités métier</span> —
          Cliquez directement sur un chip dans la table pour basculer une capacité sans ouvrir le formulaire.
          Ces réglages déterminent quels articles peuvent entrer dans une nomenclature, être produits par un OF,
          ou faire l'objet d'une commande achat.
        </div>

      </div>
    </>
  )
}
