import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  Activity,
  Command as CommandIcon,
  Database,
  LayoutDashboard,
  Loader2,
  Plus,
  Users,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { listTenants, type Tenant } from '../lib/api'
import { cn } from '../lib/utils'

export const OPEN_COMMAND_PALETTE_EVENT = 'command-palette:open'

interface CommandItemDef {
  label: string
  path: string
  icon: React.ElementType
  allowed: Array<'admin' | 'developer'>
}

const NAVIGATION_ITEMS: CommandItemDef[] = [
  { label: 'Admin Dashboard', path: '/admin', icon: LayoutDashboard, allowed: ['admin'] },
  { label: 'Developer Dashboard', path: '/dashboard', icon: LayoutDashboard, allowed: ['developer'] },
  { label: 'Tenants', path: '/admin#tenants', icon: Users, allowed: ['admin'] },
]

const ACTION_ITEMS: CommandItemDef[] = [
  { label: 'Create tenant', path: '/admin#tenants', icon: Plus, allowed: ['admin'] },
  { label: 'Open backups', path: '/admin#backups', icon: Database, allowed: ['admin'] },
  { label: 'Refresh health', path: '/admin#health', icon: Activity, allowed: ['admin'] },
]

function useIsMac() {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  }, [])
}

export function CommandPalette() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMac = useIsMac()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loadingTenants, setLoadingTenants] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (user) setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [user])

  useEffect(() => {
    const onOpen = () => {
      if (user) setOpen(true)
    }
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
  }, [user])

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }
    if (!user || user.user_type !== 'admin') return

    let cancelled = false
    setLoadingTenants(true)
    listTenants()
      .then((data) => {
        if (!cancelled) setTenants(data)
      })
      .catch(() => {
        if (!cancelled) setTenants([])
      })
      .finally(() => {
        if (!cancelled) setLoadingTenants(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, user])

  const handleSelect = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const renderItem = (item: CommandItemDef) => {
    const Icon = item.icon
    return (
      <Command.Item
        key={item.path + item.label}
        value={`${item.label} ${item.path}`}
        onSelect={() => handleSelect(item.path)}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors',
          'data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary',
          'aria-selected:bg-primary/10 aria-selected:text-primary',
        )}
      >
        <Icon className="h-4 w-4 text-muted" />
        {item.label}
      </Command.Item>
    )
  }

  const userType = user?.user_type
  const visibleNavigation = NAVIGATION_ITEMS.filter((item) =>
    userType ? item.allowed.includes(userType) : false,
  )
  const visibleActions = ACTION_ITEMS.filter((item) =>
    userType ? item.allowed.includes(userType) : false,
  )

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-surface-light bg-surface shadow-modal"
    >
      <div className="flex items-center gap-3 border-b border-surface-light px-4">
        <CommandIcon className="h-5 w-5 text-muted" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Type a command or search..."
          className="flex-1 bg-transparent py-4 text-foreground placeholder:text-muted focus:outline-none"
          aria-label="Search commands"
        />
        <kbd className="hidden rounded-md border border-surface-light bg-surface-light/50 px-2 py-1 text-xs font-medium text-muted sm:block">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </div>

      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-muted">
          No commands found.
        </Command.Empty>

        {visibleNavigation.length > 0 && (
          <Command.Group
            heading="Navigation"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted"
          >
            {visibleNavigation.map(renderItem)}
          </Command.Group>
        )}

        {userType === 'admin' && (loadingTenants || tenants.length > 0) && (
          <>
            {visibleNavigation.length > 0 && <Command.Separator className="my-2 h-px bg-surface-light" />}
            <Command.Group
              heading="Tenants"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted"
            >
              {loadingTenants ? (
                <Command.Loading>
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading tenants…
                  </div>
                </Command.Loading>
              ) : (
                tenants.map((tenant) => (
                  <Command.Item
                    key={tenant.name}
                    value={`tenant ${tenant.name}`}
                    onSelect={() =>
                      handleSelect(`/admin/tenants/${encodeURIComponent(tenant.name)}`)
                    }
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors',
                      'data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary',
                      'aria-selected:bg-primary/10 aria-selected:text-primary',
                    )}
                  >
                    <Users className="h-4 w-4 text-muted" />
                    {tenant.name}
                  </Command.Item>
                ))
              )}
            </Command.Group>
          </>
        )}

        {visibleActions.length > 0 && (
          <>
            {(visibleNavigation.length > 0 || (userType === 'admin' && tenants.length > 0)) && (
              <Command.Separator className="my-2 h-px bg-surface-light" />
            )}
            <Command.Group
              heading="Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted"
            >
              {visibleActions.map(renderItem)}
            </Command.Group>
          </>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
