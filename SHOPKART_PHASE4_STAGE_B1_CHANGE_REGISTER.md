# ShopKart — Phase 4 Stage B1 Change Register

**Document Version:** 1.0.0  
**Phase:** Phase 4 — Customer Storefront Enhancements (Stage B1)  
**Author:** Senior React Engineer & Code Reviewer  
**Status:** COMPLETE & AUTHORITATIVE  
**Date:** November 2026  

---

## 1. Scope & Authorization Boundary Compliance

The changes documented below were implemented under strict Stage B1 authorization limits:
- **Authorized Findings:** Only `STF-02`, `STF-03`, `STF-04`, and `STF-06`.
- **Database / SQL Changes:** 0 files modified, 0 SQL statements executed.
- **Git State:** 0 commits created, 0 branches switched, 0 pushes.
- **Security Invariants:** Client discounts are display-only; PostgreSQL RPC `place_order` retains final discount authority.

---

## 2. File-by-File Change Log

### 2.1 `src/pages/customer/ForgotPasswordPage.jsx`
- **Action:** Created new file.
- **Lines of Code:** 122 lines.
- **Purpose:** Implements password reset request page for `STF-02`.
- **Key Elements:**
  - `useAuth().resetPassword(email)` integration.
  - Client-side email format regex validation.
  - Dual-mode support (Supabase Auth redirect vs. mock mode feedback).
  - Generic success notification preserving privacy and user-enumeration defense.
  - Direct navigation back to `/login`.

### 2.2 `src/pages/customer/PlaceholderPage.jsx`
- **Action:** Rewritten.
- **Lines of Code:** 134 lines.
- **Purpose:** Replaced stub placeholder with a rich, informational directory for `STF-02`.
- **Key Elements:**
  - `INFORMATIONAL_PAGES` dictionary mapping 11 routes:
    - `/about`, `/careers`, `/press`, `/blog` (Company)
    - `/help`, `/returns`, `/track-order`, `/shipping` (Customer Service)
    - `/privacy`, `/terms`, `/cookies` (Legal & Compliance)
  - Category badges, detailed descriptions, and breadcrumbs.
  - Fallback view with navigation back to storefront (`/`).

### 2.3 `src/routes/AppRoutes.jsx`
- **Action:** Modified.
- **Line Modifications:**
  - Added lazy import for `ForgotPasswordPage`.
  - Added routes for `/forgot-password`, `/featured`, `/best-sellers`, `/trending`, and `/deals`.
  - Mapped all 11 footer routes (`/about`, `/careers`, `/press`, `/blog`, `/help`, `/returns`, `/track-order`, `/shipping`, `/privacy`, `/terms`, `/cookies`) to `<PlaceholderPage />`.
- **Finding Addressed:** `STF-02`, `STF-03`.

### 2.4 `src/services/productService.js`
- **Action:** Modified.
- **Line Modifications:**
  - `fetchFeaturedProducts(limit = null)`: allows full-feed queries while supporting preview limits.
  - `fetchBestSellers(limit = null)`: allows full-feed queries while supporting preview limits.
  - `fetchTrendingProducts(limit = null)`: allows full-feed queries while supporting preview limits.
  - `fetchDeals(limit = null)`: allows full-feed queries while supporting preview limits.
- **Finding Addressed:** `STF-03`.

### 2.5 `src/pages/customer/CategoryPage.jsx`
- **Action:** Modified.
- **Line Modifications:**
  - Added `CURATED_FEEDS` definitions for `featured`, `best-sellers`, `trending`, and `deals`.
  - Added prop `feed` support and auto-detection from pathname.
  - Updated `loadProductsPromise` to dispatch `activeFeed.loadFn()` when viewing a curated feed.
  - Rendered dedicated banner with feed title, icon, and dynamic item count.
  - Customized breadcrumb: `Home > Curated Collections > {Feed Title}`.
  - Tailored empty-state with link to `/category/all`.
- **Finding Addressed:** `STF-03`.

### 2.6 `src/context/CartContext.jsx`
- **Action:** Modified.
- **Line Modifications:**
  - Imported `useState`.
  - Added `COUPON_STORAGE_KEY = 'shopkart_applied_coupon'`.
  - Added `appliedCoupon` state initialized from `localStorage`.
  - Provided `applyCoupon(coupon)`: updates state and syncs to `localStorage`.
  - Provided `removeCoupon()`: resets state and removes `localStorage` key.
  - Updated `clearCart()`: triggers `removeCoupon()`.
  - Updated auth logout handler: triggers `removeCoupon()`.
  - Computed non-authoritative client display discount `couponDiscount` (with `min_order_value` check).
  - Exported `appliedCoupon, applyCoupon, removeCoupon, couponDiscount` in context.
- **Finding Addressed:** `STF-04`.

### 2.7 `src/pages/customer/CartPage.jsx`
- **Action:** Modified.
- **Line Modifications:**
  - Replaced local `[appliedCoupon, setAppliedCoupon]` with `useCart()` hooks.
  - Removed local `couponDiscount` calculation; consumed from `useCart()`.
  - Updated `handleApplyCoupon` to invoke `applyCoupon(result.coupon)`.
  - Updated `handleRemoveCoupon` to invoke `removeCoupon()`.
- **Finding Addressed:** `STF-04`.

