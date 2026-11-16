import fs from 'fs';

const service = fs.readFileSync('src/services/orderService.js', 'utf8');
const lines = service.split(/\r?\n/);
console.log(lines.slice(120, 255).join('\n'));
