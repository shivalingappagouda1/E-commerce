/**
 * orderService.js — Customer Orders & Address Management Service
 *
 * Implements strict, secure database integration for customer addresses,
 * cart synchronization, and transactional order placement.
 *
 * Enforces:
 * - Direct Supabase integration when configured (no silent localStorage fallbacks)
 * - Address ownership verification before order placement
 * - Seamless integration with cartService and PostgreSQL `place_order` RPC
 * - Explicit error returns for UI feedback
 * - Clear isolation of unconfigured demo mode
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { syncCartToSupabase, isValidUUID } from './cartService'

const ORDERS_STORAGE_KEY = 'shopkart_customer_orders'
const ADDRESSES_STORAGE_KEY = 'shopkart_customer_addresses'

/* ── Local Demo Fallback Helpers (Active ONLY when !isSupabaseConfigured) ── */
export function getLocalOrders() {
  try {
    const data = localStorage.getItem(ORDERS_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveLocalOrder(order) {
  try {
    const orders = getLocalOrders()
    const updated = [order, ...orders]
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('Error saving local demo order:', err)
  }
}

export function getLocalAddresses() {
  try {
    const data = localStorage.getItem(ADDRESSES_STORAGE_KEY)
    return data ? JSON.parse(data) : [
      {
        id: 'addr-default-1',
        full_name: 'Rahul Sharma',
        phone: '+91 98765 43210',
        line1: 'Flat 402, Green Valley Apartments',
        line2: '100 Feet Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        country: 'India',
        is_default: true,
      }
    ]
  } catch {
    return []
  }
}

function saveLocalAddress(addr) {
  try {
    const addresses = getLocalAddresses()
    const updated = [addr, ...addresses]
    localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(updated))
    return addr
  } catch (err) {
    console.error('Error saving local demo address:', err)
    return addr
  }
}

/* ============================================================
   1. ADDRESSES MANAGEMENT
   ============================================================ */

/**
 * Fetches addresses for the current user.
 * In Supabase mode, strictly queries the `addresses` table for auth.uid().
 */
export async function fetchAddresses() {
  if (isSupabaseConfigured && supabase) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: [], error: { message: 'Authentication required to view addresses.' } }
    }

    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    return { data: data || [], error }
  }

  // Local Demo Mode
  return { data: getLocalAddresses(), error: null }
}

/**
 * Creates a new shipping address.
 * In Supabase mode, assigns user_id = auth.uid().
 */
export async function createAddress(addressData) {
  if (isSupabaseConfigured && supabase) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: { message: 'Authentication required to save delivery address.' } }
    }

    const payload = {
      user_id: user.id,
      full_name: addressData.full_name?.trim(),
      phone: addressData.phone?.trim(),
      line1: addressData.line1?.trim(),
      line2: addressData.line2?.trim() || null,
      city: addressData.city?.trim(),
      state: addressData.state?.trim(),
      pincode: addressData.pincode?.trim(),
      country: addressData.country || 'India',
      is_default: Boolean(addressData.is_default),
    }

    // If marked as default, unset existing default addresses for this user
    if (payload.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', user.id)
    }

    const { data, error } = await supabase
      .from('addresses')
      .insert([payload])
      .select()
      .single()

    return { data, error }
  }

  // Local Demo Mode
  const newAddr = {
    id: `addr-${Date.now()}`,
    ...addressData,
    is_default: addressData.is_default || false,
  }
  saveLocalAddress(newAddr)
  return { data: newAddr, error: null }
}

/**
 * Updates an existing address.
 * In Supabase mode, enforces user_id = auth.uid().
 */
export async function updateAddress(id, addressData) {
  if (isSupabaseConfigured && supabase) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: { message: 'Authentication required.' } }
    }

    if (addressData.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', user.id)
    }

    const { data, error } = await supabase
      .from('addresses')
      .update(addressData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    return { data, error }
  }

  // Local Demo Mode
  const addresses = getLocalAddresses()
  const updated = addresses.map(a => a.id === id ? { ...a, ...addressData } : a)
  localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(updated))
  const updatedItem = updated.find(a => a.id === id)
  return { data: updatedItem, error: null }
}

