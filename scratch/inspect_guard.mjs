import fs from 'fs';

const g = fs.readFileSync('src/components/common/AuthGuard.jsx', 'utf8');
console.log('=== AuthGuard.jsx content ===');
console.log(g);
