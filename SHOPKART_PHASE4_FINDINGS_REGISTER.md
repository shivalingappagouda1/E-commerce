# ShopKart — Phase 4 Storefront Findings Register

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-11  
**Project:** ShopKart E-Commerce Platform  
**Scope:** Storefront Defect & Improvement Inventory  
**Auditor:** Senior Frontend Architect & Application Security Engineer  

---

## Findings Summary

| ID | Title | Severity | Priority | Affected File |
|---|---|---|---|---|
| **STF-01** | Avatar File Upload UI Completely Missing from Profile Page | **Critical** | **P0** | `src/pages/customer/ProfilePage.jsx` |
| **STF-02** | Missing Routes Resulting in 404 for 11 Footer Links & Forgot Password | **High** | **P1** | `src/routes/AppRoutes.jsx`, `Footer.jsx`, `LoginPage.jsx` |
| **STF-03** | Curated Catalog Feed Links Render Unfiltered Catalog | **High** | **P1** | `src/routes/AppRoutes.jsx`, `CategoryPage.jsx` |
| **STF-04** | Coupon State Dropped During Cart-to-Checkout Navigation | **High** | **P1** | `src/pages/customer/CartPage.jsx`, `CheckoutPage.jsx` |
| **STF-05** | Wishlist Storage Lacks Account Isolation and Remote Supabase Sync | **High** | **P1** | `src/context/WishlistContext.jsx` |
| **STF-06** | Review Submission Reports False Success on Server / Auth Errors | **High** | **P1** | `src/pages/customer/ProductDetailPage.jsx` |
| **STF-07** | Client-Side In-Memory Catalog Fetching in Search & Category Without Pagination | **Medium** | **P2** | `src/pages/customer/CategoryPage.jsx`, `SearchPage.jsx` |
| **STF-08** | Product Detail Page Lacks Interactive Image Zoom / Lightbox | **Medium** | **P2** | `src/pages/customer/ProductDetailPage.jsx` |
| **STF-09** | Navbar Autocomplete Fetches Complete Product Catalog into Memory | **Medium** | **P2** | `src/components/layout/Navbar.jsx` |
| **STF-10** | AuthGuard Access Denied View Uses Hard Link Instead of Router Link | **Low** | **P3** | `src/components/common/AuthGuard.jsx` |
| **STF-11** | Impure Function (`Date.now()`) Called During Product Detail Page Render | **Low** | **P3** | `src/pages/customer/ProductDetailPage.jsx` |
| **STF-12** | Missing "Recently Viewed Products" Storefront Module | **Low** | **P3** | `src/pages/customer/HomePage.jsx`, `ProductDetailPage.jsx` |

---

## Detailed Findings Register

### STF-01: Avatar File Upload UI Completely Missing from Profile Page

