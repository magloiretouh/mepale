/**
 * MEPALE ERP — Gestion des Unités de Mesure
 * Page d'administration : CRUD complet sur les unités (kg, L, pcs…).
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ruler, Plus, Edit2, Trash2, AlertTriangle, Scale } from 'lucide-react'
import { toast }   from 'sonner'
import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { cn }      from '@/lib/utils'
import { productionApi, type UniteMesure } from '@/services/production'

// ─── Config des types d'unités ────────────────────────────────────────────────

interface TypeUniteConfig {
  value:  string
  label:  string
  ex:     string
  color:  string
  bg:     string
  border: string
}

const TYPES_UNITE: TypeUniteConfig[] = [
  { value: 'masse',    label: 'Masse',     ex: 'kg, g, t, lb',           color: 'var(--status-info)',    bg: 'rgba(59,130,246,0.10)',   border: 'rgba(59,130,246,0.30)' },
  { value: 'volume',   label: 'Volume',    ex: 'L, mL, m³, cl',          color: 'var(--status-success)', bg: 'rgba(16,185,129,0.10)',   border: 'rgba(16,185,129,0.30)' },
  { value: 'longueur', label: 'Longueur',  ex: 'm, cm, mm, km',          color: 'var(--accent)',         bg: 'var(--accent-dim)',       border: 'rgba(0,201,167,0.30)'  },
  { value: 'surface',  label: 'Surface',   ex: 'm², ha, km²',            color: 'var(--status-warning)', bg: 'rgba(245,158,11,0.10)',   border: 'rgba(245,158,11,0.30)' },
  { value: 'unite',    label: 'Unité',     ex: 'pcs, sac, carton, boîte', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)',      border: 'var(--border)'         },
]

function getTypeConfig(value: string): TypeUniteConfig {
  return TYPES_UNITE.find((t) => t.value === value) ?? TYPES_UNITE[4]
}

// ─── Badge type inline ────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const cfg = getTypeConfig(type)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{
        backgroundColor: cfg.bg,
        color:           cfg.color,
        border:          `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ─── Sélecteur de type (dans le modal) ───────────────────────────────────────

function TypeSelector({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {TYPES_UNITE.map((t) => {
        const active = value === t.value
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-all duration-150"
            style={
              active
                ? { backgroundColor: t.bg, border: `1px solid ${t.border}` }
                : { backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }
            }
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 transition-all"
              style={{ backgroundColor: active ? t.color : 'var(--border)' }}
            />
            <div className="flex-1 min-w-0">
              <span
                className={cn('text-xs font-semibold', active ? '' : 'text-[--text-secondary]')}
                style={{ color: active ? t.color : undefined }}
              >
                {t.label}
              </span>
              <span className="text-[11px] text-[--text-muted] ml-2">{t.ex}</span>
            </div>
            {active && (
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: t.color }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Formulaire ───────────────────────────────────────────────────────────────

interface UniteForm {
  code:    string
  libelle: string
  type:    string
}

const EMPTY_FORM: UniteForm = { code: '', libelle: '', type: 'unite' }

const FIELD_LABEL = 'text-xs font-medium text-[--text-secondary] uppercase tracking-wider'

// ─── Page principale ──────────────────────────────────────────────────────────

export function UniteMesureList() {
  const qc = useQueryClient()

  const [showModal,     setShowModal]     = useState(false)
  const [editing,       setEditing]       = useState<UniteMesure | null>(null)
  const [form,          setForm]          = useState<UniteForm>(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState<UniteMesure | null>(null)

  // ── Données ──────────────────────────────────────────────────────────────

  const { data: unites = [], isLoading } = useQuery({
    queryKey: ['unites'],
    queryFn:  () =>
      productionApi.listUnites().then((r) => {
        const d = r.data as unknown
        return Array.isArray(d) ? d : ((d as { results?: UniteMesure[] }).results ?? [])
      }),
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () =>
      editing
        ? productionApi.updateUnite(editing.id, form)
        : productionApi.createUnite(form),
    onSuccess: () => {
      toast.success(editing ? 'Unité modifiée' : 'Unité créée')
      qc.invalidateQueries({ queryKey: ['unites'] })
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

  const { mutate: deleteUnite, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => productionApi.deleteUnite(id),
    onSuccess: () => {
      toast.success('Unité supprimée')
      qc.invalidateQueries({ queryKey: ['unites'] })
      setConfirmDelete(null)
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.detail ??
        'Cette unité est utilisée par des articles — réaffectez-les avant de supprimer.'
      toast.error(msg)
      setConfirmDelete(null)
    },
  })

  // ── Helpers modal ─────────────────────────────────────────────────────────

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(EMPTY_FORM) }

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }

  const openEdit = (u: UniteMesure) => {
    setEditing(u)
    setForm({ code: u.code, libelle: u.libelle, type: u.type })
    setShowModal(true)
  }

  const canSave = form.code.trim() && form.libelle.trim() && form.type

  // Grouper les unités par type pour l'affichage
  const grouped = TYPES_UNITE.map((t) => ({
    ...t,
    items: unites.filter((u) => u.type === t.value),
  })).filter((g) => g.items.length > 0)

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
            className="relative z-10 w-full max-w-md rounded-xl animate-scale-in flex flex-col overflow-hidden"
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
                <Ruler size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[--text-primary]">
                  {editing ? `Modifier — ${editing.code}` : 'Nouvelle unité de mesure'}
                </h3>
                <p className="text-xs text-[--text-muted]">Référentiel des unités</p>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-5">
              <div className="flex flex-col gap-5">

                {/* Code + Libellé */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`${FIELD_LABEL} block mb-1.5`}>
                      Code <span style={{ color: 'var(--status-danger)' }}>*</span>
                    </label>
                    <Input
                      placeholder="kg, L, pcs…"
                      value={form.code}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          code: e.target.value.slice(0, 10),
                        }))
                      }
                      className="font-data"
                    />
                    <p className="text-[11px] text-[--text-muted] mt-1">
                      Max 10 caractères, unique.
                    </p>
                  </div>
                  <div>
                    <label className={`${FIELD_LABEL} block mb-1.5`}>
                      Libellé <span style={{ color: 'var(--status-danger)' }}>*</span>
                    </label>
                    <Input
                      placeholder="Kilogramme, Litre…"
                      value={form.libelle}
                      onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Type */}
                <div>
                  <label className={`${FIELD_LABEL} block mb-2`}>
                    Type de mesure <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <TypeSelector
                    value={form.type}
                    onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                  />
                </div>

              </div>
            </div>

            {/* Footer */}
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
                {editing ? 'Enregistrer' : "Créer l'unité"}
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
                <h3 className="text-sm font-semibold text-[--text-primary]">Supprimer cette unité ?</h3>
                <p className="text-xs text-[--text-muted] mt-1 leading-relaxed">
                  L'unité{' '}
                  <strong className="font-data text-[--text-primary]">{confirmDelete.code}</strong>{' '}
                  ({confirmDelete.libelle}) sera supprimée définitivement. Cette action
                  échouera si des articles l'utilisent encore — réaffectez-les d'abord.
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
                onClick={() => deleteUnite(confirmDelete.id)}
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
            <h1 className="text-xl font-bold text-[--text-primary]">Unités de mesure</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">
              {unites.length} unité{unites.length > 1 ? 's' : ''} — masse, volume, longueur, surface, unité
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openCreate}>
            Nouvelle unité
          </Button>
        </div>

        {/* Tableau principal */}
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
                  {['Code', 'Libellé', 'Type', ''].map((h) => (
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
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {Array.from({ length: 4 }).map((_, j) => (
                          <td key={j} className="px-6 py-5">
                            <div className="skeleton h-3 rounded w-3/4" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : unites.length === 0
                  ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Scale size={28} style={{ color: 'var(--text-muted)' }} />
                          <p className="text-sm text-[--text-muted]">Aucune unité configurée</p>
                          <Button variant="secondary" size="xs" onClick={openCreate}>
                            Créer la première unité
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                  : unites.map((u) => (
                    <tr
                      key={u.id}
                      className="transition-colors hover:bg-[--bg-elevated]"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      {/* Code */}
                      <td className="px-4 py-3 w-28">
                        <span className="font-data text-xs font-semibold text-[--accent]">
                          {u.code}
                        </span>
                      </td>

                      {/* Libellé */}
                      <td className="px-4 py-3 text-xs font-medium text-[--text-primary]">
                        {u.libelle}
                      </td>

                      {/* Type */}
                      <td className="px-6 py-5">
                        <TypeBadge type={u.type} />
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(u)}
                            title="Modifier"
                            className="p-1.5 rounded transition-all hover:bg-[--bg-surface]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(u)}
                            title="Supprimer"
                            className="p-1.5 rounded transition-all hover:bg-[--bg-surface]"
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

        {/* Vue groupée par type */}
        {!isLoading && grouped.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {TYPES_UNITE.map((t) => {
              const items = unites.filter((u) => u.type === t.value)
              return (
                <div
                  key={t.value}
                  className="rounded-lg px-4 py-3"
                  style={{
                    backgroundColor: t.bg,
                    border:          `1px solid ${t.border}`,
                  }}
                >
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: t.color }}
                  >
                    {t.label}
                  </p>
                  {items.length === 0 ? (
                    <p className="text-[11px] text-[--text-muted]">Aucune</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {items.map((u) => (
                        <span
                          key={u.id}
                          className="font-data text-[11px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: 'rgba(0,0,0,0.15)',
                            color:           t.color,
                          }}
                        >
                          {u.code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Note */}
        <div
          className="rounded-lg px-4 py-3 text-xs text-[--text-muted] leading-relaxed"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border:          '1px solid var(--border)',
          }}
        >
          <span className="font-semibold text-[--text-secondary]">Unité de stock vs unité d'achat</span>{' '}—
          L'unité d'achat peut différer de l'unité de stock (ex : carton de 12 pcs).
          Le coefficient de conversion est défini dans la fiche article.
          Les suppressions sont bloquées si des articles utilisent encore l'unité.
        </div>

      </div>
    </>
  )
}
