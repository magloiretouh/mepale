/**
 * MEPALE ERP — Détail d'une Caisse
 * Gestion session (ouverture/fermeture) + mouvements + historique.
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Lock, Unlock, CheckCircle, XCircle,
  ArrowUpRight, ArrowDownLeft, Clock, Pencil, AlertTriangle,
} from 'lucide-react'

import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { Modal }   from '@/components/ui/Modal'
import { Badge }   from '@/components/ui/Badge'
import { caissesApi, type MouvementCaisseList, type CategorieMouvement } from '@/services/caisses'
import { formatXOF, formatDate } from '@/lib/utils'

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 h-9 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

const STATUT_BADGE: Record<string, JSX.Element> = {
  approuve:   <Badge variant="success">Approuvé</Badge>,
  en_attente: <Badge variant="warning">En attente</Badge>,
  rejete:     <Badge variant="danger">Rejeté</Badge>,
}

// ─── Page principale ─────────────────────────────────────────────────────────

export function CaisseDetail() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const qc        = useQueryClient()

  const [showOuvrir,   setShowOuvrir]   = useState(false)
  const [showFermer,   setShowFermer]   = useState(false)
  const [showMvt,      setShowMvt]      = useState(false)
  const [rejectId,     setRejectId]     = useState<string | null>(null)
  const [motifRejet,   setMotifRejet]   = useState('')
  const [activeTab,    setActiveTab]    = useState<'mouvements' | 'sessions'>('mouvements')

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: caisse, isLoading } = useQuery({
    queryKey: ['caisses', id],
    queryFn:  () => caissesApi.getCaisse(id!).then(r => r.data),
    enabled:  !!id,
  })

  const { data: mouvementsData } = useQuery({
    queryKey: ['caisses', id, 'mouvements'],
    queryFn:  () => caissesApi.listMouvements({ caisse: id, page_size: 100 }).then(r => r.data),
    enabled:  !!id,
  })

  const { data: sessionsData } = useQuery({
    queryKey: ['caisses', id, 'sessions'],
    queryFn:  () => caissesApi.listSessions({ caisse: id, page_size: 50 }).then(r => r.data),
    enabled:  !!id && activeTab === 'sessions',
  })

  const mouvements = mouvementsData?.results ?? []
  const sessions   = sessionsData?.results ?? []

  // ── Mutations ────────────────────────────────────────────────────────────────

  const approuverMut = useMutation({
    mutationFn: (mvtId: string) => caissesApi.approuverMouvement(mvtId),
    onSuccess:  () => {
      toast.success('Mouvement approuvé.')
      qc.invalidateQueries({ queryKey: ['caisses', id] })
      qc.invalidateQueries({ queryKey: ['caisses', 'stats'] })
    },
  })

  const rejeterMut = useMutation({
    mutationFn: ({ mvtId, motif }: { mvtId: string; motif: string }) =>
      caissesApi.rejeterMouvement(mvtId, motif),
    onSuccess: () => {
      toast.success('Mouvement rejeté.')
      setRejectId(null)
      setMotifRejet('')
      qc.invalidateQueries({ queryKey: ['caisses', id] })
    },
  })

  if (isLoading || !caisse) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="h-8 w-64 rounded bg-[--bg-elevated] animate-pulse" />
        <div className="surface h-32 animate-pulse" />
      </div>
    )
  }

  const sessionOuverte = caisse.session_ouverte

  return (
    <>
      {/* Modals */}
      <Modal
        isOpen={showOuvrir}
        onClose={() => setShowOuvrir(false)}
        title="Ouvrir une session"
        size="sm"
      >
        <OuvrirSessionForm
          caisseId={id!}
          onCancel={() => setShowOuvrir(false)}
          onSuccess={() => {
            setShowOuvrir(false)
            qc.invalidateQueries({ queryKey: ['caisses', id] })
          }}
        />
      </Modal>

      <Modal
        isOpen={showFermer}
        onClose={() => setShowFermer(false)}
        title="Fermer la session"
        size="sm"
      >
        <FermerSessionForm
          caisseId={id!}
          soldeTh={caisse.solde_actuel}
          onCancel={() => setShowFermer(false)}
          onSuccess={() => {
            setShowFermer(false)
            qc.invalidateQueries({ queryKey: ['caisses', id] })
            qc.invalidateQueries({ queryKey: ['caisses', id, 'sessions'] })
          }}
        />
      </Modal>

      <Modal
        isOpen={showMvt}
        onClose={() => setShowMvt(false)}
        title="Nouveau mouvement"
        size="md"
      >
        <NouveauMouvementForm
          sessionId={sessionOuverte?.id ?? ''}
          onCancel={() => setShowMvt(false)}
          onSuccess={() => {
            setShowMvt(false)
            qc.invalidateQueries({ queryKey: ['caisses', id] })
            qc.invalidateQueries({ queryKey: ['caisses', 'stats'] })
          }}
        />
      </Modal>

      <Modal
        isOpen={!!rejectId}
        onClose={() => { setRejectId(null); setMotifRejet('') }}
        title="Rejeter le mouvement"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setRejectId(null); setMotifRejet('') }}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={rejeterMut.isPending}
              disabled={motifRejet.trim().length < 5}
              onClick={() => rejeterMut.mutate({ mvtId: rejectId!, motif: motifRejet })}
            >
              Confirmer le rejet
            </Button>
          </>
        }
      >
        <div>
          <label className={FIELD_LABEL}>Motif de rejet *</label>
          <textarea
            className={SELECT_CLASS + ' h-auto py-2.5 resize-none leading-relaxed'}
            rows={3}
            value={motifRejet}
            onChange={e => setMotifRejet(e.target.value)}
            placeholder="Expliquez pourquoi ce mouvement est rejeté..."
          />
        </div>
      </Modal>

      <div className="p-6 space-y-5 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/caisses')}
              className="p-1.5 rounded hover:bg-[--bg-elevated] transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-[--text-primary]">{caisse.nom}</h1>
                {caisse.alerte_plafond && (
                  <Badge variant="danger">
                    <AlertTriangle size={10} className="mr-1" />
                    Plafond dépassé
                  </Badge>
                )}
              </div>
              {caisse.responsable_nom && (
                <p className="text-sm text-[--text-muted] mt-0.5">
                  Responsable : {caisse.responsable_nom}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!sessionOuverte ? (
              <Button
                variant="primary"
                icon={<Unlock size={14} />}
                onClick={() => setShowOuvrir(true)}
              >
                Ouvrir session
              </Button>
            ) : (
              <>
                <Button
                  icon={<Plus size={14} />}
                  onClick={() => setShowMvt(true)}
                >
                  Nouveau mouvement
                </Button>
                <Button
                  variant="outline"
                  icon={<Lock size={14} />}
                  onClick={() => setShowFermer(true)}
                >
                  Fermer session
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Carte solde + session ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="surface p-5 col-span-1">
            <p className="text-xs text-[--text-muted] uppercase tracking-wider mb-1">Solde actuel</p>
            <p className="text-2xl font-semibold font-data text-[--text-primary]">
              {formatXOF(caisse.solde_actuel)}
            </p>
            {caisse.plafond_alerte && (
              <p className="text-xs text-[--text-muted] mt-1">
                Plafond : {formatXOF(caisse.plafond_alerte)}
              </p>
            )}
          </div>

          <div className="surface p-5 col-span-2">
            <p className="text-xs text-[--text-muted] uppercase tracking-wider mb-2">Session</p>
            {sessionOuverte ? (
              <div className="flex items-center gap-3">
                <Badge variant="success" dot>Ouverte</Badge>
                <span className="text-sm text-[--text-muted]">
                  depuis le {formatDate(sessionOuverte.date_ouverture, {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Badge variant="neutral" dot>Fermée</Badge>
                <span className="text-sm text-[--text-muted]">Aucune session ouverte</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div>
          <div className="flex gap-1 mb-4 border-b" style={{ borderColor: 'var(--border)' }}>
            {(['mouvements', 'sessions'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px"
                style={{
                  borderColor: activeTab === tab ? 'var(--accent)' : 'transparent',
                  color:       activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {tab === 'mouvements' ? 'Mouvements' : 'Historique sessions'}
              </button>
            ))}
          </div>

          {/* Mouvements */}
          {activeTab === 'mouvements' && (
            <div className="surface overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Catégorie</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Libellé</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Montant</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Statut</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Date</th>
                    <th className="px-6 py-5" />
                  </tr>
                </thead>
                <tbody>
                  {mouvements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-sm text-[--text-muted]">
                        {sessionOuverte ? 'Aucun mouvement pour cette session.' : 'Ouvrez une session pour créer des mouvements.'}
                      </td>
                    </tr>
                  ) : mouvements.map((mvt, i) => (
                    <tr
                      key={mvt.id}
                      style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}
                    >
                      <td className="px-6 py-5">
                        {mvt.type === 'entree' ? (
                          <div className="flex items-center gap-1.5" style={{ color: 'var(--status-success)' }}>
                            <ArrowUpRight size={14} />
                            <span className="text-xs font-medium">Entrée</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5" style={{ color: 'var(--status-danger)' }}>
                            <ArrowDownLeft size={14} />
                            <span className="text-xs font-medium">Sortie</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[--text-secondary]">
                        {mvt.categorie_detail.nom}
                      </td>
                      <td className="px-4 py-3 text-[--text-primary] max-w-48 truncate">
                        {mvt.libelle}
                      </td>
                      <td className="px-4 py-3 text-right font-data font-medium">
                        <span style={{ color: mvt.type === 'entree' ? 'var(--status-success)' : 'var(--status-danger)' }}>
                          {mvt.type === 'sortie' ? '−' : '+'}{formatXOF(mvt.montant)}
                        </span>
                      </td>
                      <td className="px-6 py-5">{STATUT_BADGE[mvt.statut]}</td>
                      <td className="px-4 py-3 text-xs text-[--text-muted]">
                        {formatDate(mvt.created_at)}
                      </td>
                      <td className="px-6 py-5">
                        {mvt.statut === 'en_attente' && (
                          <div className="flex items-center gap-2">
                            <button
                              title="Approuver"
                              className="p-1 rounded hover:bg-[--bg-elevated] transition-colors"
                              style={{ color: 'var(--status-success)' }}
                              onClick={() => approuverMut.mutate(mvt.id)}
                            >
                              <CheckCircle size={15} />
                            </button>
                            <button
                              title="Rejeter"
                              className="p-1 rounded hover:bg-[--bg-elevated] transition-colors"
                              style={{ color: 'var(--status-danger)' }}
                              onClick={() => { setRejectId(mvt.id); setMotifRejet('') }}
                            >
                              <XCircle size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Historique sessions */}
          {activeTab === 'sessions' && (
            <div className="surface overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Ouverture</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Fermeture</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Solde ouverture</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Solde clôture</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Écart</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[--text-muted] uppercase tracking-wider">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-sm text-[--text-muted]">
                        Aucune session.
                      </td>
                    </tr>
                  ) : sessions.map((s, i) => (
                    <tr
                      key={s.id}
                      style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}
                    >
                      <td className="px-4 py-3 text-xs text-[--text-secondary]">
                        {formatDate(s.date_ouverture)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[--text-secondary]">
                        {s.date_fermeture ? formatDate(s.date_fermeture) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-data text-[--text-secondary]">
                        {formatXOF(s.solde_ouverture)}
                      </td>
                      <td className="px-4 py-3 text-right font-data text-[--text-secondary]">
                        {s.solde_fermeture_reel != null ? formatXOF(s.solde_fermeture_reel) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-data">
                        {s.ecart != null ? (
                          <span style={{
                            color: s.ecart !== 0 ? 'var(--status-warning)' : 'var(--status-success)',
                          }}>
                            {s.ecart > 0 ? '+' : ''}{formatXOF(s.ecart)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-5">
                        {s.statut === 'ouverte'
                          ? <Badge variant="success" dot>Ouverte</Badge>
                          : <Badge variant="neutral">Fermée</Badge>
                        }
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

// ─── Formulaire ouverture de session ─────────────────────────────────────────

function OuvrirSessionForm({
  caisseId, onCancel, onSuccess,
}: { caisseId: string; onCancel: () => void; onSuccess: () => void }) {
  const [solde, setSolde] = useState('')

  const mut = useMutation({
    mutationFn: () => caissesApi.ouvrirSession(caisseId, solde ? Number(solde) : undefined),
    onSuccess: () => { toast.success('Session ouverte.'); onSuccess() },
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={FIELD_LABEL}>Solde d'ouverture (FCFA)</label>
        <Input
          type="number"
          value={solde}
          onChange={e => setSolde(e.target.value)}
          placeholder="Laisser vide pour report automatique"
        />
        <p className="text-xs text-[--text-muted] mt-1">
          Si vide, le solde réel de la dernière session sera utilisé automatiquement.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button loading={mut.isPending} onClick={() => mut.mutate()}>
          Ouvrir la session
        </Button>
      </div>
    </div>
  )
}

// ─── Formulaire fermeture de session ─────────────────────────────────────────

function FermerSessionForm({
  caisseId, soldeTh, onCancel, onSuccess,
}: { caisseId: string; soldeTh: number; onCancel: () => void; onSuccess: () => void }) {
  const [soldeReel, setSoldeReel] = useState('')
  const [notes,     setNotes]     = useState('')

  const mut = useMutation({
    mutationFn: () => caissesApi.fermerSession(caisseId, {
      solde_fermeture_reel: Number(soldeReel),
      notes_cloture:        notes,
    }),
    onSuccess: () => { toast.success('Session fermée.'); onSuccess() },
  })

  const ecart = soldeReel ? Number(soldeReel) - soldeTh : null

  return (
    <div className="flex flex-col gap-5">
      <div
        className="p-3 rounded-lg text-sm"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <span className="text-[--text-muted]">Solde théorique : </span>
        <span className="font-data font-medium text-[--text-primary]">{formatXOF(soldeTh)}</span>
      </div>

      <div>
        <label className={FIELD_LABEL}>Solde compté physiquement (FCFA) *</label>
        <Input
          type="number"
          value={soldeReel}
          onChange={e => setSoldeReel(e.target.value)}
          placeholder="Montant en caisse"
        />
        {ecart !== null && (
          <p className="text-xs mt-1" style={{ color: ecart !== 0 ? 'var(--status-warning)' : 'var(--status-success)' }}>
            Écart : {ecart > 0 ? '+' : ''}{formatXOF(ecart)}
            {ecart !== 0 && ' — un écart a été détecté'}
          </p>
        )}
      </div>

      <div>
        <label className={FIELD_LABEL}>Notes de clôture</label>
        <textarea
          className={SELECT_CLASS + ' h-auto py-2.5 resize-none leading-relaxed'}
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optionnel"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          loading={mut.isPending}
          disabled={!soldeReel}
          onClick={() => mut.mutate()}
        >
          Fermer la session
        </Button>
      </div>
    </div>
  )
}

// ─── Formulaire nouveau mouvement ─────────────────────────────────────────────

function NouveauMouvementForm({
  sessionId, onCancel, onSuccess,
}: { sessionId: string; onCancel: () => void; onSuccess: () => void }) {
  const [categorieId, setCategorieId] = useState('')
  const [montant,     setMontant]     = useState('')
  const [libelle,     setLibelle]     = useState('')

  const { data: catsData } = useQuery({
    queryKey: ['categories-mouvement'],
    queryFn:  () => caissesApi.listCategories({ actif: true, page_size: 100 }).then(r => r.data),
  })

  const cats = (catsData?.results ?? []).filter(
    c => c.code !== 'transfert_sortie' && c.code !== 'transfert_entree',
  )

  const mut = useMutation({
    mutationFn: () => caissesApi.createMouvement({
      session:   sessionId,
      categorie: categorieId,
      montant:   Number(montant),
      libelle,
    }),
    onSuccess: (r) => {
      const mvt = r.data
      toast.success(
        mvt.statut === 'approuve'
          ? 'Mouvement enregistré et approuvé.'
          : 'Mouvement créé — en attente d\'approbation.',
      )
      onSuccess()
    },
  })

  const valid = !!sessionId && !!categorieId && !!montant && Number(montant) > 0 && !!libelle.trim()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={FIELD_LABEL}>Catégorie *</label>
        <select
          className={SELECT_CLASS}
          value={categorieId}
          onChange={e => setCategorieId(e.target.value)}
        >
          <option value="">Sélectionner...</option>
          <optgroup label="Entrées">
            {cats.filter(c => c.type === 'entree').map(c => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </optgroup>
          <optgroup label="Sorties">
            {cats.filter(c => c.type === 'sortie').map(c => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <div>
        <label className={FIELD_LABEL}>Montant (FCFA) *</label>
        <Input
          type="number"
          value={montant}
          onChange={e => setMontant(e.target.value)}
          placeholder="0"
        />
      </div>

      <div>
        <label className={FIELD_LABEL}>Libellé *</label>
        <Input
          value={libelle}
          onChange={e => setLibelle(e.target.value)}
          placeholder="Description du mouvement"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button loading={mut.isPending} disabled={!valid} onClick={() => mut.mutate()}>
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
