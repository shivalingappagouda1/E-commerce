import fs from 'fs';
import path from 'path';

const dir = 'database/migrations';
const files = fs.readdirSync(dir);

files.forEach(f => {
  if (!f.endsWith('.sql')) return;
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  const lines = content.split(/\r?\n/);
  console.log(`\n=== FILE: ${f} ===`);
  lines.forEach((line, idx) => {
    if (line.match(/CREATE (?:OR REPLACE )?FUNCTION/i)) {
      console.log(`  Func Line ${idx + 1}: ${line.trim()}`);
    }
    if (line.match(/CREATE TRIGGER/i)) {
      console.log(`  Trigger Line ${idx + 1}: ${line.trim()}`);
    }
    if (line.match(/CREATE POLICY/i)) {
      console.log(`  Policy Line ${idx + 1}: ${line.trim()}`);
    }
    if (line.match(/CREATE TABLE/i)) {
      console.log(`  Table Line ${idx + 1}: ${line.trim()}`);
    }
  });
});
