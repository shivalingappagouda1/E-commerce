// ============================================================================
// ShopKart Phase 9.1: Offline Static Validation Script
// Execution: node test_phase9_validation.mjs
// Syntax Check: node --check test_phase9_validation.mjs
//
// CONSTRAINTS ENFORCED:
// - Strictly offline: No database connection, no network calls.
// - Strictly read-only: No file modifications, no secrets access.
// - Lexical scanning for dollar-quote blocks and transaction delimiters.
// - Static security invariants verification.
// - Explicit honest reporting: Lexical scanning is NOT a full SQL AST parser.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SQL_FILES = [
  'database/migrations/phase9_security_hardening_corrected.sql',
  'database/tests/phase9_security_verification.sql',
  'database/tests/phase9_pre_migration_export.sql',
  'database/migrations/phase9_rollback.sql'
];

function scanSqlTokens(sqlContent) {
  let pos = 0;
  const len = sqlContent.length;
  
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let dollarQuoteTag = null;
  
  const dollarQuoteBlocks = [];
  let currentDollarStart = -1;

  const topLevelTokens = [];
  let currentWord = '';
  let wordStartPos = 0;

  function flushWord() {
    if (currentWord.length > 0) {
      topLevelTokens.push({ token: currentWord, pos: wordStartPos });
      currentWord = '';
    }
  }

  while (pos < len) {
    const ch = sqlContent[pos];
    const nextCh = pos + 1 < len ? sqlContent[pos + 1] : '';

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      pos++;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && nextCh === '/') {
        inBlockComment = false;
        pos += 2;
        continue;
      }
      pos++;
      continue;
    }

    if (inSingleQuote) {
      if (ch === '\'') {
        if (nextCh === '\'') {
          pos += 2;
          continue;
        }
        inSingleQuote = false;
        pos++;
        continue;
      }
      pos++;
      continue;
    }

    if (dollarQuoteTag !== null) {
      if (ch === '$') {
        const potentialClose = sqlContent.slice(pos, pos + dollarQuoteTag.length + 2);
        const expectedClose = `$${dollarQuoteTag}$`;
        if (potentialClose === expectedClose) {
          dollarQuoteBlocks.push({
            tag: dollarQuoteTag,
            start: currentDollarStart,
            end: pos + expectedClose.length
          });
          pos += expectedClose.length;
          dollarQuoteTag = null;
          continue;
        }
      }
      pos++;
      continue;
    }

    if (ch === '-' && nextCh === '-') {
      flushWord();
      inLineComment = true;
      pos += 2;
      continue;
    }
    if (ch === '/' && nextCh === '*') {
      flushWord();
      inBlockComment = true;
      pos += 2;
      continue;
    }

    if (ch === '\'') {
      flushWord();
      inSingleQuote = true;
      pos++;
      continue;
    }

    if (ch === '$') {
      const remaining = sqlContent.slice(pos);
      const match = remaining.match(/^\$([a-zA-Z0-9_]*)\$/);
      if (match) {
        flushWord();
        dollarQuoteTag = match[1];
        currentDollarStart = pos;
        pos += match[0].length;
        continue;
      }
    }

    if (/[a-zA-Z_]/.test(ch)) {
      if (currentWord.length === 0) wordStartPos = pos;
      currentWord += ch;
    } else {
      flushWord();
    }

    pos++;
  }
  flushWord();

  return {
    dollarQuoteTagUnclosed: dollarQuoteTag,
    dollarQuoteBlocks,
    topLevelTokens
  };
}

console.log('================================================================');
console.log('ShopKart Phase 9.1: Comprehensive Static Validation Suite');
console.log('Mode: STRICT OFFLINE (Read-Only)');
console.log('================================================================\n');

const results = [];
let overallPass = true;

