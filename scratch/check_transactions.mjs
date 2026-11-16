import fs from 'fs';
import path from 'path';

const dirs = ['database/migrations', 'supabase/phase-9.2', 'supabase/phase-9.2/review'];

console.log('=== 2. TRANSACTION WRAPPER INVENTORY ===');

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    if (!file.endsWith('.sql')) return;
    const fullPath = path.join(dir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Check for BEGIN and COMMIT
    const hasBegin = /\bBEGIN\s*;/i.test(content) || /\bBEGIN\b/i.test(content);
    const hasCommit = /\bCOMMIT\s*;/i.test(content);
    const hasRollback = /\bROLLBACK\s*;/i.test(content);
    
    // Check if DO $$ BEGIN ... END $$ is confusing simple regex
    // A top-level transaction is typically BEGIN; ... COMMIT;
    const topLevelBegin = /^\s*BEGIN\s*;/im.test(content);
    const topLevelCommit = /^\s*COMMIT\s*;/im.test(content);
    
    console.log(`${fullPath}: TopLevelBegin=${topLevelBegin}, TopLevelCommit=${topLevelCommit}, RawBegin=${hasBegin}, RawCommit=${hasCommit}`);
  });
});
