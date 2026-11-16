/**
 * cartService.js — Backend Database Cart Synchronization Service
 *
 * Implements strict, secure synchronization between client-side shopping cart
 * and Supabase PostgreSQL `carts` and `cart_items` tables.
 *
 * Enforces:
 * - Proper RLS ownership (auth.uid() = user_id)
 * - Validation of Product UUIDs and Variant UUIDs
 * - Elimination of client-side price tampering by relying on database relations
 * - Strict error propagation (stops order checkout if sync fails)
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

/**
 * UUID validator to ensure values match PostgreSQL UUID column syntax.
 */
export function isValidUUID(str) {
  return (
    typeof str === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim())
  )
}

/**
 * Pure validator for CartContext.addItem().
 * Ensures callers receive an explicit `{ ok, error }` contract when cart addition
 * cannot proceed (missing product, invalid qty, inactive/out-of-stock item, or non-UUID in Supabase mode).
 */
export function validateCartAddition(
  product,
  quantity = 1,
  { supabaseConfigured = isSupabaseConfigured } = {}
) {
  if (!product || typeof product !== 'object') {
    return { ok: false, error: 'Product information is missing.' }
  }

  const pId = product.productId || product.id
  if (!pId) {
    return { ok: false, error: 'Product identifier is missing.' }
  }

  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty < 1) {
    return { ok: false, error: 'Quantity must be at least 1.' }
  }

  if (product.is_active === false || product.inStock === false) {
    return { ok: false, error: `${product.name || 'This product'} is currently unavailable.` }
  }

  if (product.stock !== undefined && product.stock !== null && Number(product.stock) <= 0) {
    return { ok: false, error: `${product.name || 'This product'} is currently out of stock.` }
  }

  if (supabaseConfigured && !isValidUUID(String(pId))) {
    return {
      ok: false,
      error: `${product.name || 'This product'} cannot be added to your cart because it lacks a valid product ID.`,
    }
  }

  return { ok: true, error: null }
}

/**
 * Retrieves the customer's existing cart ID from the `carts` table,
 * or inserts a new cart row for the authenticated user.
 */
export async function getOrCreateUserCart(userId) {
  if (!supabase || !isSupabaseConfigured) {
    return { cartId: null, error: new Error('Supabase is not configured.') }
  }

  if (!userId || !isValidUUID(userId)) {
    return { cartId: null, error: new Error('Valid authenticated user ID is required.') }
  }

  try {
    // 1. Try to select existing cart
    const { data: existing, error: selectError } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (selectError) {
      console.error('[cartService] Error checking existing cart:', selectError)
      return { cartId: null, error: selectError }
    }

    if (existing && existing.id) {
      return { cartId: existing.id, error: null }
    }

    // 2. Insert new cart for user if none exists
    const { data: created, error: insertError } = await supabase
      .from('carts')
      .insert([{ user_id: userId }])
      .select('id')
      .single()

    if (insertError) {
      // Handle potential race condition where cart was created concurrently
      if (insertError.code === '23505') {
        const { data: retry } = await supabase
          .from('carts')
          .select('id')
          .eq('user_id', userId)
          .single()
        if (retry && retry.id) return { cartId: retry.id, error: null }
      }
      console.error('[cartService] Error creating user cart:', insertError)
      return { cartId: null, error: insertError }
    }

    return { cartId: created.id, error: null }
  } catch (err) {
    console.error('[cartService] Exception in getOrCreateUserCart:', err)
    return { cartId: null, error: err }
  }
}

/**
 * Intelligently merges a guest's local cart items with the authenticated
 * user's existing database cart items.
 *
 * Rules:
 * - Matches items by item key (product ID + variant ID).
 * - Combines quantities for duplicate items, respecting available stock limits.
 * - Preserves distinct variants of the same product.
 * - Retains items unique to either the guest cart or the database cart.
 * - Returns a new merged array without mutating inputs.
 */
export function mergeCarts(guestItems = [], dbItems = []) {
  if (!Array.isArray(guestItems) || guestItems.length === 0) {
    return Array.isArray(dbItems) ? [...dbItems] : []
  }
  if (!Array.isArray(dbItems) || dbItems.length === 0) {
    return [...guestItems]
  }

  const getItemKey = (item) => {
    if (!item) return ''
    if (item.cartItemId) return String(item.cartItemId)
    const pId = item.productId || item.id
    const vId = item.variant?.id || item.variant?.name || ''
    return vId ? `${pId}-${vId}` : String(pId)
  }

  // Start with a clone of database items as baseline
  const merged = [...dbItems]

  for (const guestItem of guestItems) {
    const key = getItemKey(guestItem)
    const existingIndex = merged.findIndex(i => getItemKey(i) === key)

    if (existingIndex > -1) {
      const existing = merged[existingIndex]
      const existingQty = Math.max(1, Number(existing.quantity) || 1)
      const guestQty = Math.max(1, Number(guestItem.quantity) || 1)
      const combinedQty = existingQty + guestQty

      // Check stock limits from either record
      const stockLimit = existing.stock !== undefined
        ? Number(existing.stock)
        : (guestItem.stock !== undefined ? Number(guestItem.stock) : Infinity)
      const clampedQty = stockLimit > 0 ? Math.min(combinedQty, stockLimit) : combinedQty

      merged[existingIndex] = {
        ...existing,
        ...guestItem,
        quantity: clampedQty,
      }
    } else {
      merged.push({ ...guestItem })
    }
  }

  return merged
}

