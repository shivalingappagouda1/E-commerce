# ShopKart — Phase 4 Storefront Implementation Roadmap

**Document Version:** 1.0.0  
**Date:** 2026-11-11  
**Project:** ShopKart E-Commerce Platform  
**Scope:** Storefront Implementation & Enhancement Roadmap  
**Status:** PROPOSED & PRIORITIZED (Awaiting Approval)  

---

## 1. Roadmap Architecture & Execution Principles

This roadmap translates the findings from `SHOPKART_PHASE4_STOREFRONT_AUDIT.md` and `SHOPKART_PHASE4_FINDINGS_REGISTER.md` into an actionable, structured implementation plan.

### Core Principles:
1. **Preserve Hardened Contracts:** Retain all Phase 2 / Phase 3 database RPC signatures (`place_order`, `sync_user_cart`, `cancel_order`) and Storage RLS policies without modification.
2. **Strict Incremental Stages:** Implement fixes in order of security, customer conversion, and architectural reliability.
3. **Automated Verification:** Every stage requires automated test coverage verifying both happy and error paths prior to promotion.

---

## 2. Work Stream 1: Critical Functional Fixes

### Task 1.1: Implement Customer Avatar File Upload UI (`STF-01`)
- **Priority:** **P0**
- **Estimated Complexity:** Medium
- **Dependencies:** `src/services/authService.js`, Supabase Storage `public-assets` bucket.
- **Files Likely to be Affected:**
  - `src/pages/customer/ProfilePage.jsx`
- **Acceptance Criteria:**
  1. Profile page displays an "Upload Photo" button with hidden `<input type="file" />` accepting `.jpg, .jpeg, .png, .webp, .gif`.
  2. Selecting an image immediately validates client-side size ($\le 5\text{ MB}$) and MIME type.
  3. Displays an instant local image preview while uploading.
  4. Calls `uploadAvatar({ userId: user.id, file })`.
  5. On upload success, updates the profile row with the new public URL and displays a success notification.
  6. On validation or network failure, displays an inline error alert without corrupting existing profile data.
- **Required Tests:**
  - Test valid upload of JPG, PNG, WEBP, GIF.
  - Test upload of oversized file (> 5 MB) asserting rejection.
  - Test upload with invalid file extension (e.g. `.svg`, `.exe`) asserting rejection.

---

### Task 1.2: Resolve 404s on 11 Footer Links & Add Password Recovery (`STF-02`)
- **Priority:** **P1**
- **Estimated Complexity:** Medium
- **Dependencies:** `src/routes/AppRoutes.jsx`, `src/context/AuthContext.jsx`.
- **Files Likely to be Affected:**
  - `src/routes/AppRoutes.jsx`
  - `src/pages/customer/ForgotPasswordPage.jsx` (New)
  - `src/pages/customer/PlaceholderPage.jsx`
  - `src/components/layout/Footer.jsx`
- **Acceptance Criteria:**
  1. Create `ForgotPasswordPage.jsx` with an email submission form wired to `resetPassword(email)` in `AuthContext`.
  2. Route `/forgot-password` in `AppRoutes.jsx`.
  3. Register informative placeholder routes in `AppRoutes.jsx` for all 11 footer targets:
     - `/about`, `/careers`, `/press`, `/blog`
     - `/help`, `/returns`, `/track-order`, `/shipping`
     - `/privacy`, `/terms`, `/cookies`
  4. Ensure no footer link routes to `<NotFoundPage />`.
- **Required Tests:**
  - Automated route inspection script asserting 0 broken routes across all links in `Footer.jsx` and `LoginPage.jsx`.

---

## 3. Work Stream 2: Product Discovery Improvements

### Task 2.1: Implement Curated Catalog Feed Filtering (`STF-03`)
- **Priority:** **P1**
- **Estimated Complexity:** Small
- **Dependencies:** `src/services/productService.js`, `src/routes/AppRoutes.jsx`.
- **Files Likely to be Affected:**
  - `src/pages/customer/CategoryPage.jsx`
  - `src/routes/AppRoutes.jsx`
