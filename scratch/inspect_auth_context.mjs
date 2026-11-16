import fs from 'fs';

const a = fs.readFileSync('src/context/AuthContext.jsx', 'utf8');
console.log('=== AuthContext.jsx content ===');
console.log(a);
