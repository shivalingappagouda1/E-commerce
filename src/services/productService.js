/**
 * Products Service
 *
 * When Supabase is configured, this module fetches strictly from the database.
 * It NEVER silently substitutes sample/demo products when the database returns
 * an empty result or an error.
 *
 * When Supabase is not configured, it falls back to explicit demo data in localStorage
 * (seeded from sampleData).
 * UI components never import sample data directly — they always go through here.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  SAMPLE_PRODUCTS,
  SAMPLE_CATEGORIES,
  SAMPLE_BANNERS,
} from '../utils/sampleData'
import { isValidUUID } from './cartService'

/* ---- Unified Demo Storage Keys ---- */
export const PRODUCTS_STORAGE_KEY = 'shopkart_admin_products'
export const CATEGORIES_STORAGE_KEY = 'shopkart_admin_categories'
export const BANNERS_STORAGE_KEY = 'shopkart_admin_banners'
export const REVIEWS_STORAGE = 'shopkart_admin_reviews'
export const COUPONS_STORAGE_KEY = 'shopkart_admin_coupons'

export const DEFAULT_COUPONS = [
  { code: 'SHOPKART10', type: 'percent', discount_type: 'percent', value: 10, discount_value: 10, min_order_value: 999 },
  { code: 'WELCOME500', type: 'fixed', discount_type: 'fixed', value: 500, discount_value: 500, min_order_value: 4999 },
]

/* ---- helpers ---- */
const isMock = () => !isSupabaseConfigured || !supabase

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
      return parsed
    }
    console.warn(`[productService] Invalid format in ${PRODUCTS_STORAGE_KEY}, expected array.`)
    return []
  } catch (err) {
    console.error(`[productService] Error parsing ${PRODUCTS_STORAGE_KEY}:`, err)
    return []
  }
}

/**
 * Normalizes a database product record into the standard format expected
 * by UI components, mapping joined image, category, and inventory relations.
 */
export function normalizeDatabaseProduct(p) {
  if (!p) return null

  // Resolve primary image from product_images or fallback
  const primaryImg = Array.isArray(p.product_images) && p.product_images.length > 0
    ? (p.product_images.find(img => img.is_primary)?.image_url || p.product_images[0]?.image_url)
    : null
  const image = p.image || primaryImg || 'https://placehold.co/400x400?text=ShopKart'

  // Resolve stock quantity from inventory relation
  const stock = Array.isArray(p.inventory) && p.inventory.length > 0 && p.inventory[0]?.quantity !== undefined
    ? Number(p.inventory[0].quantity)
    : (p.stock !== undefined ? Number(p.stock) : 99)

  // Resolve category name from joined categories relation
  const categoryName = p.category || (p.categories && !Array.isArray(p.categories) ? p.categories.name : (Array.isArray(p.categories) && p.categories[0]?.name ? p.categories[0].name : ''))

  const price = Number(p.price)
  const originalPrice = p.original_price ? Number(p.original_price) : (p.originalPrice ? Number(p.originalPrice) : price)
  const discountPercent = p.discount_percent !== undefined && p.discount_percent !== null
    ? Number(p.discount_percent)
    : (p.discount !== undefined ? Number(p.discount) : (originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0))

  return {
    ...p,
    image,
    category: categoryName,
    price,
    originalPrice,
    original_price: originalPrice,
    discount_percent: discountPercent,
    discount: discountPercent,
    stock,
    inStock: p.inStock !== false && p.is_active !== false && stock > 0,
    rating: Number(p.rating || 0),
    reviewCount: Number(p.review_count || p.reviewCount || 0),
    review_count: Number(p.review_count || p.reviewCount || 0),
  }
}

/**
 * Checks whether a product is available for customer browsing and purchase.
 * Consistently excludes inactive products and products explicitly marked out of stock.
 */
function isProductAvailableForCustomer(product) {
  if (!product) return false
  if (product.is_active === false) return false
  if (product.inStock === false) return false
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
  if (!isMock()) {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, image_url')
        .eq('is_active', true)
        .order('sort_order')

      if (error) {
        console.error('[productService] Error fetching categories from Supabase:', error)
        return { data: [], error }
      }
      return { data: data || [], error: null }
    } catch (err) {
      console.error('[productService] Exception fetching categories from Supabase:', err)
      return { data: [], error: err }
    }
  }

  // Explicit demo mode only
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

