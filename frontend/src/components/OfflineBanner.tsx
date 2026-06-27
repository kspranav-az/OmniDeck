import { useEffect, useState } from 'react'
import { WifiOff, X } from 'lucide-react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isOnline) {
      setDismissed(false)
    }
  }, [isOnline])

  if (isOnline || dismissed) return null

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 bg-warning px-4 py-3 text-surface shadow-lg"
    >
      <div className="flex items-center gap-3">
        <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium">
          You are currently offline. Some features may be unavailable.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded-md p-1 hover:bg-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        aria-label="Dismiss offline banner"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
