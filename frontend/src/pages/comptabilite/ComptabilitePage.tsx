/**
 * MEPALE ERP — Comptabilité
 * Onglets : Écritures | Compte de résultat
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus, FileDown, FileText, TrendingUp, TrendingDown,
  Pencil, Trash2, X, AlertTriangle, BarChart3,
  ArrowUpCircle, ArrowDownCircle, Minus,
} from 'lucide-react'

import { Button }  from '@/components/ui/Button'
import { Badge }   from '@/components/ui/Badge'
import { Input }   from '@/components/ui/Input'
import { comptabiliteApi } from '@/services/comptabilite'
import type {
  CategorieComptable,
  EcritureComptableList,
  EcritureComptablePayload,
  EntryType,
} from '@/services/comptabilite'

// ─── Constantes de style ─────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 h-9 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const last   = new Date(y, m, 0).getDate()
  return `${ym}-${String(last).padStart(2, '0')}`
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtAmount(n: number): string {
  return Math.abs(n).toLocaleString('fr-TG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' FCFA'
}

async function downloadBlob(url: string, filename: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
    })
    if (!res.ok) throw new Error('Erreur export')
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = href
    a.download = filename
    a.click()
    URL.revokeObjectURL(href)
  } catch {
    toast.error("Erreur lors du téléchargement")
  }
}

// ─── MonthRangePicker ─────────────────────────────────────────────────────────

interface MonthRangePickerProps {
  from: string
  to:   string
  onChangeFrom: (v: string) => void
  onChangeTo:   (v: string) => void
}

function MonthRangePicker({ from, to, onChangeFrom, onChangeTo }: MonthRangePickerProps) {
  const monthInputClass =
    'bg-[--bg-elevated] border border-[--border] rounded text-sm text-[--text-primary] ' +
    'px-2.5 h-9 outline-none transition-all focus:border-[--accent] focus:shadow-[0_0_0_3px_var(--accent-dim)] ' +
    'font-data cursor-pointer'

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[--text-muted]">De</span>
        <input
          type="month"
          value={from}
          onChange={e => {
            const v = e.target.value
            onChangeFrom(v)
            if (v > to) onChangeTo(v)
          }}
          className={monthInputClass}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[--text-muted]">À</span>
        <input
          type="month"
          value={to}
          min={from}
          onChange={e => onChangeTo(e.target.value)}
          className={monthInputClass}
        />
      </div>
    </div>
  )
}

// ─── Modal backdrop ───────────────────────────────────────────────────────────

function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}

// ─── Modal Écriture (create / edit) ──────────────────────────────────────────

interface EntryModalProps {
  mode:       'create' | 'edit'
  entry?:     EcritureComptableList
  categories: { income: CategorieComptable[]; expense: CategorieComptable[] }
  onClose:    () => void
}

function EntryModal({ mode, entry, categories, onClose }: EntryModalProps) {
  const qc = useQueryClient()

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    date:        entry?.date        ?? today,
    type:        (entry?.type       ?? 'income') as EntryType,
    category_id: entry?.category    ?? '',
    label:       entry?.label       ?? '',
    amount:      entry?.amount      ?? '' as number | '',
    notes:       '',
  })

  const setField = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const catList = form.type === 'income' ? categories.income : categories.expense

  const isValid = form.date && form.label.trim() && Number(form.amount) > 0

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => {
      const payload: EcritureComptablePayload = {
        date:        form.date,
        type:        form.type,
        category:    form.category_id || null,
        label:       form.label.trim(),
        amount:      Number(form.amount),
        notes:       form.notes,
      }
      return mode === 'create'
        ? comptabiliteApi.createEntry(payload)
        : comptabiliteApi.updateEntry(entry!.id, payload)
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Écriture créée' : 'Écriture modifiée')
      qc.invalidateQueries({ queryKey: ['comptabilite-entries'] })
      onClose()
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.response?.data?.category?.[0] ?? 'Erreur'),
  })

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        className="relative z-10 w-full max-w-lg surface flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {mode === 'create' ? 'Nouvelle écriture' : 'Modifier l\'écriture'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-[--bg-elevated]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* Type toggle */}
            <div>
              <label className={FIELD_LABEL}>Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['income', 'expense'] as EntryType[]).map(t => {
                  const isIncome  = t === 'income'
                  const isActive  = form.type === t
                  const activeBg  = isIncome
                    ? 'rgba(0,168,140,0.12)'
                    : 'rgba(239,68,68,0.10)'
                  const activeBorder = isIncome ? 'var(--accent)' : 'var(--status-danger)'
                  const activeColor  = isIncome ? 'var(--accent)' : 'var(--status-danger)'
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setField('type', t)
                        setField('category_id', '')
                      }}
                      className="flex items-center justify-center gap-2 h-10 rounded border transition-all text-sm font-medium"
                      style={{
                        background:   isActive ? activeBg    : 'var(--bg-elevated)',
                        borderColor:  isActive ? activeBorder : 'var(--border)',
                        color:        isActive ? activeColor  : 'var(--text-secondary)',
                      }}
                    >
                      {isIncome
                        ? <TrendingUp  size={14} />
                        : <TrendingDown size={14} />
                      }
                      {isIncome ? 'Recette' : 'Charge'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Date + Catégorie */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setField('date', e.target.value)}
                  className={SELECT_CLASS}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>Catégorie</label>
                <select
                  value={form.category_id}
                  onChange={e => setField('category_id', e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— Sans catégorie —</option>
                  {catList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Libellé */}
            <div>
              <Input
                label="Libellé"
                value={form.label}
                onChange={e => setField('label', e.target.value)}
                placeholder="Description de l'écriture"
              />
            </div>

            {/* Montant */}
            <div>
              <label className={FIELD_LABEL}>Montant (FCFA)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.amount}
                onChange={e => setField('amount', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className={SELECT_CLASS + ' font-data'}
              />
            </div>

            {/* Notes */}
            <div>
              <label className={FIELD_LABEL}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={3}
                placeholder="Notes facultatives…"
                className={
                  'w-full bg-[--bg-elevated] border border-[--border] rounded text-sm text-[--text-primary] ' +
                  'px-3 py-2 outline-none transition-all resize-none leading-relaxed ' +
                  'focus:border-[--accent] focus:bg-[--bg-surface] focus:shadow-[0_0_0_3px_var(--accent-dim)]'
                }
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            variant={form.type === 'income' ? 'primary' : 'danger'}
            loading={isPending}
            disabled={!isValid}
            onClick={() => save()}
            icon={<Plus size={13} />}
          >
            {mode === 'create' ? 'Créer' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </ModalBackdrop>
  )
}

// ─── Modal suppression ────────────────────────────────────────────────────────

function DeleteModal({
  entry,
  onClose,
}: {
  entry:   EcritureComptableList
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => comptabiliteApi.deleteEntry(entry.id),
    onSuccess: () => {
      toast.success('Écriture supprimée')
      qc.invalidateQueries({ queryKey: ['comptabilite-entries'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        className="relative z-10 w-full max-w-sm surface flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex flex-col gap-4 p-6">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--status-danger)' }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Supprimer cette écriture ?
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              « {entry.label} » — {fmtAmount(entry.amount)}
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Cette action est irréversible.
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
            <Button variant="danger" size="sm" loading={isPending} onClick={() => mutate()}>
              Supprimer
            </Button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  )
}

// ─── Tab Écritures ────────────────────────────────────────────────────────────

function EntriesTab() {
  const [monthFrom,    setMonthFrom]    = useState(currentMonth)
  const [monthTo,      setMonthTo]      = useState(currentMonth)
  const [typeFilter,   setTypeFilter]   = useState<'all' | EntryType>('all')
  const [modal,        setModal]        = useState<null | 'create' | EcritureComptableList>(null)
  const [deleteTarget, setDeleteTarget] = useState<EcritureComptableList | null>(null)

  const dateFrom = `${monthFrom}-01`
  const dateTo   = lastDayOfMonth(monthTo)

  const { data: cats = [] } = useQuery({
    queryKey: ['comptabilite-categories'],
    queryFn:  () => comptabiliteApi.listCategories().then(r => {
      const d = r.data as any
      return Array.isArray(d) ? d : (d.results ?? [])
    }),
    staleTime: Infinity,
  })

  const categories = {
    income:  cats.filter(c => c.type === 'income'),
    expense: cats.filter(c => c.type === 'expense'),
  }

  const params = {
    date_from: dateFrom,
    date_to:   dateTo,
    ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
  }

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['comptabilite-entries', dateFrom, dateTo, typeFilter],
    queryFn:  () => comptabiliteApi.listEntries(params).then(r => {
      const d = r.data as any
      return Array.isArray(d) ? d : (d.results ?? [])
    }),
  })

  // Recap
  const totalIncome  = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const totalExpense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const netResult    = totalIncome - totalExpense

  const handleExcelExport = useCallback(() => {
    const url = comptabiliteApi.exportEntriesExcelUrl(params)
    downloadBlob(url, `ecritures_${dateFrom}_${dateTo}.xlsx`)
  }, [dateFrom, dateTo, typeFilter])

  return (
    <>
      {/* Modals — EN DEHORS de l'arbre pour éviter les issues avec position:fixed */}
      {modal === 'create' && (
        <EntryModal mode="create" categories={categories} onClose={() => setModal(null)} />
      )}
      {modal && modal !== 'create' && (
        <EntryModal mode="edit" entry={modal} categories={categories} onClose={() => setModal(null)} />
      )}
      {deleteTarget && (
        <DeleteModal entry={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}

      <div className="space-y-3">

        {/* ── Barre de filtres ── */}
        <div
          className="surface p-3 flex flex-wrap items-center gap-3"
        >
          <MonthRangePicker
            from={monthFrom} to={monthTo}
            onChangeFrom={setMonthFrom} onChangeTo={setMonthTo}
          />

          {/* Toggle type */}
          <div
            className="flex rounded overflow-hidden border"
            style={{ borderColor: 'var(--border)' }}
          >
            {(['all', 'income', 'expense'] as const).map(t => {
              const labels = { all: 'Tout', income: 'Recettes', expense: 'Charges' }
              const isActive = typeFilter === t
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className="px-3 h-8 text-xs font-medium transition-all"
                  style={{
                    backgroundColor: isActive
                      ? t === 'income'  ? 'rgba(0,168,140,0.15)'
                      : t === 'expense' ? 'rgba(239,68,68,0.12)'
                      : 'var(--bg-elevated)'
                      : 'var(--bg-surface)',
                    color: isActive
                      ? t === 'income'  ? 'var(--accent)'
                      : t === 'expense' ? 'var(--status-danger)'
                      : 'var(--text-primary)'
                      : 'var(--text-secondary)',
                    borderRight: t !== 'expense' ? '1px solid var(--border)' : undefined,
                  }}
                >
                  {labels[t]}
                </button>
              )
            })}
          </div>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            icon={<FileDown size={13} />}
            onClick={handleExcelExport}
          >
            Excel
          </Button>
          <Button
            size="sm"
            icon={<Plus size={13} />}
            onClick={() => setModal('create')}
          >
            Nouvelle écriture
          </Button>
        </div>

        {/* ── Récap rapide ── */}
        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {/* Recettes */}
            <div
              className="surface px-4 py-3 flex items-center gap-3"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(0,168,140,0.12)' }}
              >
                <TrendingUp size={14} style={{ color: 'var(--accent)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
                  Recettes
                </p>
                <p className="font-data text-sm font-semibold truncate" style={{ color: 'var(--accent)' }}>
                  {fmtAmount(totalIncome)}
                </p>
              </div>
            </div>

            {/* Charges */}
            <div className="surface px-4 py-3 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(239,68,68,0.10)' }}
              >
                <TrendingDown size={14} style={{ color: 'var(--status-danger)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
                  Charges
                </p>
                <p className="font-data text-sm font-semibold truncate" style={{ color: 'var(--status-danger)' }}>
                  {fmtAmount(totalExpense)}
                </p>
              </div>
            </div>

            {/* Résultat */}
            <div className="surface px-4 py-3 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: netResult >= 0
                    ? 'rgba(0,168,140,0.12)'
                    : 'rgba(239,68,68,0.10)',
                }}
              >
                <Minus size={14} style={{ color: netResult >= 0 ? 'var(--accent)' : 'var(--status-danger)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
                  Résultat net
                </p>
                <p
                  className="font-data text-sm font-semibold truncate"
                  style={{ color: netResult >= 0 ? 'var(--accent)' : 'var(--status-danger)' }}
                >
                  {fmtAmount(netResult)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Table ── */}
        <div className="surface overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              <span className="ml-2 text-sm">Chargement…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <BarChart3 size={20} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Aucune écriture sur cette période
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Modifiez la période ou créez une nouvelle écriture.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                  {['Date', 'Catégorie', 'Libellé', 'Source', 'Montant', ''].map(h => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr
                    key={e.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      backgroundColor: i % 2 !== 0 ? 'var(--bg-elevated)' : undefined,
                    }}
                    className="hover:bg-[--bg-elevated] transition-colors"
                  >
                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-data text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {fmtDate(e.date)}
                      </span>
                    </td>

                    {/* Catégorie */}
                    <td className="px-6 py-5">
                      {e.category_name ? (
                        <Badge variant={e.type === 'income' ? 'success' : 'danger'}>
                          {e.category_name}
                        </Badge>
                      ) : (
                        <Badge variant="neutral">Non catégorisé</Badge>
                      )}
                    </td>

                    {/* Libellé */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="truncate block text-sm" style={{ color: 'var(--text-primary)' }}>
                        {e.label}
                      </span>
                    </td>

                    {/* Source */}
                    <td className="px-6 py-5">
                      {e.source === 'auto' && (
                        <Badge variant="info" dot>Auto</Badge>
                      )}
                    </td>

                    {/* Montant */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span
                        className="font-data text-sm font-semibold"
                        style={{ color: e.type === 'income' ? 'var(--accent)' : 'var(--status-danger)' }}
                      >
                        {e.type === 'income' ? '+' : '-'}{fmtAmount(e.amount)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-5">
                      {e.source !== 'auto' && (
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={<Pencil size={11} />}
                            onClick={() => setModal(e)}
                          />
                          <Button
                            variant="danger"
                            size="xs"
                            icon={<Trash2 size={11} />}
                            onClick={() => setDeleteTarget(e)}
                          />
                        </div>
                      )}
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

// ─── Tab Compte de résultat ───────────────────────────────────────────────────

function ReportTab() {
  const [monthFrom, setMonthFrom] = useState(currentMonth)
  const [monthTo,   setMonthTo]   = useState(currentMonth)
  const [exporting, setExporting] = useState(false)

  const dateFrom = `${monthFrom}-01`
  const dateTo   = lastDayOfMonth(monthTo)

  const { data: report, isLoading } = useQuery({
    queryKey: ['comptabilite-report', dateFrom, dateTo],
    queryFn:  () => comptabiliteApi.getReport({ date_from: dateFrom, date_to: dateTo }).then(r => r.data),
  })

  const handlePdfExport = async () => {
    setExporting(true)
    const url = comptabiliteApi.exportReportPdfUrl({ date_from: dateFrom, date_to: dateTo })
    await downloadBlob(url, `compte_resultat_${dateFrom}_${dateTo}.pdf`)
    setExporting(false)
  }

  const SectionCard = ({
    title,
    rows,
    total,
    color,
    emptyMsg,
  }: {
    title:    string
    rows:     { category: string; total: number }[]
    total:    number
    color:    'income' | 'expense'
    emptyMsg: string
  }) => {
    const isIncome   = color === 'income'
    const accentColor = isIncome ? 'var(--accent)' : 'var(--status-danger)'
    const bgTint      = isIncome ? 'rgba(0,168,140,0.06)' : 'rgba(239,68,68,0.05)'

    return (
      <div
        className="surface overflow-hidden"
        style={{ borderLeft: `3px solid ${accentColor}` }}
      >
        {/* En-tête section */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: accentColor }}>
              {title}
            </span>
          </div>
          <span className="font-data text-sm font-bold" style={{ color: accentColor }}>
            {fmtAmount(total)}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-5 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
            {emptyMsg}
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {row.category}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="font-data text-sm font-medium" style={{ color: accentColor }}>
                      {fmtAmount(row.total)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Total row */}
            <tfoot>
              <tr style={{ backgroundColor: bgTint, borderTop: `1px solid ${accentColor}20` }}>
                <td className="px-5 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
                  Total
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="font-data text-sm font-bold" style={{ color: accentColor }}>
                    {fmtAmount(total)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {/* Barre filtres */}
      <div className="surface p-3 flex flex-wrap items-center gap-3">
        <MonthRangePicker
          from={monthFrom} to={monthTo}
          onChangeFrom={setMonthFrom} onChangeTo={setMonthTo}
        />
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          icon={<FileText size={13} />}
          loading={exporting}
          onClick={handlePdfExport}
        >
          Exporter PDF
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <span className="ml-2 text-sm">Chargement…</span>
        </div>
      ) : report ? (
        <div className="space-y-3">

          {/* Recettes */}
          <SectionCard
            title="Recettes"
            rows={report.income.rows}
            total={report.income.total}
            color="income"
            emptyMsg="Aucune recette sur cette période."
          />

          {/* Charges */}
          <SectionCard
            title="Charges"
            rows={report.expense.rows}
            total={report.expense.total}
            color="expense"
            emptyMsg="Aucune charge sur cette période."
          />

          {/* Résultat net */}
          {(() => {
            const net       = report.net_result
            const isProfit  = net >= 0
            const netColor  = isProfit ? 'var(--accent)' : 'var(--status-danger)'
            const netBg     = isProfit ? 'rgba(0,168,140,0.08)' : 'rgba(239,68,68,0.07)'
            const netBorder = isProfit ? 'var(--accent)' : 'var(--status-danger)'
            const NetIcon   = isProfit ? ArrowUpCircle : ArrowDownCircle
            return (
              <div
                className="surface px-6 py-5 flex items-center justify-between"
                style={{
                  backgroundColor: netBg,
                  borderColor:     netBorder,
                  borderWidth:     '1px',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: isProfit ? 'rgba(0,168,140,0.18)' : 'rgba(239,68,68,0.15)' }}
                  >
                    <NetIcon size={18} style={{ color: netColor }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: netColor }}>
                      {isProfit ? 'Bénéfice net' : 'Perte nette'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {fmtDate(report.period.from)} — {fmtDate(report.period.to)}
                    </p>
                  </div>
                </div>
                <span
                  className="font-data text-2xl font-bold"
                  style={{ color: netColor }}
                >
                  {isProfit ? '+' : '-'}{fmtAmount(Math.abs(net))}
                </span>
              </div>
            )
          })()}
        </div>
      ) : null}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ComptabilitePage() {
  const [tab, setTab] = useState<'entries' | 'report'>('entries')

  return (
    <div className="p-6 space-y-4 animate-fade-in">

      {/* En-tête */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Comptabilité
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Recettes, charges et compte de résultat
          </p>
        </div>

        {/* Tab switcher */}
        <div
          className="flex rounded-lg overflow-hidden border flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {([
            { key: 'entries', label: 'Écritures',          icon: <BarChart3 size={13} /> },
            { key: 'report',  label: 'Compte de résultat', icon: <FileText  size={13} /> },
          ] as const).map(({ key, label, icon }) => {
            const isActive = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex items-center gap-1.5 px-4 h-9 text-sm font-medium transition-all"
                style={{
                  backgroundColor: isActive ? 'var(--accent)'      : 'var(--bg-surface)',
                  color:           isActive ? '#fff'               : 'var(--text-secondary)',
                  borderRight:     key === 'entries' ? '1px solid var(--border)' : undefined,
                }}
              >
                {icon}
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contenu onglet */}
      {tab === 'entries' ? <EntriesTab /> : <ReportTab />}
    </div>
  )
}