/**
 * Deletes an address.
 */
export async function deleteAddress(id) {
  if (isSupabaseConfigured && supabase) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: { message: 'Authentication required.' } }
    }

    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    return { success: !error, error }
  }

  // Local Demo Mode
  const addresses = getLocalAddresses()
  const filtered = addresses.filter(a => a.id !== id)
  localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(filtered))
  return { success: true, error: null }
}

/**
 * Sets an address as the user's default address.
 */
export async function setDefaultAddress(id) {
  if (isSupabaseConfigured && supabase) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: { message: 'Authentication required.' } }
    }

    // 1. Unset existing defaults
    await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', user.id)

    // 2. Set chosen address to default
    const { error } = await supabase
      .from('addresses')
      .update({ is_default: true })
      .eq('id', id)
      .eq('user_id', user.id)

    return { success: !error, error }
  }

  // Local Demo Mode
  const addresses = getLocalAddresses()
  const updated = addresses.map(a => ({
    ...a,
    is_default: a.id === id,
  }))
  localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(updated))
  return { data: updated, success: true, error: null }
}

/* ============================================================
   2. CUSTOMER PROFILE
   ============================================================ */

/**
 * Updates customer profile data.
 * RLS ensures customers can only update their own row (id = auth.uid()).
 * The database trigger `guard_role_escalation` strictly forbids changing `role`.
 */
export async function updateCustomerProfile({ full_name, phone, avatar_url }) {
  if (isSupabaseConfigured && supabase) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: { message: 'Authentication required to update profile.' } }
    }

    const updates = {}
    if (full_name !== undefined) updates.full_name = full_name?.trim()
    if (phone !== undefined) updates.phone = phone?.trim()
    if (avatar_url !== undefined) updates.avatar_url = avatar_url

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    return { data, error }
  }

  // Local Demo Mode
  try {
    const demoUser = JSON.parse(localStorage.getItem('shopkart_demo_user') || '{}')
    const updated = { ...demoUser, full_name, phone, avatar_url }
    localStorage.setItem('shopkart_demo_user', JSON.stringify(updated))
    return { data: updated, error: null }
  } catch {
    return { data: { full_name, phone, avatar_url }, error: null }
  }
}

/* ============================================================
   3. SECURE ORDER PLACEMENT & SYNCHRONIZATION
   ============================================================ */

/**
 * Places an order adhering to production security rules:
 *
 * In Supabase Mode:
 * 1. Validates authenticated user.
 * 2. Validates address ownership.
 * 3. Synchronizes client cart into Supabase database tables (`carts` & `cart_items`).
 * 4. Calls PostgreSQL `place_order` RPC which:
 *    - Validates product active status and stock
 *    - Re-calculates authoritative prices from database
 *    - Decreases inventory transactionally
 *    - Clears database cart on commit
 * 5. Returns real generated order ID.
 * 6. NEVER falls back silently to localStorage when in Supabase mode.
 *
 * In Local Demo Mode:
 * Creates sample local order for demonstration purposes.
 */
