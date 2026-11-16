# ShopKart — Phase 3: Security Hardening & Master Security Audit
## Document 3: PostgreSQL Stored Procedures, Functions & RPC Security

**Audit Phase:** Phase 3 — Stage A  
**Scope:** All 9 Application Functions, RPC Endpoints, and Triggers  
**Security Principles:** CWE-89 (SQL Injection), CWE-426 (Untrusted Search Path), CWE-269 (Improper Privilege Management)

---

## 1. Inventory & Security Attributes of All 9 Database Functions

| Function Signature | Defined In | Sec Context | search_path | Client RPC? | Hardened Execution Grant |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `public.set_updated_at()` | `schema.sql:33` | INVOKER | `''` (empty) | NO | Revoked from client roles |
| `public.is_admin()` | `schema.sql:415` | DEFINER | `''` (empty) | Internal/RLS| `authenticated` |
| `public.prevent_role_self_escalation()` | `schema.sql:434` | INVOKER | `''` (empty) | NO | Revoked from client roles |
| `public.create_profile_on_signup()` | `schema.sql:457` | DEFINER | `''` (empty) | NO (Trigger) | Revoked from client roles |
| `public.place_order(UUID, TEXT, TEXT)` | `phase7_1:207` | DEFINER | `''` (empty) | YES | `authenticated` |
| `public.sync_user_cart(JSONB)` | `phase7_1:16` | DEFINER | `''` (empty) | YES | `authenticated` |
| `public.cancel_order(UUID)` | `phase7_2:25` | DEFINER | `''` (empty) | YES | `authenticated` |
| `public.restore_inventory_on_cancellation()` | `phase8_1:21` | DEFINER | `''` (empty) | NO (Trigger) | Revoked from client roles |
| `public.get_admin_customers()` | `phase7:12` | DEFINER | `''` (empty) | YES | `authenticated` (Admin check) |

---

## 2. In-Depth Security Analysis of Client-Exposed RPC Functions

### 1. `public.place_order(p_address_id UUID, p_notes TEXT, p_coupon_code TEXT)`
- **Location:** `database/migrations/phase7_1_security_and_cart_fixes.sql:207-405`
- **Security Mode:** `SECURITY DEFINER` | **Search Path:** `SET search_path = ''`
- **Privilege Grants:** Revoked from `PUBLIC` and `anon`. Granted strictly to `authenticated`.
- **Identity & Authorization Checks:**
  - `v_user_id UUID := auth.uid();`
  - Rejects if unauthenticated: `IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required to place an order.'; END IF;`
  - Validates address ownership: `SELECT id INTO v_verified_addr FROM public.addresses WHERE id = p_address_id AND user_id = v_user_id;`
  - Prevents placing orders using another customer's shipping address.
- **Pessimistic Concurrency & Stock Validation:**
  - Locks user cart: `SELECT id INTO v_cart_id FROM public.carts WHERE user_id = v_user_id FOR UPDATE;`
  - Locks inventory rows: `SELECT * FROM public.inventory WHERE product_id = r.product_id ... FOR UPDATE;`
  - Validates stock availability: `IF v_stock.quantity < r.quantity THEN RAISE EXCEPTION 'Insufficient stock...'; END IF;`
- **Server-Authoritative Price & Coupon Calculations:**
  - Fetches product price from database: `JOIN public.products p ON p.id = ci.product_id`
  - Re-computes item totals and subtotal server-side. Completely ignores client prices.
  - Coupon row locked `FOR UPDATE`: validates `is_active`, `expires_at`, `max_uses`, and `min_order_value`.
  - Atomically increments `used_count` and clears user cart line items in the same transaction.
- **Legacy Overload Analysis:**
  - `database/schema.sql:482` contains the legacy 2-parameter signature `place_order(UUID, TEXT)`.
  - `orderService.js:384` always sends `{ p_address_id, p_notes, p_coupon_code }`.
  - To prevent PostgREST overload ambiguity and schema drift, `database/schema.sql` must drop the 2-parameter signature.

