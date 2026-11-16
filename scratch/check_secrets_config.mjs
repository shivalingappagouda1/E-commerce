import fs from 'fs';

const sb = fs.readFileSync('src/lib/supabase.js', 'utf8');
console.log('=== supabase.js ===');
console.log(sb);

if (fs.existsSync('vite.config.js')) {
  console.log('\n=== vite.config.js ===');
  console.log(fs.readFileSync('vite.config.js', 'utf8'));
}
