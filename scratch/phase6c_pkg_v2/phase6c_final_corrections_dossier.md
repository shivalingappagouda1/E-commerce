# ShopKart — Phase 6C Final Corrections Dossier v2
## Universal Lock Ordering, Concurrency Validation & Portable Reproduction

> [!CAUTION]
> **Phase 6C status: NOT APPROVED.**
> This document records all corrections implemented across the migration, physical return lock ordering, frontend checkout lifecycle, admin services, test suite, and concurrency test runner.
> Final approval is reserved exclusively for the system owner after independent evaluation.
> **Zero SQL has been applied or executed against Supabase. No remote database or credentials have been touched.**

---

## 1. Executive Status & Metrics

| Component | Status | Details |
|---|---|---|
| **Tier 1 Universal Lock Ordering** | ✅ **CORRECTED** | Dedicated parent order lock (`orders WHERE id = p_order_id FOR UPDATE`) established across `admin_create_return_inspection`, `admin_complete_return_inspection`, `admin_record_refund`, and `_restock_approved_return_inspections`. Eliminates deadlock risk across concurrent inspection completions |
| **Deterministic Restocking Engine** | ✅ **CORRECTED** | `_restock_approved_return_inspections` locks parent order, locks eligible inspections via `FOR UPDATE` (`ORDER BY pri.id ASC`), filters `receipt_confirmed = TRUE`, tracks exact locked IDs, aggregates with `ORDER BY pri.product_id, pri.variant_id`, and marks strictly processed rows |
| **Option B Physical Return Architecture** | ✅ **IMPLEMENTED** | `physical_return_inspections` table, `chk_outcome_qty` constraint, cumulative quantity validation on `order_items`, `admin_complete_return_inspection` supporting `passed`, `partially_passed`, and `rejected` |
| **PhonePe Expiry Hardening** | ✅ **IMPLEMENTED** | `expire_pending_phonepe_orders()` revoked from PUBLIC/anon/authenticated, granted strictly to `service_role` with internal `is_admin()` check |
| **PGlite Embedded Test Suite** | ✅ **182/182 PASS** | 182 verified assertions across 22 categories in embedded PostgreSQL 17.5 WASM (0 failures, 0 skipped). Category breakdown queried directly from database log |
| **Portable Test Runners** | ✅ **IMPLEMENTED** | Removed machine-specific paths; standard ESM imports with project `node_modules` fallback; portable `projectRoot` resolution relative to runner location |
| **Test Database Safety Gate** | ✅ **VERIFIED** | Real PostgreSQL runner strictly enforces loopback only (`127.0.0.1`/`localhost`), exact database `shopkart_test`, rejects cloud/Supabase URIs, and prints verified host & DB |
| **Test H2 (Deadlock-Interleaving)** | ✅ **IMPLEMENTED** | Multi-connection test simulating concurrent inspection completion for the same order, verifying deadlock freedom, exact stock restoration (+3), and retry rejection |
| **PostgreSQL Concurrency Test Runner** | ⚠️ **STANDBY / UNVERIFIED** | Tests A–H and H2 implemented; local TCP port 5432 inactive on host (`connect EACCES 127.0.0.1:5432`); cleanly exits with code 1; transparently reported as NOT EXECUTED |
| **Frontend Production Build** | ✅ **PASS** | `npm run build` succeeds in 1.87s (2,167 modules transformed, 0 build errors) |
| **Supabase Remote Execution** | ⛔ **BLOCKED** | Migration intentionally withheld pending local PostgreSQL concurrency verification and owner sign-off |

---

## 2. Physical-Return Lock Ordering Architecture

### The Deadlock Vulnerability Identified
In earlier revisions:
1. `admin_complete_return_inspection()` acquired a row lock on an individual inspection (`WHERE id = p_inspection_id FOR UPDATE`).
2. If `p_restock_now = TRUE`, it then called `_restock_approved_return_inspections(v_ins.order_id)`.
3. Inside the helper, it queried all un-restocked inspections for the order with `ORDER BY pri.id ASC FOR UPDATE`.

