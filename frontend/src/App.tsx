import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { ToastContainer } from './components/Toast'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import DeveloperDashboard from './pages/DeveloperDashboard'

function ProtectedRoute({
  children,
  allowed,
}: {
  children: React.ReactNode
  allowed: 'admin' | 'developer'
}) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />
  if (user.user_type !== allowed) {
    return <Navigate to={user.user_type === 'admin' ? '/admin' : '/dashboard'} replace />
  }

  return <>{children}</>
}

function Router() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowed="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowed="developer">
            <DeveloperDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Router />
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
