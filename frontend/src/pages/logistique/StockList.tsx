/**
 * MEPALE ERP — Page Gestion des Stocks
 * Tableau de bord stock : niveaux, alertes seuil, mouvements récents
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Filter,
} from 'lucide-react'

import { logistiqueApi, type StockArticle } from '@/services/logistique'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { cn, formatXOF } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pourcentage de niveau de stock (disponible vs seuil alerte) */
function StockLevel({ article }: { article: StockArticle }) {
  const total = Math.max(article.quantite_physique, article.seuil_alerte * 2, 1)
  const pct   = Math.min((article.quantite_disponible / total) * 100, 100)

  const color = article.en_alerte
    ? 'var(--status-danger)'
    : pct < 60
    ? 'var(--status-warning)'
    : 'var(--status-success)'

  return (
    <span className="font-data text-sm font-semibold" style={{ color }}>
      {Math.round(pct)}%
    </span>
  )
}

/** KPI card compact */
function KpiCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; color: string
}) {
  return (
    <div
      className="surface rounded-lg px-4 py-3 flex items-center gap-3"
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color, color: '#0A0B10' }}
      >
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-[--text-muted] uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold font-data text-[--text-primary] leading-none mt-0.5">
          {value}
        </p>
        {sub && <p className="text-[10px] text-[--text-secondary] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

type FiltreStock = 'tous' | 'alerte' | 'ok'

const FILTRES_STOCK: { label: string; value: FiltreStock }[] = [
  { label: 'Tous', value: 'tous' },
  { label: 'En alerte', value: 'alerte' },
  { label: 'Normaux', value: 'ok' },
]

const now      = new Date()
const dateDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
const dateFin   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

export function StockList() {
  const [search, setSearch]   = useState('')
  const [filtre, setFiltre]   = useState<FiltreStock>('tous')

  const params: Record<string, string | boolean> = {}
  if (search)             params.search = search
  if (filtre === 'alerte') params.en_alerte = true
  if (filtre === 'ok')     params.en_alerte = false

  const { data, isLoading } = useQuery({
    queryKey:      ['stock', search, filtre],
    queryFn:       () => logistiqueApi.listStock(params as any),
    select:        (r) => r.data,
    staleTime:     0,   // toujours re-fetche à la navigation (stock peut changer depuis n'importe quel module)
    refetchOnWindowFocus: true,
  })

  const { data: rapportMois } = useQuery({
    queryKey: ['stock-rapport-mois', dateDebut, dateFin],
    queryFn:  () => logistiqueApi.rapportStockPeriodique({ date_debut: dateDebut, date_fin: dateFin }),
    select:   (r) => r.data,
    staleTime: 5 * 60 * 1000,
  })

  const totalEntrees = rapportMois?.rapport.reduce((s, r) => s + r.total_entrees, 0) ?? null
  const totalSorties = rapportMois?.rapport.reduce((s, r) => s + r.total_sorties, 0) ?? null

  const stocks    = data?.results ?? []
  const enAlerte  = stocks.filter((s) => s.en_alerte).length
  const totalRefs = data?.count ?? 0

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-slide-in">

      {/* ── En-tête ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[--text-primary]">Gestion des Stocks</h1>
          <p className="text-xs text-[--text-muted] mt-0.5">
            Niveaux en temps réel — méthode FIFO
          </p>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="surface overflow-hidden flex flex-col flex-1 min-h-0" style={{ boxShadow: 'var(--shadow-card)' }}>

      {/* ── KPIs ── */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-5 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
      >
        <KpiCard
          label="Références"
          value={totalRefs}
          icon={<Package size={16} />}
          color="var(--accent)"
        />
        <KpiCard
          label="En alerte"
          value={enAlerte}
          sub={enAlerte > 0 ? 'Seuil minimal atteint' : 'Tout est OK'}
          icon={<AlertTriangle size={16} />}
          color={enAlerte > 0 ? 'var(--status-danger)' : 'var(--status-success)'}
        />
        <KpiCard
          label="Entrées (mois)"
          value={totalEntrees !== null ? totalEntrees.toLocaleString('fr-TG') : '—'}
          icon={<TrendingUp size={16} />}
          color="var(--status-success)"
        />
        <KpiCard
          label="Sorties (mois)"
          value={totalSorties !== null ? totalSorties.toLocaleString('fr-TG') : '—'}
          icon={<TrendingDown size={16} />}
          color="var(--status-warning)"
        />
      </div>

      {/* ── Filtres ── */}
      <div
        className="flex items-center gap-3 px-6 py-4 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
      >
        <div className="w-64">
          <Input
            placeholder="Rechercher un article…"
            icon={<Search size={13} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-[--text-muted] mr-1" />
          {FILTRES_STOCK.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltre(f.value)}
              className={cn(
                'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all',
                filtre === f.value
                  ? 'text-[--accent]'
                  : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
              )}
              style={
                filtre === f.value
                  ? { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                  : { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
              }
            >
              {f.label}
              {f.value === 'alerte' && enAlerte > 0 && (
                <span
                  className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--status-danger)', color: '#fff' }}
                >
                  {enAlerte}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr
              className="text-left sticky top-0 z-10"
              style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}
            >
              {['Article', 'Type', 'Disponible', 'Réservé', 'Niveau', 'Seuil alerte', 'Statut'].map((h) => (
                <th
                  key={h}
                  className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-6 py-5">
                        <div className="skeleton h-4 rounded" style={{ width: `${50 + j * 8}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : stocks.length === 0
              ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Package size={32} className="mx-auto mb-3 text-[--text-muted]" />
                    <p className="text-sm text-[--text-secondary]">Aucun article en stock</p>
                  </td>
                </tr>
              )
              : stocks.map((s) => (
                <tr
                  key={s.id}
                  className={cn(
                    'group hover:bg-[--bg-elevated] transition-colors',
                    s.en_alerte && 'bg-[--status-danger-bg]/30',
                  )}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  {/* Article */}
                  <td className="px-6 py-5">
                    <div>
                      <p className="text-xs font-semibold text-[--text-primary]">
                        {s.article_detail.designation}
                      </p>
                      <span className="font-data text-[10px] text-[--accent]">
                        {s.article_detail.code}
                      </span>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">
                      {s.article_detail.type_label}
                    </span>
                  </td>

                  {/* Disponible */}
                  <td className="px-6 py-5">
                    <span
                      className={cn(
                        'font-data text-sm font-bold',
                        s.en_alerte ? 'text-[--status-danger]' : 'text-[--text-primary]',
                      )}
                    >
                      {s.quantite_disponible.toLocaleString('fr-TG')}
                    </span>
                    <span className="text-[10px] text-[--text-muted] ml-1">
                      {s.article_detail.unite_code}
                    </span>
                  </td>

                  {/* Réservé */}
                  <td className="px-6 py-5">
                    <span className="font-data text-xs text-[--text-secondary]">
                      {s.quantite_reservee.toLocaleString('fr-TG')}
                    </span>
                    <span className="text-[10px] text-[--text-muted] ml-1">
                      {s.article_detail.unite_code}
                    </span>
                  </td>

                  {/* Niveau */}
                  <td className="px-6 py-5">
                    <StockLevel article={s} />
                  </td>

                  {/* Seuil alerte */}
                  <td className="px-6 py-5">
                    <span className="font-data text-xs text-[--text-secondary]">
                      {s.seuil_alerte.toLocaleString('fr-TG')} {s.article_detail.unite_code}
                    </span>
                  </td>

                  {/* Statut */}
                  <td className="px-6 py-5">
                    {s.en_alerte ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full status-dot-pulse"
                          style={{ backgroundColor: 'var(--status-danger)' }}
                        />
                        <Badge variant="danger">Alerte stock</Badge>
                      </div>
                    ) : (
                      <Badge variant="success">Normal</Badge>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </div>

      </div>
    </div>
  )
}
