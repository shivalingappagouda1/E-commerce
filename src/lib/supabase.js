import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client — reads credentials from environment variables only.
 * Never hardcode keys here. Create a .env.local file at the project root:
 *
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
 *
 * The publishable key is safe to expose in the frontend because Row Level
 * Security policies on each table control what authenticated and anonymous
 * users can access. Never put the service-role key in frontend code.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** Whether both env vars are present (does NOT mean the connection works). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is not set. ' +
    'Create a .env.local file at the project root. ' +
    'The app will run with sample data until Supabase is configured.'
  )
}

/**
 * The Supabase client instance.
 * Null when env vars are missing — every consumer must handle `null` gracefully.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null

/**
 * Lightweight connection check.
 * Resolves to { ok: true } if the Supabase project responds,
 * or { ok: false, message } on failure.
 *
 * Safe to call from the UI — never leaks credentials or sensitive data.
 */
export async function checkSupabaseConnection() {
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.',
    }
  }

  try {
    // A trivial query that works even before any tables exist.
    // auth.getSession() is a safe no-op that confirms the endpoint is reachable.
    const { error } = await supabase.auth.getSession()
    if (error) {
      return { ok: false, message: `Supabase responded with an error: ${error.message}` }
    }
    return { ok: true, message: 'Connected to Supabase successfully.' }
  } catch (err) {
    return { ok: false, message: `Could not reach Supabase: ${err.message}` }
  }
}
