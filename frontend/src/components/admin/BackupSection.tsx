import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  getVolumes,
  getJobStatus,
  type Backup,
  type Tenant,
} from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { useInterval } from '../../hooks/useInterval'
import { formatBytes, formatRelativeTime } from '../../lib/utils'
import { VolumeRestoreModal } from './VolumeRestoreModal'
import { Archive, RotateCcw, Database, HardDrive, Camera, Loader2 } from 'lucide-react'

const BACKUP_SERVICES = ['postgres', 'mongo', 'redis']
const JOB_POLL_MS = 2000

interface BackupSectionProps {
  tenants: Tenant[]
}

export function BackupSection({ tenants }: BackupSectionProps) {
  const [backups, setBackups] = useState<Backup[]>([])
  const [volumes, setVolumes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null)
  const [volumeModalPath, setVolumeModalPath] = useState<string | undefined>()
  const [snapshotVolumeKey, setSnapshotVolumeKey] = useState<string | null>(null)
  const [snapshotting, setSnapshotting] = useState(false)
  const [jobs, setJobs] = useState<string[]>([])
  const jobsRef = useRef(jobs)
  const toast = useToast()

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

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

  useInterval(
    () => {
      load()
    },
    10000,
  )

  const pollJobs = useCallback(async () => {
    for (const id of jobsRef.current) {
      try {
        const job = await getJobStatus(id)
        if (job.status === 'completed' || job.status === 'failed') {
          setJobs((prev) => prev.filter((j) => j !== id))
          toast.addToast(
            `${job.operation} ${job.target} ${job.status}`,
            job.status === 'completed' ? 'success' : 'error',
          )
          await load()
        }
      } catch {
        setJobs((prev) => prev.filter((j) => j !== id))
      }
    }
  }, [toast])

  useInterval(pollJobs, jobs.length > 0 ? JOB_POLL_MS : null)

  useEffect(() => {
    if (snapshotVolumeKey === null) return
    let cancelled = false
    getVolumes()
      .then((data) => {
        if (cancelled) return
        const names = data.volumes.map((v) => v.name)
        setVolumes(names)
        if (!snapshotVolumeKey || !names.includes(snapshotVolumeKey)) {
          setSnapshotVolumeKey(names[0] || '')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          toast.addToast(err instanceof Error ? err.message : 'Failed to load volumes', 'error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [snapshotVolumeKey === null])

  const grouped = useMemo(() => {
    const map: Record<string, Backup[]> = {}
    for (const b of backups) {
      const key = b.service
      if (!map[key]) map[key] = []
      map[key].push(b)
    }
    return map
  }, [backups])

  const trackJob = (jobId: string | undefined) => {
    if (!jobId) return
    setJobs((prev) => (prev.includes(jobId) ? prev : [...prev, jobId]))
  }

  const handleBackup = async (service: string, tenant: string) => {
    const id = `${service}-${tenant}`
    setBackingUp(id)
    try {
      const result = await createBackup(service, tenant)
      trackJob(result.job_id)
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
      const result = await restoreBackup(backup.service, backup.tenant, backup.path)
      trackJob(result.job_id)
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
    if (!volume) return
    setSnapshotting(true)
    try {
      const result = await snapshotVolume(volume)
      trackJob(result.job_id)
      toast.addToast(`Snapshot started for ${volume}`, 'success')
      setSnapshotVolumeKey(null)
      await load()
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Snapshot failed', 'error')
    } finally {
      setSnapshotting(false)
    }
  }

  const renderBackupMeta = (backup: Backup) => (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>{formatBytes(backup.size_bytes)}</span>
      <span>•</span>
      <span>{formatRelativeTime(backup.created_at)}</span>
      <Badge
        variant={
          backup.status === 'completed' ? 'success' : backup.status === 'failed' ? 'danger' : 'warning'
        }
      >
        {backup.status}
      </Badge>
      {jobs.some((j) => backup.path.includes(j)) && (
        <Badge variant="default">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> in progress
        </Badge>
      )}
    </div>
  )

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
                                className="flex flex-col gap-2 rounded-md border border-surface-light bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="font-mono text-xs text-muted truncate max-w-[260px] sm:max-w-md">
                                    {backupFileName(backup.path)}
                                  </p>
                                  {renderBackupMeta(backup)}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  isLoading={restoring === backup.path}
                                  onClick={() => setRestoreTarget(backup)}
                                  aria-label={`Restore ${backupFileName(backup.path)}`}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                                </Button>
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
            onClick={() => setSnapshotVolumeKey('')}
            aria-label="Create volume snapshot"
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
                  className="flex flex-col gap-2 rounded-lg border border-surface-light bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-muted" />
                      <span className="font-mono text-xs text-muted truncate max-w-[200px] sm:max-w-md">
                        {backupFileName(backup.path)}
                      </span>
                    </div>
                    {renderBackupMeta(backup)}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setVolumeModalPath(backup.path)}
                    aria-label={`Restore ${backupFileName(backup.path)}`}
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
              <Button isLoading={!!restoring} onClick={() => handleRestore(restoreTarget)}>
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
        isOpen={snapshotVolumeKey !== null}
        onClose={() => setSnapshotVolumeKey(null)}
        title="Create volume snapshot"
        description="Choose a Docker volume to snapshot."
      >
        {snapshotVolumeKey !== null && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Volume
              </label>
              <select
                value={snapshotVolumeKey}
                onChange={(e) => setSnapshotVolumeKey(e.target.value)}
                className="input w-full"
              >
                {volumes.length === 0 && <option value="">Loading volumes...</option>}
                {volumes.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSnapshotVolumeKey(null)}>
                Cancel
              </Button>
              <Button
                isLoading={snapshotting}
                onClick={() => handleSnapshot(snapshotVolumeKey)}
                disabled={!snapshotVolumeKey}
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
