/**
 * Products Service
 *
 * When Supabase is configured, this module fetches from the database.
 * When it is not configured, it falls back to demo data in localStorage (seeded from sampleData).
 * UI components never import sample data directly — they always go through here.
 */
import { supabase } from '../lib/supabase'
import {
  SAMPLE_PRODUCTS,
  SAMPLE_CATEGORIES,
  SAMPLE_BANNERS,
} from '../utils/sampleData'

/* ---- Unified Demo Storage Keys ---- */
export const PRODUCTS_STORAGE_KEY = 'shopkart_admin_products'
export const CATEGORIES_STORAGE_KEY = 'shopkart_admin_categories'
export const BANNERS_STORAGE_KEY = 'shopkart_admin_banners'

/* ---- helpers ---- */
const isMock = () => !supabase

function getLocalDemoProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY)
    if (raw === null) {
      // Seed initial sample products only when the storage key does not exist
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(SAMPLE_PRODUCTS))
      return [...SAMPLE_PRODUCTS]
    }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      // Return parsed array as-is (including empty array [] when all products are deleted)
      return parsed
    }
    console.warn(`[productService] Invalid format in ${PRODUCTS_STORAGE_KEY}, expected array.`)
    return []
  } catch (err) {
    // If JSON parsing fails, safely return empty array without overwriting user data
    console.error(`[productService] Error parsing ${PRODUCTS_STORAGE_KEY}:`, err)
    return []
  }
}

/**
 * Checks whether a product is available for customer browsing and purchase.
 * Consistently excludes inactive products and products explicitly marked out of stock.
 */
function isProductAvailableForCustomer(product) {
  if (!product) return false
  // Exclude inactive products
  if (product.is_active === false) return false
  // Exclude products explicitly marked out of stock
  if (product.inStock === false) return false
  // Exclude products with zero or negative stock quantity
  if (product.stock !== undefined && product.stock !== null && Number(product.stock) <= 0) return false
  if (Array.isArray(product.inventory) && product.inventory.length > 0) {
    const qty = product.inventory[0]?.quantity
    if (qty !== undefined && qty !== null && Number(qty) <= 0) return false
  }
  return true
}

/* ============================================================
   CATEGORIES
   ============================================================ */
export async function fetchCategories() {
  if (isMock()) {
    try {
      const stored = localStorage.getItem(CATEGORIES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { data: parsed.filter(c => c.is_active !== false), error: null }
        }
      }
    } catch { /* fallback */ }
    return { data: SAMPLE_CATEGORIES, error: null }
  }

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, image_url')
    .eq('is_active', true)
    .order('sort_order')

  return { data, error }
}

/* ============================================================
   BANNERS
   ============================================================ */
export async function fetchBanners() {
  if (isMock()) {
    try {
      const stored = localStorage.getItem(BANNERS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { data: parsed.filter(b => b.is_active !== false), error: null }
        }
      }
    } catch { /* fallback */ }
    return { data: SAMPLE_BANNERS, error: null }
  }

  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  return { data, error }
}

/* ============================================================
   PRODUCTS
   ============================================================ */
export async function fetchProducts(filters = {}) {
  if (supabase) {
    try {
      let query = supabase
        .from('products')
        .select(`
          id, name, slug, price, original_price, discount_percent,
          rating, review_count, badge, is_featured,
          categories ( name ),
          product_images ( image_url, is_primary ),
          inventory ( quantity )
        `)
        .eq('is_active', true)

      if (filters.category) query = query.eq('category_id', filters.category)
      if (filters.featured)  query = query.eq('is_featured', true)
      if (filters.limit)     query = query.limit(filters.limit)

      const { data, error } = await query
      if (!error && data && data.length > 0) {
        return { data, error: null }
      }
    } catch {
      // Fall through to local demo data
    }
  }

  const products = getLocalDemoProducts()
  // Customer storefront only displays active and in-stock products
  let result = products.filter(isProductAvailableForCustomer)

  if (filters.category) {
    const catVal = String(filters.category).toLowerCase()
    result = result.filter(p =>
      String(p.category_id).toLowerCase() === catVal ||
      (p.category && p.category.toLowerCase() === catVal) ||
      (p.categories?.name && p.categories.name.toLowerCase() === catVal)
    )
  }
  if (filters.featured) {
    result = result.filter(p => Boolean(p.is_featured || p.featured))
  }
  if (filters.limit) {
    result = result.slice(0, filters.limit)
  }
  return { data: result, error: null }
}

