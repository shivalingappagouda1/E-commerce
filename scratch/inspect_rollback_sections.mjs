import fs from 'fs';

const rollback = fs.readFileSync('supabase/phase-9.2/rollback.sql', 'utf8');
const lines = rollback.split(/\r?\n/);

console.log('=== SECTION 2 IN ROLLBACK.SQL ===');
// Find section 2
let s2Start = -1, s2End = -1;
let s64Start = -1, s64End = -1;

lines.forEach((l, idx) => {
  if (l.includes('SECTION 2:')) s2Start = idx;
  if (l.includes('SECTION 3:')) s2End = idx;
  if (l.includes('6.4') || l.includes('STORAGE POLICY RESTORATION')) s64Start = idx;
  if (l.includes('6.5') || l.includes('SECTION 7:')) s64End = idx;
});

console.log(`Section 2 lines: ${s2Start + 1} to ${s2End + 1}`);
console.log(lines.slice(s2Start, s2Start + 100).join('\n'));

console.log('\n=== SECTION 6.4 IN ROLLBACK.SQL ===');
console.log(`Section 6.4 lines: ${s64Start + 1} to ${s64End + 1}`);
console.log(lines.slice(s64Start, s64Start + 80).join('\n'));
