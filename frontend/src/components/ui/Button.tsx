import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white
    shadow-sm hover:shadow-md
    border border-[var(--accent)]
  `,
  secondary: `
    bg-[--bg-elevated] hover:bg-[--bg-surface] text-[--text-primary]
    border border-[--border] shadow-sm hover:shadow-md hover:border-[--text-muted]
  `,
  ghost: `
    bg-transparent hover:bg-[--bg-elevated] text-[--text-secondary]
    hover:text-[--text-primary] border border-transparent
  `,
  danger: `
    bg-[--status-danger-bg] hover:bg-[--status-danger] text-[--status-danger]
    hover:text-white border border-transparent hover:border-[--status-danger]
    shadow-sm
  `,
  outline: `
    bg-transparent hover:bg-[--accent-dim] text-[--accent]
    border border-[--accent] hover:border-[--accent-bright]
  `,
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-7  px-2.5 text-[11px] gap-1   rounded',
  sm: 'h-8  px-3.5 text-xs     gap-1.5 rounded-md',
  md: 'h-9  px-4   text-[13px] gap-2   rounded-lg',
  lg: 'h-11 px-5   text-sm     gap-2   rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, iconRight, children, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150',
          'active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent] focus-visible:ring-offset-1',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
        ) : icon ? (
          <span className="flex-shrink-0 opacity-80">{icon}</span>
        ) : null}
        {children && <span>{children}</span>}
        {iconRight && !loading && (
          <span className="flex-shrink-0 opacity-70">{iconRight}</span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
