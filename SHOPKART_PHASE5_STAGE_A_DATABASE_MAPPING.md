# SHOPKART — PHASE 5, STAGE A: DATABASE MAPPING & RLS MATRIX
**Audit Scope:** Field-by-field mapping, constraints, RLS rules, privilege grants, and store-integration flows for `public.coupons`, `public.reviews`, and `public.banners`.

---

## 1. Coupons (`public.coupons` <-> `AdminCouponsPage.jsx`)

### Schema Definition (`database/schema.sql:267-286`)
| DB Column | PostgreSQL Type & Constraints | Admin Mock Field (`AdminCouponsPage.jsx`) | Storefront Usage (`productService.js` & `place_order`) | Phase 5 Target Mapping & Validation Rule |
|---|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `'c1'`, `'c2'`, `` `c-${Date.now()}` `` (**INVALID non-UUID**) | Queried by `validateCoupon` / `orders.coupon_id` | Omit on `INSERT` (DB generates UUID); pass valid UUID on `UPDATE` / `DELETE` |
| `code` | `TEXT NOT NULL UNIQUE` (indexed `idx_coupons_code`) | `code` (`string`, uppercased on submit) | `validateCoupon` uses `.eq('code', cleanCode)`; `place_order` uses `UPPER(code) = v_clean_coupon` | Require non-empty, normalize `.trim().toUpperCase()`, map `23505` to friendly duplicate-code error |
| `discount_type` | `TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed'))` | `discount_type` (`'percent'` \| `'fixed'`) | `place_order` & `couponHelpers.calculateCouponDiscount` | Select `'percent'` or `'fixed'` only |
| `discount_value` | `NUMERIC(10,2) NOT NULL CHECK (discount_value > 0)` | `discount_value` (string/number) | `place_order` calculates `%` or `LEAST(subtotal, value)` | Numeric `> 0`; if `discount_type === 'percent'`, enforce `<= 100` in frontend/service |
| `min_order_value` | `NUMERIC(10,2) DEFAULT 0 CHECK (min_order_value >= 0)` | `min_order_value` (default `0`) | Validated by both `validateCoupon` and `place_order` | Numeric `>= 0` (empty -> `0`) |
| `max_uses` | `INT CHECK (max_uses IS NULL OR max_uses > 0)` | `max_uses` (`null` or int) | Checked via `used_count >= max_uses` | Optional positive integer `>= 1`; blank -> `null` (never `0`, which violates `CHECK`) |
| `used_count` | `INT NOT NULL DEFAULT 0 CHECK (used_count >= 0)` | `used_count` (`0`) | Incremented by `place_order`; decremented by `restore_inventory_on_cancellation` | Read-only in Admin UI; default `0` on insert, never overwritten on edit |
| `expires_at` | `TIMESTAMPTZ` (nullable) | **Missing in UI** | Checked via `expires_at < NOW()` (`validateCoupon`, `place_order`, RLS `expires_at > NOW()`) | Date/datetime-local input converted to ISO UTC (`null` when empty); display `Expired` state |
| `is_active` | `BOOLEAN NOT NULL DEFAULT TRUE` | `is_active` (`true`/`false`) | Filtered in `validateCoupon`, RLS, and `place_order` | Toggle switch in table & edit/create modal |
| `created_at` / `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` (`updated_at` trigger) | **Missing in UI** | Informational / ordering (`ORDER BY created_at DESC`) | Managed automatically by DB; display in table metadata |
| *(N/A — unverified expectation)* | *Not in DB* | *None (prompt checked `max_discount`)* | *Not present in `validateCoupon` or `place_order`* | Do **not** invent/send `max_discount` column to Supabase |

---

## 2. Reviews Moderation (`public.reviews` <-> `AdminReviewsPage.jsx`)

