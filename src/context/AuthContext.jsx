import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  resolveScopedProfile,
  resolveIsAdmin,
  shouldAcceptProfileResponse,
  shouldAcceptBootstrapSession,
} from '../utils/authHelpers'

export const AuthContext = createContext(null)

function getSessionIdFromAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return null
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    const claims = JSON.parse(decoded)
    return typeof claims.session_id === 'string' ? claims.session_id : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profileState, setProfileState] = useState({ ownerId: null, data: null })
  const [loading, setLoading] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [adminOtpVerified, setAdminOtpVerified] = useState(false)
  const [adminOtpRequired, setAdminOtpRequired] = useState(false)
  const [adminOtpLoading, setAdminOtpLoading] = useState(false)
  const [adminOtpError, setAdminOtpError] = useState('')
  const [accountLifecycle, setAccountLifecycle] = useState({ status: 'active', deletionScheduledFor: null, error: '' })

  const activeUserIdRef = useRef(null)
  const profileFetchSeqRef = useRef(0)
  const authEventSeqRef = useRef(0)
  const mountedRef = useRef(true)
  const otpInitPromisesRef = useRef(new Map())
  const otpSessionRef = useRef(null)

  const safeProfile = resolveScopedProfile(user, profileState)
  const isAdmin = resolveIsAdmin(user, safeProfile)

  async function invokeAccountLifecycle(session, action, extra = {}) {
    if (!supabase) throw new Error('Supabase is not configured.')
    if (!session?.access_token) throw new Error('Your login session has expired. Please sign in again.')
    const { data, error } = await supabase.functions.invoke('account-lifecycle', {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function invokeAdminOtp(session, action, extra = {}) {
    if (!supabase) throw new Error('Supabase is not configured.')
    if (!session?.access_token) throw new Error('Your login session has expired. Please sign in again.')
    const { data, error } = await supabase.functions.invoke('admin-auth-otp', {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function ensureAdminOtpForSession(session, profile = null) {
    const sessionUser = session?.user
    if (!sessionUser?.id) return { required: false, verified: false }

    let currentProfile = profile
    if (!currentProfile) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', sessionUser.id)
        .maybeSingle()
      if (error) throw error
      currentProfile = data
    }

    if (currentProfile?.role !== 'admin') {
      if (mountedRef.current) {
        setAdminOtpVerified(false)
        setAdminOtpRequired(false)
        setAdminOtpLoading(false)
        setAdminOtpError('')
      }
      otpSessionRef.current = null
      return { required: false, verified: false }
    }

    const sessionId = getSessionIdFromAccessToken(session.access_token)
    if (!sessionId) {
      const message = 'Could not identify this login session. Please sign out and sign in again.'
      if (mountedRef.current) {
        setAdminOtpVerified(false)
        setAdminOtpRequired(true)
        setAdminOtpLoading(false)
        setAdminOtpError(message)
      }
      return { required: true, verified: false, error: new Error(message) }
    }

    if (otpSessionRef.current === sessionId && adminOtpVerified) {
      return { required: true, verified: true }
    }
    if (otpInitPromisesRef.current.has(sessionId)) {
      return otpInitPromisesRef.current.get(sessionId)
    }

    const task = (async () => {
      if (mountedRef.current) {
        setAdminOtpVerified(false)
        setAdminOtpRequired(true)
        setAdminOtpLoading(true)
        setAdminOtpError('')
      }
      try {
        const status = await invokeAdminOtp(session, 'status')
        if (status?.verified === true) {
          otpSessionRef.current = sessionId
          if (mountedRef.current) {
            setAdminOtpVerified(true)
            setAdminOtpRequired(false)
            setAdminOtpError('')
          }
          return { required: true, verified: true }
        }

        // Issue one code for this Supabase Auth session. A token refresh does not
        // create a new session and therefore must not send another code.
        if (otpSessionRef.current !== sessionId) {
          await invokeAdminOtp(session, 'start')
          otpSessionRef.current = sessionId
        }
        return { required: true, verified: false }
      } catch (error) {
        if (mountedRef.current) {
          setAdminOtpVerified(false)
          setAdminOtpRequired(true)
          setAdminOtpError(error?.message || 'Unable to start administrator verification.')
        }
        return { required: true, verified: false, error }
      } finally {
        if (mountedRef.current) setAdminOtpLoading(false)
      }
    })()

    otpInitPromisesRef.current.set(sessionId, task)
    try {
      return await task
    } finally {
      otpInitPromisesRef.current.delete(sessionId)
    }
  }

  async function fetchProfile(userId, session = null) {
    if (!userId) {
      if (mountedRef.current) setProfileState({ ownerId: null, data: null })
      return { data: null, error: null }
    }
    const currentSeq = ++profileFetchSeqRef.current
    try {
      if (!supabase) return { data: null, error: null }
      let activeSession = session
      if (!activeSession) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        activeSession = sessionData?.session
      }
      if (activeSession?.access_token) {
        const lifecycle = await invokeAccountLifecycle(activeSession, 'status')
        if (!mountedRef.current || !shouldAcceptProfileResponse(currentSeq, profileFetchSeqRef.current, activeUserIdRef.current, userId)) {
          return { data: null, error: null, stale: true }
        }
        setAccountLifecycle({ status: lifecycle.status || 'active', deletionScheduledFor: lifecycle.deletionScheduledFor || null, error: '' })
        if (lifecycle.status === 'pending_deletion' || lifecycle.status === 'deleting') {
          setProfileState({ ownerId: userId, data: null })
          if (mountedRef.current && activeUserIdRef.current === userId) setLoading(false)
          return { data: null, error: null, lifecycleStatus: lifecycle.status }
        }
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, phone')
        .eq('id', userId)
        .single()

      if (!mountedRef.current) return { data: null, error: null }
      if (!shouldAcceptProfileResponse(currentSeq, profileFetchSeqRef.current, activeUserIdRef.current, userId)) {
        return { data: null, error: null }
      }
      if (error) {
        setProfileState({ ownerId: userId, data: null })
        if (mountedRef.current && activeUserIdRef.current === userId) setLoading(false)
        return { data: null, error }
      }
      setProfileState({ ownerId: userId, data: data || null })
      if (session) {
        const otpResult = await ensureAdminOtpForSession(session, data)
        if (mountedRef.current && activeUserIdRef.current === userId) setLoading(false)
        return { data: data || null, error: null, otpResult }
      }
      if (mountedRef.current && activeUserIdRef.current === userId) setLoading(false)
      return { data: data || null, error: null }
    } catch (error) {
      if (!mountedRef.current) return { data: null, error: null }
      if (shouldAcceptProfileResponse(currentSeq, profileFetchSeqRef.current, activeUserIdRef.current, userId)) {
        setAccountLifecycle(current => ({ ...current, error: error?.message || 'Unable to verify account status.' }))
        setProfileState({ ownerId: userId, data: null })
      }
      if (mountedRef.current && activeUserIdRef.current === userId) setLoading(false)
      return { data: null, error }
    }
  }

  async function refreshProfile(expectedUserId = null) {
    const targetUserId = activeUserIdRef.current
    if (expectedUserId && targetUserId !== expectedUserId) return { data: null, error: null, stale: true }
    if (!targetUserId || !supabase) return { data: safeProfile, error: null }
    return fetchProfile(targetUserId)
  }

  async function refreshAdminOtpStatus() {
    if (!supabase) return { verified: false, error: new Error('Supabase is not configured.') }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Your login session has expired. Please sign in again.')
      const status = await invokeAdminOtp(session, 'status')
      const verified = status?.verified === true
      if (mountedRef.current) {
        setAdminOtpVerified(verified)
        setAdminOtpRequired(!verified)
        setAdminOtpError('')
      }
      if (verified) otpSessionRef.current = getSessionIdFromAccessToken(session.access_token)
      return { verified }
    } catch (error) {
      if (mountedRef.current) {
        setAdminOtpVerified(false)
        setAdminOtpRequired(true)
        setAdminOtpError(error?.message || 'Unable to check administrator verification.')
      }
      return { verified: false, error }
    }
  }

  useEffect(() => {
    mountedRef.current = true
    if (!supabase) {
      setLoading(false)
      return () => { mountedRef.current = false }
    }

    const bootstrapSeq = ++authEventSeqRef.current
    supabase.auth.getSession()
      .then(async ({ data, error }) => {
        if (!mountedRef.current || !shouldAcceptBootstrapSession(bootstrapSeq, authEventSeqRef.current)) return
        if (error) throw error
        const session = data?.session
        const currentId = session?.user?.id ?? null
        activeUserIdRef.current = currentId
        setUser(session?.user ?? null)
        if (!currentId) {
          setProfileState({ ownerId: null, data: null })
          setAdminOtpVerified(false)
          setAdminOtpRequired(false)
        } else {
          await fetchProfile(currentId, session)
        }
      })
      .catch(error => {
        if (!mountedRef.current || !shouldAcceptBootstrapSession(bootstrapSeq, authEventSeqRef.current)) return
        console.warn('[AuthContext] Session bootstrap failed:', error)
        activeUserIdRef.current = null
        setUser(null)
        setProfileState({ ownerId: null, data: null })
      })
      .finally(() => { if (mountedRef.current) setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return
      if (event === 'PASSWORD_RECOVERY' && session) setRecoveryMode(true)
      else if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || !session) setRecoveryMode(false)

      authEventSeqRef.current++
      const currentId = session?.user?.id ?? null
      const previousId = activeUserIdRef.current
      activeUserIdRef.current = currentId
      setUser(session?.user ?? null)
      setLoading(Boolean(currentId && (previousId !== currentId || event === 'SIGNED_IN' || event === 'USER_UPDATED')))

      if (previousId !== currentId) {
        profileFetchSeqRef.current++
        setProfileState({ ownerId: currentId, data: null })
      }
      if (!currentId) {
        profileFetchSeqRef.current++
        setProfileState({ ownerId: null, data: null })
        setAdminOtpVerified(false)
        setAdminOtpRequired(false)
        setAdminOtpLoading(false)
        setAdminOtpError('')
        setAccountLifecycle({ status: 'active', deletionScheduledFor: null, error: '' })
        otpSessionRef.current = null
        otpInitPromisesRef.current.clear()
      } else if (previousId !== currentId || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Defer network work out of the Supabase auth callback.
        Promise.resolve().then(() => fetchProfile(currentId, session))
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  async function signUp({ email, password, fullName }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
  }

  async function verifyEmailOtp({ email, token }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: String(token).trim(), type: 'signup' })
  }

  async function resendEmailOtp(email) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() })
  }

  async function signIn({ email, password }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    setRecoveryMode(false)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data?.session) return { data, error }
    try {
      const lifecycle = await invokeAccountLifecycle(data.session, 'status')
      if (mountedRef.current && activeUserIdRef.current === data.user.id) {
        setAccountLifecycle({ status: lifecycle.status || 'active', deletionScheduledFor: lifecycle.deletionScheduledFor || null, error: '' })
      }
      if (lifecycle.status === 'pending_deletion' || lifecycle.status === 'deleting') {
        if (mountedRef.current && activeUserIdRef.current === data.user.id) {
          setProfileState({ ownerId: data.user.id, data: null })
          setLoading(false)
        }
        return { data, error: null, requiresAccountRestore: true }
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles').select('id, full_name, avatar_url, role, phone')
        .eq('id', data.user.id).single()
      if (profileError) return { data, error: profileError }
      if (mountedRef.current && activeUserIdRef.current === data.user.id) setProfileState({ ownerId: data.user.id, data: profile })
      await ensureAdminOtpForSession(data.session, profile)
      if (mountedRef.current && activeUserIdRef.current === data.user.id) setLoading(false)
      return { data, error: null, requiresAdminOtp: profile?.role === 'admin' }
    } catch (lifecycleError) {
      if (mountedRef.current && activeUserIdRef.current === data.user.id) {
        setAccountLifecycle(current => ({ ...current, error: lifecycleError?.message || 'Unable to verify account status.' }))
        setLoading(false)
      }
      return { data, error: lifecycleError }
    }
  }

  async function signInWithGoogle() {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    setRecoveryMode(false)
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
  }

  async function signOut() {
    authEventSeqRef.current++
    profileFetchSeqRef.current++
    activeUserIdRef.current = null
    otpSessionRef.current = null
    otpInitPromisesRef.current.clear()
    setUser(null)
    setProfileState({ ownerId: null, data: null })
    setRecoveryMode(false)
    setAdminOtpVerified(false)
    setAdminOtpRequired(false)
    setAdminOtpLoading(false)
    setAdminOtpError('')
    setAccountLifecycle({ status: 'active', deletionScheduledFor: null, error: '' })
    if (!supabase) return { error: null }
    try {
      const { error } = await supabase.auth.signOut()
      if (error) console.warn('[AuthContext] Remote signOut failed:', error)
      return { error: error || null }
    } catch (error) {
      console.warn('[AuthContext] Remote signOut threw:', error)
      return { error }
    }
  }

  async function resetPassword(email) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile: safeProfile,
      loading,
      isAdmin,
      isAdminRole: isAdmin,
      recoveryMode,
      adminOtpVerified,
      adminOtpRequired,
      adminOtpLoading,
      adminOtpError,
      accountLifecycle,
      invokeAccountLifecycle,
      signUp,
      verifyEmailOtp,
      resendEmailOtp,
      signIn,
      signInWithGoogle,
      signOut,
      resetPassword,
      refreshProfile,
      refreshAdminOtpStatus,
      invokeAdminOtp,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