- **Acceptance Criteria:**
  1. When navigating to `/featured`, the catalog displays only items where `is_featured === true` with title "Featured Collections".
  2. When navigating to `/best-sellers`, the catalog filters by `rating >= 4.5` sorted by `review_count DESC` with title "Best Sellers".
  3. When navigating to `/trending`, the catalog filters by `badge IN ('Trending', 'Hot', 'Top Deal')` with title "Trending Products".
  4. When navigating to `/deals`, the catalog filters by `discount_percent >= 30` with title "Super Deals".
- **Required Tests:**
  - Test query matching for each curated route verifying that all rendered cards satisfy the feed conditions.

---

### Task 2.2: Add Storefront Catalog Pagination (`STF-07`)
- **Priority:** **P2**
- **Estimated Complexity:** Medium
- **Dependencies:** `src/pages/customer/CategoryPage.jsx`, `src/pages/customer/SearchPage.jsx`.
- **Files Likely to be Affected:**
  - `src/pages/customer/CategoryPage.jsx`
  - `src/pages/customer/SearchPage.jsx`
  - `src/components/common/Pagination.jsx` (New)
- **Acceptance Criteria:**
  1. Break product grids into pages of 12 or 24 items.
  2. Provide previous, next, and numbered page buttons with active state indicators.
  3. Changing page smoothly scrolls the window to the top of the product grid.
  4. Filter adjustments reset current page to 1.
- **Required Tests:**
  - Test pagination with 30 items: Page 1 shows items 1–12; Page 2 shows items 13–24; Page 3 shows items 25–30.

---

### Task 2.3: Debounce Navbar Autocomplete Search (`STF-09`)
- **Priority:** **P2**
- **Estimated Complexity:** Small
- **Dependencies:** `src/services/productService.js`.
- **Files Likely to be Affected:**
  - `src/components/layout/Navbar.jsx`
  - `src/services/productService.js`
- **Acceptance Criteria:**
  1. Remove upfront `fetchProducts()` execution from `Navbar.jsx` on mount.
  2. Introduce `searchProductSuggestions(query, limit = 5)` executing a debounced call (300ms) only when query length $\ge 2$.
  3. In Supabase mode, query `products` table using `.ilike('name', `%${q}%`)`.
- **Required Tests:**
  - Verify that mounting the Navbar executes 0 product catalog queries.
  - Verify that typing 3 characters triggers exactly 1 debounced request.

---

## 4. Work Stream 3: Product Details Enhancements

### Task 3.1: Add Interactive Image Zoom & Lightbox (`STF-08`)
- **Priority:** **P2**
- **Estimated Complexity:** Medium
- **Dependencies:** None.
- **Files Likely to be Affected:**
  - `src/pages/customer/ProductDetailPage.jsx`
- **Acceptance Criteria:**
  1. On desktop, hovering over the active product image displays a magnified lens or enlarged view.
  2. Clicking the image opens a full-screen lightbox modal with high-res zoom and thumbnail navigation.
  3. Mobile touch-pinch or swipe gestures supported.
- **Required Tests:**
  - Test modal open/close on click and Escape key.

---

### Task 3.2: Accurate Review Submission Error Feedback (`STF-06`)
- **Priority:** **P1**
- **Estimated Complexity:** Small
- **Dependencies:** `src/services/productService.js`.
- **Files Likely to be Affected:**
  - `src/pages/customer/ProductDetailPage.jsx`
- **Acceptance Criteria:**
  1. `handleReviewSubmit` inspects `{ data, error }` from `submitProductReview`.
  2. If `error` is present (e.g. unauthenticated, network drop), keep the review modal open and display an error banner.
  3. Only display the green success banner when `!error && data` is confirmed.
- **Required Tests:**
  - Test submitting review while signed out; assert error message displayed and review modal remains open.

