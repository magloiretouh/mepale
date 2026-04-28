/**
 * MEPALE ERP — Page Fournisseurs
 * Liste, recherche, filtres + actions : créer / modifier / blacklister / réactiver / voir fiche
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Building2,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Filter,
  Edit2,
  X,
  RotateCcw,
  Zap,
  PenLine,
  ExternalLink,
  Star,
  TrendingUp,
} from 'lucide-react'

import {
  logistiqueApi,
  type Fournisseur,
  type CategorieFournisseur,
  type QualificationFournisseur,
} from '@/services/logistique'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

// ─── Design tokens ──────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORIES: Record<CategorieFournisseur, string> = {
  mp:   'Matières premières',
  serv: 'Services',
  immo: 'Immobilisations',
  gen:  'Général',
}

const CATEGORIE_OPTIONS: { value: CategorieFournisseur; label: string }[] = [
  { value: 'mp',   label: 'Matières premières' },
  { value: 'serv', label: 'Services' },
  { value: 'immo', label: 'Immobilisations' },
  { value: 'gen',  label: 'Général' },
]

const QUALIFICATION_OPTIONS: { value: QualificationFournisseur; label: string }[] = [
  { value: 'en_evaluation', label: 'En évaluation' },
  { value: 'approuve',      label: 'Approuvé' },
  { value: 'suspendu',      label: 'Suspendu' },
  { value: 'blackliste',    label: 'Blacklisté' },
]

const QUALIFICATION_COLORS: Record<QualificationFournisseur, { bg: string; text: string; dot: string }> = {
  en_evaluation: { bg: 'var(--status-warning-bg)',  text: 'var(--status-warning)',  dot: 'var(--status-warning)' },
  approuve:      { bg: 'var(--status-success-bg)',  text: 'var(--status-success)',  dot: 'var(--status-success)' },
  suspendu:      { bg: 'var(--bg-elevated)',         text: 'var(--text-secondary)',  dot: 'var(--text-muted)'     },
  blackliste:    { bg: 'var(--status-danger-bg)',   text: 'var(--status-danger)',   dot: 'var(--status-danger)'  },
}

function QualificationBadge({ q, label }: { q: QualificationFournisseur; label: string }) {
  const c = QUALIFICATION_COLORS[q] ?? QUALIFICATION_COLORS.en_evaluation
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
      {label}
    </span>
  )
}

function FournisseurStatut({ f }: { f: Fournisseur }) {
  if (f.blackliste) return <Badge variant="danger">Blacklisté</Badge>
  if (!f.actif)     return <Badge variant="neutral">Inactif</Badge>
  return <Badge variant="success">Actif</Badge>
}

function KpiChip({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold font-data"
      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
      title={label}
    >
      <Star size={8} style={{ color: 'var(--accent)' }} />
      {value}
    </span>
  )
}

// ─── Types de formulaire ──────────────────────────────────────────────────────

interface FournisseurForm {
  raison_sociale:      string
  code:                string
  categorie:           CategorieFournisseur
  qualification:       QualificationFournisseur
  nif:                 string
  telephone:           string
  email:               string
  adresse:             string
  ville:               string
  pays:                string
  delai_livraison:     string
  conditions_paiement: string
  banque:              string
  rib:                 string
  notes:               string
}

const EMPTY_FORM: FournisseurForm = {
  raison_sociale:      '',
  code:                '',
  categorie:           'gen',
  qualification:       'en_evaluation',
  nif:                 '',
  telephone:           '',
  email:               '',
  adresse:             '',
  ville:               'Lomé',
  pays:                'Togo',
  delai_livraison:     '7',
  conditions_paiement: '',
  banque:              '',
  rib:                 '',
  notes:               '',
}

// ─── Modal Création / Édition ─────────────────────────────────────────────────

function FournisseurModal({
  initial,
  onClose,
  onSave,
  isPending,
}: {
  initial?: Fournisseur
  onClose: () => void
  onSave: (data: Partial<Fournisseur>) => void
  isPending: boolean
}) {
  const [codeMode, setCodeMode] = useState<'auto' | 'manuel'>(initial ? 'manuel' : 'auto')

  const [form, setForm] = useState<FournisseurForm>(() =>
    initial
      ? {
          raison_sociale:      initial.raison_sociale,
          code:                initial.code,
          categorie:           initial.categorie,
          qualification:       initial.qualification,
          nif:                 initial.nif,
          telephone:           initial.telephone,
          email:               initial.email,
          adresse:             initial.adresse,
          ville:               initial.ville,
          pays:                initial.pays,
          delai_livraison:     String(initial.delai_livraison),
          conditions_paiement: initial.conditions_paiement,
          banque:              initial.banque,
          rib:                 initial.rib,
          notes:               initial.notes,
        }
      : EMPTY_FORM,
  )

  // Charger le prochain code depuis le serveur (uniquement en création, mode auto)
  const { data: prochainCodeData, refetch: refetchCode, isFetching: isLoadingCode } = useQuery({
    queryKey: ['fournisseur-prochain-code'],
    queryFn: () => logistiqueApi.prochainCodeFournisseur(),
    select: (r) => r.data.code,
    enabled: !initial,
  })

  useEffect(() => {
    if (!initial && codeMode === 'auto' && prochainCodeData) {
      setForm((f) => ({ ...f, code: prochainCodeData }))
    }
  }, [prochainCodeData, codeMode, initial])

  const set = (field: keyof FournisseurForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = () => {
    if (!form.raison_sociale.trim()) { toast.error('La raison sociale est obligatoire'); return }
    if (!form.code.trim())           { toast.error('Le code est obligatoire'); return }
    onSave({
      ...form,
      delai_livraison: Number(form.delai_livraison) || 7,
    })
  }

  const isEdit = !!initial

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-2xl rounded-lg animate-scale-in flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-dim)' }}
            >
              <Building2 size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">
                {isEdit ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
              </h3>
              <p className="text-xs text-[--text-muted]">
                {isEdit ? initial!.raison_sociale : 'Renseignez les informations du fournisseur'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* Section Identité */}
            <div>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Identité
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>
                    Raison sociale <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <Input
                    value={form.raison_sociale}
                    onChange={set('raison_sociale')}
                    placeholder="Ex : SOPROGI SARL"
                    autoFocus
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={FIELD_LABEL}>
                      Code <span style={{ color: 'var(--status-danger)' }}>*</span>
                    </label>
                    {!initial && (
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
                              if (m === 'auto' && prochainCodeData) {
                                setForm((f) => ({ ...f, code: prochainCodeData }))
                              }
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold transition-all"
                            style={codeMode === m
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
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      value={isLoadingCode && codeMode === 'auto' ? '...' : form.code}
                      readOnly={codeMode === 'auto' && !initial}
                      onChange={(e) => {
                        if (codeMode === 'auto' && !initial) return
                        setForm((f) => ({ ...f, code: e.target.value }))
                      }}
                      placeholder="Ex : FOUR-0001"
                      className="font-data"
                      style={codeMode === 'auto' && !initial
                        ? { backgroundColor: 'var(--bg-elevated)', cursor: 'default', opacity: 0.8 }
                        : {}
                      }
                    />
                    {codeMode === 'auto' && !initial && (
                      <button
                        type="button"
                        title="Régénérer le code"
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
                </div>
                <div>
                  <label className={FIELD_LABEL}>Catégorie</label>
                  <select
                    className={SELECT_CLASS}
                    style={{ height: '36px' }}
                    value={form.categorie}
                    onChange={set('categorie')}
                  >
                    {CATEGORIE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>Qualification</label>
                  <select
                    className={SELECT_CLASS}
                    style={{ height: '36px' }}
                    value={form.qualification}
                    onChange={set('qualification')}
                  >
                    {QUALIFICATION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>NIF Togo</label>
                  <Input
                    value={form.nif}
                    onChange={set('nif')}
                    placeholder="Ex : 1234567890"
                    className="font-data"
                  />
                </div>
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Section Contact */}
            <div>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Contact principal
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={FIELD_LABEL}>Téléphone</label>
                  <Input value={form.telephone} onChange={set('telephone')} placeholder="+228 90 00 00 00" />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Email</label>
                  <Input value={form.email} onChange={set('email')} type="email" placeholder="contact@example.com" />
                </div>
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Adresse</label>
                  <textarea
                    value={form.adresse}
                    onChange={set('adresse')}
                    placeholder="Rue, quartier…"
                    rows={2}
                    className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Ville</label>
                  <Input value={form.ville} onChange={set('ville')} placeholder="Lomé" />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Pays</label>
                  <Input value={form.pays} onChange={set('pays')} placeholder="Togo" />
                </div>
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Section Conditions commerciales */}
            <div>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Conditions commerciales
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={FIELD_LABEL}>Délai livraison (jours)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.delai_livraison}
                    onChange={set('delai_livraison')}
                    className="font-data"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Conditions de paiement</label>
                  <Input value={form.conditions_paiement} onChange={set('conditions_paiement')} placeholder="Ex : 30 jours net" />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Banque</label>
                  <Input value={form.banque} onChange={set('banque')} placeholder="Ex : Ecobank Togo" />
                </div>
                <div>
                  <label className={FIELD_LABEL}>RIB</label>
                  <Input value={form.rib} onChange={set('rib')} placeholder="IBAN / RIB" className="font-data" />
                </div>
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Notes */}
            <div>
              <label className={FIELD_LABEL}>Notes internes</label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                placeholder="Commentaires, spécificités du fournisseur…"
                rows={3}
                className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>
            {isEdit ? 'Enregistrer' : 'Créer le fournisseur'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modale Blacklist ─────────────────────────────────────────────────────────

function BlacklistModal({
  fournisseur,
  onClose,
  onConfirm,
}: {
  fournisseur: Fournisseur
  onClose: () => void
  onConfirm: (raison: string) => void
}) {
  const [raison, setRaison] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-lg p-6 animate-scale-in"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--status-danger-bg)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--status-danger)' }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[--text-primary]">Blacklister le fournisseur</h3>
            <p className="text-xs text-[--text-muted]">{fournisseur.raison_sociale}</p>
          </div>
        </div>
        <p className="text-xs text-[--text-secondary] mb-4">
          Ce fournisseur ne pourra plus être sélectionné pour de nouveaux bons de commande.
        </p>
        <div className="mb-4">
          <label className={cn(FIELD_LABEL, 'mb-1.5')}>
            Raison <span style={{ color: 'var(--status-danger)' }}>*</span>
          </label>
          <textarea
            value={raison}
            onChange={(e) => setRaison(e.target.value)}
            placeholder="Qualité insuffisante, délais non respectés…"
            rows={3}
            className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="danger" size="sm" disabled={!raison.trim()} onClick={() => onConfirm(raison.trim())}>
            Blacklister
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Menu actions par ligne ───────────────────────────────────────────────────

function ActionMenu({
  fournisseur,
  onEdit,
  onBlacklist,
  onReactiver,
  onView,
}: {
  fournisseur: Fournisseur
  onEdit: () => void
  onBlacklist: () => void
  onReactiver: () => void
  onView: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current)
      setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  const item = (label: string, icon: React.ReactNode, onClick: () => void, danger?: boolean) => (
    <button
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
        danger
          ? 'hover:bg-[--status-danger-bg]'
          : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
      )}
      style={danger ? { color: 'var(--status-danger)' } : {}}
      onClick={() => { setOpen(false); onClick() }}
    >
      {icon}
      {label}
    </button>
  )

  const dropdown = rect && open && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
      <div
        className="rounded-md py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position:        'fixed',
          top:    rect.bottom + 200 < window.innerHeight ? rect.bottom + 4 : undefined,
          bottom: rect.bottom + 200 < window.innerHeight ? undefined : window.innerHeight - rect.top + 4,
          left:            rect.right - 192,
          width:           192,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {item('Voir la fiche', <ExternalLink size={13} style={{ color: 'var(--accent)' }} />, onView)}
        {item('Modifier', <Edit2 size={13} />, onEdit)}
        <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
        {fournisseur.blackliste
          ? item('Réactiver', <CheckCircle2 size={13} style={{ color: 'var(--status-success)' }} />, onReactiver)
          : item('Blacklister', <XCircle size={13} />, onBlacklist, true)
        }
      </div>
    </>,
    document.body
  )

  return (
    <>
      {dropdown}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="w-7 h-7 rounded flex items-center justify-center text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
      >
        <MoreHorizontal size={14} />
      </button>
    </>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

type FiltreStatut = 'tous' | 'actif' | 'blackliste' | 'inactif'

const FILTRES: { label: string; value: FiltreStatut }[] = [
  { label: 'Tous',        value: 'tous'      },
  { label: 'Actifs',      value: 'actif'     },
  { label: 'Blacklistés', value: 'blackliste' },
  { label: 'Inactifs',    value: 'inactif'   },
]

export function FournisseurList() {
  const navigate = useNavigate()
  const [search, setSearch]                   = useState('')
  const [filtre, setFiltre]                   = useState<FiltreStatut>('tous')
  const [showModal, setShowModal]             = useState(false)
  const [editTarget, setEditTarget]           = useState<Fournisseur | null>(null)
  const [blacklistTarget, setBlacklistTarget] = useState<Fournisseur | null>(null)

  const queryClient = useQueryClient()
  const invalidate  = () => queryClient.invalidateQueries({ queryKey: ['fournisseurs'] })

  const params: Record<string, string | boolean> = {}
  if (search)                params.search     = search
  if (filtre === 'actif')      { params.actif = true;  params.blackliste = false }
  if (filtre === 'blackliste') { params.blackliste = true }
  if (filtre === 'inactif')    { params.actif = false; params.blackliste = false }

  const { data, isLoading } = useQuery({
    queryKey: ['fournisseurs', search, filtre],
    queryFn:  () => logistiqueApi.listFournisseurs(params as any),
    select:   (r) => r.data,
  })

  const createMut = useMutation({
    mutationFn: (data: Partial<Fournisseur>) => logistiqueApi.createFournisseur(data),
    onSuccess: () => {
      toast.success('Fournisseur créé avec succès.')
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['fournisseur-prochain-code'] })
      setShowModal(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la création'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Fournisseur> }) =>
      logistiqueApi.updateFournisseur(id, data),
    onSuccess: () => {
      toast.success('Fournisseur mis à jour.')
      invalidate()
      setEditTarget(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la mise à jour'),
  })

  const blacklisterMut = useMutation({
    mutationFn: ({ id, raison }: { id: string; raison: string }) =>
      logistiqueApi.blacklisterFournisseur(id, raison),
    onSuccess: () => {
      toast.success('Fournisseur blacklisté.')
      invalidate()
      setBlacklistTarget(null)
    },
  })

  const reactiverMut = useMutation({
    mutationFn: (id: string) => logistiqueApi.reactiverFournisseur(id),
    onSuccess: () => {
      toast.success('Fournisseur réactivé.')
      invalidate()
    },
  })

  const fournisseurs = data?.results ?? []

  return (
    <>
      {/* Modals — hors animate-fade-in */}
      {showModal && (
        <FournisseurModal
          onClose={() => setShowModal(false)}
          onSave={(data) => createMut.mutate(data)}
          isPending={createMut.isPending}
        />
      )}
      {editTarget && (
        <FournisseurModal
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(data) => updateMut.mutate({ id: editTarget.id, data })}
          isPending={updateMut.isPending}
        />
      )}
      {blacklistTarget && (
        <BlacklistModal
          fournisseur={blacklistTarget}
          onClose={() => setBlacklistTarget(null)}
          onConfirm={(raison) => blacklisterMut.mutate({ id: blacklistTarget.id, raison })}
        />
      )}

      <div className="space-y-5 animate-fade-in">

        {/* ── En-tête standalone ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Fournisseurs</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">
              {data?.count ?? 0} fournisseur{(data?.count ?? 0) > 1 ? 's' : ''} enregistré{(data?.count ?? 0) > 1 ? 's' : ''}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowModal(true)}
          >
            Nouveau fournisseur
          </Button>
        </div>

        {/* Table card */}
        <div className="surface overflow-hidden">

        {/* ── Filtres ── */}
        <div
          className="flex items-center gap-3 px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-64">
            <Input
              placeholder="Rechercher un fournisseur…"
              icon={<Search size={13} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-[--text-muted] mr-1" />
            {FILTRES.map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltre(f.value)}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all',
                  filtre === f.value
                    ? 'text-[--accent]'
                    : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
                )}
                style={
                  filtre === f.value
                    ? { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                    : { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        <div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr
                className="text-left"
                style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}
              >
                {['Code', 'Raison Sociale', 'Catégorie', 'Qualification', 'Contact', 'KPIs (12m)', 'Statut', ''].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap"
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
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-6 py-5">
                          <div className="skeleton h-4 rounded" style={{ width: `${60 + j * 8}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : fournisseurs.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <Building2 size={32} className="mx-auto mb-3 text-[--text-muted]" />
                      <p className="text-sm text-[--text-secondary]">Aucun fournisseur trouvé</p>
                      <p className="text-xs text-[--text-muted] mt-1">
                        Créez votre premier fournisseur en cliquant sur « Nouveau fournisseur »
                      </p>
                    </td>
                  </tr>
                )
                : fournisseurs.map((f) => (
                  <tr
                    key={f.id}
                    className="group hover:bg-[--bg-elevated] transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onClick={() => navigate(`/logistique/fournisseurs/${f.id}`)}
                  >
                    {/* Code */}
                    <td className="px-6 py-5">
                      <span className="font-data text-xs font-semibold text-[--accent]">{f.code}</span>
                    </td>

                    {/* Raison sociale */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                        >
                          {f.raison_sociale.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[--text-primary]">{f.raison_sociale}</p>
                          {f.blackliste && f.motif_blacklist && (
                            <p className="text-[10px] truncate max-w-[180px]" style={{ color: 'var(--status-danger)' }}>
                              {f.motif_blacklist}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Catégorie */}
                    <td className="px-6 py-5">
                      <span className="text-xs text-[--text-secondary]">
                        {CATEGORIES[f.categorie] ?? f.categorie_label}
                      </span>
                    </td>

                    {/* Qualification */}
                    <td className="px-6 py-5">
                      <QualificationBadge q={f.qualification} label={f.qualification_label} />
                    </td>

                    {/* Contact */}
                    <td className="px-6 py-5">
                      <div className="space-y-0.5">
                        {f.telephone && (
                          <div className="flex items-center gap-1.5 text-xs text-[--text-secondary]">
                            <Phone size={10} className="text-[--text-muted]" />
                            {f.telephone}
                          </div>
                        )}
                        {f.email && (
                          <div className="flex items-center gap-1.5 text-xs text-[--text-secondary]">
                            <Mail size={10} className="text-[--text-muted]" />
                            {f.email}
                          </div>
                        )}
                        {!f.telephone && !f.email && (
                          <span className="text-xs text-[--text-muted]">—</span>
                        )}
                      </div>
                    </td>

                    {/* KPIs 12m */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {f.note_qualite_moy !== null && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold font-data"
                            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                            title="Note qualité (12 mois)"
                          >
                            <Star size={8} style={{ color: 'var(--status-warning)' }} />
                            {f.note_qualite_moy}
                          </span>
                        )}
                        {f.taux_otd !== null && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold font-data"
                            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                            title="OTD — Taux de livraison à temps (12 mois)"
                          >
                            <TrendingUp size={8} style={{ color: 'var(--status-success)' }} />
                            {f.taux_otd}%
                          </span>
                        )}
                        {f.note_qualite_moy === null && f.taux_otd === null && (
                          <span className="text-[10px] text-[--text-muted]">—</span>
                        )}
                      </div>
                    </td>

                    {/* Statut */}
                    <td className="px-6 py-5">
                      <FournisseurStatut f={f} />
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-5">
                      <ActionMenu
                        fournisseur={f}
                        onEdit={() => setEditTarget(f)}
                        onBlacklist={() => setBlacklistTarget(f)}
                        onReactiver={() => reactiverMut.mutate(f.id)}
                        onView={() => navigate(`/logistique/fournisseurs/${f.id}`)}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </>
  )
}
