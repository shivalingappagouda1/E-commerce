import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

/**
 * AuthProvider — wraps the app and exposes current auth session.
 *
 * When Supabase is not configured (supabase === null), the user is
 * always treated as a guest. No auth operations will be attempted.
 *
 * Usage:
 *   const { user, profile, loading, signIn, signUp, signOut } = useAuth()
 */
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)   // Supabase auth user
  const [profile, setProfile] = useState(null)   // profiles table row (includes role)
  const [loading, setLoading] = useState(true)

  /* ── Fetch the user's profile row ── */
  async function fetchProfile(userId) {
    if (!supabase || !userId) return
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, phone')
      .eq('id', userId)
      .single()
    setProfile(data || null)
  }

  /* ── Bootstrap: read current session on mount ── */
  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      fetchProfile(session?.user?.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      fetchProfile(session?.user?.id)
    })

    return () => subscription.unsubscribe()
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signInWithGoogle() {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return { data, error }
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  async function resetPassword(email) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } }
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <AuthContext.Provider value={{
      user, profile, loading, isAdmin,
      signUp, signIn, signInWithGoogle, signOut, resetPassword,
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
