import fs from 'fs';

const adminService = fs.readFileSync('src/services/adminService.js', 'utf8');
const lines = adminService.split(/\r?\n/);
console.log('=== adminService.js search for rpc, from, and security ===');
lines.forEach((l, i) => {
  if (l.includes('.from(') || l.includes('.rpc(') || l.includes('auth.') || l.includes('storage.')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
