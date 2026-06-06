/**
 * MEPALE ERP — Sidebar
 * Navigation principale avec groupes expandables pour Production & Logistique
 */

import { cn } from '@/lib/utils'
import { NavLink, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  LayoutDashboard,
  Factory,
  Boxes,
  ShoppingCart,
  Users,
  Wallet,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  ClipboardList,
  BookOpen,
  Package,
  Building2,
  BarChart2,
  Truck,
  ChevronDown,
  FileText,
  ArrowLeftRight,
  ClipboardCheck,
  LayoutGrid,
  Tag,
  Ruler,
  Banknote,
  UserCog,
  RotateCcw,
  Receipt,
  UserRound,
  Clock,
  Shuffle,
  SlidersHorizontal,
  Landmark,
  Percent,
  Layers,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubNavItem {
  label:  string
  icon:   React.ReactNode
  path:   string
  end?:   boolean   // correspondance exacte uniquement (évite prefix-match sur routes parentes)
  roles?: string[]  // si défini, visible uniquement pour ces rôles
}

interface NavItem {
  label:         string
  icon:          React.ReactNode
  path:          string
  badge?:        string
  badgeVariant?: 'warning' | 'danger' | 'success'
  children?:     SubNavItem[]
  roles?:        string[]  // si défini, visible uniquement pour ces rôles
}

// ─── Structure de navigation ──────────────────────────────────────────────────

const navGroups: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Principal',
    items: [
      { label: 'Tableau de bord', icon: <LayoutDashboard size={15} />, path: '/dashboard' },
    ],
  },
  {
    group: 'Opérations',
    items: [
      {
        label: 'Production',
        icon:  <Factory size={15} />,
        path:  '/production',
        roles: ['admin', 'directeur', 'resp_production', 'operateur'],
        children: [
          { label: 'Catalogue articles',    icon: <LayoutGrid size={13} />,    path: '/production/catalogue'             },
          { label: 'Lots & Alertes',        icon: <Package size={13} />,       path: '/production/lots'                  },
          { label: 'Nomenclatures',         icon: <BookOpen size={13} />,      path: '/production/nomenclatures'         },
          { label: 'Ordres de fabrication', icon: <ClipboardList size={13} />, path: '/production/ordres-de-fabrication' },
        ],
      },
      {
        label: 'Logistique',
        icon:  <Boxes size={15} />,
        path:  '/logistique',
        roles: ['admin', 'directeur', 'resp_logistique', 'magasinier'],
        children: [
          { label: 'Stock',            icon: <BarChart2 size={13} />,     path: '/logistique/stock'          },
          { label: 'Fournisseurs',     icon: <Building2 size={13} />,     path: '/logistique/fournisseurs'   },
          { label: 'Dem. d\'achat',    icon: <ClipboardList size={13} />, path: '/logistique/demandes-achat' },
          { label: 'Bons de commande', icon: <ShoppingCart size={13} />,  path: '/logistique/bons-commande'  },
          { label: 'Réceptions',       icon: <Truck size={13} />,         path: '/logistique/receptions'     },
          { label: 'Factures fourn.',  icon: <FileText size={13} />,      path: '/logistique/factures'       },
          { label: 'Inventaires',      icon: <ClipboardCheck size={13} />,path: '/logistique/inventaires'    },
          { label: 'Mouvements',       icon: <ArrowLeftRight size={13} />,path: '/logistique/mouvements'     },
        ],
      },
      {
        label: 'Commercial',
        icon:  <ShoppingCart size={15} />,
        path:  '/commercial',
        roles: ['admin', 'directeur', 'commercial'],
        children: [
          { label: 'Clients',           icon: <UserRound size={13} />,     path: '/commercial/clients'          },
          { label: 'Devis',             icon: <FileText size={13} />,      path: '/commercial/devis'            },
          { label: 'Commandes',         icon: <ClipboardList size={13} />, path: '/commercial/commandes'        },
          { label: 'Bons de livraison', icon: <Truck size={13} />,         path: '/commercial/bons-livraison'   },
          { label: 'Factures vente',    icon: <Receipt size={13} />,       path: '/commercial/factures'         },
          { label: 'Retours / SAV',     icon: <RotateCcw size={13} />,     path: '/commercial/retours'          },
        ],
      },
    ],
  },
  {
    group: 'Gestion',
    items: [
      {
        label: 'Ressources Humaines',
        icon:  <Users size={15} />,
        path:  '/rh',
        roles: ['admin', 'directeur', 'resp_rh'],
        children: [
          { label: 'Employés & Paie',   icon: <Banknote size={13} />, path: '/rh/employes'  },
          { label: 'Congés & Absences', icon: <Users size={13} />,    path: '/rh/conges'    },
          { label: 'Présences',         icon: <UserCog size={13} />,  path: '/rh/presences' },
        ],
      },
      {
        label: 'Caisses',
        icon:  <Wallet size={15} />,
        path:  '/caisses',
        roles: ['admin', 'directeur', 'comptable', 'caissier'],
        children: [
          { label: 'Tableau de bord',  icon: <Landmark size={13} />,          path: '/caisses',           end: true },
          { label: 'En attente',       icon: <Clock size={13} />,             path: '/caisses/en-attente' },
          { label: 'Transferts',       icon: <Shuffle size={13} />,           path: '/caisses/transferts' },
          { label: 'Paramètres',       icon: <SlidersHorizontal size={13} />, path: '/caisses/parametres' },
        ],
      },
      { label: 'Comptabilité', icon: <BarChart3 size={15} />, path: '/comptabilite', roles: ['admin', 'directeur', 'comptable'] },
    ],
  },
  {
    group: 'Système',
    items: [
      {
        label: 'Administration',
        icon:  <Settings size={15} />,
        path:  '/administration',
        roles: ['admin', 'directeur'],
        children: [
          { label: "Types d'articles",    icon: <Tag size={13} />,              path: '/administration/types-articles'        },
          { label: 'Unités de mesure',    icon: <Ruler size={13} />,            path: '/administration/unites-mesure'         },
          { label: 'Conditions tarifaires', icon: <Percent size={13} />,        path: '/administration/conditions-tarifaires' },
          { label: 'Config. RH',          icon: <Users size={13} />,            path: '/administration/rh'                    },
          { label: 'Utilisateurs & Rôles', icon: <UserCog size={13} />,         path: '/administration/utilisateurs'          },
          { label: 'Catégories',            icon: <Layers size={13} />,           path: '/administration/categories'            },
          { label: 'Paramètres',           icon: <Settings size={13} />,        path: '/administration/parametres'            },
        ],
      },
    ],
  },
]

