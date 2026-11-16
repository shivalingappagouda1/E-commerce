# ShopKart — Phase 9: Complete Database Security & RLS Audit

**Audit Timestamp:** 2026-11-09  
**Target Environment:** ShopKart-Staging (Supabase PostgreSQL)  
**Application Stack:** React (v19) + Vite (v8) + Tailwind CSS (v4) + Supabase Client (`@supabase/supabase-js` v2.119.0)  
**Security Scope:** Database Schema, Row Level Security (RLS) Policies, Stored Procedures & Functions, Database Triggers, Admin Authorization & RBAC, Checkout & Inventory Security, Supabase Storage, and Authentication Infrastructure.  
**Audit Mode:** Read-Only Audit (No live database modifications or SQL execution).

---

## 1. Executive Summary

A comprehensive, defense-in-depth security audit of the ShopKart e-commerce database architecture, Supabase PostgreSQL schema, and frontend client service integration was conducted.

The current ShopKart database architecture demonstrates **exceptional engineering maturity and robust defense-in-depth controls**:
1. **Zero Client Price Trust**: The frontend client is structurally incapable of dictating product prices, discounts, subtotal, tax, or total payable amounts. Order placement is routed exclusively through the authoritative `public.place_order(UUID, TEXT, TEXT)` `SECURITY DEFINER` function with empty `search_path`, which locks catalog and inventory rows, re-derives authoritative prices, validates server-side coupon parameters, locks inventory, and writes immutable line-item snapshots.
2. **Zero Client-Side Direct Order Insertion**: Row Level Security (RLS) on `public.orders` and `public.order_items` explicitly lacks any customer `INSERT` policy (`DROP POLICY IF EXISTS "Users create own orders"`). Customers cannot insert arbitrary orders via direct Supabase REST endpoints.
3. **Cart Tampering Elimination**: Direct customer `INSERT`, `UPDATE`, and `DELETE` on `public.cart_items` are revoked at the RLS layer. All cart mutations must pass through the atomic `public.sync_user_cart(JSONB)` RPC, which locks the user's cart row, performs strict UUID and quantity bounds checking (`1 <= qty <= 99`), verifies catalog active status, and aggregates duplicate quantities against live inventory stock.
4. **Strict Customer Data Isolation**: RLS is enabled across all 17 database tables. Private customer tables (`profiles`, `addresses`, `carts`, `wishlists`, `orders`, `order_items`, `payments`) strictly filter on `auth.uid() = user_id` (or `id`), preventing any cross-customer access.
5. **Backend-Enforced Role Escalation Guards**: Admin status is derived on the server from `public.profiles.role = 'admin'` via `is_admin()`. A database trigger (`guard_role_escalation`) intercepts all `UPDATE` statements on `profiles` and rejects any role modification unless `is_admin()` evaluates to `TRUE`. The signup trigger (`create_profile_on_signup()`) ignores `raw_user_meta_data` and unconditionally forces `role = 'customer'`.
6. **Phase 8.1 Cancellation Safety Fully Enforced**: `restore_inventory_on_cancellation()` trigger strictly restricts automatic stock and coupon restoration to pre-fulfillment states (`pending`, `processing`). Orders transitioning from `shipped` or `delivered` bypass automated restoration. Reopening cancelled orders is strictly rejected by the trigger guard.

### Overall Security Verdict: **CONDITIONAL PASS**
The database architecture and customer isolation mechanisms are sound, robust, and free from critical data-exposure vulnerabilities. The verdict is designated **CONDITIONAL PASS** solely due to two minor operational hardening requirements prior to production launch:
1. **Supabase Storage Policies**: Avatar uploads utilize bucket `public-assets`, but storage RLS policies on `storage.objects` are not tracked in repository migrations and must be confirmed on the staging instance.
2. **Admin Policy Role Scoping**: Admin policies on public catalog tables omit the explicit `TO authenticated` clause, which can cause harmless but unnecessary policy evaluation during guest browsing.

---

## 2. Complete Table-by-Table Row Level Security (RLS) Audit

All 17 application tables in `database/schema.sql` and subsequent additive migrations were inspected.

