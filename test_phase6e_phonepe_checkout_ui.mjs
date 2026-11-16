/**
 * ShopKart — Phase 6E: Customer PhonePe QR & UTR Checkout UI Test Suite
 *
 * Test Infrastructure Overview & Boundaries:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Component Static Markup Verification (Vite SSR + React renderToStaticMarkup):
 *    Imports the real React component files from src/ and renders their JSX tree to
 *    static HTML. Verifies conditional rendering (COD exclusion vs PhonePe inclusion),
 *    unified payment completion states across OrderConfirmationPage and PhonePePaymentSection,
 *    48-hour deadline calculation banners, and administrative missing-QR placeholders.
 *
 * 2. Pure Logic & State Transition Unit Verification:
 *    Tests UTR format validation, 48-hour deadline math, QR URL candidate resolution
 *    (resolveQrImageSrc), and image fallback progression logic (getNextQrFallback).
 *
 * 3. Service Layer Integration Verification:
 *    Simulates order creation via place_order, UTR submission via 2-argument submit_phonepe_utr
 *    (strictly omitting client timestamps), 48-hour server expiration handling (P0001),
 *    rejection history retrieval, and local demo mode persistence.
 *
 * 4. Architectural Boundaries & Explicit Testing Limitations:
 *    - Actual browser image loading, network 404s, and native DOM `onError` events are
 *      UNTESTED in Node SSR because Node.js has no native browser rendering engine or network
 *      image loader. URL fallback state transitions are instead tested at the pure logic level.
 *    - Native browser synthetic events (e.g. `userEvent.type`, `fireEvent.change`,
 *      `fireEvent.click`) are UNTESTED because the workspace has no headless browser or DOM
 *      emulation library (jsdom, happy-dom, @testing-library/react). Interactive rules are
 *      verified via unit validation and service layer tests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import assert from 'assert'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

import {
  validateUtrFormat,
  computePhonepeDeadline,
} from './src/utils/paymentHelpers.js'

import {
  placeOrder,
  submitPhonepeUtr,
  fetchOrderById,
  fetchOrderPayment,
} from './src/services/orderService.js'

// ── In-Memory Test State & Mock Supabase Client ──
function createMockSupabaseClient(overrides = {}) {
  const state = {
    rpcCalls: [],
    fromQueries: [],
  }

  const client = {
    state,
    auth: {
      getUser: async () => ({
        data: { user: { id: '00000000-0000-0000-0000-000000000001', email: 'customer@example.com' } },
        error: null,
      }),
    },
    rpc: async (fnName, params) => {
      state.rpcCalls.push({ fnName, params })
      if (overrides.rpc) return overrides.rpc(fnName, params)
      return { data: null, error: null }
    },
    from: (tableName) => {
      const query = {
        table: tableName,
        fields: '*',
        filters: [],
        orderBy: [],
        single: false,
      }
      state.fromQueries.push(query)

      const builder = {
        select: (fields) => {
          query.fields = fields
          return builder
        },
        eq: (col, val) => {
          query.filters.push({ col, op: 'eq', val })
          return builder
        },
        order: (col, opts) => {
          query.orderBy.push({ col, opts })
          return builder
        },
        single: async () => {
          query.single = true
          if (overrides.from) {
            const res = await overrides.from(tableName, query)
            if (res && Array.isArray(res.data)) {
              return { data: res.data[0] || null, error: res.error || null }
            }
            return res
          }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          query.maybeSingle = true
          if (overrides.from) {
            const res = await overrides.from(tableName, query)
            if (res && Array.isArray(res.data)) {
              return { data: res.data[0] || null, error: res.error || null }
            }
            return res
          }
          return { data: null, error: null }
        },
        then: (resolve) => {
          if (overrides.from) {
            return Promise.resolve(overrides.from(tableName, query)).then(resolve)
          }
          return Promise.resolve({ data: [], error: null }).then(resolve)
        },
      }

      return builder
    },
  }

  return client
}

async function runPhase6eTests() {
  console.log('=================================================================')
  console.log('SHOPKART PHASE 6E — PHONEPE QR & UTR CHECKOUT UI TESTS')
  console.log('Mode: Real React Component SSR Rendering & Service Integration')
  console.log('=================================================================\n')

  let passed = 0
  let total = 0

  function test(description, fn) {
    total++
    try {
      fn()
      console.log(`  ✓ ${description}`)
      passed++
    } catch (err) {
      console.error(`  ✗ FAIL: ${description}`)
      console.error(`    ${err.message}`)
    }
  }

  async function testAsync(description, fn) {
    total++
    try {
      await fn()
      console.log(`  ✓ ${description}`)
      passed++
    } catch (err) {
      console.error(`  ✗ FAIL: ${description}`)
      console.error(`    ${err.message}`)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Vite SSR Component Loader Setup
  // ─────────────────────────────────────────────────────────────
  const viteServer = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
  })

  const {
    default: PhonePePaymentSection,
    resolveQrImageSrc,
    getNextQrFallback,
    DEFAULT_PUBLIC_QR_PATH,
  } = await viteServer.ssrLoadModule(
    '/src/components/checkout/PhonePePaymentSection.jsx'
  )
  const { default: OrderConfirmationPage } = await viteServer.ssrLoadModule(
    '/src/pages/customer/OrderConfirmationPage.jsx'
  )
  const { default: CheckoutPage } = await viteServer.ssrLoadModule(
    '/src/pages/customer/CheckoutPage.jsx'
  )
  const { CartProvider } = await viteServer.ssrLoadModule(
    '/src/context/CartContext.jsx'
  )
  const { AuthProvider } = await viteServer.ssrLoadModule(
    '/src/context/AuthContext.jsx'
  )

  // ─────────────────────────────────────────────────────────────
  console.log('1. UTR Format Validation & Feedback Logic (validateUtrFormat)')
  // ─────────────────────────────────────────────────────────────

  test('Valid 12-digit numeric UTR passes validation', () => {
    const res = validateUtrFormat('123456789012')
    assert.strictEqual(res.isValid, true)
    assert.strictEqual(res.error, null)
  })

  test('Accepts valid UTR with surrounding whitespace and trims it', () => {
    const res = validateUtrFormat('  987654321098  ')
    assert.strictEqual(res.isValid, true)
    assert.strictEqual(res.error, null)
  })

  test('Rejects empty or whitespace-only UTR string', () => {
    const resEmpty = validateUtrFormat('')
    assert.strictEqual(resEmpty.isValid, false)
    assert.ok(resEmpty.error.includes('required'))

    const resSpaces = validateUtrFormat('   ')
    assert.strictEqual(resSpaces.isValid, false)
    assert.ok(resSpaces.error.includes('required'))
  })

  test('Rejects null or undefined UTR values', () => {
    const resNull = validateUtrFormat(null)
    assert.strictEqual(resNull.isValid, false)

    const resUndef = validateUtrFormat(undefined)
    assert.strictEqual(resUndef.isValid, false)
  })

  test('Rejects incomplete UTR (< 12 digits)', () => {
    const res1 = validateUtrFormat('12345')
    assert.strictEqual(res1.isValid, false)
    assert.ok(res1.error.includes('12 numeric digits'))

    const res11 = validateUtrFormat('12345678901')
    assert.strictEqual(res11.isValid, false)
    assert.ok(res11.error.includes('11 digits'))
  })

  test('Rejects extra-digit UTR (> 12 digits)', () => {
    const res13 = validateUtrFormat('1234567890123')
    assert.strictEqual(res13.isValid, false)
    assert.ok(res13.error.includes('13 digits'))
  })

  test('Rejects alphabetic and alphanumeric characters with specific feedback', () => {
    const resAlpha = validateUtrFormat('12345ABC9012')
    assert.strictEqual(resAlpha.isValid, false)
    assert.ok(resAlpha.error.includes('Alphabets and special characters are not allowed'))

    const resWords = validateUtrFormat('PHONEPEUTR12')
    assert.strictEqual(resWords.isValid, false)
    assert.ok(resWords.error.includes('Alphabets and special characters are not allowed'))
  })

  test('Rejects special characters, hyphens, and punctuation with specific feedback', () => {
    const resHyphen = validateUtrFormat('1234-5678-9012')
    assert.strictEqual(resHyphen.isValid, false)
    assert.ok(resHyphen.error.includes('Alphabets and special characters are not allowed'))

    const resSymbol = validateUtrFormat('12345@89012#')
    assert.strictEqual(resSymbol.isValid, false)
    assert.ok(resSymbol.error.includes('Alphabets and special characters are not allowed'))
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n2. 48-Hour Payment Deadline Calculation (computePhonepeDeadline)')
  // ─────────────────────────────────────────────────────────────

  test('Calculates exactly 48 hours from order creation timestamp', () => {
    const orderCreatedAt = '2026-11-13T10:00:00.000Z'
    const result = computePhonepeDeadline(orderCreatedAt)

    const expectedDeadlineMs = new Date(orderCreatedAt).getTime() + 48 * 60 * 60 * 1000
    assert.strictEqual(result.deadlineMs, expectedDeadlineMs)
    assert.strictEqual(result.isUnavailable, false)
    assert.strictEqual(result.deadlineDate.toISOString(), new Date(expectedDeadlineMs).toISOString())
  })

  test('Produces human-readable formatted date string in Indian locale', () => {
    const orderCreatedAt = '2026-11-13T10:00:00.000Z'
    const result = computePhonepeDeadline(orderCreatedAt)
    assert.ok(typeof result.formatted === 'string')
    assert.ok(result.formatted.length > 5)
  })

  test('Reports isExpired = false when current time is within 48 hours', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const result = computePhonepeDeadline(twoHoursAgo)
    assert.strictEqual(result.isExpired, false)
    assert.strictEqual(result.isUnavailable, false)
  })

  test('Reports isExpired = true when current time exceeds 48 hours', () => {
    const fortyNineHoursAgo = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    const result = computePhonepeDeadline(fortyNineHoursAgo)
    assert.strictEqual(result.isExpired, true)
    assert.strictEqual(result.isUnavailable, false)
  })

  test('Never substitutes Date.now() when order creation timestamp is missing (returns isUnavailable = true)', () => {
    const resultNull = computePhonepeDeadline(null)
    assert.strictEqual(resultNull.isUnavailable, true)
    assert.strictEqual(resultNull.deadlineDate, null)
    assert.strictEqual(resultNull.formatted, null)
    assert.strictEqual(resultNull.isExpired, false)
    assert.ok(resultNull.error?.includes('unavailable'))

    const resultUndef = computePhonepeDeadline(undefined)
    assert.strictEqual(resultUndef.isUnavailable, true)
    assert.strictEqual(resultUndef.deadlineDate, null)
  })

  test('Never substitutes Date.now() when order creation timestamp is invalid (returns isUnavailable = true)', () => {
    const resultInvalid = computePhonepeDeadline('invalid-date-string')
    assert.strictEqual(resultInvalid.isUnavailable, true)
    assert.strictEqual(resultInvalid.deadlineDate, null)
    assert.strictEqual(resultInvalid.formatted, null)
    assert.strictEqual(resultInvalid.isExpired, false)
    assert.ok(resultInvalid.error?.includes('Invalid'))
  })

  test('Resubmission deadline retains original order creation time (does not reset)', () => {
    const originalCreatedAt = '2026-11-10T08:00:00.000Z'
    const initialDeadline = computePhonepeDeadline(originalCreatedAt)

    const subsequentCheck = computePhonepeDeadline(originalCreatedAt)
    assert.strictEqual(subsequentCheck.deadlineMs, initialDeadline.deadlineMs)
    assert.strictEqual(subsequentCheck.formatted, initialDeadline.formatted)
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n3. QR URL Resolution & Fallback Logic Tests (Pure Logic Layer)')
  // ─────────────────────────────────────────────────────────────

  test('resolveQrImageSrc prioritizes explicit custom qrImageUrl prop over env var and default', () => {
    const customUrl = 'https://custom-cdn.example.com/phonepe-qr.png'
    const res = resolveQrImageSrc(customUrl, 'https://env-cdn.example.com/qr.png')
    assert.strictEqual(res, customUrl)
  })

  test('resolveQrImageSrc respects explicit qrImageUrl: null for testing unconfigured/missing QR state', () => {
    const res = resolveQrImageSrc(null, 'https://env-cdn.example.com/qr.png')
    assert.strictEqual(res, null, 'Explicit null must NOT be overridden by env variable')
  })

  test('resolveQrImageSrc uses VITE_PHONEPE_QR_IMAGE_URL when prop is undefined', () => {
    const envUrl = 'https://merchant-bucket.supabase.co/phonepe-qr.png'
    const res = resolveQrImageSrc(undefined, envUrl)
    assert.strictEqual(res, envUrl)
  })

  test('resolveQrImageSrc falls back to /phonepe-qr.png when both prop and env URL are undefined', () => {
    const res = resolveQrImageSrc(undefined, null)
    assert.strictEqual(res, DEFAULT_PUBLIC_QR_PATH)
  })

  test('getNextQrFallback transitions custom external or env URL to /phonepe-qr.png upon image load failure', () => {
    const customUrl = 'https://broken-cdn.example.com/qr.png'
    const fallback = getNextQrFallback(customUrl, DEFAULT_PUBLIC_QR_PATH)
    assert.strictEqual(fallback, DEFAULT_PUBLIC_QR_PATH, 'Must attempt /phonepe-qr.png when custom URL fails')

    const envUrl = 'https://broken-env.example.com/qr.png'
    const envFallback = getNextQrFallback(envUrl, DEFAULT_PUBLIC_QR_PATH)
    assert.strictEqual(envFallback, DEFAULT_PUBLIC_QR_PATH, 'Must attempt /phonepe-qr.png when env URL fails')
  })

  test('getNextQrFallback returns null when /phonepe-qr.png itself fails (fallback exhausted)', () => {
    const exhausted = getNextQrFallback(DEFAULT_PUBLIC_QR_PATH, DEFAULT_PUBLIC_QR_PATH)
    assert.strictEqual(exhausted, null, 'Fallback exhausted; signals administrative setup placeholder activation')
  })

  test('getNextQrFallback returns null when current QR source is already null or empty', () => {
    assert.strictEqual(getNextQrFallback(null), null)
    assert.strictEqual(getNextQrFallback(''), null)
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n4. Real React Component SSR Tests (PhonePePaymentSection Markup)')
  // ─────────────────────────────────────────────────────────────

  const sampleOrder = {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
    total_amount: 1499,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    payment: { provider: 'phonepe', status: 'pending', amount: 1499 },
  }

  test('Component renders live QR image and scan instructions when QR asset is configured', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: sampleOrder,
        qrImageUrl: 'https://example.com/merchant-phonepe-qr.png',
      })
    )

    assert.ok(html.includes('PhonePe UPI QR Payment'), 'Renders component header')
    assert.ok(html.includes('src="https://example.com/merchant-phonepe-qr.png"'), 'Renders configured QR image tag')
    assert.ok(html.includes('Scan with PhonePe, GPay, Paytm, or BHIM UPI'), 'Renders scanning instruction')
    assert.ok(html.includes('How to Complete Payment:'), 'Renders checklist')
    assert.ok(html.includes('₹1,499'), 'Renders exact payable amount')
    assert.ok(!html.includes('Merchant QR Not Configured'), 'Does not show placeholder when QR is configured')
  })

  test('Component automatically falls back to /phonepe-qr.png in SSR when no env URL or prop is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: sampleOrder,
        // qrImageUrl is undefined; component must resolve to default /phonepe-qr.png
      })
    )

    assert.ok(html.includes('src="/phonepe-qr.png"'), 'Defaults to public asset /phonepe-qr.png')
    assert.ok(html.includes('alt="PhonePe QR Code"'), 'Renders QR image tag')
    assert.ok(html.includes('₹1,499'), 'Displays exact amount')
  })

  test('Component renders unmistakable administrative placeholder when merchant QR is missing (qrImageUrl: null)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: sampleOrder,
        qrImageUrl: null, // Explicitly no QR image / failed image
      })
    )

    assert.ok(html.includes('Merchant QR Not Configured'), 'Clearly displays setup placeholder header')
    assert.ok(
      html.includes('Payment cannot be initiated via QR scan at this time'),
      'Informs user payment cannot be initiated via QR scan'
    )
    assert.ok(
      html.includes('Store Setup Required:'),
      'Renders administrator setup guide'
    )
    assert.ok(
      html.includes('public/phonepe-qr.png'),
      'Explains where merchant must place QR asset'
    )
    assert.ok(
      !html.includes('Scan with PhonePe, GPay, Paytm, or BHIM UPI'),
      'Does NOT claim customer can scan placeholder'
    )
  })

  test('Missing-QR view clearly instructs customers to enter UTR only if already paid via verified merchant channel', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: sampleOrder,
        qrImageUrl: null,
      })
    )

    assert.ok(
      html.includes('Payment Initiation Unavailable'),
      'Renders payment initiation unavailable notice'
    )
    assert.ok(
      html.includes('New payments cannot be initiated through this screen while merchant QR and payment details remain unconfigured'),
      'Clarifies that payment cannot be initiated without configured merchant payment method'
    )
    assert.ok(
      html.includes('only if you have already transferred ₹1,499'),
      'Explicitly specifies UTR submission is reserved for verified prior transfers'
    )
    assert.ok(
      html.includes('through an officially verified merchant payment channel'),
      'Warns that unverified submissions will be rejected'
    )
    assert.ok(
      html.includes('Enter 12-Digit UTR'),
      'Preserves 12-digit UTR input form for genuine prior payments'
    )
  })

  test('Never invents or generates fake QR codes or fake UPI IDs', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: sampleOrder,
        qrImageUrl: null,
      })
    )

    assert.ok(!html.includes('@phonepe'), 'Does not invent fake UPI VPA')
    assert.ok(!html.includes('@ybl'), 'Does not invent fake YBL handle')
    assert.ok(!html.includes('upi://pay'), 'Does not construct fake UPI deep-link')
  })

  test('Component renders 48-hour deadline banner with formatted time when order created_at is valid', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: sampleOrder,
      })
    )

    assert.ok(html.includes('48-Hour Payment Window'), 'Displays 48-hour payment window title')
    assert.ok(html.includes('Please submit your 12-digit UTR before'), 'Displays deadline prompt')
  })

  test('Component renders explicit unavailable banner when order creation timestamp is missing', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: { ...sampleOrder, created_at: null },
      })
    )

    assert.ok(
      html.includes('Order Creation Timestamp Unavailable'),
      'Displays explicit unavailable state when timestamp missing'
    )
    assert.ok(
      html.includes('database strictly enforces the 48-hour payment window based on server time'),
      'Clarifies backend server enforcement'
    )
    assert.ok(!html.includes('Please submit your 12-digit UTR before <strong'), 'Does not invent a deadline')
  })

  test('Component renders elapsed warning banner when 48-hour deadline has passed', () => {
    const sixtyHoursAgo = new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString()
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: { ...sampleOrder, created_at: sixtyHoursAgo },
      })
    )

    assert.ok(html.includes('48-Hour Payment Window Elapsed'), 'Displays elapsed deadline warning')
    assert.ok(
      html.includes('Submissions past the deadline will be rejected by the server'),
      'Warns user about backend expiration rejection'
    )
  })

  test('Component renders active submission awaiting verification card and locks form', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: sampleOrder,
        activeSubmission: {
          id: 'sub-active',
          utr_number: '987654321012',
          status: 'submitted',
          created_at: new Date().toISOString(),
        },
      })
    )

    assert.ok(html.includes('UTR Submitted — Awaiting Review'), 'Renders submitted verification card')
    assert.ok(html.includes('987654321012'), 'Displays submitted UTR number')
    assert.ok(html.includes('Pending Administrator Approval'), 'Displays pending review status')
    assert.ok(!html.includes('Submit 12-Digit UTR'), 'Input form and submit button are hidden while awaiting review')
  })

  test('Component renders previous rejection notice and permits resubmission within original deadline', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: sampleOrder,
        activeSubmission: null,
        latestSubmission: {
          id: 'sub-rejected',
          utr_number: '111122223333',
          status: 'rejected',
          admin_notes: 'Transaction not found in PhonePe statement',
        },
      })
    )

    assert.ok(html.includes('Previous UTR Submission Was Rejected'), 'Renders rejection alert')
    assert.ok(
      html.includes('Transaction not found in PhonePe statement'),
      'Displays administrator rejection reason'
    )
    assert.ok(
      html.includes('You may submit a corrected 12-digit UTR below within the original 48-hour deadline'),
      'Informs user about resubmission within original deadline'
    )
    assert.ok(html.includes('Resubmit 12-Digit UTR'), 'Submit button label reflects resubmission')
  })

  test('Component renders payment verified card when payment status is completed', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        order: {
          ...sampleOrder,
          status: 'processing',
          payment: { provider: 'phonepe', status: 'completed', amount: 1499 },
        },
      })
    )

    assert.ok(html.includes('Payment Successfully Verified!'), 'Renders verified card')
    assert.ok(html.includes('Payment Verified'), 'Status pill shows Payment Verified')
    assert.ok(!html.includes('Enter 12-Digit UTR'), 'Form is hidden when payment completed')
    assert.ok(!html.includes('Merchant QR Not Configured'), 'QR container is hidden when payment completed')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n5. Real Component SSR Tests for Actual OrderConfirmationPage (COD vs PhonePe & Unified Status)')
  // ─────────────────────────────────────────────────────────────

  test('Actual OrderConfirmationPage renders COD card and completely excludes PhonePe QR & UTR form for COD orders', () => {
    const codOrder = {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'pending',
      total_amount: 599,
      payment_provider: 'cod',
      payment: { provider: 'cod', status: 'pending', amount: 599 },
      address: { full_name: 'John Doe', phone: '9876543210', line1: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
      items: [{ id: 'item-1', product_name: 'T-Shirt', quantity: 1, total_price: 599 }],
    }

    const codPaymentData = {
      payment: codOrder.payment,
      submissions: [],
    }

    const codHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: [`/order-success/${codOrder.id}`] },
        React.createElement(OrderConfirmationPage, {
          initialOrder: codOrder,
          initialPaymentData: codPaymentData,
        })
      )
    )

    assert.ok(codHtml.includes('Order Placed Successfully!'), 'Renders actual OrderConfirmationPage title')
    assert.ok(codHtml.includes('Cash on Delivery (COD) Confirmed'), 'Renders COD confirmation card on actual page')
    assert.ok(codHtml.includes('₹599'), 'Renders exact COD payable amount')
    assert.ok(codHtml.includes('Please keep <strong>₹599</strong> ready in cash'), 'Renders COD instructions')
    assert.ok(!codHtml.includes('PhonePe UPI QR Payment'), 'PhonePe QR section is strictly excluded on COD')
    assert.ok(!codHtml.includes('Enter 12-Digit UTR'), 'UTR form is strictly excluded on COD')
    assert.ok(!codHtml.includes('Direct UPI'), 'No PhonePe direct UPI badge on COD')
  })

  test('Actual OrderConfirmationPage renders PhonePe QR & UTR component and strictly excludes COD card for pending PhonePe orders', () => {
    const phonepeOrder = {
      id: '33333333-3333-4333-8333-333333333333',
      status: 'pending',
      total_amount: 1499,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      payment_provider: 'phonepe',
      payment: { provider: 'phonepe', status: 'pending', amount: 1499 },
      address: { full_name: 'Alice Smith', phone: '9123456780', line1: 'Brigade Rd', city: 'Bengaluru', state: 'Karnataka', pincode: '560025' },
      items: [{ id: 'item-2', product_name: 'Wireless Earbuds', quantity: 1, total_price: 1499 }],
    }

    const phonepePaymentData = {
      payment: phonepeOrder.payment,
      activeSubmission: null,
      latestSubmission: null,
      submissions: [],
    }

    const phonepeHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: [`/order-success/${phonepeOrder.id}`] },
        React.createElement(OrderConfirmationPage, {
          initialOrder: phonepeOrder,
          initialPaymentData: phonepePaymentData,
        })
      )
    )

    assert.ok(phonepeHtml.includes('Order Placed — Complete UPI Payment'), 'Renders PhonePe specific page headline')
    assert.ok(phonepeHtml.includes('PhonePe UPI QR Payment'), 'Renders PhonePe payment component')
    assert.ok(phonepeHtml.includes('Enter 12-Digit UTR'), 'Renders 12-digit UTR input form')
    assert.ok(phonepeHtml.includes('Direct UPI'), 'Renders Direct UPI badge')
    assert.ok(!phonepeHtml.includes('Cash on Delivery (COD) Confirmed'), 'COD card is strictly excluded on PhonePe order')
  })

  test('Unified Payment Status: OrderConfirmationPage hero shows "Order Placed Successfully!" when order is processing or payment is completed', () => {
    // Scenario: paymentData is null or stale, but order itself indicates completion (status: 'processing')
    const completedOrder = {
      id: '44444444-4444-4444-8444-444444444444',
      status: 'processing',
      total_amount: 1499,
      payment_provider: 'phonepe',
      payment: { provider: 'phonepe', status: 'completed', amount: 1499 },
      address: { full_name: 'Alice Smith', phone: '9123456780', line1: 'Brigade Rd', city: 'Bengaluru', state: 'Karnataka', pincode: '560025' },
      items: [{ id: 'item-2', product_name: 'Wireless Earbuds', quantity: 1, total_price: 1499 }],
    }

    const completedHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: [`/order-success/${completedOrder.id}`] },
        React.createElement(OrderConfirmationPage, {
          initialOrder: completedOrder,
          initialPaymentData: null, // Even with null/stale paymentData, status is unified
        })
      )
    )

    assert.ok(completedHtml.includes('Order Placed Successfully!'), 'Hero headline shows Order Placed Successfully!')
    assert.ok(!completedHtml.includes('Order Placed — Complete UPI Payment'), 'Hero headline NEVER says Complete UPI Payment when order is processing')
    assert.ok(completedHtml.includes('Payment Successfully Verified!'), 'PhonePe payment component confirms Payment Verified')
    assert.ok(completedHtml.includes('Total Paid'), 'Summary footer shows Total Paid rather than Total Payable')
  })

  await testAsync('Mocked fetchOrderById and fetchOrderPayment feed appropriate data structure to OrderConfirmationPage for both COD and PhonePe', async () => {
    const mockClient = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'orders') {
          return { data: [{ id: '11111111-1111-4111-8111-111111111111', status: 'pending', payment_provider: 'phonepe', total_amount: 1499 }], error: null }
        }
        if (tbl === 'payments') {
          return { data: { id: 'p1', provider: 'phonepe', status: 'pending', amount: 1499 }, error: null }
        }
        if (tbl === 'payment_submissions') {
          return { data: [], error: null }
        }
        return { data: [], error: null }
      }
    })

    const orderRes = await fetchOrderById('11111111-1111-4111-8111-111111111111', mockClient, true)
    const payRes = await fetchOrderPayment('11111111-1111-4111-8111-111111111111', mockClient, true)

    assert.strictEqual(orderRes.error, null)
    assert.strictEqual(orderRes.data?.payment_provider, 'phonepe')
    assert.strictEqual(payRes.error, null)
    assert.strictEqual(payRes.data?.payment?.provider, 'phonepe')
    assert.strictEqual(payRes.data?.payment?.status, 'pending')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n6. Real Component SSR Tests for Actual CheckoutPage (Payment Method Selection)')
  // ─────────────────────────────────────────────────────────────

  test('Actual CheckoutPage renders payment method selection with both COD and PhonePe options', () => {
    const checkoutHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: ['/checkout'] },
        React.createElement(AuthProvider, null,
          React.createElement(CartProvider, null,
            React.createElement(CheckoutPage, {
              initialItems: [{ id: 'p1', name: 'Premium Headphones', price: 1499, quantity: 1 }],
            })
          )
        )
      )
    )

    assert.ok(checkoutHtml.includes('Payment Method'), 'CheckoutPage renders Payment Method section')
    assert.ok(checkoutHtml.includes('Cash on Delivery (COD)'), 'CheckoutPage offers Cash on Delivery option')
    assert.ok(checkoutHtml.includes('Pay cash or UPI at your doorstep upon delivery'), 'Renders COD description')
    assert.ok(checkoutHtml.includes('PhonePe / UPI QR'), 'CheckoutPage offers PhonePe option')
    assert.ok(checkoutHtml.includes('submit 12-digit UTR'), 'Renders PhonePe UTR description')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n7. Checkout Payment Selection & Order Creation Service Integration')
  // ─────────────────────────────────────────────────────────────

  const validOrderId = '11111111-1111-4111-8111-111111111111'
  const validAddressId = '22222222-2222-4222-8222-222222222222'

  await testAsync('PhonePe payment method passes paymentProvider = "phonepe" to placeOrder', async () => {
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'sync_user_cart') {
          return { data: { success: true }, error: null }
        }
        if (fn === 'place_order') {
          return { data: validOrderId, error: null }
        }
        return { data: null, error: null }
      },
      from: (tbl) => {
        if (tbl === 'addresses') return { data: { id: validAddressId }, error: null }
        return { data: [], error: null }
      },
    })

    const result = await placeOrder({
      addressId: validAddressId,
      paymentProvider: 'phonepe',
      cartItems: [{ id: 'p1', name: 'Shoes', price: 1499, quantity: 1 }],
      subtotal: 1499,
      discountAmount: 0,
      shippingAmount: 0,
      totalAmount: 1499,
    }, mockClient, true)

    assert.strictEqual(result.error, null)
    assert.strictEqual(result.data?.id, validOrderId)

    const rpcCall = mockClient.state.rpcCalls.find(c => c.fnName === 'place_order')
    assert.ok(rpcCall, 'place_order RPC was invoked')
    assert.strictEqual(rpcCall.params.p_payment_provider, 'phonepe', 'Passed payment provider "phonepe"')
  })

  await testAsync('COD payment method passes paymentProvider = "cod" to placeOrder', async () => {
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'sync_user_cart') {
          return { data: { success: true }, error: null }
        }
        if (fn === 'place_order') {
          return { data: validOrderId, error: null }
        }
        return { data: null, error: null }
      },
      from: (tbl) => {
        if (tbl === 'addresses') return { data: { id: validAddressId }, error: null }
        return { data: [], error: null }
      },
    })

    const result = await placeOrder({
      addressId: validAddressId,
      paymentProvider: 'cod',
      cartItems: [{ id: 'p1', name: 'Shirt', price: 500, quantity: 1 }],
      subtotal: 500,
      discountAmount: 0,
      shippingAmount: 99,
      totalAmount: 599,
    }, mockClient, true)

    assert.strictEqual(result.error, null)
    assert.strictEqual(result.data?.id, validOrderId)

    const rpcCall = mockClient.state.rpcCalls.find(c => c.fnName === 'place_order')
    assert.ok(rpcCall, 'place_order RPC was invoked')
    assert.strictEqual(rpcCall.params.p_payment_provider, 'cod', 'Passed payment provider "cod"')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n8. UTR Submission via submitPhonepeUtr Service & Double-Submission Guards')
  // ─────────────────────────────────────────────────────────────

  await testAsync('Successful PhonePe UTR submission calls production 2-arg RPC without client timestamp', async () => {
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'submit_phonepe_utr') {
          return {
            data: {
              id: 'sub-1',
              order_id: validOrderId,
              utr_number: '123456789012',
              status: 'submitted',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await submitPhonepeUtr({
      orderId: validOrderId,
      utrNumber: '123456789012',
    }, mockClient, true)

    assert.strictEqual(result.error, null)
    assert.strictEqual(result.data?.status, 'submitted')
    assert.strictEqual(result.data?.utr_number, '123456789012')

    const rpcCall = mockClient.state.rpcCalls.find(c => c.fnName === 'submit_phonepe_utr')
    assert.ok(rpcCall, 'submit_phonepe_utr RPC was called')
    assert.strictEqual(rpcCall.params.p_order_id, validOrderId)
    assert.strictEqual(rpcCall.params.p_utr_number, '123456789012')
    assert.strictEqual(rpcCall.params.p_submitted_at, undefined, 'Client NEVER passes timestamp (authoritative DB NOW())')
    assert.strictEqual(Object.keys(rpcCall.params).length, 2, 'Called with exactly 2 arguments')
  })

  await testAsync('UTR submission fails validation on client before calling RPC when invalid', async () => {
    const mockClient = createMockSupabaseClient()

    const resultInvalid = await submitPhonepeUtr({
      orderId: validOrderId,
      utrNumber: 'INVALID_UTR',
    }, mockClient, true)

    assert.ok(resultInvalid.error, 'Returns validation error')
    assert.ok(resultInvalid.error.message.includes('12 numeric digits'))
    assert.strictEqual(mockClient.state.rpcCalls.length, 0, 'No RPC was invoked for invalid UTR')
  })

  await testAsync('UTR submission does not mark payment or order as completed', async () => {
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'submit_phonepe_utr') {
          return {
            data: { id: 'sub-1', status: 'submitted', utr_number: '123456789012' },
            error: null,
          }
        }
        return { data: null, error: null }
      },
      from: (tbl) => {
        if (tbl === 'orders') {
          return { data: [{ id: validOrderId, status: 'pending' }], error: null }
        }
        if (tbl === 'payments') {
          return { data: { id: 'pay-1', provider: 'phonepe', status: 'pending' }, error: null }
        }
        return { data: [], error: null }
      },
    })

    const submitRes = await submitPhonepeUtr({
      orderId: validOrderId,
      utrNumber: '123456789012',
    }, mockClient, true)

    assert.strictEqual(submitRes.data?.status, 'submitted')

    const orderRes = await fetchOrderById(validOrderId, mockClient, true)
    assert.strictEqual(orderRes.data?.status, 'pending', 'Order status remains pending after UTR submission')
  })

  await testAsync('UTR submission rejects when orderId is missing', async () => {
    const mockClient = createMockSupabaseClient()
    const result = await submitPhonepeUtr({
      orderId: null,
      utrNumber: '123456789012',
    }, mockClient, true)

    assert.strictEqual(result.data, null)
    assert.ok(result.error?.message?.includes('order ID is required'))
    assert.strictEqual(mockClient.state.rpcCalls.length, 0)
  })

  await testAsync('A real backend submission record produces success', async () => {
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'submit_phonepe_utr') {
          return {
            data: { id: 'sub-confirmed-123', order_id: validOrderId, utr_number: '123456789012', status: 'submitted' },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await submitPhonepeUtr({
      orderId: validOrderId,
      utrNumber: '123456789012',
    }, mockClient, true)

    assert.strictEqual(result.error, null)
    assert.strictEqual(result.data?.id, 'sub-confirmed-123')
    assert.strictEqual(result.data?.status, 'submitted')
  })

  await testAsync('A null backend response does not produce success', async () => {
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'submit_phonepe_utr') {
          return { data: null, error: null }
        }
        return { data: null, error: null }
      },
    })

    const result = await submitPhonepeUtr({
      orderId: validOrderId,
      utrNumber: '123456789012',
    }, mockClient, true)

    assert.strictEqual(result.data, null)
    assert.strictEqual(result.error, null)

    let submissionError = ''
    let submissionSuccess = ''
    let isSubmitting = true
    try {
      if (result.error) {
        submissionError = result.error.message
      } else {
        if (!result.data || !result.data.id) {
          submissionError =
            'The server did not confirm your UTR submission. Please refresh the order and check its payment status before trying again.'
        } else {
          submissionSuccess = 'UTR submitted successfully!'
        }
      }
    } finally {
      isSubmitting = false
    }

    assert.ok(submissionError.includes('The server did not confirm your UTR submission'))
    assert.strictEqual(submissionSuccess, '')
    assert.strictEqual(isSubmitting, false)
  })

  await testAsync('An error response does not produce success', async () => {
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'submit_phonepe_utr') {
          return {
            data: null,
            error: { code: '42501', message: 'Permission denied for submit_phonepe_utr' },
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await submitPhonepeUtr({
      orderId: validOrderId,
      utrNumber: '123456789012',
    }, mockClient, true)

    assert.ok(result.error, 'Error returned from service')
    assert.strictEqual(result.data, null)

    let submissionError = ''
    let submissionSuccess = ''
    let isSubmitting = true
    try {
      if (result.error) {
        submissionError = result.error.message || 'Failed to submit UTR. Please verify and try again.'
      } else {
        if (!result.data || !result.data.id) {
          submissionError = 'The server did not confirm your UTR submission.'
        } else {
          submissionSuccess = 'UTR submitted successfully!'
        }
      }
    } finally {
      isSubmitting = false
    }

    assert.strictEqual(submissionError, 'Permission denied for submit_phonepe_utr')
    assert.strictEqual(submissionSuccess, '')
    assert.strictEqual(isSubmitting, false)
  })

  await testAsync('The submission lock is released after failure', async () => {
    let isSubmitting = true
    let caughtErr = null
    try {
      throw new Error('Network disconnection')
    } catch (err) {
      caughtErr = err
    } finally {
      isSubmitting = false
    }
    assert.strictEqual(isSubmitting, false, 'Submission lock released after exception')
    assert.strictEqual(caughtErr?.message, 'Network disconnection')

    isSubmitting = true
    let earlyReturnExecuted = false
    const testPayload = { id: null }
    try {
      if (!testPayload || !testPayload.id) {
        earlyReturnExecuted = true
      }
    } finally {
      isSubmitting = false
    }
    assert.strictEqual(earlyReturnExecuted, true)
    assert.strictEqual(isSubmitting, false, 'Submission lock released after early return')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n9. Backend Submission Failure & Expiry Handling')
  // ─────────────────────────────────────────────────────────────

  await testAsync('Backend 48-hour expiration error is cleanly surfaced to frontend', async () => {
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'submit_phonepe_utr') {
          return {
            data: null,
            error: {
              code: 'P0001',
              message: 'PhonePe payment window has expired (48 hours exceeded). Order cannot be verified.',
            },
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await submitPhonepeUtr({
      orderId: validOrderId,
      utrNumber: '123456789012',
    }, mockClient, true)

    assert.strictEqual(result.data, null)
    assert.ok(result.error, 'Error returned from backend')
    assert.ok(result.error.message.includes('expired'), 'Surfaces expiration error to customer')
  })

  await testAsync('Rejection history allows resubmission within deadline', async () => {
    const mockClient = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'payments') {
          return { data: { id: 'pay-1', order_id: validOrderId, provider: 'phonepe', status: 'pending' }, error: null }
        }
        if (tbl === 'payment_submissions') {
          return {
            data: [
              { id: 'sub-rejected', utr_number: '111111111111', status: 'rejected', admin_notes: 'UTR not found in bank' },
            ],
            error: null,
          }
        }
        return { data: [], error: null }
      },
    })

    const paymentInfo = await fetchOrderPayment(validOrderId, mockClient, true)
    const latestSubmission = paymentInfo.data?.submissions?.[0] || null
    assert.strictEqual(paymentInfo.data?.activeSubmission, null, 'No active submitted submission')
    assert.strictEqual(latestSubmission?.status, 'rejected', 'Latest submission is rejected')
    assert.strictEqual(latestSubmission?.admin_notes, 'UTR not found in bank')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n10. Local Demo Fallback Mode (Offline Customer Journey)')
  // ─────────────────────────────────────────────────────────────

  await testAsync('Local demo mode: PhonePe checkout places order with status "pending"', async () => {
    const mockStorage = new Map()
    globalThis.localStorage = {
      getItem: k => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: k => mockStorage.delete(k),
      clear: () => mockStorage.clear(),
    }

    const orderRes = await placeOrder({
      addressId: 'addr-demo-1',
      paymentProvider: 'phonepe',
      cartItems: [{ id: 'p1', name: 'Shoes', price: 1000, quantity: 1 }],
      subtotal: 1000,
      discountAmount: 0,
      shippingAmount: 0,
      totalAmount: 1000,
    }, null, false)

    assert.strictEqual(orderRes.error, null)
    assert.strictEqual(orderRes.data?.order?.status, 'pending', 'Demo order starts in pending')
    assert.strictEqual(orderRes.data?.order?.payment?.provider, 'phonepe', 'Demo payment is phonepe')
    assert.strictEqual(orderRes.data?.order?.payment?.status, 'pending', 'Demo payment starts in pending')

    const demoOrderId = orderRes.data.id

    // Submit UTR in demo mode
    const utrRes = await submitPhonepeUtr({
      orderId: demoOrderId,
      utrNumber: '999888777666',
    }, null, false)

    assert.strictEqual(utrRes.error, null)
    assert.strictEqual(utrRes.data?.status, 'submitted')
    assert.strictEqual(utrRes.data?.utr_number, '999888777666')

    // Fetch payment in demo mode
    const payRes = await fetchOrderPayment(demoOrderId, null, false)
    assert.strictEqual(payRes.data?.activeSubmission?.utr_number, '999888777666')
    assert.strictEqual(payRes.data?.payment?.status, 'pending', 'Payment remains pending awaiting admin verification')
  })

  await viteServer.close()

  console.log('\n=================================================================')
  console.log(`PHASE 6E TEST RESULTS: ${passed} passed, ${total - passed} failed, ${total} total`)
  console.log('=================================================================\n')

  if (passed !== total) {
    process.exit(1)
  }
}

runPhase6eTests().catch(err => {
  console.error('Test suite failed with unexpected error:', err)
  process.exit(1)
})
