import fs from 'fs';

const schema = fs.readFileSync('database/schema.sql', 'utf8');

console.log('--- TABLES & LINE NUMBERS ---');
const lines = schema.split(/\r?\n/);
lines.forEach((line, idx) => {
  if (line.match(/CREATE TABLE/i)) {
    console.log(`Table Line ${idx + 1}: ${line.trim()}`);
  }
  if (line.match(/CREATE (?:OR REPLACE )?FUNCTION/i)) {
    console.log(`Func Line ${idx + 1}: ${line.trim()}`);
  }
  if (line.match(/CREATE TRIGGER/i)) {
    console.log(`Trigger Line ${idx + 1}: ${line.trim()}`);
  }
  if (line.match(/CREATE (?:UNIQUE )?INDEX/i)) {
    console.log(`Index Line ${idx + 1}: ${line.trim()}`);
  }
  if (line.match(/CREATE POLICY/i)) {
    console.log(`Policy Line ${idx + 1}: ${line.trim()}`);
  }
});
