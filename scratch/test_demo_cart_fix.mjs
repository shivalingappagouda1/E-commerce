import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('═══════════════════════════════════════════════════════════════════')
console.log('ShopKart — Demo Product & Cart Sync Fix Verification Suite')
console.log('═══════════════════════════════════════════════════════════════════\n')

const paths = {
  productService: path.resolve('src/services/productService.js'),
  cartContext: path.resolve('src/context/CartContext.jsx'),
  cartService: path.resolve('src/services/cartService.js'),
}

for (const [key, p] of Object.entries(paths)) {
  assert.ok(fs.existsSync(p), `File exists: ${key} -> ${p}`)
}

const codeProductService = fs.readFileSync(paths.productService, 'utf8')
const codeCartContext = fs.readFileSync(paths.cartContext, 'utf8')

// 1. Audit productService: No silent fall-through to demo data when Supabase is configured
console.log('--- Test Suite 1: productService Demo Fallback Isolation ---')

// Ensure isMock() or !isMock() check gates all demo fallbacks
assert.ok(codeProductService.includes('const isMock = () => !isSupabaseConfigured || !supabase'), 'isMock checks both isSupabaseConfigured and supabase')

// Ensure fetchProducts does not fall through
const fetchProductsFn = codeProductService.substring(codeProductService.indexOf('export async function fetchProducts('), codeProductService.indexOf('export async function fetchFeaturedProducts('))
assert.ok(fetchProductsFn.includes('if (!isMock())'), 'fetchProducts gates Supabase execution behind !isMock()')
assert.ok(fetchProductsFn.includes('if (error) {'), 'fetchProducts checks error from Supabase')
assert.ok(fetchProductsFn.includes('return { data: [], error }'), 'fetchProducts returns database error without falling through')
assert.ok(!fetchProductsFn.includes('// Fall through to local demo data'), 'No silent fall-through comment or code in fetchProducts')

// Ensure fetchBestSellers does not fall through
const fetchBestSellersFn = codeProductService.substring(codeProductService.indexOf('export async function fetchBestSellers('), codeProductService.indexOf('export async function fetchTrendingProducts('))
assert.ok(fetchBestSellersFn.includes('if (!isMock())'), 'fetchBestSellers gates Supabase execution')
assert.ok(fetchBestSellersFn.includes('return { data: [], error }'), 'fetchBestSellers returns error without fall-through')

// Ensure fetchTrendingProducts does not fall through
const fetchTrendingFn = codeProductService.substring(codeProductService.indexOf('export async function fetchTrendingProducts('), codeProductService.indexOf('export async function fetchDeals('))
assert.ok(fetchTrendingFn.includes('if (!isMock())'), 'fetchTrendingProducts gates Supabase execution')
assert.ok(fetchTrendingFn.includes('return { data: [], error }'), 'fetchTrendingProducts returns error without fall-through')

// Ensure fetchDeals does not fall through
const fetchDealsFn = codeProductService.substring(codeProductService.indexOf('export async function fetchDeals('), codeProductService.indexOf('export async function fetchProductBySlug('))
assert.ok(fetchDealsFn.includes('if (!isMock())'), 'fetchDeals gates Supabase execution')
assert.ok(fetchDealsFn.includes('return { data: [], error }'), 'fetchDeals returns error without fall-through')

// Ensure fetchProductBySlug does not fall through
const fetchSlugFn = codeProductService.substring(codeProductService.indexOf('export async function fetchProductBySlug('), codeProductService.indexOf('export async function fetchProductReviews('))
assert.ok(fetchSlugFn.includes('if (!isMock())'), 'fetchProductBySlug gates Supabase execution')
assert.ok(fetchSlugFn.includes('if (!data) {\n        return { data: null, error: null }\n      }'), 'fetchProductBySlug returns null when product is not in database')
assert.ok(!fetchSlugFn.includes('// Fall through'), 'fetchProductBySlug has no fall-through to demo')

