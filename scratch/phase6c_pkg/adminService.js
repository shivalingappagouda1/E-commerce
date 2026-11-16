import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import {
  SAMPLE_BANNERS,
  SAMPLE_PRODUCTS,
  SAMPLE_CATEGORIES,
} from '../utils/sampleData.js'

export const ADMIN_PRODUCTS_STORAGE = 'shopkart_admin_products'
export const ADMIN_CATEGORIES_STORAGE = 'shopkart_admin_categories'
export const ADMIN_BANNERS_STORAGE = 'shopkart_admin_banners'
export const ADMIN_COUPONS_STORAGE = 'shopkart_admin_coupons'
export const ORDERS_STORAGE_KEY = 'shopkart_customer_orders'
export const PAYMENT_SUBMISSIONS_STORAGE_KEY = 'shopkart_payment_submissions'
export const ADMIN_CUSTOMERS_STORAGE = 'shopkart_admin_customers'
export const ADMIN_SETTINGS_STORAGE = 'shopkart_store_settings'

const GENERIC_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isValidUUID(value) {
  return typeof value === 'string' && GENERIC_UUID_REGEX.test(value.trim())
}

export const DEFAULT_STORE_SETTINGS = {
  storeName: 'ShopKart',
  tagline: "India's Premier Lifestyle & Electronics Destination",
  description: 'Shop premium electronics, fashion, lifestyle, and home products with fast nationwide delivery.',
  supportEmail: 'support@shopkart.in',
  supportPhone: '+91 80 4567 8900',
  address: 'ShopKart Retail Pvt Ltd, 4th Floor, Tech Hub Tower, Outer Ring Road, Bengaluru, Karnataka - 560103',
  currency: 'INR',
  currencySymbol: '₹',
  timezone: 'Asia/Kolkata (IST)',
  taxRatePercent: 18,
  freeShippingThreshold: 999,
  defaultShippingFee: 99,
  maintenanceMode: false,
  allowGuestCheckout: true,
  autoApproveReviews: false,
  orderPrefix: 'ORD-',
  inventoryAlertThreshold: 5,
}

export const SAMPLE_ADMIN_ORDERS = [
  {
    id: 'ORD-10045',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: 'delivered',
    total_amount: 29990,
    customer_id: 'cust-101',
    customer_name: 'Rahul Sharma',
    customer_email: 'rahul.sharma@example.com',
    customer_phone: '+91 98765 43210',
    address_summary: 'Flat 402, Indiranagar, Bengaluru, Karnataka - 560038',
    category: 'Audio',
    items: [{ product_id: 'prod-4', product_name: 'Sony WH-1000XM5 Wireless Headphones', category: 'Audio', quantity: 1, unit_price: 29990, total_price: 29990 }],
  },
  {
    id: 'ORD-10044',
    created_at: new Date(Date.now() - 3600000 * 7).toISOString(),
    status: 'processing',
    total_amount: 134900,
    customer_id: 'cust-102',
    customer_name: 'Priya Mehta',
    customer_email: 'priya.mehta@example.com',
    customer_phone: '+91 98220 11223',
    address_summary: 'B-12, Green Park, New Delhi - 110016',
    category: 'Mobiles',
    items: [{ product_id: 'prod-1', product_name: 'Apple iPhone 15 Pro — 256 GB', category: 'Mobiles', quantity: 1, unit_price: 134900, total_price: 134900 }],
  },
  {
    id: 'ORD-10043',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    status: 'shipped',
    total_amount: 54999,
    customer_id: 'cust-103',
    customer_name: 'Amit Verma',
    customer_email: 'amit.verma@example.com',
    customer_phone: '+91 97112 23344',
    address_summary: 'Row House 4, Koregaon Park, Pune - 411001',
    category: 'Electronics',
    items: [{ product_id: 'prod-2', product_name: 'Samsung 55" 4K QLED Smart TV', category: 'Electronics', quantity: 1, unit_price: 54999, total_price: 54999 }],
  },
  {
    id: 'ORD-10042',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    status: 'delivered',
    total_amount: 4999,
    customer_id: 'cust-104',
    customer_name: 'Sneha Patel',
    customer_email: 'sneha.patel@example.com',
    customer_phone: '+91 99887 76655',
    address_summary: 'Flat 301, Satellite, Ahmedabad, Gujarat - 380015',
    category: 'Fashion',
    items: [{ product_id: 'prod-5', product_name: 'Nike Air Zoom Pegasus 40 Running Shoes', category: 'Fashion', quantity: 1, unit_price: 4999, total_price: 4999 }],
  },
  {
    id: 'ORD-10041',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    status: 'delivered',
    total_amount: 2999,
    customer_id: 'cust-101',
    customer_name: 'Rahul Sharma',
    customer_email: 'rahul.sharma@example.com',
    customer_phone: '+91 98765 43210',
    address_summary: 'Flat 402, Indiranagar, Bengaluru, Karnataka - 560038',
    category: 'Home & Kitchen',
    items: [{ product_id: 'prod-7', product_name: 'Philips Digital Air Fryer HD9252', category: 'Home & Kitchen', quantity: 1, unit_price: 2999, total_price: 2999 }],
  },
  {
    id: 'ORD-10040',
    created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    status: 'delivered',
    total_amount: 24999,
    customer_id: 'cust-105',
    customer_name: 'Vikram Seth',
    customer_email: 'vikram.seth@example.com',
    customer_phone: '+91 94455 66778',
    address_summary: '15 Anna Nagar 2nd Avenue, Chennai, Tamil Nadu - 600040',
    category: 'Audio',
    items: [{ product_id: 'prod-4', product_name: 'Sony WH-1000XM5 Wireless Headphones', category: 'Audio', quantity: 1, unit_price: 24999, total_price: 24999 }],
  },
  {
    id: 'ORD-10039',
    created_at: new Date(Date.now() - 86400000 * 18).toISOString(),
    status: 'delivered',
    total_amount: 7999,
    customer_id: 'cust-106',
    customer_name: 'Anjali Sharma',
    customer_email: 'anjali.s@example.com',
    customer_phone: '+91 93322 11009',
    address_summary: 'Plot 77, Malviya Nagar, Jaipur, Rajasthan - 302017',
    category: 'Fashion',
    items: [{ product_id: 'prod-6', product_name: "Levi's Men Slim Fit Denim Jacket", category: 'Fashion', quantity: 2, unit_price: 3999.5, total_price: 7999 }],
  },
  {
    id: 'ORD-10038',
    created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
    status: 'cancelled',
    total_amount: 14999,
    customer_id: 'cust-107',
    customer_name: 'Rohan Gupta',
    customer_email: 'rohan.gupta@example.com',
    customer_phone: '+91 91234 56780',
    address_summary: '404 Sea View Apt, Bandra West, Mumbai - 400050',
    category: 'Electronics',
    items: [{ product_id: 'prod-3', product_name: 'Noise ColorFit Ultra 3 Smartwatch', category: 'Electronics', quantity: 3, unit_price: 4999.66, total_price: 14999 }],
  },
]

export const INITIAL_DEMO_CUSTOMERS = [
  {
    id: 'cust-101',
    full_name: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    phone: '+91 98765 43210',
    avatar_url: null,
    role: 'customer',
    created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    city: 'Bengaluru',
    state: 'Karnataka',
  },
  {
    id: 'cust-102',
    full_name: 'Priya Mehta',
    email: 'priya.mehta@example.com',
    phone: '+91 98220 11223',
    avatar_url: null,
    role: 'customer',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    city: 'New Delhi',
    state: 'Delhi',
  },
  {
    id: 'cust-103',
    full_name: 'Amit Verma',
    email: 'amit.verma@example.com',
    phone: '+91 97112 23344',
    avatar_url: null,
    role: 'customer',
    created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    id: 'cust-104',
    full_name: 'Sneha Patel',
    email: 'sneha.patel@example.com',
    phone: '+91 99887 76655',
    avatar_url: null,
    role: 'customer',
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    city: 'Ahmedabad',
    state: 'Gujarat',
  },
  {
    id: 'cust-105',
    full_name: 'Vikram Seth',
    email: 'vikram.seth@example.com',
    phone: '+91 94455 66778',
    avatar_url: null,
    role: 'customer',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    city: 'Chennai',
    state: 'Tamil Nadu',
  },
  {
    id: 'cust-106',
    full_name: 'Anjali Sharma',
    email: 'anjali.s@example.com',
    phone: '+91 93322 11009',
    avatar_url: null,
    role: 'customer',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    city: 'Jaipur',
    state: 'Rajasthan',
  },
  {
    id: 'cust-107',
    full_name: 'Rohan Gupta',
    email: 'rohan.gupta@example.com',
    phone: '+91 91234 56780',
    avatar_url: null,
    role: 'customer',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    city: 'Mumbai',
    state: 'Maharashtra',
  },
]


// ── Local Fallback Helpers ─────────────────────────────────────
function getLocal(key, fallback) {
  try {
    const data = localStorage.getItem(key)
    return data !== null ? JSON.parse(data) : fallback
  } catch {
    return fallback
  }
}

function setLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    console.error(`Error saving ${key}:`, err)
    return false
  }
}

/* ============================================================
   1. PRODUCTS MANAGEMENT
   ============================================================ */
export async function adminFetchProducts() {
  if (supabase) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories ( id, name, slug ),
        product_images ( id, image_url, is_primary ),
        inventory ( id, quantity, low_stock_at )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[adminService] Error fetching products from Supabase:', error)
      return { data: [], error }
    }
    return { data: data || [], error: null }
  }

  // Fallback to local admin products or sample data
  try {
    const raw = localStorage.getItem(ADMIN_PRODUCTS_STORAGE)
    if (raw === null) {
      setLocal(ADMIN_PRODUCTS_STORAGE, SAMPLE_PRODUCTS)
      return { data: [...SAMPLE_PRODUCTS], error: null }
    }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return { data: parsed, error: null }
    }
    return { data: [], error: null }
  } catch (err) {
    console.error(`[adminService] Error reading ${ADMIN_PRODUCTS_STORAGE}:`, err)
    return { data: [], error: null }
  }
}

