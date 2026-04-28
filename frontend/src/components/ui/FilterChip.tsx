import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/** Variante de couleur pour les états spéciaux (ex: "en retard" → danger) */
type FilterChipVariant = 'default' | 'danger' | 'warning'

interface FilterChipProps {
  active:   boolean
  onClick:  () => void
  children: ReactNode
  /** Badge numérique affiché à droite (ex: nombre d'alertes) */
  badge?:   number
  variant?: FilterChipVariant
  className?: string
}

const ACTIVE_STYLES: Record<FilterChipVariant, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--accent)',
    border:          '1px solid var(--accent)',
    color:           '#fff',
    fontWeight:      '600',
  },
  danger: {
    backgroundColor: 'var(--status-danger)',
    border:          '1px solid var(--status-danger)',
    color:           '#fff',
    fontWeight:      '600',
  },
  warning: {
    backgroundColor: 'var(--status-warning)',
    border:          '1px solid var(--status-warning)',
    color:           '#fff',
    fontWeight:      '600',
  },
}

const ACTIVE_BADGE_STYLES: Record<FilterChipVariant, React.CSSProperties> = {
  default: { backgroundColor: 'rgba(255,255,255,0.28)', color: '#fff' },
  danger:  { backgroundColor: 'rgba(255,255,255,0.28)', color: '#fff' },
  warning: { backgroundColor: 'rgba(255,255,255,0.28)', color: '#fff' },
}

export function FilterChip({
  active,
  onClick,
  children,
  badge,
  variant = 'default',
  className,
}: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3.5 py-1.5',
        'text-xs font-medium rounded-lg transition-all duration-150',
        'cursor-pointer select-none',
        active
          ? variant === 'default'
            ? 'font-semibold'
            : 'font-semibold'
          : 'hover:text-[--text-primary]',
        className
      )}
      style={
        active
          ? ACTIVE_STYLES[variant]
          : {
              backgroundColor: 'var(--bg-elevated)',
              border:          '1px solid var(--border)',
              color:           'var(--text-secondary)',
            }
      }
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex-shrink-0"
          style={active ? ACTIVE_BADGE_STYLES[variant] : { backgroundColor: 'var(--status-danger)', color: '#fff' }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/**
 * Wrapper pour la barre de filtres (search + chips).
 * Usage :
 * ```tsx
 * <FilterBar>
 *   <div className="w-64"><Input ... /></div>
 *   <div className="flex items-center gap-2">
 *     <FilterChip active={...} onClick={...}>Tous</FilterChip>
 *   </div>
 * </FilterBar>
 * ```
 */
interface FilterBarProps {
  children: ReactNode
  className?: string
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 px-6 py-4 border-b flex-shrink-0', className)}
      style={{
        borderColor:     'var(--border)',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      {children}
    </div>
  )
}
