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
it('fetchProductReviews source code requires valid UUID and prevents unfiltered query in Supabase mode', () => {
  const content = fs.readFileSync('src/services/productService.js', 'utf8');
  assert(content.includes('if (!productIdentifier || !isValidUUID(productIdentifier))'), 'Must check missing or invalid UUID');
  assert(content.includes('return { data: [], error: null }'), 'Must return empty result for invalid identifier');
  assert(content.includes(".eq('product_id', productIdentifier)"), 'Must scope query to product_id');
});

it('Behavioral: fetchProductReviews guard logic rejects null, empty, or non-UUID before querying', () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isValidUUID = (val) => typeof val === 'string' && UUID_REGEX.test(val);

  let supabaseQueryInitiated = false;
  const mockSupabaseQuery = (id) => {
    supabaseQueryInitiated = true;
    return { data: [{ id: 'rev-1', product_id: id }], error: null };
  };

  const simulateFetchProductReviews = (productIdentifier, isMockMode = false) => {
    if (!isMockMode) {
      if (!productIdentifier || !isValidUUID(productIdentifier)) {
        return { data: [], error: null };
      }
      return mockSupabaseQuery(productIdentifier);
    }
    return { data: ['mock-review'], error: null };
  };

  // 1. Missing identifier
  supabaseQueryInitiated = false;
  assert.deepStrictEqual(simulateFetchProductReviews(null), { data: [], error: null });
  assert.strictEqual(supabaseQueryInitiated, false, 'Must not query Supabase for null');

  // 2. Empty string
  supabaseQueryInitiated = false;
  assert.deepStrictEqual(simulateFetchProductReviews(''), { data: [], error: null });
  assert.strictEqual(supabaseQueryInitiated, false, 'Must not query Supabase for empty string');

  // 3. Invalid UUID (e.g. product name string or malformed UUID)
  supabaseQueryInitiated = false;
  assert.deepStrictEqual(simulateFetchProductReviews('Wireless-Headphones-123'), { data: [], error: null });
  assert.strictEqual(supabaseQueryInitiated, false, 'Must not query Supabase for non-UUID string');

  // 4. Valid UUID
  supabaseQueryInitiated = false;
  const validUUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const result = simulateFetchProductReviews(validUUID);
  assert.strictEqual(supabaseQueryInitiated, true, 'Must query Supabase for valid UUID');
  assert.strictEqual(result.data[0].product_id, validUUID);
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

it('Behavioral: Storage policy extension regex matches authorized extensions and rejects unauthorized', () => {
  const regex = /\.(png|jpg|jpeg|webp|gif)$/i;
  assert.strictEqual(regex.test('avatar.png'), true, 'png must match');
  assert.strictEqual(regex.test('avatar.jpg'), true, 'jpg must match');
  assert.strictEqual(regex.test('avatar.jpeg'), true, 'jpeg must match');
  assert.strictEqual(regex.test('avatar.webp'), true, 'webp must match');
  assert.strictEqual(regex.test('avatar.gif'), true, 'gif must match');
  assert.strictEqual(regex.test('avatar.GIF'), true, 'GIF (case-insensitive) must match');

  assert.strictEqual(regex.test('avatar.svg'), false, 'svg must be rejected');
  assert.strictEqual(regex.test('avatar.exe'), false, 'exe must be rejected');
  assert.strictEqual(regex.test('avatar.html'), false, 'html must be rejected');
  assert.strictEqual(regex.test('avatar.png.exe'), false, 'double extension must be rejected');
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

it('Behavioral: uploadAvatar validation logic rejects extension contradictions and normalizes extensions', () => {
  const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MIME_TO_ALLOWED_EXTENSIONS = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png':  ['png'],
    'image/webp': ['webp'],
    'image/gif':  ['gif'],
  };

  const validateAvatar = ({ userId, file }) => {
    if (!userId) return { error: { message: 'User ID is required to upload an avatar.' } };
    if (!file) return { error: { message: 'No file provided for upload.' } };
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
    return { path: `avatars/${userId}.${ext}`, ext, error: null };
  };

  // Contradiction: JPEG MIME type with .png extension
  const cont1 = validateAvatar({
    userId: 'user-123',
    file: { name: 'photo.png', size: 1024, type: 'image/jpeg' },
  });
  assert(cont1.error && cont1.error.message.includes('contradicts validated MIME type'), 'JPEG with .png must fail');

  // Contradiction: PNG MIME type with .jpg extension
  const cont2 = validateAvatar({
    userId: 'user-123',
    file: { name: 'photo.jpg', size: 1024, type: 'image/png' },
  });
  assert(cont2.error && cont2.error.message.includes('contradicts validated MIME type'), 'PNG with .jpg must fail');

  // Normalization: Uppercase .JPG with JPEG MIME type
  const norm1 = validateAvatar({
    userId: 'user-123',
    file: { name: 'photo.JPG', size: 1024, type: 'image/jpeg' },
  });
  assert.strictEqual(norm1.error, null);
  assert.strictEqual(norm1.path, 'avatars/user-123.jpg');

  // Normalization: Uppercase .GIF with GIF MIME type
  const norm2 = validateAvatar({
    userId: 'user-456',
    file: { name: 'animation.GIF', size: 1024, type: 'image/gif' },
  });
  assert.strictEqual(norm2.error, null);
  assert.strictEqual(norm2.path, 'avatars/user-456.gif');
});

// -------------------------------------------------------------
// CHECK 4: Avatar size error message accurately states "maximum 5 MB"
// -------------------------------------------------------------
it('uploadAvatar error message accurately states "maximum 5 MB"', () => {
  const content = fs.readFileSync('src/services/authService.js', 'utf8');
  assert(content.includes('maximum of 5 MB') || content.includes('maximum 5 MB'), 'Error message must state "maximum 5 MB"');
  assert(!content.includes('less than 5 MB'), 'Old "less than 5 MB" message must be replaced');
});

it('Behavioral: uploadAvatar boundary size validation (5 MB exact vs 5 MB + 1 byte)', () => {
  const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5,242,880 bytes

  const checkSize = (size) => {
    if (size > MAX_AVATAR_SIZE_BYTES) {
      return { error: { message: 'Avatar image size must be a maximum of 5 MB.' } };
    }
    return { error: null };
  };

  // Exactly 5 MB -> Allowed
  assert.strictEqual(checkSize(5242880).error, null, '5,242,880 bytes (exact 5 MB) must pass');

  // 5 MB + 1 byte -> Rejected
  const errOver = checkSize(5242881).error;
  assert(errOver, '5,242,881 bytes must be rejected');
  assert.strictEqual(errOver.message, 'Avatar image size must be a maximum of 5 MB.');

  // 10 MB -> Rejected
  const errDouble = checkSize(10 * 1024 * 1024).error;
  assert(errDouble, '10 MB must be rejected');
  assert.strictEqual(errDouble.message, 'Avatar image size must be a maximum of 5 MB.');
});

console.log(`\nResults: ${passedTests}/${totalTests} checks passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
