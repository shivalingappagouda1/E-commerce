import fs from 'fs';

const authService = fs.readFileSync('src/services/authService.js', 'utf8');
const lines = authService.split(/\r?\n/);
lines.forEach((l, i) => {
  if (l.includes('uploadAvatar') || l.includes('storage') || l.includes('avatar_url') || l.includes('public-assets')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
