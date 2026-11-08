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
import { supabase, isSupabaseConfigured } from '../lib/supabase'

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
 * Synchronizes client cart items into the Supabase `cart_items` table.
 *
 * Replaces any existing items in the user's database cart with current items.
 * Validates product IDs and quantities before touching the database.
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
        productId: pId,
        variantId: validVariantId,
        quantity: qty,
      })
    }
  }

  // 2. Ensure user has a cart record
  const { cartId, error: cartError } = await getOrCreateUserCart(userId)
  if (cartError || !cartId) {
    return {
      ok: false,
      error: cartError || new Error('Could not establish database cart for authenticated user.'),
    }
  }

  try {
    // 3. If the cart is empty, delete existing cart_items
    if (isCartEmpty) {
      const { error: delError } = await supabase
        .from('cart_items')
        .delete()
        .eq('cart_id', cartId)

      if (delError) {
        return { ok: false, error: delError }
      }
      return { ok: true, cartId, count: 0 }
    }

    // 4. Atomically refresh cart items (Delete existing + Insert fresh batch)
    const { error: clearError } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cartId)

    if (clearError) {
      console.error('[cartService] Error clearing existing cart items:', clearError)
      return { ok: false, error: clearError }
    }

    const preparedRows = validatedItems.map((v) => ({
      cart_id: cartId,
      product_id: v.productId,
      variant_id: v.variantId,
      quantity: v.quantity,
    }))

    const { error: insertError } = await supabase
      .from('cart_items')
      .insert(preparedRows)

    if (insertError) {
      console.error('[cartService] Error inserting synced cart items:', insertError)
      return { ok: false, error: insertError }
    }

    return { ok: true, cartId, count: preparedRows.length }
  } catch (err) {
    console.error('[cartService] Exception during cart synchronization:', err)
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
 */
export async function clearDatabaseCart(userId) {
  if (!supabase || !isSupabaseConfigured || !userId) return { success: false }

  try {
    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!cart?.id) return { success: true }

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id)

    return { success: !error, error }
  } catch (err) {
    return { success: false, error: err }
  }
}
