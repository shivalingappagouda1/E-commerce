/**
 * Pure authentication, identity isolation, and password recovery helpers.
 * Used by AuthContext and ResetPasswordPage and directly exercised by tests.
 */

export function resolveScopedProfile(user, profileState) {
  if (!user?.id || !profileState || !profileState.data) {
    return null
  }
  if (profileState.ownerId !== user.id) {
    return null
  }
  if (profileState.data.id && profileState.data.id !== user.id) {
    return null
  }
  return profileState.data
}

export function resolveIsAdmin(user, safeProfile) {
  return Boolean(
    user?.id &&
    safeProfile &&
    safeProfile.role === 'admin' &&
    (!safeProfile.id || safeProfile.id === user.id)
  )
}

export function shouldAcceptProfileResponse(currentSeq, latestSeq, activeUserId, targetUserId) {
  if (!targetUserId || !activeUserId) return false
  return currentSeq === latestSeq && activeUserId === targetUserId
}

export function shouldAcceptBootstrapSession(bootstrapSeq, latestAuthSeq) {
  return bootstrapSeq === latestAuthSeq
}

/**
 * Inspects a Supabase JWT access token for an Authentication Methods Reference (amr)
 * entry confirming a password recovery flow.
 */
export function hasRecoveryAmrClaim(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return false
  try {
    const parts = accessToken.split('.')
    if (parts.length !== 3) return false
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('utf8')
    const claims = JSON.parse(jsonPayload)
    if (!Array.isArray(claims.amr)) return false
    return claims.amr.some(entry => entry && entry.method === 'recovery')
  } catch {
    return false
  }
}

/**
 * Determines whether the current session represents a legitimate password recovery session.
 * Rejects ordinary sign-in sessions (where event is SIGNED_IN and no recovery signal exists).
 */
export function isValidRecoverySession({ recoveryMode, event, session }) {
  if (!session || !session.user) return false
  if (event === 'PASSWORD_RECOVERY') return true
  if (recoveryMode === true) return true
  if (hasRecoveryAmrClaim(session.access_token)) return true
  return false
}

/**
 * Validates exact password and confirmation inputs without trimming characters.
 */
export function validateResetPassword(password, confirmPassword) {
  if (typeof password !== 'string' || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters long.' }
  }
  if (password !== confirmPassword) {
    return { valid: false, error: 'Passwords do not match. Please ensure both fields are identical.' }
  }
  return { valid: true, error: '' }
}

/**
 * Maps Supabase Auth errors into safe, user-facing messages without leaking raw provider internals.
 */
export function mapSafeAuthError(error, fallbackMessage = 'Unable to complete your request. Please try again later.') {
  if (!error) return fallbackMessage
  const msg = String(error.message || '').toLowerCase()
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token') || msg.includes('session')) {
    return 'Your password reset link is invalid or has expired. Please request a new reset link.'
  }
  if (msg.includes('same password') || msg.includes('different from the old')) {
    return 'Please choose a new password that is different from your current password.'
  }
  if (msg.includes('weak') || msg.includes('at least')) {
    return 'Password must be at least 6 characters long.'
  }
  return fallbackMessage
}
