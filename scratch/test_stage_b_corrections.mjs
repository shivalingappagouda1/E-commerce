import assert from 'assert';
import fs from 'fs';

console.log('=== TEST SUITE: PHASE 3 STAGE B VERIFICATION & CORRECTIONS ===\n');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

// -------------------------------------------------------------
// CHECK 1: fetchProductReviews requires valid UUID in Supabase mode
// -------------------------------------------------------------
it('fetchProductReviews immediately returns { data: [], error: null } if productIdentifier is missing or invalid UUID', () => {
  const content = fs.readFileSync('src/services/productService.js', 'utf8');
  assert(content.includes('if (!productIdentifier || !isValidUUID(productIdentifier))'), 'Must check missing or invalid UUID');
  assert(content.includes('return { data: [], error: null }'), 'Must return empty result for invalid identifier');
  assert(content.includes(".eq('product_id', productIdentifier)"), 'Must scope query to product_id');
});

it('fetchProductReviews never executes an unfiltered query in Supabase mode', () => {
  const content = fs.readFileSync('src/services/productService.js', 'utf8');
  const fnBody = content.slice(content.indexOf('export async function fetchProductReviews'), content.indexOf('export async function submitProductReview'));
  
  // Ensure that every query in Supabase mode has .eq('product_id', ...)
  assert(fnBody.includes(".eq('product_id', productIdentifier)"), 'All Supabase queries must filter by product_id');
  // Ensure that no query executes without product_id
  assert(!fnBody.includes("const { data, error } = await query\n\n      if (error)"), 'Query must have product_id filter before await');
});

// -------------------------------------------------------------
// CHECK 2: Storage policy permits GIF and all accepted extensions
// -------------------------------------------------------------
it('Storage policy in migration.sql permits GIF, PNG, JPG, JPEG, and WEBP', () => {
  const migration = fs.readFileSync('supabase/phase-9.2/migration.sql', 'utf8');
  const occurrences = (migration.match(/\(png\|jpg\|jpeg\|webp\|gif\)/g) || []).length;
  assert(occurrences >= 8, `Expected at least 8 occurrences of (png|jpg|jpeg|webp|gif), found ${occurrences}`);
  assert(migration.includes('gif'), 'Storage policy must explicitly include gif');
});

// -------------------------------------------------------------
// CHECK 3: File extension cannot contradict validated MIME type
// -------------------------------------------------------------
it('uploadAvatar enforces MIME-to-extension consistency and prevents contradictions', () => {
  const content = fs.readFileSync('src/services/authService.js', 'utf8');
  assert(content.includes('MIME_TO_ALLOWED_EXTENSIONS'), 'Must define MIME_TO_ALLOWED_EXTENSIONS mapping');
  assert(content.includes("'image/gif':  ['gif']"), 'image/gif must map to gif');
  assert(content.includes("'image/png':  ['png']"), 'image/png must map to png');
  assert(content.includes("'image/jpeg': ['jpg', 'jpeg']"), 'image/jpeg must map to jpg and jpeg');
  assert(content.includes("'image/webp': ['webp']"), 'image/webp must map to webp');
  assert(content.includes('contradicts validated MIME type'), 'Must reject contradictory extension');
  assert(content.includes('rawExt.toLowerCase()'), 'Must preserve lowercase normalization');
});

// -------------------------------------------------------------
// CHECK 4: Avatar size error message accurately states "maximum 5 MB"
// -------------------------------------------------------------
it('uploadAvatar error message accurately states "maximum 5 MB"', () => {
  const content = fs.readFileSync('src/services/authService.js', 'utf8');
  assert(content.includes('maximum of 5 MB') || content.includes('maximum 5 MB'), 'Error message must state "maximum 5 MB"');
  assert(!content.includes('less than 5 MB'), 'Old "less than 5 MB" message must be replaced');
});

console.log(`\nResults: ${passedTests}/${totalTests} checks passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
