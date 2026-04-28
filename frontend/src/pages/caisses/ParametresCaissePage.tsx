/**
 * MEPALE ERP — Paramètres des caisses
 * Deux sections : (1) paramètres globaux, (2) CRUD catégories de mouvements.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  SlidersHorizontal, Plus, Pencil, Trash2,
  ArrowDownLeft, ArrowUpRight, Lock,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Modal }  from '@/components/ui/Modal'
import { Badge }  from '@/components/ui/Badge'
import {
  caissesApi,
  type ParametresCaisse,
  type CategorieMouvement,
  type CategorieMouvementPayload,
  type TypeMouvement,
} from '@/services/caisses'
import { formatXOF } from '@/lib/utils'

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 h-9 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Page principale ─────────────────────────────────────────────────────────

export function ParametresCaissePage() {
  const [catModal, setCatModal] = useState<'create' | CategorieMouvement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategorieMouvement | null>(null)

  return (
    <>
      {/* Modal catégorie (create / edit) */}
      <Modal
        isOpen={catModal !== null}
        onClose={() => setCatModal(null)}
        title={catModal === 'create' ? 'Nouvelle catégorie' : 'Modifier la catégorie'}
        size="sm"
        footer={undefined}
      >
        {catModal !== null && (
          <CategorieForm
            initial={catModal === 'create' ? null : catModal}
            onCancel={() => setCatModal(null)}
            onSuccess={() => setCatModal(null)}
          />
        )}
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer la catégorie"
        size="sm"
        footer={undefined}
      >
        {deleteTarget && (
          <DeleteCategorieConfirm
            categorie={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onSuccess={() => setDeleteTarget(null)}
          />
        )}
      </Modal>

      <div className="p-6 space-y-6 animate-fade-in">

        {/* ── Header ── */}
        <div>
          <h1 className="text-xl font-semibold text-[--text-primary]">Paramètres</h1>
          <p className="text-sm text-[--text-muted] mt-0.5">
            Configuration globale et catégories de mouvements
          </p>
        </div>

        {/* ── Section 1 : Paramètres globaux ── */}
        <ParametresGlobauxSection />

        {/* ── Section 2 : Catégories ── */}
        <CategoriesSection
          onEdit={cat => setCatModal(cat)}
          onDelete={cat => setDeleteTarget(cat)}
          onCreate={() => setCatModal('create')}
        />
      </div>
    </>
  )
}

// ─── Section Paramètres globaux ───────────────────────────────────────────────

