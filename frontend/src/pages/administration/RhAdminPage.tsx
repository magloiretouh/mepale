/**
 * MEPALE ERP — Administration RH
 * Catégories d'employés · Types de primes · Taux sociaux CNSS/AMU · Types de congés
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronRight, Pencil, Trash2, Plus, Check, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import {
  type EmployeeCategory,
  type PrimeType,
  type CategoryPrimeSetting,
  type SocialRates,
  type TypeConge,
  type JourFerie,
  rhApi,
} from '@/services/rh'

// ─── Styles ───────────────────────────────────────────────────────────────────

const SELECT = cn(
  'w-full h-9 bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] appearance-none transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)
const LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1'

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="px-5 py-3.5 border-b"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1 — TAUX SOCIAUX
// ──────────────────────────────────────────────────────────────────────────────

function SocialRatesSection() {
  const qc = useQueryClient()
  const [editing, setEditing]   = useState(false)
  const [form,    setForm    ]   = useState<Partial<SocialRates & { company_name: string; company_address: string }>>({})
  const [error,   setError   ]   = useState('')

  const { data: rates, isLoading } = useQuery({
    queryKey: ['rh-admin-social-rates'],
    queryFn:  () => rhApi.adminGetSocialRates().then(r => r.data),
  })

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => rhApi.adminUpdateSocialRates(form),
    onSuccess:  () => {
      toast.success('Taux sociaux mis à jour.')
      qc.invalidateQueries({ queryKey: ['rh-admin-social-rates'] })
      qc.invalidateQueries({ queryKey: ['rh-social-rates'] })
      setEditing(false)
      setError('')
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setError(e?.response?.data?.detail ?? 'Erreur lors de la mise à jour.'),
  })

  const startEdit = () => {
    if (!rates) return
    setForm({
      cnss_employee_rate: rates.cnss_employee_rate,
      amu_employee_rate:  rates.amu_employee_rate,
      cnss_employer_rate: rates.cnss_employer_rate,
      amu_employer_rate:  rates.amu_employer_rate,
      company_name:       rates.company_name,
      company_address:    rates.company_address ?? '',
    })
    setEditing(true)
    setError('')
  }

  if (isLoading) return <p className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
  if (!rates)    return null

  return (
    <div className="flex flex-col gap-4">
      {!editing ? (
        <>
          {/* Affichage lecture */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'CNSS salarié',  val: rates.cnss_employee_rate },
              { label: 'AMU salarié',   val: rates.amu_employee_rate  },
              { label: 'CNSS patronal', val: rates.cnss_employer_rate },
              { label: 'AMU patronal',  val: rates.amu_employer_rate  },
            ].map(item => (
              <div
                key={item.label}
                className="rounded px-3 py-2.5"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {item.label}
                </p>
                <p className="text-base font-data font-bold mt-0.5" style={{ color: 'var(--accent)' }}>
                  {item.val} %
                </p>
              </div>
            ))}
          </div>

          <div
            className="rounded px-3 py-2.5"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Entreprise
            </p>
            <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {rates.company_name}
            </p>
            {rates.company_address && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {rates.company_address}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={startEdit}>
              <Pencil size={12} style={{ marginRight: 6 }} /> Modifier
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Formulaire édition */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="CNSS salarié (%)"
              type="number" step="0.01" min="0"
              value={String(form.cnss_employee_rate ?? '')}
              onChange={e => setForm(f => ({ ...f, cnss_employee_rate: e.target.value }))}
            />
            <Input
              label="AMU salarié (%)"
              type="number" step="0.01" min="0"
              value={String(form.amu_employee_rate ?? '')}
              onChange={e => setForm(f => ({ ...f, amu_employee_rate: e.target.value }))}
            />
            <Input
              label="CNSS patronal (%)"
              type="number" step="0.01" min="0"
              value={String(form.cnss_employer_rate ?? '')}
              onChange={e => setForm(f => ({ ...f, cnss_employer_rate: e.target.value }))}
            />
            <Input
              label="AMU patronal (%)"
              type="number" step="0.01" min="0"
              value={String(form.amu_employer_rate ?? '')}
              onChange={e => setForm(f => ({ ...f, amu_employer_rate: e.target.value }))}
            />
          </div>

          <Input
            label="Nom de l'entreprise"
            value={form.company_name ?? ''}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
          />
          <Input
            label="Adresse"
            value={form.company_address ?? ''}
            onChange={e => setForm(f => ({ ...f, company_address: e.target.value }))}
          />

          {error && (
            <p className="text-xs rounded px-3 py-2" style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}>
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setError('') }}>
              Annuler
            </Button>
            <Button variant="primary" size="sm" loading={isPending} onClick={() => save()}>
              Enregistrer
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2 — TYPES DE PRIMES
// ──────────────────────────────────────────────────────────────────────────────

