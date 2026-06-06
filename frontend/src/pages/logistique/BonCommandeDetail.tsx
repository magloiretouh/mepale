/**
 * MEPALE ERP — Détail d'un Bon de Commande
 * Actions : Envoyer / Confirmer / Annuler / Clôturer / Amender / PDF
 * Conditions tarifaires : add/remove (brouillon uniquement)
 */

import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, AlertTriangle, CheckCircle, XCircle, ShoppingBag,
  User, Calendar, MapPin, Building2, Package, ReceiptText,
  Clock, X, FileText, TrendingUp, TrendingDown, ExternalLink,
  Plus, Trash2, Percent, ChevronDown, ChevronRight, Download, Edit3,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'
import {
  logistiqueApi,
  type BonCommande, type LigneBonCommande, type StatutBC, type Reception,
  type ConditionTarifaire, type ConditionAppliqueeBC,
} from '@/services/logistique'
import { productionApi, type Article } from '@/services/production'

// ─── Design tokens ─────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

function applyAppliedConditions(base: number, conds: ConditionAppliqueeBC[]): number {
  let running = base
  for (const c of [...conds].sort((a, b) => a.ordre - b.ordre)) {
    const val = Number(c.valeur)
    const amt = c.mode_calcul_snapshot === 'pourcentage' ? running * val / 100 : val
    running = c.type_effet_snapshot === 'majoration' ? running + amt : Math.max(0, running - amt)
  }
  return running
}

// ─── Config statuts ────────────────────────────────────────────────────────────

type BadgeVariant = 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'

const STATUT_BC: Record<StatutBC, { label: string; variant: BadgeVariant }> = {
  brouillon: { label: 'Brouillon',             variant: 'neutral' },
  envoye:    { label: 'Envoyé',                variant: 'info'    },
  confirme:  { label: 'Confirmé fournisseur',  variant: 'accent'  },
  partiel:   { label: 'Partiellement reçu',    variant: 'warning' },
  recu:      { label: 'Reçu intégralement',    variant: 'success' },
  annule:    { label: 'Annulé',                variant: 'danger'  },
}

