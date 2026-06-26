import { useState } from 'react'
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
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

interface SidebarProps {
  mode: 'admin' | 'developer'
  projectName?: string
}

export function Sidebar({ mode, projectName }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  const adminLinks = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin#tenants', label: 'Tenants', icon: Users },
    { to: '/admin#health', label: 'Health', icon: Activity },
    { to: '/admin#backups', label: 'Backups', icon: Database },
  ]

  const devLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/dashboard#services', label: 'Services', icon: Database },
    { to: '/dashboard#usage', label: 'Usage', icon: Activity },
  ]

  const links = mode === 'admin' ? adminLinks : devLinks

  const isActive = (to: string) => {
    if (to.includes('#')) return false
    return location.pathname === to
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
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200',
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
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-danger/10 hover:text-danger"
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
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
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
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-surface-light bg-surface">
            <div className="flex h-16 items-center justify-end px-4">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground"
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
