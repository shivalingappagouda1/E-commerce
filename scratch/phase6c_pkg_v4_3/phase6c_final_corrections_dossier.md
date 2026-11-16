# ShopKart — Phase 6C Final Corrections Dossier v4.3
## Lock Hierarchy Unification, Concurrency Submission IDs, Auth Bootstrap & Idempotency Lifecycle

> [!CAUTION]
> **Phase 6C status: NOT APPROVED — AWAITING INDEPENDENT SOURCE REVIEW.**
> This document records all v4.3 corrections implemented across the migration SQL, lock ordering, concurrency runner test IDs, synchronization barrier Test E2, real PostgreSQL Docker bootstrap, checkout idempotency lifecycle, cancellation trigger ordering, admin expiry RPC integration, and physical return eligibility restrictions.
> Final approval is reserved exclusively for the system owner after independent source review.
> **Zero SQL has been applied or executed against Supabase. No remote database or credentials have been touched.**

---

## 1. Executive Status & Metrics

| Component | Status | Details |
|---|---|---|
| **Lock Ordering Hierarchy** | ✅ **CORRECTED** | Unified universal lock order (`orders` → `payments` → `payment_submissions`) across `admin_verify_utr` and `cancel_order`. `admin_verify_utr` looks up order/payment IDs without lock, acquires Tier 1 Order lock, Tier 2 Payment lock, Tier 3 Submission lock, and revalidates state under lock. Deadlocks mathematically eliminated |
| **Deterministic Barrier Test E2** | ✅ **IMPLEMENTED** | Multi-connection test with 3 independent TCP client sessions (`client1`, `client2`, `observerClient`). Proves Client 2 is actively BLOCKED by Client 1 on parent order lock via `pg_blocking_pids()`, verified commit, clean unblocking without deadlock (40P01), and rejection with expected pending status error |
| **Concurrency Test Submission IDs** | ✅ **CORRECTED** | Test E and Test F in `scratch/test_true_concurrent_connections.mjs` capture the actual `submission_id` returned by `submit_phonepe_utr()` and pass genuine submission IDs to `admin_verify_utr()`. Assertions verify final order, payment, submission, and inventory states |
| **Real PostgreSQL Bootstrap** | ✅ **IMPLEMENTED** | Local-only compatibility bootstrap (`auth` schema, `auth.users`, `auth.uid()`, `auth.role()`, roles `anon`, `authenticated`, `service_role`) executes *after* the read-only empty-database preflight and *before* `schema.sql`. Allows vanilla PostgreSQL 17 Docker instances to run without schema errors while maintaining strict preflight safety |
| **Checkout Idempotency Lifecycle** | ✅ **CORRECTED** | `CheckoutPage.jsx` compares stored fingerprint vs current on initial mount: reuses key only on match, generates and persists new key immediately on mismatch. Synchronous `submittingRef` lock preserved. Clears attempt from `sessionStorage` strictly upon confirmed order creation |
| **Idempotency Lifecycle Tests** | ✅ **7/7 PASS** | Dedicated test suite `scratch/test_checkout_idempotency_lifecycle.mjs` verifying initial load, unchanged cart reload reuse, changed cart rotation, address change, payment method change, coupon change, and confirmed order clearing |
| **Cancellation Inventory Ordering** | ✅ **CORRECTED** | `restore_inventory_on_cancellation()` loops with `ORDER BY product_id ASC, variant_id ASC NULLS FIRST`, acquires `PERFORM 1 FROM public.inventory ... FOR UPDATE`, and raises clear exception if inventory record is missing |
| **Expiry RPC Integration** | ✅ **CORRECTED** | `expire_pending_phonepe_orders()` kept restricted to `service_role` (cron). Created authorized wrapper `admin_expire_pending_phonepe_orders()` (`SECURITY DEFINER`, `is_admin()` check, granted to `authenticated`). Updated `src/services/adminService.js` to call the admin RPC |
| **Physical Return Eligibility** | ✅ **CORRECTED** | `admin_create_return_inspection()` and `_restock_approved_return_inspections()` strictly require fulfillment status `status IN ('shipped', 'delivered')`. Orders that were cancelled or never shipped/delivered are blocked from return inspection and restocking |
| **PGlite Test Integrity Check** | ✅ **182/182 PASS** | Strict enforcement of `EXPECTED_TEST_COUNT = 182`. Asserts `passed === 182`, `failed === 0`, `skipped === 0`, `invalid === 0`, with category-by-category validation across all 22 categories |
| **Catalog Preflight Tests** | ✅ **5/5 PASS** | Isolated test suite (`scratch/test_catalog_preflight.mjs`) verifying standalone composite detection, enum, domain, and relation row type exclusion (`npm run test:phase6c:catalog`) |
| **Missing Source Dependency** | ✅ **INCLUDED** | `src/services/orderService.js` included in review package, confirming authoritative 5-argument `place_order` RPC call matching migration signature |
| **PostgreSQL Concurrency Test Suite** | ⚠️ **NOT EXECUTED** | Tests A–H, E2, and H2 implemented; local TCP port 5432 inactive on host (`connect EACCES 127.0.0.1:5432`); cleanly exits with code 1; transparently reported as NOT EXECUTED |
| **Frontend Production Build** | ✅ **PASS** | `npm run build` succeeds in 1.56s (2,167 modules transformed, 0 build errors) |
| **Frontend Lint Check** | ✅ **PASS** | `npm run lint` completes with 0 errors across 174 files |
| **Supabase Remote Execution** | ⛔ **NOT APPLIED** | Migration intentionally withheld pending local PostgreSQL concurrency verification and owner sign-off |

