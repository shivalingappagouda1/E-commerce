import fs from 'fs';

const m = fs.readFileSync('supabase/phase-9.2/migration.sql', 'utf8');
const lines = m.split(/\r?\n/);
console.log(lines.slice(580, 605).join('\n'));
