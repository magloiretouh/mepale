import { useRef, useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Settings, ImageIcon, Building2, Phone, Mail, Globe,
  MapPin, Upload, X, Save, Hash, MessageSquare,
  Coins, ListOrdered, ShieldCheck, Bell,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import {
  administrationApi,
  type ParametresEntrepriseUpdate,
} from '@/services/administration'

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'

const FIELD_LABEL    = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'
const SECTION_HEADER = 'text-xs font-semibold text-[--text-muted] uppercase tracking-widest mb-3'

// ---------------------------------------------------------------------------
// Tabs definition
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'entreprise',    label: 'Entreprise',       icon: Building2    },
  { id: 'devise',        label: 'Devise & format',  icon: Coins        },
  { id: 'numerotation',  label: 'Numérotation',     icon: ListOrdered  },
  { id: 'seuils',        label: 'Seuils métier',    icon: ShieldCheck  },
  { id: 'email',         label: 'Email / notifs',   icon: Bell         },
] as const

type TabId = (typeof TABS)[number]['id']

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-lg bg-[--bg-elevated] animate-pulse', className)} />
}

function EntrepriseSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="surface p-5 space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="lg:col-span-2 surface p-5 space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
            <Skeleton className="h-9" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Placeholder for unimplemented tabs
// ---------------------------------------------------------------------------

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="surface flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <Settings size={18} style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="text-sm font-medium text-[--text-primary]">{label}</p>
      <p className="text-xs text-[--text-muted]">Cette section sera disponible prochainement.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------

type FormState = {
  nom:        string
  slogan:     string
  ninea:      string
  telephone:  string
  telephone2: string
  email:      string
  site_web:   string
  adresse:    string
  ville:      string
  pays:       string
}

