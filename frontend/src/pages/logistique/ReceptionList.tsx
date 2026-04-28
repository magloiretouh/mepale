/**
 * MEPALE ERP — Page Réceptions
 * Liste des réceptions avec détail des lignes, conformité, retours fournisseurs
 * Modal de création réception (avec champ N° BL + conformité par ligne)
 * Modal de création retour fournisseur (lignes NC uniquement)
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Search, Truck,
  CheckCircle2, Filter, Package, Plus, X,
  FileDown, RotateCcw, AlertTriangle, ShieldX, ShieldCheck,
} from 'lucide-react'

import {
  logistiqueApi,
  type Reception, type StatutReception,
  type BonCommande, type LigneBonCommande, type LigneReception,
  type RetourFournisseur,
} from '@/services/logistique'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

const STATUT_CONFIG: Record<StatutReception, { label: string; variant: BadgeVariant }> = {
  en_cours: { label: 'En cours', variant: 'warning' },
  validee:  { label: 'Validée',  variant: 'success' },
  rejetee:  { label: 'Rejetée',  variant: 'danger'  },
}

const FILTRES_STATUT: { label: string; value: StatutReception | 'tous' }[] = [
  { label: 'Tous',     value: 'tous'     },
  { label: 'En cours', value: 'en_cours' },
  { label: 'Validées', value: 'validee'  },
  { label: 'Rejetées', value: 'rejetee'  },
]

const getToday = () => new Date().toISOString().split('T')[0]

// Input de tableau inline — style cohérent avec BonCommandeList
const INLINE_INPUT_STYLE: React.CSSProperties = {
  height: '30px',
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

function inlineInputClass(extra = '') {
  return `font-data w-full rounded px-2 outline-none transition-all text-xs ${extra}`
}

// ─── Type formulaire Réception ────────────────────────────────────────────────

interface LigneRecepForm {
  ligne_bc: string
  article_designation: string
  unite_code: string
  quantite_commandee: number
  quantite_restante: number
  quantite_recue: string
  numero_lot_fournisseur: string
  date_peremption: string
  conforme: boolean
  motif_non_conformite: string
}

// ─── Modal Création Réception ─────────────────────────────────────────────────

function CreateReceptionModal({
  onClose,
  onSave,
  isPending,
}: {
  onClose: () => void
  onSave: (payload: object) => void
  isPending: boolean
}) {
  const [bcId, setBcId]                     = useState('')
  const [dateRecep, setDateRecep]           = useState(getToday())
  const [numeroBL, setNumeroBL]             = useState('')
  const [notes, setNotes]                   = useState('')
  const [lignes, setLignes]                 = useState<LigneRecepForm[]>([])

  // BCs ouverts (envoye, confirme, partiel)
  const { data: bcData } = useQuery({
    queryKey: ['bcs-reception-select'],
    queryFn:  () => logistiqueApi.listBonsCommande({ statut: ['envoye', 'confirme', 'partiel'], page_size: 200 }),
    select:   (r) => r.data.results,
    staleTime: 0,
  })

  // Chargement des lignes du BC sélectionné (une seule query pour éviter le conflit de cache)
  const { isFetching: loadingBC, data: bcDetail } = useQuery<BonCommande>({
    queryKey: ['bc-detail-recep', bcId],
    queryFn:  () => logistiqueApi.getBonCommande(bcId).then((r) => r.data),
    enabled:  !!bcId,
    staleTime: 0,
  })

  // Init lignes dans un useEffect (évite les side-effects pendant le render)
  useEffect(() => {
    if (!bcDetail || !bcId) return
    const newLignes: LigneRecepForm[] = bcDetail.lignes
      .filter((l: LigneBonCommande) => Number(l.quantite_restante) > 0)
      .map((l: LigneBonCommande) => ({
        ligne_bc:               l.id,
        article_designation:    l.article_detail.designation,
        unite_code:             l.article_detail.unite_code,
        quantite_commandee:     l.quantite_commandee,
        quantite_restante:      l.quantite_restante,
        quantite_recue:         String(l.quantite_restante),
        numero_lot_fournisseur: '',
        date_peremption:        '',
        conforme:               true,
        motif_non_conformite:   '',
      }))
    setLignes(newLignes)
  }, [bcDetail, bcId])

  const handleBCChange = (id: string) => {
    setBcId(id)
    setLignes([])
  }

  const updateLigne = (idx: number, field: keyof LigneRecepForm, val: string | boolean) =>
    setLignes((prev) => {
      const next = [...prev]
      next[idx]  = { ...next[idx], [field]: val }
      return next
    })

  const handleSubmit = () => {
    if (!bcId)          { toast.error('Sélectionnez un bon de commande'); return }
    if (!dateRecep)     { toast.error('La date de réception est obligatoire'); return }
    if (!lignes.length) { toast.error('Aucune ligne disponible sur ce BC'); return }
    for (const l of lignes) {
      if (!(parseFloat(l.quantite_recue) > 0)) { toast.error('Quantité reçue invalide'); return }
      if (!l.conforme && !l.motif_non_conformite.trim()) {
        toast.error(`Motif de non-conformité manquant pour : ${l.article_designation}`)
        return
      }
    }
    onSave({
      bon_commande:           bcId,
      date_reception:         dateRecep,
      numero_bl_fournisseur:  numeroBL || '',
      notes,
      lignes: lignes.map((l) => ({
        ligne_bc:                 l.ligne_bc,
        quantite_recue:           parseFloat(l.quantite_recue),
        numero_lot_fournisseur:   l.numero_lot_fournisseur,
        date_peremption:          l.date_peremption || null,
        conforme:                 l.conforme,
        motif_non_conformite:     l.conforme ? '' : l.motif_non_conformite,
      })),
    })
  }

  const bcs = (bcData ?? []) as BonCommande[]
  const hasNC = lignes.some((l) => !l.conforme)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-4xl rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <Truck size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouvelle réception</h3>
              <p className="text-xs text-[--text-muted]">Sélectionnez le BC et saisissez les quantités reçues</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* En-tête formulaire */}
            <div className="grid grid-cols-4 gap-4">
              {/* Bon de commande */}
              <div className="col-span-4">
                <label className={FIELD_LABEL}>
                  Bon de commande <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <select
                  className={SELECT_CLASS}
                  style={{ height: '36px' }}
                  value={bcId}
                  onChange={(e) => handleBCChange(e.target.value)}
                >
                  <option value="">— Sélectionner un BC (envoyé / confirmé / partiel) —</option>
                  {bcs.map((bc) => (
                    <option key={bc.id} value={bc.id}>
                      {bc.reference} — {bc.fournisseur_detail?.raison_sociale ?? ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date de réception */}
              <div>
                <label className={FIELD_LABEL}>
                  Date de réception <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <Input type="date" value={dateRecep} onChange={(e) => setDateRecep(e.target.value)} className="font-data" />
              </div>

              {/* N° BL fournisseur */}
              <div>
                <label className={FIELD_LABEL}>N° BL fournisseur</label>
                <Input
                  value={numeroBL}
                  onChange={(e) => setNumeroBL(e.target.value)}
                  placeholder="Ex : BL-2024-00123"
                  className="font-data"
                />
              </div>

              {/* Notes */}
              <div className="col-span-2">
                <label className={FIELD_LABEL}>Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commentaire optionnel…" />
              </div>
            </div>

            {/* Lignes du BC */}
            {bcId && (
              <>
                <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

                {loadingBC ? (
                  <div className="flex items-center gap-2 text-xs text-[--text-muted]">
                    <span className="w-3 h-3 rounded-full border-2 border-[--accent] border-t-transparent animate-spin" />
                    Chargement des lignes du BC…
                  </div>
                ) : lignes.length === 0 ? (
                  <div
                    className="rounded-lg px-4 py-6 text-center text-xs"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                  >
                    <p className="text-[--text-muted]">Toutes les lignes de ce BC ont déjà été reçues intégralement.</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                      Lignes à réceptionner
                    </p>

                    {/* Alerte NC si des lignes sont marquées NC */}
                    {hasNC && (
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-3"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--status-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)' }}
                      >
                        <AlertTriangle size={13} style={{ color: 'var(--status-warning)' }} />
                        <span style={{ color: 'var(--status-warning)' }}>
                          Des lignes sont marquées non conformes. Renseignez un motif obligatoirement.
                        </span>
                      </div>
                    )}

                    <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                            {['Article', 'Qté restante', 'Qté reçue', 'N° lot fournisseur', 'Date péremption', 'Conforme', 'Motif NC'].map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-[--text-muted]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lignes.map((l, idx) => (
                            <tr
                              key={l.ligne_bc}
                              style={{
                                borderBottom: idx < lignes.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                backgroundColor: !l.conforme ? 'color-mix(in srgb, var(--status-danger) 5%, transparent)' : 'transparent',
                              }}
                            >
                              {/* Article */}
                              <td className="px-3 py-2">
                                <p className="font-medium text-[--text-primary]">{l.article_designation}</p>
                                <span className="text-[--text-muted]">
                                  Cmd : <span className="font-data">{l.quantite_commandee.toLocaleString('fr-TG')} {l.unite_code}</span>
                                </span>
                              </td>

                              {/* Qté restante */}
                              <td className="px-3 py-2 font-data font-semibold" style={{ color: 'var(--status-warning)' }}>
                                {l.quantite_restante.toLocaleString('fr-TG')} {l.unite_code}
                              </td>

                              {/* Qté reçue */}
                              <td className="px-3 py-2" style={{ width: '110px' }}>
                                <input
                                  type="number" min={0.001} step="any"
                                  value={l.quantite_recue}
                                  onChange={(e) => updateLigne(idx, 'quantite_recue', e.target.value)}
                                  className={inlineInputClass()}
                                  style={{ ...INLINE_INPUT_STYLE, border: '1px solid var(--accent)' }}
                                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                />
                              </td>

                              {/* N° lot fournisseur */}
                              <td className="px-3 py-2" style={{ width: '150px' }}>
                                <input
                                  type="text"
                                  value={l.numero_lot_fournisseur}
                                  onChange={(e) => updateLigne(idx, 'numero_lot_fournisseur', e.target.value)}
                                  placeholder="Ex : LOT-2024-01"
                                  className={inlineInputClass()}
                                  style={INLINE_INPUT_STYLE}
                                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                />
                              </td>

                              {/* Date péremption */}
                              <td className="px-3 py-2" style={{ width: '140px' }}>
                                <input
                                  type="date"
                                  value={l.date_peremption}
                                  onChange={(e) => updateLigne(idx, 'date_peremption', e.target.value)}
                                  className={inlineInputClass()}
                                  style={INLINE_INPUT_STYLE}
                                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                />
                              </td>

                              {/* Conforme (checkbox) */}
                              <td className="px-3 py-2 text-center" style={{ width: '80px' }}>
                                <input
                                  type="checkbox"
                                  checked={l.conforme}
                                  onChange={(e) => {
                                    updateLigne(idx, 'conforme', e.target.checked)
                                    if (e.target.checked) updateLigne(idx, 'motif_non_conformite', '')
                                  }}
                                  style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '14px', height: '14px' }}
                                />
                              </td>

                              {/* Motif NC */}
                              <td className="px-3 py-2" style={{ minWidth: '160px' }}>
                                {!l.conforme ? (
                                  <input
                                    type="text"
                                    value={l.motif_non_conformite}
                                    onChange={(e) => updateLigne(idx, 'motif_non_conformite', e.target.value)}
                                    placeholder="Motif de non-conformité…"
                                    className={inlineInputClass()}
                                    style={{ ...INLINE_INPUT_STYLE, border: '1px solid var(--status-danger)' }}
                                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--status-danger)')}
                                  />
                                ) : (
                                  <span className="text-[--text-muted]">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-[--text-muted] mt-2">
                      * La réception devra être validée pour créer les lots en stock.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>
            Créer la réception
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Retour Fournisseur ─────────────────────────────────────────────────

interface LigneRetourForm {
  ligne_reception: string
  article_designation: string
  lot_numero: string | null
  lot_statut: string | null
  quantite_recue_origine: number
  quantite_retournee: string
}

function CreateRetourModal({
  reception,
  onClose,
  onSave,
  isPending,
}: {
  reception: Reception
  onClose: () => void
  onSave: (payload: object) => void
  isPending: boolean
}) {
  const [dateRetour, setDateRetour] = useState(getToday())
  const [motif, setMotif]           = useState('')
  const [notes, setNotes]           = useState('')

  // Lignes NC uniquement
  const [lignes, setLignes] = useState<LigneRetourForm[]>(() =>
    reception.lignes
      .filter((l: LigneReception) => !l.conforme)
      .map((l: LigneReception) => ({
        ligne_reception:       l.id,
        article_designation:   l.article_detail.designation,
        lot_numero:            l.lot_cree ?? null,
        lot_statut:            l.conforme ? 'disponible' : 'bloque',
        quantite_recue_origine: l.quantite_recue,
        quantite_retournee:    String(l.quantite_recue),
      }))
  )

  const updateQte = (idx: number, val: string) =>
    setLignes((prev) => { const next = [...prev]; next[idx] = { ...next[idx], quantite_retournee: val }; return next })

  const handleSubmit = () => {
    if (!dateRetour)      { toast.error('La date de retour est obligatoire'); return }
    if (!motif.trim())    { toast.error('Le motif est obligatoire'); return }
    if (!lignes.length)   { toast.error('Aucune ligne NC trouvée sur cette réception'); return }
    for (const l of lignes) {
      if (!(parseFloat(l.quantite_retournee) > 0)) {
        toast.error(`Quantité à retourner invalide pour : ${l.article_designation}`)
        return
      }
      if (parseFloat(l.quantite_retournee) > l.quantite_recue_origine) {
        toast.error(`Quantité retournée supérieure à la quantité reçue pour : ${l.article_designation}`)
        return
      }
    }
    onSave({
      reception:   reception.id,
      date_retour: dateRetour,
      motif,
      notes:       notes || undefined,
      lignes: lignes.map((l) => ({
        ligne_reception:     l.ligne_reception,
        quantite_retournee:  parseFloat(l.quantite_retournee),
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-3xl rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, var(--status-danger) 15%, transparent)' }}
            >
              <RotateCcw size={16} style={{ color: 'var(--status-danger)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Créer un retour fournisseur</h3>
              <p className="text-xs text-[--text-muted]">
                Réception <span className="font-data text-[--accent]">{reception.reference}</span>
                {' '}— {reception.bon_commande_detail?.fournisseur_detail?.raison_sociale ?? ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* Formulaire en-tête */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={FIELD_LABEL}>
                  Date de retour <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <Input type="date" value={dateRetour} onChange={(e) => setDateRetour(e.target.value)} className="font-data" />
              </div>
              <div className="col-span-2">
                <label className={FIELD_LABEL}>Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commentaire optionnel…" />
              </div>
              <div className="col-span-3">
                <label className={FIELD_LABEL}>
                  Motif <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <textarea
                  rows={2}
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Décrivez le motif du retour…"
                  className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
                />
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Lignes NC */}
            <div>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Lignes non conformes à retourner
                <span className="ml-2 normal-case font-normal">— {lignes.length} ligne{lignes.length > 1 ? 's' : ''}</span>
              </p>

              {lignes.length === 0 ? (
                <div
                  className="rounded-lg px-4 py-6 text-center text-xs"
                  style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                >
                  <p className="text-[--text-muted]">Aucune ligne non conforme trouvée sur cette réception.</p>
                </div>
              ) : (
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {['Article', 'Lot', 'Statut lot', 'Qté reçue', 'Qté à retourner'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-[--text-muted]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l, idx) => {
                        const isBloque = l.lot_statut === 'bloque' || l.lot_statut === 'quarantaine'
                        return (
                          <tr key={l.ligne_reception} style={{ borderBottom: idx < lignes.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                            {/* Article */}
                            <td className="px-3 py-2">
                              <p className="font-medium text-[--text-primary]">{l.article_designation}</p>
                            </td>

                            {/* Lot */}
                            <td className="px-3 py-2 font-data text-xs" style={{ color: 'var(--accent)' }}>
                              {l.lot_numero ?? '—'}
                            </td>

                            {/* Statut lot */}
                            <td className="px-3 py-2">
                              {l.lot_statut ? (
                                <Badge variant={isBloque ? 'warning' : 'success'}>
                                  {isBloque ? 'BLOQUÉ' : 'DISPONIBLE'}
                                </Badge>
                              ) : (
                                <span className="text-[--text-muted]">—</span>
                              )}
                            </td>

                            {/* Qté reçue origine */}
                            <td className="px-3 py-2 font-data text-[--text-secondary]">
                              {l.quantite_recue_origine.toLocaleString('fr-TG')}
                            </td>

                            {/* Qté à retourner */}
                            <td className="px-3 py-2" style={{ width: '130px' }}>
                              <input
                                type="number"
                                min={0.001}
                                max={l.quantite_recue_origine}
                                step="any"
                                value={l.quantite_retournee}
                                onChange={(e) => updateQte(idx, e.target.value)}
                                className={inlineInputClass()}
                                style={{ ...INLINE_INPUT_STYLE, border: '1px solid var(--status-danger)' }}
                                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--status-danger)')}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="danger"
            size="sm"
            loading={isPending}
            icon={<RotateCcw size={13} />}
            onClick={handleSubmit}
          >
            Créer le retour
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ReceptionList() {
  const navigate = useNavigate()
  const [search, setSearch]               = useState('')
  const [filtre, setFiltre]               = useState<StatutReception | 'tous'>('tous')
  const [showCreate, setShowCreate]       = useState(false)
  const [retourModal, setRetourModal]     = useState<Reception | null>(null)

  const queryClient = useQueryClient()
  const invalidate  = () => queryClient.invalidateQueries({ queryKey: ['receptions'] })

  const params: Record<string, string> = {}
  if (search)            params.search = search
  if (filtre !== 'tous') params.statut = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['receptions', search, filtre],
    queryFn:  () => logistiqueApi.listReceptions(params).then((r) => r.data),
  })

  // Mutation : créer réception
  const { mutate: createRecep, isPending: creating } = useMutation({
    mutationFn: (payload: any) => logistiqueApi.createReception(payload),
    onSuccess: () => {
      toast.success('Réception créée. Pensez à la valider pour mettre à jour le stock.')
      invalidate()
      setShowCreate(false)
    },
    // L'intercepteur api.ts affiche déjà le toast d'erreur avec le bon message
  })

  // Mutation : valider réception
  const validerMut = useMutation({
    mutationFn: (id: string) => logistiqueApi.validerReception(id),
    onSuccess: (res) => {
      const nbNC = res.data.reception?.nb_lignes_nc ?? 0
      toast.success(
        nbNC > 0
          ? `Réception validée. ${nbNC} ligne${nbNC > 1 ? 's' : ''} NC en quarantaine.`
          : 'Réception validée. Stock mis à jour.'
      )
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['stock'] })
    },
    // L'intercepteur api.ts affiche déjà le toast d'erreur
  })

  // Mutation : créer retour
  const createRetourMut = useMutation({
    mutationFn: (payload: any) => logistiqueApi.createRetour(payload),
    onSuccess: (_, payload: any) => {
      toast.success('Retour créé. Pensez à le valider pour mettre à jour le stock.')
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['retours', payload.reception] })
      setRetourModal(null)
    },
    // L'intercepteur api.ts affiche déjà le toast d'erreur
  })

  // PDF GRN
  const handlePdfGRN = async (id: string) => {
    try {
      const res = await logistiqueApi.exportPdfReception(id)
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
      window.open(url, '_blank')
    } catch {
      toast.error('Erreur lors de la génération du PDF')
    }
  }

  const receptions = data?.results ?? []
  const enCours    = receptions.filter((r) => r.statut === 'en_cours').length

  // Taux OTD du mois si disponible (premier aperçu depuis les stats logistique)
  const { data: statsData } = useQuery({
    queryKey: ['logistique-stats'],
    queryFn:  () => logistiqueApi.statsLogistique().then((r) => r.data),
    staleTime: 60_000,
  })
  const tauxOTD = statsData?.taux_otd_mois ?? null

  return (
    <>
      {showCreate && (
        <CreateReceptionModal
          onClose={() => setShowCreate(false)}
          onSave={(payload) => createRecep(payload)}
          isPending={creating}
        />
      )}

      {retourModal && (
        <CreateRetourModal
          reception={retourModal}
          onClose={() => setRetourModal(null)}
          onSave={(payload) => createRetourMut.mutate(payload)}
          isPending={createRetourMut.isPending}
        />
      )}

      <div className="flex flex-col h-full gap-4 animate-fade-in">

        {/* ── En-tête ── */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Réceptions</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs text-[--text-muted]">
                {data?.count ?? 0} réception{(data?.count ?? 0) > 1 ? 's' : ''}
              </p>
              {enCours > 0 && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--status-warning) 15%, transparent)', color: 'var(--status-warning)', border: '1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)' }}
                >
                  {enCours} en attente
                </span>
              )}
              {tauxOTD !== null && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full font-data"
                  style={{
                    backgroundColor: tauxOTD >= 80
                      ? 'color-mix(in srgb, var(--status-success) 15%, transparent)'
                      : 'color-mix(in srgb, var(--status-warning) 15%, transparent)',
                    color: tauxOTD >= 80 ? 'var(--status-success)' : 'var(--status-warning)',
                    border: `1px solid ${tauxOTD >= 80 ? 'color-mix(in srgb, var(--status-success) 30%, transparent)' : 'color-mix(in srgb, var(--status-warning) 30%, transparent)'}`,
                  }}
                >
                  OTD {tauxOTD.toFixed(0)} %
                </span>
              )}
            </div>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Nouvelle réception
          </Button>
        </div>

        {/* ── Table card ── */}
        <div className="surface overflow-hidden flex flex-col flex-1 min-h-0" style={{ boxShadow: 'var(--shadow-card)' }}>

        {/* ── Filtres ── */}
        <div
          className="flex flex-wrap items-center gap-3 px-6 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-64">
            <Input
              placeholder="Rechercher (ref, BC, fournisseur)…"
              icon={<Search size={13} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-[--text-muted] mr-1" />
            {FILTRES_STATUT.map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltre(f.value)}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all',
                  filtre === f.value
                    ? 'text-[--accent]'
                    : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]'
                )}
                style={
                  filtre === f.value
                    ? { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                    : { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                }
              >
                {f.label}
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
                {['Référence', 'Bon de commande', 'Fournisseur', 'Date réception', 'N° BL', 'Statut', 'OTD', 'Actions'].map((h) => (
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
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-6 py-5">
                          <div className="skeleton h-4 rounded" style={{ width: `${40 + j * 7}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : receptions.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <Package size={32} className="mx-auto mb-3 text-[--text-muted]" />
                      <p className="text-sm text-[--text-secondary]">Aucune réception enregistrée</p>
                      <p className="text-xs text-[--text-muted] mt-1">Créez une réception depuis un bon de commande</p>
                    </td>
                  </tr>
                )
                : receptions.map((r) => {
                    const config         = STATUT_CONFIG[r.statut] ?? { label: r.statut_label, variant: 'neutral' as BadgeVariant }
                    const fournisseurNom = r.bon_commande_detail?.fournisseur_detail?.raison_sociale ?? '—'
                    const enRetard       = r.est_livraison_a_temps === false

                    return (
                        <tr
                          key={r.id}
                          className="group hover:bg-[--bg-elevated] transition-colors"
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        >
                          {/* Référence */}
                          <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => navigate(`/logistique/receptions/${r.id}`)}
                                className="font-data text-xs font-bold text-[--accent] hover:underline cursor-pointer"
                              >
                                {r.reference}
                              </button>
                              {r.nb_lignes_nc > 0 && (
                                <span
                                  className="font-data text-[9px] font-semibold px-1 py-0.5 rounded"
                                  style={{ backgroundColor: 'color-mix(in srgb, var(--status-danger) 15%, transparent)', color: 'var(--status-danger)', border: '1px solid color-mix(in srgb, var(--status-danger) 30%, transparent)' }}
                                >
                                  {r.nb_lignes_nc} NC
                                </span>
                              )}
                            </div>
                          </td>

                          {/* BC */}
                          <td className="px-6 py-5">
                            <span className="font-data text-xs text-[--text-secondary]">
                              {r.bon_commande_detail?.reference ?? '—'}
                            </span>
                          </td>

                          {/* Fournisseur */}
                          <td className="px-6 py-5">
                            <span className="text-xs font-semibold text-[--text-primary]">{fournisseurNom}</span>
                          </td>

                          {/* Date réception */}
                          <td className="px-6 py-5">
                            <span className="font-data text-xs text-[--text-secondary]">{formatDate(r.date_reception)}</span>
                          </td>

                          {/* N° BL */}
                          <td className="px-6 py-5">
                            {r.numero_bl_fournisseur
                              ? <span className="font-data text-xs text-[--text-secondary]">{r.numero_bl_fournisseur}</span>
                              : <span className="text-[--text-muted]">—</span>
                            }
                          </td>

                          {/* Statut */}
                          <td className="px-6 py-5">
                            <Badge variant={config.variant}>{config.label}</Badge>
                          </td>

                          {/* OTD */}
                          <td className="px-6 py-5">
                            {r.est_livraison_a_temps === null ? (
                              <span className="text-[--text-muted] text-xs">—</span>
                            ) : r.est_livraison_a_temps ? (
                              <span className="text-xs font-semibold" style={{ color: 'var(--status-success)' }}>OTD</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <AlertTriangle size={12} style={{ color: 'var(--status-warning)' }} />
                                <span className="text-xs font-semibold" style={{ color: 'var(--status-warning)' }}>
                                  {r.jours_retard && r.jours_retard > 0 ? `+${r.jours_retard}j` : 'Retard'}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              {r.statut === 'en_cours' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  icon={<CheckCircle2 size={13} />}
                                  loading={validerMut.isPending}
                                  onClick={() => validerMut.mutate(r.id)}
                                >
                                  Valider
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                    )
                  })}
            </tbody>
          </table>
          </div>
        </div>

        </div>
      </div>
    </>
  )
}
