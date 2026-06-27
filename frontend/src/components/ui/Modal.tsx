import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function Modal({ isOpen, onClose, title, description, children, className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={cn(
          'relative w-full max-w-lg rounded-2xl border border-surface-light bg-surface p-6 shadow-modal',
          className,
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted transition-colors hover:bg-surface-light hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        {title && (
          <h2 id="modal-title" className="text-xl font-bold text-foreground">
            {title}
          </h2>
        )}
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}
