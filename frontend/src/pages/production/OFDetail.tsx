/**
 * MEPALE ERP — Détail d'un Ordre de Fabrication
 * Onglets : Infos + Vérif matières | Affectations | Pertes | Coût revient | Traçabilité
 */

import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle, Play, Flag, Archive, Users,
  Trash2, DollarSign, GitBranch, RefreshCw, AlertTriangle,
  CheckSquare, Plus, X, Edit2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatXOF } from '@/lib/utils'
import { productionApi, type StatutOF, type LigneNomenclature } from '@/services/production'

const STATUT_CONFIG: Record<StatutOF, { label: string; variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }> = {
  brouillon: { label: 'Brouillon',   variant: 'neutral'  },
  confirme:  { label: 'Confirmé',    variant: 'info'     },
  en_cours:  { label: 'En cours',    variant: 'warning'  },
  termine:   { label: 'Terminé',     variant: 'success'  },
  cloture:   { label: 'Clôturé',     variant: 'success'  },
  annule:    { label: 'Annulé',      variant: 'danger'   },
}

const TABS = [
  { id: 'infos',       label: 'Infos & Matières',  icon: <CheckSquare size={13} /> },
  { id: 'affectations',label: 'Affectations',       icon: <Users size={13} /> },
  { id: 'pertes',      label: 'Pertes & Rebuts',    icon: <Trash2 size={13} /> },
  { id: 'cout',        label: 'Coût de revient',    icon: <DollarSign size={13} /> },
  { id: 'tracabilite', label: 'Traçabilité',         icon: <GitBranch size={13} /> },
]

// ── Sous-composants ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="text-xs text-[--text-muted] w-40 shrink-0">{label}</span>
      <span className="text-xs text-[--text-primary] font-medium">{value}</span>
    </div>
  )
}

