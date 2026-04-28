/**
 * MEPALE ERP — Détail d'une session d'inventaire physique
 * Saisie des comptages, suivi de progression, validation finale
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Loader2,
  ClipboardCheck, Tag, Layers, X, CheckCheck,
  FileText, Calendar, User,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'
import { logistiqueApi, type LigneInventaire, type StatutInventaire } from '@/services/logistique'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUT_CONFIG: Record<StatutInventaire, { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  en_cours: { label: 'En cours',  variant: 'warning' },
  valide:   { label: 'Validé',    variant: 'success' },
  annule:   { label: 'Annulé',    variant: 'danger'  },
}

// ─── Ligne inventaire ─────────────────────────────────────────────────────────

function LigneRow({
  ligne,
  sessionId,
  enCours,
}: {
  ligne:     LigneInventaire
  sessionId: string
  enCours:   boolean
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [qte, setQte]         = useState(ligne.quantite_comptee?.toString() ?? '')
  const [justif, setJustif]   = useState(ligne.justification ?? '')

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      logistiqueApi.saisirComptage(
        sessionId, ligne.id,
        parseFloat(qte) || 0,
        justif || undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventaire', sessionId] })
      setEditing(false)
      toast.success('Comptage enregistré')
    },
    onError: () => toast.error('Erreur lors de la saisie'),
  })

  const cancel = () => {
    setEditing(false)
    setQte(ligne.quantite_comptee?.toString() ?? '')
    setJustif(ligne.justification ?? '')
  }

  const ecart    = ligne.ecart
  const hasEcart = ecart !== null && Math.abs(ecart) > 0.001
  const counted  = ligne.quantite_comptee !== null

  // Couleur de ligne selon état
  const rowBg = ligne.valide
    ? 'rgba(0,201,167,0.03)'
    : hasEcart
    ? 'rgba(239,68,68,0.03)'
    : undefined

  return (
    <tr
      style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: rowBg }}
      className="transition-colors hover:bg-[--bg-elevated]"
    >
      {/* Statut indicateur */}
      <td className="pl-4 pr-2 py-3 w-6">
        {ligne.valide ? (
          <CheckCircle2 size={13} style={{ color: 'var(--status-success)' }} />
        ) : counted ? (
          hasEcart
            ? <AlertTriangle size={13} style={{ color: 'var(--status-warning)' }} />
            : <CheckCircle2 size={13} style={{ color: 'var(--accent)' }} />
        ) : (
          <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--border)' }} />
        )}
      </td>

      {/* Article */}
      <td className="px-3 py-3 max-w-[220px]">
        <div className="text-xs font-medium text-[--text-primary] truncate">
          {ligne.article_designation ?? '—'}
        </div>
        {ligne.lot_numero ? (
          <div className="flex items-center gap-1 mt-0.5">
            <Tag size={9} style={{ color: 'var(--accent)' }} />
            <span className="text-[10px] font-data text-[--accent]">{ligne.lot_numero}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 mt-0.5">
            <Layers size={9} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[10px] text-[--text-muted]">Stock global</span>
          </div>
        )}
      </td>

      {/* Unité */}
      <td className="px-3 py-3 font-data text-[11px] text-[--text-muted]">
        {ligne.unite_code ?? '—'}
      </td>

      {/* Qté théorique */}
      <td className="px-3 py-3 font-data text-xs text-[--text-secondary]">
        {ligne.quantite_theorique.toLocaleString('fr-TG')}
      </td>

      {/* Qté comptée */}
      <td className="px-3 py-3">
        {editing ? (
          <Input
            type="number"
            value={qte}
            onChange={(e) => setQte(e.target.value)}
            className="w-28 font-data text-xs"
            autoFocus
          />
        ) : (
          <span
            className="font-data text-xs font-semibold"
            style={{
              color: !counted
                ? 'var(--text-muted)'
                : hasEcart
                ? (ecart! > 0 ? 'var(--status-success)' : 'var(--status-danger)')
                : 'var(--text-primary)',
              fontStyle: !counted ? 'italic' : 'normal',
            }}
          >
            {counted ? ligne.quantite_comptee!.toLocaleString('fr-TG') : '—'}
          </span>
        )}
      </td>

      {/* Écart */}
      <td className="px-3 py-3 font-data text-xs">
        {counted && ecart !== null ? (
          <span
            className="font-semibold"
            style={{
              color: !hasEcart
                ? 'var(--text-muted)'
                : ecart > 0
                ? 'var(--status-success)'
                : 'var(--status-danger)',
            }}
          >
            {ecart > 0 ? '+' : ''}{ecart.toLocaleString('fr-TG')}
          </span>
        ) : (
          <span className="text-[--text-muted]">—</span>
        )}
      </td>

      {/* Justification */}
      <td className="pl-6 pr-3 py-3 max-w-[200px]">
        {editing ? (
          <Input
            placeholder="Justification de l'écart…"
            value={justif}
            onChange={(e) => setJustif(e.target.value)}
            className="text-xs"
          />
        ) : (
          <span className="text-[11px] text-[--text-muted] italic truncate block">
            {ligne.justification || '—'}
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="px-3 py-3 text-right">
        {enCours && (
          editing ? (
            <div className="flex items-center justify-end gap-1.5">
              <button
                onClick={() => mutate()}
                disabled={isPending}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded transition-colors"
                style={{ backgroundColor: 'var(--accent)', color: '#0A0B10' }}
              >
                {isPending ? <Loader2 size={10} className="animate-spin" /> : <><CheckCheck size={10} /> OK</>}
              </button>
              <button
                onClick={cancel}
                className="p-1 rounded transition-colors text-[--text-muted] hover:text-[--text-primary]"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="px-2.5 py-1 text-[10px] font-medium rounded transition-all"
              style={{
                backgroundColor: counted ? 'var(--bg-elevated)' : 'var(--accent-dim)',
                color:           counted ? 'var(--text-secondary)' : 'var(--accent)',
                border:          `1px solid ${counted ? 'var(--border)' : 'var(--accent)'}`,
              }}
            >
              {counted ? 'Modifier' : 'Saisir'}
            </button>
          )
        )}
      </td>
    </tr>
  )
}

