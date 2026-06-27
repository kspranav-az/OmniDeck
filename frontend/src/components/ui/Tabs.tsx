import { createContext, useContext, useState, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface TabsContextValue {
  value: string
  onChange: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined)

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
}: {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children: ReactNode
}) {
  const [localValue, setLocalValue] = useState(defaultValue)
  const controlled = value !== undefined
  const active = controlled ? value : localValue
  return (
    <TabsContext.Provider
      value={{
        value: active ?? '',
        onChange: (v) => {
          onValueChange?.(v)
          if (!controlled) setLocalValue(v)
        },
      }}
    >
      {children}
    </TabsContext.Provider>
  )
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border border-surface-light bg-background p-1', className)}>
      {children}
    </div>
  )
}

export function TabTrigger({
  value,
  children,
}: {
  value: string
  children: ReactNode
}) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('TabTrigger must be inside Tabs')
  const active = ctx.value === value
  return (
    <button
      onClick={() => ctx.onChange(value)}
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 cursor-pointer',
        active ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function TabContent({
  value,
  children,
}: {
  value: string
  children: ReactNode
}) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('TabContent must be inside Tabs')
  if (ctx.value !== value) return null
  return <div className="mt-4">{children}</div>
}