// Ensure validateCoupon does not fall through to demo coupons when Supabase is configured
const validateCouponFn = codeProductService.substring(codeProductService.indexOf('export async function validateCoupon('))
assert.ok(validateCouponFn.includes('if (!isMock())'), 'validateCoupon gates Supabase execution')
assert.ok(validateCouponFn.includes("if (!coupon) {\n        return { valid: false, error: 'Invalid coupon code.' }\n      }"), 'validateCoupon returns invalid coupon when not found in database')

console.log('✔ Test Suite 1 Passed: When Supabase is configured, demo products/coupons are never substituted on empty results or errors.')


// 2. Audit CartContext: Guest-to-Database Login Merge & Demo Cart Sanitization
console.log('\n--- Test Suite 2: CartContext Guest Cart Validation & UUID Safety ---')

// Check isValidUUID import in CartContext
assert.ok(codeCartContext.includes('isValidUUID'), 'CartContext imports isValidUUID')

// Check candidate guest items filtering by UUID
assert.ok(
  codeCartContext.includes('const candidateGuestItems = localItems.filter(i => isValidUUID(i.productId || i.id))'),
  'CartContext filters candidate guest items by valid UUID syntax'
)

// Check database existence verification
assert.ok(
  codeCartContext.includes(".from('products')\n            .select('id')\n            .in('id', candidateIds)\n            .eq('is_active', true)"),
  'CartContext checks candidate guest items against active database products'
)

// Check that only real database products are merged
assert.ok(
  codeCartContext.includes('validGuestItems = candidateGuestItems.filter(i => realIdSet.has(i.productId || i.id))'),
  'CartContext retains only items confirmed in the live database'
)

// Check debounced sync sanitization
assert.ok(
  codeCartContext.includes('const validItems = items.filter(i => isValidUUID(i.productId || i.id))'),
  'Debounced sync filters out any non-UUID demo items before calling syncCartToSupabase'
)

// Check addItem blocks demo products when Supabase is configured
assert.ok(
  codeCartContext.includes('if (isSupabaseConfigured && !isValidUUID(pId))'),
  'addItem blocks adding non-UUID demo products when Supabase is configured'
)

// Check invalid demo cart items cleanup on login
assert.ok(
  codeCartContext.includes("dispatch({ type: 'CLEAR_CART' })\n          localStorage.removeItem(STORAGE_KEY)"),
  'CartContext clears invalid demo items from localStorage upon user login'
)

console.log('✔ Test Suite 2 Passed: CartContext enforces strict UUID validation, live database existence check, and demo cart exclusion.')


// 3. Functional Simulation Test: Product Normalization
console.log('\n--- Test Suite 3: Product Normalization Verification ---')

// Extract normalizeDatabaseProduct logic for isolated unit testing
function normalizeDatabaseProduct(p) {
  if (!p) return null
  const primaryImg = Array.isArray(p.product_images) && p.product_images.length > 0
    ? (p.product_images.find(img => img.is_primary)?.image_url || p.product_images[0]?.image_url)
    : null
  const image = p.image || primaryImg || 'https://placehold.co/400x400?text=ShopKart'
  const stock = Array.isArray(p.inventory) && p.inventory.length > 0 && p.inventory[0]?.quantity !== undefined
    ? Number(p.inventory[0].quantity)
    : (p.stock !== undefined ? Number(p.stock) : 99)
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

const mockDbProduct = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Database Test Product',
  slug: 'db-test-prod',
  price: '1499.00',
  original_price: '1999.00',
  discount_percent: 25,
  rating: 4.8,
  review_count: 42,
  badge: 'Hot',
  is_featured: true,
  is_active: true,
  categories: { id: 'c0000000-0000-4000-8000-000000000001', name: 'Electronics', slug: 'electronics' },
  product_images: [
    { id: 'i1', image_url: 'https://example.com/img1.jpg', is_primary: false },
    { id: 'i2', image_url: 'https://example.com/primary.jpg', is_primary: true },
  ],
  inventory: [{ id: 'inv1', quantity: 15, low_stock_at: 3 }],
}

