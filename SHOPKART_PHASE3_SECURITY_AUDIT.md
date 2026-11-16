# ShopKart — Phase 3: Security Hardening & Master Security Audit
## Document 1: Comprehensive Security Assessment & Threat Analysis

**Audit Phase:** Phase 3 — Stage A (Security Implementation Planning)  
**Security Lead:** Principal Application Security Engineer, Senior Supabase/PostgreSQL Engineer & Backend Architect  
**Operating Mode:** STRICTLY READ-ONLY (Zero code modified, zero SQL executed, zero remote connections)  
**Security Standards:** OWASP Top 10 (2021), CWE Top 25 (2023), ASVS 4.0 (Level 2), CIS PostgreSQL Benchmark

---

## 1. Executive Summary

ShopKart’s security architecture has been thoroughly audited across frontend client services, Supabase JavaScript SDK integration, PostgreSQL relational schemas, Row Level Security (RLS) policies, database stored procedures (`SECURITY DEFINER`), trigger functions, and Supabase Storage.

### Security Posture Highlights:
1. **Core Relational Isolation is Robust:** Row Level Security (RLS) is enabled on all 17 public tables. Direct PostgREST customer mutation paths are properly restricted to owner rows (`auth.uid() = user_id`).
2. **Business Logic is Server-Enforced:** Order placement, coupon calculation, inventory reduction, cart synchronization, and order cancellations execute inside PostgreSQL functions using pessimistic row-level locking (`FOR UPDATE`). Client-side price tampering is completely thwarted because prices are fetched authoritatively from `public.products` and `public.product_variants`.
3. **Privilege Escalation is Defended at Trigger Level:** Non-administrators cannot modify their role to `'admin'` via PostgREST updates due to the `guard_role_escalation` trigger, and signups hardcode the `'customer'` role in `create_profile_on_signup()`.
4. **Key Gaps Identified for Hardening:**
   - **`DEF-01` (High):** Review fetching logic in `productService.js:435` filters client-side by non-existent `r.product_name`, causing zero reviews to be displayed.
   - **`SEC-01` (High - Operational):** Remote Supabase Staging (`ulmwssozdmppvydppswx`) deployment status of Phase 9.2 table/function grant wiping is unverified and pending execution.
   - **`SEC-02` (Medium):** Rollback script `supabase/phase-9.2/rollback.sql:818` verifies policy identity and roles for pre-existing storage policies, but omits verifying `qual` (`USING`) and `with_check` expressions.
   - **`SEC-03` (Low - Functional):** Storage RLS filename regex is case-sensitive (`~`), blocking avatars with uppercase extensions (e.g. `.JPG`).
   - **`SCH-01` (Medium - Schema Drift):** Baseline `database/schema.sql:482` retains the obsolete 2-parameter `place_order` signature without coupon handling.

---

## 2. Threat Modeling & Workstream Findings

### Workstream 1: Row Level Security (RLS) Assessment
- **Status:** All 17 public tables have `ENABLE ROW LEVEL SECURITY`.
- **Finding:** No table grants broad unrestricted access to `anon`. Unauthenticated visitors have read-only access restricted strictly to active catalog records (`categories`, `products`, `product_images`, `product_variants`, `inventory`, `banners`, `coupons`, `reviews`).
- **Customer Tables:** `profiles`, `addresses`, `carts`, `cart_items`, `wishlists`, `wishlist_items`, `orders`, `order_items`, and `payments` enforce `auth.uid() = user_id` (or joined `user_id`).
- **Direct Orders Insertion:** Strictly forbidden for customers. Orders cannot be created via PostgREST `INSERT`—they must be placed via the atomic `place_order` RPC.

### Workstream 2: PostgreSQL Functions & RPC Security
- **Untrusted Search Path (CWE-426):** All 9 database functions strictly set `SET search_path = ''` and utilize fully-qualified schema object names (`public.table_name`, `auth.users`).
- **Definer Privilege Abuse (CWE-269):** `is_admin()`, `place_order()`, `sync_user_cart()`, `cancel_order()`, and `get_admin_customers()` run as `SECURITY DEFINER`. Each function enforces caller authentication via `auth.uid()` and asserts authorization checks internally (e.g., `is_admin()` inside `get_admin_customers()`, and ownership checks inside `cancel_order()`).
- **Overload Drift:** `database/schema.sql:482` contains the legacy 2-parameter signature `place_order(UUID, TEXT)`. While the frontend (`orderService.js:384`) always sends 3 parameters, the presence of the 2-parameter signature represents schema drift and should be cleanly dropped.

