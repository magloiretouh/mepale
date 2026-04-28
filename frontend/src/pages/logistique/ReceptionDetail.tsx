/**
 * MEPALE ERP — Détail d'une Réception
 * Actions : Valider / PDF GRN / Créer un retour
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, AlertTriangle, CheckCircle2, FileDown,
  RotateCcw, User, Calendar, Package, Building2, Hash,
  ShieldCheck, ShieldX, X, Truck, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'
import {
  logistiqueApi,
  type StatutReception, type LigneReception, type RetourFournisseur,
} from '@/services/logistique'

// ─── Design tokens ─────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Config statuts ────────────────────────────────────────────────────────────

type BadgeVariant = 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'

const STATUT_RECEP: Record<StatutReception, { label: string; variant: BadgeVariant }> = {
  en_cours: { label: 'En cours', variant: 'warning' },
  validee:  { label: 'Validée',  variant: 'success' },
  rejetee:  { label: 'Rejetée', variant: 'danger'  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon, label, value, accent = false, success = false, danger = false,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode
  accent?: boolean; success?: boolean; danger?: boolean
}) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span className="text-xs text-[--text-muted] w-28 flex-shrink-0 pt-px">{label}</span>
      <span
        className={cn('text-xs font-medium flex-1', accent && 'font-data font-semibold')}
        style={{
          color: danger  ? 'var(--status-danger)'
               : success ? 'var(--status-success)'
               : accent  ? 'var(--accent)'
               : 'var(--text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Modal Créer un retour ─────────────────────────────────────────────────────

interface LigneRetourForm {
  ligne_reception:     string
  article_designation: string
  lot_numero:          string | null
  lot_statut:          string | null
  quantite_recue:      number
  quantite_retournee:  string
}

function ModalCreateRetour({
  receptionId,
  lignesNC,
  onClose,
  onSave,
  isPending,
}: {
  receptionId: string
  lignesNC:    LigneReception[]
  onClose:     () => void
  onSave:      (payload: object) => void
  isPending:   boolean
}) {
  const [dateRetour, setDateRetour] = useState('')
  const [motif,      setMotif]      = useState('')
  const [lignes,     setLignes]     = useState<LigneRetourForm[]>(() =>
    lignesNC.map(l => ({
      ligne_reception:     l.id,
      article_designation: l.article_detail.designation,
      lot_numero:          l.lot_cree,
      lot_statut:          null,
      quantite_recue:      l.quantite_recue,
      quantite_retournee:  String(l.quantite_recue),
    }))
  )

  const handleSubmit = () => {
    if (!dateRetour) { toast.error('La date de retour est obligatoire'); return }
    if (!motif.trim()) { toast.error('Le motif est obligatoire'); return }
    for (const l of lignes) {
      if (!(parseFloat(l.quantite_retournee) > 0)) {
        toast.error(`Quantité à retourner invalide pour : ${l.article_designation}`)
        return
      }
      if (parseFloat(l.quantite_retournee) > l.quantite_recue) {
        toast.error(`Quantité retournée supérieure à la quantité reçue pour : ${l.article_designation}`)
        return
      }
    }
    onSave({
      reception:   receptionId,
      date_retour: dateRetour,
      motif:       motif.trim(),
      lignes: lignes.map(l => ({
        ligne_reception:    l.ligne_reception,
        quantite_retournee: parseFloat(l.quantite_retournee),
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-xl animate-scale-in flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--status-warning) 12%, transparent)' }}>
              <RotateCcw size={15} style={{ color: 'var(--status-warning)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Créer un retour fournisseur</h3>
              <p className="text-xs text-[--text-muted] mt-0.5">{lignesNC.length} ligne{lignesNC.length > 1 ? 's' : ''} non conforme{lignesNC.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] p-1 -mr-1 -mt-0.5"><X size={15} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>Date de retour <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                <Input type="date" value={dateRetour} onChange={e => setDateRetour(e.target.value)} className="font-data" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Motif <span style={{ color: 'var(--status-danger)' }}>*</span></label>
                <Input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Raison du retour…" />
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Lignes non conformes à retourner</p>

            <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-subtle)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Article', 'Lot', 'Qté reçue', 'Qté à retourner'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-[--text-muted]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, idx) => (
                    <tr key={l.ligne_reception} style={{ borderBottom: idx < lignes.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <td className="px-3 py-2 text-[--text-primary] font-medium">{l.article_designation}</td>
                      <td className="px-3 py-2 font-data text-[--accent] text-[10px]">{l.lot_numero ?? '—'}</td>
                      <td className="px-3 py-2 font-data text-[--text-secondary]">{l.quantite_recue}</td>
                      <td className="px-3 py-2 w-28">
                        <Input
                          type="number"
                          value={l.quantite_retournee}
                          onChange={e => setLignes(prev => prev.map((ll, i) => i === idx ? { ...ll, quantite_retournee: e.target.value } : ll))}
                          className="font-data text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} loading={isPending} onClick={handleSubmit}>
            Créer le retour
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

export function ReceptionDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [showRetour, setShowRetour] = useState(false)

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: reception, isLoading } = useQuery({
    queryKey: ['reception', id],
    queryFn:  () => logistiqueApi.getReception(id!).then(r => r.data),
    enabled:  !!id,
  })

  const { data: retours = [] } = useQuery<RetourFournisseur[]>({
    queryKey: ['retours', id],
    queryFn:  () => logistiqueApi.listRetours({ reception: id, page_size: 50 }).then(r => r.data.results),
    enabled:  !!id && (reception?.statut === 'validee' || reception?.statut === 'rejetee'),
  })

  // ── Invalidation ─────────────────────────────────────────────────────────────

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['reception', id] })
    qc.invalidateQueries({ queryKey: ['receptions'] })
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  const { mutate: valider, isPending: validating } = useMutation({
    mutationFn: () => logistiqueApi.validerReception(id!),
    onSuccess: (res) => {
      const nbNC = res.data.reception?.nb_lignes_nc ?? 0
      toast.success(nbNC > 0
        ? `Réception validée. ${nbNC} ligne${nbNC > 1 ? 's' : ''} NC en quarantaine.`
        : 'Réception validée. Stock mis à jour.')
      inv()
      qc.invalidateQueries({ queryKey: ['stock'] })
    },
  })

  const { mutate: createRetour, isPending: creatingRetour } = useMutation({
    mutationFn: (payload: object) => logistiqueApi.createRetour(payload as any),
    onSuccess: () => {
      toast.success('Retour créé. Pensez à le valider pour mettre à jour le stock.')
      inv()
      qc.invalidateQueries({ queryKey: ['retours', id] })
      setShowRetour(false)
    },
  })

  const { mutate: validerRetour, isPending: validatingRetour } = useMutation({
    mutationFn: (retourId: string) => logistiqueApi.validerRetour(retourId),
    onSuccess: () => {
      toast.success('Retour validé. Stock mis à jour.')
      inv()
      qc.invalidateQueries({ queryKey: ['retours', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
    },
  })

  const handlePdf = async () => {
    try {
      const res = await logistiqueApi.exportPdfReception(id!)
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
      window.open(url, '_blank')
    } catch {
      toast.error('Erreur lors de la génération du PDF')
    }
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

  if (!reception) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <button
          onClick={() => navigate('/logistique/receptions')}
          className="flex items-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-primary] transition-colors"
        >
          <ArrowLeft size={13} /> Réceptions
        </button>
        <div className="surface p-12 text-center">
          <Truck size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm text-[--text-muted]">Réception introuvable.</p>
        </div>
      </div>
    )
  }

  const cfg    = STATUT_RECEP[reception.statut]
  const lignes = reception.lignes ?? []
  const lignesNC = lignes.filter(l => !l.conforme && l.lot_cree)

  return (
    <>
      {/* Modals — en dehors de animate-fade-in */}
      {showRetour && (
        <ModalCreateRetour
          receptionId={reception.id}
          lignesNC={lignesNC}
          onClose={() => setShowRetour(false)}
          onSave={payload => createRetour(payload)}
          isPending={creatingRetour}
        />
      )}

      <div className="p-6 space-y-5 animate-fade-in">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/logistique/receptions')}
              className="mt-0.5 p-1.5 rounded-lg transition-all flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Retour à la liste"
            >
              <ArrowLeft size={13} />
            </button>
            <div>
              <p className="text-[10px] text-[--text-muted] uppercase tracking-wider mb-1">
                Logistique · Réceptions
              </p>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold font-data text-[--accent]">{reception.reference}</h1>
                <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                {reception.nb_lignes_nc > 0 && (
                  <span
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--status-danger)' }}
                  >
                    <AlertTriangle size={9} /> {reception.nb_lignes_nc} NC
                  </span>
                )}
                {reception.est_livraison_a_temps === true && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--status-success) 10%, transparent)', color: 'var(--status-success)' }}
                  >
                    OTD ✓
                  </span>
                )}
                {reception.est_livraison_a_temps === false && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--status-danger)' }}
                  >
                    +{reception.jours_retard}j retard
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions selon statut */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {reception.statut === 'en_cours' && (
              <Button variant="primary" size="sm" icon={<CheckCircle2 size={13} />} loading={validating} onClick={() => valider()}>
                Valider la réception
              </Button>
            )}
            {(reception.statut === 'validee' || reception.statut === 'rejetee') && (
              <Button variant="ghost" size="sm" icon={<FileDown size={13} />} onClick={handlePdf}>
                PDF GRN
              </Button>
            )}
            {reception.statut === 'validee' && lignesNC.length > 0 && (
              <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={() => setShowRetour(true)}>
                Créer un retour
              </Button>
            )}
          </div>
        </div>

        {/* ── Alerte NC ────────────────────────────────────────────────────── */}
        {reception.nb_lignes_nc > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--status-warning) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)',
            }}
          >
            <AlertTriangle size={13} style={{ color: 'var(--status-warning)' }} />
            <span style={{ color: 'var(--status-warning)' }}>
              <strong>{reception.nb_lignes_nc} ligne{reception.nb_lignes_nc > 1 ? 's' : ''} non conforme{reception.nb_lignes_nc > 1 ? 's' : ''}</strong> sur cette réception.
              {reception.statut !== 'en_cours' && ' Les lots NC ont été placés en quarantaine.'}
            </span>
          </div>
        )}

        {/* ── Informations ─────────────────────────────────────────────────── */}
        <div className="surface p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Informations
          </h2>
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <InfoRow
                icon={<Package size={12} />}
                label="Bon de commande"
                value={
                  <button
                    className="font-data font-semibold hover:underline transition-all"
                    style={{ color: 'var(--accent)' }}
                    onClick={() => navigate(`/logistique/bons-commande/${reception.bon_commande}`)}
                  >
                    {reception.bon_commande_detail.reference}
                    <ExternalLink size={10} className="inline ml-1 -mt-px" />
                  </button>
                }
              />
              <InfoRow icon={<Building2 size={12} />} label="Fournisseur" value={reception.bon_commande_detail.fournisseur_detail.raison_sociale} />
              <InfoRow icon={<Calendar size={12} />}  label="Date réception" value={formatDate(reception.date_reception)} />
            </div>
            <div>
              {reception.numero_bl_fournisseur && (
                <InfoRow icon={<Hash size={12} />} label="N° BL fournisseur" value={reception.numero_bl_fournisseur} accent />
              )}
              <InfoRow
                icon={<User size={12} />}
                label="Reçue par"
                value={reception.recue_par ?? '—'}
              />
              <InfoRow
                icon={<Calendar size={12} />}
                label="Créée le"
                value={formatDate(reception.date_creation)}
              />
            </div>
          </div>
        </div>

        {/* ── Lignes ───────────────────────────────────────────────────────── */}
        <div className="surface overflow-hidden">
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
          >
            <h2 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Lignes réceptionnées
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
              {lignes.length} article{lignes.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  {['Article', 'Qté commandée', 'Qté reçue', 'N° Lot fournisseur', 'Péremption', 'Conformité', 'Lot créé'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => {
                  const isNC = !l.conforme
                  return (
                    <tr
                      key={l.id}
                      className="transition-colors hover:bg-[--bg-elevated]"
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        backgroundColor: isNC ? 'color-mix(in srgb, var(--status-danger) 4%, transparent)' : 'transparent',
                      }}
                    >
                      <td className="px-6 py-5">
                        <p className="text-xs font-medium text-[--text-primary]">{l.article_detail.designation}</p>
                        <p className="text-[10px] font-data mt-0.5" style={{ color: 'var(--text-muted)' }}>{l.article_detail.code}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-data text-[--text-secondary]">
                        {Number(l.quantite_commandee).toLocaleString('fr-FR')} {l.article_detail.unite_code}
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className="text-xs font-data font-semibold"
                          style={{ color: l.quantite_recue >= l.quantite_commandee ? 'var(--status-success)' : 'var(--status-warning)' }}
                        >
                          {Number(l.quantite_recue).toLocaleString('fr-FR')} {l.article_detail.unite_code}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        {l.numero_lot_fournisseur
                          ? <span className="font-data text-xs font-semibold" style={{ color: 'var(--accent)' }}>{l.numero_lot_fournisseur}</span>
                          : <span className="text-xs text-[--text-muted]">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs font-data text-[--text-secondary]">
                        {l.date_peremption ? formatDate(l.date_peremption) : '—'}
                      </td>
                      <td className="px-6 py-5">
                        {l.conforme ? (
                          <Badge variant="success"><ShieldCheck size={10} /> Conforme</Badge>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Badge variant="danger"><ShieldX size={10} /> NC</Badge>
                            {l.motif_non_conformite && (
                              <span
                                className="text-[10px] leading-tight max-w-[160px] truncate"
                                style={{ color: 'var(--status-danger)' }}
                                title={l.motif_non_conformite}
                              >
                                {l.motif_non_conformite}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {l.lot_cree ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-data text-xs font-semibold" style={{ color: 'var(--accent)' }}>{l.lot_cree}</span>
                            {!l.conforme && <Badge variant="warning">BLOQUÉ</Badge>}
                          </div>
                        ) : (
                          <span className="text-xs text-[--text-muted]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Retours fournisseur ───────────────────────────────────────────── */}
        {retours.length > 0 && (
          <div className="surface overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Retours fournisseur ({retours.length})
              </h2>
            </div>
            <div>
              {retours.map((retour, idx) => (
                <div
                  key={retour.id}
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: idx < retours.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-data text-xs font-semibold" style={{ color: 'var(--accent)' }}>{retour.reference}</span>
                    <Badge variant={retour.statut === 'valide' ? 'success' : 'warning'}>{retour.statut_label}</Badge>
                    <span className="text-xs text-[--text-muted]">{retour.motif}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-data text-[--text-muted]">{formatDate(retour.date_retour)}</span>
                    {retour.statut === 'en_cours' && (
                      <Button
                        variant="primary"
                        size="xs"
                        icon={<CheckCircle2 size={11} />}
                        loading={validatingRetour}
                        onClick={() => validerRetour(retour.id)}
                      >
                        Valider
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        {reception.notes && (
          <div className="surface p-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Notes
            </h2>
            <p className="text-xs text-[--text-secondary] leading-relaxed whitespace-pre-wrap">{reception.notes}</p>
          </div>
        )}

      </div>
    </>
  )
}
