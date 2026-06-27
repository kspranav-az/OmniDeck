import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from '../components/Sidebar'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { Tabs, TabList, TabTrigger, TabContent } from '../components/ui/Tabs'
import { ServiceIcon } from '../components/ServiceIcon'
import { useToast } from '../hooks/useToast'
import { useInterval } from '../hooks/useInterval'
import {
  getDeveloperMe,
  getDeveloperServices,
  getDeveloperUsage,
  testService,
  getDeveloperUsageHistory,
  type ServiceDef,
  type Tenant,
  type Usage,
  type UsageHistoryResponse,
} from '../lib/api'
import {
  getConnectionString,
  getSnippets,
  SERVICE_COLORS,
  SERVICE_DOCS,
} from '../lib/serviceHelpers'
import {
  copyToClipboard,
  downloadTextFile,
  formatRelativeTime,
  credentialsToEnv,
} from '../lib/utils'
import {
  CheckCircle,
  Copy,
  Database,
  RefreshCw,
  XCircle,
  Zap,
  Box,
  FileJson,
  BookOpen,
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts'

const ALL_SERVICES: { key: string; label: string }[] = [
  { key: 'postgres', label: 'PostgreSQL' },
  { key: 'mongo', label: 'MongoDB' },
  { key: 'redis', label: 'Redis' },
  { key: 'minio', label: 'MinIO' },
]

const SNIPPET_LANG_MAP: Record<string, string> = {
  Python: 'python',
  'Node.js': 'javascript',
  Go: 'go',
  curl: 'bash',
}

function buildEnvFile(credentials: Record<string, Record<string, unknown>>): string {
  const flat: Record<string, string | number> = {}
  Object.entries(credentials).forEach(([svc, creds]) => {
    Object.entries(creds).forEach(([field, value]) => {
      if (value !== undefined && value !== null) {
        flat[`${svc}_${field}`] = typeof value === 'number' ? value : String(value)
      }
    })
  })
  return credentialsToEnv(flat)
}

export default function DeveloperDashboard() {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [services, setServices] = useState<ServiceDef[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<Record<string, 'ok' | 'error' | 'loading'>>({})
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [historyService, setHistoryService] = useState<string>('postgres')
  const [history, setHistory] = useState<UsageHistoryResponse | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const toast = useToast()

  const enabledKeys = useMemo(() => new Set(services.map((s) => s.key)), [services])

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

  const testAllEnabled = () => {
    setLastChecked(new Date())
    services.filter((s) => enabledKeys.has(s.key)).forEach((s) => test(s.key))
  }

  useEffect(() => {
    if (!services.length) return
    testAllEnabled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services])

  useInterval(() => {
    if (!services.length) return
    testAllEnabled()
  }, 30000)

  useEffect(() => {
    if (!tenant || !historyService) return
    const loadHistory = async () => {
      setHistoryLoading(true)
      try {
        const data = await getDeveloperUsageHistory(historyService, 24)
        setHistory(data)
      } catch (err) {
        toast.addToast(err instanceof Error ? err.message : 'Failed to load usage history', 'error')
      } finally {
        setHistoryLoading(false)
      }
    }
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, historyService])

  const copy = async (text: string, label: string) => {
    try {
      await copyToClipboard(text)
      toast.addToast(`${label} copied`, 'success')
    } catch {
      toast.addToast('Failed to copy', 'error')
    }
  }

  const copyAllCredentials = () => {
    if (!tenant) return
    copy(JSON.stringify(tenant.credentials, null, 2), 'All credentials JSON')
  }

  const downloadEnv = () => {
    if (!tenant) return
    const env = buildEnvFile(tenant.credentials as Record<string, Record<string, unknown>>)
    downloadTextFile('omnideck-credentials.env', env)
  }

  const storageChartData = useMemo(() => {
    if (!usage) return []
    return [
      { name: 'Postgres', value: usage.postgres_size_mb || 0, key: 'postgres' },
      { name: 'MongoDB', value: usage.mongo_size_mb || 0, key: 'mongo' },
      { name: 'Redis', value: 0, key: 'redis' },
      { name: 'MinIO', value: usage.minio_size_bytes ? Math.round(usage.minio_size_bytes / 1024 / 1024) : 0, key: 'minio' },
    ]
  }, [usage])

  const countChartData = useMemo(() => {
    if (!usage) return []
    return [
      { name: 'Postgres', value: usage.postgres_table_count || 0, key: 'postgres' },
      { name: 'MongoDB', value: usage.mongo_collection_count || 0, key: 'mongo' },
      { name: 'Redis', value: usage.redis_key_count || 0, key: 'redis' },
      { name: 'MinIO', value: usage.minio_object_count || 0, key: 'minio' },
    ]
  }, [usage])

  const historyChartData = useMemo(() => {
    if (!history?.points) return []
    return history.points.map((p) => ({
      hour: new Date(p.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: p.value,
    }))
  }, [history])

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <Sidebar mode="developer" projectName={tenant?.name} />

      <main id="main-content" className="pt-16 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Developer dashboard</h1>
            <p className="mt-1 text-sm text-muted">
              Manage your services, connection details, and usage.
            </p>
          </div>

          {/* Service cards */}
          <section id="services" className="mb-10">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Services</h2>
                {lastChecked && (
                  <p className="mt-0.5 text-xs text-muted">
                    Last checked {formatRelativeTime(lastChecked)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={copyAllCredentials}>
                  <Copy className="h-4 w-4" /> Copy all JSON
                </Button>
                <Button variant="secondary" size="sm" onClick={downloadEnv}>
                  <FileJson className="h-4 w-4" /> Download .env
                </Button>
                <Button variant="secondary" size="sm" onClick={load}>
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
              </div>
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
                  const accent = SERVICE_COLORS[svc.key] ?? '#94A3B8'

                  return (
                    <div
                      key={svc.key}
                      className={`card ${enabled ? '' : 'opacity-70'}`}
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: `${accent}1A`,
                              color: accent,
                            }}
                          >
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
                        <div className="flex items-center gap-1">
                          <a
                            href={SERVICE_DOCS[svc.key]}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-light hover:text-foreground"
                            aria-label={`${svc.label} documentation`}
                          >
                            <BookOpen className="h-4 w-4" />
                          </a>
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
                      </div>

                      {enabled ? (
                        <div className="space-y-4">
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                              Connection string
                            </label>
                            <div className="flex gap-2">
                              <div
                                className="input flex-1 overflow-hidden border-l-4 font-mono text-xs"
                                style={{ borderLeftColor: accent }}
                              >
                                <span className="block truncate text-foreground">{conn}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                aria-label={`Copy ${svc.label} connection string`}
                                onClick={() => copy(conn, `${svc.label} connection string`)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <Tabs defaultValue={Object.keys(snippets)[0] ?? 'Python'}>
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
                                    aria-label={`Copy ${lang} snippet`}
                                    onClick={() => copy(code, `${lang} snippet`)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <SyntaxHighlighter
                                    language={SNIPPET_LANG_MAP[lang] ?? lang.toLowerCase()}
                                    style={vscDarkPlus}
                                    customStyle={{
                                      background: 'transparent',
                                      padding: 0,
                                      margin: 0,
                                      fontSize: '0.75rem',
                                      overflowX: 'auto',
                                    }}
                                    PreTag="div"
                                  >
                                    {code}
                                  </SyntaxHighlighter>
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
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="card lg:col-span-2 space-y-8">
                    <div>
                      <h3 className="mb-4 text-sm font-semibold text-foreground">Storage (MB)</h3>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={storageChartData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
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
                            <Bar dataKey="value" name="Size (MB)" radius={[4, 4, 0, 0]}>
                              {storageChartData.map((entry) => (
                                <Cell key={`cell-${entry.key}`} fill={SERVICE_COLORS[entry.key]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-4 text-sm font-semibold text-foreground">Object counts</h3>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={countChartData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
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
                            <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                              {countChartData.map((entry) => (
                                <Cell key={`cell-${entry.key}`} fill={SERVICE_COLORS[entry.key]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <MetricCard
                      icon={<Database className="h-5 w-5" />}
                      label="PostgreSQL size"
                      value={`${usage.postgres_size_mb || 0} MB`}
                      sub={`${usage.postgres_table_count || 0} tables`}
                      error={usage.postgres_error}
                      color={SERVICE_COLORS.postgres}
                    />
                    <MetricCard
                      icon={<FileJson className="h-5 w-5" />}
                      label="MongoDB size"
                      value={`${usage.mongo_size_mb || 0} MB`}
                      sub={`${usage.mongo_collection_count || 0} collections`}
                      error={usage.mongo_error}
                      color={SERVICE_COLORS.mongo}
                    />
                    <MetricCard
                      icon={<Zap className="h-5 w-5" />}
                      label="Redis keys"
                      value={usage.redis_key_count || 0}
                      sub="keys scanned"
                      error={usage.redis_error}
                      color={SERVICE_COLORS.redis}
                    />
                    <MetricCard
                      icon={<Box className="h-5 w-5" />}
                      label="MinIO objects"
                      value={usage.minio_object_count || 0}
                      sub={`${((usage.minio_size_bytes || 0) / 1024 / 1024).toFixed(2)} MB`}
                      error={usage.minio_error}
                      color={SERVICE_COLORS.minio}
                    />
                  </div>
                </div>

                <div className="card mt-4">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Usage history</h3>
                    <select
                      className="input py-1.5 text-sm"
                      value={historyService}
                      onChange={(e) => setHistoryService(e.target.value)}
                      aria-label="Service usage history"
                    >
                      {ALL_SERVICES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {historyLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : !history?.points.length ? (
                    <div className="text-center text-sm text-muted">No history data available.</div>
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyChartData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="hour" stroke="#94A3B8" fontSize={12} tickLine={false} />
                          <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1E293B',
                              borderColor: '#334155',
                              borderRadius: '12px',
                              color: '#F8FAFC',
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            name={history.service}
                            stroke={SERVICE_COLORS[history.service]}
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
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
  color,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub: string
  error?: string
  color?: string
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
      <div
        className="rounded-lg p-2"
        style={{
          backgroundColor: color ? `${color}1A` : undefined,
          color: color ?? 'var(--color-primary)',
        }}
      >
        {icon}
      </div>
    </div>
  )
}
