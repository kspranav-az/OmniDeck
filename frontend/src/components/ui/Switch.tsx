import { cn } from '../../lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      {label && <span className="text-sm text-foreground">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50',
          checked ? 'bg-primary' : 'bg-surface-light',
        )}
      >
        <span
          className={cn(
            'absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </label>
  )
}
