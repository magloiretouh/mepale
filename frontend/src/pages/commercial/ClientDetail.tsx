/**
 * MEPALE ERP — Fiche Client
 * Infos, contacts, commandes récentes, factures récentes
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, UserRound, Phone, Mail, Building2, User,
  CreditCard, Clock, ClipboardList, FileText, PauseCircle, PlayCircle, PowerOff, Pencil,
  UserPlus, Edit3, Trash2, X,
} from 'lucide-react'

import {
  commercialApi,
  type ClientCreatePayload,
  type ContactClient,
  type StatutClient,
  type StatutCC,
  type StatutFacture,
} from '@/services/commercial'
import { Input } from '@/components/ui/Input'
import { ClientFormModal } from '@/components/commercial/ClientFormModal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn, formatDate, formatXOF } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Statut configs ───────────────────────────────────────────────────────────

const STATUT_CLIENT_CFG: Record<StatutClient, { variant: 'success' | 'warning' | 'neutral'; label: string }> = {
  actif:    { variant: 'success', label: 'Actif'    },
  suspendu: { variant: 'warning', label: 'Suspendu' },
  inactif:  { variant: 'neutral', label: 'Inactif'  },
}

const STATUT_CC_CFG: Record<StatutCC, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon:            { variant: 'neutral', label: 'Brouillon'     },
  confirmee:            { variant: 'accent',  label: 'Confirmée'     },
  en_cours_livraison:   { variant: 'warning', label: 'En livraison'  },
  partiellement_livree: { variant: 'info',    label: 'Part. livrée'  },
  livree:               { variant: 'success', label: 'Livrée'        },
  annulee:              { variant: 'danger',  label: 'Annulée'       },
}

const STATUT_FACTURE_CFG: Record<StatutFacture, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon:           { variant: 'neutral', label: 'Brouillon'     },
  emise:               { variant: 'accent',  label: 'Émise'         },
  partiellement_payee: { variant: 'warning', label: 'Part. payée'   },
  payee:               { variant: 'success', label: 'Payée'         },
  annulee:             { variant: 'danger',  label: 'Annulée'       },
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span className="text-xs text-[--text-muted] w-36 flex-shrink-0 pt-px">{label}</span>
      <span className="text-xs text-[--text-primary] font-medium">{value}</span>
    </div>
  )
}

// ─── Modal Contact ────────────────────────────────────────────────────────────

function ModalContact({
  clientId,
  initial,
  onClose,
  onSave,
  isPending,
}: {
  clientId: string
  initial?: ContactClient
  onClose: () => void
  onSave: (data: any) => void
  isPending: boolean
}) {
  const [form, setForm] = useState({
    nom:       initial?.nom       ?? '',
    poste:     initial?.poste     ?? '',
    telephone: initial?.telephone ?? '',
    email:     initial?.email     ?? '',
    principal: initial?.principal ?? false,
  })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nom.trim()) return
    onSave(initial ? form : { ...form, client: clientId })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative z-10 w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}
      >
        <header className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold text-[--text-primary]">
            {initial ? 'Modifier le contact' : 'Nouveau contact'}
          </h2>
          <button onClick={onClose} className="p-1 rounded text-[--text-muted] hover:text-[--text-primary] transition-colors">
            <X size={15} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="flex flex-col gap-5">
              <div>
                <label className={FIELD_LABEL}>Nom complet *</label>
                <Input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Jean Dupont" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Poste</label>
                <Input value={form.poste} onChange={e => set('poste', e.target.value)} placeholder="Directeur Achats" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Téléphone</label>
                <Input
                  value={form.telephone}
                  onChange={e => set('telephone', e.target.value)}
                  placeholder="+226 XX XX XX XX"
                  icon={<Phone size={13} />}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>Email</label>
                <Input
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="contact@example.com"
                  type="email"
                  icon={<Mail size={13} />}
                />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.principal}
                  onChange={e => set('principal', e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span className="text-xs text-[--text-primary]">Contact principal</span>
              </label>
            </div>
          </div>
          <footer
            className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
            <Button type="submit" variant="primary" size="sm" loading={isPending} disabled={!form.nom.trim()}>
              {initial ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  )
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'info' | 'contacts' | 'commandes' | 'factures'

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab]           = useState<Tab>('info')
  const [showEdit, setShowEdit]   = useState(false)
  const [showAddContact, setShowAddContact]   = useState(false)
  const [editingContact, setEditingContact]   = useState<ContactClient | null>(null)
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn:  () => commercialApi.getClient(id!).then((r) => r.data),
    enabled:  !!id,
  })

  const { data: commandes } = useQuery({
    queryKey: ['commandes-client', { client: id }],
    queryFn:  () => commercialApi.listCommandesClient({ client: id }).then((r) => r.data.results),
    enabled:  !!id && tab === 'commandes',
  })

  const { data: factures } = useQuery({
    queryKey: ['factures-vente', { client: id }],
    queryFn:  () => commercialApi.listFacturesVente({ client: id }).then((r) => r.data.results),
    enabled:  !!id && tab === 'factures',
  })

  const suspendreMut = useMutation({
    mutationFn: () => commercialApi.suspendreClient(id!),
    onSuccess:  () => {
      toast.success('Client suspendu.')
      qc.invalidateQueries({ queryKey: ['client', id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const updateMut = useMutation({
    mutationFn: (data: ClientCreatePayload) => commercialApi.updateClient(id!, data),
    onSuccess: () => {
      toast.success('Client mis à jour.')
      qc.invalidateQueries({ queryKey: ['client', id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      setShowEdit(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la mise à jour'),
  })

  const desactiverMut = useMutation({
    mutationFn: () => commercialApi.desactiverClient(id!),
    onSuccess:  () => {
      toast.success('Client désactivé.')
      qc.invalidateQueries({ queryKey: ['client', id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const reactiverMut = useMutation({
    mutationFn: () => commercialApi.reactiverClient(id!),
    onSuccess:  () => {
      toast.success('Client réactivé.')
      qc.invalidateQueries({ queryKey: ['client', id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const createContactMut = useMutation({
    mutationFn: (data: any) => commercialApi.createContact(data),
    onSuccess: () => {
      toast.success('Contact ajouté.')
      qc.invalidateQueries({ queryKey: ['client', id] })
      setShowAddContact(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const updateContactMut = useMutation({
    mutationFn: ({ contactId, data }: { contactId: string; data: any }) =>
      commercialApi.updateContact(contactId, data),
    onSuccess: () => {
      toast.success('Contact mis à jour.')
      qc.invalidateQueries({ queryKey: ['client', id] })
      setEditingContact(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const deleteContactMut = useMutation({
    mutationFn: (contactId: string) => commercialApi.deleteContact(contactId),
    onSuccess: () => {
      toast.success('Contact supprimé.')
      qc.invalidateQueries({ queryKey: ['client', id] })
      setDeletingContactId(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'info',      label: 'Informations', icon: <Building2 size={13} />     },
    { id: 'contacts',  label: 'Contacts',     icon: <Phone size={13} />         },
    { id: 'commandes', label: 'Commandes',    icon: <ClipboardList size={13} /> },
    { id: 'factures',  label: 'Factures',     icon: <FileText size={13} />      },
  ]

  if (isLoading) return (
    <div className="animate-fade-in px-6 py-8">
      <div className="skeleton h-6 w-48 rounded mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + i * 5}%` }} />
        ))}
      </div>
    </div>
  )

  if (!client) return (
    <div className="animate-fade-in px-6 py-16 text-center">
      <p className="text-sm text-[--text-secondary]">Client introuvable.</p>
      <button className="mt-3 text-xs text-[--accent] hover:underline" onClick={() => navigate('/commercial/clients')}>
        Retour à la liste
      </button>
    </div>
  )

  const cfg = STATUT_CLIENT_CFG[client.statut]

  return (
    <>
    {showEdit && client && (
      <ClientFormModal
        mode="edit"
        initialData={client}
        onClose={() => setShowEdit(false)}
        onSave={(d) => updateMut.mutate(d)}
        isPending={updateMut.isPending}
      />
    )}
    {showAddContact && client && (
      <ModalContact
        clientId={client.id}
        onClose={() => setShowAddContact(false)}
        onSave={(data) => createContactMut.mutate(data)}
        isPending={createContactMut.isPending}
      />
    )}
    {editingContact && client && (
      <ModalContact
        clientId={client.id}
        initial={editingContact}
        onClose={() => setEditingContact(null)}
        onSave={(data) => updateContactMut.mutate({ contactId: editingContact.id, data })}
        isPending={updateContactMut.isPending}
      />
    )}
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/commercial/clients')}
            className="p-1.5 rounded-lg text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
          >
            {client.raison_sociale.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[--text-primary]">{client.raison_sociale}</h1>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-[--text-muted] font-data">{client.code}</span>
              <span className="inline-flex items-center gap-1 text-xs text-[--text-muted]">
                {client.type === 'entreprise' ? <Building2 size={10} /> : <User size={10} />}
                {client.type_label}
              </span>
              {client.commercial_nom && (
                <span className="text-xs text-[--text-muted]">Commercial : {client.commercial_nom}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={() => setShowEdit(true)}>
            Modifier
          </Button>
          {client.statut === 'actif' && (
            <>
              <Button variant="ghost" size="sm" icon={<PowerOff size={13} />} loading={desactiverMut.isPending} onClick={() => desactiverMut.mutate()}>
                Désactiver
              </Button>
              <Button variant="outline" size="sm" icon={<PauseCircle size={13} />} loading={suspendreMut.isPending} onClick={() => suspendreMut.mutate()}>
                Suspendre
              </Button>
            </>
          )}
          {client.statut === 'suspendu' && (
            <>
              <Button variant="ghost" size="sm" icon={<PowerOff size={13} />} loading={desactiverMut.isPending} onClick={() => desactiverMut.mutate()}>
                Désactiver
              </Button>
              <Button variant="primary" size="sm" icon={<PlayCircle size={13} />} loading={reactiverMut.isPending} onClick={() => reactiverMut.mutate()}>
                Réactiver
              </Button>
            </>
          )}
          {client.statut === 'inactif' && (
            <Button variant="primary" size="sm" icon={<PlayCircle size={13} />} loading={reactiverMut.isPending} onClick={() => reactiverMut.mutate()}>
              Réactiver
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 px-6 py-2 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all',
              tab === t.id
                ? 'text-[--accent]'
                : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
            )}
            style={
              tab === t.id
                ? { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                : { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
            }
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div className="px-6 py-5">
        {/* ── Tab Info ── */}
        {tab === 'info' && (
          <div className="grid grid-cols-2 gap-5">
            <div className="surface rounded-xl p-5">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">Identité & Fiscal</p>
              <InfoRow icon={<CreditCard size={13} />} label="NIF" value={<span className="font-data">{client.nif || '—'}</span>} />
              <InfoRow icon={<CreditCard size={13} />} label="RCCM" value={<span className="font-data">{client.rccm || '—'}</span>} />
              <InfoRow icon={<CreditCard size={13} />} label="N° contribuable" value={<span className="font-data">{client.numero_contribuable || '—'}</span>} />
              <InfoRow icon={<Building2 size={13} />} label="Secteur d'activité" value={client.secteur_activite || '—'} />
            </div>
            <div className="surface rounded-xl p-5">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">Conditions Commerciales</p>
              <InfoRow icon={<Clock size={13} />}   label="Délai paiement" value={<span className="font-data">{client.delai_paiement} jours</span>} />
              <InfoRow icon={<CreditCard size={13} />} label="Mode paiement" value={client.mode_paiement_label} />
              <InfoRow
                icon={<CreditCard size={13} />}
                label="Plafond crédit"
                value={client.plafond_credit ? formatXOF(Number(client.plafond_credit)) : '—'}
              />
              <InfoRow
                icon={<CreditCard size={13} />}
                label="Solde factures"
                value={
                  <span
                    className="font-data font-semibold"
                    style={{ color: Number(client.solde_factures) > 0 ? 'var(--status-warning)' : 'var(--text-primary)' }}
                  >
                    {formatXOF(Number(client.solde_factures))}
                  </span>
                }
              />
            </div>
            {(client.adresse_facturation || client.adresse_livraison_effective) && (
              <div className="col-span-2 surface rounded-xl p-5">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">Adresses</p>
                <div className="grid grid-cols-2 gap-6">
                  {client.adresse_facturation && (
                    <div>
                      <p className="text-[11px] font-medium text-[--text-muted] mb-1.5">Facturation</p>
                      <p className="text-xs text-[--text-primary] whitespace-pre-wrap leading-relaxed">{client.adresse_facturation}</p>
                    </div>
                  )}
                  {client.adresse_livraison_effective && (
                    <div>
                      <p className="text-[11px] font-medium text-[--text-muted] mb-1.5">Livraison</p>
                      <p className="text-xs text-[--text-primary] whitespace-pre-wrap leading-relaxed">{client.adresse_livraison_effective}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {client.notes && (
              <div className="col-span-2 surface rounded-xl p-5">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-2">Notes internes</p>
                <p className="text-xs text-[--text-secondary] whitespace-pre-wrap leading-relaxed">{client.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab Contacts ── */}
        {tab === 'contacts' && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-[--text-muted]">
                {client.contacts.length} contact{client.contacts.length !== 1 ? 's' : ''}
              </p>
              <Button
                variant="primary"
                size="sm"
                icon={<UserPlus size={13} />}
                onClick={() => setShowAddContact(true)}
              >
                Ajouter un contact
              </Button>
            </div>

            {client.contacts.length === 0 ? (
              <div className="py-12 text-center">
                <Phone size={28} className="mx-auto mb-3 text-[--text-muted]" />
                <p className="text-sm text-[--text-secondary]">Aucun contact enregistré</p>
                <p className="text-xs text-[--text-muted] mt-1">Cliquez sur "Ajouter un contact" pour commencer</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {client.contacts.map((c) => (
                  <div key={c.id} className="surface rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[--text-primary] truncate">{c.nom}</p>
                        {c.poste && <p className="text-xs text-[--text-muted]">{c.poste}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                        {c.principal && <Badge variant="accent">Principal</Badge>}
                        <button
                          onClick={() => setEditingContact(c)}
                          className="p-1 rounded text-[--text-muted] hover:text-[--accent] hover:bg-[--accent-dim] transition-all"
                          title="Modifier"
                        >
                          <Edit3 size={12} />
                        </button>
                        {deletingContactId === c.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => deleteContactMut.mutate(c.id)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white transition-colors"
                              style={{ backgroundColor: 'var(--status-danger)' }}
                            >
                              Oui
                            </button>
                            <button
                              onClick={() => setDeletingContactId(null)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-[--text-secondary] hover:bg-[--bg-elevated] transition-colors"
                            >
                              Non
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeletingContactId(c.id)}
                            className="p-1 rounded text-[--text-muted] hover:text-[--status-danger] hover:bg-[--bg-elevated] transition-all"
                            title="Supprimer"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 mt-3">
                      {c.telephone ? (
                        <div className="flex items-center gap-2 text-xs text-[--text-secondary]">
                          <Phone size={11} className="text-[--text-muted] flex-shrink-0" />
                          {c.telephone}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-[--text-muted]">
                          <Phone size={11} className="flex-shrink-0" />—
                        </div>
                      )}
                      {c.email ? (
                        <div className="flex items-center gap-2 text-xs text-[--text-secondary]">
                          <Mail size={11} className="text-[--text-muted] flex-shrink-0" />
                          <span className="truncate">{c.email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-[--text-muted]">
                          <Mail size={11} className="flex-shrink-0" />—
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab Commandes ── */}
        {tab === 'commandes' && (
          <div>
            {!commandes ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 rounded" />)}
              </div>
            ) : commandes.length === 0 ? (
              <div className="py-12 text-center">
                <ClipboardList size={28} className="mx-auto mb-3 text-[--text-muted]" />
                <p className="text-sm text-[--text-secondary]">Aucune commande pour ce client</p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                    {['Référence', 'Montant HT', 'Date', 'Livraison souhaitée', 'Statut'].map((h) => (
                      <th key={h} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((cc) => (
                    <tr
                      key={cc.id}
                      className="hover:bg-[--bg-elevated] cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      onClick={() => navigate(`/commercial/commandes/${cc.id}`)}
                    >
                      <td className="px-6 py-5"><span className="font-data text-xs font-semibold text-[--accent]">{cc.reference}</span></td>
                      <td className="px-6 py-5"><span className="font-data text-xs">{formatXOF(Number(cc.montant_ht))}</span></td>
                      <td className="px-6 py-5"><span className="text-xs text-[--text-secondary]">{formatDate(cc.date_commande)}</span></td>
                      <td className="px-6 py-5">
                        <span className="text-xs text-[--text-secondary]">
                          {cc.date_livraison_souhaitee ? formatDate(cc.date_livraison_souhaitee) : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <Badge variant={STATUT_CC_CFG[cc.statut].variant}>{STATUT_CC_CFG[cc.statut].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab Factures ── */}
        {tab === 'factures' && (
          <div>
            {!factures ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 rounded" />)}
              </div>
            ) : factures.length === 0 ? (
              <div className="py-12 text-center">
                <FileText size={28} className="mx-auto mb-3 text-[--text-muted]" />
                <p className="text-sm text-[--text-secondary]">Aucune facture pour ce client</p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                    {['Référence', 'Montant HT', 'Réglé', 'Restant', 'Échéance', 'Statut'].map((h) => (
                      <th key={h} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {factures.map((f) => (
                    <tr
                      key={f.id}
                      className="hover:bg-[--bg-elevated] cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      onClick={() => navigate(`/commercial/factures/${f.id}`)}
                    >
                      <td className="px-6 py-5"><span className="font-data text-xs font-semibold text-[--accent]">{f.reference}</span></td>
                      <td className="px-6 py-5"><span className="font-data text-xs">{formatXOF(Number(f.montant_ht))}</span></td>
                      <td className="px-6 py-5">
                        <span className="font-data text-xs" style={{ color: 'var(--status-success)' }}>
                          {formatXOF(Number(f.montant_regle))}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className="font-data text-xs"
                          style={{ color: Number(f.montant_restant) > 0 ? 'var(--status-warning)' : 'var(--text-muted)' }}
                        >
                          {formatXOF(Number(f.montant_restant))}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-xs" style={{ color: f.est_en_retard ? 'var(--status-danger)' : 'var(--text-secondary)' }}>
                          {formatDate(f.date_echeance)}
                          {f.est_en_retard && ` (+${f.jours_retard}j)`}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <Badge variant={STATUT_FACTURE_CFG[f.statut].variant}>{STATUT_FACTURE_CFG[f.statut].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
