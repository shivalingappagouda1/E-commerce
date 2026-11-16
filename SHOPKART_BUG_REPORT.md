# ShopKart — Bug Report & Vulnerability Register

**Date:** 11 November 2026  
**Auditor:** Senior Full-Stack Engineer  
**Classification:** Critical | High | Medium | Low  

---

## 1. High-Priority Bugs

### Bug 1: Product Review Fetching Logic Broken by Schema Mismatch
- **Exact File Path:** [`src/pages/customer/ProductDetailPage.jsx`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L62-L66) & [`src/services/productService.js`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/productService.js#L420-L440)
- **Relevant Component / Function:** `fetchProductReviews(productName)`
- **Description:**
  In `ProductDetailPage.jsx` line 64:
  ```javascript
  fetchProductReviews(data.name).then(({ data: revs }) => { setReviews(revs || []) })
  ```
  `fetchProductReviews` receives `data.name` and executes:
  ```javascript
  const { data, error } = await supabase.from('reviews').select('*, profiles(full_name, avatar_url)').eq('is_approved', true)
  const matching = (data || []).filter(r => (!productName || (r.product_name && r.product_name.toLowerCase().includes(productName.toLowerCase()))))
  ```
  In PostgreSQL, the `reviews` table (`database/schema.sql:361`) has columns: `id, product_id, user_id, rating, title, body, is_approved, created_at, updated_at`.
  There is **no `product_name` column** on the `reviews` table! Consequently:
  1. `r.product_name` is always `undefined`.
  2. The filter excludes all reviews, causing approved customer reviews to never display on the product detail page.
  3. Querying all reviews storewide and filtering client-side is an unindexed $O(N)$ memory leak.
- **Severity:** `HIGH`
- **Suggested Correction:**
  1. Change `fetchProductReviews` signature to `fetchProductReviews(productId)`.
  2. In `productService.js`, query `supabase.from('reviews').select('*, profiles(full_name, avatar_url)').eq('product_id', productId).eq('is_approved', true)`.
  3. In `ProductDetailPage.jsx`, invoke `fetchProductReviews(data.id)`.
- **Independently Verified?** YES (Verified against `database/schema.sql` and `ProductDetailPage.jsx`).

---

### Bug 2: Missing UI Hook for Profile Avatar File Upload to Supabase Storage
- **Exact File Path:** [`src/pages/customer/ProfilePage.jsx`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProfilePage.jsx#L18-L23) & [`src/services/authService.js`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/authService.js#L29-L47)
- **Relevant Component / Function:** `ProfilePage.jsx` & `uploadAvatar({ userId, file })`
- **Description:**
  `authService.js` provides a working `uploadAvatar` function uploading to `public-assets/avatars/${userId}.${ext}`. However, `ProfilePage.jsx` only presents 4 hardcoded Unsplash image URLs (`AVATAR_OPTIONS`) and provides no `<input type="file" accept="image/*">` element. Customers cannot upload custom avatars, leaving the Phase 9.2 Storage policies untestable through the application UI.
- **Severity:** `MEDIUM`
- **Suggested Correction:**
  Add a file input to `ProfilePage.jsx` that calls `uploadAvatar` with `user.id` and the selected image file, updating `selectedAvatar` with the returned `publicUrl`.
- **Independently Verified?** YES (Verified in `ProfilePage.jsx` lines 18-23).

---

### Bug 3: Wishlist Lacks Supabase Database Persistence for Authenticated Users
- **Exact File Path:** [`src/context/WishlistContext.jsx`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/context/WishlistContext.jsx#L1-L42)
- **Relevant Component / Function:** `WishlistProvider`, `toggle`, `isWishlisted`
- **Description:**
  `WishlistContext.jsx` persists exclusively to `localStorage` (`shopkart_wishlist`). It never interacts with Supabase, despite `database/schema.sql` having complete `wishlists` and `wishlist_items` tables with RLS policies. If a user logs in on a second device, their wishlist is empty.
- **Severity:** `MEDIUM`
- **Suggested Correction:**
  Implement a `wishlistService.js` that mirrors `cartService.js`:
  - When user is authenticated, sync wishlist items with `wishlists` and `wishlist_items` tables.
  - On login, merge local items with database wishlist.
- **Independently Verified?** YES (Verified in `WishlistContext.jsx`).

---

### Bug 4: Admin Coupons, Reviews & Banners Not Backed by Supabase Database
- **Exact File Paths:**
  - [`src/pages/admin/AdminCouponsPage.jsx`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/admin/AdminCouponsPage.jsx#L5)
  - [`src/pages/admin/AdminReviewsPage.jsx`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/admin/AdminReviewsPage.jsx#L5)
  - [`src/pages/admin/AdminBannersPage.jsx`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/admin/AdminBannersPage.jsx#L5)
  - [`src/services/adminService.js`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/adminService.js#L925-L939)
- **Relevant Component / Function:** Admin CMS Pages
- **Description:**
  `AdminCouponsPage.jsx`, `AdminReviewsPage.jsx`, and `AdminBannersPage.jsx` read and write to `localStorage` keys (`shopkart_admin_coupons`, `shopkart_admin_reviews`, `shopkart_admin_banners`). The database schema contains `coupons`, `reviews`, and `banners` tables with full schemas and RLS. When an admin creates or edits coupons/banners in the admin panel, the changes are stored only in their local browser and do not affect the public storefront or other users.
- **Severity:** `HIGH`
- **Suggested Correction:**
  Connect `adminService.js` to the respective database tables:
  - Coupons: CRUD on `public.coupons` table.
  - Reviews: Fetch from `public.reviews` and update `is_approved` status.
  - Banners: CRUD on `public.banners` table.
- **Independently Verified?** YES (Verified in admin pages and `adminService.js`).

---

### Bug 5: Checkout Payment Processing Is Purely Simulated Without Gateway Integration
- **Exact File Path:** [`src/pages/customer/CheckoutPage.jsx`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CheckoutPage.jsx#L171-L181) & [`database/schema.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/schema.sql#L337-L360)
- **Relevant Component / Function:** `CheckoutPage.jsx:placeOrder`
- **Description:**
  Selecting "Online Payment (UPI / Cards)" in `CheckoutPage.jsx` merely prepends `'Payment method: ONLINE'` to order notes. No payment gateway (Razorpay / Cashfree / Stripe) is invoked, and no payment transaction is recorded in the PostgreSQL `payments` table.
- **Severity:** `MEDIUM` (Phase 6 Objective)
- **Suggested Correction:**
  In Phase 6, implement a secure server-side or SDK-based payment flow (e.g. Razorpay/Stripe checkout) that creates a pending payment record, verifies payment webhook signatures, and updates order status to `processing`.
- **Independently Verified?** YES (Verified in `CheckoutPage.jsx`).

---

## 2. Low-Priority / Code Quality Findings (Oxlint)

### Finding 1: Unused Variable in RegisterPage.jsx
- **File:** `src/pages/customer/RegisterPage.jsx:9:9`
- **Issue:** `const navigate = useNavigate()` is declared but unused.
- **Severity:** `LOW`
- **Correction:** Remove or use `navigate` upon successful registration.
- **Independently Verified?** YES (`oxlint` warning).

### Finding 2: Unused Imports in Admin Pages
- **Files:** `AdminReviewsPage.jsx`, `AdminCategoriesPage.jsx`, `AdminOrdersPage.jsx`
- **Issue:** Unused Lucide icons (`Star`, `MessageSquare`, `ThumbsUp`, `Tags`, `AlertCircle`, `Clock`, `Package`, `MapPin`, etc.).
- **Severity:** `LOW`
- **Correction:** Remove unused imports to keep bundle lean.
- **Independently Verified?** YES (`oxlint` output).
