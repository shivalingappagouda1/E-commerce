import fs from 'fs';

const raw = fs.readFileSync('scratch/qr_grid.json', 'utf8').replace(/^\uFEFF/, '');
const grid = JSON.parse(raw);
const size = 49; // Version 8

// Create a mask of function modules (modules that are NOT data)
const isFunction = Array.from({ length: size }, () => Array(size).fill(false));

// 1. Finder patterns + separators (8x8)
function markFinder(startR, startC) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const row = startR + r;
      const col = startC + c;
      if (row >= 0 && row < size && col >= 0 && col < size) {
        isFunction[row][col] = true;
      }
    }
  }
}
markFinder(0, 0);
markFinder(0, size - 7);
markFinder(size - 7, 0);

// 2. Timing patterns
for (let i = 0; i < size; i++) {
  isFunction[6][i] = true;
  isFunction[i][6] = true;
}

// 3. Alignment patterns for Version 8: coordinates [6, 24, 42]
const alignCoords = [6, 24, 42];
for (const r of alignCoords) {
  for (const c of alignCoords) {
    // Skip if overlaps with finder patterns
    if ((r === 6 && c === 6) || (r === 6 && c === 42) || (r === 42 && c === 6)) {
      continue;
    }
    // 5x5 alignment pattern centered at (r, c)
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        isFunction[r + dr][c + dc] = true;
      }
    }
  }
}

// 4. Format info modules (around finders)
for (let i = 0; i <= 8; i++) {
  isFunction[8][i] = true;
  isFunction[i][8] = true;
}
for (let i = 0; i < 8; i++) {
  isFunction[8][size - 1 - i] = true;
  isFunction[size - 1 - i][8] = true;
}
isFunction[size - 8][8] = true; // Dark module

// 5. Version info (6x3) for Version 8 (>= 7)
// Top right: rows 0..5, cols size-11..size-9
for (let r = 0; r < 6; r++) {
  for (let c = size - 11; c <= size - 9; c++) {
    isFunction[r][c] = true;
  }
}
// Bottom left: rows size-11..size-9, cols 0..5
for (let r = size - 11; r <= size - 9; r++) {
  for (let c = 0; c < 6; c++) {
    isFunction[r][c] = true;
  }
}

// Mask 7: ((row * col) % 3 + (row + col) % 2) % 2 === 0
function isMasked(r, c) {
  return ((r * c) % 3 + (r + c) % 2) % 2 === 0;
}

// Collect raw unmasked data bits
const bits = [];
let upward = true;

for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
  // Column 6 is the vertical timing pattern, skip it
  if (rightCol === 6) rightCol--;

  const leftCol = rightCol - 1;
  const rows = upward
    ? Array.from({ length: size }, (_, i) => size - 1 - i)
    : Array.from({ length: size }, (_, i) => i);

  for (const r of rows) {
    for (const c of [rightCol, leftCol]) {
      if (!isFunction[r][c]) {
        let bit = grid[r][c];
        if (isMasked(r, c)) {
          bit = bit ^ 1;
        }
        bits.push(bit);
      }
    }
  }
  upward = !upward;
}

console.log(`Extracted ${bits.length} data bits`);

// Convert bits to bytes
const bytes = [];
for (let i = 0; i + 8 <= bits.length; i += 8) {
  let val = 0;
  for (let b = 0; b < 8; b++) {
    val = (val << 1) | bits[i + b];
  }
  bytes.push(val);
}

// Read mode (first 4 bits)
let bitPos = 0;
function readBits(n) {
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = (v << 1) | bits[bitPos++];
  }
  return v;
}

const mode = readBits(4);
console.log('Mode:', mode.toString(2).padStart(4, '0'));

if (mode === 4) { // Byte mode (0100)
  const charCount = readBits(8); // Version 1-9 byte mode uses 8-bit length
  console.log('Character count:', charCount);
  let text = '';
  for (let i = 0; i < charCount; i++) {
    text += String.fromCharCode(readBits(8));
  }
  console.log('\nDecoded text:');
  console.log(text);
} else {
  // Let's dump the raw ASCII representation of bytes
  const ascii = bytes.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
  console.log('Raw byte stream ASCII preview:', ascii.slice(0, 150));
}