function PrimeTypesSection() {
  const qc = useQueryClient()
  const [adding,   setAdding  ] = useState(false)
  const [editId,   setEditId  ] = useState<number | null>(null)
  const [form,     setForm    ] = useState({ name: '', description: '', is_taxable: false })
  const [editForm, setEditForm] = useState({ name: '', description: '', is_taxable: false })
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [error,    setError   ] = useState('')

  const { data: primeTypes = [], isLoading } = useQuery({
    queryKey: ['rh-admin-prime-types'],
    queryFn:  () => rhApi.adminListPrimeTypes().then(r => r.data),
  })

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: () => rhApi.adminCreatePrimeType({
      name:        form.name.trim(),
      description: form.description.trim() || undefined,
      is_taxable:  form.is_taxable,
    }),
    onSuccess: () => {
      toast.success('Type de prime créé.')
      qc.invalidateQueries({ queryKey: ['rh-admin-prime-types'] })
      setAdding(false)
      setForm({ name: '', description: '', is_taxable: false })
      setError('')
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setError(e?.response?.data?.detail ?? 'Erreur lors de la création.'),
  })

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: (id: number) => rhApi.adminUpdatePrimeType(id, {
      name:        editForm.name.trim(),
      description: editForm.description.trim() || undefined,
      is_taxable:  editForm.is_taxable,
    }),
    onSuccess: () => {
      toast.success('Type de prime modifié.')
      qc.invalidateQueries({ queryKey: ['rh-admin-prime-types'] })
      setEditId(null)
      setError('')
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setError(e?.response?.data?.detail ?? 'Erreur lors de la modification.'),
  })

  const { mutate: remove } = useMutation({
    mutationFn: (id: number) => rhApi.adminDeletePrimeType(id),
    onSuccess:  () => {
      toast.success('Type de prime supprimé.')
      setConfirmDel(null)
      qc.invalidateQueries({ queryKey: ['rh-admin-prime-types'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Impossible de supprimer.'),
  })

  if (isLoading) return <p className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>Chargement…</p>

  return (
    <div className="flex flex-col gap-3">
      {/* Liste */}
      {primeTypes.length === 0 && !adding && (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          Aucun type de prime configuré.
        </p>
      )}

      {primeTypes.map(pt => (
        <div
          key={pt.id}
          className="rounded border px-3 py-2.5"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor:     'var(--border)',
          }}
        >
          {editId === pt.id ? (
            /* Édition inline */
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Nom"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
                <Input
                  label="Description"
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={editForm.is_taxable}
                  onChange={e => setEditForm(f => ({ ...f, is_taxable: e.target.checked }))}
                  className="accent-[--accent]"
                />
                Soumise aux cotisations (prime imposable)
              </label>
              <div className="flex items-center gap-1.5 justify-end">
                <button
                  onClick={() => { setEditId(null); setError('') }}
                  className="p-1.5 rounded" style={{ color: 'var(--text-muted)' }}
                >
                  <X size={13} />
                </button>
                <button
                  onClick={() => update(pt.id)}
                  disabled={updating}
                  className="p-1.5 rounded" style={{ color: 'var(--accent)' }}
                >
                  <Check size={13} />
                </button>
              </div>
            </div>
          ) : (
            /* Affichage */
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {pt.name}
                  </span>
                  {pt.is_taxable && (
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}
                    >
                      Imposable
                    </span>
                  )}
                </div>
                {pt.description && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    {pt.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditId(pt.id)
                    setEditForm({ name: pt.name, description: pt.description ?? '', is_taxable: pt.is_taxable })
                    setError('')
                  }}
                  className="p-1.5 rounded transition-all hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Pencil size={12} />
                </button>
                {confirmDel === pt.id ? (
                  <>
                    <button
                      onClick={() => remove(pt.id)}
                      className="px-2 py-1 rounded text-xs font-semibold"
                      style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}
                    >
                      Oui
                    </button>
                    <button
                      onClick={() => setConfirmDel(null)}
                      className="px-2 py-1 rounded text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Non
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDel(pt.id)}
                    className="p-1.5 rounded transition-all hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Formulaire ajout */}
      {adding ? (
        <div
          className="rounded border px-3 py-3 flex flex-col gap-2"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--accent)' }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Nom *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex : Transport"
            />
            <Input
              label="Description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optionnel"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={form.is_taxable}
              onChange={e => setForm(f => ({ ...f, is_taxable: e.target.checked }))}
              className="accent-[--accent]"
            />
            Soumise aux cotisations (prime imposable)
          </label>
          {error && (
            <p className="text-xs rounded px-2 py-1.5" style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => { setAdding(false); setError('') }}
              className="p-1.5 rounded" style={{ color: 'var(--text-muted)' }}
            >
              <X size={13} />
            </button>
            <Button variant="primary" size="sm" loading={creating} onClick={() => create()}>
              Créer
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs font-medium transition-all hover:opacity-70 self-start"
          style={{ color: 'var(--accent)' }}
        >
          <Plus size={13} /> Nouveau type de prime
        </button>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 3 — CATÉGORIES RH
// ──────────────────────────────────────────────────────────────────────────────

function CategoryPrimeSettings({
  category,
  primeTypes,
}: {
  category:   EmployeeCategory & { prime_settings?: CategoryPrimeSetting[] }
  primeTypes: PrimeType[]
}) {
  const qc = useQueryClient()
  const [newPrimeTypeId, setNewPrimeTypeId] = useState('')
  const [newAmount,      setNewAmount     ] = useState('')
  const [editSettingId,  setEditSettingId ] = useState<number | null>(null)
  const [editAmount,     setEditAmount    ] = useState('')
  const [confirmDel,     setConfirmDel    ] = useState<number | null>(null)
  const [error,          setError         ] = useState('')

  const settings = category.prime_settings ?? []
  const usedTypeIds = new Set(settings.map(s => s.prime_type))
  const availableTypes = primeTypes.filter(pt => !usedTypeIds.has(pt.id))

  const { mutate: addSetting, isPending: adding } = useMutation({
    mutationFn: () => rhApi.adminCreatePrimeSetting(category.id, {
      prime_type_id:  parseInt(newPrimeTypeId),
      default_amount: parseFloat(newAmount),
    }),
    onSuccess: () => {
      toast.success('Prime ajoutée à la catégorie.')
      qc.invalidateQueries({ queryKey: ['rh-admin-categories'] })
      setNewPrimeTypeId('')
      setNewAmount('')
      setError('')
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setError(e?.response?.data?.detail ?? 'Erreur lors de l\'ajout.'),
  })

  const { mutate: updateSetting } = useMutation({
    mutationFn: (id: number) => rhApi.adminUpdatePrimeSetting(category.id, id, {
      default_amount: parseFloat(editAmount),
    }),
    onSuccess: () => {
      toast.success('Montant mis à jour.')
      qc.invalidateQueries({ queryKey: ['rh-admin-categories'] })
      setEditSettingId(null)
    },
    onError: () => toast.error('Erreur lors de la mise à jour.'),
  })

  const { mutate: removeSetting } = useMutation({
    mutationFn: (id: number) => rhApi.adminDeletePrimeSetting(category.id, id),
    onSuccess: () => {
      toast.success('Prime retirée de la catégorie.')
      setConfirmDel(null)
      qc.invalidateQueries({ queryKey: ['rh-admin-categories'] })
    },
    onError: () => toast.error('Erreur lors de la suppression.'),
  })

  return (
    <div className="flex flex-col gap-2 pt-2">
      {settings.length === 0 && (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          Aucune prime configurée pour cette catégorie.
        </p>
      )}

      {settings.map(s => (
        <div
          key={s.id}
          className="flex items-center gap-3 px-3 py-2 rounded"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {s.prime_type_name}
            </span>
            {s.prime_type_is_taxable && (
              <span
                className="ml-2 text-[9px] font-medium px-1 py-0.5 rounded"
                style={{ backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}
              >
                Imp.
              </span>
            )}
          </div>

          {editSettingId === s.id ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number" step="1" min="0"
                value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                className="w-28 h-7 bg-[--bg-elevated] border border-[--accent] rounded px-2 text-xs text-right text-[--text-primary] focus:outline-none"
                placeholder="0"
              />
              <button onClick={() => updateSetting(s.id)} className="p-1 rounded" style={{ color: 'var(--accent)' }}>
                <Check size={12} />
              </button>
              <button onClick={() => setEditSettingId(null)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}>
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-data text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                {Math.round(parseFloat(s.default_amount)).toLocaleString('fr-FR')} F
              </span>
              <button
                onClick={() => { setEditSettingId(s.id); setEditAmount(String(Math.round(parseFloat(s.default_amount)))) }}
                className="p-1 rounded transition-all hover:opacity-70"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Pencil size={11} />
              </button>
              {confirmDel === s.id ? (
                <>
                  <button
                    onClick={() => removeSetting(s.id)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}
                  >
                    Oui
                  </button>
                  <button
                    onClick={() => setConfirmDel(null)}
                    className="text-[10px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Non
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDel(s.id)}
                  className="p-1 rounded transition-all hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Ajout d'une prime */}
      {availableTypes.length > 0 && (
        <div className="flex items-end gap-2 mt-1">
          <div className="flex-1">
            <label className={LABEL}>Type de prime</label>
            <select
              className={SELECT}
              value={newPrimeTypeId}
              onChange={e => setNewPrimeTypeId(e.target.value)}
            >
              <option value="">— Sélectionner —</option>
              {availableTypes.map(pt => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 140 }}>
            <label className={LABEL}>Montant défaut (F)</label>
            <input
              type="number" step="1" min="0"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              className="w-full h-9 bg-[--bg-elevated] border border-[--border] rounded px-3 text-sm text-right text-[--text-primary] focus:outline-none focus:border-[--accent]"
              placeholder="0"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={adding}
            onClick={() => {
              if (!newPrimeTypeId || !newAmount) return setError('Prime type et montant requis.')
              addSetting()
            }}
          >
            <Plus size={12} style={{ marginRight: 4 }} /> Ajouter
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs rounded px-2 py-1.5" style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

function CategoriesSection() {
  const qc = useQueryClient()
  const [expanded,    setExpanded  ] = useState<number | null>(null)
  const [adding,      setAdding    ] = useState(false)
  const [editId,      setEditId    ] = useState<number | null>(null)
  const [form,        setForm      ] = useState({ name: '', description: '' })
  const [editForm,    setEditForm  ] = useState({ name: '', description: '' })
  const [confirmDel,  setConfirmDel] = useState<number | null>(null)
  const [error,       setError     ] = useState('')

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['rh-admin-categories'],
    queryFn:  () => rhApi.adminListCategories().then(r => r.data) as Promise<(EmployeeCategory & { prime_settings?: CategoryPrimeSetting[] })[]>,
  })

  const { data: primeTypes = [] } = useQuery({
    queryKey: ['rh-admin-prime-types'],
    queryFn:  () => rhApi.adminListPrimeTypes().then(r => r.data),
  })

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: () => rhApi.adminCreateCategory({ name: form.name.trim(), description: form.description.trim() || undefined }),
    onSuccess:  () => {
      toast.success('Catégorie créée.')
      qc.invalidateQueries({ queryKey: ['rh-admin-categories'] })
      qc.invalidateQueries({ queryKey: ['rh-categories'] })
      setAdding(false)
      setForm({ name: '', description: '' })
      setError('')
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setError(e?.response?.data?.detail ?? 'Erreur lors de la création.'),
  })

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: (id: number) => rhApi.adminUpdateCategory(id, {
      name:        editForm.name.trim(),
      description: editForm.description.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Catégorie modifiée.')
      qc.invalidateQueries({ queryKey: ['rh-admin-categories'] })
      qc.invalidateQueries({ queryKey: ['rh-categories'] })
      setEditId(null)
      setError('')
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setError(e?.response?.data?.detail ?? 'Erreur lors de la modification.'),
  })

  const { mutate: remove } = useMutation({
    mutationFn: (id: number) => rhApi.adminDeleteCategory(id),
    onSuccess:  () => {
      toast.success('Catégorie supprimée.')
      setConfirmDel(null)
      qc.invalidateQueries({ queryKey: ['rh-admin-categories'] })
      qc.invalidateQueries({ queryKey: ['rh-categories'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Impossible de supprimer.'),
  })

  if (isLoading) return <p className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>Chargement…</p>

  return (
    <div className="flex flex-col gap-2">
      {categories.length === 0 && !adding && (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          Aucune catégorie configurée.
        </p>
      )}

      {categories.map(cat => (
        <div
          key={cat.id}
          className="rounded border overflow-hidden"
          style={{ borderColor: expanded === cat.id ? 'var(--accent)' : 'var(--border)' }}
        >
          {/* Header catégorie */}
          <div
            className="px-3 py-2.5 flex items-center gap-2"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <button
              onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}
              className="flex items-center gap-2 flex-1 text-left min-w-0"
            >
              {expanded === cat.id
                ? <ChevronDown size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                : <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              }
              {editId === cat.id ? (
                <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                  <Input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nom"
                  />
                  <Input
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Description"
                  />
                  <button onClick={() => { setEditId(null); setError('') }} style={{ color: 'var(--text-muted)' }}>
                    <X size={13} />
                  </button>
                  <button
                    onClick={() => update(cat.id)}
                    disabled={updating}
                    style={{ color: 'var(--accent)' }}
                  >
                    <Check size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {cat.name}
                  </span>
                  {cat.description && (
                    <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {cat.description}
                    </span>
                  )}
                  <span
                    className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  >
                    {(cat.prime_settings ?? []).length} prime{(cat.prime_settings ?? []).length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </button>

            {editId !== cat.id && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setEditId(cat.id); setEditForm({ name: cat.name, description: cat.description ?? '' }); setError('') }}
                  className="p-1.5 rounded transition-all hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Pencil size={12} />
                </button>
                {confirmDel === cat.id ? (
                  <>
                    <button
                      onClick={() => remove(cat.id)}
                      className="px-2 py-1 rounded text-xs font-semibold"
                      style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}
                    >
                      Confirmer
                    </button>
                    <button onClick={() => setConfirmDel(null)} className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDel(cat.id)}
                    className="p-1.5 rounded transition-all hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sous-section primes */}
          {expanded === cat.id && (
            <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
              <CategoryPrimeSettings category={cat} primeTypes={primeTypes} />
            </div>
          )}
        </div>
      ))}

      {/* Ajout catégorie */}
      {adding ? (
        <div
          className="rounded border px-3 py-3 flex flex-col gap-2"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--accent)' }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Nom *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex : Cadre, Ouvrier…"
            />
            <Input
              label="Description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optionnel"
            />
          </div>
          {error && (
            <p className="text-xs rounded px-2 py-1.5" style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-1.5 justify-end">
            <Button variant="secondary" size="sm" onClick={() => { setAdding(false); setError('') }}>
              Annuler
            </Button>
            <Button variant="primary" size="sm" loading={creating} onClick={() => create()}>
              Créer
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs font-medium transition-all hover:opacity-70 self-start"
          style={{ color: 'var(--accent)' }}
        >
          <Plus size={13} /> Nouvelle catégorie
        </button>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 4 — TYPES DE CONGÉS
// ──────────────────────────────────────────────────────────────────────────────

function TypeCongesSection() {
  const qc = useQueryClient()
  const [adding,     setAdding    ] = useState(false)
  const [editId,     setEditId    ] = useState<number | null>(null)
  const [form,       setForm      ] = useState({ name: '', description: '', quota_annuel: '', mode_acquisition: 'libre' as TypeConge['mode_acquisition'], est_paye: true })
  const [editForm,   setEditForm  ] = useState({ name: '', description: '', quota_annuel: '', mode_acquisition: 'libre' as TypeConge['mode_acquisition'], est_paye: true, is_active: true })
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [error,      setError     ] = useState('')

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['rh-admin-types-conge'],
    queryFn:  () => rhApi.listTypesConge(false).then(r => r.data),
  })

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: () => rhApi.createTypeConge({
      name:             form.name.trim(),
      description:      form.description.trim() || undefined,
      quota_annuel:     form.quota_annuel || '0',
      mode_acquisition: form.mode_acquisition,
      est_paye:         form.est_paye,
    }),
    onSuccess: () => {
      toast.success('Type de congé créé.')
      qc.invalidateQueries({ queryKey: ['rh-admin-types-conge'] })
      qc.invalidateQueries({ queryKey: ['rh-types-conge'] })
      setAdding(false)
      setForm({ name: '', description: '', quota_annuel: '', mode_acquisition: 'libre', est_paye: true })
      setError('')
    },
    onError: (e: { response?: { data?: { detail?: string; name?: string[] } } }) =>
      setError(e?.response?.data?.detail ?? e?.response?.data?.name?.[0] ?? 'Erreur lors de la création.'),
  })

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: (id: number) => rhApi.updateTypeConge(id, {
      name:             editForm.name.trim(),
      description:      editForm.description.trim() || undefined,
      quota_annuel:     editForm.quota_annuel || '0',
      mode_acquisition: editForm.mode_acquisition,
      est_paye:         editForm.est_paye,
      is_active:        editForm.is_active,
    }),
    onSuccess: () => {
      toast.success('Type de congé modifié.')
      qc.invalidateQueries({ queryKey: ['rh-admin-types-conge'] })
      qc.invalidateQueries({ queryKey: ['rh-types-conge'] })
      setEditId(null)
      setError('')
    },
    onError: (e: { response?: { data?: { detail?: string; name?: string[] } } }) =>
      setError(e?.response?.data?.detail ?? e?.response?.data?.name?.[0] ?? 'Erreur lors de la modification.'),
  })

  const { mutate: remove } = useMutation({
    mutationFn: (id: number) => rhApi.deleteTypeConge(id),
    onSuccess:  () => {
      toast.success('Type de congé supprimé.')
      setConfirmDel(null)
      qc.invalidateQueries({ queryKey: ['rh-admin-types-conge'] })
      qc.invalidateQueries({ queryKey: ['rh-types-conge'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Impossible de supprimer.'),
  })

  const startEdit = (t: TypeConge) => {
    setEditId(t.id)
    setEditForm({
      name:             t.name,
      description:      t.description ?? '',
      quota_annuel:     t.quota_annuel,
      mode_acquisition: t.mode_acquisition,
      est_paye:         t.est_paye,
      is_active:        t.is_active,
    })
    setError('')
  }

  if (isLoading) return <p className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>Chargement…</p>

  return (
    <div className="flex flex-col gap-3">
      {types.length === 0 && !adding && (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          Aucun type de congé configuré.
        </p>
      )}

      {types.map(t => (
        <div
          key={t.id}
          className="rounded border px-3 py-2.5"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor:     editId === t.id ? 'var(--accent)' : 'var(--border)',
            opacity:         t.is_active ? 1 : 0.55,
          }}
        >
          {editId === t.id ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Nom *"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
                <Input
                  label="Quota annuel (jours)"
                  type="number" step="0.5" min="0"
                  value={editForm.quota_annuel}
                  onChange={e => setEditForm(f => ({ ...f, quota_annuel: e.target.value }))}
                />
              </div>
              <div>
                <label className={LABEL}>Mode d'acquisition</label>
                <select
                  className={SELECT}
                  value={editForm.mode_acquisition}
                  onChange={e => setEditForm(f => ({ ...f, mode_acquisition: e.target.value as TypeConge['mode_acquisition'] }))}
                >
                  <option value="libre">Libre (pas de calcul auto)</option>
                  <option value="mensuel">Mensuel (quota ÷ 12 par mois)</option>
                  <option value="annuel">Annuel (quota crédité au 1ᵉʳ janvier)</option>
                </select>
              </div>
              <Input
                label="Description"
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optionnel"
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={editForm.est_paye}
                    onChange={e => setEditForm(f => ({ ...f, est_paye: e.target.checked }))}
                    className="accent-[--accent]"
                  />
                  Congé payé
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="accent-[--accent]"
                  />
                  Actif
                </label>
              </div>
              {error && (
                <p className="text-xs rounded px-2 py-1.5" style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}>
                  {error}
                </p>
              )}
              <div className="flex items-center gap-1.5 justify-end">
                <button
                  onClick={() => { setEditId(null); setError('') }}
                  className="p-1.5 rounded" style={{ color: 'var(--text-muted)' }}
                >
                  <X size={13} />
                </button>
                <button
                  onClick={() => update(t.id)}
                  disabled={updating}
                  className="p-1.5 rounded" style={{ color: 'var(--accent)' }}
                >
                  <Check size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t.name}
                  </span>
                  {!t.est_paye && (
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}
                    >
                      Non payé
                    </span>
                  )}
                  {!t.is_active && (
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                      Inactif
                    </span>
                  )}
                  {parseFloat(t.quota_annuel) > 0 && (
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {t.quota_annuel} j/an
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    {t.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => startEdit(t)}
                  className="p-1.5 rounded transition-all hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Pencil size={12} />
                </button>
                {confirmDel === t.id ? (
                  <>
                    <button
                      onClick={() => remove(t.id)}
                      className="px-2 py-1 rounded text-xs font-semibold"
                      style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}
                    >
                      Oui
                    </button>
                    <button
                      onClick={() => setConfirmDel(null)}
                      className="px-2 py-1 rounded text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Non
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDel(t.id)}
                    className="p-1.5 rounded transition-all hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Formulaire ajout */}
      {adding ? (
        <div
          className="rounded border px-3 py-3 flex flex-col gap-2"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--accent)' }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Nom *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex : Congé annuel"
            />
            <Input
              label="Quota annuel (jours)"
              type="number" step="0.5" min="0"
              value={form.quota_annuel}
              onChange={e => setForm(f => ({ ...f, quota_annuel: e.target.value }))}
              placeholder="Ex : 30"
            />
          </div>
          <div>
            <label className={LABEL}>Mode d'acquisition</label>
            <select
              className={SELECT}
              value={form.mode_acquisition}
              onChange={e => setForm(f => ({ ...f, mode_acquisition: e.target.value as TypeConge['mode_acquisition'] }))}
            >
              <option value="libre">Libre (pas de calcul auto)</option>
              <option value="mensuel">Mensuel (quota ÷ 12 par mois)</option>
              <option value="annuel">Annuel (quota crédité au 1ᵉʳ janvier)</option>
            </select>
          </div>
          <Input
            label="Description"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optionnel"
          />
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={form.est_paye}
              onChange={e => setForm(f => ({ ...f, est_paye: e.target.checked }))}
              className="accent-[--accent]"
            />
            Congé payé
          </label>
          {error && (
            <p className="text-xs rounded px-2 py-1.5" style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => { setAdding(false); setError('') }}
              className="p-1.5 rounded" style={{ color: 'var(--text-muted)' }}
            >
              <X size={13} />
            </button>
            <Button variant="primary" size="sm" loading={creating} onClick={() => {
              if (!form.name.trim()) return setError('Le nom est obligatoire.')
              create()
            }}>
              Créer
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs font-medium transition-all hover:opacity-70 self-start"
          style={{ color: 'var(--accent)' }}
        >
          <Plus size={13} /> Nouveau type de congé
        </button>
      )}
    </div>
  )
}

// ─── Jours fériés ─────────────────────────────────────────────────────────────

function JoursFeriesSection() {
  const qc = useQueryClient()
  const { data: jours = [] } = useQuery({
    queryKey: ['rh-jours-feries'],
    queryFn:  () => rhApi.listJoursFeries().then(r => r.data),
  })

  const [adding, setAdding]   = useState(false)
  const [editId, setEditId]   = useState<number | null>(null)
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [form, setForm] = useState({ date: '', name: '', is_recurrent: false })

  const resetForm = () => { setForm({ date: '', name: '', is_recurrent: false }); setAdding(false); setEditId(null) }

  const createMut = useMutation({
    mutationFn: () => rhApi.createJourFerie(form),
    onSuccess: () => { toast.success('Jour férié ajouté.'); qc.invalidateQueries({ queryKey: ['rh-jours-feries'] }); resetForm() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const updateMut = useMutation({
    mutationFn: (id: number) => rhApi.updateJourFerie(id, form),
    onSuccess: () => { toast.success('Jour férié modifié.'); qc.invalidateQueries({ queryKey: ['rh-jours-feries'] }); resetForm() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => rhApi.deleteJourFerie(id),
    onSuccess: () => { toast.success('Jour férié supprimé.'); qc.invalidateQueries({ queryKey: ['rh-jours-feries'] }); setConfirmDel(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const startEdit = (jf: JourFerie) => {
    setForm({ date: jf.date, name: jf.name, is_recurrent: jf.is_recurrent })
    setEditId(jf.id)
    setAdding(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {jours.length === 0 && !adding && (
        <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>Aucun jour férié configuré.</p>
      )}

      {jours.map(jf => (
        <div key={jf.id}>
          {editId === jf.id ? (
            <div className="rounded border px-3 py-2 flex flex-col gap-2"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--accent)' }}>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Date *" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                <Input label="Nom *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex : Fête du Travail" />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={form.is_recurrent} onChange={e => setForm(f => ({ ...f, is_recurrent: e.target.checked }))} />
                Récurrent (chaque année à la même date)
              </label>
              <div className="flex gap-2">
                <Button size="xs" variant="primary" loading={updateMut.isPending} icon={<Check size={11} />}
                  onClick={() => updateMut.mutate(jf.id)} disabled={!form.date || !form.name}>
                  Enregistrer
                </Button>
                <Button size="xs" variant="ghost" icon={<X size={11} />} onClick={resetForm}>Annuler</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded px-3 py-2"
              style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-data tabular-nums" style={{ color: 'var(--text-muted)', minWidth: 84 }}>{jf.date}</span>
                <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{jf.name}</span>
                {jf.is_recurrent && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    Récurrent
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {confirmDel === jf.id ? (
                  <>
                    <span className="text-xs mr-1" style={{ color: 'var(--text-muted)' }}>Supprimer ?</span>
                    <button onClick={() => deleteMut.mutate(jf.id)} className="px-2 py-1 rounded text-xs font-medium"
                      style={{ backgroundColor: 'var(--status-danger)', color: '#fff' }}>Oui</button>
                    <button onClick={() => setConfirmDel(null)} className="px-2 py-1 rounded text-xs" style={{ color: 'var(--text-muted)' }}>Non</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(jf)} className="p-1.5 rounded transition-all hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setConfirmDel(jf.id)} className="p-1.5 rounded transition-all hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="rounded border px-3 py-2 flex flex-col gap-2"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--accent)' }}>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Date *" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <Input label="Nom *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex : Fête du Travail" />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.is_recurrent} onChange={e => setForm(f => ({ ...f, is_recurrent: e.target.checked }))} />
            Récurrent (chaque année à la même date)
          </label>
          <div className="flex gap-2">
            <Button size="xs" variant="primary" loading={createMut.isPending} icon={<Check size={11} />}
              onClick={() => createMut.mutate()} disabled={!form.date || !form.name}>
              Ajouter
            </Button>
            <Button size="xs" variant="ghost" icon={<X size={11} />} onClick={resetForm}>Annuler</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setAdding(true); setEditId(null) }}
          className="flex items-center gap-1.5 text-xs font-medium transition-all hover:opacity-70 self-start"
          style={{ color: 'var(--accent)' }}>
          <Plus size={13} /> Nouveau jour férié
        </button>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function RhAdminPage() {
  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* En-tête */}
      <div style={{ marginBottom: 4 }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Administration RH
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Configuration des catégories, types de primes, taux sociaux, types de congés et jours fériés.
        </p>
      </div>

      {/* Disposition en 2 colonnes : gauche large + droite */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* Colonne gauche — Catégories RH */}
        <SectionCard title="Catégories d'employés">
          <CategoriesSection />
        </SectionCard>

        {/* Colonne droite — Types de primes + Taux sociaux */}
        <div className="flex flex-col gap-5">
          <SectionCard title="Types de primes">
            <PrimeTypesSection />
          </SectionCard>

          <SectionCard title="Taux sociaux CNSS / AMU">
            <SocialRatesSection />
          </SectionCard>

          <SectionCard title="Types de congés">
            <TypeCongesSection />
          </SectionCard>

          <SectionCard title="Jours fériés">
            <JoursFeriesSection />
          </SectionCard>
        </div>

      </div>
    </div>
  )
}
