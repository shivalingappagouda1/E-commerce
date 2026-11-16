/**
 * Pure wishlist isolation, validation, storage, and merge helpers.
 * Used by WishlistContext and wishlistService and directly tested in Node.
 */

export const LEGACY_WISHLIST_STORAGE_KEY = 'shopkart_wishlist'
export const GUEST_WISHLIST_STORAGE_KEY = 'shopkart_wishlist_guest'

/** RFC4122 UUID v1-v5 format validation matching PostgreSQL UUID columns */
export function isValidUUID(str) {
  return (
    typeof str === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim())
  )
}

export function getIdentityOwnerKey(userId) {
  return userId ? String(userId) : 'guest'
}

export function normalizeWishlistProduct(raw) {
  if (!raw || !raw.id) return null
  return {
    ...raw,
    id: String(raw.id),
    name: raw.name || 'Product',
    slug: raw.slug || '',
    price: Number(raw.price) || 0,
    originalPrice: Number(raw.originalPrice ?? raw.original_price ?? raw.price) || 0,
  }
}

export function deduplicateWishlistItems(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const clean = []
  for (const raw of list) {
    const item = normalizeWishlistProduct(raw)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    clean.push(item)
  }
  return clean
}

export function readGuestWishlist(storage) {
  if (!storage) return []
  try {
    const raw = storage.getItem(GUEST_WISHLIST_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return deduplicateWishlistItems(parsed)
  } catch {
    return []
  }
}

export function writeGuestWishlist(storage, items) {
  if (!storage) return
  try {
    const clean = deduplicateWishlistItems(items)
    storage.setItem(GUEST_WISHLIST_STORAGE_KEY, JSON.stringify(clean))
  } catch {
    // ignore storage quota errors
  }
}

export function clearGuestWishlist(storage) {
  if (!storage) return
  try {
    storage.removeItem(GUEST_WISHLIST_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function purgeLegacyWishlistKey(storage) {
  if (!storage) return
  try {
    storage.removeItem(LEGACY_WISHLIST_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Synchronous render-time ownership guard for wishlist state.
 * Guarantees zero cross-account flash during auth loading or account switches.
 */
export function resolveActiveWishlist(wishlistState, currentUserId, authLoading) {
  if (authLoading) return []
  if (!wishlistState || !Array.isArray(wishlistState.items)) return []
  const expectedOwner = getIdentityOwnerKey(currentUserId)
  if (wishlistState.ownerId !== expectedOwner) {
    return []
  }
  return deduplicateWishlistItems(wishlistState.items)
}

/**
 * Additive deduplicated merge keeping primary DB records when product IDs collide.
 */
export function mergeWishlistItems(primaryItems = [], secondaryItems = []) {
  const cleanPrimary = deduplicateWishlistItems(primaryItems)
  const cleanSecondary = deduplicateWishlistItems(secondaryItems)
  const seen = new Set(cleanPrimary.map(i => i.id))
  const merged = [...cleanPrimary]
  for (const item of cleanSecondary) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }
  return merged
}

/**
 * Maps Supabase / PostgREST wishlist errors to safe user-facing messages.
 */
export function mapSafeWishlistError(error, fallbackMessage = 'Unable to update your wishlist. Please try again.') {
  if (!error) return fallbackMessage
  const msg = String(error.message || '').toLowerCase()
  if (msg.includes('jwt') || msg.includes('auth') || msg.includes('session') || msg.includes('not authenticated')) {
    return 'Your session has expired. Please sign in again to sync your wishlist.'
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
    return 'Network error while syncing your wishlist. Please check your connection and try again.'
  }
  if (msg.includes('no longer available') || msg.includes('does not exist')) {
    return 'This product is currently unavailable and cannot be added to your wishlist.'
  }
  return fallbackMessage
}

/**
 * Moves a single wishlist product to cart only after `addToCartFn` confirms `{ ok: true }`.
 * Preserves the wishlist entry if cart addition fails.
 */
export async function moveWishlistItemToCart(product, { addToCartFn, removeFromWishlistFn } = {}) {
  if (!product?.id || typeof addToCartFn !== 'function') {
    return { ok: false, moved: false, error: 'Unable to move item to cart.' }
  }

  const cartResult = await addToCartFn(product)
  if (!cartResult?.ok) {
    return {
      ok: false,
      moved: false,
      error: cartResult?.error || `Could not move "${product.name || 'item'}" to cart. Kept in wishlist.`,
    }
  }

  if (typeof removeFromWishlistFn === 'function') {
    const removeResult = await removeFromWishlistFn(product.id)
    if (removeResult?.ok === false) {
      return {
        ok: false,
        moved: false,
        error: removeResult.error || 'Added to cart, but could not remove item from wishlist.',
      }
    }
  }

  return { ok: true, moved: true, error: null }
}

/**
 * Bulk-moves wishlist items to cart. Removes only items confirmed by `addToCartFn` (`ok === true`)
 * and strictly preserves any item whose cart addition failed.
 */
export async function moveAllWishlistItemsToCart(
  items = [],
  { addToCartFn, removeFromWishlistFn, clearWishlistFn } = {}
) {
  if (!Array.isArray(items) || items.length === 0 || typeof addToCartFn !== 'function') {
    return { movedCount: 0, failedCount: 0, error: null }
  }

  const movedProducts = []
  const failedReasons = []

  for (const product of items) {
    if (!product?.id) {
      failedReasons.push('Skipped an invalid product entry.')
      continue
    }
    const cartResult = await addToCartFn(product)
    if (cartResult?.ok) {
      movedProducts.push(product)
    } else {
      failedReasons.push(cartResult?.error || `Could not add "${product.name || 'item'}" to cart.`)
    }
  }

  if (movedProducts.length === 0) {
    return {
      movedCount: 0,
      failedCount: failedReasons.length,
      error: failedReasons[0] || 'Unable to move wishlist items to cart. Your wishlist was preserved.',
    }
  }

  if (
    failedReasons.length === 0 &&
    movedProducts.length === items.length &&
    typeof clearWishlistFn === 'function'
  ) {
    const clearResult = await clearWishlistFn()
    if (clearResult?.ok === false || clearResult?.error) {
      return {
        movedCount: movedProducts.length,
        failedCount: 0,
        error: clearResult.error || 'Items added to cart, but wishlist could not be cleared.',
      }
    }
    return { movedCount: movedProducts.length, failedCount: 0, error: null }
  }

  if (typeof removeFromWishlistFn === 'function') {
    for (const moved of movedProducts) {
      await removeFromWishlistFn(moved.id)
    }
  }

  const partialMessage =
    failedReasons.length > 0
      ? `Moved ${movedProducts.length} item${movedProducts.length === 1 ? '' : 's'} to cart. Kept ${failedReasons.length} item${failedReasons.length === 1 ? '' : 's'} in your wishlist (${failedReasons[0]}).`
      : null

  return {
    movedCount: movedProducts.length,
    failedCount: failedReasons.length,
    error: partialMessage,
  }
}
