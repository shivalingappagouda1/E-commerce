# SHOPKART — PHASE 5, STAGE A: READ-ONLY TECHNICAL AUDIT REPORT
**Audit Scope:** Admin Dashboard Database Integration (`AdminCouponsPage`, `AdminReviewsPage`, `AdminBannersPage`)  
**Audit Mode:** STRICT READ-ONLY TECHNICAL AUDIT (No `.js`, `.jsx`, `.mjs`, `.sql`, or config files modified)  
**Target Environment Architecture:** React 19 + Vite Frontend (`src/`) backed by Supabase PostgreSQL + RLS (`database/schema.sql`, `database/migrations/`, `supabase/phase-9.2/migration.sql`)

---

## 1. Executive Summary & Module Status Matrix

All three in-scope Admin modules (**Coupons**, **Reviews Moderation**, and **Banners**) are **100% disconnected from Supabase PostgreSQL**. They read, seed, mutate, and persist state exclusively in browser `localStorage` using synthetic mock identifiers, while customer-facing storefront, cart, product detail, and checkout workflows already query Supabase PostgreSQL (`public.coupons`, `public.reviews`, `public.banners`) whenever `isSupabaseConfigured` is `true`.

This split-brain architecture means that in any Supabase-configured staging or production deployment:
- **Coupons** created, toggled, or deleted in `AdminCouponsPage` are invisible to `CartPage`, `CheckoutPage`, and the PostgreSQL `place_order()` RPC.
- **Customer reviews** submitted in `ProductDetailPage` (which write to `public.reviews` with `is_approved = FALSE`) never appear in `AdminReviewsPage`, leaving administrators unable to moderate live customer feedback; furthermore, there is no automated database trigger updating `products.rating` and `products.review_count` when reviews are approved or deleted.
- **Banners** created, edited, reordered, or deactivated in `AdminBannersPage` never update `HomePage` (`HeroBanner`), and `HeroBanner.jsx` does not consume the `bg_from` / `bg_to` gradient columns stored in `public.banners`.

### Module Integration Status Summary

| Module | Current Data Source | Expected DB Table | Storefront / Backend Sync Status | Overall Readiness |
|---|---|---|---|---|
| **Coupons** (`src/pages/admin/AdminCouponsPage.jsx`) | `localStorage['shopkart_admin_coupons']` (`INITIAL_COUPONS`) | `public.coupons` | **Split-Brain:** Storefront `validateCoupon()` & `place_order()` RPC already use `public.coupons`; Admin is LocalStorage-only | **DISCONNECTED — Ready via `adminService` (No blocking SQL required)** |
| **Reviews** (`src/pages/admin/AdminReviewsPage.jsx`) | `localStorage['shopkart_admin_reviews']` (`INITIAL_REVIEWS`) | `public.reviews` (+ rollup to `public.products`) | **Split-Brain + Missing Rollup:** Customer `submitProductReview()` inserts `is_approved = FALSE` to `public.reviews`; Admin never sees DB rows & no DB trigger updates `products.rating` / `review_count` | **DISCONNECTED — Requires `adminService` + Product Rating Rollup Strategy** |
| **Banners** (`src/pages/admin/AdminBannersPage.jsx`) | `localStorage['shopkart_admin_banners']` (`SAMPLE_BANNERS`) | `public.banners` | **Split-Brain + Render Mismatch:** `HomePage` `fetchBanners()` reads `public.banners`; `HeroBanner.jsx` ignores `bg_from` / `bg_to`; Admin uses `Date.now()` (`> INT4` max), misses `image_url` / `sort_order` / `starts_at` / `ends_at` | **DISCONNECTED — Requires `adminService` + Schema Alignment & `HeroBanner` Fix** |

---

## 2. Verification of Baseline Schema vs. Migrations vs. Frontend Expectations

Careful reconciliation across `database/schema.sql`, `database/migrations/*.sql`, `supabase/phase-9.2/migration.sql`, `database/seed_staging.sql`, and frontend source reveals the following separation between verified database reality and unverified/missing frontend expectations:

