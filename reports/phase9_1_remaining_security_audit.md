# ShopKart Phase 9.1 — Post-Migration Read-Only Security Audit

**Audit Date:** 2026-11-09  
**Target Environment:** `ShopKart-Staging` (Supabase PostgreSQL)  
**Audit Type:** Read-Only Defensive Architecture, Schema & Policy Security Review  
**Operating Constraints:** Zero SQL mutations executed. Zero database settings, policies, functions, or triggers modified. Zero commits or remote deployments.  

---

## 1. Executive Summary & Verdict

Following the successful execution of the Phase 9.1 migration (standardizing the eight catalog admin policies to `authenticated`), this read-only audit provides an exhaustive security evaluation across the four remaining database architectural areas:

1. **Customer Database Permissions & Policies:** Evaluated across all nine customer-related tables (`profiles`, `addresses`, `carts`, `cart_items`, `wishlists`, `wishlist_items`, `orders`, `order_items`, `payments`, `reviews`).
2. **Storage Settings & Permissions:** Evaluated across Supabase Storage bucket configurations (`storage.buckets`) and object-level RLS policies (`storage.objects`).
3. **Database Function Permissions & Security:** Evaluated across all stored procedures and RPC functions, examining `SECURITY DEFINER` semantics, search path hijacking defenses, and role-based `EXECUTE` privileges.
4. **Database Triggers:** Evaluated across all active triggers, analyzing execution events, timing, row-level guarantees, and trigger function security.

### Summary Verdict by Area

| Area | Status | Summary Finding |
|---|:---:|---|
| **1. Customer Database Permissions** | **PASS** | Strict `auth.uid() = user_id` self-ownership enforced. Direct client writes to `orders`, `order_items`, `payments`, and `cart_items` are completely eliminated. Review self-approval is blocked. Non-admin role escalation is blocked at the database engine level. |
| **2. Storage Settings & Permissions** | **NEEDS REVIEW** | `storage.buckets` returned 0 configured buckets on staging. Bucket `public-assets` is referenced by client code for avatar uploads (`avatars/<userId>.<ext>`) but lacks database migration-tracked RLS policies on `storage.objects`. Must be configured before production. |
| **3. Function Security & Privileges** | **NEEDS REVIEW** | All sensitive RPCs (`place_order`, `sync_user_cart`, `cancel_order`, `get_admin_customers`) correctly enforce `SET search_path = ''` and revoke access from `anon`. However, `public.is_admin()` currently grants `EXECUTE` to `anon`. While safe against privilege escalation, revoking `anon` execution should be addressed in Phase 9.2. |
| **4. Database Triggers** | **PASS** | Critical security triggers (`on_auth_user_created`, `guard_role_escalation`, `trg_restore_inventory_on_cancel`) are fully active, execute row-by-row, cannot be bypassed by client API calls, and maintain strict data integrity. |

---

## 2. Customer Database Permissions and Policies

### Overview of Customer Data Isolation Architecture
In Supabase/PostgreSQL, customer data protection relies on Row Level Security (RLS) combining `USING` clauses (for `SELECT`, `UPDATE`, `DELETE`) and `WITH CHECK` clauses (for `INSERT`, `UPDATE`).

