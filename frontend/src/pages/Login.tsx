import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, User, Lock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { cn } from '../lib/utils'

type LoginMode = 'admin' | 'developer'

export default function Login() {
  const [mode, setMode] = useState<LoginMode>('admin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    if (user) {
      navigate(user.user_type === 'admin' ? '/admin' : '/dashboard', { replace: true })
    }
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setIsLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      toast.addToast(err instanceof Error ? err.message : 'Login failed', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface via-background to-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
            OmniDeck
          </h1>
          <p className="mt-2 text-sm text-muted">
            Multi-tenant developer platform
          </p>
        </div>

        <div className="card">
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-surface-light bg-background p-1">
            <button
              type="button"
              onClick={() => setMode('admin')}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer',
                mode === 'admin'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:text-foreground',
              )}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => setMode('developer')}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer',
                mode === 'developer'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:text-foreground',
              )}
            >
              Developer
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {mode === 'admin' ? 'Username' : 'Tenant name'}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === 'admin' ? 'admin' : 'tenant-name'}
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              Sign in as {mode === 'admin' ? 'Admin' : 'Developer'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