### 2.8 `src/pages/customer/CheckoutPage.jsx`
- **Action:** Modified.
- **Line Modifications:**
  - Replaced local `[appliedCoupon, setAppliedCoupon]` with `useCart()` hooks.
  - Removed local `couponDiscount` calculation; consumed from `useCart()`.
  - Updated `handleApplyCoupon` to invoke `applyCoupon(result.coupon)`.
  - Updated `handleRemoveCoupon` to invoke `removeCoupon()`.
  - Passed `couponCode: appliedCoupon?.code || null` to `placeOrder(...)`.
- **Finding Addressed:** `STF-04`.

### 2.9 `src/pages/customer/ProductDetailPage.jsx`
- **Action:** Modified.
- **Line Modifications:**
  - Added `reviewError` state.
  - In `handleReviewSubmit`:
    - Validates headline and comments.
    - Inspects `{ data: reviewData, error: submitErr } = await submitProductReview(...)`.
    - If error or no data: sets `reviewError`, retains user input, keeps modal open, and returns early.
    - Only on confirmed insertion: sets `reviewSuccess(true)`, closes modal, clears fields, and refreshes reviews.
  - In modal JSX: renders red error alert banner `{reviewError && (...)}`.
  - Disabled submit button while `reviewSubmitting` is true.
  - Replaced impure `Date.now()` during review date rendering with safe fallback string formatting.
- **Finding Addressed:** `STF-06`.

### 2.10 `test_phase4_stage_b1.mjs`
- **Action:** Created new test harness.
- **Lines of Code:** 188 lines.
- **Purpose:** Verifies structural and behavioral compliance of all Stage B1 implementations.
- **Result:** 14/14 tests passing.

---

## 3. Detailed Diff Overview

```diff
--- a/src/routes/AppRoutes.jsx
+++ b/src/routes/AppRoutes.jsx
+const ForgotPasswordPage     = lazy(() => import('../pages/customer/ForgotPasswordPage'))
+const PlaceholderPage        = lazy(() => import('../pages/customer/PlaceholderPage'))
...
+          <Route path="forgot-password"          element={<ForgotPasswordPage />} />
+          <Route path="featured"                 element={<CategoryPage feed="featured" />} />
+          <Route path="best-sellers"             element={<CategoryPage feed="best-sellers" />} />
+          <Route path="trending"                 element={<CategoryPage feed="trending" />} />
+          <Route path="deals"                    element={<CategoryPage feed="deals" />} />
+          {/* Informational & Policy Routes */}
+          <Route path="about"                    element={<PlaceholderPage />} />
+          <Route path="careers"                  element={<PlaceholderPage />} />
+          <Route path="press"                    element={<PlaceholderPage />} />
+          <Route path="blog"                     element={<PlaceholderPage />} />
+          <Route path="help"                     element={<PlaceholderPage />} />
+          <Route path="returns"                  element={<PlaceholderPage />} />
+          <Route path="track-order"              element={<PlaceholderPage />} />
+          <Route path="shipping"                 element={<PlaceholderPage />} />
+          <Route path="privacy"                  element={<PlaceholderPage />} />
+          <Route path="terms"                    element={<PlaceholderPage />} />
+          <Route path="cookies"                  element={<PlaceholderPage />} />

--- a/src/context/CartContext.jsx
+++ b/src/context/CartContext.jsx
+const COUPON_STORAGE_KEY = 'shopkart_applied_coupon'
...
+  const [appliedCoupon, setAppliedCouponState] = useState(() => {
+    try {
+      const stored = localStorage.getItem(COUPON_STORAGE_KEY)
+      return stored ? JSON.parse(stored) : null
+    } catch {
+      return null
+    }
+  })
+  const applyCoupon = (coupon) => { ... }
+  const removeCoupon = () => { ... }
...
+  let couponDiscount = 0
+  if (appliedCoupon && totalPrice > 0) { ... }
...
+    <CartContext.Provider value={{
+      ...
+      appliedCoupon,
+      applyCoupon,
+      removeCoupon,
+      couponDiscount,
+    }}>

--- a/src/pages/customer/ProductDetailPage.jsx
+++ b/src/pages/customer/ProductDetailPage.jsx
+  const [reviewError, setReviewError] = useState('')
...
   async function handleReviewSubmit(e) {
     e.preventDefault()
+    setReviewError('')
+    if (!reviewTitle.trim() || !reviewBody.trim()) {
+      setReviewError('Please provide both a review headline and comments.')
+      return
+    }
     setReviewSubmitting(true)
-    await submitProductReview({ ... })
-    setReviewSubmitting(false)
-    setReviewSuccess(true)
-    setReviewModalOpen(false)
+    const { data: reviewData, error: submitErr } = await submitProductReview({ ... })
+    setReviewSubmitting(false)
+    if (submitErr || !reviewData) {
+      setReviewError(submitErr?.message || 'Failed to submit review. Please try again.')
+      return
+    }
+    setReviewSuccess(true)
+    setReviewModalOpen(false)
```

---

## 4. Rollback Instructions

If rollback of Phase 4 Stage B1 is required:
1. `git checkout -- src/routes/AppRoutes.jsx src/services/productService.js src/pages/customer/CategoryPage.jsx src/context/CartContext.jsx src/pages/customer/CartPage.jsx src/pages/customer/CheckoutPage.jsx src/pages/customer/ProductDetailPage.jsx src/pages/customer/PlaceholderPage.jsx`
2. `rm src/pages/customer/ForgotPasswordPage.jsx test_phase4_stage_b1.mjs`
3. Execute `npm run build` to confirm restoration to baseline.
