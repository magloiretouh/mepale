/**
 * MEPALE ERP — Modal création / édition d'un client
 * Composant partagé : utilisé par ClientList (création) et ClientDetail (édition).
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UserRound, X } from 'lucide-react'

import {
  commercialApi,
  type Client,
  type ClientCreatePayload,
  type ModePaiementClient,
  type TypeClient,
} from '@/services/commercial'
import { rhApi } from '@/services/rh'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

// ─── Design tokens locaux ─────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL =
  'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

const MODE_PAIEMENT_OPTIONS: { value: ModePaiementClient; label: string }[] = [
  { value: 'comptant',     label: 'Comptant'          },
  { value: '30j',          label: '30 jours'          },
  { value: '60j',          label: '60 jours'          },
  { value: 'virement',     label: 'Virement bancaire' },
  { value: 'cheque',       label: 'Chèque'            },
  { value: 'mobile_money', label: 'Mobile Money'      },
]

// ─── État du formulaire ────────────────────────────────────────────────────────

interface ClientForm {
  raison_sociale:      string
  type:                TypeClient
  categorie:           string
  secteur_activite:    string
  telephone:           string
  email:               string
  adresse_facturation: string
  adresse_livraison:   string
  nif:                 string
  rccm:                string
  numero_contribuable: string
  delai_paiement:      string
  mode_paiement:       ModePaiementClient
  plafond_credit:      string
  commercial:          string
  notes:               string
}

const EMPTY_FORM: ClientForm = {
  raison_sociale:      '',
  type:                'entreprise',
  categorie:           '',
  secteur_activite:    '',
  telephone:           '',
  email:               '',
  adresse_facturation: '',
  adresse_livraison:   '',
  nif:                 '',
  rccm:                '',
  numero_contribuable: '',
  delai_paiement:      '30',
  mode_paiement:       'comptant',
  plafond_credit:      '',
  commercial:          '',
  notes:               '',
}

function clientToForm(c: Client): ClientForm {
  return {
    raison_sociale:      c.raison_sociale,
    type:                c.type,
    categorie:           c.categorie ?? '',
    secteur_activite:    c.secteur_activite,
    telephone:           c.telephone,
    email:               c.email,
    adresse_facturation: c.adresse_facturation,
    adresse_livraison:   c.adresse_livraison,
    nif:                 c.nif,
    rccm:                c.rccm,
    numero_contribuable: c.numero_contribuable,
    delai_paiement:      String(c.delai_paiement),
    mode_paiement:       c.mode_paiement,
    plafond_credit:      c.plafond_credit ?? '',
    commercial:          c.commercial != null ? String(c.commercial) : '',
    notes:               c.notes,
  }
}

function formToPayload(f: ClientForm): ClientCreatePayload {
  return {
    raison_sociale:       f.raison_sociale,
    type:                 f.type,
    categorie:            f.categorie || null,
    secteur_activite:     f.secteur_activite,
    telephone:            f.telephone,
    email:                f.email,
    adresse_facturation:  f.adresse_facturation,
    adresse_livraison:    f.adresse_livraison,
    nif:                  f.nif,
    rccm:                 f.rccm,
    numero_contribuable:  f.numero_contribuable,
    delai_paiement:       Number(f.delai_paiement) || 30,
    mode_paiement:        f.mode_paiement,
    plafond_credit:       f.plafond_credit ? Number(f.plafond_credit) : null,
    commercial:           f.commercial ? Number(f.commercial) : null,
    notes:                f.notes,
  }
}

// ─── Composant ────────────────────────────────────────────────────────────────

export interface ClientFormModalProps {
  mode:         'create' | 'edit'
  initialData?: Client
  onClose:      () => void
  onSave:       (data: ClientCreatePayload) => void
  isPending:    boolean
}

export function ClientFormModal({
  mode,
  initialData,
  onClose,
  onSave,
  isPending,
}: ClientFormModalProps) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState<ClientForm>(() =>
    initialData ? clientToForm(initialData) : EMPTY_FORM
  )

  const set = (field: keyof ClientForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  // Catégories client
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-client'],
    queryFn:  () => commercialApi.listCategories().then((r) => r.data.results ?? []),
  })

  // Employés actifs (commerciaux référents)
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-actifs'],
    queryFn:  () => rhApi.listEmployees({ active: 1 }).then((r) => r.data),
  })

  const handleSubmit = () => {
    if (!form.raison_sociale.trim()) {
      toast.error('La raison sociale est obligatoire')
      return
    }
    onSave(formToPayload(form))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />

      <div
        className="relative z-10 w-full max-w-2xl rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
          maxHeight:       '90vh',
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-dim)' }}
            >
              <UserRound size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">
                {isEdit
                  ? `Modifier — ${initialData?.raison_sociale}`
                  : 'Nouveau client'}
              </h3>
              <p className="text-xs text-[--text-muted]">
                {isEdit
                  ? 'Modifiez les informations du client'
                  : 'Renseignez les informations du client'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 rounded"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-6">

            {/* Identité */}
            <section>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Identité
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>
                    Raison sociale / Nom{' '}
                    <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <Input
                    value={form.raison_sociale}
                    onChange={set('raison_sociale')}
                    placeholder="Ex : SOPROGI SARL"
                    autoFocus={!isEdit}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Type</label>
                  <select
                    className={SELECT_CLASS}
                    style={{ height: '36px' }}
                    value={form.type}
                    onChange={set('type')}
                  >
                    <option value="entreprise">Entreprise</option>
                    <option value="particulier">Particulier</option>
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>Catégorie</label>
                  <select
                    className={SELECT_CLASS}
                    style={{ height: '36px' }}
                    value={form.categorie}
                    onChange={set('categorie')}
                  >
                    <option value="">— Aucune —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.libelle}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Secteur d'activité</label>
                  <Input
                    value={form.secteur_activite}
                    onChange={set('secteur_activite')}
                    placeholder="Ex : Commerce général, BTP, Agroalimentaire…"
                  />
                </div>
              </div>
            </section>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Identité fiscale */}
            <section>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Identité fiscale
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={FIELD_LABEL}>NIF</label>
                  <Input
                    value={form.nif}
                    onChange={set('nif')}
                    placeholder="TG-123456"
                    className="font-data"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>RCCM</label>
                  <Input
                    value={form.rccm}
                    onChange={set('rccm')}
                    placeholder="TG-LOM-2024-B-0001"
                    className="font-data"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>N° Contribuable</label>
                  <Input
                    value={form.numero_contribuable}
                    onChange={set('numero_contribuable')}
                    placeholder="TG00000123"
                    className="font-data"
                  />
                </div>
              </div>
            </section>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Contact & adresses */}
            <section>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Contact &amp; adresses
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={FIELD_LABEL}>Téléphone</label>
                  <Input
                    value={form.telephone}
                    onChange={set('telephone')}
                    placeholder="+228 90 00 00 00"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Email</label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="client@example.com"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Adresse de facturation</label>
                  <textarea
                    value={form.adresse_facturation}
                    onChange={set('adresse_facturation')}
                    placeholder="Rue, quartier, ville…"
                    rows={2}
                    className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>
                    Adresse de livraison{' '}
                    <span className="font-normal normal-case text-[--text-muted]">
                      (si différente)
                    </span>
                  </label>
                  <textarea
                    value={form.adresse_livraison}
                    onChange={set('adresse_livraison')}
                    placeholder="Laisser vide pour utiliser l'adresse de facturation"
                    rows={2}
                    className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
                  />
                </div>
              </div>
            </section>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Conditions commerciales */}
            <section>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Conditions commerciales
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={FIELD_LABEL}>Mode de paiement</label>
                  <select
                    className={SELECT_CLASS}
                    style={{ height: '36px' }}
                    value={form.mode_paiement}
                    onChange={set('mode_paiement')}
                  >
                    {MODE_PAIEMENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>Délai de paiement (jours)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.delai_paiement}
                    onChange={set('delai_paiement')}
                    className="font-data"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Plafond de crédit (FCFA)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.plafond_credit}
                    onChange={set('plafond_credit')}
                    placeholder="Illimité si vide"
                    className="font-data"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Commercial référent</label>
                  <select
                    className={SELECT_CLASS}
                    style={{ height: '36px' }}
                    value={form.commercial}
                    onChange={set('commercial')}
                  >
                    <option value="">— Non assigné —</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Notes */}
            <section>
              <label className={FIELD_LABEL}>Notes internes</label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                placeholder="Spécificités, observations, conditions particulières…"
                rows={2}
                className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
              />
            </section>

          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>
            {isEdit ? 'Enregistrer les modifications' : 'Créer le client'}
          </Button>
        </div>
      </div>
    </div>
  )
}
