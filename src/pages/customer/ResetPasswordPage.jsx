import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  isValidRecoverySession,
  validateResetPassword,
  mapSafeAuthError,
} from '../../utils/authHelpers'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { recoveryMode, loading: authLoading, signOut } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [signOutWarning, setSignOutWarning] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)

  // Synchronous lock preventing duplicate password update submissions
  const submitLockRef = useRef(false)

  // Verify whether the user holds a genuine Supabase password recovery session
  useEffect(() => {
    let mounted = true

    if (!isSupabaseConfigured || !supabase) {
      setCheckingSession(false)
      setHasRecoverySession(false)
      return () => { mounted = false }
    }

    // If AuthContext already captured PASSWORD_RECOVERY during bootstrap, accept immediately
    if (recoveryMode) {
      setHasRecoverySession(true)
      setCheckingSession(false)
    }

    supabase.auth.getSession()
      .then(({ data, error: sessionErr }) => {
        if (!mounted) return
        if (sessionErr) {
          setHasRecoverySession(Boolean(recoveryMode))
          return
        }
        const session = data?.session || null
        // Strict recovery verification: ordinary sessions without recovery evidence are rejected
        if (isValidRecoverySession({ recoveryMode, event: null, session })) {
          setHasRecoverySession(true)
        } else if (!recoveryMode) {
          setHasRecoverySession(false)
        }
      })
      .catch(() => {
        if (mounted && !recoveryMode) {
          setHasRecoverySession(false)
        }
      })
      .finally(() => {
        if (mounted && !authLoading) {
          setCheckingSession(false)
        }
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (isValidRecoverySession({ recoveryMode, event, session })) {
        setHasRecoverySession(true)
        setCheckingSession(false)
      } else if (event === 'SIGNED_OUT' || !session) {
        setHasRecoverySession(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [recoveryMode, authLoading])

  async function handleResetPassword(e) {
    e.preventDefault()
    setError('')
    setSignOutWarning('')

    // Synchronous double-submit and post-success prevention
    if (submitLockRef.current || submitting || success) return

    // Validate exact entered password without trimming whitespace
    const validation = validateResetPassword(password, confirmPassword)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    submitLockRef.current = true
    setSubmitting(true)

    try {
      if (!isSupabaseConfigured || !supabase) {
        setError('Password reset service is currently unavailable. Please try again later.')
        return
      }

      // Re-verify active session before calling updateUser
      const { data: sessionCheck, error: sessionErr } = await supabase.auth.getSession()
      const currentSession = sessionCheck?.session || null
      if (sessionErr || !isValidRecoverySession({ recoveryMode, event: null, session: currentSession })) {
        setHasRecoverySession(false)
        setError('Your password reset session is invalid or has expired. Please request a new reset link.')
        return
      }

      // Submit exact validated password (never trim)
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        setError(mapSafeAuthError(updateError, 'Unable to update your password. Your recovery link may have expired.'))
        return
      }

      setSuccess(true)
      setPassword('')
      setConfirmPassword('')

      // Safely terminate the temporary recovery session and handle sign-out failures honestly
      try {
        const signOutResult = await signOut()
        if (signOutResult?.error) {
          setSignOutWarning(
            'Your password was updated, but your temporary recovery session could not be automatically closed. Please sign out manually before signing back in.'
          )
        }
      } catch {
        setSignOutWarning(
          'Your password was updated, but we could not verify recovery session termination. Please sign in again.'
        )
      }
    } catch {
      setError('An unexpected error occurred while updating your password. Please try again.')
    } finally {
      submitLockRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow">
              <span className="text-white font-black text-lg">SK</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Set new password</h1>
          <p className="text-sm text-slate-500 mt-1">
            Choose a strong, secure password for your ShopKart account
          </p>
        </div>

        {/* Loading recovery session verification */}
        {checkingSession || authLoading ? (
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-8 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Verifying secure password reset session...</p>
          </div>
        ) : !hasRecoverySession && !success ? (
          /* Invalid, expired, or non-recovery session rejected */
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-8 text-center space-y-4 animate-in fade-in">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-base font-bold text-slate-800">Invalid or Expired Link</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              This password reset link is invalid, expired, or requires a verified password recovery flow. Please request a new recovery link to proceed.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <Link
                to="/forgot-password"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
              >
                <span>Request New Link</span>
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-50 transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : success ? (
          /* Password reset confirmed success */
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-8 text-center space-y-4 animate-in fade-in">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="text-base font-bold text-slate-800">Password Updated Successfully</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your account password has been reset. You can now sign in using your new credentials.
            </p>
            {signOutWarning && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-xl p-3 text-left">
                {signOutWarning}
              </div>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-xl transition-colors cursor-pointer text-sm shadow-xs"
              >
                <span>Sign In to Your Account</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          /* Reset Password Form */
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-7 space-y-4">
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-xs rounded-lg p-3 border border-red-200 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors cursor-pointer text-sm"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
