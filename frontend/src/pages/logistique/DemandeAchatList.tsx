/**
 * MEPALE ERP — Demandes d'Achat (DA)
 * Workflow : Brouillon → Soumise → Approuvée → Traitée (BC émis)
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, ClipboardList, AlertTriangle, CheckCircle,
  XCircle, ShoppingCart, Trash2, ShieldCheck, X, Zap, Pencil, GitBranch,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge }  from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'
import { logistiqueApi, type DemandeAchat, type StatutDA } from '@/services/logistique'
import { productionApi } from '@/services/production'
import { ModalModifierDA } from './ModalModifierDA'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Config statuts ───────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutDA, { label: string; variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent' }> = {
  brouillon:         { label: 'Brouillon',         variant: 'neutral'  },
  soumise:           { label: 'Soumise',           variant: 'warning'  },
  approuvee:         { label: 'Approuvée',         variant: 'success'  },
  refusee:           { label: 'Refusée',           variant: 'danger'   },
  traitee:           { label: 'Traitée',           variant: 'info'     },
  attente_direction: { label: 'Attente direction', variant: 'accent'   },
}

// ─── Modal création DA ────────────────────────────────────────────────────────

type LigneForm = { article: string; quantite: string; prix: string }
type NewForm   = { urgence: boolean; notes: string; lignes: LigneForm[] }

function ModalCreateDA({
  onClose,
  onSave,
  isPending,
  articles,
}: {
  onClose:   () => void
  onSave:    (form: NewForm) => void
  isPending: boolean
  articles:  { id: string; designation: string; code: string; prix_standard?: number | null }[] | undefined
}) {
  const [form, setForm] = useState<NewForm>({
    urgence: false,
    notes:   '',
    lignes:  [{ article: '', quantite: '', prix: '' }],
  })

  const addLigne    = () => setForm(f => ({ ...f, lignes: [...f.lignes, { article: '', quantite: '', prix: '' }] }))
  const removeLigne = (i: number) => setForm(f => ({ ...f, lignes: f.lignes.filter((_, ii) => ii !== i) }))
  const setLigne    = (i: number, field: keyof LigneForm, val: string) =>
    setForm(f => ({ ...f, lignes: f.lignes.map((l, ii) => ii === i ? { ...l, [field]: val } : l) }))

  const lignesValides   = form.lignes.filter(l => l.article && parseFloat(l.quantite) > 0)
  const montantEstime   = lignesValides.reduce((acc, l) => {
    const p = parseFloat(l.prix); const q = parseFloat(l.quantite)
    return acc + (isNaN(p) || isNaN(q) ? 0 : p * q)
  }, 0)

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
              <ClipboardList size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Nouvelle demande d'achat</h3>
              <p className="text-xs text-[--text-muted] mt-0.5">
                {lignesValides.length > 0
                  ? `${lignesValides.length} article${lignesValides.length > 1 ? 's' : ''}${montantEstime > 0 ? ` · ${montantEstime.toLocaleString('fr-FR')} FCFA estimés` : ''}`
                  : 'Ajoutez les articles souhaités'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* Urgence toggle */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-all select-none"
              style={{
                backgroundColor: form.urgence ? 'rgba(239,68,68,0.06)' : 'var(--bg-elevated)',
                border:          `1px solid ${form.urgence ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
              }}
              onClick={() => setForm(f => ({ ...f, urgence: !f.urgence }))}
            >
              <div className="flex items-center gap-2.5">
                <Zap size={14} style={{ color: form.urgence ? 'var(--status-danger)' : 'var(--text-muted)' }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: form.urgence ? 'var(--status-danger)' : 'var(--text-primary)' }}>
                    Demande urgente
                  </p>
                  <p className="text-[10px] text-[--text-muted]">Priorité haute dans le circuit d'approbation</p>
                </div>
              </div>
              {/* Toggle switch */}
              <div
                className="w-8 h-4 rounded-full transition-all relative flex-shrink-0"
                style={{ backgroundColor: form.urgence ? 'var(--status-danger)' : 'var(--border)' }}
              >
                <div
                  className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all"
                  style={{ left: form.urgence ? '17px' : '2px' }}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={FIELD_LABEL}>
                Notes <span className="text-[--text-muted] normal-case font-normal">(optionnel)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Contexte, justification de la demande…"
                className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
              />
            </div>

            {/* Lignes articles */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className={FIELD_LABEL} style={{ marginBottom: 0 }}>
                  Articles <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <button
                  onClick={addLigne}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded transition-all"
                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                >
                  <Plus size={11} /> Ajouter
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {form.lignes.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                      style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                    >
                      {i + 1}
                    </span>
                    <select
                      value={l.article}
                      onChange={e => {
                        const articleId = e.target.value
                        const found = (articles ?? []).find(a => a.id === articleId)
                        setForm(f => ({
                          ...f,
                          lignes: f.lignes.map((ligne, ii) =>
                            ii === i
                              ? {
                                  ...ligne,
                                  article: articleId,
                                  prix: found?.prix_standard != null
                                    ? String(found.prix_standard)
                                    : '',
                                }
                              : ligne
                          ),
                        }))
                      }}
                      className={cn(SELECT_CLASS, 'flex-1')}
                      style={{ height: '32px', fontSize: '12px' }}
                    >
                      <option value="">— Choisir un article —</option>
                      {(articles ?? []).map(a => (
                        <option key={a.id} value={a.id}>{a.designation} ({a.code})</option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      value={l.quantite}
                      onChange={e => setLigne(i, 'quantite', e.target.value)}
                      placeholder="Qté"
                      min={0.001}
                      step="any"
                      className="w-20 font-data text-xs flex-shrink-0"
                    />
                    <Input
                      type="number"
                      value={l.prix}
                      onChange={e => setLigne(i, 'prix', e.target.value)}
                      placeholder="Prix unit."
                      min={0}
                      step="any"
                      title="Prix unitaire estimé (FCFA) — optionnel"
                      className="w-28 font-data text-xs flex-shrink-0"
                    />
                    {form.lignes.length > 1 && (
                      <button
                        onClick={() => removeLigne(i)}
                        className="p-1 rounded transition-colors flex-shrink-0 text-[--text-muted] hover:text-[--status-danger]"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
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
            onClick={() => onSave(form)}
            loading={isPending}
            disabled={lignesValides.length === 0}
          >
            Créer la DA
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal refus DA ───────────────────────────────────────────────────────────

function ModalRefuser({
  da,
  onClose,
  onConfirm,
  isPending,
}: {
  da:        DemandeAchat | null
  onClose:   () => void
  onConfirm: (motif: string) => void
  isPending: boolean
}) {
  const [motif, setMotif] = useState('')
  if (!da) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
        }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
              <XCircle size={15} style={{ color: 'var(--status-danger)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Refuser la demande</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{da.reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5">
          <label className={FIELD_LABEL}>
            Motif du refus <span style={{ color: 'var(--status-danger)' }}>*</span>
          </label>
          <textarea
            value={motif}
            onChange={e => setMotif(e.target.value)}
            rows={3}
            placeholder="Expliquez la raison du refus…"
            className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
            autoFocus
          />
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <button
            onClick={() => onConfirm(motif)}
            disabled={isPending || !motif.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--status-danger)', color: '#fff' }}
          >
            <XCircle size={12} />
            Refuser la DA
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal convertir en BC ────────────────────────────────────────────────────

function ModalConvertir({
  da,
  onClose,
  onConfirm,
  isPending,
  fournisseurs,
}: {
  da:           DemandeAchat | null
  onClose:      () => void
  onConfirm:    (fournisseurId: string) => void
  isPending:    boolean
  fournisseurs: { id: string; raison_sociale: string }[] | undefined
}) {
  const [fournisseurId, setFournisseurId] = useState('')

  if (!da) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl animate-scale-in flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
        }}
      >
        <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-dim)' }}>
              <ShoppingCart size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Convertir en bon de commande</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{da.reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <p className="text-xs text-[--text-secondary] leading-relaxed">
            Un Bon de Commande sera généré avec toutes les lignes de cette DA
            {' '}({da.lignes?.length ?? 0} article{(da.lignes?.length ?? 0) > 1 ? 's' : ''}).
          </p>
          <div>
            <label className={FIELD_LABEL}>
              Fournisseur <span style={{ color: 'var(--status-danger)' }}>*</span>
            </label>
            <select
              className={SELECT_CLASS}
              style={{ height: '36px' }}
              value={fournisseurId}
              onChange={(e) => setFournisseurId(e.target.value)}
            >
              <option value="">— Sélectionner un fournisseur approuvé —</option>
              {(fournisseurs ?? []).map(f => (
                <option key={f.id} value={f.id}>{f.raison_sociale}</option>
              ))}
            </select>
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary" size="sm"
            icon={<ShoppingCart size={13} />}
            onClick={() => {
              if (!fournisseurId) { toast.error('Veuillez sélectionner un fournisseur'); return }
              onConfirm(fournisseurId)
            }}
            loading={isPending}
          >
            Créer le BC
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function DemandeAchatList() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch]     = useState('')
  const [statut, setStatut]     = useState('')
  const [page, setPage]         = useState(1)
  const [showCreate, setShowCreate]   = useState(false)
  const [refuserDA, setRefuserDA]     = useState<DemandeAchat | null>(null)
  const [convertDA, setConvertDA]     = useState<DemandeAchat | null>(null)
  const [modifierDA, setModifierDA]   = useState<DemandeAchat | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['demandes-achat', search, statut, page],
    queryFn:  () => logistiqueApi.listDemandesAchat({ search: search || undefined, statut: statut || undefined, page }).then(r => r.data),
  })
  const { data: articles } = useQuery({
    queryKey: ['articles-list'],
    queryFn:  () => productionApi.listArticles({ page_size: 200 }).then(r => r.data.results),
  })
  const { data: fournisseurs } = useQuery({
    queryKey: ['fournisseurs-approuves'],
    queryFn:  () => logistiqueApi.listFournisseurs({ page_size: 200, qualification: 'approuve' }).then(r => r.data.results),
  })

  const onSuccess = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['demandes-achat'] }) }

  const { mutate: createDA, isPending: creating } = useMutation({
    mutationFn: (form: NewForm) => logistiqueApi.createDemandeAchat({
      urgence: form.urgence,
      notes:   form.notes,
      lignes:  form.lignes.filter(l => l.article && l.quantite).map(l => ({
        article:              l.article,
        quantite:             parseFloat(l.quantite),
        prix_unitaire_estime: l.prix ? parseFloat(l.prix) : null,
        notes:                '',
        fournisseur_suggere:  null,
      })) as never,
    }),
    onSuccess: () => { onSuccess('DA créée'); setShowCreate(false) },
    onError:   () => toast.error('Erreur lors de la création'),
  })

  const { mutate: soumettre } = useMutation({
    mutationFn: (id: string) => logistiqueApi.soumettreDA(id),
    onSuccess:  () => onSuccess('DA soumise pour approbation'),
    onError:    (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })
  const { mutate: approuver } = useMutation({
    mutationFn: (id: string) => logistiqueApi.approuverDA(id),
    onSuccess:  () => onSuccess('DA approuvée'),
    onError:    (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })
  const { mutate: refuser, isPending: refusing } = useMutation({
    mutationFn: (motif: string) => logistiqueApi.refuserDA(refuserDA!.id, motif),
    onSuccess:  () => { onSuccess('DA refusée'); setRefuserDA(null) },
    onError:    () => toast.error('Erreur'),
  })
  const { mutate: convertir, isPending: converting } = useMutation({
    mutationFn: (fournisseurId: string) => logistiqueApi.convertirEnBC(convertDA!.id, fournisseurId),
    onSuccess:  () => { onSuccess('DA convertie en BC'); setConvertDA(null) },
    onError:    (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la conversion'),
  })
  const { mutate: approuverDirection } = useMutation({
    mutationFn: (id: string) => logistiqueApi.approuverDirection(id),
    onSuccess:  () => onSuccess('DA approuvée par la Direction'),
    onError:    (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })
  const { mutate: reviser } = useMutation({
    mutationFn: (id: string) => logistiqueApi.reviserDA(id),
    onSuccess:  (res) => {
      onSuccess(`Nouvelle version ${res.data.reference} créée.`)
      navigate(`/logistique/demandes-achat/${res.data.id}`)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const das   = data?.results ?? []
  const pages = Math.ceil((data?.count ?? 0) / 25)

  return (
    <>
      {showCreate && (
        <ModalCreateDA
          onClose={() => setShowCreate(false)}
          onSave={(form) => createDA(form)}
          isPending={creating}
          articles={articles as any}
        />
      )}
      {modifierDA && (
        <ModalModifierDA
          da={modifierDA}
          onClose={() => setModifierDA(null)}
        />
      )}
      {refuserDA && (
        <ModalRefuser
          da={refuserDA}
          onClose={() => setRefuserDA(null)}
          onConfirm={(motif) => refuser(motif)}
          isPending={refusing}
        />
      )}
      {convertDA && (
        <ModalConvertir
          da={convertDA}
          onClose={() => setConvertDA(null)}
          onConfirm={(fournisseurId) => convertir(fournisseurId)}
          isPending={converting}
          fournisseurs={fournisseurs as any}
        />
      )}

      <div className="space-y-4 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Demandes d'Achat</h1>
            <p className="text-sm text-[--text-muted] mt-0.5">{data?.count ?? 0} demande{(data?.count ?? 0) > 1 ? 's' : ''}</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowCreate(true)}>Nouvelle DA</Button>
        </div>

        {/* Table card */}
        <div className="surface overflow-hidden">

        {/* Filtres */}
        <div
          className="flex flex-wrap gap-2 items-center px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-56">
            <Input placeholder="Rechercher…" icon={<Search size={13} />} value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <div className="flex gap-1">
            {(['', 'brouillon', 'soumise', 'attente_direction', 'approuvee', 'refusee', 'traitee'] as const).map(s => (
              <button key={s} onClick={() => { setStatut(s); setPage(1) }}
                className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                style={{
                  backgroundColor: statut === s ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  color:           statut === s ? 'var(--accent)' : 'var(--text-secondary)',
                  border:          `1px solid ${statut === s ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                {s === '' ? 'Tous' : STATUT_CFG[s]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  {['Référence', 'Statut', 'Urgence', 'Demandeur', 'Lignes', 'Montant estimé', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[--text-muted]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-6 py-5"><div className="skeleton h-3 rounded w-3/4" /></td>
                        ))}
                      </tr>
                    ))
                  : das.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <ClipboardList size={28} style={{ color: 'var(--text-muted)' }} />
                          <p className="text-sm text-[--text-muted]">Aucune demande d'achat trouvée</p>
                        </div>
                      </td>
                    </tr>
                  )
                  : das.map(da => {
                      const cfg = STATUT_CFG[da.statut]
                      return (
                        <tr key={da.id} className="transition-colors hover:bg-[--bg-elevated]"
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => navigate(`/logistique/demandes-achat/${da.id}`)}
                                className="font-data text-xs font-semibold hover:underline transition-all"
                                style={{ color: 'var(--accent)' }}
                              >
                                {da.reference}
                              </button>
                              {da.version > 1 && (
                                <span
                                  className="text-[9px] font-bold px-1 py-0.5 rounded font-data"
                                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                                >
                                  V{da.version}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5"><Badge variant={cfg.variant} dot>{cfg.label}</Badge></td>
                          <td className="px-4 py-2.5">
                            {da.urgence && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--status-danger)' }}>
                                <AlertTriangle size={10} /> Urgent
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[--text-secondary]">{da.demandeur_nom}</td>
                          <td className="px-4 py-2.5 text-xs font-data text-[--text-secondary]">{da.lignes?.length ?? 0} ligne(s)</td>
                          <td className="px-4 py-2.5">
                            {da.montant_estime != null
                              ? <span className={`font-data text-xs font-semibold ${da.montant_estime > 5_000_000 ? 'text-[--status-warning]' : 'text-[--text-primary]'}`}>
                                  {Number(da.montant_estime).toLocaleString('fr-FR')} FCFA
                                </span>
                              : <span className="text-xs text-[--text-muted]">—</span>
                            }
                          </td>
                          <td className="px-4 py-2.5 font-data text-xs text-[--text-muted]">{formatDate(da.date_creation)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {da.peut_etre_modifie && (
                                <button onClick={() => setModifierDA(da)} title="Modifier"
                                  className="p-1 rounded hover:opacity-70 transition-opacity text-[--text-secondary]">
                                  <Pencil size={13} />
                                </button>
                              )}
                              {da.statut === 'brouillon' && (
                                <button onClick={() => soumettre(da.id)} title="Soumettre"
                                  className="p-1 rounded hover:opacity-70 transition-opacity text-[--accent]">
                                  <CheckCircle size={13} />
                                </button>
                              )}
                              {da.statut === 'refusee' && (
                                <button onClick={() => reviser(da.id)} title="Nouvelle version"
                                  className="p-1 rounded hover:opacity-70 transition-opacity text-[--text-secondary]">
                                  <GitBranch size={13} />
                                </button>
                              )}
                              {da.statut === 'soumise' && (
                                <>
                                  <button onClick={() => approuver(da.id)} title="Approuver"
                                    className="p-1 rounded hover:opacity-70 transition-opacity text-green-400">
                                    <CheckCircle size={13} />
                                  </button>
                                  <button onClick={() => setRefuserDA(da)} title="Refuser"
                                    className="p-1 rounded hover:opacity-70 transition-opacity text-red-400">
                                    <XCircle size={13} />
                                  </button>
                                </>
                              )}
                              {da.statut === 'attente_direction' && (
                                <button onClick={() => approuverDirection(da.id)} title="Approuver (Direction)"
                                  className="p-1 rounded hover:opacity-70 transition-opacity text-[--accent]">
                                  <ShieldCheck size={13} />
                                </button>
                              )}
                              {da.statut === 'approuvee' && (
                                <button onClick={() => setConvertDA(da)} title="Convertir en BC"
                                  className="p-1 rounded hover:opacity-70 transition-opacity text-[--accent]">
                                  <ShoppingCart size={13} />
                                </button>
                              )}
                            </div>
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