### Table-by-Table Customer Policy Audit

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER RLS PERMISSION MAP                     │
├───────────────────┬──────────────┬──────────────┬──────────────┬───────┤
│ Table             │ SELECT       │ INSERT       │ UPDATE       │ DELETE│
├───────────────────┼──────────────┼──────────────┼──────────────┼───────┤
│ profiles          │ auth.uid()   │ Blocked(Trg) │ auth.uid()*  │ None  │
│ addresses         │ auth.uid()   │ auth.uid()   │ auth.uid()   │auth.uid│
│ carts             │ auth.uid()   │ auth.uid()   │ auth.uid()   │auth.uid│
│ cart_items        │ auth.uid()** │ Blocked(RPC) │ Blocked(RPC) │Blocked│
│ wishlists         │ auth.uid()   │ auth.uid()   │ Blocked      │auth.uid│
│ wishlist_items    │ auth.uid()** │ auth.uid()** │ Blocked      │auth.uid│
│ orders            │ auth.uid()   │ Blocked(RPC) │ Blocked(RPC) │ None  │
│ order_items       │ auth.uid()** │ Blocked(RPC) │ Blocked(RPC) │ None  │
│ payments          │ auth.uid()** │ Blocked(Srv) │ Blocked(Srv) │ None  │
│ reviews           │ auth.uid()   │ auth.uid()***│ auth.uid()***│auth.uid│
└───────────────────┴──────────────┴──────────────┴──────────────┴───────┘
* Role modification blocked by guard_role_escalation trigger.
** Scoped via subquery on parent table where parent.user_id = auth.uid().
*** WITH CHECK enforces is_approved = FALSE (self-approval blocked).
```

#### 1. `public.profiles` — **PASS**
- **RLS Enabled:** `relrowsecurity = true`.
- **Customer SELECT:** Scoped strictly via `USING (auth.uid() = id)`. Other customers cannot read private profile records (e.g., phone numbers).
- **Customer UPDATE:** Scoped via `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`.
- **Role Escalation Defense:** Even though customers can update their name or phone, any attempt to modify `role` (e.g., `SET role = 'admin'`) is intercepted and rejected by the `guard_role_escalation` trigger.
- **Customer INSERT:** No customer `INSERT` policy exists. New profiles are provisioned exclusively by the database trigger `on_auth_user_created` on `auth.users`.
- **Customer DELETE:** No customer `DELETE` policy exists. Customers cannot delete their profile row directly.

#### 2. `public.addresses` — **PASS**
- **RLS Enabled:** `relrowsecurity = true`.
- **Customer Isolation:** `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies all strictly mandate `auth.uid() = user_id`.
- **Cross-Customer Defense:** A user cannot view, modify, or delete another user's saved addresses. Furthermore, `place_order()` verifies that `p_address_id` belongs to `v_user_id := auth.uid()`, preventing delivery address spoofing during checkout.
- **Admin Access:** Admins have `SELECT` access only (`USING (is_admin())`) for order dispatch and customer support; admins cannot arbitrarily alter customer addresses.

#### 3. `public.carts` & `public.cart_items` — **PASS**
- **RLS Enabled:** `relrowsecurity = true` on both tables.
- **Cart Isolation:** `carts` is strictly bound to `auth.uid() = user_id`.
- **Cart Items Mutation Lockdown (Phase 7.1):** Direct customer `INSERT`, `UPDATE`, and `DELETE` policies on `cart_items` were intentionally dropped. Customers can only read their cart items via `USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()))`.
- **RPC Enforcement:** All cart item additions, quantity adjustments, and deletions must execute through `public.sync_user_cart(JSONB)`. This prevents client-side price tampering, negative quantities, item spoofing, or invalid UUID injection.

#### 4. `public.wishlists` & `public.wishlist_items` — **PASS**
- **RLS Enabled:** `relrowsecurity = true` on both tables.
- **Isolation:** `wishlists` policies mandate `auth.uid() = user_id`. `wishlist_items` policies verify `wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid())`.
- **Immutability:** No direct `UPDATE` policy exists; users can only add (`INSERT`) or remove (`DELETE`) items.

#### 5. `public.orders` & `public.order_items` — **PASS**
- **RLS Enabled:** `relrowsecurity = true` on both tables.
- **Zero Client Insert:** Customers **cannot insert rows into `orders` or `order_items` directly**. The legacy `"Users create own orders"` policy was dropped. Order creation must proceed through `public.place_order()`.
- **Customer Read-Only Access:** Customers can only `SELECT` orders where `auth.uid() = user_id`, and line items where `order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())`.
- **Zero Client Update/Delete:** Customers have no `UPDATE` or `DELETE` policies on orders. Status transitions (cancellations) are permitted exclusively via `public.cancel_order(UUID)`, which checks that `status IN ('pending', 'processing')`.

#### 6. `public.payments` — **PASS**
- **RLS Enabled:** `relrowsecurity = true`.
- **Zero Client Write:** Customers **cannot insert, update, or delete payments**. Only server-side webhooks or administrators can write payment records.
- **Customer Read:** Customers can only view payments associated with their own orders (`order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())`).