export async function fetchFeaturedProducts() {
  return fetchProducts({ featured: true, limit: 8 })
}

export async function fetchBestSellers() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(image_url, is_primary)')
        .eq('is_active', true)
        .gte('rating', 4.5)
        .order('review_count', { ascending: false })
        .limit(8)

      if (!error && data && data.length > 0) {
        return { data, error: null }
      }
    } catch {
      // Fall through
    }
  }

  const { data } = await fetchProducts()
  const sorted = (data || [])
    .filter(p => (p.rating || 0) >= 4.5)
    .sort((a, b) => (b.review_count || b.reviewCount || 0) - (a.review_count || a.reviewCount || 0))
    .slice(0, 8)
  return { data: sorted, error: null }
}

export async function fetchTrendingProducts() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(image_url, is_primary)')
        .eq('is_active', true)
        .in('badge', ['Trending', 'Hot', 'Top Deal'])
        .limit(8)

      if (!error && data && data.length > 0) {
        return { data, error: null }
      }
    } catch {
      // Fall through
    }
  }

  const { data } = await fetchProducts()
  const sorted = (data || [])
    .filter(p => ['Trending', 'Hot', 'Top Deal'].includes(p.badge))
    .slice(0, 8)
  return { data: sorted, error: null }
}

export async function fetchDeals() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(image_url, is_primary)')
        .eq('is_active', true)
        .gte('discount_percent', 30)
        .order('discount_percent', { ascending: false })
        .limit(6)

      if (!error && data && data.length > 0) {
        return { data, error: null }
      }
    } catch {
      // Fall through
    }
  }

  const { data } = await fetchProducts()
  const sorted = (data || [])
    .filter(p => (p.discount_percent || p.discount || 0) >= 30)
    .sort((a, b) => (b.discount_percent || b.discount || 0) - (a.discount_percent || a.discount || 0))
    .slice(0, 6)
  return { data: sorted, error: null }
}

export async function fetchProductBySlug(slug) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *, categories(name, slug),
          product_images(*),
          product_variants(*),
          inventory(*),
          reviews(*, profiles(full_name, avatar_url))
        `)
        .eq('slug', slug)
        .single()

      if (!error && data) {
        return { data, error: null }
      }
    } catch {
      // Fall through
    }
  }

  const products = getLocalDemoProducts()
  const product = products.find(p => p.slug === slug) || null
  return { data: product, error: null }
}

/* ============================================================
   REVIEWS
   ============================================================ */
export const REVIEWS_STORAGE = 'shopkart_admin_reviews'

export async function fetchProductReviews(productName) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*, profiles(full_name, avatar_url)')
        .eq('is_approved', true)
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        return { data, error: null }
      }
    } catch {
      // Fall through to local reviews
    }
  }

  try {
    const stored = localStorage.getItem(REVIEWS_STORAGE)
    const reviews = stored ? JSON.parse(stored) : []
    const matching = reviews.filter(r =>
      (!productName || (r.product_name && r.product_name.toLowerCase().includes(productName.toLowerCase()))) &&
      r.is_approved !== false
    )
    return { data: matching, error: null }
  } catch {
    return { data: [], error: null }
  }
}

export async function submitProductReview({ productName, userName, rating, title, body, productId }) {
  const newReview = {
    id: `rev-${Date.now()}`,
    product_id: productId,
    product_name: productName,
    user_name: userName || 'Customer',
    rating: Number(rating) || 5,
    title,
    body,
    is_approved: true,
    created_at: new Date().toISOString(),
  }

  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE)
    const list = raw ? JSON.parse(raw) : []
    list.unshift(newReview)
    localStorage.setItem(REVIEWS_STORAGE, JSON.stringify(list))
  } catch (err) {
    console.error('Error saving review to local storage:', err)
  }

  if (!isMock()) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && productId) {
      await supabase.from('reviews').insert([{
        product_id: productId,
        user_id: user.id,
        rating: Number(rating) || 5,
        title,
        body,
        is_approved: false,
      }])
    }
  }

  return { data: newReview, error: null }
}