/* ============================================================
   BANNERS
   ============================================================ */
export async function fetchBanners() {
  if (!isMock()) {
    try {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (error) {
        console.error('[productService] Error fetching banners from Supabase:', error)
        return { data: [], error }
      }
      return { data: data || [], error: null }
    } catch (err) {
      console.error('[productService] Exception fetching banners from Supabase:', err)
      return { data: [], error: err }
    }
  }

  // Explicit demo mode only
  try {
    const stored = localStorage.getItem(BANNERS_STORAGE_KEY)
    if (stored === null) {
      try {
        localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify(SAMPLE_BANNERS))
      } catch {
        // Ignore storage quota / write errors in restricted environments
      }
      return { data: [...SAMPLE_BANNERS], error: null }
    }
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) {
      const activeBanners = parsed
        .filter(b => b && b.is_active !== false)
        .sort((a, b) => Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0))
      return { data: activeBanners, error: null }
    }
    return { data: [], error: null }
  } catch { /* fallback */ }
  return { data: [...SAMPLE_BANNERS], error: null }
}

/* ============================================================
   PRODUCTS
   ============================================================ */
export async function fetchProducts(filters = {}) {
  if (!isMock()) {
    try {
      let query = supabase
        .from('products')
        .select(`
          id, name, slug, price, original_price, discount_percent,
          rating, review_count, badge, is_featured, is_active,
          categories ( id, name, slug ),
          product_images ( id, image_url, is_primary ),
          inventory ( quantity )
        `)
        .eq('is_active', true)

      if (filters.category) {
        if (isValidUUID(filters.category)) {
          query = query.eq('category_id', filters.category)
        }
      }
      if (filters.featured) query = query.eq('is_featured', true)
      if (filters.limit) query = query.limit(filters.limit)

      const { data, error } = await query
      if (error) {
        console.error('[productService] Error fetching products from Supabase:', error)
        return { data: [], error }
      }

      let normalized = (data || []).map(normalizeDatabaseProduct).filter(isProductAvailableForCustomer)

      // If category filter was a slug/name rather than UUID, filter in-memory
      if (filters.category && !isValidUUID(filters.category)) {
        const catVal = String(filters.category).toLowerCase()
        normalized = normalized.filter(p =>
          (p.category && p.category.toLowerCase() === catVal) ||
          (p.categories?.slug && p.categories.slug.toLowerCase() === catVal)
        )
      }

      return { data: normalized, error: null }
    } catch (err) {
      console.error('[productService] Exception fetching products from Supabase:', err)
      return { data: [], error: err }
    }
  }

  // Explicit demo mode only when Supabase is not configured
  const products = getLocalDemoProducts()
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

export async function fetchFeaturedProducts(limit = null) {
  return fetchProducts({ featured: true, limit: limit || undefined })
}

export async function fetchBestSellers(limit = null) {
  if (!isMock()) {
    try {
      let query = supabase
        .from('products')
        .select(`
          id, name, slug, price, original_price, discount_percent,
          rating, review_count, badge, is_featured, is_active,
          categories ( id, name, slug ),
          product_images ( id, image_url, is_primary ),
          inventory ( quantity )
        `)
        .eq('is_active', true)
        .gte('rating', 4.5)
        .order('review_count', { ascending: false })

      if (limit) query = query.limit(limit)

      const { data, error } = await query
      if (error) {
        console.error('[productService] Error fetching best sellers from Supabase:', error)
        return { data: [], error }
      }

      const normalized = (data || []).map(normalizeDatabaseProduct).filter(isProductAvailableForCustomer)
      return { data: normalized, error: null }
    } catch (err) {
      console.error('[productService] Exception fetching best sellers from Supabase:', err)
      return { data: [], error: err }
    }
  }

  // Explicit demo mode only
  const { data } = await fetchProducts()
  const sorted = (data || [])
    .filter(p => (p.rating || 0) >= 4.5)
    .sort((a, b) => (b.review_count || b.reviewCount || 0) - (a.review_count || a.reviewCount || 0))
  return { data: limit ? sorted.slice(0, limit) : sorted, error: null }
}

export async function fetchTrendingProducts(limit = null) {
  if (!isMock()) {
    try {
      let query = supabase
        .from('products')
        .select(`
          id, name, slug, price, original_price, discount_percent,
          rating, review_count, badge, is_featured, is_active,
          categories ( id, name, slug ),
          product_images ( id, image_url, is_primary ),
          inventory ( quantity )
        `)
        .eq('is_active', true)
        .in('badge', ['Trending', 'Hot', 'Top Deal'])

      if (limit) query = query.limit(limit)

      const { data, error } = await query
      if (error) {
        console.error('[productService] Error fetching trending products from Supabase:', error)
        return { data: [], error }
      }

      const normalized = (data || []).map(normalizeDatabaseProduct).filter(isProductAvailableForCustomer)
      return { data: normalized, error: null }
    } catch (err) {
      console.error('[productService] Exception fetching trending products from Supabase:', err)
      return { data: [], error: err }
    }
  }

  // Explicit demo mode only
  const { data } = await fetchProducts()
  const sorted = (data || [])
    .filter(p => ['Trending', 'Hot', 'Top Deal'].includes(p.badge))
  return { data: limit ? sorted.slice(0, limit) : sorted, error: null }
}

export async function fetchDeals(limit = null) {
  if (!isMock()) {
    try {
      let query = supabase
        .from('products')
        .select(`
          id, name, slug, price, original_price, discount_percent,
          rating, review_count, badge, is_featured, is_active,
          categories ( id, name, slug ),
          product_images ( id, image_url, is_primary ),
          inventory ( quantity )
        `)
        .eq('is_active', true)
        .gte('discount_percent', 30)
        .order('discount_percent', { ascending: false })

      if (limit) query = query.limit(limit)

      const { data, error } = await query
      if (error) {
        console.error('[productService] Error fetching deals from Supabase:', error)
        return { data: [], error }
      }

      const normalized = (data || []).map(normalizeDatabaseProduct).filter(isProductAvailableForCustomer)
      return { data: normalized, error: null }
    } catch (err) {
      console.error('[productService] Exception fetching deals from Supabase:', err)
      return { data: [], error: err }
    }
  }

  // Explicit demo mode only
  const { data } = await fetchProducts()
  const sorted = (data || [])
    .filter(p => (p.discount_percent || p.discount || 0) >= 30)
    .sort((a, b) => (b.discount_percent || b.discount || 0) - (a.discount_percent || a.discount || 0))
  return { data: limit ? sorted.slice(0, limit) : sorted, error: null }
}

export async function fetchProductBySlug(slug) {
  if (!slug) return { data: null, error: null }

  if (!isMock()) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories ( id, name, slug ),
          product_images ( id, image_url, is_primary, sort_order ),
          product_variants ( id, variant_type, variant_value, price_delta ),
          inventory ( id, quantity, low_stock_at ),
          reviews ( *, profiles ( full_name, avatar_url ) )
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        console.error('[productService] Error fetching product by slug from Supabase:', error)
        return { data: null, error }
      }

      if (!data) {
        return { data: null, error: null }
      }

      return { data: normalizeDatabaseProduct(data), error: null }
    } catch (err) {
      console.error('[productService] Exception fetching product by slug from Supabase:', err)
      return { data: null, error: err }
    }
  }

  // Explicit demo mode only
  const products = getLocalDemoProducts()
  const product = products.find(p => p.slug === slug) || null
  return { data: product, error: null }
}