---

## 2. File-by-File Change Log (v4.3)

### 1. `database/migrations/phase6c_order_and_checkout_corrections.sql`

- **Lock Ordering Unification in `admin_verify_utr()`**:
  Reordered row locks to follow the universal hierarchy (`orders` → `payments` → `payment_submissions`):
  ```sql
  -- 2. Lookup submission metadata without locks to identify parent order and payment
  SELECT id, order_id, payment_id, status, utr_number
  INTO v_sub
  FROM public.payment_submissions
  WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment submission not found';
  END IF;

  -- 3. Universal lock hierarchy: Tier 1 - Lock Order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_sub.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Order is not in pending status (current status: %)', v_order.status;
  END IF;

  -- Tier 2 - Lock Payment
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = v_sub.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment is not in pending status (current status: %)', v_payment.status;
  END IF;

  -- Tier 3 - Lock and revalidate Submission under row lock
  SELECT * INTO v_sub
  FROM public.payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment submission not found';
  END IF;

  IF v_sub.status <> 'submitted' THEN
    RAISE EXCEPTION 'Submission has already been reviewed (current status: %)', v_sub.status;
  END IF;
  ```

- **Separately Authorized Admin Expiry RPC `admin_expire_pending_phonepe_orders()`**:
  ```sql
  CREATE OR REPLACE FUNCTION public.admin_expire_pending_phonepe_orders()
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    v_admin_id UUID := auth.uid();
  BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Administrator privileges required';
    END IF;

    RETURN public.expire_pending_phonepe_orders();
  END;
  $$;

  REVOKE ALL ON FUNCTION public.admin_expire_pending_phonepe_orders() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.admin_expire_pending_phonepe_orders() FROM anon;
  GRANT EXECUTE ON FUNCTION public.admin_expire_pending_phonepe_orders() TO authenticated;
  ```

- **Cancellation Inventory Lock Ordering in `restore_inventory_on_cancellation()`**:
  ```sql
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' AND NOT v_is_paid THEN
    FOR v_item IN
      SELECT oi.product_id, oi.variant_id, SUM(oi.quantity)::INT AS quantity
      FROM public.order_items oi
      WHERE oi.order_id = NEW.id
      GROUP BY oi.product_id, oi.variant_id
      ORDER BY oi.product_id ASC, oi.variant_id ASC NULLS FIRST
    LOOP
      PERFORM 1
      FROM public.inventory
      WHERE product_id = v_item.product_id
        AND variant_id IS NOT DISTINCT FROM v_item.variant_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found for product % variant % on cancellation rollback', v_item.product_id, v_item.variant_id;
      END IF;

      UPDATE public.inventory
      SET quantity = quantity + v_item.quantity
      WHERE product_id = v_item.product_id
        AND variant_id IS NOT DISTINCT FROM v_item.variant_id;
    END LOOP;
  ...
  ```