1. **Verified Baseline Schema (`database/schema.sql`) & Migrations:**
   - **`public.coupons`** (`database/schema.sql:267-286`), **`public.reviews`** (`database/schema.sql:361-380`), and **`public.banners`** (`database/schema.sql:385-407`) are all defined in baseline SQL with RLS enabled (`database/schema.sql:632, 636, 637`) and `set_updated_at()` triggers (`database/schema.sql:281-284, 374-377, 402-405`).
   - **Order & Coupon Transaction Integrity (`database/migrations/phase7_1_security_and_cart_fixes.sql:317-362` & `phase8_1_inventory_restoration_safety.sql:37-56`):** `place_order(p_address_id, p_notes, p_coupon_code)` locks the matching `public.coupons` row (`WHERE UPPER(code) = v_clean_coupon FOR UPDATE`), validates `is_active`, `expires_at`, `max_uses`, `used_count`, and `min_order_value`, calculates `v_discount_amount`, and increments `used_count`. `restore_inventory_on_cancellation()` decrements `used_count` (`GREATEST(0, used_count - 1)`) on pre-fulfillment order cancellation (`pending`, `processing`).
   - **Phase 9 / Phase 9.2 Policy & Grant Hardening (`database/migrations/phase9_security_hardening_corrected.sql:119-126`, `supabase/phase-9.2/migration.sql:317-391, 464-490`):**
     - Admin `FOR ALL` policies on `coupons`, `banners`, and `reviews` are narrowed `TO authenticated` with `USING (public.is_admin()) WITH CHECK (public.is_admin())`.
     - `anon` retains `SELECT`-only table grants on `coupons`, `banners`, and `reviews`; `anon` has **zero** `EXECUTE` privilege on `public.is_admin()`.
     - `authenticated` holds `SELECT, INSERT, UPDATE, DELETE` grants on `coupons`, `banners`, and `reviews`.
   - **Storage Hardening (`database/migrations/phase9_2_storage_hardening.sql:27-44, 78-100`):** `public-assets` bucket `storage.objects` policies permit only avatar objects (`avatars/<auth.uid()>.<ext>`) and explicitly abort migration if unapproved permissive policies exist. Note that earlier `database/migrations/phase9_security_hardening.sql:166-171` included `"Admins full access to public-assets storage"`, whereas `phase9_2_storage_hardening.sql` only accepts the 4 customer avatar policy names in its conflict check. Accordingly, banner images should rely on HTTPS `image_url` values (consistent with `database/seed_staging.sql:52-89`) rather than assuming client Storage uploads for banners without separate SQL authorization.
2. **Unverified / Non-Existent Database Structures Expected or Implied by Frontend:**
   - **Coupons:** `max_discount` cap column does **not** exist in `public.coupons`; `CHECK (discount_value > 0)` does **not** constrain `percent` coupons to `<= 100` at the DB level; `code UNIQUE` is case-sensitive in PostgreSQL unless normalized to uppercase or backed by a functional unique index `UNIQUE (UPPER(code))`.
   - **Reviews:** No `product_name`, `user_name`, `helpful_count`, or `is_verified` columns exist on `public.reviews`; **`products.rating` and `products.review_count` have zero database triggers** updating them upon review moderation (`is_approved`) or deletion; `DEFAULT_STORE_SETTINGS.autoApproveReviews` (`src/services/adminService.js:29`, `src/pages/admin/AdminSettingsPage.jsx:369-370`) is ignored and overridden by RLS `"Users create own reviews"` (`WITH CHECK (auth.uid() = user_id AND is_approved = FALSE)`).
   - **Banners:** `public.banners` uses `SERIAL` (`INT4`) primary key and snake_case `cta_link`, `image_url`, `bg_from`, `bg_to`, `sort_order`, `starts_at`, `ends_at`. Neither `badge` nor `bg_gradient` (`HeroBanner.jsx:75, 92`) exists on `public.banners`.
   - **Remote Live Supabase State:** Cannot be queried in this offline read-only code audit (`UNVERIFIED` whether staging has all Phase 7.1, 8.1, 9, 9.2 migrations applied — runtime smoke checks are planned in Stage B4).