const STATUT_RECEP: Record<string, { label: string; variant: BadgeVariant }> = {
  en_cours: { label: 'En cours', variant: 'warning' },
  validee:  { label: 'Validée',  variant: 'success' },
  rejetee:  { label: 'Rejetée', variant: 'danger'  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon, label, value, accent = false, danger = false,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode
  accent?: boolean; danger?: boolean
}) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span className="text-xs text-[--text-muted] w-28 flex-shrink-0 pt-px">{label}</span>
      <span
        className={cn('text-xs font-medium flex-1', accent && 'font-data font-semibold')}
        style={{ color: danger ? 'var(--status-danger)' : accent ? 'var(--accent)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Modal Clôturer ────────────────────────────────────────────────────────────

function ModalCloturer({
  reference, onClose, onConfirm, isPending,
}: {
  reference: string; onClose: () => void
  onConfirm: (motif: string) => void; isPending: boolean
}) {
  const [motif, setMotif] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <CheckCircle size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Clôturer le BC</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-5 flex flex-col gap-4 flex-1 overflow-y-auto">
          <p className="text-xs text-[--text-secondary] leading-relaxed">
            Le BC sera marqué comme <strong>Reçu intégralement</strong>, même si certaines lignes n'ont pas été entièrement réceptionnées.
          </p>
          <div>
            <label className={FIELD_LABEL}>Motif (optionnel)</label>
            <textarea
              value={motif}
              onChange={e => setMotif(e.target.value)}
              rows={3}
              placeholder="Ex : Livraison partielle acceptée définitivement…"
              className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
            />
          </div>
        </div>
        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" icon={<CheckCircle size={12} />} loading={isPending} onClick={() => onConfirm(motif)}>
            Clôturer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Ajouter Condition ───────────────────────────────────────────────────

function ModalAjouterCondition({
  bcId, nextOrdre, onClose, onSuccess,
}: {
  bcId: string; nextOrdre: number
  onClose: () => void; onSuccess: () => void
}) {
  const [conditionId, setConditionId] = useState('')
  const [valeur,      setValeur]      = useState('')

  const { data: catalogRaw, isLoading: loadingCatalog } = useQuery({
    queryKey: ['conditions-tarifaires', 'bc'],
    queryFn:  () => logistiqueApi.listConditionsTarifaires({ actif: true, niveau: 'bc' })
                     .then(r => {
                       const d = r.data as unknown as { results?: ConditionTarifaire[] } | ConditionTarifaire[]
                       return Array.isArray(d) ? d : (d.results ?? [])
                     }),
  })
  const catalog = catalogRaw ?? []

  // Pre-fill valeur when condition selection changes
  useEffect(() => {
    if (!conditionId) return
    const found = catalog.find(c => c.id === conditionId)
    if (found) setValeur(String(found.valeur_defaut))
  }, [conditionId, catalog])

  const { mutate, isPending } = useMutation({
    mutationFn: () => logistiqueApi.createConditionBC({
      condition:    conditionId,
      bon_commande: bcId,
      ordre:        nextOrdre,
      valeur:       parseFloat(valeur),
    }),
    onSuccess: () => { toast.success('Condition ajoutée'); onSuccess() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const selectedCond = catalog.find(c => c.id === conditionId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Percent size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Ajouter une condition</h3>
              <p className="text-xs text-[--text-muted] mt-0.5">Conditions tarifaires du BC</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-5 flex-1 overflow-y-auto">

          {/* Condition selector */}
          <div>
            <label className={FIELD_LABEL}>Condition</label>
            {loadingCatalog ? (
              <div className="skeleton h-9 rounded-lg" />
            ) : catalog.length === 0 ? (
              <p className="text-xs text-[--text-muted] italic">
                Aucune condition de niveau BC disponible. Créez-en depuis Administration › Conditions tarifaires.
              </p>
            ) : (
              <select
                value={conditionId}
                onChange={e => setConditionId(e.target.value)}
                className={SELECT_CLASS}
                style={{ height: 38 }}
              >
                <option value="">— Sélectionner —</option>
                {catalog.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                    {c.mode_calcul === 'pourcentage' ? ` (${c.valeur_defaut} %)` : ` (${Number(c.valeur_defaut).toLocaleString('fr-FR')} FCFA)`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Value */}
          {conditionId && (
            <div>
              <label className={FIELD_LABEL}>
                Valeur
                {selectedCond?.mode_calcul === 'pourcentage' ? ' (%)' : ' (FCFA)'}
              </label>
              <Input
                type="number"
                value={valeur}
                onChange={e => setValeur(e.target.value)}
                placeholder={selectedCond?.mode_calcul === 'pourcentage' ? 'ex : 18' : 'ex : 50000'}
                min={0}
              />
              {selectedCond && (
                <p className="text-[10px] text-[--text-muted] mt-1.5">
                  {selectedCond.type_effet === 'majoration' ? '↑ Majoration' : '↓ Réduction'} ·&nbsp;
                  {selectedCond.mode_calcul === 'pourcentage' ? 'Pourcentage du montant courant' : 'Montant fixe'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            icon={<Plus size={12} />}
            loading={isPending}
            disabled={!conditionId || !valeur}
            onClick={() => mutate()}
          >
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Modifier BC (en-tête) ─────────────────────────────────────────────

function ModalModifierBC({
  bc, onClose, onConfirm, isPending,
}: {
  bc: BonCommande
  onClose: () => void
  onConfirm: (data: {
    fournisseur?: string; date_commande?: string
    date_livraison_prev?: string; adresse_livraison?: string; notes?: string
  }) => void
  isPending: boolean
}) {
  const [fournisseurId,  setFournisseurId]  = useState(bc.fournisseur)
  const [dateCommande,   setDateCommande]   = useState(bc.date_commande ?? '')
  const [dateLivraison,  setDateLivraison]  = useState(bc.date_livraison_prev ?? '')
  const [adresse,        setAdresse]        = useState(bc.adresse_livraison   ?? '')
  const [notes,          setNotes]          = useState(bc.notes               ?? '')

  const { data: fournisseursRaw } = useQuery({
    queryKey: ['fournisseurs-approuves'],
    queryFn:  () => logistiqueApi.listFournisseurs({ qualification: 'approuve', actif: true, page_size: 200 })
                     .then(r => r.data.results ?? r.data),
  })
  const fournisseurs = (fournisseursRaw ?? []) as Array<{ id: string; raison_sociale: string }>

  const handleConfirm = () => {
    onConfirm({
      fournisseur:        fournisseurId !== bc.fournisseur              ? fournisseurId : undefined,
      date_commande:      dateCommande  !== (bc.date_commande ?? '')    ? dateCommande  : undefined,
      date_livraison_prev: dateLivraison !== (bc.date_livraison_prev ?? '') ? dateLivraison || undefined : undefined,
      adresse_livraison:  adresse !== (bc.adresse_livraison ?? '')      ? adresse       : undefined,
      notes:              notes   !== (bc.notes ?? '')                  ? notes         : undefined,
    })
  }

  const hasChanges =
    fournisseurId !== bc.fournisseur ||
    dateCommande  !== (bc.date_commande ?? '')    ||
    dateLivraison !== (bc.date_livraison_prev ?? '') ||
    adresse       !== (bc.adresse_livraison   ?? '') ||
    notes         !== (bc.notes               ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Edit3 size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Modifier le BC</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{bc.reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5 flex-1 overflow-y-auto">
          <div>
            <label className={FIELD_LABEL}>Fournisseur</label>
            <select
              value={fournisseurId}
              onChange={e => setFournisseurId(e.target.value)}
              className={SELECT_CLASS}
              style={{ height: 38 }}
            >
              {fournisseurs.map(f => (
                <option key={f.id} value={f.id}>{f.raison_sociale}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={FIELD_LABEL}>Date de commande</label>
              <input type="date" value={dateCommande} onChange={e => setDateCommande(e.target.value)}
                className={SELECT_CLASS} style={{ height: 38 }} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Date livraison prévue</label>
              <input type="date" value={dateLivraison} onChange={e => setDateLivraison(e.target.value)}
                className={SELECT_CLASS} style={{ height: 38 }} />
            </div>
          </div>

          <div>
            <label className={FIELD_LABEL}>Adresse de livraison</label>
            <textarea
              value={adresse}
              onChange={e => setAdresse(e.target.value)}
              rows={2}
              placeholder="Laisser vide pour adresse par défaut"
              className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
            />
          </div>

          <div>
            <label className={FIELD_LABEL}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Observations ou instructions…"
              className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
            />
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" icon={<CheckCircle size={12} />}
            loading={isPending} disabled={!hasChanges} onClick={handleConfirm}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Ajouter Ligne ──────────────────────────────────────────────────────

function ModalAjouterLigne({
  bcId, fournisseurId, existingArticleIds, onClose, onSuccess,
}: {
  bcId: string; fournisseurId: string; existingArticleIds: string[]
  onClose: () => void; onSuccess: () => void
}) {
  const [articleId, setArticleId] = useState('')
  const [qte,       setQte]       = useState('')
  const [prix,      setPrix]      = useState('')

  const { data: articlesRaw, isLoading: loadingArticles } = useQuery({
    queryKey: ['articles-select'],
    queryFn:  () => productionApi.listArticles({ page_size: 500 }).then(r => r),
  })
  const articles = ((articlesRaw ?? []) as Article[]).filter(a => !existingArticleIds.includes(a.id))

  const { data: fournisseurArticlesRaw } = useQuery({
    queryKey: ['articles-fournisseur', fournisseurId],
    queryFn:  () => logistiqueApi.listArticlesFournisseur(fournisseurId).then(r => r.data.results ?? r.data),
    enabled:  !!fournisseurId,
  })
  const fournisseurPrix = (fournisseurArticlesRaw ?? []) as Array<{ article: string; prix_unitaire: number }>

  useEffect(() => {
    if (!articleId) return
    const fa = fournisseurPrix.find(f => f.article === articleId)
    if (fa) setPrix(String(fa.prix_unitaire))
  }, [articleId, fournisseurPrix])

  const selected = articles.find(a => a.id === articleId)

  const { mutate, isPending } = useMutation({
    mutationFn: () => logistiqueApi.createLigneBC({
      bon_commande:       bcId,
      article:            articleId,
      quantite_commandee: parseFloat(qte),
      prix_unitaire:      parseFloat(prix),
    }),
    onSuccess: () => { toast.success('Ligne ajoutée'); onSuccess() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? e?.response?.data?.non_field_errors?.[0] ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Package size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <h3 className="text-sm font-semibold text-[--text-primary]">Ajouter une ligne</h3>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5 flex-1 overflow-y-auto">
          <div>
            <label className={FIELD_LABEL}>Article</label>
            {loadingArticles ? (
              <div className="skeleton h-9 rounded-lg" />
            ) : (
              <select value={articleId} onChange={e => setArticleId(e.target.value)}
                className={SELECT_CLASS} style={{ height: 38 }}>
                <option value="">— Sélectionner —</option>
                {articles.map(a => (
                  <option key={a.id} value={a.id}>{a.designation} ({a.code})</option>
                ))}
              </select>
            )}
          </div>

          {articleId && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={FIELD_LABEL}>Quantité {selected ? `(${selected.unite_code})` : ''}</label>
                  <Input type="number" value={qte} onChange={e => setQte(e.target.value)} placeholder="0" min={0.001} step="any" />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Prix unitaire (FCFA)</label>
                  <Input type="number" value={prix} onChange={e => setPrix(e.target.value)} placeholder="0" min={0} step="any" />
                </div>
              </div>
              {qte && prix && (
                <p className="text-xs text-[--text-muted]">
                  Montant HT : <span className="font-data font-semibold text-[--text-primary]">
                    {(parseFloat(qte) * parseFloat(prix)).toLocaleString('fr-FR')} FCFA
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" icon={<Plus size={12} />}
            loading={isPending} disabled={!articleId || !qte || !prix} onClick={() => mutate()}>
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Modifier Ligne ─────────────────────────────────────────────────────

function ModalModifierLigne({
  ligne, onClose, onSuccess,
}: {
  ligne: { id: string; article_detail: { designation: string; unite_code: string }; quantite_commandee: number | string; prix_unitaire: number | string }
  onClose: () => void; onSuccess: () => void
}) {
  const [qte,  setQte]  = useState(String(ligne.quantite_commandee))
  const [prix, setPrix] = useState(String(ligne.prix_unitaire))

  const { mutate, isPending } = useMutation({
    mutationFn: () => logistiqueApi.updateLigneBC(ligne.id, {
      quantite_commandee: parseFloat(qte),
      prix_unitaire:      parseFloat(prix),
    }),
    onSuccess: () => { toast.success('Ligne mise à jour'); onSuccess() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Edit3 size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Modifier la ligne</h3>
              <p className="text-xs text-[--text-muted] mt-0.5">{ligne.article_detail.designation}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={FIELD_LABEL}>Quantité ({ligne.article_detail.unite_code})</label>
              <Input type="number" value={qte} onChange={e => setQte(e.target.value)} min={0.001} step="any" />
            </div>
            <div>
              <label className={FIELD_LABEL}>Prix unitaire (FCFA)</label>
              <Input type="number" value={prix} onChange={e => setPrix(e.target.value)} min={0} step="any" />
            </div>
          </div>
          {qte && prix && (
            <p className="text-xs text-[--text-muted]">
              Montant HT : <span className="font-data font-semibold text-[--text-primary]">
                {(parseFloat(qte) * parseFloat(prix)).toLocaleString('fr-FR')} FCFA
              </span>
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" icon={<CheckCircle size={12} />}
            loading={isPending} disabled={!qte || !prix} onClick={() => mutate()}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Amender ────────────────────────────────────────────────────────────

function ModalAmender({
  reference, bc, onClose, onConfirm, isPending,
}: {
  reference: string
  bc: Pick<BonCommande, 'date_livraison_prev' | 'adresse_livraison' | 'notes'>
  onClose: () => void
  onConfirm: (data: { date_livraison_prev?: string; adresse_livraison?: string; notes?: string; motif?: string }) => void
  isPending: boolean
}) {
  const [dateLivraison,  setDateLivraison]  = useState(bc.date_livraison_prev ?? '')
  const [adresse,        setAdresse]        = useState(bc.adresse_livraison   ?? '')
  const [notes,          setNotes]          = useState(bc.notes               ?? '')
  const [motif,          setMotif]          = useState('')

  const handleConfirm = () => {
    const data: Record<string, string> = {}
    if (dateLivraison !== (bc.date_livraison_prev ?? '')) data.date_livraison_prev = dateLivraison
    if (adresse       !== (bc.adresse_livraison   ?? '')) data.adresse_livraison   = adresse
    if (notes         !== (bc.notes               ?? '')) data.notes               = notes
    if (motif.trim())                                     data.motif               = motif.trim()
    onConfirm(data)
  }

  const hasChanges =
    dateLivraison !== (bc.date_livraison_prev ?? '') ||
    adresse       !== (bc.adresse_livraison   ?? '') ||
    notes         !== (bc.notes               ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Edit3 size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Amender le BC</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5 flex-1 overflow-y-auto">
          <p className="text-xs text-[--text-secondary] leading-relaxed">
            L'amendement incrémente le numéro de version du BC et trace les modifications. Seuls la date de livraison, l'adresse et les notes peuvent être modifiées.
          </p>

          <div>
            <label className={FIELD_LABEL}>Date de livraison prévue</label>
            <input
              type="date"
              value={dateLivraison}
              onChange={e => setDateLivraison(e.target.value)}
              className={SELECT_CLASS}
              style={{ height: 38 }}
            />
          </div>

          <div>
            <label className={FIELD_LABEL}>Adresse de livraison</label>
            <textarea
              value={adresse}
              onChange={e => setAdresse(e.target.value)}
              rows={2}
              placeholder="Ex : Entrepôt Nord, Zone Industrielle…"
              className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
            />
          </div>

          <div>
            <label className={FIELD_LABEL}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Observations ou instructions particulières…"
              className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
            />
          </div>

          <div>
            <label className={FIELD_LABEL}>Motif de l'amendement (optionnel)</label>
            <Input
              value={motif}
              onChange={e => setMotif(e.target.value)}
              placeholder="Ex : Changement de site de livraison"
            />
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            icon={<Edit3 size={12} />}
            loading={isPending}
            disabled={!hasChanges}
            onClick={handleConfirm}
          >
            Enregistrer l'amendement
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

export function BonCommandeDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [showCloturer,   setShowCloturer]   = useState(false)
  const [showAddCond,    setShowAddCond]    = useState(false)
  const [showAmender,    setShowAmender]    = useState(false)
  const [showModifierBC, setShowModifierBC] = useState(false)
  const [showAddLigne,   setShowAddLigne]   = useState(false)
  const [editingLigne,   setEditingLigne]   = useState<LigneBonCommande | null>(null)
  const [deletingLigne,  setDeletingLigne]  = useState<string | null>(null)
  const [deletingCond,   setDeletingCond]   = useState<string | null>(null)
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set())
  const [lineCondPick,  setLineCondPick]  = useState<Record<string, string>>({})
  const [lineCondVal,   setLineCondVal]   = useState<Record<string, string>>({})

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: bc, isLoading } = useQuery({
    queryKey: ['bon-commande', id],
    queryFn:  () => logistiqueApi.getBonCommande(id!).then(r => r.data),
    enabled:  !!id,
  })

  const isBrouillon = bc?.statut === 'brouillon'

  const { data: receptions = [] } = useQuery<Reception[]>({
    queryKey: ['receptions-bc', id],
    queryFn:  () => logistiqueApi.listReceptions({ bon_commande: id, page_size: 50 }).then(r => r.data.results),
    enabled:  !!id,
  })

  const { data: ligneCatalogRaw } = useQuery<ConditionTarifaire[]>({
    queryKey: ['conditions-tarifaires', 'ligne'],
    queryFn: () => logistiqueApi.listConditionsTarifaires({ actif: true, niveau: 'ligne' })
      .then(r => {
        const d = r.data as unknown as { results?: ConditionTarifaire[] } | ConditionTarifaire[]
        return Array.isArray(d) ? d : (d.results ?? [])
      }),
    enabled: !!bc && isBrouillon,
  })
  const ligneCatalog = ligneCatalogRaw ?? []

  // ── Invalidation ─────────────────────────────────────────────────────────────

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['bon-commande', id] })
    qc.invalidateQueries({ queryKey: ['bons-commande'] })
  }

  const toggleLine = (lineId: string) =>
    setExpandedLines(prev => {
      const n = new Set(prev); n.has(lineId) ? n.delete(lineId) : n.add(lineId); return n
    })

  // ── Mutations ────────────────────────────────────────────────────────────────

  const { mutate: envoyer,   isPending: sending    } = useMutation({
    mutationFn: () => logistiqueApi.envoyerBC(id!),
    onSuccess:  () => { toast.success('BC envoyé au fournisseur'); inv() },
  })
  const { mutate: confirmer, isPending: confirming } = useMutation({
    mutationFn: () => logistiqueApi.confirmerBC(id!),
    onSuccess:  () => { toast.success('BC confirmé par le fournisseur'); inv() },
  })
  const { mutate: annuler,   isPending: cancelling  } = useMutation({
    mutationFn: () => logistiqueApi.annulerBC(id!),
    onSuccess:  () => { toast.success('BC annulé'); inv() },
  })
  const { mutate: cloturer,  isPending: closing     } = useMutation({
    mutationFn: (motif: string) => logistiqueApi.cloturerBC(id!, motif || undefined),
    onSuccess:  () => { toast.success('BC clôturé'); inv(); setShowCloturer(false) },
  })
  const { mutate: updateBC, isPending: updatingBC } = useMutation({
    mutationFn: (data: Parameters<typeof logistiqueApi.updateBC>[1]) => logistiqueApi.updateBC(id!, data),
    onSuccess:  () => { toast.success('BC mis à jour'); inv(); setShowModifierBC(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: deleteLigne, isPending: deletingLignePending } = useMutation({
    mutationFn: (ligneId: string) => logistiqueApi.deleteLigneBC(ligneId),
    onSuccess:  () => { toast.success('Ligne supprimée'); inv(); setDeletingLigne(null) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: amender, isPending: amending } = useMutation({
    mutationFn: (data: { date_livraison_prev?: string; adresse_livraison?: string; notes?: string; motif?: string }) =>
      logistiqueApi.amenderBC(id!, data),
    onSuccess: () => { toast.success('BC amendé'); inv(); setShowAmender(false) },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: supprimerCond, isPending: deletingCondPending } = useMutation({
    mutationFn: (condId: string) => logistiqueApi.deleteConditionBC(condId),
    onSuccess:  () => { toast.success('Condition supprimée'); inv(); setDeletingCond(null) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: ajouterCondLigne, isPending: addingCondLigne } = useMutation({
    mutationFn: ({ ligneId, conditionId, ordre, valeur }: { ligneId: string; conditionId: string; ordre: number; valeur: number }) =>
      logistiqueApi.createConditionBC({ condition: conditionId, ligne_bc: ligneId, ordre, valeur }),
    onSuccess: (_data, vars) => {
      toast.success('Condition ajoutée')
      setLineCondPick(p => { const n = { ...p }; delete n[vars.ligneId]; return n })
      setLineCondVal(p => { const n = { ...p }; delete n[vars.ligneId]; return n })
      inv()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: supprimerCondLigne } = useMutation({
    mutationFn: (condId: string) => logistiqueApi.deleteConditionBC(condId),
    onSuccess: () => { toast.success('Condition supprimée'); inv() },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const handlePdf = () => {
    logistiqueApi.exportPdfBC(id!)
      .then(r => {
        const url = URL.createObjectURL(new Blob([r.data as BlobPart], { type: 'application/pdf' }))
        const a   = document.createElement('a')
        a.href = url; a.download = `BC_${bc?.reference ?? id}.pdf`; a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('Erreur lors de la génération du PDF'))
  }

  // ── Loading / Not found ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="skeleton h-7 w-7 rounded-lg" />
          <div className="skeleton h-6 w-48 rounded" />
        </div>
        <div className="surface p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-4 rounded mb-3" style={{ width: `${55 + i * 9}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!bc) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <button
          onClick={() => navigate('/logistique/bons-commande')}
          className="flex items-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-primary] transition-colors"
        >
          <ArrowLeft size={13} /> Bons de Commande
        </button>
        <div className="surface p-12 text-center">
          <ShoppingBag size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm text-[--text-muted]">Bon de commande introuvable.</p>
        </div>
      </div>
    )
  }

  const cfg        = STATUT_BC[bc.statut]
  const lignes     = bc.lignes     ?? []
  const conditions = bc.conditions ?? []
  const nextOrdre  = conditions.length > 0
    ? Math.max(...conditions.map(c => c.ordre)) + 1
    : 1

  return (
    <>
      {/* Modals — en dehors de animate-fade-in */}
      {showCloturer && (
        <ModalCloturer
          reference={bc.reference}
          onClose={() => setShowCloturer(false)}
          onConfirm={motif => cloturer(motif)}
          isPending={closing}
        />
      )}
      {showAddCond && (
        <ModalAjouterCondition
          bcId={id!}
          nextOrdre={nextOrdre}
          onClose={() => setShowAddCond(false)}
          onSuccess={() => { setShowAddCond(false); inv() }}
        />
      )}
      {showAmender && (
        <ModalAmender
          reference={bc.reference}
          bc={bc}
          onClose={() => setShowAmender(false)}
          onConfirm={data => amender(data)}
          isPending={amending}
        />
      )}
      {showModifierBC && (
        <ModalModifierBC
          bc={bc}
          onClose={() => setShowModifierBC(false)}
          onConfirm={data => updateBC(data)}
          isPending={updatingBC}
        />
      )}
      {showAddLigne && (
        <ModalAjouterLigne
          bcId={id!}
          fournisseurId={bc.fournisseur}
          existingArticleIds={lignes.map(l => l.article)}
          onClose={() => setShowAddLigne(false)}
          onSuccess={() => { setShowAddLigne(false); inv() }}
        />
      )}
      {editingLigne && (
        <ModalModifierLigne
          ligne={editingLigne}
          onClose={() => setEditingLigne(null)}
          onSuccess={() => { setEditingLigne(null); inv() }}
        />
      )}

      <div className="p-6 space-y-5 animate-fade-in">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/logistique/bons-commande')}
              className="mt-0.5 p-1.5 rounded-lg transition-all flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Retour à la liste"
            >
              <ArrowLeft size={13} />
            </button>
            <div>
              <p className="text-[10px] text-[--text-muted] uppercase tracking-wider mb-1">
                Logistique · Bons de Commande
              </p>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold font-data text-[--accent]">{bc.reference}</h1>
                {bc.version > 1 && (
                  <span
                    className="font-data text-[9px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                  >
                    v{bc.version}
                  </span>
                )}
                <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                {bc.est_en_retard && (
                  <span
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--status-danger)' }}
                  >
                    <AlertTriangle size={9} /> EN RETARD
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions selon statut */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">

            {/* PDF — tous les statuts */}
            <button
              onClick={handlePdf}
              title="Télécharger le PDF"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-all"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <Download size={13} /> PDF
            </button>

            {/* Amender — envoye | confirme | partiel */}
            {(bc.statut === 'envoye' || bc.statut === 'confirme' || bc.statut === 'partiel') && (
              <Button variant="secondary" size="sm" icon={<Edit3 size={13} />} onClick={() => setShowAmender(true)}>
                Amender
              </Button>
            )}

            {/* Annuler brouillon */}
            {bc.statut === 'brouillon' && (
              <Button variant="ghost" size="sm" icon={<XCircle size={13} />} loading={cancelling} onClick={() => annuler()}>
                Annuler
              </Button>
            )}

            {/* Envoyer — brouillon */}
            {bc.statut === 'brouillon' && (
              <Button variant="primary" size="sm" icon={<CheckCircle size={13} />} loading={sending} onClick={() => envoyer()}>
                Envoyer au fournisseur
              </Button>
            )}

            {/* envoye */}
            {bc.statut === 'envoye' && (
              <>
                <Button variant="ghost" size="sm" icon={<XCircle size={13} />} loading={cancelling} onClick={() => annuler()}>
                  Annuler
                </Button>
                <Button variant="primary" size="sm" icon={<CheckCircle size={13} />} loading={confirming} onClick={() => confirmer()}>
                  Confirmé par le fournisseur
                </Button>
              </>
            )}

            {/* confirme */}
            {bc.statut === 'confirme' && (
              <>
                <Button variant="ghost" size="sm" icon={<XCircle size={13} />} loading={cancelling} onClick={() => annuler()}>
                  Annuler
                </Button>
                <Button variant="outline" size="sm" icon={<CheckCircle size={13} />} onClick={() => setShowCloturer(true)}>
                  Clôturer
                </Button>
              </>
            )}

            {/* partiel */}
            {bc.statut === 'partiel' && (
              <Button variant="outline" size="sm" icon={<CheckCircle size={13} />} onClick={() => setShowCloturer(true)}>
                Clôturer manuellement
              </Button>
            )}
          </div>
        </div>

        {/* ── Info + Montants ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">

          {/* Informations */}
          <div className="surface p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Informations
              </h2>
              {isBrouillon && (
                <button
                  onClick={() => setShowModifierBC(true)}
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded transition-all"
                  style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-dim)' }}
                >
                  <Edit3 size={10} /> Modifier
                </button>
              )}
            </div>
            <InfoRow icon={<Building2 size={12} />} label="Fournisseur"   value={bc.fournisseur_detail.raison_sociale} />
            <InfoRow icon={<Calendar size={12} />}  label="Commandé le"   value={formatDate(bc.date_commande)} />
            <InfoRow
              icon={<Clock size={12} />}
              label="Livraison prévue"
              value={bc.date_livraison_prev ? formatDate(bc.date_livraison_prev) : '—'}
              danger={bc.est_en_retard}
            />
            <InfoRow icon={<MapPin size={12} />}  label="Adresse"        value={bc.adresse_livraison || '—'} />
            <InfoRow icon={<User size={12} />}      label="Créé par"       value={bc.cree_par_nom ?? '—'} />
            <InfoRow icon={<Calendar size={12} />}  label="Créé le"        value={formatDate(bc.date_creation)} />
            <InfoRow icon={<Package size={12} />}   label="Lignes"         value={`${lignes.length} article${lignes.length > 1 ? 's' : ''}`} />
          </div>

          {/* Montants */}
          <div className="surface p-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              Montants
            </h2>
            <InfoRow
              icon={<ReceiptText size={12} />}
              label="Sous-total HT"
              value={`${Number(bc.montant_ht).toLocaleString('fr-FR')} FCFA`}
            />
            {conditions.map(c => (
              <InfoRow
                key={c.id}
                icon={c.type_effet_snapshot === 'majoration'
                  ? <TrendingUp  size={12} style={{ color: 'var(--status-warning)' }} />
                  : <TrendingDown size={12} style={{ color: 'var(--status-success)' }} />
                }
                label={c.nom_snapshot}
                value={
                  c.mode_calcul_snapshot === 'pourcentage'
                    ? `${Number(c.valeur).toLocaleString('fr-FR')} %`
                    : `${Number(c.valeur).toLocaleString('fr-FR')} FCFA`
                }
              />
            ))}
            <InfoRow
              icon={<ReceiptText size={12} />}
              label="Total TTC"
              value={`${Number(bc.montant_ttc).toLocaleString('fr-FR')} FCFA`}
              accent
            />
            {bc.montant_ttc_facture > 0 && (
              <InfoRow
                icon={<FileText size={12} />}
                label="Facturé TTC"
                value={`${Number(bc.montant_ttc_facture).toLocaleString('fr-FR')} FCFA`}
              />
            )}
          </div>
        </div>

        {/* ── Lignes du BC ─────────────────────────────────────────────────── */}
        <div className="surface overflow-hidden">
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
          >
            <h2 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Lignes du bon de commande
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
                {lignes.length} article{lignes.length > 1 ? 's' : ''}
              </span>
              {isBrouillon && (
                <button
                  onClick={() => setShowAddLigne(true)}
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded transition-all"
                  style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-dim)', border: '1px solid var(--accent)' }}
                >
                  <Plus size={10} /> Ajouter
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 860 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  {['Article', 'Unité', 'Commandée', 'Reçue', 'Restante', 'Prix unit. HT', 'Montant HT', 'Cond.', 'Net ligne', ...(isBrouillon ? [''] : [])].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => {
                  const lineConds  = (l.conditions ?? []).slice().sort((a, b) => a.ordre - b.ordre)
                  const rawHT      = Number(l.montant_ht)
                  const netLigne   = applyAppliedConditions(rawHT, lineConds)
                  const hasConds   = lineConds.length > 0
                  const isExpanded = expandedLines.has(l.id)
                  const restante   = Number(l.quantite_restante)
                  const estRecu    = restante <= 0

                  // Inline add condition state (brouillon only)
                  const pickId  = lineCondPick[l.id] ?? ''
                  const pickVal = lineCondVal[l.id]  ?? ''
                  const pickedCond = ligneCatalog.find(c => c.id === pickId)
                  const lineNextOrdre = lineConds.length > 0
                    ? Math.max(...lineConds.map(c => c.ordre)) + 1 : 1

                  return (
                    <Fragment key={l.id}>
                      {/* ── Main row ── */}
                      <tr className="transition-colors hover:bg-[--bg-elevated]" style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)' }}>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-[--text-primary]">{l.article_detail.designation}</p>
                          <p className="text-[10px] font-data mt-0.5" style={{ color: 'var(--text-muted)' }}>{l.article_detail.code}</p>
                        </td>
                        <td className="px-4 py-3 text-xs font-data text-[--text-secondary]">{l.article_detail.unite_code}</td>
                        <td className="px-4 py-3 text-xs font-data font-semibold text-[--text-primary]">
                          {Number(l.quantite_commandee).toLocaleString('fr-FR')}
                        </td>
                        <td className="px-4 py-3 text-xs font-data text-[--text-secondary]">
                          {Number(l.quantite_recue).toLocaleString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-data font-semibold"
                            style={{ color: estRecu ? 'var(--status-success)' : 'var(--text-primary)' }}>
                            {restante.toLocaleString('fr-FR')}
                          </span>
                          {estRecu && <span className="ml-1 text-[10px]" style={{ color: 'var(--status-success)' }}>✓</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-data text-[--text-secondary]">
                          {Number(l.prix_unitaire).toLocaleString('fr-FR')} FCFA
                        </td>
                        <td className="px-4 py-3 text-xs font-data font-semibold text-[--text-primary]">
                          {rawHT.toLocaleString('fr-FR')} FCFA
                        </td>
                        {/* Cond. toggle */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleLine(l.id)}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-all"
                            style={{
                              backgroundColor: hasConds ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                              color: hasConds ? 'var(--accent)' : 'var(--text-muted)',
                              border: `1px solid ${hasConds ? 'var(--accent)' : 'var(--border)'}`,
                            }}
                            title={isExpanded ? 'Masquer les conditions' : 'Voir les conditions'}
                          >
                            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            {hasConds ? lineConds.length : (isBrouillon ? '+' : '0')}
                          </button>
                        </td>
                        {/* Net ligne */}
                        <td className="px-4 py-3 text-xs font-data font-semibold">
                          <span style={{ color: hasConds ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {netLigne.toLocaleString('fr-FR')} FCFA
                          </span>
                        </td>
                        {/* Actions brouillon */}
                        {isBrouillon && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEditingLigne(l)}
                                className="p-1.5 rounded transition-all"
                                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}
                                title="Modifier la ligne"
                              >
                                <Edit3 size={11} />
                              </button>
                              {deletingLigne === l.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => deleteLigne(l.id)}
                                    className="p-1.5 rounded text-white text-[10px] font-medium px-2"
                                    style={{ backgroundColor: 'var(--status-danger)' }}
                                  >
                                    {deletingLignePending ? '…' : 'Oui'}
                                  </button>
                                  <button
                                    onClick={() => setDeletingLigne(null)}
                                    className="p-1.5 rounded text-[10px] font-medium px-2"
                                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                                  >
                                    Non
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeletingLigne(l.id)}
                                  className="p-1.5 rounded transition-all"
                                  style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}
                                  title="Supprimer la ligne"
                                  disabled={Number(l.quantite_recue) > 0}
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* ── Expansion row ── */}
                      {isExpanded && (
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td colSpan={isBrouillon ? 10 : 9} className="px-4 pb-3 pt-0">
                            <div
                              className="rounded-lg p-3"
                              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                            >
                              {/* Existing conditions */}
                              {lineConds.length === 0 && !isBrouillon && (
                                <p className="text-[10px] text-[--text-muted] italic">Aucune condition appliquée à cette ligne.</p>
                              )}
                              {lineConds.map((c, ci) => {
                                const isMaj = c.type_effet_snapshot === 'majoration'
                                return (
                                  <div
                                    key={c.id}
                                    className="flex items-center gap-2 py-1.5"
                                    style={{ borderBottom: ci < lineConds.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                                  >
                                    <div
                                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: isMaj ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)' }}
                                    >
                                      {isMaj
                                        ? <TrendingUp  size={10} style={{ color: 'var(--status-warning)' }} />
                                        : <TrendingDown size={10} style={{ color: 'var(--status-success)' }} />
                                      }
                                    </div>
                                    <span className="text-xs text-[--text-primary] flex-1">{c.nom_snapshot}</span>
                                    <span className="font-data text-xs font-semibold flex-shrink-0"
                                      style={{ color: isMaj ? 'var(--status-warning)' : 'var(--status-success)' }}>
                                      {isMaj ? '+' : '−'}{Number(c.valeur).toLocaleString('fr-FR')}
                                      {c.mode_calcul_snapshot === 'pourcentage' ? ' %' : ' FCFA'}
                                    </span>
                                    {isBrouillon && (
                                      <button
                                        onClick={() => supprimerCondLigne(c.id)}
                                        className="p-1 rounded transition-all flex-shrink-0"
                                        style={{ color: 'var(--text-muted)' }}
                                        title="Supprimer"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                )
                              })}

                              {/* Net ligne recap */}
                              {hasConds && (
                                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                                  <span className="text-[10px] text-[--text-muted] uppercase tracking-wider font-semibold">Net ligne</span>
                                  <span className="font-data text-xs font-bold" style={{ color: 'var(--accent)' }}>
                                    {netLigne.toLocaleString('fr-FR')} FCFA
                                  </span>
                                </div>
                              )}

                              {/* Add condition (brouillon only) */}
                              {isBrouillon && (
                                <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: hasConds || lineConds.length === 0 ? '1px solid var(--border-subtle)' : 'none' }}>
                                  <select
                                    value={pickId}
                                    onChange={e => {
                                      const cid = e.target.value
                                      setLineCondPick(p => ({ ...p, [l.id]: cid }))
                                      const found = ligneCatalog.find(c => c.id === cid)
                                      setLineCondVal(p => ({ ...p, [l.id]: found ? String(found.valeur_defaut) : '' }))
                                    }}
                                    className={cn(SELECT_CLASS, 'flex-1')}
                                    style={{ height: 30, fontSize: 11 }}
                                  >
                                    <option value="">— Ajouter une condition —</option>
                                    {ligneCatalog.map(c => (
                                      <option key={c.id} value={c.id}>
                                        {c.nom}{c.mode_calcul === 'pourcentage' ? ` (${c.valeur_defaut} %)` : ` (${Number(c.valeur_defaut).toLocaleString('fr-FR')} FCFA)`}
                                      </option>
                                    ))}
                                  </select>
                                  {pickId && (
                                    <input
                                      type="number"
                                      value={pickVal}
                                      onChange={e => setLineCondVal(p => ({ ...p, [l.id]: e.target.value }))}
                                      placeholder={pickedCond?.mode_calcul === 'pourcentage' ? '%' : 'FCFA'}
                                      min={0}
                                      className={cn(SELECT_CLASS, 'w-20')}
                                      style={{ height: 30, fontSize: 11 }}
                                    />
                                  )}
                                  <Button
                                    variant="primary" size="xs"
                                    disabled={!pickId || !pickVal || addingCondLigne}
                                    loading={addingCondLigne}
                                    onClick={() => {
                                      if (!pickId || !pickVal) return
                                      ajouterCondLigne({
                                        ligneId: l.id,
                                        conditionId: pickId,
                                        ordre: lineNextOrdre,
                                        valeur: parseFloat(pickVal),
                                      })
                                    }}
                                  >
                                    Ajouter
                                  </Button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  <td colSpan={isBrouillon ? 9 : 8} className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Total HT
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-data font-bold" style={{ color: 'var(--text-primary)' }}>
                      {Number(bc.montant_ht).toLocaleString('fr-FR')} FCFA
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Conditions tarifaires ─────────────────────────────────────────── */}
        <div className="surface overflow-hidden">
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Conditions tarifaires
              </h2>
              {conditions.length > 0 && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                >
                  {conditions.length}
                </span>
              )}
            </div>
            {isBrouillon && (
              <Button
                variant="ghost" size="xs"
                icon={<Plus size={11} />}
                onClick={() => setShowAddCond(true)}
              >
                Ajouter
              </Button>
            )}
          </div>

          {conditions.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Percent size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs text-[--text-muted]">
                {isBrouillon
                  ? 'Aucune condition tarifaire appliquée. Cliquez sur « Ajouter » pour en appliquer une (TVA, remise…).'
                  : 'Aucune condition tarifaire appliquée à ce BC.'}
              </p>
            </div>
          ) : (
            <div>
              {conditions
                .slice()
                .sort((a, b) => a.ordre - b.ordre)
                .map((c, idx) => {
                  const isMaj = c.type_effet_snapshot === 'majoration'
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: idx < conditions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                    >
                      {/* Effet icon */}
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: isMaj ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                        }}
                      >
                        {isMaj
                          ? <TrendingUp  size={13} style={{ color: 'var(--status-warning)' }} />
                          : <TrendingDown size={13} style={{ color: 'var(--status-success)' }} />
                        }
                      </div>

                      {/* Name + type */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[--text-primary]">{c.nom_snapshot}</p>
                        <p className="text-[10px] text-[--text-muted] mt-0.5">
                          {isMaj ? 'Majoration' : 'Réduction'} ·&nbsp;
                          {c.mode_calcul_snapshot === 'pourcentage' ? 'Pourcentage' : 'Montant fixe'} ·&nbsp;
                          Ordre {c.ordre}
                        </p>
                      </div>

                      {/* Value */}
                      <span className="font-data text-sm font-semibold flex-shrink-0"
                        style={{ color: isMaj ? 'var(--status-warning)' : 'var(--status-success)' }}
                      >
                        {isMaj ? '+' : '−'}{Number(c.valeur).toLocaleString('fr-FR')}
                        {c.mode_calcul_snapshot === 'pourcentage' ? ' %' : ' FCFA'}
                      </span>

                      {/* Delete (brouillon only) */}
                      {isBrouillon && (
                        <button
                          onClick={() => {
                            if (deletingCond === c.id) return
                            setDeletingCond(c.id)
                            supprimerCond(c.id)
                          }}
                          disabled={deletingCondPending && deletingCond === c.id}
                          className="p-1.5 rounded-md transition-all flex-shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                          title="Supprimer cette condition"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )
                })}

              {/* Summary row */}
              <div
                className="flex items-center justify-between px-4 py-3 border-t"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Total TTC
                </span>
                <span className="font-data text-sm font-bold" style={{ color: 'var(--accent)' }}>
                  {Number(bc.montant_ttc).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Réceptions liées ─────────────────────────────────────────────── */}
        {receptions.length > 0 && (
          <div className="surface overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Réceptions ({receptions.length})
              </h2>
            </div>
            <div>
              {receptions.map((r, idx) => {
                const rcfg = STATUT_RECEP[r.statut] ?? { label: r.statut_label, variant: 'neutral' as BadgeVariant }
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-[--bg-elevated] transition-colors cursor-pointer group"
                    style={{ borderBottom: idx < receptions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                    onClick={() => navigate(`/logistique/receptions/${r.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-data text-xs font-semibold" style={{ color: 'var(--accent)' }}>{r.reference}</span>
                      <Badge variant={rcfg.variant}>{rcfg.label}</Badge>
                      {r.nb_lignes_nc > 0 && (
                        <span className="text-[10px] font-semibold" style={{ color: 'var(--status-warning)' }}>
                          {r.nb_lignes_nc} NC
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[--text-muted] font-data">{formatDate(r.date_reception)}</span>
                      {r.jours_retard != null && r.jours_retard > 0 && (
                        <span className="text-[10px] font-semibold" style={{ color: 'var(--status-danger)' }}>
                          +{r.jours_retard}j
                        </span>
                      )}
                      <ExternalLink size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        {bc.notes && (
          <div className="surface p-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              <FileText size={11} className="inline mr-1.5 -mt-px" />
              Notes
            </h2>
            <p className="text-xs text-[--text-secondary] leading-relaxed whitespace-pre-wrap">{bc.notes}</p>
          </div>
        )}

      </div>
    </>
  )
}