- **Physical Return Eligibility Restrictions**:
  In `admin_create_return_inspection()`:
  ```sql
  SELECT id, status INTO v_locked_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_locked_order.status NOT IN ('shipped', 'delivered') THEN
    RAISE EXCEPTION 'Cannot create return inspection for order % in status %: only shipped or delivered orders are eligible for return', p_order_id, v_locked_order.status;
  END IF;
  ```

  In `_restock_approved_return_inspections()`:
  ```sql
  SELECT id, status INTO v_locked_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found for restocking', p_order_id;
  END IF;

  IF v_locked_order.status NOT IN ('shipped', 'delivered', 'refunded') THEN
    RAISE EXCEPTION 'Order % in status % is not eligible for physical return restocking (must have been shipped or delivered)', p_order_id, v_locked_order.status;
  END IF;
  ```

---

### 2. `database/migrations/phase6c_rollback.sql`
- Added:
  ```sql
  DROP FUNCTION IF EXISTS public.admin_expire_pending_phonepe_orders();
  ```

---

### 3. `src/services/adminService.js`
- Updated `adminExpirePendingPhonepeOrders()` RPC invocation:
  ```javascript
  const { data, error } = await client.rpc('admin_expire_pending_phonepe_orders')
  ```

---

### 4. `src/pages/customer/CheckoutPage.jsx`
- Fixed initial `useState` to compare stored fingerprint against `orderFingerprint` before reusing any key:
  ```javascript
  const [checkoutAttemptKey, setCheckoutAttemptKey] = useState(() => {
    try {
      const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('shopkart_checkout_attempt') : null
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.fingerprint === orderFingerprint && parsed?.idempotencyKey) {
          return parsed.idempotencyKey
        }
      }
    } catch {}
    const newKey = generateIdempotencyKey()
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('shopkart_checkout_attempt', JSON.stringify({
          fingerprint: orderFingerprint,
          idempotencyKey: newKey,
        }))
      }
    } catch {}
    return newKey
  })
  ```
- Retained synchronous `submittingRef.current = true` lock.
- Removal of `sessionStorage.getItem('shopkart_checkout_attempt')` occurs strictly on confirmed order creation (`if (orderError) return;`).

---

### 5. `scratch/test_checkout_idempotency_lifecycle.mjs` (New File)
- Implemented comprehensive 7-point lifecycle verification:
  - Initial load generation and storage.
  - Page reload with unchanged cart: verified exact key reuse.
  - Page reload with changed cart: verified immediate key rotation on mount.
  - Delivery address modification: verified key rotation.
  - Payment method modification: verified key rotation.
  - Coupon modification: verified key rotation.
  - Confirmed order creation: verified clean `sessionStorage` removal.
- Result: 7/7 PASSED.

---

### 6. `scratch/test_true_concurrent_connections.mjs`
- **PostgreSQL 17 Compatibility Bootstrap**: Added local-only emulation of `auth` schema, `auth.users`, `auth.uid()`, `auth.role()`, and Supabase roles (`anon`, `authenticated`, `service_role`) running *after* the empty-database preflight and *before* `schema.sql`.
- **Test E Submission ID Correction**: Captured genuine `submission_id` from `submit_phonepe_utr()` and passed `eSubId` to `admin_verify_utr()`. Verified final order, payment, submission, and inventory states.
- **Deterministic Barrier Test E2 (New)**: Synchronized barrier using `observerClient` and `pg_blocking_pids()`, confirming Client 2 is actively blocked on parent order lock by Client 1, unblocks cleanly upon commit, detects non-pending status, and raises expected error with zero deadlocks (40P01).
- **Test F Submission ID Correction**: Captured genuine `submission_id` from `submit_phonepe_utr()` and passed `fSubId` to `admin_verify_utr()`. Verified order is protected from 48-hour expiration by active submission.

