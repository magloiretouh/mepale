import { cn } from '@/lib/utils'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
  dot?: boolean
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-[--status-success-bg] text-[--status-success] border-[--status-success]',
  warning: 'bg-[--status-warning-bg] text-[--status-warning] border-[--status-warning]',
  danger:  'bg-[--status-danger-bg]  text-[--status-danger]  border-[--status-danger]',
  info:    'bg-[--status-info-bg]    text-[--status-info]    border-[--status-info]',
  neutral: 'bg-[--status-neutral-bg] text-[--status-neutral] border-[--status-neutral]',
  accent:  'bg-[--accent-dim]        text-[--accent]         border-[--accent]',
}

const dotStyles: Record<BadgeVariant, string> = {
  success: 'bg-[--status-success]',
  warning: 'bg-[--status-warning]',
  danger:  'bg-[--status-danger]',
  info:    'bg-[--status-info]',
  neutral: 'bg-[--status-neutral]',
  accent:  'bg-[--accent]',
}

export function Badge({ variant = 'neutral', children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-opacity-20',
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotStyles[variant])}
        />
      )}
      {children}
    </span>
  )
}