| # | Table | RLS Enabled | Policies Reviewed | Security Result | Findings & Access Rules |
|---|---|---|---|---|---|
| **1** | `public.profiles` | **YES** | 5 (Users view/update own; Admins view/update/delete) | **PASS** | Customers restricted strictly to `auth.uid() = id`. `prevent_role_self_escalation()` trigger blocks non-admin role modification. Private fields (phone, avatar) hidden from other users. |
| **2** | `public.addresses` | **YES** | 5 (Users CRUD own; Admins view all) | **PASS** | Strict customer isolation on `auth.uid() = user_id`. Admins can view for delivery fulfillment, but cannot insert, modify, or delete customer addresses. |
| **3** | `public.categories` | **YES** | 2 (Public view active; Admins full access) | **PASS** | Public can only view where `is_active = TRUE`. Inactive categories hidden. Full CRUD restricted to `is_admin()`. |
| **4** | `public.products` | **YES** | 2 (Public view active; Admins full access) | **PASS** | Public can only view where `is_active = TRUE`. Inactive products hidden. Full CRUD restricted to `is_admin()`. |
| **5** | `public.product_images` | **YES** | 2 (Public view active product images; Admins full access) | **PASS** | Public view restricted via subquery `product_id IN (SELECT id FROM products WHERE is_active = TRUE)`. Images of inactive products hidden. |
| **6** | `public.product_variants` | **YES** | 2 (Public view active variants; Admins full access) | **PASS** | Public view restricted via subquery `product_id IN (SELECT id FROM products WHERE is_active = TRUE)`. Full CRUD restricted to `is_admin()`. |
| **7** | `public.inventory` | **YES** | 2 (Public view active inventory; Admins full access) | **PASS** | Public can view stock of active products (`is_active = TRUE`). **Zero customer write policies**: stock decrements/restorations are controlled strictly by database functions and triggers. |
| **8** | `public.carts` | **YES** | 5 (Users CRUD own; Admins view all) | **PASS** | Strict customer isolation on `auth.uid() = user_id`. Admins have read-only access for customer support. |
| **9** | `public.cart_items` | **YES** | 2 (Users view own; Admins view all) | **PASS** | **Hardened in Phase 7.1**: Customer direct INSERT, UPDATE, and DELETE policies dropped. All mutations restricted to `sync_user_cart()` RPC. Only SELECT allowed via `cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())`. |
| **10** | `public.wishlists` | **YES** | 4 (Users SELECT, INSERT, DELETE own; Admins view all) | **PASS** | Strict customer isolation on `auth.uid() = user_id`. No cross-user modification permitted. |
| **11** | `public.wishlist_items` | **YES** | 4 (Users SELECT, INSERT, DELETE own; Admins view all) | **PASS** | Customer access scoped via `wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid())`. |
| **12** | `public.coupons` | **YES** | 2 (Public view active valid; Admins full access) | **PASS** | Public can only SELECT where `is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())`. **Zero customer write policies**: usage increment/decrement handled strictly by server RPC and cancellation trigger. |
| **13** | `public.orders` | **YES** | 2 (Users view own; Admins full access) | **PASS** | **Zero customer write policies**: Customer INSERT, UPDATE, and DELETE policies dropped. Customers can only view own orders (`auth.uid() = user_id`). Orders created strictly via `place_order()`; cancelled strictly via `cancel_order()`. |
| **14** | `public.order_items` | **YES** | 2 (Users view own; Admins full access) | **PASS** | **Zero customer write policies**: Customers can only view items of own orders (`order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())`). Line items are immutable snapshots created strictly by `place_order()`. |
| **15** | `public.payments` | **YES** | 2 (Users view own; Admins full access) | **PASS** | **Zero customer write policies**: Customers can only view payment records for own orders (`order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())`). Cannot insert or alter payment status. |
| **16** | `public.reviews` | **YES** | 5 (Public view approved; Users create/update/delete own; Admins full access) | **PASS** | Public can view only `is_approved = TRUE`. Customers can insert/update only for themselves (`auth.uid() = user_id`) and `WITH CHECK (is_approved = FALSE)`, strictly preventing review self-approval. |
| **17** | `public.banners` | **YES** | 2 (Public view active/scheduled; Admins full access) | **PASS** | Public can only view where `is_active = TRUE AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())`. Full management restricted to `is_admin()`. |

---

## 3. Customer Data Isolation Audit

