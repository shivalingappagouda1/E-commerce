import fs from 'fs';

const profile = fs.readFileSync('src/pages/customer/ProfilePage.jsx', 'utf8');
const lines = profile.split(/\r?\n/);
lines.forEach((l, i) => {
  if (l.includes('updateProfile') || l.includes('role') || l.includes('uploadAvatar')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
