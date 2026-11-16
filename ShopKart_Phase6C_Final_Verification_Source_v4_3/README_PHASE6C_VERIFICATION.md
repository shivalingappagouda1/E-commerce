# ShopKart — Phase 6C Verification & Independent Reproduction Guide (v4.3)

> [!CAUTION]
> **Status: PHASE 6C IS NOT APPROVED — AWAITING INDEPENDENT SOURCE REVIEW.**
> This package is provided for independent source review and local concurrency verification only.
> **DO NOT apply or execute migrations or rollbacks against Supabase or any remote database.**

---

## 1. Package Structure

This package preserves the full repository folder structure for reproducible, relative path resolution:

```text
├── database/
│   ├── schema.sql                                     # Baseline database schema
│   ├── migrations/
│   │   ├── phase6c_order_and_checkout_corrections.sql # Full Phase 6C migration
│   │   └── phase6c_rollback.sql                       # Non-destructive rollback SQL
│   └── tests/
│       └── phase6c_sql_tests.sql                      # Complete 182-assertion SQL test suite
├── src/
│   ├── pages/
│   │   └── customer/
│   │       └── CheckoutPage.jsx                       # Checkout idempotency & lifecycle
│   └── services/
│       ├── adminService.js                            # Admin verification & refund services
│       └── orderService.js                            # Authoritative 5-argument place_order RPC caller
├── scratch/
│   ├── test_catalog_preflight.mjs                     # Focused catalog type detection verification
│   ├── test_pglite_runner.mjs                         # Embedded PostgreSQL 17.5 WASM runner
│   ├── test_checkout_idempotency_lifecycle.mjs        # Focused checkout idempotency lifecycle test suite
│   └── test_true_concurrent_connections.mjs          # Multi-connection PostgreSQL concurrency runner
├── package.json                                       # Package manifest with scripts and dependencies
├── README_PHASE6C_VERIFICATION.md                     # This reproduction guide
└── phase6c_final_corrections_dossier.md               # Full architectural & audit dossier
```

---

## 2. Environment & Prerequisites

- **Node.js**: v20+ (tested on Node.js v24.20.0)
- **Local PostgreSQL** (required for Suite B): PostgreSQL 17 (e.g. official Docker container or local server)
- **Dependencies**: Declared in `package.json` (`devDependencies`: `@electric-sql/pglite`, `pg`)

---

## 3. Mandatory Safety Gate for Real PostgreSQL Suite

The real multi-connection PostgreSQL runner (`test_true_concurrent_connections.mjs`) strictly enforces these safety conditions before any connection is attempted:

1. **Mandatory Environment Variable**: `PG_CONNECTION_STRING` is strictly required. If missing, the runner aborts immediately with `REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED` (status: UNVERIFIED ON THIS HOST) and exits with code 1.
2. **Dedicated Test Database Only**: The target database name must equal exactly `shopkart_test`. Connections to `postgres`, `production`, `staging`, or any default database are rejected immediately.
3. **Loopback Only via Strict DNS Resolution**: The target host must resolve exclusively to local loopback addresses (`127.0.0.1` or `::1`). If `localhost` is supplied, it is resolved via `dns.lookup({ all: true })` and all returned IP addresses must be loopback.
4. **Rejection of Remote & Cloud Identifiers**: Any connection string containing `supabase`, `pooler`, `aws`, `.co`, or host/socket overrides (`?host=...`) is rejected.
5. **No Credential Logging**: Usernames, passwords, and full connection strings are never printed to console logs or reports. Only safe metadata (`Host`, `Port`, `Database`) is displayed.
6. **No Automatic Database Creation**: The developer must install PostgreSQL and manually create the dedicated local test database `shopkart_test` beforehand.

---

## 4. Database Safety Preflight & Local Compatibility Bootstrap

Immediately after establishing client connections and before executing any SQL from `schema.sql` or `phase6c_order_and_checkout_corrections.sql`, the PostgreSQL concurrency runner performs a mandatory, read-only catalog safety preflight:

