import fs from 'fs';
import path from 'path';

console.log('=== 1. SEARCH FOR place_order ACROSS ENTIRE REPOSITORY ===');

function searchRepo(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      searchRepo(fullPath);
    } else if (entry.name.endsWith('.sql') || entry.name.endsWith('.js') || entry.name.endsWith('.jsx') || entry.name.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (line.includes('place_order')) {
          console.log(`${fullPath}:${idx + 1} -> ${line.trim()}`);
        }
      });
    }
  }
}

searchRepo('.');
