import { createRequire } from 'module';
import fs from 'node:fs';

const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testRefundRestock() {
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

  // Create product with stock = 10
  const prodRes = await db.query(`
    INSERT INTO public.products (id, name, slug, price, is_active)
    VALUES (gen_random_uuid(), 'Restock Test Product', 'restock-test', 500, TRUE)
    RETURNING id;
  `);
  const prodId = prodRes.rows[0].id;
  await db.query(`INSERT INTO public.inventory (product_id, quantity) VALUES ('${prodId}', 10);`);

  // Order 1: Test restock_inventory = FALSE
  const ord1Res = await db.query(`
    INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
    VALUES (gen_random_uuid(), '${uId}', 'cancelled', 1000, 1000)
    RETURNING id;
  `);
  const ord1Id = ord1Res.rows[0].id;

  await db.exec(`
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES ('${ord1Id}', '${prodId}', 'Restock Test Product', 2, 500, 1000);

    INSERT INTO public.payments (id, order_id, provider, amount, status)
    VALUES (gen_random_uuid(), '${ord1Id}', 'phonepe', 1000, 'completed');
  `);

  console.log('Testing admin_record_refund with restock_inventory = FALSE...');
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
  await db.query(`SELECT public.admin_record_refund('${ord1Id}', 'REF-NO-RESTOCK', 'No physical return', FALSE);`);

  const inv1 = await db.query(`SELECT quantity FROM public.inventory WHERE product_id = '${prodId}';`);
  console.log('Stock after restock_inventory = FALSE:', inv1.rows[0].quantity, '(expected: 10)');
  if (inv1.rows[0].quantity !== 10) throw new Error('Stock changed when restock_inventory = FALSE!');

  // Order 2: Test restock_inventory = TRUE
  const ord2Res = await db.query(`
    INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
    VALUES (gen_random_uuid(), '${uId}', 'cancelled', 1500, 1500)
    RETURNING id;
  `);
  const ord2Id = ord2Res.rows[0].id;

  await db.exec(`
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES ('${ord2Id}', '${prodId}', 'Restock Test Product', 3, 500, 1500);

    INSERT INTO public.payments (id, order_id, provider, amount, status)
    VALUES (gen_random_uuid(), '${ord2Id}', 'phonepe', 1500, 'completed');
  `);

  console.log('Testing admin_record_refund with restock_inventory = TRUE...');
  await db.query(`SELECT public.admin_record_refund('${ord2Id}', 'REF-PHYSICAL-RESTOCK', 'Physical items inspected and restocked', TRUE);`);

  const inv2 = await db.query(`SELECT quantity FROM public.inventory WHERE product_id = '${prodId}';`);
  console.log('Stock after restock_inventory = TRUE:', inv2.rows[0].quantity, '(expected: 13)');
  if (inv2.rows[0].quantity !== 13) throw new Error('Stock was not restocked by item quantity (expected 13)!');

  // Test repeat refund attempt
  let repeatBlocked = false;
  try {
    await db.query(`SELECT public.admin_record_refund('${ord2Id}', 'REF-REPEAT', 'Duplicate attempt', TRUE);`);
  } catch (err) {
    repeatBlocked = true;
    console.log('✔ Duplicate refund blocked:', err.message);
  }
  if (!repeatBlocked) throw new Error('Duplicate refund was not blocked!');

  const inv3 = await db.query(`SELECT quantity FROM public.inventory WHERE product_id = '${prodId}';`);
  console.log('Stock after failed duplicate refund:', inv3.rows[0].quantity, '(expected: 13)');
  if (inv3.rows[0].quantity !== 13) throw new Error('Stock changed on duplicate refund attempt!');

  console.log('\n--- ALL REFUND RESTOCKING TESTS PASSED! ---');
}

testRefundRestock().catch(console.error);