export async function adminSaveProduct(product) {
  const isNew = !product.id || typeof product.id === 'number' && product.id < 1000

  if (supabase) {
    const rawCatId = product.category_id
    const sanitizedCatId = rawCatId !== null && rawCatId !== undefined && rawCatId !== '' && !isNaN(Number(rawCatId))
      ? Number(rawCatId)
      : null

    const payload = {
      name: product.name,
      slug: product.slug,
      category_id: sanitizedCatId,
      description: product.description || '',
      price: Number(product.price),
      original_price: product.original_price ? Number(product.original_price) : null,
      discount_percent: product.discount_percent ? Number(product.discount_percent) : 0,
      badge: product.badge || null,
      is_featured: Boolean(product.is_featured || product.featured),
      is_active: product.is_active !== undefined ? Boolean(product.is_active) : true,
    }

    if (isNew) {
      const { data: newProd, error } = await supabase
        .from('products')
        .insert([payload])
        .select()
        .single()

      if (!error && newProd) {
        // Insert default image if provided
        if (product.image) {
          await supabase.from('product_images').insert([{
            product_id: newProd.id,
            image_url: product.image,
            is_primary: true,
          }])
        }
        // Insert inventory
        await supabase.from('inventory').insert([{
          product_id: newProd.id,
          quantity: Number(product.stock || 20),
          low_stock_at: 5,
        }])
        return { data: newProd, error: null }
      }
      return { data: null, error }
    } else {
      const { data: updated, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', product.id)
        .select()
        .single()

      if (!error && updated) {
        if (product.stock !== undefined) {
          await supabase
            .from('inventory')
            .update({ quantity: Number(product.stock) })
            .eq('product_id', product.id)
        }
        return { data: updated, error: null }
      }
      return { data: null, error }
    }
  }

  // Fallback local mode (synchronized with customer storefront)
  const products = getLocal(ADMIN_PRODUCTS_STORAGE, [...SAMPLE_PRODUCTS])
  let saved
  const discountVal = Number(product.discount_percent || product.discount || 0)
  const priceVal = Number(product.price)
  const origPriceVal = product.original_price ? Number(product.original_price) : (product.originalPrice ? Number(product.originalPrice) : null)
  const stockVal = Number(product.stock !== undefined ? product.stock : 20)
  const isFeatured = Boolean(product.is_featured !== undefined ? product.is_featured : product.featured)
  const isActive = product.is_active !== undefined ? Boolean(product.is_active) : (product.inStock !== false)
  const inStockVal = isActive && stockVal > 0

  if (isNew) {
    saved = {
      ...product,
      id: Date.now(),
      name: product.name,
      slug: product.slug,
      category_id: product.category_id || null,
      category: product.category || '',
      price: priceVal,
      original_price: origPriceVal,
      originalPrice: origPriceVal,
      discount_percent: discountVal,
      discount: discountVal,
      stock: stockVal,
      badge: product.badge || null,
      image: product.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80',
      rating: 4.5,
      reviewCount: 0,
      review_count: 0,
      inStock: inStockVal,
      is_featured: isFeatured,
      featured: isFeatured,
      is_active: isActive,
    }
    products.unshift(saved)
  } else {
    const existing = products.find(p => p.id === product.id) || {}
    saved = {
      ...existing,
      ...product,
      category_id: product.category_id !== undefined ? (product.category_id || null) : (existing.category_id || null),
      category: product.category || existing.category || '',
      price: priceVal,
      original_price: origPriceVal,
      originalPrice: origPriceVal,
      discount_percent: discountVal,
      discount: discountVal,
      stock: stockVal,
      inStock: inStockVal,
      is_featured: isFeatured,
      featured: isFeatured,
      is_active: isActive,
    }
    const idx = products.findIndex(p => p.id === product.id)
    if (idx !== -1) products[idx] = saved
    else products.unshift(saved)
  }

  setLocal(ADMIN_PRODUCTS_STORAGE, products)
  return { data: saved, error: null }
}

export async function adminDeleteProduct(id) {
  if (supabase) {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
    if (!error) return { success: true }
  }

  const products = getLocal(ADMIN_PRODUCTS_STORAGE, [...SAMPLE_PRODUCTS])
  const filtered = products.filter(p => p.id !== id)
  setLocal(ADMIN_PRODUCTS_STORAGE, filtered)
  return { success: true }
}

export async function adminToggleProductActive(id, currentStatus) {
  const newStatus = !currentStatus
  if (supabase) {
    const { error } = await supabase
      .from('products')
      .update({ is_active: newStatus })
      .eq('id', id)
    if (!error) return { success: true, newStatus }
  }

  const products = getLocal(ADMIN_PRODUCTS_STORAGE, [...SAMPLE_PRODUCTS])
  const updated = products.map(p => {
    if (p.id === id) {
      const stock = Number(p.stock !== undefined ? p.stock : 20)
      return {
        ...p,
        is_active: newStatus,
        inStock: newStatus && stock > 0,
      }
    }
    return p
  })
  setLocal(ADMIN_PRODUCTS_STORAGE, updated)
  return { success: true, newStatus }
}

/* ============================================================
   2. CATEGORIES MANAGEMENT
   ============================================================ */
export async function adminFetchCategories() {
  if (supabase) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[adminService] Error fetching categories from Supabase:', error)
      return { data: [], error }
    }
    return { data: data || [], error: null }
  }

  const local = getLocal(ADMIN_CATEGORIES_STORAGE, SAMPLE_CATEGORIES)
  return { data: local, error: null }
}

export async function adminSaveCategory(category) {
  const isNew = !category.id || typeof category.id === 'number' && category.id < 100

  if (supabase) {
    const payload = {
      name: category.name,
      slug: category.slug,
      image_url: category.image_url || null,
      sort_order: Number(category.sort_order || 0),
      is_active: category.is_active !== undefined ? Boolean(category.is_active) : true,
    }

    if (isNew) {
      const { data, error } = await supabase
        .from('categories')
        .insert([payload])
        .select()
        .single()
      return { data, error }
    } else {
      const { data, error } = await supabase
        .from('categories')
        .update(payload)
        .eq('id', category.id)
        .select()
        .single()
      return { data, error }
    }
  }

  const categories = getLocal(ADMIN_CATEGORIES_STORAGE, [...SAMPLE_CATEGORIES])
  let saved
  if (isNew) {
    saved = { ...category, id: Date.now() }
    categories.push(saved)
  } else {
    saved = category
    const idx = categories.findIndex(c => c.id === category.id)
    if (idx !== -1) categories[idx] = saved
    else categories.push(saved)
  }

  setLocal(ADMIN_CATEGORIES_STORAGE, categories)
  return { data: saved, error: null }
}

export async function adminDeleteCategory(id) {
  if (supabase) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
    if (!error) return { success: true }
  }

  const categories = getLocal(ADMIN_CATEGORIES_STORAGE, [...SAMPLE_CATEGORIES])
  const filtered = categories.filter(c => c.id !== id)
  setLocal(ADMIN_CATEGORIES_STORAGE, filtered)
  return { success: true }
}

/* ============================================================
   3. ORDERS & PAYMENT MANAGEMENT (PHASE 6D)
   ============================================================ */

/**
 * Fetches all orders with related customer profile, shipping address,
 * line items, payment status, and UTR submissions.
 * In Supabase Mode: queries genuine tables without falling back to demo data.
 * In Local Demo Mode: merges local customer orders and demo sample orders.
 */
