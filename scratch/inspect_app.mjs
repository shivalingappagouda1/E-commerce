import fs from 'fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const lines = app.split(/\r?\n/);
console.log('=== App.jsx preview ===');
console.log(lines.slice(0, 100).join('\n'));
