import { useRef, useState, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  User, Phone, Mail, AtSign, ShieldCheck,
  Camera, Save, KeyRound, Eye, EyeOff, Badge as BadgeIcon,
  Calendar,
} from 'lucide-react'

import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Badge }    from '@/components/ui/Badge'
import { cn }       from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { authApi, ROLE_VARIANT } from '@/services/auth'

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const FIELD_LABEL    = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'
const SECTION_HEADER = 'text-xs font-semibold text-[--text-muted] uppercase tracking-widest mb-4'

// ---------------------------------------------------------------------------
// ProfilPage
// ---------------------------------------------------------------------------

export function ProfilPage() {
  const { utilisateur, fetchProfil } = useAuthStore()

  // ── Info form ──
  const [prenom,    setPrenom]    = useState('')
  const [nom,       setNom]       = useState('')
  const [telephone, setTelephone] = useState('')
  const initialized = useRef(false)

  useEffect(() => {
    if (utilisateur && !initialized.current) {
      setPrenom(utilisateur.prenom    ?? '')
      setNom(utilisateur.nom          ?? '')
      setTelephone(utilisateur.telephone ?? '')
      initialized.current = true
    }
  }, [utilisateur])

  // ── Avatar ──
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  // ── Password form ──
  const [ancienMdp,  setAncienMdp]  = useState('')
  const [nouveauMdp, setNouveauMdp] = useState('')
  const [confirmMdp, setConfirmMdp] = useState('')
  const [showPwd,    setShowPwd]    = useState(false)

  // ── Detect changes ──
  const hasInfoChanges = utilisateur
    ? prenom !== (utilisateur.prenom ?? '') ||
      nom    !== (utilisateur.nom    ?? '') ||
      telephone !== (utilisateur.telephone ?? '') ||
      !!avatarFile
    : false

  // ── Mutations ──
  const { mutate: saveInfo, isPending: savingInfo } = useMutation({
    mutationFn: () => authApi.updateMe({ prenom, nom, telephone, avatar: avatarFile ?? undefined }),
    onSuccess: async () => {
      toast.success('Profil mis à jour.')
      await fetchProfil()
      setAvatarFile(null)
      if (avatarPreview) { URL.revokeObjectURL(avatarPreview); setAvatarPreview(null) }
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur lors de la mise à jour.'),
  })

  const { mutate: savePwd, isPending: savingPwd } = useMutation({
    mutationFn: () => authApi.changePassword({
      ancien_mdp:  ancienMdp,
      nouveau_mdp: nouveauMdp,
      confirm_mdp: confirmMdp,
    }),
    onSuccess: () => {
      toast.success('Mot de passe modifié.')
      setAncienMdp(''); setNouveauMdp(''); setConfirmMdp('')
    },
    onError: (e: any) => {
      const data = e?.response?.data
      const msg  = data?.detail ?? data?.ancien_mdp?.[0] ?? data?.nouveau_mdp?.[0] ?? 'Erreur.'
      toast.error(msg)
    },
  })

  const pwdValid = ancienMdp.length > 0 && nouveauMdp.length >= 8 && nouveauMdp === confirmMdp

  const displayAvatar = avatarPreview ?? utilisateur?.avatar
  const initiales     = utilisateur?.initiales ?? '??'
  const roleKey       = utilisateur?.role as keyof typeof ROLE_VARIANT | undefined
  const roleVariant   = roleKey ? ROLE_VARIANT[roleKey] : 'neutral'

  const formatDate = useCallback((iso?: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  }, [])

  // ── Render ──
  return (
    <>
      <div className="space-y-6 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-dim)' }}
          >
            <User size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[--text-primary]">Mon profil</h1>
            <p className="text-sm text-[--text-muted]">
              Gérez vos informations personnelles et votre mot de passe
            </p>
          </div>
        </div>

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Colonne gauche : avatar + identité ── */}
          <div className="flex flex-col gap-4">

            {/* Avatar card */}
            <div className="surface p-5">
              <p className={SECTION_HEADER}>Photo</p>

              {/* Cercle avatar */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
                    style={{ border: '3px solid var(--accent)', background: 'var(--bg-elevated)' }}
                  >
                    {displayAvatar ? (
                      <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span
                        className="text-2xl font-bold font-data"
                        style={{ color: 'var(--accent)' }}
                      >
                        {initiales}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
                    style={{ background: 'var(--accent)', color: '#fff', border: '2px solid var(--bg-surface)' }}
                    title="Changer la photo"
                  >
                    <Camera size={12} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>

                <div className="text-center">
                  <p className="text-sm font-semibold text-[--text-primary]">
                    {utilisateur?.nom_complet ?? '—'}
                  </p>
                  {roleKey && (
                    <Badge variant={roleVariant} className="mt-1.5">
                      {utilisateur?.role_label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Infos lecture seule */}
            <div className="surface p-5">
              <p className={SECTION_HEADER}>Compte</p>
              <div className="flex flex-col gap-3">
                <div>
                  <p className={cn(FIELD_LABEL, 'flex items-center gap-1')}>
                    <AtSign size={10} className="opacity-70" /> Identifiant
                  </p>
                  <p className="text-sm font-data text-[--text-primary] px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    {utilisateur?.username ?? '—'}
                  </p>
                </div>
                <div>
                  <p className={cn(FIELD_LABEL, 'flex items-center gap-1')}>
                    <Mail size={10} className="opacity-70" /> Email
                  </p>
                  <p className="text-sm font-data text-[--text-secondary] px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    {utilisateur?.email ?? '—'}
                  </p>
                </div>
                <div>
                  <p className={cn(FIELD_LABEL, 'flex items-center gap-1')}>
                    <Calendar size={10} className="opacity-70" /> Membre depuis
                  </p>
                  <p className="text-xs text-[--text-muted] px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    {formatDate(utilisateur?.date_creation)}
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* ── Colonne droite ── */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* Informations personnelles */}
            <div className="surface p-5">
              <div className="flex items-center justify-between mb-4">
                <p className={cn(SECTION_HEADER, 'mb-0')}>Informations personnelles</p>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Save size={13} />}
                  loading={savingInfo}
                  disabled={!hasInfoChanges || savingInfo}
                  onClick={() => saveInfo()}
                >
                  Sauvegarder
                </Button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Prénom"
                    icon={<User size={13} />}
                    placeholder="Votre prénom"
                    value={prenom}
                    onChange={e => setPrenom(e.target.value)}
                  />
                  <Input
                    label="Nom"
                    icon={<User size={13} />}
                    placeholder="Votre nom"
                    value={nom}
                    onChange={e => setNom(e.target.value)}
                  />
                </div>
                <Input
                  label="Téléphone"
                  type="tel"
                  icon={<Phone size={13} />}
                  placeholder="+221 77 000 00 00"
                  value={telephone}
                  onChange={e => setTelephone(e.target.value)}
                  className="font-data"
                />
              </div>
            </div>

            {/* Sécurité — changer le mot de passe */}
            <div className="surface p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={14} style={{ color: 'var(--accent)' }} />
                <p className={cn(SECTION_HEADER, 'mb-0')}>Sécurité</p>
              </div>

              <div className="flex flex-col gap-3">
                <Input
                  label="Mot de passe actuel"
                  type={showPwd ? 'text' : 'password'}
                  icon={<KeyRound size={13} />}
                  iconRight={
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="text-[--text-muted] hover:text-[--text-primary] transition-colors"
                    >
                      {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  }
                  placeholder="••••••••"
                  value={ancienMdp}
                  onChange={e => setAncienMdp(e.target.value)}
                />

                <div className="border-t border-[--border-subtle]" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Nouveau mot de passe"
                    type={showPwd ? 'text' : 'password'}
                    icon={<KeyRound size={13} />}
                    placeholder="8 caractères min."
                    value={nouveauMdp}
                    onChange={e => setNouveauMdp(e.target.value)}
                    error={nouveauMdp.length > 0 && nouveauMdp.length < 8 ? 'Minimum 8 caractères' : undefined}
                  />
                  <Input
                    label="Confirmer le mot de passe"
                    type={showPwd ? 'text' : 'password'}
                    icon={<KeyRound size={13} />}
                    placeholder="Répétez le mot de passe"
                    value={confirmMdp}
                    onChange={e => setConfirmMdp(e.target.value)}
                    error={confirmMdp.length > 0 && confirmMdp !== nouveauMdp ? 'Les mots de passe ne correspondent pas' : undefined}
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<ShieldCheck size={13} />}
                    loading={savingPwd}
                    disabled={!pwdValid || savingPwd}
                    onClick={() => savePwd()}
                  >
                    Changer le mot de passe
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