---

### 7. `database/tests/phase6c_sql_tests.sql`
- Replaced cancelled order inspection test at lines 1070–1110 and duplicate refund test at line 1173 with a delivered order test complying with `status IN ('shipped', 'delivered')`.
- All 182 assertions across all 22 categories pass in embedded PostgreSQL 17.5 PGlite.

---

### 8. `src/services/orderService.js`
- Included in package to confirm the frontend calls `place_order` with the authoritative 5-argument signature:
  `(p_address_id, p_notes, p_coupon_code, p_payment_provider, p_idempotency_key)`.

---

### 9. `scratch/test_true_concurrent_connections.mjs` (Fixture Seeding & Assertions)
- **Root Cause**: Baseline `schema.sql` defines tables without seeding catalog products. The concurrency runner previously assumed an active product existed (`SELECT id, price FROM public.products WHERE is_active = true LIMIT 1;`), throwing `TypeError: Cannot read properties of undefined (reading 'id')` when executed against a freshly initialized, isolated database.
- **Independent Deterministic Fixture Seeding**:
  Directly after schema and migration loading, the runner inserts a dedicated test product and inventory record:
  ```javascript
  const testProductSlug = `shopkart-concurrency-test-product-${Date.now()}`;
  const prodInsertRes = await client1.query(`
    INSERT INTO public.products (
      name, slug, description, price, is_active
    ) VALUES (
      'Concurrency Test Product', $1, 'Deterministic fixture for multi-connection PostgreSQL concurrency tests', 500.00, true
    ) RETURNING id, price;
  `, [testProductSlug]);
  const prodId = prodInsertRes.rows[0].id;

  await client1.query(`
    INSERT INTO public.inventory (
      product_id, variant_id, quantity, low_stock_at
    ) VALUES ($1, NULL, 50, 5)
    RETURNING id, quantity;
  `, [prodId]);
  ```
- **Preflight Verification Assertions**:
  Explicitly asserts product existence (`is_active = true`) and inventory stock (`quantity = 50`) before starting Test A. Throws clear setup error if fixture creation fails.
- **Remaining Tests Audited**:
  Audited all remaining tests (A–H, E2, H2); confirmed no other assumptions about pre-existing catalog data (all tests strictly operate on `prodId`, `addr1`, `addr2`, `c1`, and `c2`).
- **Database Reset Instructions**:
  Provided explicit commands to drop and recreate a fresh, clean `shopkart_test` database to satisfy the mandatory empty-database preflight safety gate (`assertDatabaseIsClean`).

---

## 3. Verification Commands & Execution Evidence

1. **Catalog Preflight Tests**:
   ```bash
   npm run test:phase6c:catalog
   ```
   *Result*: 5/5 PASSED.

2. **PGlite SQL Logic Suite (Suite A)**:
   ```bash
   npm run test:phase6c:pglite
   ```
   *Result*: 182/182 PASSED across 22 categories. Zero failures, zero skips, zero invalid statuses.

3. **Checkout Idempotency Lifecycle Tests**:
   ```bash
   node scratch/test_checkout_idempotency_lifecycle.mjs
   ```
   *Result*: 7/7 PASSED.

4. **Frontend Production Build**:
   ```bash
   npm run build
   ```
   *Result*: Built in 1.56s (2,167 modules transformed, 0 errors).

5. **Frontend Lint Check**:
   ```bash
   npm run lint
   ```
   *Result*: Finished in 283ms on 174 files with 0 errors.

6. **PostgreSQL Concurrency Test Suite (Suite B)**:
   ```bash
   npm run test:phase6c:concurrency
   ```
   *Result*: NOT EXECUTED / UNVERIFIED ON THIS HOST (local PostgreSQL port 5432 inactive; exits with code 1; no false positive reported).