---

### 2. `public.sync_user_cart(p_items JSONB)`
- **Location:** `database/migrations/phase7_1_security_and_cart_fixes.sql:16-198`
- **Security Mode:** `SECURITY DEFINER` | **Search Path:** `SET search_path = ''`
- **Privilege Grants:** Revoked from `PUBLIC` and `anon`. Granted strictly to `authenticated`.
- **Identity & Authorization Checks:**
  - Enforces `v_user_id UUID := auth.uid();`. Does NOT accept a `cart_id` from the client.
  - Retrieves or creates the user's cart strictly matching `user_id = v_user_id`.
  - Customer A cannot manipulate or overwrite Customer B’s cart.
- **Input Validation & Bound Checking:**
  - Rejects non-array JSON payloads.
  - Rejects payload if array length exceeds 50 items.
  - Validates each item quantity: `IF v_qty < 1 OR v_qty > 99 THEN RAISE EXCEPTION 'Invalid quantity...'; END IF;`
  - Verifies that `product_id` exists and is active (`is_active = TRUE`).
  - Verifies inventory stock availability with `FOR UPDATE` pessimistic row locking.

---

### 3. `public.cancel_order(p_order_id UUID)`
- **Location:** `database/migrations/phase7_2_customer_order_cancellation.sql:25-99`
- **Security Mode:** `SECURITY DEFINER` | **Search Path:** `SET search_path = ''`
- **Privilege Grants:** Revoked from `PUBLIC` and `anon`. Granted strictly to `authenticated`.
- **Identity & Authorization Checks:**
  - Enforces `v_user_id UUID := auth.uid();`.
  - Acquires row-level lock: `SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;`
  - Verifies ownership: `IF v_order.user_id <> v_user_id AND NOT public.is_admin() THEN RAISE EXCEPTION 'You are not authorized to cancel this order.'; END IF;`
  - Rejects if status is not `pending` or `processing`. Orders marked `shipped`, `delivered`, `refunded`, or `cancelled` cannot be cancelled by customers.

---

### 4. `public.get_admin_customers()`
- **Location:** `database/migrations/phase7_backend_enhancements.sql:12-51`
- **Security Mode:** `SECURITY DEFINER` | **Search Path:** `SET search_path = ''`
- **Privilege Grants:** Revoked from `PUBLIC` and `anon`. Granted strictly to `authenticated`.
- **Authorization Enforcement:**
  - Enforces: `IF NOT public.is_admin() THEN RAISE EXCEPTION 'Access denied. Administrator privileges required.'; END IF;`
  - Joins `auth.users` on the server to safely aggregate customer emails and order totals without exposing `auth.users` table directly to client queries.

---

## 3. Trigger Function Security (Execution Revocation)

Under Phase 9.2 hardening (`supabase/phase-9.2/migration.sql:375-395`):
- Direct `EXECUTE` privileges on internal trigger functions are **explicitly revoked** from `PUBLIC`, `anon`, and `authenticated`:
  1. `public.set_updated_at()`
  2. `public.prevent_role_self_escalation()`
  3. `public.create_profile_on_signup()`
  4. `public.restore_inventory_on_cancellation()`
- **Security Guarantee:** Triggers execute internally under the table event context. Revoking direct execution rights prevents attackers from invoking trigger functions directly via PostgREST RPC endpoints.

---

## 4. Search Path Injection Defense (CWE-426)

All 9 functions enforce `SET search_path = ''`.
- **Attack Vector:** In PostgreSQL, if an untrusted user creates a malicious function or operator in a public schema and calls a `SECURITY DEFINER` function with a default search path, the function may execute the malicious object under superuser/definer privileges.
- **ShopKart Defense:** By explicitly clearing the search path (`SET search_path = ''`) and qualifying every database object reference (`public.products`, `auth.users`, `storage.objects`), search-path hijacking attacks are completely neutralized across all functions.
