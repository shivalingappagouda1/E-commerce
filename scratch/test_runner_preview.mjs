import { createRequire } from 'module';
import fs from 'node:fs';

const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testRunner() {
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

  const testSql = fs.readFileSync('database/tests/phase6c_sql_tests.sql', 'utf8');
  await db.exec(testSql);

  console.log('Execution completed successfully.');
}

testRunner().catch(console.error);