---

## 5. Work Stream 4: Cart and Wishlist Improvements

### Task 4.1: Lift Coupon State into CartContext (`STF-04`)
- **Priority:** **P1**
- **Estimated Complexity:** Medium
- **Dependencies:** `src/context/CartContext.jsx`.
- **Files Likely to be Affected:**
  - `src/context/CartContext.jsx`
  - `src/pages/customer/CartPage.jsx`
  - `src/pages/customer/CheckoutPage.jsx`
- **Acceptance Criteria:**
  1. `CartContext.jsx` manages `appliedCoupon`, `couponDiscount`, and `applyCouponCode(code)`.
  2. Applying a coupon in `CartPage.jsx` persists in context.
  3. When navigating to `CheckoutPage.jsx`, the coupon is already applied and displayed in the Order Summary.
  4. If cart total drops below coupon `min_order_value`, coupon is invalidated with clear feedback.
- **Required Tests:**
  - Test coupon application on Cart page $\rightarrow$ Navigate to Checkout $\rightarrow$ Verify coupon remains applied.

---

### Task 4.2: Scope Wishlist to Authenticated User (`STF-05`)
- **Priority:** **P1**
- **Estimated Complexity:** Medium
- **Dependencies:** `src/context/WishlistContext.jsx`, `src/context/AuthContext.jsx`.
- **Files Likely to be Affected:**
  - `src/context/WishlistContext.jsx`
- **Acceptance Criteria:**
  1. Wishlist storage key dynamically evaluates: `shopkart_wishlist_${user?.id || 'guest'}`.
  2. On user sign out, guest wishlist is cleared.
  3. On user sign in, user-specific wishlist hydrates from storage.
- **Required Tests:**
  - Multi-user test: User A adds items $\rightarrow$ logs out $\rightarrow$ User B logs in $\rightarrow$ User B has empty wishlist.

---

## 6. Work Stream 5: Checkout and Order Experience

### Task 5.1: Real-Time Order Form Validation & Pincode Lookup
- **Priority:** **P2**
- **Estimated Complexity:** Small
- **Dependencies:** `src/services/orderService.js`.
- **Files Likely to be Affected:**
  - `src/pages/customer/CheckoutPage.jsx`
- **Acceptance Criteria:**
  1. Add Indian postal code regex validation (`/^[1-9][0-9]{5}$/`).
  2. Auto-format phone numbers to standard 10-digit format (`+91`).
  3. Disable "Place Order" button during submission to prevent double-click duplicate orders.
- **Required Tests:**
  - Test submission with invalid PIN code and verify error state.

---

## 7. Work Stream 6: Customer Account Improvements

### Task 7.1: Multi-Address Default Selection & Management
- **Priority:** **P2**
- **Estimated Complexity:** Medium
- **Dependencies:** `src/services/orderService.js`.
- **Files Likely to be Affected:**
  - `src/pages/customer/ProfilePage.jsx`
  - `src/pages/customer/CheckoutPage.jsx`
- **Acceptance Criteria:**
  1. Setting an address as default in `ProfilePage` automatically updates the selected radio button on `CheckoutPage`.
  2. Inline editing of addresses with validation.
- **Required Tests:**
  - Set Address 2 as default; verify Address 1 loses default flag.

---

## 8. Work Stream 7: UI/UX & Responsive Improvements

### Task 8.1: Header Responsiveness on Tablet Breakpoints
- **Priority:** **P2**
- **Estimated Complexity:** Small
- **Dependencies:** None.
- **Files Likely to be Affected:**
  - `src/components/layout/Navbar.jsx`
- **Acceptance Criteria:**
  1. Optimize search bar width and account pill flex-wrapping on `768px` to `1024px`.
  2. Category sub-navigation scrolls horizontally with smooth scrollbar-none styling.
- **Required Tests:**
  - Visual inspection at 375px (mobile), 768px (tablet), 1024px (desktop), 1440px (wide).