- **Unique ID:** `STF-01`
- **Title:** Avatar File Upload UI Completely Missing from Profile Page
- **Description:** Phase 3 Stage B hardened the `uploadAvatar({ userId, file })` service with a 5 MB file size limit, strict MIME whitelisting, lowercase extension normalization, and MIME-to-extension contradiction prevention. However, `ProfilePage.jsx` does not include an `<input type="file" />` element. Customers can only select among 4 static hardcoded Unsplash preset avatars. `uploadAvatar` is not imported or wired in `ProfilePage.jsx`.
- **Severity:** Critical
- **Priority:** **P0**
- **Affected File & Location:** [`src/pages/customer/ProfilePage.jsx:294-310`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProfilePage.jsx#L294-L310)
- **Steps to Reproduce:**
  1. Navigate to `/profile`.
  2. Attempt to upload a personal profile image from your local device.
  3. Observe that there is no file upload input or button; only 4 preset Unsplash images can be clicked.
- **Expected Behavior:** A file upload input (`<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" />`) allowing customers to select an image, with client-side preview, triggering `uploadAvatar({ userId: user.id, file })`.
- **Actual Behavior:** Customers cannot upload files. The hardened `uploadAvatar` service is completely dead code from the UI perspective.
- **Recommended Solution:**
  1. Add an avatar file picker `<input type="file" id="avatar-upload" className="hidden" accept=".jpg,.jpeg,.png,.webp,.gif" />` with an "Upload Custom Photo" button and visual preview.
  2. Import `uploadAvatar` from `../../services/authService`.
  3. On file change, invoke `uploadAvatar({ userId: user.id, file })`, display validation errors if rejected, and update `selectedAvatar` with the returned public URL upon success.
- **Dependencies:** `src/services/authService.js`, Supabase Storage `public-assets` bucket.
- **Testing Requirements:** Test image uploads for JPEG, PNG, WEBP, GIF; verify size limits (> 5 MB rejected); verify preview updates immediately.

---

### STF-02: Missing Routes Resulting in 404 for 11 Footer Links & Forgot Password

- **Unique ID:** `STF-02`
- **Title:** Missing Routes Resulting in 404 for 11 Footer Links & Forgot Password
- **Description:** Multiple navigation links throughout the customer storefront point to routes that are not defined in `src/routes/AppRoutes.jsx`. Clicking any of them causes React Router to render `<NotFoundPage />`.
- **Severity:** High
- **Priority:** **P1**
- **Affected File & Location:**
  - [`src/components/layout/Footer.jsx:5-21`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/components/layout/Footer.jsx#L5-L21) (`/about`, `/careers`, `/press`, `/blog`, `/help`, `/returns`, `/track-order`, `/shipping`, `/privacy`, `/terms`, `/cookies`)
  - [`src/pages/customer/LoginPage.jsx:95`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/LoginPage.jsx#L95) (`/forgot-password`)
  - [`src/routes/AppRoutes.jsx:63-82`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/routes/AppRoutes.jsx#L63-L82)
- **Steps to Reproduce:**
  1. Scroll to the footer on any customer page.
  2. Click "Privacy Policy" (`/privacy`) or "Help Center" (`/help`).
  3. Go to `/login` and click "Forgot password?" (`/forgot-password`).
  4. Observe that all 12 links render a 404 Page Not Found error.
- **Expected Behavior:** Informational pages render appropriate content (or structured placeholder cards), and `/forgot-password` renders a password recovery form.
- **Actual Behavior:** 12 broken links lead directly to a 404 error page.
- **Recommended Solution:**
  1. Create a `ForgotPasswordPage.jsx` that invokes `resetPassword(email)` from `AuthContext`.
  2. Map footer links in `AppRoutes.jsx` to informative content or structured `<PlaceholderPage title="..." />` views.
- **Dependencies:** `src/routes/AppRoutes.jsx`, `src/pages/customer/PlaceholderPage.jsx`, `src/context/AuthContext.jsx`.
- **Testing Requirements:** Automated route test verifying that every link in `Footer.jsx` and `LoginPage.jsx` resolves with HTTP status 200 / valid component without rendering `NotFoundPage`.

---

### STF-03: Curated Catalog Feed Links Render Unfiltered Catalog

- **Unique ID:** `STF-03`
- **Title:** Curated Catalog Feed Links Render Unfiltered Catalog
- **Description:** The homepage features curated rows: "Featured Collections", "Best Selling Products", "Trending Right Now", and "Deals of the Day". Each has a "View All" link routing respectively to `/featured`, `/best-sellers`, `/trending`, and `/deals`. In `AppRoutes.jsx`, these routes all render `<CategoryPage />`. However, `CategoryPage.jsx` expects a `:slug` param. When accessed via these routes, `slug` is `undefined`, so `selectedCategory` defaults to `'all'`, loading the entire catalog ("All Products") rather than the curated set.
- **Severity:** High
- **Priority:** **P1**
- **Affected File & Location:**
  - [`src/routes/AppRoutes.jsx:77-80`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/routes/AppRoutes.jsx#L77-L80)
  - [`src/pages/customer/CategoryPage.jsx:21, 38, 59-66`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CategoryPage.jsx#L21)
- **Steps to Reproduce:**
  1. Open the homepage.
  2. Click "View All" next to "Best Selling Products" (`/best-sellers`).
  3. Observe that the page title is "All Products" and products are not filtered by rating or review count.
- **Expected Behavior:** Navigating to `/featured`, `/best-sellers`, `/trending`, or `/deals` should filter the products according to the respective curated criteria (e.g. `is_featured === true`, `badge in ['Trending', 'Hot']`, `discount_percent >= 30`).
- **Actual Behavior:** Renders the complete catalog with no feed-specific filtering.
- **Recommended Solution:** Enhance `CategoryPage.jsx` to inspect `location.pathname` or accept a feed prop, applying `fetchFeaturedProducts`, `fetchBestSellers`, `fetchTrendingProducts`, or `fetchDeals` when matching `/featured`, `/best-sellers`, `/trending`, or `/deals`.
- **Dependencies:** `src/services/productService.js`, `src/routes/AppRoutes.jsx`.
- **Testing Requirements:** Test navigation to all 4 curated feed routes; assert that products displayed match the respective filter criteria.

---

### STF-04: Coupon State Dropped During Cart-to-Checkout Navigation

- **Unique ID:** `STF-04`
- **Title:** Coupon State Dropped During Cart-to-Checkout Navigation
- **Description:** In `CartPage.jsx`, customers can enter a coupon code (`SHOPKART10`, `WELCOME500`), which is validated via `validateCoupon` and updates `appliedCoupon`. When the user clicks "Proceed to Checkout", `navigate('/checkout')` is called without passing the coupon object or storing it in `CartContext`. `CheckoutPage.jsx` initializes with its own separate `appliedCoupon = null` state, forcing the customer to re-enter and re-apply the coupon code.
- **Severity:** High
- **Priority:** **P1**
- **Affected File & Location:**
  - [`src/pages/customer/CartPage.jsx:21-22, 353`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CartPage.jsx#L21-L22)
  - [`src/pages/customer/CheckoutPage.jsx:39-44`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CheckoutPage.jsx#L39-L44)
- **Steps to Reproduce:**
  1. Add an item priced $\ge \text{₹}999$ to cart.
  2. Navigate to `/cart`.
  3. Apply coupon code `SHOPKART10`. Observe discount is calculated.
  4. Click "Proceed to Checkout".
  5. Observe that the coupon is missing on `/checkout`, and the discount is no longer applied.
- **Expected Behavior:** Applied coupons persist seamlessly from Cart to Checkout.
- **Actual Behavior:** Coupon state is discarded on navigation.
- **Recommended Solution:** Lift `appliedCoupon` and coupon handling into `CartContext.jsx` (or pass via `navigate('/checkout', { state: { coupon: appliedCoupon } })` with hydration), allowing consistent calculation and automatic order placement discount application.
- **Dependencies:** `src/context/CartContext.jsx`, `src/pages/customer/CartPage.jsx`, `src/pages/customer/CheckoutPage.jsx`.
- **Testing Requirements:** Automated workflow testing coupon application in Cart, navigation to Checkout, and verification that `appliedCoupon` remains active.

---

### STF-05: Wishlist Storage Lacks Account Isolation and Remote Supabase Sync

- **Unique ID:** `STF-05`
- **Title:** Wishlist Storage Lacks Account Isolation and Remote Supabase Sync
- **Description:** `WishlistContext.jsx` stores all items in a single hardcoded key: `localStorage.getItem('shopkart_wishlist')`. It does not scope keys by user ID, does not clear items on logout, and does not synchronize with any database table when Supabase is configured.
- **Severity:** High
- **Priority:** **P1**
- **Affected File & Location:** [`src/context/WishlistContext.jsx:4, 11, 17`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/context/WishlistContext.jsx#L4)
- **Steps to Reproduce:**
  1. Log in as Customer A and add a product to wishlist.
  2. Log out.
  3. Log in as Customer B on the same browser.
  4. Navigate to `/wishlist`. Observe Customer A's favorited items are visible to Customer B.
- **Expected Behavior:** Wishlist is scoped to the active user ID (`shopkart_wishlist_${user.id}`) and clears/isolates on session change.
- **Actual Behavior:** Single global storage key leaks items between accounts.
- **Recommended Solution:**
  1. Scope `localStorage` key dynamically to `user?.id ? `shopkart_wishlist_${user.id}` : 'shopkart_wishlist_guest'`.
  2. On user sign out, reset wishlist state.
- **Dependencies:** `src/context/AuthContext.jsx`, `src/context/WishlistContext.jsx`.
- **Testing Requirements:** Verify account switching test: User A wishlist does not leak to User B.

---

### STF-06: Review Submission Reports False Success on Server / Auth Errors

- **Unique ID:** `STF-06`
- **Title:** Review Submission Reports False Success on Server / Auth Errors
- **Description:** In `ProductDetailPage.jsx`, `handleReviewSubmit` calls `await submitProductReview(...)` but does not check the returned `{ data, error }`. Regardless of whether the call succeeded, failed, or was rejected because the user was not authenticated, the component unconditionally sets `reviewSuccess = true` and shows a green success banner.
- **Severity:** High
- **Priority:** **P1**
- **Affected File & Location:** [`src/pages/customer/ProductDetailPage.jsx:150-169`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L150-L169)
- **Steps to Reproduce:**
  1. In Supabase mode without signing in, open any product page.
  2. Click "Write a Review".
  3. Fill out title and body, and click "Submit".
  4. Notice the green success alert appears, even though the database rejected the review.
- **Expected Behavior:** Inspect `error` from `submitProductReview`. If an error occurs, keep the modal open and display an inline error alert.
- **Actual Behavior:** Unconditional success message displayed on failure.
- **Recommended Solution:**
  ```javascript
  const { data, error } = await submitProductReview(...)
  if (error) {
    setReviewError(error.message || 'Failed to submit review.')
    setReviewSubmitting(false)
    return
  }
  ```
- **Dependencies:** `src/services/productService.js`, `src/pages/customer/ProductDetailPage.jsx`.
- **Testing Requirements:** Submit review as unauthenticated user; assert error banner appears and modal remains accessible.

---

### STF-07: Client-Side In-Memory Catalog Fetching in Search & Category Without Pagination

- **Unique ID:** `STF-07`
- **Title:** Client-Side In-Memory Catalog Fetching in Search & Category Without Pagination
- **Description:** `CategoryPage.jsx` and `SearchPage.jsx` invoke `fetchProducts()` without category or query constraints, loading the entire database catalog into browser memory, and then filter/sort using JavaScript `useMemo`. Furthermore, all matching products are rendered in a single un-paginated DOM tree.
- **Severity:** Medium
- **Priority:** **P2**
- **Affected File & Location:**
  - [`src/pages/customer/CategoryPage.jsx:44, 55-91`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CategoryPage.jsx#L44)
  - [`src/pages/customer/SearchPage.jsx:27, 34-69`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/SearchPage.jsx#L27)
- **Steps to Reproduce:**
  1. Inspect network tab when navigating to `/search` or `/category/electronics`.
  2. Observe that all catalog products are retrieved in one request.
- **Expected Behavior:** Server-side parameterized queries (e.g. `category_id`, search `ilike`, limit/offset) with client-side pagination (e.g. 12 or 24 items per page).
- **Actual Behavior:** Full dataset loaded into memory; un-paginated DOM rendering.
- **Recommended Solution:** Add pagination controls (Page 1, 2, 3...) to `CategoryPage` and `SearchPage` (12 items per page) and pass category filters to `fetchProducts({ category: slug })`.
- **Dependencies:** `src/services/productService.js`.
- **Testing Requirements:** Benchmark render time with 50+ mock items; verify pagination buttons update displayed items correctly.

---

### STF-08: Product Detail Page Lacks Interactive Image Zoom / Lightbox

- **Unique ID:** `STF-08`
- **Title:** Product Detail Page Lacks Interactive Image Zoom / Lightbox
- **Description:** On `ProductDetailPage.jsx`, the primary image is displayed in a fixed container with `object-contain`. There is no hover-zoom capability, magnified lens, or full-screen lightbox modal for customers to inspect fabric textures, ports, or fine details.
- **Severity:** Medium
- **Priority:** **P2**
- **Affected File & Location:** [`src/pages/customer/ProductDetailPage.jsx:195-201`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L195-L201)
- **Steps to Reproduce:** Hover or click on the product detail image; observe that no zoom or expansion occurs.
- **Expected Behavior:** Standard e-commerce image magnification on desktop hover and full-screen lightbox modal on click.
- **Actual Behavior:** Static image display.
- **Recommended Solution:** Implement a lightweight CSS/JS hover zoom lens or click-to-expand lightbox modal.
- **Dependencies:** `ProductDetailPage.jsx`.
- **Testing Requirements:** Test hover and click interactions across desktop and mobile.

---

### STF-09: Navbar Autocomplete Fetches Complete Product Catalog into Memory

- **Unique ID:** `STF-09`
- **Title:** Navbar Autocomplete Fetches Complete Product Catalog into Memory
- **Description:** On mount, `Navbar.jsx` executes `fetchProducts().then(({ data }) => setAllProducts(data || []))`. In a large database, this loads thousands of product objects into memory for every page view just to support 5 autocomplete suggestions.
- **Severity:** Medium
- **Priority:** **P2**
- **Affected File & Location:** [`src/components/layout/Navbar.jsx:37-40, 43-55`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/components/layout/Navbar.jsx#L37-L40)
- **Steps to Reproduce:** Open any storefront page and inspect memory heap / network requests.
- **Expected Behavior:** Navbar autocomplete should execute a debounced search query (`limit 5`) only when the customer types $\ge 2$ characters.
- **Actual Behavior:** Pre-loads all products on every page load.
- **Recommended Solution:** Replace the upfront catalog load with a debounced search helper querying Supabase with `ilike` and `limit(5)`.
- **Dependencies:** `src/services/productService.js`, `src/components/layout/Navbar.jsx`.
- **Testing Requirements:** Verify typing "watch" triggers a single debounced call returning at most 5 items.

---

### STF-10: AuthGuard Access Denied View Uses Hard Link Instead of Router Link

- **Unique ID:** `STF-10`
- **Title:** AuthGuard Access Denied View Uses Hard Link Instead of Router Link
- **Description:** In `AuthGuard.jsx`, when an unauthorized user attempts to access an admin route, the "Return to Store" button is rendered as `<a href="/">` rather than React Router `<Link to="/">`, forcing a complete browser reload.
- **Severity:** Low
- **Priority:** **P3**
- **Affected File & Location:** [`src/components/common/AuthGuard.jsx:48-54`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/components/common/AuthGuard.jsx#L48-L54)
- **Steps to Reproduce:** Access `/admin` while logged out; click "Return to Store"; note full page refresh.
- **Expected Behavior:** Single-page client-side navigation via `<Link to="/">`.
- **Actual Behavior:** Full HTML document reload.
- **Recommended Solution:** Replace `<a href="/">` with `<Link to="/">`.
- **Dependencies:** `src/components/common/AuthGuard.jsx`.
- **Testing Requirements:** Verify client-side SPA navigation without browser reload.

---

### STF-11: Impure Function (`Date.now()`) Called During Product Detail Page Render

- **Unique ID:** `STF-11`
- **Title:** Impure Function (`Date.now()`) Called During Product Detail Page Render
- **Description:** `oxlint` flagged a React Compiler purity warning: `new Date(rev.created_at || Date.now())` is evaluated directly in JSX render in `ProductDetailPage.jsx:502`.
- **Severity:** Low
- **Priority:** **P3**
- **Affected File & Location:** [`src/pages/customer/ProductDetailPage.jsx:502`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L502)
- **Steps to Reproduce:** Run `npm run lint`.
- **Expected Behavior:** Format dates using pure timestamps or default to stable review created date.
- **Actual Behavior:** Impure `Date.now()` triggers linter warnings.
- **Recommended Solution:** Ensure `rev.created_at` is sanitized before render or format via a pure helper.
- **Dependencies:** `ProductDetailPage.jsx`.
- **Testing Requirements:** Confirm `npm run lint` warning is eliminated.

---

### STF-12: Missing "Recently Viewed Products" Storefront Module

- **Unique ID:** `STF-12`
- **Title:** Missing "Recently Viewed Products" Storefront Module
- **Description:** Modern e-commerce platforms (Flipkart, Amazon) track recently visited product pages and display a "Recently Viewed" carousel or strip on the Homepage and Product Detail Page to aid customer re-engagement. This feature is completely absent.
- **Severity:** Low
- **Priority:** **P3**
- **Affected File & Location:** `src/pages/customer/HomePage.jsx`, `src/pages/customer/ProductDetailPage.jsx`
- **Steps to Reproduce:** View multiple products; return to homepage; note absence of any browsing history.
- **Expected Behavior:** A lightweight recently-viewed tracker saving up to 8 product slugs in `localStorage` and rendering a resume-browsing section.
- **Actual Behavior:** Feature not implemented.
- **Recommended Solution:** Create a small `useRecentlyViewed` hook pushing product IDs to `localStorage` and display a "Recently Viewed" section on `HomePage.jsx`.
- **Dependencies:** `src/pages/customer/ProductDetailPage.jsx`, `src/pages/customer/HomePage.jsx`.
- **Testing Requirements:** View 3 products; verify all 3 appear in the recently viewed strip.