for (const relPath of SQL_FILES) {
  const absPath = path.resolve(rootDir, relPath);
  const fileReport = {
    file: relPath,
    exists: false,
    sizeBytes: 0,
    dollarQuoteBalanced: 'NOT AVAILABLE',
    transactionStructure: 'NOT AVAILABLE',
    safetyInvariants: 'NOT AVAILABLE',
    sqlParserStatus: 'NOT AVAILABLE (No external SQL parser installed; lexical scanner used)',
    status: 'PASS',
    details: []
  };

  if (!fs.existsSync(absPath)) {
    fileReport.exists = false;
    fileReport.status = 'FAIL';
    fileReport.details.push('File does not exist on disk.');
    results.push(fileReport);
    overallPass = false;
    continue;
  }

  const stat = fs.statSync(absPath);
  fileReport.exists = true;
  fileReport.sizeBytes = stat.size;

  if (stat.size === 0) {
    fileReport.status = 'FAIL';
    fileReport.details.push('File is empty (0 bytes).');
    results.push(fileReport);
    overallPass = false;
    continue;
  }

  const content = fs.readFileSync(absPath, 'utf8');

  const scan = scanSqlTokens(content);
  if (scan.dollarQuoteTagUnclosed !== null) {
    fileReport.dollarQuoteBalanced = 'FAIL';
    fileReport.status = 'FAIL';
    fileReport.details.push(`Unclosed dollar-quote tag: $${scan.dollarQuoteTagUnclosed}$`);
    overallPass = false;
  } else {
    fileReport.dollarQuoteBalanced = `PASS (${scan.dollarQuoteBlocks.length} block(s) balanced)`;
  }

  const topWords = scan.topLevelTokens.map(t => t.token.toUpperCase());
  const beginCount = topWords.filter(w => w === 'BEGIN').length;
  const commitCount = topWords.filter(w => w === 'COMMIT').length;
  const rollbackCount = topWords.filter(w => w === 'ROLLBACK').length;

  if (relPath.startsWith('database/migrations/')) {
    if (beginCount === 1 && commitCount === 1 && rollbackCount === 0) {
      fileReport.transactionStructure = `PASS (Atomic: 1 BEGIN, 1 COMMIT)`;
    } else {
      fileReport.transactionStructure = 'FAIL';
      fileReport.status = 'FAIL';
      fileReport.details.push(`Transaction mismatch: Found ${beginCount} BEGIN, ${commitCount} COMMIT, ${rollbackCount} ROLLBACK.`);
      overallPass = false;
    }
  } else {
    if (beginCount === 0 && commitCount === 0) {
      fileReport.transactionStructure = 'PASS (Read-Only: No top-level transaction)';
    } else {
      fileReport.transactionStructure = `PASS (Read-Only with ${beginCount} BEGIN, ${commitCount} COMMIT)`;
    }
  }

  let invariantFail = false;

  const codeOnly = content
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  if (/FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(codeOnly)) {
    fileReport.details.push('VIOLATION: Contains active FORCE ROW LEVEL SECURITY statement.');
    invariantFail = true;
  }

  if (relPath.includes('security_hardening_corrected')) {
    if (/DROP\s+POLICY\s+IF\s+EXISTS\s+["']Public Access["']/i.test(codeOnly)) {
      fileReport.details.push('VIOLATION: Drops generic policy "Public Access".');
      invariantFail = true;
    }
    if (/DROP\s+POLICY\s+IF\s+EXISTS\s+["']Allow authenticated uploads["']/i.test(codeOnly)) {
      fileReport.details.push('VIOLATION: Drops generic policy "Allow authenticated uploads".');
      invariantFail = true;
    }
    if (/allowed_mime_types[\s\S]*?image\/svg\+xml/i.test(codeOnly)) {
      fileReport.details.push('VIOLATION: Allowed MIME types include SVG (Stored XSS vector).');
      invariantFail = true;
    }
    const catalogTables = ['categories', 'products', 'product_images', 'product_variants', 'inventory', 'coupons', 'banners', 'reviews'];
    for (const tbl of catalogTables) {
      const policyRegex = new RegExp(`CREATE\\s+POLICY\\s+["']Allow admin full access on ${tbl}["'][\\s\\S]*?TO\\s+authenticated`, 'i');
      if (!policyRegex.test(codeOnly)) {
        fileReport.details.push(`VIOLATION: Admin policy for ${tbl} not properly scoped TO authenticated.`);
        invariantFail = true;
      }
    }
    if (!/v_pol\.cmd\s*=\s*'SELECT'/i.test(codeOnly) || !/v_pol\.cmd\s*=\s*'INSERT'/i.test(codeOnly)) {
      fileReport.details.push('VIOLATION: Pre-execution guard missing command-specific inspection.');
      invariantFail = true;
    }
  }

  if (relPath.includes('rollback')) {
    if (/DROP\s+TABLE\s+storage\.buckets/i.test(codeOnly) || /DELETE\s+FROM\s+storage\.buckets/i.test(codeOnly)) {
      fileReport.details.push('VIOLATION: Rollback attempts to delete or drop storage.buckets.');
      invariantFail = true;
    }
    if (/DELETE\s+FROM\s+storage\.objects/i.test(codeOnly) || /TRUNCATE\s+storage\.objects/i.test(codeOnly)) {
      fileReport.details.push('VIOLATION: Rollback attempts to delete storage objects.');
      invariantFail = true;
    }
  }

  if (invariantFail) {
    fileReport.safetyInvariants = 'FAIL';
    fileReport.status = 'FAIL';
    overallPass = false;
  } else {
    fileReport.safetyInvariants = 'PASS (All invariants satisfied)';
  }

  results.push(fileReport);
}

for (const r of results) {
  console.log(`[FILE] ${r.file}`);
  console.log(`  - Exists:              ${r.exists ? 'YES' : 'NO'} (${r.sizeBytes} bytes)`);
  console.log(`  - Dollar-Quotes:       ${r.dollarQuoteBalanced}`);
  console.log(`  - Transactions:        ${r.transactionStructure}`);
  console.log(`  - Safety Invariants:   ${r.safetyInvariants}`);
  console.log(`  - SQL AST Parser:      ${r.sqlParserStatus}`);
  console.log(`  - Result:              ${r.status}`);
  if (r.details.length > 0) {
    for (const d of r.details) {
      console.log(`    * ${d}`);
    }
  }
  console.log('');
}

console.log('----------------------------------------------------------------');
console.log(`OVERALL STATIC VALIDATION RESULT: ${overallPass ? 'PASS' : 'FAIL'}`);
console.log('----------------------------------------------------------------');

if (!overallPass) {
  process.exit(1);
}
