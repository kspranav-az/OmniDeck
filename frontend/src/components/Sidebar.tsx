import { useState, useEffect, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Activity,
  Database,
  Menu,
  X,
  LogOut,
  Shield,
  Command as CommandIcon,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { cn } from '../lib/utils'
import { OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette'

interface SidebarProps {
  mode: 'admin' | 'developer'
  projectName?: string
}

interface NavLinkDef {
  to: string
  label: string
  icon: React.ElementType
}

const adminLinks: NavLinkDef[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin#tenants', label: 'Tenants', icon: Users },
  { to: '/admin#health', label: 'Health', icon: Activity },
  { to: '/admin#backups', label: 'Backups', icon: Database },
]

const devLinks: NavLinkDef[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard#services', label: 'Services', icon: Database },
  { to: '/dashboard#usage', label: 'Usage', icon: Activity },
]

export function Sidebar({ mode, projectName }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const { user, logout } = useAuth()
  const location = useLocation()
  const drawerRef = useFocusTrap<HTMLElement>(mobileOpen)

  const links = mode === 'admin' ? adminLinks : devLinks

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT))
  }

  const sectionIds = useMemo(
    () => links.map((link) => link.to.split('#')[1]).filter((id): id is string => Boolean(id)),
    [links],
  )

  useEffect(() => {
    if (sectionIds.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length === 0) {
          setActiveSection(null)
          return
        }
        const mostVisible = visible.reduce((a, b) =>
          a.intersectionRatio >= b.intersectionRatio ? a : b,
        )
        setActiveSection(mostVisible.target.id)
      },
      {
        rootMargin: '-80px 0px -40% 0px',
        threshold: [0, 0.25, 0.5],
      },
    )

    sectionIds.forEach((id) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [sectionIds])

  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    const element = document.getElementById(id)
    if (element) {
      window.setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    }
  }, [location.hash])

  const isActive = (to: string) => {
    const hashIndex = to.indexOf('#')
    if (hashIndex !== -1) {
      return activeSection === to.slice(hashIndex + 1)
    }
    return location.pathname === to && activeSection === null
  }

  const handleNavClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    to: string,
  ) => {
    const hashIndex = to.indexOf('#')
    if (hashIndex !== -1) {
      event.preventDefault()
      const id = to.slice(hashIndex + 1)
      const element = document.getElementById(id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      setActiveSection(id)
    }
    setMobileOpen(false)
  }

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-surface-light px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <Shield className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">OmniDeck</span>
        </div>
        {projectName && (
          <span className="hidden truncate max-w-[120px] rounded-md bg-surface-light px-2 py-1 text-xs font-medium text-muted lg:block">
            {projectName}
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {links.map((link) => {
          const Icon = link.icon
          const active = isActive(link.to)
          return (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={(event) => handleNavClick(event, link.to)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-surface-light hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              {link.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex w-full items-center gap-3 rounded-lg border border-surface-light bg-surface-light/20 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-light hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <CommandIcon className="h-4 w-4" />
          <span className="flex-1 text-left">Command</span>
          <kbd className="rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-muted">⌘K</kbd>
        </button>
      </div>

      <div className="border-t border-surface-light p-4">
        <div className="mb-3 flex items-center gap-3 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-light text-foreground">
            <span className="text-xs font-bold uppercase">
              {user?.username?.slice(0, 2) || 'U'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.username}
            </p>
            <p className="text-xs capitalize text-muted">{user?.user_type}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile header */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-surface-light bg-surface px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <Shield className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">OmniDeck</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openCommandPalette}
            className="rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Open command palette"
          >
            <CommandIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-surface-light lg:bg-surface">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            ref={drawerRef}
            className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-surface-light bg-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex h-16 items-center justify-end px-4">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
