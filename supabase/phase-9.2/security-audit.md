# ShopKart Phase 9.2 — Security Audit & Threat Analysis
## Comprehensive Architecture, Vulnerability Assessment & Hardening Strategy

**Audit Date:** 2026-11-09  
**Target Environment:** `ShopKart-Staging` (Supabase PostgreSQL)  
**Expected Project Reference:** `ulmwssozdmppvydppswx`  
**Security Specialist:** Senior Full-Stack Engineer & Supabase Security Specialist  
**Audit Scope:** 17 public tables, 9 application functions, database triggers, table grants, and Supabase Storage.

---

## 1. Project Identity and Scope

The ShopKart platform is an e-commerce application built on React + Vite, Tailwind CSS, Supabase JavaScript SDK, and Supabase PostgreSQL. This Phase 9.2 security audit delivers defense-in-depth hardening following the Phase 9.1 standardization of catalog admin policies.

### Evidence Classification Legend
To maintain technical integrity, findings throughout this document are classified as:
- `[SOURCE VERIFIED]`: Directly proven from repository code (`src/` and SQL migrations).
- `[EXPORT VERIFIED]`: Directly proven from live staging inspection exports (`phase9_pre_migration_export.sql`).
- `[ARCHITECTURAL INVARIANT]`: Enforced by PostgreSQL relational engine constraints or triggers.
- `[MANUAL TEST REQUIRED]`: Requires active human runtime verification on staging.

---

## 2. Original Security Findings

1. **Storage Provisioning Deficit:** `[EXPORT VERIFIED]` Staging database returned 0 configured buckets in `storage.buckets`. Profile avatar uploads referenced `public-assets/avatars/${userId}.${ext}` in `src/services/authService.js`, causing 404 errors.
2. **Missing Storage RLS Policies:** `[EXPORT VERIFIED]` Zero object-level policies existed on `storage.objects` for `public-assets`, creating a vulnerability where any user could tamper with or overwrite other users' avatars if a generic policy were applied.
3. **Broad Table Privileges Inherited via PUBLIC:** `[EXPORT VERIFIED]` Supabase default schema configuration granted broad permissions on public tables to `anon` and `authenticated`. Even though Row Level Security (RLS) guarded row access, table-level grants did not follow the principle of least privilege.
4. **Anonymous Execution of Administrative Helper:** `[EXPORT VERIFIED]` `public.is_admin()` retained EXECUTE privileges for `anon`. While not exploitable for privilege escalation (since `auth.uid()` evaluates to `NULL` for unauthenticated sessions), defense-in-depth requires revoking anonymous execution.
5. **Direct Trigger Function Invocability:** `[EXPORT VERIFIED]` Trigger functions (`create_profile_on_signup`, `prevent_role_self_escalation`, `restore_inventory_on_cancellation`, `set_updated_at`) retained direct execution rights inherited from `PUBLIC`.
6. **Incomplete Rollback Safeguards:** `[SOURCE VERIFIED]` Previous rollback drafts utilized broad expressions (`LIKE '%auth.uid()%'`) and blanket `GRANT ALL` statements rather than restoring exact captured snapshots.

---

## 3. All 17 Public Tables and Their Intended Permissions

Every table's permissions were audited against actual frontend usage in `src/` to determine the exact least-privilege matrix:

| Table Name | `anon` Effective Grants | `authenticated` Effective Grants | `service_role` Effective Grants | Intended Operational Boundary |
|---|---|---|---|---|
| `categories` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Storefront reads are public. Admin mutations governed by RLS `is_admin()`. |
| `products` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Storefront reads are public. Admin mutations governed by RLS `is_admin()`. |
| `product_images` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Product gallery public. Admin mutations governed by RLS `is_admin()`. |
| `product_variants`| `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Variant options public. Admin mutations governed by RLS `is_admin()`. |
| `inventory` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Stock counts public. Decremented atomically inside `place_order()`. |
| `banners` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Marketing banners public. Admin mutations governed by RLS `is_admin()`. |
| `reviews` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Approved reviews public (`is_approved = true`). Customer writes own reviews. |
| `coupons` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Active coupons readable for checkout validation. Admin mutations governed by RLS. |
| `profiles` | `NONE` | `SELECT`, `UPDATE` | `ALL` | Private customer data. Scoped via `auth.uid() = id`. Inserts via signup trigger. |
| `addresses` | `NONE` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Delivery addresses private. Scoped via `auth.uid() = user_id`. |
| `carts` | `NONE` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Customer carts private. Scoped via `auth.uid() = user_id`. |
| `cart_items` | `NONE` | `SELECT` | `ALL` | Direct client writes blocked. Synchronized via RPC `sync_user_cart()`. |
| `wishlists` | `NONE` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Customer wishlists private. Scoped via `auth.uid() = user_id`. |
| `wishlist_items` | `NONE` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `ALL` | Wishlist items private. Scoped via user's wishlist ID. |
| `orders` | `NONE` | `SELECT`, `UPDATE` | `ALL` | Orders private. Created via `place_order()`. Cancelled via `cancel_order()`. Admin updates status. |
| `order_items` | `NONE` | `SELECT` | `ALL` | Direct client writes blocked. Provisioned via `place_order()`. |
| `payments` | `NONE` | `SELECT` | `ALL` | Direct client writes blocked. Read-only for customer order history. |

*Note: `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges are completely revoked from both `anon` and `authenticated` across all 17 tables.*

---

## 4. Explicit RLS Policy Allowlist & Inventory

Phase 9.2 completely eliminates broad expression matching (`LIKE '%auth.uid()%'` or `LIKE '%is_admin()%'`) in favor of a strict 54-policy allowlist across all 17 public tables:

### 4.1 Preserved Storefront Public Read Policies (8 policies `TO public`)
The following 8 policies remain assigned `TO public` to allow anonymous browsing of the storefront:
1. `categories`: `"Public can view active categories"` (`SELECT`, `is_active = TRUE`)
2. `products`: `"Public can view active products"` (`SELECT`, `is_active = TRUE`)
3. `product_images`: `"Public can view images of active products"` (`SELECT`)
4. `product_variants`: `"Public can view variants of active products"` (`SELECT`)
5. `inventory`: `"Public can view inventory of active products"` (`SELECT`)
6. `banners`: `"Public can view active banners"` (`SELECT`, `is_active = TRUE`)
7. `coupons`: `"Public can view active valid coupons"` (`SELECT`, `is_active = TRUE AND expires_at > NOW()`)
8. `reviews`: `"Public can view approved reviews"` (`SELECT`, `is_approved = TRUE`)

### 4.2 Preserved Catalog Admin Policies (8 policies `TO authenticated`, Phase 9.1 Baseline)
1. `categories`: `"Admins full access to categories"` (`ALL`)
2. `products`: `"Admins full access to products"` (`ALL`)
3. `product_images`: `"Admins full access to product images"` (`ALL`)
4. `product_variants`: `"Admins full access to product variants"` (`ALL`)
5. `inventory`: `"Admins full access to inventory"` (`ALL`)
6. `banners`: `"Admins full access to banners"` (`ALL`)
7. `coupons`: `"Admins full access to coupons"` (`ALL`)
8. `reviews`: `"Admins full access to reviews"` (`ALL`)

