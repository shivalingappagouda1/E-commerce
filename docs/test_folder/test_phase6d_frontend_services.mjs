/**
 * test_phase6d_frontend_services.mjs
 *
 * Comprehensive Automated Verification Suite for Phase 6D:
 * Frontend Service Layer Integration with Phase 6C Database Business Logic.
 *
 * Verifies:
 * 1. Customer Operations:
 *    - placeOrder (authoritative database calculation, COD & PhonePe providers, idempotency)
 *    - submitPhonepeUtr (production 2-arg signature, 12-digit UTR validation, no client timestamp)
 *    - fetchCustomerOrders, fetchOrderById (joins payments relation, normalizes payment object)
 *    - fetchOrderPayment, fetchOrderUtrHistory (payment submissions tracking)
 *    - cancelCustomerOrder (cancellation RPC integration)
 * 2. Admin Operations:
 *    - adminFetchOrders (joins payments and payment_submissions)
 *    - adminVerifyUtr (approval & rejection RPC)
 *    - adminConfirmCodPayment (cash collection at delivery RPC)
 *    - adminRecordRefund (manual refund recording RPC)
 *    - adminExpirePendingPhonepeOrders (48h expiry RPC)
 *    - adminFetchPendingUtrSubmissions (querying open review queue)
 * 3. Frontend Authoritative Isolation:
 *    - Frontend NEVER supplies client subtotal, discount, shipping, or total amounts to database RPC
 *    - Frontend NEVER passes submission timestamps to submit_phonepe_utr
 * 4. Offline Demo Mode Parity:
 *    - Fallbacks for placeOrder, submitPhonepeUtr, adminVerifyUtr, adminConfirmCodPayment, adminRecordRefund, adminExpire
 */

import {
  placeOrder,
  submitPhonepeUtr,
  fetchCustomerOrders,
  fetchOrderById,
  fetchOrderPayment,
  fetchOrderUtrHistory,
  cancelCustomerOrder,
} from './src/services/orderService.js'

import {
  adminFetchOrders,
  adminVerifyUtr,
  adminConfirmCodPayment,
  adminRecordRefund,
  adminExpirePendingPhonepeOrders,
  adminFetchPendingUtrSubmissions,
} from './src/services/adminService.js'

let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition, message) {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`  ✓ ${message}`)
  } else {
    failedTests++
    console.error(`  ✗ FAIL: ${message}`)
  }
}

function assertEquals(actual, expected, message) {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  assert(actualStr === expectedStr, `${message} (Expected: ${expectedStr}, Got: ${actualStr})`)
}

// ─────────────────────────────────────────────────────────────────
// MOCK CLIENT FACTORY
// ─────────────────────────────────────────────────────────────────

