# ShopKart — Phase 2: Backend & Database Deep Audit
## Document 3: Stored Procedures, Functions & Triggers Deep Audit

**Audit Status:** COMPLETE  
**Audit Mode:** STRICTLY READ-ONLY  
**Audited Items:** 9 Application Functions + 15 Database Triggers  
**Security Standard:** CWE-89 (SQL Injection), CWE-426 (Untrusted Search Path), CWE-269 (Privilege Management)

---

## 1. Stored Procedure & Function Inventory (9 Functions)

| # | Function Signature | Defined In | Sec Context | search_path | Client RPC? | Hardened Grant |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `public.set_updated_at()` | `schema.sql:33` | INVOKER | `''` (empty) | No (Trigger) | Revoked from client roles |
| 2 | `public.is_admin()` | `schema.sql:415` | DEFINER | `''` (empty) | Internal / RLS | `authenticated` |
| 3 | `public.prevent_role_self_escalation()`| `schema.sql:434` | INVOKER | `''` (empty) | No (Trigger) | Revoked from client roles |
| 4 | `public.create_profile_on_signup()` | `schema.sql:457` | DEFINER | `''` (empty) | No (Auth Trg)| Revoked from client roles |
| 5 | `public.place_order(UUID, TEXT, TEXT)` | `phase7_1:207` | DEFINER | `''` (empty) | Yes (Checkout)| `authenticated` |
| 6 | `public.sync_user_cart(JSONB)` | `phase7_1:16` | DEFINER | `''` (empty) | Yes (Cart Sync)| `authenticated` |
| 7 | `public.cancel_order(UUID)` | `phase7_2:25` | DEFINER | `''` (empty) | Yes (Cancel) | `authenticated` |
| 8 | `public.restore_inventory_on_cancellation()` | `phase8_1:21` | DEFINER | `''` (empty) | No (Orders Trg)| Revoked from client roles |
| 9 | `public.get_admin_customers()` | `phase7:12` | DEFINER | `''` (empty) | Yes (Admin RPC)| `authenticated` (Admin check)|

---

## 2. In-Depth Technical Function Audit

### 1. `public.set_updated_at()`
- **File & Lines:** `database/schema.sql:33-40`
- **Return Type:** `TRIGGER`
- **Security Mode:** `SECURITY INVOKER` (default). Safe because it only mutates `NEW.updated_at = NOW();` within the caller's context.
- **Search Path:** Explicitly hardened with `SET search_path = ''`.
- **Trigger Usage:** Executed on `BEFORE UPDATE` by 12 public tables (`profiles`, `addresses`, `categories`, `products`, `product_variants`, `inventory`, `carts`, `coupons`, `orders`, `payments`, `reviews`, `banners`).

---

### 2. `public.is_admin()`
- **File & Lines:** `database/schema.sql:415-427`
- **Return Type:** `BOOLEAN`
- **Security Mode:** `SECURITY DEFINER` (required so unprivileged users can check admin status without having direct table access to read other profiles).
- **Search Path:** Hardened with `SET search_path = ''`.
- **Implementation:**
  ```sql
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
  ```
- **Privilege Hardening:** Phase 9.2 granted `EXECUTE` only to `authenticated` (`migration.sql:387`). If unauthenticated `anon` calls it, execution is denied or safely returns `FALSE`.

---

### 3. `public.prevent_role_self_escalation()`
- **File & Lines:** `database/schema.sql:434-448`
- **Return Type:** `TRIGGER`
- **Security Mode:** `SECURITY INVOKER`.
- **Search Path:** Hardened with `SET search_path = ''`.
- **Implementation:**
  - Evaluates: `IF NEW.role <> OLD.role AND NOT public.is_admin() THEN RAISE EXCEPTION 'Only administrators can change user roles.'; END IF;`
- **Trigger Association:** `BEFORE UPDATE OF role ON profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();`.
- **Assessment:** Solid defense-in-depth against privilege escalation via PostgREST profile patch requests.

---

### 4. `public.create_profile_on_signup()`
- **File & Lines:** `database/schema.sql:457-469`
- **Return Type:** `TRIGGER`
- **Security Mode:** `SECURITY DEFINER`.
- **Search Path:** Hardened with `SET search_path = ''`.
- **Implementation:**
  - Extracts `full_name` and `avatar_url` from `NEW.raw_user_meta_data`.
  - Inserts row into `public.profiles` with `role = 'customer'` hardcoded.
- **Trigger Association:** `AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup();`.

---

### 5. `public.place_order(p_address_id UUID, p_notes TEXT, p_coupon_code TEXT)`
- **File & Lines:** `database/migrations/phase7_1_security_and_cart_fixes.sql:207-405`
- **Return Type:** `UUID` (Created order ID).
- **Security Mode:** `SECURITY DEFINER`.
- **Search Path:** Hardened with `SET search_path = ''`.
- **Concurrency & Locking Control:**
  1. `SELECT id INTO v_cart_id FROM public.carts WHERE user_id = v_user_id FOR UPDATE;` (Locks user cart to prevent concurrent checkouts).
  2. `SELECT * FROM public.inventory WHERE product_id = r.product_id ... FOR UPDATE;` (Pessimistic row-level lock on inventory rows prevents overselling).
  3. `SELECT * INTO v_coupon FROM public.coupons WHERE code = UPPER(TRIM(p_coupon_code)) FOR UPDATE;` (Pessimistic lock on coupon row ensures atomic quota consumption).
- **Integrity Controls:**
  - Recomputes all item prices from `public.products.price` (ignores client-submitted prices).
  - Validates minimum order value, coupon expiration, and active status server-side.
  - Clears `public.cart_items` in the same atomic transaction.
