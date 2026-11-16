import fs from 'fs';

const authService = fs.readFileSync('src/services/authService.js', 'utf8');
const lines = authService.split(/\r?\n/);
console.log(lines.slice(25, 65).join('\n'));
