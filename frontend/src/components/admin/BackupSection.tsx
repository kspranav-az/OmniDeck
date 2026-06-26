import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { Modal } from '../ui/Modal'
import { ServiceIcon } from '../ServiceIcon'
import {
  listBackups,
  createBackup,
  restoreBackup,
  snapshotVolume,
  type Backup,
  type Tenant,
} from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { VolumeRestoreModal } from './VolumeRestoreModal'
import { Archive, RotateCcw, Database, HardDrive, Camera } from 'lucide-react'

const BACKUP_SERVICES = ['postgres', 'mongo', 'redis']

interface BackupSectionProps {
  tenants: Tenant[]
}

export function BackupSection({ tenants }: BackupSectionProps) {
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null)
  const [volumeModalPath, setVolumeModalPath] = useState<string | undefined>()
  const [snapshotVolumeKey, setSnapshotVolumeKey] = useState<string | null>(null)
  const [snapshotting, setSnapshotting] = useState(false)
  const toast = useToast()

  const load = async () => {
    try {
      const data = await listBackups()
      setBackups(data)
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Failed to load backups', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const grouped = useMemo(() => {
    const map: Record<string, Backup[]> = {}
    for (const b of backups) {
      const key = b.service
      if (!map[key]) map[key] = []
      map[key].push(b)
    }
    return map
  }, [backups])

  const handleBackup = async (service: string, tenant: string) => {
    const id = `${service}-${tenant}`
    setBackingUp(id)
    try {
      await createBackup(service, tenant)
      toast.addToast(`${service} backup started for ${tenant}`, 'success')
      await load()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Backup failed', 'error')
    } finally {
      setBackingUp(null)
    }
  }

  const handleRestore = async (backup: Backup) => {
    if (!backup.tenant) return
    setRestoring(backup.path)
    try {
      await restoreBackup(backup.service, backup.tenant, backup.path)
      toast.addToast(`${backup.service} restore started for ${backup.tenant}`, 'success')
      setRestoreTarget(null)
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Restore failed', 'error')
    } finally {
      setRestoring(null)
    }
  }

  const backupFileName = (path: string) => path.split('/').pop() || path

  const handleSnapshot = async (volume: string) => {
    setSnapshotting(true)
    try {
      await snapshotVolume(volume)
      toast.addToast(`Snapshot created for ${volume}`, 'success')
      setSnapshotVolumeKey(null)
      await load()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Snapshot failed', 'error')
    } finally {
      setSnapshotting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Per-tenant service backups */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Service backups</h3>
            <p className="text-sm text-muted">Create or restore tenant database backups.</p>
          </div>
          <Button variant="secondary" onClick={load}>
            <RotateCcw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="card text-center text-muted">No tenants yet.</div>
        ) : (
          <div className="space-y-4">
            {tenants.map((tenant) => (
              <div
                key={tenant.name}
                className="rounded-xl border border-surface-light bg-surface p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-foreground">{tenant.name}</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {BACKUP_SERVICES.filter((s) => tenant.enabled_services.includes(s)).map(
                    (service) => (
                      <Button
                        key={service}
                        size="sm"
                        variant="secondary"
                        isLoading={backingUp === `${service}-${tenant.name}`}
                        onClick={() => handleBackup(service, tenant.name)}
                      >
                        <Database className="h-4 w-4" />
                        Backup {service}
                      </Button>
                    ),
                  )}
                  {BACKUP_SERVICES.filter((s) => !tenant.enabled_services.includes(s)).length >
                    0 && (
                    <span className="self-center text-xs text-muted">
                      Disabled services cannot be backed up.
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {BACKUP_SERVICES.filter((s) => tenant.enabled_services.includes(s)).map(
                    (service) => {
                      const serviceBackups =
                        grouped[service]?.filter((b) => b.tenant === tenant.name) || []
                      if (serviceBackups.length === 0) return null
                      return (
                        <div key={service} className="rounded-lg bg-background p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                            <ServiceIcon service={service} className="h-4 w-4 text-muted" />
                            {service}
                          </div>
                          <ul className="space-y-2">
                            {serviceBackups.map((backup) => (
                              <li
                                key={backup.path}
                                className="flex items-center justify-between rounded-md border border-surface-light bg-surface px-3 py-2"
                              >
                                <span className="font-mono text-xs text-muted truncate max-w-[60%]">
                                  {backupFileName(backup.path)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    isLoading={restoring === backup.path}
                                    onClick={() => setRestoreTarget(backup)}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    },
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Volume snapshots */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Volume snapshots</h3>
            <p className="text-sm text-muted">
              Docker volume backups and restores. Snapshots must be created server-side;
              use this section to restore listed snapshots.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSnapshotVolumeKey('omnideck_redisdata')}
          >
            <Camera className="h-4 w-4" /> Snapshot
          </Button>
        </div>

        <div className="rounded-xl border border-surface-light bg-surface p-4">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : (grouped['volume'] || []).length === 0 ? (
            <div className="text-center text-sm text-muted">No volume snapshots found.</div>
          ) : (
            <ul className="space-y-2">
              {(grouped['volume'] || []).map((backup) => (
                <li
                  key={backup.path}
                  className="flex items-center justify-between rounded-lg border border-surface-light bg-background px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted" />
                    <span className="font-mono text-xs text-muted truncate max-w-[200px] sm:max-w-md">
                      {backupFileName(backup.path)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setVolumeModalPath(backup.path)}
                  >
                    <Archive className="h-3.5 w-3.5" /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Restore confirmation modal */}
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
              <Button
                isLoading={!!restoring}
                onClick={() => handleRestore(restoreTarget)}
              >
                <RotateCcw className="h-4 w-4" /> Restore
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <VolumeRestoreModal
        isOpen={!!volumeModalPath}
        onClose={() => setVolumeModalPath(undefined)}
        path={volumeModalPath}
      />

      <Modal
        isOpen={!!snapshotVolumeKey}
        onClose={() => setSnapshotVolumeKey(null)}
        title="Create volume snapshot"
        description="Choose a Docker volume to snapshot."
      >
        {snapshotVolumeKey && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Snapshot volume <Badge>{snapshotVolumeKey}</Badge>?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSnapshotVolumeKey(null)}>
                Cancel
              </Button>
              <Button
                isLoading={snapshotting}
                onClick={() => handleSnapshot(snapshotVolumeKey)}
              >
                <Camera className="h-4 w-4" /> Snapshot
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
