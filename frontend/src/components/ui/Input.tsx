import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  error?: string
  label?: string
}

const ICON_LEFT   = 12   // px — position de l'icône gauche
const ICON_WIDTH  = 20   // px — largeur réservée pour l'icône
const PAD_DEFAULT = 12   // px — padding sans icône (= pl-3)
const PAD_ICON    = ICON_LEFT + ICON_WIDTH + 8  // 40px — padding avec icône

// Types nécessitant du padding-right pour l'indicateur natif du sélecteur
const DATE_INPUT_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week'])

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, iconRight, error, label, className, id, style, ...props }, ref) => {
    const isDateType = DATE_INPUT_TYPES.has((props.type ?? '') as string)
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={id}
            className="text-xs font-medium text-[--text-secondary] uppercase tracking-wider"
          >
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          {icon && (
            <span
              style={{
                position: 'absolute',
                left: `${ICON_LEFT}px`,
                top: '50%',
                transform: 'translateY(-50%)',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
                color: 'var(--text-muted)',
                zIndex: 1,
              }}
            >
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            className={cn(
              'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm',
              'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
              'transition-all duration-150',
              'focus:outline-none focus:border-[--accent] focus:bg-[--bg-surface]',
              'focus:shadow-[0_0_0_3px_var(--accent-dim)]',
              error ? 'border-[--status-danger] focus:border-[--status-danger] focus:shadow-[0_0_0_3px_var(--status-danger-bg)]' : '',
              className
            )}
            style={{
              height: '38px',
              paddingLeft:  icon      ? `${PAD_ICON}px` : `${PAD_DEFAULT}px`,
              // Les champs date ont leur propre indicateur natif — padding-right minimal
              paddingRight: isDateType
                ? `${PAD_DEFAULT}px`
                : iconRight ? `${PAD_ICON}px` : `${PAD_DEFAULT}px`,
              ...style,
            }}
            {...props}
          />
          {iconRight && (
            <span
              style={{
                position: 'absolute',
                right: `${ICON_LEFT}px`,
                top: '50%',
                transform: 'translateY(-50%)',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-muted)',
                zIndex: 1,
              }}
            >
              {iconRight}
            </span>
          )}
        </div>
        {error && (
          <p className="text-[11px] text-[--status-danger] mt-0.5">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
