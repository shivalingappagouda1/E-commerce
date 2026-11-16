import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const EXPECTED_TEST_COUNT = 190;

const EXPECTED_CATEGORIES = {
  'Schema': 5,
  'Security': 34,
  'Privileges': 37,
  'RLS Enforcement': 7,
  'Inventory': 5,
  'Checkout': 2,
  'Shipping': 1,
  'Payment': 3,
  'Idempotency': 10,
  'UTR Submission': 4,
  'Authorization': 6,
  'Admin Verification': 7,
  'PhonePe Lifecycle': 2,
  'UTR Resubmission': 2,
  'PhonePe Expiry': 7,
  'Cancellation': 6,
  'Order Lifecycle': 4,
  'Refunds': 17,
  'Shipping Matrix': 4,
  'COD Collection': 3,
  'Physical Returns': 18,
  'Constraints': 6,
};

// Portable project root resolution (works from repo root, scratch directory, or nested paths)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = fs.existsSync(path.resolve(process.cwd(), 'database/schema.sql'))
  ? process.cwd()
  : path.resolve(__dirname, '..');

const schemaPath = path.resolve(projectRoot, 'database/schema.sql');
const migrationPath = path.resolve(projectRoot, 'database/migrations/phase6c_order_and_checkout_corrections.sql');
const testSuitePath = path.resolve(projectRoot, 'database/tests/phase6c_sql_tests.sql');

function validateTestResults(results, categorySummary) {
  const total = results.length;

  const passed = results.filter(
    result => result.status === 'PASS'
  ).length;

  const failed = results.filter(
    result => result.status === 'FAIL'
  ).length;

  const skipped = results.filter(
    result => result.status === 'SKIP'
  ).length;

  const invalid = results.filter(
    result => !['PASS', 'FAIL', 'SKIP'].includes(result.status)
  ).length;

  console.log('\n=================================================================');
  console.log('Phase 6C PGlite Test Summary & Integrity Check');
  console.log('-----------------------------------------------------------------');
  console.log(`Expected Total Assertions : ${EXPECTED_TEST_COUNT}`);
  console.log(`Executed Total Assertions : ${total}`);
  console.log(`Passed Assertions         : ${passed}`);
  console.log(`Failed Assertions         : ${failed}`);
  console.log(`Skipped Assertions        : ${skipped}`);
  console.log(`Invalid Statuses          : ${invalid}`);

  const countMatches = total === EXPECTED_TEST_COUNT;

  const allPassed =
    passed === EXPECTED_TEST_COUNT &&
    failed === 0 &&
    skipped === 0 &&
    invalid === 0;

  if (!countMatches || !allPassed) {
    throw new Error(
      `PGLITE TEST SUITE FAILED: expected exactly ${EXPECTED_TEST_COUNT} passing tests with zero failures, skips, or invalid statuses. ` +
      `(Observed: total=${total}, passed=${passed}, failed=${failed}, skipped=${skipped}, invalid=${invalid})`
    );
  }

  // Validate category-by-category breakdown against expected matrix
  const actualCatMap = new Map();
  categorySummary.forEach(c => actualCatMap.set(c.category, Number(c.count)));

  for (const [catName, expectedCatCount] of Object.entries(EXPECTED_CATEGORIES)) {
    const actualCount = actualCatMap.get(catName) || 0;
    if (actualCount !== expectedCatCount) {
      throw new Error(
        `PGLITE CATEGORY MISMATCH: Category '${catName}' expected ${expectedCatCount} tests, but executed ${actualCount}.`
      );
    }
  }

  for (const actualCat of actualCatMap.keys()) {
    if (!(actualCat in EXPECTED_CATEGORIES)) {
      throw new Error(`PGLITE UNEXPECTED CATEGORY: Found unexpected test category '${actualCat}'.`);
    }
  }

  console.log(`\n✔ Integrity check passed: All ${EXPECTED_TEST_COUNT} expected assertions executed and passed across all ${Object.keys(EXPECTED_CATEGORIES).length} categories.`);
  console.log('Every single SQL logic assertion passed in embedded PostgreSQL 17.5 (PGlite WASM)');
  console.log('(Independent multi-connection TCP concurrency is verified separately via test_true_concurrent_connections.mjs)');
  console.log('=================================================================');
}