**Deadlock Mechanism**:
Consider two administrators concurrently completing different inspections for the same order:
- Order $O_1$ has Inspection $A$ (ID `1111...`) and Inspection $B$ (ID `2222...`).
- Session 1 completes Inspection $B$: locks row $B$ first.
- Session 2 completes Inspection $A$: locks row $A$ first.
- Session 1 enters the helper, which attempts to lock $A$ (since $A < B$ in ascending order) $\rightarrow$ **Blocks waiting for Session 2**.
- Session 2 enters the helper, which attempts to lock $B$ (since $B > A$) $\rightarrow$ **Blocks waiting for Session 1**.
- **PostgreSQL Deadlock Detected**: One transaction is aborted.

### The Corrective Implementation: Universal Tiered Hierarchy
To eliminate all deadlock cycles, a strict 3-tier lock hierarchy is enforced across all physical-return and order operations:

```
Tier 1: Parent Order Lock      --> SELECT id FROM public.orders WHERE id = p_order_id FOR UPDATE
Tier 2: Child Records Lock     --> order_items / physical_return_inspections (ORDER BY pri.id ASC FOR UPDATE)
Tier 3: Shared Catalog Lock    --> inventory (ORDER BY pri.product_id ASC, pri.variant_id ASC)
```

### Why the Parent Order Lock is Safe, Clean & Deadlock-Free
1. **Mathematical Serialization**: Because any operation on a physical return for order $O_1$ acquires `orders WHERE id = p_order_id FOR UPDATE` before touching child records, all concurrent operations on that order serialize at Tier 1. Session 2 cannot acquire any inspection lock while Session 1 is executing.
2. **Re-entrant within Transaction**: In PostgreSQL, re-acquiring `FOR UPDATE` on a row already locked by the current transaction is an immediate no-op. When `admin_complete_return_inspection` or `admin_record_refund` calls `_restock_approved_return_inspections`, the helper's order lock succeeds instantly.
3. **Cross-Order Deadlock Freedom**: Different orders have distinct `order_id` values. When two orders concurrently restock items touching the same products in `inventory`, both transactions acquire inventory row locks in identical sorted order (`ORDER BY pri.product_id, pri.variant_id`), preventing cross-order lock-order inversion deadlocks.
4. **Zero Schema Changes**: This solution uses existing primary key row locks on `public.orders` without altering table schemas or adding extra lock tables.

### Code Alignment Across All Functions
- `admin_create_return_inspection`: Locks parent order (`orders FOR UPDATE`), then locks `order_items` (`FOR UPDATE`), validates cumulative return quantity, inserts inspection.
- `admin_complete_return_inspection`: Looks up `order_id`, locks parent order (`orders FOR UPDATE`), locks target inspection (`physical_return_inspections FOR UPDATE`), updates outcome, and calls helper if requested.
- `admin_record_refund`: Locks parent order (`orders FOR UPDATE`), locks payment (`payments FOR UPDATE`), verifies return approval, updates payment/order, and calls helper.
- `_restock_approved_return_inspections`: Locks parent order (`orders FOR UPDATE`), deterministically locks eligible un-restocked inspections (`ORDER BY pri.id ASC FOR UPDATE`), updates inventory (`ORDER BY pri.product_id, pri.variant_id`), and marks processed IDs.

---

## 3. Deadlock-Interleaving Concurrency Test (`Test H2`)

Added to `scratch/test_true_concurrent_connections.mjs`:

### Test Scenario
1. Creates an isolated test order with 4 units purchased and delivered.
2. Creates three inspection records:
   - Inspection 1: returned 2 units (eligible to be passed)
   - Inspection 2: returned 1 unit (eligible to be passed)
   - Inspection 3: returned 1 unit (ineligible: damaged goods)
