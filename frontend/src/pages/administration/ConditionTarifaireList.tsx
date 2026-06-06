import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Percent, Plus, Edit2, Trash2, AlertTriangle, TrendingUp, TrendingDown, ShoppingCart, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { logistiqueApi, type ConditionTarifaire, type ModeCalculCondition, type TypeEffetCondition, type NiveauCondition } from '@/services/logistique'

// ─── Design tokens ────────────────────────────────────────────────────────────

const FIELD_LABEL  = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'
const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

// ─── Configs visuelles ────────────────────────────────────────────────────────

const EFFET_CONFIG: Record<TypeEffetCondition, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  majoration: { label: 'Majoration', color: 'var(--status-warning)',  bg: 'rgba(245,158,11,0.12)', Icon: TrendingUp   },
  reduction:  { label: 'Réduction',  color: 'var(--status-success)',  bg: 'rgba(16,185,129,0.12)', Icon: TrendingDown  },
}

const NIVEAU_CONFIG: Record<NiveauCondition, { label: string; Icon: React.ElementType }> = {
  bc:    { label: 'BC global',       Icon: ShoppingCart },
  ligne: { label: 'Ligne de commande', Icon: Layers     },
}

// ─── Form ─────────────────────────────────────────────────────────────────────

interface ConditionForm {
  nom: string
  mode_calcul: ModeCalculCondition
  type_effet: TypeEffetCondition
  niveau: NiveauCondition
  valeur_defaut: string
  description: string
  actif: boolean
}

const EMPTY_FORM: ConditionForm = {
  nom: '', mode_calcul: 'pourcentage', type_effet: 'majoration',
  niveau: 'bc', valeur_defaut: '0', description: '', actif: true,
}

// ─── Chip compact ─────────────────────────────────────────────────────────────

