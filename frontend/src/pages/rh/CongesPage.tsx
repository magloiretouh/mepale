/**
 * MEPALE ERP — Congés & Absences
 * Onglet Demandes : workflow complet · Onglet Soldes : quotas par employé
 */

import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CalendarDays, MoreHorizontal, CheckCircle2, XCircle,
  SendHorizontal, Ban, Pencil, Trash2, Plus, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { Badge }   from '@/components/ui/Badge'
import { Modal }   from '@/components/ui/Modal'
import {
  rhApi,
  type DemandeConge, type StatutDemande, type TypeConge, type SoldeConge,
} from '@/services/rh'

// ─── Styles ───────────────────────────────────────────────────────────────────

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] appearance-none transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUT_CFG: Record<StatutDemande, { variant: 'neutral' | 'info' | 'success' | 'danger' | 'warning'; label: string }> = {
  brouillon:  { variant: 'neutral',  label: 'Brouillon'  },
  soumise:    { variant: 'info',     label: 'Soumise'    },
  approuvee:  { variant: 'success',  label: 'Approuvée'  },
  refusee:    { variant: 'danger',   label: 'Refusée'    },
  annulee:    { variant: 'warning',  label: 'Annulée'    },
}

// ─── Modal créer / modifier demande ──────────────────────────────────────────