export async function adminFetchOrders() {
  const client = arguments[0] || supabase
  const configured = arguments[1] !== undefined ? arguments[1] : isSupabaseConfigured
  if (shouldUseSupabaseClient(client, configured)) {
    const { data, error } = await client
      .from('orders')
      .select(`
        *,
        profiles ( full_name, phone ),
        addresses ( full_name, phone, line1, line2, city, state, pincode ),
        order_items ( id, product_id, product_name, unit_price, quantity, total_price ),
        payments ( id, provider, status, amount, provider_payment_id, refund_reference, paid_at, updated_at ),
        payment_submissions ( id, utr_number, status, admin_notes, reviewed_at, created_at )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[adminService] Error fetching orders from Supabase:', error)
      return { data: [], error }
    }

    const normalized = (data || []).map(order => ({
      ...order,
      payment: Array.isArray(order.payments) ? order.payments[0] || null : (order.payments || null),
      activeSubmission: (order.payment_submissions || []).find(s => s.status === 'submitted') || null,
    }))

    return { data: normalized, error: null }
  }

  // Fallback to customer orders or initial sample orders
  const customerOrders = getLocal(ORDERS_STORAGE_KEY, [])
  const localSubs = getLocal(PAYMENT_SUBMISSIONS_STORAGE_KEY, [])
  const merged = [...customerOrders, ...SAMPLE_ADMIN_ORDERS].map(order => {
    const orderSubs = localSubs.filter(s => s.order_id === order.id)
    const activeSub = orderSubs.find(s => s.status === 'submitted') || null
    return {
      ...order,
      payment: order.payment ? {
        ...order.payment,
        provider: order.payment.provider || order.payment_provider || 'cod',
      } : {
        id: `pay-${order.id}`,
        provider: order.payment_provider || 'cod',
        status: order.status === 'delivered' ? 'completed' : (order.status === 'cancelled' ? 'failed' : 'pending'),
        amount: order.total_amount,
      },
      payment_submissions: order.payment_submissions || orderSubs,
      activeSubmission: order.activeSubmission || activeSub,
    }
  })
  return { data: merged, error: null }
}

export const VALID_ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']

export const VALID_TRANSITIONS = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['refunded'],
  cancelled: ['refunded'],
  refunded: [],
}

/**
 * Updates order status adhering to state machine constraints.
 */
export async function adminUpdateOrderStatus(orderId, newStatus) {
  const client = arguments[2] || supabase
  const configured = arguments[3] !== undefined ? arguments[3] : isSupabaseConfigured
  if (!VALID_ORDER_STATUSES.includes(newStatus)) {
    return { success: false, error: `Invalid order status: ${newStatus}` }
  }

  if (shouldUseSupabaseClient(client, configured)) {
    const { error } = await client
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
    if (!error) return { success: true }
    return { success: false, error: error.message }
  }

  const orders = getLocal(ORDERS_STORAGE_KEY, [])
  const updated = orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
  setLocal(ORDERS_STORAGE_KEY, updated)
  return { success: true }
}

/**
 * Verifies or rejects a customer PhonePe UTR submission.
 * In Supabase Mode: calls `admin_verify_utr(UUID, BOOLEAN, TEXT)` RPC:
 * - If approved: marks submission approved, payment completed, order processing.
 * - If rejected: marks submission rejected, payment pending, customer may resubmit before 48h deadline.
 */
export async function adminVerifyUtr({
  submissionId,
  approved,
  adminNotes = null,
}, client = supabase, configured = isSupabaseConfigured) {
  if (!submissionId) {
    return { success: false, data: null, error: { message: 'A valid submission ID is required.' } }
  }

  if (typeof approved !== 'boolean') {
    return {
      success: false,
      data: null,
      error: { message: 'Approval decision must be a boolean (true to approve, false to reject).' },
    }
  }

  const cleanNotes = adminNotes ? String(adminNotes).trim() : null

  if (shouldUseSupabaseClient(client, configured)) {
    if (!isValidUUID(String(submissionId).trim())) {
      return { success: false, data: null, error: { message: 'A valid submission ID is required.' } }
    }

    try {
      const { data, error } = await client.rpc('admin_verify_utr', {
        p_submission_id: String(submissionId).trim(),
        p_approved: Boolean(approved),
        p_admin_notes: cleanNotes,
      })

      if (error) {
        console.error('[adminService] admin_verify_utr RPC failed:', error)
        return {
          success: false,
          data: null,
          error: {
            code: error.code,
            message: error.message || 'Failed to verify UTR submission.',
          },
        }
      }

      return { success: true, data, error: null }
    } catch (err) {
      console.error('[adminService] Exception in admin_verify_utr:', err)
      return {
        success: false,
        data: null,
        error: { message: err?.message || 'Error executing admin_verify_utr.' },
      }
    }
  }

  // Local Demo Fallback Mode
  const submissions = getLocal(PAYMENT_SUBMISSIONS_STORAGE_KEY, [])
  const subIndex = submissions.findIndex(s => s.id === submissionId)
  if (subIndex === -1) {
    return { success: false, data: null, error: { message: 'Submission not found.' } }
  }

  const sub = submissions[subIndex]
  const decision = approved ? 'approved' : 'rejected'
  const updatedSub = {
    ...sub,
    status: decision,
    admin_notes: cleanNotes,
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'demo-admin',
  }
  submissions[subIndex] = updatedSub
  setLocal(PAYMENT_SUBMISSIONS_STORAGE_KEY, submissions)

  // Update order in local store
  const orders = getLocal(ORDERS_STORAGE_KEY, [])
  const orderIndex = orders.findIndex(o => o.id === sub.order_id)
  let orderStatus = 'pending'
  let paymentStatus = 'pending'

  if (orderIndex !== -1) {
    const o = orders[orderIndex]
    if (approved) {
      orderStatus = 'processing'
      paymentStatus = 'completed'
      orders[orderIndex] = {
        ...o,
        status: orderStatus,
        payment: {
          ...(o.payment || {}),
          status: paymentStatus,
          paid_at: new Date().toISOString(),
        },
      }
    } else {
      orderStatus = 'pending'
      paymentStatus = 'pending'
      orders[orderIndex] = {
        ...o,
        status: orderStatus,
        payment: {
          ...(o.payment || {}),
          status: paymentStatus,
        },
      }
    }
    setLocal(ORDERS_STORAGE_KEY, orders)
  }

  return {
    success: true,
    data: {
      success: true,
      submission_id: submissionId,
      decision,
      order_id: sub.order_id,
      order_status: orderStatus,
      payment_status: paymentStatus,
      message: approved
        ? 'UTR verified successfully. Order moved to processing.'
        : 'UTR submission rejected. Customer may resubmit before expiration.',
    },
    error: null,
  }
}

/**
 * Confirms COD cash collection upon physical delivery of the package.
 * In Supabase Mode: calls `admin_confirm_cod_payment(UUID, TEXT)` RPC:
 * - Order MUST be in 'delivered' status.
 * - Transitions payment status to 'completed'.
 */
export async function adminConfirmCodPayment({
  orderId,
  adminNotes = null,
}, client = supabase, configured = isSupabaseConfigured) {
  if (!orderId) {
    return { success: false, data: null, error: { message: 'A valid order ID is required.' } }
  }

  const cleanNotes = adminNotes ? String(adminNotes).trim() : null

  if (shouldUseSupabaseClient(client, configured)) {
    if (!isValidUUID(String(orderId).trim())) {
      return { success: false, data: null, error: { message: 'A valid order ID is required.' } }
    }

    try {
      const { data, error } = await client.rpc('admin_confirm_cod_payment', {
        p_order_id: String(orderId).trim(),
        p_admin_notes: cleanNotes,
      })

      if (error) {
        console.error('[adminService] admin_confirm_cod_payment RPC failed:', error)
        return {
          success: false,
          data: null,
          error: {
            code: error.code,
            message: error.message || 'Failed to confirm COD payment.',
          },
        }
      }

      return { success: true, data, error: null }
    } catch (err) {
      console.error('[adminService] Exception in admin_confirm_cod_payment:', err)
      return {
        success: false,
        data: null,
        error: { message: err?.message || 'Error executing admin_confirm_cod_payment.' },
      }
    }
  }

  // Local Demo Fallback Mode
  const orders = getLocal(ORDERS_STORAGE_KEY, [])
  const orderIndex = orders.findIndex(o => o.id === orderId)
  if (orderIndex === -1) {
    return { success: false, data: null, error: { message: 'Order not found.' } }
  }

  const order = orders[orderIndex]
  if (order.status !== 'delivered') {
    return {
      success: false,
      data: null,
      error: { message: `COD payment can only be confirmed upon delivery (current order status: ${order.status})` },
    }
  }

  orders[orderIndex] = {
    ...order,
    payment: {
      ...(order.payment || {}),
      status: 'completed',
      paid_at: new Date().toISOString(),
    },
  }
  setLocal(ORDERS_STORAGE_KEY, orders)

  return {
    success: true,
    data: {
      success: true,
      order_id: orderId,
      payment_status: 'completed',
      message: 'COD payment confirmed successfully upon delivery',
    },
    error: null,
  }
}

/**
 * Records manual customer refund after monetary transfer is confirmed.
 * In Supabase Mode: calls `admin_record_refund(UUID, TEXT, TEXT, BOOLEAN)` RPC:
 * - Payment must be completed.
 * - Transitions payment and order to 'refunded'.
 * - Optionally restocks inventory if `restockInventory = true`.
 */
export async function adminRecordRefund({
  orderId,
  refundReference,
  adminNotes = null,
  restockInventory = false,
}, client = supabase, configured = isSupabaseConfigured) {
  if (!orderId) {
    return { success: false, data: null, error: { message: 'A valid order ID is required.' } }
  }

  const cleanRef = typeof refundReference === 'string' ? refundReference.trim() : String(refundReference || '').trim()
  if (!cleanRef) {
    return { success: false, data: null, error: { message: 'Refund reference or transaction ID is required.' } }
  }

  const cleanNotes = adminNotes ? String(adminNotes).trim() : null

  if (shouldUseSupabaseClient(client, configured)) {
    if (!isValidUUID(String(orderId).trim())) {
      return { success: false, data: null, error: { message: 'A valid order ID is required.' } }
    }

    try {
      const { data, error } = await client.rpc('admin_record_refund', {
        p_order_id: String(orderId).trim(),
        p_refund_reference: cleanRef,
        p_admin_notes: cleanNotes,
        p_restock_inventory: Boolean(restockInventory),
      })

      if (error) {
        console.error('[adminService] admin_record_refund RPC failed:', error)
        return {
          success: false,
          data: null,
          error: {
            code: error.code,
            message: error.message || 'Failed to record refund.',
          },
        }
      }

      return { success: true, data, error: null }
    } catch (err) {
      console.error('[adminService] Exception in admin_record_refund:', err)
      return {
        success: false,
        data: null,
        error: { message: err?.message || 'Error executing admin_record_refund.' },
      }
    }
  }

  // Local Demo Fallback Mode
  const orders = getLocal(ORDERS_STORAGE_KEY, [])
  const orderIndex = orders.findIndex(o => o.id === orderId)
  if (orderIndex === -1) {
    return { success: false, data: null, error: { message: 'Order not found.' } }
  }

  const order = orders[orderIndex]
  if (!['cancelled', 'delivered', 'processing', 'shipped'].includes(order.status)) {
    return {
      success: false,
      data: null,
      error: { message: `Cannot record refund for order in status: ${order.status}` },
    }
  }

  if (order.payment?.status !== 'completed') {
    return {
      success: false,
      data: null,
      error: { message: `Cannot refund payment in status: ${order.payment?.status || 'pending'} (must be completed)` },
    }
  }

  // 1. Prepare updated orders snapshot in memory
  const updatedOrders = orders.map((o, idx) => {
    if (idx === orderIndex) {
      return {
        ...o,
        status: 'refunded',
        payment: {
          ...(o.payment || {}),
          status: 'refunded',
          refund_reference: cleanRef,
        },
      }
    }
    return o
  })

  // 2. Evaluate inventory restoration if requested
  const shouldRestock = Boolean(restockInventory) && Array.isArray(order.items) && order.items.length > 0
  let originalProducts = null
  let updatedProducts = null
  let allProductsFound = false

  if (shouldRestock) {
    try {
      // 2a. Aggregate quantities by product ID across line items
      const qtyByProduct = new Map()
      let validItems = true
      for (const it of order.items) {
        const pId = it.product_id || it.id
        // Validate quantity strictly: must not be null/undefined/boolean/empty and must be a positive integer.
        // Never default or convert a zero quantity into 1 via (it.quantity || 1).
        const rawQty = it.quantity !== undefined ? it.quantity : it.qty
        if (!pId || rawQty === null || rawQty === undefined || typeof rawQty === 'boolean' || rawQty === '') {
          validItems = false
          break
        }
        const qty = Number(rawQty)
        if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
          validItems = false
          break
        }
        qtyByProduct.set(pId, (qtyByProduct.get(pId) || 0) + qty)
      }

      if (validItems && qtyByProduct.size > 0) {
        originalProducts = getLocal(ADMIN_PRODUCTS_STORAGE, [...SAMPLE_PRODUCTS])

        // 2b. Strict atomicity check: Verify EVERY line item maps to an existing product
        allProductsFound = true
        for (const pId of qtyByProduct.keys()) {
          const found = originalProducts.some(p => p.id === pId)
          if (!found) {
            allProductsFound = false
            break
          }
        }

        // 2c. Only prepare updated products if every line item product is accounted for
        if (allProductsFound) {
          updatedProducts = originalProducts.map(p => {
            if (qtyByProduct.has(p.id)) {
              const addQty = qtyByProduct.get(p.id)
              const currentQty = Number(p.stock !== undefined ? p.stock : (p.quantity || 0))
              const newQty = currentQty + addQty
              return {
                ...p,
                stock: newQty,
                quantity: newQty,
                inStock: (p.is_active !== false) && newQty > 0,
              }
            }
            return p
          })
        }
      }
    } catch (err) {
      console.error('[adminService] Error evaluating demo inventory restoration on refund:', err)
      allProductsFound = false
      updatedProducts = null
    }
  }

  // 3. Safe persistence with ordering and rollback
  // Case A: Full restock is applicable and all products are verified
  if (shouldRestock && allProductsFound && updatedProducts) {
    // 3a. Persist restored inventory first
    const inventorySaved = setLocal(ADMIN_PRODUCTS_STORAGE, updatedProducts)
    if (!inventorySaved) {
      return {
        success: false,
        data: null,
        error: { message: 'Failed to persist restored product inventory to storage. Refund aborted.' },
      }
    }

    // 3b. Persist updated order list
    const orderSaved = setLocal(ORDERS_STORAGE_KEY, updatedOrders)
    if (!orderSaved) {
      // Order persistence failed: Roll back inventory to original snapshot so stock is not
      // left restored while the order remains eligible for another refund attempt.
      const rollbackSaved = setLocal(ADMIN_PRODUCTS_STORAGE, originalProducts)
      if (rollbackSaved) {
        return {
          success: false,
          data: null,
          error: {
            message: 'Failed to persist refunded order status to storage. Restored inventory was rolled back.',
          },
        }
      }

      // Rollback also failed: Explicitly report that inventory/order storage is inconsistent
      // and requires manual reconciliation. Do NOT claim inventory was rolled back.
      return {
        success: false,
        data: null,
        error: {
          message: 'Failed to persist refunded order status, and inventory rollback also failed. Storage is in an inconsistent state and requires manual reconciliation.',
        },
      }
    }

    // Both successfully persisted
    return {
      success: true,
      data: {
        success: true,
        order_id: orderId,
        order_status: 'refunded',
        payment_status: 'refunded',
        restocked: true,
        message: 'Refund recorded successfully',
      },
      error: null,
    }
  }

  // Case B: Restocking not requested, or line items could not be mapped (e.g. missing product).
  // Only order status needs to be persisted; inventory is untouched.
  const orderSaved = setLocal(ORDERS_STORAGE_KEY, updatedOrders)
  if (!orderSaved) {
    return {
      success: false,
      data: null,
      error: { message: 'Failed to persist refunded order status to storage. Refund aborted.' },
    }
  }

  return {
    success: true,
    data: {
      success: true,
      order_id: orderId,
      order_status: 'refunded',
      payment_status: 'refunded',
      restocked: false,
      message: 'Refund recorded successfully',
    },
    error: null,
  }
}

/**
 * Creates a physical return inspection record when customer returns an item (Option B).
 * In Supabase Mode: calls `admin_create_return_inspection(UUID, UUID, INT, TEXT)` RPC.
 */
export async function adminCreateReturnInspection({
  orderId,
  orderItemId,
  returnedQuantity,
  receiptNotes = null,
}, client = supabase, configured = isSupabaseConfigured) {
  if (!orderId || !orderItemId) {
    return { success: false, data: null, error: { message: 'Order ID and Order Item ID are required.' } }
  }

  const qty = Number(returnedQuantity)
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    return { success: false, data: null, error: { message: 'Returned quantity must be a positive integer.' } }
  }

  if (shouldUseSupabaseClient(client, configured)) {
    try {
      const { data, error } = await client.rpc('admin_create_return_inspection', {
        p_order_id: String(orderId).trim(),
        p_order_item_id: String(orderItemId).trim(),
        p_returned_quantity: qty,
        p_receipt_notes: receiptNotes ? String(receiptNotes).trim() : null,
      })

      if (error) {
        console.error('[adminService] admin_create_return_inspection RPC failed:', error)
        return {
          success: false,
          data: null,
          error: { code: error.code, message: error.message || 'Failed to create return inspection.' },
        }
      }

      return { success: true, data, error: null }
    } catch (err) {
      console.error('[adminService] Exception in admin_create_return_inspection:', err)
      return {
        success: false,
        data: null,
        error: { message: err?.message || 'Error executing admin_create_return_inspection.' },
      }
    }
  }

  return { success: true, data: { id: `local_insp_${Date.now()}` }, error: null }
}

/**
 * Completes physical QC inspection for returned goods (Option B).
 * In Supabase Mode: calls `admin_complete_return_inspection(UUID, TEXT, INT, TEXT, TEXT, BOOLEAN)` RPC.
 */
export async function adminCompleteReturnInspection({
  inspectionId,
  outcome,
  approvedQuantity = 0,
  condition = 'good',
  notes,
  restockNow = false,
}, client = supabase, configured = isSupabaseConfigured) {
  if (!inspectionId) {
    return { success: false, data: null, error: { message: 'Inspection ID is required.' } }
  }

  const cleanNotes = notes ? String(notes).trim() : ''
  if (!cleanNotes) {
    return { success: false, data: null, error: { message: 'Physical inspection notes are mandatory.' } }
  }

  const cleanOutcome = String(outcome || '').trim().toLowerCase()
  if (!['passed', 'partially_passed', 'rejected'].includes(cleanOutcome)) {
    return { success: false, data: null, error: { message: 'Outcome must be passed, partially_passed, or rejected.' } }
  }

  if (shouldUseSupabaseClient(client, configured)) {
    try {
      const { data, error } = await client.rpc('admin_complete_return_inspection', {
        p_inspection_id: String(inspectionId).trim(),
        p_outcome: cleanOutcome,
        p_approved_quantity: Number(approvedQuantity) || 0,
        p_condition: String(condition || 'good').trim().toLowerCase(),
        p_notes: cleanNotes,
        p_restock_now: Boolean(restockNow),
      })

      if (error) {
        console.error('[adminService] admin_complete_return_inspection RPC failed:', error)
        return {
          success: false,
          data: null,
          error: { code: error.code, message: error.message || 'Failed to complete return inspection.' },
        }
      }

      return { success: true, data, error: null }
    } catch (err) {
      console.error('[adminService] Exception in admin_complete_return_inspection:', err)
      return {
        success: false,
        data: null,
        error: { message: err?.message || 'Error executing admin_complete_return_inspection.' },
      }
    }
  }

  return { success: true, data: { outcome: cleanOutcome, approvedQuantity }, error: null }
}

/**
 * Fetches physical return inspections for an order.
 */
export async function adminFetchReturnInspections(orderId, client = supabase, configured = isSupabaseConfigured) {
  if (!orderId) {
    return { success: false, data: [], error: { message: 'Order ID is required.' } }
  }

  if (shouldUseSupabaseClient(client, configured)) {
    try {
      const { data, error } = await client
        .from('physical_return_inspections')
        .select('*')
        .eq('order_id', String(orderId).trim())
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[adminService] Error fetching return inspections:', error)
        return { success: false, data: [], error }
      }

      return { success: true, data: data || [], error: null }
    } catch (err) {
      console.error('[adminService] Exception fetching return inspections:', err)
      return { success: false, data: [], error: { message: err?.message || 'Error fetching inspections.' } }
    }
  }

  return { success: true, data: [], error: null }
}

/**
 * Triggers batch expiration of pending PhonePe orders that exceeded the 48-hour window
 * without an active submitted UTR.
 * In Supabase Mode: calls `expire_pending_phonepe_orders()` RPC.
 */
export async function adminExpirePendingPhonepeOrders(client = supabase, configured = isSupabaseConfigured) {
  if (shouldUseSupabaseClient(client, configured)) {
    try {
      const { data, error } = await client.rpc('expire_pending_phonepe_orders')

      if (error) {
        console.error('[adminService] expire_pending_phonepe_orders RPC failed:', error)
        return {
          success: false,
          data: null,
          error: {
            code: error.code,
            message: error.message || 'Failed to expire pending PhonePe orders.',
          },
        }
      }

      return { success: true, data, error: null }
    } catch (err) {
      console.error('[adminService] Exception in expire_pending_phonepe_orders:', err)
      return {
        success: false,
        data: null,
        error: { message: err?.message || 'Error executing expire_pending_phonepe_orders.' },
      }
    }
  }

  // Local Demo Fallback Mode
  const orders = getLocal(ORDERS_STORAGE_KEY, [])
  const submissions = getLocal(PAYMENT_SUBMISSIONS_STORAGE_KEY, [])
  const now = Date.now()
  const fortyEightHoursMs = 48 * 60 * 60 * 1000

  let expiredCount = 0
  const expiredIds = []

  const updatedOrders = orders.map(order => {
    const isPhonepe = (order.payment?.provider === 'phonepe' || order.payment_provider === 'phonepe')
    if (order.status === 'pending' && isPhonepe) {
      const orderCreatedMs = new Date(order.created_at).getTime()
      if (Number.isNaN(orderCreatedMs)) {
        return order
      }
      const originalDeadlineMs = orderCreatedMs + fortyEightHoursMs
      const isPastDeadline = now >= originalDeadlineMs

      if (isPastDeadline) {
        // Collect all submissions for this order (from storage and/or order record)
        const orderSubs = [
          ...submissions.filter(s => s.order_id === order.id),
          ...(order.payment_submissions || []),
        ]
        if (order.activeSubmission) {
          orderSubs.push(order.activeSubmission)
        }

        // An order is protected if it has a UTR submitted within the original 48-hour deadline.
        // Determine protection using the original submission timestamp, not only the submission's current status.
        // A submission made within order.created_at + 48 hours protects the order from automatic cancellation
        // even if the admin reviews and marks it rejected after the deadline.
        // A submission made after the original deadline must not protect the order.
        // Resubmission must never reset the original deadline.
        const hasTimelySubmission = orderSubs.some(s => {
          if (!s.created_at) return false
          const subCreatedMs = new Date(s.created_at).getTime()
          return !Number.isNaN(subCreatedMs) && subCreatedMs <= originalDeadlineMs
        })

        if (!hasTimelySubmission) {
          expiredCount++
          expiredIds.push(order.id)
          return {
            ...order,
            status: 'cancelled',
            payment: {
              ...(order.payment || {}),
              status: 'failed',
            },
          }
        }
      }
    }
    return order
  })

  setLocal(ORDERS_STORAGE_KEY, updatedOrders)

  return {
    success: true,
    data: {
      success: true,
      expired_count: expiredCount,
      expired_order_ids: expiredIds,
      executed_at: new Date().toISOString(),
    },
    error: null,
  }
}

/**
 * Fetches pending UTR submissions awaiting administrator review.
 */
export async function adminFetchPendingUtrSubmissions(client = supabase, configured = isSupabaseConfigured) {
  if (shouldUseSupabaseClient(client, configured)) {
    try {
      const { data, error } = await client
        .from('payment_submissions')
        .select(`
          id, order_id, payment_id, user_id, utr_number, status, admin_notes, created_at,
          orders ( id, total_amount, created_at, user_id, addresses ( full_name, phone ) )
        `)
        .eq('status', 'submitted')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[adminService] Error fetching pending UTR submissions:', error)
        return { data: [], error }
      }

      return { data: data || [], error: null }
    } catch (err) {
      return { data: [], error: { message: err?.message || 'Error fetching pending UTR submissions.' } }
    }
  }

  // Local Demo Fallback Mode
  const subs = getLocal(PAYMENT_SUBMISSIONS_STORAGE_KEY, [])
  const pendingSubs = subs.filter(s => s.status === 'submitted')
  return { data: pendingSubs, error: null }
}

/* ============================================================
   4. INVENTORY MANAGEMENT
   ============================================================ */
export async function adminUpdateStock(productId, newQuantity) {
  if (supabase) {
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: Number(newQuantity) })
      .eq('product_id', productId)
    if (!error) return { success: true }
  }

  const products = getLocal(ADMIN_PRODUCTS_STORAGE, [...SAMPLE_PRODUCTS])
  const updated = products.map(p => {
    if (p.id === productId) {
      const qty = Number(newQuantity)
      return {
        ...p,
        stock: qty,
        inStock: (p.is_active !== false) && qty > 0,
      }
    }
    return p
  })
  setLocal(ADMIN_PRODUCTS_STORAGE, updated)
  return { success: true }
}

/* ============================================================
   5. CUSTOMER MANAGEMENT
   ============================================================ */
export async function adminFetchCustomers() {
  if (supabase) {
    try {
      // 1. Attempt secure admin RPC get_admin_customers (joins auth.users on server side)
      const { data: rpcCustomers, error: rpcError } = await supabase.rpc('get_admin_customers')

      let baseList = null
      if (!rpcError && Array.isArray(rpcCustomers) && rpcCustomers.length > 0) {
        baseList = rpcCustomers
      } else {
        // Fallback to querying public profiles table directly
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            phone,
            avatar_url,
            role,
            created_at,
            orders:orders ( id, status, total_amount, created_at )
          `)
          .order('created_at', { ascending: false })

        if (!error && profiles && profiles.length > 0) {
          baseList = profiles
        }
      }

      if (baseList && baseList.length > 0) {
        const mapped = baseList.map(p => {
          const ords = Array.isArray(p.orders) ? p.orders : []
          const validOrders = ords.filter(o => o.status !== 'cancelled' && o.status !== 'refunded')
          const totalSpend = validOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
          const latestOrder = [...ords].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

          return {
            id: p.id,
            full_name: p.full_name || 'Customer',
            email: p.email || null, // Never fabricate synthetic emails
            phone: p.phone || 'N/A',
            avatar_url: p.avatar_url,
            role: p.role || 'customer',
            created_at: p.created_at || new Date().toISOString(),
            order_count: ords.length,
            total_spend: totalSpend,
            last_order_at: latestOrder?.created_at || null,
            is_demo: false,
          }
        })
        return { data: mapped, error: null }
      }
    } catch {
      // Fall through to local fallback
    }
  }

  // Local demo fallback
  let stored = getLocal(ADMIN_CUSTOMERS_STORAGE, null)
  if (!stored) {
    stored = [...INITIAL_DEMO_CUSTOMERS]
    setLocal(ADMIN_CUSTOMERS_STORAGE, stored)
  }

  const { data: ordersData } = await adminFetchOrders()
  const orders = Array.isArray(ordersData) ? ordersData : []

  const customersWithStats = stored.map(c => {
    const customerOrders = orders.filter(o => {
      if (o.customer_id && String(o.customer_id) === String(c.id)) return true
      if (o.user_id && String(o.user_id) === String(c.id)) return true
      if (o.customer_name && c.full_name && o.customer_name.trim().toLowerCase() === c.full_name.trim().toLowerCase()) return true
      if (o.customer_phone && c.phone && o.customer_phone.replace(/\D/g, '') === c.phone.replace(/\D/g, '')) return true
      return false
    })

    const validOrders = customerOrders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded')
    const totalSpend = validOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
    const latestOrder = [...customerOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

    return {
      ...c,
      is_demo: true,
      order_count: customerOrders.length,
      total_spend: totalSpend,
      last_order_at: latestOrder ? latestOrder.created_at : null,
    }
  })

  return { data: customersWithStats, error: null }
}

