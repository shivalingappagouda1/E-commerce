import { createRequire } from 'module';
const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testAssertCatch() {
  const db = new PGlite();
  await db.exec(`
    DO $$
    DECLARE
      v_caught BOOLEAN := FALSE;
    BEGIN
      BEGIN
        ASSERT 1 = 2, 'testing assert';
      EXCEPTION WHEN assert_failure THEN
        v_caught := TRUE;
      END;
      RAISE NOTICE 'Caught assert: %', v_caught;
    END $$;
  `);
  console.log('Finished catching assert');
}

testAssertCatch().catch(console.error);