const EMPTY_FORM: FormState = {
  nom: '', slogan: '', ninea: '', telephone: '', telephone2: '',
  email: '', site_web: '', adresse: '', ville: '', pays: '',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ParametresPage() {
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<TabId>('entreprise')

  // ── Entreprise data ──
  const { data, isLoading } = useQuery({
    queryKey: ['parametres-entreprise'],
    queryFn:  () => administrationApi.getParametresEntreprise().then(r => r.data),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: (payload: ParametresEntrepriseUpdate) =>
      administrationApi.updateParametresEntreprise(payload),
    onSuccess: () => {
      toast.success('Paramètres sauvegardés.')
      qc.invalidateQueries({ queryKey: ['parametres-entreprise'] })
      setLogoFile(null)
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la sauvegarde.'),
  })

  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [logoFile, setLogoFile]   = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const initialized  = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (data && !initialized.current) {
      setForm({
        nom:        data.nom        ?? '',
        slogan:     data.slogan     ?? '',
        ninea:      data.ninea      ?? '',
        telephone:  data.telephone  ?? '',
        telephone2: data.telephone2 ?? '',
        email:      data.email      ?? '',
        site_web:   data.site_web   ?? '',
        adresse:    data.adresse    ?? '',
        ville:      data.ville      ?? '',
        pays:       data.pays       ?? '',
      })
      initialized.current = true
    }
  }, [data])

  useEffect(() => {
    return () => { if (logoPreview) URL.revokeObjectURL(logoPreview) }
  }, [logoPreview])

  const set = useCallback(
    (field: keyof FormState) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value })),
    []
  )

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const handleRemoveLogo = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoFile(null)
    setLogoPreview(null)
  }

  const hasChanges = (() => {
    if (!data) return false
    if (logoFile) return true
    return (Object.keys(EMPTY_FORM) as (keyof FormState)[]).some(
      k => form[k] !== (data[k] ?? '')
    )
  })()

  const handleSubmit = () => {
    if (!hasChanges) return
    const payload: ParametresEntrepriseUpdate = {}
    if (logoFile) payload.logo = logoFile
    if (data) {
      ;(Object.keys(EMPTY_FORM) as (keyof FormState)[]).forEach(k => {
        if (form[k] !== (data[k] ?? '')) (payload as any)[k] = form[k]
      })
    }
    mutate(payload)
  }

  const displayLogo = logoPreview ?? data?.logo_url

  // ── Render ──
  return (
    <>
      <div className="space-y-5 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--accent-dim)' }}
              >
                <Settings size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <h1 className="text-xl font-semibold text-[--text-primary]">Paramètres Système</h1>
            </div>
            <p className="text-sm text-[--text-muted] ml-10">
              Configuration générale de l'entreprise
            </p>
          </div>

          {activeTab === 'entreprise' && (
            <Button
              variant="primary"
              icon={<Save size={14} />}
              loading={isPending}
              disabled={!hasChanges || isPending}
              onClick={handleSubmit}
            >
              Sauvegarder
            </Button>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div
          className="flex items-center gap-1 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {TABS.map(tab => {
            const Icon    = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium',
                  'border-b-2 -mb-px transition-colors duration-150',
                  isActive
                    ? 'border-[--accent] text-[--accent]'
                    : 'border-transparent text-[--text-secondary] hover:text-[--text-primary] hover:border-[--border]'
                )}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Tab content ── */}
        {activeTab === 'entreprise' && (
          isLoading ? <EntrepriseSkeleton /> : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Logo card */}
              <div className="surface p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon size={14} style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-semibold text-[--text-primary]">Logo</span>
                </div>

                <div
                  className="w-full rounded-xl mb-4 flex items-center justify-center overflow-hidden"
                  style={{ height: 148, background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}
                >
                  {displayLogo ? (
                    <img src={displayLogo} alt="Logo entreprise" className="max-h-32 object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                      <ImageIcon size={28} strokeWidth={1.2} />
                      <span className="text-xs">Aucun logo</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="sm" icon={<Upload size={12} />} className="w-full"
                    onClick={() => fileInputRef.current?.click()}>
                    Changer le logo
                  </Button>
                  {logoFile && (
                    <Button variant="ghost" size="sm" icon={<X size={12} />} className="w-full"
                      onClick={handleRemoveLogo}>
                      Retirer
                    </Button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*"
                    className="hidden" onChange={handleLogoChange} />
                </div>

                <p className="text-[11px] text-[--text-muted] mt-3 text-center leading-relaxed">
                  PNG, JPG ou SVG<br />recommandé 200×200 px
                </p>
              </div>

              {/* Company info card */}
              <div className="lg:col-span-2 surface p-5 flex flex-col gap-6">

                <div>
                  <p className={SECTION_HEADER}>Identité</p>
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Nom de l'entreprise *" icon={<Building2 size={13} />}
                        placeholder="MEPALE SARL" value={form.nom} onChange={set('nom')} />
                      <Input label="Slogan" icon={<MessageSquare size={13} />}
                        placeholder="Votre slogan" value={form.slogan} onChange={set('slogan')} />
                    </div>
                    <Input label="Numéro NINEA" icon={<Hash size={13} />}
                      placeholder="00000000000" value={form.ninea} onChange={set('ninea')}
                      className="font-data" />
                  </div>
                </div>

                <div className="border-b border-[--border-subtle]" />

                <div>
                  <p className={SECTION_HEADER}>Coordonnées</p>
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Téléphone principal" icon={<Phone size={13} />}
                        placeholder="+221 77 000 00 00" value={form.telephone}
                        onChange={set('telephone')} className="font-data" />
                      <Input label="Téléphone secondaire" icon={<Phone size={13} />}
                        placeholder="+221 33 000 00 00" value={form.telephone2}
                        onChange={set('telephone2')} className="font-data" />
                    </div>
                    <Input label="Email professionnel" type="email" icon={<Mail size={13} />}
                      placeholder="contact@entreprise.sn" value={form.email} onChange={set('email')} />
                    <Input label="Site web" type="url" icon={<Globe size={13} />}
                      placeholder="https://www.entreprise.sn" value={form.site_web}
                      onChange={set('site_web')} />
                  </div>
                </div>

                <div className="border-b border-[--border-subtle]" />

                <div>
                  <p className={SECTION_HEADER}>Adresse</p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className={FIELD_LABEL}>
                        <MapPin size={11} className="inline mr-1 opacity-70" />
                        Adresse
                      </label>
                      <textarea rows={2} placeholder="Rue, quartier, BP..."
                        value={form.adresse} onChange={set('adresse')}
                        className={cn(SELECT_CLASS, 'h-auto py-2.5 resize-none leading-relaxed')} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Ville" placeholder="Dakar" value={form.ville} onChange={set('ville')} />
                      <Input label="Pays" placeholder="Sénégal" value={form.pays} onChange={set('pays')} />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )
        )}

        {activeTab === 'devise'       && <ComingSoon label="Devise & format" />}
        {activeTab === 'numerotation' && <ComingSoon label="Numérotation" />}
        {activeTab === 'seuils'       && <ComingSoon label="Seuils métier" />}
        {activeTab === 'email'        && <ComingSoon label="Email / notifications" />}

      </div>
    </>
  )
}
