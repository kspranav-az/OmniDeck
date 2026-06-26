const API_BASE = '/api'

export interface User {
  user_type: 'admin' | 'developer'
  username: string
  enabled_services?: string[]
}

export interface ServiceDef {
  key: string
  label: string
  description: string
  enabled?: boolean
}

export interface Credentials {
  user?: string
  password?: string
  database?: string
  host?: string
  port?: number
  access_key?: string
  secret_key?: string
  bucket?: string
}

export interface Tenant {
  id: number
  name: string
  created_at: string
  enabled_services: string[]
  credentials: Record<string, Credentials>
  login_password?: string
}

export interface Container {
  name: string
  status: string
  cpu_percent?: number
  memory_usage_mb?: number
  memory_limit_mb?: number
  error?: string
}

export interface Health {
  containers: Container[]
  tenant_count: number
}

export interface Backup {
  service: string
  tenant: string | null
  path: string
}

export interface Usage {
  postgres_size_mb?: number
  postgres_table_count?: number
  postgres_error?: string
  mongo_size_mb?: number
  mongo_collection_count?: number
  mongo_error?: string
  redis_key_count?: number
  redis_error?: string
  minio_size_bytes?: number
  minio_object_count?: number
  minio_error?: string
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText
    try {
      const data = await res.json()
      message = data.detail || data.message || JSON.stringify(data)
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export async function getMe(): Promise<User> {
  return handleResponse<User>(await fetch(`${API_BASE}/auth/me`))
}

export async function login(username: string, password: string): Promise<User> {
  return handleResponse<User>(
    await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  )
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST' })
}

export async function listTenants(): Promise<Tenant[]> {
  return handleResponse<Tenant[]>(await fetch(`${API_BASE}/admin/tenants`))
}

export async function createTenant(name: string, services: string[]): Promise<Tenant> {
  const form = new FormData()
  form.append('name', name)
  form.append('services', services.join(','))
  return handleResponse<Tenant>(
    await fetch(`${API_BASE}/admin/tenants`, {
      method: 'POST',
      body: form,
    }),
  )
}

export async function deleteTenant(name: string): Promise<void> {
  await handleResponse<{ status: string }>(
    await fetch(`${API_BASE}/admin/tenants/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  )
}

export async function getTenantServices(name: string): Promise<{ tenant: string; services: ServiceDef[] }> {
  return handleResponse<{ tenant: string; services: ServiceDef[] }>(
    await fetch(`${API_BASE}/admin/tenants/${encodeURIComponent(name)}/services`),
  )
}

export async function updateTenantServices(name: string, enabled: string[]): Promise<void> {
  await handleResponse<{ enabled: string[] }>(
    await fetch(`${API_BASE}/admin/tenants/${encodeURIComponent(name)}/services`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),
  )
}

export async function getHealth(): Promise<Health> {
  return handleResponse<Health>(await fetch(`${API_BASE}/admin/health`))
}

export async function listBackups(service?: string, tenant?: string): Promise<Backup[]> {
  const params = new URLSearchParams()
  if (service) params.append('service', service)
  if (tenant) params.append('tenant', tenant)
  const res = await fetch(`${API_BASE}/admin/backups?${params.toString()}`)
  const data = await handleResponse<{ backups: Backup[] }>(res)
  return data.backups
}

export async function createBackup(service: string, tenant: string): Promise<void> {
  const form = new FormData()
  form.append('service', service)
  form.append('tenant', tenant)
  await handleResponse<{ status: string }>(
    await fetch(`${API_BASE}/admin/backups`, {
      method: 'POST',
      body: form,
    }),
  )
}

export async function restoreBackup(service: string, tenant: string, path: string): Promise<void> {
  const form = new FormData()
  form.append('service', service)
  form.append('tenant', tenant)
  form.append('path', path)
  await handleResponse<{ status: string }>(
    await fetch(`${API_BASE}/admin/restore`, {
      method: 'POST',
      body: form,
    }),
  )
}

export async function restoreVolume(volume: string, path: string, service: string): Promise<void> {
  const form = new FormData()
  form.append('volume', volume)
  form.append('path', path)
  form.append('service', service)
  await handleResponse<{ status: string }>(
    await fetch(`${API_BASE}/admin/restore-volume`, {
      method: 'POST',
      body: form,
    }),
  )
}

export async function snapshotVolume(volume: string): Promise<void> {
  const form = new FormData()
  form.append('volume', volume)
  await handleResponse<{ status: string }>(
    await fetch(`${API_BASE}/admin/snapshot-volume`, {
      method: 'POST',
      body: form,
    }),
  )
}

// Developer
export async function getDeveloperMe(): Promise<Tenant> {
  return handleResponse<Tenant>(await fetch(`${API_BASE}/developer/me`))
}

export async function getDeveloperServices(): Promise<{ enabled: string[]; services: ServiceDef[] }> {
  return handleResponse<{ enabled: string[]; services: ServiceDef[] }>(
    await fetch(`${API_BASE}/developer/services`),
  )
}

export async function getDeveloperUsage(): Promise<Usage> {
  return handleResponse<Usage>(await fetch(`${API_BASE}/developer/usage`))
}

export async function testService(serviceKey: string): Promise<void> {
  await handleResponse<{ status: string }>(
    await fetch(`${API_BASE}/developer/services/${encodeURIComponent(serviceKey)}/test`, {
      method: 'POST',
    }),
  )
}
