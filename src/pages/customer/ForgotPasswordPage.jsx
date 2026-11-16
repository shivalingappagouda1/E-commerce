import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const submitLockRef = useRef(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitLockRef.current || submitting) return

    setError('')
    setSuccess(false)

    const cleanEmail = email.trim()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    submitLockRef.current = true
    setSubmitting(true)

    try {
      if (!isSupabaseConfigured) {
        setError('Password recovery service is currently unavailable. Please try again later.')
        return
      }

      const { error: resetError } = await resetPassword(cleanEmail)

      if (resetError) {
        // Safe, understandable error message without revealing account existence or internal provider error stacks
        setError('Unable to send password recovery instructions. Please verify your email and try again later.')
        return
      }

      // Neutral, privacy-preserving confirmation
      setSuccess(true)
    } catch {
      setError('An unexpected network error occurred while processing your request. Please try again.')
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
          <h1 className="text-2xl font-bold text-slate-800">Reset your password</h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter your account email to receive a secure password recovery link
          </p>
        </div>

        {/* Supabase unconfigured notice */}
        {!isSupabaseConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-700">
            <strong>Password recovery service is currently unavailable.</strong> Please contact support if you need immediate assistance.
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-7 space-y-4">
          {success ? (
            <div className="space-y-4 text-center animate-in fade-in">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} />
              </div>
              <h2 className="text-base font-bold text-slate-800">Check your inbox</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                If an account exists for <strong className="text-slate-800">{email}</strong>, we have sent instructions to reset your password. Please check your inbox and spam folder.
              </p>
              <div className="pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline"
                >
                  <ArrowLeft size={14} /> Back to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
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
                disabled={submitting || !isSupabaseConfigured}
                className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors cursor-pointer text-sm"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound size={16} /> Send Reset Link
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ArrowLeft size={13} /> Return to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