---

## 3. Detailed Module Audits

### A. Admin Coupons (`src/pages/admin/AdminCouponsPage.jsx` -> `public.coupons`)

1. **Current Implementation (`AdminCouponsPage.jsx:1-244`):**
   - Stores records in `localStorage` under `COUPONS_STORAGE = 'shopkart_admin_coupons'` (line 5), duplicating `COUPONS_STORAGE_KEY` in `src/services/productService.js:25`.
   - Re-seeds `INITIAL_COUPONS` (`'c1'` = `SHOPKART10`, `'c2'` = `WELCOME500`, lines 7-28) via `getInitialCoupons()` (lines 30-42) if the key is missing, corrupted, or not an array.
   - `handleCreate` (lines 55-71) constructs `id: \`c-\${Date.now()}\``, uppercases `code`, sets `discount_type`, `discount_value`, `min_order_value`, `max_uses`, `used_count: 0`, `is_active: true`, and calls `persist([newCoupon, ...coupons])`.
   - `handleToggleActive` (lines 73-75) and `handleDelete` (lines 77-81) mutate only `localStorage`.
   - **Missing Capabilities & Validation Gaps:**
     - Imports `Edit2` from `lucide-react` (line 2), but provides **no edit modal or update handler**.
     - **No `expires_at` support** in creation form, table display, or status indicators (`Expired` badge missing).
     - **No uniqueness check**: creating two coupons with the same code (or differing only in case) creates duplicates in LocalStorage and will throw PostgreSQL `23505` unique violation in Supabase.
     - **No percentage upper-bound validation**: allows `discount_value > 100` (e.g., `200%`) when `discount_type === 'percent'`, or `discount_value <= 0`, or negative `min_order_value`, or `max_uses <= 0`.
     - **No loading or error UI**: failures from DB/RLS/network cannot be displayed.
     - **Destructive delete hazard**: `orders.coupon_id` uses `ON DELETE SET NULL` (`database/schema.sql:295`). Deleting an actively used coupon removes FK linkage on historical orders (while `orders.discount_amount` remains). Deactivating (`is_active = false`) should be preferred when `used_count > 0`, with clear confirmation warning before hard delete.
2. **Storefront / Order Parity Check:**
   - `src/services/productService.js:536-588` (`validateCoupon`) queries `public.coupons` in Supabase mode, checking `is_active`, `expires_at`, `max_uses`/`used_count`, and `min_order_value`, and computes percentage/fixed discount matching `src/utils/couponHelpers.js:59-72` and `database/migrations/phase7_1_security_and_cart_fixes.sql:317-362`.
   - When Phase 5 wires `AdminCouponsPage` through `adminService.js` to `public.coupons`, coupons managed in Admin will immediately synchronize with Cart, Checkout, and `place_order()`.

---

### B. Admin Reviews Moderation (`src/pages/admin/AdminReviewsPage.jsx` -> `public.reviews`)

