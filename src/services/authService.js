/**
 * authService.js
 *
 * Server-side auth utilities that use the Supabase client.
 * All auth state management lives in AuthContext.
 * This module exposes one-off helpers (e.g. profile updates and avatar uploads).
 */
import { supabase } from '../lib/supabase'

/** Update a user's profile data */
export async function updateProfile({ userId, fullName, phone, avatarUrl }) {
  if (!supabase) return { error: { message: 'Supabase not configured.' } }

  const updates = {}
  if (fullName  !== undefined) updates.full_name  = fullName
  if (phone     !== undefined) updates.phone      = phone
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()

  return { data, error }
}

/** Maximum avatar size allowed: 5 MB */
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024

/** Permitted MIME types for profile avatars */
export const ALLOWED_AVATAR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

/** Permitted lowercase file extensions mapped by MIME type */
export const MIME_TO_ALLOWED_EXTENSIONS = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png':  ['png'],
  'image/webp': ['webp'],
  'image/gif':  ['gif'],
}

/**
 * Pure client-side validation for avatar files before calling Supabase Storage.
 */
export function validateAvatarFile({ userId, file }) {
  if (!userId) {
    return { valid: false, error: { message: 'User ID is required to upload an avatar.' } }
  }

  if (!file) {
    return { valid: false, error: { message: 'No file provided for upload.' } }
  }

  if (typeof file.size !== 'number' || file.size <= 0) {
    return { valid: false, error: { message: 'Selected avatar file is empty or unreadable.' } }
  }

  // 1. File size validation (maximum 5 MB)
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return { valid: false, error: { message: 'Avatar image size must be a maximum of 5 MB.' } }
  }

  // 2. MIME type validation
  const fileType = file.type ? file.type.toLowerCase() : ''
  if (!ALLOWED_AVATAR_MIME_TYPES.includes(fileType)) {
    return {
      valid: false,
      error: {
        message: 'Invalid image format. Only JPEG, PNG, WEBP, and GIF images are allowed.',
      },
    }
  }

  // 3. Lowercase extension normalization and contradiction check against validated MIME type
  const rawExt = file.name && file.name.includes('.') ? file.name.split('.').pop() : ''
  const ext = rawExt ? rawExt.toLowerCase() : ''

  const allowedExts = MIME_TO_ALLOWED_EXTENSIONS[fileType] || []
  if (!ext || !allowedExts.includes(ext)) {
    return {
      valid: false,
      error: {
        message: `File extension .${ext || 'unknown'} contradicts validated MIME type ${fileType}. Allowed extensions: ${allowedExts.join(', ')}.`,
      },
    }
  }

  return {
    valid: true,
    ext,
    path: `avatars/${userId}.${ext}`,
    error: null,
  }
}

/**
 * Extracts a safe user-facing upload error without leaking internal Storage paths or buckets.
 */
export function mapSafeUploadError(error) {
  if (!error) return { message: 'Unable to upload avatar image. Please try again.' }
  const msg = String(error.message || '').toLowerCase()
  if (msg.includes('payload too large') || msg.includes('size') || msg.includes('exceeded')) {
    return { message: 'Avatar image size must be a maximum of 5 MB.' }
  }
  if (msg.includes('unauthorized') || msg.includes('permission') || msg.includes('policy') || msg.includes('jwt')) {
    return { message: 'Your session is not authorized to update this avatar. Please sign in again.' }
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
    return { message: 'Network error during upload. Please check your connection and try again.' }
  }
  return { message: 'Failed to upload avatar image. Please choose a valid JPEG, PNG, WEBP, or GIF image.' }
}

/**
 * Extracts the storage object path (avatars/<userId>.<ext>) from a public-assets URL if owned by userId.
 */
export function extractOwnedAvatarPath(avatarUrl, userId) {
  if (!avatarUrl || !userId || typeof avatarUrl !== 'string') return null
  const match = avatarUrl.match(/\/public-assets\/(avatars\/[^/?#]+)/i)
  if (!match) return null
  const storagePath = match[1]
  if (!storagePath.startsWith(`avatars/${userId}.`)) return null
  return storagePath
}

/**
 * Best-effort removal of a user's owned avatar object (used to roll back failed DB persistence
 * or remove stale previous-extension files).
 */
export async function removeAvatarObject(storagePath, client = supabase) {
  if (!client || !storagePath) return { error: null }
  try {
    const { error } = await client.storage.from('public-assets').remove([storagePath])
    return { error: error || null }
  } catch (err) {
    return { error: err }
  }
}

/**
 * Upload a profile avatar to Supabase Storage with strict client-side validation,
 * MIME-extension contradiction prevention, lowercase extension normalization,
 * and cache-busting versioning.
 *
 * Does NOT delete any previous avatar object here so the prior avatar remains intact
 * if the subsequent profile database update fails; returns `previousStoragePath` for
 * post-DB-save cleanup by the caller once persistence succeeds.
 */
export async function uploadAvatar({ userId, file, previousAvatarUrl = null, client = supabase }) {
  const validation = validateAvatarFile({ userId, file })
  if (!validation.valid) {
    return { error: validation.error }
  }

  if (!client) return { error: { message: 'Supabase not configured.' } }

  const path = `avatars/${userId}.${validation.ext}`

  try {
    const { error: uploadError } = await client.storage
      .from('public-assets')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      return { error: mapSafeUploadError(uploadError) }
    }

    const oldPath = extractOwnedAvatarPath(previousAvatarUrl, userId)
    const previousStoragePath = oldPath && oldPath !== path ? oldPath : null

    const { data } = client.storage
      .from('public-assets')
      .getPublicUrl(path)

    const baseUrl = data?.publicUrl
    if (!baseUrl) {
      return { error: { message: 'Avatar uploaded, but image URL could not be retrieved.' } }
    }

    // Cache-buster guarantees updated same-extension uploads refresh immediately in browser UI
    const cacheBustedUrl = `${baseUrl}?v=${Date.now()}`

    return {
      url: cacheBustedUrl,
      storagePath: path,
      previousStoragePath,
      replacedExistingPath: oldPath === path,
      error: null,
    }
  } catch (err) {
    return { error: mapSafeUploadError(err) }
  }
}
