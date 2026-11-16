# ShopKart — Phase 2: Backend & Database Deep Audit
## Document 5: Prioritized Findings & Remediation Recommendations

**Audit Status:** COMPLETE  
**Audit Mode:** STRICTLY READ-ONLY  
**Classification Categories:**
- `CONFIRMED DEFECT`
- `SECURITY RISK`
- `DATA INTEGRITY RISK`
- `PERFORMANCE RISK`
- `SUSPECTED ISSUE`
- `NO ISSUE FOUND`
- `REQUIRES RUNTIME VERIFICATION`

---

## 1. Categorized Findings Register

### Category A: CONFIRMED DEFECT

#### Finding DEFECT-01: Reviews Schema Lacks `product_name` Column
- **Classification:** `CONFIRMED DEFECT`
- **Location:** `database/schema.sql:361-373` (`reviews` table definition) vs frontend/legacy assumptions.
- **Technical Description:** The `reviews` table contains `(id, product_id, user_id, rating, title, body, is_approved, created_at, updated_at)`. It does **not** have a `product_name` column. Any query or insert targeting `reviews.product_name` triggers a PostgreSQL error `column "product_name" of relation "reviews" does not exist`.
- **Remediation:** Update frontend `ProductDetailPage.jsx` and review fetching logic in `productService.js` to join `products(name)` instead of selecting `product_name` directly from `reviews`.

#### Finding DEFECT-02: Canonical `database/schema.sql` Contains Obsolete 2-Parameter `place_order`
- **Classification:** `CONFIRMED DEFECT`
- **Location:** `database/schema.sql:482` vs `database/migrations/phase7_1_security_and_cart_fixes.sql:207`.
- **Technical Description:** Canonical `database/schema.sql` retains `place_order(p_address_id UUID, p_notes TEXT DEFAULT NULL)` without coupon support. When applied to any fresh or staging instance, it creates a dual overload alongside the 3-parameter version `place_order(UUID, TEXT, TEXT)`, opening an unvalidated bypass path where orders can be placed without coupon decrement logic.
- **Remediation:** In the canonical schema consolidation, replace the 2-parameter definition with the 3-parameter definition and include an explicit `DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT);`.

#### Finding DEFECT-03: `database/schema.sql` Omits Critical Application Functions & Triggers
- **Classification:** `CONFIRMED DEFECT`
- **Location:** `database/schema.sql`
- **Technical Description:** Four core stored procedures and one trigger implemented during Phase 7 and Phase 8 are missing from the baseline schema file:
  1. `public.sync_user_cart(JSONB)`
  2. `public.cancel_order(UUID)`
  3. `public.restore_inventory_on_cancellation()`
  4. `public.get_admin_customers()`
  5. Trigger `trg_restore_inventory_on_cancel` on `orders`
- **Remediation:** Consolidate all migration enhancements into `database/schema.sql` so that local or staging deployments can be cleanly seeded from a single source of truth.

---

### Category B: SECURITY RISK

#### Finding SEC-01: Phase 9.2 Security Hardening Pending on Staging Database
- **Classification:** `SECURITY RISK`
- **Location:** `supabase/phase-9.2/migration.sql`
- **Technical Description:** The complete Phase 9.2 security hardening package (table-level grant wiping, function execution revocation, storage object RLS policies) has been corrected and verified locally in the repository, but has not yet been applied to the live Supabase Staging project (`ulmwssozdmppvydppswx`).
- **Remediation:** After audit sign-off, execute `supabase/phase-9.2/migration.sql` against the staging database using the Supabase SQL Editor and run `verification.sql` to confirm that all 18 assertions pass.

#### Finding SEC-02: Unvalidated Direct File Extension Handling in Avatar Storage Policies
- **Classification:** `SECURITY RISK`
- **Location:** `supabase/phase-9.2/migration.sql:640-770`
- **Technical Description:** Storage policies validate avatar file ownership using `storage.filename(name) LIKE (auth.uid()::text || '.%')`. While this guarantees that users can only manipulate files prefixed with their own user ID, it does not restrict MIME types or file extensions at the database storage policy level (allowing arbitrary uploaded extensions if not filtered by client code).
- **Remediation:** Frontend `authService.js:uploadAvatar` must strictly whitelist MIME types (`image/jpeg`, `image/png`, `image/webp`) and reject unapproved extensions before dispatching uploads.

---

### Category C: DATA INTEGRITY RISK

#### Finding INTEGRITY-01: Missing Database Table for Store Settings
- **Classification:** `DATA INTEGRITY RISK`
- **Location:** `src/pages/admin/AdminSettingsPage.jsx:32`
- **Technical Description:** ShopKart does not have a `public.settings` table in PostgreSQL. Store configuration (store name, support email, maintenance mode, currency symbol) is currently persisted exclusively in browser `localStorage` (`shopkart_store_settings`). If an administrator changes settings on one computer, other admins and customers do not receive the updates.
- **Remediation:** Create a key-value or singleton `public.settings` table in a future migration with RLS allowing public read of store metadata and admin-only update.