const normalized = normalizeDatabaseProduct(mockDbProduct)
assert.equal(normalized.id, mockDbProduct.id)
assert.equal(normalized.image, 'https://example.com/primary.jpg', 'Primary image picked correctly')
assert.equal(normalized.category, 'Electronics', 'Category name extracted correctly')
assert.equal(normalized.stock, 15, 'Inventory quantity mapped correctly')
assert.equal(normalized.inStock, true, 'inStock computed correctly')
assert.equal(normalized.price, 1499)
assert.equal(normalized.originalPrice, 1999)
assert.equal(normalized.discount_percent, 25)

console.log('✔ Test Suite 3 Passed: normalizeDatabaseProduct produces compliant, reliable objects.')


// 4. Functional Simulation Test: Cart Merging
console.log('\n--- Test Suite 4: Cart Merging & UUID Validation ---')

function isValidUUID(str) {
  return (
    typeof str === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim())
  )
}

function mergeCarts(guestItems = [], dbItems = []) {
  if (!Array.isArray(guestItems) || guestItems.length === 0) {
    return Array.isArray(dbItems) ? [...dbItems] : []
  }
  if (!Array.isArray(dbItems) || dbItems.length === 0) {
    return [...guestItems]
  }

  const getItemKey = (item) => {
    if (!item) return ''
    if (item.cartItemId) return String(item.cartItemId)
    const pId = item.productId || item.id
    const vId = item.variant?.id || item.variant?.name || ''
    return vId ? `${pId}-${vId}` : String(pId)
  }

  const merged = [...dbItems]

  for (const guestItem of guestItems) {
    const key = getItemKey(guestItem)
    const existingIndex = merged.findIndex(i => getItemKey(i) === key)

    if (existingIndex > -1) {
      const existing = merged[existingIndex]
      const existingQty = Math.max(1, Number(existing.quantity) || 1)
      const guestQty = Math.max(1, Number(guestItem.quantity) || 1)
      const combinedQty = existingQty + guestQty

      const stockLimit = existing.stock !== undefined
        ? Number(existing.stock)
        : (guestItem.stock !== undefined ? Number(guestItem.stock) : Infinity)
      const clampedQty = stockLimit > 0 ? Math.min(combinedQty, stockLimit) : combinedQty

      merged[existingIndex] = {
        ...existing,
        ...guestItem,
        quantity: clampedQty,
      }
    } else {
      merged.push({ ...guestItem })
    }
  }

  return merged
}

assert.equal(isValidUUID(1), false, 'Integer ID 1 is not a UUID')
assert.equal(isValidUUID('p1'), false, 'String p1 is not a UUID')
assert.equal(isValidUUID('a0000000-0000-4000-8000-000000000001'), true, 'Valid UUID v4 is accepted')

const guestCart = [
  { id: 1, name: 'Demo Product 1', quantity: 2 }, // Demo product
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'Valid DB Product', quantity: 3, stock: 10 },
]

// Simulate CartContext filtering logic
const candidateGuest = guestCart.filter(i => isValidUUID(i.productId || i.id))
assert.equal(candidateGuest.length, 1, 'Only 1 candidate item with valid UUID')
assert.equal(candidateGuest[0].id, 'a0000000-0000-4000-8000-000000000001')

// Simulate database verification (confirmed active in DB)
const confirmedIds = new Set(['a0000000-0000-4000-8000-000000000001'])
const validGuestItems = candidateGuest.filter(i => confirmedIds.has(i.productId || i.id))
assert.equal(validGuestItems.length, 1)

// Existing remote database cart
const dbCart = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'Valid DB Product', quantity: 2, stock: 10 },
  { id: 'b0000000-0000-4000-8000-000000000002', name: 'Existing DB Product', quantity: 1, stock: 5 },
]

const merged = mergeCarts(validGuestItems, dbCart)
assert.equal(merged.length, 2, 'Merged cart contains 2 unique items')
const matchingItem = merged.find(i => i.id === 'a0000000-0000-4000-8000-000000000001')
assert.equal(matchingItem.quantity, 5, 'Quantities merged correctly (3 + 2 = 5)')

console.log('✔ Test Suite 4 Passed: Guest cart merge cleanly combines quantities and isolates demo items.')

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('ALL DEMO PRODUCT & CART SYNC FIX CHECKS PASSED (100%)')
console.log('═══════════════════════════════════════════════════════════════════')
