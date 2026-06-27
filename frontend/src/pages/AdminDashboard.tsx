import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { StatCard } from '../components/StatCard'
import { ServiceIcon } from '../components/ServiceIcon'
import { CreateTenantModal } from '../components/admin/CreateTenantModal'
import { TenantCredentialsModal } from '../components/admin/TenantCredentialsModal'
import { ServiceManagerModal } from '../components/admin/ServiceManagerModal'
import { BackupSection } from '../components/admin/BackupSection'
import { useToast } from '../hooks/useToast'
import { useInterval } from '../hooks/useInterval'
import { formatDateTime } from '../lib/utils'
import {
  listTenants,
  deleteTenant,
  getHealth,
  getServiceHealth,
  listBackups,
  type Tenant,
  type Container,
  type ServiceHealth,
} from '../lib/api'
import {
  Users,
  Activity,
  Archive,
  Plus,
  Trash2,
  Eye,
  Settings,
  Server,
  Cpu,
  HardDrive,
  MoreHorizontal,
  AlertTriangle,
  X,
} from 'lucide-react'

const ALL_SERVICES = ['postgres', 'mongo', 'redis', 'minio']
const SERVICE_LABELS: Record<string, string> = {
  postgres: 'PostgreSQL',
  mongo: 'MongoDB',
  redis: 'Redis',
  minio: 'MinIO',
}

