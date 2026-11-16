import fs from 'fs';

const adminService = fs.readFileSync('src/services/adminService.js', 'utf8');
const lines = adminService.split(/\r?\n/);
lines.forEach((l, i) => {
  if (l.includes('image') || l.includes('upload') || l.includes('storage')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
