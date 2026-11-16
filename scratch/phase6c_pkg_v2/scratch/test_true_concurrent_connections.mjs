import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = fs.existsSync(path.resolve(process.cwd(), 'database/schema.sql'))
  ? process.cwd()
  : path.resolve(__dirname, '..');

const schemaPath = path.resolve(projectRoot, 'database/schema.sql');
const migrationPath = path.resolve(projectRoot, 'database/migrations/phase6c_order_and_checkout_corrections.sql');

let Client;
try {
  const pg = await import('pg');
  Client = pg.Client || pg.default?.Client;
} catch {
  try {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const pg = req('pg');
    Client = pg.Client || pg.default?.Client;
  } catch {
    try {
      const { createRequire } = await import('module');
      const req = createRequire(process.env.NODE_PATH || (process.env.APPDATA ? `${process.env.APPDATA}/npm/node_modules/firebase-tools/` : '/usr/local/lib/node_modules/'));
      const pg = req('pg');
      Client = pg.Client || pg.default?.Client;
    } catch {}
  }
}

const CONNECTION_STRING = process.env.PG_CONNECTION_STRING || 'postgres://postgres:postgres@127.0.0.1:5432/shopkart_test';

function validateSafeLocalTestTarget(connStr) {
  let parsed;
  try {
    parsed = new URL(connStr);
  } catch (err) {
    throw new Error(`[SAFETY GATE CRITICAL] Invalid connection string format: ${err.message}`);
  }

  const hostname = (parsed.hostname || '').toLowerCase();
  const pathname = (parsed.pathname || '').replace(/^\//, '').toLowerCase();

  // 1. Strict hostname check: ONLY 127.0.0.1, localhost, or ::1 are permitted
  const allowedHosts = ['127.0.0.1', 'localhost', '::1'];
  if (!allowedHosts.includes(hostname)) {
    throw new Error(`[SAFETY GATE CRITICAL] Connection target '${hostname}' is NOT a local loopback interface. Testing is strictly restricted to local disposable databases (127.0.0.1 / localhost). Connection to remote servers is forbidden.`);
  }

  // 2. Explicit remote / Supabase string rejection
  const lowerConn = connStr.toLowerCase();
  if (lowerConn.includes('supabase') || lowerConn.includes('pooler') || lowerConn.includes('aws') || lowerConn.includes('.co')) {
    throw new Error(`[SAFETY GATE CRITICAL] Connection string contains remote cloud / Supabase identifiers. Connection aborted to protect production infrastructure.`);
  }

  // 3. Database name check: must strictly be the dedicated test database 'shopkart_test'
  if (pathname !== 'shopkart_test') {
    throw new Error(`[SAFETY GATE CRITICAL] Target database '${pathname}' is rejected. Concurrency test runner requires a dedicated disposable database named 'shopkart_test' (rejects '${pathname}' / default 'postgres') to prevent modifying system or default databases.`);
  }

  console.log(`✔ Target safety gate passed: Verified Local Host: ${hostname}, Verified Test Database: ${pathname}`);
  return true;
}

async function runTrueConcurrencyTest() {
  console.log('=================================================================');
  console.log('SHOPKART: TRUE MULTI-CONNECTION POSTGRESQL CONCURRENCY TEST');
  console.log('Testing two independent TCP client sessions with real row-level locks');
  console.log('Target Server: ' + CONNECTION_STRING);
  console.log(`Runtime: Node.js ${process.version}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log('=================================================================\n');

  if (!Client) {
    console.log('-----------------------------------------------------------------');
    console.log('REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED');
    console.log('STATUS: UNVERIFIED (pg package not found in current environment)');
    console.log('-----------------------------------------------------------------');
    return { verified: false, error: 'pg client library not found' };
  }

  // Verify target safety gate before attempting connection
  try {
    validateSafeLocalTestTarget(CONNECTION_STRING);
  } catch (safetyErr) {
    console.error(safetyErr.message);
    process.exit(1);
  }

  console.log(`Connecting Client 1 and Client 2 to ${CONNECTION_STRING}...`);
  const client1 = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 3000 });
  const client2 = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 3000 });

  try {
    await client1.connect();
    await client2.connect();
    console.log('✔ Both independent TCP database sessions successfully connected!\n');
  } catch (err) {
    console.log('-----------------------------------------------------------------');
    console.log('REAL POSTGRESQL CONCURRENCY TESTS: NOT EXECUTED');
    console.log('STATUS: UNVERIFIED ON THIS HOST (LOCAL POSTGRESQL SERVER INACTIVE)');
    console.log(`Reason: TCP connection to 127.0.0.1:5432 failed (${err.message})`);
    console.log('No local PostgreSQL daemon or Docker container is currently listening on port 5432.');
    console.log('\nTo execute this test in an isolated local environment:');
    console.log('  1. docker run --name shopkart-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17');
    console.log('  2. psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE shopkart_test;"');
    console.log('  3. $env:PG_CONNECTION_STRING="postgres://postgres:postgres@127.0.0.1:5432/shopkart_test"');
    console.log('  4. node scratch/test_true_concurrent_connections.mjs');
    console.log('-----------------------------------------------------------------');
    return { verified: false, error: err.message };
  }

  try {
    const pid1 = (await client1.query('SELECT pg_backend_pid() AS pid;')).rows[0].pid;
    const pid2 = (await client2.query('SELECT pg_backend_pid() AS pid;')).rows[0].pid;
    const pgVersion = (await client1.query('SELECT version();')).rows[0].version;
    console.log(`PostgreSQL Engine Version: ${pgVersion}`);
    console.log(`Session 1 Backend PID: ${pid1}`);
    console.log(`Session 2 Backend PID: ${pid2}`);

    console.log('\nExecuting database schema and Phase 6C migration on isolated server...');
    let schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client1.query(schemaSql);
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

    // Create 1 limited stock product (Stock = 1)
    const prodRes = await client1.query(`
      INSERT INTO public.products (id, name, slug, price, is_active)
      VALUES (gen_random_uuid(), 'Last Unit Laptop', 'last-unit-laptop', 50000.00, TRUE)
      RETURNING id;
    `);
    const prodId = prodRes.rows[0].id;
    await client1.query(`INSERT INTO public.inventory (product_id, quantity) VALUES ('${prodId}', 1);`);

    // Carts for u1 and u2: both have 1 unit of prodId
    const c1 = (await client1.query(`INSERT INTO public.carts (id, user_id) VALUES (gen_random_uuid(), '${u1}') RETURNING id;`)).rows[0].id;
    const c2 = (await client1.query(`INSERT INTO public.carts (id, user_id) VALUES (gen_random_uuid(), '${u2}') RETURNING id;`)).rows[0].id;
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ('${c1}', '${prodId}', 1);`);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ('${c2}', '${prodId}', 1);`);

    console.log('\n--- Scenario 1: Competing simultaneous checkout for last available inventory item ---');
    console.log('Initial conditions: Stock = 1, User 1 cart = 1 unit, User 2 cart = 1 unit');
    console.log('Session 1 (Client 1, User 1) and Session 2 (Client 2, User 2) firing place_order concurrently...');

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${u2}', false);`);

    let order1Id = null, order1Error = null;
    let order2Id = null, order2Error = null;

    const tStart1 = Date.now();
    const p1 = client1.query(`SELECT public.place_order('${addr1}', 'Session 1 order', NULL, 'phonepe', 'simultaneous-key-1') AS id;`)
      .then(res => { order1Id = res.rows[0].id; })
      .catch(err => { order1Error = err.message; });

    const p2 = client2.query(`SELECT public.place_order('${addr2}', 'Session 2 order', NULL, 'phonepe', 'simultaneous-key-2') AS id;`)
      .then(res => { order2Id = res.rows[0].id; })
      .catch(err => { order2Error = err.message; });

    await Promise.all([p1, p2]);
    const duration1 = Date.now() - tStart1;

    console.log(`Execution completed in ${duration1}ms`);
    console.log(`Session 1 Result (PID ${pid1}): ${order1Id ? 'SUCCESS (Order ID: ' + order1Id + ')' : 'FAILED (' + order1Error + ')'}`);
    console.log(`Session 2 Result (PID ${pid2}): ${order2Id ? 'SUCCESS (Order ID: ' + order2Id + ')' : 'FAILED (' + order2Error + ')'}`);

    // Executable assertions for Scenario 1:
    const successCount = (order1Id ? 1 : 0) + (order2Id ? 1 : 0);
    if (successCount !== 1) {
      throw new Error(`[ASSERTION FAILED] Scenario 1: Expected exactly 1 request to succeed, but got ${successCount}`);
    }
    const failCount = (order1Error ? 1 : 0) + (order2Error ? 1 : 0);
    if (failCount !== 1) {
      throw new Error(`[ASSERTION FAILED] Scenario 1: Expected exactly 1 request to fail, but got ${failCount}`);
    }
    const losingError = order1Error || order2Error;
    if (!losingError || !losingError.includes('Insufficient or unconfigured inventory')) {
      throw new Error(`[ASSERTION FAILED] Scenario 1: Losing request failed with unexpected message: ${losingError}`);
    }
    const winningOrderId = order1Id || order2Id;

    const ordCountRes = await client1.query('SELECT count(*)::int AS count FROM public.orders WHERE id = $1;', [winningOrderId]);
    if (ordCountRes.rows[0].count !== 1) {
      throw new Error(`[ASSERTION FAILED] Scenario 1: Expected exactly 1 order created, found ${ordCountRes.rows[0].count}`);
    }

    const payCountRes = await client1.query('SELECT count(*)::int AS count FROM public.payments WHERE order_id = $1;', [winningOrderId]);
    if (payCountRes.rows[0].count !== 1) {
      throw new Error(`[ASSERTION FAILED] Scenario 1: Expected exactly 1 payment created, found ${payCountRes.rows[0].count}`);
    }

    const finalInv = await client1.query('SELECT quantity FROM public.inventory WHERE product_id = $1;', [prodId]);
    if (finalInv.rows[0].quantity !== 0) {
      throw new Error(`[ASSERTION FAILED] Scenario 1: Final inventory must be exactly 0 (got ${finalInv.rows[0].quantity})`);
    }
    console.log('✔ Assertion Passed: Exactly one request succeeded, exactly one failed with Insufficient inventory.');
    console.log('✔ Assertion Passed: Exactly one order created, exactly one payment created.');
    console.log('✔ Assertion Passed: Final inventory is strictly zero (overselling strictly prevented).');

    // ─────────────────────────────────────────────────────────────────
    // Scenario 2: Concurrent requests with identical idempotency key
    // Same authenticated user, same address, valid cart, exact same key
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- Scenario 2: Concurrent requests with identical idempotency key ---');
    console.log('Initial conditions: Stock = 5. Both sessions authenticate as User 1 with Address 1.');
    await client1.query(`UPDATE public.inventory SET quantity = 5 WHERE product_id = '${prodId}';`);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = '${c1}';`);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ('${c1}', '${prodId}', 1);`);

    // Authenticate BOTH sessions as User 1
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);

    let raceOrder1 = null, raceOrder1Error = null;
    let raceOrder2 = null, raceOrder2Error = null;
    const sameKey = 'race-idemp-token-' + Date.now();

    console.log(`Firing identical idempotency key (${sameKey}) concurrently from Session 1 (PID ${pid1}) and Session 2 (PID ${pid2})...`);
    const tStart2 = Date.now();
    const raceP1 = client1.query(`SELECT public.place_order('${addr1}', 'Race pass 1', NULL, 'phonepe', '${sameKey}') AS id;`)
      .then(res => { raceOrder1 = res.rows[0].id; })
      .catch(err => { raceOrder1Error = err.message; });

    const raceP2 = client2.query(`SELECT public.place_order('${addr1}', 'Race pass 2', NULL, 'phonepe', '${sameKey}') AS id;`)
      .then(res => { raceOrder2 = res.rows[0].id; })
      .catch(err => { raceOrder2Error = err.message; });

    await Promise.all([raceP1, raceP2]);
    const duration2 = Date.now() - tStart2;

    console.log(`Execution completed in ${duration2}ms`);
    console.log(`Session 1 Result (PID ${pid1}): ${raceOrder1 || raceOrder1Error}`);
    console.log(`Session 2 Result (PID ${pid2}): ${raceOrder2 || raceOrder2Error}`);

    // Executable assertions for Scenario 2:
    if (!raceOrder1 || !raceOrder2) {
      throw new Error(`[ASSERTION FAILED] Scenario 2: Both requests must succeed, but got S1=${raceOrder1 || raceOrder1Error}, S2=${raceOrder2 || raceOrder2Error}`);
    }
    if (raceOrder1 !== raceOrder2) {
      throw new Error(`[ASSERTION FAILED] Scenario 2: Both requests must return the identical order UUID (${raceOrder1} vs ${raceOrder2})`);
    }

    const raceOrdCount = await client1.query('SELECT count(*)::int AS count FROM public.orders WHERE user_id = $1 AND idempotency_key = $2;', [u1, sameKey]);
    if (raceOrdCount.rows[0].count !== 1) {
      throw new Error(`[ASSERTION FAILED] Scenario 2: Expected exactly 1 order row in database for idempotency key, found ${raceOrdCount.rows[0].count}`);
    }

    const racePayCount = await client1.query('SELECT count(*)::int AS count FROM public.payments WHERE order_id = $1;', [raceOrder1]);
    if (racePayCount.rows[0].count !== 1) {
      throw new Error(`[ASSERTION FAILED] Scenario 2: Expected exactly 1 payment row for order ${raceOrder1}, found ${racePayCount.rows[0].count}`);
    }

    const remainingStock = await client1.query('SELECT quantity FROM public.inventory WHERE product_id = $1;', [prodId]);
    if (remainingStock.rows[0].quantity !== 4) {
      throw new Error(`[ASSERTION FAILED] Scenario 2: Inventory must be deducted exactly once (expected 4, got ${remainingStock.rows[0].quantity})`);
    }

    console.log('✔ Assertion Passed: Both requests returned the exact same order UUID.');
    console.log('✔ Assertion Passed: Exactly 1 order record created for idempotency key.');
    console.log('✔ Assertion Passed: Exactly 1 payment record created.');
    console.log('✔ Assertion Passed: Inventory deducted exactly once (started at 5, final is exactly 4).');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C: Coupon concurrency
    // Two sessions simultaneously try to use the same coupon that is at max use.
    // Only one must succeed; the second must receive a "coupon exhausted" error.
    // Also verifies idempotent coupon increment: same order cannot increment twice.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test C: Coupon concurrency (last available use) ---');

    // Create a coupon with max_uses=1
    const couponRes = await client1.query(`
      INSERT INTO public.coupons (id, code, type, value, min_order_value, max_uses, used_count, is_active, valid_until)
      VALUES (gen_random_uuid(), 'RACETEST1', 'flat', 100.00, 0, 1, 0, true, NOW() + INTERVAL '1 day')
      RETURNING id, code;
    `);
    const couponCode = couponRes.rows[0].code;
    const couponId = couponRes.rows[0].id;

    // Reset stock to 10, fresh carts for both users
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1);`, [c1, prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c2]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1);`, [c2, prodId]);

    // Session 1 authenticates as u1, session 2 as u2 (different users, same coupon)
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${u2}', false);`);

    let couponOrd1 = null, couponErr1 = null;
    let couponOrd2 = null, couponErr2 = null;
    const keyC1 = 'coupon-race-u1-' + Date.now();
    const keyC2 = 'coupon-race-u2-' + Date.now();

    console.log(`Firing concurrent place_order with coupon '${couponCode}' (max_uses=1)...`);
    const cp1 = client1.query(`SELECT public.place_order('${addr1}', 'Coupon race S1', '${couponCode}', 'cod', '${keyC1}') AS id;`)
      .then(r => { couponOrd1 = r.rows[0].id; })
      .catch(e => { couponErr1 = e.message; });
    const cp2 = client2.query(`SELECT public.place_order('${addr2}', 'Coupon race S2', '${couponCode}', 'cod', '${keyC2}') AS id;`)
      .then(r => { couponOrd2 = r.rows[0].id; })
      .catch(e => { couponErr2 = e.message; });

    await Promise.all([cp1, cp2]);

    const successes = [couponOrd1, couponOrd2].filter(Boolean);
    const failures = [couponErr1, couponErr2].filter(Boolean);
    if (successes.length !== 1) {
      throw new Error(`[ASSERTION FAILED] Test C: Expected exactly 1 coupon success, got ${successes.length} (${JSON.stringify({couponOrd1, couponErr1, couponOrd2, couponErr2})})`);
    }

    const couponUsedCount = (await client1.query('SELECT used_count FROM public.coupons WHERE id = $1;', [couponId])).rows[0].used_count;
    if (Number(couponUsedCount) !== 1) {
      throw new Error(`[ASSERTION FAILED] Test C: Coupon used_count must be exactly 1, got ${couponUsedCount}`);
    }

    // Idempotent retry: same session, same key, same coupon — must return same order UUID, not increment used_count again
    const idempCouponOrderId = successes[0];
    const whichClient = couponOrd1 ? client1 : client2;
    const idempKey = couponOrd1 ? keyC1 : keyC2;
    const idempAddr = couponOrd1 ? addr1 : addr2;
    const idempSession = couponOrd1 ? u1 : u2;
    await whichClient.query(`SELECT set_config('request.jwt.claim.sub', '${idempSession}', false);`);
    const idempRetryRes = await whichClient.query(`SELECT public.place_order('${idempAddr}', 'Coupon race retry', '${couponCode}', 'cod', '${idempKey}') AS id;`);
    const idempRetryId = idempRetryRes.rows[0].id;
    if (idempRetryId !== idempCouponOrderId) {
      throw new Error(`[ASSERTION FAILED] Test C: Idempotent retry with same coupon key must return same order UUID (got ${idempRetryId} vs ${idempCouponOrderId})`);
    }
    const couponUsedCountAfterRetry = (await client1.query('SELECT used_count FROM public.coupons WHERE id = $1;', [couponId])).rows[0].used_count;
    if (Number(couponUsedCountAfterRetry) !== 1) {
      throw new Error(`[ASSERTION FAILED] Test C: Idempotent retry must NOT re-increment coupon used_count (expected 1, got ${couponUsedCountAfterRetry})`);
    }

    console.log('✔ Assertion Passed: Exactly 1 of 2 concurrent coupon orders succeeded.');
    console.log('✔ Assertion Passed: Coupon used_count is exactly 1.');
    console.log('✔ Assertion Passed: Idempotent retry did not re-increment coupon.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST D: Payment submissions — UTR lifecycle
    // Covers: valid UTR, duplicate approved UTR, rejected UTR resubmission,
    // 48-hour deadline enforcement, review-after-deadline rejection.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test D: Payment submissions / UTR lifecycle ---');

    // Create a fresh phonepe order for u1
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1);`, [c1, prodId]);
    const ppeOrderRes = await client1.query(`SELECT public.place_order('${addr1}', 'UTR test order', NULL, 'phonepe', 'utr-test-' + NOW()::text) AS id;`);
    const ppeOrderId = ppeOrderRes.rows[0].id;

    // D-1: Valid UTR submission
    await client1.query(`SELECT public.submit_phonepe_utr($1, '123456789012') AS ok;`, [ppeOrderId]);
    const subRow = (await client1.query('SELECT status FROM public.payment_submissions WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1;', [ppeOrderId])).rows[0];
    if (subRow?.status !== 'pending') {
      throw new Error(`[ASSERTION FAILED] Test D-1: UTR submission must have status 'pending', got ${subRow?.status}`);
    }
    console.log('✔ Assertion D-1 Passed: Valid UTR submission created with status pending.');

    // D-2: Duplicate UTR (same 12-digit code) must be rejected
    let dupUtrErr = null;
    try {
      await client1.query(`SELECT public.submit_phonepe_utr($1, '123456789012') AS ok;`, [ppeOrderId]);
    } catch (e) { dupUtrErr = e.message; }
    if (!dupUtrErr) {
      throw new Error('[ASSERTION FAILED] Test D-2: Duplicate UTR re-submission to same order must be rejected.');
    }
    console.log('✔ Assertion D-2 Passed: Duplicate UTR rejected.');

    // D-3: Admin rejects UTR; user must be able to resubmit without restocking
    await client1.query(`
      UPDATE public.payment_submissions SET status = 'rejected' WHERE order_id = $1 AND utr_number = '123456789012';
      UPDATE public.payments SET status = 'failed' WHERE order_id = $1;
    `, [ppeOrderId]);
    const stockBeforeResubmit = (await client1.query('SELECT quantity FROM public.inventory WHERE product_id = $1;', [prodId])).rows[0].quantity;
    // Resubmit after rejection
    let resubErr = null;
    try {
      await client1.query(`SELECT public.submit_phonepe_utr($1, '999999999999') AS ok;`, [ppeOrderId]);
    } catch (e) { resubErr = e.message; }
    if (resubErr) {
      throw new Error(`[ASSERTION FAILED] Test D-3: Resubmission after rejection must succeed, got: ${resubErr}`);
    }
    const stockAfterResubmit = (await client1.query('SELECT quantity FROM public.inventory WHERE product_id = $1;', [prodId])).rows[0].quantity;
    if (Number(stockBeforeResubmit) !== Number(stockAfterResubmit)) {
      throw new Error(`[ASSERTION FAILED] Test D-3: UTR rejection must not restock inventory (before=${stockBeforeResubmit}, after=${stockAfterResubmit})`);
    }
    console.log('✔ Assertion D-3 Passed: Post-rejection resubmission accepted; inventory not restored.');

    // D-4: 48-hour deadline — manually backdate payment created_at to 49 hours ago; then try to submit UTR
    // Create a fresh phonepe order for deadline test
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1);`, [c1, prodId]);
    const expiredOrderRes = await client1.query(`SELECT public.place_order('${addr1}', 'Deadline test order', NULL, 'phonepe', 'utr-deadline-' + NOW()::text) AS id;`);
    const expiredOrderId = expiredOrderRes.rows[0].id;
    // Backdate payment to 49 hours ago
    await client1.query(`UPDATE public.payments SET created_at = NOW() - INTERVAL '49 hours' WHERE order_id = $1;`, [expiredOrderId]);
    let deadlineErr = null;
    try {
      await client1.query(`SELECT public.submit_phonepe_utr($1, '777777777777') AS ok;`, [expiredOrderId]);
    } catch (e) { deadlineErr = e.message; }
    if (!deadlineErr) {
      throw new Error('[ASSERTION FAILED] Test D-4: UTR submission after 48h deadline must be rejected.');
    }
    console.log('✔ Assertion D-4 Passed: UTR submission rejected after 48-hour deadline.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST E: Refund logic — reference required, duplicate rejection, restock guard
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test E: Refund logic ---');

    // Create a paid order (phonepe, manually mark payment completed)
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    const refundOrderRes = await client1.query(`SELECT public.place_order('${addr1}', 'Refund test order', NULL, 'phonepe', 'refund-test-' + NOW()::text) AS id;`);
    const refundOrderId = refundOrderRes.rows[0].id;

    // Mark payment as completed and order as processing
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = $1;`, [refundOrderId]);
    await client1.query(`UPDATE public.orders SET status = 'processing' WHERE id = $1;`, [refundOrderId]);

    // Cancel order (paid; cancellation must keep payment completed, NOT restock)
    const stockBeforeCancel = (await client1.query('SELECT quantity FROM public.inventory WHERE product_id = $1;', [prodId])).rows[0].quantity;
    await client1.query(`SELECT public.cancel_order($1) AS ok;`, [refundOrderId]);
    const stockAfterCancel = (await client1.query('SELECT quantity FROM public.inventory WHERE product_id = $1;', [prodId])).rows[0].quantity;
    if (Number(stockAfterCancel) !== Number(stockBeforeCancel)) {
      throw new Error(`[ASSERTION FAILED] Test E-1: Paid cancellation must NOT restore inventory (before=${stockBeforeCancel}, after=${stockAfterCancel})`);
    }
    console.log('✔ Assertion E-1 Passed: Paid cancellation did not restore inventory.');

    // E-2: Refund without external reference must be rejected
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    let noRefErr = null;
    try {
      // admin_record_refund(p_order_id, p_refund_reference, p_admin_notes, p_restock_inventory)
      await client1.query(`
        SELECT public.admin_record_refund($1, NULL, 'Full refund', false) AS ok;
      `, [refundOrderId]);
    } catch (e) { noRefErr = e.message; }
    if (!noRefErr) {
      throw new Error('[ASSERTION FAILED] Test E-2: Refund without external reference must be rejected.');
    }
    console.log('✔ Assertion E-2 Passed: Refund without reference rejected.');

    // E-3: Refund with restock but no inspection notes must be rejected
    let noNotesErr = null;
    try {
      await client1.query(`SELECT public.admin_record_refund($1, 'REF123', NULL, true) AS ok;`, [refundOrderId]);
    } catch (e) { noNotesErr = e.message; }
    if (!noNotesErr) {
      throw new Error('[ASSERTION FAILED] Test E-3: Refund with restock but no inspection notes must be rejected.');
    }
    console.log('✔ Assertion E-3 Passed: Refund with restock but no notes rejected.');

    // E-3b: Refund with restock but no approved inspection must be rejected (Option B)
    let noInspErr = null;
    try {
      await client1.query(`SELECT public.admin_record_refund($1, 'REF-NOINSP', 'Notes provided but no inspection exists', true) AS ok;`, [refundOrderId]);
    } catch (e) { noInspErr = e.message; }
    if (!noInspErr) {
      throw new Error('[ASSERTION FAILED] Test E-3b: Refund with restock but no approved inspection must be rejected.');
    }
    console.log('✔ Assertion E-3b Passed: Restock without approved return inspection rejected.');

    // E-4: Valid refund with reference and no restock
    let validRefundErr = null;
    try {
      await client1.query(`SELECT public.admin_record_refund($1, 'REF-VALID-001', 'Customer confirmed; no return needed.', false) AS ok;`, [refundOrderId]);
    } catch (e) { validRefundErr = e.message; }
    if (validRefundErr) {
      throw new Error(`[ASSERTION FAILED] Test E-4: Valid refund must succeed, got: ${validRefundErr}`);
    }
    const refundRow = (await client1.query(`SELECT refund_reference, status FROM public.payments WHERE order_id = $1;`, [refundOrderId])).rows[0];
    if (!refundRow?.refund_reference) {
      throw new Error('[ASSERTION FAILED] Test E-4: refund_reference must be recorded in payments table.');
    }
    console.log('✔ Assertion E-4 Passed: Valid refund recorded with refund_reference.');

    // E-5: Duplicate refund must be rejected
    let dupRefundErr = null;
    try {
      await client1.query(`SELECT public.admin_record_refund($1, 'REF-DUP-002', 'Duplicate attempt.', false) AS ok;`, [refundOrderId]);
    } catch (e) { dupRefundErr = e.message; }
    if (!dupRefundErr) {
      throw new Error('[ASSERTION FAILED] Test E-5: Duplicate refund on already-refunded order must be rejected.');
    }
    console.log('✔ Assertion E-5 Passed: Duplicate refund rejected.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST F: Cancellation workflow — unpaid pending, paid processing, repeated
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test F: Cancellation workflow ---');

    // F-1: Cancel an unpaid pending COD order — must succeed; inventory restored
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client1.query(`UPDATE public.inventory SET quantity = 5 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    const unpaidOrderRes = await client1.query(`SELECT public.place_order('${addr1}', 'Unpaid cancel test', NULL, 'cod', 'cancel-unpaid-' + NOW()::text) AS id;`);
    const unpaidOrderId = unpaidOrderRes.rows[0].id;
    const stockBeforeUnpaidCancel = (await client1.query('SELECT quantity FROM public.inventory WHERE product_id = $1;', [prodId])).rows[0].quantity;

    let f1Err = null;
    try {
      await client1.query(`SELECT public.cancel_order($1) AS ok;`, [unpaidOrderId]);
    } catch (e) { f1Err = e.message; }
    if (f1Err) {
      throw new Error(`[ASSERTION FAILED] Test F-1: Cancellation of unpaid pending order must succeed, got: ${f1Err}`);
    }
    const stockAfterUnpaidCancel = (await client1.query('SELECT quantity FROM public.inventory WHERE product_id = $1;', [prodId])).rows[0].quantity;
    if (Number(stockAfterUnpaidCancel) !== Number(stockBeforeUnpaidCancel) + 2) {
      throw new Error(`[ASSERTION FAILED] Test F-1: Inventory must be restored by 2 after unpaid COD cancel (before=${stockBeforeUnpaidCancel}, after=${stockAfterUnpaidCancel})`);
    }
    const cancelledOrderStatus = (await client1.query('SELECT status FROM public.orders WHERE id = $1;', [unpaidOrderId])).rows[0].status;
    if (cancelledOrderStatus !== 'cancelled') {
      throw new Error(`[ASSERTION FAILED] Test F-1: Order status must be 'cancelled', got ${cancelledOrderStatus}`);
    }
    console.log('✔ Assertion F-1 Passed: Unpaid pending COD order cancelled; inventory restored exactly.');

    // F-2: Repeated cancel of already-cancelled order must be rejected
    let f2Err = null;
    try {
      await client1.query(`SELECT public.cancel_order($1) AS ok;`, [unpaidOrderId]);
    } catch (e) { f2Err = e.message; }
    if (!f2Err) {
      throw new Error('[ASSERTION FAILED] Test F-2: Cancelling an already-cancelled order must be rejected.');
    }
    console.log('✔ Assertion F-2 Passed: Repeated cancel rejected.');

    // F-3: Cancelled order can transition to refunded (the trigger allows this)
    let f3Err = null;
    try {
      await client1.query(`UPDATE public.orders SET status = 'refunded' WHERE id = $1;`, [unpaidOrderId]);
    } catch (e) { f3Err = e.message; }
    if (f3Err) {
      throw new Error(`[ASSERTION FAILED] Test F-3: Cancelled → refunded transition must be allowed, got: ${f3Err}`);
    }
    console.log('✔ Assertion F-3 Passed: Cancelled → refunded transition allowed.');

    // F-4: Cancelled order cannot re-open to active states
    let f4Err = null;
    try {
      await client1.query(`UPDATE public.orders SET status = 'processing' WHERE id = $1;`, [unpaidOrderId]);
    } catch (e) { f4Err = e.message; }
    if (!f4Err) {
      throw new Error('[ASSERTION FAILED] Test F-4: Cancelled order must not be able to re-open to processing.');
    }
    console.log('✔ Assertion F-4 Passed: Cancelled → processing transition blocked by trigger.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST G: Physical Return Inspections & Restocking Suite (Option B)
    // Covers:
    // - Missing inspection blocks restocking
    // - Approved inspection allows restocking
    // - Partial returns restore only approved quantities
    // - Duplicate restocking is prevented
    // - Rejected inspection does not restore inventory
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test G: Physical Return Inspections & Restocking (Option B) ---');

    // G-1: Missing inspection blocks restocking
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    const gOrd1Res = await client1.query(`SELECT public.place_order('${addr1}', 'Return test G1', NULL, 'phonepe', 'g-ord1-' + NOW()::text) AS id;`);
    const gOrd1 = gOrd1Res.rows[0].id;
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = $1;`, [gOrd1]);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = $1;`, [gOrd1]);

    // Admin context for return operations
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

    let g1Err = null;
    try {
      await client1.query(`SELECT public.admin_record_refund($1, 'REF-G1', 'Notes provided', true) AS ok;`, [gOrd1]);
    } catch (e) { g1Err = e.message; }
    if (!g1Err || !g1Err.includes('no approved, un-restocked physical return inspection found')) {
      throw new Error(`[ASSERTION FAILED] Test G-1: Missing inspection must block restocking (got error: ${g1Err})`);
    }
    console.log('✔ Assertion G-1 Passed: Missing inspection blocks restocking.');

    // G-2: Approved inspection allows restocking
    const g1ItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = $1 LIMIT 1;`, [gOrd1])).rows[0].id;
    const g1InspId = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 2, 'Customer returned both items') AS id;`, [gOrd1, g1ItemId])).rows[0].id;
    await client1.query(`SELECT public.admin_complete_return_inspection($1, 'passed', 2, 'good', 'Both items intact and verified', false);`, [g1InspId]);

    const stockBeforeG2 = (await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity;
    await client1.query(`SELECT public.admin_record_refund($1, 'REF-G1-APPROVED', 'Physical return approved', true) AS ok;`, [gOrd1]);
    const stockAfterG2 = (await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity;
    if (Number(stockAfterG2) !== Number(stockBeforeG2) + 2) {
      throw new Error(`[ASSERTION FAILED] Test G-2: Approved inspection must restore exact approved quantity (expected +2, got before=${stockBeforeG2}, after=${stockAfterG2})`);
    }
    console.log('✔ Assertion G-2 Passed: Approved inspection allows restocking (+2 units).');

    // G-3: Partial returns restore only approved quantities
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 3);`, [c1, prodId]);
    const gOrd2Res = await client1.query(`SELECT public.place_order('${addr1}', 'Return test G2 partial', NULL, 'phonepe', 'g-ord2-' + NOW()::text) AS id;`);
    const gOrd2 = gOrd2Res.rows[0].id;
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = $1;`, [gOrd2]);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = $1;`, [gOrd2]);

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    const g2ItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = $1 LIMIT 1;`, [gOrd2])).rows[0].id;
    // Customer returned 2 units of 3
    const g2InspId = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 2, 'Customer returned 2 of 3 units') AS id;`, [gOrd2, g2ItemId])).rows[0].id;
    // Admin approves only 1 unit (1 was damaged) -> outcome is 'partially_passed'
    await client1.query(`SELECT public.admin_complete_return_inspection($1, 'partially_passed', 1, 'damaged', '1 unit intact; 1 unit damaged', false);`, [g2InspId]);

    const stockBeforeG3 = (await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity;
    await client1.query(`SELECT public.admin_record_refund($1, 'REF-G2-PARTIAL', 'Partial return restock', true) AS ok;`, [gOrd2]);
    const stockAfterG3 = (await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity;
    if (Number(stockAfterG3) !== Number(stockBeforeG3) + 1) {
      throw new Error(`[ASSERTION FAILED] Test G-3: Partial return must restore ONLY approved quantity (+1, got before=${stockBeforeG3}, after=${stockAfterG3})`);
    }
    console.log('✔ Assertion G-3 Passed: Partial return restores only approved quantity (+1 unit).');

    // G-4: Duplicate restocking must be prevented
    let g4Err = null;
    try {
      await client1.query(`SELECT public.admin_record_refund($1, 'REF-G2-DUP', 'Duplicate restock attempt', true) AS ok;`, [gOrd2]);
    } catch (e) { g4Err = e.message; }
    if (!g4Err) {
      throw new Error('[ASSERTION FAILED] Test G-4: Duplicate restocking via admin_record_refund must be rejected.');
    }

    let g4DirectErr = null;
    try {
      await client1.query(`SELECT public.admin_complete_return_inspection($1, 'partially_passed', 1, 'good', 'Direct duplicate attempt', true);`, [g2InspId]);
    } catch (e) { g4DirectErr = e.message; }
    if (!g4DirectErr) {
      throw new Error('[ASSERTION FAILED] Test G-4: Modifying or restocking an already-restocked inspection must be rejected.');
    }

    const stockAfterG4 = (await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity;
    if (Number(stockAfterG4) !== Number(stockAfterG3)) {
      throw new Error('[ASSERTION FAILED] Test G-4: Inventory must not change after duplicate restock attempts.');
    }
    console.log('✔ Assertion G-4 Passed: Duplicate restocking prevented; inventory unchanged.');

    // G-5: Rejected inspection must not restore inventory
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1);`, [c1, prodId]);
    const gOrd3Res = await client1.query(`SELECT public.place_order('${addr1}', 'Return test G3 rejected', NULL, 'phonepe', 'g-ord3-' + NOW()::text) AS id;`);
    const gOrd3 = gOrd3Res.rows[0].id;
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = $1;`, [gOrd3]);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = $1;`, [gOrd3]);

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    const g3ItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = $1 LIMIT 1;`, [gOrd3])).rows[0].id;
    const g3InspId = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 1, 'Returned damaged unit') AS id;`, [gOrd3, g3ItemId])).rows[0].id;
    await client1.query(`SELECT public.admin_complete_return_inspection($1, 'rejected', 0, 'unusable', 'Item destroyed by customer; unusable', false);`, [g3InspId]);

    const stockBeforeG5 = (await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity;
    let g5RestockErr = null;
    try {
      await client1.query(`SELECT public.admin_record_refund($1, 'REF-G3-REJECTED', 'Attempt to restock rejected item', true) AS ok;`, [gOrd3]);
    } catch (e) { g5RestockErr = e.message; }
    if (!g5RestockErr) {
      throw new Error('[ASSERTION FAILED] Test G-5: Restocking on rejected inspection must be rejected.');
    }

    const stockAfterG5Attempt = (await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity;
    if (Number(stockAfterG5Attempt) !== Number(stockBeforeG5)) {
      throw new Error('[ASSERTION FAILED] Test G-5: Rejected inspection must not alter inventory.');
    }

    // Financial refund without restock succeeds independently
    await client1.query(`SELECT public.admin_record_refund($1, 'REF-G3-COURTESY', 'Courtesy refund without restock', false) AS ok;`, [gOrd3]);
    const g3PayStatus = (await client1.query(`SELECT status FROM public.payments WHERE order_id = $1;`, [gOrd3])).rows[0].status;
    if (g3PayStatus !== 'refunded') {
      throw new Error(`[ASSERTION FAILED] Test G-5: Financial refund must succeed (expected refunded, got ${g3PayStatus})`);
    }
    console.log('✔ Assertion G-5 Passed: Rejected inspection blocked from restocking; financial refund recorded independently.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST H: True Multi-Connection Concurrent Restocking Race
    // Two independent sessions simultaneously call the restocking helper
    // _restock_approved_return_inspections for the exact same order.
    // Row-level locking (FOR UPDATE) must ensure:
    // 1. One transaction acquires the lock and restocks the approved quantity.
    // 2. The second transaction gets 0 (or blocks then sees restocked = TRUE).
    // 3. Inventory increments EXACTLY ONCE (no double restocking).
    // 4. Inspection is marked restocked = TRUE exactly once.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test H: True Multi-Connection Concurrent Restocking Race ---');
    console.log('Testing simultaneous calls to _restock_approved_return_inspections from Session 1 & Session 2...');

    // Setup an order with 2 approved returned units awaiting restock
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2);`, [c1, prodId]);
    const hOrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Concurrent restock race order', NULL, 'phonepe', 'h-race-' + NOW()::text) AS id;`);
    const hOrdId = hOrdRes.rows[0].id;
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = $1;`, [hOrdId]);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = $1;`, [hOrdId]);

    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    const hItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = $1 LIMIT 1;`, [hOrdId])).rows[0].id;
    const hInspId = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 2, 'Customer returned 2 units for concurrent restock test') AS id;`, [hOrdId, hItemId])).rows[0].id;
    await client1.query(`SELECT public.admin_complete_return_inspection($1, 'passed', 2, 'good', 'Both items inspected and passed', false);`, [hInspId]);

    const stockBeforeRaceH = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    // Prepare both clients with admin context
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

    // Executable assertions for Test H
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
    // TEST H2: Concurrent Completion of Different Return Inspections on Same Order
    // (Deadlock-Interleaving Elimination & Isolation Test)
    // 
    // Scenario:
    // Order has multiple return inspections.
    // Client 1: admin_complete_return_inspection(insp1, 'passed', 2, 'good', '...', true)
    // Client 2: admin_complete_return_inspection(insp2, 'passed', 1, 'good', '...', true)
    // 
    // Deadlock Elimination:
    // With Tier 1 Parent Order Lock, both sessions serialize on orders WHERE id = order_id FOR UPDATE.
    // Both complete without deadlock or abort.
    // Each approved quantity is restored exactly once.
    // Ineligible inspection does not restore inventory.
    // Retrying completed inspection is rejected.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test H2: Concurrent Completion of Different Return Inspections on Same Order ---');
    console.log('Testing deadlock-interleaving elimination across multiple inspection completions for the same order...');

    // 1. Setup isolated test order with 4 units purchased
    await client1.query(`UPDATE public.inventory SET quantity = 10 WHERE product_id = $1;`, [prodId]);
    await client1.query(`DELETE FROM public.cart_items WHERE cart_id = $1;`, [c1]);
    await client1.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 4);`, [c1, prodId]);
    const h2OrdRes = await client1.query(`SELECT public.place_order('${addr1}', 'Concurrent inspection completion test order', NULL, 'phonepe', 'h2-order-' || NOW()::text) AS id;`);
    const h2OrdId = h2OrdRes.rows[0].id;
    await client1.query(`UPDATE public.payments SET status = 'completed' WHERE order_id = $1;`, [h2OrdId]);
    await client1.query(`UPDATE public.orders SET status = 'delivered' WHERE id = $1;`, [h2OrdId]);

    const h2ItemId = (await client1.query(`SELECT id FROM public.order_items WHERE order_id = $1 LIMIT 1;`, [h2OrdId])).rows[0].id;

    // Create 3 inspection records:
    // Insp 1: returned 2 units (eligible to be passed)
    // Insp 2: returned 1 unit (eligible to be passed)
    // Insp 3: returned 1 unit (ineligible: will be rejected)
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    const h2Insp1 = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 2, 'Eligible return 1') AS id;`, [h2OrdId, h2ItemId])).rows[0].id;
    const h2Insp2 = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 1, 'Eligible return 2') AS id;`, [h2OrdId, h2ItemId])).rows[0].id;
    const h2Insp3 = (await client1.query(`SELECT public.admin_create_return_inspection($1, $2, 1, 'Ineligible return 3 (damaged)') AS id;`, [h2OrdId, h2ItemId])).rows[0].id;

    const stockBeforeRaceH2 = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);

    // Prepare both clients with admin authentication context
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

    console.log(`Firing simultaneous admin_complete_return_inspection calls on Insp 1 (${h2Insp1}) and Insp 2 (${h2Insp2})...`);
    let h2Res1 = null, h2Err1 = null;
    let h2Res2 = null, h2Err2 = null;

    const pH2Race1 = client1.query(
      `SELECT public.admin_complete_return_inspection($1, 'passed', 2, 'good', 'Insp 1 passed QC', true) AS result;`,
      [h2Insp1]
    ).then(r => { h2Res1 = r.rows[0].result; })
     .catch(e => { h2Err1 = e.message; });

    const pH2Race2 = client2.query(
      `SELECT public.admin_complete_return_inspection($1, 'passed', 1, 'good', 'Insp 2 passed QC', true) AS result;`,
      [h2Insp2]
    ).then(r => { h2Res2 = r.rows[0].result; })
     .catch(e => { h2Err2 = e.message; });

    await Promise.all([pH2Race1, pH2Race2]);

    console.log(`Session 1 Result: ${h2Err1 ? 'Error: ' + h2Err1 : JSON.stringify(h2Res1)}`);
    console.log(`Session 2 Result: ${h2Err2 ? 'Error: ' + h2Err2 : JSON.stringify(h2Res2)}`);

    // Verify neither session suffered deadlock or unexpected abort
    if (h2Err1) {
      throw new Error(`[ASSERTION FAILED] Test H2: Session 1 failed with unexpected error: ${h2Err1}`);
    }
    if (h2Err2) {
      throw new Error(`[ASSERTION FAILED] Test H2: Session 2 failed with unexpected error: ${h2Err2}`);
    }
    console.log('✔ Assertion H2-1 Passed: Both concurrent inspection completions succeeded cleanly without deadlock or abort.');

    // Verify each approved quantity was restored exactly once (2 + 1 = +3)
    const stockAfterRaceH2 = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    if (stockAfterRaceH2 !== stockBeforeRaceH2 + 3) {
      throw new Error(`[ASSERTION FAILED] Test H2: Inventory must increase by exactly 3 (expected ${stockBeforeRaceH2 + 3}, got ${stockAfterRaceH2})`);
    }
    console.log('✔ Assertion H2-2 Passed: Inventory increased by exact combined approved quantity (+3 units). Each approved quantity restored exactly once.');

    // Verify both inspections are marked restocked = TRUE with timestamps
    const rowInsp1 = (await client1.query(`SELECT restocked, restocked_at, inspection_outcome, approved_quantity FROM public.physical_return_inspections WHERE id = $1;`, [h2Insp1])).rows[0];
    const rowInsp2 = (await client1.query(`SELECT restocked, restocked_at, inspection_outcome, approved_quantity FROM public.physical_return_inspections WHERE id = $1;`, [h2Insp2])).rows[0];

    if (rowInsp1.restocked !== true || !rowInsp1.restocked_at || rowInsp1.approved_quantity !== 2) {
      throw new Error(`[ASSERTION FAILED] Test H2: Inspection 1 must be marked restocked=true with approved_quantity=2`);
    }
    if (rowInsp2.restocked !== true || !rowInsp2.restocked_at || rowInsp2.approved_quantity !== 1) {
      throw new Error(`[ASSERTION FAILED] Test H2: Inspection 2 must be marked restocked=true with approved_quantity=1`);
    }
    console.log('✔ Assertion H2-3 Passed: Both inspection records deterministically updated and marked restocked = true.');

    // Verify ineligible inspection (Insp 3) does NOT restore inventory
    const stockBeforeIneligible = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    await client1.query(
      `SELECT public.admin_complete_return_inspection($1, 'rejected', 0, 'unusable', 'Damaged goods: rejected', true);`,
      [h2Insp3]
    );
    const stockAfterIneligible = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    if (stockAfterIneligible !== stockBeforeIneligible) {
      throw new Error(`[ASSERTION FAILED] Test H2: Ineligible (rejected) inspection must NOT restore inventory (stock changed from ${stockBeforeIneligible} to ${stockAfterIneligible})`);
    }
    const rowInsp3 = (await client1.query(`SELECT restocked, inspection_outcome, approved_quantity FROM public.physical_return_inspections WHERE id = $1;`, [h2Insp3])).rows[0];
    if (rowInsp3.restocked !== false || rowInsp3.approved_quantity !== 0 || rowInsp3.inspection_outcome !== 'rejected') {
      throw new Error(`[ASSERTION FAILED] Test H2: Ineligible inspection must remain restocked=false with approved_quantity=0`);
    }
    console.log('✔ Assertion H2-4 Passed: Ineligible (rejected) inspection did not restore inventory and remains restocked = false.');

    // Verify retrying an already completed inspection cannot restore inventory again
    let retryErr = null;
    try {
      await client1.query(
        `SELECT public.admin_complete_return_inspection($1, 'passed', 2, 'good', 'Attempting duplicate completion', true);`,
        [h2Insp1]
      );
    } catch (e) {
      retryErr = e.message;
    }
    if (!retryErr || !retryErr.includes('already been restocked')) {
      throw new Error(`[ASSERTION FAILED] Test H2: Retrying already completed inspection must be rejected with 'already been restocked' (got: ${retryErr})`);
    }
    const stockAfterRetry = Number((await client1.query(`SELECT quantity FROM public.inventory WHERE product_id = $1;`, [prodId])).rows[0].quantity);
    if (stockAfterRetry !== stockAfterIneligible) {
      throw new Error(`[ASSERTION FAILED] Test H2: Retrying completed inspection must NOT alter inventory`);
    }
    console.log('✔ Assertion H2-5 Passed: Duplicate completion of already-restocked inspection strictly rejected with zero inventory modification.');

    console.log('\n=================================================================');
    console.log('TRUE MULTI-CONNECTION CONCURRENCY TESTS: ALL ASSERTIONS PASSED!');
    console.log('Tests A, B, C, D, E, F, G, H, H2 complete.');
    console.log('=================================================================');
    return { verified: true };
  } finally {
    await client1.end().catch(() => {});
    await client2.end().catch(() => {});
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
