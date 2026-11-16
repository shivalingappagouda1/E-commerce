import fs from 'fs';
import path from 'path';

const dir = 'database/migrations';
const files = fs.readdirSync(dir).sort();

files.forEach(f => {
  if (!f.endsWith('.sql')) return;
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  const lines = content.split(/\r?\n/);
  console.log(`\n============================= ${f} (${lines.length} lines) =============================`);
  console.log(lines.slice(0, 25).join('\n'));
});
