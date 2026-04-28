/**
 * MEPALE ERP — Page Bons de Commande
 * Liste, filtres, expandeur lignes, actions Envoyer/Annuler/PDF
 * Modal de création BC : mode manuel OU depuis DA(s) (sélection en 2 niveaux)
 */

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, ShoppingCart,
  Filter, Send, XCircle, FileDown, CheckCircle2,
  Plus, Trash2, X, ClipboardList, ArrowRight, ChevronLeft,
  AlertTriangle, Lock, MapPin, TrendingUp, TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  logistiqueApi,
  type BonCommande, type StatutBC, type LigneDemandeAchat, type ConditionTarifaire,
} from '@/services/logistique'
import { productionApi, type Article } from '@/services/production'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatXOF, formatDate } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

const STATUT_CONFIG: Record<StatutBC, { label: string; variant: BadgeVariant }> = {
  brouillon: { label: 'Brouillon',              variant: 'neutral'  },
  envoye:    { label: 'Envoyé',                 variant: 'info'     },
  confirme:  { label: 'Confirmé fournisseur',   variant: 'accent'   },
  partiel:   { label: 'Partiellement reçu',     variant: 'warning'  },
  recu:      { label: 'Reçu intégralement',     variant: 'success'  },
  annule:    { label: 'Annulé',                 variant: 'danger'   },
}

const FILTRES_STATUT: { label: string; value: StatutBC | 'tous' | 'en_retard' }[] = [
  { label: 'Tous',      value: 'tous'      },
  { label: 'Brouillon', value: 'brouillon' },
  { label: 'Envoyés',   value: 'envoye'    },
  { label: 'Confirmés', value: 'confirme'  },
  { label: 'Partiels',  value: 'partiel'   },
  { label: 'Reçus',     value: 'recu'      },
  { label: 'Annulés',   value: 'annule'    },
  { label: 'En retard', value: 'en_retard' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type BCMode    = 'manuel' | 'da'
type DAPhase   = 'select-das' | 'select-lines' | 'form'

interface PendingCondition {
  tempId:      string
  conditionId: string
  nom:         string
  mode_calcul: string
  type_effet:  string
  valeur:      string
}

interface LigneBCForm {
  article: string
  article_label: string
  unite: string
  quantite_commandee: string
  prix_unitaire: string
  ligne_da_id?: string
  da_ref?: string
  conditions: PendingCondition[]
}

interface DAItem {
  id: string
  article: string
  designation: string
  code: string
  unite: string
  da_ref: string
  qte_demandee: number
  qte_commandee: number
  qte_restante: number
  qte_cmd: string
  checked: boolean
  prix_unitaire_estime: number | null
}

interface DAGroup {
  ref: string
  lines: LigneDemandeAchat[]
  nbLignes: number
}

interface BCForm {
  fournisseur: string
  date_commande: string
  date_livraison_prev: string
  adresse_livraison: string
  notes: string
  lignes: LigneBCForm[]
  bcConditions: PendingCondition[]
}

const getToday  = () => new Date().toISOString().split('T')[0]
const EMPTY_LIGNE = (): LigneBCForm => ({
  article: '', article_label: '', unite: '',
  quantite_commandee: '', prix_unitaire: '',
  conditions: [],
})

// ─── Indicateur d'étapes (DA mode) ───────────────────────────────────────────

function DAStepBar({ phase }: { phase: DAPhase }) {
  const steps: { key: DAPhase; label: string }[] = [
    { key: 'select-das',   label: '1 · Choisir les DA'      },
    { key: 'select-lines', label: '2 · Sélectionner les lignes' },
    { key: 'form',         label: '3 · Compléter le BC'     },
  ]
  const activeIdx = steps.findIndex((s) => s.key === phase)

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-semibold transition-colors"
            style={{
              color: i < activeIdx
                ? 'var(--text-secondary)'
                : i === activeIdx
                ? 'var(--accent)'
                : 'var(--text-muted)',
            }}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className="text-[10px]" style={{ color: 'var(--border)' }}>›</span>
          )}
        </span>
      ))}
    </div>
  )
}

// ─── Calcul séquentiel des conditions (miroir du backend) ────────────────────

function applyConditions(base: number, conditions: PendingCondition[]): number {
  let running = base
  for (const c of conditions) {
    const val    = parseFloat(c.valeur) || 0
    const amount = c.mode_calcul === 'pourcentage' ? running * val / 100 : val
    running = c.type_effet === 'majoration' ? running + amount : Math.max(0, running - amount)
  }
  return running
}

// ─── Modal Création BC ────────────────────────────────────────────────────────

function CreateBCModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (bcId: string) => void
}) {
  const [mode, setMode]       = useState<BCMode>('manuel')
  const [daPhase, setDaPhase] = useState<DAPhase>('select-das')

  // Phase 1 — DA list
  const [daAllLines,     setDaAllLines]     = useState<LigneDemandeAchat[]>([])
  const [selectedDaRefs, setSelectedDaRefs] = useState<Set<string>>(new Set())

  // Phase 2 — Line selection
  const [daItems, setDaItems] = useState<DAItem[]>([])

  // BC form
  const [form, setForm] = useState<BCForm>({
    fournisseur: '', date_commande: getToday(), date_livraison_prev: '',
    adresse_livraison: '', notes: '', lignes: [EMPTY_LIGNE()],
    bcConditions: [],
  })

  // Pickers pour les selects de conditions (reset après sélection)
  const [bcCondPick,    setBcCondPick]    = useState('')
  const [lineCondPick,  setLineCondPick]  = useState<Record<number, string>>({})
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set())

  const toggleExpand = (idx: number) =>
    setExpandedLines(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })

  // ── Données ────────────────────────────────────────────────────────────────

  const { data: fourData } = useQuery({
    queryKey: ['fournisseurs-select'],
    queryFn:  () => logistiqueApi.listFournisseurs({ actif: true, blackliste: false, page_size: 500 }),
    select:   (r) => r.data.results,
    staleTime: 0,
  })

  const { data: articleData } = useQuery({
    queryKey: ['articles-select'],
    queryFn:  () => productionApi.listArticles({ page_size: 500 }),
    select:   (r) => r.data.results,
    staleTime: 0,
  })

  const {
    data:    daLignesData,
    isLoading: loadingDA,
    isError: daIsError,
    error:   daError,
    refetch: refetchDA,
  } = useQuery({
    queryKey: ['da-lignes-disponibles', form.fournisseur],
    queryFn:  () => logistiqueApi.listDALignesDisponibles(form.fournisseur || undefined),
    select:   (r) => r.data,
    enabled:  mode === 'da' && !!form.fournisseur,
    staleTime: 0,
    retry: 1,
  })

  const fournisseurs = (fourData ?? []) as any[]
  const articles     = (articleData ?? []) as Article[]

  const resolveCatalog = (r: any): ConditionTarifaire[] => {
    const d = r.data as { results?: ConditionTarifaire[] } | ConditionTarifaire[]
    return Array.isArray(d) ? d : (d.results ?? [])
  }
  const { data: bcCatalog    = [] } = useQuery<ConditionTarifaire[]>({
    queryKey: ['conditions-catalog', 'bc'],
    queryFn:  () => logistiqueApi.listConditionsTarifaires({ actif: true, niveau: 'bc' }).then(resolveCatalog),
    staleTime: 60_000,
  })
  const { data: ligneCatalog = [] } = useQuery<ConditionTarifaire[]>({
    queryKey: ['conditions-catalog', 'ligne'],
    queryFn:  () => logistiqueApi.listConditionsTarifaires({ actif: true, niveau: 'ligne' }).then(resolveCatalog),
    staleTime: 60_000,
  })

  // Initialiser les lignes DA quand les données arrivent
  useEffect(() => {
    if (!daLignesData) { setDaAllLines([]); return }
    setDaAllLines(daLignesData as LigneDemandeAchat[])
    setSelectedDaRefs(new Set())
    setDaItems([])
  }, [daLignesData])

  // Groups dérivés des lignes (Phase 1)
  const daGroups = useMemo<DAGroup[]>(() => {
    const map: Record<string, DAGroup> = {}
    for (const l of daAllLines) {
      if (!map[l.demande_reference]) {
        map[l.demande_reference] = { ref: l.demande_reference, lines: [], nbLignes: 0 }
      }
      map[l.demande_reference].lines.push(l)
      map[l.demande_reference].nbLignes++
    }
    return Object.values(map).sort((a, b) => a.ref.localeCompare(b.ref))
  }, [daAllLines])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleModeChange = (m: BCMode) => {
    setMode(m)
    setDaPhase('select-das')
    setDaAllLines([])
    setSelectedDaRefs(new Set())
    setDaItems([])
    setForm((prev) => ({ ...prev, adresse_livraison: '', lignes: m === 'manuel' ? [EMPTY_LIGNE()] : [] }))
  }

  const handleFournisseurChange = (fourId: string) => {
    setForm((prev) => ({ ...prev, fournisseur: fourId, lignes: mode === 'da' ? [] : prev.lignes }))
    if (mode === 'da') {
      setDaPhase('select-das')
      setDaAllLines([])
      setSelectedDaRefs(new Set())
      setDaItems([])
    }
  }

  // Phase 1 — sélection des DAs
  const allDAsSelected   = daGroups.length > 0 && daGroups.every((g) => selectedDaRefs.has(g.ref))
  const nSelectedDAs     = selectedDaRefs.size
  const toggleDA         = (ref: string) =>
    setSelectedDaRefs((prev) => { const n = new Set(prev); n.has(ref) ? n.delete(ref) : n.add(ref); return n })
  const toggleAllDAs     = () =>
    setSelectedDaRefs(allDAsSelected ? new Set() : new Set(daGroups.map((g) => g.ref)))

  // Phase 1 → Phase 2
  const handleViewLines = () => {
    const selectedLines = daAllLines.filter((l) => selectedDaRefs.has(l.demande_reference))
    setDaItems(selectedLines.map((l) => ({
      id:            l.id,
      article:       l.article,
      designation:   l.article_detail.designation,
      code:          l.article_detail.code,
      unite:         l.article_detail.unite_code,
      da_ref:        l.demande_reference,
      qte_demandee:  l.quantite,
      qte_commandee: l.quantite_commandee,
      qte_restante:  l.quantite_restante,
      qte_cmd:               String(l.quantite_restante),
      checked:               true,
      prix_unitaire_estime:  l.prix_unitaire_estime,
    })))
    setDaPhase('select-lines')
  }

  // Phase 2 — sélection des lignes
  const allLinesChecked = daItems.length > 0 && daItems.every((i) => i.checked)
  const nSelectedLines  = daItems.filter((i) => i.checked).length

  const toggleAllLines = () => setDaItems((items) => items.map((i) => ({ ...i, checked: !allLinesChecked })))
  const toggleLine     = (id: string) =>
    setDaItems((items) => items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)))
  const updateQtyCmd   = (id: string, val: string) =>
    setDaItems((items) => items.map((i) => (i.id === id ? { ...i, qte_cmd: val } : i)))

  // Phase 2 → Phase 3
  const handleImportDA = () => {
    const selected = daItems.filter((i) => i.checked && parseFloat(i.qte_cmd) > 0)
    if (selected.length === 0) { toast.error('Sélectionnez au moins une ligne avec une quantité valide'); return }
    setForm((prev) => ({
      ...prev,
      lignes: selected.map((i) => ({
        article:            i.article,
        article_label:      i.designation,
        unite:              i.unite,
        quantite_commandee: i.qte_cmd,
        prix_unitaire:      i.prix_unitaire_estime ? String(i.prix_unitaire_estime) : '',
        ligne_da_id:        i.id,
        da_ref:             i.da_ref,
      })),
    }))
    setDaPhase('form')
  }

  // Phase 3 — formulaire manuel
  const setField = (field: keyof BCForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const updateLigne = (idx: number, field: keyof LigneBCForm, val: string) =>
    setForm((prev) => {
      const lignes = [...prev.lignes]; lignes[idx] = { ...lignes[idx], [field]: val }; return { ...prev, lignes }
    })

  const setArticle = (idx: number, articleId: string) => {
    const art = articles.find((a) => a.id === articleId)
    setForm((prev) => {
      const lignes = [...prev.lignes]
      lignes[idx] = {
        ...lignes[idx],
        article:       articleId,
        article_label: art?.designation ?? '',
        unite:         art?.unite_code ?? '',
        prix_unitaire: art?.prix_standard ? String(art.prix_standard) : lignes[idx].prix_unitaire,
      }
      return { ...prev, lignes }
    })
  }

  const addLigne    = () => setForm((prev) => ({ ...prev, lignes: [...prev.lignes, EMPTY_LIGNE()] }))
  const removeLigne = (idx: number) => setForm((prev) => ({ ...prev, lignes: prev.lignes.filter((_, i) => i !== idx) }))

  // ── Handlers conditions ───────────────────────────────────────────────────

  const mkPending = (cond: ConditionTarifaire): PendingCondition => ({
    tempId:      crypto.randomUUID(),
    conditionId: cond.id,
    nom:         cond.nom,
    mode_calcul: cond.mode_calcul,
    type_effet:  cond.type_effet,
    valeur:      String(cond.valeur_defaut),
  })

  const addBCCond = (cond: ConditionTarifaire) =>
    setForm(prev => ({ ...prev, bcConditions: [...prev.bcConditions, mkPending(cond)] }))
  const removeBCCond = (tempId: string) =>
    setForm(prev => ({ ...prev, bcConditions: prev.bcConditions.filter(c => c.tempId !== tempId) }))
  const updateBCCondVal = (tempId: string, val: string) =>
    setForm(prev => ({ ...prev, bcConditions: prev.bcConditions.map(c => c.tempId === tempId ? { ...c, valeur: val } : c) }))

  const addLineCond = (idx: number, cond: ConditionTarifaire) =>
    setForm(prev => {
      const lignes = [...prev.lignes]
      lignes[idx] = { ...lignes[idx], conditions: [...lignes[idx].conditions, mkPending(cond)] }
      return { ...prev, lignes }
    })
  const removeLineCond = (lineIdx: number, tempId: string) =>
    setForm(prev => {
      const lignes = [...prev.lignes]
      lignes[lineIdx] = { ...lignes[lineIdx], conditions: lignes[lineIdx].conditions.filter(c => c.tempId !== tempId) }
      return { ...prev, lignes }
    })
  const updateLineCondVal = (lineIdx: number, tempId: string, val: string) =>
    setForm(prev => {
      const lignes = [...prev.lignes]
      lignes[lineIdx] = { ...lignes[lineIdx], conditions: lignes[lineIdx].conditions.map(c => c.tempId === tempId ? { ...c, valeur: val } : c) }
      return { ...prev, lignes }
    })

  // ── Totaux temps réel ─────────────────────────────────────────────────────

  const totalHT = form.lignes.reduce((acc, l) => {
    const ht = (parseFloat(l.quantite_commandee) || 0) * (parseFloat(l.prix_unitaire) || 0)
    return acc + applyConditions(ht, l.conditions)
  }, 0)

  const totalTTC = applyConditions(totalHT, form.bcConditions)

  // ── Mutation création (BC + conditions chaînées) ──────────────────────────

  const { mutate: doCreate, isPending: creating } = useMutation({
    mutationFn: async () => {
      const bcRes = await logistiqueApi.createBonCommande({
        fournisseur:         form.fournisseur,
        date_commande:       form.date_commande,
        date_livraison_prev: form.date_livraison_prev || null,
        adresse_livraison:   form.adresse_livraison,
        notes:               form.notes,
        lignes: form.lignes.map((l) => ({
          article:            l.article,
          quantite_commandee: parseFloat(l.quantite_commandee),
          prix_unitaire:      parseFloat(l.prix_unitaire) || 0,
          ...(l.ligne_da_id ? { ligne_da_id: l.ligne_da_id } : {}),
        })),
      })
      const bc = bcRes.data
      const promises: Promise<any>[] = []
      // Conditions BC
      form.bcConditions.forEach((c, i) =>
        promises.push(logistiqueApi.createConditionBC({
          condition: c.conditionId, bon_commande: bc.id,
          ordre: i + 1, valeur: parseFloat(c.valeur) || 0,
        }))
      )
      // Conditions par ligne (bc.lignes est ordonné comme form.lignes)
      bc.lignes.forEach((ligne: any, idx: number) => {
        ;(form.lignes[idx]?.conditions ?? []).forEach((c, ci) =>
          promises.push(logistiqueApi.createConditionBC({
            condition: c.conditionId, ligne_bc: ligne.id,
            ordre: ci + 1, valeur: parseFloat(c.valeur) || 0,
          }))
        )
      })
      await Promise.all(promises)
      return bc
    },
    onSuccess: (bc) => {
      toast.success('Bon de commande créé.')
      onCreated(bc.id)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la création'),
  })

  const handleSubmit = () => {
    if (!form.fournisseur)   { toast.error('Sélectionnez un fournisseur'); return }
    if (!form.date_commande) { toast.error('La date de commande est obligatoire'); return }
    if (!form.lignes.length) { toast.error('Ajoutez au moins une ligne'); return }
    for (const l of form.lignes) {
      if (!l.article)                              { toast.error('Sélectionnez un article pour chaque ligne'); return }
      if (!(parseFloat(l.quantite_commandee) > 0)) { toast.error('Quantité invalide sur une ligne'); return }
    }
    doCreate()
  }

  // ── Visibilité des phases ──────────────────────────────────────────────────

  const showDAPhase1 = mode === 'da' && daPhase === 'select-das'
  const showDAPhase2 = mode === 'da' && daPhase === 'select-lines'
  const showForm     = mode === 'manuel' || daPhase === 'form'

  // ── Render ─────────────────────────────────────────────────────────────────

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
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-dim)' }}
            >
              {mode === 'da'
                ? <ClipboardList size={16} style={{ color: 'var(--accent)' }} />
                : <ShoppingCart  size={16} style={{ color: 'var(--accent)' }} />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouveau bon de commande</h3>
              <p className="text-xs text-[--text-muted] mt-0.5">
                {mode === 'da' ? <DAStepBar phase={daPhase} /> : 'Renseignez le fournisseur et les articles'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1">
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* Mode toggle — même pattern que la création de facture */}
            <div
              className="flex p-1 gap-1 rounded-lg"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              {([
                { value: 'manuel' as BCMode, label: 'BC manuel',    Icon: ShoppingCart  },
                { value: 'da'     as BCMode, label: 'Depuis DA(s)', Icon: ClipboardList },
              ] as const).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={mode === 'da' && daPhase === 'form'}
                  onClick={() => handleModeChange(value)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition-all duration-150 disabled:cursor-not-allowed"
                  style={
                    mode === value
                      ? { backgroundColor: 'var(--bg-surface)', color: 'var(--accent)', border: '1px solid var(--accent)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                      : { backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' }
                  }
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            {/* ══ PHASE 1 — Choisir les DA ══════════════════════════════════ */}
            {showDAPhase1 && (
              <>
                {/* Fournisseur */}
                <div>
                  <label className={FIELD_LABEL}>
                    Fournisseur <span style={{ color: 'var(--status-danger)' }}>*</span>
                    <span className="ml-1 normal-case font-normal text-[--text-muted]">
                      — filtre les DA par fournisseur suggéré
                    </span>
                  </label>
                  <select
                    className={SELECT_CLASS}
                    value={form.fournisseur}
                    onChange={(e) => handleFournisseurChange(e.target.value)}
                  >
                    <option value="">— Sélectionner un fournisseur —</option>
                    {fournisseurs.map((f) => (
                      <option key={f.id} value={f.id}>{f.raison_sociale} ({f.code})</option>
                    ))}
                  </select>
                </div>

                <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

                {/* Titre */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">
                    Demandes d'achat approuvées
                    {daGroups.length > 0 && (
                      <span className="ml-2 normal-case font-normal">
                        — {daGroups.length} DA{daGroups.length > 1 ? 's' : ''} disponible{daGroups.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                  {nSelectedDAs > 0 && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                    >
                      {nSelectedDAs} DA{nSelectedDAs > 1 ? 's' : ''} sélectionnée{nSelectedDAs > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Liste des DAs */}
                {!form.fournisseur ? (
                  <EmptyHint icon={<ClipboardList size={28} />}>
                    Sélectionnez un fournisseur pour afficher les DA disponibles
                  </EmptyHint>
                ) : loadingDA ? (
                  <SkeletonRows n={3} />
                ) : daIsError ? (
                  <DAErrorBanner
                    error={daError}
                    onRetry={() => refetchDA()}
                  />
                ) : daGroups.length === 0 ? (
                  <DAEmptyState fournisseurNom={fournisseurs.find(f => f.id === form.fournisseur)?.raison_sociale} />
                ) : (
                  <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <th className="px-3 py-2.5 w-8">
                            <input
                              type="checkbox"
                              checked={allDAsSelected}
                              onChange={toggleAllDAs}
                              title="Tout sélectionner"
                              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                            />
                          </th>
                          <th className="px-3 py-2.5 text-left font-semibold text-[--text-muted]">Référence DA</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-[--text-muted]">Lignes disponibles</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-[--text-muted]">Aperçu articles</th>
                        </tr>
                      </thead>
                      <tbody>
                        {daGroups.map((group) => {
                          const isSelected = selectedDaRefs.has(group.ref)
                          const preview    = group.lines.slice(0, 2).map((l) => l.article_detail.designation)
                          const more       = group.lines.length - 2
                          return (
                            <tr
                              key={group.ref}
                              onClick={() => toggleDA(group.ref)}
                              style={{
                                borderBottom: '1px solid var(--border-subtle)',
                                cursor: 'pointer',
                              }}
                              className={cn(
                                'transition-colors',
                                isSelected ? 'bg-[--accent-dim]/40' : 'hover:bg-[--bg-elevated]',
                              )}
                            >
                              {/* Checkbox */}
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleDA(group.ref)}
                                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                />
                              </td>

                              {/* Réf DA */}
                              <td className="px-3 py-3">
                                <span
                                  className="font-data text-sm font-bold"
                                  style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
                                >
                                  {group.ref}
                                </span>
                              </td>

                              {/* Nb lignes */}
                              <td className="px-3 py-3 text-right">
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                  style={{
                                    backgroundColor: isSelected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                                    color:           isSelected ? 'var(--accent)'     : 'var(--text-secondary)',
                                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                  }}
                                >
                                  {group.nbLignes} ligne{group.nbLignes > 1 ? 's' : ''}
                                </span>
                              </td>

                              {/* Aperçu */}
                              <td className="px-3 py-3 text-right">
                                <span className="text-[--text-muted] text-[10px]">
                                  {preview.join(', ')}
                                  {more > 0 && ` +${more} autre${more > 1 ? 's' : ''}`}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ══ PHASE 2 — Sélectionner les lignes ════════════════════════ */}
            {showDAPhase2 && (
              <>
                {/* Récap DAs sélectionnées */}
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }}
                >
                  <ClipboardList size={12} style={{ color: 'var(--accent)' }} />
                  <span style={{ color: 'var(--accent)' }}>
                    <strong>{nSelectedDAs} DA{nSelectedDAs > 1 ? 's' : ''}</strong> sélectionnée{nSelectedDAs > 1 ? 's' : ''} —{' '}
                    {[...selectedDaRefs].join(', ')}
                  </span>
                </div>

                {/* Titre */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">
                    Lignes disponibles
                    <span className="ml-2 normal-case font-normal">
                      — {daItems.length} ligne{daItems.length > 1 ? 's' : ''}
                    </span>
                  </p>
                  {nSelectedLines > 0 && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                    >
                      {nSelectedLines} sélectionnée{nSelectedLines > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Table des lignes */}
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <th className="px-3 py-2.5 w-8">
                          <input
                            type="checkbox"
                            checked={allLinesChecked}
                            onChange={toggleAllLines}
                            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                          />
                        </th>
                        {['Article', 'Réf DA', 'Qté dem.', 'Déjà cmd', 'Restant', 'Qté à commander'].map((h) => (
                          <th
                            key={h}
                            className={cn(
                              'px-3 py-2.5 font-semibold text-[--text-muted]',
                              ['Qté dem.', 'Déjà cmd', 'Restant', 'Qté à commander'].includes(h) ? 'text-right' : 'text-left',
                            )}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {daItems.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => toggleLine(item.id)}
                          style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                          className={cn('transition-colors', item.checked ? 'bg-[--accent-dim]/40' : 'hover:bg-[--bg-elevated]')}
                        >
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => toggleLine(item.id)}
                              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-[--text-primary]">{item.designation}</p>
                            <span className="font-data text-[--accent] text-[10px]">{item.code}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-data text-[--text-secondary] text-[10px]">{item.da_ref}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-data text-[--text-secondary]">
                            {item.qte_demandee.toLocaleString('fr-TG')} {item.unite}
                          </td>
                          <td className="px-3 py-2.5 text-right font-data text-[--text-muted]">
                            {item.qte_commandee.toLocaleString('fr-TG')} {item.unite}
                          </td>
                          <td className="px-3 py-2.5 text-right font-data font-semibold" style={{ color: 'var(--status-success)' }}>
                            {item.qte_restante.toLocaleString('fr-TG')} {item.unite}
                          </td>
                          <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number" min={0.001} max={item.qte_restante} step="any"
                              value={item.qte_cmd}
                              disabled={!item.checked}
                              onChange={(e) => updateQtyCmd(item.id, e.target.value)}
                              className="font-data w-28 rounded px-2 text-right outline-none transition-all text-xs"
                              style={{
                                height: '28px',
                                backgroundColor: item.checked ? 'var(--bg-surface)' : 'transparent',
                                border: item.checked ? '1px solid var(--border)' : '1px solid transparent',
                                color: item.checked ? 'var(--text-primary)' : 'var(--text-muted)',
                                cursor: item.checked ? 'text' : 'default',
                              }}
                              onFocus={(e) => { if (item.checked) e.currentTarget.style.borderColor = 'var(--accent)' }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = item.checked ? 'var(--border)' : 'transparent' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ══ PHASE 3 / MANUEL — Formulaire BC ═════════════════════════ */}
            {showForm && (
              <>
                {/* Retour vers sélection (DA mode uniquement) */}
                {mode === 'da' && daPhase === 'form' && (
                  <button
                    onClick={() => { setDaPhase('select-lines'); setForm((prev) => ({ ...prev, lignes: [] })) }}
                    className="flex items-center gap-1 text-xs text-[--text-secondary] hover:text-[--accent] transition-colors self-start"
                  >
                    <ChevronLeft size={12} />
                    Modifier la sélection des lignes
                  </button>
                )}

                {/* Fournisseur + dates */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-3">
                    <label className={FIELD_LABEL}>
                      Fournisseur <span style={{ color: 'var(--status-danger)' }}>*</span>
                    </label>
                    {mode === 'da' && daPhase === 'form' ? (
                      <div
                        className="flex items-center gap-2 h-9 px-3 rounded text-xs"
                        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', opacity: 0.8 }}
                      >
                        <span className="font-medium text-[--text-primary]">
                          {fournisseurs.find((f) => f.id === form.fournisseur)?.raison_sociale ?? '—'}
                        </span>
                        <span className="font-data text-[--accent] text-[10px]">
                          ({fournisseurs.find((f) => f.id === form.fournisseur)?.code})
                        </span>
                      </div>
                    ) : (
                      <select
                        className={SELECT_CLASS}
                        value={form.fournisseur}
                        onChange={(e) => handleFournisseurChange(e.target.value)}
                      >
                        <option value="">— Sélectionner un fournisseur —</option>
                        {fournisseurs.map((f) => (
                          <option key={f.id} value={f.id}>{f.raison_sociale} ({f.code})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className={FIELD_LABEL}>
                      Date commande <span style={{ color: 'var(--status-danger)' }}>*</span>
                    </label>
                    <Input type="date" value={form.date_commande} onChange={setField('date_commande')} className="font-data" />
                  </div>

                  <div>
                    <label className={FIELD_LABEL}>Livraison prévue</label>
                    <Input type="date" value={form.date_livraison_prev} onChange={setField('date_livraison_prev')} className="font-data" />
                  </div>

                  <div>
                    <label className={FIELD_LABEL}>Notes</label>
                    <Input value={form.notes} onChange={setField('notes')} placeholder="Commentaire optionnel…" />
                  </div>

                  {/* Adresse de livraison (GAP 10) */}
                  <div className="col-span-3">
                    <label className={FIELD_LABEL}>
                      <span className="flex items-center gap-1.5">
                        <MapPin size={10} />
                        Adresse de livraison
                        <span className="normal-case font-normal text-[--text-muted]">— laisser vide pour l'adresse par défaut</span>
                      </span>
                    </label>
                    <textarea
                      rows={2}
                      value={form.adresse_livraison}
                      onChange={(e) => setForm((p) => ({ ...p, adresse_livraison: e.target.value }))}
                      placeholder="Ex : Zone Portuaire, Entrepôt B, Lomé"
                      className={cn(SELECT_CLASS, 'h-auto py-2 resize-none leading-relaxed')}
                    />
                  </div>
                </div>

                <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

                {/* ── Lignes de commande ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">
                      Lignes de commande
                      {mode === 'da' && (
                        <span className="ml-2 normal-case font-normal text-[--text-secondary]">— saisir le prix unitaire</span>
                      )}
                    </p>
                    {mode === 'manuel' && (
                      <button
                        onClick={addLigne}
                        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors"
                        style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-dim)', border: '1px solid var(--accent)' }}
                      >
                        <Plus size={12} /> Ajouter une ligne
                      </button>
                    )}
                  </div>

                  <div className="rounded-lg border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
                    <table className="text-xs" style={{ minWidth: mode === 'da' ? 920 : 820 }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <th className="px-3 py-2 text-left font-semibold text-[--text-muted]" style={{ minWidth: 160 }}>Article</th>
                          {mode === 'da' && <th className="px-3 py-2 text-left font-semibold text-[--text-muted]" style={{ width: 80 }}>Réf DA</th>}
                          <th className="px-3 py-2 text-left font-semibold text-[--text-muted]" style={{ width: 110 }}>Quantité</th>
                          <th className="px-3 py-2 text-left font-semibold text-[--text-muted]" style={{ width: 128 }}>Prix HT (FCFA)</th>
                          <th className="px-3 py-2 text-right font-semibold text-[--text-muted]" style={{ width: 100 }}>Total HT</th>
                          <th className="px-3 py-2 text-center font-semibold text-[--text-muted]" style={{ width: 72 }}>Cond.</th>
                          <th className="px-3 py-2 text-right font-semibold text-[--text-muted]" style={{ width: 100 }}>Net ligne</th>
                          <th className="px-3 py-2" style={{ width: 32 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {form.lignes.length === 0 ? (
                          <tr>
                            <td colSpan={mode === 'da' ? 8 : 7} className="px-4 py-6 text-center text-[--text-muted]">
                              Aucune ligne
                            </td>
                          </tr>
                        ) : form.lignes.map((l, idx) => {
                          const lineHT   = (parseFloat(l.quantite_commandee) || 0) * (parseFloat(l.prix_unitaire) || 0)
                          const lineNet  = applyConditions(lineHT, l.conditions)
                          const expanded = expandedLines.has(idx)
                          const colCount = mode === 'da' ? 8 : 7
                          const hasNet   = l.conditions.length > 0 && lineHT > 0
                          return (
                            <Fragment key={idx}>
                              <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)' }}>

                                {/* Article */}
                                <td className="px-3 py-2" style={{ minWidth: 160 }}>
                                  {mode === 'da' && l.ligne_da_id ? (
                                    <span className="font-medium text-[--text-primary]">{l.article_label}</span>
                                  ) : (
                                    <select
                                      className={SELECT_CLASS}
                                      style={{ height: 32, fontSize: 12 }}
                                      value={l.article}
                                      onChange={(e) => setArticle(idx, e.target.value)}
                                    >
                                      <option value="">— Sélectionner —</option>
                                      {articles.map((a) => (
                                        <option key={a.id} value={a.id}>{a.designation}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>

                                {/* Réf DA */}
                                {mode === 'da' && (
                                  <td className="px-3 py-2">
                                    {l.da_ref && (
                                      <span className="font-data text-[10px] px-1.5 py-0.5 rounded"
                                        style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                        {l.da_ref}
                                      </span>
                                    )}
                                  </td>
                                )}

                                {/* Quantité */}
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number" min={0.001} step="any"
                                      value={l.quantite_commandee}
                                      onChange={(e) => updateLigne(idx, 'quantite_commandee', e.target.value)}
                                      placeholder="0"
                                      className="font-data w-full rounded px-2 outline-none transition-all text-xs"
                                      style={{ height: 32, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                      onBlur={(e)  => (e.currentTarget.style.borderColor = 'var(--border)')}
                                    />
                                    {l.unite && <span className="text-[--text-muted] text-[10px] whitespace-nowrap">{l.unite}</span>}
                                  </div>
                                </td>

                                {/* Prix HT */}
                                <td className="px-3 py-2">
                                  <input
                                    type="number" min={0} step="any"
                                    value={l.prix_unitaire}
                                    onChange={(e) => updateLigne(idx, 'prix_unitaire', e.target.value)}
                                    placeholder="0"
                                    className="font-data w-full rounded px-2 outline-none transition-all text-xs"
                                    style={{
                                      height: 32,
                                      backgroundColor: !l.prix_unitaire && mode === 'da' ? 'var(--status-warning-bg, #fffbeb)' : 'var(--bg-elevated)',
                                      border: `1px solid ${!l.prix_unitaire && mode === 'da' ? 'var(--status-warning)' : 'var(--border)'}`,
                                      color: 'var(--text-primary)',
                                    }}
                                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                    onBlur={(e) => {
                                      e.currentTarget.style.borderColor = (!l.prix_unitaire && mode === 'da') ? 'var(--status-warning)' : 'var(--border)'
                                    }}
                                  />
                                </td>

                                {/* Total HT */}
                                <td className="px-3 py-2 text-right font-data font-semibold text-[--text-secondary] whitespace-nowrap">
                                  {lineHT > 0 ? formatXOF(lineHT) : '—'}
                                </td>

                                {/* Conditions toggle */}
                                <td className="px-2 py-2 text-center">
                                  <button
                                    onClick={() => toggleExpand(idx)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-all"
                                    style={{
                                      backgroundColor: l.conditions.length > 0 ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                                      color:           l.conditions.length > 0 ? 'var(--accent)'     : 'var(--text-muted)',
                                      border: `1px solid ${l.conditions.length > 0 ? 'var(--accent)' : 'var(--border)'}`,
                                    }}
                                  >
                                    <Plus size={9} />
                                    {l.conditions.length > 0 ? l.conditions.length : ''}
                                  </button>
                                </td>

                                {/* Net ligne */}
                                <td className="px-3 py-2 text-right font-data font-semibold whitespace-nowrap"
                                  style={{ color: hasNet ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                  {lineNet > 0 ? formatXOF(lineNet) : '—'}
                                </td>

                                {/* Supprimer */}
                                <td className="px-3 py-2">
                                  <button
                                    onClick={() => removeLigne(idx)}
                                    disabled={form.lignes.length === 1 && mode === 'manuel'}
                                    className="p-1 rounded transition-colors text-[--text-muted] hover:text-[--status-danger] hover:bg-[--status-danger-bg] disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>

                              {/* ── Expansion conditions de ligne ── */}
                              {expanded && (
                                <tr>
                                  <td colSpan={colCount} style={{ padding: 0, borderBottom: '1px solid var(--border-subtle)' }}>
                                    <div className="px-4 py-3 flex flex-col gap-2.5"
                                      style={{ backgroundColor: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)' }}>

                                      {/* Liste conditions existantes */}
                                      {l.conditions.length > 0 && (
                                        <div className="flex flex-col gap-1.5">
                                          {l.conditions.map((c) => (
                                            <div key={c.tempId} className="flex items-center gap-2">
                                              <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: c.type_effet === 'majoration' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)' }}>
                                                {c.type_effet === 'majoration'
                                                  ? <TrendingUp  size={11} style={{ color: 'var(--status-warning)' }} />
                                                  : <TrendingDown size={11} style={{ color: 'var(--status-success)' }} />}
                                              </div>
                                              <span className="text-xs font-medium text-[--text-primary] flex-1">{c.nom}</span>
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                <input
                                                  type="number" min={0} step="any"
                                                  value={c.valeur}
                                                  onChange={e => updateLineCondVal(idx, c.tempId, e.target.value)}
                                                  className="font-data w-20 rounded px-2 text-right text-xs outline-none"
                                                  style={{ height: 26, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                                  onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
                                                />
                                                <span className="text-[10px] text-[--text-muted] w-8">
                                                  {c.mode_calcul === 'pourcentage' ? '%' : 'FCFA'}
                                                </span>
                                              </div>
                                              <button
                                                onClick={() => removeLineCond(idx, c.tempId)}
                                                className="p-1 rounded text-[--text-muted] hover:text-[--status-danger] transition-colors flex-shrink-0"
                                              >
                                                <X size={12} />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Sélecteur ajout condition */}
                                      {ligneCatalog.length > 0 ? (
                                        <select
                                          className="self-start text-xs rounded px-2 outline-none"
                                          style={{ height: 28, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                          value={lineCondPick[idx] ?? ''}
                                          onChange={e => {
                                            const val = e.target.value
                                            if (!val) return
                                            const cond = ligneCatalog.find(c => c.id === val)
                                            if (cond) { addLineCond(idx, cond); setLineCondPick(prev => ({ ...prev, [idx]: '' })) }
                                          }}
                                        >
                                          <option value="">+ Ajouter une condition à cette ligne</option>
                                          {ligneCatalog.map(c => (
                                            <option key={c.id} value={c.id}>
                                              {c.nom} — {c.mode_calcul === 'pourcentage' ? `${c.valeur_defaut} %` : `${Number(c.valeur_defaut).toLocaleString('fr-FR')} FCFA`}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <p className="text-[10px] text-[--text-muted] italic">
                                          Aucune condition de ligne dans le catalogue.
                                        </p>
                                      )}

                                      {/* Net ligne récap */}
                                      {l.conditions.length > 0 && lineHT > 0 && (
                                        <div className="flex items-center justify-end gap-2 text-xs pt-1.5"
                                          style={{ borderTop: '1px solid var(--border)' }}>
                                          <span className="text-[--text-muted]">Net ligne après conditions :</span>
                                          <span className="font-data font-bold" style={{ color: 'var(--accent)' }}>
                                            {formatXOF(lineNet)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {mode === 'da' && form.lignes.some((l) => !l.prix_unitaire) && (
                    <p className="text-[10px] mt-2" style={{ color: 'var(--status-warning)' }}>
                      ⚠ Renseignez le prix unitaire pour chaque ligne avant de soumettre
                    </p>
                  )}
                </div>

                {/* ── Total HT ── */}
                {totalHT > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <span className="text-xs font-semibold text-[--text-secondary]">Total HT</span>
                    <span className="font-data text-sm font-bold text-[--text-primary]">{formatXOF(totalHT)}</span>
                  </div>
                )}

                {/* ── Conditions tarifaires du BC ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest flex items-center gap-1.5">
                      Conditions tarifaires du BC
                      {form.bcConditions.length > 0 && (
                        <span className="normal-case font-semibold px-1.5 py-0.5 rounded-full text-[9px]"
                          style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
                          {form.bcConditions.length}
                        </span>
                      )}
                    </p>
                  </div>

                  {form.bcConditions.length > 0 && (
                    <div className="rounded-lg overflow-hidden border mb-2" style={{ borderColor: 'var(--border)' }}>
                      {form.bcConditions.map((c, i) => (
                        <div key={c.tempId}
                          className="flex items-center gap-2 px-3 py-2"
                          style={{ borderBottom: i < form.bcConditions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                        >
                          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: c.type_effet === 'majoration' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)' }}>
                            {c.type_effet === 'majoration'
                              ? <TrendingUp  size={11} style={{ color: 'var(--status-warning)' }} />
                              : <TrendingDown size={11} style={{ color: 'var(--status-success)' }} />}
                          </div>
                          <span className="text-xs font-medium text-[--text-primary] flex-1 truncate">{c.nom}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <input
                              type="number" min={0} step="any"
                              value={c.valeur}
                              onChange={e => updateBCCondVal(c.tempId, e.target.value)}
                              className="font-data w-20 rounded px-2 text-right text-xs outline-none transition-all"
                              style={{ height: '28px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
                            />
                            <span className="text-[10px] text-[--text-muted] w-8">{c.mode_calcul === 'pourcentage' ? '%' : 'FCFA'}</span>
                          </div>
                          <button onClick={() => removeBCCond(c.tempId)} className="p-1 rounded text-[--text-muted] hover:text-[--status-danger] transition-colors flex-shrink-0">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {bcCatalog.length > 0 ? (
                    <select
                      className={SELECT_CLASS}
                      style={{ height: 34, fontSize: '12px' }}
                      value={bcCondPick}
                      onChange={e => {
                        const val = e.target.value
                        if (!val) return
                        const cond = bcCatalog.find(c => c.id === val)
                        if (cond) { addBCCond(cond); setBcCondPick('') }
                      }}
                    >
                      <option value="">+ Ajouter une condition au BC (TVA, frais…)</option>
                      {bcCatalog.filter(c => !form.bcConditions.some(bc => bc.conditionId === c.id)).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.nom} — {c.mode_calcul === 'pourcentage' ? `${c.valeur_defaut} %` : `${Number(c.valeur_defaut).toLocaleString('fr-FR')} FCFA`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[10px] text-[--text-muted] italic">
                      Aucune condition BC disponible — créez-en dans Administration › Conditions tarifaires.
                    </p>
                  )}
                </div>

                {/* ── Total TTC ── */}
                {totalHT > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 rounded-lg"
                    style={{ backgroundColor: 'var(--accent-dim)', border: '1px solid var(--accent)' }}>
                    <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Total TTC</span>
                    <span className="font-data text-sm font-bold" style={{ color: 'var(--accent)' }}>{formatXOF(totalTTC)}</span>
                  </div>
                )}
              </>
            )}

          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between gap-2 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Bouton gauche */}
          {showDAPhase2 ? (
            <button
              onClick={() => setDaPhase('select-das')}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded transition-colors text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated]"
            >
              <ChevronLeft size={12} />
              DA sélectionnées
            </button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          )}

          {/* Bouton droit */}
          {showDAPhase1 && (
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight size={13} />}
              disabled={nSelectedDAs === 0}
              onClick={handleViewLines}
            >
              Voir les lignes ({nSelectedDAs > 0
                ? daGroups.filter(g => selectedDaRefs.has(g.ref)).reduce((s, g) => s + g.nbLignes, 0)
                : 0})
            </Button>
          )}
          {showDAPhase2 && (
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight size={13} />}
              disabled={nSelectedLines === 0}
              onClick={handleImportDA}
            >
              Importer {nSelectedLines > 0 ? `${nSelectedLines} ligne${nSelectedLines > 1 ? 's' : ''}` : 'les lignes'}
            </Button>
          )}
          {showForm && (
            <Button variant="primary" size="sm" loading={creating} onClick={handleSubmit}>
              Créer le bon de commande
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function EmptyHint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-10 text-center border border-dashed"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex justify-center mb-2 text-[--text-muted]">{icon}</div>
      <p className="text-xs text-[--text-secondary]">{children}</p>
    </div>
  )
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton h-11 rounded" />
      ))}
    </div>
  )
}

/** Bannière d'erreur DA — affiche le message et propose de réessayer */
function DAErrorBanner({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const msg: string = (() => {
    const e = error as any
    if (e?.response?.data?.detail) return e.response.data.detail
    if (e?.response?.status === 403)  return "Accès refusé (403) — vérifiez vos permissions."
    if (e?.response?.status === 500)  return "Erreur serveur (500) — consultez les logs Django."
    if (e?.message)                   return e.message
    return "Impossible de charger les demandes d'achat."
  })()

  return (
    <div
      className="rounded-lg p-4 flex items-start gap-3 border"
      style={{ backgroundColor: 'var(--status-danger-bg, #fef2f2)', borderColor: 'var(--status-danger)' }}
    >
      <span className="text-lg mt-0.5 flex-shrink-0">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: 'var(--status-danger)' }}>
          Erreur lors du chargement des DA
        </p>
        <p className="text-xs mt-1 font-mono break-words" style={{ color: 'var(--status-danger)', opacity: 0.8 }}>
          {msg}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded transition-colors"
        style={{ backgroundColor: 'var(--status-danger)', color: '#fff' }}
      >
        Réessayer
      </button>
    </div>
  )
}

/** État vide DA — distingue "aucune DA globalement" de "aucune pour ce fournisseur" */
function DAEmptyState({ fournisseurNom }: { fournisseurNom?: string }) {
  return (
    <div
      className="rounded-lg p-8 text-center border border-dashed"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex justify-center mb-3 text-[--text-muted]">
        <ClipboardList size={28} />
      </div>
      <p className="text-sm font-medium text-[--text-secondary] mb-1">
        Aucune demande d'achat disponible
      </p>
      {fournisseurNom ? (
        <p className="text-xs text-[--text-muted] max-w-xs mx-auto">
          Aucune DA approuvée avec des lignes restantes pour{' '}
          <strong>{fournisseurNom}</strong>.
          <br className="mt-1" />
          <span className="mt-1 block">
            Les lignes dont le fournisseur suggéré est un autre fournisseur ne sont pas incluses.
          </span>
        </p>
      ) : (
        <p className="text-xs text-[--text-muted]">
          Aucune DA approuvée avec des lignes restantes dans le système.
        </p>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function BonCommandeList() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [filtre, setFiltre]         = useState<StatutBC | 'tous' | 'en_retard'>('tous')
  const [showCreate, setShowCreate] = useState(false)

  const params: Record<string, string> = {}
  if (search)                                        params.search = search
  if (filtre !== 'tous' && filtre !== 'en_retard')   params.statut = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['bons-commande', search, filtre],
    queryFn:  () => filtre === 'en_retard'
      ? logistiqueApi.listBCsEnRetard().then(r => r.data)
      : logistiqueApi.listBonsCommande(params).then(r => r.data),
  })

  const bcs      = data?.results ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ['bons-commande'] })


  const { mutate: envoyer, isPending: sending } = useMutation({
    mutationFn: (id: string) => logistiqueApi.envoyerBC(id),
    onSuccess:  () => { toast.success('BC marqué comme envoyé au fournisseur'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: confirmer } = useMutation({
    mutationFn: (id: string) => logistiqueApi.confirmerBC(id),
    onSuccess:  () => { toast.success('BC confirmé par le fournisseur'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const { mutate: annuler } = useMutation({
    mutationFn: (id: string) => logistiqueApi.annulerBC(id),
    onSuccess:  () => { toast.success('BC annulé'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  // GAP 4 — Clôture manuelle
  const { mutate: cloturer } = useMutation({
    mutationFn: (id: string) => logistiqueApi.cloturerBC(id, 'Reliquat définitivement abandonné'),
    onSuccess:  () => { toast.success('BC clôturé manuellement'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la clôture'),
  })

  // GAP 7 — Compteur BCs en retard
  const { data: enRetardData } = useQuery({
    queryKey: ['bcs-en-retard'],
    queryFn:  () => logistiqueApi.listBCsEnRetard(),
    select:   (r) => r.data.count,
    staleTime: 30_000,
  })
  const nbEnRetard = enRetardData ?? 0

  const handlePdf = (bc: BonCommande, e: React.MouseEvent) => {
    e.stopPropagation()
    logistiqueApi.exportPdfBC(bc.id)
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data as BlobPart], { type: 'application/pdf' }))
        const a = document.createElement('a')
        a.href = url; a.download = `BC_${bc.reference}.pdf`; a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('Erreur lors de la génération du PDF'))
  }

  return (
    <>
      {showCreate && (
        <CreateBCModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            invalidate()
            setShowCreate(false)
            navigate(`/logistique/bons-commande/${id}`)
          }}
        />
      )}

      <div className="flex flex-col h-full gap-4 animate-fade-in">

        {/* ── En-tête ── */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Bons de Commande</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">
              {data?.count ?? 0} bon{(data?.count ?? 0) > 1 ? 's' : ''} de commande
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Nouveau BC
          </Button>
        </div>

        {/* ── Table card ── */}
        <div className="surface overflow-hidden flex flex-col flex-1 min-h-0" style={{ boxShadow: 'var(--shadow-card)' }}>

        {/* ── Bannière BCs en retard (GAP 7) ── */}
        {nbEnRetard > 0 && (
          <div
            className="flex items-center justify-between gap-3 px-6 py-2.5 flex-shrink-0"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--status-warning, #f59e0b) 10%, transparent)',
              borderBottom: '1px solid color-mix(in srgb, var(--status-warning, #f59e0b) 30%, transparent)',
            }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} style={{ color: 'var(--status-warning, #f59e0b)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--status-warning, #f59e0b)' }}>
                {nbEnRetard} bon{nbEnRetard > 1 ? 's' : ''} de commande en retard de livraison
              </span>
            </div>
            <button
              onClick={() => setFiltre('en_retard')}
              className="text-[10px] font-medium px-2.5 py-1 rounded transition-colors"
              style={{ backgroundColor: 'var(--status-warning, #f59e0b)', color: '#fff' }}
            >
              Voir tout
            </button>
          </div>
        )}

        {/* ── Filtres ── */}
        <div
          className="flex flex-wrap items-center gap-3 px-6 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-64">
            <Input
              placeholder="Rechercher (ref, fournisseur)…"
              icon={<Search size={13} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Filter size={12} className="text-[--text-muted] mr-1" />
            {FILTRES_STATUT.map((f) => {
              const isRetard  = f.value === 'en_retard'
              const isActive  = filtre === f.value
              return (
                <button
                  key={f.value}
                  onClick={() => setFiltre(f.value)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all"
                  style={
                    isActive
                      ? isRetard
                        ? { backgroundColor: 'var(--status-warning)', border: '1px solid var(--status-warning)', color: '#fff', fontWeight: '600' }
                        : { backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: '600' }
                      : { backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                  }
                >
                  {f.label}
                </button>
              )
            })}
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
                {['Référence', 'Fournisseur', 'Date commande', 'Livraison prévue', 'Montant TTC', 'Statut', 'Actions'].map((h) => (
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
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-6 py-5">
                          <div className="skeleton h-4 rounded" style={{ width: `${50 + j * 7}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : bcs.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <ShoppingCart size={32} className="mx-auto mb-3 text-[--text-muted]" />
                      <p className="text-sm text-[--text-secondary]">Aucun bon de commande</p>
                    </td>
                  </tr>
                )
                : bcs.map((bc) => {
                    const config = STATUT_CONFIG[bc.statut] ?? { label: bc.statut_label, variant: 'neutral' as BadgeVariant }
                    return (
                        <tr
                          key={bc.id}
                          className="group hover:bg-[--bg-elevated] transition-colors"
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        >
                          <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => navigate(`/logistique/bons-commande/${bc.id}`)}
                                className="font-data text-xs font-bold text-[--accent] hover:underline cursor-pointer"
                              >
                                {bc.reference}
                              </button>
                              {/* GAP 6 — Badge version si amendé */}
                              {bc.version > 1 && (
                                <span
                                  className="font-data text-[9px] font-semibold px-1 py-0.5 rounded"
                                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                                >
                                  v{bc.version}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div>
                              <p className="text-xs font-semibold text-[--text-primary]">{bc.fournisseur_detail.raison_sociale}</p>
                              <span className="font-data text-[10px] text-[--text-muted]">{bc.fournisseur_detail.code}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="font-data text-xs text-[--text-secondary]">{formatDate(bc.date_commande)}</span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-data text-xs text-[--text-secondary]">
                                {bc.date_livraison_prev ? formatDate(bc.date_livraison_prev) : '—'}
                              </span>
                              {/* GAP 7 — Indicateur retard */}
                              {bc.est_en_retard && (
                                <span title="En retard de livraison">
                                  <AlertTriangle size={12} style={{ color: 'var(--status-warning, #f59e0b)' }} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="font-data text-sm font-bold text-[--text-primary]">{formatXOF(bc.montant_ttc)}</span>
                          </td>
                          <td className="px-6 py-5">
                            <Badge variant={config.variant}>{config.label}</Badge>
                          </td>
                          <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              {bc.statut === 'brouillon' && (
                                <button
                                  onClick={() => envoyer(bc.id)}
                                  disabled={sending}
                                  title="Envoyer au fournisseur"
                                  className="p-1.5 rounded hover:bg-[--accent-dim] text-[--accent] transition-colors"
                                >
                                  <Send size={13} />
                                </button>
                              )}
                              {bc.statut === 'envoye' && (
                                <button
                                  onClick={() => confirmer(bc.id)}
                                  title="Confirmé par le fournisseur"
                                  className="p-1.5 rounded hover:bg-[--accent-dim] text-[--accent] transition-colors"
                                >
                                  <CheckCircle2 size={13} />
                                </button>
                              )}
                              {(bc.statut === 'brouillon' || bc.statut === 'envoye' || bc.statut === 'confirme') && (
                                <button
                                  onClick={() => annuler(bc.id)}
                                  title="Annuler"
                                  className="p-1.5 rounded hover:bg-[--status-danger-bg] text-[--status-danger] transition-colors"
                                >
                                  <XCircle size={13} />
                                </button>
                              )}
                              {/* GAP 4 — Clôture manuelle (pour BCs partiellement reçus ou en attente) */}
                              {(bc.statut === 'envoye' || bc.statut === 'confirme' || bc.statut === 'partiel') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); cloturer(bc.id) }}
                                  title="Clôturer manuellement (reliquat abandonné)"
                                  className="p-1.5 rounded hover:bg-[--bg-elevated] transition-colors"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <Lock size={13} />
                                </button>
                              )}
                              <button
                                onClick={(e) => handlePdf(bc, e)}
                                title="Télécharger PDF"
                                className="p-1.5 rounded hover:bg-[--bg-elevated] text-[--text-muted] hover:text-[--text-primary] transition-colors"
                              >
                                <FileDown size={13} />
                              </button>
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
