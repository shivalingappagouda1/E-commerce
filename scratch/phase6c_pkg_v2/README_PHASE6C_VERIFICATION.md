# ShopKart — Phase 6C Verification & Independent Reproduction Guide

> [!CAUTION]
> **Status: PHASE 6C IS NOT APPROVED.**
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
├── package.json                                       # Package manifest with devDependencies
├── README_PHASE6C_VERIFICATION.md                     # This reproduction guide
└── phase6c_final_corrections_dossier.md               # Full architectural & audit dossier
```

---

## 2. Environment & Prerequisites

- **Node.js**: v20+ (tested on Node.js v24.20.0)
- **Local PostgreSQL** (optional, for Suite B): PostgreSQL 17 (e.g., official Docker container)
- **Dependencies**: Declared in `package.json` (`devDependencies`: `@electric-sql/pglite`, `pg`)

---

## 3. Step-by-Step Reproduction Instructions

### Step 1: Install Dependencies
From the repository root:
```bash
npm install
```
*(Ensures `@electric-sql/pglite` and `pg` are available in `node_modules`)*

---

### Step 2: Run Embedded PostgreSQL 17.5 WASM Test Suite (Suite A)
Executes the full schema bootstrap, Phase 6C migration, and 182 individual assertions with category breakdown:
```bash
node scratch/test_pglite_runner.mjs
```
**Expected Outcome**:
- 182 passed, 0 failed, 0 skipped, 182 total across 22 categories.

---

### Step 3: Run Real Multi-Connection PostgreSQL Concurrency Test Suite (Suite B)
Tests real TCP client sessions, row-level locking (`FOR UPDATE`), and concurrency races (Tests A–H and H2).

#### A. Start Disposable Local PostgreSQL 17 Database
```bash
# Start isolated PostgreSQL 17 container on port 5432
docker run --name shopkart-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17

# Create dedicated test database (safety gate strictly requires 'shopkart_test' on loopback)
psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE shopkart_test;"
```

#### B. Set Environment & Run Test Harness
On PowerShell:
```powershell
$env:PG_CONNECTION_STRING = "postgres://postgres:postgres@127.0.0.1:5432/shopkart_test"
node scratch/test_true_concurrent_connections.mjs
```
On Linux/macOS:
```bash
export PG_CONNECTION_STRING="postgres://postgres:postgres@127.0.0.1:5432/shopkart_test"
node scratch/test_true_concurrent_connections.mjs
```

**Safety Gate Protections**:
1. Host MUST resolve strictly to `127.0.0.1`, `localhost`, or `::1`.
2. Database MUST be named strictly `shopkart_test` (rejects default `postgres` or cloud DBs).
3. If no server is listening on port 5432, runner exits cleanly with exit code 1 and reports `REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED`.

---

### Step 4: Run Frontend Production Build & Verification (Suite C)
```bash
npm run build
```
**Expected Outcome**:
- Vite build completes cleanly (2,167 modules transformed, 0 errors).
