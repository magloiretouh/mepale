/**
 * MEPALE ERP — Fiche Fournisseur
 * Vue détaillée : KPIs, onglets Contacts / Catalogue articles / Contrats / Évaluations
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  Star,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Users,
  Package,
  FileText,
  ClipboardList,
  Plus,
  Edit2,
  Trash2,
  X,
  CreditCard,
  Clock,
  Award,
  BadgeCheck,
  ShieldAlert,
  ShieldOff,
  Ban,
} from 'lucide-react'

import {
  logistiqueApi,
  type Fournisseur,
  type ContactFournisseur,
  type FournisseurArticle,
  type ContratFournisseur,
  type QualificationFournisseur,
  type TypeContrat,
} from '@/services/logistique'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

// ─── Design tokens ──────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUALIFICATION_META: Record<QualificationFournisseur, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  en_evaluation: {
    label: 'En évaluation',
    color: 'var(--status-warning)',
    bg:    'var(--status-warning-bg)',
    icon:  <Clock size={12} />,
  },
  approuve: {
    label: 'Approuvé',
    color: 'var(--status-success)',
    bg:    'var(--status-success-bg)',
    icon:  <BadgeCheck size={12} />,
  },
  suspendu: {
    label: 'Suspendu',
    color: 'var(--text-secondary)',
    bg:    'var(--bg-elevated)',
    icon:  <ShieldAlert size={12} />,
  },
  blackliste: {
    label: 'Blacklisté',
    color: 'var(--status-danger)',
    bg:    'var(--status-danger-bg)',
    icon:  <Ban size={12} />,
  },
}

const TYPE_CONTRAT_OPTIONS: { value: TypeContrat; label: string }[] = [
  { value: 'cadre',       label: 'Contrat-cadre' },
  { value: 'exclusivite', label: 'Exclusivité' },
  { value: 'annuel',      label: 'Accord annuel' },
  { value: 'ponctuel',    label: 'Achat ponctuel' },
]

function fmt(n: number | null, suffix = '') {
  if (n === null) return '—'
  return `${n.toLocaleString('fr-FR')}${suffix}`
}

function fmtFcfa(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 })
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  color,
  suffix = '',
}: {
  label: string
  value: number | null
  icon: React.ReactNode
  color: string
  suffix?: string
}) {
  const display = value === null ? '—' : `${value}${suffix}`
  return (
    <div
      className="flex flex-col gap-1.5 p-4 rounded-lg"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <span className="text-xl font-bold font-data" style={{ color: value === null ? 'var(--text-muted)' : 'var(--text-primary)' }}>
        {display}
      </span>
    </div>
  )
}

// ─── Onglets ──────────────────────────────────────────────────────────────────

type Tab = 'contacts' | 'articles' | 'contrats' | 'evaluations'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'contacts',    label: 'Contacts',    icon: <Users size={13} /> },
  { id: 'articles',   label: 'Catalogue',   icon: <Package size={13} /> },
  { id: 'contrats',   label: 'Contrats',    icon: <FileText size={13} /> },
  { id: 'evaluations', label: 'Évaluations', icon: <ClipboardList size={13} /> },
]

// ─── Modal Contact ─────────────────────────────────────────────────────────────

interface ContactForm {
  nom: string; role: string; telephone: string; email: string
  principal: boolean; notes: string
}

const EMPTY_CONTACT: ContactForm = { nom: '', role: '', telephone: '', email: '', principal: false, notes: '' }

function ContactModal({
  fournisseurId,
  initial,
  onClose,
  onSave,
  isPending,
}: {
  fournisseurId: string
  initial?: ContactFournisseur
  onClose: () => void
  onSave: (data: Partial<ContactFournisseur>) => void
  isPending: boolean
}) {
  const [form, setForm] = useState<ContactForm>(
    initial
      ? { nom: initial.nom, role: initial.role, telephone: initial.telephone, email: initial.email, principal: initial.principal, notes: initial.notes }
      : EMPTY_CONTACT,
  )
  const set = (field: keyof ContactForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }))

  const handleSave = () => {
    if (!form.nom.trim()) { toast.error('Le nom est obligatoire'); return }
    onSave({ ...form, fournisseur: fournisseurId })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-lg flex flex-col overflow-hidden animate-scale-in"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold text-[--text-primary]">
            {initial ? 'Modifier le contact' : 'Nouveau contact'}
          </h3>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1"><X size={14} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className={FIELD_LABEL}>Nom complet <span style={{ color: 'var(--status-danger)' }}>*</span></label>
              <Input value={form.nom} onChange={set('nom')} placeholder="Jean Dupont" autoFocus />
            </div>
            <div>
              <label className={FIELD_LABEL}>Rôle / Fonction</label>
              <Input value={form.role} onChange={set('role')} placeholder="Commercial, Directeur…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL}>Téléphone</label>
                <Input value={form.telephone} onChange={set('telephone')} placeholder="+228 90 00 00 00" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Email</label>
                <Input value={form.email} onChange={set('email')} type="email" placeholder="j.dupont@…" />
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL}>Notes</label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={2}
                className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
                placeholder="Informations complémentaires…"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.principal}
                onChange={(e) => setForm((p) => ({ ...p, principal: e.target.checked }))}
                className="accent-[--accent] w-3.5 h-3.5"
              />
              <span className="text-xs text-[--text-secondary]">Contact principal</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSave}>
            {initial ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Article Fournisseur ────────────────────────────────────────────────

interface ArticleFForm {
  article: string; reference_fournisseur: string
  prix_unitaire: string; delai_livraison: string; quantite_min_commande: string
  actif: boolean; notes: string
}

const EMPTY_AF: ArticleFForm = {
  article: '', reference_fournisseur: '', prix_unitaire: '', delai_livraison: '7', quantite_min_commande: '1', actif: true, notes: '',
}

function ArticleFournisseurModal({
  fournisseurId,
  initial,
  onClose,
  onSave,
  isPending,
}: {
  fournisseurId: string
  initial?: FournisseurArticle
  onClose: () => void
  onSave: (data: Partial<FournisseurArticle>) => void
  isPending: boolean
}) {
  const [form, setForm] = useState<ArticleFForm>(
    initial
      ? {
          article:               initial.article,
          reference_fournisseur: initial.reference_fournisseur,
          prix_unitaire:         String(initial.prix_unitaire),
          delai_livraison:       String(initial.delai_livraison),
          quantite_min_commande: String(initial.quantite_min_commande),
          actif:                 initial.actif,
          notes:                 initial.notes,
        }
      : EMPTY_AF,
  )
  const set = (field: keyof ArticleFForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }))

  const { data: articlesData } = useQuery({
    queryKey: ['articles-list'],
    queryFn: () => import('@/services/production').then((m) => m.productionApi.listArticles({ peut_etre_achete: true, page_size: 500 })),
    select: (r) => r.data.results,
    staleTime: 60_000,
  })

  const handleSave = () => {
    if (!form.article) { toast.error("Sélectionnez un article"); return }
    if (!form.prix_unitaire) { toast.error("Le prix est obligatoire"); return }
    onSave({
      ...form,
      fournisseur:           fournisseurId,
      prix_unitaire:         parseFloat(form.prix_unitaire),
      delai_livraison:       parseInt(form.delai_livraison, 10) || 7,
      quantite_min_commande: parseFloat(form.quantite_min_commande) || 1,
    } as any)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-lg flex flex-col overflow-hidden animate-scale-in"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold text-[--text-primary]">
            {initial ? 'Modifier l\'article fournisseur' : 'Ajouter un article au catalogue'}
          </h3>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1"><X size={14} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-4">
            {!initial && (
              <div>
                <label className={FIELD_LABEL}>Article <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                <select
                  className={SELECT_CLASS}
                  style={{ height: '36px' }}
                  value={form.article}
                  onChange={(e) => setForm((p) => ({ ...p, article: e.target.value }))}
                >
                  <option value="">-- Sélectionner un article --</option>
                  {(articlesData ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.designation} ({a.code})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={FIELD_LABEL}>Référence fournisseur</label>
              <Input
                value={form.reference_fournisseur}
                onChange={set('reference_fournisseur')}
                placeholder="Réf. interne du fournisseur"
                className="font-data"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL}>Prix unitaire (FCFA) <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                <Input value={form.prix_unitaire} onChange={set('prix_unitaire')} type="number" min={0} className="font-data" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Délai livraison (j)</label>
                <Input value={form.delai_livraison} onChange={set('delai_livraison')} type="number" min={0} className="font-data" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Qté min. commande</label>
                <Input value={form.quantite_min_commande} onChange={set('quantite_min_commande')} type="number" min={0} step={0.001} className="font-data" />
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL}>Notes</label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={2}
                className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
                placeholder="Conditions spéciales…"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm((p) => ({ ...p, actif: e.target.checked }))} className="accent-[--accent] w-3.5 h-3.5" />
              <span className="text-xs text-[--text-secondary]">Actif (disponible à la commande)</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSave}>
            {initial ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Contrat ─────────────────────────────────────────────────────────────

interface ContratForm {
  reference: string; type_contrat: TypeContrat
  date_debut: string; date_fin: string
  montant_max: string; actif: boolean; description: string
}

const EMPTY_CONTRAT: ContratForm = {
  reference: '', type_contrat: 'cadre', date_debut: '', date_fin: '', montant_max: '', actif: true, description: '',
}

function ContratModal({
  fournisseurId,
  initial,
  onClose,
  onSave,
  isPending,
}: {
  fournisseurId: string
  initial?: ContratFournisseur
  onClose: () => void
  onSave: (data: Partial<ContratFournisseur>) => void
  isPending: boolean
}) {
  const [form, setForm] = useState<ContratForm>(
    initial
      ? {
          reference:    initial.reference,
          type_contrat: initial.type_contrat,
          date_debut:   initial.date_debut,
          date_fin:     initial.date_fin ?? '',
          montant_max:  initial.montant_max !== null ? String(initial.montant_max) : '',
          actif:        initial.actif,
          description:  initial.description,
        }
      : EMPTY_CONTRAT,
  )
  const set = (field: keyof ContratForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }))

  const handleSave = () => {
    if (!form.reference.trim()) { toast.error('La référence est obligatoire'); return }
    if (!form.date_debut)       { toast.error('La date de début est obligatoire'); return }
    onSave({
      ...form,
      fournisseur: fournisseurId,
      date_fin:    form.date_fin   || null,
      montant_max: form.montant_max ? parseFloat(form.montant_max) : null,
    } as any)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-lg flex flex-col overflow-hidden animate-scale-in"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold text-[--text-primary]">
            {initial ? 'Modifier le contrat' : 'Nouveau contrat'}
          </h3>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1"><X size={14} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL}>Référence <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                <Input value={form.reference} onChange={set('reference')} placeholder="CTR-2026-001" className="font-data" autoFocus />
              </div>
              <div>
                <label className={FIELD_LABEL}>Type</label>
                <select className={SELECT_CLASS} style={{ height: '36px' }} value={form.type_contrat} onChange={set('type_contrat')}>
                  {TYPE_CONTRAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={FIELD_LABEL}>Date de début <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                <Input value={form.date_debut} onChange={set('date_debut')} type="date" className="font-data" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Date de fin</label>
                <Input value={form.date_fin} onChange={set('date_fin')} type="date" className="font-data" />
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL}>Montant maximum (FCFA)</label>
              <Input value={form.montant_max} onChange={set('montant_max')} type="number" min={0} placeholder="Laisser vide si illimité" className="font-data" />
            </div>
            <div>
              <label className={FIELD_LABEL}>Description / Conditions</label>
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={3}
                className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
                placeholder="Termes du contrat, modalités…"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm((p) => ({ ...p, actif: e.target.checked }))} className="accent-[--accent] w-3.5 h-3.5" />
              <span className="text-xs text-[--text-secondary]">Contrat actif</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSave}>
            {initial ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Onglet Contacts ──────────────────────────────────────────────────────────

function TabContacts({ fournisseurId }: { fournisseurId: string }) {
  const [showModal, setShowModal]   = useState(false)
  const [editTarget, setEditTarget] = useState<ContactFournisseur | null>(null)
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['contacts', fournisseurId] })

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', fournisseurId],
    queryFn: () => logistiqueApi.listContacts(fournisseurId),
    select: (r) => r.data.results,
  })

  const createMut = useMutation({
    mutationFn: (d: Partial<ContactFournisseur> & { fournisseur: string }) => logistiqueApi.createContact(d),
    onSuccess: () => { toast.success('Contact ajouté.'); inv(); setShowModal(false) },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<ContactFournisseur> }) => logistiqueApi.updateContact(id, d),
    onSuccess: () => { toast.success('Contact mis à jour.'); inv(); setEditTarget(null) },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => logistiqueApi.deleteContact(id),
    onSuccess: () => { toast.success('Contact supprimé.'); inv() },
  })

  const contacts = data ?? []

  return (
    <>
      {showModal && (
        <ContactModal
          fournisseurId={fournisseurId}
          onClose={() => setShowModal(false)}
          onSave={(d) => createMut.mutate(d as any)}
          isPending={createMut.isPending}
        />
      )}
      {editTarget && (
        <ContactModal
          fournisseurId={fournisseurId}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(d) => updateMut.mutate({ id: editTarget.id, d })}
          isPending={updateMut.isPending}
        />
      )}

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-[--text-muted]">{contacts.length} contact{contacts.length > 1 ? 's' : ''}</p>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowModal(true)}>
            Ajouter
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-lg" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-12">
            <Users size={28} className="mx-auto mb-2 text-[--text-muted]" />
            <p className="text-sm text-[--text-secondary]">Aucun contact enregistré</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-3 p-4 rounded-lg"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                >
                  {c.nom.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[--text-primary]">{c.nom}</span>
                    {c.principal && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                        style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                      >Principal</span>
                    )}
                  </div>
                  {c.role && <p className="text-[10px] text-[--text-muted] mt-0.5">{c.role}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {c.telephone && (
                      <span className="flex items-center gap-1 text-xs text-[--text-secondary]">
                        <Phone size={9} className="text-[--text-muted]" /> {c.telephone}
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1 text-xs text-[--text-secondary]">
                        <Mail size={9} className="text-[--text-muted]" /> {c.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditTarget(c)}
                    className="w-7 h-7 rounded flex items-center justify-center text-[--text-muted] hover:text-[--accent] hover:bg-[--accent-dim] transition-all"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => { if (window.confirm('Supprimer ce contact ?')) deleteMut.mutate(c.id) }}
                    className="w-7 h-7 rounded flex items-center justify-center text-[--text-muted] hover:text-[--status-danger] hover:bg-[--status-danger-bg] transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Onglet Catalogue Articles ─────────────────────────────────────────────────

function TabArticles({ fournisseurId }: { fournisseurId: string }) {
  const [showModal, setShowModal]   = useState(false)
  const [editTarget, setEditTarget] = useState<FournisseurArticle | null>(null)
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['articles-fournisseur', fournisseurId] })

  const { data, isLoading } = useQuery({
    queryKey: ['articles-fournisseur', fournisseurId],
    queryFn: () => logistiqueApi.listArticlesFournisseur(fournisseurId),
    select: (r) => r.data.results,
  })

  const createMut = useMutation({
    mutationFn: (d: any) => logistiqueApi.createArticleFournisseur(d),
    onSuccess: () => { toast.success('Article ajouté au catalogue.'); inv(); setShowModal(false) },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? e?.response?.data?.non_field_errors?.[0] ?? 'Erreur'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<FournisseurArticle> }) => logistiqueApi.updateArticleFournisseur(id, d),
    onSuccess: () => { toast.success('Article mis à jour.'); inv(); setEditTarget(null) },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => logistiqueApi.deleteArticleFournisseur(id),
    onSuccess: () => { toast.success('Article retiré du catalogue.'); inv() },
  })

  const articles = data ?? []

  return (
    <>
      {showModal && (
        <ArticleFournisseurModal
          fournisseurId={fournisseurId}
          onClose={() => setShowModal(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}
      {editTarget && (
        <ArticleFournisseurModal
          fournisseurId={fournisseurId}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(d) => updateMut.mutate({ id: editTarget.id, d })}
          isPending={updateMut.isPending}
        />
      )}

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-[--text-muted]">{articles.length} article{articles.length > 1 ? 's' : ''} au catalogue</p>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowModal(true)}>
            Ajouter
          </Button>
        </div>

        {isLoading ? (
          <div className="skeleton h-32 rounded-lg" />
        ) : articles.length === 0 ? (
          <div className="text-center py-12">
            <Package size={28} className="mx-auto mb-2 text-[--text-muted]" />
            <p className="text-sm text-[--text-secondary]">Aucun article dans le catalogue</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left" style={{ borderBottom: '1px solid var(--border)' }}>
                {['Article', 'Réf. fournisseur', 'Prix unitaire', 'Délai', 'Qté min', 'Statut', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="hover:bg-[--bg-elevated] transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-semibold text-[--text-primary]">{a.article_detail.designation}</p>
                    <p className="text-[10px] font-data text-[--text-muted]">{a.article_detail.code}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-data text-xs text-[--text-secondary]">{a.reference_fournisseur || '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-data text-xs font-semibold text-[--text-primary]">
                      {Number(a.prix_unitaire).toLocaleString('fr-FR')} FCFA
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-data text-xs text-[--text-secondary]">{a.delai_livraison} j</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-data text-xs text-[--text-secondary]">
                      {a.quantite_min_commande} {a.article_detail.unite_code}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={a.actif ? 'success' : 'neutral'}>{a.actif ? 'Actif' : 'Inactif'}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditTarget(a)} className="w-6 h-6 rounded flex items-center justify-center text-[--text-muted] hover:text-[--accent] hover:bg-[--accent-dim] transition-all">
                        <Edit2 size={11} />
                      </button>
                      <button onClick={() => { if (window.confirm('Retirer cet article du catalogue ?')) deleteMut.mutate(a.id) }} className="w-6 h-6 rounded flex items-center justify-center text-[--text-muted] hover:text-[--status-danger] hover:bg-[--status-danger-bg] transition-all">
                        <Trash2 size={11} />
                      </button>
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

// ─── Onglet Contrats ──────────────────────────────────────────────────────────

function TabContrats({ fournisseurId }: { fournisseurId: string }) {
  const [showModal, setShowModal]   = useState(false)
  const [editTarget, setEditTarget] = useState<ContratFournisseur | null>(null)
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['contrats', fournisseurId] })

  const { data, isLoading } = useQuery({
    queryKey: ['contrats', fournisseurId],
    queryFn: () => logistiqueApi.listContrats(fournisseurId),
    select: (r) => r.data.results,
  })

  const createMut = useMutation({
    mutationFn: (d: any) => logistiqueApi.createContrat(d),
    onSuccess: () => { toast.success('Contrat créé.'); inv(); setShowModal(false) },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<ContratFournisseur> }) => logistiqueApi.updateContrat(id, d),
    onSuccess: () => { toast.success('Contrat mis à jour.'); inv(); setEditTarget(null) },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => logistiqueApi.deleteContrat(id),
    onSuccess: () => { toast.success('Contrat supprimé.'); inv() },
  })

  const contrats = data ?? []

  return (
    <>
      {showModal && (
        <ContratModal
          fournisseurId={fournisseurId}
          onClose={() => setShowModal(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}
      {editTarget && (
        <ContratModal
          fournisseurId={fournisseurId}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(d) => updateMut.mutate({ id: editTarget.id, d })}
          isPending={updateMut.isPending}
        />
      )}

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-[--text-muted]">{contrats.length} contrat{contrats.length > 1 ? 's' : ''}</p>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowModal(true)}>
            Nouveau contrat
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
          </div>
        ) : contrats.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={28} className="mx-auto mb-2 text-[--text-muted]" />
            <p className="text-sm text-[--text-secondary]">Aucun contrat enregistré</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contrats.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-4 p-4 rounded-lg"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-data text-xs font-bold text-[--text-primary]">{c.reference}</span>
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                      {c.type_contrat_label}
                    </span>
                    {c.est_expire && <Badge variant="danger">Expiré</Badge>}
                    {!c.actif && <Badge variant="neutral">Inactif</Badge>}
                    {c.actif && !c.est_expire && <Badge variant="success">Actif</Badge>}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-[--text-muted]">
                    <span>Du {new Date(c.date_debut).toLocaleDateString('fr-FR')}</span>
                    {c.date_fin && <span>au {new Date(c.date_fin).toLocaleDateString('fr-FR')}</span>}
                    {c.montant_max && (
                      <span>
                        Plafond : {Number(c.montant_max).toLocaleString('fr-FR')} FCFA
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-[10px] text-[--text-muted] mt-1.5 truncate">{c.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditTarget(c)} className="w-7 h-7 rounded flex items-center justify-center text-[--text-muted] hover:text-[--accent] hover:bg-[--accent-dim] transition-all">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => { if (window.confirm('Supprimer ce contrat ?')) deleteMut.mutate(c.id) }} className="w-7 h-7 rounded flex items-center justify-center text-[--text-muted] hover:text-[--status-danger] hover:bg-[--status-danger-bg] transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Onglet Évaluations ───────────────────────────────────────────────────────

function TabEvaluations({ fournisseurId }: { fournisseurId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['evaluations', fournisseurId],
    queryFn: () => logistiqueApi.listEvaluations(fournisseurId),
    select: (r) => r.data.results,
  })

  const evals = data ?? []

  function StarRow({ label, value }: { label: string; value: number }) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[--text-muted] w-14">{label}</span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={10}
              style={{ color: i < value ? 'var(--status-warning)' : 'var(--border)', fill: i < value ? 'var(--status-warning)' : 'none' }}
            />
          ))}
        </div>
        <span className="font-data text-[10px] text-[--text-secondary]">{value}/5</span>
      </div>
    )
  }

  return (
    <div className="p-5">
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
        </div>
      ) : evals.length === 0 ? (
        <div className="text-center py-12">
          <Star size={28} className="mx-auto mb-2 text-[--text-muted]" />
          <p className="text-sm text-[--text-secondary]">Aucune évaluation disponible</p>
          <p className="text-xs text-[--text-muted] mt-1">Les évaluations se créent depuis les bons de commande</p>
        </div>
      ) : (
        <div className="space-y-2">
          {evals.map((ev) => (
            <div
              key={ev.id}
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-[--text-muted]">
                      {new Date(ev.date_evaluation).toLocaleDateString('fr-FR')}
                    </span>
                    {ev.bon_commande_ref && (
                      <span className="font-data text-[10px] text-[--accent]">{ev.bon_commande_ref}</span>
                    )}
                    <span className="text-[10px] text-[--text-muted]">par {ev.evaluateur_nom}</span>
                  </div>
                </div>
                <span
                  className="font-data text-xs font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                >
                  ★ {ev.note_moyenne}
                </span>
              </div>
              <div className="space-y-1">
                <StarRow label="Qualité" value={ev.note_qualite} />
                <StarRow label="Délai"   value={ev.note_delai} />
                <StarRow label="Prix"    value={ev.note_prix} />
              </div>
              {ev.commentaire && (
                <p className="text-[10px] text-[--text-secondary] mt-2 italic">"{ev.commentaire}"</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page Principale ──────────────────────────────────────────────────────────

export function FournisseurDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('contacts')
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [motif, setMotif] = useState('')

  const { data: f, isLoading } = useQuery({
    queryKey: ['fournisseur', id],
    queryFn: () => logistiqueApi.getFournisseur(id!),
    select: (r) => r.data,
    enabled: !!id,
  })

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['fournisseur', id] })
    qc.invalidateQueries({ queryKey: ['fournisseurs'] })
  }

  const updateQualMut = useMutation({
    mutationFn: (qual: QualificationFournisseur) =>
      logistiqueApi.updateFournisseur(id!, { qualification: qual }),
    onSuccess: () => { toast.success('Statut de qualification mis à jour.'); inv() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const blacklisterMut = useMutation({
    mutationFn: (m: string) => logistiqueApi.blacklisterFournisseur(id!, m),
    onSuccess: () => {
      toast.success('Fournisseur blacklisté.')
      inv()
      setShowBlacklist(false)
      setMotif('')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const reactiverMut = useMutation({
    mutationFn: () => logistiqueApi.reactiverFournisseur(id!),
    onSuccess: () => { toast.success('Fournisseur réactivé.'); inv() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden animate-fade-in surface" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="px-6 py-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
          <button onClick={() => navigate(-1)} className="text-[--text-muted] hover:text-[--text-primary] transition-colors">
            <ArrowLeft size={15} />
          </button>
          <div className="skeleton h-5 w-48 rounded" />
        </div>
        <div className="p-6 space-y-4">
          <div className="skeleton h-24 rounded-xl" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!f) return null

  const qual = QUALIFICATION_META[f.qualification] ?? QUALIFICATION_META.en_evaluation

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in">

      {/* ── Header ── */}
      <div className="flex-shrink-0">
        <div
          className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/logistique/fournisseurs')}
              className="w-7 h-7 rounded flex items-center justify-center text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
            >
              <ArrowLeft size={14} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[--text-primary]">{f.raison_sociale}</h1>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ backgroundColor: qual.bg, color: qual.color }}
                >
                  {qual.icon}
                  {qual.label}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="font-data text-[10px] text-[--accent] font-bold">{f.code}</span>
                <span className="text-[10px] text-[--text-muted]">·</span>
                <span className="text-[10px] text-[--text-muted]">{f.categorie_label}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Solde ouvert */}
            {f.solde_ouvert > 0 && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)' }}
              >
                <CreditCard size={12} style={{ color: 'var(--status-danger)' }} />
                <span className="text-xs font-semibold font-data" style={{ color: 'var(--status-danger)' }}>
                  {fmtFcfa(f.solde_ouvert)} dû
                </span>
              </div>
            )}

            {/* Qualification controls */}
            {f.qualification === 'blackliste' ? (
              <Button
                variant="secondary"
                size="sm"
                loading={reactiverMut.isPending}
                icon={<ShieldOff size={13} />}
                onClick={() => reactiverMut.mutate()}
              >
                Réactiver
              </Button>
            ) : (
              <>
                <select
                  className={SELECT_CLASS}
                  style={{ height: '32px', width: '155px' }}
                  value={f.qualification}
                  disabled={updateQualMut.isPending}
                  onChange={(e) =>
                    updateQualMut.mutate(e.target.value as QualificationFournisseur)
                  }
                >
                  <option value="en_evaluation">En évaluation</option>
                  <option value="approuve">Approuvé</option>
                  <option value="suspendu">Suspendu</option>
                </select>
                {!showBlacklist && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Ban size={13} />}
                    onClick={() => setShowBlacklist(true)}
                  >
                    Blacklister
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Blacklist form strip */}
        {showBlacklist && (
          <div
            className="flex items-center gap-3 px-6 py-4 border-b"
            style={{ backgroundColor: 'var(--status-danger-bg)', borderColor: 'var(--status-danger)' }}
          >
            <Ban size={13} style={{ color: 'var(--status-danger)', flexShrink: 0 }} />
            <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--status-danger)' }}>
              Motif de blacklistage
            </span>
            <input
              type="text"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && motif.trim()) blacklisterMut.mutate(motif.trim())
                if (e.key === 'Escape') { setShowBlacklist(false); setMotif('') }
              }}
              placeholder="Raison du blacklistage (obligatoire)…"
              autoFocus
              className="flex-1 text-xs rounded px-3 outline-none transition-all"
              style={{
                height:          '30px',
                backgroundColor: 'var(--bg-surface)',
                border:          '1px solid var(--status-danger)',
                color:           'var(--text-primary)',
              }}
            />
            <Button
              variant="danger"
              size="sm"
              loading={blacklisterMut.isPending}
              onClick={() => {
                if (!motif.trim()) { toast.error('Le motif est obligatoire'); return }
                blacklisterMut.mutate(motif.trim())
              }}
            >
              Confirmer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowBlacklist(false); setMotif('') }}
            >
              Annuler
            </Button>
          </div>
        )}
      </div>

      {/* ── Corps ── */}
      <div className="flex-1 overflow-auto">

        {/* Infos + KPIs */}
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
          <div className="flex gap-6">

            {/* Infos de base */}
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                {f.telephone && (
                  <div className="flex items-center gap-2 text-xs text-[--text-secondary]">
                    <Phone size={11} className="text-[--text-muted] flex-shrink-0" />
                    {f.telephone}
                  </div>
                )}
                {f.email && (
                  <div className="flex items-center gap-2 text-xs text-[--text-secondary]">
                    <Mail size={11} className="text-[--text-muted] flex-shrink-0" />
                    {f.email}
                  </div>
                )}
                {(f.ville || f.adresse) && (
                  <div className="flex items-center gap-2 text-xs text-[--text-secondary]">
                    <MapPin size={11} className="text-[--text-muted] flex-shrink-0" />
                    {[f.adresse, f.ville, f.pays].filter(Boolean).join(', ')}
                  </div>
                )}
                {f.delai_livraison > 0 && (
                  <div className="flex items-center gap-2 text-xs text-[--text-secondary]">
                    <Clock size={11} className="text-[--text-muted] flex-shrink-0" />
                    Délai : {f.delai_livraison} jours
                  </div>
                )}
                {f.conditions_paiement && (
                  <div className="flex items-center gap-2 text-xs text-[--text-secondary]">
                    <CreditCard size={11} className="text-[--text-muted] flex-shrink-0" />
                    {f.conditions_paiement}
                  </div>
                )}
                {f.nif && (
                  <div className="flex items-center gap-2 text-xs text-[--text-secondary]">
                    <Award size={11} className="text-[--text-muted] flex-shrink-0" />
                    NIF : <span className="font-data">{f.nif}</span>
                  </div>
                )}
              </div>
            </div>

            {/* KPIs */}
            <div className="flex-shrink-0 grid grid-cols-5 gap-2.5" style={{ minWidth: '580px' }}>
              <KpiCard
                label="Qualité moy."
                value={f.note_qualite_moy}
                icon={<Star size={14} />}
                color="var(--status-warning)"
                suffix="/5"
              />
              <KpiCard
                label="Délai moy."
                value={f.note_delai_moy}
                icon={<Clock size={14} />}
                color="var(--status-info)"
                suffix="/5"
              />
              <KpiCard
                label="Conformité"
                value={f.taux_conformite}
                icon={<CheckCircle2 size={14} />}
                color="var(--status-success)"
                suffix="%"
              />
              <KpiCard
                label="OTD"
                value={f.taux_otd}
                icon={<TrendingUp size={14} />}
                color="var(--accent)"
                suffix="%"
              />
              <KpiCard
                label="Évaluations"
                value={f.nb_evaluations}
                icon={<ClipboardList size={14} />}
                color="var(--text-secondary)"
              />
            </div>
          </div>

          {f.notes && (
            <div
              className="mt-4 px-3 py-2.5 rounded-lg text-xs text-[--text-secondary] italic"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              {f.notes}
            </div>
          )}
        </div>

        {/* Onglets */}
        <div>
          {/* Tab bar */}
          <div
            className="flex items-center px-6 border-b gap-0 flex-shrink-0"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all',
                  activeTab === tab.id
                    ? 'text-[--accent] border-[--accent]'
                    : 'text-[--text-muted] border-transparent hover:text-[--text-secondary] hover:border-[--border]',
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === 'contacts'    && <TabContacts    fournisseurId={id!} />}
            {activeTab === 'articles'    && <TabArticles    fournisseurId={id!} />}
            {activeTab === 'contrats'    && <TabContrats    fournisseurId={id!} />}
            {activeTab === 'evaluations' && <TabEvaluations fournisseurId={id!} />}
          </div>
        </div>
      </div>
    </div>
  )
}