export async function placeOrder({
  addressId,
  notes = '',
  cartItems = [],
  totalAmount = 0,
  address = null,
  subtotal = null,
  discountAmount = 0,
  shippingAmount = 0,
}) {
  // ── Supabase Production Flow ──
  if (isSupabaseConfigured && supabase) {
    // 1. Verify User Authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return {
        data: null,
        error: { message: 'Authentication required. Please sign in to place your order.' },
      }
    }

    // 2. Validate Selected Delivery Address Ownership
    if (!addressId || !isValidUUID(addressId)) {
      return {
        data: null,
        error: { message: 'Invalid delivery address selected. Please choose a valid address.' },
      }
    }

    const { data: validAddr, error: addrError } = await supabase
      .from('addresses')
      .select('id')
      .eq('id', addressId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (addrError || !validAddr) {
      return {
        data: null,
        error: { message: 'Delivery address validation failed. Selected address is not registered to your account.' },
      }
    }

    // 3. Synchronize Cart to Supabase Database Tables (carts & cart_items)
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return {
        data: null,
        error: { message: 'Your shopping cart is empty.' },
      }
    }

    const syncResult = await syncCartToSupabase(cartItems, user.id)
    if (!syncResult.ok) {
      console.error('[placeOrder] Cart synchronization failed:', syncResult.error)
      return {
        data: null,
        error: {
          message: syncResult.error?.message || 'Failed to synchronize shopping cart with database. Order cancelled.',
        },
      }
    }

    // 4. Invoke PostgreSQL `place_order` RPC
    const { data: orderId, error: rpcError } = await supabase.rpc('place_order', {
      p_address_id: addressId,
      p_notes: notes ? String(notes).trim() : null,
    })

    if (rpcError || !orderId) {
      console.error('[placeOrder] place_order RPC failed:', rpcError)
      return {
        data: null,
        error: {
          message: rpcError?.message || 'Database rejected order placement. Please check item stock and try again.',
        },
      }
    }

    // Success — return genuine database order ID
    return { data: { id: orderId }, error: null }
  }

  // ── Local Demo Fallback Mode (Strictly for offline/demo when Supabase is not configured) ──
  const defaultAddr = getLocalAddresses()[0]
  const finalAddr = address || defaultAddr
  const mockOrderId = `ORD-${Date.now().toString().slice(-6)}`
  const calculatedSubtotal = subtotal !== null ? subtotal : totalAmount

  const mockOrder = {
    id: mockOrderId,
    created_at: new Date().toISOString(),
    status: 'processing',
    subtotal: calculatedSubtotal,
    discount_amount: discountAmount,
    shipping_amount: shippingAmount,
    total_amount: totalAmount,
    notes,
    address: finalAddr,
    customer_name: finalAddr?.full_name || 'Demo Customer',
    customer_phone: finalAddr?.phone || '+91 98765 43210',
    customer_email: 'demo.customer@shopkart.in',
    is_demo: true,
    address_summary: finalAddr
      ? `${finalAddr.line1 || ''}${finalAddr.line2 ? ', ' + finalAddr.line2 : ''}, ${finalAddr.city || ''}, ${finalAddr.state || ''} - ${finalAddr.pincode || ''}`
      : 'Bengaluru, Karnataka - 560038',
    items: cartItems.map(item => ({
      id: `item-${Date.now()}-${item.id}`,
      product_id: item.id,
      product_name: item.name,
      image: item.image,
      unit_price: item.price,
      quantity: item.quantity,
      total_price: item.price * item.quantity,
    })),
  }

  saveLocalOrder(mockOrder)
  return { data: { id: mockOrderId, order: mockOrder, is_demo: true }, error: null }
}

/* ============================================================
   4. ORDER HISTORY & RETRIEVAL
   ============================================================ */

/**
 * Retrieves orders for the authenticated customer.
 */
export async function fetchCustomerOrders() {
  if (isSupabaseConfigured && supabase) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: [], error: { message: 'Authentication required.' } }
    }

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, status, subtotal, discount_amount, shipping_amount, total_amount, created_at, notes,
        addresses ( full_name, phone, line1, line2, city, state, pincode ),
        order_items ( id, product_id, product_name, unit_price, quantity, total_price )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    return { data: data || [], error }
  }

  // Local Demo Mode
  return { data: getLocalOrders(), error: null }
}

/**
 * Retrieves a single order by ID.
 * In Supabase mode, RLS guarantees customers can only view their own order.
 */
export async function fetchOrderById(orderId) {
  if (isSupabaseConfigured && supabase && isValidUUID(orderId)) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, status, subtotal, discount_amount, shipping_amount, total_amount, created_at, notes,
        addresses ( full_name, phone, line1, line2, city, state, pincode ),
        order_items ( id, product_id, product_name, unit_price, quantity, total_price )
      `)
      .eq('id', orderId)
      .single()

    return { data, error }
  }

  // Local Demo Mode
  const local = getLocalOrders().find(o => o.id === orderId)
  return { data: local || null, error: null }
}
