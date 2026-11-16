import { createRequire } from 'module';
const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE _test_results (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT
    );
  `);
  console.log('Results table created');
}
main();