// ─── Modal confirmation validation ────────────────────────────────────────────

function ModalValider({
  reference,
  nbEcarts,
  isPending,
  onConfirm,
  onClose,
}: {
  reference: string
  nbEcarts:  number
  isPending: boolean
  onConfirm: () => void
  onClose:   () => void
}) {
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
        <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
            <CheckCircle2 size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <h3 className="text-sm font-semibold text-[--text-primary]">Valider l'inventaire</h3>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-[--text-secondary]">
            Vous êtes sur le point de valider la session <strong className="text-[--text-primary] font-data">{reference}</strong>.
          </p>

          {nbEcarts > 0 && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
              style={{ backgroundColor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', color: 'var(--status-warning)' }}
            >
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>{nbEcarts} écart{nbEcarts > 1 ? 's' : ''}</strong> détecté{nbEcarts > 1 ? 's' : ''} —
                des mouvements d'ajustement seront créés automatiquement.
              </span>
            </div>
          )}

          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[11px] text-[--text-muted]"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5 text-[--text-muted]" />
            Cette action est irréversible. Les quantités de stock seront mises à jour définitivement.
          </div>
        </div>

        <div className="px-5 py-3.5 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={onConfirm}>
            Confirmer la validation
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal confirmation annulation ────────────────────────────────────────────

function ModalAnnuler({
  reference,
  isPending,
  onConfirm,
  onClose,
}: {
  reference: string
  isPending: boolean
  onConfirm: () => void
  onClose:   () => void
}) {
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
        <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}
          >
            <X size={15} style={{ color: 'var(--status-danger)' }} />
          </div>
          <h3 className="text-sm font-semibold text-[--text-primary]">Annuler la session</h3>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-[--text-secondary]">
            Vous êtes sur le point d'annuler la session{' '}
            <strong className="text-[--text-primary] font-data">{reference}</strong>.
          </p>
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[11px] leading-relaxed"
            style={{
              backgroundColor: 'rgba(239,68,68,0.06)',
              border:          '1px solid rgba(239,68,68,0.25)',
              color:           'var(--status-danger)',
            }}
          >
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
            Les comptages déjà saisis seront perdus. Aucun ajustement de stock ne sera effectué.
          </div>
        </div>

        <div
          className="px-5 py-3.5 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Retour</Button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
            style={{ backgroundColor: 'var(--status-danger)', color: '#fff' }}
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Confirmer l'annulation
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function InventaireDetail() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const [showValider, setShowValider] = useState(false)
  const [showAnnuler, setShowAnnuler] = useState(false)
  const [filterNonCompte, setFilter]  = useState(false)

  const { data: session, isLoading } = useQuery({
    queryKey: ['inventaire', id],
    queryFn:  () => logistiqueApi.getInventaire(id!).then((r) => r.data),
    enabled:  !!id,
    staleTime: 0,
  })

  const { mutate: valider, isPending: validating } = useMutation({
    mutationFn: () => logistiqueApi.validerInventaire(id!),
    onSuccess: () => {
      toast.success(`Inventaire ${session?.reference} validé — stock mis à jour`)
      qc.invalidateQueries({ queryKey: ['inventaire', id] })
      qc.invalidateQueries({ queryKey: ['inventaires'] })
      setShowValider(false)
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail ?? 'Erreur lors de la validation'
      toast.error(msg, { duration: 8000 })
    },
  })

  const { mutate: annuler, isPending: cancelling } = useMutation({
    mutationFn: () => logistiqueApi.annulerInventaire(id!),
    onSuccess: () => {
      toast.success(`Inventaire ${session?.reference} annulé`)
      qc.invalidateQueries({ queryKey: ['inventaire', id] })
      qc.invalidateQueries({ queryKey: ['inventaires'] })
      setShowAnnuler(false)
      navigate('/logistique/inventaires')
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail ?? "Erreur lors de l'annulation"
      toast.error(msg)
    },
  })

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-[--text-muted]">
          <Loader2 size={24} className="animate-spin" />
          <p className="text-sm">Chargement de la session…</p>
        </div>
      </div>
    )
  }

  const enCours  = session.statut === 'en_cours'
  const cfg      = STATUT_CONFIG[session.statut]
  const lignes   = session.lignes ?? []
  const total    = lignes.length
  const comptees = lignes.filter((l) => l.quantite_comptee !== null).length
  const ecarts   = lignes.filter((l) => l.ecart !== null && Math.abs(l.ecart) > 0.001).length
  const validees = lignes.filter((l) => l.valide).length
  const pct      = total > 0 ? Math.round((comptees / total) * 100) : 0

  const lignesAffichees = filterNonCompte
    ? lignes.filter((l) => l.quantite_comptee === null)
    : lignes

  return (
    <>
      {showValider && (
        <ModalValider
          reference={session.reference}
          nbEcarts={ecarts}
          isPending={validating}
          onConfirm={() => valider()}
          onClose={() => setShowValider(false)}
        />
      )}
      {showAnnuler && (
        <ModalAnnuler
          reference={session.reference}
          isPending={cancelling}
          onConfirm={() => annuler()}
          onClose={() => setShowAnnuler(false)}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden animate-fade-in surface" style={{ boxShadow: 'var(--shadow-card)' }}>

        {/* ── En-tête ── */}
        <div
          className="flex items-center justify-between gap-4 px-6 py-3.5 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/logistique/inventaires')}
              className="p-1.5 rounded-lg transition-colors text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] flex-shrink-0"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-dim)' }}
              >
                <ClipboardCheck size={13} style={{ color: 'var(--accent)' }} />
              </div>
              <span className="font-data text-base font-bold text-[--accent] tracking-wide">
                {session.reference}
              </span>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
            </div>
          </div>

          {/* Actions header */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {enCours && (
              <button
                onClick={() => setShowAnnuler(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  border:          '1px solid rgba(239,68,68,0.25)',
                  color:           'var(--status-danger)',
                }}
              >
                <X size={12} />
                Annuler la session
              </button>
            )}
            {enCours && (
              <Button
                variant="primary"
                size="sm"
                icon={<CheckCircle2 size={13} />}
                onClick={() => setShowValider(true)}
                disabled={comptees === 0}
              >
                Valider l'inventaire
              </Button>
            )}
          </div>
        </div>

        {/* ── Bandeau infos + progression ── */}
        <div
          className="flex-shrink-0 px-6 py-3 border-b flex flex-wrap items-center gap-x-6 gap-y-2"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          {/* Meta */}
          <div className="flex items-center gap-4 text-xs text-[--text-muted]">
            <span className="flex items-center gap-1.5">
              <User size={11} />
              {session.cree_par_nom ?? '—'}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={11} />
              {formatDate(session.date_debut)}
            </span>
            {session.date_fin && (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={11} style={{ color: 'var(--status-success)' }} />
                Clôturé le {formatDate(session.date_fin)}
              </span>
            )}
            {session.notes && (
              <span className="flex items-center gap-1.5 max-w-[260px] truncate">
                <FileText size={11} />
                {session.notes}
              </span>
            )}
          </div>

          {/* Séparateur */}
          <div className="h-4 w-px bg-[--border] hidden sm:block" />

          {/* Stats comptage */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {/* Mini progress bar */}
              <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: pct === 100 ? 'var(--status-success)' : 'var(--accent)',
                  }}
                />
              </div>
              <span className="font-data text-xs font-semibold text-[--text-primary]">{pct}%</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[--text-muted]">
                <span className="font-data font-semibold text-[--text-primary]">{comptees}</span>/{total} comptées
              </span>
              {ecarts > 0 && (
                <span className="flex items-center gap-2" style={{ color: 'var(--status-warning)' }}>
                  <AlertTriangle size={10} />
                  <span className="font-data font-semibold">{ecarts}</span> écart{ecarts > 1 ? 's' : ''}
                </span>
              )}
              {validees > 0 && (
                <span className="flex items-center gap-2" style={{ color: 'var(--status-success)' }}>
                  <CheckCircle2 size={10} />
                  <span className="font-data font-semibold">{validees}</span> validée{validees > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Filtre rapide */}
          {enCours && total > 0 && (
            <button
              onClick={() => setFilter((v) => !v)}
              className={cn(
                'ml-auto text-[11px] font-medium px-2.5 py-1 rounded transition-all',
                filterNonCompte
                  ? 'text-[--accent]'
                  : 'text-[--text-secondary] hover:text-[--text-primary]',
              )}
              style={filterNonCompte
                ? { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                : { backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }
              }
            >
              {filterNonCompte
                ? `${total - comptees} restante${total - comptees > 1 ? 's' : ''}`
                : 'Voir non comptées'}
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <div className="flex-1 overflow-auto">
          {lignesAffichees.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[--text-muted]">
              <CheckCircle2 size={32} style={{ color: 'var(--status-success)' }} />
              <p className="text-sm text-[--text-secondary]">
                {filterNonCompte
                  ? 'Toutes les lignes ont été saisies !'
                  : 'Aucune ligne dans cette session'}
              </p>
              {filterNonCompte && (
                <button
                  className="text-xs text-[--accent] underline"
                  onClick={() => setFilter(false)}
                >
                  Voir toutes les lignes
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr
                  className="sticky top-0 z-10 text-left"
                  style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}
                >
                  <th className="pl-4 pr-2 py-2.5 w-6" />
                  {['Article / Lot', 'Unité', 'Qté théorique', 'Qté comptée', 'Écart', 'Justification', ''].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        'py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap',
                        h === 'Justification' ? 'pl-6 pr-3' : 'px-3',
                        h === '' ? 'text-right' : '',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignesAffichees.map((ligne) => (
                  <LigneRow
                    key={ligne.id}
                    ligne={ligne}
                    sessionId={id!}
                    enCours={enCours}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pied de page (si session terminée / validée) ── */}
        {!enCours && (
          <div
            className="flex-shrink-0 px-6 py-2.5 border-t flex items-center justify-between"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
          >
            <span className="text-xs text-[--text-muted]">
              Session {cfg.label.toLowerCase()} — {comptees}/{total} lignes comptées, {ecarts} écart{ecarts > 1 ? 's' : ''}
            </span>
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
          </div>
        )}
      </div>
    </>
  )
}
