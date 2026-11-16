import { createRequire } from 'module';
const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  await db.exec(`
    CREATE OR REPLACE FUNCTION test_fn()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
    BEGIN
    END;
    $$;
  `);

  const res = await db.query(`
    SELECT proname, prosecdef, proconfig,
           proconfig @> ARRAY['search_path='] AS test1,
           proconfig @> ARRAY['search_path=""'] AS test2,
           proconfig @> ARRAY['search_path='''] AS test3
    FROM pg_proc WHERE proname = 'test_fn';
  `);
  console.log('Result:', res.rows[0]);
}

main().catch(console.error);
