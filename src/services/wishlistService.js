/**
 * wishlistService.js — Supabase Database Wishlist Synchronization Service
 *
 * Persists authenticated customer wishlists in PostgreSQL `wishlists` and
 * `wishlist_items` tables governed by strict self-ownership RLS policies.
 * Never falls back silently to localStorage when Supabase is configured.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { normalizeDatabaseProduct } from './productService'
import { isValidUUID } from '../utils/wishlistHelpers'

/**
 * Ensures the authenticated user has a row in `wishlists` (1:1 via UNIQUE user_id).
 * Handles concurrent creation race (PostgreSQL 23505) idempotently.
 */
export async function getOrCreateUserWishlist(userId, client = supabase) {
  if (!client || (!isSupabaseConfigured && client === supabase)) {
    return { wishlistId: null, error: new Error('Supabase is not configured.') }
  }
  if (!userId || !isValidUUID(userId)) {
    return { wishlistId: null, error: new Error('Valid authenticated user ID is required.') }
  }

  try {
    const { data: existing, error: selectErr } = await client
      .from('wishlists')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (selectErr) {
      return { wishlistId: null, error: selectErr }
    }
    if (existing?.id) {
      return { wishlistId: existing.id, error: null }
    }

    const { data: created, error: insertErr } = await client
      .from('wishlists')
      .insert([{ user_id: userId }])
      .select('id')
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        const { data: retry, error: retryErr } = await client
          .from('wishlists')
          .select('id')
          .eq('user_id', userId)
          .single()
        if (!retryErr && retry?.id) {
          return { wishlistId: retry.id, error: null }
        }
      }
      return { wishlistId: null, error: insertErr }
    }

    return { wishlistId: created.id, error: null }
  } catch (err) {
    return { wishlistId: null, error: err }
  }
}

/**
 * Fetches all active wishlist products for an authenticated user from Supabase.
 */
export async function fetchDatabaseWishlist(userId, client = supabase) {
  if (!client || (!isSupabaseConfigured && client === supabase)) {
    return { data: null, wishlistId: null, error: new Error('Supabase is not configured.') }
  }
  if (!userId || !isValidUUID(userId)) {
    return { data: [], wishlistId: null, error: new Error('Valid authenticated user ID is required.') }
  }

  try {
    const { data: wishlistRow, error } = await client
      .from('wishlists')
      .select(`
        id,
        wishlist_items (
          id,
          product_id,
          added_at,
          products (
            id,
            name,
            slug,
            price,
            original_price,
            discount_percent,
            rating,
            review_count,
            badge,
            is_featured,
            is_active,
            categories ( id, name, slug ),
            product_images ( id, image_url, is_primary ),
            inventory ( quantity )
          )
        )
      `)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      return { data: null, wishlistId: null, error }
    }

    if (!wishlistRow || !Array.isArray(wishlistRow.wishlist_items)) {
      return { data: [], wishlistId: wishlistRow?.id || null, error: null }
    }

    const normalized = wishlistRow.wishlist_items
      .filter(wi => wi.products && wi.products.is_active !== false)
      .sort((a, b) => new Date(b.added_at || 0).getTime() - new Date(a.added_at || 0).getTime())
      .map(wi => normalizeDatabaseProduct(wi.products))
      .filter(Boolean)

    return { data: normalized, wishlistId: wishlistRow.id, error: null }
  } catch (err) {
    return { data: null, wishlistId: null, error: err }
  }
}

/**
 * Adds a single validated product UUID to the authenticated user's DB wishlist.
 * Handles duplicate unique constraint (23505) idempotently.
 */
export async function addDatabaseWishlistItem(userId, productId, client = supabase) {
  if (!client || (!isSupabaseConfigured && client === supabase)) {
    return { ok: false, error: new Error('Supabase is not configured.') }
  }
  if (!userId || !isValidUUID(userId)) {
    return { ok: false, error: new Error('Authentication required to save wishlist items.') }
  }
  if (!productId || !isValidUUID(productId)) {
    return { ok: false, error: new Error('Valid database product ID is required.') }
  }

  try {
    // Verify product exists and is active before creating wishlist or inserting row
    const { data: productRow, error: prodErr } = await client
      .from('products')
      .select('id, is_active')
      .eq('id', productId)
      .eq('is_active', true)
      .maybeSingle()

    if (prodErr) {
      return { ok: false, error: prodErr }
    }

    if (!productRow?.id || productRow.is_active === false) {
      return { ok: false, error: new Error('This product does not exist or is no longer available.') }
    }

    const { wishlistId, error: wlErr } = await getOrCreateUserWishlist(userId, client)
    if (wlErr || !wishlistId) {
      return { ok: false, error: wlErr || new Error('Could not initialize wishlist.') }
    }

    const { error: insertErr } = await client
      .from('wishlist_items')
      .insert([{ wishlist_id: wishlistId, product_id: productId }])

    if (insertErr && insertErr.code !== '23505') {
      return { ok: false, error: insertErr }
    }

    return { ok: true, wishlistId, error: null }
  } catch (err) {
    return { ok: false, error: err }
  }
}

