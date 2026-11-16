import fs from 'fs';
import path from 'path';

const terms = ['allowed_mime_types', 'file_size_limit', 'storage.buckets', 'public-assets'];

function search(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      search(fullPath);
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      terms.forEach(t => {
        if (content.includes(t)) {
          // print matching line numbers
          const lines = content.split(/\r?\n/);
          lines.forEach((l, idx) => {
            if (l.includes(t)) {
              console.log(`${fullPath}:${idx + 1} [${t}] -> ${l.trim()}`);
            }
          });
        }
      });
    }
  }
}

search('.');