- **Discrepancy Warning:**
  - `database/schema.sql:482` contains the legacy 2-parameter signature: `place_order(p_address_id UUID, p_notes TEXT)`.
  - The migration `phase7_1_security_and_cart_fixes.sql` correctly drops the 2-parameter version and defines the 3-parameter version.
  - **CRITICAL RISK:** If `database/schema.sql` is rerun, PostgreSQL will recreate the 2-parameter overload without coupon validation!

---

### 6. `public.sync_user_cart(p_items JSONB)`
- **File & Lines:** `database/migrations/phase7_1_security_and_cart_fixes.sql:16-198`
- **Return Type:** `JSONB`
- **Security Mode:** `SECURITY DEFINER`.
- **Search Path:** Hardened with `SET search_path = ''`.
- **Concurrency & Validation:**
  - Validates array bounds: rejects empty or oversized payloads.
  - Validates each item: checks that quantity is between 1 and 99.
  - Checks product existence, active status (`is_active = TRUE`), and available inventory stock before committing.
  - Serializes operations with `FOR UPDATE` on user cart.

---

### 7. `public.cancel_order(p_order_id UUID)`
- **File & Lines:** `database/migrations/phase7_2_customer_order_cancellation.sql:25-99`
- **Return Type:** `JSONB` (`{"success": true, "order_id": ...}`)
- **Security Mode:** `SECURITY DEFINER`.
- **Search Path:** Hardened with `SET search_path = ''`.
- **Integrity Controls:**
  - Locks order row with `FOR UPDATE`.
  - Verifies caller ownership (`orders.user_id = auth.uid()` or `is_admin()`).
  - Verifies status eligibility: ONLY `pending` or `processing` orders can be cancelled.
  - Rejects cancellation of `shipped`, `delivered`, `refunded`, or already `cancelled` orders.
  - Updating status to `cancelled` triggers `restore_inventory_on_cancellation()`.

---

### 8. `public.restore_inventory_on_cancellation()`
- **File & Lines:** `database/migrations/phase8_1_inventory_restoration_safety.sql:21-65`
- **Return Type:** `TRIGGER`
- **Security Mode:** `SECURITY DEFINER`.
- **Search Path:** Hardened with `SET search_path = ''`.
- **Guard Logic & Safety:**
  - Timing: `AFTER UPDATE OF status ON public.orders FOR EACH ROW`.
  - Execution Guard: `WHEN (OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled')`.
  - Terminal Status Guard: Explicitly checks `IF OLD.status IN ('shipped', 'delivered') THEN RETURN NEW; END IF;` preventing inventory double-count if a shipped order is refunded.
  - Loops over `public.order_items WHERE order_id = NEW.id` and increments `public.inventory.quantity`.

---

### 9. `public.get_admin_customers()`
- **File & Lines:** `database/migrations/phase7_backend_enhancements.sql:12-51`
- **Return Type:** `TABLE(id UUID, email VARCHAR, full_name TEXT, phone TEXT, role TEXT, total_orders BIGINT, total_spent NUMERIC, created_at TIMESTAMPTZ)`
- **Security Mode:** `SECURITY DEFINER`.
- **Search Path:** Hardened with `SET search_path = ''`.
- **Authorization Check:**
  - `IF NOT public.is_admin() THEN RAISE EXCEPTION 'Access denied. Administrator privileges required.'; END IF;`
  - Accesses `auth.users` securely on the server to retrieve customer email addresses without exposing `auth.users` to direct client queries.

---

## 3. Database Triggers Comprehensive Audit (15 Triggers)

| # | Trigger Name | Table | Event | Timing | Function Executed | Purpose |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `profiles_updated_at` | `profiles` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 2 | `addresses_updated_at` | `addresses` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 3 | `categories_updated_at`| `categories`| `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 4 | `products_updated_at` | `products` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 5 | `product_variants_updated_at` | `product_variants` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 6 | `inventory_updated_at` | `inventory`| `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 7 | `carts_updated_at` | `carts` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 8 | `coupons_updated_at` | `coupons` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 9 | `orders_updated_at` | `orders` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 10 | `payments_updated_at` | `payments` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 11 | `reviews_updated_at` | `reviews` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 12 | `banners_updated_at` | `banners` | `UPDATE` | `BEFORE` | `set_updated_at()` | Auto timestamp |
| 13 | `guard_role_escalation` | `profiles` | `UPDATE OF role` | `BEFORE` | `prevent_role_self_escalation()` | Blocks privilege escalation |
| 14 | `on_auth_user_created` | `auth.users`| `INSERT` | `AFTER` | `create_profile_on_signup()` | Auto creates public profile |
| 15 | `trg_restore_inventory_on_cancel` | `orders` | `UPDATE OF status` | `AFTER` | `restore_inventory_on_cancellation()` | Restores inventory stock |

---

## 4. Key Security & Functional Takeaways

1. **Untrusted Search Path Defense:** All 9 functions strictly implement `SET search_path = ''` with fully-qualified schema object references (`public.tableName`, `auth.users`, etc.).
2. **Execution Least-Privilege:** Under Phase 9.2 hardening, direct execution of trigger functions (`set_updated_at`, `prevent_role_self_escalation`, `restore_inventory_on_cancellation`, `create_profile_on_signup`) is revoked from `PUBLIC`, `anon`, and `authenticated`.
3. **Pessimistic Concurrency:** Stock deduction in `place_order`, stock release in `restore_inventory_on_cancellation`, cart synchronization in `sync_user_cart`, and status transitions in `cancel_order` all use row-level locking (`FOR UPDATE`) to prevent race conditions.
