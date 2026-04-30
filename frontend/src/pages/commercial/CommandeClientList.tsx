/**
 * MEPALE ERP — Commandes Client
 * Liste + filtres + créer / créer depuis devis / confirmer / annuler / voir détail
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search, Plus, ClipboardList, Filter, MoreHorizontal, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, FileText, X, Loader2,
} from 'lucide-react'

import {
  commercialApi,
  type CommandeClientList as CCListType,
  type DevisList,
  type StatutCC,
  type StatutDevis,
} from '@/services/commercial'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn, formatDate, formatXOF } from '@/lib/utils'
import { CCFormModal, type InitialCCData } from './CCFormModal'

// ─── Statut config CC ─────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutCC, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon:            { variant: 'neutral', label: 'Brouillon'     },
  confirmee:            { variant: 'accent',  label: 'Confirmée'     },
  en_cours_livraison:   { variant: 'warning', label: 'En livraison'  },
  partiellement_livree: { variant: 'info',    label: 'Part. livrée'  },
  livree:               { variant: 'success', label: 'Livrée'        },
  annulee:              { variant: 'danger',  label: 'Annulée'       },
}

const STATUT_DEVIS_CFG: Record<StatutDevis, { variant: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent'; label: string }> = {
  brouillon: { variant: 'neutral', label: 'Brouillon' },
  envoye:    { variant: 'accent',  label: 'Envoyé'    },
  accepte:   { variant: 'success', label: 'Accepté'   },
  refuse:    { variant: 'danger',  label: 'Refusé'    },
  expire:    { variant: 'neutral', label: 'Expiré'    },
}

// ─── Modal sélection de devis ─────────────────────────────────────────────────

function DevisPickerModal({
  onClose,
  onSelect,
  isLoading,
}: {
  onClose:   () => void
  onSelect:  (devisId: string) => void
  isLoading: boolean
}) {
  const [search, setSearch] = useState('')

  const CONVERTIBLE = new Set(['accepte'])

  const { data: devisList } = useQuery({
    queryKey: ['devis-picker', search],
    queryFn:  () => commercialApi.listDevis({
      page_size: 100,
      search:    search || undefined,
    }).then((r) => r.data.results.filter((d) => CONVERTIBLE.has(d.statut))),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-2xl rounded-lg animate-scale-in flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
          maxHeight:       '80vh',
        }}
      >
        {/* En-tête */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-dim)' }}
            >
              <FileText size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Créer depuis un devis</h3>
              <p className="text-xs text-[--text-muted]">Sélectionnez un devis à convertir en commande</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Recherche */}
        <div className="px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Input
            placeholder="Référence, client…"
            icon={<Search size={13} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {!devisList ? (
            <div className="flex items-center justify-center py-12 text-[--text-muted]">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : devisList.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FileText size={28} className="mx-auto mb-2 text-[--text-muted]" />
              <p className="text-sm text-[--text-secondary]">Aucun devis accepté trouvé</p>
              <p className="text-xs text-[--text-muted] mt-1">Seuls les devis acceptés peuvent être convertis en commande.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  {['Référence', 'Client', 'Montant HT', 'Date', 'Statut'].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devisList.map((d: DevisList) => (
                  <tr
                    key={d.id}
                    className="hover:bg-[--bg-elevated] transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onClick={() => !isLoading && onSelect(d.id)}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-data text-xs font-semibold text-[--accent]">{d.reference}</span>
                      {d.version > 1 && (
                        <span className="ml-1.5 text-[10px] text-[--text-muted] font-data">v{d.version}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-[--text-primary]">{d.client_nom}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-data text-xs font-semibold">{formatXOF(Number(d.montant_ht))}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-[--text-secondary]">{formatDate(d.date_devis)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={STATUT_DEVIS_CFG[d.statut].variant}>{STATUT_DEVIS_CFG[d.statut].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pied */}
        <div
          className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Menu actions ─────────────────────────────────────────────────────────────

function ActionMenu({
  cc,
  onView,
  onConfirmer,
  onAnnuler,
}: {
  cc:          CCListType
  onView:      () => void
  onConfirmer: () => void
  onAnnuler:   () => void
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current)
      setRect(btnRef.current.getBoundingClientRect())
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

  const dropdown = rect && open && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
      <div
        className="rounded-md py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position:        'fixed',
          top:    rect.bottom + 200 < window.innerHeight ? rect.bottom + 4 : undefined,
          bottom: rect.bottom + 200 < window.innerHeight ? undefined : window.innerHeight - rect.top + 4,
          left:            rect.right - 176,
          width:           176,
          zIndex:          9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {item('Voir le détail', <ExternalLink size={13} style={{ color: 'var(--accent)' }} />, onView)}
        {!['livree', 'annulee'].includes(cc.statut) && (
          <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
        )}
        {cc.statut === 'brouillon' && item('Confirmer', <CheckCircle2 size={13} style={{ color: 'var(--status-success)' }} />, onConfirmer)}
        {!['livree', 'annulee'].includes(cc.statut) && item('Annuler', <XCircle size={13} />, onAnnuler, true)}
      </div>
    </>,
    document.body
  )

  return (
    <>
      {dropdown}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="w-7 h-7 rounded flex items-center justify-center text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-all"
      >
        <MoreHorizontal size={14} />
      </button>
    </>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

type FiltreStatut = 'tous' | StatutCC

const FILTRES: { label: string; value: FiltreStatut }[] = [
  { label: 'Toutes',       value: 'tous'                },
  { label: 'Brouillon',    value: 'brouillon'           },
  { label: 'Confirmées',   value: 'confirmee'           },
  { label: 'En livraison', value: 'en_cours_livraison'  },
  { label: 'Livrées',      value: 'livree'              },
  { label: 'Annulées',     value: 'annulee'             },
]

export function CommandeClientList() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [search, setSearch]       = useState('')
  const [filtre, setFiltre]       = useState<FiltreStatut>('tous')
  const [showModal, setShowModal] = useState(false)
  const [showDevisPicker, setShowDevisPicker]   = useState(false)
  const [devisCC, setDevisCC] = useState<{ devisId: string; initialData: InitialCCData } | null>(null)
  const [fetchingDevis, setFetchingDevis] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['commandes-client'] })

  const params: Record<string, string> = {}
  if (search)            params.search = search
  if (filtre !== 'tous') params.statut = filtre

  const { data, isLoading } = useQuery({
    queryKey: ['commandes-client', search, filtre],
    queryFn:  () => commercialApi.listCommandesClient(params),
    select:   (r) => r.data,
  })

  const confirmerMut = useMutation({
    mutationFn: (id: string) => commercialApi.confirmerCommande(id),
    onSuccess:  (r) => {
      if (!r.data.tout_disponible) {
        toast.warning(`Commande confirmée avec ${r.data.warnings.length} alerte(s) stock.`)
      } else {
        toast.success('Commande confirmée.')
      }
      invalidate()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const annulerMut = useMutation({
    mutationFn: (id: string) => commercialApi.annulerCommande(id),
    onSuccess:  () => { toast.success('Commande annulée.'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
  })

  const handleDevisSelected = async (devisId: string) => {
    setFetchingDevis(true)
    try {
      const { data: devis } = await commercialApi.getDevis(devisId)
      setDevisCC({
        devisId: devis.id,
        initialData: {
          clientId:        devis.client,
          dateLivraison:   '',
          condPaiement:    '',
          notesClient:     devis.notes_client ?? '',
          notesInternes:   devis.notes_internes ?? '',
          referenceClient: devis.reference_client ?? '',
          lignes: devis.lignes.map((l) => ({
            article:            l.article,
            quantite_commandee: l.quantite,
            prix_unitaire:      l.prix_unitaire,
            remise_pct:         l.remise_pct,
          })),
        },
      })
      setShowDevisPicker(false)
    } catch {
      toast.error('Impossible de charger le devis.')
    } finally {
      setFetchingDevis(false)
    }
  }

  const commandes = data?.results ?? []

  return (
    <>
      {showModal && (
        <CCFormModal
          onClose={() => setShowModal(false)}
          onSuccess={(id) => { setShowModal(false); navigate(`/commercial/commandes/${id}`) }}
        />
      )}
      {showDevisPicker && (
        <DevisPickerModal
          onClose={() => setShowDevisPicker(false)}
          onSelect={handleDevisSelected}
          isLoading={fetchingDevis}
        />
      )}
      {devisCC && (
        <CCFormModal
          devisId={devisCC.devisId}
          initialData={devisCC.initialData}
          onClose={() => setDevisCC(null)}
          onSuccess={(id) => { setDevisCC(null); navigate(`/commercial/commandes/${id}`) }}
        />
      )}

      <div className="space-y-5 animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">Commandes client</h1>
            <p className="text-xs text-[--text-muted] mt-0.5">{data?.count ?? 0} commande{(data?.count ?? 0) > 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary" size="sm"
              icon={<FileText size={13} />}
              onClick={() => setShowDevisPicker(true)}
            >
              Depuis un devis
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>
              Nouvelle commande
            </Button>
          </div>
        </div>

        {/* Table card */}
        <div className="surface overflow-hidden">

        {/* Filtres */}
        <div
          className="flex items-center gap-3 px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="w-64">
            <Input
              placeholder="Référence, client…"
              icon={<Search size={13} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-[--text-muted] mr-1" />
            {FILTRES.map((f) => (
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
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left" style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
              {['Référence', 'Client', 'Commercial', 'Montant HT', 'Date', 'Livraison souhaitée', 'Stock', 'Statut', ''].map((h) => (
                <th key={h} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[--text-muted] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-6 py-5">
                        <div className="skeleton h-4 rounded" style={{ width: `${50 + j * 5}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : commandes.length === 0
              ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <ClipboardList size={32} className="mx-auto mb-3 text-[--text-muted]" />
                    <p className="text-sm text-[--text-secondary]">Aucune commande trouvée</p>
                  </td>
                </tr>
              )
              : commandes.map((cc) => (
                <tr
                  key={cc.id}
                  className="group hover:bg-[--bg-elevated] transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onClick={() => navigate(`/commercial/commandes/${cc.id}`)}
                >
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold text-[--accent]">{cc.reference}</span>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs font-medium text-[--text-primary]">{cc.client_nom}</p>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{cc.commercial_nom ?? '—'}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-data text-xs font-semibold">{formatXOF(Number(cc.montant_ht))}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">{formatDate(cc.date_commande)}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-[--text-secondary]">
                      {cc.date_livraison_souhaitee ? formatDate(cc.date_livraison_souhaitee) : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    {cc.stock_warning ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--status-warning)' }}>
                        <AlertTriangle size={11} />Alerte
                      </span>
                    ) : (
                      <span className="text-xs text-[--text-muted]">OK</span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <Badge variant={STATUT_CFG[cc.statut].variant}>{STATUT_CFG[cc.statut].label}</Badge>
                  </td>
                  <td className="px-6 py-5">
                    <ActionMenu
                      cc={cc}
                      onView={() => navigate(`/commercial/commandes/${cc.id}`)}
                      onConfirmer={() => confirmerMut.mutate(cc.id)}
                      onAnnuler={() => annulerMut.mutate(cc.id)}
                    />
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
        </div>
      </div>
    </>
  )
}
