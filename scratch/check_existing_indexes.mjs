import fs from 'fs';

const schema = fs.readFileSync('database/schema.sql', 'utf8');
const lines = schema.split(/\r?\n/);

const indexLines = lines.filter(l => l.match(/CREATE (?:UNIQUE )?INDEX/i));
console.log('=== ALL INDEXES IN schema.sql ===');
indexLines.forEach(l => console.log(l.trim()));
