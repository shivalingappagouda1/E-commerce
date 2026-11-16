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
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL
const supabaseKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY

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
 * Genuine network connectivity check.
 * Sends a lightweight GET request to the Supabase REST endpoint to verify
 * that the server is reachable and accepting requests with the configured API key.
 *
 * Resolves to { ok: true, message } if the Supabase project responds successfully,
 * or { ok: false, message } on failure or timeout.
 *
 * Safe to call from the UI — never leaks credentials or sensitive data in errors.
 */
export async function checkSupabaseConnection() {
  if (!supabase || !supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.',
    }
  }

  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, '')
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null

    // Perform an actual HTTP network call to the Supabase REST endpoint
    const response = await fetch(`${baseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      signal: controller ? controller.signal : undefined,
    })

    if (timeoutId) clearTimeout(timeoutId)

    if (response.ok) {
      return { ok: true, message: 'Connected to Supabase successfully.' }
    }

    // Handle non-success HTTP status codes (e.g. 401 Unauthorized, 403 Forbidden, 500, etc.)
    return {
      ok: false,
      message: `Supabase server responded with status ${response.status} (${response.statusText || 'Request failed'}).`,
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        message: 'Connection to Supabase timed out after 6 seconds.',
      }
    }
    // Return sanitized error without exposing API keys or credentials
    const cleanErrorMsg = err?.message ? String(err.message).replace(supabaseKey, '***') : 'Network request failed'
    return {
      ok: false,
      message: `Could not reach Supabase server: ${cleanErrorMsg}`,
    }
  }
}
