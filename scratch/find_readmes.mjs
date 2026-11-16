import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function findFiles(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, name);
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      const content = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const lines = content.toString('utf8').split(/\r?\n/).length;
      console.log(`${fullPath}: lines=${lines}, bytes=${content.length}, sha=${hash}`);
    }
  }
}

console.log('=== security-audit.md files ===');
findFiles('.', 'security-audit.md');

console.log('\n=== README.md files in supabase ===');
findFiles('supabase', 'README.md');
