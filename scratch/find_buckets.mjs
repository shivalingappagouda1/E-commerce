import fs from 'fs';

const m = fs.readFileSync('supabase/phase-9.2/migration.sql', 'utf8');
const lines = m.split(/\r?\n/);
lines.forEach((l, i) => {
  if (l.includes('storage.buckets')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
