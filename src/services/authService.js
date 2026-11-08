/**
 * authService.js
 *
 * Server-side auth utilities that use the Supabase client.
 * All auth state management lives in AuthContext.
 * This module exposes one-off helpers (e.g. profile updates).
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

/** Upload a profile avatar to Supabase Storage */
export async function uploadAvatar({ userId, file }) {
  if (!supabase) return { error: { message: 'Supabase not configured.' } }

  const ext  = file.name.split('.').pop()
  const path = `avatars/${userId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('public-assets')
    .upload(path, file, { upsert: true })

  if (uploadError) return { error: uploadError }

  const { data } = supabase.storage
    .from('public-assets')
    .getPublicUrl(path)

  return { url: data.publicUrl, error: null }
}
