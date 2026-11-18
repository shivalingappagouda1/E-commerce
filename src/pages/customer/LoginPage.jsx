import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Mail, Lock, Phone, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'

const inputClass = 'w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500'
const buttonClass = 'w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors'

export default function LoginPage() {
  const { signIn, sendPhoneLoginOtp, verifyPhoneLoginOtp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'
  const [method, setMethod] = useState('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('details')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function normalizedPhone() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 10) return `+91${digits}`
    if (phone.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`
    return null
  }

  async function handleEmailLogin(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) return setError('Please enter both email and password.')
    setSubmitting(true)
    const { error: authError } = await signIn({ email, password })
    setSubmitting(false)
    if (authError) setError(authError.message)
    else navigate(from, { replace: true })
  }

  async function handleSendPhoneOtp(e) {
    e.preventDefault()
    setError('')
    const phoneNumber = normalizedPhone()
    if (!phoneNumber) return setError('Enter a valid mobile number. Indian 10-digit numbers are accepted.')
    setSubmitting(true)
    const { error: authError } = await sendPhoneLoginOtp(phoneNumber)
    setSubmitting(false)
    if (authError) setError(authError.message)
    else setStep('otp')
  }

  async function handleVerifyPhoneOtp(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(otp.trim())) return setError('Enter the 6-digit verification code.')
    setSubmitting(true)
    const { error: authError } = await verifyPhoneLoginOtp({ phone: normalizedPhone(), token: otp })
    setSubmitting(false)
    if (authError) setError(authError.message)
    else navigate(from, { replace: true })
  }

  async function handleGoogle() {
    setError('')
    const { error: authError } = await signInWithGoogle()
    if (authError) setError(authError.message)
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6"><div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow"><span className="text-white font-black text-lg">SK</span></div></Link>
          <h1 className="text-2xl font-bold text-slate-800">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your ShopKart account</p>
        </div>
        {!isSupabaseConfigured && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-700"><strong>Supabase is not configured.</strong> Login requires a connected Supabase project. See <code className="bg-amber-100 px-1 rounded">.env.local</code>.</div>}

        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-7">
          <div className="grid grid-cols-2 gap-2 mb-5">
            <button type="button" onClick={() => { setMethod('email'); setStep('details'); setError('') }} className={`py-2.5 rounded-lg text-sm font-semibold border ${method === 'email' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'border-slate-200 text-slate-600'}`}><Mail size={15} className="inline mr-2" />Email</button>
            <button type="button" onClick={() => { setMethod('phone'); setStep('details'); setError('') }} className={`py-2.5 rounded-lg text-sm font-semibold border ${method === 'phone' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'border-slate-200 text-slate-600'}`}><Phone size={15} className="inline mr-2" />Mobile OTP</button>
          </div>

          {method === 'email' ? <form onSubmit={handleEmailLogin} className="space-y-4">
            <div><label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label><div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={`${inputClass} pl-10`} /></div></div>
            <div><div className="flex items-center justify-between mb-1.5"><label htmlFor="login-password" className="text-sm font-medium text-slate-700">Password</label><Link to="/forgot-password" className="text-xs text-brand-600 hover:underline">Forgot password?</Link></div><div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="login-password" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className={`${inputClass} pl-10 pr-10`} /><button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5 border border-red-200">{error}</div>}
            <button type="submit" disabled={submitting || !isSupabaseConfigured} className={buttonClass}>{submitting ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><LogIn size={16} />Sign In</>}</button>
          </form> : <form onSubmit={step === 'details' ? handleSendPhoneOtp : handleVerifyPhoneOtp} className="space-y-4">
            {step === 'details' ? <>
              <div><label htmlFor="login-phone" className="block text-sm font-medium text-slate-700 mb-1.5">Mobile number</label><div className="relative"><Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="login-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210 or +919876543210" autoComplete="tel" className={`${inputClass} pl-10`} /></div><p className="text-xs text-slate-400 mt-1">Indian 10-digit numbers use +91 automatically.</p></div>
              {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5 border border-red-200">{error}</div>}
              <button type="submit" disabled={submitting || !isSupabaseConfigured} className={buttonClass}>{submitting ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Send login OTP'}</button>
            </> : <>
              <button type="button" onClick={() => { setStep('details'); setOtp(''); setError('') }} className="text-sm text-brand-600 hover:underline flex items-center gap-1"><ArrowLeft size={14} />Change mobile number</button>
              <div><h2 className="text-lg font-semibold text-slate-800">Enter verification code</h2><p className="text-sm text-slate-500 mt-1">We sent an SMS code to {normalizedPhone()}.</p></div>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit OTP" className={`${inputClass} text-center tracking-[0.4em] text-lg`} />
              {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5 border border-red-200">{error}</div>}
              <button type="submit" disabled={submitting || otp.length !== 6} className={buttonClass}>{submitting ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Verify and sign in'}</button>
            </>}
          </form>}

          <div className="flex items-center gap-3 my-5"><hr className="flex-1 border-slate-200" /><span className="text-xs text-slate-400 uppercase tracking-wide">or</span><hr className="flex-1 border-slate-200" /></div>
          <button onClick={handleGoogle} disabled={!isSupabaseConfigured || submitting} className="w-full flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400 text-slate-700 font-medium py-2.5 rounded-lg transition-colors text-sm"><span className="font-bold text-lg text-blue-600">G</span>Continue with Google</button>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">Don't have an account? <Link to="/register" className="text-brand-600 font-semibold hover:underline">Create one</Link></p>
      </div>
    </div>
  )
}
