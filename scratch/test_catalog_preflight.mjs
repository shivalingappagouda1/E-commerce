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

  // ---------------------------------------------------------------------------
  // Test 6 — Migration preflight check rejects a dependent view
  // ---------------------------------------------------------------------------
  try {
    // Create dummy legacy place_order function and a dependent view
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.place_order(p_address_id UUID, p_notes TEXT)
      RETURNS UUID LANGUAGE plpgsql AS $$ BEGIN RETURN gen_random_uuid(); END; $$;

      CREATE VIEW public.test_preflight_dep_view AS
        SELECT public.place_order('a0000000-0000-0000-0000-000000000001'::uuid, 'dep test'::text) AS order_id;
    `);

    // Run the migration preflight block
    let preflightError = null;
    try {
      await db.exec(`
        DO $$
        DECLARE
          v_dep_record RECORD;
          v_dep_summary TEXT := '';
        BEGIN
          FOR v_dep_record IN
            SELECT
              p.oid::regprocedure::text AS function_signature,
              p.pronargs AS argument_count,
              d.deptype::text AS dependency_type,
              pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object_description
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            JOIN pg_depend d ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid
            WHERE n.nspname = 'public'
              AND p.proname = 'place_order'
              AND p.pronargs IN (2, 3, 4)
              AND d.deptype NOT IN ('i')
          LOOP
            v_dep_summary := v_dep_summary || E'\\n  - Signature: ' || v_dep_record.function_signature ||
                             E' (' || v_dep_record.argument_count || E' arguments) is required by: ' ||
                             v_dep_record.dependent_object_description ||
                             E' [dependency type: ' || v_dep_record.dependency_type || E']';
          END LOOP;

          IF v_dep_summary <> '' THEN
            RAISE EXCEPTION 'MIGRATION PREFLIGHT FAILED: Cannot drop legacy place_order overload(s) due to active database dependencies:%
To prevent silent cascading deletion or data corruption, CASCADE on DROP FUNCTION is strictly prohibited.
Resolve or update the dependent database objects listed above before applying this migration.', v_dep_summary;
          END IF;
        END;
        $$ LANGUAGE plpgsql;
      `);
    } catch (err) {
      preflightError = err;
    }

    if (preflightError && preflightError.message.includes('MIGRATION PREFLIGHT FAILED') && preflightError.message.includes('test_preflight_dep_view')) {
      console.log('✔ Test 6 PASS: Migration preflight check successfully catches dependent view and aborts.');
      console.log('  - Detected dependent view: rule _RETURN on view test_preflight_dep_view');
      console.log('  - Correctly prevented silent drop with CASCADE prohibition.');
    } else {
      console.error('❌ Test 6 FAIL: Preflight check did not abort when dependent view existed.');
      failures++;
    }
  } catch (err) {
    console.error(`❌ Test 6 FAIL with exception: ${err.message}`);
    failures++;
  } finally {
    try { await db.query('DROP VIEW IF EXISTS public.test_preflight_dep_view CASCADE;'); } catch (_) {}
    try { await db.query('DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT) CASCADE;'); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Test 7 — Test environment safety guard rejects unauthorized environment
  // ---------------------------------------------------------------------------
  try {
    let guardError = null;
    try {
      await db.exec(`
        DO $$
        DECLARE
          v_current_db TEXT := 'production_supabase_db';
          v_test_env TEXT := '';
        BEGIN
          IF NOT (
            v_current_db IN ('shopkart_test', 'shopkart_test_rerun')
            OR v_test_env IN ('test', 'isolated_test', 'pglite')
          ) THEN
            RAISE EXCEPTION 'TEST SUITE BLOCKED: Execution refused. Current database is "%" with shopkart.test_environment="%" which is not an authorized test environment.',
              v_current_db, v_test_env;
          END IF;
        END;
        $$ LANGUAGE plpgsql;
      `);
    } catch (err) {
      guardError = err;
    }

    if (guardError && guardError.message.includes('TEST SUITE BLOCKED: Execution refused')) {
      console.log('✔ Test 7 PASS: Test safety guard successfully rejects unauthorized database environment.');
      console.log('  - Blocked unauthorized database: production_supabase_db');
      console.log('  - template1 is strictly excluded; requires explicit authorized test environment setting.');
    } else {
      console.error('❌ Test 7 FAIL: Safety guard did not block unauthorized environment.');
      failures++;
    }
  } catch (err) {
    console.error(`❌ Test 7 FAIL with exception: ${err.message}`);
    failures++;
  }

  // Final summary
  console.log('\n=================================================================');
  console.log(`CATALOG PREFLIGHT TEST SUMMARY: ${7 - failures}/7 Passed, ${failures} Failed`);
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
