import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CreateOFModal } from '@/components/production/CreateOFModal'
import {
  Factory,
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  Plus,
  ArrowRight,
  Boxes,
  Wallet,
  RefreshCw,
  FileWarning,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import { productionApi } from '@/services/production'
import { logistiqueApi } from '@/services/logistique'

/* ── Sub-components ── */

interface KpiCardProps {
  label:     string
  value:     string
  sub?:      string
  trend?:    number
  icon:      React.ReactNode
  iconColor: string
  iconBg:    string
  loading?:  boolean
}

function KpiCard({ label, value, sub, trend, icon, iconColor, iconBg, loading }: KpiCardProps) {
  const isPositive = trend !== undefined && trend >= 0
  return (
    <div className="surface p-5 flex flex-col gap-3 hover:shadow-[--shadow-md] transition-all duration-200">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[--text-muted] uppercase tracking-wider leading-none">
          {label}
        </p>
        <div
          className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        {loading
          ? <div className="skeleton h-7 w-16 rounded" />
          : <p className="text-2xl font-bold text-[--text-primary] font-data leading-none">{value}</p>
        }
        {trend !== undefined && (
          <span
            className="flex items-center gap-0.5 text-xs font-medium font-data"
            style={{ color: isPositive ? 'var(--status-success)' : 'var(--status-danger)' }}
          >
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-[--text-muted] -mt-1">{sub}</p>}
    </div>
  )
}

function StatutBadge({ statut }: { statut: string }) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' | 'danger' }> = {
    brouillon: { label: 'Brouillon', variant: 'neutral'  },
    confirme:  { label: 'Confirmé',  variant: 'info'     },
    en_cours:  { label: 'En cours',  variant: 'warning'  },
    termine:   { label: 'Terminé',   variant: 'success'  },
    cloture:   { label: 'Clôturé',   variant: 'neutral'  },
  }
  const cfg = map[statut] ?? { label: statut, variant: 'neutral' as const }
  return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
}

const statutIcons: Record<string, React.ReactNode> = {
  brouillon: <Clock size={13} />,
  confirme:  <PauseCircle size={13} />,
  en_cours:  <PlayCircle size={13} />,
  termine:   <CheckCircle2 size={13} />,
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded px-3 py-2 text-xs shadow-[--shadow-md]"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <p className="text-[--text-muted] mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

/* ── Main Dashboard ── */
export function Dashboard() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)

  const { data: stats, isLoading: loadingProd, refetch: refetchProd } = useQuery({
    queryKey: ['dashboard-stats-production'],
    queryFn:  () => productionApi.statsProduction().then(r => r.data),
    staleTime: 60_000,
  })

  const { data: logStats, refetch: refetchLog } = useQuery({
    queryKey: ['dashboard-stats-logistique'],
    queryFn:  () => logistiqueApi.statsLogistique().then(r => r.data),
    staleTime: 60_000,
  })

  const handleRefresh = () => { refetchProd(); refetchLog() }

  // Alertes dynamiques
  const alertes: Array<{ type: string; message: string; severite: 'danger' | 'warning' }> = []
  if (stats) {
    if (stats.alertes_peremption > 0)
      alertes.push({ type: 'peremption', message: `${stats.alertes_peremption} lot${stats.alertes_peremption > 1 ? 's' : ''} proche${stats.alertes_peremption > 1 ? 's' : ''} de péremption (≤ 7 j)`, severite: 'danger' })
    if (stats.alertes_stock > 0)
      alertes.push({ type: 'stock', message: `${stats.alertes_stock} article${stats.alertes_stock > 1 ? 's' : ''} sous le seuil d'alerte stock`, severite: 'warning' })
    stats.alertes_rendement.slice(0, 3).forEach(a =>
      alertes.push({ type: 'rendement', message: a.message, severite: 'warning' })
    )
    if (stats.of_en_retard > 0)
      alertes.push({ type: 'retard', message: `${stats.of_en_retard} OF en retard sur planning`, severite: 'warning' })
  }

  const today = new Date().toLocaleDateString('fr-TG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <>
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[--text-primary]">Vue d'ensemble</h1>
          <p className="text-sm text-[--text-muted] mt-0.5 capitalize">
            {today} — Production &amp; Opérations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={handleRefresh}>
            Actualiser
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
            Nouvel OF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <KpiCard
          label="OFs en cours"
          value={stats ? String(stats.of_en_cours) : '—'}
          sub={stats && stats.of_en_retard > 0 ? `${stats.of_en_retard} en retard` : 'Planifiés aujourd\'hui'}
          icon={<Factory size={15} />}
          iconBg="var(--accent-dim)" iconColor="var(--accent)"
          loading={loadingProd}
        />
        <KpiCard
          label="OFs confirmés"
          value={stats ? String(stats.of_confirmes) : '—'}
          sub="En attente de démarrage"
          icon={<Package size={15} />}
          iconBg="var(--status-info-bg)" iconColor="var(--status-info)"
          loading={loadingProd}
        />
        <KpiCard
          label="Articles sous seuil"
          value={logStats ? String(logStats.articles_sous_seuil) : '—'}
          sub="Réapprovisionnement requis"
          icon={<Boxes size={15} />}
          iconBg="var(--status-warning-bg)" iconColor="var(--status-warning)"
          loading={!logStats}
        />
        <KpiCard
          label="Rendement global"
          value={stats ? `${stats.rendement_moyen}%` : '—'}
          sub="Seuil d'alerte : 80%"
          icon={<TrendingUp size={15} />}
          iconBg="var(--status-success-bg)" iconColor="var(--status-success)"
          loading={loadingProd}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Production 7 jours */}
        <div className="surface p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[--text-primary]">Production — 7 derniers jours</h2>
              <p className="text-xs text-[--text-muted]">Unités produites vs cible journalière</p>
            </div>
            <Badge variant="accent">Cette semaine</Badge>
          </div>
          {loadingProd
            ? <div className="skeleton h-44 rounded" />
            : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={stats?.production_7j ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="gradProd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="var(--accent)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0}    />
                    </linearGradient>
                    <linearGradient id="gradCible" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="var(--status-neutral)" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="var(--status-neutral)" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="jour" tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="cible" name="Cible" stroke="var(--status-neutral)" strokeWidth={1} strokeDasharray="4 4" fill="url(#gradCible)" />
                  <Area type="monotone" dataKey="produit" name="Produit" stroke="var(--accent)" strokeWidth={2} fill="url(#gradProd)" />
                </AreaChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Rendement par OF */}
        <div className="surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[--text-primary]">Rendement par OF</h2>
              <p className="text-xs text-[--text-muted]">5 derniers OFs clôturés</p>
            </div>
          </div>
          {loadingProd
            ? <div className="skeleton h-44 rounded" />
            : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats?.rendement_ofs ?? []} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="of" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={105} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="rendement" name="Rendement %" radius={[0, 3, 3, 0]}>
                    {(stats?.rendement_ofs ?? []).map((entry) => (
                      <Cell
                        key={entry.of}
                        fill={entry.rendement >= 90 ? 'var(--accent)' : entry.rendement >= 80 ? 'var(--status-warning)' : 'var(--status-danger)'}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* OFs récents */}
        <div className="surface p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[--text-primary]">Ordres de Fabrication — Récents</h2>
            <Button variant="ghost" size="xs" iconRight={<ArrowRight size={11} />} onClick={() => navigate('/production/ordres-de-fabrication')}>Voir tout</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  {['Référence', 'Produit', 'Quantité', 'Statut', 'Rendement'].map((h) => (
                    <th key={h} className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingProd
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="py-2.5 pr-3"><div className="skeleton h-3 rounded" style={{ width: `${40 + j * 10}%` }} /></td>
                        ))}
                      </tr>
                    ))
                  : (stats?.ofs_recents ?? []).map((of, i) => (
                    <tr
                      key={of.reference}
                      className="border-b transition-colors duration-100 cursor-pointer"
                      style={{ borderColor: 'var(--border-subtle)', animationDelay: `${0.05 + i * 0.04}s` }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <td className="py-2.5 pr-3">
                        <span className="font-data text-xs font-semibold text-[--accent]">{of.reference}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-[--text-primary] font-medium text-xs">{of.produit}</td>
                      <td className="py-2.5 pr-3">
                        <span className="font-data text-xs text-[--text-secondary]">
                          {of.quantite_prevue.toLocaleString('fr-TG')} <span className="text-[--text-muted]">{of.unite}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[--text-muted]">{statutIcons[of.statut]}</span>
                          <StatutBadge statut={of.statut} />
                        </div>
                      </td>
                      <td className="py-2.5">
                        {of.rendement > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                              <div className="h-full rounded-full transition-all duration-500" style={{
                                width: `${Math.min(of.rendement, 100)}%`,
                                backgroundColor: of.rendement >= 90 ? 'var(--status-success)' : of.rendement >= 80 ? 'var(--status-warning)' : 'var(--status-danger)',
                              }} />
                            </div>
                            <span className="font-data text-[11px] font-medium" style={{
                              color: of.rendement >= 90 ? 'var(--status-success)' : of.rendement >= 80 ? 'var(--status-warning)' : 'var(--status-danger)',
                            }}>
                              {of.rendement}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[--text-muted] text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Alertes + État modules */}
        <div className="flex flex-col gap-3">
          <div className="surface p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[--text-primary] flex items-center gap-1.5">
                <AlertTriangle size={13} style={{ color: 'var(--status-warning)' }} />
                Alertes actives
                {alertes.length > 0 && (
                  <span className="ml-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center font-data"
                    style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}>
                    {alertes.length}
                  </span>
                )}
              </h2>
            </div>
            <div className="space-y-2">
              {loadingProd
                ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-8 rounded" />)
                : alertes.length === 0
                ? <p className="text-xs text-[--text-muted] italic">Aucune alerte active ✓</p>
                : alertes.slice(0, 5).map((alerte, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: alerte.severite === 'danger' ? 'var(--status-danger)' : 'var(--status-warning)' }} />
                    <p className="text-xs text-[--text-secondary] leading-relaxed">{alerte.message}</p>
                  </div>
                ))
              }
            </div>
          </div>

          <div className="surface p-5">
            <h2 className="text-sm font-semibold text-[--text-primary] mb-3">État des modules</h2>
            <div className="space-y-2">
              {[
                {
                  label: 'Stock',
                  icon:  <Boxes size={12} />,
                  val:   logStats ? `${logStats.articles_sous_seuil} art. sous seuil` : '…',
                  v:     (logStats && logStats.articles_sous_seuil > 0 ? 'warning' : 'success') as 'warning' | 'success',
                },
                {
                  label: 'Factures',
                  icon:  <FileWarning size={12} />,
                  val:   logStats ? `${logStats.factures_en_retard} en retard` : '…',
                  v:     (logStats && logStats.factures_en_retard > 0 ? 'danger' : 'success') as 'danger' | 'success',
                },
                {
                  label: 'Commandes',
                  icon:  <Wallet size={12} />,
                  val:   logStats ? `${logStats.bc_envoye} BC envoyé${logStats.bc_envoye !== 1 ? 's' : ''}` : '…',
                  v:     'info' as const,
                },
                {
                  label: 'Production',
                  icon:  <Factory size={12} />,
                  val:   stats ? `${stats.of_en_cours} OF en cours` : '…',
                  v:     (stats && stats.of_en_retard > 0 ? 'warning' : 'success') as 'warning' | 'success',
                },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[--text-secondary]">
                    {item.icon}
                    <span className="text-xs font-medium">{item.label}</span>
                  </div>
                  <Badge variant={item.v} className="text-[10px]">{item.val}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

    <CreateOFModal
      isOpen={createOpen}
      onClose={() => setCreateOpen(false)}
      onSuccess={() => qc.invalidateQueries({ queryKey: ['dashboard-stats-production'] })}
    />
    </>
  )
}
