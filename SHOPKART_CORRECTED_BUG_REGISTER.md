# ShopKart — Corrected Bug & Vulnerability Register

**Date:** 11 November 2026  
**Auditor:** Senior Full-Stack Engineer  
**Inspection Standard:** Line-by-line verification against actual source code.

---

## 1. Confirmed Bugs (Defects in Existing Code)

### BUG-01: Product Review Query Fails Due to Schema Column Mismatch
- **Status:** `CONFIRMED DEFECT`
- **Severity:** `HIGH`
- **File Paths & Line Numbers:**
  - [`src/pages/customer/ProductDetailPage.jsx:64`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L64): `fetchProductReviews(data.name)`
  - [`src/pages/customer/ProductDetailPage.jsx:165`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L165): `fetchProductReviews(product.name)`
  - [`src/services/productService.js:420-437`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/productService.js#L420-L437):
    ```javascript
    export async function fetchProductReviews(productName) {
      ...
      const { data, error } = await supabase
        .from('reviews')
        .select('*, profiles(full_name, avatar_url)')
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
      ...
      const matching = (data || []).filter(r =>
        (!productName || (r.product_name && r.product_name.toLowerCase().includes(productName.toLowerCase())))
      )
      return { data: matching, error: null }
    }
    ```
- **Evidence from Database Catalog:**
  In [`database/schema.sql:361-372`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/schema.sql#L361-L372), the `reviews` table has no `product_name` column:
  `columns: id, product_id, user_id, rating, title, body, is_approved, created_at, updated_at`.
- **Actual Impact:**
  1. `r.product_name` is always `undefined` in the database results.
  2. The client-side filter excludes 100% of rows when `productName` is supplied, returning an empty array `[]`. Customer reviews never appear on the product page.
  3. The query fetches all approved reviews across the entire store into memory before filtering, which is unindexed and inefficient.
- **Recommended Correction:**
  1. Change signature to `fetchProductReviews(productId)`.
  2. Apply query filter in SQL: `.eq('product_id', productId).eq('is_approved', true)`.
  3. Update call sites in `ProductDetailPage.jsx:64` and `165` to pass `data.id` / `product.id`.

---

### BUG-02: Missing File Input for Avatar Upload in Profile UI
- **Status:** `CONFIRMED GAP`
- **Severity:** `MEDIUM`
- **File Paths & Line Numbers:**
  - [`src/pages/customer/ProfilePage.jsx:18-23`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProfilePage.jsx#L18-L23): Hardcoded `AVATAR_OPTIONS` array with 4 Unsplash URLs.
  - [`src/services/authService.js:30-47`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/authService.js#L30-L47): `uploadAvatar({ userId, file })` exists but is never imported or called anywhere in the UI.
- **Evidence:**
  `grep -rn "uploadAvatar" src/` returns only its definition in `authService.js`.
- **Actual Impact:**
  Customers cannot upload custom avatar image files. Avatar updates are restricted to preset URLs, preventing live exercise of the Phase 9.2 Supabase Storage avatar policies from the application.
- **Recommended Correction:**
  Add a custom file upload button in `ProfilePage.jsx` that validates file type (`image/(png|jpeg|webp|gif)`) and size (< 2MB), then calls `uploadAvatar`.

---

### BUG-03: Wishlist Context Operates Solely in LocalStorage Without Database Sync
- **Status:** `CONFIRMED ARCHITECTURAL GAP`
- **Severity:** `MEDIUM`
- **File Paths & Line Numbers:**
  - [`src/context/WishlistContext.jsx:4-18`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/context/WishlistContext.jsx#L4-L18): `STORAGE_KEY = 'shopkart_wishlist'`.
- **Evidence:**
  [`database/schema.sql:245-260`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/schema.sql#L245-L260) defines `wishlists` and `wishlist_items` tables with complete RLS policies. `WishlistContext.jsx` does not import `supabase` or `useAuth()`.
- **Actual Impact:**
  Authenticated users lose their wishlist when accessing the store from another browser or device.
- **Recommended Correction:**
  Implement a `wishlistService.js` supporting `fetchDatabaseWishlist`, `addToDatabaseWishlist`, and `removeFromDatabaseWishlist`, and connect `WishlistContext.jsx` to sync upon user login.

---

### BUG-04: Admin Coupons, Reviews & Banners CMS Disconnected from Supabase
- **Status:** `CONFIRMED ARCHITECTURAL GAP`
- **Severity:** `HIGH`
- **File Paths & Line Numbers:**
  - [`src/pages/admin/AdminCouponsPage.jsx:5`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/admin/AdminCouponsPage.jsx#L5): `COUPONS_STORAGE = 'shopkart_admin_coupons'`
  - [`src/pages/admin/AdminReviewsPage.jsx:5`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/admin/AdminReviewsPage.jsx#L5): `REVIEWS_STORAGE = 'shopkart_admin_reviews'`
  - [`src/pages/admin/AdminBannersPage.jsx:5`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/admin/AdminBannersPage.jsx#L5): `BANNERS_STORAGE = 'shopkart_admin_banners'`
- **Evidence:**
  `database/schema.sql` contains `coupons`, `reviews`, and `banners` tables with full schemas and admin RLS (`USING (is_admin())`). The admin pages read and write exclusively to browser `localStorage`.
- **Actual Impact:**
  Admin CMS operations do not modify database tables. When an admin creates a coupon or approves a review in the admin panel, the changes are local to their browser and have no effect on other users or the customer storefront.
- **Recommended Correction:**
  Implement service functions in `src/services/adminService.js` for coupon CRUD, review moderation (`is_approved` toggle), and banner CRUD, and connect the respective admin pages.

---

## 2. Suspected Issues (Requiring Runtime / Staging Verification)

### SUSP-01: Avatar Extension Case-Sensitivity in Storage RLS Regex
- **Status:** `SUSPECTED ISSUE`
- **Severity:** `LOW`
- **File Path:** [`supabase/phase-9.2/migration.sql:635`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/migration.sql#L635)
- **Description:**
  Storage policy regex: `storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')`. The case-sensitive operator `~` is used rather than `~*`. If an uploaded file has an uppercase extension (e.g. `avatar.JPG` or `avatar.PNG`), Supabase Storage RLS will reject the upload.
- **Recommended Correction:**
  In `authService.js`, normalize extension with `ext.toLowerCase()`, or use case-insensitive matching `~*` in SQL policy definitions.

### SUSP-02: Rapid Double-Click Order Submission in Checkout
- **Status:** `SUSPECTED ISSUE`
- **Severity:** `LOW`
- **File Path:** [`src/pages/customer/CheckoutPage.jsx:171`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CheckoutPage.jsx#L171)
- **Description:**
  While the UI disables the submit button during submission, there is no server-side idempotency key on `place_order`. A network retry or concurrent submission from multiple tabs could potentially place duplicate orders.
- **Recommended Correction:**
  Pass a unique client-generated checkout session UUID to `place_order` to enforce idempotency.
