import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Tabs, TabList, TabTrigger, TabContent } from '../ui/Tabs'
import { ServiceIcon } from '../ServiceIcon'
import { Copy, Eye, EyeOff, Key } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import type { Tenant } from '../../lib/api'

interface TenantCredentialsModalProps {
  isOpen: boolean
  onClose: () => void
  tenant?: Tenant | { name: string; login_password?: string; credentials: Record<string, any> }
}

export function TenantCredentialsModal({ isOpen, onClose, tenant }: TenantCredentialsModalProps) {
  const toast = useToast()
  const [showPasswords, setShowPasswords] = useState(false)

  if (!tenant) return null

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.addToast(`${label} copied`, 'success')
    } catch {
      toast.addToast('Failed to copy', 'error')
    }
  }

  const credentialFields: Record<string, string[]> = {
    postgres: ['host', 'port', 'database', 'user', 'password'],
    mongo: ['host', 'port', 'database', 'user', 'password'],
    redis: ['host', 'port', 'user', 'password'],
    minio: ['host', 'port', 'bucket', 'access_key', 'secret_key'],
  }

  const serviceKeys = Object.keys(tenant.credentials)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${tenant.name} credentials`}
      description="Share the developer login password once. Connection credentials are always available here."
      className="max-w-2xl"
    >
      <div className="space-y-5">
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
              >
                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => copy(tenant.login_password || '', 'Login password')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-warning">
              This password is shown only once. Save it securely.
            </p>
          </div>
        )}

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
            const creds = tenant.credentials[key] || {}
            return (
              <TabContent key={key} value={key}>
                <div className="grid gap-3">
                  {credentialFields[key]?.map((field) => (
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
                          value={creds[field] ?? ''}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            copy(String(creds[field] ?? ''), `${key} ${field}`)
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!credentialFields[key] &&
                    Object.entries(creds).map(([field, value]) => (
                      <div key={field}>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                          {field}
                        </label>
                        <div className="flex gap-2">
                          <Input value={String(value ?? '')} readOnly className="font-mono text-sm" />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => copy(String(value ?? ''), `${key} ${field}`)}
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

        <div className="flex items-center justify-between pt-2">
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
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}