1. **Current Implementation (`AdminReviewsPage.jsx:1-135`):**
   - Uses `REVIEWS_STORAGE = 'shopkart_admin_reviews'` (line 5), duplicating `REVIEWS_STORAGE` exported by `src/services/productService.js:24`.
   - Re-seeds 3 synthetic reviews (`'rev-1'`, `'rev-2'`, `'rev-3'`, lines 7-38) containing flat string fields `product_name` and `user_name`, with zero `product_id` or `user_id` UUIDs.
   - Imports unused icons `Star`, `MessageSquare`, `ThumbsUp` (`AdminReviewsPage.jsx:2`).
   - Renders two action controls per row: Approve/Reject (`handleToggleApprove`, lines 57-61) and Delete without confirmation (`handleDelete`, lines 63-66).
   - **Missing Capabilities & Structural Gaps:**
     - **Storefront Split-Brain:** In Supabase mode, `productService.submitProductReview()` (`src/services/productService.js:473-506`) inserts real customer reviews into `public.reviews` with `is_approved: false` (`ProductDetailPage.jsx:164-171`). `productService.fetchProductReviews()` (`src/services/productService.js:423-450`) selects `.eq('is_approved', true)` with joined `profiles(full_name, avatar_url)`. Because `AdminReviewsPage` never queries `public.reviews`, real pending customer reviews **cannot be seen or approved anywhere in the Admin UI**.
     - **Schema Mismatch on Display Fields:** `public.reviews` stores `product_id` (FK -> `products.id`) and `user_id` (FK -> `profiles.id`), not `product_name` / `user_name`. Admin queries must select joined `products (id, name, slug)` and `profiles (id, full_name, avatar_url)`. Both joined tables permit admin `SELECT` via `"Admins full access to products"` (`database/schema.sql:941-944`) and `"Admins can view all profiles"` (`database/schema.sql:917-919`).
     - **Missing Filter / Search / Confirmation / Error Handling:** No status filter tabs (`All`, `Pending Approval`, `Approved`), no search by product/reviewer/content, no rating filter, no delete confirmation, no loading or error states.
     - **Customer Average Rating & Review Count Drift:** `public.products.rating` (`NUMERIC(3,2) DEFAULT 0`) and `public.products.review_count` (`INT DEFAULT 0`) (`database/schema.sql:124-125`) drive:
       - Storefront `HomePage.jsx:401-405` (`fetchBestSellers`, `.gte('rating', 4.5).order('review_count', { ascending: false })`, `productService.js:274-275`).
       - `ProductDetailPage.jsx:300` display count (`product.reviewCount || product.review_count || reviews.length || 148`).
       - Currently, **zero PostgreSQL triggers** update `products.rating` / `review_count` on `reviews` changes. In B2, admin moderation/deletion actions must synchronize `products.rating` and `products.review_count` from approved `reviews` (and ideally recommend a PostgreSQL trigger in Stage B / post-Phase 5 SQL hardening for concurrency safety).
     - **Preservation of Existing Tests:** `test_phase3_stage_b.mjs:24-35` performs static assertions against `src/services/productService.js` (`fetchProductReviews`, `r.product_id === productIdentifier`, `REVIEWS_STORAGE`). Any Phase 5 admin review integration should reside in `src/services/adminService.js` and `AdminReviewsPage.jsx` without altering those tested contracts in `productService.js`.

---

### C. Admin Banners (`src/pages/admin/AdminBannersPage.jsx` -> `public.banners`)

1. **Current Implementation (`AdminBannersPage.jsx:1-278`):**
   - Uses `BANNERS_STORAGE = 'shopkart_admin_banners'` (line 5), duplicating `ADMIN_BANNERS_STORAGE` in `src/services/adminService.js:9` and `BANNERS_STORAGE_KEY` in `src/services/productService.js:23`.
   - Seeds `SAMPLE_BANNERS` directly (`src/pages/admin/AdminBannersPage.jsx:6, 37`), which defines `id: 1..3`, `ctaLink`, `bgFrom`, `bgTo`, and `image: null`.
   - `handleSubmit` creates new rows with `id: Date.now()` (line 73).
   - **Critical Integer Overflow Risk:** `public.banners.id` is `SERIAL PRIMARY KEY` (32-bit signed `INTEGER`, max `2,147,483,647`), whereas `Date.now()` returns milliseconds since epoch (`~1,794,000,000,000`, which exceeds `INT4` max by >800x). Inserts to PostgreSQL MUST omit `id` and let `banners_id_seq` assign the primary key.
   - **Missing Schema Fields in Admin UI:**
     - `image_url`: `AdminBannersPage` has no input for banner image URL or visual preview, even though `public.banners.image_url` (`database/schema.sql:391`) is actively seeded in `database/seed_staging.sql:52-89` and rendered by `HeroBanner.jsx:65`.
     - `sort_order`: `AdminBannersPage` has no `sort_order` input or ordering controls, even though `productService.fetchBanners()` orders by `.order('sort_order', { ascending: true })` (`productService.js:161`).
     - `starts_at` / `ends_at`: `AdminBannersPage` does not expose campaign start/end scheduling timestamps, even though RLS `"Public can view active banners"` (`database/schema.sql:680-686`) actively hides banners outside `[starts_at, ends_at)`.
   - **Critical Storefront Rendering Mismatch (`HeroBanner.jsx` vs `public.banners`):**
     - `HomePage.jsx:357, 365` loads banners via `fetchBanners()` and renders `<HeroBanner banners={banners} />`.
     - `HeroBanner.jsx:65-66, 75, 92` reads `banner.image || banner.image_url`, `banner.ctaLink || banner.cta_link || '/'`, `banner.bgGradient || 'from-slate-950 to-brand-950'`, and `banner.badge || 'Featured Collection'`.
     - Because `public.banners` has `bg_from` and `bg_to` hex columns (not `bg_gradient` or `badge`), `HeroBanner.jsx` ignores admin-saved hex gradient colors (`#1e3a5f` -> `#2563eb`) on **all** database-fetched banners! Updating `HeroBanner.jsx` to support `bg_from` / `bg_to` inline CSS gradients (while retaining Tailwind `bgGradient` fallback for `DEFAULT_HERO_BANNERS`) makes Admin Banner styling work end-to-end without requiring schema alterations.