export async function adminFetchCustomerDetails(customerId) {
  const { data: customers, error } = await adminFetchCustomers()
  if (error || !customers) return { data: null, error: error || 'Customer not found' }

  const customer = customers.find(c => String(c.id) === String(customerId))
  if (!customer) return { data: null, error: 'Customer not found' }

  const { data: ordersData } = await adminFetchOrders()
  const orders = Array.isArray(ordersData) ? ordersData : []

  const customerOrders = orders.filter(o => {
    if (o.customer_id && String(o.customer_id) === String(customer.id)) return true
    if (o.user_id && String(o.user_id) === String(customer.id)) return true
    if (o.customer_name && customer.full_name && o.customer_name.trim().toLowerCase() === customer.full_name.trim().toLowerCase()) return true
    if (o.customer_phone && customer.phone && o.customer_phone.replace(/\D/g, '') === customer.phone.replace(/\D/g, '')) return true
    return false
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return {
    data: {
      ...customer,
      orders: customerOrders,
    },
    error: null,
  }
}

/* ============================================================
   6. ANALYTICS & INSIGHTS
   ============================================================ */
export async function adminFetchAnalytics(timeRange = '30d') {
  const { data: allOrders } = await adminFetchOrders()
  const orders = Array.isArray(allOrders) ? allOrders : []
  const { data: allCustomers } = await adminFetchCustomers()
  const customers = Array.isArray(allCustomers) ? allCustomers : []

  const now = Date.now()
  let cutoff = 0
  if (timeRange === 'today') {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    cutoff = startOfToday.getTime()
  } else if (timeRange === '7d') {
    cutoff = now - 7 * 86400000
  } else if (timeRange === '30d') {
    cutoff = now - 30 * 86400000
  } else if (timeRange === '90d') {
    cutoff = now - 90 * 86400000
  } else if (timeRange === '1y') {
    cutoff = now - 365 * 86400000
  } else {
    cutoff = 0 // 'all'
  }

  // Filter orders by time cutoff
  const periodOrders = orders.filter(o => {
    const t = new Date(o.created_at).getTime()
    return isNaN(t) || t >= cutoff
  })

  // Valid orders exclude cancelled and refunded
  const validOrders = periodOrders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded')

  // KPIs
  const totalRevenue = validOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
  const totalOrders = periodOrders.length
  const averageOrderValue = validOrders.length > 0 ? Math.round(totalRevenue / validOrders.length) : 0
  const pendingOrders = periodOrders.filter(o => o.status === 'pending' || o.status === 'processing').length
  const deliveredOrders = periodOrders.filter(o => o.status === 'delivered').length
  const shippedOrders = periodOrders.filter(o => o.status === 'shipped').length
  const cancelledOrders = periodOrders.filter(o => o.status === 'cancelled').length

  // Generate revenue trend data points
  let trendPoints = []
  if (timeRange === 'today') {
    const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']
    trendPoints = hours.map(h => ({ label: h, revenue: 0, orders: 0 }))
    validOrders.forEach(o => {
      const d = new Date(o.created_at)
      const hr = d.getHours()
      const bucketIdx = Math.min(Math.floor(hr / 4), 5)
      trendPoints[bucketIdx].revenue += Number(o.total_amount) || 0
      trendPoints[bucketIdx].orders += 1
    })
  } else if (timeRange === '7d') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000)
      const dayName = days[d.getDay()]
      const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      trendPoints.push({
        label: `${dayName} ${dateStr}`,
        dateKey: d.toISOString().slice(0, 10),
        revenue: 0,
        orders: 0,
      })
    }
    validOrders.forEach(o => {
      const key = new Date(o.created_at).toISOString().slice(0, 10)
      const pt = trendPoints.find(p => p.dateKey === key)
      if (pt) {
        pt.revenue += Number(o.total_amount) || 0
        pt.orders += 1
      }
    })
  } else {
    const intervalCount = timeRange === '30d' ? 6 : 8
    const intervalMs = Math.max((now - cutoff) / intervalCount, 86400000)
    for (let i = intervalCount - 1; i >= 0; i--) {
      const startMs = now - (i + 1) * intervalMs
      const endMs = now - i * intervalMs
      const d = new Date(endMs)
      const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      let rev = 0
      let ordCount = 0
      validOrders.forEach(o => {
        const ot = new Date(o.created_at).getTime()
        if (ot >= startMs && ot < endMs) {
          rev += Number(o.total_amount) || 0
          ordCount += 1
        }
      })
      trendPoints.push({ label, revenue: rev, orders: ordCount })
    }
  }

  // Sales by Category
  const categoryMap = {}
  validOrders.forEach(o => {
    if (Array.isArray(o.items) && o.items.length > 0) {
      o.items.forEach(item => {
        const cat = item.category || o.category || 'General'
        if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, units: 0 }
        categoryMap[cat].revenue += Number(item.total_price || item.unit_price || 0)
        categoryMap[cat].units += Number(item.quantity || 1)
      })
    } else {
      const cat = o.category || 'General'
      if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, units: 0 }
      categoryMap[cat].revenue += Number(o.total_amount || 0)
      categoryMap[cat].units += 1
    }
  })

  const salesByCategory = Object.entries(categoryMap).map(([category, stats]) => ({
    category,
    revenue: stats.revenue,
    units: stats.units,
    percentage: totalRevenue > 0 ? Math.round((stats.revenue / totalRevenue) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue)

  // Status breakdown
  const orderStatusBreakdown = {
    delivered: { count: deliveredOrders, percent: totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0 },
    shipped: { count: shippedOrders, percent: totalOrders > 0 ? Math.round((shippedOrders / totalOrders) * 100) : 0 },
    processing: { count: periodOrders.filter(o => o.status === 'processing').length, percent: 0 },
    pending: { count: periodOrders.filter(o => o.status === 'pending').length, percent: 0 },
    cancelled: { count: cancelledOrders, percent: totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 100) : 0 },
  }
  orderStatusBreakdown.processing.percent = totalOrders > 0 ? Math.round((orderStatusBreakdown.processing.count / totalOrders) * 100) : 0
  orderStatusBreakdown.pending.percent = totalOrders > 0 ? Math.round((orderStatusBreakdown.pending.count / totalOrders) * 100) : 0

  // Top products
  const productSalesMap = {}
  validOrders.forEach(o => {
    if (Array.isArray(o.items)) {
      o.items.forEach(item => {
        const id = item.product_id || item.product_name
        if (!productSalesMap[id]) {
          productSalesMap[id] = {
            id,
            name: item.product_name,
            units: 0,
            revenue: 0,
            unitPrice: item.unit_price || 0,
          }
        }
        productSalesMap[id].units += Number(item.quantity || 1)
        productSalesMap[id].revenue += Number(item.total_price || (item.unit_price * (item.quantity || 1)) || 0)
      })
    }
  })

  const topProducts = Object.values(productSalesMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  return {
    data: {
      timeRange,
      totalRevenue,
      totalOrders,
      totalCustomers: customers.length,
      averageOrderValue,
      pendingOrders,
      deliveredOrders,
      shippedOrders,
      cancelledOrders,
      trendPoints,
      salesByCategory,
      orderStatusBreakdown,
      topProducts,
      recentOrders: periodOrders.slice(0, 6),
    },
    error: null,
  }
}

/* ============================================================
   7. STORE SETTINGS
   ============================================================ */
export async function adminFetchSettings() {
  const settings = getLocal(ADMIN_SETTINGS_STORAGE, DEFAULT_STORE_SETTINGS)
  return { data: { ...DEFAULT_STORE_SETTINGS, ...settings }, error: null }
}

export async function adminSaveSettings(newSettings) {
  try {
    const current = getLocal(ADMIN_SETTINGS_STORAGE, DEFAULT_STORE_SETTINGS)
    const updated = { ...current, ...newSettings }
    setLocal(ADMIN_SETTINGS_STORAGE, updated)
    return { data: updated, error: null }
  } catch (err) {
    return { data: null, error: err.message || 'Failed to save settings' }
  }
}

/* ============================================================
   8. COUPONS MANAGEMENT (Phase 5 Stage B1)
   ============================================================ */
const COUPON_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const INITIAL_DEMO_COUPONS = [
  {
    id: 'c1',
    code: 'SHOPKART10',
    discount_type: 'percent',
    discount_value: 10,
    min_order_value: 999,
    max_uses: 500,
    used_count: 42,
    expires_at: null,
    is_active: true,
  },
  {
    id: 'c2',
    code: 'WELCOME500',
    discount_type: 'fixed',
    discount_value: 500,
    min_order_value: 4999,
    max_uses: 1000,
    used_count: 128,
    expires_at: null,
    is_active: true,
  },
]

function isValidCouponUUID(value) {
  return typeof value === 'string' && COUPON_UUID_REGEX.test(value.trim())
}

function shouldUseSupabaseClient(client = supabase, configured = isSupabaseConfigured) {
  if (client && client !== supabase) return true
  return Boolean(configured && client)
}

/**
 * Validates and normalizes coupon payload against the `public.coupons` schema contract.
 * Does not allow non-schema columns (e.g. max_discount) or synthetic IDs.
 */
export function validateCouponPayload(coupon) {
  if (!coupon || typeof coupon !== 'object') {
    return { valid: false, error: 'Invalid coupon payload.', payload: null }
  }

  const normalizedCode = typeof coupon.code === 'string' || typeof coupon.code === 'number'
    ? String(coupon.code).trim().toUpperCase()
    : ''

  if (!normalizedCode) {
    return { valid: false, error: 'Coupon code is required.', payload: null }
  }

  const discountType = coupon.discount_type
  if (discountType !== 'percent' && discountType !== 'fixed') {
    return {
      valid: false,
      error: 'Discount type must be either "percent" or "fixed".',
      payload: null,
    }
  }

  const rawDiscount = coupon.discount_value
  if (rawDiscount === '' || rawDiscount === null || rawDiscount === undefined) {
    return { valid: false, error: 'Discount value is required.', payload: null }
  }
  const discountValue = Number(rawDiscount)
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return {
      valid: false,
      error: 'Discount value must be greater than zero.',
      payload: null,
    }
  }
  if (discountType === 'percent' && discountValue > 100) {
    return {
      valid: false,
      error: 'Percentage discount cannot exceed 100%.',
      payload: null,
    }
  }

  let minOrderValue = 0
  if (coupon.min_order_value !== '' && coupon.min_order_value !== null && coupon.min_order_value !== undefined) {
    const parsedMinOrder = Number(coupon.min_order_value)
    if (!Number.isFinite(parsedMinOrder) || parsedMinOrder < 0) {
      return {
        valid: false,
        error: 'Minimum order value must be 0 or greater.',
        payload: null,
      }
    }
    minOrderValue = parsedMinOrder
  }

  let maxUses = null
  if (coupon.max_uses !== '' && coupon.max_uses !== null && coupon.max_uses !== undefined) {
    const parsedMaxUses = Number(coupon.max_uses)
    if (!Number.isFinite(parsedMaxUses) || !Number.isInteger(parsedMaxUses) || parsedMaxUses <= 0) {
      return {
        valid: false,
        error: 'Usage limit (max uses) must be a positive whole number or null for unlimited.',
        payload: null,
      }
    }
    maxUses = parsedMaxUses
  }

  let expiresAt = null
  if (coupon.expires_at !== '' && coupon.expires_at !== null && coupon.expires_at !== undefined) {
    const parsedExpiry = new Date(coupon.expires_at)
    if (Number.isNaN(parsedExpiry.getTime())) {
      return {
        valid: false,
        error: 'Expiry date must be a valid date/time or left empty.',
        payload: null,
      }
    }
    expiresAt = parsedExpiry.toISOString()
  }

  if (coupon.is_active !== undefined && typeof coupon.is_active !== 'boolean') {
    return {
      valid: false,
      error: 'Coupon active status must be a boolean.',
      payload: null,
    }
  }
  const isActive = coupon.is_active === undefined ? true : coupon.is_active

  return {
    valid: true,
    error: null,
    payload: {
      code: normalizedCode,
      discount_type: discountType,
      discount_value: discountValue,
      min_order_value: minOrderValue,
      max_uses: maxUses,
      expires_at: expiresAt,
      is_active: isActive,
    },
  }
}

/**
 * Computes operational coupon status matching storefront & database checks.
 */
export function getCouponStatus(coupon, now = new Date()) {
  if (!coupon || !coupon.is_active) return 'Inactive'
  if (coupon.expires_at) {
    const exp = new Date(coupon.expires_at)
    if (!Number.isNaN(exp.getTime()) && exp <= now) {
      return 'Expired'
    }
  }
  if (coupon.max_uses !== null && coupon.max_uses !== undefined && Number(coupon.used_count || 0) >= Number(coupon.max_uses)) {
    return 'Limit Reached'
  }
  return 'Active'
}

function mapCouponDbError(error, couponCode = '') {
  if (!error) return null
  if (error.code === '23505') {
    return {
      ...error,
      code: '23505',
      message: couponCode
        ? `Coupon code "${couponCode}" already exists. Please use a unique code.`
        : 'A coupon with this code already exists.',
    }
  }
  return {
    ...error,
    message: error.message || 'Database request failed while managing coupons.',
  }
}

export async function adminFetchCoupons(client = supabase, configured = isSupabaseConfigured) {
  if (shouldUseSupabaseClient(client, configured)) {
    try {
      const { data, error } = await client
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[adminService] Error fetching coupons from Supabase:', error)
        return { data: [], error: mapCouponDbError(error) }
      }
      return { data: Array.isArray(data) ? data : [], error: null }
    } catch (err) {
      console.error('[adminService] Exception fetching coupons from Supabase:', err)
      return { data: [], error: mapCouponDbError(err) }
    }
  }

  // Explicit demo mode only (!isSupabaseConfigured || !supabase)
  try {
    const raw = localStorage.getItem(ADMIN_COUPONS_STORAGE)
    if (raw === null) {
      setLocal(ADMIN_COUPONS_STORAGE, INITIAL_DEMO_COUPONS)
      return { data: [...INITIAL_DEMO_COUPONS], error: null }
    }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return { data: parsed, error: null }
    }
    return { data: [], error: null }
  } catch (err) {
    console.error(`[adminService] Error reading ${ADMIN_COUPONS_STORAGE}:`, err)
    return { data: [], error: null }
  }
}

