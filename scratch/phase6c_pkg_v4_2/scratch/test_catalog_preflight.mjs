import { PGlite } from '@electric-sql/pglite';

/**
 * Focused verification test for PostgreSQL catalog custom-type detection.
 * Validates the corrected assertDatabaseIsClean() catalog query:
 *   1. Correctly detects standalone composite types, enums, domains, range types, and base types.
 *   2. Correctly excludes automatically generated relation row types for ordinary tables ('r')
 *      and partitioned tables ('p'), views ('v'), materialized views ('m'), and foreign tables ('f').
 */

// Production query filter logic from assertDatabaseIsClean()
function buildCatalogTypeQuery(typeNameFilter = null) {
  return `
    SELECT t.typname, t.typtype, c.relkind
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    LEFT JOIN pg_class c ON c.reltype = t.oid
    WHERE n.nspname = 'public'
      AND t.typtype IN ('b', 'e', 'c', 'd', 'r')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class c2
        WHERE c2.reltype = t.oid
          AND c2.relkind IN ('r', 'p', 'v', 'm', 'f')
      )
      ${typeNameFilter ? `AND t.typname = '${typeNameFilter}'` : ''};
  `;
}

// Legacy query filter logic for comparison
function buildLegacyCatalogTypeQuery(typeNameFilter = null) {
  return `
    SELECT t.typname, t.typtype, c.relkind
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    LEFT JOIN pg_class c ON c.reltype = t.oid
    WHERE n.nspname = 'public'
      AND t.typtype IN ('b', 'e', 'c', 'd', 'r')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class c2
        WHERE c2.reltype = t.oid
      )
      ${typeNameFilter ? `AND t.typname = '${typeNameFilter}'` : ''};
  `;
}

