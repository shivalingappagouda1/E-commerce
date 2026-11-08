/**
 * Products Service
 *
 * When Supabase is configured, this module fetches from the database.
 * When it is not configured, it falls back to sample data.
 * UI components never import sample data directly — they always go through here.
 */
import { supabase } from '../lib/supabase'
import {
  SAMPLE_PRODUCTS,
  SAMPLE_FEATURED_PRODUCTS,
  SAMPLE_BESTSELLERS,
  SAMPLE_TRENDING,
  SAMPLE_DEALS,
  SAMPLE_CATEGORIES,
  SAMPLE_BANNERS,
} from '../utils/sampleData'

/* ---- helpers ---- */
const isMock = () => !supabase

/* ============================================================
   CATEGORIES
   ============================================================ */
export async function fetchCategories() {
  if (isMock()) return { data: SAMPLE_CATEGORIES, error: null }

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
  if (isMock()) return { data: SAMPLE_BANNERS, error: null }

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
  if (isMock()) return { data: SAMPLE_PRODUCTS, error: null }

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
  return { data, error }
}

export async function fetchFeaturedProducts() {
  if (isMock()) return { data: SAMPLE_FEATURED_PRODUCTS, error: null }
  return fetchProducts({ featured: true, limit: 8 })
}

export async function fetchBestSellers() {
  if (isMock()) return { data: SAMPLE_BESTSELLERS, error: null }

  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(image_url, is_primary)')
    .eq('is_active', true)
    .gte('rating', 4.5)
    .order('review_count', { ascending: false })
    .limit(8)

  return { data, error }
}

export async function fetchTrendingProducts() {
  if (isMock()) return { data: SAMPLE_TRENDING, error: null }

  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(image_url, is_primary)')
    .eq('is_active', true)
    .in('badge', ['Trending', 'Hot', 'Top Deal'])
    .limit(8)

  return { data, error }
}

export async function fetchDeals() {
  if (isMock()) return { data: SAMPLE_DEALS, error: null }

  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(image_url, is_primary)')
    .eq('is_active', true)
    .gte('discount_percent', 30)
    .order('discount_percent', { ascending: false })
    .limit(6)

  return { data, error }
}

export async function fetchProductBySlug(slug) {
  if (isMock()) {
    const product = SAMPLE_PRODUCTS.find(p => p.slug === slug) || null
    return { data: product, error: null }
  }

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

  return { data, error }
}
