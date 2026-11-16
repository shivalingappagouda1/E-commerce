import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  resolveScopedProfile,
  resolveIsAdmin,
  shouldAcceptProfileResponse,
  shouldAcceptBootstrapSession,
} from '../utils/authHelpers'

export const AuthContext = createContext(null)

/**
 * AuthProvider — wraps the app and exposes current auth session.
 *
 * When Supabase is not configured (supabase === null), the user is
 * always treated as a guest. No auth operations will be attempted.
 *
 * Usage:
 *   const { user, profile, loading, isAdmin, recoveryMode, signIn, signUp, signOut } = useAuth()
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // profileState tracks { ownerId: string | null, data: object | null }
  const [profileState, setProfileState] = useState({ ownerId: null, data: null })
  const [loading, setLoading] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(false)

  // Sequencing refs to guarantee order-of-events integrity
  const activeUserIdRef = useRef(null)
  const profileFetchSeqRef = useRef(0)
  const authEventSeqRef = useRef(0)
  const mountedRef = useRef(true)

  /* ── Synchronous render-time profile ownership guard ── */
  const safeProfile = resolveScopedProfile(user, profileState)
  const isAdmin = resolveIsAdmin(user, safeProfile)

  /* ── Fetch the user's profile row safely with sequence guard ── */
  async function fetchProfile(userId) {
    if (!userId) {
      if (mountedRef.current) setProfileState({ ownerId: null, data: null })
      return { data: null, error: null }
    }
    const currentSeq = ++profileFetchSeqRef.current

    try {
      if (!supabase) return { data: null, error: null }
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

  /* ── Explicit sequence-protected profile refresh after profile/avatar saves ── */
  async function refreshProfile(expectedUserId = null) {
    const targetUserId = activeUserIdRef.current
    if (expectedUserId && targetUserId !== expectedUserId) {
      return { data: null, error: null, stale: true }
    }
    if (!targetUserId || !supabase) {
      return { data: resolveScopedProfile(user, profileState), error: null }
    }
    return fetchProfile(targetUserId)
  }

  /* ── Bootstrap: read current session on mount ── */
  useEffect(() => {
    mountedRef.current = true
    if (!supabase) {
      setLoading(false)
      return () => { mountedRef.current = false }
    }

    const bootstrapSeq = ++authEventSeqRef.current

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mountedRef.current) return
        // If a newer auth event or signOut occurred before getSession finished, discard bootstrap payload
        if (!shouldAcceptBootstrapSession(bootstrapSeq, authEventSeqRef.current)) {
          return
        }

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
        if (!currentId) {
          setProfileState({ ownerId: null, data: null })
        } else {
          fetchProfile(currentId)
        }
      })
      .catch(err => {
        if (!mountedRef.current) return
        if (!shouldAcceptBootstrapSession(bootstrapSeq, authEventSeqRef.current)) {
          return
        }
        console.warn('[AuthContext] getSession rejected with exception:', err)
        activeUserIdRef.current = null
        setUser(null)
        setProfileState({ ownerId: null, data: null })
      })
      .finally(() => {
        if (mountedRef.current) {
          setLoading(false)
        }
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return

      // Track password recovery event even if it fires before ResetPasswordPage mounts
      if (event === 'PASSWORD_RECOVERY' && session) {
        setRecoveryMode(true)
      } else if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || !session) {
        setRecoveryMode(false)
      }

      // Newer auth event always supersedes pending bootstrap getSession()
      authEventSeqRef.current++
      const currentId = session?.user?.id ?? null
      const previousId = activeUserIdRef.current

      activeUserIdRef.current = currentId
      setUser(session?.user ?? null)
      setLoading(false)

      // Invalidate old profile immediately if identity changed (preserve during same-user token refresh)
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

  /* ── Auth actions ── */
  async function signUp({ email, password, fullName }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { data, error }
  }

  async function signIn({ email, password }) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    setRecoveryMode(false)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signInWithGoogle() {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    setRecoveryMode(false)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return { data, error }
  }

  async function signOut() {
    // Increment both sequencing counters to immediately invalidate inflight requests
    authEventSeqRef.current++
    profileFetchSeqRef.current++
    activeUserIdRef.current = null

    // Immediately wipe in-memory state and recovery mode
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
      recoveryMode,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      resetPassword,
      refreshProfile,
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