function TabMatieres({ ofId }: { ofId: string }) {
  const { data, isPending, mutate } = useMutation({
    mutationFn: () => productionApi.verifierMatieres(ofId).then(r => r.data),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={() => mutate()} disabled={isPending}>
          Vérifier disponibilité matières
        </Button>
      </div>
      {data && (
        <div className="space-y-2">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium ${data.tout_disponible ? 'text-green-400' : 'text-red-400'}`}
            style={{ backgroundColor: data.tout_disponible ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}
          >
            {data.tout_disponible ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
            {data.tout_disponible ? 'Toutes les matières sont disponibles' : 'Stock insuffisant pour certaines matières'}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Matière', 'Unité', 'Nécessaire', 'Disponible', 'Statut'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[--text-muted] font-semibold uppercase text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.composants.map(c => (
                <tr key={c.matiere_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className="px-3 py-2 text-[--text-primary]">{c.matiere}</td>
                  <td className="px-3 py-2 text-[--text-muted]">{c.unite}</td>
                  <td className="px-3 py-2 font-data">{c.quantite_necessaire}</td>
                  <td className="px-3 py-2 font-data">{c.quantite_disponible}</td>
                  <td className="px-3 py-2">
                    <Badge variant={c.suffisant ? 'success' : 'danger'} dot>
                      {c.suffisant ? 'OK' : `Manque ${c.manque}`}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TabAffectations({ ofId }: { ofId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [employeId, setEmployeId] = useState('')

  // Charger les employés
  const { data: employes } = useQuery({
    queryKey: ['employes-list'],
    queryFn: () => fetch('/api/v1/rh/employees/?active=1', {
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
    }).then(r => r.json()).then((d: { id: number; name: string; role: string | null }[]) => d),
  })

  const selectedEmploye = employes?.find(e => String(e.id) === employeId)

  const { mutate: affecter, isPending: affecting } = useMutation({
    mutationFn: () => productionApi.addAffectation(ofId, {
      employe: employeId,
      role_prod: selectedEmploye?.role ?? '',
    }),
    onSuccess: () => {
      toast.success('Employé affecté')
      qc.invalidateQueries({ queryKey: ['of', ofId] })
      setShowForm(false); setEmployeId('')
    },
    onError: () => toast.error("Erreur lors de l'affectation"),
  })

  const { mutate: retirer } = useMutation({
    mutationFn: (affId: string) => productionApi.removeAffectation(ofId, affId),
    onSuccess: () => { toast.success('Affectation retirée'); qc.invalidateQueries({ queryKey: ['of', ofId] }) },
  })

  const { data: of } = useQuery({ queryKey: ['of', ofId], queryFn: () => productionApi.getOF(ofId).then(r => r.data) })
  const affectations = of?.affectations ?? []

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-xs text-[--text-muted]">{affectations.length} employé(s) affecté(s)</span>
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => setShowForm(true)}>Affecter</Button>
      </div>

      {showForm && (
        <div className="p-3 rounded space-y-3" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div>
            <label className="text-xs text-[--text-muted] mb-1 block">Employé</label>
            <select
              value={employeId}
              onChange={e => setEmployeId(e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="">Sélectionner…</option>
              {(employes ?? []).map(e => (
                <option key={e.id} value={e.id}>{e.name}{e.role ? ` — ${e.role}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => affecter()} disabled={!employeId || affecting}>Confirmer</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {affectations.map(a => (
          <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <span className="text-xs font-medium text-[--text-primary]">{a.employe_nom}</span>
              {a.role_prod && <span className="text-[10px] text-[--text-muted] ml-2">{a.role_prod}</span>}
            </div>
            <button onClick={() => retirer(a.id)} className="text-[--text-muted] hover:text-red-400 transition-colors">
              <X size={13} />
            </button>
          </div>
        ))}
        {affectations.length === 0 && (
          <p className="text-xs text-[--text-muted] text-center py-4">Aucune affectation pour cet OF</p>
        )}
      </div>
    </div>
  )
}

function TabPertes({ ofId, composants }: { ofId: string; composants: LigneNomenclature[] }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ article: '', type: 'rebut', quantite: '', motif: '' })

  const { data } = useQuery({
    queryKey: ['pertes', ofId],
    queryFn: () => productionApi.listPertes(ofId).then(r => r.data),
  })

  const { mutate: creerPerte, isPending } = useMutation({
    mutationFn: () => productionApi.createPerte({
      of: ofId,
      article: form.article,
      type: form.type as 'rebut' | 'dechet' | 'perte' | 'casse',
      quantite: parseFloat(form.quantite),
      motif: form.motif,
    }),
    onSuccess: () => {
      toast.success('Perte enregistrée')
      qc.invalidateQueries({ queryKey: ['pertes', ofId] })
      setShowForm(false)
      setForm({ article: '', type: 'rebut', quantite: '', motif: '' })
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  })

  const pertes = data?.results ?? []

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-xs text-[--text-muted]">{pertes.length} perte(s) enregistrée(s)</span>
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => setShowForm(true)}>Saisir une perte</Button>
      </div>

      {showForm && (
        <div className="p-3 rounded space-y-3" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[--text-muted] mb-1 block">Article</label>
              <select value={form.article} onChange={e => setForm(f => ({ ...f, article: e.target.value }))}
                className="w-full text-xs px-2 py-1.5 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Sélectionner…</option>
                {composants.map(l => (
                  <option key={l.matiere} value={l.matiere}>
                    {l.matiere_detail?.designation}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[--text-muted] mb-1 block">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full text-xs px-2 py-1.5 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {[['rebut','Rebut'], ['dechet','Déchet'], ['perte','Perte'], ['casse','Casse']].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[--text-muted] mb-1 block">Quantité</label>
              <input type="number" value={form.quantite} onChange={e => setForm(f => ({ ...f, quantite: e.target.value }))}
                min="0" step="0.001" className="w-full text-xs px-2 py-1.5 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs text-[--text-muted] mb-1 block">Motif</label>
              <input value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))}
                className="w-full text-xs px-2 py-1.5 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => creerPerte()} disabled={!form.article || !form.quantite || isPending}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Article', 'Type', 'Quantité', 'Motif', 'Date'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-[--text-muted] font-semibold uppercase text-[10px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pertes.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td className="px-3 py-2 text-[--text-primary]">{p.article_designation}</td>
              <td className="px-3 py-2"><Badge variant="warning">{p.type_label}</Badge></td>
              <td className="px-3 py-2 font-data">{p.quantite}</td>
              <td className="px-3 py-2 text-[--text-secondary]">{p.motif || '—'}</td>
              <td className="px-3 py-2 text-[--text-muted] font-data">{formatDate(p.date_saisie)}</td>
            </tr>
          ))}
          {pertes.length === 0 && (
            <tr><td colSpan={5} className="text-center py-6 text-xs text-[--text-muted]">Aucune perte enregistrée</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function TabCout({ ofId }: { ofId: string }) {
  const { data } = useQuery({
    queryKey: ['cout-revient', ofId],
    queryFn: () => productionApi.getCoutRevient(ofId).then(r => r.data),
  })

  const cout = data?.results?.[0]

  if (!cout) return (
    <div className="text-center py-8 text-xs text-[--text-muted]">
      Le coût de revient sera disponible après la clôture de l'OF.
    </div>
  )

  const rows = [
    { label: 'Coût matières',      value: cout.cout_matieres },
    { label: "Coût main-d'œuvre",  value: cout.cout_main_oeuvre },
    { label: 'Coût charges',       value: cout.cout_charges },
    { label: 'Coût total',         value: cout.cout_total },
    { label: 'Coût unitaire',      value: cout.cout_unitaire },
    { label: 'Coût standard',      value: cout.cout_standard },
  ]

  return (
    <div className="space-y-3">
      <p className="text-xs text-[--text-muted]">Calculé le {formatDate(cout.date_calcul)}</p>
      <div className="space-y-1">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-3 py-2 rounded"
            style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <span className="text-xs text-[--text-secondary]">{label}</span>
            <span className="font-data text-sm font-semibold text-[--text-primary]">{formatXOF(value)}</span>
          </div>
        ))}
      </div>
      {cout.cout_standard > 0 && (
        <div className={`text-xs px-3 py-2 rounded ${cout.cout_total <= cout.cout_standard ? 'text-green-400' : 'text-red-400'}`}
          style={{ backgroundColor: cout.cout_total <= cout.cout_standard ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
          {cout.cout_total <= cout.cout_standard
            ? `✓ Dans le budget (écart : ${formatXOF(cout.cout_standard - cout.cout_total)})`
            : `⚠ Dépassement de ${formatXOF(cout.cout_total - cout.cout_standard)}`
          }
        </div>
      )}
    </div>
  )
}

function TabTracabilite({ ofId }: { ofId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tracabilite-of', ofId],
    queryFn: () => productionApi.tracabiliteOF(ofId).then(r => r.data),
  })

  if (isLoading) return <div className="text-xs text-[--text-muted] py-4">Chargement…</div>
  if (!data) return null

  const isEmpty = (!data.lots_pf || data.lots_pf.length === 0) && (!data.consommations || data.consommations.length === 0)

  if (isEmpty) return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <div className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-elevated)' }}>
        <GitBranch size={18} style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        Aucune traçabilité disponible
      </p>
      <p className="text-xs max-w-xs" style={{ color: 'var(--text-muted)' }}>
        La traçabilité des lots (matières consommées et produit fini généré) sera disponible après la clôture de l'OF.
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      {data.lots_pf && data.lots_pf.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-2">Lots produits finis</h4>
          <div className="space-y-1">
            {data.lots_pf.map((lot) => (
              <div key={lot.id} className="flex items-center gap-3 px-3 py-2 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <span className="font-data text-xs text-[--accent]">{lot.numero_lot}</span>
                <span className="text-xs text-[--text-secondary]">{lot.article_detail?.designation}</span>
                <span className="ml-auto font-data text-xs text-[--text-muted]">{lot.quantite_restante} {lot.article_detail?.unite_code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.consommations && data.consommations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-2">Matières consommées</h4>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Lot MP', 'Lot PF', 'Quantité', 'Date'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[--text-muted] font-semibold uppercase text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.consommations.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className="px-3 py-2 font-data text-[--accent]">{c.lot_mp_numero}</td>
                  <td className="px-3 py-2 font-data text-[--text-secondary]">{c.lot_pf_numero}</td>
                  <td className="px-3 py-2 font-data">{c.quantite}</td>
                  <td className="px-3 py-2 text-[--text-muted]">{formatDate(c.date_consommation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────

export function OFDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState('infos')
  const [terminerQty, setTerminerQty] = useState('')
  const [showTerminerModal, setShowTerminerModal] = useState(false)
  const [cloturerForm, setCloturerForm] = useState({ main_oeuvre: '', charges: '' })
  const [showCloturerModal, setShowCloturerModal] = useState(false)
  const terminerRef = useRef(false)   // garde contre le double-envoi
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editForm, setEditForm] = useState({
    nomenclature:    '',
    quantite_prevue: '',
    date_prevue:     '',
    ligne_prod:      '',
    priorite:        'normale',
    sequence:        '100',
    seuil_rendement: '80',
    seuil_perte:     '10',
    notes:           '',
  })

  const { data: of, isLoading } = useQuery({
    queryKey: ['of', id],
    queryFn: () => productionApi.getOF(id!).then(r => r.data),
    enabled: !!id,
  })

  // Nomenclatures (uniquement pour édition en brouillon)
  const { data: nomenclaturesData } = useQuery({
    queryKey: ['nomenclatures-select'],
    queryFn:  () => productionApi.listNomenclatures({ active: true, page_size: 200 }).then(r => r.data),
    enabled:  showEditModal && of?.statut === 'brouillon',
  })
  const nomenclatures = nomenclaturesData?.results ?? []

  const { mutate: saveEdit, isPending: saving } = useMutation({
    mutationFn: () => {
      const s = of!.statut
      let payload: Record<string, unknown>
      if (s === 'brouillon') {
        payload = {
          quantite_prevue: parseFloat(editForm.quantite_prevue),
          date_prevue:     editForm.date_prevue,
          ligne_prod:      editForm.ligne_prod,
          priorite:        editForm.priorite,
          sequence:        parseInt(editForm.sequence) || 100,
          seuil_rendement: parseFloat(editForm.seuil_rendement),
          seuil_perte:     parseFloat(editForm.seuil_perte),
          notes:           editForm.notes,
        }
      } else if (s === 'confirme') {
        payload = {
          date_prevue:     editForm.date_prevue,
          ligne_prod:      editForm.ligne_prod,
          priorite:        editForm.priorite,
          sequence:        parseInt(editForm.sequence) || 100,
          seuil_rendement: parseFloat(editForm.seuil_rendement),
          seuil_perte:     parseFloat(editForm.seuil_perte),
          notes:           editForm.notes,
        }
      } else {
        payload = {
          seuil_rendement: parseFloat(editForm.seuil_rendement),
          seuil_perte:     parseFloat(editForm.seuil_perte),
          notes:           editForm.notes,
        }
      }
      return productionApi.updateOF(id!, payload)
    },
    onSuccess: () => {
      toast.success('OF mis à jour')
      qc.invalidateQueries({ queryKey: ['of', id] })
      qc.invalidateQueries({ queryKey: ['ofs'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      setShowEditModal(false)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la mise à jour'),
  })

  const { mutate: deleteOF, isPending: deleting } = useMutation({
    mutationFn: () => productionApi.deleteOF(id!),
    onSuccess: () => {
      toast.success(`OF ${of?.reference} supprimé`)
      navigate('/production/ordres-de-fabrication')
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la suppression'),
  })

  const openEdit = () => {
    if (!of) return
    setEditForm({
      nomenclature:    of.nomenclature,
      quantite_prevue: String(of.quantite_prevue),
      date_prevue:     of.date_prevue,
      ligne_prod:      of.ligne_prod ?? '',
      priorite:        of.priorite ?? 'normale',
      sequence:        String(of.sequence ?? 100),
      seuil_rendement: String(of.seuil_rendement ?? 80),
      seuil_perte:     String(of.seuil_perte ?? 10),
      notes:           of.notes ?? '',
    })
    setShowEditModal(true)
  }

  const onSuccess = (msg: string) => {
    toast.success(msg)
    qc.invalidateQueries({ queryKey: ['of', id] })
    qc.invalidateQueries({ queryKey: ['ofs'] })
    qc.invalidateQueries({ queryKey: ['stock'] })
  }

  const { mutate: confirmer } = useMutation({
    mutationFn: () => productionApi.confirmerOF(id!),
    onSuccess: () => onSuccess('OF confirmé'),
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: demarrer } = useMutation({
    mutationFn: () => productionApi.demarrerOF(id!),
    onSuccess: () => onSuccess('OF démarré'),
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: terminer, isPending: terminating } = useMutation({
    mutationFn: () => productionApi.terminerOF(id!, parseFloat(terminerQty)),
    onSuccess: () => {
      terminerRef.current = false
      onSuccess('OF terminé')
      setShowTerminerModal(false)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      terminerRef.current = false
      toast.error(e?.response?.data?.detail ?? 'Erreur')
    },
  })

  const { mutate: cloturer, isPending: clotiuring } = useMutation({
    mutationFn: () => productionApi.cloturerOF(
      id!,
      cloturerForm.main_oeuvre ? parseFloat(cloturerForm.main_oeuvre) : undefined,
      cloturerForm.charges ? parseFloat(cloturerForm.charges) : undefined,
    ),
    onSuccess: () => { onSuccess('OF clôturé'); setShowCloturerModal(false) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  if (isLoading) return (
    <div className="animate-fade-in space-y-4">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="skeleton h-40 rounded" />
    </div>
  )
  if (!of) return <p className="text-sm text-[--text-muted]">OF introuvable.</p>

  const cfg    = STATUT_CONFIG[of.statut]
  const statut = of.statut

  return (
    <>
    <div className="p-6 space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/production/ordres-de-fabrication')}
            className="p-1.5 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[--text-primary] font-data">{of.reference}</h1>
              <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
              {of.est_en_retard && <Badge variant="danger">En retard</Badge>}
            </div>
            <p className="text-xs text-[--text-muted] mt-0.5">{of.produit_designation}</p>
          </div>
        </div>

        {/* Actions selon statut */}
        <div className="flex items-center gap-2">
          {/* Modifier — disponible pour brouillon, confirme, en_cours */}
          {['brouillon', 'confirme', 'en_cours'].includes(statut) && (
            <Button size="sm" variant="secondary" icon={<Edit2 size={13} />} onClick={openEdit}>Modifier</Button>
          )}
          {/* Supprimer — uniquement brouillon */}
          {statut === 'brouillon' && !showDeleteConfirm && (
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} />}
              onClick={() => setShowDeleteConfirm(true)}
              className="text-[--status-danger] hover:text-[--status-danger]"
            >
              Supprimer
            </Button>
          )}
          {statut === 'brouillon' && showDeleteConfirm && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <span className="text-xs" style={{ color: 'var(--status-danger)' }}>Confirmer la suppression ?</span>
              <Button size="xs" variant="danger" loading={deleting} onClick={() => deleteOF()}>Oui</Button>
              <Button size="xs" variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Non</Button>
            </div>
          )}
          {/* Transitions d'état */}
          {statut === 'brouillon' && (
            <Button size="sm" variant="secondary" icon={<CheckCircle size={13} />} onClick={() => confirmer()}>Confirmer</Button>
          )}
          {statut === 'confirme' && (
            <Button size="sm" variant="secondary" icon={<Play size={13} />} onClick={() => demarrer()}>Démarrer</Button>
          )}
          {statut === 'en_cours' && (
            <Button size="sm" variant="primary" icon={<Flag size={13} />} onClick={() => setShowTerminerModal(true)}>Terminer</Button>
          )}
          {statut === 'termine' && (
            <Button size="sm" variant="secondary" icon={<Archive size={13} />} onClick={() => setShowCloturerModal(true)}>Clôturer</Button>
          )}
        </div>
      </div>

      {/* KPIs rapides */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Qté prévue', value: of.quantite_prevue },
          { label: 'Qté produite', value: of.quantite_produite },
          { label: 'Rendement', value: `${of.rendement ?? 0}%` },
          { label: 'Ligne prod', value: of.ligne_prod || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="surface px-4 py-3">
            <p className="text-[10px] text-[--text-muted] uppercase tracking-wider">{label}</p>
            <p className="text-lg font-bold font-data text-[--text-primary] mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div className="surface overflow-hidden">
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all"
              style={{
                color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'infos' && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-2">Informations</h4>
                <InfoRow label="Référence" value={<span className="font-data">{of.reference}</span>} />
                <InfoRow label="Nomenclature" value={of.nomenclature_detail?.produit_detail?.designation ?? '—'} />
                <InfoRow label="Date prévue" value={formatDate(of.date_prevue)} />
                <InfoRow label="Date début" value={of.date_debut ? formatDate(of.date_debut) : '—'} />
                <InfoRow label="Date fin" value={of.date_fin ? formatDate(of.date_fin) : '—'} />
                {of.notes && <InfoRow label="Notes" value={of.notes} />}
              </div>
              <TabMatieres ofId={id!} />
            </div>
          )}
          {tab === 'affectations' && <TabAffectations ofId={id!} />}
          {tab === 'pertes'       && <TabPertes ofId={id!} composants={of.nomenclature_detail?.lignes ?? []} />}
          {tab === 'cout'         && <TabCout ofId={id!} />}
          {tab === 'tracabilite'  && <TabTracabilite ofId={id!} />}
        </div>
      </div>
    </div>

    {/* ── Modal Modifier ── */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Modifier — ${of.reference}`}
        size="lg"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowEditModal(false)}>Annuler</Button>
            <Button size="sm" variant="primary" loading={saving} onClick={() => saveEdit()}>Enregistrer</Button>
          </>
        }
      >
        {(() => {
          const s = of.statut
          const locked = (cond: boolean) => cond ? 'opacity-60 cursor-not-allowed' : ''
          const INPUT = 'w-full text-sm px-3 py-2 rounded transition-all'
          const inputStyle = { backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
          const LABEL = 'text-xs text-[--text-muted] mb-1 block font-medium uppercase tracking-wider'

          return (
            <div className="flex flex-col gap-5">

              {/* Nomenclature (toujours verrouillée) + Quantité (brouillon uniquement) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Nomenclature</label>
                  <select
                    value={editForm.nomenclature}
                    disabled
                    className={`${INPUT} ${locked(true)} pl-3 pr-8`}
                    style={inputStyle}
                  >
                    {nomenclatures.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.produit_detail?.designation} (v{n.version})
                      </option>
                    ))}
                    {/* Fallback si liste pas encore chargée */}
                    {nomenclatures.length === 0 && (
                      <option value={editForm.nomenclature}>{of.nomenclature_detail?.produit_detail?.designation}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Quantité prévue *</label>
                  <input
                    type="number" min="0.001" step="0.001"
                    value={editForm.quantite_prevue}
                    onChange={e => setEditForm(f => ({ ...f, quantite_prevue: e.target.value }))}
                    disabled={s !== 'brouillon'}
                    className={`${INPUT} ${locked(s !== 'brouillon')}`}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Date + Ligne prod — brouillon & confirme */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Date prévue *</label>
                  <input
                    type="date"
                    value={editForm.date_prevue}
                    onChange={e => setEditForm(f => ({ ...f, date_prevue: e.target.value }))}
                    disabled={s === 'en_cours'}
                    className={`${INPUT} ${locked(s === 'en_cours')}`}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={LABEL}>Ligne de production</label>
                  <input
                    type="text"
                    value={editForm.ligne_prod}
                    onChange={e => setEditForm(f => ({ ...f, ligne_prod: e.target.value }))}
                    disabled={s === 'en_cours'}
                    className={`${INPUT} ${locked(s === 'en_cours')}`}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Priorité + Séquence — brouillon & confirme */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Priorité</label>
                  <select
                    value={editForm.priorite}
                    onChange={e => setEditForm(f => ({ ...f, priorite: e.target.value }))}
                    disabled={s === 'en_cours'}
                    className={`${INPUT} ${locked(s === 'en_cours')} pl-3 pr-8`}
                    style={inputStyle}
                  >
                    <option value="planifiee">Planifiée</option>
                    <option value="normale">Normale</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Séquence</label>
                  <input
                    type="number" min="1" step="1"
                    value={editForm.sequence}
                    onChange={e => setEditForm(f => ({ ...f, sequence: e.target.value }))}
                    disabled={s === 'en_cours'}
                    className={`${INPUT} ${locked(s === 'en_cours')}`}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Seuils — toujours modifiables */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Seuil rendement (%)</label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    value={editForm.seuil_rendement}
                    onChange={e => setEditForm(f => ({ ...f, seuil_rendement: e.target.value }))}
                    className={INPUT}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={LABEL}>Seuil perte (%)</label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    value={editForm.seuil_perte}
                    onChange={e => setEditForm(f => ({ ...f, seuil_perte: e.target.value }))}
                    className={INPUT}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Notes — toujours modifiable */}
              <div>
                <label className={LABEL}>Notes</label>
                <textarea
                  rows={3}
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className={`${INPUT} resize-none leading-relaxed`}
                  style={{ ...inputStyle, height: 'auto', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}
                />
              </div>

              {/* Bandeau info si champs verrouillés */}
              {s !== 'brouillon' && (
                <p className="text-[11px] text-[--text-muted] flex items-center gap-1.5">
                  <AlertTriangle size={11} />
                  {s === 'confirme'
                    ? 'La nomenclature et la quantité prévue sont verrouillées (OF confirmé).'
                    : 'Seuls les seuils d\'alerte et les notes sont modifiables (OF en cours).'}
                </p>
              )}
            </div>
          )
        })()}
      </Modal>

      <Modal isOpen={showTerminerModal} onClose={() => setShowTerminerModal(false)} title="Terminer l'OF"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowTerminerModal(false)}>Annuler</Button>
            <Button size="sm" variant="primary"
            onClick={() => {
              if (terminerRef.current || terminating) return
              terminerRef.current = true
              terminer()
            }}
            disabled={!terminerQty || terminating}
          >Confirmer</Button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-xs text-[--text-secondary]">Saisissez la quantité réellement produite pour clore cet OF.</p>
          <div>
            <label className="text-xs text-[--text-muted] mb-1 block">Quantité produite</label>
            <input type="number" value={terminerQty} onChange={e => setTerminerQty(e.target.value)} min="0" step="0.001"
              className="w-full text-sm px-3 py-2 rounded"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <p className="text-xs text-[--text-muted]">Prévu : <strong>{of.quantite_prevue}</strong></p>
        </div>
      </Modal>

      {/* Modal Clôturer */}
      <Modal isOpen={showCloturerModal} onClose={() => setShowCloturerModal(false)} title="Clôturer l'OF"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowCloturerModal(false)}>Annuler</Button>
            <Button size="sm" variant="primary" onClick={() => cloturer()} disabled={clotiuring}>Clôturer et calculer coût</Button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-xs text-[--text-secondary]">Renseignez les coûts supplémentaires (optionnel). Le coût matières est calculé automatiquement.</p>
          {[
            { key: 'main_oeuvre', label: "Coût main-d'œuvre (FCFA)" },
            { key: 'charges',     label: 'Coût charges (FCFA)' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-[--text-muted] mb-1 block">{label}</label>
              <input type="number" value={cloturerForm[key as keyof typeof cloturerForm]}
                onChange={e => setCloturerForm(f => ({ ...f, [key]: e.target.value }))}
                min="0" placeholder="0"
                className="w-full text-sm px-3 py-2 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