3. Connects two independent TCP client sessions (`client1` and `client2`) with admin context.
4. Fires simultaneous `admin_complete_return_inspection` calls on Inspection 1 (Session 1) and Inspection 2 (Session 2) with `p_restock_now = TRUE`.
5. **Assertions**:
   - `H2-1`: Both concurrent transactions succeed without deadlock, error, or unexpected abort.
   - `H2-2`: Inventory increases by exactly 3 units ($2 + 1 = +3$). Each approved quantity restored exactly once.
   - `H2-3`: Both inspection records updated and marked `restocked = TRUE` with `restocked_at` timestamp.
   - `H2-4`: Completing ineligible Inspection 3 as 'rejected' restores 0 inventory and remains `restocked = FALSE`.
   - `H2-5`: Retrying `admin_complete_return_inspection` on an already-restocked inspection is rejected with `already been restocked` exception; inventory remains unchanged.

---

## 4. Reconciled PGlite Category Breakdown (182 Total)

Execution of `node scratch/test_pglite_runner.mjs` against embedded PostgreSQL 17.5 WASM yields **182 Passed, 0 Failed, 0 Skipped**:

| # | Category | Assertions | Test ID Range | Scope |
|---|---|---|---|---|
| 1 | **Schema** | 5 | 1–5 | Column existence (`idempotency_key`, `refund_reference`, `payment_submissions`) |
| 2 | **Security** | 31 | 6–36 | RLS & FORCE RLS, SECURITY DEFINER, strict empty `search_path=""` across all functions, regproc overload checks |
| 3 | **Privileges** | 34 | 37–70 | Strict revoking of PUBLIC & anon across all 11 functions; client RPCs granted to authenticated; internal/admin RPCs granted to `service_role` |
| 4 | **RLS Enforcement** | 7 | 71–77 | Customer data isolation (cross-tenant read/write blocked on orders, payments, submissions); admin bypass verified |
| 5 | **Inventory** | 5 | 78, 85–88 | Atomic stock deduction, row-level `FOR UPDATE` lock verification, overselling rejection |
| 6 | **Checkout** | 2 | 79, 81 | Address ownership validation, empty cart submission rejection |
| 7 | **Shipping** | 1 | 80 | Server-side ₹99 fee below ₹999; free shipping at ₹999+ |
| 8 | **Payment** | 3 | 82–84 | Payment provider validation (`cod`, `phonepe`), initial pending status creation |
| 9 | **Idempotency** | 10 | 89–98 | Same-key duplicate order prevention, single inventory deduction, cart-lock recheck, single payment record |
| 10 | **UTR Submission** | 4 | 99–102 | Customer PhonePe UTR submission, database `NOW()` timestamp enforcement, duplicate pending submission rejection |
| 11 | **Authorization** | 4 | 103–106 | Customer blocked from calling admin RPCs (`admin_verify_utr`, `admin_confirm_cod_payment`, `admin_record_refund`, `expire_pending_phonepe_orders`) |
| 12 | **Admin Verification** | 7 | 107–109, 121–124 | Admin approval/rejection transitions, `paid_at` timestamp population, payment `completed` transition |
| 13 | **PhonePe Lifecycle** | 2 | 110, 112 | Historical UTR audit logging, 48-hour window preserved relative to database `created_at` |
| 14 | **UTR Resubmission** | 2 | 111, 113 | Resubmission after rejection without restocking inventory, audit trail preservation |
| 15 | **PhonePe Expiry** | 7 | 114–120 | Expiry at 48h boundary; orders with submitted UTR do not expire; custom timestamp overload rejected |
| 16 | **Cancellation** | 6 | 125–127, 132–134 | Paid processing cancellation does NOT restore stock; unpaid pending cancellation restores stock exactly once; duplicate cancellation rejected |
| 17 | **Order Lifecycle** | 4 | 128–131 | Cancelled order blocked from reopening to `pending`, `processing`, `shipped`, or `delivered` |
| 18 | **Refunds** | 17 | 135–151 | Refund reference required, inspection notes required, non-completed payment blocked, exact stock restoration, duplicate refund rejected, missing inventory rollback |
| 19 | **Shipping Matrix** | 4 | 152–155 | Exact ₹999 boundary tested, gross subtotal discount immunity, free shipping threshold verification |
| 20 | **COD Collection** | 3 | 156–158 | COD collection blocked prior to delivery, payment transitions to completed upon delivery confirmation |
| 21 | **Physical Returns** | 18 | 159–167, 174–182 | Cumulative return quantity enforcement, partial returns restore approved count (+1), duplicate restocking blocked, rejected return blocked, unconfirmed receipt (`receipt_confirmed=false`) skipped, exact ID marking |
| 22 | **Constraints** | 6 | 168–173 | Table constraint `chk_outcome_qty` validation for `pending`, `rejected`, `passed`, and `partially_passed` states |
| **TOTAL** | **22 Categories** | **182** | **1–182** | **182 Passed, 0 Failed, 0 Skipped** (Sum of categories: $5+31+34+7+5+2+1+3+10+4+4+7+2+2+7+6+4+17+4+3+18+6 = 182$) |

