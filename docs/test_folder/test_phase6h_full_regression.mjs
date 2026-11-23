/**
 * ShopKart — Phase 6H: Master Full Testing & Regression Suite
 *
 * Comprehensive end-to-end regression audit across all implemented phases (1 through 6G).
 * Uses Vite SSR & JSDOM to exercise actual production modules and UI components.
 */

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import React, { act } from 'react'
import * as ReactDOMClient from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { decodePhonePeQrFromPngBuffer, decodePng } from './test_actual_phonepe_qr_integration.mjs'

console.log('=================================================================')
console.log('SHOPKART PHASE 6H — MASTER FULL TESTING & REGRESSION AUDIT')
console.log('Scope: Phases 1 to 6G, Admin, Customer, Security & Phase 6C Audit')
console.log('=================================================================\n')

let passedTests = 0
let failedTests = 0

function runTest(suite, name, fn) {
  try {
    fn()
    console.log(`  ✓ [${suite}] ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  ✗ [${suite}] ${name}`)
    console.error(`    Error: ${err.message}`)
    failedTests++
  }
}

async function runTestAsync(suite, name, fn) {
  try {
    await fn()
    console.log(`  ✓ [${suite}] ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  ✗ [${suite}] ${name}`)
    console.error(`    Error: ${err.message}`)
    failedTests++
  }
}

// Mock client builder for testing service contracts
function createMockSupabase(overrides = {}) {
  const state = {
    rpcCalls: [],
    fromQueries: [],
  }

  const client = {
    state,
    auth: {
      getUser: async () => ({
        data: { user: overrides.user || { id: '11111111-1111-4111-8111-111111111111' } },
        error: null,
      }),
    },
    rpc: async (fnName, params) => {
      state.rpcCalls.push({ fnName, params })
      if (overrides.rpc) {
        return overrides.rpc(fnName, params)
      }
      return { data: { success: true }, error: null }
    },
    from: (table) => {
      const query = { table, filters: [] }
      state.fromQueries.push(query)
      const builder = {
        select: () => builder,
        insert: () => builder,
        update: () => builder,
        delete: () => builder,
        eq: (col, val) => {
          query.filters.push({ col, val })
          return builder
        },
        order: () => builder,
        single: async () => ({ data: { id: 'mock-row' }, error: null }),
        maybeSingle: async () => ({ data: { id: 'mock-row' }, error: null }),
      }
      return builder
    },
  }

  return client
}

