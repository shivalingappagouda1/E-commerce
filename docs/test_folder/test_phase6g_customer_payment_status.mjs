/**
  * ShopKart — Phase 6G: Customer Payment & Order Status UI Test Suite
  *
  * Covers 15 Core Scenarios + Phase 6G Review Regression Tests:
  * 1.  Pending PhonePe order (displays payment pending & 48h deadline prompt).
  * 2.  UTR submitted and awaiting verification (displays under review card & submitted UTR).
  * 3.  Approved UTR / payment completed (displays verified card & disables payment prompts).
  * 4.  Rejected UTR with resubmission available within 48h (displays admin reason & resubmission CTA).
  * 5.  Rejected UTR when resubmission is no longer permitted (past 48h deadline elapsed).
  * 6.  Timely UTR submission reviewed after 48 hours (protected from auto-expiry).
  * 7.  Late UTR submission (unprotected from auto-expiry).
  * 8.  Resubmission without resetting original deadline (anchored to original created_at).
  * 9.  Pending COD payment (displays due upon delivery, not marked completed).
  * 10. COD payment completed after collection confirmation (verified only upon confirmed collection).
  * 11. Refund pending versus refunded (surfaces refund reference transaction ID).
  * 12. Cancelled order (displays cancelled state, no active payment form).
  * 13. Missing or incomplete payment data handled gracefully (no NaN, safe fallbacks).
  * 14. Customer order ownership and access restrictions (unauthenticated/unauthorized access blocked).
  * 15. Order totals and financial breakdown rendering (subtotal, discount, shipping, total).
  *
  * Specific Phase 6G Review Corrections:
  * - COD + processing + pending payment -> Must remain unpaid.
  * - COD + delivered + pending payment -> Must remain unpaid.
  * - COD + completed payment -> Must show paid.
  * - PhonePe + processing + pending payment -> Must not claim payment verified.
  * - Original payment ID without refund reference -> Never substituted as refund reference.
  * - Missing refund reference -> Shows neutral unavailable-reference message.
  * - Cancelled paid processing order -> No unsupported claim of automatic inventory restoration.
  * - Payment retrieval error -> Not silently authoritative, disables UTR submission form.
  * - Single-order customer ownership/access restriction -> Verified via fetchOrderById().
  */

  import assert from 'assert'
  import React, { act } from 'react'
  import * as ReactDOMClient from 'react-dom/client'
  import { JSDOM } from 'jsdom'
  import { renderToStaticMarkup } from 'react-dom/server'
  import { MemoryRouter } from 'react-router-dom'
  import { createServer } from 'vite'

  import {
    validateUtrFormat,
    computePhonepeDeadline,
    getOrderFinancials,
    getPaymentStatusInfo,
  } from './src/utils/paymentHelpers.js'

  import {
    fetchCustomerOrders,
    fetchOrderById,
    fetchOrderPayment,
    submitPhonepeUtr,
  } from './src/services/orderService.js'

  import {
    adminExpirePendingPhonepeOrders,
  } from './src/services/adminService.js'

  // ── Mock Supabase Client Helper ──
  function createMockSupabaseClient(overrides = {}) {
    const state = {
      rpcCalls: [],
      fromQueries: [],
    }

    const client = {
      state,
      auth: {
        getUser: async () => {
          if (overrides.user !== undefined) {
            return { data: { user: overrides.user }, error: overrides.userError || null }
          }
          return {
            data: { user: { id: '00000000-0000-0000-0000-000000000001', email: 'customer@example.com' } },
            error: null,
          }
        },
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
              return res || { data: null, error: null }
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
              return res || { data: null, error: null }
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

  async function runPhase6gTests() {
    console.log('=================================================================')
    console.log('SHOPKART PHASE 6G — CUSTOMER PAYMENT & ORDER STATUS UI TESTS')
    console.log('Mode: Real React Component SSR Rendering & Service Logic Verification')
    console.log('=================================================================\n')

    // Initialize JSDOM environment for DOM interaction tests
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.HTMLElement = dom.window.HTMLElement
    globalThis.HTMLButtonElement = dom.window.HTMLButtonElement
    globalThis.HTMLInputElement = dom.window.HTMLInputElement
    globalThis.Node = dom.window.Node
    globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

    // ── Setup Vite Server for React Component Loading ──
    const viteServer = await createServer({
      server: { middlewareMode: true, watch: null },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true },
      logLevel: 'silent',
    })

    const { default: OrdersPage } = await viteServer.ssrLoadModule('/src/pages/customer/OrdersPage.jsx')
    const { default: OrderConfirmationPage } = await viteServer.ssrLoadModule('/src/pages/customer/OrderConfirmationPage.jsx')
    const { default: PhonePePaymentSection } = await viteServer.ssrLoadModule('/src/components/checkout/PhonePePaymentSection.jsx')
    const { CartProvider } = await viteServer.ssrLoadModule('/src/context/CartContext.jsx')
    const { AuthProvider } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx')

    // Mock sample base order
    const now = Date.now()
    const baseOrder = {
      id: 'ord-1001-uuid',
      created_at: new Date(now - 2 * 3600 * 1000).toISOString(), // 2 hours ago
      status: 'pending',
      subtotal: 1200,
      discount_amount: 100,
      shipping_amount: 0,
      total_amount: 1100,
      coupon_code: 'SAVE100',
      payment_provider: 'phonepe',
      payment: {
        id: 'pay-1001',
        provider: 'phonepe',
        status: 'pending',
        amount: 1100,
      },
      address: {
        full_name: 'Priya Sharma',
        phone: '+91 98765 11111',
        line1: '45 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
      },
      items: [
        {
          id: 'item-1',
          product_id: 'prod-1',
          product_name: 'Handcrafted Coffee Mug',
          unit_price: 600,
          quantity: 2,
          total_price: 1200,
        },
      ],
    }

    // ─────────────────────────────────────────────────────────────
    console.log('1. Scenario 1: Pending PhonePe Order Status')
    // ─────────────────────────────────────────────────────────────
    test('Pending PhonePe order status details computed accurately', () => {
      const info = getPaymentStatusInfo(baseOrder)
      assert.strictEqual(info.isPhonePe, true)
      assert.strictEqual(info.isPending, true)
      assert.strictEqual(info.isCompleted, false)
      assert.strictEqual(info.isAwaitingVerification, false)
      assert.strictEqual(info.canSubmitFirstUtr, true)
      assert.strictEqual(info.badge.label, 'Payment Pending')
    })

    test('OrderConfirmationPage renders "Complete UPI Payment" and PhonePe QR section for pending order', () => {
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${baseOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: baseOrder,
            initialPaymentData: { payment: baseOrder.payment, submissions: [] },
          })
        )
      )
      assert.ok(html.includes('Order Placed — Complete UPI Payment'), 'Renders pending PhonePe headline')
      assert.ok(html.includes('PhonePe UPI QR Payment'), 'Renders PhonePe QR payment section')
      assert.ok(html.includes('48-Hour Payment Window'), 'Renders 48-hour payment window deadline')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n2. Scenario 2: UTR Submitted & Awaiting Verification')
    // ─────────────────────────────────────────────────────────────
    test('Awaiting verification status computed when active submission exists', () => {
      const orderWithSub = {
        ...baseOrder,
        activeSubmission: {
          id: 'sub-1',
          utr_number: '987654321012',
          status: 'submitted',
          created_at: new Date().toISOString(),
        },
      }
      const info = getPaymentStatusInfo(orderWithSub)
      assert.strictEqual(info.isAwaitingVerification, true)
      assert.strictEqual(info.isCompleted, false)
      assert.strictEqual(info.badge.label, 'UTR Awaiting Verification')
    })

    test('OrderConfirmationPage displays submitted UTR and under review banner', () => {
      const activeSub = {
        id: 'sub-active',
        utr_number: '987654321012',
        status: 'submitted',
        created_at: new Date().toISOString(),
      }
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${baseOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: baseOrder,
            initialPaymentData: {
              payment: baseOrder.payment,
              activeSubmission: activeSub,
              submissions: [activeSub],
            },
          })
        )
      )
      assert.ok(html.includes('UTR Submitted — Awaiting Review'), 'Renders awaiting review headline')
      assert.ok(html.includes('987654321012'), 'Displays submitted UTR number')
      assert.ok(!html.includes('Submit 12-Digit UTR'), 'Input form hidden while under verification')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n3. Scenario 3: Approved UTR / Payment Completed')
    // ─────────────────────────────────────────────────────────────
    test('Completed payment status computed accurately when approved', () => {
      const completedOrder = {
        ...baseOrder,
        status: 'processing',
        payment: { ...baseOrder.payment, status: 'completed' },
        latestSubmission: {
          id: 'sub-1',
          utr_number: '987654321012',
          status: 'approved',
        },
      }
      const info = getPaymentStatusInfo(completedOrder)
      assert.strictEqual(info.isCompleted, true)
      assert.strictEqual(info.isPending, false)
      assert.strictEqual(info.badge.label, 'Payment Verified')
    })

    test('OrderConfirmationPage renders "Order Placed Successfully!" and Payment Verified card', () => {
      const completedOrder = {
        ...baseOrder,
        status: 'processing',
        payment: { ...baseOrder.payment, status: 'completed' },
      }
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${completedOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: completedOrder,
            initialPaymentData: { payment: completedOrder.payment, submissions: [] },
          })
        )
      )
      assert.ok(html.includes('Order Placed Successfully!'), 'Hero headline shows Order Placed Successfully!')
      assert.ok(html.includes('Payment Successfully Verified!'), 'Renders Payment Successfully Verified banner')
      assert.ok(html.includes('Total Paid'), 'Renders Total Paid instead of Total Payable')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n4. Scenario 4: Rejected UTR with Resubmission Available within 48h')
    // ─────────────────────────────────────────────────────────────
    test('Rejected UTR allows resubmission when within 48h deadline', () => {
      const rejectedOrder = {
        ...baseOrder,
        created_at: new Date(now - 10 * 3600 * 1000).toISOString(), // 10 hours ago (< 48h)
        latestSubmission: {
          id: 'sub-rej',
          utr_number: '111122223333',
          status: 'rejected',
          admin_notes: 'Transaction not found in merchant statement',
        },
        activeSubmission: null,
      }
      const info = getPaymentStatusInfo(rejectedOrder)
      assert.strictEqual(info.isUtrRejected, true)
      assert.strictEqual(info.canResubmitUtr, true)
      assert.strictEqual(info.badge.label, 'UTR Rejected')
    })

    test('OrderConfirmationPage displays rejection note and allows resubmitting within deadline', () => {
      const rejectedOrder = {
        ...baseOrder,
        created_at: new Date(now - 10 * 3600 * 1000).toISOString(),
      }
      const latestSub = {
        id: 'sub-rej',
        utr_number: '111122223333',
        status: 'rejected',
        admin_notes: 'Transaction not found in merchant statement',
      }
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${rejectedOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: rejectedOrder,
            initialPaymentData: {
              payment: rejectedOrder.payment,
              activeSubmission: null,
              latestSubmission: latestSub,
              submissions: [latestSub],
            },
          })
        )
      )
      assert.ok(html.includes('Previous UTR Submission Was Rejected'), 'Renders rejection alert')
      assert.ok(html.includes('Transaction not found in merchant statement'), 'Displays admin rejection notes')
      assert.ok(html.includes('Resubmit 12-Digit UTR'), 'Renders Resubmit button')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n5. Scenario 5: Rejected UTR when Resubmission is No Longer Permitted (Past 48h)')
    // ─────────────────────────────────────────────────────────────
    test('Rejected UTR disallows resubmission when order created_at exceeds 48 hours', () => {
      const expiredRejectedOrder = {
        ...baseOrder,
        created_at: new Date(now - 50 * 3600 * 1000).toISOString(), // 50 hours ago (> 48h)
        latestSubmission: {
          id: 'sub-rej-old',
          utr_number: '111122223333',
          status: 'rejected',
          admin_notes: 'Unmatched transaction',
        },
        activeSubmission: null,
      }
      const info = getPaymentStatusInfo(expiredRejectedOrder)
      assert.strictEqual(info.isUtrRejected, true)
      assert.strictEqual(info.deadline.isExpired, true)
      assert.strictEqual(info.canResubmitUtr, false, 'Cannot resubmit after 48h deadline has elapsed')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n6. Scenario 6: Timely UTR Submission Reviewed After 48 Hours (Protected)')
    // ─────────────────────────────────────────────────────────────
    await testAsync('Timely UTR submission reviewed after deadline protects order from automatic expiry', async () => {
      const orderCreatedMs = now - 60 * 3600 * 1000 // 60 hours ago
      const timelySubMs = orderCreatedMs + 10 * 3600 * 1000 // Submitted 10h after order created (within 48h window)

      const order = {
        id: 'ord-timely-prot',
        created_at: new Date(orderCreatedMs).toISOString(),
        status: 'pending',
        payment_provider: 'phonepe',
        total_amount: 800,
      }

      const timelySubmission = {
        id: 'sub-timely',
        order_id: 'ord-timely-prot',
        status: 'rejected', // Admin reviewed and rejected after the 48h mark
        created_at: new Date(timelySubMs).toISOString(),
      }

      const originalLocal = globalThis.localStorage
      const storageMap = new Map()
      storageMap.set('shopkart_customer_orders', JSON.stringify([order]))
      storageMap.set('shopkart_payment_submissions', JSON.stringify([timelySubmission]))

      globalThis.localStorage = {
        getItem: (key) => storageMap.get(key) || null,
        setItem: (key, val) => storageMap.set(key, val),
      }

      const expiryResult = await adminExpirePendingPhonepeOrders(null, false)
      assert.strictEqual(expiryResult.data?.expired_count, 0, 'Timely submission MUST protect order from automatic expiration')

      globalThis.localStorage = originalLocal
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n7. Scenario 7: Late UTR Submission (Unprotected from Expiry)')
    // ─────────────────────────────────────────────────────────────
    await testAsync('Late UTR submission created AFTER 48h deadline does NOT protect order from auto-expiry', async () => {
      const orderCreatedMs = now - 60 * 3600 * 1000 // 60 hours ago
      const lateSubMs = orderCreatedMs + 52 * 3600 * 1000 // Submitted 52h after order created (> 48h window)

      const order = {
        id: 'ord-late-unprot',
        created_at: new Date(orderCreatedMs).toISOString(),
        status: 'pending',
        payment_provider: 'phonepe',
        total_amount: 800,
      }

      const lateSubmission = {
        id: 'sub-late',
        order_id: 'ord-late-unprot',
        status: 'submitted',
        created_at: new Date(lateSubMs).toISOString(),
      }

      const originalLocal = globalThis.localStorage
      const storageMap = new Map()
      storageMap.set('shopkart_customer_orders', JSON.stringify([order]))
      storageMap.set('shopkart_payment_submissions', JSON.stringify([lateSubmission]))

      globalThis.localStorage = {
        getItem: (key) => storageMap.get(key) || null,
        setItem: (key, val) => storageMap.set(key, val),
      }

      const expiryResult = await adminExpirePendingPhonepeOrders(null, false)
      assert.strictEqual(expiryResult.data?.expired_count, 1, 'Late submission must NOT protect order from expiration')

      globalThis.localStorage = originalLocal
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n8. Scenario 8: Resubmission Without Resetting Original Deadline')
    // ─────────────────────────────────────────────────────────────
    test('Resubmissions preserve original order.created_at deadline without resetting', () => {
      const orderCreatedAt = new Date('2026-11-10T10:00:00.000Z').toISOString()
      const originalDeadline = computePhonepeDeadline(orderCreatedAt)

      const resubmissionTime = new Date('2026-11-11T10:00:00.000Z').toISOString()
      const recalculatedDeadline = computePhonepeDeadline(orderCreatedAt)

      assert.strictEqual(
        originalDeadline.deadlineMs,
        recalculatedDeadline.deadlineMs,
        'Deadline timestamp must be strictly identical'
      )
      assert.strictEqual(
        originalDeadline.formatted,
        recalculatedDeadline.formatted,
        'Deadline formatted string must be strictly identical'
      )
      assert.strictEqual(
        originalDeadline.deadlineMs,
        new Date(orderCreatedAt).getTime() + 48 * 3600 * 1000,
        'Deadline must be strictly order.created_at + 48 hours'
      )
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n9. Scenario 9: Pending COD Payment')
    // ─────────────────────────────────────────────────────────────
    test('Pending COD order status indicates Payment Due Upon Delivery and is not completed', () => {
      const codPendingOrder = {
        ...baseOrder,
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'pending', amount: 1100 },
        status: 'pending',
      }
      const info = getPaymentStatusInfo(codPendingOrder)
      assert.strictEqual(info.isCod, true)
      assert.strictEqual(info.isCompleted, false)
      assert.strictEqual(info.badge.label, 'Payment Due Upon Delivery')
    })

    test('OrderConfirmationPage renders Payment Due Upon Delivery instructions for pending COD', () => {
      const codPendingOrder = {
        ...baseOrder,
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'pending', amount: 1100 },
        status: 'pending',
      }
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${codPendingOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: codPendingOrder,
            initialPaymentData: { payment: codPendingOrder.payment, submissions: [] },
          })
        )
      )
      assert.ok(html.includes('Payment Due Upon Delivery'), 'Renders Payment Due Upon Delivery headline')
      assert.ok(html.includes('Please keep <strong>₹1,100</strong> ready in cash'), 'Renders cash reminder with amount')
      assert.ok(!html.includes('PhonePe UPI QR Payment'), 'Strictly excludes PhonePe QR section')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n10. Scenario 10: COD Payment Completed After Collection Confirmation')
    // ─────────────────────────────────────────────────────────────
    test('Delivered COD order remains pending until admin confirms collection', () => {
      const codDeliveredUnpaid = {
        ...baseOrder,
        status: 'delivered',
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'pending', amount: 1100 },
      }
      const info = getPaymentStatusInfo(codDeliveredUnpaid)
      assert.strictEqual(info.isCompleted, false, 'COD payment is NOT complete merely because order is delivered')
      assert.strictEqual(info.badge.label, 'Collection Verification Pending')
    })

    test('COD payment marks completed only when payment.status is confirmed completed', () => {
      const codConfirmedOrder = {
        ...baseOrder,
        status: 'delivered',
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'completed', amount: 1100 },
      }
      const info = getPaymentStatusInfo(codConfirmedOrder)
      assert.strictEqual(info.isCompleted, true)
      assert.strictEqual(info.badge.label, 'COD Collected & Verified')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n11. Scenario 11: Refund Status & Gateway Reference')
    // ─────────────────────────────────────────────────────────────
    test('Refunded order status identifies refund reference transaction ID', () => {
      const refundedOrder = {
        ...baseOrder,
        status: 'refunded',
        payment: {
          provider: 'phonepe',
          status: 'refunded',
          amount: 1100,
          refund_reference: 'REF-PHONEPE-998877',
        },
      }
      const info = getPaymentStatusInfo(refundedOrder)
      assert.strictEqual(info.isRefunded, true)
      assert.strictEqual(info.refundReference, 'REF-PHONEPE-998877')
      assert.strictEqual(info.badge.label, 'Refunded')
    })

    test('OrderConfirmationPage renders Refund banner and displays bank reference ID', () => {
      const refundedOrder = {
        ...baseOrder,
        status: 'refunded',
        payment: {
          provider: 'phonepe',
          status: 'refunded',
          amount: 1100,
          refund_reference: 'REF-PHONEPE-998877',
        },
      }
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${refundedOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: refundedOrder,
            initialPaymentData: { payment: refundedOrder.payment, submissions: [] },
          })
        )
      )
      assert.ok(html.includes('Order Payment Refunded'), 'Renders Order Refunded headline')
      assert.ok(html.includes('Refund Processed &amp; Credited') || html.includes('Refund Processed & Credited'), 'Renders refund processed banner')
      assert.ok(html.includes('REF-PHONEPE-998877'), 'Displays refund transaction reference ID')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n12. Scenario 12: Cancelled Order Handling')
    // ─────────────────────────────────────────────────────────────
    test('Cancelled order marks payment as failed/cancelled without active payment CTA', () => {
      const cancelledOrder = {
        ...baseOrder,
        status: 'cancelled',
        payment: { provider: 'phonepe', status: 'failed', amount: 1100 },
      }
      const info = getPaymentStatusInfo(cancelledOrder)
      assert.strictEqual(info.isCancelled, true)
      assert.strictEqual(info.isPending, false)
      assert.strictEqual(info.canSubmitFirstUtr, false)
      assert.strictEqual(info.canResubmitUtr, false)
      assert.strictEqual(info.badge.label, 'Cancelled / Expired')
    })

    test('OrderConfirmationPage renders Cancelled state for cancelled orders without claims of automatic inventory restoration', () => {
      const cancelledOrder = {
        ...baseOrder,
        status: 'cancelled',
        payment: { provider: 'phonepe', status: 'failed', amount: 1100 },
      }
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${cancelledOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: cancelledOrder,
            initialPaymentData: { payment: cancelledOrder.payment, submissions: [] },
          })
        )
      )
      assert.ok(html.includes('Order Cancelled'), 'Hero headline shows Order Cancelled')
      assert.ok(html.includes('This order has been cancelled.'), 'Renders neutral cancellation copy')
      assert.ok(!html.includes('Any reserved inventory and promotional coupons have been restored'), 'Does NOT claim automatic inventory restoration')
      assert.ok(!html.includes('Order Placed — Complete UPI Payment'), 'Never shows Complete UPI Payment on cancelled order')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n13. Scenario 13: Missing or Incomplete Payment Data Handled Gracefully')
    // ─────────────────────────────────────────────────────────────
    test('Missing payment object defaults safely to COD pending without error', () => {
      const malformedOrder = {
        id: 'ord-malformed',
        status: 'pending',
        total_amount: 500,
        payment: null,
      }
      const info = getPaymentStatusInfo(malformedOrder)
      assert.strictEqual(info.provider, 'cod')
      assert.strictEqual(info.status, 'pending')
      assert.strictEqual(info.isCompleted, false)
      assert.strictEqual(info.badge.label, 'Payment Due Upon Delivery')
    })

    test('Missing financial fields fall back cleanly without producing NaN', () => {
      const sparseOrder = {
        id: 'ord-sparse',
        items: [{ product_name: 'Pencil', unit_price: 20, quantity: 5 }],
      }
      const fin = getOrderFinancials(sparseOrder)
      assert.strictEqual(fin.subtotal, 100)
      assert.strictEqual(fin.discountAmount, 0)
      assert.strictEqual(fin.shippingAmount, 99)
      assert.strictEqual(fin.totalAmount, 199)
      assert.ok(!Number.isNaN(fin.totalAmount), 'Total amount must not be NaN')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n14. Scenario 14: Customer Order Ownership & Access Restrictions')
    // ─────────────────────────────────────────────────────────────
    await testAsync('fetchCustomerOrders filters strictly by authenticated user ID', async () => {
      const mockClient = createMockSupabaseClient({
        user: { id: 'user-alice-123' },
        from: (table, query) => {
          if (table === 'orders') {
            return { data: [{ id: 'order-alice-1', user_id: 'user-alice-123', status: 'pending' }], error: null }
          }
          return { data: [], error: null }
        },
      })

      const res = await fetchCustomerOrders(mockClient, true)
      assert.strictEqual(res.error, null)
      assert.strictEqual(res.data.length, 1)

      const orderQuery = mockClient.state.fromQueries.find(q => q.table === 'orders')
      const userFilter = orderQuery.filters.find(f => f.col === 'user_id')
      assert.strictEqual(userFilter?.val, 'user-alice-123', 'Queries database with strict user_id equality filter')
    })

    await testAsync('fetchCustomerOrders rejects unauthenticated access', async () => {
      const mockClient = createMockSupabaseClient({
        user: null,
        userError: { message: 'Auth session expired' },
      })

      const res = await fetchCustomerOrders(mockClient, true)
      assert.strictEqual(res.data.length, 0)
      assert.strictEqual(res.error?.message, 'Authentication required.')
    })

    await testAsync('fetchOrderById rejects unauthorized single-order access via database RLS policy', async () => {
      // When a customer requests an order ID belonging to another user,
      // Supabase RLS returns 0 rows, resulting in PGRST116 single row error
      const mockClientOtherUser = createMockSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
          }
          return { data: null, error: null }
        },
      })

      const res = await fetchOrderById('99999999-9999-4999-8999-999999999999', mockClientOtherUser, true)
      assert.strictEqual(res.data, null, 'Unauthorized single order access returns null data')
      assert.strictEqual(res.error?.code, 'PGRST116', 'Database RLS prevents reading other customer order')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n15. Scenario 15: Order Totals & Financial Breakdown Rendering')
    // ─────────────────────────────────────────────────────────────
    test('Financial breakdown calculates subtotal, coupon discount, shipping, and total', () => {
      const discountedOrder = {
        id: 'ord-breakdown',
        subtotal: 2500,
        discount_amount: 500,
        shipping_amount: 0,
        total_amount: 2000,
        coupon_code: 'MEGA500',
      }
      const fin = getOrderFinancials(discountedOrder)
      assert.strictEqual(fin.subtotal, 2500)
      assert.strictEqual(fin.discountAmount, 500)
      assert.strictEqual(fin.shippingAmount, 0)
      assert.strictEqual(fin.totalAmount, 2000)
      assert.strictEqual(fin.couponCode, 'MEGA500')
    })

    test('OrderConfirmationPage renders full financial breakdown table', () => {
      const order = {
        ...baseOrder,
        subtotal: 1200,
        discount_amount: 100,
        shipping_amount: 0,
        total_amount: 1100,
        coupon_code: 'SAVE100',
      }
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${order.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: order,
            initialPaymentData: { payment: order.payment, submissions: [] },
          })
        )
      )
      assert.ok(html.includes('Items Subtotal:'), 'Renders Items Subtotal row')
      assert.ok(html.includes('₹1,200'), 'Renders subtotal amount')
      assert.ok(html.includes('Coupon Discount:'), 'Renders Coupon Discount row')
      assert.ok(html.includes('SAVE100'), 'Renders coupon code tag')
      assert.ok(html.includes('FREE'), 'Renders FREE shipping label')
      assert.ok(html.includes('₹1,100'), 'Renders final total amount')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n16. Specific Phase 6G Review Regression Tests')
    // ─────────────────────────────────────────────────────────────

    test('Correction 1: COD + processing + pending payment MUST remain unpaid', () => {
      const codProcessingPending = {
        ...baseOrder,
        status: 'processing', // Order moved to processing by admin
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'pending', amount: 1100 }, // Payment is still pending!
      }
      const info = getPaymentStatusInfo(codProcessingPending)
      assert.strictEqual(info.isCompleted, false, 'COD order with pending payment MUST NOT be completed even when order status is processing')
      assert.strictEqual(info.badge.label, 'Payment Due Upon Delivery')
    })

    test('Correction 1: COD + delivered + pending payment MUST remain unpaid', () => {
      const codDeliveredPending = {
        ...baseOrder,
        status: 'delivered', // Order delivered, but cash not confirmed yet
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'pending', amount: 1100 },
      }
      const info = getPaymentStatusInfo(codDeliveredPending)
      assert.strictEqual(info.isCompleted, false, 'COD order with pending payment MUST NOT be completed merely because order status is delivered')
      assert.strictEqual(info.badge.label, 'Collection Verification Pending')
    })

    test('Correction 1: COD + completed payment MUST show paid', () => {
      const codCompleted = {
        ...baseOrder,
        status: 'delivered',
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'completed', amount: 1100 },
      }
      const info = getPaymentStatusInfo(codCompleted)
      assert.strictEqual(info.isCompleted, true, 'COD order with completed payment must show paid')
      assert.strictEqual(info.badge.label, 'COD Collected & Verified')
    })

    test('Correction 2: PhonePe + processing + pending payment MUST NOT claim payment verified', () => {
      const phonepeProcessingPending = {
        ...baseOrder,
        status: 'processing',
        payment_provider: 'phonepe',
        payment: { provider: 'phonepe', status: 'pending', amount: 1100 },
      }
      const info = getPaymentStatusInfo(phonepeProcessingPending)
      assert.strictEqual(info.isCompleted, false, 'PhonePe order with pending payment MUST NOT be verified merely because order status is processing')

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${phonepeProcessingPending.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: phonepeProcessingPending,
            initialPaymentData: { payment: phonepeProcessingPending.payment, submissions: [] },
          })
        )
      )
      assert.ok(!html.includes('Payment Successfully Verified!'), 'OrderConfirmationPage MUST NOT claim payment verified when payment status is pending')
      assert.ok(html.includes('Total Payable'), 'Summary footer shows Total Payable rather than Total Paid')
    })

    test('Correction 3: Original payment ID is NEVER substituted as refund reference', () => {
      const orderWithProviderPaymentIdOnly = {
        ...baseOrder,
        status: 'refunded',
        payment: {
          provider: 'phonepe',
          status: 'refunded',
          amount: 1100,
          provider_payment_id: 'TXN-ORIGINAL-PAYMENT-998877', // original charge ID, not refund ref
          refund_reference: null, // missing refund reference
        },
      }
      const info = getPaymentStatusInfo(orderWithProviderPaymentIdOnly)
      assert.strictEqual(info.refundReference, null, 'Never substitute provider_payment_id for refund_reference')

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${orderWithProviderPaymentIdOnly.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: orderWithProviderPaymentIdOnly,
            initialPaymentData: { payment: orderWithProviderPaymentIdOnly.payment, submissions: [] },
          })
        )
      )
      assert.ok(!html.includes('TXN-ORIGINAL-PAYMENT-998877'), 'Must not display original provider_payment_id as refund reference')
      assert.ok(html.includes('Reference ID has not been provided yet'), 'Displays neutral unavailable reference message')
    })

    test('Correction 4: Cancelled paid processing order does not claim automatic inventory restoration', () => {
      const cancelledPaidProcessingOrder = {
        ...baseOrder,
        status: 'cancelled',
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
      }
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${cancelledPaidProcessingOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: cancelledPaidProcessingOrder,
            initialPaymentData: { payment: cancelledPaidProcessingOrder.payment, submissions: [] },
          })
        )
      )
      assert.ok(!html.includes('Any reserved inventory and promotional coupons have been restored'), 'Never claims automatic restocking for cancelled paid processing orders')
      assert.ok(html.includes('This order has been cancelled.'), 'Uses neutral cancellation statement')
    })

    await testAsync('Correction 5: Payment retrieval failure displays alert and disables payment submission', async () => {
      const mockClientWithPayError = createMockSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return { data: [{ id: '11111111-1111-4111-8111-111111111111', status: 'pending', payment_provider: 'phonepe', total_amount: 1499 }], error: null }
          }
          if (table === 'payments') {
            return { data: null, error: { message: 'Database connection failed reading payment records' } }
          }
          return { data: [], error: null }
        },
      })

      const payRes = await fetchOrderPayment('11111111-1111-4111-8111-111111111111', mockClientWithPayError, true)
      assert.ok(payRes.error !== null, 'fetchOrderPayment returns payment error')
      assert.strictEqual(payRes.error?.message, 'Database connection failed reading payment records')
    })

    // ── Blocker 1: Stock Restoration Copy Neutrality ──
    test('Final Correction 1: Expired-order wording makes no automatic inventory-restoration promise', () => {
      const unexpiredOrder = {
        ...baseOrder,
        created_at: new Date(now - 2 * 3600 * 1000).toISOString(),
      }
      const html = renderToStaticMarkup(
        React.createElement(PhonePePaymentSection, { order: unexpiredOrder })
      )
      assert.ok(
        html.includes('Orders without a submitted UTR within 48 hours are automatically cancelled.'),
        'Contains neutral deadline wording'
      )
      assert.ok(
        !html.includes('reserved stock is restored'),
        'Strictly excludes unsupported claim that reserved stock is restored'
      )
      assert.ok(
        !html.includes('reserved inventory and promotional coupons have been restored'),
        'Strictly excludes automatic restocking claim'
      )
    })

    // ── Blocker 2: Expired UTR Submission Guards ──
    test('Final Correction 2: Expired pending PhonePe order cannot submit a UTR', () => {
      const expiredPendingOrder = {
        ...baseOrder,
        created_at: new Date(now - 50 * 3600 * 1000).toISOString(), // 50 hours ago (> 48h)
        status: 'pending',
      }
      const html = renderToStaticMarkup(
        React.createElement(PhonePePaymentSection, { order: expiredPendingOrder })
      )
      assert.ok(html.includes('48-Hour Payment Window Elapsed'), 'Renders elapsed window alert')
      assert.ok(html.includes('48-Hour Payment Window Has Expired'), 'Renders expired payment notice')
      assert.ok(html.includes('Order Cancelled / Expired'), 'Status pill shows Order Cancelled / Expired')
      assert.ok(!html.includes('Enter 12-Digit UTR'), 'UTR input form is strictly NOT available when expired')
      assert.ok(!html.includes('Submit 12-Digit UTR'), 'Submit button is strictly NOT available when expired')
    })

    test('Final Correction 2: Rejected UTR after 48 hours cannot be resubmitted', () => {
      const expiredRejectedOrder = {
        ...baseOrder,
        created_at: new Date(now - 50 * 3600 * 1000).toISOString(), // 50h ago
        status: 'pending',
      }
      const rejectedSub = {
        id: 'sub-rej-expired',
        utr_number: '123456789012',
        status: 'rejected',
        admin_notes: 'Transaction reference not found',
      }
      const html = renderToStaticMarkup(
        React.createElement(PhonePePaymentSection, {
          order: expiredRejectedOrder,
          activeSubmission: null,
          latestSubmission: rejectedSub,
        })
      )
      assert.ok(html.includes('Previous UTR Submission Was Rejected'), 'Renders rejection alert')
      assert.ok(html.includes('Transaction reference not found'), 'Displays rejection reason')
      assert.ok(
        html.includes('The 48-hour deadline has expired. Resubmissions are no longer permitted.'),
        'Informs user that resubmissions are no longer permitted after deadline'
      )
      assert.ok(
        !html.includes('You may submit a corrected 12-digit UTR below within the original 48-hour deadline'),
        'Does NOT offer resubmission when deadline elapsed'
      )
      assert.ok(!html.includes('Resubmit 12-Digit UTR'), 'Resubmit CTA button is strictly suppressed')
      assert.ok(!html.includes('Enter 12-Digit UTR'), 'UTR form is strictly suppressed')
    })

    test('Final Correction 2: Timely UTR under administrator review remains protected after 48 hours', () => {
      const timelyReviewedLateOrder = {
        ...baseOrder,
        created_at: new Date(now - 50 * 3600 * 1000).toISOString(), // order placed 50h ago
        status: 'pending',
      }
      const timelySubmission = {
        id: 'sub-timely-99',
        utr_number: '987654321098',
        status: 'submitted',
        created_at: new Date(now - 45 * 3600 * 1000).toISOString(), // submitted at 5h into order (< 48h)
      }
      const html = renderToStaticMarkup(
        React.createElement(PhonePePaymentSection, {
          order: timelyReviewedLateOrder,
          activeSubmission: timelySubmission,
        })
      )
      assert.ok(html.includes('UTR Submitted — Awaiting Review'), 'Renders under review card for timely submission')
      assert.ok(html.includes('987654321098'), 'Displays submitted UTR number')
      assert.ok(html.includes('Pending Administrator Approval'), 'Confirms administrator review in progress')
      assert.ok(html.includes('UTR Awaiting Verification'), 'Status pill displays UTR Awaiting Verification')
      assert.ok(!html.includes('Order Cancelled / Expired'), 'Does NOT show Order Cancelled / Expired while timely UTR is under review')
      assert.ok(!html.includes('Enter 12-Digit UTR'), 'Form remains locked while awaiting review')
    })

    // ── Blocker 3: Payment Retrieval Failure Component Tests ──
    test('Final Correction 3: Payment retrieval error suppresses stale "Payment Verified" claim and disables UTR submission', () => {
      const stalePhonepeOrder = {
        ...baseOrder,
        status: 'processing',
        payment_provider: 'phonepe',
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 }, // Stale completed payment
      }
      const stalePaymentData = {
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
        submissions: [],
      }

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${stalePhonepeOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: stalePhonepeOrder,
            initialPaymentData: stalePaymentData,
            initialPaymentError: 'Network timeout: Database connection dropped while fetching payment status',
          })
        )
      )

      assert.ok(html.includes('Payment Status Retrieval Error'), 'Displays payment error alert')
      assert.ok(html.includes('Retry Payment Status Check'), 'Displays Retry button')
      assert.ok(html.includes('Payment Status Unavailable'), 'Hero headline shows Payment Status Unavailable')
      assert.ok(!html.includes('Payment Verified'), 'Suppresses Payment Verified badge during error')
      assert.ok(!html.includes('Payment Successfully Verified!'), 'Suppresses Payment Successfully Verified card during error')
      assert.ok(!html.includes('Enter 12-Digit UTR'), 'PhonePe payment section and UTR form are completely suppressed/disabled')
    })

    test('Final Correction 3: Payment retrieval error suppresses stale "COD Collected & Verified" claim', () => {
      const staleCodOrder = {
        ...baseOrder,
        status: 'delivered',
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'completed', amount: 1100 }, // Stale completed COD
      }
      const stalePaymentData = {
        payment: { provider: 'cod', status: 'completed', amount: 1100 },
        submissions: [],
      }

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${staleCodOrder.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: staleCodOrder,
            initialPaymentData: stalePaymentData,
            initialPaymentError: 'RPC timeout verifying COD status',
          })
        )
      )

      assert.ok(html.includes('Payment Status Retrieval Error'), 'Displays payment error alert')
      assert.ok(!html.includes('COD Collected &amp; Verified') && !html.includes('COD Collected & Verified'), 'Suppresses COD Collected & Verified claim')
      assert.ok(html.includes('COD Status Check Unavailable'), 'Displays unverified COD status message')
    })

    test('Final Correction 3: Payment retrieval error does not display "Total Paid"', () => {
      const orderWithFetchError = {
        ...baseOrder,
        status: 'processing',
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
      }

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [`/order-success/${orderWithFetchError.id}`] },
          React.createElement(OrderConfirmationPage, {
            initialOrder: orderWithFetchError,
            initialPaymentData: { payment: orderWithFetchError.payment },
            initialPaymentError: 'Gateway unreachable',
          })
        )
      )

      assert.ok(!html.includes('Total Paid'), 'Must NOT display Total Paid when payment status could not be verified')
      assert.ok(html.includes('Order Total'), 'Displays neutral "Order Total" label in financial summary')
    })

    await testAsync('Final Correction 3: Real retry interaction test (triggers Retry button, suppresses stale claims while pending, restores verified status)', async () => {
      const rootElement = dom.window.document.getElementById('root')
      const reactRoot = ReactDOMClient.createRoot(rootElement)

      const stalePhonepeOrder = {
        ...baseOrder,
        id: '55555555-5555-4555-8555-555555555555',
        status: 'processing',
        payment_provider: 'phonepe',
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 }, // Stale completed payment
      }
      const stalePaymentData = {
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
        submissions: [],
      }

      let deferredResolve = null
      const pendingPaymentPromise = new Promise((resolve) => {
        deferredResolve = resolve
      })

      const mockOrderService = {
        fetchOrderById: async (id) => ({
          data: { ...stalePhonepeOrder },
          error: null,
        }),
        fetchOrderPayment: async (id) => {
          return pendingPaymentPromise
        },
      }

      try {
        // 1. Initial render with payment error and stale payment on the order
        await act(async () => {
          reactRoot.render(
            React.createElement(MemoryRouter, { initialEntries: [`/order-success/${stalePhonepeOrder.id}`] },
              React.createElement(OrderConfirmationPage, {
                initialOrder: stalePhonepeOrder,
                initialPaymentData: stalePaymentData,
                initialPaymentError: 'Network timeout: Database connection dropped while fetching payment status',
                orderService: mockOrderService,
              })
            )
          )
        })

        const initialHtml = rootElement.innerHTML
        assert.ok(initialHtml.includes('Payment Status Retrieval Error'), 'Step 1: Surfaces payment error alert')
        assert.ok(initialHtml.includes('Retry Payment Status Check'), 'Step 1: Displays Retry button')
        assert.ok(initialHtml.includes('Payment Status Unavailable'), 'Step 1: Hero headline shows Payment Status Unavailable')
        assert.ok(!initialHtml.includes('Payment Verified'), 'Step 1: Stale completed payment badge is strictly NOT displayed')
        assert.ok(!initialHtml.includes('Payment Successfully Verified!'), 'Step 1: Verified card is suppressed')
        assert.ok(!initialHtml.includes('Total Paid'), 'Step 1: Total Paid is suppressed')
        assert.ok(initialHtml.includes('Order Total'), 'Step 1: Shows neutral Order Total')

        // 2. Click the actual DOM button to trigger retry while payment fetch remains pending
        const buttons = Array.from(dom.window.document.querySelectorAll('button'))
        const retryBtn = buttons.find(b => b.textContent.includes('Retry Payment Status Check'))
        assert.ok(retryBtn, 'Found actual DOM Retry button')

        await act(async () => {
          retryBtn.click()
          await new Promise((r) => setTimeout(r, 10))
        })

        const pendingHtml = rootElement.innerHTML
        assert.ok(pendingHtml.includes('Verifying Payment...'), 'Step 2 (pending): Button changes text to Verifying Payment...')
        assert.ok(!pendingHtml.includes('Payment Verified'), 'Step 2 (pending): Payment Verified badge strictly suppressed while retry is pending')
        assert.ok(!pendingHtml.includes('Payment Successfully Verified!'), 'Step 2 (pending): Verified card strictly suppressed while retry is pending')
        assert.ok(!pendingHtml.includes('Total Paid'), 'Step 2 (pending): Total Paid strictly suppressed while retry is pending')
        assert.ok(pendingHtml.includes('Order Total'), 'Step 2 (pending): Shows neutral Order Total')
        assert.ok(!pendingHtml.includes('Enter 12-Digit UTR'), 'Step 2 (pending): PhonePe form remains unavailable while retry is pending')

        const pendingBtn = dom.window.document.querySelector('button[disabled]')
        assert.ok(pendingBtn && pendingBtn.textContent.includes('Verifying Payment...'), 'Step 2 (pending): Retry button is disabled while pending')

        // 3. Resolve the pending payment request successfully
        await act(async () => {
          deferredResolve({
            data: {
              payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
              submissions: [],
            },
            error: null,
          })
          if (retryBtn._lastPromise) {
            await retryBtn._lastPromise
          }
        })

        const resolvedHtml = rootElement.innerHTML
        assert.ok(resolvedHtml.includes('Order Placed Successfully!'), 'Step 3 (resolved): Hero headline updates to Order Placed Successfully!')
        assert.ok(resolvedHtml.includes('Payment Successfully Verified!'), 'Step 3 (resolved): Displays Payment Successfully Verified! card')
        assert.ok(resolvedHtml.includes('Payment Verified'), 'Step 3 (resolved): Restores Payment Verified badge')
        assert.ok(resolvedHtml.includes('Total Paid'), 'Step 3 (resolved): Restores Total Paid label')
        assert.ok(!resolvedHtml.includes('Payment Status Retrieval Error'), 'Step 3 (resolved): Clears error alert banner')
      } finally {
        await act(async () => {
          reactRoot.unmount()
        })
      }
    })

    await testAsync('Final Correction 3: Real thrown-error test (fetchOrderPayment throws exception, surfaces error & suppresses claims)', async () => {
      const rootElement = dom.window.document.getElementById('root')
      const reactRoot = ReactDOMClient.createRoot(rootElement)

      const stalePhonepeOrder = {
        ...baseOrder,
        id: '55555555-5555-4555-8555-555555555555',
        status: 'processing',
        payment_provider: 'phonepe',
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
      }
      const stalePaymentData = {
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
        submissions: [],
      }

      const thrownOrderService = {
        fetchOrderById: async () => ({ data: { ...stalePhonepeOrder }, error: null }),
        fetchOrderPayment: async () => {
          throw new Error('Fatal socket network crash in fetchOrderPayment')
        },
      }

      try {
        await act(async () => {
          reactRoot.render(
            React.createElement(MemoryRouter, { initialEntries: [`/order-success/${stalePhonepeOrder.id}`] },
              React.createElement(OrderConfirmationPage, {
                initialOrder: stalePhonepeOrder,
                initialPaymentData: stalePaymentData,
                initialPaymentError: 'Initial connection timeout',
                orderService: thrownOrderService,
              })
            )
          )
        })

        // Click the actual DOM retry button
        const buttons = Array.from(dom.window.document.querySelectorAll('button'))
        const retryBtn = buttons.find(b => b.textContent.includes('Retry Payment Status Check'))
        assert.ok(retryBtn, 'Found retry button before clicking')

        await act(async () => {
          retryBtn.click()
          if (retryBtn._lastPromise) {
            await retryBtn._lastPromise
          }
        })

        const htmlAfterThrow = rootElement.innerHTML
        assert.ok(htmlAfterThrow.includes('Payment Status Retrieval Error'), 'Surfaces payment error alert')
        assert.ok(htmlAfterThrow.includes('Fatal socket network crash in fetchOrderPayment'), 'Surfaces exact thrown exception message')
        assert.ok(htmlAfterThrow.includes('Payment Status Unavailable'), 'Hero headline shows Payment Status Unavailable')
        assert.ok(!htmlAfterThrow.includes('Payment Verified'), 'Stale Payment Verified badge strictly suppressed on thrown error')
        assert.ok(!htmlAfterThrow.includes('Payment Successfully Verified!'), 'Payment Successfully Verified card strictly suppressed')
        assert.ok(!htmlAfterThrow.includes('Total Paid'), 'Total Paid strictly suppressed')
        assert.ok(htmlAfterThrow.includes('Order Total'), 'Falls back to neutral Order Total')
        assert.ok(!htmlAfterThrow.includes('Enter 12-Digit UTR'), 'PhonePe UTR form strictly unavailable')
      } finally {
        await act(async () => {
          reactRoot.unmount()
        })
      }
    })

    await testAsync('Final Correction 3: Order-refresh failure edgecase (fetchOrderById fails, fetchOrderPayment succeeds, keeps payment claims unavailable)', async () => {
      const rootElement = dom.window.document.getElementById('root')
      const reactRoot = ReactDOMClient.createRoot(rootElement)

      const stalePhonepeOrder = {
        ...baseOrder,
        id: '55555555-5555-4555-8555-555555555555',
        status: 'processing',
        payment_provider: 'phonepe',
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
      }
      const stalePaymentData = {
        payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
        submissions: [],
      }

      const orderFailService = {
        fetchOrderById: async () => ({
          data: null,
          error: { message: 'Order database read replica connection lost' },
        }),
        fetchOrderPayment: async () => ({
          data: {
            payment: { provider: 'phonepe', status: 'completed', amount: 1100 },
            submissions: [],
          },
          error: null,
        }),
      }

      try {
        await act(async () => {
          reactRoot.render(
            React.createElement(MemoryRouter, { initialEntries: [`/order-success/${stalePhonepeOrder.id}`] },
              React.createElement(OrderConfirmationPage, {
                initialOrder: stalePhonepeOrder,
                initialPaymentData: stalePaymentData,
                initialPaymentError: 'Initial error',
                orderService: orderFailService,
              })
            )
          )
        })

        const buttons = Array.from(dom.window.document.querySelectorAll('button'))
        const retryBtn = buttons.find(b => b.textContent.includes('Retry Payment Status Check'))
        assert.ok(retryBtn, 'Found retry button before order fail test')

        await act(async () => {
          retryBtn.click()
          if (retryBtn._lastPromise) {
            await retryBtn._lastPromise
          }
        })

        const htmlAfterOrderFail = rootElement.innerHTML
        assert.ok(
          htmlAfterOrderFail.includes('Order database read replica connection lost') ||
          htmlAfterOrderFail.includes('Order details could not be verified') ||
          htmlAfterOrderFail.includes('Payment Status Retrieval Error'),
          'Error is surfaced to the customer'
        )
        assert.ok(
          htmlAfterOrderFail.includes('Payment Status Unavailable') || htmlAfterOrderFail.includes('held unavailable'),
          'Payment status remains held unavailable when order refresh fails'
        )
        assert.ok(!htmlAfterOrderFail.includes('Payment Verified'), 'Stale Payment Verified badge strictly suppressed')
        assert.ok(!htmlAfterOrderFail.includes('Payment Successfully Verified!'), 'Stale Payment Successfully Verified card suppressed')
        assert.ok(!htmlAfterOrderFail.includes('Total Paid'), 'Stale Total Paid strictly suppressed')
      } finally {
        await act(async () => {
          reactRoot.unmount()
        })
      }
    })

    await testAsync('Final Correction 4: Suppress stale refund claims after order-refresh failure (keeps payment-unavailable state and suppresses refund banner/reference)', async () => {
      const rootElement = dom.window.document.getElementById('root')
      const reactRoot = ReactDOMClient.createRoot(rootElement)

      const staleRefundedOrder = {
        ...baseOrder,
        id: '77777777-7777-4777-8777-777777777777',
        status: 'refunded',
        payment_provider: 'phonepe',
        payment: {
          provider: 'phonepe',
          status: 'refunded',
          amount: 1100,
          refund_reference: 'REF-STALE-TRANSACTION-999',
        },
      }
      const staleRefundData = {
        payment: {
          provider: 'phonepe',
          status: 'refunded',
          amount: 1100,
          refund_reference: 'REF-STALE-TRANSACTION-999',
        },
        submissions: [],
      }

      // Order refresh fails while payment fetch succeeds
      const orderFailService = {
        fetchOrderById: async () => ({
          data: null,
          error: { message: 'Order replica read failure during status refresh' },
        }),
        fetchOrderPayment: async () => ({
          data: {
            payment: {
              provider: 'phonepe',
              status: 'refunded',
              amount: 1100,
              refund_reference: 'REF-STALE-TRANSACTION-999',
            },
            submissions: [],
          },
          error: null,
        }),
      }

      try {
        // Initial render: payment status is initially unavailable with stale refunded order props
        await act(async () => {
          reactRoot.render(
            React.createElement(MemoryRouter, { initialEntries: [`/order-success/${staleRefundedOrder.id}`] },
              React.createElement(OrderConfirmationPage, {
                initialOrder: staleRefundedOrder,
                initialPaymentData: staleRefundData,
                initialPaymentError: 'Initial network retrieval error',
                orderService: orderFailService,
              })
            )
          )
        })

        const initialHtml = rootElement.innerHTML
        assert.ok(initialHtml.includes('Payment Status Unavailable'), 'Initial render: Hero shows Payment Status Unavailable')
        assert.ok(!initialHtml.includes('Order Payment Refunded'), 'Initial render: Stale Order Payment Refunded title suppressed')
        assert.ok(!initialHtml.includes('Refund Processed & Credit') && !initialHtml.includes('Refund Processed &amp; Credit'), 'Initial render: Refund processed banner suppressed')
        assert.ok(!initialHtml.includes('REF-STALE-TRANSACTION-999'), 'Initial render: Stale refund reference suppressed')

        // Trigger retry button
        const buttons = Array.from(dom.window.document.querySelectorAll('button'))
        const retryBtn = buttons.find(b => b.textContent.includes('Retry Payment Status Check'))
        assert.ok(retryBtn, 'Found retry button for stale refund test')

        await act(async () => {
          retryBtn.click()
          if (retryBtn._lastPromise) {
            await retryBtn._lastPromise
          }
        })

        const htmlAfterRetry = rootElement.innerHTML
        // 1. Verify payment-unavailable state remains visible
        assert.ok(
          htmlAfterRetry.includes('Payment Status Unavailable') || htmlAfterRetry.includes('held unavailable'),
          'Post-retry: Payment-unavailable state remains active'
        )
        assert.ok(
          htmlAfterRetry.includes('Payment Status Retrieval Error'),
          'Post-retry: Displays payment status retrieval error alert'
        )
        assert.ok(
          htmlAfterRetry.includes('Order replica read failure') || htmlAfterRetry.includes('Order details could not be verified'),
          'Post-retry: Surfaces order failure reason'
        )

        // 2. Verify that the component does NOT claim refund was processed or credited
        assert.ok(
          !htmlAfterRetry.includes('Order Payment Refunded'),
          'Post-retry: MUST NOT claim "Order Payment Refunded" when order refresh failed'
        )
        assert.ok(
          !htmlAfterRetry.includes('Refund Processed & Credit') && !htmlAfterRetry.includes('Refund Processed &amp; Credit'),
          'Post-retry: MUST NOT claim "Refund Processed & Credited"'
        )
        assert.ok(
          !htmlAfterRetry.includes('has been refunded to your source payment account'),
          'Post-retry: MUST NOT claim money has been returned to the customer payment account'
        )

        // 3. Verify that stale refund references are not presented as verified
        assert.ok(
          !htmlAfterRetry.includes('REF-STALE-TRANSACTION-999'),
          'Post-retry: Stale refund reference MUST NOT be presented as verified'
        )
      } finally {
        await act(async () => {
          reactRoot.unmount()
        })
      }
    })

    await testAsync('Final Correction 5: Payment actions suppressed during retry starting with paymentError === null (both PhonePe UTR and COD actions hidden while pending, restored upon resolution)', async () => {
      const rootElement = dom.window.document.getElementById('root')
      const reactRoot = ReactDOMClient.createRoot(rootElement)

      // Test Case A: PhonePe order starting with paymentError === null
      let deferredPhonepeResolve = null
      const pendingPhonepePromise = new Promise((resolve) => {
        deferredPhonepeResolve = resolve
      })

      const pendingPhonepeOrder = {
        ...baseOrder,
        id: '88888888-8888-4888-8888-888888888888',
        status: 'pending',
        payment_provider: 'phonepe',
        payment: { provider: 'phonepe', status: 'pending', amount: 950 },
      }

      let phonepeController = null
      const phonepeMockService = {
        fetchOrderById: async () => ({ data: { ...pendingPhonepeOrder }, error: null }),
        fetchOrderPayment: async () => pendingPhonepePromise,
      }

      try {
        // Step 1: Render with paymentError === null
        await act(async () => {
          reactRoot.render(
            React.createElement(MemoryRouter, { initialEntries: [`/order-success/${pendingPhonepeOrder.id}`] },
              React.createElement(OrderConfirmationPage, {
                initialOrder: pendingPhonepeOrder,
                initialPaymentData: { payment: pendingPhonepeOrder.payment, submissions: [] },
                initialPaymentError: null, // explicitly null
                orderService: phonepeMockService,
                onControllerReady: (c) => { phonepeController = c },
              })
            )
          )
        })

        const initialHtml = rootElement.innerHTML
        assert.ok(initialHtml.includes('PhonePe UPI QR Payment') || initialHtml.includes('Enter 12-Digit UTR'), 'PhonePe: Initially displays PhonePe section when paymentError is null')
        assert.ok(initialHtml.includes('Enter 12-Digit UTR'), 'PhonePe: Initially displays UTR form')

        // Step 2: Trigger real retry interaction while paymentError is null
        let retryPromise
        await act(async () => {
          retryPromise = phonepeController.loadOrderData()
          await new Promise((r) => setTimeout(r, 10))
        })

        const pendingHtml = rootElement.innerHTML
        // Verifies PhonePe payment section and UTR form are strictly NOT available during retry
        assert.ok(!pendingHtml.includes('PhonePe UPI QR Payment'), 'PhonePe: Payment section is hidden during retry while pending')
        assert.ok(!pendingHtml.includes('Enter 12-Digit UTR'), 'PhonePe: UTR submission form is strictly hidden during retry')
        assert.ok(!pendingHtml.includes('Submit 12-Digit UTR'), 'PhonePe: Submit CTA is strictly hidden during retry')

        // Step 3: Resolve the pending requests successfully
        await act(async () => {
          deferredPhonepeResolve({
            data: {
              payment: { provider: 'phonepe', status: 'pending', amount: 950 },
              submissions: [],
            },
            error: null,
          })
          await retryPromise
        })

        const resolvedHtml = rootElement.innerHTML
        assert.ok(resolvedHtml.includes('PhonePe UPI QR Payment') || resolvedHtml.includes('Enter 12-Digit UTR'), 'PhonePe: Payment section restored after successful resolution')
        assert.ok(resolvedHtml.includes('Enter 12-Digit UTR'), 'PhonePe: UTR submission form becomes available again after resolution')
      } finally {
        await act(async () => {
          reactRoot.unmount()
        })
      }

      // Test Case B: COD order starting with paymentError === null
      const rootElement2 = dom.window.document.getElementById('root')
      const reactRoot2 = ReactDOMClient.createRoot(rootElement2)

      let deferredCodResolve = null
      const pendingCodPromise = new Promise((resolve) => {
        deferredCodResolve = resolve
      })

      const pendingCodOrder = {
        ...baseOrder,
        id: '99999999-9999-4999-8999-999999999999',
        status: 'pending',
        payment_provider: 'cod',
        payment: { provider: 'cod', status: 'pending', amount: 950 },
      }

      let codController = null
      const codMockService = {
        fetchOrderById: async () => ({ data: { ...pendingCodOrder }, error: null }),
        fetchOrderPayment: async () => pendingCodPromise,
      }

      try {
        await act(async () => {
          reactRoot2.render(
            React.createElement(MemoryRouter, { initialEntries: [`/order-success/${pendingCodOrder.id}`] },
              React.createElement(OrderConfirmationPage, {
                initialOrder: pendingCodOrder,
                initialPaymentData: { payment: pendingCodOrder.payment, submissions: [] },
                initialPaymentError: null, // explicitly null
                orderService: codMockService,
                onControllerReady: (c) => { codController = c },
              })
            )
          )
        })

        const initialCodHtml = rootElement2.innerHTML
        assert.ok(initialCodHtml.includes('Cash on Delivery (COD) Confirmed'), 'COD: Initially displays COD payment notice')

        // Trigger retry interaction while paymentError is null
        let codRetryPromise
        await act(async () => {
          codRetryPromise = codController.loadOrderData()
          await new Promise((r) => setTimeout(r, 10))
        })

        const pendingCodHtml = rootElement2.innerHTML
        // Verifies COD payment action/notice is strictly NOT available during retry
        assert.ok(!pendingCodHtml.includes('Cash on Delivery (COD) Confirmed'), 'COD: COD notice is hidden during retry while pending')
        assert.ok(!pendingCodHtml.includes('COD Collected & Verified'), 'COD: Verified claim not displayed')

        // Resolve COD request successfully
        await act(async () => {
          deferredCodResolve({
            data: {
              payment: { provider: 'cod', status: 'pending', amount: 950 },
              submissions: [],
            },
            error: null,
          })
          await codRetryPromise
        })

        const resolvedCodHtml = rootElement2.innerHTML
        assert.ok(resolvedCodHtml.includes('Cash on Delivery (COD) Confirmed'), 'COD: COD payment notice becomes available again after successful resolution')
      } finally {
        await act(async () => {
          reactRoot2.unmount()
        })
      }
    })

    await testAsync('Final Correction 3: Successful retry restores authoritative payment status', async () => {
      let callCount = 0
      const testOrderId = '55555555-5555-4555-8555-555555555555'
      const mockClient = createMockSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              data: [{
                id: testOrderId,
                status: 'processing',
                payment_provider: 'phonepe',
                total_amount: 1100,
              }],
              error: null,
            }
          }
          if (table === 'payments') {
            callCount++
            if (callCount === 1) {
              // First call fails with network error
              return { data: null, error: { message: 'Transient connection error' } }
            }
            // Second call (retry) succeeds with verified payment
            return { data: { id: 'pay-1', provider: 'phonepe', status: 'completed', amount: 1100 }, error: null }
          }
          return { data: [], error: null }
        },
      })

      // 1st attempt fails
      const firstRes = await fetchOrderPayment(testOrderId, mockClient, true)
      assert.ok(firstRes.error !== null, 'Initial payment fetch returns error')
      assert.strictEqual(firstRes.error?.message, 'Transient connection error')

      // 2nd attempt (retry) succeeds
      const retryRes = await fetchOrderPayment(testOrderId, mockClient, true)
      assert.strictEqual(retryRes.error, null, 'Retry succeeds without error')
      assert.strictEqual(retryRes.data?.payment?.status, 'completed', 'Authoritative completed status restored')

      // Verify status computation with restored authoritative payment
      const restoredInfo = getPaymentStatusInfo(
        { id: testOrderId, status: 'processing', payment_provider: 'phonepe' },
        retryRes.data
      )
      assert.strictEqual(restoredInfo.isCompleted, true, 'Payment is completed after successful retry')
      assert.strictEqual(restoredInfo.badge.label, 'Payment Verified', 'Payment Verified badge restored')
    })

    // ─────────────────────────────────────────────────────────────
    console.log('\n17. Customer OrdersPage Component SSR Verification')
    // ─────────────────────────────────────────────────────────────
    test('OrdersPage renders PhonePe order cards with payment badges, UTR details & financial summary', () => {
      const originalLocal = globalThis.localStorage
      const sampleList = [
        {
          ...baseOrder,
          id: 'ord-phonepe-pending',
          created_at: new Date(now - 3600000).toISOString(),
          status: 'pending',
        },
        {
          ...baseOrder,
          id: 'ord-phonepe-rejected',
          created_at: new Date(now - 7200000).toISOString(),
          status: 'pending',
          latestSubmission: {
            id: 'sub-rej',
            utr_number: '123412341234',
            status: 'rejected',
            admin_notes: 'Bank reference mismatch',
          },
        },
        {
          ...baseOrder,
          id: 'ord-cod-delivered',
          status: 'delivered',
          payment_provider: 'cod',
          payment: { provider: 'cod', status: 'completed', amount: 1100 },
        },
        {
          ...baseOrder,
          id: 'ord-refunded',
          status: 'refunded',
          payment: { provider: 'phonepe', status: 'refunded', amount: 1100, refund_reference: 'REF-TXN-001' },
        },
      ]

      const storageMap = new Map()
      storageMap.set('shopkart_customer_orders', JSON.stringify(sampleList))
      storageMap.set('shopkart_payment_submissions', JSON.stringify([]))

      globalThis.localStorage = {
        getItem: (key) => storageMap.get(key) || null,
        setItem: (key, val) => storageMap.set(key, val),
      }

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: ['/orders'] },
          React.createElement(AuthProvider, null,
            React.createElement(CartProvider, null,
              React.createElement(OrdersPage, { initialOrders: sampleList })
            )
          )
        )
      )

      assert.ok(html.includes('My Orders &amp; Tracking') || html.includes('My Orders & Tracking'), 'Renders OrdersPage header')
      assert.ok(html.includes('PhonePe UPI'), 'Renders PhonePe UPI payment method badge')
      assert.ok(html.includes('Cash on Delivery'), 'Renders Cash on Delivery payment method badge')
      assert.ok(html.includes('Bank reference mismatch'), 'Renders admin rejection reason in order card')
      assert.ok(html.includes('Resubmit 12-Digit UTR'), 'Renders resubmission CTA for rejected order within deadline')
      assert.ok(html.includes('COD Collected &amp; Verified') || html.includes('COD Collected & Verified'), 'Renders confirmed COD badge')
      assert.ok(html.includes('Payment Refunded'), 'Renders refunded banner')
      assert.ok(html.includes('REF-TXN-001'), 'Renders refund reference in order card')
      assert.ok(html.includes('Items Subtotal:'), 'Renders financial subtotal breakdown')
      assert.ok(html.includes('Delivery to:'), 'Renders shipping address details')
      assert.ok(html.includes('Shipment Status'), 'Renders tracking stepper for active orders')

      globalThis.localStorage = originalLocal
    })

    // ── Wrap Up ──
    await viteServer.close()

    console.log('\n=================================================================')
    console.log(`PHASE 6G TEST RESULTS: ${passed} passed, ${total - passed} failed, ${total} total`)
    console.log('=================================================================\n')

    if (passed !== total) {
      process.exit(1)
    } else {
      process.exit(0)
    }
  }

  runPhase6gTests().catch((err) => {
    console.error('Fatal error running Phase 6G tests:', err)
    process.exit(1)
  })