import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { productionApi } from '@/services/production'

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)

const FORM_DEFAULT = {
  nomenclature:    '',
  quantite_prevue: '',
  date_prevue:     '',
  ligne_prod:      '',
  seuil_rendement: '80',
  seuil_perte:     '10',
  notes:           '',
}

interface CreateOFModalProps {
  isOpen:     boolean
  onClose:    () => void
  onSuccess?: () => void
}

export function CreateOFModal({ isOpen, onClose, onSuccess }: CreateOFModalProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState(FORM_DEFAULT)

  const { data: nomenclaturesData } = useQuery({
    queryKey: ['nomenclatures-select'],
    queryFn:  () => productionApi.listNomenclatures({ active: true, page_size: 200 }).then(r => r.data),
    enabled:  isOpen,
  })
  const nomenclatures = nomenclaturesData?.results ?? []

  const { mutate: createOF, isPending: creating } = useMutation({
    mutationFn: () => productionApi.createOF({
      nomenclature:    form.nomenclature,
      quantite_prevue: parseFloat(form.quantite_prevue),
      date_prevue:     form.date_prevue,
      ligne_prod:      form.ligne_prod || '',
      seuil_rendement: parseFloat(form.seuil_rendement),
      seuil_perte:     parseFloat(form.seuil_perte),
      notes:           form.notes,
    }),
    onSuccess: (r) => {
      toast.success(`OF ${r.data.reference} créé avec succès`)
      qc.invalidateQueries({ queryKey: ['ofs'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      onSuccess?.()
      handleClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la création'),
  })

  const set = (k: keyof typeof FORM_DEFAULT) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const handleClose = () => { onClose(); setForm(FORM_DEFAULT) }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nomenclature || !form.quantite_prevue || !form.date_prevue) {
      toast.error('Nomenclature, quantité et date prévue sont requis.')
      return
    }
    createOF()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Nouvel Ordre de Fabrication"
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" loading={creating} onClick={handleCreate}>
            Créer l'OF
          </Button>
        </>
      }
    >
      <form onSubmit={handleCreate} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[--text-secondary] uppercase tracking-wider">
            Nomenclature <span className="text-[--status-danger]">*</span>
          </label>
          <select className={SELECT_CLASS} value={form.nomenclature} onChange={set('nomenclature')} required>
            <option value="">— Sélectionner une nomenclature —</option>
            {nomenclatures.map(n => (
              <option key={n.id} value={n.id}>
                {n.produit_detail.designation} — v{n.version} (base {n.quantite_base} {n.produit_detail.unite_code})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Quantité prévue *"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Ex : 500"
            value={form.quantite_prevue}
            onChange={set('quantite_prevue')}
            required
          />
          <Input
            label="Date prévue *"
            type="date"
            value={form.date_prevue}
            onChange={set('date_prevue')}
            required
          />
        </div>

        <Input
          label="Ligne de production"
          placeholder="Ex : Ligne A"
          value={form.ligne_prod}
          onChange={set('ligne_prod')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Seuil rendement (%)"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={form.seuil_rendement}
            onChange={set('seuil_rendement')}
          />
          <Input
            label="Seuil perte alerte (%)"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={form.seuil_perte}
            onChange={set('seuil_perte')}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[--text-secondary] uppercase tracking-wider">Notes</label>
          <textarea
            className={cn(SELECT_CLASS, 'h-auto py-2 resize-none')}
            rows={3}
            placeholder="Observations, instructions particulières…"
            value={form.notes}
            onChange={set('notes')}
          />
        </div>
      </form>
    </Modal>
  )
}
