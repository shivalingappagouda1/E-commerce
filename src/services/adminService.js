import { supabase } from '../lib/supabase.js'
import {
  SAMPLE_PRODUCTS,
  SAMPLE_CATEGORIES,
} from '../utils/sampleData.js'

export const ADMIN_PRODUCTS_STORAGE = 'shopkart_admin_products'
export const ADMIN_CATEGORIES_STORAGE = 'shopkart_admin_categories'
export const ADMIN_BANNERS_STORAGE = 'shopkart_admin_banners'
export const ORDERS_STORAGE_KEY = 'shopkart_customer_orders'
export const ADMIN_CUSTOMERS_STORAGE = 'shopkart_admin_customers'
export const ADMIN_SETTINGS_STORAGE = 'shopkart_store_settings'

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  } catch (err) {
    console.error(`Error saving ${key}:`, err)
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

    if (!error && data && data.length > 0) {
      return { data, error: null }
    }
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
    const sanitizedCatId = (typeof rawCatId === 'string' && UUID_REGEX.test(rawCatId)) ? rawCatId : null

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

    if (!error && data && data.length > 0) {
      return { data, error: null }
    }
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
   3. ORDERS MANAGEMENT
   ============================================================ */
export async function adminFetchOrders() {
  if (supabase) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        profiles ( full_name, phone ),
        addresses ( full_name, phone, line1, line2, city, state, pincode ),
        order_items ( id, product_id, product_name, unit_price, quantity, total_price )
      `)
      .order('created_at', { ascending: false })

    if (!error && data && data.length > 0) {
      return { data, error: null }
    }
  }

  // Fallback to customer orders or initial sample orders
  const customerOrders = getLocal(ORDERS_STORAGE_KEY, [])
  const merged = [...customerOrders, ...SAMPLE_ADMIN_ORDERS]
  return { data: merged, error: null }
}

export async function adminUpdateOrderStatus(orderId, newStatus) {
  if (supabase) {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
    if (!error) return { success: true }
  }

  const orders = getLocal(ORDERS_STORAGE_KEY, [])
  const updated = orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
  setLocal(ORDERS_STORAGE_KEY, updated)
  return { success: true }
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
        const mapped = profiles.map(p => {
          const ords = Array.isArray(p.orders) ? p.orders : []
          const validOrders = ords.filter(o => o.status !== 'cancelled' && o.status !== 'refunded')
          const totalSpend = validOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
          const latestOrder = [...ords].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

          return {
            id: p.id,
            full_name: p.full_name || 'Customer',
            email: p.email || `${(p.full_name || 'user').toLowerCase().replace(/\s+/g, '.')}@example.com`,
            phone: p.phone || 'N/A',
            avatar_url: p.avatar_url,
            role: p.role || 'customer',
            created_at: p.created_at || new Date().toISOString(),
            order_count: ords.length,
            total_spend: totalSpend,
            last_order_at: latestOrder?.created_at || null,
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
