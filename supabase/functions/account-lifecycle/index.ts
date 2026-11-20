import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * ShopKart account lifecycle Edge Function.
 * Keeps the existing actions and database/RPC contract:
 * status, request_deletion, confirm_deletion, start_restore,
 * confirm_restore, and cron-only purge_expired.
 */

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const supabaseUrl = requiredEnv('SUPABASE_URL')
const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
const anonKey = requiredEnv('SUPABASE_ANON_KEY')
const OTP_SECRET = requiredEnv('ACCOUNT_LIFECYCLE_OTP_HASH_SECRET')
const BREVO_KEY = requiredEnv('BREVO_API_KEY')
const SENDER_EMAIL = requiredEnv('BREVO_SENDER_EMAIL')
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173'

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

const corsHeaders = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected server error.'
}

// Rejection sampling avoids modulo bias when generating an 8-digit OTP.
function makeOtp(): string {
  const range = 100_000_000
  const uint32Range = 0x1_0000_0000
  const limit = Math.floor(uint32Range / range) * range

  while (true) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0]
    if (random < limit) return String(random % range).padStart(8, '0')
  }
}

async function hashOtp(userId: string, purpose: string, otp: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(OTP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${userId}:${purpose}:${otp}`),
  )
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function ownedAvatarPath(url: string | null, userId: string): string | null {
  if (!url) return null
  const match = url.match(/\/public-assets\/(avatars\/[^/?#]+)/i)
  const path = match?.[1]
  return path?.startsWith(`avatars/${userId}.`) ? path : null
}

async function sendOtp(email: string, otp: string, purpose: 'delete' | 'restore') {
  const subject = purpose === 'delete'
    ? 'Confirm your ShopKart account deletion'
    : 'Restore your ShopKart account'
  const action = purpose === 'delete'
    ? 'confirm account deletion'
    : 'restore your account'

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: SENDER_EMAIL, name: 'ShopKart' },
      to: [{ email }],
      subject,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <h2>ShopKart account security</h2>
        <p>Use this code to ${action}:</p>
        <p style="font-size:30px;font-weight:bold;letter-spacing:6px">${otp}</p>
        <p>This code expires in 5 minutes. You have up to 5 attempts.
        If you did not request this, ignore this email.</p>
      </div>`,
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    console.error('[account-lifecycle] Brevo email error:', response.status, details)
    throw new Error(`Email delivery failed (${response.status}).`)
  }
}

async function issueOtp(userId: string, email: string, purpose: 'delete' | 'restore') {
  const { data: existing, error: existingError } = await admin
    .from('account_lifecycle_challenges')
    .select('last_sent_at')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .maybeSingle()

  if (existingError) throw existingError

  if (
    existing?.last_sent_at &&
    Date.now() - new Date(existing.last_sent_at).getTime() < 60_000
  ) {
    throw new Error('Please wait 60 seconds before requesting another code.')
  }

  const otp = makeOtp()
  const otpHash = await hashOtp(userId, purpose, otp)
  const sentAt = new Date()
  const { error: upsertError } = await admin
    .from('account_lifecycle_challenges')
    .upsert({
      user_id: userId,
      purpose,
      otp_hash: otpHash,
      attempts: 0,
      expires_at: new Date(sentAt.getTime() + 5 * 60_000).toISOString(),
      last_sent_at: sentAt.toISOString(),
    }, { onConflict: 'user_id,purpose' })

  if (upsertError) throw upsertError

  try {
    await sendOtp(email, otp, purpose)
  } catch (error) {
    const { error: cleanupError } = await admin
      .from('account_lifecycle_challenges')
      .delete()
      .eq('user_id', userId)
      .eq('purpose', purpose)

    if (cleanupError) {
      console.error('[account-lifecycle] Could not remove unsent OTP challenge:', cleanupError.message)
    }
    throw error
  }
}