function ModalDemande({
  onClose, employees, typesConge, demande,
}: {
  onClose:   () => void
  employees: { id: number; name: string }[]
  typesConge: TypeConge[]
  demande?:  DemandeConge | null
}) {
  const qc = useQueryClient()
  const isEdit = !!demande

  const [empId,     setEmpId    ] = useState(demande?.employee   ? String(demande.employee)    : '')
  const [typeId,    setTypeId   ] = useState(demande?.type_conge ? String(demande.type_conge)  : '')
  const [dateDebut, setDateDebut] = useState(demande?.date_debut ?? '')
  const [dateFin,   setDateFin  ] = useState(demande?.date_fin   ?? '')
  const [motif,     setMotif    ] = useState(demande?.motif       ?? '')

  const nbJours = useMemo(() => {
    if (!dateDebut || !dateFin) return null
    const d1 = new Date(dateDebut), d2 = new Date(dateFin)
    if (d2 < d1) return null
    let j = 0, cur = new Date(d1)
    while (cur <= d2) { if (cur.getDay() !== 0 && cur.getDay() !== 6) j++; cur.setDate(cur.getDate() + 1) }
    return j
  }, [dateDebut, dateFin])

  const { mutate, isPending } = useMutation({
    mutationFn: isEdit
      ? () => rhApi.updateDemandeConge(demande!.id, { type_conge: Number(typeId), date_debut: dateDebut, date_fin: dateFin, motif })
      : () => rhApi.createDemandeConge({ employee: Number(empId), type_conge: Number(typeId), date_debut: dateDebut, date_fin: dateFin, motif }),
    onSuccess: () => {
      toast.success(isEdit ? 'Demande modifiée.' : 'Demande créée.')
      qc.invalidateQueries({ queryKey: ['rh-demandes-conge'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const valid = (!isEdit ? !!empId : true) && !!typeId && !!dateDebut && !!dateFin && (!dateFin || dateFin >= dateDebut)

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Modifier la demande' : 'Nouvelle demande de congé'}>
      <div className="flex flex-col gap-5 px-5 py-5">
        {!isEdit && (
          <div>
            <label className={FIELD_LABEL}>Employé</label>
            <select className={SELECT_CLASS} value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={FIELD_LABEL}>Type de congé</label>
          <select className={SELECT_CLASS} value={typeId} onChange={e => setTypeId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {typesConge.filter(t => t.is_active).map(t => (
              <option key={t.id} value={t.id}>{t.name} {t.est_paye ? '' : '(non payé)'}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL}>Date de début</label>
            <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
          </div>
          <div>
            <label className={FIELD_LABEL}>Date de fin</label>
            <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} min={dateDebut} />
          </div>
        </div>
        {nbJours !== null && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="font-semibold font-data" style={{ color: 'var(--accent)' }}>{nbJours}</span>
            {' '}jour{nbJours !== 1 ? 's' : ''} ouvré{nbJours !== 1 ? 's' : ''}
          </p>
        )}
        <div>
          <label className={FIELD_LABEL}>Motif <span style={{ color: 'var(--text-muted)' }}>(optionnel)</span></label>
          <textarea
            className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
            rows={3}
            value={motif}
            onChange={e => setMotif(e.target.value)}
            placeholder="Motif de la demande…"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" onClick={() => mutate()} loading={isPending} disabled={!valid}>
          {isEdit ? 'Enregistrer' : 'Créer la demande'}
        </Button>
      </div>
    </Modal>
  )
}

// ─── Modal action (approuver/refuser) ─────────────────────────────────────────

function ModalAction({
  demande, action, onClose,
}: {
  demande: DemandeConge
  action:  'approuver' | 'refuser'
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [commentaire, setCommentaire] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: () => rhApi.actionDemandeConge(demande.id, action, commentaire),
    onSuccess: () => {
      toast.success(action === 'approuver' ? 'Demande approuvée.' : 'Demande refusée.')
      qc.invalidateQueries({ queryKey: ['rh-demandes-conge'] })
      qc.invalidateQueries({ queryKey: ['rh-soldes-conge'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const isApprouver = action === 'approuver'

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isApprouver ? 'Approuver la demande' : 'Refuser la demande'}
    >
      <div className="px-5 py-5 flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{demande.employee_name}</strong>
          {' — '}{demande.type_conge_name}
          {' · '}{fmtDate(demande.date_debut)} → {fmtDate(demande.date_fin)}
          {' · '}<span className="font-data font-semibold" style={{ color: 'var(--accent)' }}>{demande.nb_jours}j</span>
        </p>
        <div>
          <label className={FIELD_LABEL}>
            Commentaire {!isApprouver && <span style={{ color: 'var(--status-danger)' }}>*</span>}
          </label>
          <textarea
            className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
            rows={3}
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
            placeholder={isApprouver ? 'Commentaire optionnel…' : 'Motif du refus…'}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button
          variant={isApprouver ? 'primary' : 'danger'}
          onClick={() => mutate()}
          loading={isPending}
          disabled={!isApprouver && !commentaire.trim()}
        >
          {isApprouver ? 'Approuver' : 'Refuser'}
        </Button>
      </div>
    </Modal>
  )
}

// ─── Menu actions demande (portal) ────────────────────────────────────────────

function ActionMenuDemande({
  demande, onEdit, onAction, onDelete,
}: {
  demande:  DemandeConge
  onEdit:   () => void
  onAction: (a: 'soumettre' | 'approuver' | 'refuser' | 'annuler') => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  const item = (label: string, icon: React.ReactNode, onClick: () => void, danger?: boolean) => (
    <button
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
        danger
          ? 'hover:bg-[--status-danger-bg]'
          : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]',
      )}
      style={danger ? { color: 'var(--status-danger)' } : {}}
      onClick={() => { setOpen(false); onClick() }}
    >
      {icon}{label}
    </button>
  )

  const { statut } = demande
  const hasActionsBelow = statut === 'brouillon' || statut === 'soumise'

  const W = 192
  const dropdown = rect && open && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
      <div
        className="rounded-md py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top:    rect.bottom + 200 < window.innerHeight ? rect.bottom + 4 : undefined,
          bottom: rect.bottom + 200 < window.innerHeight ? undefined : window.innerHeight - rect.top + 4,
          left:   rect.right - W,
          width:  W,
          zIndex: 9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {statut === 'brouillon' && item('Modifier', <Pencil size={13} />, onEdit)}
        {statut === 'brouillon' && item('Soumettre', <SendHorizontal size={13} style={{ color: 'var(--accent)' }} />, () => onAction('soumettre'))}
        {statut === 'soumise'   && item('Approuver', <CheckCircle2 size={13} style={{ color: 'var(--status-success)' }} />, () => onAction('approuver'))}
        {statut === 'soumise'   && item('Refuser',   <XCircle size={13} />, () => onAction('refuser'), true)}
        {hasActionsBelow && <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />}
        {(statut === 'brouillon' || statut === 'soumise' || statut === 'approuvee') &&
          item('Annuler', <Ban size={13} />, () => onAction('annuler'), true)}
        {(statut === 'brouillon' || statut === 'annulee') &&
          item('Supprimer', <Trash2 size={13} />, onDelete, true)}
      </div>
    </>,
    document.body,
  )

  return (
    <>
      {dropdown}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="w-7 h-7 rounded flex items-center justify-center transition-all text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated]"
      >
        <MoreHorizontal size={14} />
      </button>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CongesPage() {
  const qc = useQueryClient()

  const [tab, setTab] = useState<'demandes' | 'soldes'>('demandes')

  // ── Filtres demandes ──────────────────────────────────────────────────────
  const [filterEmp,    setFilterEmp   ] = useState('')
  const [filterStatut, setFilterStatut] = useState<'' | StatutDemande>('')
  const [filterType,   setFilterType  ] = useState('')
  const [filterAnnee,  setFilterAnnee ] = useState(String(new Date().getFullYear()))

  // ── Filtres soldes ─────────────────────────────────────────────────────────
  const [soldeAnnee, setSoldeAnnee] = useState(String(new Date().getFullYear()))

  // ── Modals ────────────────────────────────────────────────────────────────
  const [modalCreate,  setModalCreate ] = useState(false)
  const [modalEdit,    setModalEdit   ] = useState<DemandeConge | null>(null)
  const [modalAction,  setModalAction ] = useState<{ demande: DemandeConge; action: 'approuver' | 'refuser' } | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: employees = [] } = useQuery({
    queryKey: ['rh-employees'],
    queryFn:  () => rhApi.listEmployees().then(r => r.data),
  })

  const { data: typesConge = [] } = useQuery({
    queryKey: ['rh-types-conge'],
    queryFn:  () => rhApi.listTypesConge().then(r => r.data),
  })

  const { data: demandes = [], isLoading: demandesLoading } = useQuery({
    queryKey: ['rh-demandes-conge', filterEmp, filterStatut, filterType, filterAnnee],
    queryFn:  () => rhApi.listDemandesConge({
      employee_id:  filterEmp    || undefined,
      statut:       (filterStatut as StatutDemande) || undefined,
      type_conge_id: filterType  ? Number(filterType) : undefined,
      annee:        filterAnnee  || undefined,
    }).then(r => r.data),
    enabled: tab === 'demandes',
  })

  const { data: soldes = [], isLoading: soldesLoading } = useQuery({
    queryKey: ['rh-soldes-conge', soldeAnnee],
    queryFn:  () => rhApi.listSoldesConge({ annee: soldeAnnee }).then(r => r.data),
    enabled: tab === 'soldes',
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const { mutate: doAction } = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'soumettre' | 'annuler' }) =>
      rhApi.actionDemandeConge(id, action),
    onSuccess: (_, { action }) => {
      toast.success(action === 'soumettre' ? 'Demande soumise.' : 'Demande annulée.')
      qc.invalidateQueries({ queryKey: ['rh-demandes-conge'] })
      qc.invalidateQueries({ queryKey: ['rh-soldes-conge'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const { mutate: deleteDemande } = useMutation({
    mutationFn: (id: number) => rhApi.deleteDemandeConge(id),
    onSuccess: () => {
      toast.success('Demande supprimée.')
      qc.invalidateQueries({ queryKey: ['rh-demandes-conge'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const { mutate: initialiserSoldes, isPending: initialising } = useMutation({
    mutationFn: () => rhApi.initialiserSoldes(Number(soldeAnnee)),
    onSuccess: (res) => {
      toast.success(res.data.detail)
      qc.invalidateQueries({ queryKey: ['rh-soldes-conge'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  // Grouper les soldes par employé
  const soldesParEmploye = useMemo(() => {
    const map = new Map<string, { name: string; soldes: SoldeConge[] }>()
    for (const s of soldes) {
      const key = String(s.employee)
      if (!map.has(key)) map.set(key, { name: s.employee_name, soldes: [] })
      map.get(key)!.soldes.push(s)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [soldes])

  const annees = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 1 + i))

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ══ Modals ════════════════════════════════════════════════════════════ */}
      {(modalCreate || modalEdit) && (
        <ModalDemande
          onClose={() => { setModalCreate(false); setModalEdit(null) }}
          employees={employees}
          typesConge={typesConge}
          demande={modalEdit}
        />
      )}
      {modalAction && (
        <ModalAction
          demande={modalAction.demande}
          action={modalAction.action}
          onClose={() => setModalAction(null)}
        />
      )}

      {/* ══ Page ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col h-full animate-fade-in">

        {/* ── En-tête ── */}
        <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Congés & Absences
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Gestion des demandes et des soldes de congé
            </p>
          </div>
          {tab === 'demandes' && (
            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setModalCreate(true)}>
              Nouvelle demande
            </Button>
          )}
          {tab === 'soldes' && (
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} loading={initialising}
              onClick={() => initialiserSoldes()}>
              Initialiser {soldeAnnee}
            </Button>
          )}
        </div>

        {/* ── Onglets ── */}
        <div className="flex" style={{ borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {[
            { key: 'demandes', label: 'Demandes' },
            { key: 'soldes',   label: 'Soldes'   },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className="px-4 pb-3 text-sm font-medium transition-colors"
              style={{
                color:        tab === t.key ? 'var(--accent)'           : 'var(--text-secondary)',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ONGLET DEMANDES                                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'demandes' && (
          <>
            {/* Filtres */}
            <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 16 }}>
              <select className={cn('h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8 text-[--text-primary] appearance-none focus:outline-none focus:border-[--accent]')}
                style={{ minWidth: 190 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                <option value="">Tous les employés</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <select className={cn('h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8 text-[--text-primary] appearance-none focus:outline-none focus:border-[--accent]')}
                style={{ minWidth: 140 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value as typeof filterStatut)}>
                <option value="">Tous statuts</option>
                <option value="brouillon">Brouillon</option>
                <option value="soumise">Soumise</option>
                <option value="approuvee">Approuvée</option>
                <option value="refusee">Refusée</option>
                <option value="annulee">Annulée</option>
              </select>
              <select className={cn('h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8 text-[--text-primary] appearance-none focus:outline-none focus:border-[--accent]')}
                style={{ minWidth: 160 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">Tous types</option>
                {typesConge.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select className={cn('h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8 text-[--text-primary] appearance-none focus:outline-none focus:border-[--accent]')}
                style={{ minWidth: 100 }} value={filterAnnee} onChange={e => setFilterAnnee(e.target.value)}>
                {annees.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              {(filterEmp || filterStatut || filterType) && (
                <button onClick={() => { setFilterEmp(''); setFilterStatut(''); setFilterType('') }}
                  className="text-xs underline" style={{ color: 'var(--text-muted)' }}>
                  Réinitialiser
                </button>
              )}
            </div>

            {demandesLoading && (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
            )}

            {!demandesLoading && demandes.length === 0 && (
              <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-muted)' }}>
                <CalendarDays size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p className="text-sm">Aucune demande pour ces filtres.</p>
              </div>
            )}

            {!demandesLoading && demandes.length > 0 && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                        {['Employé', 'Type', 'Période', 'Jours', 'Statut', 'Décision', ''].map((col, i) => (
                          <th key={i} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-left whitespace-nowrap"
                            style={{ color: 'var(--text-secondary)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {demandes.map((d, i) => {
                        const cfg = STATUT_CFG[d.statut]
                        return (
                          <tr key={d.id}
                            style={{ backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                            <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                              {d.employee_name}
                            </td>
                            <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                              {d.type_conge_name}
                            </td>
                            <td className="px-3 py-2.5 font-data text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                              {fmtDate(d.date_debut)} → {fmtDate(d.date_fin)}
                            </td>
                            <td className="px-3 py-2.5 font-data font-semibold text-center whitespace-nowrap"
                              style={{ color: 'var(--accent)' }}>
                              {d.nb_jours}j
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            </td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                              {d.approuve_par_name
                                ? <span>{d.approuve_par_name}{d.approuve_le ? ` · ${fmtDate(d.approuve_le.slice(0,10))}` : ''}</span>
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                              <ActionMenuDemande
                                demande={d}
                                onEdit={() => setModalEdit(d)}
                                onAction={action => {
                                  if (action === 'approuver' || action === 'refuser') {
                                    setModalAction({ demande: d, action })
                                  } else {
                                    doAction({ id: d.id, action })
                                  }
                                }}
                                onDelete={() => deleteDemande(d.id)}
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
        {/* ONGLET SOLDES                                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'soldes' && (
          <>
            <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
              <select className={cn('h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8 text-[--text-primary] appearance-none focus:outline-none focus:border-[--accent]')}
                style={{ minWidth: 100 }} value={soldeAnnee} onChange={e => setSoldeAnnee(e.target.value)}>
                {annees.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Cliquez sur "Initialiser {soldeAnnee}" pour créer les soldes manquants avec le quota par défaut de chaque type.
              </p>
            </div>

            {soldesLoading && (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
            )}

            {!soldesLoading && soldesParEmploye.length === 0 && (
              <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-muted)' }}>
                <CalendarDays size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p className="text-sm">Aucun solde pour {soldeAnnee}. Cliquez sur "Initialiser".</p>
              </div>
            )}

            {!soldesLoading && soldesParEmploye.length > 0 && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                        {['Employé', 'Type de congé', 'Acquis', 'Pris', 'Restant'].map((col, i) => (
                          <th key={i} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-left whitespace-nowrap"
                            style={{ color: i === 4 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {soldesParEmploye.flatMap(({ name, soldes: ss }) =>
                        ss.map((s, j) => (
                          <tr key={s.id}
                            style={{ backgroundColor: j % 2 === 1 ? 'var(--bg-elevated)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                            <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                              {j === 0 ? name : ''}
                            </td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {s.type_conge_name}
                            </td>
                            <td className="px-3 py-2.5 font-data text-center" style={{ color: 'var(--text-secondary)' }}>
                              {s.jours_acquis}j
                            </td>
                            <td className="px-3 py-2.5 font-data text-center" style={{ color: 'var(--text-muted)' }}>
                              {s.jours_pris}j
                            </td>
                            <td className="px-3 py-2.5 font-data font-semibold text-center"
                              style={{ color: s.jours_restants < 0 ? 'var(--status-danger)' : s.jours_restants === 0 ? 'var(--text-muted)' : 'var(--accent)' }}>
                              {s.jours_restants}j
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
