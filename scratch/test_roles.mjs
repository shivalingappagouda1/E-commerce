import { createRequire } from 'module';
const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testRoles() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE test_tab (id INT PRIMARY KEY, name TEXT);
    ALTER TABLE test_tab ENABLE ROW LEVEL SECURITY;
    ALTER TABLE test_tab FORCE ROW LEVEL SECURITY;
    GRANT SELECT ON test_tab TO authenticated;

    SET ROLE authenticated;
    SELECT current_user, session_user;
    RESET ROLE;
  `);
  console.log('Roles work in PGlite!');
}

testRoles().catch(console.error);
