/**
 * MEPALE ERP — Modal création / édition employé
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { type Employee, rhApi } from '@/services/rh'

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] appearance-none transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)

const LABEL_CLASS = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1'

const CONTRACT_TYPES = [
  { value: 'CDI',           label: 'CDI'          },
  { value: 'CDD',           label: 'CDD'          },
  { value: 'temps_partiel', label: 'Temps partiel' },
  { value: 'extra',         label: 'Extra'        },
  { value: 'stage',         label: 'Stage'        },
]

interface Props {
  isOpen:    boolean
  onClose:   () => void
  employee?: Employee | null
  onSuccess: () => void
}

interface FormData {
  name:                    string
  role:                    string
  contract_type:           string
  category_id:             string
  monthly_salary:          string
  hire_date:               string
  birth_date:              string
  phone:                   string
  email:                   string
  nif:                     string
  cnss_number:             string
  has_social_contributions: boolean
}

const empty: FormData = {
  name:                    '',
  role:                    '',
  contract_type:           '',
  category_id:             '',
  monthly_salary:          '',
  hire_date:               '',
  birth_date:              '',
  phone:                   '',
  email:                   '',
  nif:                     '',
  cnss_number:             '',
  has_social_contributions: true,
}

export function EmployeModal({ isOpen, onClose, employee, onSuccess }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormData>(empty)
  const [error, setError] = useState('')

  // Catégories disponibles
  const { data: categories = [] } = useQuery({
    queryKey: ['rh-categories'],
    queryFn: () => rhApi.listCategories().then(r => r.data),
    enabled: isOpen,
  })

  // Pré-remplir si édition
  useEffect(() => {
    if (employee) {
      setForm({
        name:                    employee.name,
        role:                    employee.role ?? '',
        contract_type:           employee.contract_type ?? '',
        category_id:             employee.category ? String(employee.category) : '',
        monthly_salary:          employee.monthly_salary ?? '',
        hire_date:               employee.hire_date ?? '',
        birth_date:              employee.birth_date ?? '',
        phone:                   employee.phone ?? '',
        email:                   employee.email ?? '',
        nif:                     employee.nif ?? '',
        cnss_number:             employee.cnss_number ?? '',
        has_social_contributions: employee.has_social_contributions,
      })
    } else {
      setForm(empty)
    }
    setError('')
  }, [employee, isOpen])

  const set = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm(prev => ({
        ...prev,
        [field]: e.target.type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : e.target.value,
      }))
      setError('')
    }

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
        name:                    form.name.trim(),
        role:                    form.role.trim() || undefined,
        contract_type:           (form.contract_type || undefined) as 'CDI' | 'CDD' | 'temps_partiel' | 'extra' | 'stage' | undefined,
        category_id:             form.category_id ? parseInt(form.category_id) : undefined,
        monthly_salary:          form.monthly_salary || undefined,
        hire_date:               form.hire_date || undefined,
        birth_date:              form.birth_date || undefined,
        phone:                   form.phone.trim() || undefined,
        email:                   form.email.trim() || undefined,
        nif:                     form.nif.trim() || undefined,
        cnss_number:             form.cnss_number.trim() || undefined,
        has_social_contributions: form.has_social_contributions,
      }
      return employee
        ? rhApi.updateEmployee(employee.id, payload)
        : rhApi.createEmployee(payload)
    },
    onSuccess: () => {
      toast.success(employee ? 'Employé modifié.' : 'Employé créé.')
      qc.invalidateQueries({ queryKey: ['rh-employees'] })
      onSuccess()
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail ?? 'Une erreur est survenue.')
    },
  })

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setError('Le nom de l\'employé est obligatoire.')
      return
    }
    save()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={employee ? `Modifier — ${employee.name}` : 'Nouvel employé'}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Nom */}
        <Input
          label="Nom complet *"
          value={form.name}
          onChange={set('name')}
          placeholder="Prénom NOM"
        />

        {/* Poste + Contrat */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Poste / fonction"
            value={form.role}
            onChange={set('role')}
            placeholder="Opérateur, Responsable…"
          />
          <div>
            <label className={LABEL_CLASS}>Type de contrat</label>
            <select className={SELECT_CLASS} value={form.contract_type} onChange={set('contract_type')}>
              <option value="">— Sélectionner —</option>
              {CONTRACT_TYPES.map(ct => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Catégorie + Salaire */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Catégorie RH</label>
            {categories.length === 0 ? (
              <p className="text-xs text-[--text-muted] mt-1">
                Aucune catégorie — créez-en une dans l'administration.
              </p>
            ) : (
              <select className={SELECT_CLASS} value={form.category_id} onChange={set('category_id')}>
                <option value="">— Sans catégorie —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <Input
            label="Salaire mensuel fixe (F CFA)"
            type="number"
            step="1"
            min="0"
            value={form.monthly_salary}
            onChange={set('monthly_salary')}
            placeholder="0"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date d'embauche"
            type="date"
            value={form.hire_date}
            onChange={set('hire_date')}
          />
          <Input
            label="Date de naissance"
            type="date"
            value={form.birth_date}
            onChange={set('birth_date')}
          />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Téléphone"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+228…"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="nom@example.com"
          />
        </div>

        {/* NIF + CNSS */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="NIF"
            value={form.nif}
            onChange={set('nif')}
            placeholder="Numéro d'identification fiscale"
          />
          <Input
            label="N° CNSS"
            value={form.cnss_number}
            onChange={set('cnss_number')}
            placeholder="Numéro CNSS"
          />
        </div>

        {/* Cotisations sociales */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.has_social_contributions}
            onChange={set('has_social_contributions')}
            className="mt-0.5 rounded"
          />
          <span className="text-sm text-[--text-secondary] leading-relaxed">
            <strong className="text-[--text-primary]">Soumis aux cotisations sociales</strong>
            {' '}(CNSS / AMU)
            <br />
            <span className="text-xs text-[--text-muted]">
              Décochez pour les extras et stagiaires exonérés.
            </span>
          </span>
        </label>

        {/* Erreur */}
        {error && (
          <p className="text-sm text-[--status-danger] bg-[--status-danger-bg] rounded px-3 py-2">
            {error}
          </p>
        )}

      </div>
    </Modal>
  )
}
