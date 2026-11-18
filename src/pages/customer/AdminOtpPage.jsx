import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function AdminOtpPage() {
  const {
    user,
    loading,
    isAdminRole,
    adminOtpVerified,
    adminOtpLoading,
    adminOtpError,
    refreshAdminOtpStatus,
    signOut,
  } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(60)

  useEffect(() => {
    if (loading) return
    if (!user) navigate('/login', { replace: true })
    else if (!isAdminRole) navigate('/', { replace: true })
    else if (adminOtpVerified) navigate('/admin', { replace: true })
  }, [user, loading, isAdminRole, adminOtpVerified, navigate])

  useEffect(() => {
    if (seconds <= 0) return undefined
    const timer = setTimeout(() => setSeconds(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds])

  async function invoke(action, extra = {}) {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Your login session expired. Sign in again.')
    const { data, error: invokeError } = await supabase.functions.invoke('admin-auth-otp', {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (invokeError) throw invokeError
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function verify(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await invoke('verify', { code })
      const result = await refreshAdminOtpStatus()
      if (!result.verified) throw result.error || new Error('Verification could not be confirmed. Please try again.')
      navigate('/admin', { replace: true })
    } catch (verifyError) {
      setError(verifyError?.message || 'Unable to verify code.')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError('')
    setBusy(true)
    try {
      await invoke('start')
      setSeconds(60)
    } catch (resendError) {
      setError(resendError?.message || 'Unable to resend code.')
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (loading || (adminOtpLoading && !adminOtpError)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Preparing administrator verification…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-md">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 text-xl">✉</div>
        <h1 className="text-center text-2xl font-bold text-slate-800">Verify administrator login</h1>
        <p className="mt-2 text-center text-sm text-slate-500">Enter the 8-digit code sent to your administrator email address.</p>
        <form onSubmit={verify} className="mt-6 space-y-4">
          <label htmlFor="admin-otp" className="block text-sm font-medium text-slate-700">Verification code</label>
          <input
            id="admin-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            required
            value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="00000000"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-2xl tracking-[0.4em] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {(error || adminOtpError) && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error || adminOtpError}</p>
          )}
          <button disabled={busy || code.length !== 8} className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:bg-slate-300">
            {busy ? 'Verifying…' : 'Verify and continue'}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-slate-500">
          {seconds > 0 ? `Resend available in ${seconds}s` : (
            <button onClick={resend} disabled={busy} className="font-semibold text-brand-600 hover:underline">Resend code</button>
          )}
        </div>
        <button onClick={leave} className="mt-6 w-full text-sm text-slate-500 hover:text-slate-800">Sign out</button>
      </div>
    </div>
  )
}