#### 7. `public.reviews` — **PASS**
- **RLS Enabled:** `relrowsecurity = true`.
- **Public Visibility:** Anonymous and authenticated users can view only approved reviews (`USING (is_approved = TRUE)`).
- **Customer Review Management:** Customers can view their own unapproved reviews (`USING (auth.uid() = user_id)`).
- **Self-Approval Prevention:** Both `INSERT` and `UPDATE` policies enforce `WITH CHECK (auth.uid() = user_id AND is_approved = FALSE)`. A customer cannot publish or self-approve a review.

---

## 3. Storage Settings and Permissions

### Current Findings & Staging Baseline
The staging export query on `storage.buckets` returned **0 configured rows**.

```sql
SELECT id, name, owner, created_at, updated_at, public, avif_autodetection,
       file_size_limit, allowed_mime_types
FROM storage.buckets ORDER BY id;
-- Staging Observation: 0 rows returned
```

### Application Usage Analysis
- In `src/services/authService.js`:
  ```javascript
  const path = `avatars/${userId}.${ext}`
  await supabase.storage.from('public-assets').upload(path, file, { upsert: true })
  ```
- The frontend attempts to upload avatars to bucket `'public-assets'` under path `avatars/<userId>.<ext>`.

### Security Risks & Identified Vulnerabilities

> [!WARNING]
> **STORAGE AUDIT FINDING: BUCKET & RLS POLICIES UNCONFIGURED**  
> Status: **NEEDS REVIEW / ACTION REQUIRED**

1. **Bucket Non-Existence on Staging:**
   Because `storage.buckets` contains 0 rows on staging, any user attempting an avatar upload will encounter `404 Bucket Not Found`.
2. **Risk of Overly Permissive Global Policies:**
   In Supabase environments, developers often apply broad storage policies such as `"Public Access"` or `"Allow Authenticated Uploads"` on `storage.objects` without scoping to `bucket_id`.
   - If an unconstrained upload policy exists on `storage.objects`, any authenticated user could upload files to arbitrary paths or overwrite other users' avatars.
3. **Public vs. Private Exposure:**
   - Avatar images are typically public for display in comments, profile badges, and reviews. If `public-assets` is created with `public = true`, files can be downloaded without authentication. This is standard for avatars.
   - However, **writes (`INSERT`, `UPDATE`, `DELETE`) on `storage.objects` must be strictly restricted to the owning customer**.

### Storage Remediation Specification (For Staging Deployment)
When creating the bucket in Supabase Storage, the following RLS policies must be applied to `storage.objects`:

```sql
-- 1. Create bucket if missing
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-assets', 'public-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public to view avatars
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-assets');

-- 3. Restrict avatar upload to the authenticated user matching the filename
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public-assets'
  AND (storage.foldername(name))[1] = 'avatars'
  AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')
);

-- 4. Restrict avatar update/delete to owner
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'public-assets'
  AND (storage.foldername(name))[1] = 'avatars'
  AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')
);
```

---

## 4. Database Function Permissions and Security

### Stored Procedure & Function Security Matrix

All eight critical database functions in the ShopKart schema were audited:

