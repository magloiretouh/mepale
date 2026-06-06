/**
 * MEPALE ERP — Factures Fournisseurs
 * Liste, création et paiement des factures fournisseurs
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, AlertCircle, CheckCircle2, Clock, CreditCard,
  Wallet, X, FileText, Link2, FileX2, TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatDate, formatXOF } from '@/lib/utils'
import {
  logistiqueApi,
  type FactureFournisseur, type PaiementFacture, type BonCommande,
  type StatutFacture, type ModePaiement,
} from '@/services/logistique'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Configs ──────────────────────────────────────────────────────────────────

const STATUT_CONFIG: Record<StatutFacture, { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' | 'info' | 'accent' }> = {
  brouillon:            { label: 'Brouillon',        variant: 'neutral' },
  soumise:              { label: 'Soumise',           variant: 'info'    },
  attente_direction:    { label: 'Attente direction', variant: 'warning' },
  rejetee:              { label: 'Rejetée',           variant: 'danger'  },
  en_attente:           { label: 'En attente',        variant: 'warning' },
  partiellement_payee:  { label: 'Partiel.',          variant: 'neutral' },
  payee:                { label: 'Payée',             variant: 'success' },
  annulee:              { label: 'Annulée',           variant: 'danger'  },
}

const MODE_PAIEMENT_OPTIONS: { value: ModePaiement; label: string }[] = [
  { value: 'virement',     label: 'Virement bancaire' },
  { value: 'cheque',       label: 'Chèque'            },
  { value: 'especes',      label: 'Espèces'           },
  { value: 'mobile_money', label: 'Mobile Money'      },
]

// ─── Modal paiement ───────────────────────────────────────────────────────────

function ModalPayer({
  facture,
  onClose,
}: {
  facture: FactureFournisseur | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [montant, setMontant]   = useState('')
  const [mode, setMode]         = useState<ModePaiement>('virement')
  const [refPaie, setRefPaie]   = useState('')
  const [datePaie, setDatePaie] = useState(new Date().toISOString().slice(0, 10))

  const payerMut = useMutation({
    mutationFn: (data: { montant: number; mode_paiement: ModePaiement; reference_paiement?: string; date_paiement: string }) =>
      logistiqueApi.enregistrerPaiement(facture!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['factures'] })
      onClose()
      toast.success('Paiement enregistré')
      setMontant(''); setRefPaie(''); setMode('virement')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors du paiement'),
  })

  const handleSubmit = () => {
    const m = parseFloat(montant)
    if (!m || m <= 0) { toast.error('Montant invalide'); return }
    if (facture && m > facture.montant_restant) {
      toast.error(`Le montant dépasse le solde restant (${formatXOF(facture.montant_restant)})`)
      return
    }
    payerMut.mutate({ montant: m, mode_paiement: mode, reference_paiement: refPaie || undefined, date_paiement: datePaie })
  }

  if (!facture) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
          maxHeight:       '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <CreditCard size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Enregistrer un paiement</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{facture.reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-4">

            {/* Solde restant */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-lg"
              style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <span className="text-xs text-[--text-muted]">Solde restant à payer</span>
              <span className="font-data text-sm font-bold" style={{ color: 'var(--status-danger)' }}>
                {formatXOF(facture.montant_restant)}
              </span>
            </div>

            {/* Montant */}
            <div>
              <label className={FIELD_LABEL}>
                Montant payé (FCFA) <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <Input
                type="number"
                placeholder="0"
                value={montant}
                onChange={e => setMontant(e.target.value)}
                min={0}
                max={facture.montant_restant}
                className="font-data"
              />
              <button
                className="mt-1.5 text-[10px] font-medium"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                onClick={() => setMontant(facture.montant_restant.toString())}
              >
                Tout régler ({formatXOF(facture.montant_restant)})
              </button>
            </div>

            {/* Date */}
            <div>
              <label className={FIELD_LABEL}>
                Date du paiement <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <Input type="date" value={datePaie} onChange={e => setDatePaie(e.target.value)} />
            </div>

            {/* Mode paiement */}
            <div>
              <label className={FIELD_LABEL}>
                Mode de paiement <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <select
                value={mode}
                onChange={e => setMode(e.target.value as ModePaiement)}
                className={SELECT_CLASS}
                style={{ height: '36px' }}
              >
                {MODE_PAIEMENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Référence paiement */}
            <div>
              <label className={FIELD_LABEL}>Référence paiement</label>
              <Input
                placeholder="N° chèque, référence virement…"
                value={refPaie}
                onChange={e => setRefPaie(e.target.value)}
                className="font-data"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            loading={payerMut.isPending}
            icon={<CreditCard size={13} />}
            onClick={handleSubmit}
          >
            Enregistrer le paiement
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal création facture ───────────────────────────────────────────────────

