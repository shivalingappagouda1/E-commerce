import fs from 'fs';

const content = fs.readFileSync('supabase/phase-9.2/migration.sql', 'utf8');
const lines = content.split(/\r?\n/);
lines.forEach((l, i) => {
  if (l.match(/CREATE (?:OR REPLACE )?FUNCTION/i) || l.match(/CREATE POLICY/i) || l.match(/REVOKE|GRANT/i)) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
