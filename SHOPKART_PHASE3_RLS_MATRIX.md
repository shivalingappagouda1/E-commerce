# ShopKart — Phase 3: Security Hardening & Master Security Audit
## Document 2: Authoritative RLS Policy & Permissions Matrix

**Audit Phase:** Phase 3 — Stage A  
**Scope:** All 17 Application Public Tables + Supabase Storage Objects  
**PostgreSQL Version:** 15+ (Supabase)  
**Security Principles:** Least Privilege, Defense-in-Depth, Strict Tenant Isolation

---

## 1. Table-by-Table RLS Architecture Matrix

All 17 application tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` executed in `database/schema.sql`.

### Table 1: `public.profiles`
- **RLS Enabled:** YES | **RLS Forced:** NO (Standard Supabase tenant isolation)
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `UPDATE`
- **Policies:**
  - `SELECT`: `"Users view own profile"` (`auth.uid() = id`), `"Admins can view all profiles"` (`is_admin()`).
  - `INSERT`: No public/authenticated policy. Insert is strictly performed by `create_profile_on_signup()` trigger running as `SECURITY DEFINER`.
  - `UPDATE`: `"Users update own profile"` (`auth.uid() = id`), `"Admins can update all profiles"` (`is_admin()`).
  - `DELETE`: `"Admins can delete profiles"` (`is_admin()`).
- **Cross-Customer Isolation:** Absolute. User A selecting `profiles` receives strictly their own row (`id = auth.uid()`).
- **Role Escalation Protection:** Intercepted by `guard_role_escalation` trigger before update. Non-admins cannot alter `role`.

---

### Table 2: `public.addresses`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  - `SELECT`: `"Users view own addresses"` (`auth.uid() = user_id`), `"Admins can view all addresses"` (`is_admin()`).
  - `INSERT`: `"Users insert own addresses"` (`WITH CHECK (auth.uid() = user_id)`).
  - `UPDATE`: `"Users update own addresses"` (`USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`).
  - `DELETE`: `"Users delete own addresses"` (`auth.uid() = user_id`).
- **Cross-Customer Isolation:** Absolute. Users cannot view, update, insert, or delete addresses for any other customer.

---

### Table 3: `public.carts`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  - `SELECT`: `"Users view own cart"` (`auth.uid() = user_id`), `"Admins can view all carts"` (`is_admin()`).
  - `INSERT`: `"Users insert own cart"` (`WITH CHECK (auth.uid() = user_id)`).
  - `UPDATE`: `"Users update own cart"` (`USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`).
  - `DELETE`: `"Users delete own cart"` (`auth.uid() = user_id`).
- **Cross-Customer Isolation:** Absolute. Each user possesses at most one cart row enforced by `UNIQUE (user_id)`.

---

### Table 4: `public.cart_items`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  - `SELECT`: `"Users view own cart items"` (`cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())`), `"Admins can view all cart items"` (`is_admin()`).
  - `INSERT`: `"Users insert own cart items"` (`WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()))`).
  - `UPDATE`: `"Users update own cart items"` (`USING/WITH CHECK (cart_id IN (...))`).
  - `DELETE`: `"Users delete own cart items"` (`cart_id IN (...)`).
- **Cross-Customer Isolation:** Absolute. Subquery forces cart ownership. Line items cannot be attached to or viewed from foreign carts.

---

### Table 5: `public.wishlists`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `DELETE`
- **Policies:**
  - `SELECT`: `"Users view own wishlist"` (`auth.uid() = user_id`), `"Admins can view all wishlists"` (`is_admin()`).
  - `INSERT`: `"Users insert own wishlist"` (`WITH CHECK (auth.uid() = user_id)`).
  - `DELETE`: `"Users delete own wishlist"` (`auth.uid() = user_id`).
- **Cross-Customer Isolation:** Absolute.

---

### Table 6: `public.wishlist_items`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `DELETE`
- **Policies:**
  - `SELECT`: `"Users view own wishlist items"` (`wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid())`).
  - `INSERT`: `"Users insert own wishlist items"` (`WITH CHECK (wishlist_id IN (...))`).
  - `DELETE`: `"Users delete own wishlist items"` (`wishlist_id IN (...)`).
- **Cross-Customer Isolation:** Absolute.

---

### Table 7: `public.orders`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `UPDATE`
- **Policies:**
  - `SELECT`: `"Users view own orders"` (`auth.uid() = user_id`), `"Admins full access to orders"` (`is_admin()`).
  - `INSERT`: **NO CUSTOMER POLICY**. Order creation is strictly prohibited via PostgREST and must execute via `public.place_order` (`SECURITY DEFINER`).
  - `UPDATE`: Direct customer update is blocked by RLS policies; order cancellation executes through `public.cancel_order` (`SECURITY DEFINER`).
  - `DELETE`: Admin only (`is_admin()`).
- **Cross-Customer Isolation:** Absolute. Customers cannot query other customers' orders.

---

### Table 8: `public.order_items`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`
- **Policies:**
  - `SELECT`: `"Users view own order items"` (`order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())`), `"Admins full access to order items"` (`is_admin()`).
  - `INSERT`/`UPDATE`/`DELETE`: Admin only. Inserted strictly by `public.place_order` RPC.
