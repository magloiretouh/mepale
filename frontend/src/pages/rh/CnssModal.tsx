/**
 * MEPALE ERP — Modal déclaration CNSS / AMU mensuelle
 * Agrège tous les salaires d'une période et calcule les cotisations à déclarer.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, FileBarChart2 } from 'lucide-react'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { rhApi }  from '@/services/rh'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now       = new Date()
const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

function fmtXOF(n: string | number | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return Math.round(num).toLocaleString('fr-FR') + ' F'
}

function monthLabel(month: string): string {
  if (!month) return ''
  const d = new Date(month + '-02')
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

// ─── Types locaux ─────────────────────────────────────────────────────────────

interface CnssRow {
  employee_id:      number
  employee_name:    string
  cnss_number:      string
  gross:            string | number
  cnss_employee:    string | number
  amu_employee:     string | number
  cnss_employer:    string | number
  amu_employer:     string | number
  net:              string | number
  total_to_declare: string | number
}

interface CnssDeclaration {
  month:  string
  rows:   CnssRow[]
  totals: Record<string, string | number>
}

interface Props {
  isOpen:  boolean
  onClose: () => void
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function CnssModal({ isOpen, onClose }: Props) {
  const [month,           setMonth          ] = useState(currMonth)
  const [downloadingPdf,  setDownloadingPdf ] = useState(false)

  const {
    data: declaration,
    isLoading,
    isError,
  } = useQuery<CnssDeclaration>({
    queryKey: ['rh-cnss', month],
    queryFn:  () => rhApi.getCnssDeclaration(month).then(r => r.data),
    enabled:  isOpen && !!month,
  })

  // ── Téléchargement journal PDF ─────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    if (!month) return
    setDownloadingPdf(true)
    try {
      const res = await rhApi.getPayrollJournalPdf(month)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a   = document.createElement('a')
      a.href     = url
      a.download = `journal-paie-${month}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur lors de la génération du journal PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const hasRows = !!declaration && declaration.rows.length > 0

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Déclaration CNSS / AMU"
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
          {hasRows && (
            <Button
              variant="primary"
              size="sm"
              loading={downloadingPdf}
              onClick={handleDownloadPdf}
            >
              <Download size={13} style={{ marginRight: 6 }} />
              Journal de paie PDF
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Sélecteur de période */}
        <div style={{ maxWidth: 220 }}>
          <Input
            label="Période"
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
        </div>

        {/* État chargement */}
        {isLoading && (
          <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>
            Chargement…
          </p>
        )}

        {/* État erreur */}
        {isError && (
          <p
            className="text-sm rounded px-3 py-2"
            style={{ color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-bg)' }}
          >
            Erreur lors du chargement de la déclaration.
          </p>
        )}

        {/* État vide */}
        {!isLoading && !isError && declaration && !hasRows && (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
            <FileBarChart2 size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              Aucun salaire enregistré pour{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>{monthLabel(month)}</strong>.
            </p>
          </div>
        )}

        {/* Tableau */}
        {hasRows && (
          <>
            {/* Légende taux */}
            <div
              className="flex flex-wrap gap-x-5 gap-y-1 px-3 py-2 rounded text-xs"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              <span>
                CNSS sal. : cotisation salariale CNSS
              </span>
              <span>·</span>
              <span>
                AMU sal. : cotisation salariale AMU
              </span>
              <span>·</span>
              <span>
                CNSS pat. / AMU pat. : parts patronales
              </span>
            </div>

            <div
              className="rounded border overflow-hidden"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  {/* En-tête */}
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderBottom:    '1px solid var(--border)',
                      }}
                    >
                      {[
                        { label: 'Employé',     align: 'left'  },
                        { label: 'N° CNSS',     align: 'left'  },
                        { label: 'Brut',        align: 'right' },
                        { label: 'CNSS sal.',   align: 'right', dim: true },
                        { label: 'AMU sal.',    align: 'right', dim: true },
                        { label: 'CNSS pat.',   align: 'right', warn: true },
                        { label: 'AMU pat.',    align: 'right', warn: true },
                        { label: 'Net versé',   align: 'right', accent: true },
                        { label: 'Total décl.', align: 'right' },
                      ].map(col => (
                        <th
                          key={col.label}
                          className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider"
                          style={{
                            textAlign: col.align as 'left' | 'right',
                            color: col.accent
                              ? 'var(--accent)'
                              : col.warn
                              ? 'var(--status-warning)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {/* Corps */}
                  <tbody>
                    {declaration!.rows.map((row, i) => (
                      <tr
                        key={row.employee_id}
                        style={{
                          backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent',
                          borderBottom:    '1px solid var(--border)',
                        }}
                      >
                        <td
                          className="px-3 py-2.5 text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {row.employee_name}
                        </td>
                        <td
                          className="px-3 py-2.5 text-xs font-data"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {row.cnss_number || '—'}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right text-sm font-data"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {fmtXOF(row.gross)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right text-sm font-data"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {fmtXOF(row.cnss_employee)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right text-sm font-data"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {fmtXOF(row.amu_employee)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right text-sm font-data"
                          style={{ color: 'var(--status-warning)' }}
                        >
                          {fmtXOF(row.cnss_employer)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right text-sm font-data"
                          style={{ color: 'var(--status-warning)' }}
                        >
                          {fmtXOF(row.amu_employer)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right text-sm font-data font-semibold"
                          style={{ color: 'var(--accent)' }}
                        >
                          {fmtXOF(row.net)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right text-sm font-data font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {fmtXOF(row.total_to_declare)}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Totaux */}
                  <tfoot>
                    <tr
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderTop:       '2px solid var(--border)',
                      }}
                    >
                      <td
                        colSpan={2}
                        className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Total — {declaration!.rows.length} employé{declaration!.rows.length > 1 ? 's' : ''}
                      </td>
                      {(
                        ['gross', 'cnss_employee', 'amu_employee', 'cnss_employer', 'amu_employer', 'net', 'total_to_declare'] as const
                      ).map((key, ki) => (
                        <td
                          key={key}
                          className="px-3 py-2.5 text-right text-sm font-data font-bold"
                          style={{
                            color: ki === 5
                              ? 'var(--accent)'
                              : ki === 3 || ki === 4
                              ? 'var(--status-warning)'
                              : 'var(--text-primary)',
                          }}
                        >
                          {fmtXOF(declaration!.totals[key])}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
