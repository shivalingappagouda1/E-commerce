import fs from 'fs';
import crypto from 'crypto';

const files = [
  'supabase/phase-9.2/migration.sql',
  'supabase/phase-9.2/rollback.sql',
  'supabase/phase-9.2/verification.sql',
  'supabase/phase-9.2/README.md',
  'supabase/phase-9.2/security-audit.md'
];

console.log('=== EXACT HASHES AND STATS FOR PHASE 9.2 PACKAGE ===');
files.forEach(f => {
  const content = fs.readFileSync(f);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const text = content.toString('utf8');
  const lines = text.split(/\r?\n/).length;
  console.log(`Path: ${f}`);
  console.log(`  Lines: ${lines}`);
  console.log(`  Bytes: ${content.length}`);
  console.log(`  SHA256: ${hash}`);
});
