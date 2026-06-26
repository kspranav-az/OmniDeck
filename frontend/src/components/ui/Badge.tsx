import { cn } from '../../lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        variant === 'default' && 'bg-primary/10 text-primary border border-primary/20',
        variant === 'success' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        variant === 'warning' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        variant === 'danger' && 'bg-red-500/10 text-red-400 border border-red-500/20',
        variant === 'muted' && 'bg-surface-light/50 text-muted border border-surface-light',
        className,
      )}
    >
      {children}
    </span>
  )
}
