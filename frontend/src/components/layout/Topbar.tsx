import { cn } from '@/lib/utils'
import { useThemeStore } from '@/store/themeStore'
import { useAuthStore } from '@/store/authStore'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import {
  Search,
  Bell,
  Sun,
  Moon,
  ChevronRight,
  LogOut,
  User,
  Settings,
  Home,
} from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/Input'

/** Map path → breadcrumb label */
const pathLabels: Record<string, string> = {
  dashboard:      'Tableau de bord',
  production:     'Production',
  logistique:     'Logistique',
  commercial:     'Commercial',
  rh:             'Ressources Humaines',
  caisses:        'Caisses',
  comptabilite:   'Comptabilité',
  administration: 'Administration',
  // sub-pages
  catalogue:               'Catalogue articles',
  'ordres-de-fabrication': 'Ordres de Fabrication',
  nomenclatures:           'Nomenclatures',
  lots:                    'Lots & Alertes',
  fournisseurs:            'Fournisseurs',
  stock:                   'Stocks',
  'bons-commande':         'Bons de Commande',
  receptions:              'Réceptions',
  'demandes-achat':        'Demandes d\'achat',
  mouvements:              'Mouvements',
  inventaires:             'Inventaires',
  clients:                 'Clients',
  devis:                   'Devis',
  commandes:               'Commandes',
  'bons-livraison':        'Bons de Livraison',
  retours:                 'Retours / SAV',
  factures:                'Factures',
  employes:                'Employés',
  conges:                  'Congés',
  presences:               'Présences',
  paie:                    'Paie',
  transactions:            'Transactions',
  utilisateurs:            'Utilisateurs',
  parametres:              'Paramètres',
  categories:              'Catégories',
  profil:                  'Mon profil',
  'types-articles':          'Types d\'articles',
  'unites-mesure':           'Unités de mesure',
  'conditions-tarifaires':   'Conditions tarifaires',
  'en-attente':            'En attente',
  transferts:              'Transferts',
}

function Breadcrumb() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  return (
    <nav className="flex items-center gap-1.5 text-sm" aria-label="Fil d'Ariane">
      {/* Home icon */}
      <Link
        to="/dashboard"
        className="flex items-center transition-colors duration-150 hover:text-[--accent]"
        style={{ color: 'var(--text-muted)' }}
        title="Tableau de bord"
      >
        <Home size={14} />
      </Link>

      {segments.map((seg, i) => {
        const label = pathLabels[seg] ?? seg
        const isLast = i === segments.length - 1

        return (
          <span key={seg} className="flex items-center gap-1.5">
            <ChevronRight
              size={11}
              className="flex-shrink-0"
              style={{ color: 'var(--text-muted)', opacity: 0.6 }}
            />
            <span
              className={cn(
                'font-medium',
                isLast
                  ? 'text-[--text-primary]'
                  : 'text-[--text-muted]',
              )}
            >
              {label}
            </span>
          </span>
        )
      })}
    </nav>
  )
}

function NotificationBell() {
  const count = 3 // mock

  return (
    <button
      className={cn(
        'relative w-8 h-8 rounded-lg flex items-center justify-center',
        'text-[--text-secondary] hover:text-[--text-primary]',
        'hover:bg-[--bg-elevated] transition-all duration-150',
      )}
      title="Notifications"
    >
      <Bell size={16} />
      {count > 0 && (
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full border border-[--bg-surface] status-dot-pulse"
          style={{ backgroundColor: 'var(--status-danger)' }}
        />
      )}
    </button>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative w-8 h-8 rounded-lg flex items-center justify-center',
        'text-[--text-secondary] hover:text-[--text-primary]',
        'hover:bg-[--bg-elevated] transition-all duration-150',
      )}
      title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
    >
      <span
        className="absolute inset-0 flex items-center justify-center transition-all duration-300"
        style={{
          opacity: theme === 'dark' ? 1 : 0,
          transform: theme === 'dark' ? 'rotate(0deg)' : 'rotate(90deg)',
        }}
      >
        <Sun size={15} />
      </span>
      <span
        className="absolute inset-0 flex items-center justify-center transition-all duration-300"
        style={{
          opacity: theme === 'light' ? 1 : 0,
          transform: theme === 'light' ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}
      >
        <Moon size={15} />
      </span>
    </button>
  )
}

function UserMenu() {
  const [open, setOpen] = useState(false)
  const { utilisateur, logout } = useAuthStore()
  const navigate = useNavigate()

  const initiales   = utilisateur?.initiales ?? '??'
  const nomComplet  = utilisateur?.nom_complet ?? 'Utilisateur'
  const roleLabel   = utilisateur?.role_label ?? ''

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 h-8 px-2 rounded-lg',
          'hover:bg-[--bg-elevated] transition-all duration-150',
        )}
      >
        {/* Avatar */}
        <div
          className="w-6 h-6 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold"
          style={{
            backgroundColor: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1.5px solid var(--accent)',
          }}
        >
          {utilisateur?.avatar
            ? <img src={utilisateur.avatar} alt="" className="w-full h-full object-cover" />
            : initiales
          }
        </div>
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-xs font-medium text-[--text-primary] leading-none">
            {nomComplet}
          </span>
          <span className="text-[10px] text-[--text-muted] leading-none mt-0.5">
            {roleLabel}
          </span>
        </div>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-1.5 w-48 rounded-xl shadow-[--shadow-lg] z-50 py-1 animate-scale-in"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            {/* User info header */}
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold text-[--text-primary] truncate">{nomComplet}</p>
              <p className="text-[10px] text-[--text-muted] truncate">{utilisateur?.email}</p>
            </div>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-colors"
              onClick={() => { setOpen(false); navigate('/profil') }}
            >
              <User size={14} />
              Mon profil
            </button>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-elevated] transition-colors"
              onClick={() => { setOpen(false); navigate('/administration/parametres') }}
            >
              <Settings size={14} />
              Paramètres
            </button>
            <div
              className="my-1 border-t"
              style={{ borderColor: 'var(--border)' }}
            />
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[--status-danger-bg] transition-colors"
              style={{ color: 'var(--status-danger)' }}
              onClick={() => { setOpen(false); logout() }}
            >
              <LogOut size={14} />
              Déconnexion
            </button>
          </div>
        </>
      )}
    </div>
  )
}

interface TopbarProps {
  className?: string
}

export function Topbar({ className }: TopbarProps) {
  return (
    <header
      className={cn(
        'flex items-center gap-4 px-4 flex-shrink-0 border-b',
        className,
      )}
      style={{
        height:          'var(--topbar-height)',
        backgroundColor: 'var(--bg-surface)',
        borderColor:     'var(--border)',
        boxShadow:       '0 1px 0 var(--border), 0 2px 8px rgba(10,14,42,0.06)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <Breadcrumb />
      </div>

      {/* Search */}
      <div className="hidden md:block w-64">
        <Input
          placeholder="Rechercher…"
          icon={<Search size={13} />}
          className="h-8 text-xs"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5">
        <NotificationBell />
        <ThemeToggle />
        <div
          className="w-px h-5 mx-2"
          style={{ backgroundColor: 'var(--border)' }}
        />
        <UserMenu />
      </div>
    </header>
  )
}
