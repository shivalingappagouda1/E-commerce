import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/**
 * AuthGuard — route-level protection.
 *
 * Props:
 *   requireAuth  — user must be logged in
 *   requireAdmin — user must be logged in AND have role === 'admin'
 *   children     — the protected content (typically an <Outlet />)
 *
 * Security note:
 *   This is a UI convenience — real authorization is enforced by
 *   Supabase Row Level Security on every database query. Even if
 *   someone bypasses this guard, the API will reject unauthorized requests.
 */
export default function AuthGuard({ requireAuth = false, requireAdmin = false, children }) {
  const { user, profile, loading, isAdmin } = useAuth()
  const location = useLocation()

  // Still checking auth state — show nothing to avoid flash
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Checking access…</p>
        </div>
      </div>
    )
  }

  // Must be logged in
  if ((requireAuth || requireAdmin) && !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // Must be admin
  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-8 text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-sm text-slate-500 mb-4">
            This area is restricted to authorized administrators.
          </p>
          <a href="/" className="text-brand-600 hover:underline text-sm font-medium">
            ← Back to Store
          </a>
        </div>
      </div>
    )
  }

  return children
}
