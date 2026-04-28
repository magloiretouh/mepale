/**
 * MEPALE ERP — Utilisateurs & Rôles
 * Liste de tous les comptes + création / modification / reset MDP / activation
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Users, MoreHorizontal, Pencil, Power, KeyRound, Plus, Eye, EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input  } from '@/components/ui/Input'
import { Badge  } from '@/components/ui/Badge'
import { Modal  } from '@/components/ui/Modal'
import {
  authApi, ROLES, ROLE_VARIANT,
  type UtilisateurItem, type RoleUtilisateur,
} from '@/services/auth'
import { useAuthStore } from '@/store/authStore'

// ─── Styles ───────────────────────────────────────────────────────────────────

const SELECT_CLASS = cn(
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm pl-3 pr-8',
  'text-[--text-primary] appearance-none transition-all duration-150',
  'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
)
const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'

// ─── Modal Créer utilisateur ──────────────────────────────────────────────────

function ModalCreer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [showPwd,  setShowPwd ] = useState(false)
  const [showPwd2, setShowPwd2] = useState(false)
  const [form, setForm] = useState({
    nom: '', prenom: '', username: '', email: '',
    role: 'operateur' as RoleUtilisateur,
    telephone: '', password: '', password2: '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { mutate, isPending } = useMutation({
    mutationFn: () => authApi.createUtilisateur({ ...form }),
    onSuccess: () => {
      toast.success('Utilisateur créé.')
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
      onClose()
    },
    onError: (e: { response?: { data?: Record<string, unknown> } }) => {
      const d = e?.response?.data
      const msg = d ? (Object.values(d).flat()[0] as string) : 'Erreur lors de la création.'
      toast.error(msg)
    },
  })

  const valid = form.nom && form.prenom && form.username && form.email &&
    form.password.length >= 8 && form.password === form.password2

  return (
    <Modal isOpen onClose={onClose} title="Nouvel utilisateur">
      <div className="px-5 py-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL}>Prénom</label>
            <Input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Magloire" />
          </div>
          <div>
            <label className={FIELD_LABEL}>Nom</label>
            <Input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Touh" />
          </div>
        </div>
        <div>
          <label className={FIELD_LABEL}>Identifiant de connexion</label>
          <Input value={form.username} onChange={e => set('username', e.target.value)} placeholder="m.touh" />
        </div>
        <div>
          <label className={FIELD_LABEL}>Email</label>
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="m.touh@manzay.com" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL}>Rôle</label>
            <select className={SELECT_CLASS} value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className={FIELD_LABEL}>Téléphone <span style={{ color: 'var(--text-muted)' }}>(opt.)</span></label>
            <Input value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="+226 xx xx xx xx" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL}>Mot de passe</label>
            <Input
              type={showPwd ? 'text' : 'password'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="min. 8 caractères"
              iconRight={
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="p-1.5 cursor-pointer hover:text-[--text-primary] transition-colors" tabIndex={-1}>
                  {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              }
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>Confirmation</label>
            <Input
              type={showPwd2 ? 'text' : 'password'}
              value={form.password2}
              onChange={e => set('password2', e.target.value)}
              placeholder="Répéter"
              error={form.password2 && form.password !== form.password2 ? 'Mots de passe différents' : undefined}
              iconRight={
                <button type="button" onClick={() => setShowPwd2(v => !v)}
                  className="p-1.5 cursor-pointer hover:text-[--text-primary] transition-colors" tabIndex={-1}>
                  {showPwd2 ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              }
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" onClick={() => mutate()} loading={isPending} disabled={!valid}>
          Créer le compte
        </Button>
      </div>
    </Modal>
  )
}

// ─── Modal Modifier ───────────────────────────────────────────────────────────

function ModalModifier({ user, onClose }: { user: UtilisateurItem; onClose: () => void }) {
  const qc = useQueryClient()
  const parts = user.nom_complet.split(' ')
  const [form, setForm] = useState({
    prenom:    parts[0] ?? '',
    nom:       parts.slice(1).join(' ') || '',
    email:     user.email,
    telephone: user.telephone ?? '',
    role:      user.role,
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { mutate, isPending } = useMutation({
    mutationFn: () => authApi.updateUtilisateur(user.id, form),
    onSuccess: () => {
      toast.success('Utilisateur mis à jour.')
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
      onClose()
    },
    onError: (e: { response?: { data?: Record<string, unknown> } }) => {
      const d = e?.response?.data
      const msg = d ? (Object.values(d).flat()[0] as string) : 'Erreur.'
      toast.error(msg)
    },
  })

  return (
    <Modal isOpen onClose={onClose} title={`Modifier — ${user.nom_complet}`}>
      <div className="px-5 py-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL}>Prénom</label>
            <Input value={form.prenom} onChange={e => set('prenom', e.target.value)} />
          </div>
          <div>
            <label className={FIELD_LABEL}>Nom</label>
            <Input value={form.nom} onChange={e => set('nom', e.target.value)} />
          </div>
        </div>
        <div>
          <label className={FIELD_LABEL}>Email</label>
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL}>Rôle</label>
            <select className={SELECT_CLASS} value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className={FIELD_LABEL}>Téléphone</label>
            <Input value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="+226 xx xx xx xx" />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" onClick={() => mutate()} loading={isPending}>Enregistrer</Button>
      </div>
    </Modal>
  )
}

// ─── Modal Reset MDP ──────────────────────────────────────────────────────────

function ModalResetMdp({ user, onClose }: { user: UtilisateurItem; onClose: () => void }) {
  const [mdp,    setMdp  ] = useState('')
  const [mdp2,   setMdp2 ] = useState('')
  const [show,   setShow ] = useState(false)

  const { mutate, isPending } = useMutation({
    mutationFn: () => authApi.resetPassword(user.id, mdp),
    onSuccess: () => { toast.success('Mot de passe réinitialisé.'); onClose() },
    onError:   (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const valid = mdp.length >= 8 && mdp === mdp2

  return (
    <Modal isOpen onClose={onClose} title={`Réinitialiser le MDP — ${user.nom_complet}`}>
      <div className="px-5 py-5 flex flex-col gap-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Définissez un nouveau mot de passe temporaire pour cet utilisateur. Il devra le changer à sa prochaine connexion.
        </p>
        <div>
          <label className={FIELD_LABEL}>Nouveau mot de passe</label>
          <Input
            type={show ? 'text' : 'password'}
            value={mdp}
            onChange={e => setMdp(e.target.value)}
            placeholder="min. 8 caractères"
            iconRight={
              <button type="button" onClick={() => setShow(v => !v)}
                className="p-1.5 cursor-pointer hover:text-[--text-primary] transition-colors" tabIndex={-1}>
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            }
          />
        </div>
        <div>
          <label className={FIELD_LABEL}>Confirmation</label>
          <Input
            type={show ? 'text' : 'password'}
            value={mdp2}
            onChange={e => setMdp2(e.target.value)}
            placeholder="Répéter"
            error={mdp2 && mdp !== mdp2 ? 'Mots de passe différents' : undefined}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button variant="danger" onClick={() => mutate()} loading={isPending} disabled={!valid}>
          Réinitialiser
        </Button>
      </div>
    </Modal>
  )
}

// ─── Menu actions (portal) ────────────────────────────────────────────────────

function ActionMenu({
  user, isSelf, onEdit, onToggle, onReset,
}: {
  user:     UtilisateurItem
  isSelf:   boolean
  onEdit:   () => void
  onToggle: () => void
  onReset:  () => void
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
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

  const W = 192
  const dropdown = rect && open && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
      <div
        className="rounded-md py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top:    rect.bottom + 200 < window.innerHeight ? rect.bottom + 4 : undefined,
          bottom: rect.bottom + 200 < window.innerHeight ? undefined : window.innerHeight - rect.top + 4,
          left:   rect.right - W,
          width:  W,
          zIndex: 9999,
          backgroundColor: 'var(--bg-surface)',
          border:          '1px solid var(--border)',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {item('Modifier', <Pencil size={13} />, onEdit)}
        {item('Réinitialiser MDP', <KeyRound size={13} />, onReset)}
        {!isSelf && (
          <>
            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
            {item(
              user.is_active ? 'Désactiver' : 'Réactiver',
              <Power size={13} />,
              onToggle,
              user.is_active,
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  )

  return (
    <>
      {dropdown}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="w-7 h-7 rounded flex items-center justify-center transition-all text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-elevated]"
      >
        <MoreHorizontal size={14} />
      </button>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function UtilisateursPage() {
  const qc           = useQueryClient()
  const { utilisateur: moi } = useAuthStore()

  const [showCreate,   setShowCreate  ] = useState(false)
  const [editUser,     setEditUser    ] = useState<UtilisateurItem | null>(null)
  const [resetUser,    setResetUser   ] = useState<UtilisateurItem | null>(null)
  const [filterActive, setFilterActive] = useState<'' | '1' | '0'>('')
  const [filterRole,   setFilterRole  ] = useState('')
  const [search,       setSearch      ] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['utilisateurs', filterActive],
    queryFn:  () => authApi.listUtilisateurs(
      filterActive ? { active: filterActive as '1' | '0' } : undefined
    ).then(r => Array.isArray(r.data) ? r.data : (r.data as any).results ?? []),
  })

  const { mutate: toggleUser } = useMutation({
    mutationFn: (id: string) => authApi.toggleUtilisateur(id),
    onSuccess: (res) => {
      toast.success(res.data.detail)
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Erreur.'),
  })

  const filtered = users.filter(u => {
    if (search && !u.nom_complet.toLowerCase().includes(search.toLowerCase()) &&
        !u.username.toLowerCase().includes(search.toLowerCase())) return false
    if (filterRole && u.role !== filterRole) return false
    return true
  })

  const activeCount   = users.filter(u => u.is_active).length
  const inactiveCount = users.length - activeCount

  return (
    <>
      {/* ══ Modals ════════════════════════════════════════════════════════════ */}
      {showCreate  && <ModalCreer   onClose={() => setShowCreate(false)} />}
      {editUser    && <ModalModifier user={editUser}  onClose={() => setEditUser(null)} />}
      {resetUser   && <ModalResetMdp user={resetUser} onClose={() => setResetUser(null)} />}

      {/* ══ Page ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col h-full animate-fade-in">

        {/* ── En-tête ── */}
        <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Utilisateurs & Rôles
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {users.length} compte{users.length !== 1 ? 's' : ''}
              {' · '}
              <span style={{ color: 'var(--status-success)' }}>{activeCount} actif{activeCount !== 1 ? 's' : ''}</span>
              {inactiveCount > 0 && (
                <span style={{ color: 'var(--text-muted)' }}> · {inactiveCount} inactif{inactiveCount !== 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowCreate(true)}>
            Nouvel utilisateur
          </Button>
        </div>

        {/* ── Filtres ── */}
        <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 16 }}>
          <div style={{ flex: '1 1 200px', maxWidth: 260 }}>
            <Input
              placeholder="Rechercher par nom ou identifiant…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className={cn('h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8 text-[--text-primary] appearance-none focus:outline-none focus:border-[--accent]')}
            style={{ minWidth: 160 }}
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
          >
            <option value="">Tous les rôles</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select
            className={cn('h-9 bg-[--bg-elevated] border border-[--border] rounded text-sm pl-3 pr-8 text-[--text-primary] appearance-none focus:outline-none focus:border-[--accent]')}
            style={{ minWidth: 130 }}
            value={filterActive}
            onChange={e => setFilterActive(e.target.value as typeof filterActive)}
          >
            <option value="">Tous</option>
            <option value="1">Actifs</option>
            <option value="0">Inactifs</option>
          </select>
          {(search || filterRole || filterActive) && (
            <button
              onClick={() => { setSearch(''); setFilterRole(''); setFilterActive('') }}
              className="text-xs underline"
              style={{ color: 'var(--text-muted)' }}
            >
              Réinitialiser
            </button>
          )}
        </div>

        {isLoading && (
          <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-muted)' }}>
            <Users size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
            <p className="text-sm">
              {users.length === 0 ? 'Aucun utilisateur.' : 'Aucun utilisateur ne correspond aux filtres.'}
            </p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                    {['Utilisateur', 'Identifiant', 'Email', 'Rôle', 'Téléphone', 'Statut', ''].map((col, i) => (
                      <th key={i}
                        className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-left whitespace-nowrap"
                        style={{ color: 'var(--text-secondary)' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => {
                    const isSelf = moi?.id === u.id
                    return (
                      <tr key={u.id}
                        style={{
                          backgroundColor: i % 2 === 1 ? 'var(--bg-elevated)' : 'transparent',
                          borderBottom: '1px solid var(--border)',
                          opacity: u.is_active ? 1 : 0.55,
                        }}
                      >
                        {/* Utilisateur */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                              style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                            >
                              {u.nom_complet.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                                {u.nom_complet}
                                {isSelf && (
                                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                    style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                    Moi
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Identifiant */}
                        <td className="px-3 py-2.5 font-data text-xs" style={{ color: 'var(--text-muted)' }}>
                          {u.username}
                        </td>

                        {/* Email */}
                        <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {u.email}
                        </td>

                        {/* Rôle */}
                        <td className="px-3 py-2.5">
                          <Badge variant={ROLE_VARIANT[u.role]}>{u.role_label}</Badge>
                        </td>

                        {/* Téléphone */}
                        <td className="px-3 py-2.5 text-xs font-data" style={{ color: 'var(--text-muted)' }}>
                          {u.telephone || '—'}
                        </td>

                        {/* Statut */}
                        <td className="px-3 py-2.5">
                          <Badge variant={u.is_active ? 'success' : 'neutral'}>
                            {u.is_active ? 'Actif' : 'Inactif'}
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                          <ActionMenu
                            user={u}
                            isSelf={isSelf}
                            onEdit={() => setEditUser(u)}
                            onToggle={() => toggleUser(u.id)}
                            onReset={() => setResetUser(u)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