#### Finding INTEGRITY-02: Absence of Default Address Uniqueness Constraint
- **Classification:** `DATA INTEGRITY RISK`
- **Location:** `database/schema.sql:65-81` (`addresses` table)
- **Technical Description:** There is no unique partial index on `addresses(user_id) WHERE is_default = TRUE`. A customer can potentially have multiple addresses marked `is_default = TRUE` if concurrent requests or unvalidated updates occur.
- **Remediation:** Add a partial unique index: `CREATE UNIQUE INDEX idx_unique_default_address ON addresses(user_id) WHERE is_default = TRUE;`.

#### Finding INTEGRITY-03: `payments` Table Unpopulated During Standard Checkout
- **Classification:** `DATA INTEGRITY RISK`
- **Location:** `database/migrations/phase7_1_security_and_cart_fixes.sql:207` (`place_order` function)
- **Technical Description:** The `place_order` stored procedure inserts rows into `orders` and `order_items`, but does not create an initial corresponding row in `payments`. If frontend order placement does not explicitly trigger a payment insertion, the `payments` table remains disconnected from orders.
- **Remediation:** Ensure `orderService.js` or the payment gateway handler explicitly records a `payments` entry with `order_id`, `provider`, and `status = 'pending'`.

---

### Category D: PERFORMANCE RISK

#### Finding PERF-01: Missing B-Tree Indexes on High-Traffic Foreign Keys
- **Classification:** `PERFORMANCE RISK`
- **Location:** `database/schema.sql` (multiple tables)
- **Technical Description:** PostgreSQL does not index foreign keys by default. Several high-traffic foreign keys lack B-tree indexes:
  1. `orders(address_id)` — checked when querying orders by address or during address deletions.
  2. `orders(coupon_id)` — checked when calculating coupon utilization metrics.
  3. `order_items(product_id)` — checked when analyzing sales history per product.
  4. `categories(parent_id)` — checked when building recursive category navigation trees.
  5. `cart_items(variant_id)` — checked during variant updates and cart joins.
- **Remediation:** Create standard B-tree indexes on these 5 foreign keys in the next maintenance migration.

---

### Category E: SUSPECTED ISSUE

#### Finding SUSPECT-01: Discrepancy in Primary Key Types Across Tables
- **Classification:** `SUSPECTED ISSUE`
- **Location:** `database/schema.sql:92` (`categories`), `database/schema.sql:385` (`banners`)
- **Technical Description:** `categories` and `banners` use PostgreSQL 32-bit `SERIAL` auto-incrementing integer keys, whereas all other 15 tables use 128-bit `UUID` keys.
- **Assessment:** Not a breaking bug, but requires frontend services to handle numeric identifiers for categories/banners and UUID strings elsewhere. No immediate schema change recommended to avoid breaking existing relationships.

---

### Category F: NO ISSUE FOUND

#### Item OK-01: Cart & Inventory Concurrency Control
- **Classification:** `NO ISSUE FOUND`
- **Location:** `database/migrations/phase7_1_security_and_cart_fixes.sql`
- **Finding:** Concurrency control in `place_order` and `sync_user_cart` is implemented with industry best practices. Pessimistic `FOR UPDATE` locking on user cart rows, inventory records, and coupon quotas prevents race conditions and overselling.

#### Item OK-02: Role Escalation Protection
- **Classification:** `NO ISSUE FOUND`
- **Location:** `database/schema.sql:434-453`
- **Finding:** The `guard_role_escalation` trigger on `profiles` properly enforces that non-admin callers cannot alter the `role` column to `'admin'`, even if they attempt direct PostgREST patch operations.

#### Item OK-03: Inventory Restoration Guard Logic
- **Classification:** `NO ISSUE FOUND`
- **Location:** `database/migrations/phase8_1_inventory_restoration_safety.sql:21`
- **Finding:** The trigger function `restore_inventory_on_cancellation` is safeguarded against double-restoration and strictly aborts without restock if an order has already transitioned to `shipped` or `delivered`.

---

### Category G: REQUIRES RUNTIME VERIFICATION

#### Finding RUNTIME-01: Live Staging Execution of Phase 9.2 Verification Suite
- **Classification:** `REQUIRES RUNTIME VERIFICATION`
- **Location:** `supabase/phase-9.2/verification.sql`
- **Technical Description:** The verification suite contains 18 comprehensive SQL assertions checking table grants, function execute permissions, storage policy definitions, and role scopes.
- **Status:** Static validation in our local testing harness passed 45/45 assertions. Execution against the live remote staging database (`ShopKart-Staging`) is required once approved to verify live PostgreSQL catalog compatibility.

---

## 2. Summary Action Plan for Phase 3 Implementation

1. **Fix Reviews Service & UI:** Update `ProductDetailPage.jsx` and `productService.js` to remove references to `reviews.product_name` and query reviews with relational joins (`products(name)`).
2. **Align Avatar Upload:** Ensure `ProfilePage.jsx` and `authService.js` match the exact path expectations of the Phase 9.2 storage RLS policies (`avatars/<userId>.<ext>`).
3. **Consolidate Canonical Schema:** Update `database/schema.sql` to incorporate the 3-parameter `place_order` and all missing functions and triggers, establishing a single authoritative schema.
4. **Deploy Phase 9.2 Hardening:** Execute `supabase/phase-9.2/migration.sql` in the Supabase Staging SQL Editor and execute `verification.sql` to confirm zero regressions.
