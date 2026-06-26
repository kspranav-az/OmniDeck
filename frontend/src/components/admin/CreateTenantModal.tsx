import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { ServiceIcon } from '../ServiceIcon'
import { createTenant } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Check } from 'lucide-react'

const ALL_SERVICES = [
  { key: 'postgres', label: 'PostgreSQL' },
  { key: 'mongo', label: 'MongoDB' },
  { key: 'redis', label: 'Redis' },
  { key: 'minio', label: 'MinIO' },
]

interface CreateTenantModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (tenant: { name: string; login_password: string; credentials: Record<string, any> }) => void
}

export function CreateTenantModal({ isOpen, onClose, onCreated }: CreateTenantModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>(ALL_SERVICES.map((s) => s.key))
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const toggle = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (selected.length === 0) {
      toast.addToast('Select at least one service', 'error')
      return
    }
    setIsLoading(true)
    try {
      const tenant = await createTenant(name, selected)
      toast.addToast(`Tenant "${tenant.name}" created`, 'success')
      onCreated({
        name: tenant.name,
        login_password: tenant.login_password || '',
        credentials: tenant.credentials,
      })
      setName('')
      setSelected(ALL_SERVICES.map((s) => s.key))
      onClose()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Failed to create tenant', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create tenant"
      description="Provision a new tenant with the selected services."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Tenant name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            placeholder="acme-corp"
          />
          <p className="mt-1 text-xs text-muted">Lowercase letters, numbers, dashes, underscores.</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Services</label>
          <div className="grid grid-cols-2 gap-3">
            {ALL_SERVICES.map((svc) => {
              const checked = selected.includes(svc.key)
              return (
                <button
                  key={svc.key}
                  type="button"
                  onClick={() => toggle(svc.key)}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                    checked
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-surface-light bg-background hover:border-surface-light'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                      checked ? 'border-primary bg-primary' : 'border-surface-light'
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                  <ServiceIcon service={svc.key} className="h-5 w-5 text-muted" />
                  <span className="text-sm font-medium text-foreground">{svc.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create tenant
          </Button>
        </div>
      </form>
    </Modal>
  )
}