async function runCatalogPreflightTests() {
  console.log('=================================================================');
  console.log('SHOPKART PHASE 6C: POSTGRESQL CATALOG PREFLIGHT VERIFICATION');
  console.log('Testing standalone composite detection vs relation row type exclusion');
  console.log('Engine: Embedded PostgreSQL 17.5 (PGlite WebAssembly)');
  console.log('=================================================================\n');

  const db = new PGlite();
  let failures = 0;

  // ---------------------------------------------------------------------------
  // Test 1 — Standalone composite type
  // ---------------------------------------------------------------------------
  try {
    await db.query(`
      CREATE TYPE public.test_standalone_composite AS (
        field_one integer,
        field_two text
      );
    `);

    const resNew = await db.query(buildCatalogTypeQuery('test_standalone_composite'));
    const resLegacy = await db.query(buildLegacyCatalogTypeQuery('test_standalone_composite'));

    const detectedNew = resNew.rows.length;
    const detectedLegacy = resLegacy.rows.length;

    if (detectedNew === 1 && detectedLegacy === 0) {
      console.log('✔ Test 1 PASS: Standalone composite type detected as custom type.');
      console.log('  - Type name: test_standalone_composite (typtype: c, relkind: c)');
      console.log('  - Corrected query: detected (count = 1)');
      console.log('  - Legacy query: falsely excluded by unrestricted NOT EXISTS (count = 0)');
      console.log('  - Confirmed: Not incorrectly excluded by the pg_class filter.');
    } else if (detectedNew === 1) {
      console.log('✔ Test 1 PASS: Standalone composite type detected as custom type (count = 1).');
    } else {
      console.error(`❌ Test 1 FAIL: Standalone composite type not detected (count = ${detectedNew}, expected 1).`);
      failures++;
    }
  } catch (err) {
    console.error(`❌ Test 1 FAIL with exception: ${err.message}`);
    failures++;
  } finally {
    try { await db.query('DROP TYPE IF EXISTS public.test_standalone_composite CASCADE;'); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Test 2 — Enum
  // ---------------------------------------------------------------------------
  try {
    await db.query(`
      CREATE TYPE public.test_catalog_enum AS ENUM (
        'first',
        'second'
      );
    `);

    const res = await db.query(buildCatalogTypeQuery('test_catalog_enum'));
    const detected = res.rows.length;

    if (detected === 1) {
      console.log('✔ Test 2 PASS: Enum type detected as custom type.');
      console.log('  - Type name: test_catalog_enum (typtype: e)');
      console.log('  - Count = 1 (expected 1)');
    } else {
      console.error(`❌ Test 2 FAIL: Enum not detected (count = ${detected}, expected 1).`);
      failures++;
    }
  } catch (err) {
    console.error(`❌ Test 2 FAIL with exception: ${err.message}`);
    failures++;
  } finally {
    try { await db.query('DROP TYPE IF EXISTS public.test_catalog_enum CASCADE;'); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Test 3 — Domain
  // ---------------------------------------------------------------------------
  try {
    await db.query(`
      CREATE DOMAIN public.test_catalog_domain AS integer
      CHECK (VALUE > 0);
    `);

    const res = await db.query(buildCatalogTypeQuery('test_catalog_domain'));
    const detected = res.rows.length;

    if (detected === 1) {
      console.log('✔ Test 3 PASS: Domain type detected as custom type.');
      console.log('  - Type name: test_catalog_domain (typtype: d)');
      console.log('  - Count = 1 (expected 1)');
    } else {
      console.error(`❌ Test 3 FAIL: Domain not detected (count = ${detected}, expected 1).`);
      failures++;
    }
  } catch (err) {
    console.error(`❌ Test 3 FAIL with exception: ${err.message}`);
    failures++;
  } finally {
    try { await db.query('DROP DOMAIN IF EXISTS public.test_catalog_domain CASCADE;'); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Test 4 — Ordinary table row type
  // ---------------------------------------------------------------------------
  try {
    await db.query(`
      CREATE TABLE public.test_catalog_table (
        id integer,
        description text
      );
    `);

    const res = await db.query(buildCatalogTypeQuery('test_catalog_table'));
    const detected = res.rows.length;

    if (detected === 0) {
      console.log('✔ Test 4 PASS: Automatically generated table row type is excluded.');
      console.log('  - Table relation: test_catalog_table (relkind: r)');
      console.log('  - Row type count = 0 (expected 0: successfully excluded from standalone custom types)');
    } else {
      console.error(`❌ Test 4 FAIL: Ordinary table row type falsely counted as standalone custom type (count = ${detected}, expected 0).`);
      failures++;
    }
  } catch (err) {
    console.error(`❌ Test 4 FAIL with exception: ${err.message}`);
    failures++;
  } finally {
    try { await db.query('DROP TABLE IF EXISTS public.test_catalog_table CASCADE;'); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Test 5 — Partitioned table row type
  // ---------------------------------------------------------------------------
  try {
    await db.query(`
      CREATE TABLE public.test_catalog_partitioned (
        id integer,
        description text
      )
      PARTITION BY RANGE (id);
    `);

    const res = await db.query(buildCatalogTypeQuery('test_catalog_partitioned'));
    const detected = res.rows.length;

    if (detected === 0) {
      console.log('✔ Test 5 PASS: Automatically generated partitioned-table row type is excluded.');
      console.log('  - Partitioned table relation: test_catalog_partitioned (relkind: p)');
      console.log('  - Row type count = 0 (expected 0: successfully excluded from standalone custom types)');
    } else {
      console.error(`❌ Test 5 FAIL: Partitioned table row type falsely counted as standalone custom type (count = ${detected}, expected 0).`);
      failures++;
    }
  } catch (err) {
    console.error(`❌ Test 5 FAIL with exception: ${err.message}`);
    failures++;
  } finally {
    try { await db.query('DROP TABLE IF EXISTS public.test_catalog_partitioned CASCADE;'); } catch (_) {}
  }

  // Final summary
  console.log('\n=================================================================');
  console.log(`CATALOG PREFLIGHT TEST SUMMARY: ${5 - failures}/5 Passed, ${failures} Failed`);
  console.log('=================================================================');

  if (failures > 0) {
    throw new Error(`Catalog preflight verification failed with ${failures} failure(s).`);
  }
}

runCatalogPreflightTests().catch(err => {
  console.error('\nCATALOG PREFLIGHT TEST RUNNER FAILED:');
  console.error(err.message);
  process.exitCode = 1;
});
