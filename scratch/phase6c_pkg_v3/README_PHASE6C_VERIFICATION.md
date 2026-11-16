# ShopKart — Phase 6C Verification & Independent Reproduction Guide (v3)

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
│       └── adminService.js                            # Admin verification & refund services
├── scratch/
│   ├── test_pglite_runner.mjs                         # Embedded PostgreSQL 17.5 WASM runner
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

## 4. Step-by-Step Reproduction Instructions

### Step 1: Install Dependencies
From the repository root:
```bash
npm install
```
*(Ensures `@electric-sql/pglite` and `pg` are available from local project dependencies; no global dependencies used)*

---

### Step 2: Run Embedded PostgreSQL 17.5 WASM Test Suite (Suite A)
Executes the schema bootstrap, Phase 6C migration, and 182 individual assertions across 22 categories:
```bash
npm run test:phase6c:pglite
```
*(Alternative direct command: `node scratch/test_pglite_runner.mjs`)*

**Expected Outcome**:
- 182 passed, 0 failed, 0 skipped, 182 total across 22 categories.
- Note: PGlite runs in an embedded WebAssembly single-session engine and does NOT prove multi-connection TCP concurrency.

---

### Step 3: Run Real Multi-Connection PostgreSQL Concurrency Test Suite (Suite B)
Tests three independent TCP client sessions (`client1`, `client2`, and `observerClient`), real row-level locking (`FOR UPDATE`), and concurrency races (Tests A–H and H2).

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
- Tests A, B, C, D, E, F, G, H, and H2 all pass.
- Test H2 proves controlled barrier blocking via `observerClient` querying `pg_blocking_pids()`, verified commit, exact stock restoration (+3), and retry rejection.

**Expected Outcome When Database is Inactive / Missing**:
- Displays `REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED` (status: UNVERIFIED ON THIS HOST).
- Exits cleanly with non-zero exit code (`1`).
- Never reports false positive passes.

---

### Step 4: Run Frontend Production Build & Quality Checks (Suite C)
```bash
npm run build
npm run lint
```
**Expected Outcome**:
- `npm run build`: Vite build succeeds with 0 errors (2,167 modules transformed).
- `npm run lint`: Runs `oxlint`. (Note: On some Windows hosts with Application Control/AppLocker enabled, native `.node` binaries may be blocked by OS policy).

---

## 5. Migration Execution Notice

**SUPABASE MIGRATION: NOT APPLIED.**
No migration has been applied to Supabase or any cloud environment. The checkout page on the live deployment remains blocked pending final independent owner authorization and execution of `phase6c_order_and_checkout_corrections.sql`.
