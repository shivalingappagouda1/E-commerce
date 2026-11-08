import { supabase } from '../lib/supabase'
import {
  SAMPLE_PRODUCTS,
  SAMPLE_CATEGORIES,
} from '../utils/sampleData'

export const ADMIN_PRODUCTS_STORAGE = 'shopkart_admin_products'
export const ADMIN_CATEGORIES_STORAGE = 'shopkart_admin_categories'
export const ADMIN_BANNERS_STORAGE = 'shopkart_admin_banners'
export const ORDERS_STORAGE_KEY = 'shopkart_customer_orders'

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
  const sampleAdminOrders = [
    {
      id: 'ORD-10041',
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      status: 'delivered',
      total_amount: 29990,
      customer_name: 'Rahul Sharma',
      customer_phone: '9876543210',
      address_summary: 'Flat 402, Indiranagar, Bengaluru, Karnataka - 560038',
      items: [{ product_name: 'Sony WH-1000XM5 Wireless Headphones', quantity: 1, unit_price: 29990, total_price: 29990 }],
    },
    {
      id: 'ORD-10040',
      created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
      status: 'processing',
      total_amount: 134900,
      customer_name: 'Priya Mehta',
      customer_phone: '9822011223',
      address_summary: 'B-12, Green Park, New Delhi - 110016',
      items: [{ product_name: 'Apple iPhone 15 Pro — 256 GB', quantity: 1, unit_price: 134900, total_price: 134900 }],
    },
    {
      id: 'ORD-10039',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      status: 'shipped',
      total_amount: 54999,
      customer_name: 'Amit Verma',
      customer_phone: '9711223344',
      address_summary: 'Row House 4, Koregaon Park, Pune - 411001',
      items: [{ product_name: 'Samsung 55" 4K QLED Smart TV', quantity: 1, unit_price: 54999, total_price: 54999 }],
    },
  ]

  const customerOrders = getLocal(ORDERS_STORAGE_KEY, [])
  const merged = [...customerOrders, ...sampleAdminOrders]
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
