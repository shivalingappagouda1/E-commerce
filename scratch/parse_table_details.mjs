import fs from 'fs';

const schema = fs.readFileSync('database/schema.sql', 'utf8');

// Extract table definitions
const tableRegex = /CREATE TABLE IF NOT EXISTS ([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
let match;
const tables = {};

while ((match = tableRegex.exec(schema)) !== null) {
  const tableName = match[1];
  const body = match[2];
  tables[tableName] = body;
}

console.log('Tables parsed:', Object.keys(tables));
for (const [name, body] of Object.entries(tables)) {
  console.log(`\n=================== ${name} ===================`);
  const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  lines.forEach(l => console.log('  ', l));
}
