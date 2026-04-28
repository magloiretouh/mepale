/**
 * MEPALE ERP — Mouvements en attente d'approbation
 * Vue globale de tous les mouvements en attente, toutes caisses confondues.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock, CheckCircle, XCircle, ArrowUpRight, ArrowDownLeft, Filter } from 'lucide-react'

import { Button }  from '@/components/ui/Button'
import { Modal }   from '@/components/ui/Modal'
import { Badge }   from '@/components/ui/Badge'
import {
  caissesApi,
  type MouvementCaisseList,
  type CaisseList,
} from '@/services/caisses'
import { formatXOF } from '@/lib/utils'

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 h-9 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Page principale ─────────────────────────────────────────────────────────

export function MouvementsEnAttente() {
  const qc = useQueryClient()

  const [filterCaisse, setFilterCaisse] = useState('')
  const [rejectTarget, setRejectTarget] = useState<MouvementCaisseList | null>(null)
  const [motif, setMotif] = useState('')

  // Liste des caisses pour le filtre
  const { data: caissesData } = useQuery({
    queryKey: ['caisses'],
    queryFn:  () => caissesApi.listCaisses({ page_size: 100 }).then(r => r.data),
  })
  const caisses: CaisseList[] = caissesData?.results ?? []

  // Mouvements en attente
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['caisses', 'mouvements', 'en-attente', filterCaisse],
    queryFn:  () => caissesApi.mouvementsEnAttente(
      filterCaisse ? { caisse: filterCaisse, page_size: 200 } : { page_size: 200 }
    ).then(r => r.data),
  })

  const mouvements: MouvementCaisseList[] = data?.results ?? []

  // ── Approbation ────────────────────────────────────────────────────────────

  const approuver = useMutation({
    mutationFn: (id: string) => caissesApi.approuverMouvement(id),
    onSuccess: () => {
      toast.success('Mouvement approuvé.')
      qc.invalidateQueries({ queryKey: ['caisses'] })
    },
  })

  // ── Rejet ──────────────────────────────────────────────────────────────────

  const rejeter = useMutation({
    mutationFn: ({ id, motif_rejet }: { id: string; motif_rejet: string }) =>
      caissesApi.rejeterMouvement(id, motif_rejet),
    onSuccess: () => {
      toast.success('Mouvement rejeté.')
      setRejectTarget(null)
      setMotif('')
      qc.invalidateQueries({ queryKey: ['caisses'] })
    },
  })

  const handleReject = () => {
    if (!rejectTarget || motif.trim().length < 5) return
    rejeter.mutate({ id: rejectTarget.id, motif_rejet: motif.trim() })
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Modal de rejet */}
      <Modal
        isOpen={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setMotif('') }}
        title="Rejeter le mouvement"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setRejectTarget(null); setMotif('') }}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={rejeter.isPending}
              disabled={motif.trim().length < 5}
              onClick={handleReject}
            >
              Confirmer le rejet
            </Button>
          </div>
        }
      >
        {rejectTarget && (
          <div className="flex flex-col gap-5">
            {/* Récap mouvement */}
            <div
              className="p-3 rounded-lg"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm font-medium text-[--text-primary] mb-0.5">
                {rejectTarget.libelle}
              </p>
              <p className="text-xs text-[--text-muted]">
                {rejectTarget.categorie_detail.nom} · {formatXOF(rejectTarget.montant)}
              </p>
            </div>
            {/* Motif */}
            <div>
              <label className={FIELD_LABEL}>Motif de rejet *</label>
              <textarea
                className={SELECT_CLASS + ' h-auto py-2.5 resize-none leading-relaxed'}
                style={{ height: '80px' }}
                placeholder="Expliquer la raison du rejet (5 caractères min.)…"
                value={motif}
                onChange={e => setMotif(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      <div className="space-y-5 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[--text-primary]">En attente d'approbation</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">
              Mouvements nécessitant une validation
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mouvements.length > 0 && (
              <Badge variant="warning" dot>{mouvements.length} en attente</Badge>
            )}
          </div>
        </div>

        {/* ── Filtre caisse ── */}
        <div className="surface p-4">
          <div className="flex items-center gap-3">
            <Filter size={14} className="text-[--text-muted]" />
            <span className="text-xs text-[--text-muted] uppercase tracking-wider font-medium">Filtrer</span>
            <select
              className={SELECT_CLASS}
              style={{ width: 220 }}
              value={filterCaisse}
              onChange={e => setFilterCaisse(e.target.value)}
            >
              <option value="">Toutes les caisses</option>
              {caisses.map(c => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="surface overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-[--text-muted]">Chargement…</div>
          ) : mouvements.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle size={28} className="mx-auto mb-3 text-[--status-success]" />
              <p className="text-sm font-medium text-[--text-primary]">Aucun mouvement en attente</p>
              <p className="text-xs text-[--text-muted] mt-1">
                Tous les mouvements sont traités.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--bg-elevated)' }}>
                <tr>
                  {['Caisse', 'Type', 'Catégorie', 'Montant', 'Libellé', 'Créé par', 'Date', 'Actions'].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-xs font-medium text-[--text-muted] uppercase tracking-wider"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mouvements.map((m, i) => {
                  const isEntree = m.type === 'entree'
                  return (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: i < mouvements.length - 1 ? '1px solid var(--border-subtle)' : undefined,
                      }}
                    >
                      {/* Caisse — on résout via session, mais on n'a pas le nom ici */}
                      <td className="px-6 py-5">
                        <CaisseCell sessionId={m.session} caisses={caisses} />
                      </td>

                      {/* Type */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-1.5">
                          {isEntree ? (
                            <ArrowDownLeft size={13} style={{ color: 'var(--status-success)' }} />
                          ) : (
                            <ArrowUpRight size={13} style={{ color: 'var(--status-danger)' }} />
                          )}
                          <span
                            className="text-xs font-medium"
                            style={{ color: isEntree ? 'var(--status-success)' : 'var(--status-danger)' }}
                          >
                            {isEntree ? 'Entrée' : 'Sortie'}
                          </span>
                        </div>
                      </td>

                      {/* Catégorie */}
                      <td className="px-4 py-3 text-[--text-secondary] text-xs">
                        {m.categorie_detail.nom}
                      </td>

                      {/* Montant */}
                      <td className="px-4 py-3 font-data font-medium text-[--text-primary]">
                        {isEntree ? '+' : '-'}{formatXOF(m.montant)}
                      </td>

                      {/* Libellé */}
                      <td className="px-4 py-3 text-[--text-secondary] max-w-[200px] truncate">
                        {m.libelle}
                      </td>

                      {/* Créé par */}
                      <td className="px-4 py-3 text-[--text-muted] text-xs">
                        {m.created_by_nom}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-[--text-muted] text-xs font-data whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString('fr-FR', {
                          day:   '2-digit',
                          month: '2-digit',
                          year:  'numeric',
                          hour:  '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-1.5">
                          <button
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors"
                            style={{
                              background: 'rgba(0,168,140,0.1)',
                              color: 'var(--status-success)',
                              border: '1px solid rgba(0,168,140,0.2)',
                            }}
                            onClick={() => approuver.mutate(m.id)}
                            disabled={approuver.isPending}
                          >
                            <CheckCircle size={12} />
                            Approuver
                          </button>
                          <button
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors"
                            style={{
                              background: 'rgba(239,68,68,0.08)',
                              color: 'var(--status-danger)',
                              border: '1px solid rgba(239,68,68,0.15)',
                            }}
                            onClick={() => setRejectTarget(m)}
                          >
                            <XCircle size={12} />
                            Rejeter
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Résolution caisse depuis session ────────────────────────────────────────
// On n'a pas le nom de la caisse dans MouvementCaisseList, seulement session id.
// On utilise la liste des caisses et on cherche via session_ouverte.id ou on
// affiche la session id tronquée en fallback.

function CaisseCell({ sessionId, caisses }: { sessionId: string; caisses: CaisseList[] }) {
  // Si la session correspond à une session ouverte d'une caisse connue
  const match = caisses.find(c => c.session_ouverte?.id === sessionId)
  if (match) {
    return (
      <span className="text-sm font-medium text-[--text-primary]">{match.nom}</span>
    )
  }
  // Fallback : afficher les 8 premiers chars de l'ID de session
  return (
    <span className="text-xs font-data text-[--text-muted]">
      {sessionId.slice(0, 8)}…
    </span>
  )
}
