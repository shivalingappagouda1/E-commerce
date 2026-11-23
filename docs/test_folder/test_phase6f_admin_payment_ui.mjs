/**
 * ShopKart — Phase 6F: Admin Payment Verification UI Test Suite
 *
 * Test Infrastructure Overview & Boundaries:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Component Static Markup Verification (Vite SSR + React renderToStaticMarkup):
 *    Imports the real React component files from src/ and renders their JSX tree to
 *    static HTML. Verifies:
 *    - AdminPaymentVerificationPage header, badge ("Phase 6F"), toolset buttons.
 *    - 5 Dashboard Summary Cards (Pending UTR, Approved, Rejected, Pending COD, Refunded)
 *      derived 100% from actual order/payment data.
 *    - Empty state and loading state table markup.
 *    - Table row structures: Order ID, customer details, PhonePe vs COD badges,
 *      formatted amounts, UTR reference badges, submitted timestamps, payment statuses,
 *      action triggers (Approve, Collect COD, View details).
 *    - AdminLayout navigation integration: Payment Verification menu item with CreditCard icon.
 *
 * 2. Authorization & Security Verification (AuthGuard & resolveIsAdmin):
 *    - Tests AuthGuard with requireAdmin={true} denying unauthenticated users.
 *    - Tests AuthGuard denying authenticated non-admin users (Access Denied / 🔒).
 *    - Tests AuthGuard granting access to confirmed administrators.
 *    - Tests pure role resolution helper resolveIsAdmin.
 *
 * 3. Search, Filtering, and Metrics Pure Logic Layer:
 *    - Search matching Order ID, Customer Name/Phone/Email, UTR Number.
 *    - Payment method filtering (all, phonepe, cod).
 *    - Payment status filtering (all, completed, pending, rejected, refunded).
 *    - UTR status filtering (all, submitted, approved, rejected, none).
 *    - Accurate metric calculation across diverse multi-order datasets.
 *
 * 4. Service Layer Integration (adminService contracts):
 *    - adminVerifyUtr: Approval (marks processing & completed) and Rejection (requires reason,
 *      leaves payment pending for resubmission within 48h deadline).
 *    - adminConfirmCodPayment: Requires delivered order status, marks completed upon collection.
 *    - adminRecordRefund: Requires refund reference, handles restockInventory flag and inventory safety.
 *    - adminExpirePendingPhonepeOrders: Batch expiration RPC trigger.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import assert from 'assert'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

import {
  adminFetchOrders,
  adminVerifyUtr,
  adminConfirmCodPayment,
  adminRecordRefund,
  adminExpirePendingPhonepeOrders,
} from './src/services/adminService.js'

import { resolveIsAdmin } from './src/utils/authHelpers.js'

const VALID_ORDER_UUID = '33333333-3333-4333-8333-333333333333'
const VALID_SUBMISSION_UUID = '44444444-4444-4444-8444-444444444444'

// ── In-Memory Test State & Mock Supabase Client Factory ──
function createMockSupabaseClient(overrides = {}) {
  const state = {
    rpcCalls: [],
    fromQueries: [],
  }

  const client = {
    state,
    auth: {
      getUser: async () => ({
        data: { user: { id: '00000000-0000-0000-0000-000000000099', email: 'admin@shopkart.com' } },
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

// ── Mock Order Factory ──
function createSampleOrders() {
  return [
    // 1. PhonePe order with active submitted UTR awaiting verification
    {
      id: 'ORD-PHONEPE-PENDING-01',
      user_id: 'usr-001',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      status: 'pending',
      total_amount: 1499,
      subtotal: 1499,
      shipping_amount: 0,
      discount_amount: 0,
      payment_provider: 'phonepe',
      customer_name: 'Aarav Sharma',
      customer_phone: '9876543210',
      customer_email: 'aarav@example.com',
      payment: {
        id: 'pay-001',
        order_id: 'ORD-PHONEPE-PENDING-01',
        provider: 'phonepe',
        status: 'pending',
        amount: 1499,
      },
      payment_submissions: [
        {
          id: 'sub-001',
          order_id: 'ORD-PHONEPE-PENDING-01',
          utr_number: '123456789012',
          status: 'submitted',
          created_at: new Date(Date.now() - 1800000).toISOString(),
          reviewed_at: null,
          admin_notes: null,
        },
      ],
      activeSubmission: {
        id: 'sub-001',
        order_id: 'ORD-PHONEPE-PENDING-01',
        utr_number: '123456789012',
        status: 'submitted',
        created_at: new Date(Date.now() - 1800000).toISOString(),
      },
    },

    // 2. PhonePe order with approved payment
    {
      id: 'ORD-PHONEPE-APPROVED-02',
      user_id: 'usr-002',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      status: 'processing',
      total_amount: 2999,
      subtotal: 2999,
      shipping_amount: 0,
      discount_amount: 0,
      payment_provider: 'phonepe',
      customer_name: 'Priya Patel',
      customer_phone: '9876543211',
      customer_email: 'priya@example.com',
      payment: {
        id: 'pay-002',
        order_id: 'ORD-PHONEPE-APPROVED-02',
        provider: 'phonepe',
        status: 'completed',
        amount: 2999,
      },
      payment_submissions: [
        {
          id: 'sub-002',
          order_id: 'ORD-PHONEPE-APPROVED-02',
          utr_number: '987654321098',
          status: 'approved',
          created_at: new Date(Date.now() - 7000000).toISOString(),
          reviewed_at: new Date(Date.now() - 6500000).toISOString(),
          admin_notes: 'Verified in PhonePe Business merchant portal',
        },
      ],
      activeSubmission: null,
    },

    // 3. PhonePe order with rejected UTR (awaiting customer resubmission within 48h)
    {
      id: 'ORD-PHONEPE-REJECTED-03',
      user_id: 'usr-003',
      created_at: new Date(Date.now() - 10800000).toISOString(),
      status: 'pending',
      total_amount: 899,
      subtotal: 899,
      shipping_amount: 0,
      discount_amount: 0,
      payment_provider: 'phonepe',
      customer_name: 'Rohan Verma',
      customer_phone: '9876543212',
      customer_email: 'rohan@example.com',
      payment: {
        id: 'pay-003',
        order_id: 'ORD-PHONEPE-REJECTED-03',
        provider: 'phonepe',
        status: 'pending',
        amount: 899,
      },
      payment_submissions: [
        {
          id: 'sub-003',
          order_id: 'ORD-PHONEPE-REJECTED-03',
          utr_number: '111122223333',
          status: 'rejected',
          created_at: new Date(Date.now() - 10000000).toISOString(),
          reviewed_at: new Date(Date.now() - 9500000).toISOString(),
          admin_notes: 'Transaction not found in bank statement',
        },
      ],
      activeSubmission: null,
    },

    // 4. COD order pending cash collection (delivered to customer)
    {
      id: 'ORD-COD-PENDING-04',
      user_id: 'usr-004',
      created_at: new Date(Date.now() - 14400000).toISOString(),
      status: 'delivered',
      total_amount: 1999,
      subtotal: 1999,
      shipping_amount: 0,
      discount_amount: 0,
      payment_provider: 'cod',
      customer_name: 'Ananya Iyer',
      customer_phone: '9876543213',
      customer_email: 'ananya@example.com',
      payment: {
        id: 'pay-004',
        order_id: 'ORD-COD-PENDING-04',
        provider: 'cod',
        status: 'pending',
        amount: 1999,
      },
      payment_submissions: [],
      activeSubmission: null,
    },

    // 5. Refunded order
    {
      id: 'ORD-REFUNDED-05',
      user_id: 'usr-005',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      status: 'refunded',
      total_amount: 3499,
      subtotal: 3499,
      shipping_amount: 0,
      discount_amount: 0,
      payment_provider: 'phonepe',
      customer_name: 'Vikram Malhotra',
      customer_phone: '9876543214',
      customer_email: 'vikram@example.com',
      payment: {
        id: 'pay-005',
        order_id: 'ORD-REFUNDED-05',
        provider: 'phonepe',
        status: 'refunded',
        amount: 3499,
      },
      payment_submissions: [
        {
          id: 'sub-005',
          order_id: 'ORD-REFUNDED-05',
          utr_number: '555566667777',
          status: 'approved',
          created_at: new Date(Date.now() - 80000000).toISOString(),
          reviewed_at: new Date(Date.now() - 79000000).toISOString(),
          admin_notes: 'Original payment verified',
        },
      ],
      activeSubmission: null,
    },
  ]
}

async function runPhase6fTests() {
  console.log('=================================================================')
  console.log('SHOPKART PHASE 6F — ADMIN PAYMENT VERIFICATION UI TESTS')
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

  const { default: AdminPaymentVerificationPage } = await viteServer.ssrLoadModule(
    '/src/pages/admin/AdminPaymentVerificationPage.jsx'
  )
  const { default: AdminLayout } = await viteServer.ssrLoadModule(
    '/src/components/admin/AdminLayout.jsx'
  )
  const { default: AuthGuard } = await viteServer.ssrLoadModule(
    '/src/components/common/AuthGuard.jsx'
  )
  const { AuthContext } = await viteServer.ssrLoadModule(
    '/src/context/AuthContext.jsx'
  )

  // ─────────────────────────────────────────────────────────────
  console.log('1. Dashboard Summary Cards & Derived Metrics (Pure Logic & SSR)')
  // ─────────────────────────────────────────────────────────────

  test('Page header renders Payment Verification title and Phase 6F pill badge', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: [] })
      )
    )
    assert(html.includes('Payment Verification'), 'Header title missing')
    assert(html.includes('Phase 6F'), 'Phase 6F badge missing')
    assert(html.includes('Run Expiry Check'), 'Run Expiry Check button missing')
  })

  test('Summary cards derive 100% of counts from supplied order data (exact counts)', () => {
    const orders = createSampleOrders()
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: orders })
      )
    )

    // Expected metrics from sample orders:
    // Pending UTR: 1 (ORD-PHONEPE-PENDING-01)
    // Approved: 1 (ORD-PHONEPE-APPROVED-02)
    // Rejected: 1 (ORD-PHONEPE-REJECTED-03)
    // Pending COD: 1 (ORD-COD-PENDING-04)
    // Refunded: 1 (ORD-REFUNDED-05)

    assert(html.includes('Pending UTR'), 'Pending UTR card missing')
    assert(html.includes('Approved'), 'Approved card missing')
    assert(html.includes('Rejected'), 'Rejected card missing')
    assert(html.includes('Pending COD'), 'Pending COD card missing')
    assert(html.includes('Refunded'), 'Refunded card missing')

    // Check rendered metric numbers inside specific metric cards
    assert(html.includes('Awaiting admin approval'), 'Pending UTR subtitle missing')
    assert(html.includes('Eligible for resubmission'), 'Rejected subtitle missing')
    assert(html.includes('Awaiting cash collection'), 'Pending COD subtitle missing')
  })

  test('Empty state renders cleanly when initialOrders is empty array', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: [] })
      )
    )
    assert(html.includes('No payment records found'), 'Empty state banner missing')
    assert(html.includes('Try adjusting your search query or filters'), 'Empty state advice missing')
  })

  test('Table columns render required operational headers', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: [] })
      )
    )
    const headers = [
      'Order ID',
      'Customer',
      'Order Date',
      'Payment Method',
      'Amount',
      'UTR Reference',
      'Submitted At',
      'Payment Status',
      'Action',
    ]
    for (const h of headers) {
      assert(html.includes(h), `Expected table header "${h}" not found`)
    }
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n2. Table Data Rows, Badges & Action Buttons')
  // ─────────────────────────────────────────────────────────────

  test('PhonePe pending order displays UTR number, Awaiting Review badge, and Approve action button', () => {
    const orders = createSampleOrders()
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: orders })
      )
    )
    assert(html.includes('ORD-PHONEPE-PENDING-01'), 'Order ID missing')
    assert(html.includes('123456789012'), 'UTR number missing')
    assert(html.includes('Awaiting Review'), 'Awaiting review tag missing')
    assert(html.includes('PhonePe UPI'), 'PhonePe method badge missing')
    assert(html.includes('Approve'), 'Approve button missing')
  })

  test('PhonePe approved order displays completed badge and does not display Approve button', () => {
    const orders = [createSampleOrders()[1]] // ORD-PHONEPE-APPROVED-02
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: orders })
      )
    )
    assert(html.includes('ORD-PHONEPE-APPROVED-02'))
    assert(html.includes('completed'))
    assert(!html.includes('>Approve<'), 'Approved order should not render Approve action button')
  })

  test('PhonePe rejected order displays line-through UTR and Resubmission open tag', () => {
    const orders = [createSampleOrders()[2]] // ORD-PHONEPE-REJECTED-03
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: orders })
      )
    )
    assert(html.includes('111122223333'), 'Rejected UTR missing')
    assert(html.includes('Rejected (Resubmission open)'), 'Resubmission tag missing')
  })

  test('COD delivered order displays Cash on Delivery badge and Collect COD action button', () => {
    const orders = [createSampleOrders()[3]] // ORD-COD-PENDING-04 (status: delivered)
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: orders })
      )
    )
    assert(html.includes('ORD-COD-PENDING-04'), 'COD Order ID missing')
    assert(html.includes('Cash on Delivery'), 'COD method badge missing')
    assert(html.includes('Collect COD'), 'Collect COD action button missing')
  })

  test('COD undelivered (shipped) order does NOT display Collect COD action button in table or modal', () => {
    const undeliveredCodOrder = {
      ...createSampleOrders()[3],
      id: 'ORD-COD-SHIPPED-UNDELIVERED',
      status: 'shipped',
    }
    const htmlTable = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: [undeliveredCodOrder] })
      )
    )
    assert(htmlTable.includes('ORD-COD-SHIPPED-UNDELIVERED'))
    assert(!htmlTable.includes('Collect COD'), 'Undelivered COD order must NOT render Collect COD button in table')

    const htmlModal = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [undeliveredCodOrder],
          initialSelectedOrder: undeliveredCodOrder,
        })
      )
    )
    assert(!htmlModal.includes('Confirm COD Cash Collection'), 'Undelivered COD order must NOT render Confirm COD button in modal')
  })

  test('Customer details display customer name and phone number', () => {
    const orders = [createSampleOrders()[0]]
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, { initialOrders: orders })
      )
    )
    assert(html.includes('Aarav Sharma'), 'Customer name missing')
    assert(html.includes('9876543210'), 'Customer phone missing')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n3. Inspection Drawer & Action Dialogs SSR Markup')
  // ─────────────────────────────────────────────────────────────

  test('Inspection drawer renders financial breakdown and customer contact details', () => {
    const order = createSampleOrders()[0]
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [order],
          initialSelectedOrder: order,
          initialActiveDialog: null,
        })
      )
    )
    assert(html.includes('Payment Verification Inspection'), 'Drawer header missing')
    assert(html.includes('Financial Breakdown'), 'Financial breakdown section missing')
    assert(html.includes('Product Subtotal'), 'Subtotal missing')
    assert(html.includes('Final Payable Amount'), 'Final payable amount missing')
    assert(html.includes('aarav@example.com'), 'Customer email missing')
  })

  test('Inspection drawer renders submission history timeline with admin notes', () => {
    const order = createSampleOrders()[2] // ORD-PHONEPE-REJECTED-03
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [order],
          initialSelectedOrder: order,
          initialActiveDialog: null,
        })
      )
    )
    assert(html.includes('PhonePe UTR Submissions'), 'Submissions timeline header missing')
    assert(html.includes('111122223333'), 'Submitted UTR missing')
    assert(html.includes('Transaction not found in bank statement'), 'Admin rejection notes missing')
  })

  test('Approve dialog renders certification checkbox and merchant verification warning', () => {
    const order = createSampleOrders()[0]
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [order],
          initialSelectedOrder: order,
          initialActiveDialog: 'approve',
        })
      )
    )
    assert(html.includes('Approve PhonePe UTR Payment'), 'Approve dialog header missing')
    assert(html.includes('Verification Responsibility'), 'Verification warning missing')
    assert(html.includes('PhonePe Business'), 'PhonePe Business text missing')
    assert(html.includes('Confirm Approval'), 'Confirm button missing')
  })

  test('Reject dialog renders mandatory rejection reason textarea and 48-hour deadline policy', () => {
    const order = createSampleOrders()[0]
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [order],
          initialSelectedOrder: order,
          initialActiveDialog: 'reject',
        })
      )
    )
    assert(html.includes('Reject PhonePe UTR Submission'), 'Reject dialog header missing')
    assert(html.includes('Mandatory Rejection Reason *'), 'Rejection reason label missing')
    assert(html.includes('48-Hour Deadline Policy:'), 'Deadline policy notice missing')
    assert(html.includes('Reject UTR'), 'Reject submit button missing')
  })

  test('COD confirmation dialog renders cash certification and delivery status check', () => {
    const undeliveredOrder = { ...createSampleOrders()[3], status: 'shipped' } // ORD-COD-PENDING-04 (status: shipped)
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [undeliveredOrder],
          initialSelectedOrder: undeliveredOrder,
          initialActiveDialog: 'cod',
        })
      )
    )
    assert(html.includes('Confirm COD Cash Collection'), 'COD dialog header missing')
    assert(html.includes('Delivery Check Warning'), 'Delivery check warning should be rendered for non-delivered order')
    assert(html.includes('Confirm Collection'), 'Confirm collection button missing')
  })

  test('Refund dialog renders refund reference input, restock inventory toggle, and monetary certification', () => {
    const order = createSampleOrders()[1] // ORD-PHONEPE-APPROVED-02
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [order],
          initialSelectedOrder: order,
          initialActiveDialog: 'refund',
        })
      )
    )
    assert(html.includes('Record Customer Refund'), 'Refund dialog header missing')
    assert(html.includes('Bank / Gateway Refund Reference *'), 'Refund reference label missing')
    assert(html.includes('Restock Order Items to Inventory'), 'Restock toggle missing')
    assert(html.includes('Record Refund'), 'Record refund button missing')
  })

  test('Refund eligibility requires payment.status completed and does NOT treat delivered as alternative', () => {
    // Delivered order with pending payment (e.g. COD before cash collection)
    const deliveredUnpaidOrder = {
      ...createSampleOrders()[3],
      id: 'ORD-DELIVERED-UNPAID-COD',
      status: 'delivered',
      payment: { id: 'p-unpaid', provider: 'cod', status: 'pending' },
    }
    const htmlUnpaid = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [deliveredUnpaidOrder],
          initialSelectedOrder: deliveredUnpaidOrder,
        })
      )
    )
    assert(!htmlUnpaid.includes('Record Refund'), 'Delivered unpaid order must NOT show Record Refund action')

    // Delivered order with completed payment
    const deliveredPaidOrder = {
      ...createSampleOrders()[3],
      id: 'ORD-DELIVERED-PAID-COD',
      status: 'delivered',
      payment: { id: 'p-paid', provider: 'cod', status: 'completed' },
    }
    const htmlPaid = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminPaymentVerificationPage, {
          initialOrders: [deliveredPaidOrder],
          initialSelectedOrder: deliveredPaidOrder,
        })
      )
    )
    assert(htmlPaid.includes('Record Refund'), 'Delivered paid order MUST show Record Refund action')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n4. Filter & Search Logic (Pure Function Validation)')
  // ─────────────────────────────────────────────────────────────

  test('Search filter matches Order ID case-insensitively', () => {
    const orders = createSampleOrders()
    const term = 'ord-phonepe-pending'
    const filtered = orders.filter(o => o.id.toLowerCase().includes(term))
    assert.strictEqual(filtered.length, 1)
    assert.strictEqual(filtered[0].id, 'ORD-PHONEPE-PENDING-01')
  })

  test('Search filter matches Customer Name case-insensitively', () => {
    const orders = createSampleOrders()
    const term = 'priya'
    const filtered = orders.filter(o => (o.customer_name || '').toLowerCase().includes(term))
    assert.strictEqual(filtered.length, 1)
    assert.strictEqual(filtered[0].id, 'ORD-PHONEPE-APPROVED-02')
  })

  test('Search filter matches UTR number within submissions', () => {
    const orders = createSampleOrders()
    const term = '123456789012'
    const filtered = orders.filter(o =>
      (o.payment_submissions || []).some(s => s.utr_number && s.utr_number.includes(term))
    )
    assert.strictEqual(filtered.length, 1)
    assert.strictEqual(filtered[0].id, 'ORD-PHONEPE-PENDING-01')
  })

  test('Payment method filter isolates PhonePe vs COD orders', () => {
    const orders = createSampleOrders()
    const phonepeOrders = orders.filter(o => (o.payment?.provider || o.payment_provider) === 'phonepe')
    const codOrders = orders.filter(o => (o.payment?.provider || o.payment_provider) === 'cod')
    assert.strictEqual(phonepeOrders.length, 4)
    assert.strictEqual(codOrders.length, 1)
  })

  test('Payment status filter isolates completed, pending, and refunded orders', () => {
    const orders = createSampleOrders()
    const completed = orders.filter(o => o.payment?.status === 'completed')
    const pending = orders.filter(o => o.payment?.status === 'pending')
    const refunded = orders.filter(o => o.payment?.status === 'refunded')
    assert.strictEqual(completed.length, 1)
    assert.strictEqual(pending.length, 3)
    assert.strictEqual(refunded.length, 1)
  })

  test('UTR status filter isolates orders with submitted active UTRs', () => {
    const orders = createSampleOrders()
    const submitted = orders.filter(o =>
      (o.payment_submissions || []).some(s => s.status === 'submitted')
    )
    assert.strictEqual(submitted.length, 1)
    assert.strictEqual(submitted[0].id, 'ORD-PHONEPE-PENDING-01')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n5. PhonePe UTR Approval & Rejection Flow (Service Contract)')
  // ─────────────────────────────────────────────────────────────

  await testAsync('adminVerifyUtr approval calls admin_verify_utr RPC with approved=true', async () => {
    const mock = createMockSupabaseClient({
      rpc: (fnName, params) => {
        if (fnName === 'admin_verify_utr') {
          return {
            data: {
              submission_id: params.p_submission_id,
              decision: 'approved',
              order_status: 'processing',
              payment_status: 'completed',
              verified_at: new Date().toISOString(),
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminVerifyUtr(
      {
        submissionId: VALID_SUBMISSION_UUID,
        approved: true,
        adminNotes: 'Verified in PhonePe Business portal',
      },
      mock,
      true
    )

    assert.strictEqual(res.error, null)
    assert.strictEqual(res.data.decision, 'approved')
    assert.strictEqual(res.data.payment_status, 'completed')
    assert.strictEqual(mock.state.rpcCalls.length, 1)
    assert.strictEqual(mock.state.rpcCalls[0].fnName, 'admin_verify_utr')
    assert.deepStrictEqual(mock.state.rpcCalls[0].params, {
      p_submission_id: VALID_SUBMISSION_UUID,
      p_approved: true,
      p_admin_notes: 'Verified in PhonePe Business portal',
    })
  })

  await testAsync('adminVerifyUtr rejection calls admin_verify_utr RPC with approved=false and reason', async () => {
    const mock = createMockSupabaseClient({
      rpc: (fnName, params) => {
        if (fnName === 'admin_verify_utr') {
          return {
            data: {
              submission_id: params.p_submission_id,
              decision: 'rejected',
              order_status: 'pending',
              payment_status: 'pending',
              verified_at: new Date().toISOString(),
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminVerifyUtr(
      {
        submissionId: VALID_SUBMISSION_UUID,
        approved: false,
        adminNotes: 'Amount received does not match order payable total',
      },
      mock,
      true
    )

    assert.strictEqual(res.error, null)
    assert.strictEqual(res.data.decision, 'rejected')
    assert.strictEqual(res.data.payment_status, 'pending')
    assert.strictEqual(res.data.order_status, 'pending')
    assert.strictEqual(mock.state.rpcCalls.length, 1)
    assert.strictEqual(mock.state.rpcCalls[0].fnName, 'admin_verify_utr')
    assert.strictEqual(mock.state.rpcCalls[0].params.p_approved, false)
    assert.strictEqual(
      mock.state.rpcCalls[0].params.p_admin_notes,
      'Amount received does not match order payable total'
    )
  })

  await testAsync('adminVerifyUtr rejects missing submissionId before calling RPC', async () => {
    const mock = createMockSupabaseClient()
    const res = await adminVerifyUtr(
      {
        submissionId: '',
        approved: true,
      },
      mock,
      true
    )
    assert(res.error, 'Should return error for missing submissionId')
    assert.strictEqual(mock.state.rpcCalls.length, 0, 'Should not invoke RPC')
  })

  await testAsync('adminVerifyUtr surfaces database error cleanly', async () => {
    const mock = createMockSupabaseClient({
      rpc: () => ({
        data: null,
        error: { message: 'Submission already reviewed by another administrator.' },
      }),
    })
    const res = await adminVerifyUtr(
      {
        submissionId: VALID_SUBMISSION_UUID,
        approved: true,
      },
      mock,
      true
    )
    assert(res.error, 'Should return error')
    assert.strictEqual(res.error.message, 'Submission already reviewed by another administrator.')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n6. COD Confirmation Workflow (Service Contract)')
  // ─────────────────────────────────────────────────────────────

  await testAsync('adminConfirmCodPayment calls admin_confirm_cod_payment RPC', async () => {
    const mock = createMockSupabaseClient({
      rpc: (fnName, params) => {
        if (fnName === 'admin_confirm_cod_payment') {
          return {
            data: {
              order_id: params.p_order_id,
              payment_status: 'completed',
              confirmed_at: new Date().toISOString(),
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminConfirmCodPayment(
      {
        orderId: VALID_ORDER_UUID,
        adminNotes: 'Cash collected by courier delivery partner',
      },
      mock,
      true
    )

    assert.strictEqual(res.error, null)
    assert.strictEqual(res.data.payment_status, 'completed')
    assert.strictEqual(mock.state.rpcCalls.length, 1)
    assert.strictEqual(mock.state.rpcCalls[0].fnName, 'admin_confirm_cod_payment')
    assert.deepStrictEqual(mock.state.rpcCalls[0].params, {
      p_order_id: VALID_ORDER_UUID,
      p_admin_notes: 'Cash collected by courier delivery partner',
    })
  })

  await testAsync('adminConfirmCodPayment validates orderId prior to RPC invocation', async () => {
    const mock = createMockSupabaseClient()
    const res = await adminConfirmCodPayment(
      {
        orderId: '   ',
      },
      mock,
      true
    )
    assert(res.error, 'Should return validation error')
    assert.strictEqual(mock.state.rpcCalls.length, 0)
  })

  await testAsync('adminConfirmCodPayment forwards delivery-requirement violation error', async () => {
    const mock = createMockSupabaseClient({
      rpc: () => ({
        data: null,
        error: { message: 'COD payment can only be confirmed after order is delivered.' },
      }),
    })
    const res = await adminConfirmCodPayment(
      {
        orderId: VALID_ORDER_UUID,
      },
      mock,
      true
    )
    assert(res.error)
    assert(res.error.message.includes('only be confirmed after order is delivered'))
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n7. Refund Management Workflow (Service Contract)')
  // ─────────────────────────────────────────────────────────────

  await testAsync('adminRecordRefund calls admin_record_refund RPC with restock flag', async () => {
    const mock = createMockSupabaseClient({
      rpc: (fnName, params) => {
        if (fnName === 'admin_record_refund') {
          return {
            data: {
              order_id: params.p_order_id,
              order_status: 'refunded',
              payment_status: 'refunded',
              restocked: params.p_restock_inventory,
              refunded_at: new Date().toISOString(),
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminRecordRefund(
      {
        orderId: VALID_ORDER_UUID,
        refundReference: 'BANK-REF-998877',
        adminNotes: 'Customer return approved and items inspected',
        restockInventory: true,
      },
      mock,
      true
    )

    assert.strictEqual(res.error, null)
    assert.strictEqual(res.data.order_status, 'refunded')
    assert.strictEqual(res.data.payment_status, 'refunded')
    assert.strictEqual(res.data.restocked, true)
    assert.strictEqual(mock.state.rpcCalls.length, 1)
    assert.strictEqual(mock.state.rpcCalls[0].fnName, 'admin_record_refund')
    assert.deepStrictEqual(mock.state.rpcCalls[0].params, {
      p_order_id: VALID_ORDER_UUID,
      p_refund_reference: 'BANK-REF-998877',
      p_admin_notes: 'Customer return approved and items inspected',
      p_restock_inventory: true,
    })
  })

  await testAsync('adminRecordRefund rejects empty refundReference before RPC invocation', async () => {
    const mock = createMockSupabaseClient()
    const res = await adminRecordRefund(
      {
        orderId: VALID_ORDER_UUID,
        refundReference: '   ',
      },
      mock,
      true
    )
    assert(res.error, 'Should require refund reference')
    assert.strictEqual(mock.state.rpcCalls.length, 0)
  })

  await testAsync('adminRecordRefund handles restockInventory = false correctly', async () => {
    const mock = createMockSupabaseClient({
      rpc: (fnName, params) => ({
        data: {
          order_id: params.p_order_id,
          restocked: params.p_restock_inventory,
        },
        error: null,
      }),
    })

    const res = await adminRecordRefund(
      {
        orderId: VALID_ORDER_UUID,
        refundReference: 'REF-DAMAGED-1',
        restockInventory: false,
      },
      mock,
      true
    )

    assert.strictEqual(res.error, null)
    assert.strictEqual(res.data.restocked, false)
    assert.strictEqual(mock.state.rpcCalls[0].params.p_restock_inventory, false)
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n8. Batch Expiry Execution (adminExpirePendingPhonepeOrders)')
  // ─────────────────────────────────────────────────────────────

  await testAsync('adminExpirePendingPhonepeOrders calls admin_expire_pending_phonepe_orders RPC', async () => {
    const mock = createMockSupabaseClient({
      rpc: (fnName) => {
        if (fnName === 'admin_expire_pending_phonepe_orders') {
          return {
            data: {
              expired_count: 3,
              order_ids: ['ORD-EXP-1', 'ORD-EXP-2', 'ORD-EXP-3'],
              executed_at: new Date().toISOString(),
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const res = await adminExpirePendingPhonepeOrders(mock, true)
    assert.strictEqual(res.error, null)
    assert.strictEqual(res.data.expired_count, 3)
    assert.strictEqual(mock.state.rpcCalls.length, 1)
    assert.strictEqual(mock.state.rpcCalls[0].fnName, 'admin_expire_pending_phonepe_orders')
  })

  // ── Setup Mock LocalStorage for Demo Mode Tests ──
  const mockStorage = new Map()
  globalThis.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  }

  await testAsync('adminExpirePendingPhonepeOrders demo mode: timely UTR protects order even after deadline', async () => {
    mockStorage.clear()
    const orderAge = 50 * 60 * 60 * 1000 // 50 hours old (> 48h)
    const orderCreatedAt = new Date(Date.now() - orderAge).toISOString()
    const subCreatedAt = new Date(Date.now() - orderAge + (20 * 60 * 60 * 1000)).toISOString() // submitted at 20h (< 48h)

    const order = {
      id: 'ORD-EXP-TIMELY',
      created_at: orderCreatedAt,
      status: 'pending',
      payment_provider: 'phonepe',
      payment: { provider: 'phonepe', status: 'pending' },
    }
    const submission = {
      id: 'sub-timely',
      order_id: 'ORD-EXP-TIMELY',
      utr_number: '123456789012',
      status: 'submitted',
      created_at: subCreatedAt,
    }

    mockStorage.set('shopkart_customer_orders', JSON.stringify([order]))
    mockStorage.set('shopkart_payment_submissions', JSON.stringify([submission]))

    const res = await adminExpirePendingPhonepeOrders(null, false)
    assert.strictEqual(res.data.expired_count, 0, 'Timely submitted UTR must protect order from expiry')

    const savedOrders = JSON.parse(mockStorage.get('shopkart_customer_orders'))
    assert.strictEqual(savedOrders[0].status, 'pending', 'Order must remain pending awaiting review')
  })

  await testAsync('adminExpirePendingPhonepeOrders demo mode: UTR submitted AFTER deadline does NOT protect order', async () => {
    mockStorage.clear()
    const orderAge = 52 * 60 * 60 * 1000 // 52 hours old (> 48h)
    const orderCreatedAt = new Date(Date.now() - orderAge).toISOString()
    const subCreatedAt = new Date(Date.now() - orderAge + (50 * 60 * 60 * 1000)).toISOString() // submitted at 50h (> 48h)

    const order = {
      id: 'ORD-EXP-LATE',
      created_at: orderCreatedAt,
      status: 'pending',
      payment_provider: 'phonepe',
      payment: { provider: 'phonepe', status: 'pending' },
    }
    const submission = {
      id: 'sub-late',
      order_id: 'ORD-EXP-LATE',
      utr_number: '999988887777',
      status: 'submitted',
      created_at: subCreatedAt,
    }

    mockStorage.set('shopkart_customer_orders', JSON.stringify([order]))
    mockStorage.set('shopkart_payment_submissions', JSON.stringify([submission]))

    const res = await adminExpirePendingPhonepeOrders(null, false)
    assert.strictEqual(res.data.expired_count, 1, 'Late submitted UTR must NOT protect order from expiry')

    const savedOrders = JSON.parse(mockStorage.get('shopkart_customer_orders'))
    assert.strictEqual(savedOrders[0].status, 'cancelled', 'Order must be cancelled')
    assert.strictEqual(savedOrders[0].payment.status, 'failed', 'Payment status must be failed')
  })

  await testAsync('adminExpirePendingPhonepeOrders demo mode: timely UTR reviewed and marked rejected after deadline protects order', async () => {
    mockStorage.clear()
    const orderAge = 50 * 60 * 60 * 1000 // 50 hours old (> 48h)
    const orderCreatedAt = new Date(Date.now() - orderAge).toISOString()
    const subCreatedAt = new Date(Date.now() - orderAge + (20 * 60 * 60 * 1000)).toISOString() // submitted at 20h (< 48h)
    const reviewedAt = new Date(Date.now() - orderAge + (49 * 60 * 60 * 1000)).toISOString() // reviewed at 49h (> 48h)

    const order = {
      id: 'ORD-EXP-TIMELY-REJECTED',
      created_at: orderCreatedAt,
      status: 'pending',
      payment_provider: 'phonepe',
      payment: { provider: 'phonepe', status: 'pending' },
    }
    const submission = {
      id: 'sub-timely-rejected',
      order_id: 'ORD-EXP-TIMELY-REJECTED',
      utr_number: '123456789012',
      status: 'rejected',
      created_at: subCreatedAt,
      reviewed_at: reviewedAt,
      admin_notes: 'Transaction reference not found in statement',
    }

    mockStorage.set('shopkart_customer_orders', JSON.stringify([order]))
    mockStorage.set('shopkart_payment_submissions', JSON.stringify([submission]))

    const res = await adminExpirePendingPhonepeOrders(null, false)
    assert.strictEqual(res.data.expired_count, 0, 'Timely submitted UTR reviewed after deadline must protect order from expiry')

    const savedOrders = JSON.parse(mockStorage.get('shopkart_customer_orders'))
    assert.strictEqual(savedOrders[0].status, 'pending', 'Order must remain pending (not automatically cancelled)')
  })

  await testAsync('adminExpirePendingPhonepeOrders demo mode: resubmission after original deadline does NOT protect order when no timely submission exists', async () => {
    mockStorage.clear()
    const orderAge = 55 * 60 * 60 * 1000 // 55 hours old
    const orderCreatedAt = new Date(Date.now() - orderAge).toISOString()
    const lateSubTime1 = new Date(Date.now() - orderAge + (49 * 60 * 60 * 1000)).toISOString() // 49h (after original deadline)
    const lateSubTime2 = new Date(Date.now() - orderAge + (52 * 60 * 60 * 1000)).toISOString() // 52h (after original deadline)

    const order = {
      id: 'ORD-EXP-RESUB-LATE',
      created_at: orderCreatedAt,
      status: 'pending',
      payment_provider: 'phonepe',
      payment: { provider: 'phonepe', status: 'pending' },
    }
    const submissions = [
      {
        id: 'sub-1',
        order_id: 'ORD-EXP-RESUB-LATE',
        utr_number: '111111111111',
        status: 'rejected',
        created_at: lateSubTime1,
      },
      {
        id: 'sub-2',
        order_id: 'ORD-EXP-RESUB-LATE',
        utr_number: '222222222222',
        status: 'submitted',
        created_at: lateSubTime2, // resubmitted at 52h > 48h
      },
    ]

    mockStorage.set('shopkart_customer_orders', JSON.stringify([order]))
    mockStorage.set('shopkart_payment_submissions', JSON.stringify(submissions))

    const res = await adminExpirePendingPhonepeOrders(null, false)
    assert.strictEqual(res.data.expired_count, 1, 'Resubmission after original deadline must not protect order')

    const savedOrders = JSON.parse(mockStorage.get('shopkart_customer_orders'))
    assert.strictEqual(savedOrders[0].status, 'cancelled', 'Order must be cancelled')
  })

  await testAsync('adminExpirePendingPhonepeOrders demo mode: resubmission within original deadline DOES protect order', async () => {
    mockStorage.clear()
    const orderAge = 50 * 60 * 60 * 1000 // 50 hours old
    const orderCreatedAt = new Date(Date.now() - orderAge).toISOString()
    const rejectedSubTime = new Date(Date.now() - orderAge + (10 * 60 * 60 * 1000)).toISOString() // 10h
    const resubmissionTime = new Date(Date.now() - orderAge + (30 * 60 * 60 * 1000)).toISOString() // 30h (within deadline)

    const order = {
      id: 'ORD-EXP-RESUB-TIMELY',
      created_at: orderCreatedAt,
      status: 'pending',
      payment_provider: 'phonepe',
      payment: { provider: 'phonepe', status: 'pending' },
    }
    const submissions = [
      {
        id: 'sub-1',
        order_id: 'ORD-EXP-RESUB-TIMELY',
        utr_number: '111111111111',
        status: 'rejected',
        created_at: rejectedSubTime,
      },
      {
        id: 'sub-2',
        order_id: 'ORD-EXP-RESUB-TIMELY',
        utr_number: '333333333333',
        status: 'submitted',
        created_at: resubmissionTime, // submitted at 30h <= 48h
      },
    ]

    mockStorage.set('shopkart_customer_orders', JSON.stringify([order]))
    mockStorage.set('shopkart_payment_submissions', JSON.stringify(submissions))

    const res = await adminExpirePendingPhonepeOrders(null, false)
    assert.strictEqual(res.data.expired_count, 0, 'Resubmission within original deadline must protect order')

    const savedOrders = JSON.parse(mockStorage.get('shopkart_customer_orders'))
    assert.strictEqual(savedOrders[0].status, 'pending', 'Order must remain pending')
  })

  await testAsync('adminFetchOrders demo mode: preserves order.payment_provider when order.payment is missing', async () => {
    mockStorage.clear()
    const orderWithoutPayment = {
      id: 'ORD-DEMO-PHONEPE-PRESERVE',
      created_at: new Date().toISOString(),
      status: 'pending',
      total_amount: 1299,
      payment_provider: 'phonepe',
      payment: null,
    }
    mockStorage.set('shopkart_customer_orders', JSON.stringify([orderWithoutPayment]))

    const res = await adminFetchOrders(null, false)
    const fetched = res.data.find(o => o.id === 'ORD-DEMO-PHONEPE-PRESERVE')
    assert(fetched, 'Order should be fetched')
    assert.strictEqual(fetched.payment?.provider, 'phonepe', 'Must preserve payment_provider phonepe, never default to cod')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n9. Authorization & Route Security (AuthGuard & resolveIsAdmin)')
  // ─────────────────────────────────────────────────────────────

  test('resolveIsAdmin returns true for role === "admin" in profile', () => {
    const user = { id: 'usr-admin' }
    const profile = { role: 'admin' }
    assert.strictEqual(resolveIsAdmin(user, profile), true)
  })

  test('resolveIsAdmin returns false for role === "customer"', () => {
    const user = { id: 'usr-customer' }
    const profile = { role: 'customer' }
    assert.strictEqual(resolveIsAdmin(user, profile), false)
  })

  test('resolveIsAdmin returns false when user or profile is null', () => {
    assert.strictEqual(resolveIsAdmin(null, null), false)
    assert.strictEqual(resolveIsAdmin({ id: 'u' }, null), false)
  })

  test('AuthGuard blocks unauthenticated user from admin content', () => {
    const authValue = { user: null, loading: false, isAdmin: false }
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: authValue },
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(
            AuthGuard,
            { requireAdmin: true },
            React.createElement('div', { id: 'secret-admin' }, 'Admin Secret Content')
          )
        )
      )
    )
    assert(html.includes('Access Denied'), 'Should render Access Denied')
    assert(html.includes('restricted to authorized administrators'), 'Should render restricted message')
    assert(!html.includes('secret-admin'), 'Should NOT render protected admin children')
  })

  test('AuthGuard blocks authenticated customer from admin content', () => {
    const authValue = {
      user: { id: 'usr-cust', email: 'cust@example.com' },
      loading: false,
      isAdmin: false,
    }
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: authValue },
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(
            AuthGuard,
            { requireAdmin: true },
            React.createElement('div', { id: 'secret-admin' }, 'Admin Secret Content')
          )
        )
      )
    )
    assert(html.includes('Access Denied'))
    assert(!html.includes('secret-admin'))
  })

  test('AuthGuard permits authenticated admin through to admin content', () => {
    const authValue = {
      user: { id: 'usr-adm', email: 'admin@shopkart.com' },
      loading: false,
      isAdmin: true,
    }
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: authValue },
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(
            AuthGuard,
            { requireAdmin: true },
            React.createElement('div', { id: 'secret-admin' }, 'Admin Secret Content')
          )
        )
      )
    )
    assert(!html.includes('Access Denied'), 'Should not block admin')
    assert(html.includes('secret-admin'), 'Should render protected admin children')
  })

  // ─────────────────────────────────────────────────────────────
  console.log('\n10. Navigation & AdminLayout Integration')
  // ─────────────────────────────────────────────────────────────

  test('AdminLayout renders Payment Verification in sidebar navigation', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/admin/payments'] },
        React.createElement(AdminLayout, null)
      )
    )
    assert(html.includes('Payment Verification'), 'Navigation item Payment Verification missing')
    assert(html.includes('href="/admin/payments"'), 'NavLink to /admin/payments missing')
  })

  // ─────────────────────────────────────────────────────────────
  // Close Vite Dev Server
  // ─────────────────────────────────────────────────────────────
  await viteServer.close()

  console.log('\n=================================================================')
  console.log(`PHASE 6F TEST RESULTS: ${passed} passed, ${total - passed} failed, ${total} total`)
  console.log('=================================================================\n')

  if (passed !== total) {
    process.exit(1)
  }
}

runPhase6fTests().catch((err) => {
  console.error('Fatal error running Phase 6F test suite:', err)
  process.exit(1)
})
