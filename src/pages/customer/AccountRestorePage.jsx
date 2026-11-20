import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Clock3, RotateCcw, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

export default function AccountRestorePage() {
  const { user, loading, accountLifecycle, invokeAccountLifecycle, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [stage, setStage] = useState('intro')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  if (loading) return <div className="min-h-[60vh] grid place-items-center text-slate-500">Checking account status…</div>
  if (!user) return <Navigate to="/login" replace />
  if (accountLifecycle.status === 'active') return <Navigate to="/" replace />

  async function sendCode() {
    setBusy(true); setError(''); setMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await invokeAccountLifecycle(session, 'start_restore')
      setStage('verify'); setMessage(`A restoration code was sent to ${user.email}.`)
    } catch (e) { setError(e.message || 'Unable to send restoration code.') }
    finally { setBusy(false) }
  }
  async function restore(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await invokeAccountLifecycle(session, 'confirm_restore', { otp })
      await refreshProfile(user.id)
      navigate('/', { replace: true })
    } catch (e) { setError(e.message || 'Unable to restore account.') }
    finally { setBusy(false) }
  }
  const canRestore = accountLifecycle.status === 'pending_deletion'
  const deadline = accountLifecycle.deletionScheduledFor ? new Date(accountLifecycle.deletionScheduledFor).toLocaleString() : 'within 7 days of the deletion request'
  return <main className="min-h-[70vh] flex items-center justify-center px-4 py-10"><section className="w-full max-w-lg bg-white border border-amber-200 rounded-2xl shadow-sm p-7 space-y-5">
    <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 grid place-items-center"><Clock3 size={23}/></div>
    <div><h1 className="text-2xl font-bold text-slate-900">Account scheduled for deletion</h1><p className="text-sm text-slate-600 mt-2">{canRestore ? <>Your ShopKart account is currently inaccessible. You can restore it by verifying your email before <strong>{deadline}</strong>.</> : 'Permanent account deletion is being processed. Restoration is no longer available.'}</p></div>
    <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Normal store access is blocked during this period. If you do not restore your account before the deadline, it will be permanently deleted. Required transaction records may be retained in anonymised form.</div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p className="text-sm text-emerald-700">{message}</p>}
    {canRestore && (stage === 'intro' ? <button disabled={busy} onClick={sendCode} className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-brand-600 text-white font-semibold py-3 disabled:opacity-50"><RotateCcw size={17}/>{busy ? 'Sending…' : 'Restore my account'}</button> : <form onSubmit={restore} className="space-y-3"><label htmlFor="restore-otp" className="block text-sm font-semibold text-slate-700">Enter the 8-digit email code</label><input id="restore-otp" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" maxLength={8} required placeholder="00000000" className="w-full border border-slate-300 rounded-xl px-3 py-3 text-center tracking-[0.3em] text-lg"/><button disabled={busy || otp.length !== 8} className="w-full rounded-xl bg-brand-600 text-white font-semibold py-3 disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and restore account'}</button><button type="button" disabled={busy} onClick={sendCode} className="w-full text-sm text-brand-600 font-semibold">Resend code</button></form>)}
    <button onClick={signOut} className="w-full text-sm text-slate-500 hover:text-slate-800">Sign out</button>
    <p className="text-xs text-slate-400 flex items-center gap-1"><ShieldCheck size={13}/> Email verification is required to restore access.</p>
  </section></main>
}