### Schema Definition (`database/schema.sql:361-380`)
| DB Column | PostgreSQL Type & Constraints | Admin Mock Field (`AdminReviewsPage.jsx`) | Storefront Usage (`productService.js` & `ProductDetailPage.jsx`) | Phase 5 Target Mapping & Moderation Behavior |
|---|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `'rev-1'`, `'rev-2'`, `'rev-3'` (**INVALID non-UUID**) | Key in `reviews.map(rev => ...)` | UUID string from DB; used in `.eq('id', reviewId)` |
| `product_id` | `UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE` | **Missing in UI** (only flat `product_name`) | `fetchProductReviews` filters `.eq('product_id', productIdentifier)` | Join `products ( id, name, slug )` -> expose `product_name` safely; keep `product_id` for rating rollup |
| `user_id` | `UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE` | **Missing in UI** (only flat `user_name`) | `submitProductReview` inserts `auth.uid()` | Join `profiles ( id, full_name, avatar_url )` -> expose `user_name = profiles?.full_name || 'Customer'` |
| `rating` | `INT NOT NULL CHECK (rating BETWEEN 1 AND 5)` | `rating` (`1..5`) | Rendered as stars in `ProductDetailPage.jsx` | Display 1–5 star rating; filterable in Admin |
| `title` | `TEXT` | `title` | Headline on review card | Nullable string display |
| `body` | `TEXT` | `body` | Comment text on review card | Nullable string display |
| `is_approved` | `BOOLEAN NOT NULL DEFAULT FALSE` | `is_approved` (seed had `true`/`false`) | `submitProductReview` inserts `false`; `fetchProductReviews` filters `.eq('is_approved', true)` | Admin toggles `true` (Approve) / `false` (Hide/Pending) via `UPDATE` + refreshes `products` rating rollup |
| `created_at` / `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` (`updated_at` trigger) | `created_at` | Ordered descending on product page | Order Admin moderation queue by `is_approved ASC, created_at DESC` or `created_at DESC` |
| *(Constraint)* | `UNIQUE (product_id, user_id)` | N/A | Prevents duplicate reviews per user per product (`23505` mapped in `submitProductReview`) | Preserved; admin `DELETE` allows user to re-review if removed |
| *(Rollup Target)* | `products.rating` `NUMERIC(3,2)`, `products.review_count` `INT` | **Not updated** | `fetchBestSellers()` filters `rating >= 4.5` & orders by `review_count`; `ProductDetailPage.jsx:300` | Recalculate from all `reviews WHERE product_id = X AND is_approved = true` on approve/reject/delete |

---

## 3. Banners (`public.banners` <-> `AdminBannersPage.jsx` & `HeroBanner.jsx`)

### Schema Definition (`database/schema.sql:385-407`)
| DB Column | PostgreSQL Type & Constraints | Admin Mock Field (`AdminBannersPage.jsx`) | Storefront Usage (`productService.fetchBanners` & `HeroBanner.jsx`) | Phase 5 Target Mapping & Alignment |
|---|---|---|---|---|
| `id` | `SERIAL PRIMARY KEY` (`INT4` auto-increment via `banners_id_seq`) | `1, 2, 3` or `Date.now()` (**OVERFLOWS `INT4`!**) | React key `banner.id` | **Omit `id` on `INSERT`**; pass integer `id` on `UPDATE` / `DELETE` |
| `title` | `TEXT NOT NULL` | `title` | Hero `<h1>` title (`HeroBanner.jsx`) | Required non-empty trimmed string |
| `subtitle` | `TEXT` | `subtitle` | Hero subtitle paragraph | Optional trimmed string (`null` if empty) |
| `cta` | `TEXT` | `cta` (default `'Shop Now'`) | Button text (`banner.cta \|\| 'Shop Now'`) | Optional text (default `'Shop Now'`) |
| `cta_link` | `TEXT` | `ctaLink` (**camelCase mismatch**) | `banner.ctaLink \|\| banner.cta_link \|\| '/'` (`HeroBanner.jsx:66`) | Persist to `cta_link`; validate relative `/...` or `https://...` route; map cleanly in UI |
| `image_url` | `TEXT` | **Missing in `AdminBannersPage`** (`SAMPLE_BANNERS` has `image: null`) | `banner.image \|\| banner.image_url` (`HeroBanner.jsx:65`) | Add HTTPS URL input + live thumbnail preview in Admin modal; persist to `image_url` |
| `bg_from` | `TEXT DEFAULT '#1e3a5f'` | `bgFrom` (**camelCase mismatch**) | **NOT READ** by `HeroBanner.jsx` (bug!) | Persist hex color to `bg_from`; update `HeroBanner.jsx` to apply gradient from `bg_from` + `bg_to` |
| `bg_to` | `TEXT DEFAULT '#2563eb'` | `bgTo` (**camelCase mismatch**) | **NOT READ** by `HeroBanner.jsx` (bug!) | Persist hex color to `bg_to`; update `HeroBanner.jsx` to apply gradient from `bg_from` + `bg_to` |
| `sort_order` | `INT NOT NULL DEFAULT 0` | **Missing in UI** | `fetchBanners()` `.order('sort_order', { ascending: true })` | Numeric integer input + order controls in Admin; fetch sorted by `sort_order ASC, id ASC` |
| `is_active` | `BOOLEAN NOT NULL DEFAULT TRUE` | `is_active` | Filtered in `fetchBanners()` + RLS | Toggle in table and modal |
| `starts_at` | `TIMESTAMPTZ` (nullable) | **Missing in UI** | Enforced by RLS `"Public can view active banners"` (`starts_at IS NULL OR starts_at <= NOW()`) | Optional datetime-local input -> ISO UTC or `null` |
| `ends_at` | `TIMESTAMPTZ` (nullable) | **Missing in UI** | Enforced by RLS `"Public can view active banners"` (`ends_at IS NULL OR ends_at > NOW()`) | Optional datetime-local input -> ISO UTC or `null`; validate `ends_at > starts_at` when both set |
| *(N/A — unverified expectation)* | *Not in DB* (`badge`, `bg_gradient` missing) | *Not in Admin* | `HeroBanner.jsx:75, 92` falls back to `'from-slate-950 to-brand-950'` & `'Featured Collection'` | Fix `HeroBanner.jsx` gradient via `bg_from`/`bg_to`; optionally fall back cleanly on badge without requiring DB changes |

