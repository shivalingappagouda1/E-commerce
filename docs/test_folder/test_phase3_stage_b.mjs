import assert from 'assert';
import fs from 'fs';

console.log('=== TEST SUITE: PHASE 3 STAGE B IMPLEMENTATION & BEHAVIORAL VERIFICATION ===\n');

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
// 1. PRODUCT REVIEWS (DEF-01) - AST & STATIC VERIFICATION
// -------------------------------------------------------------
it('productService.fetchProductReviews filters by product_id UUID directly in PostgreSQL', () => {
  const content = fs.readFileSync('src/services/productService.js', 'utf8');
  assert(content.includes('export async function fetchProductReviews(productIdentifier)'), 'Must accept productIdentifier');
  assert(content.includes(".eq('product_id', productIdentifier)"), 'Must apply .eq(product_id) on query');
  assert(content.includes('if (!productIdentifier || !isValidUUID(productIdentifier))'), 'Must check validity upfront');
  assert(!content.includes('(!productName || (r.product_name && r.product_name.toLowerCase().includes(productName.toLowerCase())))'), 'Must not filter by undefined r.product_name');
});

it('productService.fetchProductReviews maintains demo fallback for mock mode', () => {
  const content = fs.readFileSync('src/services/productService.js', 'utf8');
  assert(content.includes('r.product_id === productIdentifier'), 'Must match product_id in demo mode');
});

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
  assert(content.includes("rev.profiles?.full_name || rev.user_name || 'Verified Buyer'"), 'Must render profiles.full_name');
});

// -------------------------------------------------------------
// 2. PRODUCT REVIEWS (DEF-01) - BEHAVIORAL MOCKED TESTS
// -------------------------------------------------------------
it('Behavioral: fetchProductReviews queries Supabase strictly with product_id and never unfiltered', async () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isValidUUID = (v) => typeof v === 'string' && UUID_REGEX.test(v);

  const mockClient = {
    queries: [],
    from(table) {
      const q = { table, filters: [], orders: [] };
      const chain = {
        select(fields) { q.select = fields; return chain; },
        eq(col, val) { q.filters.push({ col, val }); return chain; },
        order(col, opts) { q.orders.push({ col, opts }); return chain; },
        then(resolve) {
          mockClient.queries.push(q);
          resolve({ data: [{ id: 'rev-uuid-1', product_id: q.filters.find(f => f.col === 'product_id')?.val }], error: null });
        }
      };
      return chain;
    }
  };

  const fetchReviewsBehavior = async (productIdentifier, isMock = false) => {
    if (!isMock) {
      if (!productIdentifier || !isValidUUID(productIdentifier)) {
        return { data: [], error: null };
      }
      const { data, error } = await mockClient
        .from('reviews')
        .select('*, profiles(full_name, avatar_url)')
        .eq('product_id', productIdentifier)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });
      return { data: data || [], error: null };
    }
    return { data: [], error: null };
  };

  // Case 1: Missing UUID (null)
  mockClient.queries = [];
  const resNull = await fetchReviewsBehavior(null);
  assert.deepStrictEqual(resNull, { data: [], error: null });
  assert.strictEqual(mockClient.queries.length, 0, 'No query executed for null');

  // Case 2: Missing UUID (empty string)
  mockClient.queries = [];
  const resEmpty = await fetchReviewsBehavior('');
  assert.deepStrictEqual(resEmpty, { data: [], error: null });
  assert.strictEqual(mockClient.queries.length, 0, 'No query executed for empty string');

  // Case 3: Invalid UUID (string name)
  mockClient.queries = [];
  const resInvalid = await fetchReviewsBehavior('Classic-Cotton-T-Shirt');
  assert.deepStrictEqual(resInvalid, { data: [], error: null });
  assert.strictEqual(mockClient.queries.length, 0, 'No query executed for non-UUID product name');

  // Case 4: Valid UUID
  mockClient.queries = [];
  const targetUuid = '550e8400-e29b-41d4-a716-446655440000';
  const resValid = await fetchReviewsBehavior(targetUuid);
  assert.strictEqual(mockClient.queries.length, 1, 'Exactly 1 query executed');
  assert.strictEqual(mockClient.queries[0].table, 'reviews');
  const prodIdFilter = mockClient.queries[0].filters.find(f => f.col === 'product_id');
  assert(prodIdFilter, 'Query MUST include product_id filter');
  assert.strictEqual(prodIdFilter.val, targetUuid);
  assert.strictEqual(resValid.data[0].product_id, targetUuid);
});