async function purgeExpiredAccounts() {
  const now = new Date()
  const nowIso = now.toISOString()
  const staleClaimBefore = new Date(now.getTime() - 30 * 60_000).toISOString()
  const batchSize = 100

  const [pendingResult, staleResult] = await Promise.all([
    admin.from('profiles')
      .select('id')
      .eq('role', 'customer')
      .eq('account_status', 'pending_deletion')
      .lte('deletion_scheduled_for', nowIso)
      .limit(batchSize),
    admin.from('profiles')
      .select('id')
      .eq('role', 'customer')
      .eq('account_status', 'deleting')
      .lte('deletion_scheduled_for', nowIso)
      .lte('updated_at', staleClaimBefore)
      .limit(batchSize),
  ])

  if (pendingResult.error) throw pendingResult.error
  if (staleResult.error) throw staleResult.error

  const candidates = [
    ...(pendingResult.data ?? []).map((row) => ({
      id: row.id,
      expectedStatus: 'pending_deletion' as const,
      stale: false,
    })),
    ...(staleResult.data ?? []).map((row) => ({
      id: row.id,
      expectedStatus: 'deleting' as const,
      stale: true,
    })),
  ]

  let deleted = 0
  let failed = 0

  for (const candidate of candidates) {
    const claimQuery = admin.from('profiles')
      .update({ account_status: 'deleting', updated_at: nowIso })
      .eq('id', candidate.id)
      .eq('role', 'customer')
      .eq('account_status', candidate.expectedStatus)
      .lte('deletion_scheduled_for', nowIso)

    const { data: claimed, error: claimError } = candidate.stale
      ? await claimQuery
        .lte('updated_at', staleClaimBefore)
        .select('id')
        .maybeSingle()
      : await claimQuery.select('id').maybeSingle()

    if (claimError) {
      failed++
      console.error('[account-lifecycle] Could not claim expired account:', candidate.id, claimError.message)
      continue
    }

    // A concurrent cron invocation may already own this account.
    if (!claimed) continue

    try {
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('avatar_url')
        .eq('id', candidate.id)
        .eq('account_status', 'deleting')
        .maybeSingle()

      if (profileError) throw profileError
      if (!profile) throw new Error('Claimed profile could not be loaded.')

      const { data: customerOrders, error: ordersError } = await admin
        .from('orders')
        .select('id')
        .eq('user_id', candidate.id)

      if (ordersError) throw ordersError
      const orderIds = (customerOrders ?? []).map((order: { id: string }) => order.id)

      // Clear free-text fields that may contain customer-provided personal data.
      const { error: orderNotesError } = await admin
        .from('orders')
        .update({ notes: null })
        .eq('user_id', candidate.id)

      if (orderNotesError) throw orderNotesError

      if (orderIds.length > 0) {
        const { error: inspectionNotesError } = await admin
          .from('physical_return_inspections')
          .update({ inspection_notes: null })
          .in('order_id', orderIds)

        if (inspectionNotesError) throw inspectionNotesError
      }

      // Preserve return records but replace the customer identifier with one
      // pseudonymous UUID shared by this customer's return records.
      const { error: returnError } = await admin
        .from('return_requests')
        .update({ user_id: crypto.randomUUID(), explanation: null })
        .eq('user_id', candidate.id)

      if (returnError) throw returnError

      const avatarPath = ownedAvatarPath(profile.avatar_url ?? null, candidate.id)
      if (avatarPath) {
        const { error: avatarError } = await admin.storage
          .from('public-assets')
          .remove([avatarPath])
        if (avatarError) throw avatarError
      }

      // Challenges have no profile FK, so remove them before deleting auth.users.
      const { error: challengeError } = await admin
        .from('account_lifecycle_challenges')
        .delete()
        .eq('user_id', candidate.id)

      if (challengeError) throw challengeError

      // Keep Auth deletion last so earlier failures can be retried.
      const { error: deleteError } = await admin.auth.admin.deleteUser(candidate.id)
      if (deleteError) throw deleteError

      deleted++
    } catch (purgeError) {
      failed++
      console.error('[account-lifecycle] Account purge failed; it will be retried:', candidate.id, purgeError)

      // Retry on the next cron run. If releasing the claim fails, the stale
      // claim path retries the deleting profile after 30 minutes.
      const { error: recoveryError } = await admin
        .from('profiles')
        .update({
          account_status: 'pending_deletion',
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidate.id)
        .eq('account_status', 'deleting')

      if (recoveryError) {
        console.error(
          '[account-lifecycle] Could not release purge claim; stale-claim retry will recover it:',
          candidate.id,
          recoveryError.message,
        )
      }
    }
  }

  return { ok: failed === 0, processed: candidates.length, deleted, failed }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  // Browser requests must originate from the configured application.
  // Server/cron requests may omit Origin and are authenticated separately.
  if (origin && origin !== APP_ORIGIN) {
    return json({ error: 'Origin not allowed.' }, 403)
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action

    // Cron-only operation. A user bearer token is not accepted here.
    if (action === 'purge_expired') {
      const cronSecret = Deno.env.get('ACCOUNT_PURGE_CRON_SECRET')
      if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
        return json({ error: 'Unauthorized.' }, 401)
      }

      return json(await purgeExpiredAccounts())
    }

    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Authentication required.' }, 401)

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    })

    const { data: authData, error: authError } = await caller.auth.getUser(token)
    if (authError || !authData.user) {
      return json({ error: 'Invalid or expired session.' }, 401)
    }

    const user = authData.user
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, account_status, deletion_scheduled_for')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) return json({ error: 'Account profile not found.' }, 404)

    if (action === 'status') {
      return json({
        status: profile.account_status ?? 'active',
        deletionScheduledFor: profile.deletion_scheduled_for ?? null,
        isAdmin: profile.role === 'admin',
      })
    }

    if (profile.role === 'admin') {
      return json({ error: 'Administrator accounts are protected from self-deletion.' }, 403)
    }

    if (action === 'request_deletion') {
      if (profile.account_status !== 'active') {
        return json({ error: 'This account is already pending deletion.' }, 409)
      }
      if (!user.email) {
        return json({ error: 'Your account has no email address for verification.' }, 400)
      }

      await issueOtp(user.id, user.email, 'delete')
      return json({
        ok: true,
        message: 'A verification code has been sent to your email.',
      })
    }

    if (action === 'confirm_deletion' || action === 'confirm_restore') {
      const purpose = action === 'confirm_deletion' ? 'delete' : 'restore'
      const otp = String(body?.otp ?? '').trim()

      if (!/^\d{8}$/.test(otp)) {
        return json({ error: 'Enter the 8-digit verification code.' }, 400)
      }

      const otpHash = await hashOtp(user.id, purpose, otp)
      const { data, error } = await admin.rpc('account_lifecycle_confirm', {
        p_user_id: user.id,
        p_purpose: purpose,
        p_otp_hash: otpHash,
      })

      if (error) throw error

      if (!data?.ok) {
        const messages: Record<string, string> = {
          invalid: 'The code is incorrect.',
          expired: 'The code has expired. Request a new one.',
          locked: 'Too many attempts. Request a new code.',
          not_eligible: 'This account cannot be scheduled for deletion.',
          not_restorable: 'The restoration period has ended.',
        }
        return json({ error: messages[data?.reason] ?? 'Verification failed.' }, 400)
      }

      if (purpose === 'delete') {
        // The confirmation RPC has already committed the pending-deletion
        // state, so avatar cleanup is best-effort and also retried at purge.
        const { data: profileWithAvatar, error: avatarProfileError } = await admin
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .maybeSingle()

        if (avatarProfileError) {
          console.error('[account-lifecycle] Could not load avatar during deletion request:', avatarProfileError.message)
        }

        const avatarPath = ownedAvatarPath(profileWithAvatar?.avatar_url ?? null, user.id)
        if (avatarPath) {
          const { error: avatarError } = await admin.storage
            .from('public-assets')
            .remove([avatarPath])
          if (avatarError) {
            console.error('[account-lifecycle] Avatar cleanup failed during deletion request:', avatarError.message)
          }
        }

        const { error: clearAvatarError } = await admin
          .from('profiles')
          .update({ avatar_url: null })
          .eq('id', user.id)

        if (clearAvatarError) {
          console.error('[account-lifecycle] Could not clear avatar_url during deletion request:', clearAvatarError.message)
        }
      }

      const { data: updated, error: updatedError } = await admin
        .from('profiles')
        .select('deletion_scheduled_for')
        .eq('id', user.id)
        .maybeSingle()

      if (updatedError) throw updatedError

      return json({
        ok: true,
        status: purpose === 'delete' ? 'pending_deletion' : 'active',
        deletionScheduledFor: updated?.deletion_scheduled_for ?? null,
      })
    }

    if (action === 'start_restore') {
      if (
        profile.account_status !== 'pending_deletion' ||
        !profile.deletion_scheduled_for ||
        new Date(profile.deletion_scheduled_for).getTime() <= Date.now()
      ) {
        return json({ error: 'This account is no longer eligible for restoration.' }, 409)
      }
      if (!user.email) {
        return json({ error: 'Your account has no email address for verification.' }, 400)
      }

      await issueOtp(user.id, user.email, 'restore')
      return json({
        ok: true,
        message: 'A restoration code has been sent to your email.',
      })
    }

    return json({ error: 'Unsupported action.' }, 400)
  } catch (error) {
    console.error('[account-lifecycle]', error)
    return json({ error: errorMessage(error) }, 500)
  }
})
