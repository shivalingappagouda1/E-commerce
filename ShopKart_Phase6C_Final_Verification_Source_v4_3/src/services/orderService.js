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
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { syncCartToSupabase, isValidUUID } from './cartService.js'

const ORDERS_STORAGE_KEY = 'shopkart_customer_orders'
const ADDRESSES_STORAGE_KEY = 'shopkart_customer_addresses'
export const PAYMENT_SUBMISSIONS_STORAGE_KEY = 'shopkart_payment_submissions'

export function shouldUseSupabase(client = supabase, configured = isSupabaseConfigured) {
  if (client && client !== supabase) return true
  return Boolean(configured && client)
}

/* ── Local Demo Fallback Helpers (Active ONLY when !isSupabaseConfigured) ── */
export function getLocalPaymentSubmissions() {
  try {
    const data = localStorage.getItem(PAYMENT_SUBMISSIONS_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveLocalPaymentSubmission(submission) {
  try {
    const list = getLocalPaymentSubmissions()
    localStorage.setItem(PAYMENT_SUBMISSIONS_STORAGE_KEY, JSON.stringify([submission, ...list]))
    return submission
  } catch (err) {
    console.error('Error saving local demo payment submission:', err)
    return submission
  }
}

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
export async function updateCustomerProfile({
  full_name,
  phone,
  avatar_url,
  expectedUserId = null,
}, client = supabase) {
  if ((isSupabaseConfigured || client !== supabase) && client) {
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) {
      return { data: null, error: { message: 'Authentication required to update profile.' } }
    }

    if (expectedUserId && user.id !== expectedUserId) {
      return {
        data: null,
        error: { message: 'Account session changed during update. Aborted to protect your account.' },
      }
    }

    const updates = {}
    if (full_name !== undefined) updates.full_name = full_name?.trim()
    if (phone !== undefined) updates.phone = phone?.trim()
    if (avatar_url !== undefined) updates.avatar_url = avatar_url

    const { data, error } = await client
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    return { data, error }
  }

  if (isSupabaseConfigured && !client) {
    return { data: null, error: { message: 'Supabase client unavailable.' } }
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
 * Places an order adhering to production Phase 6C/6D security rules:
 *
 * In Supabase Mode:
 * 1. Validates authenticated user.
 * 2. Validates address ownership.
 * 3. Synchronizes client cart into Supabase database tables (`carts` & `cart_items`).
 * 4. Calls PostgreSQL `place_order` RPC which:
 *    - Validates product active status and stock
 *    - Re-calculates authoritative prices, gross subtotal, free shipping threshold (₹999),
 *      and coupon discount from the database
 *    - Evaluates idempotency key to prevent duplicate checkouts safely
 *    - Creates corresponding payment record ('cod' or 'phonepe')
 *    - Decreases inventory transactionally
 *    - Clears database cart on commit
 * 5. Returns genuine generated order ID.
 * 6. NEVER passes client-calculated totals or submission timestamps to database RPC.
 *
 * In Local Demo Mode:
 * Creates sample local order for demonstration purposes.
 */
export async function placeOrder({
  addressId,
  notes = '',
  couponCode = null,
  cartItems = [],
  paymentProvider = 'cod',
  idempotencyKey = null,
  // Note: Client-side values used only in offline demo fallback
  totalAmount = 0,
  address = null,
  subtotal = null,
  discountAmount = 0,
  shippingAmount = 0,
}, client = supabase, configured = isSupabaseConfigured) {
  // Validate payment provider early
  const cleanProvider = (paymentProvider || 'cod').toString().trim().toLowerCase()
  if (!['cod', 'phonepe'].includes(cleanProvider)) {
    return {
      data: null,
      error: { message: 'Invalid payment provider. Allowed values are "cod" or "phonepe".' },
    }
  }

  // ── Supabase Production Flow ──
  if (shouldUseSupabase(client, configured)) {
    // 1. Verify User Authentication
    const { data: { user } = {}, error: userError } = await client.auth.getUser()
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

    const { data: validAddr, error: addrError } = await client
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

    let syncResult
    if (client !== supabase && typeof client.rpc === 'function') {
      try {
        const validatedItems = cartItems.map(item => ({
          product_id: item.productId || item.id,
          variant_id: item.variantId || null,
          quantity: Math.max(1, Number(item.quantity) || 1),
        }))
        const { data: rpcResult, error: rpcError } = await client.rpc('sync_user_cart', {
          p_items: validatedItems,
        })
        if (rpcError) {
          syncResult = { ok: false, error: rpcError }
        } else if (!rpcResult || !rpcResult.success) {
          syncResult = {
            ok: false,
            error: new Error('Database cart synchronization did not confirm transaction commit.'),
          }
        } else {
          syncResult = { ok: true, cartId: rpcResult.cart_id, count: rpcResult.item_count }
        }
      } catch (err) {
        syncResult = { ok: false, error: err }
      }
    } else {
      syncResult = await syncCartToSupabase(cartItems, user.id)
    }

    if (!syncResult.ok) {
      console.error('[placeOrder] Cart synchronization failed:', syncResult.error)
      return {
        data: null,
        error: {
          message: syncResult.error?.message || 'Failed to synchronize shopping cart with database. Order cancelled.',
        },
      }
    }

    // 4. Invoke PostgreSQL `place_order` RPC with authoritative 5-argument signature:
    // (p_address_id, p_notes, p_coupon_code, p_payment_provider, p_idempotency_key)
    // CRITICAL: The frontend NEVER supplies authoritative totals, discounts, shipping,
    // or payment status to the database RPC!
    const cleanCoupon = couponCode ? String(couponCode).trim().toUpperCase() : null
    const cleanIdempotency = idempotencyKey ? String(idempotencyKey).trim() : null

    // Invokes Supabase RPC: supabase.rpc('place_order', {
    const { data: orderId, error: rpcError } = await client.rpc('place_order', {
      p_address_id: addressId,
      p_notes: notes ? String(notes).trim() : null,
      p_coupon_code: cleanCoupon,
      p_payment_provider: cleanProvider,
      p_idempotency_key: cleanIdempotency || null,
    })

    if (rpcError || !orderId) {
      console.error('[placeOrder] place_order RPC failed:', rpcError)
      const isMissing = rpcError && (rpcError.code === 'PGRST202' || rpcError.code === '42883')
      const errorMessage = isMissing
        ? 'Database order placement function (place_order with payment and idempotency support) is not available. Please ensure database migrations are applied.'
        : (rpcError?.message || 'Database rejected order placement. Please check item stock and try again.')

      return {
        data: null,
        error: {
          code: rpcError?.code,
          message: errorMessage,
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
  const calculatedSubtotal = subtotal !== null ? Number(subtotal) : Number(totalAmount || 0)
  // Free shipping threshold: gross subtotal >= 999 qualifies for free shipping (0), otherwise 99
  const demoShipping = shippingAmount > 0 ? Number(shippingAmount) : (calculatedSubtotal >= 999 ? 0 : 99)
  const demoDiscount = Number(discountAmount || 0)
  const calculatedTotal = Math.max(0, calculatedSubtotal - demoDiscount + demoShipping)

  // Both PhonePe and COD orders start in pending status in the demo lifecycle
  const initialStatus = 'pending'
  const mockPaymentId = `pay-${Date.now()}`

  const mockOrder = {
    id: mockOrderId,
    created_at: new Date().toISOString(),
    status: initialStatus,
    subtotal: calculatedSubtotal,
    discount_amount: demoDiscount,
    shipping_amount: demoShipping,
    total_amount: calculatedTotal,
    coupon_code: couponCode,
    notes,
    idempotency_key: idempotencyKey || null,
    address: finalAddr,
    customer_name: finalAddr?.full_name || 'Demo Customer',
    customer_phone: finalAddr?.phone || '+91 98765 43210',
    customer_email: 'demo.customer@shopkart.in',
    is_demo: true,
    payment_provider: cleanProvider,
    payment: {
      id: mockPaymentId,
      order_id: mockOrderId,
      provider: cleanProvider,
      status: 'pending',
      amount: calculatedTotal,
      paid_at: null,
      created_at: new Date().toISOString(),
    },
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
   4. PHONEPE UTR SUBMISSION & PAYMENT LIFECYCLE
   ============================================================ */

/**
 * Submits a 12-digit PhonePe UTR transaction number for an order.
 * In Supabase Mode:
 * - Validates order ID is a valid UUID.
 * - Validates UTR is exactly 12 numeric digits.
 * - Invokes production two-argument `submit_phonepe_utr(UUID, TEXT)` RPC.
 * - CRITICAL: The frontend NEVER supplies a timestamp. The database evaluates strictly with NOW().
 */
export async function submitPhonepeUtr({
  orderId,
  utrNumber,
}, client = supabase, configured = isSupabaseConfigured) {
  if (!orderId) {
    return { data: null, error: { message: 'A valid order ID is required.' } }
  }

  const cleanUtr = typeof utrNumber === 'string' ? utrNumber.trim() : String(utrNumber || '').trim()
  if (!/^[0-9]{12}$/.test(cleanUtr)) {
    return {
      data: null,
      error: { message: 'Invalid UTR format. UTR must be exactly 12 numeric digits.' },
    }
  }

  if (shouldUseSupabase(client, configured)) {
    if (!isValidUUID(orderId)) {
      return { data: null, error: { message: 'A valid order ID is required.' } }
    }

    const { data: { user } = {}, error: userError } = await client.auth.getUser()
    if (userError || !user) {
      return { data: null, error: { message: 'Authentication required to submit payment UTR.' } }
    }

    // Call production 2-argument submit_phonepe_utr(UUID, TEXT)
    // CRITICAL: NEVER pass a timestamp argument! The database function evaluates strictly using NOW().
    const { data, error } = await client.rpc('submit_phonepe_utr', {
      p_order_id: orderId,
      p_utr_number: cleanUtr,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code,
          message: error.message || 'Failed to submit PhonePe UTR.',
        },
      }
    }

    return { data, error: null }
  }

  // Local Demo Fallback Mode
  const orders = getLocalOrders()
  const orderIndex = orders.findIndex(o => o.id === orderId)
  if (orderIndex === -1) {
    return { data: null, error: { message: 'Order not found.' } }
  }

  const order = orders[orderIndex]
  const orderCreatedAt = new Date(order.created_at).getTime()
  const now = Date.now()
  const fortyEightHoursMs = 48 * 60 * 60 * 1000

  const submissions = getLocalPaymentSubmissions().filter(s => s.order_id === orderId)
  const activeSub = submissions.find(s => s.status === 'submitted')
  if (now - orderCreatedAt >= fortyEightHoursMs && !activeSub) {
    return {
      data: null,
      error: { message: 'PhonePe payment window has expired (48 hours). Please place a new order.' },
    }
  }

  const newSubmission = {
    id: `sub-${Date.now()}`,
    order_id: orderId,
    payment_id: order.payment?.id || `pay-${orderId}`,
    user_id: 'demo-user',
    utr_number: cleanUtr,
    status: 'submitted',
    admin_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
  }
  saveLocalPaymentSubmission(newSubmission)

  return {
    data: {
      success: true,
      submission_id: newSubmission.id,
      order_id: orderId,
      utr_number: cleanUtr,
      status: 'submitted',
      message: 'UTR submitted successfully. Pending administrator verification.',
    },
    error: null,
  }
}

/* ============================================================
   5. ORDER & PAYMENT STATUS RETRIEVAL
   ============================================================ */

/**
 * Retrieves orders for the authenticated customer including payment details.
 */
export async function fetchCustomerOrders(client = supabase, configured = isSupabaseConfigured) {
  if (shouldUseSupabase(client, configured)) {
    const { data: { user } = {}, error: userError } = await client.auth.getUser()
    if (userError || !user) {
      return { data: [], error: { message: 'Authentication required.' } }
    }

    const { data, error } = await client
      .from('orders')
      .select(`
        id, status, subtotal, discount_amount, shipping_amount, total_amount, created_at, notes, idempotency_key,
        addresses ( full_name, phone, line1, line2, city, state, pincode ),
        order_items ( id, product_id, product_name, unit_price, quantity, total_price ),
        payments ( id, provider, status, amount, provider_payment_id, refund_reference, paid_at, updated_at ),
        payment_submissions ( id, utr_number, status, admin_notes, reviewed_at, created_at )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return { data: [], error }
    }

    const normalized = (data || []).map(order => {
      const submissions = (order.payment_submissions || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      const activeSubmission = submissions.find(s => s.status === 'submitted') || null
      const latestSubmission = submissions[0] || null
      return {
        ...order,
        payment: Array.isArray(order.payments) ? order.payments[0] || null : (order.payments || null),
        payment_submissions: submissions,
        activeSubmission,
        latestSubmission,
      }
    })

    return { data: normalized, error: null }
  }

  // Local Demo Mode
  const orders = getLocalOrders()
  const allSubs = getLocalPaymentSubmissions()
  const normalized = orders.map(order => {
    const subs = allSubs
      .filter(s => s.order_id === order.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const activeSub = subs.find(s => s.status === 'submitted') || null
    const latestSub = subs[0] || null
    const provider = order.payment?.provider || order.payment_provider || 'cod'
    return {
      ...order,
      payment: order.payment || {
        id: `pay-${order.id}`,
        provider,
        status: order.status === 'delivered' && provider === 'cod' ? 'pending' : (order.status === 'cancelled' ? 'failed' : 'pending'),
        amount: order.total_amount || 0,
      },
      payment_submissions: subs,
      activeSubmission: activeSub,
      latestSubmission: latestSub,
    }
  })
  return { data: normalized, error: null }
}

/**
 * Retrieves a single order by ID including payment details.
 * In Supabase mode, RLS guarantees customers can only view their own order.
 */
export async function fetchOrderById(orderId, client = supabase, configured = isSupabaseConfigured) {
  if (!orderId) {
    return { data: null, error: { message: 'Order ID is required.' } }
  }

  if (shouldUseSupabase(client, configured) && isValidUUID(orderId)) {
    const { data, error } = await client
      .from('orders')
      .select(`
        id, status, subtotal, discount_amount, shipping_amount, total_amount, created_at, notes, idempotency_key,
        addresses ( full_name, phone, line1, line2, city, state, pincode ),
        order_items ( id, product_id, product_name, unit_price, quantity, total_price ),
        payments ( id, provider, status, amount, provider_payment_id, refund_reference, paid_at, updated_at ),
        payment_submissions ( id, utr_number, status, admin_notes, reviewed_at, created_at )
      `)
      .eq('id', orderId)
      .single()

    if (error) {
      return { data: null, error }
    }

    const submissions = (data?.payment_submissions || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const activeSubmission = submissions.find(s => s.status === 'submitted') || null
    const latestSubmission = submissions[0] || null

    const normalized = data ? {
      ...data,
      payment: Array.isArray(data.payments) ? data.payments[0] || null : (data.payments || null),
      payment_submissions: submissions,
      activeSubmission,
      latestSubmission,
    } : null

    return { data: normalized, error: null }
  }

  // Local Demo Mode
  const local = getLocalOrders().find(o => o.id === orderId)
  if (!local) return { data: null, error: null }
  const allSubs = getLocalPaymentSubmissions()
  const subs = allSubs
    .filter(s => s.order_id === orderId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const activeSub = subs.find(s => s.status === 'submitted') || null
  const latestSub = subs[0] || null
  const provider = local.payment?.provider || local.payment_provider || 'cod'

  return {
    data: {
      ...local,
      payment: local.payment || {
        id: `pay-${local.id}`,
        provider,
        status: local.status === 'delivered' && provider === 'cod' ? 'pending' : (local.status === 'cancelled' ? 'failed' : 'pending'),
        amount: local.total_amount || 0,
      },
      payment_submissions: subs,
      activeSubmission: activeSub,
      latestSubmission: latestSub,
    },
    error: null,
  }
}

/**
 * Retrieves payment status and active UTR submission for an order.
 */
export async function fetchOrderPayment(orderId, client = supabase, configured = isSupabaseConfigured) {
  if (!orderId) {
    return { data: null, error: { message: 'A valid order ID is required.' } }
  }

  if (shouldUseSupabase(client, configured)) {
    if (!isValidUUID(orderId)) {
      return { data: null, error: { message: 'A valid order ID is required.' } }
    }

    const { data: payment, error: payError } = await client
      .from('payments')
      .select('id, order_id, provider, status, amount, provider_payment_id, refund_reference, paid_at, created_at, updated_at')
      .eq('order_id', orderId)
      .maybeSingle()

    if (payError) {
      return { data: null, error: payError }
    }

    const { data: submissions, error: subError } = await client
      .from('payment_submissions')
      .select('id, utr_number, status, admin_notes, reviewed_at, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (subError) {
      return { data: { payment, submissions: [], activeSubmission: null, latestSubmission: null }, error: subError }
    }

    const activeSubmission = (submissions || []).find(s => s.status === 'submitted') || null
    const latestSubmission = (submissions || [])[0] || null

    return {
      data: {
        payment,
        submissions: submissions || [],
        activeSubmission,
        latestSubmission,
      },
      error: null,
    }
  }

  // Local Demo Fallback Mode
  const order = getLocalOrders().find(o => o.id === orderId)
  const subs = getLocalPaymentSubmissions().filter(s => s.order_id === orderId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const active = subs.find(s => s.status === 'submitted') || null
  const latest = subs[0] || null

  return {
    data: {
      payment: order?.payment || null,
      submissions: subs,
      activeSubmission: active,
      latestSubmission: latest,
    },
    error: null,
  }
}

/**
 * Retrieves the UTR submission history for an order.
 */
export async function fetchOrderUtrHistory(orderId, client = supabase, configured = isSupabaseConfigured) {
  if (!orderId) {
    return { data: [], error: { message: 'A valid order ID is required.' } }
  }

  if (shouldUseSupabase(client, configured)) {
    if (!isValidUUID(orderId)) {
      return { data: [], error: { message: 'A valid order ID is required.' } }
    }

    const { data, error } = await client
      .from('payment_submissions')
      .select('id, utr_number, status, admin_notes, reviewed_at, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    return { data: data || [], error }
  }

  // Local Demo Fallback Mode
  const subs = getLocalPaymentSubmissions().filter(s => s.order_id === orderId)
  return { data: subs, error: null }
}

/* ============================================================
   6. ORDER CANCELLATION
   ============================================================ */

/**
 * Cancels an order for the authenticated customer.
 * In Supabase mode, invokes the secure `cancel_order` RPC:
 * - Verifies user ownership and cancellable state (pending or processing)
 * - Safely marks payment failed if pending
 * - Keeps payment completed if paid (for manual admin refund)
 * - Restores inventory and releases coupon atomically via trigger for unpaid orders
 * In Local Demo Mode, updates localStorage.
 */
export async function cancelCustomerOrder(orderId) {
  const client = arguments[1] || supabase
  const configured = arguments[2] !== undefined ? arguments[2] : isSupabaseConfigured
  if (!orderId) {
    return { success: false, data: null, error: { message: 'Order ID is required.' } }
  }

  if (shouldUseSupabase(client, configured)) {
    if (!isValidUUID(orderId)) {
      return { success: false, data: null, error: { message: 'Invalid order ID format.' } }
    }

    if (client && client !== supabase) {
      try {
        const { data: { user } = {}, error: userError } = await client.auth.getUser()
        if (userError || !user) {
          return { success: false, data: null, error: { message: 'Authentication required to cancel order.' } }
        }

        const { data, error } = await client.rpc('cancel_order', {
          p_order_id: orderId,
        })

        if (error) {
          const isMissing = error.code === 'PGRST202' || error.code === '42883'
          const errorMessage = isMissing
            ? 'Database cancellation function (cancel_order) is not available. Please ensure database migrations are applied.'
            : (error.message || 'Failed to cancel order.')
          return { success: false, data: null, error: { code: error.code, message: errorMessage } }
        }

        return { success: true, data: data || null, error: null }
      } catch (err) {
        return {
          success: false,
          data: null,
          error: { message: err?.message || 'A network error occurred while attempting to cancel the order.' },
        }
      }
    }

    try {
      const { data: { user } = {}, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return { success: false, data: null, error: { message: 'Authentication required to cancel order.' } }
      }

      const { data, error } = await supabase.rpc('cancel_order', {
        p_order_id: orderId,
      })

      if (error) {
        console.error('[cancelCustomerOrder] cancel_order RPC failed:', error)
        const isMissing = error.code === 'PGRST202' || error.code === '42883'
        const errorMessage = isMissing
          ? 'Database cancellation function (cancel_order) is not available. Please ensure database migrations are applied.'
          : (error.message || 'Failed to cancel order.')
        return { success: false, data: null, error: { code: error.code, message: errorMessage } }
      }

      return { success: true, data: data || null, error: null }
    } catch (err) {
      console.error('[cancelCustomerOrder] Unexpected exception during cancellation:', err)
      return {
        success: false,
        data: null,
        error: { message: err?.message || 'A network error occurred while attempting to cancel the order.' },
      }
    }
  }

  // Local Demo Mode
  try {
    const orders = getLocalOrders()
    const orderIndex = orders.findIndex(o => o.id === orderId)
    if (orderIndex === -1) {
      return { success: false, data: null, error: { message: 'Order not found.' } }
    }

    const currentOrder = orders[orderIndex]
    const status = (currentOrder.status || '').toLowerCase()
    if (status === 'cancelled') {
      return { success: false, data: null, error: { message: 'Order is already cancelled.' } }
    }
    if (['shipped', 'delivered'].includes(status)) {
      return { success: false, data: null, error: { message: `Cannot cancel an order that is already ${status}.` } }
    }
    if (!['pending', 'processing'].includes(status)) {
      return { success: false, data: null, error: { message: `Order cannot be cancelled in status: ${status}.` } }
    }

    // Update demo order payment & submissions if pending
    const payment = currentOrder.payment ? { ...currentOrder.payment } : null
    if (payment && payment.status === 'pending') {
      payment.status = 'failed'
    }

    // Reject any pending submissions
    const allSubs = getLocalPaymentSubmissions()
    const updatedSubs = allSubs.map(s => {
      if (s.order_id === orderId && s.status === 'submitted') {
        return { ...s, status: 'rejected', admin_notes: 'Order cancelled by customer', reviewed_at: new Date().toISOString() }
      }
      return s
    })
    try {
      localStorage.setItem(PAYMENT_SUBMISSIONS_STORAGE_KEY, JSON.stringify(updatedSubs))
    } catch {
      // ignore
    }

    const updatedOrder = {
      ...currentOrder,
      status: 'cancelled',
      payment,
      updated_at: new Date().toISOString(),
    }
    orders[orderIndex] = updatedOrder
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders))

    return {
      success: true,
      data: {
        success: true,
        order_id: orderId,
        status: 'cancelled',
        message: 'Order cancelled successfully',
      },
      error: null,
    }
  } catch (err) {
    return { success: false, data: null, error: { message: err.message || 'Error cancelling local demo order.' } }
  }
}
