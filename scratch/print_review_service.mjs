import fs from 'fs';

const service = fs.readFileSync('src/services/productService.js', 'utf8');
const lines = service.split(/\r?\n/);
console.log(lines.slice(415, 505).join('\n'));
