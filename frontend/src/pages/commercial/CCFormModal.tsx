/**
 * MEPALE ERP — Modal CC (Commande Client)
 * Modes :
 *   - Création simple           : aucun prop optionnel
 *   - Création depuis un devis  : devisId + initialData
 *   - Modification brouillon    : commandeId + initialData
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardList, Plus, Trash2, X } from 'lucide-react'

import {
  commercialApi,
  type CommandeClientCreatePayload,
  type LigneCCCreatePayload,
} from '@/services/commercial'
import { productionApi, type Article } from '@/services/production'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// ─── Design tokens (copiés pour éviter import croisé) ────────────────────────

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LigneTmp {
  article:            string
  quantite_commandee: string
  prix_unitaire:      string
  remise_pct:         string
}

const EMPTY_LIGNE: LigneTmp = { article: '', quantite_commandee: '1', prix_unitaire: '0', remise_pct: '0' }

export interface InitialCCData {
  clientId?:        string
  dateLivraison?:   string
  condPaiement?:    string
  notesClient?:     string
  notesInternes?:   string
  referenceClient?: string
  lignes?:          LigneTmp[]
}

interface CCFormModalProps {
  commandeId?:  string        // défini → mode édition (PATCH)
  devisId?:     string        // défini → create avec lien devis (POST)
  initialData?: InitialCCData
  onClose:      () => void
  onSuccess:    (ccId: string) => void
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function CCFormModal({ commandeId, devisId, initialData, onClose, onSuccess }: CCFormModalProps) {
  const qc      = useQueryClient()
  const isEdit  = !!commandeId

  const [client,          setClient]      = useState(initialData?.clientId        ?? '')
  const [dateLivraison,   setDateLiv]     = useState(initialData?.dateLivraison   ?? '')
  const [condPaiement,    setCondPay]     = useState(initialData?.condPaiement    ?? '')
  const [notesClient,     setNotesClient] = useState(initialData?.notesClient     ?? '')
  const [notesInternes,   setNotesInt]    = useState(initialData?.notesInternes   ?? '')
  const [referenceClient, setRefClient]   = useState(initialData?.referenceClient ?? '')
  const [lignes,          setLignes]      = useState<LigneTmp[]>(
    initialData?.lignes?.length ? initialData.lignes : [{ ...EMPTY_LIGNE }]
  )

  const { data: articles } = useQuery({
    queryKey: ['articles-select'],
    queryFn:  () => productionApi.listArticles({ page_size: 200 }).then((r) => r.data.results),
  })

  const { data: clients } = useQuery({
    queryKey: ['clients-select'],
    queryFn:  () => commercialApi.listClients({ page_size: 200, statut: 'actif' }).then((r) => r.data.results),
    enabled:  !isEdit,
  })

  const setLigne = (i: number, field: keyof LigneTmp, val: string) =>
    setLignes((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)))

  const handleArticleChange = (i: number, articleId: string) => {
    setLigne(i, 'article', articleId)
    const art = articles?.find((a: Article) => a.id === articleId)
    if (art?.prix_standard) setLigne(i, 'prix_unitaire', String(art.prix_standard))
  }

  const buildPayload = (): CommandeClientCreatePayload | null => {
    if (!isEdit && !client) { toast.error('Sélectionnez un client'); return null }
    const lignesValides = lignes.filter((l) => l.article && Number(l.quantite_commandee) > 0)
    if (!lignesValides.length) { toast.error('Ajoutez au moins une ligne valide'); return null }

    const lignesPayload: LigneCCCreatePayload[] = lignesValides.map((l) => ({
      article:            l.article,
      quantite_commandee: Number(l.quantite_commandee),
      prix_unitaire:      Number(l.prix_unitaire),
      remise_pct:         Number(l.remise_pct) || undefined,
    }))

    return {
      client:                   client || initialData?.clientId!,
      devis:                    devisId,
      date_livraison_souhaitee: dateLivraison   || undefined,
      conditions_paiement:      condPaiement    || undefined,
      notes_client:             notesClient     || undefined,
      notes_internes:           notesInternes   || undefined,
      reference_client:         referenceClient || undefined,
      lignes:                   lignesPayload,
    }
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['commandes-client'] })
    if (commandeId) qc.invalidateQueries({ queryKey: ['commande-client', commandeId] })
  }

  const createMut = useMutation({
    mutationFn: (data: CommandeClientCreatePayload) => commercialApi.createCommandeClient(data),
    onSuccess:  (r) => {
      toast.success('Commande créée.')
      invalidate()
      onSuccess(r.data.id)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la création'),
  })

  const editMut = useMutation({
    mutationFn: (data: Partial<CommandeClientCreatePayload>) =>
      commercialApi.updateCommandeClient(commandeId!, data),
    onSuccess: (r) => {
      toast.success('Commande mise à jour.')
      invalidate()
      onSuccess(r.data.id)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur lors de la modification'),
  })

  const isPending = createMut.isPending || editMut.isPending

  const handleSubmit = () => {
    const payload = buildPayload()
    if (!payload) return
    if (isEdit) {
      editMut.mutate(payload)
    } else {
      createMut.mutate(payload)
    }
  }

  // ─── Titres ─────────────────────────────────────────────────────────────────

  const title    = isEdit ? 'Modifier la commande' : devisId ? 'Créer depuis le devis' : 'Nouvelle commande client'
  const subtitle = isEdit ? 'Modification en mode brouillon' : devisId ? 'Vérifiez et ajustez avant de créer' : 'Créez une nouvelle commande'
  const btnLabel = isEdit ? 'Enregistrer les modifications' : 'Créer la commande'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-3xl rounded-lg animate-scale-in flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
          maxHeight:       '90vh',
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
              <ClipboardList size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">{title}</h3>
              <p className="text-xs text-[--text-muted]">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Corps */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* Informations générales */}
            <div>
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest mb-3">
                Informations générales
              </p>
              <div className="grid grid-cols-2 gap-4">

                {/* Client — désactivé en édition */}
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>
                    Client {!isEdit && <span style={{ color: 'var(--status-danger)' }}>*</span>}
                  </label>
                  {isEdit ? (
                    <div
                      className="w-full rounded-lg text-sm px-3 py-2 border"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor:     'var(--border)',
                        color:           'var(--text-muted)',
                        height:          '36px',
                      }}
                    >
                      {initialData?.clientId ? '(client non modifiable)' : '—'}
                    </div>
                  ) : (
                    <select
                      className={SELECT_CLASS}
                      style={{ height: '36px' }}
                      value={client}
                      onChange={(e) => setClient(e.target.value)}
                    >
                      <option value="">— Sélectionner un client —</option>
                      {clients?.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} — {c.raison_sociale}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className={FIELD_LABEL}>Livraison souhaitée</label>
                  <Input type="date" value={dateLivraison} onChange={(e) => setDateLiv(e.target.value)} />
                </div>

                <div>
                  <label className={FIELD_LABEL}>Référence client</label>
                  <Input
                    value={referenceClient}
                    onChange={(e) => setRefClient(e.target.value)}
                    placeholder="Réf. commande client…"
                  />
                </div>

                <div>
                  <label className={FIELD_LABEL}>Conditions de paiement</label>
                  <Input
                    value={condPaiement}
                    onChange={(e) => setCondPay(e.target.value)}
                    placeholder="Ex : 30 jours net"
                  />
                </div>

                <div>
                  <label className={FIELD_LABEL}>Notes client</label>
                  <Input
                    value={notesClient}
                    onChange={(e) => setNotesClient(e.target.value)}
                    placeholder="Instructions particulières…"
                  />
                </div>

                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Notes internes</label>
                  <Input
                    value={notesInternes}
                    onChange={(e) => setNotesInt(e.target.value)}
                    placeholder="Visible uniquement en interne…"
                  />
                </div>
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            {/* Lignes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-widest">Lignes</p>
                <Button
                  variant="ghost" size="xs"
                  icon={<Plus size={11} />}
                  onClick={() => setLignes((p) => [...p, { ...EMPTY_LIGNE }])}
                >
                  Ajouter
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Article', 'Quantité', 'Prix unitaire', 'Remise %', ''].map((h) => (
                      <th
                        key={h}
                        className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-[--text-muted] text-left px-1"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="py-2 px-1">
                        <select
                          className={SELECT_CLASS}
                          style={{ height: '34px' }}
                          value={l.article}
                          onChange={(e) => handleArticleChange(i, e.target.value)}
                        >
                          <option value="">— Article —</option>
                          {articles?.map((a: Article) => (
                            <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-1 w-24">
                        <Input
                          type="number" min={0} step="0.001"
                          value={l.quantite_commandee}
                          onChange={(e) => setLigne(i, 'quantite_commandee', e.target.value)}
                          className="font-data"
                        />
                      </td>
                      <td className="py-2 px-1 w-32">
                        <Input
                          type="number" min={0} step="1"
                          value={l.prix_unitaire}
                          onChange={(e) => setLigne(i, 'prix_unitaire', e.target.value)}
                          className="font-data"
                        />
                      </td>
                      <td className="py-2 px-1 w-20">
                        <Input
                          type="number" min={0} max={100}
                          value={l.remise_pct}
                          onChange={(e) => setLigne(i, 'remise_pct', e.target.value)}
                          className="font-data"
                        />
                      </td>
                      <td className="py-2 px-1 w-8">
                        {lignes.length > 1 && (
                          <button
                            onClick={() => setLignes((p) => p.filter((_, idx) => idx !== i))}
                            className="p-1 rounded text-[--text-muted] hover:text-[--status-danger] transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pied */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>
            {btnLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