export default function AdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [tenantCount, setTenantCount] = useState(0)
  const [backups, setBackups] = useState(0)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [credentialsTenant, setCredentialsTenant] = useState<Tenant | null>(null)
  const [createdTenant, setCreatedTenant] = useState<Tenant | null>(null)
  const [manageTenant, setManageTenant] = useState<string | null>(null)
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [dismissAlert, setDismissAlert] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [tenantData, healthData, backupData, serviceData] = await Promise.all([
        listTenants(),
        getHealth(),
        listBackups(),
        getServiceHealth(),
      ])
      setTenants(tenantData)
      setContainers(healthData.containers)
      setTenantCount(healthData.tenant_count)
      setBackups(backupData.length)
      setServiceHealth(serviceData.services)
      setLastUpdated(new Date())
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Failed to load dashboard', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchHealth = async () => {
    try {
      const [healthData, serviceData] = await Promise.all([getHealth(), getServiceHealth()])
      setContainers(healthData.containers)
      setTenantCount(healthData.tenant_count)
      setServiceHealth(serviceData.services)
      setLastUpdated(new Date())
    } catch {
      // Silent: avoid spamming toasts on background polling
    }
  }

  useEffect(() => {
    load()
  }, [])

  useInterval(fetchHealth, 5000)

  useEffect(() => {
    if (!openDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdown])

  const healthyCount = useMemo(
    () => containers.filter((c) => c.status === 'running').length,
    [containers],
  )
  const unhealthyCount = containers.length - healthyCount

  const isUnhealthy = useMemo(() => {
    const hasUnhealthyContainer = containers.some((c) => c.status !== 'running')
    const hasUnhealthyService = serviceHealth.some((s) => s.status !== 'ok')
    return hasUnhealthyContainer || hasUnhealthyService
  }, [containers, serviceHealth])

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tenants.filter((t) => {
      const matchesSearch = !q || t.name.toLowerCase().includes(q)
      const matchesService = serviceFilter === 'all' || t.enabled_services.includes(serviceFilter)
      return matchesSearch && matchesService
    })
  }, [tenants, search, serviceFilter])

  const handleDelete = async (name: string) => {
    try {
      await deleteTenant(name)
      toast.addToast(`Tenant "${name}" deleted`, 'success')
      setConfirmDelete(null)
      await load()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  const memoryPercent = (c: Container) => {
    if (!c.memory_usage_mb || !c.memory_limit_mb || c.memory_limit_mb === 0) return 0
    return Math.min(100, Math.round((c.memory_usage_mb / c.memory_limit_mb) * 100))
  }

  const renderServiceStatus = (svc: ServiceHealth | undefined) => {
    if (!svc) {
      return (
        <div className="card flex flex-col justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-4 h-8 w-full" />
        </div>
      )
    }
    return (
      <div className="card flex flex-col justify-between">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <ServiceIcon service={svc.key} className="h-5 w-5 text-muted" />
            <h3 className="font-semibold text-foreground">{SERVICE_LABELS[svc.key] || svc.key}</h3>
          </div>
          <Badge variant={svc.status === 'ok' ? 'success' : 'danger'}>
            {svc.status === 'ok' ? 'healthy' : 'unhealthy'}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Latency</span>
            <span>{svc.latency_ms} ms</span>
          </div>
          {svc.error && <p className="text-xs text-danger">{svc.error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <Sidebar mode="admin" />

      <main id="main-content" className="pt-16 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Admin dashboard</h1>
              <p className="mt-1 text-sm text-muted">
                Manage tenants, monitor system health, and run backups.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-5 w-5" />
              Create tenant
            </Button>
          </div>

          {isUnhealthy && !dismissAlert && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4 text-danger">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-semibold">System health alert</p>
                <p className="mt-0.5 text-danger/80">
                  One or more containers or services are unhealthy. Review the system health section
                  below.
                </p>
              </div>
              <button
                onClick={() => setDismissAlert(true)}
                className="rounded-lg p-1 text-danger/80 transition-colors hover:bg-danger/20"
                aria-label="Dismiss health alert"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total tenants"
              value={tenantCount}
              icon={<Users className="h-6 w-6" />}
              loading={loading}
            />
            <StatCard
              title="Healthy containers"
              value={healthyCount}
              subtitle={`of ${containers.length} total`}
              icon={<Activity className="h-6 w-6" />}
              loading={loading}
            />
            <StatCard
              title="Unhealthy containers"
              value={unhealthyCount}
              subtitle="requires attention"
              icon={<Server className="h-6 w-6" />}
              loading={loading}
            />
            <StatCard
              title="Total backups"
              value={backups}
              icon={<Archive className="h-6 w-6" />}
              loading={loading}
            />
          </div>

          {/* Tenants */}
          <section id="tenants" className="mb-10">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-foreground">Tenants</h2>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tenants..."
                  className="input w-full sm:w-56"
                />
                <select
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  className="input w-full sm:w-44"
                >
                  <option value="all">All services</option>
                  {ALL_SERVICES.map((s) => (
                    <option key={s} value={s}>
                      {SERVICE_LABELS[s]}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" size="sm" onClick={load}>
                  Refresh
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : filteredTenants.length === 0 ? (
              <div className="card text-center text-muted">
                {tenants.length === 0
                  ? 'No tenants yet. Create one to get started.'
                  : 'No tenants match your filters.'}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-light bg-surface">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-light/30 text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Name</th>
                        <th className="px-6 py-4 font-semibold">Created</th>
                        <th className="px-6 py-4 font-semibold">Services</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-light">
                      {filteredTenants.map((tenant) => (
                        <tr
                          key={tenant.name}
                          className="transition-colors hover:bg-surface-light/20"
                        >
                          <td className="px-6 py-4">
                            <Link
                              to={`/admin/tenants/${encodeURIComponent(tenant.name)}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {tenant.name}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-muted">
                            {new Date(tenant.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              {tenant.enabled_services.length === 0 && (
                                <Badge variant="muted">None</Badge>
                              )}
                              {tenant.enabled_services.map((svc) => (
                                <Badge key={svc} variant="default">
                                  <span className="mr-1">
                                    <ServiceIcon service={svc} className="inline h-3 w-3" />
                                  </span>
                                  {svc}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {confirmDelete === tenant.name ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-danger">Delete?</span>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setConfirmDelete(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleDelete(tenant.name)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </Button>
                                </div>
                              ) : (
                                <div className="relative" ref={openDropdown === tenant.name ? dropdownRef : undefined}>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      setOpenDropdown((prev) =>
                                        prev === tenant.name ? null : tenant.name,
                                      )
                                    }
                                    aria-label={`Actions for ${tenant.name}`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                  {openDropdown === tenant.name && (
                                    <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-surface-light bg-surface p-1 shadow-lg">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCredentialsTenant(tenant)
                                          setOpenDropdown(null)
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-light"
                                      >
                                        <Eye className="h-4 w-4 text-muted" />
                                        Credentials
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setManageTenant(tenant.name)
                                          setOpenDropdown(null)
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-light"
                                      >
                                        <Settings className="h-4 w-4 text-muted" />
                                        Manage services
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setConfirmDelete(tenant.name)
                                          setOpenDropdown(null)
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* System health */}
          <section id="health" className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">System health</h2>
              {lastUpdated && (
                <span className="text-xs text-muted">
                  Last updated: {formatDateTime(lastUpdated.toISOString())}
                </span>
              )}
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Services
              </h3>
              {loading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {ALL_SERVICES.map((key) =>
                    renderServiceStatus(serviceHealth.find((s) => s.key === key)),
                  )}
                </div>
              )}
            </div>

            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Containers
            </h3>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : containers.length === 0 ? (
              <div className="card text-center text-muted">No container data available.</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {containers.map((c) => (
                  <div key={c.name} className="card flex flex-col justify-between">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="h-5 w-5 text-muted" />
                        <h3 className="truncate font-semibold text-foreground" title={c.name}>
                          {c.name}
                        </h3>
                      </div>
                      <Badge
                        variant={
                          c.status === 'running' ? 'success' : c.error ? 'danger' : 'warning'
                        }
                      >
                        {c.error ? 'error' : c.status}
                      </Badge>
                    </div>

                    {c.error ? (
                      <p className="text-xs text-danger">{c.error}</p>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-muted">
                            <span className="flex items-center gap-1">
                              <Cpu className="h-3 w-3" /> CPU
                            </span>
                            <span>{c.cpu_percent ?? 0}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-light">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${Math.min(100, c.cpu_percent ?? 0)}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-muted">
                            <span className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" /> Memory
                            </span>
                            <span>
                              {c.memory_usage_mb ?? 0} / {c.memory_limit_mb ?? 0} MB
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-light">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${memoryPercent(c)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Backups */}
          <section id="backups" className="mb-10">
            <BackupSection tenants={tenants} />
          </section>
        </div>
      </main>

      <CreateTenantModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(t) => {
          setCreatedTenant(t as Tenant)
          load()
        }}
      />

      <TenantCredentialsModal
        isOpen={!!credentialsTenant || !!createdTenant}
        onClose={() => {
          setCredentialsTenant(null)
          setCreatedTenant(null)
        }}
        tenant={createdTenant || credentialsTenant || undefined}
      />

      <ServiceManagerModal
        isOpen={!!manageTenant}
        onClose={() => setManageTenant(null)}
        tenantName={manageTenant}
        onUpdated={load}
      />
    </div>
  )
}
