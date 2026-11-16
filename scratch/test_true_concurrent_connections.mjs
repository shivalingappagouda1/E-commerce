import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = fs.existsSync(path.resolve(process.cwd(), 'database/schema.sql'))
  ? process.cwd()
  : path.resolve(__dirname, '..');

const schemaPath = path.resolve(projectRoot, 'database/schema.sql');
const migrationPath = path.resolve(projectRoot, 'database/migrations/phase6c_order_and_checkout_corrections.sql');

const CONNECTION_STRING = process.env.PG_CONNECTION_STRING;

if (!CONNECTION_STRING) {
  console.log('=================================================================');
  console.log('SHOPKART: TRUE MULTI-CONNECTION POSTGRESQL CONCURRENCY TEST');
  console.log('Testing three independent TCP client sessions with real row-level locks');
  console.log(`Runtime: Node.js ${process.version}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log('=================================================================\n');
  console.error('REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED');
  console.error('STATUS: UNVERIFIED ON THIS HOST');
  console.error('Reason: Missing PG_CONNECTION_STRING environment variable.');
  console.error('\nTo execute this test in an isolated local environment:');
  console.error('  1. docker run --name shopkart-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17');
  console.error('  2. psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE shopkart_test;"');
  console.error('  3. $env:PG_CONNECTION_STRING="postgres://postgres:postgres@127.0.0.1:5432/shopkart_test"');
  console.error('  4. npm run test:phase6c:concurrency');
  console.error('-----------------------------------------------------------------');
  process.exit(1);
}

function isLoopbackAddress(address) {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');

  if (normalized === '::1') {
    return true;
  }

  if (net.isIP(normalized) === 4) {
    return normalized.startsWith('127.');
  }

  return false;
}

async function validateSafeLocalTestTarget(connStr) {
  let parsed;
  try {
    parsed = new URL(connStr);
  } catch (err) {
    throw new Error(`Safety gate rejected connection: Invalid URL format: ${err.message}`);
  }

  const hostname = parsed.hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase();

  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\/+/, '')
  );

  if (!databaseName || !['shopkart_test', 'shopkart_test_rerun'].includes(databaseName)) {
    throw new Error(
      'Safety gate rejected connection: database must be shopkart_test or shopkart_test_rerun.'
    );
  }

  const port = parsed.port || '5432';

  if (port !== '55435') {
    throw new Error('Safety gate rejected connection: port must be exactly 55435.');
  }

  if (parsed.searchParams.has('host')) {
    throw new Error(
      'Safety gate rejected connection: socket/host overrides are not permitted.'
    );
  }

  if (net.isIP(hostname)) {
    if (!isLoopbackAddress(hostname)) {
      throw new Error(`Safety gate rejected non-loopback IP address (${hostname}). Only local loopback interfaces (127.0.0.1 / ::1) are permitted.`);
    }
  } else {
    if (hostname !== 'localhost') {
      throw new Error(
        `Safety gate rejected hostname (${hostname}). Only verified loopback addresses are permitted.`
      );
    }

    const resolved = await dns.lookup(hostname, { all: true });

    if (!resolved.length) {
      throw new Error('Safety gate rejected unresolved localhost hostname.');
    }

    if (!resolved.every(entry => isLoopbackAddress(entry.address))) {
      throw new Error(
        'Safety gate rejected localhost because it resolves to a non-loopback address.'
      );
    }
  }

  const lowerConnection = connStr.toLowerCase();

  if (
    lowerConnection.includes('supabase') ||
    lowerConnection.includes('pooler') ||
    lowerConnection.includes('aws') ||
    lowerConnection.includes('.co')
  ) {
    throw new Error(
      'Safety gate rejected a remote cloud or Supabase connection identifier.'
    );
  }

  console.log('✔ Local database safety gate passed.');
  console.log(`  Host: ${hostname}`);
  console.log(`  Port: ${parsed.port || '5432'}`);
  console.log(`  Database: ${databaseName}`);

  return true;
}

async function assertDatabaseIsClean(client) {
  const result = await client.query(`
    SELECT
      current_database() AS database_name,

      (
        SELECT COUNT(*)
        FROM pg_namespace
        WHERE nspname NOT IN (
          'pg_catalog',
          'information_schema',
          'public'
        )
        AND nspname NOT LIKE 'pg_toast%'
        AND nspname NOT LIKE 'pg_temp_%'
        AND nspname NOT LIKE 'pg_toast_temp_%'
      ) AS custom_schema_count,

      (
        SELECT COUNT(*)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN (
            'r',
            'p',
            'v',
            'm',
            'S',
            'f'
          )
      ) AS public_relation_count,

      (
        SELECT COUNT(*)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
      ) AS public_routine_count,

      (
        SELECT COUNT(*)
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typtype IN ('b', 'e', 'c', 'd', 'r')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_class c
            WHERE c.reltype = t.oid
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          )
      ) AS public_custom_type_count
  `);

  const state = result.rows[0];

  console.log('Database preflight:');
  console.log(`  Database: ${state.database_name}`);
  console.log(`  Custom schemas: ${state.custom_schema_count}`);
  console.log(`  Public relations: ${state.public_relation_count}`);
  console.log(`  Public routines: ${state.public_routine_count}`);
  console.log(`  Public custom types: ${state.public_custom_type_count}`);

  const clean =
    ['shopkart_test', 'shopkart_test_rerun'].includes(state.database_name) &&
    Number(state.custom_schema_count) === 0 &&
    Number(state.public_relation_count) === 0 &&
    Number(state.public_routine_count) === 0 &&
    Number(state.public_custom_type_count) === 0;

  if (!clean) {
    throw new Error(
      'DATABASE SAFETY GATE FAILED: target database is not empty. ' +
      'No schema or migration SQL was executed. ' +
      'Use a newly created, dedicated local test database.'
    );
  }

  console.log('✔ Empty database preflight passed.');
}

async function runTrueConcurrencyTest() {
  const parsedConnection = new URL(CONNECTION_STRING);

  console.log('=================================================================');
  console.log('SHOPKART: TRUE MULTI-CONNECTION POSTGRESQL CONCURRENCY TEST');
  console.log('Testing three independent TCP client sessions with real row-level locks');
  console.log('Target Server: Local PostgreSQL');
  console.log(`Host: ${parsedConnection.hostname}`);
  console.log(`Port: ${parsedConnection.port || '5432'}`);
  console.log(`Database: ${parsedConnection.pathname.replace(/^\/+/, '')}`);
  console.log(`Runtime: Node.js ${process.version}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log('=================================================================\n');

  // Verify target safety gate before attempting any connection
  try {
    await validateSafeLocalTestTarget(CONNECTION_STRING);
  } catch (safetyErr) {
    console.error(`\n[CRITICAL SAFETY GATE ERROR] ${safetyErr.message}`);
    process.exit(1);
  }

  console.log('\nConnecting independent TCP database clients (Client 1, Client 2, Observer)...');
  const client1 = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 3000 });
  const client2 = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 3000 });
  const observerClient = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 3000 });

  try {
    await client1.connect();
    await client2.connect();
    await observerClient.connect();
    console.log('✔ Three independent TCP database sessions successfully connected!\n');
  } catch (err) {
    console.log('-----------------------------------------------------------------');
    console.log('REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED');
    console.log('STATUS: UNVERIFIED ON THIS HOST (LOCAL POSTGRESQL SERVER INACTIVE)');
    console.log(`Reason: TCP connection to port ${parsedConnection.port || '5432'} failed (${err.message})`);
    console.log(`No local PostgreSQL daemon or Docker container is currently listening on port ${parsedConnection.port || '5432'}.`);
    console.log('\nTo execute this test in an isolated local environment:');
    console.log('  1. docker run --name shopkart-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17');
    console.log('  2. psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE shopkart_test;"');
    console.log('  3. $env:PG_CONNECTION_STRING="postgres://postgres:postgres@127.0.0.1:5432/shopkart_test"');
    console.log('  4. npm run test:phase6c:concurrency');
    console.log('-----------------------------------------------------------------');
    process.exit(1);
  }

  let pid1 = null;
  let pid2 = null;
  let pidObs = null;

  let client1Closed = false;
  let client2Closed = false;
  let observerClosed = false;
  let client1Error = null;
  let client2ConnectionError = null;
  let observerError = null;
  let client2QueryInFlight = false;
  let client2QuerySettled = false;
  let client2Terminated = false;

  client1.on('end', () => { client1Closed = true; });
  client1.on('error', (err) => {
    client1Error = err;
    console.warn('Session 1 connection error event:', err.message);
  });
  client2.on('end', () => { client2Closed = true; });
  client2.on('error', (err) => {
    client2ConnectionError = err;
    console.warn('Session 2 connection error event:', err.message);
  });
  observerClient.on('end', () => { observerClosed = true; });
  observerClient.on('error', (err) => {
    observerError = err;
    console.warn('Observer connection error event:', err.message);
  });

  function isClientInTransaction(client) {
    if (!client) return false;
    if (typeof client.getTransactionStatus === 'function') {
      const status = client.getTransactionStatus();
      return status === 'T' || status === 'E';
    }
    return false;
  }

  async function isBackendTransactionActive(observer, targetPid) {
    if (!observer || observerClosed || !targetPid) return false;
    try {
      const res = await observer.query(
        `SELECT state FROM pg_stat_activity WHERE pid = $1;`,
        [targetPid]
      );
      const state = res.rows[0]?.state;
      return state === 'idle in transaction' || state === 'idle in transaction (aborted)';
    } catch (_) {
      return false;
    }
  }

  let suiteError = null;
  let outerCleanupErrors = [];

  try {
    try {
    pid1 = (await client1.query('SELECT pg_backend_pid() AS pid;')).rows[0].pid;
    pid2 = (await client2.query('SELECT pg_backend_pid() AS pid;')).rows[0].pid;
    pidObs = (await observerClient.query('SELECT pg_backend_pid() AS pid;')).rows[0].pid;
    const pgVersion = (await client1.query('SELECT version();')).rows[0].version;
    console.log(`PostgreSQL Engine Version: ${pgVersion}`);
    console.log(`Session 1 Backend PID: ${pid1}`);
    console.log(`Session 2 Backend PID: ${pid2}`);
    console.log(`Observer Backend PID:  ${pidObs}`);

    await assertDatabaseIsClean(client1);

    console.log('Initializing local-only Supabase auth compatibility bootstrap (auth schema, auth.users, auth.uid(), auth.role(), roles)...');
    await client1.query(`
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
    console.log('✔ Local auth compatibility bootstrap applied.');

    console.log('Loading baseline schema...');
    let schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client1.query(schemaSql);

    console.log('Applying Phase 6C migration to isolated local test database...');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await client1.query(migrationSql);
    console.log('✔ Schema and migration loaded on PostgreSQL test instance.');

    // Setup fixtures
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '22222222-2222-4222-8222-222222222222';
    const adminId = '33333333-3333-4333-8333-333333333333';
    await client1.query(`
      INSERT INTO auth.users (id, email) VALUES
        ('${u1}', 'u1@test.com'),
        ('${u2}', 'u2@test.com'),
        ('${adminId}', 'admin@test.com')
      ON CONFLICT (id) DO NOTHING;
      ALTER TABLE public.profiles DISABLE TRIGGER guard_role_escalation;
      INSERT INTO public.profiles (id, full_name, role) VALUES
        ('${u1}', 'Buyer One', 'customer'),
        ('${u2}', 'Buyer Two', 'customer'),
        ('${adminId}', 'System Administrator', 'admin')
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
      ALTER TABLE public.profiles ENABLE TRIGGER guard_role_escalation;
    `);

    // Add delivery addresses
    const addrRes1 = await client1.query(`
      INSERT INTO public.addresses (id, user_id, full_name, phone, line1, city, state, pincode)
      VALUES (gen_random_uuid(), '${u1}', 'Buyer One', '+91 9999999991', '1 Street', 'City', 'State', '560001')
      RETURNING id;
    `);
    const addr1 = addrRes1.rows[0].id;

    const addrRes2 = await client1.query(`
      INSERT INTO public.addresses (id, user_id, full_name, phone, line1, city, state, pincode)
      VALUES (gen_random_uuid(), '${u2}', 'Buyer Two', '+91 9999999992', '2 Street', 'City', 'State', '560002')
      RETURNING id;
    `);
    const addr2 = addrRes2.rows[0].id;

    // Seed deterministic test product and inventory fixtures for concurrency testing
    console.log('Seeding deterministic test product and inventory fixtures...');
    const testProductSlug = 'shopkart-concurrency-test-product';
    const prodInsertRes = await client1.query(`
      INSERT INTO public.products (
        name,
        slug,
        description,
        price,
        is_active
      )
      VALUES (
        'Concurrency Test Product',
        $1,
        'Deterministic fixture for multi-connection PostgreSQL concurrency tests',
        500.00,
        true
      )
      RETURNING id, price;
    `, [testProductSlug]);

    if (!prodInsertRes.rows || prodInsertRes.rows.length === 0 || !prodInsertRes.rows[0].id) {
      throw new Error('[SETUP FAILED] Failed to seed test product: no product ID returned.');
    }
    const prodId = prodInsertRes.rows[0].id;
    const prodPrice = Number(prodInsertRes.rows[0].price);

    // Seed corresponding inventory record with sufficient stock (50 units)
    const invInsertRes = await client1.query(`
      INSERT INTO public.inventory (
        product_id,
        variant_id,
        quantity,
        low_stock_at
      )
      VALUES (
        $1,
        NULL,
        50,
        5
      )
      RETURNING id, quantity;
    `, [prodId]);

    if (
      !invInsertRes.rows ||
      invInsertRes.rows.length !== 1 ||
      !invInsertRes.rows[0].id ||
      Number(invInsertRes.rows[0].quantity) !== 50
    ) {
      throw new Error(`[SETUP FAILED] Failed to seed exactly one inventory row with quantity 50 for product ${prodId}.`);
    }

    // Explicit preflight assertions verifying product and inventory existence before starting Test A
    const prodCheck = await client1.query(
      `SELECT id, slug, is_active, price FROM public.products WHERE id = $1;`,
      [prodId]
    );
    if (
      prodCheck.rows.length !== 1 ||
      prodCheck.rows[0].is_active !== true ||
      prodCheck.rows[0].slug !== testProductSlug
    ) {
      throw new Error(`[SETUP FAILED] Product verification failed: product ${prodId} is missing, inactive, or does not match the deterministic test slug.`);
    }

    const invCheck = await client1.query(
      `SELECT id, quantity FROM public.inventory WHERE product_id = $1 AND variant_id IS NULL;`,
      [prodId]
    );
    if (
      invCheck.rows.length !== 1 ||
      Number(invCheck.rows[0].quantity) !== 50
    ) {
      throw new Error(`[SETUP FAILED] Inventory verification failed: expected exactly one variant-free inventory row with quantity 50 for product ${prodId}.`);
    }

    console.log(`✔ Seeded test product: ${prodId} (price: ₹${prodPrice}, slug: ${testProductSlug})`);
    console.log(`✔ Seeded test inventory: 50 units (inventory_id: ${invCheck.rows[0].id})`);
    console.log('✔ Fixture preflight assertions passed: product and inventory verified.');

    // Ensure carts exist
    const cartRes1 = await client1.query(`INSERT INTO public.carts (user_id) VALUES ('${u1}') ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW() RETURNING id;`);
    const c1 = cartRes1.rows[0].id;
    const cartRes2 = await client2.query(`INSERT INTO public.carts (user_id) VALUES ('${u2}') ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW() RETURNING id;`);
    const c2 = cartRes2.rows[0].id;

    // ─────────────────────────────────────────────────────────────────────────
    // TEST A: Concurrent Same Idempotency Key Race
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test A: Concurrent Same Idempotency Key Race ---');
    console.log('Testing two independent client sessions submitting place_order with the identical key...');
    await client1.query(`UPDATE public.inventory SET quantity = 50 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);

    const idemKeyA = 'test-concurrent-race-key-' + Date.now();
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);

    let resA1 = null, errA1 = null;
    let resA2 = null, errA2 = null;

    const pA1 = client1.query(`SELECT public.place_order('${addr1}', 'Test A Note 1', NULL, 'phonepe', '${idemKeyA}') AS id;`)
      .then(r => { resA1 = r.rows[0].id; })
      .catch(e => { errA1 = e.message; });

    const pA2 = client2.query(`SELECT public.place_order('${addr1}', 'Test A Note 2', NULL, 'phonepe', '${idemKeyA}') AS id;`)
      .then(r => { resA2 = r.rows[0].id; })
      .catch(e => { errA2 = e.message; });

    await Promise.all([pA1, pA2]);

    console.log(`Session 1 Result: ${errA1 ? 'Error: ' + errA1 : 'Order ID: ' + resA1}`);
    console.log(`Session 2 Result: ${errA2 ? 'Error: ' + errA2 : 'Order ID: ' + resA2}`);

    const distinctOrderIdsA = new Set([resA1, resA2].filter(Boolean));
    if (distinctOrderIdsA.size !== 1) {
      throw new Error(`[ASSERTION FAILED] Test A: Expected exactly 1 unique order ID across concurrent requests with same idempotency key, got ${distinctOrderIdsA.size}`);
    }
    console.log('✔ Assertion A-1 Passed: Exactly one distinct order ID returned across independent concurrent client connections.');

    const createdOrderIdA = [...distinctOrderIdsA][0];
    const dbOrderCountA = (await client1.query(`SELECT count(*)::int AS cnt FROM public.orders WHERE idempotency_key = '${idemKeyA}';`)).rows[0].cnt;
    if (dbOrderCountA !== 1) {
      throw new Error(`[ASSERTION FAILED] Test A: Expected exactly 1 order row in database with idempotency_key, found ${dbOrderCountA}`);
    }
    console.log('✔ Assertion A-2 Passed: Database table orders contains exactly one row for the idempotency key.');

    const dbPaymentCountA = (await client1.query(`SELECT count(*)::int AS cnt FROM public.payments WHERE order_id = '${createdOrderIdA}';`)).rows[0].cnt;
    if (dbPaymentCountA !== 1) {
      throw new Error(`[ASSERTION FAILED] Test A: Expected exactly 1 payment row in database for order ${createdOrderIdA}, found ${dbPaymentCountA}`);
    }
    console.log('✔ Assertion A-3 Passed: Database table payments contains exactly one record for the order.');

    const stockA = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    if (stockA !== 48) {
      throw new Error(`[ASSERTION FAILED] Test A: Inventory must be deducted exactly once (expected 48, found ${stockA})`);
    }
    console.log('✔ Assertion A-4 Passed: Inventory deducted exactly once (from 50 to 48 units). No double deduction occurred.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST B: Concurrent Last-Unit Inventory Contention
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test B: Concurrent Last-Unit Inventory Contention ---');
    console.log('Testing User 1 and User 2 competing for the single remaining unit...');
    await client1.query(`UPDATE public.inventory SET quantity = 1 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c2]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1);`, [c1, prodId]);
    await client2.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1);`, [c2, prodId]);

    const idemKeyB1 = 'b-user1-key-' + Date.now();
    const idemKeyB2 = 'b-user2-key-' + Date.now();
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${u2}', false);`);

    let resB1 = null, errB1 = null;
    let resB2 = null, errB2 = null;

    const pB1 = client1.query(`SELECT public.place_order('${addr1}', 'Buyer 1 Last Unit', NULL, 'phonepe', '${idemKeyB1}') AS id;`)
      .then(r => { resB1 = r.rows[0].id; })
      .catch(e => { errB1 = e.message; });

    const pB2 = client2.query(`SELECT public.place_order('${addr2}', 'Buyer 2 Last Unit', NULL, 'phonepe', '${idemKeyB2}') AS id;`)
      .then(r => { resB2 = r.rows[0].id; })
      .catch(e => { errB2 = e.message; });

    await Promise.all([pB1, pB2]);

    console.log(`User 1 Result: ${errB1 ? 'Error: ' + errB1 : 'Order ID: ' + resB1}`);
    console.log(`User 2 Result: ${errB2 ? 'Error: ' + errB2 : 'Order ID: ' + resB2}`);

    const successesB = [resB1, resB2].filter(Boolean);
    const failuresB = [errB1, errB2].filter(Boolean);

    if (successesB.length !== 1 || failuresB.length !== 1) {
      throw new Error(`[ASSERTION FAILED] Test B: Exactly one buyer must succeed and one buyer must fail (successes: ${successesB.length}, failures: ${failuresB.length})`);
    }
    console.log('✔ Assertion B-1 Passed: Exactly one independent transaction secured the last unit; competing transaction was cleanly rejected.');

    const stockB = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    if (stockB !== 0) {
      throw new Error(`[ASSERTION FAILED] Test B: Inventory must be exactly 0 (no overselling, found: ${stockB})`);
    }
    console.log('✔ Assertion B-2 Passed: Final inventory is exactly 0. Zero overselling permitted.');

    const winningOrderIdB = successesB[0];
    const winningItemsCountB = (await client1.query(`SELECT quantity FROM public.order_items WHERE order_id = '${winningOrderIdB}';`)).rows[0].quantity;
    if (winningItemsCountB !== 1) {
      throw new Error(`[ASSERTION FAILED] Test B: Winning order item quantity must be 1, found ${winningItemsCountB}`);
    }
    console.log('✔ Assertion B-3 Passed: Winning order items allocated exactly 1 unit.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C: Concurrent UTR Submission Race
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test C: Concurrent UTR Submission Race ---');
    console.log('Testing simultaneous UTR submissions for the same order across two connections...');
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1);`, [c1, prodId]);
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    const cOrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Test C Order', NULL, 'phonepe', 'c-key-' || NOW()::text) AS id;`);
    const cOrdId = cOrdRes.rows[0].id;

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);

    let resC1 = null, errC1 = null;
    let resC2 = null, errC2 = null;

    const pC1 = client1.query(`SELECT public.submit_phonepe_utr('${cOrdId}', '123456789012') AS sub;`)
      .then(r => {
        const row = r.rows[0]?.sub;
        resC1 = (typeof row === 'object' && row !== null) ? (row.submission_id || row.id || null) : row;
      })
      .catch(e => { errC1 = e.message; });

    const pC2 = client2.query(`SELECT public.submit_phonepe_utr('${cOrdId}', '987654321098') AS sub;`)
      .then(r => {
        const row = r.rows[0]?.sub;
        resC2 = (typeof row === 'object' && row !== null) ? (row.submission_id || row.id || null) : row;
      })
      .catch(e => { errC2 = e.message; });

    await Promise.all([pC1, pC2]);

    console.log(`Session 1 Result: ${errC1 ? 'Error: ' + errC1 : 'Submission ID: ' + resC1}`);
    console.log(`Session 2 Result: ${errC2 ? 'Error: ' + errC2 : 'Submission ID: ' + resC2}`);

    const successesC = [resC1, resC2].filter(Boolean);
    const failuresC = [errC1, errC2].filter(Boolean);

    if (successesC.length !== 1 || failuresC.length !== 1) {
      throw new Error(`[ASSERTION FAILED] Test C: Exactly one concurrent UTR submission must succeed while the other must be rejected for pending review (got ${successesC.length} successes)`);
    }
    console.log('✔ Assertion C-1 Passed: Exactly one submission accepted; concurrent submission rejected because order is already under review.');

    const subCountC = (await client1.query(`SELECT count(*)::int AS cnt FROM public.payment_submissions WHERE order_id = '${cOrdId}' AND status = 'submitted';`)).rows[0].cnt;
    if (subCountC !== 1) {
      throw new Error(`[ASSERTION FAILED] Test C: Exactly 1 submitted payment record must exist in database, found ${subCountC}`);
    }
    console.log('✔ Assertion C-2 Passed: Exactly one submitted UTR review record persisted.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST D: Concurrent Refund Authorization Race
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test D: Concurrent Refund Authorization Race ---');
    console.log('Testing two administrators attempting to record a refund simultaneously for the same order...');
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    const dOrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Test D Order', NULL, 'phonepe', 'd-key-' || NOW()::text) AS id;`);
    const dOrdId = dOrdRes.rows[0].id;

    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = '${dOrdId}';`);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = '${dOrdId}';`);

    const dItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = '${dOrdId}' LIMIT 1;`)).rows[0].id;
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    const dInspId = (await client1.query(`SELECT public.admin_create_return_inspection('${dOrdId}', '${dItemId}', 2, 'Customer returned 2 units') AS id;`)).rows[0].id;
    await client1.query(`SELECT public.admin_complete_return_inspection('${dInspId}', 'passed', 2, 'good', 'Physical inspection passed', false);`);

    const stockBeforeRefundD = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

    let resD1 = null, errD1 = null;
    let resD2 = null, errD2 = null;

    const pD1 = client1.query(`SELECT public.admin_record_refund('${dOrdId}', 'REF-TXN-ADMIN1', 'Refund Admin 1', true) AS result;`)
      .then(r => { resD1 = r.rows[0].result; })
      .catch(e => { errD1 = e.message; });

    const pD2 = client2.query(`SELECT public.admin_record_refund('${dOrdId}', 'REF-TXN-ADMIN2', 'Refund Admin 2', true) AS result;`)
      .then(r => { resD2 = r.rows[0].result; })
      .catch(e => { errD2 = e.message; });

    await Promise.all([pD1, pD2]);

    console.log(`Admin 1 Result: ${errD1 ? 'Error: ' + errD1 : 'Success'}`);
    console.log(`Admin 2 Result: ${errD2 ? 'Error: ' + errD2 : 'Success'}`);

    const successesD = [resD1, resD2].filter(Boolean);
    const failuresD = [errD1, errD2].filter(Boolean);

    if (successesD.length !== 1 || failuresD.length !== 1) {
      throw new Error(`[ASSERTION FAILED] Test D: Exactly one admin refund call must succeed while the concurrent call must fail (got ${successesD.length} successes)`);
    }
    console.log('✔ Assertion D-1 Passed: Exactly one refund processed; second concurrent refund rejected.');

    const stockAfterRefundD = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    if (stockAfterRefundD !== stockBeforeRefundD + 2) {
      throw new Error(`[ASSERTION FAILED] Test D: Inventory must be restocked by exactly 2 units (expected ${stockBeforeRefundD + 2}, got ${stockAfterRefundD})`);
    }
    console.log('✔ Assertion D-2 Passed: Inventory restocked exactly once (+2 units). Double restocking strictly prevented.');

    const payStatusD = (await client1.query(`SELECT status, refund_reference FROM public.payments WHERE order_id = '${dOrdId}';`)).rows[0];
    if (payStatusD.status !== 'refunded' || !payStatusD.refund_reference) {
      throw new Error(`[ASSERTION FAILED] Test D: Payment status must be refunded with refund_reference set`);
    }
    console.log('✔ Assertion D-3 Passed: Payment record successfully marked refunded with refund reference.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST E: Concurrent Order Cancellation vs Admin Payment Verification Race
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test E: Concurrent Cancellation vs Admin Verification Race ---');
    console.log('Testing customer cancelling pending order simultaneously with admin verifying UTR payment...');
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    const eOrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Test E Order', NULL, 'phonepe', 'e-key-' || NOW()::text) AS id;`);
    const eOrdId = eOrdRes.rows[0].id;
    const eSubRes = await client1.query(`SELECT public.submit_phonepe_utr('${eOrdId}', '112233445566') AS sub;`);
    const eSubId = eSubRes.rows[0].sub.submission_id;
    if (!eSubId) {
      throw new Error(`[SETUP FAILED] Test E: submit_phonepe_utr did not return a submission_id`);
    }

    const stockBeforeRaceE = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

    let resE1 = null, errE1 = null;
    let resE2 = null, errE2 = null;

    const pE1 = client1.query(`SELECT public.cancel_order('${eOrdId}') AS cancelled;`)
      .then(r => { resE1 = r.rows[0].cancelled; })
      .catch(e => { errE1 = e.message; });

    const pE2 = client2.query(`SELECT public.admin_verify_utr('${eSubId}', true, 'Verified concurrent race') AS verified;`)
      .then(r => { resE2 = r.rows[0].verified; })
      .catch(e => { errE2 = e.message; });

    await Promise.all([pE1, pE2]);

    console.log(`Customer Cancel Result: ${errE1 ? 'Error: ' + errE1 : 'Success'}`);
    console.log(`Admin Verify Result: ${errE2 ? 'Error: ' + errE2 : 'Success'}`);

    const finalOrderE = (await client1.query(`SELECT status FROM public.orders WHERE id = '${eOrdId}';`)).rows[0].status;
    const finalPaymentE = (await client1.query(`SELECT status FROM public.payments WHERE order_id = '${eOrdId}';`)).rows[0].status;
    const finalSubE = (await client1.query(`SELECT status FROM public.payment_submissions WHERE id = '${eSubId}';`)).rows[0].status;
    const stockAfterRaceE = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    console.log(`Final Database State: Order status=${finalOrderE}, Payment status=${finalPaymentE}, Submission status=${finalSubE}`);

    if (finalOrderE === 'cancelled') {
      if (stockAfterRaceE !== stockBeforeRaceE + 2) {
        throw new Error(`[ASSERTION FAILED] Test E: Cancelled pending order must restore stock (+2 units)`);
      }
      if (finalPaymentE !== 'failed') {
        throw new Error(`[ASSERTION FAILED] Test E: Cancelled pending order must mark payment failed`);
      }
      if (finalSubE !== 'rejected') {
        throw new Error(`[ASSERTION FAILED] Test E: Cancelled pending order must reject submitted UTR`);
      }
      console.log('✔ Assertion E-1 Passed: Cancellation won the race. Inventory was correctly restored by +2 units, payment failed, submission rejected.');
    } else if (finalOrderE === 'processing') {
      if (stockAfterRaceE !== stockBeforeRaceE) {
        throw new Error(`[ASSERTION FAILED] Test E: Verified processing order must NOT restore stock`);
      }
      if (finalPaymentE !== 'completed') {
        throw new Error(`[ASSERTION FAILED] Test E: Payment status must be completed for verified order`);
      }
      if (finalSubE !== 'approved') {
        throw new Error(`[ASSERTION FAILED] Test E: Submission status must be approved for verified order`);
      }
      console.log('✔ Assertion E-1 Passed: Payment verification won the race. Inventory was correctly retained for fulfillment, payment completed, submission approved.');
    } else {
      throw new Error(`[ASSERTION FAILED] Test E: Unexpected final state: order=${finalOrderE}, payment=${finalPaymentE}, sub=${finalSubE}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST E2: Deterministic Cancellation vs Admin Verification (Controlled Barrier)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test E2: Deterministic Cancellation vs Admin Verification (Controlled Synchronization Barrier) ---');
    console.log('Testing deterministic serialization between customer cancellation and admin verification...');
    console.log('Proving lock hierarchy (Order -> Payment -> Submission) and absence of deadlocks (40P01)...');

    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    const e2OrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Test E2 Order', NULL, 'phonepe', 'e2-key-' || NOW()::text) AS id;`);
    const e2OrdId = e2OrdRes.rows[0].id;
    const e2SubRes = await client1.query(`SELECT public.submit_phonepe_utr('${e2OrdId}', '223344556677') AS sub;`);
    const e2SubId = e2SubRes.rows[0].sub.submission_id;

    const stockBeforeRaceE2 = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    // Step 1: Client 1 starts transaction, acquires Tier 1 Order lock
    console.log(`Client 1 (PID ${pid1}) acquiring parent order lock on ${e2OrdId}...`);
    await client1.query('BEGIN;');
    await client1.query(`SELECT id FROM public.orders WHERE id = $1 FOR UPDATE;`, [e2OrdId]);
    console.log(`Client 1 acquired FOR UPDATE lock on order ${e2OrdId}.`);

    // Step 2: Client 2 launches admin_verify_utr concurrently
    console.log(`Client 2 (PID ${pid2}) launching admin_verify_utr for submission ${e2SubId}...`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

    let client2E2Finished = false;
    let client2E2Result = null;
    let client2E2Error = null;

    const pClient2E2 = client2.query(
      `SELECT public.admin_verify_utr($1, true, 'E2 Barrier Verify') AS verified;`,
      [e2SubId]
    ).then(r => {
      client2E2Finished = true;
      client2E2Result = r.rows[0].verified;
    }).catch(err => {
      client2E2Finished = true;
      client2E2Error = err;
    });

    // Step 3: Observer Client proves Client 2 is actively blocked by Client 1 on parent order lock
    console.log(`Observer Client (PID ${pidObs}) inspecting lock wait graph via pg_stat_activity...`);
    let observedE2Blocking = false;
    let observedE2WaitEvent = null;
    let observedE2Blockers = null;
    const e2BarrierStart = Date.now();
    const e2BarrierTimeoutMs = 8000;

    while (Date.now() - e2BarrierStart < e2BarrierTimeoutMs) {
      if (client2E2Finished) {
        throw new Error('[ASSERTION FAILED] Test E2: Client 2 completed prematurely before Client 1 committed! Expected Client 2 to be blocked on parent order lock.');
      }

      const blockRes = await observerClient.query(`
        SELECT
          pid,
          wait_event_type,
          wait_event,
          pg_blocking_pids(pid) AS blocking_pids
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid = $1
          AND cardinality(pg_blocking_pids(pid)) > 0;
      `, [pid2]);

      if (blockRes.rows.length > 0) {
        const row = blockRes.rows[0];
        const blockers = row.blocking_pids || [];
        if (blockers.includes(pid1)) {
          observedE2Blocking = true;
          observedE2WaitEvent = `${row.wait_event_type}:${row.wait_event}`;
          observedE2Blockers = blockers;
          break;
        }
      }

      await new Promise(r => setTimeout(r, 100));
    }

    if (!observedE2Blocking) {
      throw new Error(`[ASSERTION FAILED] Test E2: Timed out waiting for Client 2 (PID ${pid2}) to be blocked by Client 1 (PID ${pid1}).`);
    }

    console.log(`✔ Verified: Client 2 (PID ${pid2}) is actively BLOCKED by Client 1 (PID ${pid1}) on Order lock.`);
    console.log(`  Lock Wait Details: wait_event=${observedE2WaitEvent}, blocking_pids=[${observedE2Blockers.join(', ')}]`);

    // Step 4: Client 1 completes cancellation and commits transaction
    console.log(`Client 1 executing cancel_order and committing...`);
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client1.query(`SELECT public.cancel_order($1);`, [e2OrdId]);
    await client1.query('COMMIT;');
    console.log(`Client 1 transaction committed.`);

    // Step 5: Await Client 2 completion and verify no deadlock occurred
    await pClient2E2;

    if (!client2E2Error) {
      throw new Error(`[ASSERTION FAILED] Test E2: Client 2 expected to receive exception because order was cancelled, but got success.`);
    }

    if (client2E2Error.code === '40P01') {
      throw new Error(`[ASSERTION FAILED] Test E2: Deadlock detected! Code 40P01: ${client2E2Error.message}`);
    }

    if (!client2E2Error.message.includes('Order is not in pending status')) {
      throw new Error(`[ASSERTION FAILED] Test E2: Expected pending status error on unblock, got: ${client2E2Error.message}`);
    }

    console.log(`✔ Verified: Client 2 cleanly unblocked after commit without deadlock (40P01) and rejected with expected message: "${client2E2Error.message}"`);

    // Step 6: Verify final database consistency
    const finalOrderE2 = (await client1.query(`SELECT status FROM public.orders WHERE id = '${e2OrdId}';`)).rows[0].status;
    const finalPaymentE2 = (await client1.query(`SELECT status FROM public.payments WHERE order_id = '${e2OrdId}';`)).rows[0].status;
    const finalSubE2 = (await client1.query(`SELECT status FROM public.payment_submissions WHERE id = '${e2SubId}';`)).rows[0].status;
    const stockAfterRaceE2 = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    if (finalOrderE2 !== 'cancelled' || finalPaymentE2 !== 'failed' || finalSubE2 !== 'rejected' || stockAfterRaceE2 !== stockBeforeRaceE2 + 2) {
      throw new Error(`[ASSERTION FAILED] Test E2: Invalid final state: order=${finalOrderE2}, payment=${finalPaymentE2}, sub=${finalSubE2}, stock=${stockAfterRaceE2}`);
    }
    console.log('✔ Assertion E2-1 Passed: Controlled synchronization barrier confirmed blocking; lock hierarchy strictly eliminated deadlocks; exactly one valid terminal state was reached.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST F: Concurrent Expiry vs Payment Verification Race
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test F: Concurrent PhonePe Expiry vs Admin Verification Race ---');
    console.log('Testing background expiry cron racing with admin payment verification...');
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    const fOrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Test F Order', NULL, 'phonepe', 'f-key-' || NOW()::text) AS id;`);
    const fOrdId = fOrdRes.rows[0].id;
    const fSubRes = await client1.query(`SELECT public.submit_phonepe_utr('${fOrdId}', '665544332211') AS sub;`);
    const fSubId = fSubRes.rows[0].sub.submission_id;
    if (!fSubId) {
      throw new Error(`[SETUP FAILED] Test F: submit_phonepe_utr did not return a submission_id`);
    }

    await client1.query(`UPDATE public.orders SET created_at = NOW() - INTERVAL '49 hours' WHERE id = '${fOrdId}';`);

    const stockBeforeRaceF = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

    let resF1 = null, errF1 = null;
    let resF2 = null, errF2 = null;

    const pF1 = client1.query(`SELECT public.expire_pending_phonepe_orders() AS result;`)
      .then(r => {
        const val = r.rows[0]?.result;
        if (typeof val === 'object' && val !== null && 'expired_count' in val) {
          resF1 = Number(val.expired_count);
        } else if (typeof val === 'number') {
          resF1 = val;
        } else if (val !== null && val !== undefined && !isNaN(Number(val))) {
          resF1 = Number(val);
        } else {
          resF1 = null;
        }
      })
      .catch(e => { errF1 = e.message; });

    const pF2 = client2.query(`SELECT public.admin_verify_utr('${fSubId}', true, 'Verified during expiry race') AS verified;`)
      .then(r => { resF2 = r.rows[0].verified; })
      .catch(e => { errF2 = e.message; });

    await Promise.all([pF1, pF2]);

    const expiryMsg = errF1
      ? 'Error: ' + errF1
      : (resF1 !== null && !isNaN(resF1))
        ? `${resF1} orders expired`
        : 'Expiry job completed';
    console.log(`Expiry Job Result: ${expiryMsg}`);
    console.log(`Admin Verification Result: ${errF2 ? 'Error: ' + errF2 : 'Success'}`);

    const finalOrderF = (await client1.query(`SELECT status FROM public.orders WHERE id = '${fOrdId}';`)).rows[0].status;
    const finalPaymentF = (await client1.query(`SELECT status FROM public.payments WHERE order_id = '${fOrdId}';`)).rows[0].status;
    const finalSubF = (await client1.query(`SELECT status FROM public.payment_submissions WHERE id = '${fSubId}';`)).rows[0].status;

    if (finalOrderF !== 'processing' || finalPaymentF !== 'completed' || finalSubF !== 'approved') {
      throw new Error(`[ASSERTION FAILED] Test F: Order with submitted UTR must NOT be expired by cron (order=${finalOrderF}, payment=${finalPaymentF}, sub=${finalSubF})`);
    }
    console.log('✔ Assertion F-1 Passed: Submitted UTR protected order from 48-hour expiration; admin verification completed successfully.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST G: Option B Physical Return Restocking Concurrency
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test G: Option B Physical Return Restocking Concurrency ---');
    console.log('Testing return inspection flow, partial return restock, and rejected return handling...');

    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 4);`, [c1, prodId]);

    // Restore Client 1 identity to customer u1 for order placement
    await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [u1]);

    // Validate that addr1 belongs to customer u1 before calling place_order
    const addr1CheckG = await client1.query(
      `SELECT user_id FROM public.addresses WHERE id = $1;`,
      [addr1]
    );
    if (!addr1CheckG.rows[0] || addr1CheckG.rows[0].user_id !== u1) {
      throw new Error(`[ASSERTION FAILED] Test G setup: Address ${addr1} does not belong to customer ${u1} (found: ${addr1CheckG.rows[0]?.user_id})`);
    }

    const gOrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Test G Order', NULL, 'phonepe', 'g-key-' || NOW()::text) AS id;`);
    const gOrdId = gOrdRes.rows[0].id;
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = '${gOrdId}';`);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = '${gOrdId}';`);

    const gItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = '${gOrdId}' LIMIT 1;`)).rows[0].id;
    await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [adminId]);

    const gInspId1 = (await client1.query(`SELECT public.admin_create_return_inspection('${gOrdId}', '${gItemId}', 2, '2 units partially passed') AS id;`)).rows[0].id;
    await client1.query(`SELECT public.admin_complete_return_inspection('${gInspId1}', 'partially_passed', 1, 'good', '1 unit passed, 1 unit damaged', false);`);

    const stockBeforeG = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    await client1.query(`SELECT public.admin_record_refund('${gOrdId}', 'REF-PARTIAL-1', 'Partial return refund', true);`);
    const stockAfterG = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    if (stockAfterG !== stockBeforeG + 1) {
      throw new Error(`[ASSERTION FAILED] Test G: Partial return must restore ONLY approved quantity (+1 unit), expected ${stockBeforeG + 1}, got ${stockAfterG}`);
    }
    console.log('✔ Assertion G-1 Passed: Partial return restored strictly approved quantity (+1 unit).');

    let gDupErr = null;
    try {
      await client1.query(`SELECT public.admin_record_refund('${gOrdId}', 'REF-PARTIAL-DUP', 'Duplicate refund attempt', true);`);
    } catch (e) {
      gDupErr = e.message;
    }
    if (!gDupErr) {
      throw new Error('[ASSERTION FAILED] Test G: Duplicate refund on already-refunded order must be rejected');
    }
    console.log('✔ Assertion G-2 Passed: Duplicate refund attempt on refunded order was strictly rejected.');

    let gInspModErr = null;
    try {
      await client1.query(`SELECT public.admin_complete_return_inspection('${gInspId1}', 'passed', 2, 'good', 'Attempting modification after restock', false);`);
    } catch (e) {
      gInspModErr = e.message;
    }
    if (!gInspModErr || !gInspModErr.includes('inventory has already been restocked')) {
      throw new Error(`[ASSERTION FAILED] Test G: Modification of restocked inspection must be rejected with 'already been restocked'`);
    }
    console.log('✔ Assertion G-3 Passed: Already-restocked inspection cannot be modified or re-inspected.');

    const stockAfterDupG = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    if (stockAfterDupG !== stockAfterG) {
      throw new Error('[ASSERTION FAILED] Test G: Inventory must not change after rejected duplicate refund attempts');
    }
    console.log('✔ Assertion G-4 Passed: Inventory remained completely stable across rejected duplicate operations.');

    // Rejected inspection test
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [u1]);
    const gRejOrdId = (await client1.query(`SELECT public.place_order('${addr1}', 'Test G Rej Order', NULL, 'phonepe', 'g-rej-' || NOW()::text) AS id;`)).rows[0].id;
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = '${gRejOrdId}';`);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = '${gRejOrdId}';`);

    const gRejItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = '${gRejOrdId}' LIMIT 1;`)).rows[0].id;
    await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [adminId]);
    const gRejInspId = (await client1.query(`SELECT public.admin_create_return_inspection('${gRejOrdId}', '${gRejItemId}', 2, 'Customer returned 2 damaged units') AS id;`)).rows[0].id;
    await client1.query(`SELECT public.admin_complete_return_inspection('${gRejInspId}', 'rejected', 0, 'unusable', 'Damaged: cannot be restocked', false);`);

    let gRejRestockErr = null;
    try {
      await client1.query(`SELECT public.admin_record_refund('${gRejOrdId}', 'REF-REJECT-RESTOCK', 'Attempting restock for rejected return', true);`);
    } catch (e) {
      gRejRestockErr = e.message;
    }
    if (!gRejRestockErr || !gRejRestockErr.includes('no approved, un-restocked physical return inspection found')) {
      throw new Error(`[ASSERTION FAILED] Test G: Restocking must be blocked when inspection was rejected`);
    }
    await client1.query(`SELECT public.admin_record_refund('${gRejOrdId}', 'REF-REJECT-NO-RESTOCK', 'Financial refund only for rejected goods', false);`);
    console.log('✔ Assertion G-5 Passed: Rejected inspection blocked from restocking; financial refund recorded independently.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST H: True Multi-Connection Concurrent Restocking Race
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test H: True Multi-Connection Concurrent Restocking Race ---');
    console.log('Testing simultaneous calls to _restock_approved_return_inspections from Session 1 & Session 2...');

    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [u1]);
    const hOrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Concurrent restock race order', NULL, 'phonepe', 'h-race-' || NOW()::text) AS id;`);
    const hOrdId = hOrdRes.rows[0].id;
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = $1;`, [hOrdId]);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = $1;`, [hOrdId]);

    await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [adminId]);
    const hItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = $1 LIMIT 1;`, [hOrdId])).rows[0].id;
    const hInspId = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 2, 'Customer returned 2 units for concurrent restock test') AS id;`, [hOrdId, hItemId])).rows[0].id;
    await client1.query(`SELECT public.admin_complete_return_inspection($1, 'passed', 2, 'good', 'Both items inspected and passed', false);`, [hInspId]);

    const stockBeforeRaceH = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

    console.log(`Firing simultaneous _restock_approved_return_inspections('${hOrdId}') from Client 1 and Client 2...`);
    let hRes1 = null, hErr1 = null;
    let hRes2 = null, hErr2 = null;

    const pRace1 = client1.query(`SELECT public._restock_approved_return_inspections($1) AS restocked_count;`, [hOrdId])
      .then(r => { hRes1 = Number(r.rows[0].restocked_count); })
      .catch(e => { hErr1 = e.message; });

    const pRace2 = client2.query(`SELECT public._restock_approved_return_inspections($1) AS restocked_count;`, [hOrdId])
      .then(r => { hRes2 = Number(r.rows[0].restocked_count); })
      .catch(e => { hErr2 = e.message; });

    await Promise.all([pRace1, pRace2]);

    console.log(`Session 1 Result: ${hErr1 ? 'Error: ' + hErr1 : hRes1 + ' units restocked'}`);
    console.log(`Session 2 Result: ${hErr2 ? 'Error: ' + hErr2 : hRes2 + ' units restocked'}`);

    const totalRestockedFromCalls = (hRes1 || 0) + (hRes2 || 0);
    if (totalRestockedFromCalls !== 2) {
      throw new Error(`[ASSERTION FAILED] Test H: Combined restocked count from both sessions must be exactly 2 (got S1=${hRes1}, S2=${hRes2})`);
    }

    const oneGotTwo = (hRes1 === 2 && hRes2 === 0) || (hRes1 === 0 && hRes2 === 2);
    if (!oneGotTwo) {
      throw new Error(`[ASSERTION FAILED] Test H: Exactly one session must restock 2 units and the other 0 units (got S1=${hRes1}, S2=${hRes2})`);
    }
    console.log('✔ Assertion H-1 Passed: Exactly one session restored inventory; concurrent second call returned 0.');

    const stockAfterRaceH = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    if (stockAfterRaceH !== stockBeforeRaceH + 2) {
      throw new Error(`[ASSERTION FAILED] Test H: Inventory must increase by exactly 2 (expected ${stockBeforeRaceH + 2}, got ${stockAfterRaceH})`);
    }
    console.log('✔ Assertion H-2 Passed: Physical inventory increased exactly once (+2 units). Double restocking strictly prevented.');

    const inspRow = (await client1.query(`SELECT restocked, restocked_at FROM public.physical_return_inspections WHERE id = $1;`, [hInspId])).rows[0];
    if (inspRow.restocked !== true || !inspRow.restocked_at) {
      throw new Error('[ASSERTION FAILED] Test H: Inspection must be marked restocked = true with restocked_at timestamp.');
    }
    console.log('✔ Assertion H-3 Passed: Return inspection marked restocked = true exactly once.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST H2: Deterministic Concurrent Completion of Two Physical Returns on Same Order
    // (Controlled Synchronization Barrier with Lock-Contention Observer)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test H2: Deterministic Concurrent Completion of Different Return Inspections on Same Order ---');
    console.log('Testing deadlock-interleaving elimination across multiple inspection completions for the same order...');
    console.log('Using 3 independent sessions: Client 1 (Tx A), Client 2 (Tx B), and Observer Client...');

    let h2OrdId = null;
    let client2Finished = false;
    let client2Result = null;
    let client2Error = null;
    let pClient2 = null;
    let client2QueryStarted = false;
    let h2OrderCreated = false;
    let h2CleanupCompleted = false;
    let testError = null;
    let cleanupError = null;

    // Step 1: Create test fixtures
    const originalInventoryRow = (
      await client1.query(
        `SELECT * FROM public.inventory WHERE product_id = $1;`,
        [prodId]
      )
    ).rows[0];

    if (!originalInventoryRow) {
      throw new Error('[TEST SETUP FAILED] H2: Inventory row not found.');
    }

    const originalCartItemsH2 = (
      await client1.query(
        `SELECT * FROM public.cart_items WHERE cart_id = $1;`,
        [c1]
      )
    ).rows;

    try {
      await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
      await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
      await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 4);`, [c1, prodId]);
      await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [u1]);
      const h2OrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'H2 controlled barrier test order', NULL, 'phonepe', 'h2-order-' || NOW()::text) AS id;`);
      h2OrdId = h2OrdRes.rows[0].id;
      h2OrderCreated = true;
      await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = $1;`, [h2OrdId]);
      await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = $1;`, [h2OrdId]);

      const h2ItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = $1 LIMIT 1;`, [h2OrdId])).rows[0].id;

      // Create 3 inspection records:
      // Insp 1: returned 2 units (eligible to be passed)
      // Insp 2: returned 1 unit (eligible to be passed)
      // Insp 3: returned 1 unit (ineligible: damaged goods)
      await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [adminId]);
      const h2Insp1 = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 2, 'H2 Eligible return 1') AS id;`, [h2OrdId, h2ItemId])).rows[0].id;
      const h2Insp2 = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 1, 'H2 Eligible return 2') AS id;`, [h2OrdId, h2ItemId])).rows[0].id;
      const h2Insp3 = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 1, 'H2 Ineligible return 3 (damaged)') AS id;`, [h2OrdId, h2ItemId])).rows[0].id;

      const initialStockH2 = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
      console.log(`Initial Inventory Level for Product: ${initialStockH2}`);

      // Set admin authentication context on all sessions
      await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
      await client2.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
      await observerClient.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

      // Step 2 & 3: Start first transaction on client1, acquire order lock, complete inspection 1 (do not commit yet)
      console.log(`Client 1 (PID ${pid1}) starting transaction and acquiring parent order lock on ${h2OrdId}...`);
      await client1.query('BEGIN;');
      await client1.query(`SELECT id FROM public.orders WHERE id = $1 FOR UPDATE;`, [h2OrdId]);
      console.log(`Client 1 acquired FOR UPDATE lock on order ${h2OrdId}`);

      const resH2Client1 = await client1.query(
        `SELECT public.admin_complete_return_inspection($1, 'passed', 2, 'good', 'H2 controlled concurrency inspection 1', true) AS result;`,
        [h2Insp1]
      );
      console.log(`Client 1 completed inspection 1 inside uncommitted transaction:`, resH2Client1.rows[0].result);

      // Verify inside Client 1's transaction that inventory is increased by 2
      const stockClient1View = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
      if (stockClient1View !== initialStockH2 + 2) {
        throw new Error(`[ASSERTION FAILED] Test H2: Inside Client 1 transaction, inventory must be ${initialStockH2 + 2}, got ${stockClient1View}`);
      }

      // Step 4: Start second independent session on client2
      console.log(`Client 2 (PID ${pid2}) launching admin_complete_return_inspection on Inspection 2 (${h2Insp2})...`);

      client2QueryInFlight = true;
      client2QuerySettled = false;
      client2QueryStarted = true;

      pClient2 = client2.query(
        `SELECT public.admin_complete_return_inspection($1, 'passed', 1, 'good', 'H2 controlled concurrency inspection 2', true) AS result;`,
        [h2Insp2]
      ).then(r => {
        client2Finished = true;
        client2Result = r.rows[0].result;
      }).catch(err => {
        client2Finished = true;
        client2Error = err;
      }).finally(() => {
        client2QueryInFlight = false;
        client2QuerySettled = true;
      });

      // Step 5: Prove that the second session is actually blocked using observerClient
      console.log(`Observer Client (PID ${pidObs}) inspecting lock wait graph via pg_stat_activity...`);
      let observedBlocking = false;
      let observedWaitEvent = null;
      let observedBlockers = null;
      const barrierStart = Date.now();
      const barrierTimeoutMs = 8000;

      while (Date.now() - barrierStart < barrierTimeoutMs) {
        if (client2Finished) {
          throw new Error('[ASSERTION FAILED] Test H2: Client 2 completed prematurely before Client 1 committed! Expected Client 2 to be blocked by Client 1 on parent order lock.');
        }

        const blockRes = await observerClient.query(`
          SELECT
            pid,
            wait_event_type,
            wait_event,
            pg_blocking_pids(pid) AS blocking_pids
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid = $1
            AND cardinality(pg_blocking_pids(pid)) > 0;
        `, [pid2]);

        if (blockRes.rows.length > 0) {
          const row = blockRes.rows[0];
          const blockers = row.blocking_pids || [];
          if (blockers.includes(pid1)) {
            observedBlocking = true;
            observedWaitEvent = `${row.wait_event_type}:${row.wait_event}`;
            observedBlockers = blockers;
            break;
          }
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (!observedBlocking) {
        throw new Error(`[ASSERTION FAILED] Test H2: Timed out waiting for Client 2 (PID ${pid2}) to be blocked by Client 1 (PID ${pid1}). Concurrency lock contention was not observed.`);
      }

      console.log(`✔ Verified: Client 2 (PID ${pid2}) is actively BLOCKED by Client 1 (PID ${pid1})`);
      console.log(`  Lock Wait Details: wait_event=${observedWaitEvent}, blocking_pids=[${observedBlockers.join(', ')}]`);

      // Step 6: Release the first transaction
      console.log(`Client 1 committing transaction to release parent order lock...`);
      await client1.query('COMMIT;');
      console.log(`Client 1 transaction committed.`);

      // Await Client 2 completion with bounded timeout
      const client2TimeoutMs = 8000;
      let client2Timer;
      const client2TimeoutPromise = new Promise((_, reject) => {
        client2Timer = setTimeout(() => {
          reject(new Error(`[ASSERTION FAILED] Test H2: Timed out (${client2TimeoutMs}ms) waiting for Client 2 to complete after Client 1 committed.`));
        }, client2TimeoutMs);
      });

      try {
        await Promise.race([pClient2, client2TimeoutPromise]);
      } finally {
        clearTimeout(client2Timer);
      }

      if (client2Error) {
        if (client2Error.code === '40P01') {
          throw new Error(`[ASSERTION FAILED] Test H2: Deadlock detected! Code 40P01: ${client2Error.message}`);
        }
        if (client2Error.code === '40001') {
          throw new Error(`[ASSERTION FAILED] Test H2: Serialization failure! Code 40001: ${client2Error.message}`);
        }
        throw new Error(`[ASSERTION FAILED] Test H2: Client 2 failed with unexpected error: ${client2Error.message}`);
      }

      console.log(`Client 2 successfully unblocked and completed:`, client2Result);
      console.log('✔ Assertion H2-1 Passed: Controlled synchronization barrier confirmed blocking; both concurrent operations completed without deadlock or abort.');

      // Step 7: Verify inventory and inspection states
      const finalStockH2 = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
      const expectedFinalStock = initialStockH2 + 3;
      if (finalStockH2 !== expectedFinalStock) {
        throw new Error(`[ASSERTION FAILED] Test H2: Inventory must increase by exactly 3 (expected ${expectedFinalStock}, got ${finalStockH2})`);
      }
      console.log(`✔ Assertion H2-2 Passed: Physical inventory increased by exactly 3 units (${initialStockH2} -> ${finalStockH2}). Each approved quantity restored exactly once.`);

      const insp1Row = (await client1.query(`SELECT restocked, restocked_at, approved_quantity, inspection_outcome FROM public.physical_return_inspections WHERE id = $1;`, [h2Insp1])).rows[0];
      const insp2Row = (await client1.query(`SELECT restocked, restocked_at, approved_quantity, inspection_outcome FROM public.physical_return_inspections WHERE id = $1;`, [h2Insp2])).rows[0];

      if (insp1Row.restocked !== true || !insp1Row.restocked_at || insp1Row.approved_quantity !== 2 || insp1Row.inspection_outcome !== 'passed') {
        throw new Error(`[ASSERTION FAILED] Test H2: Inspection 1 must be marked restocked=true with approved_quantity=2`);
      }
      if (insp2Row.restocked !== true || !insp2Row.restocked_at || insp2Row.approved_quantity !== 1 || insp2Row.inspection_outcome !== 'passed') {
        throw new Error(`[ASSERTION FAILED] Test H2: Inspection 2 must be marked restocked=true with approved_quantity=1`);
      }
      console.log('✔ Assertion H2-3 Passed: Both eligible inspection records deterministically updated and marked restocked = true.');

      // Step 7b: Ineligible inspection test (Insp 3)
      const stockBeforeIneligible = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
      await client1.query(
        `SELECT public.admin_complete_return_inspection($1, 'rejected', 0, 'unusable', 'Damaged goods: rejected', true);`,
        [h2Insp3]
      );
      const stockAfterIneligible = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
      if (stockAfterIneligible !== stockBeforeIneligible) {
        throw new Error(`[ASSERTION FAILED] Test H2: Ineligible (rejected) inspection must NOT restore inventory (stock changed from ${stockBeforeIneligible} to ${stockAfterIneligible})`);
      }
      const insp3Row = (await client1.query(`SELECT restocked, inspection_outcome, approved_quantity FROM public.physical_return_inspections WHERE id = $1;`, [h2Insp3])).rows[0];
      if (insp3Row.restocked !== false || insp3Row.approved_quantity !== 0 || insp3Row.inspection_outcome !== 'rejected') {
        throw new Error(`[ASSERTION FAILED] Test H2: Ineligible inspection must remain restocked=false with approved_quantity=0`);
      }
      console.log('✔ Assertion H2-4 Passed: Ineligible (rejected) inspection did not restore inventory and remains restocked = false.');

      // Step 8: Verify retry protection
      let retryErrH2 = null;
      try {
        await client1.query(
          `SELECT public.admin_complete_return_inspection($1, 'passed', 2, 'good', 'Attempting duplicate completion', true);`,
          [h2Insp1]
        );
      } catch (e) {
        retryErrH2 = e.message;
      }
      if (!retryErrH2 || !retryErrH2.includes('already been restocked')) {
        throw new Error(`[ASSERTION FAILED] Test H2: Retrying already completed inspection must be rejected with 'already been restocked' (got: ${retryErrH2})`);
      }
      const stockAfterRetryH2 = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
      if (stockAfterRetryH2 !== stockAfterIneligible) {
        throw new Error(`[ASSERTION FAILED] Test H2: Retrying completed inspection must NOT alter inventory`);
      }
      console.log('✔ Assertion H2-5 Passed: Duplicate completion of already-restocked inspection strictly rejected with zero inventory modification.');

    } catch (err) {
      testError = err;
      console.error('[TEST ERROR] Test H2 encountered failure:', err.message);
    } finally {
      // Step 9: Comprehensive H2 environment cleanup on both success and failure
      let cleanupStep = '1. Cancel Client 2 query';
      try {
        // 1. If Client 2's query was started and is still running, attempt cancellation using the supported mechanism
        if (client2QueryStarted && (client2QueryInFlight || (pClient2 && !client2Finished))) {
          cleanupStep = '1. Cancel Client 2 query';
          if (pid2 && !observerClosed && !client2Closed && !client2Terminated) {
            try {
              console.log(`Attempting cancellation of in-flight Client 2 query (PID ${pid2})...`);
              await observerClient.query('SELECT pg_cancel_backend($1);', [pid2]);
            } catch (cancelErr) {
              console.warn('Warning: pg_cancel_backend for Client 2 failed:', cancelErr.message);
            }
          }

          // 2. Wait for the actual query promise to settle (bounded 3s timeout)
          cleanupStep = '2. Wait for Client 2 settlement after cancel';
          let cancelTimer = null;
          try {
            const cancelSettlePromise = new Promise((_, reject) => {
              cancelTimer = setTimeout(() => reject(new Error('Cancel settlement timed out after 3000ms')), 3000);
            });
            await Promise.race([pClient2, cancelSettlePromise]);
          } catch (_) {
            // pClient2 rejection or cancel timeout caught here
          } finally {
            if (cancelTimer) {
              clearTimeout(cancelTimer);
            }
          }

          // 3. If it does not settle within the bounded timeout, request backend termination through observer
          if (client2QueryInFlight || !client2Finished) {
            cleanupStep = '2b. Terminate Client 2 backend';
            console.warn(`Client 2 did not settle after cancel; calling pg_terminate_backend on PID ${pid2}...`);
            if (pid2 && !observerClosed && !client2Closed && !client2Terminated) {
              let termError = null;
              try {
                const termRes = await observerClient.query(
                  'SELECT pg_terminate_backend($1) AS terminated;',
                  [pid2]
                );
                const terminated = termRes.rows[0]?.terminated === true;
                if (terminated) {
                  client2Terminated = true;
                  console.log(`✔ PostgreSQL confirmed pg_terminate_backend returned true for PID ${pid2}.`);
                } else {
                  client2Terminated = false;
                  termError = new Error(`PostgreSQL did not confirm termination of Client 2 backend PID ${pid2} (returned false)`);
                  console.error(termError.message);
                }
              } catch (tErr) {
                client2Terminated = false;
                termError = tErr;
                console.error('Fatal: pg_terminate_backend query failed:', tErr.message);
              }

              if (!client2Terminated) {
                throw termError || new Error(`Failed to terminate Client 2 backend PID ${pid2}`);
              }
            }

            // 4. Wait for Client 2 query promise to settle after termination (bounded 3s timeout)
            cleanupStep = '2c. Wait for Client 2 termination settlement';
            let termTimer = null;
            try {
              const termSettlePromise = new Promise((_, reject) => {
                termTimer = setTimeout(() => reject(new Error('Termination settlement timed out after 3000ms')), 3000);
              });
              await Promise.race([pClient2, termSettlePromise]);
            } catch (_) {}
            finally {
              if (termTimer) {
                clearTimeout(termTimer);
              }
            }
          }
        }

        // Attempt to close Client 2 connection and record actual close result
        cleanupStep = '2d. Close Client 2 connection';
        let client2CloseError = null;
        if (!client2Closed) {
          let endTimer = null;
          try {
            const endTimeoutPromise = new Promise((_, reject) => {
              endTimer = setTimeout(() => reject(new Error('client2.end() timed out after 3000ms')), 3000);
            });
            await Promise.race([
              client2.end().then(() => { client2Closed = true; }),
              endTimeoutPromise
            ]);
          } catch (c2CloseErr) {
            client2CloseError = c2CloseErr;
            console.warn('Warning: client2.end() encountered error during H2 cleanup:', c2CloseErr.message);
          } finally {
            if (endTimer) {
              clearTimeout(endTimer);
            }
          }
        }

        // If client2 closure failed or timed out and client2 is not confirmed closed, do not proceed with uncertain state
        if (!client2Closed && !client2Terminated && pid2 && client2CloseError) {
          throw new Error(`[FATAL CLEANUP ERROR] Client 2 connection closure could not be confirmed: ${client2CloseError.message}`);
        }

        // Verify required safety condition before executing any H2 DELETE or inventory/cart restoration:
        // Establish BOTH:
        // (a) If Client 2 query was started, verify that its query promise has settled (client2QuerySettled === true)
        // (b) The independent observer confirms that the Client 2 backend PID no longer exists in pg_stat_activity
        cleanupStep = '2e. Confirm Client 2 query settled and backend PID no longer exists';
        if (client2QueryStarted && !client2QuerySettled) {
          throw new Error(`[FATAL CLEANUP ERROR] Client 2 query was started but has not settled (client2QuerySettled=${client2QuerySettled}). Halting cleanup.`);
        }

        let backendExists = true;
        if (pid2 && !observerClosed) {
          const pollStart = Date.now();
          const pollTimeoutMs = 5000;
          while (Date.now() - pollStart < pollTimeoutMs) {
            const checkRes = await observerClient.query(
              'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = $1) AS backend_exists;',
              [pid2]
            );
            backendExists = checkRes.rows[0]?.backend_exists === true;
            if (!backendExists) {
              break;
            }
            await new Promise(r => setTimeout(r, 100));
          }
        } else if (!pid2) {
          backendExists = false;
        }

        if (backendExists) {
          const fatalErr = new Error(`[FATAL CLEANUP ERROR] Client 2 backend PID ${pid2} still exists in pg_stat_activity after timeout. Halting cleanup to prevent concurrent data modification.`);
          console.error(fatalErr.message);
          h2CleanupCompleted = false;
          throw fatalErr;
        }

        // Roll back open transactions on Client 1 and Client 2 (if safe)
        cleanupStep = '3. Roll back open transactions';
        if (!client1Closed) {
          const c1InXact = isClientInTransaction(client1) || (await isBackendTransactionActive(observerClient, pid1));
          if (c1InXact) {
            try {
              await client1.query('ROLLBACK;');
            } catch (rb1Err) {
              const rbFatalErr = new Error(`[FATAL CLEANUP ERROR] Client 1 rollback failed: ${rb1Err.message}`);
              console.error(rbFatalErr.message);
              throw rbFatalErr;
            }

            // Confirm the transaction is no longer open before proceeding with cleanup
            if (pid1 && !observerClosed) {
              try {
                const xactCheck = await observerClient.query(
                  `SELECT state FROM pg_stat_activity WHERE pid = $1;`,
                  [pid1]
                );
                const state = xactCheck.rows[0]?.state;
                if (state === 'idle in transaction' || state === 'idle in transaction (aborted)') {
                  throw new Error(`[FATAL CLEANUP ERROR] Client 1 is still in open transaction (state='${state}') after ROLLBACK.`);
                }
              } catch (vErr) {
                console.error(vErr.message);
                throw vErr;
              }
            }
          }
        }

        // Never execute client2 ROLLBACK if Client 2 is closed, ending, or still has an unsettled query
        if (!client2Closed && !client2Terminated && !client2QueryInFlight && client2QuerySettled) {
          const c2InXact = isClientInTransaction(client2) || (await isBackendTransactionActive(observerClient, pid2));
          if (c2InXact) {
            try {
              await client2.query('ROLLBACK;');
            } catch (rb2Err) {
              const rb2FatalErr = new Error(`[FATAL CLEANUP ERROR] Client 2 rollback failed: ${rb2Err.message}`);
              console.error(rb2FatalErr.message);
              throw rb2FatalErr;
            }
          }
        }

        // Delete H2 test order records if created
        cleanupStep = '4. Delete H2 order records';
        if (h2OrderCreated && h2OrdId) {
          await client1.query(`DELETE FROM public.physical_return_inspections WHERE order_id = $1;`, [h2OrdId]);
          await client1.query(`DELETE FROM public.order_items WHERE order_id = $1;`, [h2OrdId]);
          await client1.query(`DELETE FROM public.payments WHERE order_id = $1;`, [h2OrdId]);
          await client1.query(`DELETE FROM public.orders WHERE id = $1;`, [h2OrdId]);

          const remOrder = (await client1.query(`SELECT count(*)::int AS cnt FROM public.orders WHERE id = $1;`, [h2OrdId])).rows[0].cnt;
          if (remOrder !== 0) {
            throw new Error(`[CLEANUP VERIFICATION FAILED] Order ${h2OrdId} still exists after deletion.`);
          }
        }

        // Restore original inventory row using captured original row by its primary key
        cleanupStep = '5. Restore original inventory row';
        if (originalInventoryRow) {
          await client1.query(
            `UPDATE public.inventory SET quantity = $1 WHERE id = $2;`,
            [originalInventoryRow.quantity, originalInventoryRow.id]
          );
        }

        // Restore original cart items for cart c1 (delete current, reinsert every captured column, handle empty cart)
        cleanupStep = '6. Restore original cart items';
        await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
        if (originalCartItemsH2 && originalCartItemsH2.length > 0) {
          const cartCols = Object.keys(originalCartItemsH2[0]);
          const colList = cartCols.map(c => `"${c}"`).join(', ');
          const placeholders = cartCols.map((_, idx) => '$' + (idx + 1)).join(', ');

          for (const item of originalCartItemsH2) {
            const values = cartCols.map(c => item[c]);
            await client1.query(
              `INSERT INTO public.cart_items (${colList}) VALUES (${placeholders});`,
              values
            );
          }
        }

        // Verify inventory and every captured cart column
        cleanupStep = '7. Verify inventory and cart state';
        if (originalInventoryRow) {
          const curInv = (
            await client1.query(`SELECT * FROM public.inventory WHERE id = $1;`, [originalInventoryRow.id])
          ).rows[0];
          if (!curInv || Number(curInv.quantity) !== Number(originalInventoryRow.quantity)) {
            throw new Error(`[CLEANUP VERIFICATION FAILED] Inventory quantity mismatch: expected ${originalInventoryRow.quantity}, found ${curInv ? curInv.quantity : 'missing'}`);
          }
        }

        const currentCartRows = (
          await client1.query(`SELECT * FROM public.cart_items WHERE cart_id = $1 ORDER BY id ASC;`, [c1])
        ).rows;

        const expectedCartCount = originalCartItemsH2 ? originalCartItemsH2.length : 0;
        if (currentCartRows.length !== expectedCartCount) {
          throw new Error(`[CLEANUP VERIFICATION FAILED] Cart item count mismatch: expected ${expectedCartCount}, found ${currentCartRows.length}`);
        }

        if (originalCartItemsH2 && originalCartItemsH2.length > 0) {
          const sortedOrig = [...originalCartItemsH2].sort((a, b) => String(a.id).localeCompare(String(b.id)));
          const cartCols = Object.keys(originalCartItemsH2[0]);

          for (let i = 0; i < sortedOrig.length; i++) {
            const origRow = sortedOrig[i];
            const curRow = currentCartRows[i];

            for (const col of cartCols) {
              const origVal = origRow[col];
              const curVal = curRow[col];

              let matches = false;
              if (origVal === curVal) {
                matches = true;
              } else if (origVal instanceof Date && curVal instanceof Date) {
                matches = origVal.getTime() === curVal.getTime();
              } else if (origVal !== null && curVal !== null && String(origVal) === String(curVal)) {
                matches = true;
              }

              if (!matches) {
                throw new Error(
                  `[CLEANUP VERIFICATION FAILED] Cart item mismatch at item ${origRow.id}, column "${col}": expected ${origVal}, got ${curVal}`
                );
              }
            }
          }
        }

        // Set h2CleanupCompleted = true only after all restoration and verification steps succeed
        h2CleanupCompleted = true;
        console.log('✔ Isolated H2 test fixtures and environment state successfully cleaned up and verified.');

      } catch (cleanupErr) {
        cleanupError = cleanupErr;
        h2CleanupCompleted = false;
        console.error(`[CLEANUP FAILED] Error during H2 cleanup step "${cleanupStep}":`, cleanupErr.message);
        console.error('Cleanup error details:', cleanupErr);
        console.error(`Test H2 state at failure: h2OrderCreated=${h2OrderCreated}, h2CleanupCompleted=${h2CleanupCompleted}`);
      }
    }

    // Evaluate Test H2 error status across all three cases:
    // Case A: Test fails, cleanup succeeds -> Throw original test error
    // Case B: Test succeeds, cleanup fails -> Throw cleanup error
    // Case C: Test fails, cleanup fails -> Preserve both errors via AggregateError
    if (testError && !cleanupError) {
      throw testError;
    } else if (!testError && cleanupError) {
      throw cleanupError;
    } else if (testError && cleanupError) {
      if (typeof AggregateError === 'function') {
        throw new AggregateError(
          [testError, cleanupError],
          `[TEST & CLEANUP FAILED] Test H2 failed (${testError.message}) AND cleanup failed (${cleanupError.message})`
        );
      } else {
        const combinedErr = new Error(
          `[TEST & CLEANUP FAILED] Test H2 failed: ${testError.message}\n` +
          `[SUBSEQUENT CLEANUP FAILURE] H2 cleanup also failed: ${cleanupError.message}`
        );
        combinedErr.testError = testError;
        combinedErr.cleanupError = cleanupError;
        throw combinedErr;
      }
    }

    if (!h2CleanupCompleted) {
      throw new Error('[ASSERTION FAILED] Test H2 cleanup was not completed successfully.');
    }

    console.log('\n=================================================================');
    console.log('TRUE MULTI-CONNECTION CONCURRENCY TESTS: ALL ASSERTIONS PASSED!');
    console.log('Tests A, B, C, D, E, F, G, H, H2 complete.');
    console.log('=================================================================');
    return { verified: true };
  } catch (runErr) {
    suiteError = runErr;
    throw runErr;
  }
} finally {
  // 1. Cancel in-flight queries only if observer is open, client backend connection is open, and query unsettled
  if (!observerClosed && pid1 && !client1Closed) {
    try {
      await observerClient.query('SELECT pg_cancel_backend($1);', [pid1]);
    } catch (cancel1Err) {
      console.warn('Warning: Outer finally pg_cancel_backend for client1 failed:', cancel1Err.message);
      outerCleanupErrors.push(new Error(`Outer finally pg_cancel_backend for client1 failed: ${cancel1Err.message}`));
    }
  }
  if (!observerClosed && pid2 && !client2Closed && !client2Terminated && client2QueryInFlight) {
    try {
      await observerClient.query('SELECT pg_cancel_backend($1);', [pid2]);
    } catch (cancel2Err) {
      console.warn('Warning: Outer finally pg_cancel_backend for client2 failed:', cancel2Err.message);
      outerCleanupErrors.push(new Error(`Outer finally pg_cancel_backend for client2 failed: ${cancel2Err.message}`));
    }
  }

  // 2. Roll back client1 if not closed and transaction is open
  if (!client1Closed) {
    const c1InXact = isClientInTransaction(client1) || (await isBackendTransactionActive(observerClient, pid1));
    if (c1InXact) {
      try {
        await client1.query('ROLLBACK;');
      } catch (rb1Err) {
        console.warn('Warning: Outer finally rollback on client1 failed:', rb1Err.message);
        outerCleanupErrors.push(new Error(`Outer finally rollback on client1 failed: ${rb1Err.message}`));
      }
    }
  }

  // 3. Never execute client2 ROLLBACK if Client 2 is closed, ending, terminated, or still has an unsettled query
  if (!client2Closed && !client2Terminated && !client2QueryInFlight && client2QuerySettled) {
    const c2InXact = isClientInTransaction(client2) || (await isBackendTransactionActive(observerClient, pid2));
    if (c2InXact) {
      try {
        await client2.query('ROLLBACK;');
      } catch (rb2Err) {
        console.warn('Warning: Outer finally rollback on client2 failed:', rb2Err.message);
        outerCleanupErrors.push(new Error(`Outer finally rollback on client2 failed: ${rb2Err.message}`));
      }
    }
  }

  // 4. Roll back observerClient if not closed and transaction is open
  // Note: observerClient only executes single-statement admin/observer queries without BEGIN
  if (!observerClosed && isClientInTransaction(observerClient)) {
    try {
      await observerClient.query('ROLLBACK;');
    } catch (rbObsErr) {
      console.warn('Warning: Outer finally rollback on observerClient failed:', rbObsErr.message);
      outerCleanupErrors.push(new Error(`Outer finally rollback on observerClient failed: ${rbObsErr.message}`));
    }
  }

  // 5. Safely close all client connections without unconfirmed state assignments
  if (!client1Closed) {
    let timer1 = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer1 = setTimeout(() => reject(new Error('client1.end() timed out after 3000ms')), 3000);
      });
      await Promise.race([
        client1.end().then(() => { client1Closed = true; }),
        timeoutPromise
      ]);
    } catch (close1Err) {
      console.warn('Warning: Outer finally closing client1 failed:', close1Err.message);
      outerCleanupErrors.push(new Error(`Outer finally closing client1 failed: ${close1Err.message}`));
    } finally {
      if (timer1) {
        clearTimeout(timer1);
      }
    }
  }

  if (!client2Closed) {
    let timer2 = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer2 = setTimeout(() => reject(new Error('client2.end() timed out after 3000ms')), 3000);
      });
      await Promise.race([
        client2.end().then(() => { client2Closed = true; }),
        timeoutPromise
      ]);
    } catch (close2Err) {
      console.warn('Warning: Outer finally closing client2 failed:', close2Err.message);
      outerCleanupErrors.push(new Error(`Outer finally closing client2 failed: ${close2Err.message}`));
    } finally {
      if (timer2) {
        clearTimeout(timer2);
      }
    }
  }

  if (!observerClosed) {
    let timerObs = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timerObs = setTimeout(() => reject(new Error('observerClient.end() timed out after 3000ms')), 3000);
      });
      await Promise.race([
        observerClient.end().then(() => { observerClosed = true; }),
        timeoutPromise
      ]);
    } catch (closeObsErr) {
      console.warn('Warning: Outer finally closing observerClient failed:', closeObsErr.message);
      outerCleanupErrors.push(new Error(`Outer finally closing observerClient failed: ${closeObsErr.message}`));
    } finally {
      if (timerObs) {
        clearTimeout(timerObs);
      }
    }
  }

  // 6. Report outer cleanup errors and combine with suiteError if both occurred
  if (suiteError && outerCleanupErrors.length > 0) {
    const allErrors = [suiteError, ...outerCleanupErrors];
    if (typeof AggregateError === 'function') {
      throw new AggregateError(
        allErrors,
        `[RUNNER & CLEANUP FAILED] Test suite failed (${suiteError.message}) AND ${outerCleanupErrors.length} outer cleanup error(s) occurred: ${outerCleanupErrors.map(e => e.message).join('; ')}`
      );
    } else {
      const combined = new Error(
        `[RUNNER & CLEANUP FAILED] Test suite failed: ${suiteError.message}\n` +
        `Outer cleanup error(s): ${outerCleanupErrors.map(e => e.message).join('; ')}`
      );
      combined.suiteError = suiteError;
      combined.cleanupErrors = outerCleanupErrors;
      throw combined;
    }
  } else if (!suiteError && outerCleanupErrors.length > 0) {
    if (outerCleanupErrors.length === 1) {
      throw outerCleanupErrors[0];
    } else if (typeof AggregateError === 'function') {
      throw new AggregateError(
        outerCleanupErrors,
        `[CLEANUP FAILED] Concurrency tests passed but ${outerCleanupErrors.length} outer connection cleanup error(s) occurred: ${outerCleanupErrors.map(e => e.message).join('; ')}`
      );
    } else {
      const combined = new Error(
        `[CLEANUP FAILED] Concurrency tests passed but outer cleanup error(s) occurred: ${outerCleanupErrors.map(e => e.message).join('; ')}`
      );
      combined.cleanupErrors = outerCleanupErrors;
      throw combined;
    }
  }
}
}

runTrueConcurrencyTest()
  .then(res => {
    if (!res || !res.verified) {
      process.exitCode = 1;
    }
  })
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  });