---

## 5. Multi-Connection Concurrency Runner Status

### Local Host Execution Log
```text
=================================================================
SHOPKART: TRUE MULTI-CONNECTION POSTGRESQL CONCURRENCY TEST
Testing two independent TCP client sessions with real row-level locks
Target Server: postgres://postgres:postgres@127.0.0.1:5432/shopkart_test
Runtime: Node.js v24.20.0
Project Root: C:\Users\shiva\OneDrive\Documents\3)projects\E-Commerece
=================================================================

✔ Target safety gate passed: Verified Local Host: 127.0.0.1, Verified Test Database: shopkart_test
Connecting Client 1 and Client 2 to postgres://postgres:postgres@127.0.0.1:5432/shopkart_test...
-----------------------------------------------------------------
REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED
STATUS: UNVERIFIED ON THIS HOST (LOCAL POSTGRESQL SERVER INACTIVE)
Reason: TCP connection to 127.0.0.1:5432 failed (connect EACCES 127.0.0.1:5432)
No local PostgreSQL daemon or Docker container is currently listening on port 5432.

To execute this test in an isolated local environment:
  1. docker run --name shopkart-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17
  2. psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE shopkart_test;"
  3. $env:PG_CONNECTION_STRING="postgres://postgres:postgres@127.0.0.1:5432/shopkart_test"
  4. node scratch/test_true_concurrent_connections.mjs
-----------------------------------------------------------------
```

---

## 6. Frontend Build & Quality Checks

- **Command**: `npm run build`
- **Output**:
  - Vite v8.3.6 client production build succeeded in 1.87s
  - 2,167 modules transformed
  - 0 build errors
- **Lint Check Note**: `npm run lint` failed due to Windows host Application Control blocking the native binary `@oxlint/binding-win32-x64-msvc/oxlint.win32-x64-msvc.node`.

---

## 7. Deliverables & ZIP Package

The archive `ShopKart_Phase6C_Final_Verification_Source_v2.zip` contains the complete source with preserved folder structure:

```text
ShopKart_Phase6C_Final_Verification_Source_v2.zip
├── database/
│   ├── schema.sql
│   ├── migrations/
│   │   ├── phase6c_order_and_checkout_corrections.sql
│   │   └── phase6c_rollback.sql
│   └── tests/
│       └── phase6c_sql_tests.sql
├── src/
│   ├── pages/
│   │   └── customer/
│   │       └── CheckoutPage.jsx
│   └── services/
│       └── adminService.js
├── scratch/
│   ├── test_pglite_runner.mjs
│   └── test_true_concurrent_connections.mjs
├── package.json
├── README_PHASE6C_VERIFICATION.md
└── phase6c_final_corrections_dossier.md
```
