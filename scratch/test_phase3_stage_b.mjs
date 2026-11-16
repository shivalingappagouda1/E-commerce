import assert from 'assert';
import fs from 'fs';

console.log('=== TEST SUITE: PHASE 3 STAGE B IMPLEMENTATION ===\n');

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

// 1. Static AST/Content Verification for authService.js
it('authService.uploadAvatar enforces MAX_AVATAR_SIZE_BYTES = 5 MB', () => {
  const content = fs.readFileSync('src/services/authService.js', 'utf8');
  assert(content.includes('const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024'), 'Must define 5MB limit');
  assert(content.includes('file.size > MAX_AVATAR_SIZE_BYTES'), 'Must check file.size');
  assert(content.includes('maximum of 5 MB'), 'Must return clear maximum 5 MB error message');
});

it('authService.uploadAvatar enforces ALLOWED_AVATAR_MIME_TYPES whitelist', () => {
  const content = fs.readFileSync('src/services/authService.js', 'utf8');
  assert(content.includes("'image/jpeg'"), 'Must allow image/jpeg');
  assert(content.includes("'image/png'"), 'Must allow image/png');
  assert(content.includes("'image/webp'"), 'Must allow image/webp');
  assert(content.includes("'image/gif'"), 'Must allow image/gif');
  assert(content.includes('ALLOWED_AVATAR_MIME_TYPES.includes(fileType)'), 'Must enforce MIME type membership');
});

it('authService.uploadAvatar validates userId and file presence', () => {
  const content = fs.readFileSync('src/services/authService.js', 'utf8');
  assert(content.includes('if (!userId)'), 'Must check userId');
  assert(content.includes('if (!file)'), 'Must check file');
});

it('authService.uploadAvatar normalizes rawExt to lowercase and prevents MIME contradiction', () => {
  const content = fs.readFileSync('src/services/authService.js', 'utf8');
  assert(content.includes('rawExt.toLowerCase()'), 'Must lowercase extension');
  assert(content.includes('MIME_TO_ALLOWED_EXTENSIONS'), 'Must enforce MIME to allowed extensions mapping');
  assert(content.includes('contradicts validated MIME type'), 'Must prevent contradictory extensions');
  assert(content.includes('`avatars/${userId}.${ext}`'), 'Must construct path with normalized ext');
});

// 2. Static AST/Content Verification for productService.js
it('productService.fetchProductReviews filters by product_id UUID directly in PostgreSQL', () => {
  const content = fs.readFileSync('src/services/productService.js', 'utf8');
  assert(content.includes("export async function fetchProductReviews(productIdentifier)"), 'Must accept productIdentifier');
  assert(content.includes(".eq('product_id', productIdentifier)"), 'Must apply .eq(product_id) on query');
  assert(content.includes("if (!productIdentifier || !isValidUUID(productIdentifier))"), 'Must check validity upfront');
  assert(!content.includes("(!productName || (r.product_name && r.product_name.toLowerCase().includes(productName.toLowerCase())))"), 'Must not filter by undefined r.product_name');
});

it('productService.fetchProductReviews maintains demo fallback for mock mode', () => {
  const content = fs.readFileSync('src/services/productService.js', 'utf8');
  assert(content.includes("r.product_id === productIdentifier"), 'Must match product_id in demo mode');
});

// 3. Static AST/Content Verification for ProductDetailPage.jsx
it('ProductDetailPage calls fetchProductReviews with data.id on mount', () => {
  const content = fs.readFileSync('src/pages/customer/ProductDetailPage.jsx', 'utf8');
  assert(content.includes('const reviewTarget = data?.id || data?.name'), 'Must prioritize data.id');
  assert(content.includes('fetchProductReviews(reviewTarget)'), 'Must call with reviewTarget');
});

it('ProductDetailPage calls fetchProductReviews with product.id on refresh', () => {
  const content = fs.readFileSync('src/pages/customer/ProductDetailPage.jsx', 'utf8');
  assert(content.includes('const refreshTarget = product?.id || product?.name'), 'Must prioritize product.id');
  assert(content.includes('fetchProductReviews(refreshTarget)'), 'Must refresh with refreshTarget');
});

it('ProductDetailPage renders joined profiles.full_name for review author', () => {
  const content = fs.readFileSync('src/pages/customer/ProductDetailPage.jsx', 'utf8');
  assert(content.includes('rev.profiles?.full_name || rev.user_name || \'Verified Buyer\''), 'Must render profiles.full_name');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
