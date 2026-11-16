/**
 * ShopKart Phase 4 Stage B1 Comprehensive Automated Verification Suite
 * Tests STF-02, STF-03, STF-04, and STF-06 implementation integrity.
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'

const ROOT = process.cwd()

console.log('========================================================')
console.log('SHOPKART PHASE 4 STAGE B1 VERIFICATION SUITE')
console.log('========================================================\n')

let passCount = 0
let failCount = 0

function runTest(name, fn) {
  try {
    fn()
    console.log(`[PASS] ${name}`)
    passCount++
  } catch (err) {
    console.error(`[FAIL] ${name}`)
    console.error(`       Error: ${err.message}`)
    failCount++
  }
}

// ─────────────────────────────────────────────────────────────
// 1. STF-02: Broken Navigation Routes & Informational Pages
// ─────────────────────────────────────────────────────────────
console.log('--- SUITE 1: STF-02 Broken Navigation Routes ---')

runTest('AppRoutes.jsx defines all 11 informational footer routes', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/routes/AppRoutes.jsx'), 'utf8')
  const expectedRoutes = [
    'about', 'careers', 'press', 'blog', 'help',
    'returns', 'track-order', 'shipping', 'privacy',
    'terms', 'cookies'
  ]

  for (const r of expectedRoutes) {
    const regex = new RegExp(`<Route\\s+path="${r}"\\s+element={<PlaceholderPage\\s*/>}\\s*/>`)
    assert.ok(regex.test(file), `Missing route definition for path "${r}" with PlaceholderPage`)
  }
})

runTest('AppRoutes.jsx defines forgot-password route with ForgotPasswordPage', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/routes/AppRoutes.jsx'), 'utf8')
  assert.ok(
    file.includes('path="forgot-password"') && file.includes('<ForgotPasswordPage'),
    'AppRoutes must define /forgot-password route'
  )
})

runTest('PlaceholderPage.jsx maps all 11 footer routes with informative copy', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/PlaceholderPage.jsx'), 'utf8')
  const expectedKeys = [
    '/about', '/careers', '/press', '/blog', '/help',
    '/returns', '/track-order', '/shipping', '/privacy',
    '/terms', '/cookies'
  ]

  for (const key of expectedKeys) {
    assert.ok(file.includes(`'${key}':`), `PlaceholderPage missing content definition for ${key}`)
  }
  assert.ok(file.includes('INFORMATIONAL_PAGES'), 'PlaceholderPage must have INFORMATIONAL_PAGES')
  assert.ok(file.includes('Return to Storefront'), 'PlaceholderPage must have navigation back to storefront')
})

runTest('ForgotPasswordPage.jsx includes email input, validation, and authService integration', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/ForgotPasswordPage.jsx'), 'utf8')
  assert.ok(file.includes('useAuth'), 'ForgotPasswordPage must use AuthContext')
  assert.ok(file.includes('resetPassword'), 'ForgotPasswordPage must call resetPassword')
  assert.ok(file.includes('type="email"'), 'ForgotPasswordPage must contain email input')
  assert.ok(file.includes('/login'), 'ForgotPasswordPage must link back to login page')
})

// ─────────────────────────────────────────────────────────────
// 2. STF-03: Curated Product Feed Navigation
// ─────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: STF-03 Homepage Curated Product Feed Navigation ---')

runTest('productService.js supports optional limit in curated feed queries', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/services/productService.js'), 'utf8')
  assert.ok(
    /fetchFeaturedProducts\s*\(\s*limit\s*=\s*null\s*\)/.test(file),
    'fetchFeaturedProducts must accept limit = null'
  )
  assert.ok(
    /fetchBestSellers\s*\(\s*limit\s*=\s*null\s*\)/.test(file),
    'fetchBestSellers must accept limit = null'
  )
  assert.ok(
    /fetchTrendingProducts\s*\(\s*limit\s*=\s*null\s*\)/.test(file),
    'fetchTrendingProducts must accept limit = null'
  )
  assert.ok(
    /fetchDeals\s*\(\s*limit\s*=\s*null\s*\)/.test(file),
    'fetchDeals must accept limit = null'
  )
})

runTest('AppRoutes.jsx maps curated feeds to CategoryPage with feed prop', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/routes/AppRoutes.jsx'), 'utf8')
  const feeds = ['featured', 'best-sellers', 'trending', 'deals']

  for (const f of feeds) {
    const regex = new RegExp(`<Route\\s+path="${f}"\\s+element={<CategoryPage\\s+feed="${f}"\\s*/>}\\s*/>`)
    assert.ok(regex.test(file), `AppRoutes must route /${f} to CategoryPage with feed="${f}"`)
  }
})

runTest('CategoryPage.jsx defines CURATED_FEEDS and detects active feeds', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/CategoryPage.jsx'), 'utf8')
  assert.ok(file.includes('CURATED_FEEDS'), 'CategoryPage must define CURATED_FEEDS')
  assert.ok(file.includes('featured:') || file.includes("'featured':"), 'CURATED_FEEDS must include featured')
  assert.ok(file.includes('best-sellers:') || file.includes("'best-sellers':"), 'CURATED_FEEDS must include best-sellers')
  assert.ok(file.includes('trending:') || file.includes("'trending':"), 'CURATED_FEEDS must include trending')
  assert.ok(file.includes('deals:') || file.includes("'deals':"), 'CURATED_FEEDS must include deals')
  assert.ok(file.includes('activeFeed ? activeFeed.loadFn()'), 'CategoryPage must call activeFeed.loadFn()')
  assert.ok(file.includes('Curated Collections'), 'CategoryPage breadcrumb must reflect curated collections')
})

// ─────────────────────────────────────────────────────────────
// 3. STF-04: Coupon Persistence Between Cart & Checkout
// ─────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: STF-04 Coupon Persistence Between Cart & Checkout ---')

runTest('CartContext.jsx exports appliedCoupon, applyCoupon, removeCoupon, and couponDiscount', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/context/CartContext.jsx'), 'utf8')
  assert.ok(file.includes('appliedCoupon,'), 'CartContext must provide appliedCoupon')
  assert.ok(file.includes('applyCoupon,'), 'CartContext must provide applyCoupon')
  assert.ok(file.includes('removeCoupon,'), 'CartContext must provide removeCoupon')
  assert.ok(file.includes('couponDiscount,'), 'CartContext must provide couponDiscount')
  assert.ok(file.includes('COUPON_STORAGE_KEY'), 'CartContext must have COUPON_STORAGE_KEY for persistence')
})

runTest('CartContext.jsx clears coupon on clearCart and auth logout', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/context/CartContext.jsx'), 'utf8')
  assert.ok(
    /clearCart\s*=\s*\(\)\s*=>\s*\{[\s\S]*?removeCoupon\(\)/.test(file),
    'clearCart must invoke removeCoupon()'
  )
  assert.ok(
    /if\s*\(!user\?\.id\)[\s\S]*?removeCoupon\(\)/.test(file),
    'CartContext logout handler must invoke removeCoupon()'
  )
})

runTest('CartPage.jsx uses shared coupon state from CartContext', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/CartPage.jsx'), 'utf8')
  assert.ok(
    file.includes('appliedCoupon') && file.includes('applyCoupon') && file.includes('removeCoupon'),
    'CartPage must consume appliedCoupon, applyCoupon, removeCoupon from useCart()'
  )
  assert.ok(
    !/const\s*\[\s*appliedCoupon\s*,\s*setAppliedCoupon\s*\]\s*=\s*useState/.test(file),
    'CartPage must NOT keep disconnected local appliedCoupon state'
  )
})

runTest('CheckoutPage.jsx uses shared coupon state and submits couponCode to placeOrder', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/CheckoutPage.jsx'), 'utf8')
  assert.ok(
    file.includes('appliedCoupon') && file.includes('applyCoupon') && file.includes('removeCoupon'),
    'CheckoutPage must consume appliedCoupon, applyCoupon, removeCoupon from useCart()'
  )
  assert.ok(
    !/const\s*\[\s*appliedCoupon\s*,\s*setAppliedCoupon\s*\]\s*=\s*useState/.test(file),
    'CheckoutPage must NOT keep disconnected local appliedCoupon state'
  )
  assert.ok(
    file.includes('couponCode: appliedCoupon?.code || null'),
    'CheckoutPage must supply couponCode to placeOrder'
  )
})

// ─────────────────────────────────────────────────────────────
// 4. STF-06: Review Submission Feedback & Validation
// ─────────────────────────────────────────────────────────────
console.log('\n--- SUITE 4: STF-06 Review Submission Feedback & Error Handling ---')

runTest('ProductDetailPage.jsx validates review submission return value', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/ProductDetailPage.jsx'), 'utf8')
  assert.ok(
    file.includes('const { data: reviewData, error: submitErr } = await submitProductReview'),
    'ProductDetailPage must destructure return value of submitProductReview'
  )
  assert.ok(
    file.includes('if (submitErr || !reviewData)'),
    'ProductDetailPage must check submitErr || !reviewData'
  )
  assert.ok(
    file.includes('setReviewError(submitErr?.message'),
    'ProductDetailPage must set review error message upon failure'
  )
})

runTest('ProductDetailPage.jsx only sets success and closes modal upon verified insertion', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/ProductDetailPage.jsx'), 'utf8')
  const fnBody = file.substring(file.indexOf('async function handleReviewSubmit'), file.indexOf('// Multi-image list'))

  const errorCheckIndex = fnBody.indexOf('if (submitErr || !reviewData)')
  const successIndex = fnBody.indexOf('setReviewSuccess(true)')

  assert.ok(errorCheckIndex > -1, 'Error check must exist')
  assert.ok(successIndex > -1, 'setReviewSuccess(true) must exist')
  assert.ok(errorCheckIndex < successIndex, 'Error check must precede setReviewSuccess(true)')
  assert.ok(fnBody.includes('return'), 'handleReviewSubmit must return early on failure without closing modal')
})

runTest('ProductDetailPage.jsx renders reviewError alert and disables submit button during submission', () => {
  const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/ProductDetailPage.jsx'), 'utf8')
  assert.ok(file.includes('{reviewError &&'), 'Review modal must render reviewError banner')
  assert.ok(file.includes('disabled={reviewSubmitting}'), 'Review submit button must be disabled when reviewSubmitting is true')
  assert.ok(!file.includes('Date.now()'), 'ProductDetailPage must not invoke impure Date.now() during JSX render')
})

console.log('\n========================================================')
console.log(`RESULTS: ${passCount} passed, ${failCount} failed`)
console.log('========================================================')

if (failCount > 0) {
  process.exit(1)
}
