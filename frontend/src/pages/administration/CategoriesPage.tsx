/**
 * MEPALE ERP — Administration › Catégories
 * Gestion des catégories de mouvements : caisses et comptabilité.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Lock, Plus, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Modal }  from '@/components/ui/Modal'
import { Badge }  from '@/components/ui/Badge'
import {
  caissesApi,
  type CategorieMouvement,
  type CategorieMouvementPayload,
  type TypeMouvement,
} from '@/services/caisses'
import {
  comptabiliteApi,
  type CategorieComptable,
  type CategorieComptablePayload,
  type EntryType,
} from '@/services/comptabilite'

// ─── Constantes ───────────────────────────────────────────────────────────────

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'
const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const TH = 'px-4 py-2.5 text-left text-[10px] font-semibold text-[--text-muted] uppercase tracking-wider'
const TD = 'px-4 py-3 text-sm'

const TABS = [
  { id: 'caisses',      label: 'Mouvements de caisse'  },
  { id: 'comptabilite', label: 'Mouvements comptables' },
] as const

type TabId = typeof TABS[number]['id']

// ═══════════════════════════════════════════════════════════════════════════════
// ONGLET CAISSES
// ═══════════════════════════════════════════════════════════════════════════════

function TabCaisses() {
  const [editing,  setEditing]  = useState<CategorieMouvement | null>(null)
  const [deleting, setDeleting] = useState<CategorieMouvement | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['caisses', 'categories'],
    queryFn:  () => caissesApi.listCategories({ page_size: 200 }).then(r => r.data),
  })

  const categories = [...(data?.results ?? [])].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'entree' ? -1 : 1
    return a.ordre - b.ordre
  })

  return (
    <>
      {(creating || editing) && (
        <Modal
          isOpen
          onClose={() => { setCreating(false); setEditing(null) }}
          title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          size="sm"
        >
          <CaisseForm
            initial={editing}
            onCancel={() => { setCreating(false); setEditing(null) }}
            onSuccess={() => { setCreating(false); setEditing(null) }}
          />
        </Modal>
      )}

      {deleting && (
        <Modal
          isOpen
          onClose={() => setDeleting(null)}
          title="Supprimer la catégorie"
          size="sm"
        >
          <DeleteCaisseConfirm
            categorie={deleting}
            onCancel={() => setDeleting(null)}
            onSuccess={() => setDeleting(null)}
          />
        </Modal>
      )}

      <div className="surface overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold text-[--text-primary]">
            Catégories de mouvements de caisse
          </h2>
          <Button variant="outline" size="sm" icon={<Plus size={12} />} onClick={() => setCreating(true)}>
            Nouvelle catégorie
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-[--text-muted]">Chargement…</div>
        ) : categories.length === 0 ? (
          <div className="p-10 text-center text-sm text-[--text-muted]">Aucune catégorie</div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th className={TH}>Nom</th>
                <th className={TH}>Type</th>
                <th className={TH}>Statut</th>
                <th className={TH + ' w-20'}></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, i) => (
                <tr
                  key={cat.id}
                  className="group hover:bg-[--bg-elevated] transition-colors"
                  style={{ borderBottom: i < categories.length - 1 ? '1px solid var(--border-subtle)' : undefined }}
                >
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      {cat.is_system && <Lock size={11} className="text-[--text-muted] flex-shrink-0" />}
                      <span className="text-[--text-primary]">{cat.nom}</span>
                    </div>
                  </td>
                  <td className={TD}>
                    {cat.type === 'entree' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--status-success)' }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--status-success)' }} />
                        Entrée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--status-danger)' }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--status-danger)' }} />
                        Sortie
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    {cat.actif
                      ? <Badge variant="success">Actif</Badge>
                      : <Badge variant="neutral">Inactif</Badge>
                    }
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button
                        className="p-1.5 rounded text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-colors"
                        onClick={() => setEditing(cat)}
                        title="Modifier"
                      >
                        <Pencil size={13} />
                      </button>
                      {!cat.is_system && (
                        <button
                          className="p-1.5 rounded transition-colors"
                          style={{ color: 'var(--status-danger)' }}
                          onClick={() => setDeleting(cat)}
                          title="Supprimer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function CaisseForm({
  initial, onCancel, onSuccess,
}: {
  initial:   CategorieMouvement | null
  onCancel:  () => void
  onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [nom,   setNom]   = useState(initial?.nom   ?? '')
  const [code,  setCode]  = useState(initial?.code  ?? '')
  const [type,  setType]  = useState<TypeMouvement>(initial?.type ?? 'entree')
  const [ordre, setOrdre] = useState(String(initial?.ordre ?? 10))
  const [actif, setActif] = useState(initial?.actif ?? true)

  const mut = useMutation({
    mutationFn: (data: CategorieMouvementPayload) =>
      initial ? caissesApi.updateCategorie(initial.id, data) : caissesApi.createCategorie(data),
    onSuccess: () => {
      toast.success(initial ? 'Catégorie modifiée.' : 'Catégorie créée.')
      qc.invalidateQueries({ queryKey: ['caisses', 'categories'] })
      onSuccess()
    },
  })

  const isValid = nom.trim() && code.trim()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={FIELD_LABEL}>Nom *</label>
        <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="ex : Règlement client" />
      </div>
      <div>
        <label className={FIELD_LABEL}>Code *</label>
        <Input
          value={code}
          onChange={e => setCode(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
          placeholder="ex : reglement_client"
          disabled={!!initial?.is_system}
        />
        <p className="text-xs text-[--text-muted] mt-1">
          Identifiant unique.{initial?.is_system ? ' Non modifiable (système).' : ''}
        </p>
      </div>
      <div>
        <label className={FIELD_LABEL}>Type *</label>
        <select className={SELECT_CLASS} value={type} onChange={e => setType(e.target.value as TypeMouvement)} disabled={!!initial}>
          <option value="entree">Entrée</option>
          <option value="sortie">Sortie</option>
        </select>
        {initial && <p className="text-xs text-[--text-muted] mt-1">Non modifiable après création.</p>}
      </div>
      <div>
        <label className={FIELD_LABEL}>Ordre d'affichage</label>
        <Input type="number" min="1" value={ordre} onChange={e => setOrdre(e.target.value)} />
      </div>
      <div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} className="accent-[--accent]" />
          <span className="text-sm text-[--text-primary]">Catégorie active</span>
        </label>
        <p className="text-xs text-[--text-muted] mt-1 ml-5">
          Les catégories inactives n'apparaissent pas dans les formulaires.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          loading={mut.isPending}
          disabled={!isValid}
          onClick={() => mut.mutate({ nom: nom.trim(), code: code.trim(), type, ordre: Number(ordre) || 10, actif })}
        >
          {initial ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>
    </div>
  )
}

function DeleteCaisseConfirm({
  categorie, onCancel, onSuccess,
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
        <Button variant="danger" loading={mut.isPending} onClick={() => mut.mutate()}>Supprimer</Button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONGLET COMPTABILITÉ
// ═══════════════════════════════════════════════════════════════════════════════

function TabComptabilite() {
  const [editing,  setEditing]  = useState<CategorieComptable | null>(null)
  const [deleting, setDeleting] = useState<CategorieComptable | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['comptabilite', 'categories'],
    queryFn:  () => comptabiliteApi.listCategories().then(r => r.data),
  })

  const categories = [...(data?.results ?? [])].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'income' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      {(creating || editing) && (
        <Modal
          isOpen
          onClose={() => { setCreating(false); setEditing(null) }}
          title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          size="sm"
        >
          <ComptabiliteForm
            initial={editing}
            onCancel={() => { setCreating(false); setEditing(null) }}
            onSuccess={() => { setCreating(false); setEditing(null) }}
          />
        </Modal>
      )}

      {deleting && (
        <Modal
          isOpen
          onClose={() => setDeleting(null)}
          title="Supprimer la catégorie"
          size="sm"
        >
          <DeleteComptabiliteConfirm
            categorie={deleting}
            onCancel={() => setDeleting(null)}
            onSuccess={() => setDeleting(null)}
          />
        </Modal>
      )}

      <div className="surface overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold text-[--text-primary]">
            Catégories de mouvements comptables
          </h2>
          <Button variant="outline" size="sm" icon={<Plus size={12} />} onClick={() => setCreating(true)}>
            Nouvelle catégorie
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-[--text-muted]">Chargement…</div>
        ) : categories.length === 0 ? (
          <div className="p-10 text-center text-sm text-[--text-muted]">Aucune catégorie</div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th className={TH}>Nom</th>
                <th className={TH}>Type</th>
                <th className={TH}>Statut</th>
                <th className={TH + ' w-20'}></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, i) => (
                <tr
                  key={cat.id}
                  className="group hover:bg-[--bg-elevated] transition-colors"
                  style={{ borderBottom: i < categories.length - 1 ? '1px solid var(--border-subtle)' : undefined }}
                >
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      {cat.is_system && <Lock size={11} className="text-[--text-muted] flex-shrink-0" />}
                      <span className="text-[--text-primary]">{cat.name}</span>
                    </div>
                  </td>
                  <td className={TD}>
                    {cat.type === 'income' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--status-success)' }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--status-success)' }} />
                        Recette
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--status-danger)' }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--status-danger)' }} />
                        Charge
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    {cat.actif
                      ? <Badge variant="success">Actif</Badge>
                      : <Badge variant="neutral">Inactif</Badge>
                    }
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button
                        className="p-1.5 rounded text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-colors"
                        onClick={() => setEditing(cat)}
                        title="Modifier"
                      >
                        <Pencil size={13} />
                      </button>
                      {!cat.is_system && (
                        <button
                          className="p-1.5 rounded transition-colors"
                          style={{ color: 'var(--status-danger)' }}
                          onClick={() => setDeleting(cat)}
                          title="Supprimer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function ComptabiliteForm({
  initial, onCancel, onSuccess,
}: {
  initial:   CategorieComptable | null
  onCancel:  () => void
  onSuccess: () => void
}) {
  const qc   = useQueryClient()
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<EntryType>(initial?.type ?? 'income')
  const [actif, setActif] = useState(initial?.actif ?? true)

  const mut = useMutation({
    mutationFn: (data: CategorieComptablePayload) =>
      initial ? comptabiliteApi.updateCategorie(initial.id, data) : comptabiliteApi.createCategorie(data),
    onSuccess: () => {
      toast.success(initial ? 'Catégorie modifiée.' : 'Catégorie créée.')
      qc.invalidateQueries({ queryKey: ['comptabilite', 'categories'] })
      onSuccess()
    },
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={FIELD_LABEL}>Nom *</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="ex : Ventes produits" />
      </div>
      <div>
        <label className={FIELD_LABEL}>Type *</label>
        <select className={SELECT_CLASS} value={type} onChange={e => setType(e.target.value as EntryType)} disabled={!!initial}>
          <option value="income">Recette</option>
          <option value="expense">Charge</option>
        </select>
        {initial && <p className="text-xs text-[--text-muted] mt-1">Non modifiable après création.</p>}
      </div>
      <div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} className="accent-[--accent]" />
          <span className="text-sm text-[--text-primary]">Catégorie active</span>
        </label>
        <p className="text-xs text-[--text-muted] mt-1 ml-5">
          Les catégories inactives n'apparaissent pas dans les formulaires.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          loading={mut.isPending}
          disabled={!name.trim()}
          onClick={() => mut.mutate({ name: name.trim(), type, actif })}
        >
          {initial ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>
    </div>
  )
}

function DeleteComptabiliteConfirm({
  categorie, onCancel, onSuccess,
}: {
  categorie: CategorieComptable
  onCancel:  () => void
  onSuccess: () => void
}) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => comptabiliteApi.deleteCategorie(categorie.id),
    onSuccess: () => {
      toast.success('Catégorie supprimée.')
      qc.invalidateQueries({ queryKey: ['comptabilite', 'categories'] })
      onSuccess()
    },
  })
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-[--text-secondary]">
        Voulez-vous supprimer la catégorie{' '}
        <span className="font-medium text-[--text-primary]">« {categorie.name} »</span> ?
      </p>
      <p className="text-xs text-[--text-muted]">
        La suppression sera refusée si des écritures utilisent déjà cette catégorie.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button variant="danger" loading={mut.isPending} onClick={() => mut.mutate()}>Supprimer</Button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════

export function CategoriesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('caisses')

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold text-[--text-primary]">Catégories</h1>
        <p className="text-sm text-[--text-muted] mt-0.5">
          Gérez les catégories de mouvements de caisse et comptables.
        </p>
      </div>

      <div className="surface overflow-hidden">
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="px-5 py-3 text-xs font-medium transition-all"
              style={{
                color:        activeTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'caisses'      && <TabCaisses />}
          {activeTab === 'comptabilite' && <TabComptabilite />}
        </div>
      </div>
    </div>
  )
}