/**
 * Synchronizes client cart items into the Supabase `cart_items` table.
 *
 * Exclusively invokes the atomic `sync_user_cart` PostgreSQL RPC (single ACID transaction).
 * If the RPC fails or is missing, returns an explicit failure without falling back
 * to unsafe, non-atomic multi-request operations.
 */
export async function syncCartToSupabase(cartItems, userId) {
  if (!supabase || !isSupabaseConfigured) {
    return { ok: false, error: new Error('Supabase is not configured.') }
  }

  if (!userId || !isValidUUID(userId)) {
    return { ok: false, error: new Error('Authentication required for database cart synchronization.') }
  }

  // 1. Fast pre-validation: validate all cart item product UUIDs upfront before network calls
  const isCartEmpty = !Array.isArray(cartItems) || cartItems.length === 0
  const validatedItems = []

  if (!isCartEmpty) {
    for (const item of cartItems) {
      const pId = item.productId || item.id
      if (!isValidUUID(pId)) {
        return {
          ok: false,
          error: new Error(
            `Cart item "${item.name || pId}" does not have a valid database UUID (${pId}). ` +
            'Cannot synchronize sample demo items into live Supabase tables.'
          ),
        }
      }

      const vId = item.variant?.id
      const validVariantId = vId && isValidUUID(vId) ? vId : null
      const qty = Math.max(1, Number(item.quantity) || 1)

      validatedItems.push({
        product_id: pId,
        variant_id: validVariantId,
        quantity: qty,
      })
    }
  }

  // 2. Execute atomic PostgreSQL RPC `sync_user_cart` (Single ACID transaction)
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('sync_user_cart', {
      p_items: validatedItems,
    })

    if (rpcError) {
      console.error('[cartService] sync_user_cart RPC failed:', rpcError)
      const isMissing = rpcError.code === 'PGRST202' || rpcError.code === '42883'
      const errMessage = isMissing
        ? 'Database cart synchronization function (sync_user_cart) is not available. Please ensure database migrations are applied.'
        : (rpcError.message || 'Database rejected cart synchronization.')
      return { ok: false, error: new Error(errMessage) }
    }

    if (!rpcResult || !rpcResult.success) {
      return {
        ok: false,
        error: new Error('Database cart synchronization did not confirm transaction commit.'),
      }
    }

    return { ok: true, cartId: rpcResult.cart_id, count: rpcResult.item_count }
  } catch (err) {
    console.error('[cartService] Exception during sync_user_cart RPC invocation:', err)
    return { ok: false, error: err }
  }
}

/**
 * Loads the authenticated user's cart from Supabase, retrieving authoritative
 * product prices, stock, and metadata from the database.
 */
export async function fetchDatabaseCart(userId) {
  if (!supabase || !isSupabaseConfigured || !userId || !isValidUUID(userId)) {
    return { data: null, error: null }
  }

  try {
    const { data: cart, error } = await supabase
      .from('carts')
      .select(`
        id,
        cart_items (
          id,
          product_id,
          variant_id,
          quantity,
          products (
            id,
            name,
            slug,
            price,
            original_price,
            discount_percent,
            badge,
            is_active,
            product_images ( image_url, is_primary ),
            inventory ( quantity )
          ),
          product_variants (
            id,
            name,
            option_values,
            price_delta
          )
        )
      `)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[cartService] Error fetching database cart:', error)
      return { data: null, error }
    }

    if (!cart || !Array.isArray(cart.cart_items)) {
      return { data: [], error: null }
    }

    // Normalize database rows into CartContext format
    const normalized = cart.cart_items
      .filter(ci => ci.products && ci.products.is_active !== false)
      .map(ci => {
        const prod = ci.products
        const variant = ci.product_variants || null
        const primaryImg = Array.isArray(prod.product_images)
          ? prod.product_images.find(img => img.is_primary)?.image_url || prod.product_images[0]?.image_url
          : null
        const stockQty = Array.isArray(prod.inventory) && prod.inventory[0]
          ? Number(prod.inventory[0].quantity)
          : 99

        const unitPrice = Number(prod.price) + (variant?.price_delta ? Number(variant.price_delta) : 0)
        const itemKey = variant ? `${prod.id}-${variant.id}` : prod.id

        return {
          id: prod.id,
          cartItemId: itemKey,
          name: prod.name,
          slug: prod.slug,
          price: unitPrice,
          originalPrice: prod.original_price ? Number(prod.original_price) : unitPrice,
          discount_percent: prod.discount_percent,
          image: primaryImg || 'https://placehold.co/100x100?text=Item',
          stock: stockQty,
          quantity: Number(ci.quantity) || 1,
          variant,
        }
      })

    return { data: normalized, error: null }
  } catch (err) {
    console.error('[cartService] Exception fetching database cart:', err)
    return { data: null, error: err }
  }
}

/**
 * Clears all items from the database cart.
 * Atomically invokes syncCartToSupabase with an empty items array,
 * leveraging the transactional sync_user_cart RPC.
 */
export async function clearDatabaseCart(userId) {
  if (!supabase || !isSupabaseConfigured || !userId) return { success: false }

  try {
    const res = await syncCartToSupabase([], userId)
    return { success: res.ok, error: res.error }
  } catch (err) {
    return { success: false, error: err }
  }
}
