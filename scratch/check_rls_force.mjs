import fs from 'fs';

const schema = fs.readFileSync('database/schema.sql', 'utf8');

// Check ALTER TABLE ... ENABLE ROW LEVEL SECURITY
const rlsMatches = [...schema.matchAll(/ALTER TABLE\s+([a-zA-Z0-9_\.]+)\s+ENABLE ROW LEVEL SECURITY/gi)];
console.log('Tables with ENABLE RLS in schema.sql:', rlsMatches.length);
rlsMatches.forEach(m => console.log('  ', m[1]));

// Check FORCE ROW LEVEL SECURITY
const forceMatches = [...schema.matchAll(/ALTER TABLE\s+([a-zA-Z0-9_\.]+)\s+FORCE ROW LEVEL SECURITY/gi)];
console.log('\nTables with FORCE RLS in schema.sql:', forceMatches.length);
forceMatches.forEach(m => console.log('  ', m[1]));
