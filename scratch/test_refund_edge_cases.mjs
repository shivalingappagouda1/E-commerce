import { createRequire } from 'module';
import fs from 'node:fs';

const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testRefundEdgeCases() {
  console.log('Testing admin_record_refund edge cases: Missing inventory & Repeated lines...');
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

  const uId = '11111111-1111-4111-8111-111111111111';
  const adminId = '33333333-3333-4333-8333-333333333333';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${uId}', 'u@test.com'), ('${adminId}', 'admin@test.com');
    ALTER TABLE public.profiles DISABLE TRIGGER guard_role_escalation;
    INSERT INTO public.profiles (id, full_name, role) VALUES
      ('${uId}', 'User', 'customer'),
      ('${adminId}', 'Admin', 'admin')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    ALTER TABLE public.profiles ENABLE TRIGGER guard_role_escalation;
  `);

  // Product A with inventory
  const prodA = (await db.query(`INSERT INTO public.products (id, name, slug, price, is_active) VALUES (gen_random_uuid(), 'Product A', 'prod-a', 500, TRUE) RETURNING id;`)).rows[0].id;
  await db.query(`INSERT INTO public.inventory (product_id, quantity) VALUES ('${prodA}', 10);`);

  // Product B WITHOUT inventory row
  const prodB = (await db.query(`INSERT INTO public.products (id, name, slug, price, is_active) VALUES (gen_random_uuid(), 'Product B', 'prod-b', 500, TRUE) RETURNING id;`)).rows[0].id;

  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);

  // Test Case 1: Missing inventory row causes transaction rollback
  const ordMissing = (await db.query(`INSERT INTO public.orders (id, user_id, status, subtotal, total_amount) VALUES (gen_random_uuid(), '${uId}', 'cancelled', 500, 500) RETURNING id;`)).rows[0].id;
  await db.exec(`
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES ('${ordMissing}', '${prodB}', 'Product B', 1, 500, 500);

    INSERT INTO public.payments (id, order_id, provider, amount, status)
    VALUES (gen_random_uuid(), '${ordMissing}', 'phonepe', 500, 'completed');
  `);

  let missingInventoryBlocked = false;
  try {
    await db.query(`SELECT public.admin_record_refund('${ordMissing}', 'REF-FAIL', 'Missing inv row', TRUE);`);
  } catch (err) {
    missingInventoryBlocked = true;
    console.log('✔ Missing inventory row correctly raised exception:', err.message);
  }
  if (!missingInventoryBlocked) throw new Error('Missing inventory row did not raise exception!');

  // Verify rollback: payment status remains completed, order status remains cancelled
  const payCheck = await db.query(`SELECT status FROM public.payments WHERE order_id = '${ordMissing}';`);
  const ordCheck = await db.query(`SELECT status FROM public.orders WHERE id = '${ordMissing}';`);
  console.log(`Payment status after rollback: ${payCheck.rows[0].status} (expected: completed)`);
  console.log(`Order status after rollback: ${ordCheck.rows[0].status} (expected: cancelled)`);
  if (payCheck.rows[0].status !== 'completed' || ordCheck.rows[0].status !== 'cancelled') {
    throw new Error('Transaction rollback failed: payment or order status was changed despite exception!');
  }
  console.log('✔ Transaction was cleanly rolled back on missing inventory.');

  // Test Case 2: Repeated order lines for the same product correctly consolidated
  const ordMulti = (await db.query(`INSERT INTO public.orders (id, user_id, status, subtotal, total_amount) VALUES (gen_random_uuid(), '${uId}', 'cancelled', 1500, 1500) RETURNING id;`)).rows[0].id;
  await db.exec(`
    -- Two lines for same product: qty 2 and qty 1
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES
      ('${ordMulti}', '${prodA}', 'Product A line 1', 2, 500, 1000),
      ('${ordMulti}', '${prodA}', 'Product A line 2', 1, 500, 500);

    INSERT INTO public.payments (id, order_id, provider, amount, status)
    VALUES (gen_random_uuid(), '${ordMulti}', 'phonepe', 1500, 'completed');
  `);

  await db.query(`SELECT public.admin_record_refund('${ordMulti}', 'REF-MULTI-LINE', 'Physical return of multi-line', TRUE);`);
  const invMulti = await db.query(`SELECT quantity FROM public.inventory WHERE product_id = '${prodA}';`);
  console.log(`Stock after multi-line restock: ${invMulti.rows[0].quantity} (expected: 10 + 2 + 1 = 13)`);
  if (invMulti.rows[0].quantity !== 13) {
    throw new Error(`Multi-line consolidation failed! Expected 13, got ${invMulti.rows[0].quantity}`);
  }
  console.log('✔ Multi-line order items consolidated and restocked correctly (10 + 3 = 13).');

  console.log('\n--- ALL REFUND EDGE CASES PASSED! ---');
}

testRefundEdgeCases().catch(console.error);
