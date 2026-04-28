/**
 * MEPALE ERP — Tableau de bord Caisses
 * Vue d'ensemble : soldes, statuts sessions, alertes, création caisse.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Landmark, Plus, ChevronRight, AlertTriangle,
  Clock, CheckCircle, TrendingUp,
} from 'lucide-react'

import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { Modal }   from '@/components/ui/Modal'
import { Badge }   from '@/components/ui/Badge'
import { caissesApi, type CaissePayload } from '@/services/caisses'
import { formatXOF } from '@/lib/utils'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Page principale ─────────────────────────────────────────────────────────

export function CaisseDashboard() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: stats } = useQuery({
    queryKey: ['caisses', 'stats'],
    queryFn:  () => caissesApi.stats().then(r => r.data),
  })

  const { data: caissesData, isLoading } = useQuery({
    queryKey: ['caisses'],
    queryFn:  () => caissesApi.listCaisses({ page_size: 100 }).then(r => r.data),
  })

  const caisses = caissesData?.results ?? []

  return (
    <>
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nouvelle caisse"
        size="sm"
        footer={undefined}
      >
        <CreateCaisseForm
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
            <h1 className="text-xl font-semibold text-[--text-primary]">Caisses</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">
              Gestion des caisses et mouvements de fonds
            </p>
          </div>
          <Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Nouvelle caisse
          </Button>
        </div>

        {/* ── Stats ── */}
        {stats && (
          <div className="grid grid-cols-4 gap-4">

            <div className="surface p-4">
              <p className="text-xs text-[--text-muted] uppercase tracking-wider mb-1">Solde total</p>
              <p className="text-xl font-semibold font-data text-[--text-primary]">
                {formatXOF(stats.total_solde)}
              </p>
              <p className="text-xs text-[--text-muted] mt-1">{stats.nb_caisses_actives} caisse(s) active(s)</p>
            </div>

            <div
              className="surface p-4 cursor-pointer hover:border-[--accent] transition-colors"
              onClick={() => navigate('/caisses/en-attente')}
            >
              <p className="text-xs text-[--text-muted] uppercase tracking-wider mb-1">En attente</p>
              <p className={`text-xl font-semibold ${
                stats.nb_en_attente > 0 ? 'text-[--status-warning]' : 'text-[--text-primary]'
              }`}>
                {stats.nb_en_attente}
              </p>
              <p className="text-xs text-[--text-muted] mt-1">mouvement(s) à approuver</p>
            </div>

            <div className="surface p-4">
              <p className="text-xs text-[--text-muted] uppercase tracking-wider mb-1">Alertes plafond</p>
              <p className={`text-xl font-semibold ${
                stats.alertes_plafond.length > 0 ? 'text-[--status-danger]' : 'text-[--text-primary]'
              }`}>
                {stats.alertes_plafond.length}
              </p>
              <p className="text-xs text-[--text-muted] mt-1">caisse(s) au-dessus du plafond</p>
            </div>

            <div className="surface p-4">
              <p className="text-xs text-[--text-muted] uppercase tracking-wider mb-1">Sessions ouvertes</p>
              <p className="text-xl font-semibold text-[--text-primary]">
                {caisses.filter(c => c.session_ouverte).length}
              </p>
              <p className="text-xs text-[--text-muted] mt-1">sur {caisses.length} caisse(s)</p>
            </div>
          </div>
        )}

        {/* ── Alertes plafond ── */}
        {stats && stats.alertes_plafond.length > 0 && (
          <div
            className="flex items-start gap-3 p-4 rounded-lg border"
            style={{ borderColor: 'var(--status-danger)', background: 'rgba(var(--status-danger-rgb,239,68,68),0.06)' }}
          >
            <AlertTriangle size={16} style={{ color: 'var(--status-danger)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--status-danger)' }}>
                Plafond de détention dépassé
              </p>
              <p className="text-xs text-[--text-muted] mt-0.5">
                {stats.alertes_plafond.map(a => `${a.nom} (${formatXOF(a.solde_actuel)})`).join(' · ')}
              </p>
            </div>
          </div>
        )}

        {/* ── Grille de caisses ── */}
        <div>
          <h2 className="text-sm font-medium text-[--text-secondary] uppercase tracking-wider mb-3">
            Toutes les caisses
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="surface p-5 h-36 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : caisses.length === 0 ? (
            <div className="surface p-10 text-center">
              <Landmark size={28} className="mx-auto mb-3 text-[--text-muted]" />
              <p className="text-sm text-[--text-muted]">Aucune caisse créée</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                icon={<Plus size={13} />}
                onClick={() => setShowCreate(true)}
              >
                Créer la première caisse
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {caisses.map(caisse => (
                <div
                  key={caisse.id}
                  className="surface p-5 cursor-pointer hover:border-[--accent] transition-all group"
                  onClick={() => navigate(`/caisses/${caisse.id}`)}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--accent-dim)' }}
                      >
                        <Landmark size={15} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[--text-primary] leading-tight">
                          {caisse.nom}
                        </p>
                        {caisse.responsable_nom && (
                          <p className="text-xs text-[--text-muted]">{caisse.responsable_nom}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-[--text-muted] opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>

                  {/* Solde */}
                  <p className="text-xl font-semibold font-data text-[--text-primary] mb-3">
                    {formatXOF(caisse.solde_actuel)}
                  </p>

                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {caisse.session_ouverte ? (
                      <Badge variant="success" dot>Session ouverte</Badge>
                    ) : (
                      <Badge variant="neutral" dot>Fermée</Badge>
                    )}
                    {caisse.alerte_plafond && (
                      <Badge variant="danger">
                        <AlertTriangle size={10} className="mr-1" />
                        Plafond
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Formulaire de création ───────────────────────────────────────────────────

function CreateCaisseForm({
  onCancel,
  onSuccess,
}: {
  onCancel:  () => void
  onSuccess: () => void
}) {
  const [nom,     setNom]     = useState('')
  const [plafond, setPlafond] = useState('')

  const mut = useMutation({
    mutationFn: (data: CaissePayload) => caissesApi.createCaisse(data),
    onSuccess:  () => { toast.success('Caisse créée.'); onSuccess() },
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={FIELD_LABEL}>Nom *</label>
        <Input
          value={nom}
          onChange={e => setNom(e.target.value)}
          placeholder="ex : Caisse Principale"
        />
      </div>
      <div>
        <label className={FIELD_LABEL}>Plafond alerte (FCFA)</label>
        <Input
          type="number"
          value={plafond}
          onChange={e => setPlafond(e.target.value)}
          placeholder="Optionnel"
        />
        <p className="text-xs text-[--text-muted] mt-1">
          Alerte si le solde dépasse ce montant.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          loading={mut.isPending}
          disabled={!nom.trim()}
          onClick={() => mut.mutate({
            nom,
            responsable:    null,
            plafond_alerte: plafond ? Number(plafond) : null,
            actif:          true,
          })}
        >
          Créer la caisse
        </Button>
      </div>
    </div>
  )
}
