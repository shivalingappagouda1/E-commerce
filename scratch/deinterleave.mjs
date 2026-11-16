import fs from 'fs';

const raw = fs.readFileSync('scratch/qr_grid.json', 'utf8').replace(/^\uFEFF/, '');
const grid = JSON.parse(raw);
const size = 49;

const isFunction = Array.from({ length: size }, () => Array(size).fill(false));

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

for (let i = 0; i < size; i++) {
  isFunction[6][i] = true;
  isFunction[i][6] = true;
}

const alignCoords = [6, 24, 42];
for (const r of alignCoords) {
  for (const c of alignCoords) {
    if ((r === 6 && c === 6) || (r === 6 && c === 42) || (r === 42 && c === 6)) {
      continue;
    }
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        isFunction[r + dr][c + dc] = true;
      }
    }
  }
}

for (let i = 0; i <= 8; i++) {
  isFunction[8][i] = true;
  isFunction[i][8] = true;
}
for (let i = 0; i < 8; i++) {
  isFunction[8][size - 1 - i] = true;
  isFunction[size - 1 - i][8] = true;
}
isFunction[size - 8][8] = true;

for (let r = 0; r < 6; r++) {
  for (let c = size - 11; c <= size - 9; c++) {
    isFunction[r][c] = true;
  }
}
for (let r = size - 11; r <= size - 9; r++) {
  for (let c = 0; c < 6; c++) {
    isFunction[r][c] = true;
  }
}

function isMasked(r, c) {
  return ((r * c) % 3 + (r + c) % 2) % 2 === 0;
}

const bits = [];
let upward = true;

for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
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

const rawCodewords = [];
for (let i = 0; i + 8 <= bits.length; i += 8) {
  let val = 0;
  for (let b = 0; b < 8; b++) {
    val = (val << 1) | bits[i + b];
  }
  rawCodewords.push(val);
}

// In ISO 18004 Table 9: Version 8-H
// Group 1: 4 blocks, each with 14 data codewords
// Group 2: 2 blocks, each with 15 data codewords
// Total data codewords = 4 * 14 + 2 * 15 = 86
// Interleaving:
// First, 14 rounds where 1 byte is placed in each of the 6 blocks (6 * 14 = 84 bytes)
// Then, round 15 where 1 byte is placed in each of the 2 blocks of Group 2 (2 bytes)
const numBlocks = 6;
const dataBlocks = Array.from({ length: numBlocks }, () => []);

let byteIdx = 0;
// First 14 rounds across all 6 blocks
for (let round = 0; round < 14; round++) {
  for (let b = 0; b < 6; b++) {
    dataBlocks[b].push(rawCodewords[byteIdx++]);
  }
}
// 15th round for the last 2 blocks (blocks 4 and 5)
for (let b = 4; b < 6; b++) {
  dataBlocks[b].push(rawCodewords[byteIdx++]);
}

// Assemble full de-interleaved data stream
const deinterleavedData = [].concat(...dataBlocks);

let bPos = 0;
function getBits(n) {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const byteIndex = Math.floor(bPos / 8);
    const bitIndex = 7 - (bPos % 8);
    const bit = (deinterleavedData[byteIndex] >> bitIndex) & 1;
    v = (v << 1) | bit;
    bPos++;
  }
  return v;
}

const mode = getBits(4);
const length = getBits(8);
let decoded = '';
for (let i = 0; i < length; i++) {
  decoded += String.fromCharCode(getBits(8));
}

console.log('Mode:', mode === 4 ? 'Byte (0100)' : mode);
console.log('Payload Length:', length);
console.log('\nFULL DECODED UPI STRING:');
console.log(decoded);

// Parse URI parameters
const url = new URL(decoded);
console.log('\nParsed UPI Parameters:');
console.log('Protocol:', url.protocol);
console.log('Payee Address (pa):', url.searchParams.get('pa'));
console.log('Payee Name (pn):', url.searchParams.get('pn'));
console.log('Merchant Code (mc):', url.searchParams.get('mc'));
console.log('Mode (mode):', url.searchParams.get('mode'));
console.log('Purpose (purpose):', url.searchParams.get('purpose'));
