import { createRequire } from 'module';
import fs from 'node:fs';

const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testRlsSuite() {
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

  // Set up users and submissions
  const u1 = '11111111-1111-4111-8111-111111111111';
  const u2 = '22222222-2222-4222-8222-222222222222';
  const adminId = '33333333-3333-4333-8333-333333333333';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${u1}', 'u1@test.com'),
      ('${u2}', 'u2@test.com'),
      ('${adminId}', 'admin@test.com');

    ALTER TABLE public.profiles DISABLE TRIGGER guard_role_escalation;
    INSERT INTO public.profiles (id, full_name, role) VALUES
      ('${u1}', 'User One', 'customer'),
      ('${u2}', 'User Two', 'customer'),
      ('${adminId}', 'Admin', 'admin')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    ALTER TABLE public.profiles ENABLE TRIGGER guard_role_escalation;

    -- Create order for u1 and order for u2
    INSERT INTO public.orders (id, user_id, status, subtotal, total_amount) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '${u1}', 'pending', 500, 599),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${u2}', 'pending', 500, 599);

    -- Create payments
    INSERT INTO public.payments (id, order_id, provider, amount, status) VALUES
      ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'phonepe', 599, 'pending'),
      ('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'phonepe', 599, 'pending');

    -- Insert submissions directly (as superuser/service_role setup)
    INSERT INTO public.payment_submissions (id, order_id, payment_id, user_id, utr_number, status) VALUES
      (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '${u1}', 'UTR-USER1', 'submitted'),
      (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${u2}', 'UTR-USER2', 'submitted');
  `);

  console.log('Testing under SET ROLE authenticated (Customer 1)...');
  await db.exec(`
    SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '${u1}', false);
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
  `);

  const u1Rows = await db.query('SELECT * FROM public.payment_submissions;');
  console.log('Customer 1 visible submissions count:', u1Rows.rows.length);
  if (u1Rows.rows.length !== 1 || u1Rows.rows[0].utr_number !== 'UTR-USER1') {
    throw new Error('RLS isolation failed: Customer 1 saw wrong rows!');
  }
  console.log('✔ Customer 1 correctly isolated to only their own submission.');

  // Test direct INSERT rejection under SET ROLE authenticated
  let insertBlocked = false;
  try {
    await db.exec(`
      INSERT INTO public.payment_submissions (id, order_id, utr_number, status)
      VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'HACK-UTR', 'submitted');
    `);
  } catch (err) {
    insertBlocked = true;
    console.log('✔ Direct INSERT by authenticated user blocked:', err.message);
  }
  if (!insertBlocked) throw new Error('Direct INSERT was not blocked!');

  // Test direct UPDATE rejection under SET ROLE authenticated
  let updateBlocked = false;
  try {
    await db.exec(`UPDATE public.payment_submissions SET status = 'approved';`);
  } catch (err) {
    updateBlocked = true;
    console.log('✔ Direct UPDATE by authenticated user blocked:', err.message);
  }
  if (!updateBlocked) throw new Error('Direct UPDATE was not blocked!');

  // Test direct DELETE rejection under SET ROLE authenticated
  let deleteBlocked = false;
  try {
    await db.exec(`DELETE FROM public.payment_submissions;`);
  } catch (err) {
    deleteBlocked = true;
    console.log('✔ Direct DELETE by authenticated user blocked:', err.message);
  }
  if (!deleteBlocked) throw new Error('Direct DELETE was not blocked!');

  // Switch to Administrator
  console.log('\nTesting under SET ROLE authenticated (Administrator)...');
  await db.exec(`
    SELECT set_config('request.jwt.claim.sub', '${adminId}', false);
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
  `);
  const adminRows = await db.query('SELECT * FROM public.payment_submissions;');
  console.log('Admin visible submissions count:', adminRows.rows.length);
  if (adminRows.rows.length !== 2) {
    throw new Error('RLS admin policy failed: Admin did not see all submissions!');
  }
  console.log('✔ Admin correctly sees all submissions across customers.');

  // Switch to Anon
  console.log('\nTesting under SET ROLE anon...');
  await db.exec(`
    SET ROLE anon;
    SELECT set_config('request.jwt.claim.sub', '', false);
    SELECT set_config('request.jwt.claim.role', 'anon', false);
  `);
  let anonBlocked = false;
  let anonRows = null;
  try {
    anonRows = await db.query('SELECT * FROM public.payment_submissions;');
  } catch (err) {
    anonBlocked = true;
    console.log('✔ Anon query blocked or rejected:', err.message);
  }
  if (!anonBlocked) {
    if (!anonRows || anonRows.rows.length !== 0) {
      throw new Error(`RLS failure: Anon was able to read ${anonRows?.rows?.length} rows!`);
    }
    console.log('✔ Anon query returned 0 rows (RLS restricted).');
  }

  // Reset role
  await db.exec('RESET ROLE;');
  console.log('\n--- ALL ROLE AND RLS ENFORCEMENT TESTS PASSED! ---');
}

testRlsSuite().catch(console.error);
