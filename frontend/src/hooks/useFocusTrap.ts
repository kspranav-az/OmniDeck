import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'area[href]',
].join(', ')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null && !el.hasAttribute('disabled'),
  )
}

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    previousActiveElement.current = document.activeElement as HTMLElement
    const container = ref.current
    if (!container) return

    const focusable = getFocusableElements(container)
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      container.setAttribute('tabindex', '-1')
      container.focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const elements = getFocusableElements(container)
      if (elements.length === 0) {
        event.preventDefault()
        return
      }

      const first = elements[0]
      const last = elements[elements.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      if (previousActiveElement.current && 'focus' in previousActiveElement.current) {
        previousActiveElement.current.focus()
      }
    }
  }, [active])

  return ref
}
