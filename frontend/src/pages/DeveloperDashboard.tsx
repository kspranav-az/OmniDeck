import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from '../components/Sidebar'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { Tabs, TabList, TabTrigger, TabContent } from '../components/ui/Tabs'
import { ServiceIcon } from '../components/ServiceIcon'
import { useToast } from '../hooks/useToast'
import {
  getDeveloperMe,
  getDeveloperServices,
  getDeveloperUsage,
  testService,
  type ServiceDef,
  type Tenant,
  type Usage,
} from '../lib/api'
import { getConnectionString, getSnippets } from '../lib/serviceHelpers'
import {
  CheckCircle,
  Copy,
  Database,
  RefreshCw,
  XCircle,
  Zap,
  Box,
  FileJson,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

const ALL_SERVICES: { key: string; label: string }[] = [
  { key: 'postgres', label: 'PostgreSQL' },
  { key: 'mongo', label: 'MongoDB' },
  { key: 'redis', label: 'Redis' },
  { key: 'minio', label: 'MinIO' },
]

export default function DeveloperDashboard() {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [services, setServices] = useState<ServiceDef[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<Record<string, 'ok' | 'error' | 'loading'>>({})
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [me, svcData, usageData] = await Promise.all([
        getDeveloperMe(),
        getDeveloperServices(),
        getDeveloperUsage(),
      ])
      setTenant(me)
      setServices(svcData.services)
      setUsage(usageData)
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Failed to load dashboard', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const test = async (key: string) => {
    setStatuses((s) => ({ ...s, [key]: 'loading' }))
    try {
      await testService(key)
      setStatuses((s) => ({ ...s, [key]: 'ok' }))
    } catch (err) {
      setStatuses((s) => ({ ...s, [key]: 'error' }))
      toast.addToast(err instanceof Error ? err.message : `${key} test failed`, 'error')
    }
  }

  useEffect(() => {
    if (!services.length) return
    services.forEach((s) => test(s.key))
  }, [services])

  const enabledKeys = useMemo(() => new Set(services.map((s) => s.key)), [services])

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.addToast(`${label} copied`, 'success')
    } catch {
      toast.addToast('Failed to copy', 'error')
    }
  }

  const chartData = useMemo(() => {
    if (!usage) return []
    return [
      { name: 'Postgres', size: usage.postgres_size_mb || 0, count: usage.postgres_table_count || 0 },
      { name: 'MongoDB', size: usage.mongo_size_mb || 0, count: usage.mongo_collection_count || 0 },
      { name: 'Redis', size: 0, count: usage.redis_key_count || 0 },
      { name: 'MinIO', size: usage.minio_size_bytes ? Math.round(usage.minio_size_bytes / 1024 / 1024) : 0, count: usage.minio_object_count || 0 },
    ]
  }, [usage])

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <Sidebar mode="developer" projectName={tenant?.name} />

      <main className="pt-16 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Developer dashboard</h1>
            <p className="mt-1 text-sm text-muted">
              Manage your services, connection details, and usage.
            </p>
          </div>

          {/* Service cards */}
          <section id="services" className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Services</h2>
              <Button variant="secondary" size="sm" onClick={load}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {ALL_SERVICES.map((svc) => {
                  const enabled = enabledKeys.has(svc.key)
                  const creds = tenant?.credentials?.[svc.key]
                  const conn = creds ? getConnectionString(svc.key, creds) : ''
                  const snippets = creds ? getSnippets(svc.key, creds) : {}
                  const status = statuses[svc.key]

                  return (
                    <div
                      key={svc.key}
                      className={`card ${enabled ? '' : 'opacity-70'}`}
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <ServiceIcon service={svc.key} className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{svc.label}</h3>
                            {enabled ? (
                              status === 'ok' ? (
                                <Badge variant="success">
                                  <CheckCircle className="mr-1 inline h-3 w-3" /> Connected
                                </Badge>
                              ) : status === 'error' ? (
                                <Badge variant="danger">
                                  <XCircle className="mr-1 inline h-3 w-3" /> Unreachable
                                </Badge>
                              ) : (
                                <Badge variant="muted">Checking...</Badge>
                              )
                            ) : (
                              <Badge variant="muted">Disabled</Badge>
                            )}
                          </div>
                        </div>
                        {enabled && (
                          <Button
                            size="sm"
                            variant="secondary"
                            isLoading={status === 'loading'}
                            onClick={() => test(svc.key)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Test
                          </Button>
                        )}
                      </div>

                      {enabled ? (
                        <div className="space-y-4">
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                              Connection string
                            </label>
                            <div className="flex gap-2">
                              <input
                                readOnly
                                value={conn}
                                className="input flex-1 truncate font-mono text-xs"
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => copy(conn, `${svc.label} connection string`)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <Tabs defaultValue="Python">
                            <TabList>
                              {Object.keys(snippets).map((lang) => (
                                <TabTrigger key={lang} value={lang}>
                                  {lang}
                                </TabTrigger>
                              ))}
                            </TabList>
                            {Object.entries(snippets).map(([lang, code]) => (
                              <TabContent key={lang} value={lang}>
                                <div className="relative rounded-lg bg-black/40 p-4">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="absolute right-2 top-2"
                                    onClick={() => copy(code, `${lang} snippet`)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted">
                                    {code}
                                  </pre>
                                </div>
                              </TabContent>
                            ))}
                          </Tabs>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-surface-light bg-background p-6 text-center">
                          <p className="text-sm text-muted">Contact admin to enable {svc.label}.</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Usage */}
          <section id="usage" className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-foreground">Usage & observability</h2>
            {loading ? (
              <Skeleton className="h-80 w-full" />
            ) : !usage ? (
              <div className="card text-center text-muted">No usage data available.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="card lg:col-span-2">
                  <h3 className="mb-4 text-sm font-semibold text-foreground">Storage / counts</h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} />
                        <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1E293B',
                            borderColor: '#334155',
                            borderRadius: '12px',
                            color: '#F8FAFC',
                          }}
                        />
                        <Bar dataKey="size" name="Size (MB)" fill="#22C55E" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="count" name="Count" fill="#334155" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-4">
                  <MetricCard
                    icon={<Database className="h-5 w-5" />}
                    label="PostgreSQL size"
                    value={`${usage.postgres_size_mb || 0} MB`}
                    sub={`${usage.postgres_table_count || 0} tables`}
                    error={usage.postgres_error}
                  />
                  <MetricCard
                    icon={<FileJson className="h-5 w-5" />}
                    label="MongoDB size"
                    value={`${usage.mongo_size_mb || 0} MB`}
                    sub={`${usage.mongo_collection_count || 0} collections`}
                    error={usage.mongo_error}
                  />
                  <MetricCard
                    icon={<Zap className="h-5 w-5" />}
                    label="Redis keys"
                    value={usage.redis_key_count || 0}
                    sub="keys scanned"
                    error={usage.redis_error}
                  />
                  <MetricCard
                    icon={<Box className="h-5 w-5" />}
                    label="MinIO objects"
                    value={usage.minio_object_count || 0}
                    sub={`${((usage.minio_size_bytes || 0) / 1024 / 1024).toFixed(2)} MB`}
                    error={usage.minio_error}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  error,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub: string
  error?: string
}) {
  return (
    <div className="card flex items-start justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        {error ? (
          <p className="mt-1 text-xs text-danger">{error}</p>
        ) : (
          <p className="mt-1 text-xs text-muted">{sub}</p>
        )}
      </div>
      <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
    </div>
  )
}
