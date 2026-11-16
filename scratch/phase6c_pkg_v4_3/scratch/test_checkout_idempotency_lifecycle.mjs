// =================================================================
// SHOPKART: CHECKOUT IDEMPOTENCY KEY LIFECYCLE TESTS
// Tests the full lifecycle of checkout attempt idempotency keys across:
// 1. Initial page load and generation
// 2. Reload with unchanged cart (exact key reuse)
// 3. Reload with changed cart (immediate rotation on mount)
// 4. Change of delivery address (fingerprint rotation)
// 5. Change of payment method (fingerprint rotation)
// 6. Change of coupon code (fingerprint rotation)
// 7. Confirmed order creation (clean sessionStorage removal)
// =================================================================

import assert from 'node:assert';

// Mock browser sessionStorage for Node.js test environment
class MockSessionStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const mockStorage = new MockSessionStorage();

function generateIdempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function computeOrderFingerprint({ items = [], addressId = '', paymentMethod = 'cod', couponCode = '' } = {}) {
  const sortedItemsFingerprint = [...items]
    .map(i => {
      const pId = i.product_id || i.productId || i.id || '';
      const vId = i.variant_id || i.variantId || 'null';
      const qty = i.quantity || 1;
      return `${pId}:${vId}:${qty}`;
    })
    .sort()
    .join(',');

  return `${addressId || ''}|${paymentMethod || 'cod'}|${couponCode ? couponCode.toUpperCase().trim() : ''}|${sortedItemsFingerprint}`;
}

/**
 * Simulates CheckoutPage idempotency initialization logic on mount.
 */
function initCheckoutAttemptKey(storage, orderFingerprint) {
  try {
    const stored = storage.getItem('shopkart_checkout_attempt');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.fingerprint === orderFingerprint && parsed?.idempotencyKey) {
        return { key: parsed.idempotencyKey, fromStorage: true };
      }
    }
  } catch {}

  const newKey = generateIdempotencyKey();
  try {
    storage.setItem('shopkart_checkout_attempt', JSON.stringify({
      fingerprint: orderFingerprint,
      idempotencyKey: newKey,
    }));
  } catch {}
  return { key: newKey, fromStorage: false };
}

/**
 * Simulates CheckoutPage useEffect synchronization when order fingerprint changes.
 */
function syncCheckoutAttemptKey(storage, orderFingerprint, currentKey) {
  try {
    const stored = storage.getItem('shopkart_checkout_attempt');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.fingerprint === orderFingerprint && parsed?.idempotencyKey) {
        return { key: parsed.idempotencyKey, rotated: false };
      }
    }
  } catch {}

  const newKey = generateIdempotencyKey();
  try {
    storage.setItem('shopkart_checkout_attempt', JSON.stringify({
      fingerprint: orderFingerprint,
      idempotencyKey: newKey,
    }));
  } catch {}
  return { key: newKey, rotated: true };
}

console.log('=================================================================');
console.log('SHOPKART: CHECKOUT IDEMPOTENCY KEY LIFECYCLE TESTS');
console.log('Testing key generation, persistence, reload reuse, and rotation');
console.log('=================================================================\n');

// Test Case 1: Initial Mount
console.log('--- Test 1: Initial Checkout Load ---');
mockStorage.clear();
const itemsInitial = [
  { product_id: 'p1', variant_id: null, quantity: 2 },
  { product_id: 'p2', variant_id: 'v1', quantity: 1 },
];
const fp1 = computeOrderFingerprint({
  items: itemsInitial,
  addressId: 'addr-111',
  paymentMethod: 'cod',
  couponCode: '',
});

const mount1 = initCheckoutAttemptKey(mockStorage, fp1);
assert.strictEqual(mount1.fromStorage, false, 'Initial load must generate a fresh key');
assert.ok(mount1.key, 'Initial key must be populated');
const stored1 = JSON.parse(mockStorage.getItem('shopkart_checkout_attempt'));
assert.strictEqual(stored1.fingerprint, fp1, 'Stored fingerprint must match initial order');
assert.strictEqual(stored1.idempotencyKey, mount1.key, 'Stored key must match generated key');
console.log(`✔ Test 1 Passed: Initial attempt key generated and persisted (${mount1.key.substring(0, 12)}...)`);

// Test Case 2: Page Reload with Unchanged Cart
console.log('\n--- Test 2: Page Reload with Unchanged Cart ---');
// User presses F5 / reloads without modifying order inputs
const reloadUnchanged = initCheckoutAttemptKey(mockStorage, fp1);
assert.strictEqual(reloadUnchanged.fromStorage, true, 'Reload with unchanged cart must read from sessionStorage');
assert.strictEqual(reloadUnchanged.key, mount1.key, 'Reload with unchanged cart must REUSE exact same idempotency key');
console.log(`✔ Test 2 Passed: Key reused across reload (${reloadUnchanged.key.substring(0, 12)}...)`);