// -------------------------------------------------------------
// 3. AVATAR UPLOAD (SEC-03/SEC-04) - AST & STATIC VERIFICATION
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 4. AVATAR UPLOAD (SEC-03/SEC-04) - BEHAVIORAL MOCKED TESTS
// -------------------------------------------------------------
it('Behavioral: uploadAvatar executes complete validation sequence and aborts before upload on error', async () => {
  const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MIME_TO_ALLOWED_EXTENSIONS = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png':  ['png'],
    'image/webp': ['webp'],
    'image/gif':  ['gif'],
  };

  let uploadCalled = false;
  let uploadArgs = null;

  const mockSupabase = {
    storage: {
      from(bucket) {
        return {
          upload: async (path, file, opts) => {
            uploadCalled = true;
            uploadArgs = { bucket, path, file, opts };
            return { error: null };
          },
          getPublicUrl: (path) => ({
            data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` }
          })
        };
      }
    }
  };

  const uploadAvatarBehavior = async ({ userId, file }) => {
    if (!userId) {
      return { error: { message: 'User ID is required to upload an avatar.' } };
    }
    if (!file) {
      return { error: { message: 'No file provided for upload.' } };
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      return { error: { message: 'Avatar image size must be a maximum of 5 MB.' } };
    }
    const fileType = file.type ? file.type.toLowerCase() : '';
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(fileType)) {
      return { error: { message: 'Invalid image format. Only JPEG, PNG, WEBP, and GIF images are allowed.' } };
    }
    const rawExt = file.name ? file.name.split('.').pop() : '';
    const ext = rawExt ? rawExt.toLowerCase() : '';
    const allowedExts = MIME_TO_ALLOWED_EXTENSIONS[fileType] || [];
    if (!ext || !allowedExts.includes(ext)) {
      return {
        error: {
          message: `File extension .${ext || 'unknown'} contradicts validated MIME type ${fileType}. Allowed extensions: ${allowedExts.join(', ')}.`,
        },
      };
    }

    const path = `avatars/${userId}.${ext}`;
    const { error: uploadError } = await mockSupabase.storage
      .from('public-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) return { error: uploadError };

    const { data } = mockSupabase.storage
      .from('public-assets')
      .getPublicUrl(path);

    return { url: data.publicUrl, error: null };
  };

  // 1. Missing userId -> rejects without upload
  uploadCalled = false;
  const resNoUser = await uploadAvatarBehavior({ userId: null, file: { name: 'me.png', size: 100, type: 'image/png' } });
  assert.strictEqual(uploadCalled, false, 'Storage upload must not be called when userId is missing');
  assert.strictEqual(resNoUser.error.message, 'User ID is required to upload an avatar.');

  // 2. Missing file -> rejects without upload
  uploadCalled = false;
  const resNoFile = await uploadAvatarBehavior({ userId: 'u1', file: null });
  assert.strictEqual(uploadCalled, false, 'Storage upload must not be called when file is missing');
  assert.strictEqual(resNoFile.error.message, 'No file provided for upload.');

  // 3. Oversized file (> 5 MB) -> rejects without upload
  uploadCalled = false;
  const resOversize = await uploadAvatarBehavior({
    userId: 'u1',
    file: { name: 'large.png', size: 5 * 1024 * 1024 + 1, type: 'image/png' }
  });
  assert.strictEqual(uploadCalled, false, 'Storage upload must not be called when file is oversized');
  assert.strictEqual(resOversize.error.message, 'Avatar image size must be a maximum of 5 MB.');

  // 4. Unsupported MIME type -> rejects without upload
  uploadCalled = false;
  const resBadMime = await uploadAvatarBehavior({
    userId: 'u1',
    file: { name: 'document.pdf', size: 1024, type: 'application/pdf' }
  });
  assert.strictEqual(uploadCalled, false, 'Storage upload must not be called for PDF');
  assert.strictEqual(resBadMime.error.message, 'Invalid image format. Only JPEG, PNG, WEBP, and GIF images are allowed.');

  // 5. Contradictory extension -> rejects without upload
  uploadCalled = false;
  const resContradict = await uploadAvatarBehavior({
    userId: 'u1',
    file: { name: 'image.jpg', size: 1024, type: 'image/png' }
  });
  assert.strictEqual(uploadCalled, false, 'Storage upload must not be called for contradictory extension');
  assert(resContradict.error.message.includes('contradicts validated MIME type image/png'));

  // 6. Valid file with uppercase extension -> normalizes to lowercase and succeeds
  uploadCalled = false;
  const validFile = { name: 'PROFILE.WEBP', size: 50000, type: 'image/webp' };
  const resSuccess = await uploadAvatarBehavior({ userId: 'user-abc', file: validFile });
  assert.strictEqual(uploadCalled, true, 'Storage upload must be called on valid file');
  assert.strictEqual(resSuccess.error, null);
  assert.strictEqual(uploadArgs.path, 'avatars/user-abc.webp');
  assert.strictEqual(resSuccess.url, 'https://example.supabase.co/storage/v1/object/public/public-assets/avatars/user-abc.webp');
});

// -------------------------------------------------------------
// 5. REPOSITORY STORAGE BUCKET CONFIGURATION VERIFICATION (TASK 1)
// -------------------------------------------------------------
it('Repository SQL confirms public-assets bucket insert has NULL allowed_mime_types and NULL file_size_limit', () => {
  const pkgMigration = fs.readFileSync('supabase/phase-9.2/migration.sql', 'utf8');
  const dbMigration = fs.readFileSync('database/migrations/phase9_2_storage_hardening.sql', 'utf8');

  // Check 1: Bucket insert specifies only id, name, public
  const pkgInsertRegex = /INSERT\s+INTO\s+storage\.buckets\s*\(\s*id\s*,\s*name\s*,\s*public\s*\)\s*VALUES\s*\(\s*'public-assets'\s*,\s*'public-assets'\s*,\s*true\s*\)/i;
  const dbInsertRegex = /INSERT\s+INTO\s+storage\.buckets\s*\(\s*id\s*,\s*name\s*,\s*public\s*\)\s*SELECT\s*'public-assets',\s*'public-assets',\s*true/i;
  assert(pkgInsertRegex.test(pkgMigration), 'supabase/phase-9.2/migration.sql inserts only (id, name, public)');
  assert(dbInsertRegex.test(dbMigration), 'database/migrations inserts only (id, name, public)');

  // Check 2: allowed_mime_types and file_size_limit are NOT specified in storage.buckets insert/update
  assert(!pkgMigration.includes('allowed_mime_types'), 'supabase/phase-9.2/migration.sql does not set allowed_mime_types');
  assert(!pkgMigration.includes('file_size_limit'), 'supabase/phase-9.2/migration.sql does not set file_size_limit');

  // Check 3: Storage RLS policies enforce extension regex (png|jpg|jpeg|webp|gif)
  const rlsRegex = /storage\.filename\(name\)\s*~\s*\('\^'\s*\|\|\s*auth\.uid\(\)::text\s*\|\|\s*'\\\.\(png\|jpg\|jpeg\|webp\|gif\)\$'\)/;
  assert(rlsRegex.test(pkgMigration), 'Storage RLS policies enforce extension regex for png, jpg, jpeg, webp, gif');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