export async function adminSaveCoupon(coupon, client = supabase, configured = isSupabaseConfigured) {
  const validation = validateCouponPayload(coupon)
  if (!validation.valid) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: validation.error },
    }
  }

  const payload = validation.payload

  if (shouldUseSupabaseClient(client, configured)) {
    const hasId = coupon.id !== undefined && coupon.id !== null && String(coupon.id).trim() !== ''
    const isUuidUpdate = hasId && isValidCouponUUID(String(coupon.id))

    try {
      const query = isUuidUpdate
        ? client
            .from('coupons')
            .update(payload)
            .eq('id', String(coupon.id).trim())
            .select()
            .single()
        : client
            .from('coupons')
            .insert([payload])
            .select()
            .single()

      const { data, error } = await query
      if (error) {
        console.error('[adminService] Error saving coupon to Supabase:', error)
        return { data: null, error: mapCouponDbError(error, payload.code) }
      }
      return { data, error: null }
    } catch (err) {
      console.error('[adminService] Exception saving coupon to Supabase:', err)
      return { data: null, error: mapCouponDbError(err, payload.code) }
    }
  }

  // Explicit demo mode only (!isSupabaseConfigured || !supabase)
  const stored = getLocal(ADMIN_COUPONS_STORAGE, [...INITIAL_DEMO_COUPONS])
  const duplicate = stored.find(
    c => c.code && c.code.toUpperCase() === payload.code && String(c.id) !== String(coupon.id ?? '')
  )
  if (duplicate) {
    return {
      data: null,
      error: mapCouponDbError({ code: '23505', message: 'duplicate key value' }, payload.code),
    }
  }

  const existingIdx = coupon.id !== undefined && coupon.id !== null
    ? stored.findIndex(c => String(c.id) === String(coupon.id))
    : -1

  let saved
  if (existingIdx !== -1) {
    saved = {
      ...stored[existingIdx],
      ...payload,
      updated_at: new Date().toISOString(),
    }
    stored[existingIdx] = saved
  } else {
    saved = {
      id: `c-${Date.now()}`,
      ...payload,
      used_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    stored.unshift(saved)
  }

  setLocal(ADMIN_COUPONS_STORAGE, stored)
  return { data: saved, error: null }
}