### 4.3 Standardized Customer & Admin Policies (38 policies `TO authenticated`)
The following 38 policies are validated by exact name, command, and expression before standardizing their role from `public` to `authenticated`:
- **`profiles` (5):** `"Users view own profile"` (`SELECT`), `"Users update own profile"` (`UPDATE`), `"Admins can view all profiles"` (`SELECT`), `"Admins can update all profiles"` (`UPDATE`), `"Admins can delete profiles"` (`DELETE`).
- **`addresses` (5):** `"Users view own addresses"` (`SELECT`), `"Users insert own addresses"` (`INSERT`), `"Users update own addresses"` (`UPDATE`), `"Users delete own addresses"` (`DELETE`), `"Admins can view all addresses"` (`SELECT`).
- **`carts` (5):** `"Users view own cart"` (`SELECT`), `"Users insert own cart"` (`INSERT`), `"Users update own cart"` (`UPDATE`), `"Users delete own cart"` (`DELETE`), `"Admins can view all carts"` (`SELECT`).
- **`cart_items` (5):** `"Users view own cart items"` (`SELECT`), `"Users insert own cart items"` (`INSERT`), `"Users update own cart items"` (`UPDATE`), `"Users delete own cart items"` (`DELETE`), `"Admins can view all cart items"` (`SELECT`).
- **`wishlists` (4):** `"Users view own wishlist"` (`SELECT`), `"Users insert own wishlist"` (`INSERT`), `"Users delete own wishlist"` (`DELETE`), `"Admins can view all wishlists"` (`SELECT`).
- **`wishlist_items` (4):** `"Users view own wishlist items"` (`SELECT`), `"Users insert own wishlist items"` (`INSERT`), `"Users delete own wishlist items"` (`DELETE`), `"Admins can view all wishlist items"` (`SELECT`).
- **`orders` (2):** `"Users view own orders"` (`SELECT`), `"Admins full access to orders"` (`ALL`).
- **`order_items` (2):** `"Users view own order items"` (`SELECT`), `"Admins full access to order items"` (`ALL`).
- **`payments` (2):** `"Users view own payments"` (`SELECT`), `"Admins full access to payments"` (`ALL`).
- **`reviews` (4):** `"Users view own reviews"` (`SELECT`), `"Users create own reviews"` (`INSERT`), `"Users update own reviews"` (`UPDATE`), `"Users delete own reviews"` (`DELETE`).

---

## 5. Function Security Audit

| Function Signature | Security Mode | `search_path` | Granted Roles | Direct Client / Trigger Usage |
|---|---|---|---|---|
| `public.is_admin()` | `SECURITY DEFINER` | `public, pg_temp` | `authenticated` | Frontend RPC (`authService`, `adminService`) and RLS helper. |
| `public.get_admin_customers()` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Admin dashboard customer management RPC. |
| `public.sync_user_cart(jsonb)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Customer cart item synchronization RPC. |
| `public.place_order(uuid,text,text)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Customer transactional checkout RPC. |
| `public.cancel_order(uuid)` | `SECURITY DEFINER` | `''` (empty) | `authenticated` | Customer order cancellation RPC. |
| `public.create_profile_on_signup()` | `SECURITY DEFINER` | `''` (empty) | `NONE` (Trigger only) | Triggered `AFTER INSERT ON auth.users`. |
| `public.prevent_role_self_escalation()` | `SECURITY DEFINER` | `''` (empty) | `NONE` (Trigger only) | Triggered `BEFORE UPDATE ON public.profiles`. |
| `public.restore_inventory_on_cancellation()`| `SECURITY DEFINER` | `''` (empty) | `NONE` (Trigger only) | Triggered `AFTER UPDATE OF status ON public.orders`. |
| `public.set_updated_at()` | `SECURITY INVOKER` | `public` | `NONE` (Trigger only) | Triggered `BEFORE UPDATE` on timestamped tables. |

*Why trigger functions do not require client grants:* Database triggers execute under the caller/definer context without requiring ordinary client roles (`anon`, `authenticated`) to hold direct `EXECUTE` privileges on the function. Revoking direct execution prevents unauthenticated or client-side tampering via direct PostgREST RPC endpoints.

---

## 6. Snapshot Design & Exact Reversibility

To guarantee exact reversibility without guessing or blanket grants:
1. `phase9_2_private.table_acl_snapshot`: Captures table owner, whether `relacl` was NULL, the decompiled ACL text, and full `aclexplode()` JSONB for all 17 public tables.
2. `phase9_2_private.function_acl_snapshot`: Captures function OID, owner, whether `proacl` was NULL, original comment, and full `aclexplode()` JSONB for all 9 application functions.
3. `phase9_2_private.policy_snapshot`: Captures exact table name, policy name, command, original roles, new roles, and full USING / WITH CHECK expressions before altering any policy.
4. `phase9_2_private.storage_policy_created`: Tracks policies newly created by Phase 9.2 (`creation_status = 'CREATED'`) so pre-existing compatible policies are never dropped on rollback.

---

## 7. Storage Bucket & Avatar Policy Design

