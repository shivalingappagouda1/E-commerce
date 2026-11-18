import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  UserPlus,
  Mail,
  Lock,
  User,
  Phone,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'

const EMAIL_OTP_LENGTH = 8
const PHONE_OTP_LENGTH = 6

export default function RegisterPage() {
  const {
    signUp,
    signUpWithPhone,
    verifyEmailOtp,
    verifyPhoneOtp,
    resendEmailOtp,
    resendPhoneOtp,
    signInWithGoogle,
  } = useAuth()

  const navigate = useNavigate()

  const [method, setMethod] = useState('email')
  const [step, setStep] = useState('details')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [otp, setOtp] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const otpLength = method === 'email' ? EMAIL_OTP_LENGTH : PHONE_OTP_LENGTH

  function normalizedPhone() {
    const value = phone.trim().replace(/[\s()-]/g, '')
    if (/^\d{10}$/.test(value)) return `+91${value}`
    if (/^\+[1-9]\d{7,14}$/.test(value)) return value
    return ''
  }

  function switchMethod(nextMethod) {
    setMethod(nextMethod)
    setStep('details')
    setOtp('')
    setError('')
    setSuccess('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!fullName.trim() || !password || !confirm) {
      setError('All fields are required.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    if (method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }

    const phoneNumber = method === 'mobile' ? normalizedPhone() : ''
    if (method === 'mobile' && !phoneNumber) {
      setError('Enter a valid 10-digit Indian mobile number or an international number with country code.')
      return
    }

    setSubmitting(true)
    try {
      const result =
        method === 'email'
          ? await signUp({
              email: email.trim().toLowerCase(),
              password,
              fullName: fullName.trim(),
            })
          : await signUpWithPhone({
              phone: phoneNumber,
              password,
              fullName: fullName.trim(),
            })

      if (result?.error) {
        setError(result.error.message || 'Unable to create your account.')
        return
      }

      setStep('otp')
      setOtp('')
      setSuccess(
        method === 'email'
          ? `An ${EMAIL_OTP_LENGTH}-digit verification code has been sent to ${email.trim()}.`
          : `A verification code has been sent to ${phoneNumber}.`
      )
    } catch (err) {
      setError(err?.message || 'Unable to send the verification code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!new RegExp(`^\\d{${otpLength}}$`).test(otp)) {
      setError(`Enter the complete ${otpLength}-digit verification code.`)
      return
    }

    setSubmitting(true)
    try {
      const result =
        method === 'email'
          ? await verifyEmailOtp({
              email: email.trim().toLowerCase(),
              token: otp,
            })
          : await verifyPhoneOtp({
              phone: normalizedPhone(),
              token: otp,
            })

      if (result?.error) {
        setError(result.error.message || 'The verification code could not be verified.')
        return
      }

      navigate('/', { replace: true })
    } catch (err) {
      setError(err?.message || 'The verification code could not be verified.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      const result =
        method === 'email'
          ? await resendEmailOtp(email.trim().toLowerCase())
          : await resendPhoneOtp(normalizedPhone())

      if (result?.error) {
        setError(result.error.message || 'Unable to resend the verification code.')
      } else {
        setSuccess('A new verification code has been sent.')
        setOtp('')
      }
    } catch (err) {
      setError(err?.message || 'Unable to resend the verification code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setSubmitting(true)
    try {
      const { error: authError } = await signInWithGoogle()
      if (authError) setError(authError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500'
  const iconClass =
    'absolute left-3 top-1/2 -translate-y-1/2 text-slate-400'

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow">
              <span className="text-white font-black text-lg">SK</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Create your account</h1>
          <p className="text-sm text-slate-500 mt-1">
            Join ShopKart and start shopping
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-700">
            <strong>Supabase is not configured.</strong> Registration requires a connected Supabase project.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-7">
          {step === 'details' ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => switchMethod('email')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    method === 'email'
                      ? 'border-brand-500 bg-orange-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Mail size={16} /> Email
                </button>
                <button
                  type="button"
                  onClick={() => switchMethod('mobile')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    method === 'mobile'
                      ? 'border-brand-500 bg-orange-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Phone size={16} /> Mobile
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Full name
                  </label>
                  <div className="relative">
                    <User size={16} className={iconClass} />
                    <input
                      id="reg-name"
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="John Doe"
                      autoComplete="name"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                {method === 'email' ? (
                  <div>
                    <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail size={16} className={iconClass} />
                      <input
                        id="reg-email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="reg-phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Mobile number
                    </label>
                    <div className="relative">
                      <Phone size={16} className={iconClass} />
                      <input
                        id="reg-phone"
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="10-digit mobile number"
                        autoComplete="tel"
                        required
                        className={inputClass}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Indian numbers are automatically prefixed with +91.
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={16} className={iconClass} />
                    <input
                      id="reg-password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      required
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock size={16} className={iconClass} />
                    <input
                      id="reg-confirm"
                      type={showPw ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repeat your password"
                      autoComplete="new-password"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5 border border-red-200">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="bg-green-50 text-green-700 text-sm rounded-lg px-4 py-2.5 border border-green-200">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !isSupabaseConfigured}
                  className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><UserPlus size={16} /> Send verification code</>
                  )}
                </button>
              </form>

              <div className="flex items-center gap-3 my-5">
                <hr className="flex-1 border-slate-200" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">or</span>
                <hr className="flex-1 border-slate-200" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={!isSupabaseConfigured || submitting}
                className="w-full flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400 text-slate-700 font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" className="flex-shrink-0">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setStep('details')
                  setOtp('')
                  setError('')
                  setSuccess('')
                }}
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft size={16} /> Back
              </button>

              <div className="text-center py-3">
                <CheckCircle2 size={36} className="mx-auto text-green-600 mb-3" />
                <h2 className="text-lg font-semibold text-slate-800">Verify your {method === 'email' ? 'email' : 'mobile number'}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Enter the {otpLength}-digit code sent to{' '}
                  <strong className="text-slate-700">
                    {method === 'email' ? email.trim() : normalizedPhone()}
                  </strong>
                </p>
              </div>

              <div>
                <label htmlFor="reg-otp" className="block text-sm font-medium text-slate-700 mb-1.5">
                  {otpLength}-digit verification code
                </label>
                <input
                  id="reg-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern={`\\d{${otpLength}}`}
                  maxLength={otpLength}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, otpLength))}
                  placeholder={'•'.repeat(otpLength)}
                  required
                  className="w-full text-center tracking-[0.45em] text-xl font-semibold py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5 border border-red-200">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-green-50 text-green-700 text-sm rounded-lg px-4 py-2.5 border border-green-200">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || otp.length !== otpLength}
                className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {submitting ? 'Verifying...' : 'Verify and create account'}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={submitting}
                className="w-full text-sm text-brand-600 font-semibold hover:underline disabled:text-slate-400"
              >
                Resend verification code
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
