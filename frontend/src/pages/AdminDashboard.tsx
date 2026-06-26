import { useEffect, useMemo, useState } from 'react'
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
import {
  listTenants,
  deleteTenant,
  getHealth,
  listBackups,
  type Tenant,
  type Container,
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
} from 'lucide-react'

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
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [tenantData, healthData, backupData] = await Promise.all([
        listTenants(),
        getHealth(),
        listBackups(),
      ])
      setTenants(tenantData)
      setContainers(healthData.containers)
      setTenantCount(healthData.tenant_count)
      setBackups(backupData.length)
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Failed to load dashboard', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const healthyCount = useMemo(
    () => containers.filter((c) => c.status === 'running').length,
    [containers],
  )
  const unhealthyCount = containers.length - healthyCount

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete tenant "${name}"? This cannot be undone.`)) return
    try {
      await deleteTenant(name)
      toast.addToast(`Tenant "${name}" deleted`, 'success')
      await load()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  const memoryPercent = (c: Container) => {
    if (!c.memory_usage_mb || !c.memory_limit_mb || c.memory_limit_mb === 0) return 0
    return Math.min(100, Math.round((c.memory_usage_mb / c.memory_limit_mb) * 100))
  }

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <Sidebar mode="admin" />

      <main className="pt-16 lg:pt-0">
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
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Tenants</h2>
              <Button variant="secondary" size="sm" onClick={load}>
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : tenants.length === 0 ? (
              <div className="card text-center text-muted">
                No tenants yet. Create one to get started.
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
                      {tenants.map((tenant) => (
                        <tr key={tenant.name} className="transition-colors hover:bg-surface-light/20">
                          <td className="px-6 py-4 font-medium text-foreground">{tenant.name}</td>
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
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setCredentialsTenant(tenant)}
                              >
                                <Eye className="h-4 w-4" />
                                Credentials
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setManageTenant(tenant.name)}
                              >
                                <Settings className="h-4 w-4" />
                                Services
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleDelete(tenant.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
            <h2 className="mb-4 text-xl font-bold text-foreground">System health</h2>
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
                  <div
                    key={c.name}
                    className="card flex flex-col justify-between"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="h-5 w-5 text-muted" />
                        <h3 className="truncate font-semibold text-foreground" title={c.name}>
                          {c.name}
                        </h3>
                      </div>
                      <Badge
                        variant={
                          c.status === 'running'
                            ? 'success'
                            : c.error
                            ? 'danger'
                            : 'warning'
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
