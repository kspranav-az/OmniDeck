import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Switch } from '../ui/Switch'
import { Skeleton } from '../ui/Skeleton'
import { ServiceIcon } from '../ServiceIcon'
import { getTenantServices, updateTenantServices, type ServiceDef } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

interface ServiceManagerModalProps {
  isOpen: boolean
  onClose: () => void
  tenantName: string | null
  onUpdated: () => void
}

export function ServiceManagerModal({ isOpen, onClose, tenantName, onUpdated }: ServiceManagerModalProps) {
  const [services, setServices] = useState<ServiceDef[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!isOpen || !tenantName) return
    setLoading(true)
    getTenantServices(tenantName)
      .then((data) => setServices(data.services))
      .catch((err) => toast.addToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [isOpen, tenantName, toast])

  const toggle = (key: string) => {
    setServices((prev) =>
      prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s)),
    )
  }

  const handleSave = async () => {
    if (!tenantName) return
    setSaving(true)
    try {
      await updateTenantServices(
        tenantName,
        services.filter((s) => s.enabled).map((s) => s.key),
      )
      toast.addToast('Services updated', 'success')
      onUpdated()
      onClose()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Manage services: ${tenantName}`}
      description="Toggle services on or off for this tenant."
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
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
              <Switch checked={!!svc.enabled} onChange={() => toggle(svc.key)} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} isLoading={saving}>
          Save changes
        </Button>
      </div>
    </Modal>
  )
}
