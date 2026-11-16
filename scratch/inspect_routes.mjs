import fs from 'fs';

const r = fs.readFileSync('src/routes/AppRoutes.jsx', 'utf8');
console.log('=== AppRoutes.jsx content ===');
console.log(r);
