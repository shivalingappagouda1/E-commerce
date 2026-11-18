import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'

function AuthorizationLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Verifying authorization…</p>
      </div>
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-8 text-center max-w-sm">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-500 mb-5">This area is restricted to authorized administrators.</p>
        <a href="/" className="inline-block bg-brand-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl hover:bg-brand-600 transition-colors shadow-sm">Return to Store</a>
      </div>
    </div>
  )
}

export default function AuthGuard({ requireAuth = false, requireAdmin = false, children }) {
  const {
    user,
    loading,
    isAdmin,
    adminOtpVerified,
    adminOtpLoading,
  } = useAuth()
  const location = useLocation()

  if (loading) return <AuthorizationLoading />

  if (isSupabaseConfigured && requireAuth && !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (requireAdmin) {
    if (!user) return <Navigate to="/login" state={{ from: '/admin' }} replace />
    if (!isAdmin) return <AccessDenied />
    if (adminOtpLoading) return <AuthorizationLoading />
    if (!adminOtpVerified) return <Navigate to="/admin/verify" replace />
  }

  return children
}