// Statuts de BC éligibles à la facturation
const BC_STATUTS_FACTURABLES = ['envoye', 'confirme', 'partiel', 'recu']

function ModalCreateFacture({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()

  // Type de facture
  const [type, setType] = useState<'bc' | 'directe'>('bc')

  // Formulaire commun
  const [form, setForm] = useState({
    fournisseur:     '',
    ref_fournisseur: '',
    montant_ht:      '',
    date_facture:    new Date().toISOString().slice(0, 10),
    date_echeance:   '',
    notes:           '',
  })

  // BC sélectionné (mode "Liée à un BC")
  const [bcId, setBcId] = useState('')

  // Chargement des BCs facturables
  const { data: bcsData } = useQuery({
    queryKey: ['bcs-facturables'],
    queryFn:  () => logistiqueApi.listBonsCommande({ page_size: 500 }).then(r => r.data),
    enabled:  type === 'bc',
  })
  const bcFacturables = (bcsData?.results ?? []).filter(bc =>
    BC_STATUTS_FACTURABLES.includes(bc.statut)
  )

  // BC actuellement sélectionné (objet complet)
  const bcSelectionne: BonCommande | undefined = bcFacturables.find(bc => bc.id === bcId)

  // Fournisseurs (mode "Directe")
  const { data: fournData } = useQuery({
    queryKey: ['fournisseurs-mini'],
    queryFn:  () => logistiqueApi.listFournisseurs({ page_size: 200 }).then(r => r.data),
    enabled:  type === 'directe',
  })

  // Quand on change de BC : pré-remplir fournisseur + montant restant
  const handleBcChange = (id: string) => {
    setBcId(id)
    const bc = bcFacturables.find(b => b.id === id)
    if (!bc) { setForm(f => ({ ...f, fournisseur: '', montant_ht: '' })); return }
    const htRestant = Math.max(0, bc.montant_ht - bc.montant_ht_facture)
    setForm(f => ({
      ...f,
      fournisseur: bc.fournisseur,
      montant_ht:  htRestant > 0 ? htRestant.toFixed(2) : '',
    }))
  }

  // Quand on bascule de type : réinitialiser
  const handleTypeChange = (t: 'bc' | 'directe') => {
    setType(t)
    setBcId('')
    setForm(f => ({ ...f, fournisseur: '', montant_ht: '' }))
  }

  // Calculs dérivés
  const montantHtNum   = parseFloat(form.montant_ht) || 0
  const montantTtcNum  = montantHtNum * 1.18
  const bcTtcRestant   = bcSelectionne ? Math.max(0, bcSelectionne.montant_ttc - bcSelectionne.montant_ttc_facture) : 0
  const depasse        = bcSelectionne && montantTtcNum > 0 && montantTtcNum > bcTtcRestant + 0.01

  const tvaNum = parseFloat((montantHtNum * 0.18).toFixed(2))

  const createMut = useMutation({
    mutationFn: () => logistiqueApi.createFacture({
      fournisseur:     form.fournisseur,
      bon_commande:    type === 'bc' ? bcId || undefined : undefined,
      ref_fournisseur: form.ref_fournisseur || undefined,
      montant_ht:      montantHtNum,
      tva:             tvaNum,
      montant_ttc:     parseFloat((montantHtNum + tvaNum).toFixed(2)),
      date_facture:    form.date_facture,
      date_echeance:   form.date_echeance || undefined,
      notes:           form.notes || undefined,
    } as any),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['factures'] })
      onClose()
      toast.success(`Facture ${res.data.reference} créée`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la création'),
  })

  const valid =
    form.fournisseur &&
    montantHtNum > 0 &&
    form.date_echeance &&
    (type === 'directe' || bcId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
          maxHeight:       '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <FileText size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouvelle facture fournisseur</h3>
              <p className="text-xs text-[--text-muted] mt-0.5">La référence sera générée automatiquement</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* ── Toggle type de facture ── */}
            <div
              className="flex p-1 gap-1 rounded-lg"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              {([
                { value: 'bc',      icon: <Link2   size={13} />, label: 'Liée à un bon de commande' },
                { value: 'directe', icon: <FileX2  size={13} />, label: 'Facture directe'           },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeChange(opt.value)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition-all duration-150"
                  style={
                    type === opt.value
                      ? { backgroundColor: 'var(--bg-surface)', color: 'var(--accent)', border: '1px solid var(--accent)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                      : { backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' }
                  }
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            {/* ── Mode Liée à un BC ── */}
            {type === 'bc' && (
              <>
                {/* Sélecteur BC */}
                <div>
                  <label className={FIELD_LABEL}>
                    Bon de commande <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <select
                    value={bcId}
                    onChange={e => handleBcChange(e.target.value)}
                    className={SELECT_CLASS}
                    style={{ height: '36px' }}
                  >
                    <option value="">— Sélectionner un BC —</option>
                    {bcFacturables.map(bc => (
                      <option key={bc.id} value={bc.id}>
                        {bc.reference} — {bc.fournisseur_detail.raison_sociale} — {formatXOF(bc.montant_ttc)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Récap BC sélectionné */}
                {bcSelectionne && (
                  <div
                    className="rounded-lg px-4 py-3 grid grid-cols-3 gap-3 text-xs"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <div>
                      <p className="text-[--text-muted] mb-0.5">Fournisseur</p>
                      <p className="font-medium text-[--text-primary]">{bcSelectionne.fournisseur_detail.raison_sociale}</p>
                    </div>
                    <div>
                      <p className="text-[--text-muted] mb-0.5">Déjà facturé</p>
                      <p className="font-data font-semibold" style={{ color: 'var(--status-warning)' }}>
                        {formatXOF(bcSelectionne.montant_ttc_facture)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[--text-muted] mb-0.5">Restant à facturer</p>
                      <p className="font-data font-semibold" style={{ color: bcTtcRestant > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {bcTtcRestant > 0 ? formatXOF(bcTtcRestant) : 'Soldé'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Fournisseur verrouillé */}
                {bcSelectionne && (
                  <div>
                    <label className={FIELD_LABEL}>Fournisseur</label>
                    <div
                      className="h-9 flex items-center px-3 rounded text-sm font-medium"
                      style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {bcSelectionne.fournisseur_detail.raison_sociale}
                      <span className="ml-auto text-[10px] font-normal text-[--text-muted]">Depuis le BC</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Mode Facture directe ── */}
            {type === 'directe' && (
              <div>
                <label className={FIELD_LABEL}>
                  Fournisseur <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <select
                  value={form.fournisseur}
                  onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))}
                  className={SELECT_CLASS}
                  style={{ height: '36px' }}
                >
                  <option value="">— Choisir un fournisseur —</option>
                  {fournData?.results.map(f => (
                    <option key={f.id} value={f.id}>{f.code} — {f.raison_sociale}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Réf fournisseur ── */}
            <div>
              <label className={FIELD_LABEL}>
                Référence facture fournisseur{' '}
                <span className="text-[--text-muted] normal-case font-normal">(optionnel)</span>
              </label>
              <Input
                placeholder="Numéro de la facture chez le fournisseur"
                value={form.ref_fournisseur}
                onChange={e => setForm(f => ({ ...f, ref_fournisseur: e.target.value }))}
                className="font-data"
              />
            </div>

            {/* ── Montant HT + Date facture ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>
                  Montant HT (FCFA) <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.montant_ht}
                  onChange={e => setForm(f => ({ ...f, montant_ht: e.target.value }))}
                  min={0}
                  className="font-data"
                />
                {montantHtNum > 0 && (
                  <p className="mt-1.5 text-[10px] text-[--text-muted]">
                    TTC (18%) :{' '}
                    <strong className="text-[--text-primary] font-data">
                      {formatXOF(montantTtcNum)}
                    </strong>
                  </p>
                )}
              </div>
              <div>
                <label className={FIELD_LABEL}>
                  Date facture <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <Input
                  type="date"
                  value={form.date_facture}
                  onChange={e => setForm(f => ({ ...f, date_facture: e.target.value }))}
                />
              </div>
            </div>

            {/* Avertissement dépassement BC */}
            {depasse && (
              <div
                className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg text-xs"
                style={{ backgroundColor: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)' }}
              >
                <TriangleAlert size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--status-warning)' }} />
                <span style={{ color: 'var(--status-warning)' }}>
                  Le montant TTC saisi ({formatXOF(montantTtcNum)}) dépasse le restant à facturer du BC ({formatXOF(bcTtcRestant)}).
                  Vous pouvez continuer si c'est intentionnel.
                </span>
              </div>
            )}

            {/* ── Date échéance ── */}
            <div>
              <label className={FIELD_LABEL}>
                Date d'échéance <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <Input
                type="date"
                value={form.date_echeance}
                onChange={e => setForm(f => ({ ...f, date_echeance: e.target.value }))}
              />
            </div>

            {/* ── Notes ── */}
            <div>
              <label className={FIELD_LABEL}>
                Notes <span className="text-[--text-muted] normal-case font-normal">(optionnel)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Observations, informations complémentaires…"
                className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            icon={<Plus size={13} />}
            onClick={() => createMut.mutate()}
            loading={createMut.isPending}
            disabled={!valid}
          >
            Créer la facture
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function FactureList() {
  const navigate = useNavigate()
  const [page, setPage]             = useState(1)
  const [statut, setStatut]         = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['factures', statut, page],
    queryFn:  () => logistiqueApi.listFactures({ statut: statut || undefined, page }).then(r => r.data),
  })

  const factures = data?.results ?? []
  const pages    = Math.ceil((data?.count ?? 0) / 25)

  // KPIs calculés sur la page courante
  const totalTTC     = factures.reduce((s, f) => s + (parseFloat(f.montant_ttc as any) || 0), 0)
  const totalRestant = factures.reduce((s, f) => s + (parseFloat(f.montant_restant as any) || 0), 0)
  const nbEnRetard   = factures.filter(f => f.est_en_retard && (f.statut === 'en_attente' || f.statut === 'partiellement_payee')).length
  const nbPayees     = factures.filter(f => f.statut === 'payee').length

  return (
    <>
      {showCreate && <ModalCreateFacture onClose={() => setShowCreate(false)} />}

      <div className="space-y-4 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Factures Fournisseurs</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">{data?.count ?? 0} facture{(data?.count ?? 0) > 1 ? 's' : ''}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)} icon={<Plus size={13} />}>
            Nouvelle facture
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total TTC (page)',  value: formatXOF(totalTTC),     color: 'var(--text-primary)',   icon: <Wallet     size={14} /> },
            { label: 'Restant à payer',   value: formatXOF(totalRestant), color: 'var(--status-danger)',  icon: <Clock      size={14} /> },
            { label: 'En retard',         value: nbEnRetard,              color: 'var(--status-danger)',  icon: <AlertCircle size={14} /> },
            { label: 'Payées (page)',     value: nbPayees,                color: 'var(--status-success)', icon: <CheckCircle2 size={14} /> },
          ].map(kpi => (
            <div key={kpi.label} className="surface p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${kpi.color}1a`, color: kpi.color }}>
                {kpi.icon}
              </div>
              <div>
                <div className="text-[10px] text-[--text-muted] uppercase tracking-wider">{kpi.label}</div>
                <div className="text-sm font-bold font-data" style={{ color: kpi.color }}>{kpi.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="surface overflow-hidden">

        {/* Filtres statut */}
        <div
          className="flex flex-wrap gap-1.5 items-center px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          {[
            { v: '',                    label: 'Toutes' },
            { v: 'en_attente',          label: 'En attente' },
            { v: 'partiellement_payee', label: 'Partiel' },
            { v: 'payee',               label: 'Payées' },
            { v: 'annulee',             label: 'Annulées' },
          ].map(({ v, label }) => (
            <button key={v} onClick={() => { setStatut(v); setPage(1) }}
              className="px-2.5 py-1 rounded text-xs font-medium transition-all"
              style={{
                backgroundColor: statut === v ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                color:           statut === v ? 'var(--accent)' : 'var(--text-secondary)',
                border:          `1px solid ${statut === v ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tableau */}
        <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  {['Référence', 'Type', 'Fournisseur', 'Statut', 'Montant TTC', 'Payé', 'Restant', 'Échéance', 'Bon commande', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {Array.from({ length: 10 }).map((_, j) => (
                          <td key={j} className="px-3 py-3"><div className="skeleton h-3 rounded w-3/4" /></td>
                        ))}
                      </tr>
                    ))
                  : factures.length === 0
                  ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-[--text-muted]">
                        Aucune facture{statut ? ' pour ce statut' : ''}.
                      </td>
                    </tr>
                  )
                  : factures.map(f => {
                      const cfg     = STATUT_CONFIG[f.statut]
                      const payable = f.statut === 'en_attente' || f.statut === 'partiellement_payee'
                      const enRetard = f.est_en_retard ?? false
                      return (
                        <tr
                          key={f.id}
                          className="group hover:bg-[--bg-elevated] transition-colors"
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        >
                          {/* Référence */}
                          <td className="px-3 py-3">
                            <button
                              onClick={() => navigate(`/logistique/factures/${f.id}`)}
                              className="font-data text-xs font-bold text-[--accent] hover:underline cursor-pointer"
                            >
                              {f.reference}
                            </button>
                            {f.ref_fournisseur && (
                              <div className="text-[10px] text-[--text-muted]">Réf fourn. : {f.ref_fournisseur}</div>
                            )}
                          </td>

                          {/* Type */}
                          <td className="px-3 py-3">
                            {f.bon_commande ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                              >
                                <Link2 size={9} /> Lié BC
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                              >
                                <FileX2 size={9} /> Direct
                              </span>
                            )}
                          </td>

                          {/* Fournisseur */}
                          <td className="px-3 py-3 text-xs font-medium text-[--text-primary]">
                            {f.fournisseur_detail?.raison_sociale ?? '—'}
                          </td>

                          {/* Statut */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={cfg.variant}>{cfg.label}</Badge>
                              {enRetard && payable && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--status-danger)' }}>
                                  <AlertCircle size={10} /> En retard
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Montant TTC */}
                          <td className="px-3 py-3 font-data text-xs font-semibold text-right text-[--text-primary]">
                            {formatXOF(f.montant_ttc)}
                          </td>

                          {/* Payé */}
                          <td className="px-3 py-3 font-data text-xs text-right" style={{ color: 'var(--status-success)' }}>
                            {formatXOF(f.montant_paye)}
                          </td>

                          {/* Restant */}
                          <td className="px-3 py-3 font-data text-xs font-semibold text-right"
                            style={{ color: f.montant_restant > 0 ? 'var(--status-danger)' : 'var(--text-muted)' }}>
                            {f.montant_restant > 0 ? formatXOF(f.montant_restant) : '—'}
                          </td>

                          {/* Échéance */}
                          <td className="px-3 py-3 font-data text-xs"
                            style={{ color: enRetard && payable ? 'var(--status-danger)' : 'var(--text-muted)' }}>
                            {f.date_echeance ? formatDate(f.date_echeance) : '—'}
                          </td>

                          {/* BC */}
                          <td className="px-3 py-3 font-data text-[10px] text-[--text-muted]">
                            {f.bon_commande_ref ?? '—'}
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-3">
                            <button
                              onClick={() => navigate(`/logistique/factures/${f.id}`)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-medium px-2 py-1 rounded"
                              style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-dim)' }}
                            >
                              Détail →
                            </button>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs text-[--text-muted]">Page {page} / {pages}</span>
              <div className="flex gap-1">
                <Button variant="secondary" size="xs" disabled={page === 1}    onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <Button variant="secondary" size="xs" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
