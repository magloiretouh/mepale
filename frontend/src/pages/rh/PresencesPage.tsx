/**
 * MEPALE ERP — Présences
 * Saisie journalière en masse + navigation par date + résumé mensuel
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Save, Users, CheckCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge  } from '@/components/ui/Badge'
import { rhApi, type StatutPointage, type Pointage } from '@/services/rh'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fmtDateLong(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtMois(iso: string): string {
  const [y, m] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

const STATUT_OPTS: { value: StatutPointage; label: string }[] = [
  { value: 'present',      label: 'Présent'    },
  { value: 'retard',       label: 'Retard'     },
  { value: 'demi_journee', label: 'Demi-j.'    },
  { value: 'absent',       label: 'Absent'     },
  { value: 'conge',        label: 'Congé'      },
]

const STATUT_VARIANT: Record<StatutPointage, 'success' | 'warning' | 'info' | 'danger' | 'neutral'> = {
  present:      'success',
  retard:       'warning',
  demi_journee: 'info',
  absent:       'danger',
  conge:        'neutral',
}

// SELECT styles légers pour les cellules du tableau
const CELL_SELECT = cn(
  'h-7 bg-[--bg-surface] border border-[--border] rounded text-xs pl-2 pr-6',
  'text-[--text-primary] appearance-none transition-all',
  'focus:outline-none focus:border-[--accent]',
)

// ─── Calcul stats ─────────────────────────────────────────────────────────────

function useStats(lignes: { statut: StatutPointage }[]) {
  return useMemo(() => {
    const counts: Record<StatutPointage, number> = { present: 0, retard: 0, demi_journee: 0, absent: 0, conge: 0 }
    for (const l of lignes) counts[l.statut] = (counts[l.statut] ?? 0) + 1
    return counts
  }, [lignes])
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PresencesPage() {
  const qc = useQueryClient()

  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()))
  const [view,         setView         ] = useState<'jour' | 'mois'>('jour')

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: employees = [], isLoading: empsLoading } = useQuery({
    queryKey: ['rh-employees'],
    queryFn:  () => rhApi.listEmployees({ active: 1 }).then(r => r.data),
  })

  const mois = selectedDate.slice(0, 7)

  const { data: pointagesJour = [], isLoading: ptLoading } = useQuery({
    queryKey: ['rh-pointages-jour', selectedDate],
    queryFn:  () => rhApi.listPointages({ date: selectedDate }).then(r => r.data),
    enabled:  view === 'jour',
  })

  const { data: pointagesMois = [], isLoading: ptMoisLoading } = useQuery({
    queryKey: ['rh-pointages-mois', mois],
    queryFn:  () => rhApi.listPointages({ mois }).then(r => r.data),
    enabled:  view === 'mois',
  })

  // ── Lignes éditables (jour) ───────────────────────────────────────────────
  // Initialise depuis pointagesJour ou défaut PRESENT
  const [lignes, setLignes] = useState<{
    employee_id: number
    statut: StatutPointage
    heure_arrivee: string
    heure_depart: string
    note: string
  }[]>([])

  // Sync lignes quand données arrivent
  const lignesSync = useMemo(() => {
    const ptMap = new Map<number, Pointage>()
    for (const p of pointagesJour) ptMap.set(p.employee, p)
    return employees.map(emp => {
      const existing = ptMap.get(emp.id)
      return {
        employee_id:   emp.id,
        statut:        (existing?.statut ?? 'present') as StatutPointage,
        heure_arrivee: existing?.heure_arrivee ?? '',
        heure_depart:  existing?.heure_depart  ?? '',
        note:          existing?.note          ?? '',
      }
    })
  }, [employees, pointagesJour])

  const [localLignes, setLocalLignes] = useState<typeof lignesSync>([])
  const effectiveLignes = localLignes.length === lignesSync.length ? localLignes : lignesSync

  const updateLigne = (idx: number, field: string, value: string) => {
    const copy = effectiveLignes.map((l, i) => i === idx ? { ...l, [field]: value } : l)
    setLocalLignes(copy)
  }

  const markAllPresent = () => {
    setLocalLignes(effectiveLignes.map(l => ({ ...l, statut: 'present' as StatutPointage })))
  }

  const stats = useStats(effectiveLignes)

  // ── Sauvegarde bulk ───────────────────────────────────────────────────────
  const { mutate: saveBulk, isPending: saving } = useMutation({
    mutationFn: () => rhApi.bulkPointages({
      date: selectedDate,
      pointages: effectiveLignes.map(l => ({
        employee:      l.employee_id,
        statut:        l.statut,
        heure_arrivee: l.heure_arrivee || undefined,
        heure_depart:  l.heure_depart  || undefined,
        note:          l.note          || undefined,
      })),
    }),
    onSuccess: (res) => {
      const errors = res.data.errors
      if (errors.length > 0) {
        toast.warning(`${res.data.saved.length} pointages enregistrés, ${errors.length} erreur(s).`)
      } else {
        toast.success(`${res.data.saved.length} pointages enregistrés.`)
      }
      setLocalLignes([])
      qc.invalidateQueries({ queryKey: ['rh-pointages-jour', selectedDate] })
      qc.invalidateQueries({ queryKey: ['rh-pointages-mois', mois] })
    },
    onError: () => toast.error('Erreur lors de la sauvegarde.'),
  })

  // ── Navigation date ───────────────────────────────────────────────────────
  const addDays = (n: number) => {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + n)
    setSelectedDate(toISODate(d))
    setLocalLignes([])
  }

  // ── Vue mois : matrice dates × employés ───────────────────────────────────
  const { datesInMois, ptMoisMap } = useMemo(() => {
    const [y, m] = mois.split('-').map(Number)
    const nDays = new Date(y, m, 0).getDate()
    const dates: string[] = []
    for (let d = 1; d <= nDays; d++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      dates.push(iso)
    }
    const map = new Map<string, Pointage>()
    for (const p of pointagesMois) map.set(`${p.employee}-${p.date}`, p)
    return { datesInMois: dates, ptMoisMap: map }
  }, [mois, pointagesMois])

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full animate-fade-in">

      {/* ── En-tête ── */}
      <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Présences</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Suivi de la présence journalière des employés
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle vue */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
          >
            {(['jour', 'mois'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: view === v ? 'var(--accent)' : 'var(--bg-elevated)',
                  color:           view === v ? '#fff'           : 'var(--text-secondary)',
                }}
              >
                {v === 'jour' ? 'Jour' : 'Mois'}
              </button>
            ))}
          </div>
          {view === 'jour' && (
            <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving}
              onClick={() => saveBulk()} disabled={empsLoading || employees.length === 0}>
              Enregistrer
            </Button>
          )}
        </div>
      </div>

      {/* ── Navigateur de date ── */}
      <div
        className="flex items-center gap-3 rounded-lg px-4 py-3"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', marginBottom: 16 }}
      >
        <button onClick={() => addDays(view === 'jour' ? -1 : -30)}
          className="w-7 h-7 rounded flex items-center justify-center transition-all hover:bg-[--bg-elevated]"
          style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={16} />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={e => { setSelectedDate(e.target.value); setLocalLignes([]) }}
          className="text-sm font-medium bg-transparent border-none outline-none"
          style={{ color: 'var(--text-primary)', minWidth: 140 }}
        />
        <button onClick={() => addDays(view === 'jour' ? 1 : 30)}
          className="w-7 h-7 rounded flex items-center justify-center transition-all hover:bg-[--bg-elevated]"
          style={{ color: 'var(--text-secondary)' }}>
          <ChevronRight size={16} />
        </button>
        <span className="text-sm capitalize" style={{ color: 'var(--text-muted)' }}>
          {view === 'jour' ? fmtDateLong(selectedDate) : fmtMois(selectedDate)}
        </span>

        {view === 'jour' && (
          <>
            <div className="ml-auto flex items-center gap-4">
              {(Object.entries(stats) as [StatutPointage, number][])
                .filter(([, v]) => v > 0)
                .map(([statut, count]) => (
                  <span key={statut} className="flex items-center gap-1.5">
                    <Badge variant={STATUT_VARIANT[statut]}>{STATUT_OPTS.find(o => o.value === statut)?.label}</Badge>
                    <span className="text-xs font-data font-semibold" style={{ color: 'var(--text-secondary)' }}>{count}</span>
                  </span>
                ))}
            </div>
            <button
              onClick={markAllPresent}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-all hover:opacity-75"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)' }}
            >
              <CheckCheck size={12} /> Tout présent
            </button>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* VUE JOUR                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {view === 'jour' && (
        <>
          {(empsLoading || ptLoading) && (
            <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
          )}

          {!empsLoading && !ptLoading && employees.length === 0 && (
            <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-muted)' }}>
              <Users size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
              <p className="text-sm">Aucun employé actif.</p>
            </div>
          )}

          {!empsLoading && !ptLoading && employees.length > 0 && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                      {['Employé', 'Statut', 'Arrivée', 'Départ', 'Note'].map((col, i) => (
                        <th key={i} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-left whitespace-nowrap"
                          style={{ color: i === 1 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp, i) => {
                      const ligne = effectiveLignes[i] ?? { statut: 'present' as StatutPointage, heure_arrivee: '', heure_depart: '', note: '' }
                      return (
                        <tr key={emp.id}
                          style={{ backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent', borderBottom: '1px solid var(--border)' }}>

                          {/* Employé */}
                          <td className="px-3 py-2">
                            <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                              {emp.name}
                            </div>
                            {emp.role && (
                              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.role}</div>
                            )}
                          </td>

                          {/* Statut */}
                          <td className="px-3 py-2">
                            <select
                              className={CELL_SELECT}
                              value={ligne.statut}
                              onChange={e => updateLigne(i, 'statut', e.target.value)}
                              style={{
                                borderColor: ligne.statut === 'absent' ? 'var(--status-danger)'
                                  : ligne.statut === 'present' ? 'var(--status-success)'
                                  : ligne.statut === 'retard'  ? 'var(--status-warning)'
                                  : 'var(--border)',
                              }}
                            >
                              {STATUT_OPTS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>

                          {/* Heure arrivée */}
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              value={ligne.heure_arrivee}
                              onChange={e => updateLigne(i, 'heure_arrivee', e.target.value)}
                              className="h-7 bg-[--bg-surface] border border-[--border] rounded text-xs px-2 outline-none focus:border-[--accent]"
                              style={{ color: 'var(--text-primary)', width: 90 }}
                            />
                          </td>

                          {/* Heure départ */}
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              value={ligne.heure_depart}
                              onChange={e => updateLigne(i, 'heure_depart', e.target.value)}
                              className="h-7 bg-[--bg-surface] border border-[--border] rounded text-xs px-2 outline-none focus:border-[--accent]"
                              style={{ color: 'var(--text-primary)', width: 90 }}
                            />
                          </td>

                          {/* Note */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={ligne.note}
                              onChange={e => updateLigne(i, 'note', e.target.value)}
                              placeholder="Note…"
                              className="h-7 bg-[--bg-surface] border border-[--border] rounded text-xs px-2 outline-none focus:border-[--accent] w-full"
                              style={{ color: 'var(--text-primary)', minWidth: 120, maxWidth: 200 }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* VUE MOIS                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {view === 'mois' && (
        <>
          {ptMoisLoading && (
            <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
          )}

          {!ptMoisLoading && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                      <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider sticky left-0 z-10"
                        style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)', minWidth: 160 }}>
                        Employé
                      </th>
                      {datesInMois.map(d => {
                        const dow = new Date(d + 'T00:00:00').getDay()
                        const isWE = dow === 0 || dow === 6
                        return (
                          <th key={d}
                            className="px-1.5 py-2.5 text-center font-semibold"
                            style={{
                              color:           isWE ? 'var(--text-muted)' : 'var(--text-secondary)',
                              backgroundColor: isWE ? 'var(--bg-base)'    : 'var(--bg-elevated)',
                              minWidth: 32,
                            }}>
                            {d.slice(8)}
                          </th>
                        )
                      })}
                      <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--accent)', minWidth: 64 }}>P</th>
                      <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--status-danger)', minWidth: 64 }}>A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp, i) => {
                      let presents = 0, absents = 0
                      return (
                        <tr key={emp.id}
                          style={{ backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2 font-medium sticky left-0 z-10"
                            style={{ color: 'var(--text-primary)', backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'var(--bg-surface)', minWidth: 160, borderRight: '1px solid var(--border)' }}>
                            {emp.name}
                          </td>
                          {datesInMois.map(d => {
                            const pt = ptMoisMap.get(`${emp.id}-${d}`)
                            const dow = new Date(d + 'T00:00:00').getDay()
                            const isWE = dow === 0 || dow === 6
                            if (pt?.statut === 'present' || pt?.statut === 'retard' || pt?.statut === 'demi_journee') presents++
                            if (pt?.statut === 'absent') absents++
                            const color =
                              !pt || isWE ? undefined
                              : pt.statut === 'present'      ? 'var(--status-success)'
                              : pt.statut === 'absent'       ? 'var(--status-danger)'
                              : pt.statut === 'retard'       ? 'var(--status-warning)'
                              : pt.statut === 'demi_journee' ? 'var(--accent)'
                              : 'var(--text-muted)'
                            const abbr =
                              !pt ? '' :
                              pt.statut === 'present'      ? 'P'
                              : pt.statut === 'absent'     ? 'A'
                              : pt.statut === 'retard'     ? 'R'
                              : pt.statut === 'demi_journee' ? 'D'
                              : pt.statut === 'conge'      ? 'C'
                              : ''
                            return (
                              <td key={d} className="px-1.5 py-2 text-center font-data font-bold"
                                title={pt ? STATUT_OPTS.find(o => o.value === pt.statut)?.label : undefined}
                                style={{
                                  color,
                                  backgroundColor: isWE ? 'var(--bg-base)' : undefined,
                                }}>
                                {abbr}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-center font-data font-semibold" style={{ color: 'var(--accent)' }}>
                            {presents}
                          </td>
                          <td className="px-3 py-2 text-center font-data font-semibold" style={{ color: 'var(--status-danger)' }}>
                            {absents}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Légende */}
              <div className="px-4 py-2.5 flex items-center gap-4 flex-wrap"
                style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Légende :</span>
                {[
                  { abbr: 'P', label: 'Présent',    color: 'var(--status-success)' },
                  { abbr: 'R', label: 'Retard',     color: 'var(--status-warning)' },
                  { abbr: 'D', label: 'Demi-j.',    color: 'var(--accent)' },
                  { abbr: 'A', label: 'Absent',     color: 'var(--status-danger)' },
                  { abbr: 'C', label: 'Congé',      color: 'var(--text-muted)' },
                ].map(({ abbr, label, color }) => (
                  <span key={abbr} className="flex items-center gap-1.5 text-xs">
                    <span className="font-data font-bold" style={{ color }}>{abbr}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