### Profile and Identity Security
- **Email Isolation**: `auth.users` contains customer emails. The `public.profiles` table contains `id, full_name, phone, avatar_url, role`. Profile rows can only be read by the owner (`auth.uid() = id`) or administrators.
- **Review Privacy**: Public reviews display reviewer name via frontend metadata; they do not join `profiles` publicly, preventing leakage of customer phone numbers or UUIDs.
- **Role Tampering Defense**:
  - `prevent_role_self_escalation()` intercepts `BEFORE UPDATE ON profiles`. If `NEW.role IS DISTINCT FROM OLD.role`, it verifies `public.is_admin()`. An ordinary customer attempting `UPDATE profiles SET role = 'admin' WHERE id = auth.uid()` is aborted by PostgreSQL with `RAISE EXCEPTION`.
  - `create_profile_on_signup()` intercepts `AFTER INSERT ON auth.users`. It explicitly hardcodes `'customer'`, discarding any `role: 'admin'` injected into `raw_user_meta_data`.

### Address, Cart, and Order Boundary Enforcement
- **Address Ownership**: Customer addresses cannot be read, updated, or deleted by any other user. Furthermore, `place_order()` explicitly checks address ownership (`user_id = v_user_id`) before creating an order. A user cannot ship an order to an address ID owned by another customer.
- **Cart Isolation**: `carts.user_id` has a `UNIQUE` constraint. `sync_user_cart()` locks `carts` row `FOR UPDATE` strictly matching `v_user_id := auth.uid()`. Cross-user cart hijacking is impossible.
- **Order Viewing & Cancellation**: `fetchCustomerOrders()` filters on `user_id = user.id`. Direct query via Supabase REST is governed by RLS `USING (auth.uid() = user_id)`. `cancel_order(UUID)` verifies `v_order.user_id = auth.uid()`, strictly rejecting cancellation attempts by unauthorized users.

---

## 4. Admin Authorization & RBAC Audit

### Backend vs. Frontend Security Architecture
- **Frontend Gatekeeping**: `AuthGuard.jsx` inspects `profile?.role === 'admin'`. If unauthorized, it redirects to `/` or renders an "Access Denied" screen. Customer routes use `requireAuth`, redirecting unauthenticated users to `/login`.
- **Backend Authority**: Admin operations do not rely on React state or client JWT claims. Every administrative database policy checks `public.is_admin()`.
- **Definition & Privilege of `is_admin()`**:
  ```sql
  CREATE OR REPLACE FUNCTION is_admin()
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    );
  END;
  $$;
  ```
  - **`SECURITY DEFINER`**: Runs with the owner's privileges to inspect `public.profiles`.
  - **`SET search_path = ''`**: Hardened against search-path hijacking attacks.
  - **Auth Evaluation**: Evaluates `auth.uid()`. If called anonymously, `auth.uid()` is `NULL`, returning `FALSE`.
- **Administrative RPC: `get_admin_customers()`**:
  - Joins `public.profiles` with `auth.users` to supply verified emails to the Admin Customers portal without exposing the Supabase service-role key.
  - Contains an explicit guard: `IF NOT public.is_admin() THEN RAISE EXCEPTION ... END IF;`.
  - Direct execution revoked from `PUBLIC` and `anon`; granted to `authenticated`.

---

## 5. Database Functions and Triggers Audit

| Function / Signature | Security Mode | `search_path` | Execution Privileges | Auth & Authorization Checks | Dynamic SQL Safety | Security Finding |
|---|---|---|---|---|---|---|
| `public.is_admin()` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Checks `profiles.role = 'admin'` for `auth.uid()` | None (static query) | **PASS**. Hardened search_path and UID check. |
| `public.prevent_role_self_escalation()` | `SECURITY DEFINER` | `''` (empty) | Trigger-only | Calls `public.is_admin()` on role change | None | **PASS**. Rejects non-admin role modification. |
| `public.create_profile_on_signup()` | `SECURITY DEFINER` | `''` (empty) | Trigger-only on `auth.users` | Ignores user metadata role; hardcodes `'customer'` | None | **PASS**. Prevents signup role tampering. |
| `public.place_order(UUID, TEXT, TEXT)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` (revoked from PUBLIC, anon) | Validates `auth.uid() IS NOT NULL`, address ownership, cart ownership, catalog stock, coupon validity | None | **PASS**. Authoritative pricing, transactional locks, zero client price trust. |
| `public.sync_user_cart(JSONB)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` (revoked from PUBLIC, anon) | Validates `auth.uid() IS NOT NULL`, JSON payload schema, UUID formats, catalog active status, quantity bounds (1..99) | None | **PASS**. Atomic validation, duplicate aggregation, locks cart row `FOR UPDATE`. |
| `public.cancel_order(UUID)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` (revoked from PUBLIC, anon) | Validates `auth.uid() IS NOT NULL`, order ownership (`user_id = auth.uid()`), status eligibility (`pending`, `processing`) | None | **PASS**. Row lock `FOR UPDATE`, rejects cancellation from `shipped`/`delivered`. |
| `public.get_admin_customers()` | `SECURITY DEFINER` | `''` (empty) | `authenticated` (revoked from PUBLIC, anon) | Explicit check: `IF NOT public.is_admin() THEN RAISE EXCEPTION` | None | **PASS**. Exposes auth emails exclusively to verified admins. |
| `public.restore_inventory_on_cancellation()` | `SECURITY DEFINER` | `''` (empty) | Revoked from `PUBLIC, anon, authenticated` (Trigger-only) | Trigger on `orders` status update. Restricts restoration strictly to pre-fulfillment orders (`pending`, `processing`). Guards against reopening. | None | **PASS**. Phase 8.1 safety guarantees verified. |
| `public.set_updated_at()` | `SECURITY INVOKER` | Default | Invoker | Trigger on table `updated_at` | None | **PASS**. Simple assignment `NEW.updated_at = NOW()`. |

