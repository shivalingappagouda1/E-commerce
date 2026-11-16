import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

function getFileHashAndLines(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  const lines = content.split(/\r?\n/).length;
  return { path: filePath, lines, hash, size: Buffer.byteLength(content, 'utf8') };
}

// 1. Files in supabase/phase-9.2 and database/migrations
const filesToCheck = [
  'supabase/phase-9.2/migration.sql',
  'supabase/phase-9.2/rollback.sql',
  'supabase/phase-9.2/verification.sql',
  'supabase/phase-9.2/review/verification.sql',
  'supabase/phase-9.2/review/snapshot_compatibility_check.sql',
  'database/migrations/phase9_2_function_security_hardening.sql',
  'database/migrations/phase9_2_storage_hardening.sql',
  'database/migrations/phase9_2_function_rollback.sql',
  'database/migrations/phase9_2_storage_rollback.sql'
];

console.log('=== 1. FILE HASHES AND LINE COUNTS ===');
filesToCheck.forEach(f => {
  const info = getFileHashAndLines(f);
  if (info) {
    console.log(`${f}: Lines=${info.lines}, Bytes=${info.size}, SHA256=${info.hash}`);
  } else {
    console.log(`${f}: NOT FOUND`);
  }
});