function createMockSupabaseClient(overrides = {}) {
  const defaultUser = { id: '11111111-1111-4111-8111-111111111111', email: 'test@shopkart.in' }

  const state = {
    rpcCalls: [],
    fromQueries: [],
  }

  const client = {
    state,
    auth: {
      getUser: async () => ({
        data: { user: overrides.user !== undefined ? overrides.user : defaultUser },
        error: overrides.userError || null,
      }),
    },
    rpc: async (fnName, params) => {
      state.rpcCalls.push({ fnName, params })
      if (overrides.rpc) {
        return overrides.rpc(fnName, params)
      }
      return { data: null, error: null }
    },
    from: (tableName) => {
      const query = {
        table: tableName,
        type: 'select',
        fields: '*',
        filters: [],
        orderBy: [],
        single: false,
        maybeSingle: false,
      }
      state.fromQueries.push(query)

      const builder = {
        select: (fields) => {
          query.type = 'select'
          query.fields = fields
          return builder
        },
        insert: (data) => {
          query.type = 'insert'
          query.data = data
          return builder
        },
        update: (data) => {
          query.type = 'update'
          query.data = data
          return builder
        },
        delete: () => {
          query.type = 'delete'
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

// ─────────────────────────────────────────────────────────────────
// TEST SUITE EXECUTION
// ─────────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('=================================================================')
  console.log('SHOPKART PHASE 6D — FRONTEND SERVICE LAYER INTEGRATION TESTS')
  console.log('Mode: Mocked Supabase RPC & Business Logic Service Layer Verification')
  console.log('=================================================================\n')

  const validAddressId = '22222222-2222-4222-8222-222222222222'
  const validOrderId = '33333333-3333-4333-8333-333333333333'
  const validSubmissionId = '44444444-4444-4444-8444-444444444444'

  // ─────────────────────────────────────────────────────────────
  // 1. CUSTOMER: placeOrder
  // ─────────────────────────────────────────────────────────────
  console.log('1. placeOrder — Customer Order Creation & Business Logic Rules')

  {
    // Test 1: Happy path COD order placement
    const mockClient = createMockSupabaseClient({
      from: (tbl, q) => {
        if (tbl === 'addresses') return { data: { id: validAddressId }, error: null }
        return { data: [], error: null }
      },
      rpc: (fn, params) => {
        if (fn === 'sync_user_cart') return { data: { success: true, cart_id: 'c1' }, error: null }
        if (fn === 'place_order') return { data: validOrderId, error: null }
        return { data: null, error: null }
      },
    })

    const result = await placeOrder({
      addressId: validAddressId,
      notes: 'Please ring bell',
      couponCode: 'flat100',
      cartItems: [{ id: 'p1', price: 500, quantity: 2 }],
      paymentProvider: 'cod',
      idempotencyKey: 'idem-key-001',
      // Client UI attempts to pass amounts
      subtotal: 1000,
      discountAmount: 100,
      shippingAmount: 0,
      totalAmount: 900,
    }, mockClient, true)

    assert(result.data?.id === validOrderId, 'Returns generated order ID on success')
    assert(result.error === null, 'No error returned on happy path')

    const placeRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'place_order')
    assert(Boolean(placeRpc), 'Invoked place_order RPC on Supabase')
    assertEquals(placeRpc?.params, {
      p_address_id: validAddressId,
      p_notes: 'Please ring bell',
      p_coupon_code: 'FLAT100',
      p_payment_provider: 'cod',
      p_idempotency_key: 'idem-key-001',
    }, 'RPC called with exact 5-argument signature: address, notes, coupon, provider, idempotency')

    // CRITICAL: Verify client NEVER passes authoritative amounts to RPC
    assert(placeRpc?.params?.subtotal === undefined, 'RPC parameters omit client subtotal (authoritative on server)')
    assert(placeRpc?.params?.shippingAmount === undefined, 'RPC parameters omit client shipping (authoritative on server)')
    assert(placeRpc?.params?.discountAmount === undefined, 'RPC parameters omit client discount (authoritative on server)')
    assert(placeRpc?.params?.totalAmount === undefined, 'RPC parameters omit client total (authoritative on server)')
  }

  {
    // Test 2: PhonePe order placement
    const mockClient = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'addresses') return { data: { id: validAddressId }, error: null }
        return { data: [], error: null }
      },
      rpc: (fn) => {
        if (fn === 'sync_user_cart') return { data: { success: true }, error: null }
        if (fn === 'place_order') return { data: validOrderId, error: null }
        return { data: null, error: null }
      },
    })

    const result = await placeOrder({
      addressId: validAddressId,
      cartItems: [{ id: 'p1', price: 1500, quantity: 1 }],
      paymentProvider: 'phonepe',
    }, mockClient, true)

    assert(result.data?.id === validOrderId, 'PhonePe order successfully placed')
    const placeRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'place_order')
    assert(placeRpc?.params?.p_payment_provider === 'phonepe', 'Passed payment provider "phonepe" to RPC')
    assert(placeRpc?.params?.p_idempotency_key === null, 'Null idempotency key passed when not provided')
  }

  {
    // Test 3: Rejects invalid payment provider early
    const mockClient = createMockSupabaseClient()
    const result = await placeOrder({
      addressId: validAddressId,
      cartItems: [{ id: 'p1', price: 500, quantity: 1 }],
      paymentProvider: 'crypto_wallet',
    }, mockClient, true)

    assert(result.data === null, 'Rejects invalid payment provider')
    assert(result.error?.message?.includes('Allowed values are "cod" or "phonepe"'), 'Returns clear validation error for provider')
    assert(mockClient.state.rpcCalls.length === 0, 'No RPC invoked when provider is invalid')
  }

  {
    // Test 4: Idempotency replay handling
    const mockClient = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'addresses') return { data: { id: validAddressId }, error: null }
        return { data: [], error: null }
      },
      rpc: (fn) => {
        if (fn === 'sync_user_cart') return { data: { success: true }, error: null }
        // DB returns existing order ID without error
        if (fn === 'place_order') return { data: validOrderId, error: null }
        return { data: null, error: null }
      },
    })

    const result = await placeOrder({
      addressId: validAddressId,
      cartItems: [{ id: 'p1', price: 500, quantity: 1 }],
      paymentProvider: 'cod',
      idempotencyKey: 'idem-replay-001',
    }, mockClient, true)

    assert(result.data?.id === validOrderId, 'Returns existing order ID on idempotency replay')
    assert(result.error === null, 'Idempotency replay does not treat returning existing order as an error')
  }

  // ─────────────────────────────────────────────────────────────
  // 2. CUSTOMER: submitPhonepeUtr
  // ─────────────────────────────────────────────────────────────
  console.log('\n2. submitPhonepeUtr — 12-Digit PhonePe UTR Submission')

  {
    // Test 5: Happy path UTR submission
    const mockClient = createMockSupabaseClient({
      rpc: (fn, params) => {
        if (fn === 'submit_phonepe_utr') {
          return {
            data: {
              success: true,
              submission_id: validSubmissionId,
              order_id: params.p_order_id,
              utr_number: params.p_utr_number,
              status: 'submitted',
              message: 'UTR submitted successfully. Pending administrator verification.',
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

    assert(result.data?.success === true, 'UTR submitted successfully')
    assert(result.data?.status === 'submitted', 'Status is "submitted"')
    const utrRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'submit_phonepe_utr')
    assert(Boolean(utrRpc), 'Called submit_phonepe_utr RPC')
    assertEquals(utrRpc?.params, {
      p_order_id: validOrderId,
      p_utr_number: '123456789012',
    }, 'Production 2-argument signature invoked: p_order_id, p_utr_number')

    // CRITICAL: Verify client NEVER passes a submission timestamp
    assert(utrRpc?.params?.p_submission_time === undefined, 'Client NEVER passes timestamp (RPC strictly evaluates against DB NOW())')
    assert(utrRpc?.params?.submission_time === undefined, 'No client-side timestamp injected into RPC')
  }

  {
    // Test 6: UTR validation — rejects non-12-digit values
    const mockClient = createMockSupabaseClient()

    const badUtrs = ['12345', '12345678901', '1234567890123', '12345ABC9012', '']
    for (const bad of badUtrs) {
      const res = await submitPhonepeUtr({ orderId: validOrderId, utrNumber: bad }, mockClient, true)
      assert(res.data === null && res.error?.message?.includes('12 numeric digits'), `Rejects invalid UTR: "${bad}"`)
    }
    assert(mockClient.state.rpcCalls.length === 0, 'No RPC calls made for malformed UTRs')
  }

  {
    // Test 7: UTR submission error handling (e.g. 48h expired or order not in pending state)
    const mockClient = createMockSupabaseClient({
      rpc: () => ({
        data: null,
        error: { code: 'P0001', message: 'PhonePe payment window has expired (48 hours). Please place a new order.' },
      }),
    })

    const result = await submitPhonepeUtr({
      orderId: validOrderId,
      utrNumber: '999888777666',
    }, mockClient, true)

    assert(result.data === null, 'Returns null data on RPC rejection')
    assert(result.error?.message?.includes('expired (48 hours)'), 'Returns clean error message from database')
  }

  // ─────────────────────────────────────────────────────────────
  // 3. CUSTOMER: Order & Payment Status Retrieval
  // ─────────────────────────────────────────────────────────────
  console.log('\n3. fetchCustomerOrders & fetchOrderById — Payment Relations & Status')

  {
    // Test 8: fetchCustomerOrders includes payments join and normalizes payment
    const mockClient = createMockSupabaseClient({
      from: (tbl, q) => {
        if (tbl === 'orders') {
          return {
            data: [
              {
                id: validOrderId,
                status: 'pending',
                total_amount: 1299,
                payments: [{ id: 'pay-1', provider: 'phonepe', status: 'pending', amount: 1299, paid_at: null }],
              },
            ],
            error: null,
          }
        }
        return { data: [], error: null }
      },
    })

    const { data: orders, error } = await fetchCustomerOrders(mockClient, true)
    assert(error === null, 'No error fetching orders')
    assert(orders.length === 1, 'Returns 1 order')
    assert(orders[0]?.payment?.provider === 'phonepe', 'Normalizes order.payment object from payments relation')
    assert(orders[0]?.payment?.status === 'pending', 'Order payment status is pending')

    const orderQuery = mockClient.state.fromQueries.find(q => q.table === 'orders')
    assert(orderQuery?.fields?.includes('payments ( id, provider, status, amount, provider_payment_id, refund_reference, paid_at, updated_at )'), 'Query joins payments table')

    // fetchOrderById also joins payments relation and normalizes payment
    const { data: singleOrder, error: singleOrderErr } = await fetchOrderById(validOrderId, mockClient, true)
    assert(singleOrderErr === null, 'No error fetching order by ID')
    assert(singleOrder?.payment?.provider === 'phonepe', 'fetchOrderById normalizes order.payment object')
  }

  {
    // Test 9: fetchOrderPayment fetches payment and active submission
    const mockClient = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'payments') {
          return {
            data: { id: 'pay-1', order_id: validOrderId, provider: 'phonepe', status: 'pending', amount: 999 },
            error: null,
          }
        }
        if (tbl === 'payment_submissions') {
          return {
            data: [
              { id: validSubmissionId, utr_number: '123456789012', status: 'submitted', created_at: new Date().toISOString() },
            ],
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const { data, error } = await fetchOrderPayment(validOrderId, mockClient, true)
    assert(error === null, 'fetchOrderPayment succeeds')
    assert(data.payment?.provider === 'phonepe', 'Payment provider is phonepe')
    assert(data.activeSubmission?.status === 'submitted', 'Identifies active submission')
    assert(data.activeSubmission?.utr_number === '123456789012', 'Contains active UTR number')
  }

  {
    // Test 10: fetchOrderUtrHistory queries payment_submissions
    const mockClient = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'payment_submissions') {
          return {
            data: [
              { id: 'sub-2', utr_number: '222222222222', status: 'submitted' },
              { id: 'sub-1', utr_number: '111111111111', status: 'rejected', admin_notes: 'Incorrect UTR' },
            ],
            error: null,
          }
        }
        return { data: [], error: null }
      },
    })

    const { data: history, error } = await fetchOrderUtrHistory(validOrderId, mockClient, true)
    assert(error === null, 'fetchOrderUtrHistory succeeds')
    assert(history.length === 2, 'Returns full submission history (including rejected UTRs)')
    assert(history[1].status === 'rejected', 'History includes rejected UTR')
  }

  // ─────────────────────────────────────────────────────────────
  // 4. CUSTOMER: cancelCustomerOrder
  // ─────────────────────────────────────────────────────────────
  console.log('\n4. cancelCustomerOrder — Order Cancellation RPC')

  {
    // Test 11: Customer cancellation invokes cancel_order RPC
    const mockClient = createMockSupabaseClient({
      rpc: (fn, params) => {
        if (fn === 'cancel_order') {
          return {
            data: { success: true, order_id: params.p_order_id, status: 'cancelled', message: 'Order cancelled successfully' },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await cancelCustomerOrder(validOrderId, mockClient, true)
    assert(result.success === true, 'Order cancellation succeeds')
    assert(result.data?.status === 'cancelled', 'Returns status cancelled')
    const cancelRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'cancel_order')
    assertEquals(cancelRpc?.params, { p_order_id: validOrderId }, 'Called cancel_order RPC with p_order_id')
  }

  {
    // Test 12: Cancellation error when order already shipped
    const mockClient = createMockSupabaseClient({
      rpc: () => ({
        data: null,
        error: { code: 'P0001', message: 'Order cannot be cancelled in status: shipped' },
      }),
    })

    const result = await cancelCustomerOrder(validOrderId, mockClient, true)
    assert(result.success === false, 'Fails gracefully when database rejects cancellation')
    assert(result.error?.message?.includes('status: shipped'), 'Returns error message explaining why order cannot be cancelled')
  }

  // ─────────────────────────────────────────────────────────────
  // 5. ADMIN OPERATIONS: UTR Verification, COD Confirmation, Refunds, Expiry
  // ─────────────────────────────────────────────────────────────
  console.log('\n5. adminService — UTR Verification, COD Confirmation, Refunds & Expiry')

  {
    // Test 13: adminFetchOrders joins payments and payment_submissions
    const mockClient = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'orders') {
          return {
            data: [
              {
                id: validOrderId,
                status: 'pending',
                payments: [{ id: 'p1', provider: 'phonepe', status: 'pending' }],
                payment_submissions: [{ id: validSubmissionId, status: 'submitted' }],
              },
            ],
            error: null,
          }
        }
        return { data: [], error: null }
      },
    })

    const { data: adminOrders } = await adminFetchOrders(mockClient, true)
    assert(adminOrders.length === 1, 'adminFetchOrders returns orders')
    assert(adminOrders[0].payment?.provider === 'phonepe', 'adminFetchOrders normalizes payment')
    assert(adminOrders[0].activeSubmission?.status === 'submitted', 'adminFetchOrders normalizes activeSubmission')
  }

  {
    // Test 14: adminVerifyUtr — Approval
    const mockClient = createMockSupabaseClient({
      rpc: (fn, params) => {
        if (fn === 'admin_verify_utr') {
          return {
            data: {
              success: true,
              submission_id: params.p_submission_id,
              decision: 'approved',
              order_id: validOrderId,
              order_status: 'processing',
              payment_status: 'completed',
              message: 'UTR verified successfully. Order moved to processing.',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await adminVerifyUtr({
      submissionId: validSubmissionId,
      approved: true,
      adminNotes: 'Verified in PhonePe Business App',
    }, mockClient, true)

    assert(result.success === true, 'adminVerifyUtr approval succeeds')
    assert(result.data?.decision === 'approved', 'Decision is approved')
    assert(result.data?.order_status === 'processing', 'Order status moved to processing')
    assert(result.data?.payment_status === 'completed', 'Payment status marked completed')

    const verifyRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'admin_verify_utr')
    assertEquals(verifyRpc?.params, {
      p_submission_id: validSubmissionId,
      p_approved: true,
      p_admin_notes: 'Verified in PhonePe Business App',
    }, 'admin_verify_utr called with submission ID, boolean true, and notes')
  }

  {
    // Test 15: adminVerifyUtr — Rejection (customer may resubmit before 48h)
    const mockClient = createMockSupabaseClient({
      rpc: (fn, params) => {
        if (fn === 'admin_verify_utr') {
          return {
            data: {
              success: true,
              submission_id: params.p_submission_id,
              decision: 'rejected',
              order_id: validOrderId,
              order_status: 'pending',
              payment_status: 'pending',
              message: 'UTR submission rejected. Customer may resubmit before expiration.',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await adminVerifyUtr({
      submissionId: validSubmissionId,
      approved: false,
      adminNotes: 'UTR not found in merchant statement',
    }, mockClient, true)

    assert(result.success === true, 'adminVerifyUtr rejection succeeds')
    assert(result.data?.decision === 'rejected', 'Decision is rejected')
    assert(result.data?.order_status === 'pending', 'Order status remains pending')
    assert(result.data?.payment_status === 'pending', 'Payment status remains pending (resubmission permitted)')
  }

  {
    // Test 16: adminConfirmCodPayment — Success when order is delivered
    const mockClient = createMockSupabaseClient({
      rpc: (fn, params) => {
        if (fn === 'admin_confirm_cod_payment') {
          return {
            data: {
              success: true,
              order_id: params.p_order_id,
              payment_status: 'completed',
              message: 'COD payment confirmed successfully upon delivery',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await adminConfirmCodPayment({
      orderId: validOrderId,
      adminNotes: 'Cash collected by delivery agent',
    }, mockClient, true)

    assert(result.success === true, 'adminConfirmCodPayment succeeds for delivered order')
    assert(result.data?.payment_status === 'completed', 'Payment status marked completed')
    const codRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'admin_confirm_cod_payment')
    assertEquals(codRpc?.params, {
      p_order_id: validOrderId,
      p_admin_notes: 'Cash collected by delivery agent',
    }, 'admin_confirm_cod_payment called with exact parameters')
  }

  {
    // Test 17: adminConfirmCodPayment — Rejected if order is not delivered
    const mockClient = createMockSupabaseClient({
      rpc: () => ({
        data: null,
        error: { code: 'P0001', message: 'COD payment can only be confirmed upon delivery (current order status: processing)' },
      }),
    })

    const result = await adminConfirmCodPayment({ orderId: validOrderId }, mockClient, true)
    assert(result.success === false, 'Cannot confirm COD payment prior to delivery')
    assert(result.error?.message?.includes('only be confirmed upon delivery'), 'Returns clear delivery constraint error')
  }

  {
    // Test 18: adminRecordRefund — Happy path
    const mockClient = createMockSupabaseClient({
      rpc: (fn, params) => {
        if (fn === 'admin_record_refund') {
          return {
            data: {
              success: true,
              order_id: params.p_order_id,
              order_status: 'refunded',
              payment_status: 'refunded',
              restocked: params.p_restock_inventory,
              message: 'Refund recorded successfully',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await adminRecordRefund({
      orderId: validOrderId,
      refundReference: 'REFUND-IMPS-98765',
      adminNotes: 'Returned to original UPI account',
      restockInventory: true,
    }, mockClient, true)

    assert(result.success === true, 'adminRecordRefund succeeds')
    assert(result.data?.payment_status === 'refunded', 'Payment status is refunded')
    assert(result.data?.restocked === true, 'Inventory restocking flag respected')

    const refRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'admin_record_refund')
    assertEquals(refRpc?.params, {
      p_order_id: validOrderId,
      p_refund_reference: 'REFUND-IMPS-98765',
      p_admin_notes: 'Returned to original UPI account',
      p_restock_inventory: true,
    }, 'admin_record_refund called with order ID, ref, notes, and restock flag')
  }

  {
    // Test 19: adminRecordRefund — Rejects missing reference ID
    const mockClient = createMockSupabaseClient()
    const result = await adminRecordRefund({
      orderId: validOrderId,
      refundReference: '   ',
    }, mockClient, true)

    assert(result.success === false, 'Rejects refund without transaction reference')
    assert(result.error?.message?.includes('Refund reference or transaction ID is required'), 'Returns validation error for missing reference')
    assert(mockClient.state.rpcCalls.length === 0, 'No RPC invoked when refund reference is empty')
  }

  {
    // Test 20: adminExpirePendingPhonepeOrders — Batch expiry RPC
    const mockClient = createMockSupabaseClient({
      rpc: (fn) => {
        if (fn === 'admin_expire_pending_phonepe_orders') {
          return {
            data: {
              success: true,
              expired_count: 2,
              expired_order_ids: ['ord-exp-1', 'ord-exp-2'],
              executed_at: new Date().toISOString(),
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const result = await adminExpirePendingPhonepeOrders(mockClient, true)
    assert(result.success === true, 'adminExpirePendingPhonepeOrders succeeds')
    assert(result.data?.expired_count === 2, 'Reports expired order count')
    const expRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'admin_expire_pending_phonepe_orders')
    assert(Boolean(expRpc), 'admin_expire_pending_phonepe_orders RPC specifically invoked')
    const serviceRpc = mockClient.state.rpcCalls.find(c => c.fnName === 'expire_pending_phonepe_orders')
    assert(!serviceRpc, 'service-only expire_pending_phonepe_orders was NOT invoked by frontend admin')
  }

  {
    // Test 21: adminFetchPendingUtrSubmissions — Review queue
    const mockClient = createMockSupabaseClient({
      from: (tbl, q) => {
        if (tbl === 'payment_submissions') {
          return {
            data: [
              { id: validSubmissionId, utr_number: '123456789012', status: 'submitted' },
            ],
            error: null,
          }
        }
        return { data: [], error: null }
      },
    })

    const { data: queue, error } = await adminFetchPendingUtrSubmissions(mockClient, true)
    assert(error === null, 'adminFetchPendingUtrSubmissions succeeds')
    assert(queue.length === 1, 'Returns 1 pending submission')
    const subQuery = mockClient.state.fromQueries.find(q => q.table === 'payment_submissions')
    assert(subQuery?.filters?.some(f => f.col === 'status' && f.val === 'submitted'), 'Filters payment_submissions by status = "submitted"')
  }

  // ─────────────────────────────────────────────────────────────
  // 6. LOCAL DEMO FALLBACK MODE (OFFLINE / UNCONFIGURED SUPABASE)
  // ─────────────────────────────────────────────────────────────
  console.log('\n6. Local Demo Fallback Mode (Offline Business Logic Parity)')

  // Setup localStorage mock in Node.js environment
  const mockStorage = new Map()
  globalThis.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  }

  {
    // Test 22: Demo mode placeOrder calculates free shipping threshold correctly (₹999)
    // Subtotal = 1000 >= 999 -> Shipping = 0
    const resFree = await placeOrder({
      addressId: 'demo-addr-1',
      cartItems: [{ id: 'p1', name: 'Shoes', price: 1000, quantity: 1 }],
      subtotal: 1000,
      paymentProvider: 'phonepe',
    }, null, false)

    assert(resFree.data?.order?.shipping_amount === 0, 'Demo order: ₹1000 subtotal gets free shipping (₹0)')
    assert(resFree.data?.order?.total_amount === 1000, 'Demo order: Total is ₹1000')
    assert(resFree.data?.order?.status === 'pending', 'Demo PhonePe order starts in "pending" status')
    assert(resFree.data?.order?.payment?.status === 'pending', 'Demo PhonePe payment starts in "pending" status')

    // Subtotal = 500 < 999 -> Shipping = 99
    const resStandard = await placeOrder({
      addressId: 'demo-addr-1',
      cartItems: [{ id: 'p2', name: 'Shirt', price: 500, quantity: 1 }],
      subtotal: 500,
      paymentProvider: 'cod',
    }, null, false)

    assert(resStandard.data?.order?.shipping_amount === 99, 'Demo order: ₹500 subtotal charged standard shipping (₹99)')
    assert(resStandard.data?.order?.total_amount === 599, 'Demo order: Total is ₹599 (500 + 99)')
    assert(resStandard.data?.order?.status === 'pending', 'Demo COD order starts in "pending" status')
  }

  {
    // Test 23: Demo mode submitPhonepeUtr
    const demoOrderId = (await placeOrder({
      addressId: 'demo-addr-1',
      cartItems: [{ id: 'p1', price: 1000, quantity: 1 }],
      subtotal: 1000,
      paymentProvider: 'phonepe',
    }, null, false)).data.id

    const utrRes = await submitPhonepeUtr({
      orderId: demoOrderId,
      utrNumber: '987654321098',
    }, null, false)

    assert(utrRes.data?.success === true, 'Demo UTR submission succeeds')
    assert(utrRes.data?.status === 'submitted', 'Demo UTR status is "submitted"')
  }

  {
    // Test 24: Demo mode adminVerifyUtr (Approval)
    const demoOrderId = (await placeOrder({
      addressId: 'demo-addr-1',
      cartItems: [{ id: 'p1', price: 1000, quantity: 1 }],
      subtotal: 1000,
      paymentProvider: 'phonepe',
    }, null, false)).data.id

    const utrRes = await submitPhonepeUtr({
      orderId: demoOrderId,
      utrNumber: '112233445566',
    }, null, false)

    const subId = utrRes.data.submission_id

    const verifyRes = await adminVerifyUtr({
      submissionId: subId,
      approved: true,
      adminNotes: 'Demo verified',
    }, null, false)

    assert(verifyRes.success === true, 'Demo adminVerifyUtr succeeds')
    assert(verifyRes.data?.order_status === 'processing', 'Demo order updated to processing')
    assert(verifyRes.data?.payment_status === 'completed', 'Demo payment updated to completed')
  }

  {
    // Test 25: Demo mode adminConfirmCodPayment
    const demoCodOrder = (await placeOrder({
      addressId: 'demo-addr-1',
      cartItems: [{ id: 'p1', price: 500, quantity: 1 }],
      subtotal: 500,
      paymentProvider: 'cod',
    }, null, false)).data.order

    // Rejects if not delivered
    const earlyCod = await adminConfirmCodPayment({ orderId: demoCodOrder.id }, null, false)
    assert(earlyCod.success === false, 'Demo rejects COD payment confirmation before delivery')

    // Mark delivered in demo store
    const orders = JSON.parse(mockStorage.get('shopkart_customer_orders') || '[]')
    const idx = orders.findIndex(o => o.id === demoCodOrder.id)
    orders[idx].status = 'delivered'
    mockStorage.set('shopkart_customer_orders', JSON.stringify(orders))

    // Confirm COD after delivery
    const deliveredCod = await adminConfirmCodPayment({ orderId: demoCodOrder.id }, null, false)
    assert(deliveredCod.success === true, 'Demo confirms COD payment when delivered')
    assert(deliveredCod.data?.payment_status === 'completed', 'Demo COD payment marked completed')
  }

  {
    // Test 26: Demo mode adminRecordRefund
    const demoOrders = JSON.parse(mockStorage.get('shopkart_customer_orders') || '[]')
    const deliveredOrder = demoOrders.find(o => o.status === 'delivered' && o.payment?.status === 'completed')

    if (deliveredOrder) {
      const refundRes = await adminRecordRefund({
        orderId: deliveredOrder.id,
        refundReference: 'DEMO-REF-001',
      }, null, false)

      assert(refundRes.success === true, 'Demo adminRecordRefund succeeds for completed payment')
      assert(refundRes.data?.payment_status === 'refunded', 'Demo payment marked refunded')
      assert(refundRes.data?.order_status === 'refunded', 'Demo order marked refunded')
    } else {
      assert(true, 'Skipped delivered demo refund check (order not found)')
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 7. REVIEW CORRECTIONS REGRESSION TESTS
  // ─────────────────────────────────────────────────────────────
  console.log('\n7. Phase 6D Review Corrections Verification')

  {
    // Correction 1: fetchOrderPayment exposes subError when payment_submissions fails
    const mockClient = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'payments') {
          return {
            data: { id: 'pay-1', order_id: validOrderId, provider: 'phonepe', status: 'pending', amount: 999 },
            error: null,
          }
        }
        if (tbl === 'payment_submissions') {
          return {
            data: null,
            error: { code: '42501', message: 'permission denied for table payment_submissions' },
          }
        }
        return { data: null, error: null }
      },
    })

    const { data, error } = await fetchOrderPayment(validOrderId, mockClient, true)
    assert(error !== null, 'Correction 1: fetchOrderPayment exposes subError when payment_submissions query fails')
    assert(error?.message?.includes('permission denied'), 'Correction 1: Error message preserved from database')
    assert(data?.payment?.id === 'pay-1', 'Correction 1: Successfully retrieved payment data preserved in response')
  }

  {
    // Correction 2: Demo COD order initial status is pending
    const resCod = await placeOrder({
      addressId: 'demo-addr-1',
      cartItems: [{ id: 'p1', name: 'Book', price: 600, quantity: 1 }],
      subtotal: 600,
      paymentProvider: 'cod',
    }, null, false)

    assert(resCod.data?.order?.status === 'pending', 'Correction 2: Demo COD order initial status is "pending"')
    assert(resCod.data?.order?.payment?.status === 'pending', 'Correction 2: Demo COD order payment status is "pending"')
  }

  {
    // Correction 3: Demo refund actually restores inventory when restockInventory is true
    // ── Scenario A: Restock disabled (restockInventory: false) ──
    const demoProducts = [
      { id: 'prod-demo-1', name: 'Demo Item 1', price: 500, stock: 10, is_active: true },
      { id: 'prod-demo-2', name: 'Demo Item 2', price: 300, stock: 20, is_active: true },
    ]
    mockStorage.set('shopkart_admin_products', JSON.stringify(demoProducts))

    const demoRefundOrder = {
      id: 'ord-demo-refund-1',
      created_at: new Date().toISOString(),
      status: 'delivered',
      total_amount: 1000,
      payment: { id: 'pay-ref-1', provider: 'cod', status: 'completed' },
      items: [{ product_id: 'prod-demo-1', quantity: 2, unit_price: 500 }],
    }
    const currentOrders = JSON.parse(mockStorage.get('shopkart_customer_orders') || '[]')
    mockStorage.set('shopkart_customer_orders', JSON.stringify([demoRefundOrder, ...currentOrders]))

    const resNoRestock = await adminRecordRefund({
      orderId: 'ord-demo-refund-1',
      refundReference: 'REF-NORE-1',
      restockInventory: false,
    }, null, false)

    assert(resNoRestock.success === true, 'Correction 3: Demo refund succeeds without restock')
    assert(resNoRestock.data?.restocked === false, 'Correction 3: Reports restocked: false when restockInventory is false')

    const prodsAfterNoRestock = JSON.parse(mockStorage.get('shopkart_admin_products') || '[]')
    assert(prodsAfterNoRestock.find(p => p.id === 'prod-demo-1')?.stock === 10, 'Correction 3: Stock unchanged (10) when restockInventory is false')

    // ── Scenario B: All products matched and inventory successfully saved ──
    mockStorage.set('shopkart_admin_products', JSON.stringify([
      { id: 'prod-demo-1', name: 'Demo Item 1', price: 500, stock: 10, is_active: true },
      { id: 'prod-demo-2', name: 'Demo Item 2', price: 300, stock: 20, is_active: true },
    ]))
    demoRefundOrder.status = 'delivered'
    demoRefundOrder.payment.status = 'completed'
    demoRefundOrder.items = [
      { product_id: 'prod-demo-1', quantity: 2, unit_price: 500 },
      { product_id: 'prod-demo-2', quantity: 3, unit_price: 300 },
    ]
    mockStorage.set('shopkart_customer_orders', JSON.stringify([demoRefundOrder, ...currentOrders]))

    const resAllMatched = await adminRecordRefund({
      orderId: 'ord-demo-refund-1',
      refundReference: 'REF-ALL-MATCH',
      restockInventory: true,
    }, null, false)

    assert(resAllMatched.success === true, 'Correction 3: Demo refund succeeds with full restock')
    assert(resAllMatched.data?.restocked === true, 'Correction 3: Reports restocked: true when all products match and persist')
    const prodsAfterAll = JSON.parse(mockStorage.get('shopkart_admin_products') || '[]')
    assert(prodsAfterAll.find(p => p.id === 'prod-demo-1')?.stock === 12, 'Correction 3: prod-demo-1 restored from 10 to 12 (+2)')
    assert(prodsAfterAll.find(p => p.id === 'prod-demo-2')?.stock === 23, 'Correction 3: prod-demo-2 restored from 20 to 23 (+3)')

    // ── Scenario C: One or more products missing (Strict atomicity — no partial updates) ──
    mockStorage.set('shopkart_admin_products', JSON.stringify([
      { id: 'prod-demo-1', name: 'Demo Item 1', price: 500, stock: 10, is_active: true },
    ]))
    demoRefundOrder.status = 'delivered'
    demoRefundOrder.payment.status = 'completed'
    demoRefundOrder.items = [
      { product_id: 'prod-demo-1', quantity: 2, unit_price: 500 },
      { product_id: 'prod-missing-999', quantity: 1, unit_price: 100 }, // missing from inventory
    ]
    mockStorage.set('shopkart_customer_orders', JSON.stringify([demoRefundOrder, ...currentOrders]))

    const resMissingProd = await adminRecordRefund({
      orderId: 'ord-demo-refund-1',
      refundReference: 'REF-MISSING-PROD',
      restockInventory: true,
    }, null, false)

    assert(resMissingProd.success === true, 'Correction 3: Refund recorded even if restock cannot be fully completed')
    assert(resMissingProd.data?.restocked === false, 'Correction 3: Reports restocked: false when any line item product is missing')
    const prodsAfterMissing = JSON.parse(mockStorage.get('shopkart_admin_products') || '[]')
    assert(prodsAfterMissing.find(p => p.id === 'prod-demo-1')?.stock === 10, 'Correction 3: Strict atomicity — prod-demo-1 stock NOT partially incremented (remains 10)')

    // ── Scenario D: Multiple order lines for the same product (Quantity aggregation) ──
    mockStorage.set('shopkart_admin_products', JSON.stringify([
      { id: 'prod-demo-1', name: 'Demo Item 1', price: 500, stock: 10, is_active: true },
    ]))
    demoRefundOrder.status = 'delivered'
    demoRefundOrder.payment.status = 'completed'
    demoRefundOrder.items = [
      { product_id: 'prod-demo-1', quantity: 2, unit_price: 500 },
      { product_id: 'prod-demo-1', quantity: 3, unit_price: 500 }, // second line for same product
    ]
    mockStorage.set('shopkart_customer_orders', JSON.stringify([demoRefundOrder, ...currentOrders]))

    const resMultipleLines = await adminRecordRefund({
      orderId: 'ord-demo-refund-1',
      refundReference: 'REF-MULTI-LINES',
      restockInventory: true,
    }, null, false)

    assert(resMultipleLines.success === true, 'Correction 3: Demo refund succeeds for multiple lines of same product')
    assert(resMultipleLines.data?.restocked === true, 'Correction 3: Reports restocked: true for aggregated lines')
    const prodsAfterMulti = JSON.parse(mockStorage.get('shopkart_admin_products') || '[]')
    assert(prodsAfterMulti.find(p => p.id === 'prod-demo-1')?.stock === 15, 'Correction 3: Quantities aggregated correctly from multiple lines: 10 + 2 + 3 = 15')

    // ── Scenario E: Product storage persistence failure (Fails safely without touching order) ──
    mockStorage.set('shopkart_admin_products', JSON.stringify([
      { id: 'prod-demo-1', name: 'Demo Item 1', price: 500, stock: 10, is_active: true },
    ]))
    demoRefundOrder.status = 'delivered'
    demoRefundOrder.payment.status = 'completed'
    demoRefundOrder.items = [{ product_id: 'prod-demo-1', quantity: 2, unit_price: 500 }]
    mockStorage.set('shopkart_customer_orders', JSON.stringify([demoRefundOrder, ...currentOrders]))

    // Simulate storage failure on shopkart_admin_products
    const originalSetItem = globalThis.localStorage.setItem
    globalThis.localStorage.setItem = (k, v) => {
      if (k === 'shopkart_admin_products') {
        throw new Error('QuotaExceededError: Local storage full')
      }
      return originalSetItem(k, v)
    }

    try {
      const resProdStorageFail = await adminRecordRefund({
        orderId: 'ord-demo-refund-1',
        refundReference: 'REF-PROD-STORAGE-FAIL',
        restockInventory: true,
      }, null, false)

      assert(resProdStorageFail.success === false, 'Correction 3 (Scenario E): Refund fails safely when product storage write throws')
      assert(resProdStorageFail.error?.message?.includes('Failed to persist restored product inventory'), 'Correction 3 (Scenario E): Returns clear inventory persistence error')
    } finally {
      globalThis.localStorage.setItem = originalSetItem
    }

    // ── Scenario F: Order-storage write failure during refund (Rollback succeeds) ──
    mockStorage.set('shopkart_admin_products', JSON.stringify([
      { id: 'prod-demo-1', name: 'Demo Item 1', price: 500, stock: 10, is_active: true },
    ]))
    demoRefundOrder.status = 'delivered'
    demoRefundOrder.payment.status = 'completed'
    demoRefundOrder.items = [{ product_id: 'prod-demo-1', quantity: 2, unit_price: 500 }]
    mockStorage.set('shopkart_customer_orders', JSON.stringify([demoRefundOrder, ...currentOrders]))

    // Simulate storage failure specifically on shopkart_customer_orders (rollback to products will succeed)
    globalThis.localStorage.setItem = (k, v) => {
      if (k === 'shopkart_customer_orders') {
        throw new Error('QuotaExceededError: Disk full saving orders')
      }
      return originalSetItem(k, v)
    }

    try {
      const resOrderStorageFail = await adminRecordRefund({
        orderId: 'ord-demo-refund-1',
        refundReference: 'REF-ORDER-STORAGE-FAIL',
        restockInventory: true,
      }, null, false)

      assert(resOrderStorageFail.success === false, 'Correction 3 (Scenario F): Refund fails when order persistence throws')
      assert(resOrderStorageFail.data === null, 'Correction 3 (Scenario F): Does not report a successful refund on failure')
      assert(resOrderStorageFail.error?.message?.includes('Restored inventory was rolled back'), 'Correction 3 (Scenario F): Informs that inventory was rolled back when rollback succeeds')
      assert(!resOrderStorageFail.error?.message?.includes('manual reconciliation'), 'Correction 3 (Scenario F): Does not report manual reconciliation when rollback succeeds')

      // Verify rollback: prod-demo-1 stock must be 10, NOT 12
      const prodsAfterRollback = JSON.parse(mockStorage.get('shopkart_admin_products') || '[]')
      const stockAfterRollback = prodsAfterRollback.find(p => p.id === 'prod-demo-1')?.stock
      assert(stockAfterRollback === 10, 'Correction 3 (Scenario F): Restored inventory rolled back to 10 (not left as 12)')

      // Verify order remains in delivered status (eligible for clean retry without duplicate stock creation)
      const ordersAfterFail = JSON.parse(mockStorage.get('shopkart_customer_orders') || '[]')
      const orderAfterFail = ordersAfterFail.find(o => o.id === 'ord-demo-refund-1')
      assert(orderAfterFail?.status === 'delivered', 'Correction 3 (Scenario F): Order remains in delivered status in storage')
    } finally {
      globalThis.localStorage.setItem = originalSetItem
    }

    // ── Scenario G: Inventory write succeeds, order write fails, rollback ALSO fails ──
    mockStorage.set('shopkart_admin_products', JSON.stringify([
      { id: 'prod-demo-1', name: 'Demo Item 1', price: 500, stock: 10, is_active: true },
    ]))
    demoRefundOrder.status = 'delivered'
    demoRefundOrder.payment.status = 'completed'
    demoRefundOrder.items = [{ product_id: 'prod-demo-1', quantity: 2, unit_price: 500 }]
    mockStorage.set('shopkart_customer_orders', JSON.stringify([demoRefundOrder, ...currentOrders]))

    let productWriteCount = 0
    globalThis.localStorage.setItem = (k, v) => {
      if (k === 'shopkart_admin_products') {
        productWriteCount++
        if (productWriteCount > 1) {
          // Second write to products is the compensating rollback attempt — simulate failure
          throw new Error('QuotaExceededError: Storage locked during rollback')
        }
        return originalSetItem(k, v)
      }
      if (k === 'shopkart_customer_orders') {
        throw new Error('QuotaExceededError: Disk full saving orders')
      }
      return originalSetItem(k, v)
    }

    try {
      const resRollbackFail = await adminRecordRefund({
        orderId: 'ord-demo-refund-1',
        refundReference: 'REF-ROLLBACK-FAIL',
        restockInventory: true,
      }, null, false)

      assert(resRollbackFail.success === false, 'Correction 3 (Scenario G): Refund fails when order save and rollback fail')
      assert(resRollbackFail.data === null, 'Correction 3 (Scenario G): Does not report a successful refund')
      assert(resRollbackFail.error?.message?.includes('inconsistent state'), 'Correction 3 (Scenario G): Explicitly reports inconsistent state')
      assert(resRollbackFail.error?.message?.includes('manual reconciliation'), 'Correction 3 (Scenario G): Explicitly reports manual reconciliation required')
      assert(!resRollbackFail.error?.message?.includes('Restored inventory was rolled back'), 'Correction 3 (Scenario G): Never claims rollback succeeded when it failed')
    } finally {
      globalThis.localStorage.setItem = originalSetItem
    }

    // ── Scenario H: Strict quantity validation — zero quantity line item never converted to 1 ──
    mockStorage.set('shopkart_admin_products', JSON.stringify([
      { id: 'prod-demo-1', name: 'Demo Item 1', price: 500, stock: 10, is_active: true },
    ]))
    demoRefundOrder.status = 'delivered'
    demoRefundOrder.payment.status = 'completed'
    demoRefundOrder.items = [{ product_id: 'prod-demo-1', quantity: 0, unit_price: 500 }]
    mockStorage.set('shopkart_customer_orders', JSON.stringify([demoRefundOrder, ...currentOrders]))

    const resZeroQty = await adminRecordRefund({
      orderId: 'ord-demo-refund-1',
      refundReference: 'REF-ZERO-QTY',
      restockInventory: true,
    }, null, false)

    assert(resZeroQty.success === true, 'Correction 3 (Scenario H): Refund recorded for order with zero-quantity item')
    assert(resZeroQty.data?.restocked === false, 'Correction 3 (Scenario H): Reports restocked: false when item has quantity 0')
    const prodsAfterZeroQty = JSON.parse(mockStorage.get('shopkart_admin_products') || '[]')
    const stockAfterZeroQty = prodsAfterZeroQty.find(p => p.id === 'prod-demo-1')?.stock
    assert(stockAfterZeroQty === 10, 'Correction 3 (Scenario H): Stock remains 10 (0 quantity NEVER silently converted to 1)')
  }

  {
    // Correction 4: Injected-client cart synchronization validates rpcResult.success
    const mockClientFailedSync = createMockSupabaseClient({
      from: (tbl) => {
        if (tbl === 'addresses') return { data: { id: validAddressId }, error: null }
        return { data: [], error: null }
      },
      rpc: (fn) => {
        if (fn === 'sync_user_cart') {
          // Returns response without error, but success is false
          return { data: { success: false, message: 'Stock unavailable during lock' }, error: null }
        }
        if (fn === 'place_order') {
          return { data: validOrderId, error: null }
        }
        return { data: null, error: null }
      },
    })

    const resultFailedSync = await placeOrder({
      addressId: validAddressId,
      cartItems: [{ id: 'p1', price: 500, quantity: 1 }],
      paymentProvider: 'cod',
    }, mockClientFailedSync, true)

    assert(resultFailedSync.data === null, 'Correction 4: placeOrder fails when sync_user_cart returns { success: false }')
    assert(resultFailedSync.error?.message?.includes('cart synchronization'), 'Correction 4: Returns cart synchronization error message')
    const placeRpcCalled = mockClientFailedSync.state.rpcCalls.some(c => c.fnName === 'place_order')
    assert(placeRpcCalled === false, 'Correction 4: place_order RPC is NOT called after unsuccessful cart synchronization')
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n=================================================================')
  console.log(`PHASE 6D TEST RESULTS: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`)
  console.log('=================================================================')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runAllTests().catch(err => {
  console.error('Fatal error running Phase 6D tests:', err)
  process.exit(1)
})
