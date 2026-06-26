import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { restoreVolume } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

interface VolumeRestoreModalProps {
  isOpen: boolean
  onClose: () => void
  path?: string
}

export function VolumeRestoreModal({ isOpen, onClose, path }: VolumeRestoreModalProps) {
  const [volume, setVolume] = useState('')
  const [service, setService] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!volume || !service || !path) return
    setLoading(true)
    try {
      await restoreVolume(volume, path, service)
      toast.addToast('Volume restore started', 'success')
      onClose()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Restore failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Restore volume snapshot"
      description="Restore a Docker volume from a snapshot backup."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Backup path
          </label>
          <Input value={path || ''} readOnly className="font-mono text-xs" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Target volume name
          </label>
          <Input
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="e.g. omnideck_postgres_data"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Service name
          </label>
          <Input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="e.g. postgres"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            Restore volume
          </Button>
        </div>
      </form>
    </Modal>
  )
}
