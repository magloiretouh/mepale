/**
 * MEPALE ERP — Transferts inter-caisses
 * Liste des transferts + modal de création.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Shuffle, Plus, ArrowRight, CheckCircle2, Clock3, XCircle } from 'lucide-react'

import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { Modal }   from '@/components/ui/Modal'
import { Badge }   from '@/components/ui/Badge'
import {
  caissesApi,
  type TransfertCaisseList,
  type CaisseList,
  type TransfertCaisseCreatePayload,
  type StatutTransfert,
} from '@/services/caisses'
import { formatXOF } from '@/lib/utils'

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 h-9 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statutTransfertBadge(statut: StatutTransfert) {
  switch (statut) {
    case 'approuve':   return <Badge variant="success">Approuvé</Badge>
    case 'en_attente': return <Badge variant="warning">En attente</Badge>
    case 'rejete':     return <Badge variant="danger">Rejeté</Badge>
  }
}

function statutIcon(statut: StatutTransfert) {
  switch (statut) {
    case 'approuve':   return <CheckCircle2 size={14} style={{ color: 'var(--status-success)' }} />
    case 'en_attente': return <Clock3       size={14} style={{ color: 'var(--status-warning)' }} />
    case 'rejete':     return <XCircle      size={14} style={{ color: 'var(--status-danger)' }} />
  }
}

// ─── Page principale ─────────────────────────────────────────────────────────

export function TransfertsPage() {
  const qc = useQueryClient()

  const [showCreate,  setShowCreate]  = useState(false)
  const [filterStatut, setFilterStatut] = useState('')
  const [filterSource, setFilterSource] = useState('')

  // Caisses pour filtres + formulaire
  const { data: caissesData } = useQuery({
    queryKey: ['caisses'],
    queryFn:  () => caissesApi.listCaisses({ page_size: 100 }).then(r => r.data),
  })
  const caisses: CaisseList[] = caissesData?.results ?? []

  // Transferts
  const params: Record<string, string> = {}
  if (filterStatut) params.statut    = filterStatut
  if (filterSource) params.caisse_source = filterSource

  const { data, isLoading } = useQuery({
    queryKey: ['caisses', 'transferts', filterStatut, filterSource],
    queryFn:  () => caissesApi.listTransferts({ ...params, page_size: 200 }).then(r => r.data),
  })

  const transferts: TransfertCaisseList[] = data?.results ?? []

  return (
    <>
      {/* Modal création */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nouveau transfert"
        size="sm"
        footer={undefined}
      >
        <CreateTransfertForm
          caisses={caisses}
          onCancel={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['caisses'] })
          }}
        />
      </Modal>

      <div className="space-y-5 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[--text-primary]">Transferts</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">
              Mouvements de fonds entre caisses
            </p>
          </div>
          <Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Nouveau transfert
          </Button>
        </div>

        {/* ── Filtres ── */}
        <div className="surface p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className={SELECT_CLASS}
              style={{ width: 180 }}
              value={filterStatut}
              onChange={e => setFilterStatut(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              <option value="en_attente">En attente</option>
              <option value="approuve">Approuvé</option>
              <option value="rejete">Rejeté</option>
            </select>

            <select
              className={SELECT_CLASS}
              style={{ width: 200 }}
              value={filterSource}
              onChange={e => setFilterSource(e.target.value)}
            >
              <option value="">Toutes les sources</option>
              {caisses.map(c => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>

            {(filterStatut || filterSource) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterStatut(''); setFilterSource('') }}
              >
                Effacer
              </Button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="surface overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-[--text-muted]">Chargement…</div>
          ) : transferts.length === 0 ? (
            <div className="p-12 text-center">
              <Shuffle size={28} className="mx-auto mb-3 text-[--text-muted]" />
              <p className="text-sm font-medium text-[--text-primary]">Aucun transfert</p>
              <p className="text-xs text-[--text-muted] mt-1">
                Les transferts entre caisses apparaîtront ici.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--bg-elevated)' }}>
                <tr>
                  {['De', '', 'Vers', 'Montant', 'Libellé', 'Statut', 'Créé par', 'Date'].map(h => (
                    <th
                      key={h + Math.random()}
                      className="text-left px-4 py-2.5 text-xs font-medium text-[--text-muted] uppercase tracking-wider"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transferts.map((t, i) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: i < transferts.length - 1 ? '1px solid var(--border-subtle)' : undefined,
                    }}
                  >
                    {/* Source */}
                    <td className="px-6 py-5">
                      <span className="text-sm font-medium text-[--text-primary]">
                        {t.caisse_source_nom}
                      </span>
                    </td>

                    {/* Flèche */}
                    <td className="px-2 py-3">
                      <ArrowRight size={14} className="text-[--text-muted]" />
                    </td>

                    {/* Destination */}
                    <td className="px-6 py-5">
                      <span className="text-sm font-medium text-[--text-primary]">
                        {t.caisse_destination_nom}
                      </span>
                    </td>

                    {/* Montant */}
                    <td className="px-4 py-3 font-data font-medium text-[--text-primary]">
                      {formatXOF(t.montant)}
                    </td>

                    {/* Libellé */}
                    <td className="px-4 py-3 text-[--text-secondary] max-w-[200px] truncate">
                      {t.libelle}
                    </td>

                    {/* Statut */}
                    <td className="px-6 py-5">
                      {statutTransfertBadge(t.statut)}
                    </td>

                    {/* Créé par */}
                    <td className="px-4 py-3 text-[--text-muted] text-xs">
                      {t.created_by_nom}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-[--text-muted] text-xs font-data whitespace-nowrap">
                      {new Date(t.created_at).toLocaleDateString('fr-FR', {
                        day:    '2-digit',
                        month:  '2-digit',
                        year:   'numeric',
                        hour:   '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Formulaire de création ───────────────────────────────────────────────────

function CreateTransfertForm({
  caisses,
  onCancel,
  onSuccess,
}: {
  caisses:   CaisseList[]
  onCancel:  () => void
  onSuccess: () => void
}) {
  const [source, setSource]     = useState('')
  const [dest,   setDest]       = useState('')
  const [montant, setMontant]   = useState('')
  const [libelle, setLibelle]   = useState('')

  const mut = useMutation({
    mutationFn: (data: TransfertCaisseCreatePayload) => caissesApi.createTransfert(data),
    onSuccess:  () => { toast.success('Transfert créé.'); onSuccess() },
  })

  const isValid = source && dest && source !== dest && Number(montant) > 0 && libelle.trim()

  // Caisse source : on affiche le solde disponible
  const sourceCaisse = caisses.find(c => c.id === source)

  return (
    <div className="flex flex-col gap-5">

      {/* Source */}
      <div>
        <label className={FIELD_LABEL}>Caisse source *</label>
        <select
          className={SELECT_CLASS}
          value={source}
          onChange={e => { setSource(e.target.value); if (e.target.value === dest) setDest('') }}
        >
          <option value="">Sélectionner…</option>
          {caisses.filter(c => c.actif && c.session_ouverte).map(c => (
            <option key={c.id} value={c.id}>
              {c.nom} — {formatXOF(c.solde_actuel)}
            </option>
          ))}
        </select>
        {source && !caisses.find(c => c.id === source)?.session_ouverte && (
          <p className="text-xs text-[--status-warning] mt-1">
            Cette caisse n'a pas de session ouverte.
          </p>
        )}
      </div>

      {/* Destination */}
      <div>
        <label className={FIELD_LABEL}>Caisse destination *</label>
        <select
          className={SELECT_CLASS}
          value={dest}
          onChange={e => setDest(e.target.value)}
        >
          <option value="">Sélectionner…</option>
          {caisses.filter(c => c.actif && c.id !== source).map(c => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
      </div>

      {/* Montant */}
      <div>
        <label className={FIELD_LABEL}>Montant (FCFA) *</label>
        <Input
          type="number"
          min="1"
          value={montant}
          onChange={e => setMontant(e.target.value)}
          placeholder="0"
        />
        {sourceCaisse && Number(montant) > sourceCaisse.solde_actuel && (
          <p className="text-xs text-[--status-warning] mt-1">
            Montant supérieur au solde disponible ({formatXOF(sourceCaisse.solde_actuel)}).
          </p>
        )}
      </div>

      {/* Libellé */}
      <div>
        <label className={FIELD_LABEL}>Libellé *</label>
        <Input
          value={libelle}
          onChange={e => setLibelle(e.target.value)}
          placeholder="Motif du transfert"
        />
      </div>

      {/* Boutons */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          loading={mut.isPending}
          disabled={!isValid}
          icon={<Shuffle size={13} />}
          onClick={() => mut.mutate({
            caisse_source:      source,
            caisse_destination: dest,
            montant:            Number(montant),
            libelle:            libelle.trim(),
          })}
        >
          Créer le transfert
        </Button>
      </div>
    </div>
  )
}