// ─── Tooltip en mode réduit (Portal pour échapper au overflow) ────────────────

function SidebarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [tipTop, setTipTop] = useState<number | null>(null)

  return (
    <div
      onMouseEnter={e => {
        const r = e.currentTarget.getBoundingClientRect()
        setTipTop(r.top + r.height / 2)
      }}
      onMouseLeave={() => setTipTop(null)}
    >
      {children}
      {tipTop !== null && createPortal(
        <div
          className="fixed z-[500] pointer-events-none"
          style={{ top: tipTop, left: 68, transform: 'translateY(-50%)' }}
        >
          <div
            className="px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap animate-scale-in"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border:          '1px solid var(--border)',
              color:           'var(--text-primary)',
              boxShadow:       'var(--shadow-md)',
            }}
          >
            {label}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── Item avec sous-menu ──────────────────────────────────────────────────────

function NavItemWithChildren({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location     = useLocation()
  const isParentActive = location.pathname.startsWith(item.path + '/') || location.pathname === item.path
  const [open, setOpen] = useState(isParentActive)

  useEffect(() => {
    if (isParentActive) setOpen(true)
  }, [isParentActive])

  // ── Mode réduit : icône seule + tooltip ──────────────────────────────────
  if (collapsed) {
    return (
      <li>
        <SidebarTooltip label={item.label}>
          <NavLink
            to={item.children![0].path}
            className={cn(
              'group/item relative flex items-center justify-center rounded px-2 py-2',
              'text-[13px] font-medium transition-all duration-150 overflow-hidden',
            )}
            style={
              isParentActive
                ? { backgroundColor: 'rgba(0,201,167,0.12)', color: 'var(--sidebar-accent)' }
                : { color: 'var(--sidebar-text)' }
            }
          >
            {isParentActive && (
              <span
                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
                style={{ backgroundColor: 'var(--sidebar-accent)' }}
              />
            )}
            {!isParentActive && (
              <span
                className="absolute inset-0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-150 rounded"
                style={{ backgroundColor: 'var(--sidebar-hover)' }}
              />
            )}
            <span className={cn(
              'relative z-10 flex-shrink-0',
              isParentActive
                ? 'text-[--sidebar-accent]'
                : 'text-[--sidebar-text] group-hover/item:text-[--sidebar-active]',
            )}>
              {item.icon}
            </span>
          </NavLink>
        </SidebarTooltip>
      </li>
    )
  }

  // ── Mode étendu ───────────────────────────────────────────────────────────
  return (
    <li>
      {/* Bouton parent toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'group/parent relative w-full flex items-center gap-3 rounded-lg px-2.5 py-2',
          'text-[13px] font-medium transition-all duration-150 overflow-hidden',
        )}
        style={
          isParentActive
            ? { backgroundColor: 'rgba(0,201,167,0.07)', color: 'var(--sidebar-accent)' }
            : { color: 'var(--sidebar-text)' }
        }
      >
        {/* Indicateur actif gauche */}
        {isParentActive && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
            style={{ backgroundColor: 'var(--sidebar-accent)' }}
          />
        )}
        {/* Hover bg */}
        {!isParentActive && (
          <span
            className="absolute inset-0 opacity-0 group-hover/parent:opacity-100 transition-opacity duration-150 rounded"
            style={{ backgroundColor: 'var(--sidebar-hover)' }}
          />
        )}
        {/* Icône */}
        <span className={cn(
          'relative z-10 flex-shrink-0 transition-colors duration-150',
          isParentActive
            ? 'text-[--sidebar-accent]'
            : 'text-[--sidebar-text] group-hover/parent:text-[--sidebar-active]',
        )}>
          {item.icon}
        </span>
        {/* Label */}
        <span className="relative z-10 flex-1 text-left truncate">{item.label}</span>
        {/* Chevron */}
        <ChevronDown
          size={12}
          className="relative z-10 flex-shrink-0 transition-transform duration-200"
          style={{
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            color:     'var(--sidebar-text)',
            opacity:   0.45,
          }}
        />
      </button>

      {/* Sous-items — animation grid + guide vertical */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          <div
            className="py-1"
            style={{
              marginLeft:  '22px',
              paddingLeft: '10px',
              borderLeft:  `1px solid ${isParentActive ? 'rgba(0,201,167,0.22)' : 'var(--sidebar-guide)'}`,
              transition:  'border-color 0.2s ease',
            }}
          >
            <ul className="space-y-0.5">
              {item.children?.map(child => {
                const isChildActive = child.end
                  ? location.pathname === child.path
                  : location.pathname === child.path || location.pathname.startsWith(child.path + '/')

                return (
                  <li key={child.path}>
                    <NavLink
                      to={child.path}
                      className={cn(
                        'group/child relative flex items-center gap-2 rounded-lg py-2 px-2.5',
                        'text-[12px] font-medium transition-all duration-150',
                      )}
                      style={
                        isChildActive
                          ? { color: 'var(--sidebar-accent)', backgroundColor: 'rgba(0,201,167,0.10)' }
                          : { color: 'var(--sidebar-text)', opacity: 0.80 }
                      }
                    >
                      {/* Hover bg */}
                      {!isChildActive && (
                        <span
                          className="absolute inset-0 opacity-0 group-hover/child:opacity-100 transition-opacity duration-150 rounded"
                          style={{ backgroundColor: 'var(--sidebar-hover)' }}
                        />
                      )}
                      {/* Icône */}
                      <span className={cn(
                        'relative z-10 flex-shrink-0 transition-colors duration-150',
                        isChildActive
                          ? 'text-[--sidebar-accent]'
                          : 'text-[--sidebar-text] group-hover/child:text-[--sidebar-active]',
                      )}>
                        {child.icon}
                      </span>
                      {/* Label */}
                      <span className="relative z-10 truncate">{child.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </li>
  )
}

// ─── Item simple ──────────────────────────────────────────────────────────────

function SimpleNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation()
  const isActive =
    location.pathname === item.path ||
    location.pathname.startsWith(item.path + '/')

  const link = (
    <NavLink
      to={item.path}
      className={cn(
        'group/item relative flex items-center gap-3 rounded-lg px-2.5 py-2',
        'text-[13px] font-medium transition-all duration-150 overflow-hidden',
        collapsed && 'justify-center px-2',
      )}
      style={
        isActive
          ? { backgroundColor: 'rgba(0,201,167,0.12)', color: 'var(--sidebar-accent)' }
          : { color: 'var(--sidebar-text)' }
      }
    >
      {/* Indicateur actif gauche */}
      {isActive && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
          style={{ backgroundColor: 'var(--sidebar-accent)' }}
        />
      )}
      {/* Hover bg */}
      {!isActive && (
        <span
          className="absolute inset-0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-150 rounded"
          style={{ backgroundColor: 'var(--sidebar-hover)' }}
        />
      )}
      {/* Icône */}
      <span className={cn(
        'relative z-10 flex-shrink-0 transition-colors duration-150',
        isActive
          ? 'text-[--sidebar-accent]'
          : 'text-[--sidebar-text] group-hover/item:text-[--sidebar-active]',
      )}>
        {item.icon}
      </span>
      {/* Label + badge */}
      {!collapsed && (
        <>
          <span className="relative z-10 flex-1 truncate">{item.label}</span>
          {item.badge && (
            <span
              className="relative z-10 ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: item.badgeVariant === 'danger' ? 'var(--status-danger-bg)' : 'var(--status-warning-bg)',
                color:           item.badgeVariant === 'danger' ? 'var(--status-danger)'    : 'var(--status-warning)',
              }}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  return (
    <li>
      {collapsed ? <SidebarTooltip label={item.label}>{link}</SidebarTooltip> : link}
    </li>
  )
}

// ─── Sidebar principale ───────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean
  onToggle:  () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { utilisateur } = useAuthStore()
  const userRole = utilisateur?.role ?? ''

  // Filtre les items et sous-items selon le rôle de l'utilisateur connecté
  const canSee = (roles?: string[]) => !roles || roles.includes(userRole)
  const visibleGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items
        .filter(item => canSee(item.roles))
        .map(item =>
          item.children
            ? { ...item, children: item.children.filter(child => canSee(child.roles)) }
            : item
        )
        .filter(item => !item.children || item.children.length > 0),
    }))
    .filter(group => group.items.length > 0)

  return (
    <aside
      className={cn(
        'sidebar-texture relative flex flex-col h-full',
        'transition-[width] duration-300 ease-in-out overflow-hidden',
        'border-r',
        collapsed ? 'w-16' : 'w-[260px]',
      )}
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderColor:     'var(--sidebar-border)',
      }}
    >
      {/* ── Logo / Brand ── */}
      <div
        className={cn(
          'relative z-10 flex items-center gap-3 flex-shrink-0 border-b',
          collapsed ? 'px-4 h-14 justify-center' : 'px-5 h-14',
        )}
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'var(--sidebar-accent)', color: '#fff' }}
        >
          <Zap size={15} strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <span
              className="text-[15px] font-extrabold tracking-[0.06em] uppercase"
              style={{ color: 'var(--sidebar-active)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              MEPALE
            </span>
            <span
              className="block text-[9px] font-semibold tracking-[0.18em] uppercase -mt-0.5"
              style={{ color: 'var(--sidebar-text)', opacity: 0.65 }}
            >
              ERP System
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-4">
        {visibleGroups.map(group => (
          <div key={group.group}>
            {!collapsed && (
              <p
                className="px-4 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: 'var(--sidebar-text)', opacity: 0.65 }}
              >
                {group.group}
              </p>
            )}
            {collapsed && (
              <div
                className="mx-4 mb-1.5 h-px"
                style={{ backgroundColor: 'var(--sidebar-border)' }}
              />
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map(item =>
                item.children
                  ? <NavItemWithChildren key={item.path} item={item} collapsed={collapsed} />
                  : <SimpleNavItem      key={item.path} item={item} collapsed={collapsed} />
              )}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Collapse Toggle ── */}
      <div
        className="relative z-10 flex-shrink-0 border-t p-2"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <button
          onClick={onToggle}
          title={collapsed ? 'Étendre la barre' : 'Réduire la barre'}
          className={cn(
            'group/toggle relative w-full flex items-center gap-2 px-2.5 py-2 rounded',
            'text-[13px] font-medium transition-all duration-150 overflow-hidden',
            collapsed && 'justify-center',
          )}
          style={{ color: 'var(--sidebar-text)' }}
        >
          {/* Hover bg */}
          <span
            className="absolute inset-0 opacity-0 group-hover/toggle:opacity-100 transition-opacity duration-150 rounded"
            style={{ backgroundColor: 'var(--sidebar-hover)' }}
          />
          <span className="relative z-10 flex items-center gap-2 transition-colors duration-150 group-hover/toggle:text-[--sidebar-active]">
            {collapsed
              ? <ChevronRight size={14} />
              : <><ChevronLeft size={14} /><span>Réduire</span></>
            }
          </span>
        </button>
      </div>
    </aside>
  )
}
