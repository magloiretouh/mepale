import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardList, Plus, Trash2, X, Zap, Save } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { cn }     from '@/lib/utils'
import {
  logistiqueApi,
  type DemandeAchat,
} from '@/services/logistique'
import { productionApi } from '@/services/production'

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

type LigneForm = { id?: string; article: string; quantite: string; prix: string }

export function ModalModifierDA({
  da,
  onClose,
}: {
  da:      DemandeAchat
  onClose: () => void
}) {
  const qc = useQueryClient()

  const [urgence, setUrgence] = useState(da.urgence)
  const [notes,   setNotes]   = useState(da.notes ?? '')
  const [lignes,  setLignes]  = useState<LigneForm[]>(() =>
    da.lignes.map(l => ({
      id:       l.id,
      article:  l.article,
      quantite: String(l.quantite),
      prix:     l.prix_unitaire_estime != null ? String(l.prix_unitaire_estime) : '',
    }))
  )

  const { data: articles } = useQuery({
    queryKey: ['articles-list'],
    queryFn:  () => productionApi.listArticles({ page_size: 500 }).then(r =>
      Array.isArray(r.data) ? r.data : (r.data as any).results ?? []
    ),
    staleTime: 5 * 60 * 1000,
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => logistiqueApi.updateDemandeAchat(da.id, {
      urgence,
      notes,
      lignes: lignes
        .filter(l => l.article && parseFloat(l.quantite) > 0)
        .map(l => ({
          ...(l.id ? { id: l.id } : {}),
          article:              l.article,
          quantite:             parseFloat(l.quantite),
          prix_unitaire_estime: l.prix ? parseFloat(l.prix) : null,
        })),
    }),
    onSuccess: () => {
      toast.success(`DA ${da.reference} modifiée.`)
      qc.invalidateQueries({ queryKey: ['demandes-achat'] })
      qc.invalidateQueries({ queryKey: ['demande-achat', da.id] })
      onClose()
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la modification.'),
  })

  const addLigne    = () => setLignes(l => [...l, { article: '', quantite: '', prix: '' }])
  const removeLigne = (i: number) => setLignes(l => l.filter((_, ii) => ii !== i))
  const setLigne    = (i: number, field: keyof LigneForm, val: string) =>
    setLignes(l => l.map((ligne, ii) => ii === i ? { ...ligne, [field]: val } : ligne))

  const lignesValides = lignes.filter(l => l.article && parseFloat(l.quantite) > 0)
  const montantEstime = lignesValides.reduce((acc, l) => {
    const p = parseFloat(l.prix), q = parseFloat(l.quantite)
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
        <div
          className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-dim)' }}
            >
              <ClipboardList size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">Modifier la demande</h3>
              <p className="text-xs text-[--text-muted] mt-0.5 font-data">{da.reference}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[--text-muted] hover:text-[--text-primary] transition-colors p-1 -mr-1 -mt-0.5"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="flex flex-col gap-5">

            {/* Urgence */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-all select-none"
              style={{
                backgroundColor: urgence ? 'rgba(239,68,68,0.06)' : 'var(--bg-elevated)',
                border: `1px solid ${urgence ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
              }}
              onClick={() => setUrgence(v => !v)}
            >
              <div className="flex items-center gap-2.5">
                <Zap size={14} style={{ color: urgence ? 'var(--status-danger)' : 'var(--text-muted)' }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: urgence ? 'var(--status-danger)' : 'var(--text-primary)' }}>
                    Demande urgente
                  </p>
                  <p className="text-[10px] text-[--text-muted]">Priorité haute dans le circuit d'approbation</p>
                </div>
              </div>
              <div
                className="w-8 h-4 rounded-full transition-all relative flex-shrink-0"
                style={{ backgroundColor: urgence ? 'var(--status-danger)' : 'var(--border)' }}
              >
                <div
                  className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all"
                  style={{ left: urgence ? '17px' : '2px' }}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={FIELD_LABEL}>
                Notes <span className="text-[--text-muted] normal-case font-normal">(optionnel)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Contexte, justification de la demande…"
                className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')}
              />
            </div>

            {/* Lignes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className={FIELD_LABEL} style={{ marginBottom: 0 }}>
                  Articles <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                {montantEstime > 0 && (
                  <span className="text-[11px] font-data font-semibold text-[--text-secondary]">
                    {montantEstime.toLocaleString('fr-FR')} FCFA
                  </span>
                )}
                <button
                  onClick={addLigne}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded transition-all"
                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                >
                  <Plus size={11} /> Ajouter
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {lignes.map((l, i) => (
                  <div
                    key={l.id ?? i}
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
                        const found = (articles ?? []).find((a: any) => a.id === articleId)
                        setLignes(prev => prev.map((ligne, ii) =>
                          ii === i ? {
                            ...ligne,
                            article: articleId,
                            prix: found?.prix_standard != null ? String(found.prix_standard) : ligne.prix,
                          } : ligne
                        ))
                      }}
                      className={cn(SELECT_CLASS, 'flex-1')}
                      style={{ height: '32px', fontSize: '12px' }}
                    >
                      <option value="">— Choisir un article —</option>
                      {(articles ?? []).map((a: any) => (
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
                    {lignes.length > 1 && (
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
            icon={<Save size={13} />}
            onClick={() => mutate()}
            loading={isPending}
            disabled={lignesValides.length === 0}
          >
            Sauvegarder
          </Button>
        </div>
      </div>
    </div>
  )
}
