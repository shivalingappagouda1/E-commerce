import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  resolveScopedProfile,
  resolveIsAdmin,
  shouldAcceptProfileResponse,
  shouldAcceptBootstrapSession,
} from '../utils/authHelpers'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profileState, setProfileState] = useState({ ownerId: null, data: null })
  const [loading, setLoading] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(false)

  const activeUserIdRef = useRef(null)
  const profileFetchSeqRef = useRef(0)
  const authEventSeqRef = useRef(0)
  const mountedRef = useRef(true)

  const safeProfile = resolveScopedProfile(user, profileState)
  const isAdmin = resolveIsAdmin(user, safeProfile)

  async function fetchProfile(userId) {
    if (!userId) {
      if (mountedRef.current) setProfileState({ ownerId: null, data: null })
      return { data: null, error: null }
    }
    const currentSeq = ++profileFetchSeqRef.current
    try {
      if (!supabase) return { data: null, error: null }
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, avatar_url, role, phone')
        .eq('id', userId).single()
      if (!mountedRef.current) return { data: null, error: null }
      if (!shouldAcceptProfileResponse(currentSeq, profileFetchSeqRef.current, activeUserIdRef.current, userId)) {
        return { data: null, error: null }
      }
      if (error) {
        setProfileState({ ownerId: userId, data: null })
        return { data: null, error }
      }
      setProfileState({ ownerId: userId, data: data || null })
      return { data: data || null, error: null }
    } catch (err) {
      if (!mountedRef.current) return { data: null, error: null }
      if (shouldAcceptProfileResponse(currentSeq, profileFetchSeqRef.current, activeUserIdRef.current, userId)) {
        setProfileState({ ownerId: userId, data: null })
      }
      return { data: null, error: err }
    }
  }

  async function refreshProfile(expectedUserId = null) {
    const targetUserId = activeUserIdRef.current
    if (expectedUserId && targetUserId !== expectedUserId) return { data: null, error: null, stale: true }
    if (!targetUserId || !supabase) return { data: resolveScopedProfile(user, profileState), error: null }
    return fetchProfile(targetUserId)
  }

  useEffect(() => {
    mountedRef.current = true
    if (!supabase) {
      setLoading(false)
      return () => { mountedRef.current = false }
    }

    const bootstrapSeq = ++authEventSeqRef.current
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mountedRef.current || !shouldAcceptBootstrapSession(bootstrapSeq, authEventSeqRef.current)) return
        if (error) {
          console.warn('[AuthContext] getSession returned error:', error)
          activeUserIdRef.current = null
          setUser(null)
          setProfileState({ ownerId: null, data: null })
          return
        }
        const session = data?.session
        const currentId = session?.user?.id ?? null
        activeUserIdRef.current = currentId
        setUser(session?.user ?? null)
        if (!currentId) setProfileState({ ownerId: null, data: null })
        else fetchProfile(currentId)
      })
      .catch(err => {
        if (!mountedRef.current || !shouldAcceptBootstrapSession(bootstrapSeq, authEventSeqRef.current)) return
        console.warn('[AuthContext] getSession rejected with exception:', err)
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
      setLoading(false)

      if (previousId !== currentId) {
        profileFetchSeqRef.current++
        setProfileState({ ownerId: currentId, data: null })
      }
      if (!currentId) {
        profileFetchSeqRef.current++
        setProfileState({ ownerId: null, data: null })
      } else if (previousId !== currentId || event === 'USER_UPDATED') {
        fetchProfile(currentId)
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  async function signUp({ email, password, fullName }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })
  }

  async function signUpWithPhone({ phone, password, fullName }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.signUp({
      phone,
      password,
      options: { data: { full_name: fullName.trim(), phone } },
    })
  }

  async function verifyEmailOtp({ email, token }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'signup' })
  }

  async function verifyPhoneOtp({ phone, token }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.verifyOtp({ phone, token: token.trim(), type: 'sms' })
  }

  async function resendEmailOtp(email) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() })
  }

  async function resendPhoneOtp(phone) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.resend({ type: 'sms', phone })
  }

  async function signIn({ email, password }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    setRecoveryMode(false)
    return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  }

  async function sendPhoneLoginOtp(phone) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } })
  }

  async function verifyPhoneLoginOtp({ phone, token }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    setRecoveryMode(false)
    return supabase.auth.verifyOtp({ phone, token: token.trim(), type: 'sms' })
  }

  async function signInWithGoogle() {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    setRecoveryMode(false)
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  async function signOut() {
    authEventSeqRef.current++
    profileFetchSeqRef.current++
    activeUserIdRef.current = null
    setUser(null)
    setProfileState({ ownerId: null, data: null })
    setRecoveryMode(false)
    if (!supabase) return { error: null }
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.warn('[AuthContext] Remote signOut encountered an error:', error)
        return { error }
      }
      return { error: null }
    } catch (err) {
      console.warn('[AuthContext] Remote signOut threw an exception:', err)
      return { error: err }
    }
  }

  async function resetPassword(email) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }

  return (
    <AuthContext.Provider value={{
      user, profile: safeProfile, loading, isAdmin, recoveryMode,
      signUp, signUpWithPhone, verifyEmailOtp, verifyPhoneOtp,
      resendEmailOtp, resendPhoneOtp, signIn, sendPhoneLoginOtp,
      verifyPhoneLoginOtp, signInWithGoogle, signOut, resetPassword, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
