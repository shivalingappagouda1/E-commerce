# SHOPKART — PHASE 5, STAGE A: STAGED IMPLEMENTATION PLAN
**Goal:** Replace all LocalStorage mock logic in Admin Coupons, Admin Reviews Moderation, and Admin Banners with genuine Supabase PostgreSQL integration, while preserving clean offline demo fallback strictly when `!isSupabaseConfigured` and keeping existing Phase 3, Phase 4, and Phase 9 security guarantees intact.

---

## Stage Dependencies Overview

1. **Stage B1 (Admin Coupons)** -> Independent; shares strict `isMock()` service conventions in `src/services/adminService.js`.
2. **Stage B2 (Admin Reviews Moderation)** -> Independent of B1; must coordinate `products.rating` & `products.review_count` recalculation and preserve `test_phase3_stage_b.mjs` contracts in `productService.js`.
3. **Stage B3 (Admin Banners + `HeroBanner` Alignment)** -> Independent of B1/B2; updates both `adminService.js`/`AdminBannersPage.jsx` AND `src/components/layout/HeroBanner.jsx` for `bg_from` / `bg_to` rendering parity.
4. **Stage B4 (Cross-Module Verification, Regression Testing & Staging Smoke Checks)** -> Depends on B1, B2, and B3 completion.

---

## Stage B1 — Admin Coupons Integration (`public.coupons`)

- **Files to Modify:**
  - `src/services/adminService.js`:
    - Import `COUPONS_STORAGE_KEY` from `./productService` (or define canonical key matching `'shopkart_admin_coupons'`).
    - Implement strict `isMock()` helper (`!isSupabaseConfigured || !supabase`) for all new Phase 5 admin methods (no fallback to LocalStorage when Supabase is configured).
    - Add:
      - `adminFetchCoupons()` -> `.from('coupons').select('*').order('created_at', { ascending: false })`
      - `adminSaveCoupon(coupon)` -> validates/normalizes (`code.trim().toUpperCase()`, `discount_type` `'percent'`|`'fixed'`, `discount_value > 0` and `<= 100` for `'percent'`, `min_order_value >= 0`, `max_uses` null or positive integer, `expires_at` ISO string or null, `is_active` boolean); omits `id` on create, `.eq('id', coupon.id)` on update; maps PostgreSQL `23505` unique violation to clear duplicate-code error message.
      - `adminToggleCouponActive(id, currentActive)` -> `.from('coupons').update({ is_active: !currentActive }).eq('id', id).select().single()`
      - `adminDeleteCoupon(id)` -> `.from('coupons').delete().eq('id', id)`
  - `src/pages/admin/AdminCouponsPage.jsx`:
    - Remove inline `COUPONS_STORAGE` and `INITIAL_COUPONS` direct seeding; consume `adminService.js`.
    - Add loading state, dismissible API error banner, and computed status badges (`Active`, `Inactive`, `Expired`, `Limit Reached`).
    - Implement **Edit Coupon** modal reusing validation rules (fixing unused `Edit2` import).
    - Add `expires_at` optional date/datetime input and table expiry display.
    - Add protective confirmation messaging when deleting a coupon with `used_count > 0` (advising soft-deactivate since `orders.coupon_id` is `ON DELETE SET NULL`).
- **Risks & Acceptance Criteria:**
  - Creating/editing/toggling/deleting a coupon in Supabase mode reflects immediately in `CartPage` / `CheckoutPage` `validateCoupon()` and PostgreSQL `place_order()`.
  - Duplicate coupon code shows readable error without crashing UI.
  - Empty `public.coupons` table displays an empty state (never re-seeds demo coupons in Supabase mode).

---

## Stage B2 — Admin Reviews Moderation Integration (`public.reviews` + `products` Rollup)

- **Files to Modify:**
  - `src/services/adminService.js`:
    - Add `adminFetchReviews()` -> queries:
      ```js
      supabase
        .from('reviews')
        .select('id, product_id, user_id, rating, title, body, is_approved, created_at, updated_at, products(id, name, slug), profiles(id, full_name, avatar_url)')
        .order('created_at', { ascending: false })
      ```
      Maps safe display fields `product_name: r.products?.name || 'Unknown Product'`, `product_slug: r.products?.slug || null`, `user_name: r.profiles?.full_name || 'Customer'`.
    - Add helper `recalculateProductRating(productId)` -> fetches approved reviews (`is_approved = true`) for `productId` from `public.reviews`, computes `review_count` and rounded `rating` (`NUMERIC(3,2)`, `0` if count is `0`), and updates `public.products`.
    - Add `adminModerateReview(reviewId, isApproved, productId)` -> updates `is_approved` on `public.reviews`, then calls `recalculateProductRating(productId)`. Return updated row + any non-fatal rollup warning cleanly.
    - Add `adminDeleteReview(reviewId, productId)` -> deletes review row from `public.reviews`, then calls `recalculateProductRating(productId)`.
    - Mock fallback when `!isSupabaseConfigured`: reads/writes `REVIEWS_STORAGE` cleanly for offline mode only.
  - `src/pages/admin/AdminReviewsPage.jsx`:
    - Remove inline `REVIEWS_STORAGE` and `INITIAL_REVIEWS`; consume `adminService.js`.
    - Add status filter tabs (`All`, `Pending`, `Approved`), text search (product/reviewer/title/body), and optional rating filter.
    - Add loading state, error banner, busy state per row (preventing double clicks), and confirmation prompt before deletion.
    - Ensure unused icon imports are either utilized meaningfully (e.g., `Star`, `MessageSquare`) or cleaned up.
