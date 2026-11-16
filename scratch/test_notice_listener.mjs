import { createRequire } from 'module';
const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testAssertionFailure() {
  const db = new PGlite();
  try {
    await db.exec(`
      DO $$
      BEGIN
        ASSERT 1 = 2, 'Value 1 must equal 2';
      END $$;
    `);
    console.log('UNEXPECTED: Assertion passed!');
  } catch (err) {
    console.log('EXPECTED FAILURE CAUGHT:');
    console.log('Error message:', err.message);
    console.log('Error code:', err.code);
  }
}

testAssertionFailure().catch(console.error);