function EffetChip({ effet }: { effet: TypeEffetCondition }) {
  const cfg = EFFET_CONFIG[effet]
  const Icon = cfg.Icon
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ConditionTarifaireList() {
  const qc = useQueryClient()

  const [showModal,     setShowModal]     = useState(false)
  const [editing,       setEditing]       = useState<ConditionTarifaire | null>(null)
  const [form,          setForm]          = useState<ConditionForm>(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState<ConditionTarifaire | null>(null)

  // ── Données ──────────────────────────────────────────────────────────────

  const { data: conditions = [], isLoading } = useQuery({
    queryKey: ['conditions-tarifaires'],
    queryFn:  () => logistiqueApi.listConditionsTarifaires().then(r => r.data),
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () => {
      const payload = {
        nom:           form.nom.trim(),
        mode_calcul:   form.mode_calcul,
        type_effet:    form.type_effet,
        niveau:        form.niveau,
        valeur_defaut: parseFloat(form.valeur_defaut) || 0,
        description:   form.description.trim(),
        actif:         form.actif,
      }
      return editing
        ? logistiqueApi.updateConditionTarifaire(editing.id, payload)
        : logistiqueApi.createConditionTarifaire(payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Condition modifiée' : 'Condition créée')
      qc.invalidateQueries({ queryKey: ['conditions-tarifaires'] })
      closeModal()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? e?.response?.data?.nom?.[0] ?? 'Erreur lors de la sauvegarde'),
  })

  const { mutate: deleteCondition, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => logistiqueApi.deleteConditionTarifaire(id),
    onSuccess: () => {
      toast.success('Condition supprimée')
      qc.invalidateQueries({ queryKey: ['conditions-tarifaires'] })
      setConfirmDelete(null)
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail ?? 'Impossible de supprimer cette condition.')
      setConfirmDelete(null)
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(EMPTY_FORM) }

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }

  const openEdit = (c: ConditionTarifaire) => {
    setEditing(c)
    setForm({
      nom:           c.nom,
      mode_calcul:   c.mode_calcul,
      type_effet:    c.type_effet,
      niveau:        c.niveau,
      valeur_defaut: String(c.valeur_defaut),
      description:   c.description,
      actif:         c.actif,
    })
    setShowModal(true)
  }

  const f = (field: keyof ConditionForm, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const canSave = form.nom.trim().length > 0 && !isNaN(parseFloat(form.valeur_defaut))

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Modal création / édition ────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div
            className="relative z-10 w-full max-w-lg rounded-xl animate-scale-in flex flex-col overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
                <Percent size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[--text-primary]">
                  {editing ? `Modifier — ${editing.nom}` : 'Nouvelle condition tarifaire'}
                </h3>
                <p className="text-xs text-[--text-muted]">Définissez le comportement de cette condition</p>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-5">

                {/* Nom */}
                <div>
                  <label className={FIELD_LABEL}>Nom <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                  <Input placeholder="ex : TVA, Transport, Remise volume…" value={form.nom} onChange={e => f('nom', e.target.value)} />
                </div>

                {/* Niveau */}
                <div>
                  <label className={FIELD_LABEL}>Niveau d'application</label>
                  <select className={SELECT_CLASS} value={form.niveau} onChange={e => f('niveau', e.target.value as NiveauCondition)}>
                    <option value="bc">Bon de commande (global)</option>
                    <option value="ligne">Ligne de commande</option>
                  </select>
                  <p className="text-[11px] text-[--text-muted] mt-1.5 leading-relaxed">
                    {form.niveau === 'bc'
                      ? 'La condition s\'applique une fois sur le total du BC.'
                      : 'La condition s\'applique individuellement sur chaque ligne.'}
                  </p>
                </div>

                {/* Effet + Mode */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={FIELD_LABEL}>Type d'effet</label>
                    <select className={SELECT_CLASS} value={form.type_effet} onChange={e => f('type_effet', e.target.value as TypeEffetCondition)}>
                      <option value="majoration">Majoration (frais, taxe)</option>
                      <option value="reduction">Réduction (remise, escompte)</option>
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Mode de calcul</label>
                    <select className={SELECT_CLASS} value={form.mode_calcul} onChange={e => f('mode_calcul', e.target.value as ModeCalculCondition)}>
                      <option value="pourcentage">Pourcentage (%)</option>
                      <option value="montant_fixe">Montant fixe (FCFA)</option>
                    </select>
                  </div>
                </div>

                {/* Valeur par défaut */}
                <div>
                  <label className={FIELD_LABEL}>
                    Valeur par défaut{' '}
                    <span className="normal-case font-normal text-[--text-muted]">
                      ({form.mode_calcul === 'pourcentage' ? '%' : 'FCFA'})
                    </span>
                  </label>
                  <Input
                    type="number"
                    placeholder={form.mode_calcul === 'pourcentage' ? '18' : '50000'}
                    value={form.valeur_defaut}
                    onChange={e => f('valeur_defaut', e.target.value)}
                    className="font-data"
                  />
                  <p className="text-[11px] text-[--text-muted] mt-1.5">
                    Pré-remplie lors de l'ajout sur un BC, modifiable par bon de commande.
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className={FIELD_LABEL}>Description</label>
                  <textarea
                    className={SELECT_CLASS + ' h-auto py-2.5 resize-none leading-relaxed'}
                    rows={2}
                    placeholder="Description optionnelle…"
                    value={form.description}
                    onChange={e => f('description', e.target.value)}
                  />
                </div>

                {/* Actif */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-[--accent]"
                    checked={form.actif}
                    onChange={e => f('actif', e.target.checked)}
                  />
                  <span className="text-sm text-[--text-primary]">Condition active</span>
                  <span className="text-xs text-[--text-muted]">(visible dans les BCs)</span>
                </label>

              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
              <Button variant="ghost" size="sm" onClick={closeModal}>Annuler</Button>
              <Button variant="primary" size="sm" loading={isSaving} disabled={!canSave} onClick={() => save()}>
                {editing ? 'Enregistrer' : 'Créer la condition'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal suppression ───────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={() => setConfirmDelete(null)} />
          <div
            className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in p-6"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                <AlertTriangle size={15} style={{ color: 'var(--status-danger)' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[--text-primary]">Supprimer cette condition ?</h3>
                <p className="text-xs text-[--text-muted] mt-1 leading-relaxed">
                  <strong className="text-[--text-primary]">{confirmDelete.nom}</strong> sera supprimée définitivement.
                  {confirmDelete.nb_applications > 0 && (
                    <span className="block mt-1" style={{ color: 'var(--status-danger)' }}>
                      Attention : {confirmDelete.nb_applications} BC{confirmDelete.nb_applications > 1 ? 's l\'utilisent' : ' l\'utilise'} — la suppression sera bloquée.
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button variant="danger" size="sm" loading={isDeleting} onClick={() => deleteCondition(confirmDelete.id)}>
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page ─────────────────────────────────────────────────────────── */}
      <div className="space-y-4 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Conditions tarifaires</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">
              TVA, remises, frais — catalogue géré par l'administration, appliqué optionnellement sur chaque BC.
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openCreate}>
            Nouvelle condition
          </Button>
        </div>

        {/* Tableau */}
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  {['Nom', 'Niveau', 'Effet', 'Mode de calcul', 'Valeur par défaut', 'Utilisée', 'Statut', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-4"><div className="skeleton h-3 rounded w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                  : conditions.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Percent size={28} style={{ color: 'var(--text-muted)' }} />
                          <p className="text-sm text-[--text-muted]">Aucune condition configurée</p>
                          <Button variant="secondary" size="xs" onClick={openCreate}>Créer la première</Button>
                        </div>
                      </td>
                    </tr>
                  )
                  : conditions.map((c: ConditionTarifaire) => {
                    const niveauCfg = NIVEAU_CONFIG[c.niveau]
                    const NiveauIcon = niveauCfg.Icon
                    return (
                      <tr
                        key={c.id}
                        className="transition-colors hover:bg-[--bg-elevated]"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        {/* Nom */}
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-[--text-primary]">{c.nom}</span>
                          {c.description && (
                            <p className="text-[11px] text-[--text-muted] mt-0.5 line-clamp-1">{c.description}</p>
                          )}
                        </td>

                        {/* Niveau */}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-[11px] text-[--text-secondary]">
                            <NiveauIcon size={11} />
                            {niveauCfg.label}
                          </span>
                        </td>

                        {/* Effet */}
                        <td className="px-4 py-3"><EffetChip effet={c.type_effet} /></td>

                        {/* Mode calcul */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-[--text-secondary]">
                            {c.mode_calcul === 'pourcentage' ? 'Pourcentage' : 'Montant fixe'}
                          </span>
                        </td>

                        {/* Valeur par défaut */}
                        <td className="px-4 py-3">
                          <span className="font-data text-xs font-semibold text-[--text-primary]">
                            {c.mode_calcul === 'pourcentage'
                              ? `${c.valeur_defaut} %`
                              : `${Number(c.valeur_defaut).toLocaleString('fr-FR')} FCFA`}
                          </span>
                        </td>

                        {/* Nb applications */}
                        <td className="px-4 py-3">
                          <span className="font-data text-xs text-[--text-secondary]">
                            {c.nb_applications > 0 ? `${c.nb_applications} BC` : '—'}
                          </span>
                        </td>

                        {/* Statut */}
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                            style={c.actif
                              ? { backgroundColor: 'rgba(16,185,129,0.12)', color: 'var(--status-success)' }
                              : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }
                            }
                          >
                            {c.actif ? 'Actif' : 'Inactif'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(c)} title="Modifier" className="p-1.5 rounded transition-all hover:bg-[--bg-elevated]" style={{ color: 'var(--text-muted)' }}>
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => setConfirmDelete(c)} title="Supprimer" className="p-1.5 rounded transition-all hover:bg-[--bg-elevated]" style={{ color: 'var(--text-muted)' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Note */}
        <div className="rounded-lg px-4 py-3 text-xs text-[--text-muted] leading-relaxed" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <span className="font-semibold text-[--text-secondary]">Calcul séquentiel</span> —
          Les conditions sont appliquées dans l'ordre où elles sont ajoutées sur chaque BC. Chaque condition
          utilise le total courant (après conditions précédentes) comme base de calcul pour les pourcentages.
          Une condition utilisée par au moins un BC ne peut pas être supprimée.
        </div>

      </div>
    </>
  )
}
