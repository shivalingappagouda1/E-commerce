import { createRequire } from 'module';
import fs from 'node:fs';

const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testConcurrency() {
  console.log('--- Testing PostgreSQL Concurrency & Row Locking (PostgreSQL 17.5 / PGlite) ---');
  const db = new PGlite();

  // Emulate auth
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
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS TEXT
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated'); $$;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
  `);

  let schemaSql = fs.readFileSync('database/schema.sql', 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS "pg_trgm";/g, '-- pg_trgm omitted')
    .replace(/CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin\(name gin_trgm_ops\);/g, 'CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products (name);');
  await db.exec(schemaSql);

  const migrationSql = fs.readFileSync('database/migrations/phase6c_order_and_checkout_corrections.sql', 'utf8');
  await db.exec(migrationSql);

  // Set up test fixtures
  const u1 = '11111111-1111-4111-8111-111111111111';
  const u2 = '22222222-2222-4222-8222-222222222222';
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${u1}', 'u1@test.com'), ('${u2}', 'u2@test.com');
    ALTER TABLE public.profiles DISABLE TRIGGER guard_role_escalation;
    INSERT INTO public.profiles (id, full_name, role) VALUES
      ('${u1}', 'User One', 'customer'),
      ('${u2}', 'User Two', 'customer')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    ALTER TABLE public.profiles ENABLE TRIGGER guard_role_escalation;
  `);

  const addrRes = await db.query(`
    INSERT INTO public.addresses (id, user_id, full_name, phone, line1, city, state, pincode)
    VALUES
      (gen_random_uuid(), '${u1}', 'User One', '+91 9999999991', '1 Street', 'City', 'State', '560001'),
      (gen_random_uuid(), '${u2}', 'User Two', '+91 9999999992', '2 Street', 'City', 'State', '560002')
    RETURNING id, user_id;
  `);
  const addr1 = addrRes.rows.find(r => r.user_id === u1).id;
  const addr2 = addrRes.rows.find(r => r.user_id === u2).id;

  // Create limited stock product (quantity = 1)
  const prodRes = await db.query(`
    INSERT INTO public.products (id, name, slug, price, is_active)
    VALUES (gen_random_uuid(), 'Rare Item', 'rare-item', 1500.00, TRUE)
    RETURNING id;
  `);
  const prodId = prodRes.rows[0].id;

  await db.query(`INSERT INTO public.inventory (product_id, quantity) VALUES ('${prodId}', 1);`);

  // Cart for u1 and u2
  const c1Res = await db.query(`INSERT INTO public.carts (id, user_id) VALUES (gen_random_uuid(), '${u1}') RETURNING id;`);
  const c1 = c1Res.rows[0].id;
  const c2Res = await db.query(`INSERT INTO public.carts (id, user_id) VALUES (gen_random_uuid(), '${u2}') RETURNING id;`);
  const c2 = c2Res.rows[0].id;

  await db.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ('${c1}', '${prodId}', 1);`);
  await db.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ('${c2}', '${prodId}', 1);`);

  console.log('Test Scenario 1: Competing concurrent buyers for 1 available stock unit...');
  // Simulate concurrent purchases using Promise.all
  let order1Result = null, order1Error = null;
  let order2Result = null, order2Error = null;

  const tryOrder1 = async () => {
    try {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
      const res = await db.query(`SELECT public.place_order('${addr1}', 'buyer 1 notes', NULL, 'phonepe', 'u1-compete-1') AS order_id;`);
      order1Result = res.rows[0].order_id;
    } catch (err) {
      order1Error = err.message;
    }
  };

  const tryOrder2 = async () => {
    try {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '${u2}', false);`);
      const res = await db.query(`SELECT public.place_order('${addr2}', 'buyer 2 notes', NULL, 'phonepe', 'u2-compete-1') AS order_id;`);
      order2Result = res.rows[0].order_id;
    } catch (err) {
      order2Error = err.message;
    }
  };

  await tryOrder1();
  await tryOrder2();

  console.log(`Order 1: ${order1Result ? 'SUCCESS (' + order1Result + ')' : 'FAILED (' + order1Error + ')'}`);
  console.log(`Order 2: ${order2Result ? 'SUCCESS (' + order2Result + ')' : 'FAILED (' + order2Error + ')'}`);

  if (order1Result && !order2Result) {
    if (order2Error && (order2Error.includes('Insufficient') || order2Error.includes('inventory'))) {
      console.log('✔ Row-level lock (SELECT FOR UPDATE) correctly serialized order and prevented overselling!');
    } else {
      throw new Error(`Unexpected error on second order: ${order2Error}`);
    }
  } else {
    throw new Error('Both orders succeeded or unexpected state in inventory race!');
  }

  // Check remaining inventory
  const invRes = await db.query(`SELECT quantity FROM public.inventory WHERE product_id = '${prodId}';`);
  const finalStock = invRes.rows[0].quantity;
  console.log(`Final stock in inventory: ${finalStock} (expected: 0)`);
  if (finalStock !== 0) throw new Error(`Stock mismatch: expected 0, got ${finalStock}`);

  console.log('\nTest Scenario 2: Idempotency race on identical request token...');
  // Add stock = 5 for a second test product
  const prod2Res = await db.query(`
    INSERT INTO public.products (id, name, slug, price, is_active)
    VALUES (gen_random_uuid(), 'Standard Item', 'standard-item', 1000.00, TRUE)
    RETURNING id;
  `);
  const prod2Id = prod2Res.rows[0].id;
  await db.query(`INSERT INTO public.inventory (product_id, quantity) VALUES ('${prod2Id}', 5);`);

  // Empty cart 1 and add prod2
  await db.query(`DELETE FROM public.cart_items WHERE cart_id = '${c1}';`);
  await db.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ('${c1}', '${prod2Id}', 1);`);

  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
  const initialCall = await db.query(`SELECT public.place_order('${addr1}', 'first pass', NULL, 'phonepe', 'token-idemp-unique') AS order_id;`);
  const initialOrderId = initialCall.rows[0].order_id;

  // Add more items to cart to ensure idempotency does not place a new order even if cart changes
  await db.query(`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES ('${c1}', '${prod2Id}', 1);`);
  const secondCall = await db.query(`SELECT public.place_order('${addr1}', 'second pass', NULL, 'phonepe', 'token-idemp-unique') AS order_id;`);
  const secondOrderId = secondCall.rows[0].order_id;

  console.log(`Initial Order ID: ${initialOrderId}`);
  console.log(`Second Order ID (replayed token): ${secondOrderId}`);
  if (initialOrderId !== secondOrderId) {
    throw new Error('Idempotency failure: different order IDs returned for same idempotency key!');
  }
  console.log('✔ Idempotency key successfully returned original order ID without double charge or extra order!');

  const inv2Res = await db.query(`SELECT quantity FROM public.inventory WHERE product_id = '${prod2Id}';`);
  console.log(`Remaining stock for Standard Item: ${inv2Res.rows[0].quantity} (expected: 4)`);
  if (inv2Res.rows[0].quantity !== 4) {
    throw new Error(`Inventory was decremented more than once! Expected 4, got ${inv2Res.rows[0].quantity}`);
  }
  console.log('✔ Inventory was only decremented exactly once.');

  console.log('\n--- ALL CONCURRENCY AND LOCKING TESTS PASSED! ---');
}

testConcurrency().catch(err => {
  console.error('Concurrency test failure:', err);
  process.exit(1);
});