/* ============================================================
   REVIEWS
   ============================================================ */
export async function fetchProductReviews(productIdentifier) {
  if (!isMock()) {
    // In Supabase mode, strictly require a valid product UUID.
    // If missing or invalid, immediately return an empty result without querying the database.
    // Never execute an unfiltered reviews query against Supabase.
    if (!productIdentifier || !isValidUUID(productIdentifier)) {
      return { data: [], error: null }
    }

    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*, profiles(full_name, avatar_url)')
        .eq('product_id', productIdentifier)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[productService] Error fetching reviews from Supabase:', error)
        return { data: [], error }
      }

      return { data: data || [], error: null }
    } catch (err) {
      console.error('[productService] Exception fetching reviews from Supabase:', err)
      return { data: [], error: err }
    }
  }

  // Explicit demo mode only
  try {
    const stored = localStorage.getItem(REVIEWS_STORAGE)
    const reviews = stored ? JSON.parse(stored) : []
    const matching = reviews.filter(r => {
      if (r.is_approved === false) return false
      if (!productIdentifier) return true
      if (isValidUUID(productIdentifier)) {
        return r.product_id === productIdentifier
      }
      return (
        (r.product_name && r.product_name.toLowerCase().includes(String(productIdentifier).toLowerCase())) ||
        (r.product_id && r.product_id === productIdentifier)
      )
    })
    return { data: matching, error: null }
  } catch {
    return { data: [], error: null }
  }
}

