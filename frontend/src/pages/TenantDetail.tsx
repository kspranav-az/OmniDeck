import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  listTenants,
  getTenantServices,
  updateTenantServices,
  listBackups,
  getUsageHistory,
  restoreBackup,
  type Tenant,
  type ServiceDef,
  type Backup,
  type UsageHistoryPoint,
} from '../lib/api'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { Tabs, TabList, TabTrigger, TabContent } from '../components/ui/Tabs'
import { Switch } from '../components/ui/Switch'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ServiceIcon } from '../components/ServiceIcon'
import { Sidebar } from '../components/Sidebar'
import { useToast } from '../hooks/useToast'
import { formatBytes, formatRelativeTime, formatDateTime, copyToClipboard } from '../lib/utils'
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  Key,
  Database,
  HardDrive,
  RotateCcw,
  Activity,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

const CREDENTIAL_FIELDS: Record<string, string[]> = {
  postgres: ['host', 'port', 'database', 'user', 'password'],
  mongo: ['host', 'port', 'database', 'user', 'password'],
  redis: ['host', 'port', 'user', 'password'],
  minio: ['host', 'port', 'bucket', 'access_key', 'secret_key'],
}

export default function TenantDetail() {
  const { name } = useParams<{ name: string }>()
  const tenantName = name || ''
  const toast = useToast()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [services, setServices] = useState<ServiceDef[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [usagePoints, setUsagePoints] = useState<UsageHistoryPoint[]>([])
  const [usageService, setUsageService] = useState<string>('')
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [usageLoading, setUsageLoading] = useState(false)
  const [savingServices, setSavingServices] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null)
  const [restoring, setRestoring] = useState(false)

  const load = async () => {
    if (!tenantName) return
    setLoading(true)
    setUsageService('')
    setUsagePoints([])
    try {
      const [tenantsData, servicesData, backupsData] = await Promise.all([
        listTenants(),
        getTenantServices(tenantName),
        listBackups(undefined, tenantName),
      ])
      const found = tenantsData.find((t) => t.name === tenantName) || null
      setTenant(found)
      setServices(servicesData.services)
      setBackups(backupsData)
      if (found && found.enabled_services.length > 0) {
        setUsageService(found.enabled_services[0])
      }
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Failed to load tenant', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantName])

  useEffect(() => {
    if (!tenantName || !usageService) return
    setUsageLoading(true)
    getUsageHistory(tenantName, usageService, 24)
      .then((data) => setUsagePoints(data.points))
      .catch((err) => toast.addToast(err instanceof Error ? err.message : 'Failed to load usage', 'error'))
      .finally(() => setUsageLoading(false))
  }, [tenantName, usageService, toast])

  const groupedBackups = useMemo(() => {
    const map: Record<string, Backup[]> = {}
    for (const b of backups) {
      if (!map[b.service]) map[b.service] = []
      map[b.service].push(b)
    }
    return map
  }, [backups])

  const backupFileName = (path: string) => path.split('/').pop() || path

  const handleCopy = async (text: string, label: string) => {
    try {
      await copyToClipboard(text)
      toast.addToast(`${label} copied`, 'success')
    } catch {
      toast.addToast('Failed to copy', 'error')
    }
  }

  const toggleService = (key: string) => {
    setServices((prev) => prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s)))
  }

  const handleSaveServices = async () => {
    if (!tenantName) return
    setSavingServices(true)
    try {
      await updateTenantServices(
        tenantName,
        services.filter((s) => s.enabled).map((s) => s.key),
      )
      toast.addToast('Services updated', 'success')
      await load()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setSavingServices(false)
    }
  }

  const handleRestore = async () => {
    if (!restoreTarget || !restoreTarget.tenant) return
    setRestoring(true)
    try {
      await restoreBackup(restoreTarget.service, restoreTarget.tenant, restoreTarget.path)
      toast.addToast(`${restoreTarget.service} restore started for ${restoreTarget.tenant}`, 'success')
      setRestoreTarget(null)
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Restore failed', 'error')
    } finally {
      setRestoring(false)
    }
  }

  const renderOverview = () => {
    if (!tenant) return null
    const serviceKeys = Object.keys(tenant.credentials)
    return (
      <div className="space-y-6">
        <div className="card">
          <h3 className="mb-3 text-lg font-semibold text-foreground">Tenant details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Name</p>
              <p className="font-medium text-foreground">{tenant.name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Created</p>
              <p className="text-foreground">{formatDateTime(tenant.created_at)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Enabled services</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {tenant.enabled_services.length === 0 && <Badge variant="muted">None</Badge>}
                {tenant.enabled_services.map((svc) => (
                  <Badge key={svc} variant="default">
                    <ServiceIcon service={svc} className="mr-1 inline h-3 w-3" />
                    {svc}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {tenant.login_password && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-primary">
              <Key className="h-4 w-4" />
              Developer login password
            </label>
            <div className="flex gap-2">
              <Input
                type={showPasswords ? 'text' : 'password'}
                value={tenant.login_password}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowPasswords((s) => !s)}
                aria-label={showPasswords ? 'Hide password' : 'Show password'}
              >
                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleCopy(tenant.login_password || '', 'Login password')}
                aria-label="Copy login password"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-warning">
              This password is shown only once. Save it securely.
            </p>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Credentials</h3>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowPasswords((s) => !s)}
            >
              {showPasswords ? (
                <>
                  <EyeOff className="h-4 w-4" /> Hide secrets
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" /> Reveal secrets
                </>
              )}
            </Button>
          </div>
          {serviceKeys.length === 0 ? (
            <div className="card text-center text-muted">No credentials available.</div>
          ) : (
            <Tabs defaultValue={serviceKeys[0]}>
              <TabList className="mb-2">
                {serviceKeys.map((key) => (
                  <TabTrigger key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <ServiceIcon service={key} className="h-4 w-4" />
                      {key}
                    </span>
                  </TabTrigger>
                ))}
              </TabList>
              {serviceKeys.map((key) => {
                const creds = (tenant.credentials[key] || {}) as Record<string, string | undefined>
                return (
                  <TabContent key={key} value={key}>
                    <div className="grid gap-3">
                      {(CREDENTIAL_FIELDS[key] || Object.keys(creds)).map((field) => (
                        <div key={field}>
                          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                            {field.replace('_', ' ')}
                          </label>
                          <div className="flex gap-2">
                            <Input
                              type={
                                !showPasswords &&
                                (field === 'password' || field === 'secret_key')
                                  ? 'password'
                                  : 'text'
                              }
                              value={String(creds[field] ?? '')}
                              readOnly
                              className="font-mono text-sm"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => handleCopy(String(creds[field] ?? ''), `${key} ${field}`)}
                              aria-label={`Copy ${field}`}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabContent>
                )
              })}
            </Tabs>
          )}
        </div>
      </div>
    )
  }

  const renderServices = () => (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Manage services</h3>
        <Button onClick={handleSaveServices} isLoading={savingServices}>
          Save changes
        </Button>
      </div>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((svc) => (
            <div
              key={svc.key}
              className="flex items-center justify-between rounded-xl border border-surface-light bg-background p-4"
            >
              <div className="flex items-center gap-3">
                <ServiceIcon service={svc.key} className="h-5 w-5 text-muted" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{svc.label}</p>
                  <p className="text-xs text-muted">{svc.description}</p>
                </div>
              </div>
              <Switch checked={!!svc.enabled} onChange={() => toggleService(svc.key)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderBackups = () => (
    <div className="space-y-4">
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : backups.length === 0 ? (
        <div className="card text-center text-muted">No backups found for this tenant.</div>
      ) : (
        Object.keys(groupedBackups).map((service) => (
          <div key={service} className="card">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <ServiceIcon service={service} className="h-4 w-4 text-muted" />
              {service}
            </div>
            <ul className="space-y-2">
              {groupedBackups[service].map((backup) => (
                <li
                  key={backup.path}
                  className="flex flex-col gap-2 rounded-lg border border-surface-light bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-muted">
                      {backupFileName(backup.path)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{formatBytes(backup.size_bytes)}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(backup.created_at)}</span>
                      <Badge
                        variant={
                          backup.status === 'completed'
                            ? 'success'
                            : backup.status === 'failed'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {backup.status}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRestoreTarget(backup)}
                    aria-label={`Restore ${backupFileName(backup.path)}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )

  const renderUsage = () => {
    const enabled = tenant?.enabled_services || []
    return (
      <div className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-foreground">Usage history</h3>
          <div className="flex items-center gap-2">
            <ServiceIcon service={usageService} className="h-4 w-4 text-muted" />
            <select
              value={usageService}
              onChange={(e) => setUsageService(e.target.value)}
              className="input w-full sm:w-44"
            >
              {enabled.length === 0 && <option value="">No services</option>}
              {enabled.map((svc) => (
                <option key={svc} value={svc}>
                  {svc}
                </option>
              ))}
            </select>
          </div>
        </div>
        {usageLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : usagePoints.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-surface-light bg-background text-sm text-muted">
            No usage data available.
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usagePoints} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                  stroke="rgba(148,163,184,0.4)"
                  tick={{ fill: 'rgba(148,163,184,0.7)', fontSize: 12 }}
                />
                <YAxis
                  stroke="rgba(148,163,184,0.4)"
                  tick={{ fill: 'rgba(148,163,184,0.7)', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(148,163,184,0.2)',
                    borderRadius: '0.5rem',
                  }}
                  labelFormatter={(label) => formatDateTime(label as string)}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#22C55E"
                  fill="url(#usageGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    )
  }

  if (!tenantName) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted">
        Tenant name missing.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <Sidebar mode="admin" />
      <main id="main-content" className="pt-16 lg:pt-0">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center gap-4">
            <Link
              to="/admin"
              className="btn btn-secondary px-3 py-1.5 text-xs"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{tenantName}</h1>
              <p className="text-sm text-muted">Tenant details and management</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !tenant ? (
            <div className="card text-center text-muted">Tenant not found.</div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="overview">
              <TabList className="mb-6">
                <TabTrigger value="overview">
                  <span className="flex items-center gap-2">
                    <Key className="h-4 w-4" /> Overview
                  </span>
                </TabTrigger>
                <TabTrigger value="services">
                  <span className="flex items-center gap-2">
                    <Database className="h-4 w-4" /> Services
                  </span>
                </TabTrigger>
                <TabTrigger value="backups">
                  <span className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4" /> Backups
                  </span>
                </TabTrigger>
                <TabTrigger value="usage">
                  <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Usage
                  </span>
                </TabTrigger>
              </TabList>
              <TabContent value="overview">{renderOverview()}</TabContent>
              <TabContent value="services">{renderServices()}</TabContent>
              <TabContent value="backups">{renderBackups()}</TabContent>
              <TabContent value="usage">{renderUsage()}</TabContent>
            </Tabs>
          )}
        </div>
      </main>

      <Modal
        isOpen={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        title="Confirm restore"
        description="This will overwrite the tenant data with the selected backup."
      >
        {restoreTarget && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Restore <Badge>{restoreTarget.service}</Badge> backup for{' '}
              <strong>{restoreTarget.tenant}</strong>?
            </p>
            <p className="rounded-lg bg-background p-3 font-mono text-xs text-muted">
              {restoreTarget.path}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRestoreTarget(null)}>
                Cancel
              </Button>
              <Button isLoading={restoring} onClick={handleRestore}>
                <RotateCcw className="h-4 w-4" /> Restore
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
