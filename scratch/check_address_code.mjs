import fs from 'fs';
import path from 'path';

function searchInDir(dir, query) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  files.forEach(file => {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      searchInDir(fullPath, query);
    } else if (file.name.endsWith('.js') || file.name.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((l, idx) => {
        if (l.includes(query)) {
          console.log(`${fullPath}:${idx+1} ${l.trim()}`);
        }
      });
    }
  });
}

console.log('=== SEARCH FOR is_default IN src ===');
searchInDir('src', 'is_default');