### Phase 8.1 Cancellation Behavior Verification
The trigger function `restore_inventory_on_cancellation()` implements exact state-machine safety:
- **Pending $\rightarrow$ Cancelled**: Restores inventory item quantities and decrements coupon `used_count`.
- **Processing $\rightarrow$ Cancelled**: Restores inventory item quantities and decrements coupon `used_count`.
- **Shipped $\rightarrow$ Cancelled**: Permitted by admin, but **strictly bypasses** automatic inventory restocking and coupon decrement. Physical goods in carrier custody are protected from phantom stock.
- **Delivered $\rightarrow$ Cancelled**: Direct update bypasses restoration. Customer cancellation RPC `cancel_order` strictly rejects delivered orders with `'Cannot cancel an order that has already been delivered'`.
- **Cancelled $\rightarrow$ Active**: Guard 1 raises `'Cancelled orders cannot be reopened or transitioned to %'`.
- **Repeated Cancellation**: Updating an already-cancelled order (`SET status = 'cancelled'`) does not re-trigger restoration because `OLD.status` is `'cancelled'`.

---

## 6. Audit Orders, Payments, and Inventory

### Checkout Price Integrity
- Client-passed prices in `placeOrder()` are strictly ignored by the database.
- `place_order()` acquires `FOR SHARE` locks on `public.products` and `public.product_variants`, computing unit prices directly from `p.price + COALESCE(pv.price_delta, 0)`.
- Line items are written as immutable snapshots in `public.order_items`.
- Order subtotal is computed as $\sum (\text{unit\_price} \times \text{quantity})$.
- Discounts are derived server-side from `public.coupons` based on `discount_type` (`percent` or `fixed`) and clamped to subtotal.
- Total payable is computed authoritatively as $\max(0, \text{subtotal} - \text{discount})$.

### Payment Security
- RLS on `public.payments` strictly forbids customer `INSERT`, `UPDATE`, or `DELETE`.
- The frontend checkout currently supports Cash on Delivery (COD) and Simulated Online Payment (UPI / Card). Both flows record the payment method in `orders.notes` and set order status to `'pending'`.
- **Razorpay Readiness**: The database schema is properly prepared for server-side payment verification:
  - Browser clients cannot insert fake `payments` records.
  - Integration with Razorpay requires a server-side Edge Function / Webhook handler that verifies the `razorpay_signature` HMAC SHA-256 before creating a payment row with `status = 'completed'` and advancing order status to `'processing'`.
  - **Under no circumstances should client browsers be granted direct INSERT on `public.payments`**.

---

## 7. Audit Supabase Storage

### Avatar Storage Configuration
- In `src/services/authService.js`:
  ```javascript
  const path = `avatars/${userId}.${ext}`
  await supabase.storage.from('public-assets').upload(path, file, { upsert: true })
  ```
- **Findings**:
  1. The storage bucket `'public-assets'` is referenced in code, but its bucket definition and RLS policies on `storage.objects` are not tracked in repository migration files.
  2. If the bucket was created in Supabase Studio without row-level ownership policies on `storage.objects`, an authenticated user could potentially overwrite or delete another user's avatar.
  3. **Remediation**: An additive migration (`database/migrations/phase9_security_hardening.sql`) has been prepared with strict RLS policies on `storage.objects` restricting avatar uploads to `bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'avatars' AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')`.

---

## 8. Authentication and Environment Security

