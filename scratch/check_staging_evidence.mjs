import fs from 'fs';

if (fs.existsSync('database/tests/phase9_pre_migration_export.sql')) {
  const c = fs.readFileSync('database/tests/phase9_pre_migration_export.sql', 'utf8');
  console.log('=== phase9_pre_migration_export.sql preview ===');
  console.log(c.slice(0, 1000));
}

if (fs.existsSync('supabase/phase-9.2/security-audit.md')) {
  const c = fs.readFileSync('supabase/phase-9.2/security-audit.md', 'utf8');
  console.log('\n=== supabase/phase-9.2/security-audit.md preview ===');
  console.log(c.slice(0, 1200));
}