export async function submitProductReview({ productName, userName, rating, title, body, productId }) {
  if (!isMock()) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return { data: null, error: new Error('You must be signed in to submit a review.') }
      }
      if (!productId || !isValidUUID(productId)) {
        return { data: null, error: new Error('A valid database product ID is required to submit a review.') }
      }

      const { data, error } = await supabase
        .from('reviews')
        .insert([{
          product_id: productId,
          user_id: user.id,
          rating: Number(rating) || 5,
          title,
          body,
          is_approved: false,
        }])
        .select()
        .single()

      if (error) {
        console.error('[productService] Error submitting review to Supabase:', error)
        return { data: null, error }
      }
      return { data, error: null }
    } catch (err) {
      console.error('[productService] Exception submitting review to Supabase:', err)
      return { data: null, error: err }
    }
  }

  // Explicit demo mode only
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

  return { data: newReview, error: null }
}

/* ============================================================
   COUPONS VALIDATION
   ============================================================ */
export async function validateCoupon(code, orderTotal = 0) {
  const cleanCode = code ? String(code).trim().toUpperCase() : ''
  if (!cleanCode) {
    return { valid: false, error: 'Please enter a coupon code.' }
  }

  // 1. Live Supabase database coupons
  if (!isMock()) {
    try {
      const { data: coupon, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', cleanCode)
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        console.error('[productService] Error validating coupon with Supabase:', error)
        return { valid: false, error: 'Could not validate coupon. Please try again.' }
      }

      if (!coupon) {
        return { valid: false, error: 'Invalid coupon code.' }
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return { valid: false, error: 'This coupon has expired.' }
      }
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
        return { valid: false, error: 'This coupon has reached its maximum usage limit.' }
      }
      if (coupon.min_order_value && orderTotal < Number(coupon.min_order_value)) {
        return {
          valid: false,
          error: `Coupon ${cleanCode} requires a minimum order value of ₹${coupon.min_order_value}.`,
        }
      }

      return {
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type: coupon.discount_type,
          value: Number(coupon.discount_value),
          min_order_value: Number(coupon.min_order_value || 0),
        },
      }
    } catch (err) {
      console.error('[productService] Exception validating coupon with Supabase:', err)
      return { valid: false, error: 'Could not validate coupon due to a server error.' }
    }
  }

  // 2. Explicit demo mode only: Fallback to Admin Coupons Storage or Default Coupons
  let availableCoupons = [...DEFAULT_COUPONS]
  try {
    const stored = localStorage.getItem(COUPONS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        availableCoupons = parsed
      }
    }
  } catch {
    // ignore
  }

  const matched = availableCoupons.find(
    c => c.code && c.code.toUpperCase() === cleanCode && c.is_active !== false
  )

  if (!matched) {
    return { valid: false, error: 'Invalid coupon code. Try SHOPKART10 or WELCOME500.' }
  }

  const minOrder = Number(matched.min_order_value || matched.minOrderValue || 0)
  if (minOrder > 0 && orderTotal < minOrder) {
    return {
      valid: false,
      error: `Coupon ${cleanCode} requires a minimum order value of ₹${minOrder}.`,
    }
  }

  const discountType = matched.discount_type || matched.type || 'percent'
  const discountVal = Number(matched.discount_value !== undefined ? matched.discount_value : matched.value)

  return {
    valid: true,
    coupon: {
      id: matched.id || cleanCode,
      code: matched.code.toUpperCase(),
      type: discountType,
      value: discountVal,
      min_order_value: minOrder,
    },
  }
}
