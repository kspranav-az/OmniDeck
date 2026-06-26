import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, login as apiLogin, logout as apiLogout, type User } from '../lib/api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const refetch = useCallback(async () => {
    try {
      const me = await getMe()
      setUser(me)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    getMe()
      .then((me) => {
        if (mounted) setUser(me)
      })
      .catch(() => {
        if (mounted) setUser(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      const me = await apiLogin(username, password)
      setUser(me)
      navigate(me.user_type === 'admin' ? '/admin' : '/dashboard')
    },
    [navigate],
  )

  const handleLogout = useCallback(async () => {
    await apiLogout()
    setUser(null)
    navigate('/')
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{ user, loading, login: handleLogin, logout: handleLogout, refetch }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
