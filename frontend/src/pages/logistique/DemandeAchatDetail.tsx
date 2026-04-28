/**
 * MEPALE ERP — Détail d'une Demande d'Achat
 * Actions : Soumettre / Approuver / Refuser / Approuver direction / Convertir en BC
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ClipboardList, AlertTriangle, CheckCircle, XCircle,
  ShoppingCart, ShieldCheck, User, Calendar, CalendarCheck,
  Package, X, FileText, Pencil, GitBranch,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'
import { logistiqueApi, type StatutDA } from '@/services/logistique'
import { ModalModifierDA } from './ModalModifierDA'

// ─── Design tokens ─────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Config statuts ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutDA, { label: string; variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent' }> = {
  brouillon:         { label: 'Brouillon',         variant: 'neutral'  },
  soumise:           { label: 'Soumise',           variant: 'warning'  },
  approuvee:         { label: 'Approuvée',         variant: 'success'  },
  refusee:           { label: 'Refusée',           variant: 'danger'   },
  traitee:           { label: 'Traitée',           variant: 'info'     },
  attente_direction: { label: 'Attente direction', variant: 'accent'   },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
  accent = false,
  warning = false,
}: {
  icon:     React.ReactNode
  label:    string
  value:    React.ReactNode
  accent?:  boolean
  warning?: boolean
}) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span className="text-xs text-[--text-muted] w-28 flex-shrink-0 pt-px">{label}</span>
      <span
        className={cn(
          'text-xs font-medium flex-1',
          accent  && 'font-data font-semibold',
          warning && 'font-semibold',
        )}
        style={{
          color: warning ? 'var(--status-warning)' : accent ? 'var(--accent)' : 'var(--text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Modal Refuser ─────────────────────────────────────────────────────────────

function ModalRefuser({
  reference,
  onClose,
  onConfirm,
  isPending,
}: {
  reference: string
  onClose:   () => void
  onConfirm: (motif: string) => void
  isPending: boolean
}) {
  const [motif, setMotif] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
          maxHeight:       '90vh',
        }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
              <XCircle size={15} style={{ color: 'var(--status-danger)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Refuser la demande</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-5 flex-1 overflow-y-auto">
          <label className={FIELD_LABEL}>
            Motif du refus <span style={{ color: 'var(--status-danger)' }}>*</span>
          </label>
          <textarea
            value={motif}
            onChange={e => setMotif(e.target.value)}
            rows={3}
            placeholder="Expliquez la raison du refus…"
            className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
            autoFocus
          />
        </div>
        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <button
            onClick={() => onConfirm(motif)}
            disabled={isPending || !motif.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--status-danger)', color: '#fff' }}
          >
            <XCircle size={12} /> Refuser la DA
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Convertir en BC ─────────────────────────────────────────────────────

function ModalConvertir({
  reference,
  lignesCount,
  onClose,
  onConfirm,
  isPending,
  fournisseurs,
}: {
  reference:    string
  lignesCount:  number
  onClose:      () => void
  onConfirm:    (fournisseurId: string) => void
  isPending:    boolean
  fournisseurs: { id: string; raison_sociale: string }[] | undefined
}) {
  const [fournisseurId, setFournisseurId] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
          maxHeight:       '90vh',
        }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <ShoppingCart size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Convertir en bon de commande</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-5 flex flex-col gap-4 flex-1 overflow-y-auto">
          <p className="text-xs text-[--text-secondary] leading-relaxed">
            Un Bon de Commande sera généré avec toutes les lignes de cette DA
            {' '}({lignesCount} article{lignesCount > 1 ? 's' : ''}).
          </p>
          <div>
            <label className={FIELD_LABEL}>
              Fournisseur <span style={{ color: 'var(--status-danger)' }}>*</span>
            </label>
            <select
              className={SELECT_CLASS}
              style={{ height: '36px' }}
              value={fournisseurId}
              onChange={e => setFournisseurId(e.target.value)}
            >
              <option value="">— Sélectionner un fournisseur approuvé —</option>
              {(fournisseurs ?? []).map(f => (
                <option key={f.id} value={f.id}>{f.raison_sociale}</option>
              ))}
            </select>
          </div>
        </div>
        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            icon={<ShoppingCart size={13} />}
            onClick={() => {
              if (!fournisseurId) { toast.error('Veuillez sélectionner un fournisseur'); return }
              onConfirm(fournisseurId)
            }}
            loading={isPending}
          >
            Créer le BC
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

export function DemandeAchatDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [showRefuser,   setShowRefuser]   = useState(false)
  const [showConvertir, setShowConvertir] = useState(false)
  const [showModifier,  setShowModifier]  = useState(false)

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: da, isLoading } = useQuery({
    queryKey: ['demande-achat', id],
    queryFn:  () => logistiqueApi.getDemandeAchat(id!).then(r => r.data),
    enabled:  !!id,
  })

  const { data: fournisseurs } = useQuery({
    queryKey: ['fournisseurs-approuves'],
    queryFn:  () => logistiqueApi.listFournisseurs({ page_size: 200, qualification: 'approuve' }).then(r => r.data.results),
    enabled:  da?.statut === 'approuvee',
  })

  // ── Invalidation ─────────────────────────────────────────────────────────────

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['demande-achat', id] })
    qc.invalidateQueries({ queryKey: ['demandes-achat'] })
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const { mutate: soumettre, isPending: submitting } = useMutation({
    mutationFn: () => logistiqueApi.soumettreDA(id!),
    onSuccess:  () => { toast.success('DA soumise pour approbation'); inv() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: approuver, isPending: approving } = useMutation({
    mutationFn: () => logistiqueApi.approuverDA(id!),
    onSuccess:  () => { toast.success('DA approuvée'); inv() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: refuser, isPending: refusing } = useMutation({
    mutationFn: (motif: string) => logistiqueApi.refuserDA(id!, motif),
    onSuccess:  () => { toast.success('DA refusée'); inv(); setShowRefuser(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: convertir, isPending: converting } = useMutation({
    mutationFn: (fournisseurId: string) => logistiqueApi.convertirEnBC(id!, fournisseurId),
    onSuccess:  () => { toast.success('BC créé — DA traitée'); inv(); setShowConvertir(false) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la conversion'),
  })

  const { mutate: approuverDir, isPending: approvingDir } = useMutation({
    mutationFn: () => logistiqueApi.approuverDirection(id!),
    onSuccess:  () => { toast.success('DA approuvée par la Direction'); inv() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: reviser, isPending: revising } = useMutation({
    mutationFn: () => logistiqueApi.reviserDA(id!),
    onSuccess:  (res) => {
      toast.success(`Nouvelle version ${res.data.reference} créée.`)
      navigate(`/logistique/demandes-achat/${res.data.id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="skeleton h-7 w-7 rounded-lg" />
          <div className="skeleton h-6 w-48 rounded" />
        </div>
        <div className="surface p-6">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + i * 10}%` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!da) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <button
          onClick={() => navigate('/logistique/demandes-achat')}
          className="flex items-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-primary] transition-colors"
        >
          <ArrowLeft size={13} /> Demandes d'Achat
        </button>
        <div className="surface p-12 text-center">
          <ClipboardList size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm text-[--text-muted]">Demande d'achat introuvable.</p>
        </div>
      </div>
    )
  }

  const cfg        = STATUT_CFG[da.statut]
  const lignes     = da.lignes ?? []
  const montant    = da.montant_estime != null ? Number(da.montant_estime) : null
  const depasse    = montant != null && montant > 5_000_000

  return (
    <>
      {/* Modals — en dehors de animate-fade-in */}
      {showModifier && da && (
        <ModalModifierDA
          da={da}
          onClose={() => setShowModifier(false)}
        />
      )}
      {showRefuser && (
        <ModalRefuser
          reference={da.reference}
          onClose={() => setShowRefuser(false)}
          onConfirm={motif => refuser(motif)}
          isPending={refusing}
        />
      )}
      {showConvertir && (
        <ModalConvertir
          reference={da.reference}
          lignesCount={lignes.length}
          onClose={() => setShowConvertir(false)}
          onConfirm={fId => convertir(fId)}
          isPending={converting}
          fournisseurs={fournisseurs as any}
        />
      )}

      <div className="p-6 space-y-5 animate-fade-in">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            {/* Retour */}
            <button
              onClick={() => navigate('/logistique/demandes-achat')}
              className="mt-0.5 p-1.5 rounded-lg transition-all flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Retour à la liste"
            >
              <ArrowLeft size={13} />
            </button>

            <div>
              {/* Fil d'Ariane */}
              <p className="text-[10px] text-[--text-muted] uppercase tracking-wider mb-1">
                Logistique · Demandes d'Achat
              </p>
              {/* Titre */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold font-data text-[--accent]">{da.reference}</h1>
                {da.version > 1 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded font-data"
                    style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    V{da.version}
                  </span>
                )}
                <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                {da.urgence && (
                  <span
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--status-danger)' }}
                  >
                    <AlertTriangle size={9} /> URGENT
                  </span>
                )}
                {depasse && (
                  <span
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: 'var(--status-warning)' }}
                  >
                    {'>'} 5 M FCFA
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {da.peut_etre_modifie && (
              <Button
                variant="secondary" size="sm"
                icon={<Pencil size={13} />}
                onClick={() => setShowModifier(true)}
              >
                Modifier
              </Button>
            )}
            {da.statut === 'refusee' && (
              <Button
                variant="secondary" size="sm"
                icon={<GitBranch size={13} />}
                loading={revising}
                onClick={() => reviser()}
              >
                Nouvelle version
              </Button>
            )}
            {da.statut === 'brouillon' && (
              <Button
                variant="primary" size="sm"
                icon={<CheckCircle size={13} />}
                onClick={() => soumettre()}
                loading={submitting}
              >
                Soumettre
              </Button>
            )}
            {da.statut === 'soumise' && (
              <>
                <Button
                  variant="ghost" size="sm"
                  icon={<XCircle size={13} />}
                  onClick={() => setShowRefuser(true)}
                >
                  Refuser
                </Button>
                <Button
                  variant="primary" size="sm"
                  icon={<CheckCircle size={13} />}
                  onClick={() => approuver()}
                  loading={approving}
                >
                  Approuver
                </Button>
              </>
            )}
            {da.statut === 'attente_direction' && (
              <Button
                variant="primary" size="sm"
                icon={<ShieldCheck size={13} />}
                onClick={() => approuverDir()}
                loading={approvingDir}
              >
                Approuver (Direction)
              </Button>
            )}
            {da.statut === 'approuvee' && (
              <Button
                variant="primary" size="sm"
                icon={<ShoppingCart size={13} />}
                onClick={() => setShowConvertir(true)}
              >
                Convertir en BC
              </Button>
            )}
          </div>
        </div>

        {/* ── Info + Notes ─────────────────────────────────────────────────── */}
        <div className={cn('grid gap-4', da.notes ? 'grid-cols-2' : 'grid-cols-1')}>

          {/* Informations générales */}
          <div className="surface p-4">
            <h2
              className="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Informations
            </h2>
            <div>
              <InfoRow
                icon={<User size={12} />}
                label="Demandeur"
                value={da.demandeur_nom}
              />
              <InfoRow
                icon={<Calendar size={12} />}
                label="Créée le"
                value={formatDate(da.date_creation)}
              />
              {da.approuve_par_nom && (
                <InfoRow
                  icon={<CalendarCheck size={12} />}
                  label="Approuvée par"
                  value={da.approuve_par_nom}
                />
              )}
              {montant != null && (
                <InfoRow
                  icon={<Package size={12} />}
                  label="Montant estimé"
                  value={`${montant.toLocaleString('fr-FR')} FCFA`}
                  accent={!depasse}
                  warning={depasse}
                />
              )}
              <InfoRow
                icon={<Package size={12} />}
                label="Lignes"
                value={`${lignes.length} article${lignes.length > 1 ? 's' : ''}`}
              />
            </div>
          </div>

          {/* Notes */}
          {da.notes && (
            <div className="surface p-4">
              <h2
                className="text-[10px] font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-muted)' }}
              >
                <FileText size={11} className="inline mr-1.5 -mt-px" />
                Notes
              </h2>
              <p className="text-xs text-[--text-secondary] leading-relaxed whitespace-pre-wrap">{da.notes}</p>
            </div>
          )}
        </div>

        {/* ── Tableau des lignes ────────────────────────────────────────────── */}
        <div className="surface overflow-hidden">
          {/* Titre section */}
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
          >
            <h2 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Lignes de la demande
            </h2>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
            >
              {lignes.length} article{lignes.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  {[
                    'Article', 'Unité', 'Qté demandée',
                    'Qté commandée', 'Qté restante',
                    'Prix unit. estimé', 'Sous-total',
                  ].map(h => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <p className="text-xs text-[--text-muted]">Aucune ligne</p>
                    </td>
                  </tr>
                ) : lignes.map(ligne => {
                  const sousTotal = ligne.prix_unitaire_estime != null
                    ? ligne.prix_unitaire_estime * ligne.quantite
                    : null
                  const restante  = ligne.quantite_restante ?? ligne.quantite
                  const estTraitee = restante === 0

                  return (
                    <tr
                      key={ligne.id}
                      className="transition-colors hover:bg-[--bg-elevated]"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      {/* Article */}
                      <td className="px-6 py-5">
                        <div>
                          <p className="text-xs font-medium text-[--text-primary]">
                            {ligne.article_detail.designation}
                          </p>
                          <p className="text-[10px] font-data mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {ligne.article_detail.code}
                          </p>
                        </div>
                      </td>

                      {/* Unité */}
                      <td className="px-4 py-3 text-xs font-data text-[--text-secondary]">
                        {ligne.article_detail.unite_code}
                      </td>

                      {/* Qté demandée */}
                      <td className="px-4 py-3 text-xs font-data font-semibold text-[--text-primary]">
                        {ligne.quantite}
                      </td>

                      {/* Qté commandée */}
                      <td className="px-4 py-3 text-xs font-data text-[--text-secondary]">
                        {ligne.quantite_commandee ?? 0}
                      </td>

                      {/* Qté restante */}
                      <td className="px-6 py-5">
                        <span
                          className="text-xs font-data font-semibold"
                          style={{ color: estTraitee ? 'var(--status-success)' : 'var(--text-primary)' }}
                        >
                          {restante}
                        </span>
                        {estTraitee && (
                          <span
                            className="ml-1.5 text-[10px] font-semibold"
                            style={{ color: 'var(--status-success)' }}
                          >
                            ✓
                          </span>
                        )}
                      </td>

                      {/* Prix unit. */}
                      <td className="px-4 py-3 text-xs font-data text-[--text-secondary]">
                        {ligne.prix_unitaire_estime != null
                          ? `${Number(ligne.prix_unitaire_estime).toLocaleString('fr-FR')} FCFA`
                          : <span className="text-[--text-muted]">—</span>
                        }
                      </td>

                      {/* Sous-total */}
                      <td className="px-6 py-5">
                        {sousTotal != null
                          ? (
                            <span className="text-xs font-data font-semibold text-[--text-primary]">
                              {sousTotal.toLocaleString('fr-FR')} FCFA
                            </span>
                          )
                          : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Total */}
              {montant != null && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                    <td
                      colSpan={6}
                      className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Total estimé
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className="text-sm font-data font-bold"
                        style={{ color: depasse ? 'var(--status-warning)' : 'var(--accent)' }}
                      >
                        {montant.toLocaleString('fr-FR')} FCFA
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>
    </>
  )
}
