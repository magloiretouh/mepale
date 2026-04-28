/**
 * MEPALE ERP — Détail Devis
 * Actions : Envoyer / Accepter / Refuser / Convertir en CC / Révision
 * Modification (brouillon uniquement) : en-tête + lignes CRUD
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, FileText, Send, CheckCircle2, XCircle,
  ShoppingCart, RefreshCw, Calendar, User, Package,
  Edit3, Trash2, Plus, X, Pencil,
} from 'lucide-react'

import {
  commercialApi,
  type StatutDevis,
  type LigneDevis,
} from '@/services/commercial'
import { productionApi, type Article } from '@/services/production'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDate, formatXOF } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'
const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 h-[38px] outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutDevis, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon: { variant: 'neutral', label: 'Brouillon' },
  envoye:    { variant: 'accent',  label: 'Envoyé'    },
  accepte:   { variant: 'success', label: 'Accepté'   },
  refuse:    { variant: 'danger',  label: 'Refusé'    },
  expire:    { variant: 'neutral', label: 'Expiré'    },
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span className="text-xs text-[--text-muted] w-32 flex-shrink-0 pt-px">{label}</span>
      <span className="text-xs text-[--text-primary] font-medium">{value}</span>
    </div>
  )
}

// ─── Modal Edit Header ────────────────────────────────────────────────────────

function ModalEditHeader({
  initial,
  onClose,
  onSave,
  isPending,
}: {
  initial: { date_devis: string; date_validite: string; reference_client: string; notes_client: string; notes_internes: string }
  onClose: () => void
  onSave: (data: any) => void
  isPending: boolean
}) {
  const [form, setForm] = useState({
    date_devis:       initial.date_devis,
    date_validite:    initial.date_validite,
    reference_client: initial.reference_client,
    notes_client:     initial.notes_client,
    notes_internes:   initial.notes_internes,
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative z-10 w-full max-w-lg flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}
      >
        <header className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold text-[--text-primary]">Modifier le devis</h2>
          <button onClick={onClose} className="p-1 rounded text-[--text-muted] hover:text-[--text-primary] transition-colors">
            <X size={15} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>Date devis</label>
                <input
                  type="date"
                  value={form.date_devis}
                  onChange={e => set('date_devis', e.target.value)}
                  className={SELECT_CLASS}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>Date validité</label>
                <input
                  type="date"
                  value={form.date_validite}
                  onChange={e => set('date_validite', e.target.value)}
                  className={SELECT_CLASS}
                />
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL}>Référence client</label>
              <Input
                value={form.reference_client}
                onChange={e => set('reference_client', e.target.value)}
                placeholder="Réf. bon de commande client…"
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Notes client</label>
              <textarea
                value={form.notes_client}
                onChange={e => set('notes_client', e.target.value)}
                placeholder="Conditions particulières, remarques client…"
                rows={3}
                className={SELECT_CLASS + ' h-auto py-2.5 resize-none leading-relaxed'}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Notes internes</label>
              <textarea
                value={form.notes_internes}
                onChange={e => set('notes_internes', e.target.value)}
                placeholder="Notes visibles uniquement en interne…"
                rows={3}
                className={SELECT_CLASS + ' h-auto py-2.5 resize-none leading-relaxed'}
              />
            </div>
          </div>
        </div>
        <footer className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={() => onSave(form)}>
            Enregistrer
          </Button>
        </footer>
      </div>
    </div>
  )
}

// ─── Modal Ligne ──────────────────────────────────────────────────────────────

function ModalLigne({
  devisId,
  initial,
  onClose,
  onSave,
  isPending,
}: {
  devisId: string
  initial?: LigneDevis
  onClose: () => void
  onSave: (data: any) => void
  isPending: boolean
}) {
  const { data: articles } = useQuery({
    queryKey: ['articles-list'],
    queryFn:  () => productionApi.listArticles({ page_size: 500, actif: true }).then(r => r.data.results),
  })

  const [articleId, setArticleId] = useState(initial?.article ?? '')
  const [quantite,  setQuantite]  = useState(String(initial?.quantite ?? ''))
  const [prixUnit,  setPrixUnit]  = useState(String(initial?.prix_unitaire ?? ''))
  const [remise,    setRemise]    = useState(String(initial?.remise_pct ?? '0'))

  const handleArticleChange = (id: string) => {
    setArticleId(id)
    if (!initial && articles) {
      const art = articles.find(a => a.id === id)
      if (art?.prix_standard) setPrixUnit(String(art.prix_standard))
    }
  }

  const canSubmit = articleId && Number(quantite) > 0 && Number(prixUnit) >= 0

  const handleSubmit = () => {
    if (!canSubmit) return
    if (initial) {
      onSave({ quantite: Number(quantite), prix_unitaire: Number(prixUnit), remise_pct: Number(remise) })
    } else {
      onSave({ devis: devisId, article: articleId, quantite: Number(quantite), prix_unitaire: Number(prixUnit), remise_pct: Number(remise) })
    }
  }

  const selectedArticle = articles?.find(a => a.id === articleId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative z-10 w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}
      >
        <header className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold text-[--text-primary]">
            {initial ? 'Modifier la ligne' : 'Ajouter une ligne'}
          </h2>
          <button onClick={onClose} className="p-1 rounded text-[--text-muted] hover:text-[--text-primary] transition-colors">
            <X size={15} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-5">
            {!initial && (
              <div>
                <label className={FIELD_LABEL}>Article *</label>
                <select
                  value={articleId}
                  onChange={e => handleArticleChange(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— Sélectionner un article —</option>
                  {articles?.map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>
                  ))}
                </select>
                {selectedArticle && (
                  <p className="mt-1 text-[11px] text-[--text-muted]">
                    Unité : {selectedArticle.unite_code}
                  </p>
                )}
              </div>
            )}
            {initial && (
              <div className="surface rounded-lg p-3">
                <p className="text-xs font-semibold text-[--text-primary]">{initial.article_designation}</p>
                <p className="text-[11px] text-[--text-muted] font-data mt-0.5">{initial.article_code}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>Quantité *</label>
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={quantite}
                  onChange={e => setQuantite(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>Prix unitaire (FCFA) *</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={prixUnit}
                  onChange={e => setPrixUnit(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL}>Remise (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={remise}
                onChange={e => setRemise(e.target.value)}
                placeholder="0"
              />
            </div>
            {articleId && Number(quantite) > 0 && Number(prixUnit) >= 0 && (
              <div
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{ backgroundColor: 'var(--accent-dim)' }}
              >
                <span className="text-xs text-[--text-secondary]">Montant HT estimé</span>
                <span className="font-data text-sm font-bold" style={{ color: 'var(--accent)' }}>
                  {formatXOF(Number(quantite) * Number(prixUnit) * (1 - Number(remise) / 100))}
                </span>
              </div>
            )}
          </div>
        </div>
        <footer className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} disabled={!canSubmit} onClick={handleSubmit}>
            {initial ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DevisDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showEditHeader, setShowEditHeader]   = useState(false)
  const [showAddLigne, setShowAddLigne]       = useState(false)
  const [editingLigne, setEditingLigne]       = useState<LigneDevis | null>(null)
  const [deletingLigneId, setDeletingLigneId] = useState<string | null>(null)

  const { data: devis, isLoading } = useQuery({
    queryKey: ['devis', id],
    queryFn:  () => commercialApi.getDevis(id!).then((r) => r.data),
    enabled:  !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['devis', id] })
    qc.invalidateQueries({ queryKey: ['devis'] })
  }

  const envoyerMut = useMutation({
    mutationFn: () => commercialApi.envoyerDevis(id!),
    onSuccess:  () => { toast.success('Devis envoyé.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const accepterMut = useMutation({
    mutationFn: () => commercialApi.accepterDevis(id!),
    onSuccess:  () => { toast.success('Devis accepté.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const refuserMut = useMutation({
    mutationFn: () => commercialApi.refuserDevis(id!),
    onSuccess:  () => { toast.success('Devis refusé.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const convertirMut = useMutation({
    mutationFn: () => commercialApi.convertirDevisEnCC(id!),
    onSuccess:  (r) => {
      toast.success('Converti en commande client.')
      qc.invalidateQueries({ queryKey: ['commandes-client'] })
      navigate(`/commercial/commandes/${r.data.commande_id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const revisionMut = useMutation({
    mutationFn: () => commercialApi.revisionDevis(id!),
    onSuccess:  (r) => {
      toast.success('Révision créée.')
      invalidate()
      navigate(`/commercial/devis/${r.data.devis_id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const updateHeaderMut = useMutation({
    mutationFn: (data: any) => commercialApi.updateDevis(id!, data),
    onSuccess:  () => { toast.success('Devis mis à jour.'); invalidate(); setShowEditHeader(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const createLigneMut = useMutation({
    mutationFn: (data: any) => commercialApi.createLigneDevis(data),
    onSuccess:  () => { toast.success('Ligne ajoutée.'); invalidate(); setShowAddLigne(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const updateLigneMut = useMutation({
    mutationFn: ({ ligneId, data }: { ligneId: string; data: any }) =>
      commercialApi.updateLigneDevis(ligneId, data),
    onSuccess: () => { toast.success('Ligne mise à jour.'); invalidate(); setEditingLigne(null) },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const deleteLigneMut = useMutation({
    mutationFn: (ligneId: string) => commercialApi.deleteLigneDevis(ligneId),
    onSuccess:  () => { toast.success('Ligne supprimée.'); invalidate(); setDeletingLigneId(null) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  if (isLoading) return (
    <div className="animate-fade-in px-6 py-8">
      <div className="skeleton h-6 w-48 rounded mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + i * 4}%` }} />
        ))}
      </div>
    </div>
  )

  if (!devis) return (
    <div className="animate-fade-in px-6 py-16 text-center">
      <p className="text-sm text-[--text-secondary]">Devis introuvable.</p>
      <button className="mt-3 text-xs text-[--accent] hover:underline" onClick={() => navigate('/commercial/devis')}>
        Retour à la liste
      </button>
    </div>
  )

  const cfg = STATUT_CFG[devis.statut]
  const isBrouillon = devis.statut === 'brouillon'
  const totalHT = devis.lignes.reduce((acc, l) => acc + Number(l.montant_ht), 0)

  return (
    <>
      {showEditHeader && (
        <ModalEditHeader
          initial={{
            date_devis:       devis.date_devis,
            date_validite:    devis.date_validite,
            reference_client: devis.reference_client ?? '',
            notes_client:     devis.notes_client ?? '',
            notes_internes:   devis.notes_internes ?? '',
          }}
          onClose={() => setShowEditHeader(false)}
          onSave={(data) => updateHeaderMut.mutate(data)}
          isPending={updateHeaderMut.isPending}
        />
      )}
      {showAddLigne && (
        <ModalLigne
          devisId={devis.id}
          onClose={() => setShowAddLigne(false)}
          onSave={(data) => createLigneMut.mutate(data)}
          isPending={createLigneMut.isPending}
        />
      )}
      {editingLigne && (
        <ModalLigne
          devisId={devis.id}
          initial={editingLigne}
          onClose={() => setEditingLigne(null)}
          onSave={(data) => updateLigneMut.mutate({ ligneId: editingLigne.id, data })}
          isPending={updateLigneMut.isPending}
        />
      )}

      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/commercial/devis')}
              className="p-1.5 rounded-lg text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
            >
              <ArrowLeft size={16} />
            </button>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-dim)' }}
            >
              <FileText size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-[--text-primary] font-data">{devis.reference}</h1>
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
                <span className="text-xs text-[--text-muted] font-data">v{devis.version}</span>
              </div>
              <p className="text-xs text-[--text-muted] mt-0.5">{devis.client_nom}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isBrouillon && (
              <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={() => setShowEditHeader(true)}>
                Modifier
              </Button>
            )}
            {isBrouillon && (
              <Button variant="primary" size="sm" icon={<Send size={13} />} loading={envoyerMut.isPending} onClick={() => envoyerMut.mutate()}>
                Envoyer
              </Button>
            )}
            {devis.statut === 'envoye' && (
              <>
                <Button variant="primary" size="sm" icon={<CheckCircle2 size={13} />} loading={accepterMut.isPending} onClick={() => accepterMut.mutate()}>
                  Accepter
                </Button>
                <Button variant="danger" size="sm" icon={<XCircle size={13} />} loading={refuserMut.isPending} onClick={() => refuserMut.mutate()}>
                  Refuser
                </Button>
              </>
            )}
            {devis.statut === 'accepte' && (
              <Button variant="primary" size="sm" icon={<ShoppingCart size={13} />} loading={convertirMut.isPending} onClick={() => convertirMut.mutate()}>
                Convertir en CC
              </Button>
            )}
            {['brouillon', 'envoye', 'accepte'].includes(devis.statut) && (
              <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} loading={revisionMut.isPending} onClick={() => revisionMut.mutate()}>
                Révision
              </Button>
            )}
          </div>
        </div>

        {/* Contenu */}
        <div className="px-6 py-5 grid grid-cols-3 gap-5">
          {/* Colonne gauche — Infos */}
          <div className="col-span-1 space-y-5">
            <div className="surface rounded-xl p-5">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">Informations</p>
              <InfoRow icon={<User size={13} />}     label="Client"     value={devis.client_nom} />
              <InfoRow icon={<User size={13} />}     label="Commercial" value={devis.commercial_nom ?? '—'} />
              <InfoRow icon={<Calendar size={13} />} label="Date devis" value={formatDate(devis.date_devis)} />
              <InfoRow icon={<Calendar size={13} />} label="Validité"   value={formatDate(devis.date_validite)} />
              <InfoRow
                icon={<FileText size={13} />}
                label="Réf. client"
                value={devis.reference_client
                  ? <span className="font-data">{devis.reference_client}</span>
                  : '—'}
              />
            </div>

            {(devis.notes_client || isBrouillon) && (
              <div className="surface rounded-xl p-5">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-2">Notes client</p>
                <p className="text-xs text-[--text-secondary] leading-relaxed whitespace-pre-wrap">
                  {devis.notes_client || <span className="text-[--text-muted] italic">Aucune note</span>}
                </p>
              </div>
            )}

            {(devis.notes_internes || isBrouillon) && (
              <div className="surface rounded-xl p-5">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-2">Notes internes</p>
                <p className="text-xs text-[--text-secondary] leading-relaxed whitespace-pre-wrap">
                  {devis.notes_internes || <span className="text-[--text-muted] italic">Aucune note</span>}
                </p>
              </div>
            )}
          </div>

          {/* Colonne droite — Lignes */}
          <div className="col-span-2">
            <div className="surface rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">
                  Lignes ({devis.lignes.length})
                </p>
                {isBrouillon && (
                  <Button
                    variant="outline"
                    size="xs"
                    icon={<Plus size={12} />}
                    onClick={() => setShowAddLigne(true)}
                  >
                    Ajouter
                  </Button>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                    {['Article', 'Désignation', 'Qté', 'Unité', 'P.U.', 'Remise', 'Montant HT'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left">{h}</th>
                    ))}
                    {isBrouillon && <th className="px-4 py-2.5 w-16" />}
                  </tr>
                </thead>
                <tbody>
                  {devis.lignes.map((l, i) => (
                    <tr key={l.id} style={{ borderBottom: i < devis.lignes.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <td className="px-4 py-4">
                        <span className="font-data text-xs text-[--accent]">{l.article_code}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-[--text-primary]">{l.article_designation}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-data text-xs">{l.quantite}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-[--text-muted]">{l.unite_code}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-data text-xs">{formatXOF(Number(l.prix_unitaire))}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-data text-xs text-[--text-muted]">
                          {Number(l.remise_pct) > 0 ? `${l.remise_pct}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-data text-xs font-semibold">{formatXOF(Number(l.montant_ht))}</span>
                      </td>
                      {isBrouillon && (
                        <td className="px-2 py-4">
                          {deletingLigneId === l.id ? (
                            <span className="flex items-center gap-1">
                              <button
                                onClick={() => deleteLigneMut.mutate(l.id)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                                style={{ backgroundColor: 'var(--status-danger)' }}
                              >
                                Oui
                              </button>
                              <button
                                onClick={() => setDeletingLigneId(null)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-[--text-secondary] hover:bg-[--bg-elevated]"
                              >
                                Non
                              </button>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <button
                                onClick={() => setEditingLigne(l)}
                                className="p-1 rounded text-[--text-muted] hover:text-[--accent] hover:bg-[--accent-dim] transition-all"
                                title="Modifier"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={() => setDeletingLigneId(l.id)}
                                className="p-1 rounded text-[--text-muted] hover:text-[--status-danger] hover:bg-[--bg-elevated] transition-all"
                                title="Supprimer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {devis.lignes.length === 0 && (
                    <tr>
                      <td colSpan={isBrouillon ? 8 : 7} className="px-4 py-10 text-center">
                        <Package size={24} className="mx-auto mb-2 text-[--text-muted]" />
                        <p className="text-xs text-[--text-secondary]">Aucune ligne</p>
                        {isBrouillon && (
                          <button
                            onClick={() => setShowAddLigne(true)}
                            className="mt-2 text-xs text-[--accent] hover:underline"
                          >
                            + Ajouter une ligne
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {/* Total */}
              <div
                className="flex items-center justify-end gap-6 px-6 py-4 border-t"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
              >
                <span className="text-xs font-semibold text-[--text-secondary] uppercase tracking-wider">Total HT</span>
                <span className="font-data text-base font-bold text-[--text-primary]">{formatXOF(totalHT)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