function ParametresGlobauxSection() {
  const qc = useQueryClient()

  const { data: params, isLoading } = useQuery({
    queryKey: ['caisses', 'parametres'],
    queryFn:  () => caissesApi.getParametres().then(r => r.data),
  })

  const [seuil,    setSeuil]    = useState('')
  const [plafond,  setPlafond]  = useState('')
  const [report,   setReport]   = useState<boolean | null>(null)
  const [editing,  setEditing]  = useState(false)

  const handleEdit = () => {
    if (!params) return
    setSeuil(String(params.seuil_approbation))
    setPlafond(String(params.seuil_alerte_solde_max))
    setReport(params.report_automatique_solde)
    setEditing(true)
  }

  const mut = useMutation({
    mutationFn: (data: Partial<ParametresCaisse>) => caissesApi.updateParametres(data),
    onSuccess: () => {
      toast.success('Paramètres enregistrés.')
      qc.invalidateQueries({ queryKey: ['caisses', 'parametres'] })
      setEditing(false)
    },
  })

  const handleSave = () => {
    mut.mutate({
      seuil_approbation:        Number(seuil),
      seuil_alerte_solde_max:   Number(plafond),
      report_automatique_solde: report ?? true,
    })
  }

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-[--accent]" />
          <h2 className="text-sm font-semibold text-[--text-primary]">Paramètres globaux</h2>
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" icon={<Pencil size={12} />} onClick={handleEdit}>
            Modifier
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-[--text-muted]">Chargement…</div>
      ) : !params ? null : !editing ? (
        /* Vue lecture */
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className={FIELD_LABEL}>Seuil d'approbation</p>
            <p className="text-sm font-medium font-data text-[--text-primary]">
              {formatXOF(params.seuil_approbation)}
            </p>
            <p className="text-xs text-[--text-muted] mt-0.5">
              Mouvements ≤ seuil → approuvés automatiquement
            </p>
          </div>
          <div>
            <p className={FIELD_LABEL}>Seuil alerte solde max</p>
            <p className="text-sm font-medium font-data text-[--text-primary]">
              {formatXOF(params.seuil_alerte_solde_max)}
            </p>
            <p className="text-xs text-[--text-muted] mt-0.5">
              Alerte si le solde dépasse ce montant
            </p>
          </div>
          <div>
            <p className={FIELD_LABEL}>Report automatique du solde</p>
            <Badge variant={params.report_automatique_solde ? 'success' : 'neutral'}>
              {params.report_automatique_solde ? 'Activé' : 'Désactivé'}
            </Badge>
            <p className="text-xs text-[--text-muted] mt-1.5">
              Solde d'ouverture = solde de clôture précédent
            </p>
          </div>
        </div>
      ) : (
        /* Vue édition */
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={FIELD_LABEL}>Seuil d'approbation (FCFA)</label>
              <Input
                type="number"
                min="0"
                value={seuil}
                onChange={e => setSeuil(e.target.value)}
              />
              <p className="text-xs text-[--text-muted] mt-1">
                Mouvements ≤ seuil → auto-approuvés
              </p>
            </div>
            <div>
              <label className={FIELD_LABEL}>Seuil alerte solde max (FCFA)</label>
              <Input
                type="number"
                min="0"
                value={plafond}
                onChange={e => setPlafond(e.target.value)}
              />
              <p className="text-xs text-[--text-muted] mt-1">
                Déclenchement de l'alerte plafond
              </p>
            </div>
          </div>
          <div>
            <label className={FIELD_LABEL}>Report automatique du solde</label>
            <div className="flex items-center gap-4">
              {[
                { value: true,  label: 'Activé' },
                { value: false, label: 'Désactivé' },
              ].map(opt => (
                <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="report"
                    checked={report === opt.value}
                    onChange={() => setReport(opt.value)}
                    className="accent-[--accent]"
                  />
                  <span className="text-sm text-[--text-primary]">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              loading={mut.isPending}
              disabled={!seuil || !plafond || report === null}
              onClick={handleSave}
            >
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section Catégories ───────────────────────────────────────────────────────

function CategoriesSection({
  onEdit,
  onDelete,
  onCreate,
}: {
  onEdit:   (cat: CategorieMouvement) => void
  onDelete: (cat: CategorieMouvement) => void
  onCreate: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['caisses', 'categories'],
    queryFn:  () => caissesApi.listCategories({ page_size: 200 }).then(r => r.data),
  })

  const categories: CategorieMouvement[] = data?.results ?? []
  const entrees = categories.filter(c => c.type === 'entree')
  const sorties = categories.filter(c => c.type === 'sortie')

  return (
    <div className="surface overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h2 className="text-sm font-semibold text-[--text-primary]">
          Catégories de mouvements
        </h2>
        <Button
          variant="outline"
          size="sm"
          icon={<Plus size={12} />}
          onClick={onCreate}
        >
          Nouvelle catégorie
        </Button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-[--text-muted]">Chargement…</div>
      ) : (
        <div className="grid grid-cols-2 divide-x" style={{ borderColor: 'var(--border)' }}>

          {/* Entrées */}
          <CategoryGroup
            label="Entrées"
            icon={<ArrowDownLeft size={13} style={{ color: 'var(--status-success)' }} />}
            categories={entrees}
            onEdit={onEdit}
            onDelete={onDelete}
          />

          {/* Sorties */}
          <CategoryGroup
            label="Sorties"
            icon={<ArrowUpRight size={13} style={{ color: 'var(--status-danger)' }} />}
            categories={sorties}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  )
}

function CategoryGroup({
  label,
  icon,
  categories,
  onEdit,
  onDelete,
}: {
  label:      string
  icon:       React.ReactNode
  categories: CategorieMouvement[]
  onEdit:     (cat: CategorieMouvement) => void
  onDelete:   (cat: CategorieMouvement) => void
}) {
  return (
    <div>
      {/* Sub-header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}
      >
        {icon}
        <span className="text-xs font-medium text-[--text-secondary] uppercase tracking-wider">
          {label}
        </span>
        <span className="ml-auto text-xs text-[--text-muted]">{categories.length}</span>
      </div>

      {/* Liste */}
      {categories.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[--text-muted]">
          Aucune catégorie
        </div>
      ) : (
        <div>
          {categories
            .sort((a, b) => a.ordre - b.ordre)
            .map((cat, i) => (
              <div
                key={cat.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[--bg-elevated] transition-colors group"
                style={{
                  borderBottom: i < categories.length - 1 ? '1px solid var(--border-subtle)' : undefined,
                }}
              >
                {/* Icône verrou si system */}
                {cat.is_system && (
                  <Lock size={11} className="text-[--text-muted] flex-shrink-0" />
                )}

                {/* Nom + code */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[--text-primary] truncate">{cat.nom}</p>
                  <p className="text-xs font-data text-[--text-muted]">{cat.code}</p>
                </div>

                {/* Statut */}
                {!cat.actif && (
                  <Badge variant="neutral" className="flex-shrink-0">Inactif</Badge>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    className="p-1.5 rounded hover:bg-[--bg-elevated] text-[--text-muted] hover:text-[--text-primary] transition-colors"
                    onClick={() => onEdit(cat)}
                    title="Modifier"
                  >
                    <Pencil size={12} />
                  </button>
                  {!cat.is_system && (
                    <button
                      className="p-1.5 rounded hover:bg-[--bg-elevated] transition-colors"
                      style={{ color: 'var(--status-danger)' }}
                      onClick={() => onDelete(cat)}
                      title="Supprimer"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Formulaire catégorie (create / edit) ─────────────────────────────────────

function CategorieForm({
  initial,
  onCancel,
  onSuccess,
}: {
  initial:   CategorieMouvement | null
  onCancel:  () => void
  onSuccess: () => void
}) {
  const qc = useQueryClient()

  const [nom,    setNom]    = useState(initial?.nom    ?? '')
  const [code,   setCode]   = useState(initial?.code   ?? '')
  const [type,   setType]   = useState<TypeMouvement>(initial?.type ?? 'entree')
  const [ordre,  setOrdre]  = useState(String(initial?.ordre ?? 10))
  const [actif,  setActif]  = useState(initial?.actif  ?? true)

  const mut = useMutation({
    mutationFn: (data: CategorieMouvementPayload) =>
      initial
        ? caissesApi.updateCategorie(initial.id, data)
        : caissesApi.createCategorie(data),
    onSuccess: () => {
      toast.success(initial ? 'Catégorie modifiée.' : 'Catégorie créée.')
      qc.invalidateQueries({ queryKey: ['caisses', 'categories'] })
      onSuccess()
    },
  })

  const isValid = nom.trim() && code.trim()

  return (
    <div className="flex flex-col gap-5">
      {/* Nom */}
      <div>
        <label className={FIELD_LABEL}>Nom *</label>
        <Input
          value={nom}
          onChange={e => setNom(e.target.value)}
          placeholder="ex : Règlement client"
        />
      </div>

      {/* Code */}
      <div>
        <label className={FIELD_LABEL}>Code *</label>
        <Input
          value={code}
          onChange={e => setCode(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
          placeholder="ex : reglement_client"
          disabled={!!initial?.is_system}
        />
        <p className="text-xs text-[--text-muted] mt-1">
          Identifiant unique, utilisé par les intégrations.
          {initial?.is_system && ' Non modifiable (système).'}
        </p>
      </div>

      {/* Type */}
      <div>
        <label className={FIELD_LABEL}>Type *</label>
        <select
          className={SELECT_CLASS}
          value={type}
          onChange={e => setType(e.target.value as TypeMouvement)}
          disabled={!!initial}
        >
          <option value="entree">Entrée</option>
          <option value="sortie">Sortie</option>
        </select>
        {initial && (
          <p className="text-xs text-[--text-muted] mt-1">Non modifiable après création.</p>
        )}
      </div>

      {/* Ordre */}
      <div>
        <label className={FIELD_LABEL}>Ordre d'affichage</label>
        <Input
          type="number"
          min="1"
          value={ordre}
          onChange={e => setOrdre(e.target.value)}
        />
      </div>

      {/* Actif */}
      <div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={actif}
            onChange={e => setActif(e.target.checked)}
            className="accent-[--accent]"
          />
          <span className="text-sm text-[--text-primary]">Catégorie active</span>
        </label>
        <p className="text-xs text-[--text-muted] mt-1 ml-5">
          Les catégories inactives n'apparaissent pas dans les formulaires.
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          loading={mut.isPending}
          disabled={!isValid}
          onClick={() => mut.mutate({
            nom:   nom.trim(),
            code:  code.trim(),
            type,
            ordre: Number(ordre) || 10,
            actif,
          })}
        >
          {initial ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>
    </div>
  )
}

// ─── Confirmation suppression ─────────────────────────────────────────────────

function DeleteCategorieConfirm({
  categorie,
  onCancel,
  onSuccess,
}: {
  categorie: CategorieMouvement
  onCancel:  () => void
  onSuccess: () => void
}) {
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: () => caissesApi.deleteCategorie(categorie.id),
    onSuccess: () => {
      toast.success('Catégorie supprimée.')
      qc.invalidateQueries({ queryKey: ['caisses', 'categories'] })
      onSuccess()
    },
  })

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-[--text-secondary]">
        Voulez-vous supprimer la catégorie{' '}
        <span className="font-medium text-[--text-primary]">« {categorie.nom} »</span> ?
      </p>
      <p className="text-xs text-[--text-muted]">
        La suppression sera refusée si des mouvements utilisent déjà cette catégorie.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          variant="danger"
          loading={mut.isPending}
          onClick={() => mut.mutate()}
        >
          Supprimer
        </Button>
      </div>
    </div>
  )
}
