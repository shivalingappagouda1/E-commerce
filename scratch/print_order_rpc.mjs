import fs from 'fs';

const service = fs.readFileSync('src/services/orderService.js', 'utf8');
const lines = service.split(/\r?\n/);
console.log(lines.slice(370, 410).join('\n'));