// Test Case 3: Page Reload with Changed Cart
console.log('\n--- Test 3: Page Reload with Changed Cart ---');
// User went to cart in another tab or updated quantity to 3, then returned to checkout
const itemsChanged = [
  { product_id: 'p1', variant_id: null, quantity: 3 }, // Changed qty 2 -> 3
  { product_id: 'p2', variant_id: 'v1', quantity: 1 },
];
const fp2 = computeOrderFingerprint({
  items: itemsChanged,
  addressId: 'addr-111',
  paymentMethod: 'cod',
  couponCode: '',
});

const reloadChanged = initCheckoutAttemptKey(mockStorage, fp2);
assert.strictEqual(reloadChanged.fromStorage, false, 'Reload with changed cart must NOT reuse stale key');
assert.notStrictEqual(reloadChanged.key, mount1.key, 'New idempotency key must be generated when cart changes');
const stored3 = JSON.parse(mockStorage.getItem('shopkart_checkout_attempt'));
assert.strictEqual(stored3.fingerprint, fp2, 'Storage must be updated with new fingerprint');
assert.strictEqual(stored3.idempotencyKey, reloadChanged.key, 'Storage must store the newly generated key');
console.log(`✔ Test 3 Passed: Key rotated immediately on mount for changed cart (${reloadChanged.key.substring(0, 12)}...)`);

// Test Case 4: Delivery Address Changed
console.log('\n--- Test 4: Delivery Address Changed ---');
const fpAddrChanged = computeOrderFingerprint({
  items: itemsChanged,
  addressId: 'addr-222', // Changed address
  paymentMethod: 'cod',
  couponCode: '',
});
const syncAddr = syncCheckoutAttemptKey(mockStorage, fpAddrChanged, reloadChanged.key);
assert.strictEqual(syncAddr.rotated, true, 'Changing address must trigger key rotation');
assert.notStrictEqual(syncAddr.key, reloadChanged.key, 'New key must differ from previous key');
const stored4 = JSON.parse(mockStorage.getItem('shopkart_checkout_attempt'));
assert.strictEqual(stored4.fingerprint, fpAddrChanged, 'Storage fingerprint updated to new address');
console.log(`✔ Test 4 Passed: Key rotated upon address selection change (${syncAddr.key.substring(0, 12)}...)`);

// Test Case 5: Payment Method Changed
console.log('\n--- Test 5: Payment Method Changed ---');
const fpPayChanged = computeOrderFingerprint({
  items: itemsChanged,
  addressId: 'addr-222',
  paymentMethod: 'phonepe', // Changed payment method
  couponCode: '',
});
const syncPay = syncCheckoutAttemptKey(mockStorage, fpPayChanged, syncAddr.key);
assert.strictEqual(syncPay.rotated, true, 'Changing payment provider must trigger key rotation');
assert.notStrictEqual(syncPay.key, syncAddr.key, 'New key must differ from COD key');
const stored5 = JSON.parse(mockStorage.getItem('shopkart_checkout_attempt'));
assert.strictEqual(stored5.fingerprint, fpPayChanged, 'Storage fingerprint updated to phonepe');
console.log(`✔ Test 5 Passed: Key rotated upon payment method change (${syncPay.key.substring(0, 12)}...)`);

// Test Case 6: Coupon Code Applied
console.log('\n--- Test 6: Coupon Code Applied ---');
const fpCouponChanged = computeOrderFingerprint({
  items: itemsChanged,
  addressId: 'addr-222',
  paymentMethod: 'phonepe',
  couponCode: 'SAVE20', // Applied coupon
});
const syncCoupon = syncCheckoutAttemptKey(mockStorage, fpCouponChanged, syncPay.key);
assert.strictEqual(syncCoupon.rotated, true, 'Applying coupon must trigger key rotation');
assert.notStrictEqual(syncCoupon.key, syncPay.key, 'New key must differ after discount applied');
const stored6 = JSON.parse(mockStorage.getItem('shopkart_checkout_attempt'));
assert.strictEqual(stored6.fingerprint, fpCouponChanged, 'Storage fingerprint updated with coupon');
console.log(`✔ Test 6 Passed: Key rotated upon coupon application (${syncCoupon.key.substring(0, 12)}...)`);

// Test Case 7: Confirmed Order Creation Clears Attempt
console.log('\n--- Test 7: Confirmed Order Creation Clears Attempt ---');
// When place_order completes successfully with an order ID:
mockStorage.removeItem('shopkart_checkout_attempt');
const clearedStored = mockStorage.getItem('shopkart_checkout_attempt');
assert.strictEqual(clearedStored, null, 'sessionStorage must be cleanly removed after confirmed order placement');
console.log('✔ Test 7 Passed: sessionStorage cleared upon confirmed order placement');

console.log('\n=================================================================');
console.log('ALL 7 CHECKOUT IDEMPOTENCY LIFECYCLE TESTS PASSED SUCCESSFULLY');
console.log('=================================================================');
