/**
 * MEPALE ERP — Détail d'une Facture Fournisseur
 * Workflow : Brouillon → Soumise → (Attente direction) → En attente → Payée
 * Actions : Soumettre, Approuver, Rejeter, Annuler, Payer, Annuler paiement
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, FileText, CreditCard, CheckCircle2, XCircle,
  Calendar, Building2, Link2, FileX2, AlertCircle, Wallet,
  Ban, X, Send, ShieldCheck, ReceiptText, Clock,
  AlertTriangle, Banknote,
} from 'lucide-react'
import { toast }   from 'sonner'
import { Badge }   from '@/components/ui/Badge'
import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { cn, formatDate, formatXOF } from '@/lib/utils'
import {
  logistiqueApi,
  type StatutFacture, type ModePaiement, type PaiementFacture,
} from '@/services/logistique'

// ─── Design tokens ─────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Config statuts ────────────────────────────────────────────────────────────

type BadgeVariant = 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'

const STATUT_CONFIG: Record<StatutFacture, { label: string; variant: BadgeVariant }> = {
  brouillon:           { label: 'Brouillon',           variant: 'neutral' },
  soumise:             { label: 'Soumise',              variant: 'info'    },
  attente_direction:   { label: 'Attente direction',    variant: 'warning' },
  rejetee:             { label: 'Rejetée',              variant: 'danger'  },
  en_attente:          { label: 'En attente paiement',  variant: 'warning' },
  partiellement_payee: { label: 'Partiellement payée',  variant: 'neutral' },
  payee:               { label: 'Payée',                variant: 'success' },
  annulee:             { label: 'Annulée',              variant: 'danger'  },
}

const MODE_PAIEMENT_OPTIONS: { value: ModePaiement; label: string }[] = [
  { value: 'virement',     label: 'Virement bancaire' },
  { value: 'cheque',       label: 'Chèque'            },
  { value: 'especes',      label: 'Espèces'           },
  { value: 'mobile_money', label: 'Mobile Money'      },
]

// ─── Modal Payer ───────────────────────────────────────────────────────────────

function ModalPayer({
  factureId,
  montantRestant,
  reference,
  onClose,
}: {
  factureId: string
  montantRestant: number
  reference: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [montant,  setMontant]  = useState('')
  const [mode,     setMode]     = useState<ModePaiement>('virement')
  const [refPaie,  setRefPaie]  = useState('')
  const [datePaie, setDatePaie] = useState(new Date().toISOString().slice(0, 10))

  const payerMut = useMutation({
    mutationFn: () => logistiqueApi.enregistrerPaiement(factureId, {
      montant:            parseFloat(montant),
      mode_paiement:      mode,
      reference_paiement: refPaie || undefined,
      date_paiement:      datePaie,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facture', factureId] })
      qc.invalidateQueries({ queryKey: ['factures'] })
      toast.success('Paiement enregistré')
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors du paiement'),
  })

  const handleSubmit = () => {
    const m = parseFloat(montant)
    if (!m || m <= 0) { toast.error('Montant invalide'); return }
    if (m > montantRestant) {
      toast.error(`Le montant dépasse le solde restant (${formatXOF(montantRestant)})`)
      return
    }
    payerMut.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
          maxHeight:       '90vh',
        }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <CreditCard size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Enregistrer un paiement</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-4">
            <div
              className="flex items-center justify-between px-4 py-3 rounded-lg"
              style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <span className="text-xs text-[--text-muted]">Solde restant à payer</span>
              <span className="font-data text-sm font-bold" style={{ color: 'var(--status-danger)' }}>
                {formatXOF(montantRestant)}
              </span>
            </div>

            <div>
              <label className={FIELD_LABEL}>
                Montant (FCFA) <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <Input
                type="number" placeholder="0" value={montant}
                onChange={e => setMontant(e.target.value)}
                min={0} max={montantRestant} className="font-data"
              />
              <button
                className="mt-1.5 text-[10px] font-medium"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                onClick={() => setMontant(montantRestant.toString())}
              >
                Tout régler ({formatXOF(montantRestant)})
              </button>
            </div>

            <div>
              <label className={FIELD_LABEL}>
                Date du paiement <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <Input type="date" value={datePaie} onChange={e => setDatePaie(e.target.value)} />
            </div>

            <div>
              <label className={FIELD_LABEL}>
                Mode de paiement <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <select
                value={mode} onChange={e => setMode(e.target.value as ModePaiement)}
                className={SELECT_CLASS} style={{ height: '36px' }}
              >
                {MODE_PAIEMENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={FIELD_LABEL}>Référence paiement</label>
              <Input
                placeholder="N° chèque, référence virement…"
                value={refPaie} onChange={e => setRefPaie(e.target.value)}
                className="font-data"
              />
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            loading={payerMut.isPending}
            icon={<CreditCard size={13} />}
            onClick={handleSubmit}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Rejeter ─────────────────────────────────────────────────────────────

function ModalRejeter({
  onClose,
  onConfirm,
  isPending,
}: {
  onClose: () => void
  onConfirm: (motif: string) => void
  isPending: boolean
}) {
  const [motif, setMotif] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
        }}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
              <XCircle size={16} style={{ color: 'var(--status-danger)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Rejeter la facture</h3>
              <p className="text-xs text-[--text-muted] mt-0.5">Indiquez le motif du rejet</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5">
          <label className={FIELD_LABEL}>Motif du rejet <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <textarea
            value={motif}
            onChange={e => setMotif(e.target.value)}
            rows={3}
            placeholder="Expliquez la raison du rejet…"
            className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
          />
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="danger" size="sm"
            loading={isPending}
            disabled={!motif.trim()}
            icon={<XCircle size={13} />}
            onClick={() => onConfirm(motif.trim())}
          >
            Rejeter
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

export function FactureDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [showPayer,   setShowPayer]   = useState(false)
  const [showRejeter, setShowRejeter] = useState(false)

  // ── Chargement ──────────────────────────────────────────────────────────────

  const { data: facture, isLoading, isError } = useQuery({
    queryKey: ['facture', id],
    queryFn:  () => logistiqueApi.getFacture(id!).then(r => r.data),
    enabled:  !!id,
  })

  // ── Mutations workflow ───────────────────────────────────────────────────────

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['facture', id] })
    qc.invalidateQueries({ queryKey: ['factures'] })
  }

  const soumettreM = useMutation({
    mutationFn: () => logistiqueApi.soumettreFacture(id!),
    onSuccess: (r) => { toast.success(r.data.detail); invalidateAll() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const approuverM = useMutation({
    mutationFn: () => logistiqueApi.approuverFacture(id!),
    onSuccess: (r) => { toast.success(r.data.detail); invalidateAll() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const approuverDirectionM = useMutation({
    mutationFn: () => logistiqueApi.approuverDirectionFacture(id!),
    onSuccess: (r) => { toast.success(r.data.detail); invalidateAll() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const rejeterM = useMutation({
    mutationFn: (motif: string) => logistiqueApi.rejeterFacture(id!, motif),
    onSuccess: (r) => {
      toast.success(r.data.detail)
      invalidateAll()
      setShowRejeter(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const annulerM = useMutation({
    mutationFn: () => logistiqueApi.annulerFacture(id!),
    onSuccess: (r) => { toast.success(r.data.detail); invalidateAll() },
    onError:   (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const annulerPaiementM = useMutation({
    mutationFn: (paiementId: string) => logistiqueApi.annulerPaiement(id!, paiementId),
    onSuccess: () => {
      toast.success('Paiement annulé')
      qc.invalidateQueries({ queryKey: ['facture', id] })
      qc.invalidateQueries({ queryKey: ['factures'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  // ── États dérivés ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 rounded-lg" />
          <div className="skeleton h-5 w-48 rounded" />
        </div>
        <div className="surface p-6">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + i * 5}%` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError || !facture) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle size={32} className="text-[--text-muted]" />
        <p className="text-sm text-[--text-secondary]">Facture introuvable</p>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={() => navigate('/logistique/factures')}>
          Retour
        </Button>
      </div>
    )
  }

  const cfg      = STATUT_CONFIG[facture.statut]
  const payable  = facture.statut === 'en_attente' || facture.statut === 'partiellement_payee'
  const enRetard = facture.est_en_retard ?? false

  const paiementsActifs = (facture.paiements ?? []).filter(p => !p.annule)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {showPayer && (
        <ModalPayer
          factureId={id!}
          montantRestant={facture.montant_restant}
          reference={facture.reference}
          onClose={() => setShowPayer(false)}
        />
      )}
      {showRejeter && (
        <ModalRejeter
          onClose={() => setShowRejeter(false)}
          onConfirm={(motif) => rejeterM.mutate(motif)}
          isPending={rejeterM.isPending}
        />
      )}

      <div className="p-6 space-y-4 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/logistique/factures')}
              className="mt-0.5 p-1.5 rounded-lg transition-colors hover:bg-[--bg-elevated] text-[--text-muted] hover:text-[--text-primary]"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[--text-muted]">Factures /</span>
                <span className="font-data text-sm font-bold text-[--text-primary]">{facture.reference}</span>
                {/* Type */}
                {facture.bon_commande ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    <Link2 size={9} /> Lié BC
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  >
                    <FileX2 size={9} /> Directe
                  </span>
                )}
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
                {enRetard && payable && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--status-danger)' }}
                  >
                    <AlertCircle size={9} /> En retard
                  </span>
                )}
              </div>
              <p className="text-xs text-[--text-muted] mt-1">
                Créée le {formatDate(facture.date_creation)}
                {facture.fournisseur_detail && (
                  <> · {facture.fournisseur_detail.raison_sociale}</>
                )}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {facture.statut === 'brouillon' && (
              <Button
                variant="primary" size="sm"
                icon={<Send size={13} />}
                loading={soumettreM.isPending}
                onClick={() => soumettreM.mutate()}
              >
                Soumettre
              </Button>
            )}

            {facture.statut === 'soumise' && (
              <>
                <Button
                  variant="ghost" size="sm"
                  icon={<XCircle size={13} />}
                  onClick={() => setShowRejeter(true)}
                >
                  Rejeter
                </Button>
                <Button
                  variant="primary" size="sm"
                  icon={<CheckCircle2 size={13} />}
                  loading={approuverM.isPending}
                  onClick={() => approuverM.mutate()}
                >
                  Approuver
                </Button>
              </>
            )}

            {facture.statut === 'attente_direction' && (
              <>
                <Button
                  variant="ghost" size="sm"
                  icon={<XCircle size={13} />}
                  onClick={() => setShowRejeter(true)}
                >
                  Rejeter
                </Button>
                <Button
                  variant="primary" size="sm"
                  icon={<ShieldCheck size={13} />}
                  loading={approuverDirectionM.isPending}
                  onClick={() => approuverDirectionM.mutate()}
                >
                  Approuver (Direction)
                </Button>
              </>
            )}

            {payable && (
              <>
                <Button
                  variant="ghost" size="sm"
                  icon={<Ban size={13} />}
                  loading={annulerM.isPending}
                  onClick={() => annulerM.mutate()}
                >
                  Annuler
                </Button>
                <Button
                  variant="primary" size="sm"
                  icon={<CreditCard size={13} />}
                  onClick={() => setShowPayer(true)}
                >
                  Enregistrer un paiement
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Grille principale : infos + montants ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Infos (2/3) */}
          <div className="lg:col-span-2 surface p-5">
            <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-4">
              Informations
            </p>
            <div className="flex flex-col">

              {/* Fournisseur */}
              <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <Building2 size={13} className="mt-0.5 flex-shrink-0 text-[--text-muted]" />
                <span className="text-xs text-[--text-muted] w-32 flex-shrink-0">Fournisseur</span>
                <span className="text-xs font-semibold text-[--text-primary]">
                  {facture.fournisseur_detail.raison_sociale}
                  <span className="ml-1.5 font-data text-[10px] text-[--text-muted] font-normal">
                    {facture.fournisseur_detail.code}
                  </span>
                </span>
              </div>

              {/* Réf fournisseur */}
              {facture.ref_fournisseur && (
                <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <FileText size={13} className="mt-0.5 flex-shrink-0 text-[--text-muted]" />
                  <span className="text-xs text-[--text-muted] w-32 flex-shrink-0">Réf fournisseur</span>
                  <span className="font-data text-xs text-[--text-primary]">{facture.ref_fournisseur}</span>
                </div>
              )}

              {/* Date facture */}
              <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <ReceiptText size={13} className="mt-0.5 flex-shrink-0 text-[--text-muted]" />
                <span className="text-xs text-[--text-muted] w-32 flex-shrink-0">Date facture</span>
                <span className="font-data text-xs text-[--text-primary]">{formatDate(facture.date_facture)}</span>
              </div>

              {/* Date échéance */}
              <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <Calendar size={13} className="mt-0.5 flex-shrink-0 text-[--text-muted]" />
                <span className="text-xs text-[--text-muted] w-32 flex-shrink-0">Échéance</span>
                <span
                  className="font-data text-xs font-semibold"
                  style={{ color: enRetard && payable ? 'var(--status-danger)' : 'var(--text-primary)' }}
                >
                  {facture.date_echeance ? formatDate(facture.date_echeance) : '—'}
                  {enRetard && payable && <span className="ml-2 text-[10px] font-normal">(En retard)</span>}
                </span>
              </div>

              {/* BC lié */}
              {facture.bon_commande_ref && (
                <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <Link2 size={13} className="mt-0.5 flex-shrink-0 text-[--text-muted]" />
                  <span className="text-xs text-[--text-muted] w-32 flex-shrink-0">Bon de commande</span>
                  <button
                    onClick={() => navigate(`/logistique/bons-commande/${facture.bon_commande}`)}
                    className="font-data text-xs font-semibold text-[--accent] hover:underline"
                  >
                    {facture.bon_commande_ref}
                  </button>
                </div>
              )}

              {/* Réception liée */}
              {facture.reception_ref && (
                <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <Clock size={13} className="mt-0.5 flex-shrink-0 text-[--text-muted]" />
                  <span className="text-xs text-[--text-muted] w-32 flex-shrink-0">Réception</span>
                  <button
                    onClick={() => navigate(`/logistique/receptions/${facture.reception}`)}
                    className="font-data text-xs font-semibold text-[--accent] hover:underline"
                  >
                    {facture.reception_ref}
                  </button>
                </div>
              )}

              {/* Notes */}
              {facture.notes && (
                <div className="flex items-start gap-3 py-2.5">
                  <FileText size={13} className="mt-0.5 flex-shrink-0 text-[--text-muted]" />
                  <span className="text-xs text-[--text-muted] w-32 flex-shrink-0">Notes</span>
                  <span className="text-xs text-[--text-secondary] leading-relaxed">{facture.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Montants (1/3) */}
          <div className="surface p-5 flex flex-col gap-0">
            <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-4">
              Montants
            </p>

            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="text-xs text-[--text-muted]">Montant HT</span>
              <span className="font-data text-xs text-[--text-primary]">{formatXOF(facture.montant_ht)}</span>
            </div>
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="text-xs text-[--text-muted]">TVA</span>
              <span className="font-data text-xs text-[--text-secondary]">{formatXOF(facture.tva)}</span>
            </div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '2px solid var(--border)' }}>
              <span className="text-xs font-semibold text-[--text-primary]">Total TTC</span>
              <span className="font-data text-sm font-bold text-[--text-primary]">{formatXOF(facture.montant_ttc)}</span>
            </div>
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="flex items-center gap-1.5 text-xs text-[--text-muted]">
                <Banknote size={12} />
                Payé
              </span>
              <span className="font-data text-xs font-semibold" style={{ color: 'var(--status-success)' }}>
                {formatXOF(facture.montant_paye)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="flex items-center gap-1.5 text-xs text-[--text-muted]">
                <Wallet size={12} />
                Restant
              </span>
              <span
                className="font-data text-sm font-bold"
                style={{ color: facture.montant_restant > 0 ? 'var(--status-danger)' : 'var(--text-muted)' }}
              >
                {facture.montant_restant > 0 ? formatXOF(facture.montant_restant) : '—'}
              </span>
            </div>

            {payable && (
              <Button
                variant="primary" size="sm"
                icon={<CreditCard size={13} />}
                onClick={() => setShowPayer(true)}
                className="mt-4 w-full"
              >
                Enregistrer un paiement
              </Button>
            )}
          </div>
        </div>

        {/* ── Paiements ── */}
        <div className="surface overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
          >
            <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">
              Paiements
              {paiementsActifs.length > 0 && (
                <span className="ml-2 font-data normal-case text-[--text-secondary]">
                  ({paiementsActifs.length})
                </span>
              )}
            </p>
          </div>

          {paiementsActifs.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <CreditCard size={24} className="mx-auto mb-2 text-[--text-muted]" />
              <p className="text-xs text-[--text-muted]">Aucun paiement enregistré</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Date', 'Montant', 'Mode', 'Référence', 'Effectué par', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paiementsActifs.map((p: PaiementFacture) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      className="group hover:bg-[--bg-elevated] transition-colors"
                    >
                      <td className="px-4 py-3 font-data text-[--text-muted]">
                        {formatDate(p.date_paiement)}
                      </td>
                      <td className="px-4 py-3 font-data font-semibold" style={{ color: 'var(--status-success)' }}>
                        {formatXOF(p.montant)}
                      </td>
                      <td className="px-4 py-3 text-[--text-secondary]">
                        {p.mode_paiement_label}
                      </td>
                      <td className="px-4 py-3 font-data text-[--text-muted]">
                        {p.reference_paiement || '—'}
                      </td>
                      <td className="px-4 py-3 text-[--text-secondary]">
                        {p.effectue_par_nom ?? '—'}
                      </td>
                      <td className="px-6 py-5">
                        <button
                          onClick={() => annulerPaiementM.mutate(p.id)}
                          title="Annuler ce paiement"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[--status-danger-bg] text-[--text-muted] hover:text-[--status-danger]"
                        >
                          <Ban size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