export async function adminToggleCouponActive(id, currentActive, client = supabase, configured = isSupabaseConfigured) {
  if (!id || String(id).trim() === '') {
    return { data: null, success: false, error: { message: 'Coupon ID is required.' } }
  }

  const nextActive = !currentActive

  if (shouldUseSupabaseClient(client, configured)) {
    const cleanId = String(id).trim()
    if (!isValidCouponUUID(cleanId)) {
      return { data: null, success: false, error: { message: 'Invalid coupon database ID.' } }
    }

    try {
      const { data, error } = await client
        .from('coupons')
        .update({ is_active: nextActive })
        .eq('id', cleanId)
        .select()
        .single()

      if (error) {
        console.error('[adminService] Error toggling coupon active status:', error)
        return { data: null, success: false, error: mapCouponDbError(error) }
      }
      return { data, success: true, error: null }
    } catch (err) {
      console.error('[adminService] Exception toggling coupon active status:', err)
      return { data: null, success: false, error: mapCouponDbError(err) }
    }
  }

  // Explicit demo mode only
  const stored = getLocal(ADMIN_COUPONS_STORAGE, [...INITIAL_DEMO_COUPONS])
  let updatedItem = null
  const next = stored.map(c => {
    if (String(c.id) === String(id)) {
      updatedItem = { ...c, is_active: nextActive, updated_at: new Date().toISOString() }
      return updatedItem
    }
    return c
  })
  setLocal(ADMIN_COUPONS_STORAGE, next)
  return { data: updatedItem, success: Boolean(updatedItem), error: updatedItem ? null : { message: 'Coupon not found.' } }
}

export async function adminDeleteCoupon(id, client = supabase, configured = isSupabaseConfigured) {
  if (!id || String(id).trim() === '') {
    return { success: false, error: { message: 'Coupon ID is required.' } }
  }

  if (shouldUseSupabaseClient(client, configured)) {
    const cleanId = String(id).trim()
    if (!isValidCouponUUID(cleanId)) {
      return { success: false, error: { message: 'Invalid coupon database ID.' } }
    }

    try {
      const { data, error } = await client
        .from('coupons')
        .delete()
        .eq('id', cleanId)
        .select('id')
        .single()

      if (error) {
        console.error('[adminService] Error deleting coupon from Supabase:', error)
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: {
              ...error,
              message: 'Coupon could not be deleted: record not found or permission denied.',
            },
          }
        }
        return { success: false, error: mapCouponDbError(error) }
      }

      const deletedRow = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data
      if (!deletedRow || !deletedRow.id) {
        return {
          success: false,
          error: {
            message: 'Coupon could not be deleted: record not found or permission denied.',
          },
        }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('[adminService] Exception deleting coupon from Supabase:', err)
      return { success: false, error: mapCouponDbError(err) }
    }
  }

  // Explicit demo mode only
  const stored = getLocal(ADMIN_COUPONS_STORAGE, [...INITIAL_DEMO_COUPONS])
  const filtered = stored.filter(c => String(c.id) !== String(id))
  setLocal(ADMIN_COUPONS_STORAGE, filtered)
  return { success: true, error: null }
}

/* ============================================================
   ADMIN REVIEWS MODERATION — PHASE 5 STAGE B2
   ============================================================ */
export const ADMIN_REVIEWS_STORAGE = 'shopkart_admin_reviews'

