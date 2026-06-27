import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { ServiceIcon } from '../ServiceIcon'
import { createTenant } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Check, Loader2 } from 'lucide-react'

const ALL_SERVICES = [
  { key: 'postgres', label: 'PostgreSQL' },
  { key: 'mongo', label: 'MongoDB' },
  { key: 'redis', label: 'Redis' },
  { key: 'minio', label: 'MinIO' },
]

const STEPS = [
  { label: 'Validating', description: 'Checking tenant name and services' },
  { label: 'Provisioning services', description: 'Creating databases, buckets, and credentials' },
  { label: 'Done', description: 'Tenant ready' },
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
  const [step, setStep] = useState(0)
  const toast = useToast()

  useEffect(() => {
    if (!isOpen) {
      setName('')
      setSelected(ALL_SERVICES.map((s) => s.key))
      setStep(0)
      setIsLoading(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isLoading || step !== 0) return
    const timer = setTimeout(() => setStep(1), 400)
    return () => clearTimeout(timer)
  }, [isLoading, step])

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
    setStep(0)
    try {
      const tenant = await createTenant(name, selected)
      setStep(2)
      toast.addToast(`Tenant "${tenant.name}" created`, 'success')
      onCreated({
        name: tenant.name,
        login_password: tenant.login_password || '',
        credentials: tenant.credentials,
      })
      setName('')
      setSelected(ALL_SERVICES.map((s) => s.key))
      setTimeout(() => {
        setIsLoading(false)
        setStep(0)
        onClose()
      }, 600)
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Failed to create tenant', 'error')
      setIsLoading(false)
      setStep(0)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create tenant"
      description="Provision a new tenant with the selected services."
    >
      <form onSubmit={handleSubmit} className="relative space-y-5">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-surface/95 p-6 text-center">
            <div className="mb-6 flex w-full items-center justify-between">
              {STEPS.map((s, idx) => (
                <div key={s.label} className="flex flex-1 flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                      idx <= step
                        ? 'border-primary bg-primary text-white'
                        : 'border-surface-light text-muted'
                    }`}
                  >
                    {idx < step ? (
                      <Check className="h-4 w-4" />
                    ) : idx === step ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={`mt-2 text-xs font-medium ${
                      idx <= step ? 'text-foreground' : 'text-muted'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm font-medium text-foreground">{STEPS[step].label}</p>
            <p className="text-xs text-muted">{STEPS[step].description}</p>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Tenant name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            placeholder="acme-corp"
            disabled={isLoading}
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
                  disabled={isLoading}
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
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
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
