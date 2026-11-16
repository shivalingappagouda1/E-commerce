import fs from 'fs';

const schema = fs.readFileSync('database/schema.sql', 'utf8');

const regex = /CREATE POLICY\s+"([^"]+)"\s*\n\s*ON\s+([a-zA-Z0-9_\.]+)([\s\S]*?);/gi;
let m;
const list = [];
while ((m = regex.exec(schema)) !== null) {
  list.push({
    name: m[1],
    table: m[2],
    body: m[3].replace(/\s+/g, ' ').trim()
  });
}
console.log(`Found ${list.length} policies in schema.sql:`);
list.forEach(p => console.log(`[${p.table}] "${p.name}": ${p.body}`));