### Workstream 3: Storage Security
- **Bucket `public-assets`:** Configured with `public = true` to allow CDN distribution of avatar images.
- **Object Isolation:** Four storage RLS policies restrict mutations strictly to `avatars/<auth.uid>.*`. User A cannot overwrite, update, or delete User B’s avatar.
- **Storage Rollback Verification Defect:** `supabase/phase-9.2/rollback.sql:818` checks `cmd` and `roles` for preserved policies, omitting verification of `USING` and `WITH CHECK` expressions against `expected_definition`.
- **Extension Sensitivity:** Regex in `migration.sql:635` uses case-sensitive `~`. Uploads with uppercase extensions fail at the storage policy level.

### Workstream 4: Authentication & Authorization
- **Client Route Protection:** `AuthGuard.jsx` protects customer routes (`/orders`, `/profile`) and admin routes (`/admin/*`).
- **Backend Authorization Enforcement:** Admin authorization does not rely solely on the UI gatekeeper. Sensitive admin queries (orders, all customer profiles, category/product mutations, inventory updates) are protected at the database level via RLS policies checking `is_admin()`, and `get_admin_customers()` aborts if `NOT public.is_admin()`.
- **Role Escalation Protection:** Trigger `guard_role_escalation` on `profiles` intercepts `UPDATE OF role` and throws an exception if the caller is not an administrator.

### Workstream 5: Customer Data Isolation
- **Direct Object Reference (IDOR) Checks:**
  - `addresses`: RLS forces `auth.uid() = user_id`. A customer passing another user's address ID in a PostgREST query receives 0 rows.
  - `orders`: RLS forces `auth.uid() = user_id`. Orders belonging to other customers cannot be selected.
  - `order_items`: RLS checks `order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())`.
  - `cart_items`: Derived from `auth.uid()`. `sync_user_cart` takes no cart ID, deriving `v_cart_id` exclusively from `auth.uid()`.
- **Result:** Complete customer data isolation is achieved at the database engine boundary.

### Workstream 6: Business Logic Security
- **Order Placement:** Executes in a single database transaction. Validates stock with `FOR UPDATE` pessimistic row locks, preventing race conditions or overselling.
- **Price Calculation:** Calculated authoritatively on the server from `products.price` and `product_variants.price_delta`. Client-submitted totals are ignored.
- **Coupon Enforcement:** Checks expiration, active status, and maximum usage quotas. Quota increment is atomic within the checkout transaction.
- **Order Cancellation & Restock:** Rejects cancellation of `shipped` or `delivered` orders. Trigger `restore_inventory_on_cancellation` guards against double restoration.

### Workstream 7: Secrets and Configuration
- **API Keys:** `src/lib/supabase.js` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or anon key).
- **Service-Role Key:** Never referenced, bundled, or committed in the frontend repository.
- **Environment Isolation:** `.gitignore` properly excludes `.env`, `.env.*`, and `.env.local` while allowing `.env.example`.
- **Logging Sanitization:** `checkSupabaseConnection()` explicitly replaces the API key with `***` in error messages.

---

## 3. Prioritized Vulnerability Register

| Priority | ID | Title | Target | Classification | Severity |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **P1** | **REV-01** | Client-Side Reviews Filter Hides Reviews | `productService.js:435` | `CONFIRMED DEFECT` | **HIGH** |
| **P1** | **SEC-01** | Phase 9.2 Staging Permissions Deployment Status | Supabase Staging | `REQUIRES RUNTIME VERIFICATION` | **HIGH** |
| **P2** | **SCH-01** | Baseline `schema.sql` 2-Arg `place_order` Drift | `database/schema.sql:482` | `SCHEMA DRIFT` | **MEDIUM** |
| **P2** | **SEC-02** | Storage Rollback Section 6.4 Incomplete Verification | `rollback.sql:818` | `SECURITY RISK` | **MEDIUM** |
| **P2** | **SCH-02** | Missing Functions in Baseline Schema | `database/schema.sql` | `SCHEMA DRIFT` | **MEDIUM** |
| **P3** | **SEC-03** | Avatar Storage Case-Sensitive Extension | `migration.sql:635` / `authService.js` | `ADVISORY` | **LOW** |
| **P3** | **TX-01** | Unwrapped Phase 7–8 Migration Scripts | `database/migrations/` | `ADVISORY` | **LOW** |
| **P4** | **FEAT-01**| Platform Settings Persisted in LocalStorage | `AdminSettingsPage.jsx` | `FEATURE GAP` | **MEDIUM** |
| **P4** | **WRK-01** | Payments Table Unpopulated During Checkout | `orderService.js` | `WORKFLOW GAP` | **LOW** |
| **P4** | **OPT-01** | Unindexed Foreign Key References | `database/schema.sql` | `PERFORMANCE OPTIMIZATION` | **LOW** |

---

## 4. Operating Status Confirmation

Stage A (Planning) is complete. In strict adherence to security rules, zero code or database modifications have been made.