/**
 * Removes a single product UUID from the authenticated user's DB wishlist.
 */
export async function removeDatabaseWishlistItem(userId, productId, client = supabase) {
  if (!client || (!isSupabaseConfigured && client === supabase)) {
    return { ok: false, error: new Error('Supabase is not configured.') }
  }
  if (!userId || !isValidUUID(userId)) {
    return { ok: false, error: new Error('Authentication required to update wishlist.') }
  }
  if (!productId || !isValidUUID(productId)) {
    return { ok: false, error: new Error('Valid database product ID is required.') }
  }

  try {
    const { data: wishlistRow, error: wlErr } = await client
      .from('wishlists')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (wlErr) {
      return { ok: false, error: wlErr }
    }
    if (!wishlistRow?.id) {
      return { ok: true, error: null }
    }

    const { error: delErr } = await client
      .from('wishlist_items')
      .delete()
      .eq('wishlist_id', wishlistRow.id)
      .eq('product_id', productId)

    if (delErr) {
      return { ok: false, error: delErr }
    }

    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err }
  }
}

/**
 * Clears all wishlist_items belonging to the authenticated user.
 */
export async function clearDatabaseWishlist(userId, client = supabase) {
  if (!client || (!isSupabaseConfigured && client === supabase)) {
    return { ok: false, error: new Error('Supabase is not configured.') }
  }
  if (!userId || !isValidUUID(userId)) {
    return { ok: false, error: new Error('Authentication required to clear wishlist.') }
  }

  try {
    const { data: wishlistRow, error: wlErr } = await client
      .from('wishlists')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (wlErr) {
      return { ok: false, error: wlErr }
    }
    if (!wishlistRow?.id) {
      return { ok: true, error: null }
    }

    const { error: delErr } = await client
      .from('wishlist_items')
      .delete()
      .eq('wishlist_id', wishlistRow.id)

    if (delErr) {
      return { ok: false, error: delErr }
    }

    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err }
  }
}

/**
 * Additively merges validated active guest wishlist items into the authenticated
 * user's DB wishlist using SELECT + INSERT RLS without overwriting existing DB items.
 */
export async function mergeGuestWishlistToDatabase(userId, guestItems = [], client = supabase) {
  if (!client || (!isSupabaseConfigured && client === supabase)) {
    return { mergedCount: 0, error: new Error('Supabase is not configured.') }
  }
  if (!userId || !isValidUUID(userId)) {
    return { mergedCount: 0, error: new Error('Valid authenticated user ID is required.') }
  }

  const candidateIds = [
    ...new Set(
      (Array.isArray(guestItems) ? guestItems : [])
        .map(item => item?.productId || item?.id)
        .filter(id => isValidUUID(id))
    ),
  ]

  if (candidateIds.length === 0) {
    return { mergedCount: 0, error: null }
  }

  try {
    // 1. Validate that candidate IDs exist as active database products
    const { data: activeProducts, error: prodErr } = await client
      .from('products')
      .select('id')
      .in('id', candidateIds)
      .eq('is_active', true)

    if (prodErr) {
      return { mergedCount: 0, error: prodErr }
    }

    const validActiveIds = Array.isArray(activeProducts) ? activeProducts.map(p => p.id) : []
    if (validActiveIds.length === 0) {
      return { mergedCount: 0, error: null }
    }

    // 2. Ensure wishlist container exists
    const { wishlistId, error: wlErr } = await getOrCreateUserWishlist(userId, client)
    if (wlErr || !wishlistId) {
      return { mergedCount: 0, error: wlErr || new Error('Could not initialize wishlist.') }
    }

    // 3. Query existing items so we insert strictly missing ones (uses SELECT + INSERT RLS only)
    const { data: existingRows, error: existingErr } = await client
      .from('wishlist_items')
      .select('product_id')
      .eq('wishlist_id', wishlistId)

    if (existingErr) {
      return { mergedCount: 0, error: existingErr }
    }

    const existingSet = new Set((existingRows || []).map(r => r.product_id))
    const rowsToInsert = validActiveIds
      .filter(pid => !existingSet.has(pid))
      .map(pid => ({ wishlist_id: wishlistId, product_id: pid }))

    if (rowsToInsert.length === 0) {
      return { mergedCount: 0, error: null }
    }

    const { error: insertErr } = await client
      .from('wishlist_items')
      .insert(rowsToInsert)

    if (insertErr && insertErr.code !== '23505') {
      return { mergedCount: 0, error: insertErr }
    }

    return { mergedCount: rowsToInsert.length, error: null }
  } catch (err) {
    return { mergedCount: 0, error: err }
  }
}