- **Bucket Provisioning:** `public-assets` is created idempotently with `public = true`.
- **Avatar Upload Invariants (`src/services/authService.js`):**
  - Bucket name: `public-assets`
  - Object path: `avatars/${userId}.${ext}` (folder depth = 1, filename = `${userId}.${ext}`)
  - Upload options: `{ upsert: true }`
  - Supported extensions: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`
- **Enforced Storage Policies on `storage.objects`:**
  1. `SELECT`: Scoped to `bucket_id = 'public-assets'`, folder `avatars` (depth=1), and filename starting with `auth.uid()`.
  2. `INSERT`: Scoped with `WITH CHECK` enforcing identical path, folder, and `auth.uid()` image regex.
  3. `UPDATE`: Enforces identical constraints on BOTH `USING` and `WITH CHECK` to prevent file renaming or cross-user hijacking during `upsert: true`.
  4. `DELETE`: Scoped to `auth.uid()` matching filename.

---

## 8. Public Bucket Access Limitations

> [!IMPORTANT]
> **CDN DOWNLOAD BEHAVIOR**  
> In Supabase Storage, buckets with `public = true` serve files directly via the public CDN endpoint (`/storage/v1/object/public/public-assets/...`) without evaluating Row Level Security on `storage.objects`.  
> Avatar files are publicly viewable by design. Private documents (invoices, identity records) must **never** be stored in `public-assets`. Storage RLS policies govern **authenticated Storage API operations** (`INSERT`, `UPDATE`, `DELETE`, and PostgREST authenticated reads).

---

## 9. Rollback Design & PostgreSQL Limitations

- **Snapshot-Driven:** Rollback queries `phase9_2_private` and restores exact recorded permissions. It does NOT use blanket `GRANT ALL`.
- **Data Preservation Guarantee:** Rollback **never** deletes the `public-assets` bucket, storage objects, or avatar files.
- **Selective Policy Cleanup:** Rollback drops only policies tracked in `phase9_2_private.storage_policy_created` with `creation_status = 'CREATED'` carrying comment marker `'SHOPKART_PHASE9_2_CREATED_V1'`.
- **Technical Limitations of PostgreSQL ACL Restoration:**
  - In PostgreSQL, ACL arrays cannot be assigned via direct SQL assignment. Rollback reconstructs privileges using supported `GRANT`/`REVOKE` statements from decompiled `aclexplode()` JSONB records.
  - If a grantee role was deleted from `pg_roles` between migration and rollback, automatic rollback detects this condition in preflight and **aborts immediately** to avoid catalog corruption.
- **Security Warning:** Rollback intentionally restores the pre-Phase-9.2 security configuration, which may reintroduce broad anonymous or public permissions. It is an emergency recovery tool, not a recommended security state.

---

## 10. Remaining Risks & Post-Phase 9 Scope

1. **Simulated Payment Processing (Phase 10 Scope - simulated payment processing):**
   - *Status:* `[SOURCE VERIFIED]`
   - *Detail:* The payment system currently operates in pending simulated payment mode. Phase 10 will deploy a server-side webhook handler to verify Razorpay HMAC signatures before updating payment rows.
2. **Pre-existing Storage Objects & Content Validation:**
   - Storage filename extension regex allowlisting (`png|jpg|jpeg|webp|gif`) prevents malicious extension uploads (.svg, .html, .exe) via the API, but does not perform server-side binary magic-number MIME sniffing. Phase 10 will introduce Edge Function content sniffing for uploaded media.
3. **Manual Staging Execution Required:**
   - Security improvements do not take effect until `migration.sql` is executed in the Supabase SQL Editor on `ShopKart-Staging`.

---

## 11. Manual Staging Verification Checklist

- [ ] Anonymous storefront browsing (home, products, categories, active banners).
- [ ] Anonymous access blocked on private customer tables (`profiles`, `addresses`, `orders`).
- [ ] Customer profile loading and address management.
- [ ] Cart updates via `sync_user_cart`.
- [ ] Order placement and stock deduction via `place_order`.
- [ ] Order cancellation and inventory restocking via `cancel_order`.
- [ ] Avatar upload, replacement, and public URL rendering.
- [ ] Cross-user avatar overwrite/delete attempt rejected.
- [ ] Non-image file upload attempt rejected.
- [ ] Coupon validation during checkout (`SHOPKART10`).

---

## 12. Final Approval Status

**Status:** **READY FOR STAGING REVIEW**  
All SQL files and verification scripts are fully prepared, verified against the project codebase, and ready for execution in the Supabase SQL Editor on `ShopKart-Staging`.