async function run() {
  console.log('=================================================================');
  console.log('SHOPKART PHASE 6C: EMBEDDED POSTGRESQL 17.5 (PGLITE) SQL SUITE');
  console.log('Testing SQL logic, triggers, RLS syntax, constraints, and single-session transactions');
  console.log('Runtime Environment:');
  console.log(`  - Node.js Version    : ${process.version}`);
  console.log('  - PostgreSQL Version : 17.5 (PGlite WebAssembly)');
  console.log(`  - Project Root       : ${projectRoot}`);
  console.log('=================================================================\n');

  console.log('Initializing embedded PostgreSQL WebAssembly engine (PGlite / PostgreSQL 17.5)...');
  console.log('(Note: PGlite is an embedded WASM engine; it does not replace independent TCP client concurrency tests)\n');
  const db = new PGlite();
  try {
    // Create standard Supabase auth schema and helper functions
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY,
      email TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS TEXT
    LANGUAGE sql
    STABLE
    AS $$
      SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated');
    $$;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END $$;
  `);
  console.log('✔ Supabase Auth & Role emulation initialized.');

  // Load database/schema.sql
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Baseline schema file not found at: ${schemaPath}`);
  }
  let schemaSql = fs.readFileSync(schemaPath, 'utf8');
  schemaSql = schemaSql
    .replace(/CREATE EXTENSION IF NOT EXISTS "pg_trgm";/g, '-- pg_trgm omitted')
    .replace(/CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin\(name gin_trgm_ops\);/g, 'CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products (name);');

  console.log(`Executing ${path.relative(projectRoot, schemaPath)}...`);
  await db.exec(schemaSql);
  console.log('✔ Baseline schema successfully executed!');

  // Load database/migrations/phase6c_order_and_checkout_corrections.sql
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found at: ${migrationPath}`);
  }
  console.log(`Executing ${path.relative(projectRoot, migrationPath)}...`);
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await db.exec(migrationSql);
  console.log('✔ Phase 6C migration successfully executed!\n');

  // Execute database/tests/phase6c_sql_tests.sql
  if (!fs.existsSync(testSuitePath)) {
    throw new Error(`Test suite file not found at: ${testSuitePath}`);
  }

  // Explicitly establish and verify the isolated test environment
  console.log('Establishing and verifying isolated test environment...');
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await db.exec(`
    SET shopkart.test_environment = 'pglite';
    SET shopkart.test_run_id = '${runId}';
  `);
  const checkEnv = await db.query("SELECT current_setting('shopkart.test_environment', true) AS env, current_setting('shopkart.test_run_id', true) AS run_id;");
  if (checkEnv.rows[0]?.env !== 'pglite' || checkEnv.rows[0]?.run_id !== runId) {
    throw new Error('Failed to establish and verify isolated test environment in PGlite session.');
  }
  console.log(`✔ Isolated test environment verified (shopkart.test_environment=pglite, run_id=${runId}).\n`);

  console.log(`Executing ${path.relative(projectRoot, testSuitePath)} with individual assertion tracking...\n`);
  const testSql = fs.readFileSync(testSuitePath, 'utf8');
  const execResults = await db.exec(testSql);

  // Query individual logged test results (or extract from in-transaction exec results if rolled back)
  let res;
  let catRes;
  try {
    res = await db.query(`SELECT id, category, test_name, status FROM public._phase6c_test_log WHERE run_id = '${runId}' ORDER BY id ASC;`);
    catRes = await db.query(`
      SELECT category, COUNT(*)::int AS count, MIN(id)::int AS start_id, MAX(id)::int AS end_id
      FROM public._phase6c_test_log
      WHERE run_id = '${runId}'
      GROUP BY category
      ORDER BY MIN(id) ASC;
    `);
  } catch (_) {
    // Transaction rolled back as expected; find logged test results from in-transaction SELECT statements
    for (const r of execResults) {
      if (r.rows && r.rows.length > 0 && r.rows[0].test_name !== undefined) {
        res = r;
      } else if (r.rows && r.rows.length > 0 && r.rows[0].start_id !== undefined) {
        catRes = r;
      }
    }
  }

  if (!res || !res.rows || res.rows.length === 0) {
    for (const r of execResults) {
      if (r.rows && r.rows.length > 0 && r.rows[0].test_name !== undefined) {
        res = r;
      } else if (r.rows && r.rows.length > 0 && r.rows[0].start_id !== undefined) {
        catRes = r;
      }
    }
  }
  
  let currentCategory = '';
  res.rows.forEach(row => {
    if (row.category !== currentCategory) {
      currentCategory = row.category;
      console.log(`\n--- Category: ${currentCategory} ---`);
    }
    console.log(`  [${row.status}] Test ${String(row.id).padStart(2, '0')}: ${row.test_name}`);
  });

  console.log('\nCATEGORY BREAKDOWN:');
  let sumCounts = 0;
  catRes.rows.forEach(cat => {
    sumCounts += cat.count;
    console.log(`  - ${cat.category.padEnd(25)}: ${cat.count} tests (IDs ${cat.start_id}–${cat.end_id})`);
  });
  console.log(`  Sum of categories: ${sumCounts}`);

  // Rigorous result validation against the fixed expected test count and category matrix
  validateTestResults(res.rows, catRes.rows);
  } finally {
    try {
      await db.close();
    } catch (_) {}
  }
}

run().catch(err => {
  console.error('\nPGLITE TEST SUITE FAILED');
  console.error(err.message);
  if (err.where) console.error('  Where:', err.where);
  if (err.code) console.error('  Error Code:', err.code);
  process.exitCode = 1;
});