---

## 9. Work Stream 8: Performance & Accessibility Improvements

### Task 9.1: Resolve Oxlint Diagnostic Warnings (`STF-11`)
- **Priority:** **P3**
- **Estimated Complexity:** Small
- **Dependencies:** None.
- **Files Likely to be Affected:**
  - `src/pages/customer/ProductDetailPage.jsx`
  - `src/pages/customer/WishlistPage.jsx`
  - `src/components/common/AuthGuard.jsx`
- **Acceptance Criteria:**
  1. Replace impure `Date.now()` inside render with sanitized timestamp.
  2. Remove unused imports (`ShoppingBag` in `WishlistPage.jsx`).
  3. Replace `<a href="/">` in `AuthGuard.jsx` with `<Link to="/">` (`STF-10`).
  4. Ensure `npm run lint` finishes with 0 warnings.
- **Required Tests:**
  - Run `npm run lint` and verify zero warnings.

---

### Task 9.2: Implement "Recently Viewed Products" Strip (`STF-12`)
- **Priority:** **P3**
- **Estimated Complexity:** Small
- **Dependencies:** `src/services/productService.js`.
- **Files Likely to be Affected:**
  - `src/pages/customer/HomePage.jsx`
  - `src/pages/customer/ProductDetailPage.jsx`
- **Acceptance Criteria:**
  1. Visiting a product detail page appends the product slug to a list of max 8 items in `localStorage`.
  2. Homepage renders a "Recently Viewed" section if history exists.
- **Required Tests:**
  - View 2 products, visit homepage, assert both products appear in Recently Viewed.

---

## 10. Summary Roadmap Matrix

| Task ID | Work Stream | Priority | Complexity | Target Files |
|---|---|---|---|---|
| **Task 1.1** | Avatar File Upload UI (`STF-01`) | **P0** | Medium | `ProfilePage.jsx` |
| **Task 1.2** | Missing Footer & Forgot Password Routes (`STF-02`) | **P1** | Medium | `AppRoutes.jsx`, `ForgotPasswordPage.jsx`, `Footer.jsx` |
| **Task 2.1** | Curated Catalog Feed Filtering (`STF-03`) | **P1** | Small | `CategoryPage.jsx`, `AppRoutes.jsx` |
| **Task 3.2** | Review Submission Accurate Error Handling (`STF-06`)| **P1** | Small | `ProductDetailPage.jsx` |
| **Task 4.1** | Lift Coupon State into CartContext (`STF-04`) | **P1** | Medium | `CartContext.jsx`, `CartPage.jsx`, `CheckoutPage.jsx` |
| **Task 4.2** | Scope Wishlist to Authenticated User (`STF-05`) | **P1** | Medium | `WishlistContext.jsx` |
| **Task 2.2** | Storefront Catalog Pagination (`STF-07`) | **P2** | Medium | `CategoryPage.jsx`, `SearchPage.jsx` |
| **Task 2.3** | Debounce Navbar Autocomplete Search (`STF-09`) | **P2** | Small | `Navbar.jsx`, `productService.js` |
| **Task 3.1** | Product Image Zoom & Lightbox (`STF-08`) | **P2** | Medium | `ProductDetailPage.jsx` |
| **Task 5.1** | Real-Time Address Form Validation | **P2** | Small | `CheckoutPage.jsx` |
| **Task 7.1** | Multi-Address Default Management | **P2** | Medium | `ProfilePage.jsx`, `CheckoutPage.jsx` |
| **Task 8.1** | Header Tablet Responsiveness | **P2** | Small | `Navbar.jsx` |
| **Task 9.1** | Resolve Oxlint Diagnostic Warnings (`STF-10/11`) | **P3** | Small | `ProductDetailPage.jsx`, `AuthGuard.jsx` |
| **Task 9.2** | Recently Viewed Products Strip (`STF-12`) | **P3** | Small | `HomePage.jsx`, `ProductDetailPage.jsx` |