### Secrets and Key Exposure
- **Publishable Key**: `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) is read from `.env.local`. This key is safe to expose in client bundles because database RLS enforces all permissions.
- **Service Role Key**: Codebase search confirmed **zero occurrences** of the Supabase service-role key or JWT secret.
- **`.gitignore` Compliance**: Verified that `.env`, `.env.*`, and `.env.local` are git-ignored, preventing accidental credential commits.
- **Connection Health Check**: `checkSupabaseConnection()` in `src/lib/supabase.js` performs a real HTTP GET to `/rest/v1/` with a 6-second timeout and sanitizes error output, ensuring API keys are never exposed in UI error strings.

---

## 9. Vulnerabilities & Findings by Severity

| ID | Finding | Severity | Affected Area | Impact | Remediation Status |
|---|---|---|---|---|---|
| **SEC-01** | Missing Repository Migration for Storage RLS Policies | **MEDIUM** | Supabase Storage (`public-assets`) | If storage RLS is unconfigured on Supabase, authenticated users could overwrite other avatars. | **Remediation Provided** in `database/migrations/phase9_security_hardening.sql`. |
| **SEC-02** | Admin Policies Lack Explicit `TO authenticated` Scoping | **LOW** | `categories`, `products`, `banners`, `coupons` | Unauthenticated visitors evaluate admin policies; harmless but sub-optimal. | **Remediation Provided** in `database/migrations/phase9_security_hardening.sql`. |
| **SEC-03** | `is_admin()` Lacks `GRANT EXECUTE` to `anon` Role | **LOW** | `public.is_admin()` | In strict PostgreSQL environments, evaluating admin policies for guest users could raise permission warnings. | **Remediation Provided** in `database/migrations/phase9_security_hardening.sql`. |
| **SEC-04** | Defense-in-Depth: `FORCE ROW LEVEL SECURITY` Omitted | **INFO** | Customer tables | RLS applies to non-owners. Table owner queries bypass RLS unless forced. | **Remediation Provided** in `database/migrations/phase9_security_hardening.sql`. |
| **SEC-05** | Online Payment Flow is Simulated (Pre-Razorpay) | **INFO** | `CheckoutPage.jsx`, `orderService.js` | Orders placed with 'online' method remain 'pending' without gateway settlement. | **Documented Architectural Requirement** for Phase 10. |

---

## 10. Evidence and File References

- **Core Schema & Initial Policies**: [`database/schema.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/schema.sql#L616-L1046)
- **Admin Customers RPC**: [`database/migrations/phase7_backend_enhancements.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/migrations/phase7_backend_enhancements.sql#L12-L51)
- **Cart Synchronization & Authoritative `place_order`**: [`database/migrations/phase7_1_security_and_cart_fixes.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/migrations/phase7_1_security_and_cart_fixes.sql#L16-L411)
- **Customer Cancellation RPC**: [`database/migrations/phase7_2_customer_order_cancellation.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/migrations/phase7_2_customer_order_cancellation.sql#L25-L98)
- **Shipped Order Inventory Safety Trigger**: [`database/migrations/phase8_1_inventory_restoration_safety.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/migrations/phase8_1_inventory_restoration_safety.sql#L21-L73)
- **Route Guard Protection**: [`src/components/common/AuthGuard.jsx`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/components/common/AuthGuard.jsx#L17-L59)
- **Client Supabase Initialization**: [`src/lib/supabase.js`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/lib/supabase.js#L14-L94)
- **Order Service & RPC Calls**: [`src/services/orderService.js`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/orderService.js#L300-L405)
- **Cart Sync Service**: [`src/services/cartService.js`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/cartService.js#L149-L215)
- **Hardening Migration**: [`database/migrations/phase9_security_hardening.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/migrations/phase9_security_hardening.sql)

---

## 11. Overall Security Verdict

### Verdict: **CONDITIONAL PASS**

**Summary Justification**:
ShopKart's database and API security design is robust and production-grade in all core commerce vectors (order creation, price integrity, coupon calculation, inventory reservation, cart synchronization, customer data isolation, and admin role protection). 

To transition from **CONDITIONAL PASS** to **FINAL PASS**, the staging environment must execute the prepared additive hardening migration [`database/migrations/phase9_security_hardening.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/migrations/phase9_security_hardening.sql) in Supabase SQL Editor and verify that storage policies are active.

Once these low-risk staging steps are completed, ShopKart is **architecturally and securely ready to proceed to Razorpay payment gateway integration**.