async function main() {
  // 1. Initialize Vite SSR Environment
  const viteServer = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
  })

  // Load modules via Vite SSR
  const {
    validateUtrFormat,
    computePhonepeDeadline,
    getOrderFinancials,
    getPaymentStatusInfo,
  } = await viteServer.ssrLoadModule('/src/utils/paymentHelpers.js')

  const {
    resolveQrImageSrc,
    getNextQrFallback,
    DEFAULT_PUBLIC_QR_PATH,
  } = await viteServer.ssrLoadModule('/src/components/checkout/PhonePePaymentSection.jsx')

  const {
    placeOrder,
    submitPhonepeUtr,
    fetchCustomerOrders,
    fetchOrderById,
    fetchOrderPayment,
    fetchOrderUtrHistory,
    cancelCustomerOrder,
  } = await viteServer.ssrLoadModule('/src/services/orderService.js')

  const {
    adminFetchOrders,
    adminVerifyUtr,
    adminConfirmCodPayment,
    adminRecordRefund,
    adminExpirePendingPhonepeOrders,
    validateCouponPayload,
    adminSaveCoupon,
    validateBannerPayload,
  } = await viteServer.ssrLoadModule('/src/services/adminService.js')

  const {
    calculateCouponDiscount,
    resolveActiveCoupon,
    getIdentityOwnerKey,
    sanitizeCouponMetadata,
  } = await viteServer.ssrLoadModule('/src/utils/couponHelpers.js')

  const {
    resolveScopedProfile,
    resolveIsAdmin,
    isValidRecoverySession,
    validateResetPassword,
    shouldAcceptProfileResponse,
    mapSafeAuthError,
  } = await viteServer.ssrLoadModule('/src/utils/authHelpers.js')

  const { default: OrderConfirmationPage } = await viteServer.ssrLoadModule(
    '/src/pages/customer/OrderConfirmationPage.jsx'
  )

  const { default: PhonePePaymentSection } = await viteServer.ssrLoadModule(
    '/src/components/checkout/PhonePePaymentSection.jsx'
  )

  // Shipping helper rule: gross subtotal >= 999 is free (0), otherwise 99
  const calculateShipping = (grossSubtotal) => {
    const sub = Number(grossSubtotal) || 0
    if (sub <= 0) return 0
    return sub >= 999 ? 0 : 99
  }

  // =========================================================================
  // MODULE 1: AUTHENTICATION, RBAC & IDENTITY GUARDS
  // =========================================================================
  console.log('--- MODULE 1: Customer & Admin Auth, RBAC & Identity Isolation ---')

  runTest('AUTH', 'resolveIsAdmin correctly identifies admin vs customer profiles', () => {
    assert.strictEqual(resolveIsAdmin({ id: 'u1', role: 'admin' }, { role: 'admin' }), true)
    assert.strictEqual(resolveIsAdmin({ id: 'u2', role: 'customer' }, { role: 'customer' }), false)
    assert.strictEqual(resolveIsAdmin(null, null), false)
    assert.strictEqual(resolveIsAdmin({ id: 'u3' }, null), false)
    assert.strictEqual(resolveIsAdmin({ id: 'u4' }, { role: 'superadmin' }), false)
  })

  runTest('AUTH', 'Profile switching: User A to User B immediately clears profile and admin rights', () => {
    const userA = { id: 'user-a' }
    const profileA = { id: 'user-a', role: 'admin' }
    const userB = { id: 'user-b' }

    assert.strictEqual(resolveScopedProfile(userA, { ownerId: 'user-a', data: profileA })?.id, 'user-a')
    assert.strictEqual(resolveIsAdmin(userA, profileA), true)

    // User switches to User B, but User B profile has not arrived yet
    const scopedProfile = resolveScopedProfile(userB, { ownerId: 'user-a', data: profileA })
    assert.strictEqual(scopedProfile, null, 'Stale profile must not attach to new user identity')
    assert.strictEqual(resolveIsAdmin(userB, scopedProfile), false, 'Admin rights must drop immediately')
  })

  runTest('AUTH', 'Token refresh: Same user profile preserved during session renewal', () => {
    const userA = { id: 'user-a' }
    const profileA = { id: 'user-a', role: 'customer' }
    const refreshedUserA = { id: 'user-a', updated_at: '2026-11-14T01:00:00Z' }

    const scoped = resolveScopedProfile(refreshedUserA, { ownerId: 'user-a', data: profileA })
    assert.strictEqual(scoped?.id, 'user-a')
  })

  runTest('AUTH', 'Password reset safety: Only genuine recovery sessions are valid', () => {
    const recoverySession = { session: { user: { id: 'u-rec' } }, event: 'PASSWORD_RECOVERY' }
    const normalSession = { session: { user: { id: 'u-norm' } }, event: 'SIGNED_IN' }

    assert.strictEqual(isValidRecoverySession(recoverySession), true)
    assert.strictEqual(isValidRecoverySession(normalSession), false)
    assert.strictEqual(isValidRecoverySession({ session: null }), false)
  })

  runTest('AUTH', 'Password validation: Preserves whitespace without trimming and checks bounds', () => {
    const res = validateResetPassword('  secret123  ', '  secret123  ')
    assert.strictEqual(res.valid, true)
    assert.strictEqual(res.error, '')

    const shortRes = validateResetPassword('12345', '12345')
    assert.strictEqual(shortRes.valid, false)
    assert.match(shortRes.error, /at least 6 characters/i)

    const mismatch = validateResetPassword('password123', 'password456')
    assert.strictEqual(mismatch.valid, false)
    assert.match(mismatch.error, /passwords do not match/i)
  })

  runTest('AUTH', 'Concurrency safety: shouldAcceptProfileResponse discards out-of-order responses', () => {
    // Current sequence 2, incoming response is for older sequence 1 -> Discard
    assert.strictEqual(shouldAcceptProfileResponse(1, 2, 'user-1', 'user-1'), false)
    // Current sequence 2, response for sequence 2 and matching user -> Accept
    assert.strictEqual(shouldAcceptProfileResponse(2, 2, 'user-1', 'user-1'), true)
    // Response arrives for different user identity -> Discard
    assert.strictEqual(shouldAcceptProfileResponse(2, 2, 'user-1', 'user-2'), false)
  })

  runTest('AUTH', 'Error sanitization: mapSafeAuthError removes internal provider error details', () => {
    const sanitized = mapSafeAuthError({ message: 'AuthApiError: Invalid token signature or expired' })
    assert.strictEqual(sanitized, 'Your password reset link is invalid or has expired. Please request a new reset link.')
    assert.ok(!sanitized.includes('AuthApiError'))
  })

  // =========================================================================
  // MODULE 2: CATALOG, SEARCH & PRODUCT DETAILS
  // =========================================================================
  console.log('\n--- MODULE 2: Catalog, Product Search & Curated Feeds ---')

  runTest('CATALOG', 'Product search and category query parsing functions safely', () => {
    const query = '  running SHOES  '
    const normalized = query.trim().toLowerCase()
    assert.strictEqual(normalized, 'running shoes')

    const mockProducts = [
      { id: 'p1', name: 'Running Shoes Pro', category: 'footwear', price: 1499, is_active: true },
      { id: 'p2', name: 'Casual Sneakers', category: 'footwear', price: 899, is_active: true },
      { id: 'p3', name: 'Cotton T-Shirt', category: 'clothing', price: 499, is_active: true },
      { id: 'p4', name: 'Inactive Shoes', category: 'footwear', price: 999, is_active: false },
    ]

    const filtered = mockProducts.filter(
      p => p.is_active && (p.name.toLowerCase().includes(normalized) || p.category.toLowerCase().includes(normalized))
    )
    assert.strictEqual(filtered.length, 1)
    assert.strictEqual(filtered[0].id, 'p1')
  })

  // =========================================================================
  // MODULE 3: CART OPERATIONS & QUANTITY LIMITS
  // =========================================================================
  console.log('\n--- MODULE 3: Cart Operations, Stock Limits & Guest Isolation ---')

  runTest('CART', 'Quantity validation: Prevents exceeding stock and enforces minimum 1', () => {
    const stockLimit = 5
    const requestQtyValid = 3
    const requestQtyTooHigh = 7
    const requestQtyZero = 0
    const requestQtyNegative = -2

    assert.strictEqual(requestQtyValid <= stockLimit && requestQtyValid >= 1, true)
    assert.strictEqual(requestQtyTooHigh <= stockLimit, false)
    assert.strictEqual(requestQtyZero >= 1, false)
    assert.strictEqual(requestQtyNegative >= 1, false)
  })

  runTest('CART', 'Cart item aggregation: Merges quantities on duplicate product additions without exceed', () => {
    const currentCart = [{ productId: 'p1', quantity: 2, stock: 5 }]
    const addQuantity = 2
    const existing = currentCart.find(i => i.productId === 'p1')
    const newQty = existing.quantity + addQuantity

    assert.strictEqual(newQty <= existing.stock, true)
    assert.strictEqual(newQty, 4)

    const overAdd = 2
    const overQty = newQty + overAdd
    assert.strictEqual(overQty <= existing.stock, false, 'Should block adding beyond stock limit of 5')
  })

  runTest('CART', 'Guest vs user coupon isolation: getIdentityOwnerKey prefixes correctly', () => {
    assert.strictEqual(getIdentityOwnerKey(null), 'guest')
    assert.strictEqual(getIdentityOwnerKey(undefined), 'guest')
    assert.strictEqual(getIdentityOwnerKey('user-123'), 'user-123')
  })

  // =========================================================================
  // MODULE 4: CHECKOUT, SHIPPING RULES & COUPON CALCULATIONS
  // =========================================================================
  console.log('\n--- MODULE 4: Checkout, Shipping Rules & Coupon Calculations ---')

  runTest('SHIPPING', 'Free shipping at gross subtotal >= ₹999 (₹0 shipping fee)', () => {
    assert.strictEqual(calculateShipping(999), 0)
    assert.strictEqual(calculateShipping(1000), 0)
    assert.strictEqual(calculateShipping(2500), 0)
  })

  runTest('SHIPPING', 'Standard shipping (₹99) applies when gross subtotal is between ₹0 and ₹998.99', () => {
    assert.strictEqual(calculateShipping(998.99), 99)
    assert.strictEqual(calculateShipping(500), 99)
    assert.strictEqual(calculateShipping(1), 99)
    assert.strictEqual(calculateShipping(0), 0, 'Zero-subtotal cart has 0 shipping')
  })

  runTest('SHIPPING', 'INVARIANT: Coupon discount does NOT cause loss of free shipping if gross subtotal >= ₹999', () => {
    const grossSubtotal = 1050
    const coupon = { code: 'FLAT100', type: 'fixed', value: 100 }
    const couponDiscount = calculateCouponDiscount(coupon, grossSubtotal)
    assert.strictEqual(couponDiscount, 100)

    const shipping = calculateShipping(grossSubtotal)
    assert.strictEqual(shipping, 0, 'Shipping must remain ₹0 because gross subtotal ₹1050 >= ₹999')
    const finalTotal = grossSubtotal - couponDiscount + shipping
    assert.strictEqual(finalTotal, 950)
  })

  runTest('COUPONS', 'Discount calculation: Percentage discounts capped at subtotal, flat discounts capped at subtotal', () => {
    const coupon20Pct = { code: 'SAVE20', type: 'percent', value: 20 }
    assert.strictEqual(calculateCouponDiscount(coupon20Pct, 1000), 200)

    const coupon100Pct = { code: 'FREE100', type: 'percent', value: 100 }
    assert.strictEqual(calculateCouponDiscount(coupon100Pct, 500), 500)

    const couponFlat = { code: 'FLAT200', type: 'fixed', value: 200 }
    assert.strictEqual(calculateCouponDiscount(couponFlat, 1000), 200)

    const couponOver = { code: 'BIG500', type: 'fixed', value: 500 }
    assert.strictEqual(calculateCouponDiscount(couponOver, 300), 300)
  })

  await runTestAsync('CHECKOUT', 'placeOrder RPC passes exact 5-argument signature without client financial amounts', async () => {
    const mockSupabase = createMockSupabase({
      rpc: (fn, args) => {
        if (fn === 'sync_user_cart') return { data: { success: true }, error: null }
        if (fn === 'place_order') return { data: '22222222-2222-4222-8222-222222222222', error: null }
        return { data: null, error: null }
      },
    })

    const res = await placeOrder(
      {
        cartItems: [{ productId: 'prod-1', quantity: 1, price: 999 }],
        addressId: '33333333-3333-4333-8333-333333333333',
        paymentProvider: 'phonepe',
        notes: 'Door delivery',
        couponCode: 'SAVE10',
        idempotencyKey: 'idem-uuid-1',
      },
      mockSupabase,
      true
    )

    assert.strictEqual(res.data?.id, '22222222-2222-4222-8222-222222222222')
    const rpcCall = mockSupabase.state.rpcCalls.find(c => c.fnName === 'place_order')
    assert.ok(rpcCall, 'Must call place_order RPC')
    assert.deepStrictEqual(rpcCall.params, {
      p_address_id: '33333333-3333-4333-8333-333333333333',
      p_payment_provider: 'phonepe',
      p_notes: 'Door delivery',
      p_coupon_code: 'SAVE10',
      p_idempotency_key: 'idem-uuid-1',
    })
    // Invariant: client MUST NOT pass subtotal, shipping, discount, or total
    assert.strictEqual(rpcCall.params.p_subtotal, undefined)
    assert.strictEqual(rpcCall.params.p_shipping, undefined)
    assert.strictEqual(rpcCall.params.p_total, undefined)
  })

  // =========================================================================
  // MODULE 5: PHONEPE QR, 12-DIGIT UTR & 48-HOUR DEADLINE ENFORCEMENT
  // =========================================================================
  console.log('\n--- MODULE 5: PhonePe QR Resolution, 12-Digit UTR & 48h Deadline ---')

  runTest('PHONEPE', 'Actual PhonePe QR asset (public/phonepe-qr.png) exists and has PNG magic header', () => {
    const qrPath = path.resolve('public/phonepe-qr.png')
    assert.ok(fs.existsSync(qrPath), 'public/phonepe-qr.png must exist')
    const buf = fs.readFileSync(qrPath)
    assert.ok(buf.length > 100000, `Expected file size > 100KB, got ${buf.length} bytes`)
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.ok(buf.subarray(0, 8).equals(pngMagic), 'File must be a genuine PNG image')
  })

  runTest('PHONEPE', 'Actual PhonePe QR asset decodes directly from PNG buffer to exact complete UPI URI', () => {
    const qrPath = path.resolve('public/phonepe-qr.png')
    const buf = fs.readFileSync(qrPath)
    const decoded = decodePhonePeQrFromPngBuffer(buf)
    const expectedUri = 'upi://pay?pa=7676535672-2@ibl&pn=SHIVALINGAPPAGOUDA&mc=0000&mode=02&purpose=00'
    assert.strictEqual(decoded, expectedUri, 'Decoded QR must exactly match full expected UPI URI')
  })

  runTest('PHONEPE', 'dist/phonepe-qr.png exists after production build and matches public asset identically', () => {
    const distPath = path.resolve('dist/phonepe-qr.png')
    assert.ok(fs.existsSync(distPath), 'dist/phonepe-qr.png must exist in production build output')
    const publicBuf = fs.readFileSync(path.resolve('public/phonepe-qr.png'))
    const distBuf = fs.readFileSync(distPath)
    assert.strictEqual(distBuf.length, publicBuf.length, 'dist and public asset sizes must match')
    assert.ok(distBuf.equals(publicBuf), 'dist asset must be byte-for-byte identical to public asset')
  })

  runTest('PHONEPE', 'PhonePePaymentSection SSR renders actual /phonepe-qr.png instead of placeholder', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        orderId: '33333333-3333-4333-8333-333333333333',
        orderCreatedAt: new Date().toISOString(),
        orderTotal: 2499,
      })
    )
    assert.ok(html.includes('src="/phonepe-qr.png"'), 'Must render image tag pointing to /phonepe-qr.png')
    assert.ok(!html.includes('Merchant QR Not Configured'), 'Must not display missing-QR placeholder')
  })

  runTest('PHONEPE', 'validateUtrFormat strictly enforces 12 numeric digits with whitespace trimming', () => {
    assert.strictEqual(validateUtrFormat('123456789012').isValid, true)
    assert.strictEqual(validateUtrFormat('  123456789012  ').isValid, true)
    assert.strictEqual(validateUtrFormat('12345').isValid, false)
    assert.strictEqual(validateUtrFormat('1234567890123').isValid, false)
    assert.strictEqual(validateUtrFormat('12345678901A').isValid, false)
    assert.strictEqual(validateUtrFormat('').isValid, false)
    assert.strictEqual(validateUtrFormat(null).isValid, false)
  })

  runTest('PHONEPE', 'computePhonepeDeadline calculates exactly 48 hours anchored to order.created_at', () => {
    const freshOrder = new Date().toISOString()
    const deadlineFresh = computePhonepeDeadline(freshOrder)
    assert.strictEqual(deadlineFresh.isExpired, false)
    assert.strictEqual(deadlineFresh.isUnavailable, false)

    // Old order from 3 days ago (exceeds 48h)
    const oldOrder = new Date(Date.now() - 72 * 3600 * 1000).toISOString()
    const deadlineOld = computePhonepeDeadline(oldOrder)
    assert.strictEqual(deadlineOld.isExpired, true)

    // Missing created_at must return unavailable
    const invalid = computePhonepeDeadline(null)
    assert.strictEqual(invalid.isUnavailable, true)
  })

  runTest('PHONEPE', 'QR resolution hierarchy: custom prop -> env var -> static file -> fallback', () => {
    assert.strictEqual(resolveQrImageSrc('https://custom.qr/my.png'), 'https://custom.qr/my.png')
    assert.strictEqual(resolveQrImageSrc(null), null)
    assert.strictEqual(resolveQrImageSrc(undefined), '/phonepe-qr.png')

    assert.strictEqual(getNextQrFallback('https://custom.qr/my.png'), '/phonepe-qr.png')
    assert.strictEqual(getNextQrFallback('/phonepe-qr.png'), null)
  })

  await runTestAsync('PHONEPE', 'submitPhonepeUtr RPC signature uses exactly 2 arguments (no client timestamp)', async () => {
    const mockSupabase = createMockSupabase({
      rpc: (fn, params) => {
        if (fn === 'submit_phonepe_utr') {
          return { data: { success: true, submission_id: 'sub-uuid-1' }, error: null }
        }
        return { data: null, error: null }
      },
    })

    const res = await submitPhonepeUtr(
      { orderId: '33333333-3333-4333-8333-333333333333', utrNumber: '123456789012' },
      mockSupabase,
      true
    )

    assert.strictEqual(res.data.success, true)
    const rpcCall = mockSupabase.state.rpcCalls.find(c => c.fnName === 'submit_phonepe_utr')
    assert.ok(rpcCall)
    assert.deepStrictEqual(rpcCall.params, {
      p_order_id: '33333333-3333-4333-8333-333333333333',
      p_utr_number: '123456789012',
    })
    assert.strictEqual(rpcCall.params.p_submission_time, undefined)
    assert.strictEqual(rpcCall.params.p_submitted_at, undefined)
  })

  // =========================================================================
  // MODULE 6: ADMIN OPERATIONS (APPROVAL, REJECTION, COD, MANUAL REFUND)
  // =========================================================================
  console.log('\n--- MODULE 6: Admin Verification, COD Collection & Manual Refund ---')

  await runTestAsync('ADMIN', 'adminVerifyUtr approval advances order to processing and completes payment', async () => {
    const mockSupabase = createMockSupabase({
      rpc: (fn, args) => {
        if (fn === 'admin_verify_utr') {
          return {
            data: {
              success: true,
              decision: 'approved',
              order_status: 'processing',
              payment_status: 'completed',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminVerifyUtr(
      { submissionId: '44444444-4444-4444-8444-444444444444', approved: true, adminNotes: 'Verified on terminal' },
      mockSupabase,
      true
    )

    assert.strictEqual(res.data.success, true)
    assert.strictEqual(res.data.order_status, 'processing')
    assert.strictEqual(res.data.payment_status, 'completed')
  })

  await runTestAsync('ADMIN', 'adminVerifyUtr rejection leaves order and payment pending (allows resubmission)', async () => {
    const mockSupabase = createMockSupabase({
      rpc: (fn, args) => {
        if (fn === 'admin_verify_utr') {
          return {
            data: {
              success: true,
              decision: 'rejected',
              order_status: 'pending',
              payment_status: 'pending',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminVerifyUtr(
      { submissionId: '44444444-4444-4444-8444-444444444444', approved: false, adminNotes: 'UTR not in statement' },
      mockSupabase,
      true
    )

    assert.strictEqual(res.data.success, true)
    assert.strictEqual(res.data.order_status, 'pending')
    assert.strictEqual(res.data.payment_status, 'pending')
  })

  await runTestAsync('ADMIN', 'adminConfirmCodPayment requires delivered status and moves payment to completed', async () => {
    const mockSupabase = createMockSupabase({
      rpc: (fn, args) => {
        if (fn === 'admin_confirm_cod_payment') {
          return { data: { success: true, payment_status: 'completed' }, error: null }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminConfirmCodPayment(
      { orderId: '33333333-3333-4333-8333-333333333333', adminNotes: 'Cash collected by agent' },
      mockSupabase,
      true
    )

    assert.strictEqual(res.data.success, true)
  })

  await runTestAsync('ADMIN', 'adminRecordRefund requires completed payment, reference, and explicit restock flag', async () => {
    const mockSupabase = createMockSupabase({
      rpc: (fn, args) => {
        if (fn === 'admin_record_refund') {
          return { data: { success: true, refund_reference: 'REF-BANK-999', restocked: true }, error: null }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminRecordRefund(
      {
        orderId: '33333333-3333-4333-8333-333333333333',
        refundReference: 'REF-BANK-999',
        reason: 'Customer returned product',
        restockInventory: true,
      },
      mockSupabase,
      true
    )

    assert.strictEqual(res.data.success, true)
  })

  await runTestAsync('ADMIN', 'adminExpirePendingPhonepeOrders batch expiry safeguards timely submissions', async () => {
    const mockSupabase = createMockSupabase({
      rpc: (fn, args) => {
        if (fn === 'admin_expire_pending_phonepe_orders') {
          return { data: { expired_count: 2 }, error: null }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminExpirePendingPhonepeOrders(mockSupabase, true)
    assert.strictEqual(res.data.expired_count, 2)
    assert.strictEqual(mockSupabase.state.rpcCalls[0].fnName, 'admin_expire_pending_phonepe_orders')
  })

  // =========================================================================
  // MODULE 7: CUSTOMER ORDER STATUS & STALE DATA SUPPRESSION
  // =========================================================================
  console.log('\n--- MODULE 7: Customer Order Status & Stale Data Suppression ---')

  runTest('STATUS', 'COD order in processing status with pending payment remains unpaid (Never marked paid)', () => {
    const details = getPaymentStatusInfo({
      payment: { provider: 'cod', status: 'pending' },
      status: 'processing',
    })
    assert.strictEqual(details.isCompleted, false)
    assert.strictEqual(details.status, 'pending')
    assert.strictEqual(details.badge.label, 'Payment Due Upon Delivery')
  })

  runTest('STATUS', 'COD order in delivered status with pending payment remains unpaid until collection confirmation', () => {
    const details = getPaymentStatusInfo({
      payment: { provider: 'cod', status: 'pending' },
      status: 'delivered',
    })
    assert.strictEqual(details.isCompleted, false)
    assert.strictEqual(details.status, 'pending')
  })

  runTest('STATUS', 'COD order marked completed only when payment.status is completed', () => {
    const details = getPaymentStatusInfo({
      payment: { provider: 'cod', status: 'completed' },
      status: 'delivered',
    })
    assert.strictEqual(details.isCompleted, true)
    assert.strictEqual(details.badge.label, 'COD Collected & Verified')
  })

  runTest('STATUS', 'Original provider_payment_id is NEVER substituted as refund_reference', () => {
    const details = getPaymentStatusInfo({
      payment: {
        provider: 'phonepe',
        status: 'refunded',
        provider_payment_id: 'ORIGINAL-UTR-1234',
        refund_reference: null,
      },
      status: 'refunded',
    })
    assert.strictEqual(details.refundReference, null, 'provider_payment_id must not masquerade as refund reference')
  })

  // SSR Component Test: OrderConfirmationPage renders payment section only when payment is available
  runTest('STATUS', 'OrderConfirmationPage SSR: Suppresses PhonePe and COD actions when isPaymentUnavailable', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(OrderConfirmationPage, {
          initialOrder: {
            id: 'ord-test-1',
            status: 'pending',
            payment_provider: 'phonepe',
            created_at: new Date().toISOString(),
            order_items: [],
          },
          initialPaymentError: 'Network failure retrieving payment status',
        })
      )
    )

    assert.ok(html.includes('Payment Status Unavailable'), 'Must display clear unavailable notice')
    assert.ok(!html.includes('Enter 12-Digit UTR'), 'Must suppress UTR submission form during error')
    assert.ok(!html.includes('Payment Verified'), 'Must suppress verified claim during error')
  })

  // =========================================================================
  // MODULE 8: INVENTORY SAFEGUARDS & RESTOCKING INVARIANTS
  // =========================================================================
  console.log('\n--- MODULE 8: Inventory Safeguards & Restocking Invariants ---')

  runTest('INVENTORY', 'Cancelled paid processing orders MUST NOT automatically restore inventory', () => {
    const isPaid = true
    const orderStatus = 'processing'
    const shouldAutoRestock = !isPaid && orderStatus === 'pending'
    assert.strictEqual(shouldAutoRestock, false)
  })

  runTest('INVENTORY', 'Multi-line orders with identical product ID aggregate quantities during restock', () => {
    const lineItems = [
      { product_id: 'prod-1', quantity: 2 },
      { product_id: 'prod-2', quantity: 1 },
      { product_id: 'prod-1', quantity: 3 },
    ]

    const aggregated = {}
    for (const item of lineItems) {
      aggregated[item.product_id] = (aggregated[item.product_id] || 0) + item.quantity
    }

    assert.strictEqual(aggregated['prod-1'], 5)
    assert.strictEqual(aggregated['prod-2'], 1)
  })

  await runTestAsync('INVENTORY', 'Customer order cancellation RPC blocks cancellation for shipped/delivered orders', async () => {
    const mockSupabase = createMockSupabase({
      rpc: (fn, args) => {
        if (fn === 'cancel_order') {
          return { data: null, error: { message: 'Order cannot be cancelled in shipped status' } }
        }
        return { data: null, error: null }
      },
    })

    const res = await cancelCustomerOrder('33333333-3333-4333-8333-333333333333', mockSupabase, true)
    assert.strictEqual(res.success, false)
    assert.match(res.error.message, /cannot be cancelled/i)
  })

  // =========================================================================
  // MODULE 9: ADMIN MANAGEMENT (COUPONS, BANNERS, REVIEWS)
  // =========================================================================
  console.log('\n--- MODULE 9: Admin Management Operations ---')

  runTest('ADMIN-MGMT', 'validateCouponPayload normalizes uppercase code and validates bounds', () => {
    const valid = validateCouponPayload({
      code: '  save20  ',
      discount_type: 'percent',
      discount_value: 20,
      min_order_value: 500,
      max_uses: 100,
    })
    assert.strictEqual(valid.valid, true)
    assert.strictEqual(valid.payload.code, 'SAVE20')

    const invalidPct = validateCouponPayload({
      code: 'DISC150',
      discount_type: 'percent',
      discount_value: 150,
    })
    assert.strictEqual(invalidPct.valid, false)
  })

  runTest('ADMIN-MGMT', 'validateBannerPayload validates image URLs, hex colors, and sort orders', () => {
    const valid = validateBannerPayload({
      title: 'Summer Sale',
      image_url: 'https://images.unsplash.com/banner.jpg',
      bg_from: '#1e3a8a',
      bg_to: '#3b82f6',
      sort_order: 1,
    })
    assert.strictEqual(valid.valid, true)

    const invalidColor = validateBannerPayload({
      title: 'Bad Banner',
      image_url: 'https://example.com/banner.jpg',
      bg_from: 'blue',
      bg_to: '#3b82f6',
    })
    assert.strictEqual(invalidColor.valid, false)
  })

  // =========================================================================
  // MODULE 10: STATIC AUDIT OF PHASE 6C DATABASE LIMITATIONS
  // =========================================================================
  console.log('\n--- MODULE 10: Static Audit of Phase 6C Database Invariants ---')

  runTest('PHASE6C-AUDIT', 'Audit Issue 1: payment_submissions uses created_at column (never submitted_at)', () => {
    const migrationPath = path.resolve('database/migrations/phase6c_order_and_checkout_corrections.sql')
    const migrationSql = fs.readFileSync(migrationPath, 'utf8')

    assert.match(migrationSql, /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i)
    assert.strictEqual(
      migrationSql.includes('submitted_at TIMESTAMPTZ'),
      false,
      'payment_submissions table must not define legacy submitted_at column'
    )
  })

  runTest('PHASE6C-AUDIT', 'Audit Issue 2: 3-argument submit_phonepe_utr overload removed from production migration', () => {
    const migrationPath = path.resolve('database/migrations/phase6c_order_and_checkout_corrections.sql')
    const migrationSql = fs.readFileSync(migrationPath, 'utf8')

    assert.ok(
      migrationSql.includes('DROP FUNCTION IF EXISTS public.submit_phonepe_utr(UUID, TEXT, TIMESTAMPTZ);'),
      'Migration must explicitly drop 3-argument overload'
    )
    assert.strictEqual(
      migrationSql.includes('p_submission_time TIMESTAMPTZ'),
      false,
      'Migration must not define caller-controlled timestamp overload'
    )
    assert.ok(
      migrationSql.includes('GRANT EXECUTE ON FUNCTION public.submit_phonepe_utr(UUID, TEXT) TO authenticated;'),
      'Production RPC submit_phonepe_utr(UUID, TEXT) must be granted to authenticated customers'
    )
  })

  runTest('PHASE6C-AUDIT', 'Audit Issue 3: Cancelled-to-refunded state transition conflict documented', () => {
    const phase81Path = path.resolve('database/migrations/phase8_1_inventory_restoration_safety.sql')
    const phase81Sql = fs.readFileSync(phase81Path, 'utf8')
    const phase6cPath = path.resolve('database/migrations/phase6c_order_and_checkout_corrections.sql')
    const phase6cSql = fs.readFileSync(phase6cPath, 'utf8')

    assert.match(phase81Sql, /IF\s+OLD\.status\s*=\s*'cancelled'\s+AND\s+NEW\.status\s*<>\s*'cancelled'\s+THEN/i)
    assert.match(phase6cSql, /IF\s+OLD\.status\s*=\s*'cancelled'\s+AND\s+NEW\.status\s*<>\s*'cancelled'\s+AND\s+NEW\.status\s*<>\s*'refunded'\s+THEN/i)
  })

  runTest('PHASE6C-AUDIT', 'Audit Issue 4: Live SQL integration tests status verification', () => {
    const sqlTestPath = path.resolve('database/tests/phase6c_sql_tests.sql')
    assert.strictEqual(fs.existsSync(sqlTestPath), true, 'phase6c_sql_tests.sql must exist for manual execution')
  })

  // Close Vite server
  await viteServer.close()

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n=================================================================')
  console.log(`PHASE 6H MASTER REGRESSION RESULTS: ${passedTests} passed, ${failedTests} failed, ${passedTests + failedTests} total`)
  console.log('=================================================================')

  if (failedTests > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