const REVIEW_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const INITIAL_DEMO_REVIEWS = [
  {
    id: 'rev-1',
    product_id: 'demo-product-1',
    user_id: 'demo-user-1',
    product_name: 'Sony WH-1000XM5 Wireless Headphones',
    user_name: 'Vikram Seth',
    user_avatar_url: null,
    rating: 5,
    title: 'Outstanding Noise Cancellation',
    body: 'The sound quality and active noise cancellation are completely unmatched. Worth every rupee.',
    is_approved: true,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'rev-2',
    product_id: 'demo-product-2',
    user_id: 'demo-user-2',
    product_name: 'boAt Airdopes 141 TWS Earbuds',
    user_name: 'Anjali Sharma',
    user_avatar_url: null,
    rating: 4,
    title: 'Good battery life for the price',
    body: 'Decent bass and good microphone quality during calls. Fits comfortably.',
    is_approved: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'rev-3',
    product_id: 'demo-product-3',
    user_id: 'demo-user-3',
    product_name: 'Nike Air Max 270 Running Shoes',
    user_name: 'Karan Mehra',
    user_avatar_url: null,
    rating: 5,
    title: 'Super comfortable for daily running',
    body: 'The air cushion feels like walking on clouds. Excellent grip and breathable mesh.',
    is_approved: true,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
]

function isValidReviewUUID(value) {
  return typeof value === 'string' && REVIEW_UUID_REGEX.test(value.trim())
}

function normalizeReviewRow(row) {
  const product = Array.isArray(row?.products) ? row.products[0] : row?.products
  const profile = Array.isArray(row?.profiles) ? row.profiles[0] : row?.profiles

  return {
    ...row,
    product_name: typeof product?.name === 'string' && product.name.trim()
      ? product.name
      : 'Unknown product',
    user_name: typeof profile?.full_name === 'string' && profile.full_name.trim()
      ? profile.full_name
      : 'Customer',
    user_avatar_url: profile?.avatar_url || null,
  }
}

function getDemoReviews() {
  const stored = getLocal(ADMIN_REVIEWS_STORAGE, null)
  if (Array.isArray(stored)) return stored
  setLocal(ADMIN_REVIEWS_STORAGE, INITIAL_DEMO_REVIEWS)
  return [...INITIAL_DEMO_REVIEWS]
}

/** Fetches all moderation records. Supabase errors never fall back to demo data. */
export async function adminFetchReviews(client = supabase, configured = isSupabaseConfigured) {
  if (shouldUseSupabaseClient(client, configured)) {
    try {
      const { data, error } = await client
        .from('reviews')
        .select('*, products(name), profiles(full_name, avatar_url)')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[adminService] Error fetching reviews from Supabase:', error)
        return { data: null, error }
      }

      const normalized = (Array.isArray(data) ? data : []).map(normalizeReviewRow)
      normalized.sort((a, b) => {
        const aTime = new Date(a.created_at).getTime()
        const bTime = new Date(b.created_at).getTime()
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
      })
      return { data: normalized, error: null }
    } catch (error) {
      console.error('[adminService] Exception fetching reviews from Supabase:', error)
      return { data: null, error }
    }
  }

  try {
    const reviews = getDemoReviews()
    return {
      data: [...reviews].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      error: null,
    }
  } catch (error) {
    return { data: null, error: { message: error?.message || 'Unable to read demo reviews.' } }
  }
}

/** Changes only is_approved and confirms the updated database row. */
export async function adminToggleReviewApproval(id, isApproved, client = supabase, configured = isSupabaseConfigured) {
  if (typeof isApproved !== 'boolean') {
    return { data: null, success: false, error: { code: 'VALIDATION_ERROR', message: 'Approval status must be true or false.' } }
  }

  if (shouldUseSupabaseClient(client, configured)) {
    const cleanId = typeof id === 'string' ? id.trim() : ''
    if (!isValidReviewUUID(cleanId)) {
      return { data: null, success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid review database ID.' } }
    }

    try {
      const { data, error } = await client
        .from('reviews')
        .update({ is_approved: isApproved })
        .eq('id', cleanId)
        .select('*, products(name), profiles(full_name, avatar_url)')
        .single()

      if (error) {
        console.error('[adminService] Error updating review approval:', error)
        return { data: null, success: false, error }
      }
      const updatedRow = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data
      if (!updatedRow?.id) {
        return { data: null, success: false, error: { message: 'Review was not updated: record not found or permission denied.' } }
      }
      return { data: normalizeReviewRow(updatedRow), success: true, error: null }
    } catch (error) {
      console.error('[adminService] Exception updating review approval:', error)
      return { data: null, success: false, error }
    }
  }

  try {
    const reviews = getDemoReviews()
    const index = reviews.findIndex(review => String(review.id) === String(id))
    if (index < 0) return { data: null, success: false, error: { message: 'Review not found in demo data.' } }
    const updated = { ...reviews[index], is_approved: isApproved }
    reviews[index] = updated
    setLocal(ADMIN_REVIEWS_STORAGE, reviews)
    return { data: updated, success: true, error: null }
  } catch (error) {
    return { data: null, success: false, error: { message: error?.message || 'Unable to update demo review.' } }
  }
}

/** Deletes a review only when Supabase confirms the deleted row. */
export async function adminDeleteReview(id, client = supabase, configured = isSupabaseConfigured) {
  if (shouldUseSupabaseClient(client, configured)) {
    const cleanId = typeof id === 'string' ? id.trim() : ''
    if (!isValidReviewUUID(cleanId)) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid review database ID.' } }
    }

    try {
      const { data, error } = await client
        .from('reviews')
        .delete()
        .eq('id', cleanId)
        .select('id')
        .single()

      if (error) {
        console.error('[adminService] Error deleting review from Supabase:', error)
        if (error.code === 'PGRST116') {
          return { success: false, error: { ...error, message: 'Review could not be deleted: record not found or permission denied.' } }
        }
        return { success: false, error }
      }
      const deletedRow = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data
      if (!deletedRow?.id) {
        return { success: false, error: { message: 'Review could not be deleted: record not found or permission denied.' } }
      }
      return { success: true, error: null }
    } catch (error) {
      console.error('[adminService] Exception deleting review from Supabase:', error)
      return { success: false, error }
    }
  }

  try {
    const reviews = getDemoReviews()
    const filtered = reviews.filter(review => String(review.id) !== String(id))
    if (filtered.length === reviews.length) {
      return { success: false, error: { message: 'Review not found in demo data.' } }
    }
    setLocal(ADMIN_REVIEWS_STORAGE, filtered)
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: { message: error?.message || 'Unable to delete demo review.' } }
  }
}

/* ============================================================
   ADMIN BANNERS MANAGEMENT — PHASE 5 STAGE B3
   ============================================================ */
const BANNER_INT4_MAX = 2147483647
const BANNER_HEX_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const DEFAULT_BANNER_BG_FROM = '#1e3a5f'
const DEFAULT_BANNER_BG_TO = '#2563eb'

function parseValidBannerId(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= BANNER_INT4_MAX ? value : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) return null
    const parsed = Number(trimmed)
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= BANNER_INT4_MAX ? parsed : null
  }
  return null
}

function isValidHexColor(value) {
  return typeof value === 'string' && BANNER_HEX_REGEX.test(value.trim())
}

function validateSafeUrlOrPath(rawValue, { allowRelative = true, label = 'URL' } = {}) {
  if (rawValue === undefined || rawValue === null) {
    return { valid: true, value: null, error: null }
  }
  if (typeof rawValue !== 'string') {
    return { valid: false, value: null, error: `${label} must be a text URL.` }
  }
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return { valid: true, value: null, error: null }
  }
  if (allowRelative && trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return { valid: true, value: trimmed, error: null }
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, value: null, error: `${label} must use http(s)${allowRelative ? ' or start with /' : ''}.` }
    }
    return { valid: true, value: trimmed, error: null }
  } catch {
    return {
      valid: false,
      value: null,
      error: `${label} must be a valid http(s) URL${allowRelative ? ' or relative path starting with /' : ''}.`,
    }
  }
}

export function normalizeBannerRow(row = {}) {
  const parsedId = parseValidBannerId(row?.id)
  const rawFrom = row?.bg_from ?? row?.bgFrom
  const rawTo = row?.bg_to ?? row?.bgTo
  const rawSort = Number(row?.sort_order ?? 0)

  return {
    id: parsedId ?? row?.id ?? null,
    title: typeof row?.title === 'string' ? row.title : '',
    subtitle: row?.subtitle ?? null,
    cta: row?.cta ?? null,
    cta_link: row?.cta_link ?? row?.ctaLink ?? null,
    image_url: row?.image_url ?? row?.image ?? null,
    bg_from: isValidHexColor(rawFrom) ? rawFrom.trim().toLowerCase() : DEFAULT_BANNER_BG_FROM,
    bg_to: isValidHexColor(rawTo) ? rawTo.trim().toLowerCase() : DEFAULT_BANNER_BG_TO,
    sort_order: Number.isInteger(rawSort) && rawSort >= 0 ? rawSort : 0,
    is_active: row?.is_active !== false,
    starts_at: row?.starts_at ?? null,
    ends_at: row?.ends_at ?? null,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  }
}

function sortNormalizedBanners(list) {
  return [...list].sort((a, b) => {
    const orderDiff = (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0)
    if (orderDiff !== 0) return orderDiff
    return (Number(a?.id) || 0) - (Number(b?.id) || 0)
  })
}

export function getBannerStatus(banner, now = new Date()) {
  if (!banner || banner.is_active === false) return 'Hidden'
  if (banner.starts_at) {
    const startDate = new Date(banner.starts_at)
    if (!Number.isNaN(startDate.getTime()) && startDate > now) {
      return 'Scheduled'
    }
  }
  if (banner.ends_at) {
    const endDate = new Date(banner.ends_at)
    if (!Number.isNaN(endDate.getTime()) && endDate <= now) {
      return 'Expired'
    }
  }
  return 'Active'
}