| Function Signature | Security Mode | `search_path` | Granted Roles | Security Controls & Authorization | Status |
|---|---|---|---|---|:---:|
| `public.is_admin()` | `SECURITY DEFINER` | `public, pg_temp` | `authenticated`, `anon` | Evaluates `profiles.role = 'admin'` for `auth.uid()`. | **NEEDS REVIEW** |
| `public.place_order(UUID, TEXT, TEXT)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Locks rows, derives prices from DB, checks address ownership, clears cart. | **PASS** |
| `public.sync_user_cart(JSONB)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Validates UUIDs, checks stock, aggregates duplicates, locks cart row. | **PASS** |
| `public.cancel_order(UUID)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Verifies `user_id = auth.uid()`, locks order, checks status eligibility. | **PASS** |
| `public.get_admin_customers()` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Strict guard: `IF NOT public.is_admin() THEN RAISE EXCEPTION`. | **PASS** |
| `public.restore_inventory_on_cancellation()` | `SECURITY DEFINER` | `''` (empty) | Trigger-only | Direct execution revoked from all roles. Trigger on `orders` status update. | **PASS** |
| `public.prevent_role_self_escalation()` | `SECURITY DEFINER` | `''` (empty) | Trigger-only | Calls `public.is_admin()` when `role` is altered. | **PASS** |
| `public.create_profile_on_signup()` | `SECURITY DEFINER` | `''` (empty) | Trigger-only | Hardcodes `'customer'`, discarding user metadata tampering. | **PASS** |

### Detailed Security Findings

#### 1. Function `search_path` Protection — **PASS**
- **Vulnerability Context:** When a function runs with `SECURITY DEFINER`, it executes with the privileges of the function owner (`postgres`). If `search_path` is mutable, an attacker could create a malicious table or operator in a temporary schema that shadows a system object.
- **Verification:** All Phase 7 and Phase 8 functions explicitly set `SET search_path = ''` and reference all database objects using fully qualified schema identifiers (e.g., `public.products`, `public.inventory`).

#### 2. `public.is_admin()` Execution Privilege Audit — **NEEDS REVIEW**
- **Observation:** Staging baseline export confirmed:
  ```text
  is_admin() owner=postgres super=true bypassrls=true secdef=true config={search_path=public,pg_temp} anon_exec=true auth_exec=true
  ```
- **Risk Assessment:**
  - `anon_can_execute = true`: In Supabase, newly created public functions default to granting `EXECUTE` to `PUBLIC` unless explicitly revoked.
  - Can an anonymous visitor exploit this? **No.** `is_admin()` inspects `auth.uid()`. When called by an unauthenticated client, `auth.uid()` evaluates to `NULL`, returning `FALSE`.
  - In Phase 9.1, catalog administrator policies were changed `TO authenticated`. Consequently, unauthenticated queries are rejected at the table RLS boundary before `is_admin()` is ever invoked.
  - However, best-practice defense-in-depth requires that `anon` should not have direct execution access to administrative helper functions.
- **Recommendation for Phase 9.2:**
  ```sql
  REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
  ```

#### 3. Checkout Price & Inventory Integrity (`place_order`) — **PASS**
- The frontend cannot pass prices, subtotals, or discount amounts.
- `place_order()` derives prices directly from `public.products` and `public.product_variants` while holding `FOR SHARE` locks.
- Inventory is locked `FOR UPDATE` and decremented in the same transaction.
- Coupons are locked `FOR UPDATE`, validated against expiration and usage limits, and incremented server-side.

#### 4. Cart Mutation Lockdown (`sync_user_cart`) — **PASS**
- Validates that `p_items` is a valid JSON array before modifying table state.
- Strictly parses UUIDs, rejecting non-UUID mock values.
- Quantities are validated to fall strictly within `1 <= qty <= 99`.
- Aggregates duplicate items and validates total quantity against available stock before updating `cart_items`.

---

## 5. Database Triggers

### Trigger Inventory & Invariants

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ACTIVE DATABASE TRIGGERS                        │
├────────────────────────┬─────────────┬──────────────┬──────────────────┤
│ Trigger Name           │ Table       │ Event/Timing │ Linked Function  │
├────────────────────────┼─────────────┼──────────────┼──────────────────┤
│ on_auth_user_created   │ auth.users  │ AFTER INSERT │ create_profile.. │
│ guard_role_escalation  │ profiles    │ BEFORE UPDATE│ prevent_role_s.. │
│ trg_restore_inventory..│ orders      │ AFTER UPDATE │ restore_invent.. │
│ profiles_updated_at    │ profiles    │ BEFORE UPDATE│ set_updated_at   │
│ addresses_updated_at   │ addresses   │ BEFORE UPDATE│ set_updated_at   │
│ banners_updated_at     │ banners     │ BEFORE UPDATE│ set_updated_at   │
└────────────────────────┴─────────────┴──────────────┴──────────────────┘
```

#### 1. `on_auth_user_created` on `auth.users` — **PASS**
- **Timing & Event:** `AFTER INSERT ON auth.users FOR EACH ROW`.
- **Linked Function:** `public.create_profile_on_signup()`.
- **Security Invariant:** Automatically creates a profile record in `public.profiles` for every newly registered auth user.
- **Tampering Resistance:** Explicitly assigns `role = 'customer'`, completely ignoring any `'admin'` claim that an attacker may attempt to pass in signup metadata (`raw_user_meta_data`).