- **Database Integrity Note:**
  - **Do not** break `src/services/productService.js` contracts covered by `test_phase3_stage_b.mjs`.
  - Document clearly that client-initiated `recalculateProductRating()` is an authorized Stage B2 bridge (using `Admins full access to products`) and recommend adding an atomic SQL `AFTER INSERT OR UPDATE OR DELETE ON public.reviews` trigger in any subsequent SQL hardening pass.

---

## Stage B3 — Admin Banners Integration (`public.banners` + `HeroBanner` Parity)

- **Files to Modify:**
  - `src/services/adminService.js`:
    - Add `adminFetchBanners()` -> `.from('banners').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true })`
    - Add `adminSaveBanner(banner)` -> validates non-empty `title`, optional valid URL/route `cta_link`, optional valid HTTPS `image_url`, valid hex `bg_from` / `bg_to`, integer `sort_order >= 0`, `ends_at > starts_at` when both present; omits `id` on insert (`SERIAL`), uses `.eq('id', banner.id)` on update. Never passes `Date.now()` to PostgreSQL!
    - Add `adminToggleBannerActive(id, currentActive)` and `adminDeleteBanner(id)`.
    - Explicit `!isSupabaseConfigured` mock fallback using `ADMIN_BANNERS_STORAGE` + `SAMPLE_BANNERS`.
  - `src/pages/admin/AdminBannersPage.jsx`:
    - Remove inline `BANNERS_STORAGE` and direct `SAMPLE_BANNERS` import; use `adminService.js`.
    - Upgrade form fields to cover complete `public.banners` schema: `title`, `subtitle`, `cta`, `cta_link`, `image_url` (with live thumbnail preview & fallback handling), `bg_from`, `bg_to`, `sort_order`, `starts_at`, `ends_at`, `is_active`.
    - Add loading state, API error banner, schedule badges (`Active`, `Scheduled`, `Ended`, `Inactive`), and delete confirmation.
  - `src/components/layout/HeroBanner.jsx`:
    - Update slide container background styling so when `banner.bgGradient` is absent (which is true for all DB rows from `public.banners`), if `banner.bg_from` / `banner.bg_to` (or `bgFrom` / `bgTo`) exist, apply `style={{ backgroundImage: \`linear-gradient(to right, \${from}, \${to})\` }}` rather than ignoring DB colors!
    - Retain `bgGradient` and `DEFAULT_HERO_BANNERS` fallback intact when `!isSupabaseConfigured`.
  - *(Optional / P3 polish)* `src/components/admin/AdminLayout.jsx`:
    - Replace hardcoded `'Admin User'` / `'admin@shopkart.in'` with `profile?.full_name` and `user?.email` from `useAuth()`.

---

## Stage B4 — Cross-Module Verification, Automated Tests & Staging Smoke Testing

1. **Focused Automated Test Suite (`test_phase5_admin_integration.mjs` + existing regression suites):**
   - Unit / mocked-client behavioral tests covering:
     - Coupon payload normalization (`UPPER` trim), `%` upper-bound guard (`> 100` rejected), `max_uses: null` handling, duplicate `23505` mapping, and strict Supabase non-fallback on empty/error responses.
     - Review moderation `is_approved` toggle, joined `products` / `profiles` display mapping, `recalculateProductRating` math (including rounding to 2 decimals and `0` when last approved review deleted/unapproved), and pending-to-approved transition.
     - Banner `INSERT` omitting `id` (verifying `Date.now()` is never sent to DB), `cta_link`/`image_url`/`bg_from`/`bg_to`/`sort_order`/`starts_at`/`ends_at` mapping, invalid schedule (`ends_at <= starts_at`) rejection, and `HeroBanner` gradient resolution from `bg_from` + `bg_to`.
   - Re-run all existing test scripts (`test_phase3_stage_b.mjs`, `test_phase4_stage_b1.mjs`, `test_phase4_stage_b1_corrections.mjs`, `test_phase4_stage_b2.mjs`, `test_stage_b_corrections.mjs`, `test_cancellation_suite.mjs`, `test_phase8_1_restoration_safety.mjs`, `test_phase9_validation.mjs`, `test_phase9_2_validation.mjs`).
2. **Static Verification:**
   - Run `npm run lint` (`oxlint`) and `npm run build` (`vite build`) after implementation.
3. **Staging Manual Runtime Checklist (requires live Supabase project):**
   - Authenticated **Admin** vs **Customer** (`anon` / `customer` role):
     - Confirm Customer & `anon` receive RLS denials on direct inserts/updates/deletes to `coupons`, `banners`, and `reviews.is_approved = TRUE`.
     - Confirm Admin creates coupon -> Customer applies in Cart/Checkout -> `place_order` increments `used_count` -> Admin refreshes and sees updated `used_count` -> Customer cancels `pending` order -> `used_count` decrements back.
     - Confirm Customer submits review (`is_approved = false`, invisible on `ProductDetailPage`) -> Admin sees pending review in `AdminReviewsPage` -> Admin clicks Approve -> review appears on `ProductDetailPage` and `products.rating` / `review_count` update.
     - Confirm Admin creates/reorders/updates gradient colors & `image_url` of banner -> `HomePage` `HeroBanner` renders updated slide, order, image, and gradient -> Admin deactivates or schedules future `starts_at` -> slide disappears from storefront immediately.
