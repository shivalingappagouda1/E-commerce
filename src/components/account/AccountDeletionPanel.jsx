import { useState } from 'react'
import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

export default function AccountDeletionPanel() {
  const { user, isAdmin, invokeAccountLifecycle, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [stage, setStage] = useState('idle')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  if (!user || isAdmin) return null

  async function requestCode() {
    setBusy(true); setError(''); setMessage('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      await invokeAccountLifecycle(sessionData.session, 'request_deletion')
      setStage('verify')
      setMessage(`A verification code was sent to ${user.email}.`)
    } catch (e) { setError(e.message || 'Unable to send verification code.') }
    finally { setBusy(false) }
  }

  async function confirmDeletion(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      await invokeAccountLifecycle(sessionData.session, 'confirm_deletion', { otp })
      await refreshProfile(user.id)
      navigate('/account/restore', { replace: true })
    } catch (e) { setError(e.message || 'Unable to confirm account deletion.') }
    finally { setBusy(false) }
  }

  return (
    <section className="bg-white border border-red-200 rounded-2xl shadow-xs p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><Trash2 size={19}/></div>
        <div><h2 className="text-lg font-bold text-slate-900">Delete Account</h2><p className="text-sm text-slate-500 mt-1">Request permanent deletion of your ShopKart account.</p></div>
      </div>
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 space-y-2">
        <p className="font-semibold flex items-center gap-2"><AlertTriangle size={16}/> Before you continue</p>
        <p>After email verification, your account access will be suspended immediately. You have 7 days to restore it by signing in and verifying another email code.</p>
        <p>After 7 days, your account will be permanently removed. Order, payment, and return records required for business or legal purposes may be retained with personal identifiers removed where appropriate.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {stage === 'idle' ? (
        <button type="button" disabled={busy} onClick={() => { if (window.confirm('Are you sure you want to begin deleting your ShopKart account? You will lose access immediately after email verification.')) requestCode() }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"><ShieldCheck size={16}/>{busy ? 'Sending code…' : 'Continue to verification'}</button>
      ) : (
        <form onSubmit={confirmDeletion} className="max-w-sm space-y-3">
          <label className="block text-sm font-semibold text-slate-700" htmlFor="delete-account-otp">8-digit email verification code</label>
          <input id="delete-account-otp" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" maxLength={8} required className="w-full border border-slate-300 rounded-xl px-3 py-2.5 tracking-[0.3em] text-center text-lg" placeholder="00000000" />
          <div className="flex gap-2"><button disabled={busy || otp.length !== 8} className="px-4 py-2.5 rounded-xl bg-red-600 text-white font-semibold disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and schedule deletion'}</button><button type="button" onClick={() => { setStage('idle'); setOtp(''); setError('') }} className="px-4 py-2.5 rounded-xl border border-slate-200">Cancel</button></div>
          <button type="button" disabled={busy} onClick={requestCode} className="text-sm text-brand-600 font-semibold">Resend code</button>
        </form>
      )}
    </section>
  )
}