---

## 4. RLS Policies, Table Privileges & Function ACL Verification

Source of truth: `database/schema.sql`, `database/migrations/phase9_security_hardening_corrected.sql`, `supabase/phase-9.2/migration.sql`, `database/migrations/phase9_2_function_security_hardening.sql`, `database/migrations/phase9_2_storage_hardening.sql`.

| Target Object | RLS Enabled | Public / `anon` Privileges & Policies | `authenticated` Customer Privileges & Policies | `authenticated` Admin Privileges & Policies | Assessment for Phase 5 |
|---|---|---|---|---|---|
| `public.coupons` | Yes (`schema.sql:632`) | `SELECT` grant; Policy `"Public can view active valid coupons"` (`is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())`) | `SELECT, INSERT, UPDATE, DELETE` table grant (gated by RLS); reads valid active coupons | Policy `"Admins full access to coupons"` (`FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())`) | **Sufficient** — Admin sees & manages all coupons (active/inactive/expired). Non-admins blocked from mutations & inactive/expired rows. |
| `public.reviews` | Yes (`schema.sql:636`) | `SELECT` grant; Policy `"Public can view approved reviews"` (`is_approved = TRUE`) | `SELECT, INSERT, UPDATE, DELETE` grant; own pending SELECT, INSERT/UPDATE restricted by `is_approved = FALSE`, own DELETE | Policy `"Admins full access to reviews"` (`FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())`) | **Sufficient** — Admin sees pending + approved reviews, approves/unapproves, and deletes. Customers cannot self-approve. |
| `public.banners` | Yes (`schema.sql:637`) | `SELECT` grant; Policy `"Public can view active banners"` (`is_active = TRUE AND starts/ends window`) | `SELECT, INSERT, UPDATE, DELETE` table grant (gated by RLS); reads scheduled active banners | Policy `"Admins full access to banners"` (`FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())`) | **Sufficient** — Admin manages all banners including scheduled/inactive/ended. |
| `public.products` | Yes (`schema.sql:624`) | `SELECT` (`is_active = TRUE`) | `SELECT` (active) | Policy `"Admins full access to products"` (`FOR ALL TO authenticated`) | **Sufficient** — Allows Admin review moderation flow to update `rating` & `review_count` (and join `products(id, name, slug)`). |
| `public.profiles` | Yes + `FORCE RLS` (`schema.sql:621`; `phase9_security_hardening.sql:177`) | **None** (`anon` revoked in Phase 9.2) | Self `SELECT, UPDATE` only | Policy `"Admins can view all profiles"` (`SELECT USING (is_admin())`) | **Sufficient** — Allows Admin review listing to join reviewer `profiles(id, full_name, avatar_url)`. |
| `public.is_admin()` | N/A | **Revoked** (`PUBLIC`, `anon`) | `EXECUTE` granted (`SECURITY DEFINER`) | Evaluates `profiles.role = 'admin'` for `auth.uid()` | **Verified Secure** (`AuthGuard` + `AuthContext` only request profile when signed in). |
| `storage.objects` (`public-assets`) | Yes | Public bucket download URLs only | Customer avatar `avatars/<uid>.<ext>` only (`phase9_2_storage_hardening.sql:78-100`) | Note conflict check in `phase9_2_storage_hardening.sql:35-44` allows only the 4 avatar policy names | **Constraint:** Do not assume Admin banner file uploads work in `public-assets` without a separate storage policy update; use validated `image_url` input. |