#### 2. `guard_role_escalation` on `public.profiles` — **PASS**
- **Timing & Event:** `BEFORE UPDATE ON public.profiles FOR EACH ROW`.
- **Linked Function:** `public.prevent_role_self_escalation()`.
- **Security Invariant:** If `NEW.role IS DISTINCT FROM OLD.role`, it evaluates `public.is_admin()`.
- **Tampering Resistance:** If a non-admin authenticated customer attempts an `UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid()`, the trigger raises an exception (`'Access denied: Only administrators can modify user roles.'`), immediately rolling back the transaction.

#### 3. `trg_restore_inventory_on_cancel` on `public.orders` — **PASS**
- **Timing & Event:** `AFTER UPDATE OF status ON public.orders FOR EACH ROW`.
- **Linked Function:** `public.restore_inventory_on_cancellation()`.
- **Security Invariants (Phase 8.1 Hardening):**
  - **Reopening Guard:** Blocks transitioning already cancelled orders back to any active status (`OLD.status = 'cancelled' AND NEW.status <> 'cancelled'`).
  - **Status Boundary:** Restores item stock and decrements coupon `used_count` **only** if transitioning from `pending` or `processing` to `cancelled`.
  - **Shipped Order Protection:** If a `shipped` or `delivered` order is cancelled, the trigger intentionally **bypasses automated stock restoration**, preventing phantom inventory of items in carrier transit.
  - **Concurrency & Duplicate Safety:** Updating an already-cancelled order does not restore stock twice.

#### 4. Timestamp Utility Triggers — **PASS**
- Triggers on `profiles`, `addresses`, and `banners` automatically set `NEW.updated_at = NOW()`.
- Executed as `SECURITY INVOKER` with standard system timestamps.

---

## 6. Comprehensive Findings & Classification

### PASS (Verified Secure)
- [x] **Customer Isolation:** Profiles, addresses, carts, wishlists, and orders cannot be viewed or modified by unauthorized users.
- [x] **Direct Order Creation Blocked:** Customers cannot insert or tamper with order records via REST.
- [x] **Cart Tampering Blocked:** Direct customer mutations on `cart_items` are dropped; all updates enforced via `sync_user_cart()`.
- [x] **Price & Coupon Server Authority:** Prices and discounts are calculated strictly server-side inside `place_order()`.
- [x] **Role Escalation Protection:** Both signup creation and profile update triggers block customer-to-admin elevation.
- [x] **Shipped Cancellation Stock Protection:** Cancelled shipped orders do not automatically restock inventory.
- [x] **Function Search Paths:** All critical stored procedures use empty search paths (`SET search_path = ''`) with fully qualified references.

### NEEDS REVIEW (Action Required Prior to Production)
- [ ] **SEC-REM-01: Storage Bucket & RLS Configuration**  
  *Finding:* `storage.buckets` contains 0 rows on staging. Bucket `public-assets` is uncreated, and no object-level policies exist on `storage.objects` for avatar uploads.  
  *Action:* Create `public-assets` bucket and apply path-restricted RLS policies limiting uploads to `avatars/<auth.uid>.<ext>`.
- [ ] **SEC-REM-02: Revoke Public Execution on `is_admin()`**  
  *Finding:* `public.is_admin()` grants `EXECUTE` to `anon`. While not exploitable for catalog queries after Phase 9.1, defense-in-depth requires revoking `EXECUTE` from `anon` in Phase 9.2.
- [ ] **SEC-REM-03: Razorpay Payment Gateway Integration (Phase 10 Scope)**  
  *Finding:* Online payments currently operate in simulation mode (`status = 'pending'`). Production launch requires deploying a server-side webhook handler to verify Razorpay HMAC signatures before updating payment and order statuses.

---

## 7. Conclusion

The ShopKart database architecture exhibits **exceptionally high security hygiene** across customer data boundaries, order placement integrity, inventory safety state machines, and administrative privilege escalation defenses.

The database is **structurally protected against customer data leakage and unauthorized catalog tampering**. Addressing the two items flagged as **NEEDS REVIEW** (Storage bucket provisioning and explicit `is_admin()` execution revocation) will complete the final security hardening required for production deployment.