- **Local Target Only**: The concurrency test uses only a local PostgreSQL database (`shopkart_test`).
- **Exact Database Name**: The target database name must strictly equal `shopkart_test`.
- **Loopback Enforcement**: The host must resolve exclusively to loopback addresses.
- **Empty-Database Requirement**: The database must be completely empty before the runner initializes it.
- **Read-Only Catalog Inspection**: The preflight queries `pg_namespace`, `pg_class`, `pg_proc`, and `pg_type` (`typtype IN ('b', 'e', 'c', 'd', 'r')`) to detect:
  1. `custom_schema_count`: Any non-standard schema outside `pg_catalog`, `information_schema`, `public`, and toast/temp namespaces.
  2. `public_relation_count`: Any user relation in `public` of relkind `r` (table), `p` (partitioned table), `v` (view), `m` (materialized view), `S` (sequence), or `f` (foreign table).
  3. `public_routine_count`: Any routine/function in `public`.
  4. `public_custom_type_count`: Any standalone user custom type in `public`.
- **Strict Abort on Non-Empty State**: Existing user tables, routines, custom types, or schemas cause the runner to abort immediately with an error (`DATABASE SAFETY GATE FAILED: shopkart_test is not empty...`) and exit with non-zero exit code.
- **No Automatic Drop, Truncate, or Reset**: The runner NEVER drops, truncates, or resets existing database objects automatically. Existing databases are never modified without explicit developer intervention.
- **Manual Database Provisioning**: The developer must manually create a fresh, dedicated local test database (`CREATE DATABASE shopkart_test;`).
- **Local Compatibility Bootstrap**: Once the safety preflight confirms an empty database (0 schemas, 0 relations, 0 routines, 0 types), the runner applies a local-only compatibility bootstrap (`auth` schema, `auth.users`, `auth.uid()`, `auth.role()`, and roles `anon`, `authenticated`, `service_role`). This ensures vanilla PostgreSQL 17 instances (e.g. Docker `postgres:17`) execute `schema.sql` without schema errors while preserving strict preflight isolation.

### Custom PostgreSQL Type Detection

The database preflight detects:
- User-defined base types (`b`).
- Enums (`e`).
- Standalone composite types (`c` with `relkind = 'c'`).
- Domains (`d`).
- Range types (`r`).

The filter excludes relation-backed row types for ordinary tables (`r`), partitioned tables (`p`), views (`v`), materialized views (`m`), and foreign tables (`f`).

---

## 5. PGlite Test Integrity (182 Assertions)

The embedded PGlite test runner (`test_pglite_runner.mjs`) includes strict test result validation and assertions accounting:

- **Expected Assertion Count: 182**: The runner specifies a fixed constant `EXPECTED_TEST_COUNT = 182`. This value is never computed dynamically from executed tests.
- **All 182 Must Execute**: The runner verifies that exactly 182 assertions were executed. Fewer or more assertions cause immediate suite failure.
- **All 182 Must Pass**: All 182 executed assertions must have status `PASS`. Zero failures are permitted.
- **Zero Skips Permitted**: Zero skipped assertions are permitted (`skipped === 0`). Skipped tests are never counted as passed.
- **Zero Invalid Statuses**: Any status outside `PASS`, `FAIL`, or `SKIP` causes an immediate suite failure.
- **Category Counts Checked Separately**: The runner validates the exact expected count across all 22 test categories against the expected matrix (e.g. 18 Physical Returns, 17 Refunds, 31 Security, 34 Privileges, etc.).
- **Process Failure on Mismatch**: Missing assertions, count mismatches, failed assertions, or category discrepancies cause a non-zero process exit code (`process.exitCode = 1`).

---

## 6. Step-by-Step Reproduction Instructions

### Step 1: Install Dependencies
From the repository root:
```bash
npm install
```

---

### Step 2: Run Catalog Preflight Test Suite
Executes isolated verification of custom type detection and relation row type exclusion:
```bash
npm run test:phase6c:catalog
```
*(Alternative direct command: `node scratch/test_catalog_preflight.mjs`)*