export function validateBannerPayload(banner) {
  if (!banner || typeof banner !== 'object') {
    return { valid: false, error: 'Invalid banner payload.', payload: null }
  }

  const title = typeof banner.title === 'string' ? banner.title.trim() : ''
  if (!title) {
    return { valid: false, error: 'Banner headline is required.', payload: null }
  }

  if (banner.subtitle !== undefined && banner.subtitle !== null && typeof banner.subtitle !== 'string') {
    return { valid: false, error: 'Subtitle must be text.', payload: null }
  }
  const subtitle = typeof banner.subtitle === 'string' ? (banner.subtitle.trim() || null) : null

  let cta = 'Shop Now'
  if (banner.cta !== undefined) {
    if (banner.cta === null) {
      cta = null
    } else if (typeof banner.cta === 'string') {
      cta = banner.cta.trim() || null
    } else {
      return { valid: false, error: 'Button text must be text.', payload: null }
    }
  }

  const ctaLinkCheck = validateSafeUrlOrPath(banner.cta_link ?? banner.ctaLink, {
    allowRelative: true,
    label: 'Destination URL',
  })
  if (!ctaLinkCheck.valid) {
    return { valid: false, error: ctaLinkCheck.error, payload: null }
  }

  const imageCheck = validateSafeUrlOrPath(banner.image_url ?? banner.image, {
    allowRelative: true,
    label: 'Banner Image URL',
  })
  if (!imageCheck.valid) {
    return { valid: false, error: imageCheck.error, payload: null }
  }

  const rawBgFrom = banner.bg_from ?? banner.bgFrom
  const bgFrom = rawBgFrom === undefined || rawBgFrom === null || String(rawBgFrom).trim() === ''
    ? DEFAULT_BANNER_BG_FROM
    : String(rawBgFrom).trim().toLowerCase()
  if (!isValidHexColor(bgFrom)) {
    return { valid: false, error: 'Gradient start color must be a valid hex color (e.g. #1e3a5f).', payload: null }
  }

  const rawBgTo = banner.bg_to ?? banner.bgTo
  const bgTo = rawBgTo === undefined || rawBgTo === null || String(rawBgTo).trim() === ''
    ? DEFAULT_BANNER_BG_TO
    : String(rawBgTo).trim().toLowerCase()
  if (!isValidHexColor(bgTo)) {
    return { valid: false, error: 'Gradient end color must be a valid hex color (e.g. #2563eb).', payload: null }
  }

  let sortOrder = 0
  if (banner.sort_order !== undefined && banner.sort_order !== null && banner.sort_order !== '') {
    const parsedSort = Number(banner.sort_order)
    if (!Number.isFinite(parsedSort) || !Number.isInteger(parsedSort) || parsedSort < 0 || parsedSort > BANNER_INT4_MAX) {
      return { valid: false, error: 'Display order must be a whole number (0 or greater).', payload: null }
    }
    sortOrder = parsedSort
  }

  if (banner.is_active !== undefined && typeof banner.is_active !== 'boolean') {
    return { valid: false, error: 'Banner active status must be a boolean.', payload: null }
  }
  const isActive = banner.is_active === undefined ? true : banner.is_active

  let startsAt = null
  if (banner.starts_at !== undefined && banner.starts_at !== null && banner.starts_at !== '') {
    const parsedStart = new Date(banner.starts_at)
    if (Number.isNaN(parsedStart.getTime())) {
      return { valid: false, error: 'Start date/time must be a valid date/time or left empty.', payload: null }
    }
    startsAt = parsedStart.toISOString()
  }

  let endsAt = null
  if (banner.ends_at !== undefined && banner.ends_at !== null && banner.ends_at !== '') {
    const parsedEnd = new Date(banner.ends_at)
    if (Number.isNaN(parsedEnd.getTime())) {
      return { valid: false, error: 'End date/time must be a valid date/time or left empty.', payload: null }
    }
    endsAt = parsedEnd.toISOString()
  }

  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return { valid: false, error: 'End date/time must be after start date/time.', payload: null }
  }

  return {
    valid: true,
    error: null,
    payload: {
      title,
      subtitle,
      cta,
      cta_link: ctaLinkCheck.value,
      image_url: imageCheck.value,
      bg_from: bgFrom,
      bg_to: bgTo,
      sort_order: sortOrder,
      is_active: isActive,
      starts_at: startsAt,
      ends_at: endsAt,
    },
  }
}

function getDemoBanners() {
  const raw = localStorage.getItem(ADMIN_BANNERS_STORAGE)
  if (raw === null) {
    const seeded = sortNormalizedBanners(
      SAMPLE_BANNERS.map((item, idx) =>
        normalizeBannerRow({
          ...item,
          sort_order: item.sort_order ?? idx + 1,
          is_active: item.is_active !== false,
        })
      )
    )
    setLocal(ADMIN_BANNERS_STORAGE, seeded)
    return seeded
  }
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('Stored demo banners data is invalid.')
  }
  return sortNormalizedBanners(parsed.map(normalizeBannerRow))
}

function mapBannerDbError(error, fallbackMessage) {
  if (!error) return { message: fallbackMessage }
  if (error.code === 'PGRST116') {
    return {
      ...error,
      message: fallbackMessage,
    }
  }
  return {
    ...error,
    message: error.message || fallbackMessage,
  }
}

/** Fetches all banners ordered by sort_order ASC, id ASC. Never falls back to LocalStorage in Supabase mode. */
export async function adminFetchBanners(client = supabase, configured = isSupabaseConfigured) {
  if (shouldUseSupabaseClient(client, configured)) {
    try {
      const { data, error } = await client
        .from('banners')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })

      if (error) {
        console.error('[adminService] Error fetching banners from Supabase:', error)
        return { data: null, error: mapBannerDbError(error, 'Failed to fetch banners from database.') }
      }

      const normalized = sortNormalizedBanners((Array.isArray(data) ? data : []).map(normalizeBannerRow))
      return { data: normalized, error: null }
    } catch (err) {
      console.error('[adminService] Exception fetching banners from Supabase:', err)
      return { data: null, error: mapBannerDbError(err, 'Failed to fetch banners from database.') }
    }
  }

  try {
    return { data: getDemoBanners(), error: null }
  } catch (err) {
    return { data: null, error: { message: err?.message || 'Unable to read demo banners.' } }
  }
}

/** Creates or updates a banner in public.banners (never generates PostgreSQL IDs client-side). */
export async function adminSaveBanner(banner, client = supabase, configured = isSupabaseConfigured) {
  const validation = validateBannerPayload(banner)
  if (!validation.valid) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: validation.error },
    }
  }

  const payload = validation.payload
  const hasExplicitId = banner.id !== undefined && banner.id !== null && String(banner.id).trim() !== ''

  if (shouldUseSupabaseClient(client, configured)) {
    let bannerId = null
    if (hasExplicitId) {
      bannerId = parseValidBannerId(banner.id)
      if (!bannerId) {
        return {
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid banner database ID.' },
        }
      }
    }

    try {
      const query = bannerId
        ? client
            .from('banners')
            .update(payload)
            .eq('id', bannerId)
            .select('*')
            .single()
        : client
            .from('banners')
            .insert([payload])
            .select('*')
            .single()

      const { data, error } = await query
      if (error) {
        console.error('[adminService] Error saving banner to Supabase:', error)
        const fallback = bannerId
          ? 'Banner could not be updated: record not found or permission denied.'
          : 'Banner could not be created.'
        return { data: null, error: mapBannerDbError(error, fallback) }
      }

      const savedRow = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data
      if (!parseValidBannerId(savedRow?.id)) {
        return {
          data: null,
          error: {
            message: bannerId
              ? 'Banner was not updated: record not found or permission denied.'
              : 'Banner creation could not be confirmed by database.',
          },
        }
      }

      return { data: normalizeBannerRow(savedRow), error: null }
    } catch (err) {
      console.error('[adminService] Exception saving banner to Supabase:', err)
      return { data: null, error: mapBannerDbError(err, 'Failed to save banner.') }
    }
  }

  try {
    const stored = getDemoBanners()
    const nowIso = new Date().toISOString()

    if (hasExplicitId) {
      const targetId = parseValidBannerId(banner.id)
      const index = stored.findIndex(item => String(item.id) === String(targetId ?? banner.id))
      if (index < 0) {
        return { data: null, error: { message: 'Banner not found in demo data.' } }
      }
      const updated = normalizeBannerRow({
        ...stored[index],
        ...payload,
        updated_at: nowIso,
      })
      stored[index] = updated
      const next = sortNormalizedBanners(stored)
      setLocal(ADMIN_BANNERS_STORAGE, next)
      return { data: updated, error: null }
    }

    const nextId = stored.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1
    const created = normalizeBannerRow({
      id: nextId,
      ...payload,
      created_at: nowIso,
      updated_at: nowIso,
    })
    const next = sortNormalizedBanners([...stored, created])
    setLocal(ADMIN_BANNERS_STORAGE, next)
    return { data: created, error: null }
  } catch (err) {
    return { data: null, error: { message: err?.message || 'Unable to save demo banner.' } }
  }
}

/** Updates only is_active on a banner and confirms the updated row. */
export async function adminToggleBannerActive(id, isActive, client = supabase, configured = isSupabaseConfigured) {
  if (typeof isActive !== 'boolean') {
    return {
      data: null,
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Banner active status must be true or false.' },
    }
  }

  if (shouldUseSupabaseClient(client, configured)) {
    const bannerId = parseValidBannerId(id)
    if (!bannerId) {
      return {
        data: null,
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid banner database ID.' },
      }
    }

    try {
      const { data, error } = await client
        .from('banners')
        .update({ is_active: isActive })
        .eq('id', bannerId)
        .select('*')
        .single()

      if (error) {
        console.error('[adminService] Error updating banner status:', error)
        return {
          data: null,
          success: false,
          error: mapBannerDbError(error, 'Banner was not updated: record not found or permission denied.'),
        }
      }

      const updatedRow = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data
      if (!parseValidBannerId(updatedRow?.id)) {
        return {
          data: null,
          success: false,
          error: { message: 'Banner was not updated: record not found or permission denied.' },
        }
      }

      return { data: normalizeBannerRow(updatedRow), success: true, error: null }
    } catch (err) {
      console.error('[adminService] Exception updating banner status:', err)
      return {
        data: null,
        success: false,
        error: mapBannerDbError(err, 'Failed to update banner status.'),
      }
    }
  }

  try {
    const stored = getDemoBanners()
    const index = stored.findIndex(item => String(item.id) === String(id))
    if (index < 0) {
      return { data: null, success: false, error: { message: 'Banner not found in demo data.' } }
    }
    const updated = normalizeBannerRow({
      ...stored[index],
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    stored[index] = updated
    const next = sortNormalizedBanners(stored)
    setLocal(ADMIN_BANNERS_STORAGE, next)
    return { data: updated, success: true, error: null }
  } catch (err) {
    return {
      data: null,
      success: false,
      error: { message: err?.message || 'Unable to update demo banner status.' },
    }
  }
}

/** Deletes a banner only when Supabase confirms the deleted row. */
export async function adminDeleteBanner(id, client = supabase, configured = isSupabaseConfigured) {
  if (shouldUseSupabaseClient(client, configured)) {
    const bannerId = parseValidBannerId(id)
    if (!bannerId) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid banner database ID.' },
      }
    }

    try {
      const { data, error } = await client
        .from('banners')
        .delete()
        .eq('id', bannerId)
        .select('id')
        .single()

      if (error) {
        console.error('[adminService] Error deleting banner from Supabase:', error)
        return {
          success: false,
          error: mapBannerDbError(error, 'Banner could not be deleted: record not found or permission denied.'),
        }
      }

      const deletedRow = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data
      if (!parseValidBannerId(deletedRow?.id)) {
        return {
          success: false,
          error: { message: 'Banner could not be deleted: record not found or permission denied.' },
        }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('[adminService] Exception deleting banner from Supabase:', err)
      return {
        success: false,
        error: mapBannerDbError(err, 'Failed to delete banner.'),
      }
    }
  }

  try {
    const stored = getDemoBanners()
    const filtered = stored.filter(item => String(item.id) !== String(id))
    if (filtered.length === stored.length) {
      return { success: false, error: { message: 'Banner not found in demo data.' } }
    }
    setLocal(ADMIN_BANNERS_STORAGE, filtered)
    return { success: true, error: null }
  } catch (err) {
    return {
      success: false,
      error: { message: err?.message || 'Unable to delete demo banner.' },
    }
  }
}
