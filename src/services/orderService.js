import { supabase } from '../lib/supabase'

const ORDERS_STORAGE_KEY = 'shopkart_customer_orders'
const ADDRESSES_STORAGE_KEY = 'shopkart_customer_addresses'

function getLocalOrders() {
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
    console.error('Error saving local order:', err)
  }
}

function getLocalAddresses() {
  try {
    const data = localStorage.getItem(ADDRESSES_STORAGE_KEY)
    return data ? JSON.parse(data) : [
      {
        id: 'addr-default-1',
        full_name: 'Rahul Sharma',
        phone: '9876543210',
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
    console.error('Error saving local address:', err)
    return addr
  }
}

/* ============================================================
   ADDRESSES
   ============================================================ */
export async function fetchAddresses() {
  if (!supabase) {
    return { data: getLocalAddresses(), error: null }
  }

  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error || !data || data.length === 0) {
    return { data: getLocalAddresses(), error: null }
  }

  return { data, error }
}

export async function createAddress(addressData) {
  if (!supabase) {
    const newAddr = {
      id: `addr-${Date.now()}`,
      ...addressData,
      is_default: addressData.is_default || false,
    }
    saveLocalAddress(newAddr)
    return { data: newAddr, error: null }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: { message: 'Must be signed in to save addresses' } }
  }

  const { data, error } = await supabase
    .from('addresses')
    .insert([{ ...addressData, user_id: user.id }])
    .select()
    .single()

  return { data, error }
}

/* ============================================================
   ORDERS & CHECKOUT
   ============================================================ */
export async function placeOrder({ addressId, notes = '', cartItems = [], totalAmount = 0, address = null }) {
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      try {
        const { data: orderId, error } = await supabase.rpc('place_order', {
          p_address_id: addressId,
          p_notes: notes,
        })

        if (!error && orderId) {
          return { data: { id: orderId }, error: null }
        }
      } catch (err) {
        console.warn('[place_order RPC] Fallback to client order creation:', err)
      }
    }
  }

  // Fallback / Sample Mode simulation
  const mockOrderId = `ORD-${Date.now().toString().slice(-6)}`
  const mockOrder = {
    id: mockOrderId,
    created_at: new Date().toISOString(),
    status: 'processing',
    subtotal: totalAmount,
    discount_amount: 0,
    shipping_amount: 0,
    total_amount: totalAmount,
    notes,
    address: address || getLocalAddresses()[0],
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
  return { data: { id: mockOrderId, order: mockOrder }, error: null }
}

export async function fetchCustomerOrders() {
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, subtotal, discount_amount, shipping_amount, total_amount, created_at, notes,
          addresses ( full_name, phone, line1, line2, city, state, pincode ),
          order_items ( id, product_id, product_name, unit_price, quantity, total_price )
        `)
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        return { data, error: null }
      }
    }
  }

  return { data: getLocalOrders(), error: null }
}

export async function fetchOrderById(orderId) {
  if (supabase) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, status, subtotal, discount_amount, shipping_amount, total_amount, created_at, notes,
        addresses ( full_name, phone, line1, line2, city, state, pincode ),
        order_items ( id, product_id, product_name, unit_price, quantity, total_price )
      `)
      .eq('id', orderId)
      .single()

    if (!error && data) {
      return { data, error: null }
    }
  }

  const local = getLocalOrders().find(o => o.id === orderId)
  return { data: local || null, error: null }
}