**Expected Outcome**: 5/5 passed, 0 failed across standalone composite, enum, domain, ordinary table row type, and partitioned table row type.

---

### Step 3: Run Embedded PostgreSQL 17.5 WASM Test Suite (Suite A)
Executes schema bootstrap, Phase 6C migration, and 182 individual assertions across 22 categories:
```bash
npm run test:phase6c:pglite
```
*(Alternative direct command: `node scratch/test_pglite_runner.mjs`)*

**Expected Outcome**: 182 passed, 0 failed, 0 skipped, 182 total across 22 categories.

---

### Step 4: Run Checkout Idempotency Lifecycle Tests
Tests key generation, persistence in sessionStorage, reload reuse, input fingerprint change rotation, and order confirmation cleanup:
```bash
node scratch/test_checkout_idempotency_lifecycle.mjs
```

**Expected Outcome**: All 7 tests pass:
- Test 1: Initial load generates and persists key.
- Test 2: Reload with unchanged cart reuses exact key.
- Test 3: Reload with changed cart rotates key on mount.
- Test 4: Delivery address change rotates key.
- Test 5: Payment method change rotates key.
- Test 6: Coupon application rotates key.
- Test 7: Confirmed order placement clears `sessionStorage`.

---

### Step 5: Run Real Multi-Connection PostgreSQL Concurrency Test Suite (Suite B)
Tests three independent TCP client sessions (`client1`, `client2`, and `observerClient`), real row-level locking (`FOR UPDATE`), and concurrency races (Tests A–H, E2, and H2).

#### A. Start Disposable Local PostgreSQL 17 Database
```bash
# Start isolated PostgreSQL 17 container on port 5432
docker run --name shopkart-pg -e POSTGRES_PASSWORD=YOUR_LOCAL_PASSWORD -p 5432:5432 -d postgres:17

# Create dedicated test database (safety gate strictly requires 'shopkart_test' on loopback)
psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE shopkart_test;"
```

#### B. Set Environment & Run Concurrency Harness
On PowerShell:
```powershell
$env:PG_CONNECTION_STRING = "postgres://postgres:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/shopkart_test"
npm run test:phase6c:concurrency
```
On Linux/macOS:
```bash
export PG_CONNECTION_STRING="postgres://postgres:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/shopkart_test"
npm run test:phase6c:concurrency
```
*(Alternative direct command: `node scratch/test_true_concurrent_connections.mjs`)*

**Expected Outcome When Database is Available**:
- Passes Database Safety Preflight (0 custom schemas, 0 public relations, 0 routines, 0 custom types).
- Applies local auth compatibility bootstrap.
- Loads baseline schema and Phase 6C migration.
- Test E captures genuine `submission_id` from `submit_phonepe_utr()`, exercises simultaneous customer cancellation vs admin verification, and verifies consistent final states.
- Test E2 proves controlled synchronization barrier blocking via `observerClient` querying `pg_blocking_pids()`, confirming consistent lock hierarchy (Order -> Payment -> Submission), absence of deadlocks (40P01), and clean unblocking.
- Test F exercises background expiry cron racing with admin verification of an active submitted UTR using genuine submission ID.
- Test H2 proves controlled barrier blocking on concurrent inspection completion for the same order without deadlock.

**Expected Outcome When Database is Inactive / Missing**:
- Displays `REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED` (status: UNVERIFIED ON THIS HOST).
- Exits cleanly with non-zero exit code (`1`).
- Never reports false positive passes.

---

### Step 6: Run Frontend Production Build & Quality Checks (Suite C)
```bash
npm run build
npm run lint
```
**Expected Outcome**:
- `npm run build`: Vite build succeeds with 0 errors (2,167 modules transformed).
- `npm run lint`: Runs `oxlint` with 0 errors.

---

## 7. Migration Execution Notice

**SUPABASE MIGRATION: NOT APPLIED.**
No migration has been applied to Supabase or any cloud environment. The checkout page on the live deployment remains blocked pending final independent owner authorization and execution of `phase6c_order_and_checkout_corrections.sql`.
