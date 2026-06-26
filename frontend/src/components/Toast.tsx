import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { cn } from '../lib/utils'

export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-4 shadow-modal backdrop-blur-sm transition-all duration-300',
            toast.type === 'success' && 'border-emerald-500/20 bg-surface/95 text-emerald-400',
            toast.type === 'error' && 'border-red-500/20 bg-surface/95 text-red-400',
            toast.type === 'info' && 'border-primary/20 bg-surface/95 text-foreground',
          )}
        >
          {toast.type === 'success' && <CheckCircle className="h-5 w-5 shrink-0" />}
          {toast.type === 'error' && <XCircle className="h-5 w-5 shrink-0" />}
          {toast.type === 'info' && <Info className="h-5 w-5 shrink-0" />}
          <p className="flex-1 text-sm font-medium text-foreground">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="rounded p-1 text-muted transition-colors hover:bg-surface-light hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