- **Cross-Customer Isolation:** Absolute.

---

### Table 9: `public.payments`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`
- **Policies:**
  - `SELECT`: `"Users view own payments"` (`order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())`), `"Admins full access to payments"` (`is_admin()`).
  - `INSERT`/`UPDATE`/`DELETE`: Admin only.
- **Cross-Customer Isolation:** Absolute.

---

### Table 10: `public.reviews`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  - `SELECT`: `"Public can view approved reviews"` (`is_approved = TRUE`), `"Users view own reviews"` (`auth.uid() = user_id`), `"Admins full access to reviews"` (`is_admin()`).
  - `INSERT`: `"Users create own reviews"` (`WITH CHECK (auth.uid() = user_id AND is_approved = FALSE)`).
  - `UPDATE`: `"Users update own reviews"` (`USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND is_approved = FALSE)`).
  - `DELETE`: `"Users delete own reviews"` (`auth.uid() = user_id`).
- **Cross-Customer Isolation:** Normal reviews are public once approved. Unapproved reviews are isolated to author and admins. Customers cannot self-approve reviews.

---

### Table 11: `public.coupons`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT` (plus Admin CRUD)
- **Policies:**
  - `SELECT`: `"Public can view active valid coupons"` (`is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())`).
  - `ALL`: `"Admins full access to coupons"` (`is_admin()`).
- **Mutation Control:** Customers cannot modify coupon codes, discount rates, or usage quotas directly.

---

### Table 12: `public.products`
- **RLS Enabled:** YES | **RLS Forced:** NO
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT` (plus Admin CRUD)
- **Policies:**
  - `SELECT`: `"Public can view active products"` (`is_active = TRUE`), `"Admins full access to products"` (`is_admin()`).
  - `ALL`: `"Admins full access to products"` (`is_admin()`).
- **Catalog Isolation:** Inactive products are hidden from public and customer queries.

---

### Tables 13–15: Product Variants, Product Images, Inventory
- **RLS Enabled:** YES on all 3 tables.
- **Policies:**
  - `SELECT`: Scoped strictly to active parent products:
    `product_id IN (SELECT id FROM products WHERE is_active = TRUE)`.
  - `ALL`: Admins full access (`is_admin()`).
- **Inventory Mutations:** Directly prohibited for customers. Stock decrements and restorations occur strictly through server-side transactional stored procedures.

---

### Tables 16–17: Categories, Banners
- **RLS Enabled:** YES on both tables.
- **Policies:**
  - `SELECT`: Public can view active categories (`is_active = TRUE`) and active banners (`is_active = TRUE AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())`).
  - `ALL`: Admins full access (`is_admin()`).

---

## 2. Supabase Storage Object Policies (`storage.objects`)

Bucket: `public-assets` (Phase 9.2 Hardening, `migration.sql:629-798`)
- **Bucket Visibility:** `public = true` (CDN cache-accelerated public reading of profile avatars).
- **Storage Object Policies:**
  1. `SELECT`: `"Users can view own avatar in public-assets"` (`TO authenticated`).
  2. `INSERT`: `"Users can upload own avatar to public-assets"` (`TO authenticated`, `WITH CHECK` enforces single-folder `avatars/` and filename starting with `auth.uid()`).
  3. `UPDATE`: `"Users can update own avatar in public-assets"` (`TO authenticated`, enforces path ownership in both `USING` and `WITH CHECK`).
  4. `DELETE`: `"Users can delete own avatar from public-assets"` (`TO authenticated`, enforces path ownership in `USING`).
- **Cross-User Protection:** User A cannot overwrite, update, or delete User B’s avatar file in the bucket.

---

## 3. RLS Vulnerability & Risk Summary

| Finding Target | Risk Description | Severity | Status |
| :--- | :--- | :---: | :---: |
| **Catalog Tables** | Historical admin policies assigned `TO public` instead of `TO authenticated` | Medium | Resolved by Phase 9.2 allowlist |
| **Orders Insertion** | Customers could bypass checkout if PostgREST insert was allowed | Critical | Fully Blocked (No customer INSERT policy) |
| **Profile Escalation**| Customer patching `role = 'admin'` via direct update | High | Fully Blocked (Trigger `guard_role_escalation`) |
| **Storage Overwrites**| Customer uploading over another user's avatar path | High | Fully Blocked (Storage RLS path ownership) |