---

## 4. Auth, Role & RLS Security Boundary Verification

1. **Frontend Route & Identity Guards:**
   - All admin routes (`/admin`, `/admin/banners`, `/admin/coupons`, `/admin/reviews`, etc.) are wrapped in `<AuthGuard requireAdmin={true}><AdminLayout /></AuthGuard>` (`src/routes/AppRoutes.jsx:102-121`).
   - `AuthGuard.jsx:34-46` enforces authentication and `isAdmin`, redirecting non-admins to `/`.
   - `AuthContext.jsx:35-36` computes `safeProfile = resolveScopedProfile(user, profileState)` and `isAdmin = resolveIsAdmin(user, safeProfile)` (`src/utils/authHelpers.js:19-26`), verifying `user?.id` matches `safeProfile.id` and `safeProfile.role === 'admin'` via sequence-protected `fetchProfile()`.
   - Minor UI inconsistency in `src/components/admin/AdminLayout.jsx:106-109`: header hardcodes `'Admin User'` and `'admin@shopkart.in'` instead of reading the signed-in admin's `profile`/`user`.
2. **Database RLS & Table Privileges (Authoritative Security Layer):**
   - `public.is_admin()` (`database/schema.sql:415-430`, hardened by `phase9_2_function_security_hardening.sql:130-131` & `supabase/phase-9.2/migration.sql:376, 387`) is `SECURITY DEFINER SET search_path = ''`, revoked from `PUBLIC` and `anon`, and granted strictly to `authenticated`.
   - `public.coupons`, `public.reviews`, and `public.banners` all have:
     - RLS **enabled**.
     - `Admins full access to <table_name>` (`FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())`).
     - `SELECT, INSERT, UPDATE, DELETE` table privileges granted to `authenticated` (`supabase/phase-9.2/migration.sql:348-370`).
   - **Customer Privacy & Non-Leakage Boundary:**
     - `adminService` functions for coupons, reviews, and banners MUST reject/fail cleanly if Supabase returns an RLS error or empty database set—**never** silently falling back to `localStorage` mock records when `isSupabaseConfigured` is `true` (avoiding the anti-pattern seen in `adminService.js:549-557` and `520-531`).
3. **Mock-Mode Isolation Audit (`localStorage` Risks):**
   - Currently `AdminCouponsPage.jsx`, `AdminReviewsPage.jsx`, and `AdminBannersPage.jsx` seed demo rows automatically if `localStorage` is empty and contain synthetic IDs (`'c1'`, `'c2'`, `'c-' + timestamp`, `'rev-1'..'rev-3'`, `1..3`, `Date.now()`).
   - **Safe Migration Rule:** Live Supabase admin pages must **never** auto-import or auto-upload `localStorage` mock rows into PostgreSQL on login or mount, as synthetic IDs and dummy customer/product names would fail UUID/FK validation or pollute production tables. LocalStorage fallback must run **strictly** when `!isSupabaseConfigured` (`isMock() === true`), and stale legacy mock keys should not be surfaced when Supabase is configured.
