import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Mail, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Please enter both email and password.')
      return
    }

    setSubmitting(true)
    try {
      const result = await signIn({ email: email.trim(), password })
      if (result.error) {
        setError(result.error.message || 'Unable to sign in.')
      } else if (result.requiresAdminOtp) {
        navigate('/admin/verify', { replace: true })
      } else {
        navigate(from, { replace: true })
      }
    } catch (authError) {
      setError(authError?.message || 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setGoogleSubmitting(true)
    try {
      const { error: authError } = await signInWithGoogle()
      if (authError) {
        setError(authError.message || 'Unable to continue with Google.')
        setGoogleSubmitting(false)
      }
      // On success the browser leaves for Google OAuth and returns to "/".
      // AppRoutes redirects admin accounts to /admin/verify after profile resolution.
    } catch (authError) {
      setError(authError?.message || 'Unable to continue with Google.')
      setGoogleSubmitting(false)
    }
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow">
              <span className="text-white font-black text-lg">SK</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your ShopKart account</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-700">
            <strong>Supabase is not configured.</strong>{' '}
            Login requires a connected Supabase project. See{' '}
            <code className="bg-amber-100 px-1 rounded">.env.local</code>.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email" type="email" value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@example.com" autoComplete="email" required
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password" type={showPw ? 'text' : 'password'} value={password}
                  onChange={event => setPassword(event.target.value)} placeholder="••••••••"
                  autoComplete="current-password" required
                  className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"
                />
                <button type="button" onClick={() => setShowPw(value => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <div role="alert" className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5 border border-red-200">{error}</div>}

            <button type="submit" disabled={submitting || !isSupabaseConfigured}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><LogIn size={16} />Sign In</>}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <hr className="flex-1 border-slate-200" />
            <span className="text-xs text-slate-400 uppercase tracking-wide">or</span>
            <hr className="flex-1 border-slate-200" />
          </div>

          <button onClick={handleGoogle} disabled={!isSupabaseConfigured || googleSubmitting}
            className="w-full flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400 text-slate-700 font-medium py-2.5 rounded-lg transition-colors text-sm">
            <svg viewBox="0 0 24 24" width="18" height="18" className="flex-shrink-0" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {googleSubmitting ? 'Connecting…' : 'Continue with Google'}
          </button>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-600 font-semibold hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  )
}
