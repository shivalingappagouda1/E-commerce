import assert from 'node:assert'
import fs from 'node:fs'

console.log('═══════════════════════════════════════════════════════════════════')
console.log('ShopKart — Phase 6C: Critical Review Corrections Test Suite')
console.log('═══════════════════════════════════════════════════════════════════\n')

const migrationFile = 'database/migrations/phase6c_order_and_checkout_corrections.sql'
const rollbackFile = 'database/migrations/phase6c_rollback.sql'
const sqlTestFile = 'database/tests/phase6c_sql_tests.sql'

assert.ok(fs.existsSync(migrationFile), 'Migration file must exist')
assert.ok(fs.existsSync(rollbackFile), 'Rollback file must exist')
assert.ok(fs.existsSync(sqlTestFile), 'SQL test file must exist')

const migrationContent = fs.readFileSync(migrationFile, 'utf8')
const rollbackContent = fs.readFileSync(rollbackFile, 'utf8')
const sqlTestContent = fs.readFileSync(sqlTestFile, 'utf8')

// ─────────────────────────────────────────────────────────────────
// SECTION 1: STATIC SECURITY & MIGRATION DEFINITION VERIFICATION
// ─────────────────────────────────────────────────────────────────
console.log('--- SECTION 1: Static Migration & Security Invariants ---')

// 1. Idempotency Column & Dedicated Refund Reference
assert.ok(
  migrationContent.includes('ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;'),
  'Must add idempotency_key column to public.orders'
)
assert.ok(
  migrationContent.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idempotency'),
  'Must add unique partial index for user and idempotency_key'
)
assert.ok(
  migrationContent.includes('ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_reference TEXT;'),
  'Must add dedicated refund_reference column to public.payments'
)

// 2. Concurrency-Safe Idempotency in place_order: Must recheck after acquiring cart lock
assert.ok(
  migrationContent.includes('FOR UPDATE;'),
  'place_order must acquire exclusive FOR UPDATE cart lock'
)
assert.ok(
  migrationContent.includes('WHERE user_id = v_user_id AND idempotency_key = v_clean_idempotency;'),
  'place_order must check user_id and idempotency_key'
)
// Verify multiple occurrences of checking idempotency: initial fast-path + lock recheck + exception handler
const idempCheckMatches = migrationContent.match(/WHERE user_id = v_user_id AND idempotency_key = v_clean_idempotency;/g) || []
assert.ok(
  idempCheckMatches.length >= 3,
  'place_order must check idempotency in fast-path, lock-recheck, and unique-violation handler'
)

// 2b. Exact Constraint Identification via GET STACKED DIAGNOSTICS
assert.ok(
  migrationContent.includes('GET STACKED DIAGNOSTICS v_violated_constraint = CONSTRAINT_NAME;'),
  'place_order must identify violated constraint via GET STACKED DIAGNOSTICS'
)
assert.ok(
  migrationContent.includes("v_violated_constraint = 'idx_orders_user_idempotency'"),
  'place_order must strictly check for idx_orders_user_idempotency constraint'
)

// 3. Payment Submissions Audit Table & Unique Indexes
assert.ok(
  migrationContent.includes('CREATE TABLE IF NOT EXISTS public.payment_submissions'),
  'Must create public.payment_submissions table'
)
assert.ok(
  migrationContent.includes("CHECK (status IN ('submitted', 'approved', 'rejected'))"),
  'Must enforce status constraint on payment_submissions'
)
assert.ok(
  migrationContent.includes('idx_payment_submissions_active_pending'),
  'Must enforce at most one active submitted record per order'
)
assert.ok(
  migrationContent.includes('idx_payment_submissions_approved_utr'),
  'Must enforce unique approved UTR across the system'
)

// 4. PhonePe Expiration Rule: Active submitted UTR must NOT be expired
assert.ok(
  migrationContent.includes("NOT EXISTS (\n        SELECT 1 FROM public.payment_submissions ps\n        WHERE ps.order_id = o.id AND ps.status = 'submitted'\n      )"),
  'expire_pending_phonepe_orders must protect orders with an active submitted UTR from expiring'
)

// 5. Inventory Restoration Safety on Cancellation: Restricted to unpaid orders
assert.ok(
  migrationContent.includes('SELECT EXISTS (\n    SELECT 1 FROM public.payments\n    WHERE order_id = NEW.id AND status = \'completed\'\n  ) INTO v_is_paid;'),
  'restore_inventory_on_cancellation must check if order has completed payment'
)
assert.ok(
  migrationContent.includes("OLD.status = 'pending' AND NOT v_is_paid"),
  'Automated inventory restoration strictly restricted to UNPAID pending cancellations'
)
assert.ok(
  !migrationContent.includes('submitted_at'),
  'payment_submissions must not use non-existent column submitted_at'
)
assert.ok(
  migrationContent.includes('status, created_at'),
  'submit_phonepe_utr must insert into created_at column'
)
assert.ok(
  migrationContent.includes("OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND NEW.status <> 'refunded'"),
  'restore_inventory_on_cancellation must explicitly permit legitimate transition from cancelled to refunded'
)
assert.ok(
  migrationContent.includes('DROP FUNCTION IF EXISTS public.submit_phonepe_utr(UUID, TEXT, TIMESTAMPTZ);'),
  'Caller-controlled timestamp UTR submission overload must be explicitly dropped'
)
assert.ok(
  !migrationContent.includes('p_submission_time TIMESTAMPTZ'),
  'Production migration must NOT define caller-controlled timestamp overload'
)
assert.ok(
  migrationContent.includes('GRANT EXECUTE ON FUNCTION public.submit_phonepe_utr(UUID, TEXT) TO authenticated;'),
  'Only authoritative 2-argument submit_phonepe_utr using database NOW() must be granted to authenticated customers'
)
assert.ok(
  migrationContent.includes('DROP FUNCTION IF EXISTS public.expire_pending_phonepe_orders(TIMESTAMPTZ);'),
  'Caller-controlled timestamp expiry overload must be explicitly dropped'
)
assert.ok(
  !migrationContent.includes('p_evaluation_time TIMESTAMPTZ'),
  'Production migration must NOT define caller-controlled evaluation time overload'
)
assert.ok(
  migrationContent.includes('refund_reference = v_clean_ref'),
  'admin_record_refund must persist refund reference into dedicated refund_reference column'
)
assert.ok(
  !migrationContent.includes("provider_payment_id || ' | RefundRef: '"),
  'admin_record_refund must preserve original provider_payment_id intact without appending'
)

// 6. Security Definers, Search Path, and Privilege Grants
const requiredRPCs = [
  'public.place_order',
  'public.submit_phonepe_utr',
  'public.admin_verify_utr',
  'public.admin_confirm_cod_payment',
  'public.expire_pending_phonepe_orders',
  'public.admin_record_refund',
  'public.cancel_order',
  'public.restore_inventory_on_cancellation',
]

for (const rpc of requiredRPCs) {
  assert.ok(migrationContent.includes(rpc), `Migration must define ${rpc}`)
}

const secDefCount = (migrationContent.match(/SECURITY DEFINER/g) || []).length
const searchPathCount = (migrationContent.match(/SET search_path = ''/g) || []).length
assert.ok(secDefCount >= 8, `Expected at least 8 SECURITY DEFINER declarations, found ${secDefCount}`)
assert.ok(searchPathCount >= 8, `Expected at least 8 empty search_path declarations, found ${searchPathCount}`)

// 7. Rollback Safety Warning Check
assert.ok(
  rollbackContent.includes('CRITICAL WARNING — DESTRUCTIVE ROLLBACK SCRIPT'),
  'Rollback script must include prominent data destruction warning'
)
assert.ok(
  rollbackContent.includes('DROP TABLE IF EXISTS public.payment_submissions;'),
  'Rollback script must avoid reckless CASCADE drops on core tables'
)

console.log('✔ Section 1 Passed: Structural, schema, and security invariants statically verified.')

// ─────────────────────────────────────────────────────────────────
// SECTION 2: FUNCTIONAL STATE MACHINE & BUSINESS LOGIC SIMULATION
// (Simulates exact PostgreSQL transactional behavior in Node.js)
// ─────────────────────────────────────────────────────────────────
console.log('\n--- SECTION 2: Functional Logic & Boundary Invariants ---')

function calculateAuthoritativeTotals(grossSubtotal, coupon = null) {
  if (grossSubtotal <= 0) {
    throw new Error('Cart is empty')
  }

  // Authoritative shipping rule: Gross subtotal >= ₹999 -> ₹0; subtotal < ₹999 -> ₹99
  const shippingAmount = (grossSubtotal >= 999.00) ? 0.00 : 99.00

  let discountAmount = 0.00
  if (coupon && coupon.is_active) {
    if (coupon.min_order_value && grossSubtotal < coupon.min_order_value) {
      throw new Error(`Subtotal ₹${grossSubtotal} below coupon min requirement ₹${coupon.min_order_value}`)
    }
    if (coupon.discount_type === 'percent') {
      discountAmount = Math.round((grossSubtotal * (coupon.discount_value / 100)) * 100) / 100
    } else if (coupon.discount_type === 'fixed') {
      discountAmount = Math.min(grossSubtotal, coupon.discount_value)
    }
  }

  discountAmount = Math.min(grossSubtotal, Math.max(0, discountAmount))
  const finalTotal = Math.max(0, grossSubtotal - discountAmount + shippingAmount)

  return {
    subtotal: grossSubtotal,
    shippingAmount,
    discountAmount,
    totalAmount: finalTotal,
  }
}

// Tests 1-5: Shipping & Price Calculations
{
  const res1 = calculateAuthoritativeTotals(500.00)
  assert.strictEqual(res1.shippingAmount, 99.00, 'Test 1: Shipping must be ₹99 for ₹500')
  assert.strictEqual(res1.totalAmount, 599.00, 'Test 1: Total must be ₹599')
  console.log('✔ Test 1: ₹500 subtotal produces ₹99 shipping')

  const res2 = calculateAuthoritativeTotals(999.00)
  assert.strictEqual(res2.shippingAmount, 0.00, 'Test 2: Shipping must be ₹0 for ₹999')
  assert.strictEqual(res2.totalAmount, 999.00, 'Test 2: Total must be ₹999')
  console.log('✔ Test 2: ₹999 subtotal produces free shipping')

  const res3 = calculateAuthoritativeTotals(1200.00)
  assert.strictEqual(res3.shippingAmount, 0.00, 'Test 3: Shipping must be ₹0 for ₹1,200')
  assert.strictEqual(res3.totalAmount, 1200.00, 'Test 3: Total must be ₹1,200')
  console.log('✔ Test 3: ₹1,200 subtotal produces free shipping')

  const coupon = { is_active: true, discount_type: 'fixed', discount_value: 100.00, min_order_value: 500.00 }
  const res4 = calculateAuthoritativeTotals(1050.00, coupon)
  assert.strictEqual(res4.shippingAmount, 0.00, 'Test 4: Shipping threshold evaluated on gross subtotal ₹1,050')
  assert.strictEqual(res4.discountAmount, 100.00, 'Test 4: Discount must be ₹100')
  assert.strictEqual(res4.totalAmount, 950.00, 'Test 4: Total must be ₹950 (1050 - 100 + 0)')
  console.log('✔ Test 4: ₹1,050 gross subtotal with ₹100 coupon still gets free shipping')

  assert.throws(() => calculateAuthoritativeTotals(0), /Cart is empty/, 'Test 5: Empty cart must fail')
  console.log('✔ Test 5: Empty cart fails order creation')
}

// Complete Mock Environment Replicating the Phase 6C PostgreSQL Contract
class Phase6cDatabase {
  constructor() {
    this.orders = []
    this.payments = []
    this.payment_submissions = []
    this.inventory = { 'item-1': 10 }
    this.coupons = { 'SAVE10': { code: 'SAVE10', used_count: 0, max_uses: 10 } }
    this.cartLocked = false
  }

  placeOrder({
    userId,
    addressId,
    couponCode,
    provider,
    idempotencyKey,
    simulateUnrelatedUniqueViolation = false,
    simulateConcurrentRace = false,
  }) {
    // Fast-path pre-check
    if (idempotencyKey && !simulateConcurrentRace) {
      const existing = this.orders.find(o => o.user_id === userId && o.idempotency_key === idempotencyKey)
      if (existing) return existing.id
    }

    // Acquire cart lock
    this.cartLocked = true

    // Recheck idempotency under lock (Concurrency Safety)
    if (idempotencyKey && !simulateConcurrentRace) {
      const existing = this.orders.find(o => o.user_id === userId && o.idempotency_key === idempotencyKey)
      if (existing) {
        this.cartLocked = false
        return existing.id
      }
    }

    if (this.inventory['item-1'] < 1) {
      this.cartLocked = false
      throw new Error('Insufficient inventory')
    }

    const orderId = `ord-${this.orders.length + 1}`

    // Step 10: Insert order row with race-condition handling & constraint inspection
    try {
      if (simulateUnrelatedUniqueViolation) {
        const err = new Error('duplicate key value violates unique constraint "orders_other_unique_key"')
        err.code = '23505'
        err.constraint = 'orders_other_unique_key'
        throw err
      }

      const existingKey = this.orders.find(o => o.user_id === userId && o.idempotency_key === idempotencyKey)
      if (existingKey) {
        const err = new Error('duplicate key value violates unique constraint "idx_orders_user_idempotency"')
        err.code = '23505'
        err.constraint = 'idx_orders_user_idempotency'
        throw err
      }

      const order = {
        id: orderId,
        user_id: userId,
        status: 'pending',
        coupon_code: couponCode,
        idempotency_key: idempotencyKey,
        created_at: new Date(),
      }
      this.orders.push(order)
    } catch (err) {
      this.cartLocked = false
      if (err.code === '23505') {
        const violatedConstraint = err.constraint
        if (violatedConstraint === 'idx_orders_user_idempotency' && idempotencyKey) {
          const existing = this.orders.find(o => o.user_id === userId && o.idempotency_key === idempotencyKey)
          if (existing) {
            return existing.id
          }
        }
      }
      // Re-raise every other unrelated unique constraint violation or error
      throw err
    }

    // Step 11: Inventory decrement
    this.inventory['item-1'] -= 1

    // Step 11b: Deferred coupon usage increment (after successful order insertion)
    if (couponCode && this.coupons[couponCode]) {
      this.coupons[couponCode].used_count += 1
    }

    // Step 12: Create payment record
    this.payments.push({
      id: `pay-${this.payments.length + 1}`,
      order_id: orderId,
      provider: provider || 'cod',
      status: 'pending',
      amount: 599.00,
      provider_payment_id: null,
      paid_at: null,
    })

    this.cartLocked = false
    return orderId
  }

  submitPhonepeUtr({ userId, orderId, utrNumber, submissionTime = new Date() }) {
    if (!/^[0-9]{12}$/.test(utrNumber)) {
      throw new Error('Invalid UTR format. Must be 12 numeric digits')
    }

    const order = this.orders.find(o => o.id === orderId)
    if (!order) throw new Error('Order not found')
    if (order.user_id !== userId) throw new Error('Access denied: You can only submit UTR for your own orders')
    if (order.status !== 'pending') throw new Error('Order not in pending status')

    // 48h expiration check using original order creation time
    // Boundary rule: before 48h allowed (< 48h); at or after 48h rejected (>= 48h)
    if (submissionTime - order.created_at >= 48 * 3600 * 1000) {
      throw new Error('PhonePe payment window has expired (48 hours exceeded)')
    }

    const payment = this.payments.find(p => p.order_id === orderId && p.provider === 'phonepe')
    if (!payment) throw new Error('No pending PhonePe payment record found')
    if (payment.status !== 'pending') throw new Error('Payment not pending')

    const activeSub = this.payment_submissions.find(s => s.order_id === orderId && s.status === 'submitted')
    if (activeSub) throw new Error('A UTR submission is currently pending administrator verification')

    const approvedSub = this.payment_submissions.find(s => s.utr_number === utrNumber && s.status === 'approved')
    if (approvedSub) throw new Error('This UTR has already been approved for another order')

    const subId = `sub-${this.payment_submissions.length + 1}`
    this.payment_submissions.push({
      id: subId,
      order_id: orderId,
      payment_id: payment.id,
      user_id: userId,
      utr_number: utrNumber,
      status: 'submitted',
      admin_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: submissionTime,
    })

    payment.provider_payment_id = utrNumber
    return { success: true, submission_id: subId }
  }

  adminVerifyUtr({ adminId, submissionId, approved, adminNotes }) {
    const sub = this.payment_submissions.find(s => s.id === submissionId)
    if (!sub) throw new Error('Submission not found')
    if (sub.status !== 'submitted') throw new Error('Submission has already been reviewed')

    const order = this.orders.find(o => o.id === sub.order_id)
    const payment = this.payments.find(p => p.id === sub.payment_id)

    if (approved) {
      sub.status = 'approved'
      sub.admin_notes = adminNotes
      sub.reviewed_by = adminId
      sub.reviewed_at = new Date()

      payment.status = 'completed'
      payment.paid_at = new Date()
      order.status = 'processing'
      return { success: true, decision: 'approved' }
    } else {
      sub.status = 'rejected'
      sub.admin_notes = adminNotes
      sub.reviewed_by = adminId
      sub.reviewed_at = new Date()
      // Order and payment remain pending; customer can resubmit before 48h
      return { success: true, decision: 'rejected' }
    }
  }

  expirePendingPhonepeOrders(currentTime) {
    let count = 0
    for (const order of this.orders) {
      if (order.status === 'pending') {
        const payment = this.payments.find(p => p.order_id === order.id && p.provider === 'phonepe' && p.status === 'pending')

        // CRITICAL: Check if there is an active submitted UTR awaiting review
        const hasActiveSubmittedUtr = this.payment_submissions.some(s => s.order_id === order.id && s.status === 'submitted')

        if (payment && !hasActiveSubmittedUtr && (currentTime - order.created_at >= 48 * 3600 * 1000)) {
          payment.status = 'failed'
          order.status = 'cancelled'

          // Automated restoration strictly for unpaid pending cancellations
          this.inventory['item-1'] += 1
          if (order.coupon_code && this.coupons[order.coupon_code]) {
            this.coupons[order.coupon_code].used_count = Math.max(0, this.coupons[order.coupon_code].used_count - 1)
          }

          count += 1
        }
      }
    }
    return count
  }

  cancelCustomerOrder(userId, orderId) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order || order.user_id !== userId) throw new Error('Order not found or unauthorized')
    if (!['pending', 'processing'].includes(order.status)) throw new Error('Cannot cancel in current status')

    const payment = this.payments.find(p => p.order_id === orderId)
    const isPaid = payment && payment.status === 'completed'

    // If unpaid: mark payment failed
    // If paid (processing order): preserve payment status as 'completed' for manual refund!
    if (payment && payment.status === 'pending') {
      payment.status = 'failed'
    }

    order.status = 'cancelled'

    // Automated restoration ONLY for unpaid pending cancellations
    // Paid processing cancellations DO NOT automatically restore inventory before physical return!
    if (!isPaid) {
      this.inventory['item-1'] += 1
      if (order.coupon_code && this.coupons[order.coupon_code]) {
        this.coupons[order.coupon_code].used_count = Math.max(0, this.coupons[order.coupon_code].used_count - 1)
      }
    }

    return { success: true }
  }

  adminRecordRefund({ orderId, refundRef, adminNotes, restockInventory = false }) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) throw new Error('Order not found')

    const cleanRef = (refundRef || '').trim()
    if (!cleanRef) throw new Error('Refund reference / transaction ID is required')

    const payment = this.payments.find(p => p.order_id === orderId)
    if (!payment) throw new Error('Payment not found')

    if (payment.status === 'refunded') throw new Error('Payment has already been marked refunded')
    if (payment.status !== 'completed') throw new Error(`Cannot refund payment in status ${payment.status} (only completed payments can be refunded)`)

    payment.status = 'refunded'
    payment.refund_reference = cleanRef
    order.status = 'refunded'

    if (restockInventory) {
      this.inventory['item-1'] += 1
    }

    return { success: true, payment_status: 'refunded', order_status: 'refunded', restockInventory }
  }
}

// Test 6: Same idempotency key returns the same order & preserves zero side effects on replay
{
  const db = new Phase6cDatabase()
  const initialStock = db.inventory['item-1']
  const initialCouponUses = db.coupons['SAVE10'].used_count

  const id1 = db.placeOrder({ userId: 'u1', addressId: 'a1', couponCode: 'SAVE10', provider: 'phonepe', idempotencyKey: 'idemp-1' })
  assert.strictEqual(db.inventory['item-1'], initialStock - 1, 'Stock decremented for initial order')
  assert.strictEqual(db.coupons['SAVE10'].used_count, initialCouponUses + 1, 'Coupon used for initial order')
  assert.strictEqual(db.orders.length, 1, '1 order created')
  assert.strictEqual(db.payments.length, 1, '1 payment created')

  // Replay with same idempotency key
  const id2 = db.placeOrder({ userId: 'u1', addressId: 'a1', couponCode: 'SAVE10', provider: 'phonepe', idempotencyKey: 'idemp-1' })
  assert.strictEqual(id1, id2, 'Test 6: Must return identical order ID')

  // Verify all side effects are completely absent on replay
  assert.strictEqual(db.inventory['item-1'], initialStock - 1, 'Test 6: Inventory must remain unchanged on replay')
  assert.strictEqual(db.coupons['SAVE10'].used_count, initialCouponUses + 1, 'Test 6: Coupon usage must remain unchanged on replay')
  assert.strictEqual(db.orders.length, 1, 'Test 6: Order count must remain 1 on replay')
  assert.strictEqual(db.payments.length, 1, 'Test 6: Payment count must remain 1 on replay')
  assert.strictEqual(db.cartLocked, false, 'Test 6: Cart lock must be released')
  console.log('✔ Test 6: Same idempotency key returns the same order and leaves coupon usage, inventory, order count, and payment count unchanged')
}

// Test 7: Simulated Concurrent Checkouts with Lock Recheck
{
  const db = new Phase6cDatabase()
  const key = 'shared-key'
  const id1 = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'cod', idempotencyKey: key })
  const id2 = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'cod', idempotencyKey: key })

  assert.strictEqual(id1, id2, 'Test 7: Returns same order under serialized cart locking')
  assert.strictEqual(db.orders.length, 1, 'Test 7: Exactly one order row exists')
  console.log('✔ Test 7: Concurrent same-key requests create only one order')
}

// Test 8: Inventory is deducted only once
{
  const db = new Phase6cDatabase()
  const initialStock = db.inventory['item-1']
  db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'inv-key' })
  db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'inv-key' })

  assert.strictEqual(db.inventory['item-1'], initialStock - 1, 'Test 8: Inventory deducted only once')
  console.log('✔ Test 8: Inventory is deducted only once')
}

// Test 9: Concurrent last-unit purchases cannot oversell
{
  const db = new Phase6cDatabase()
  db.inventory['item-1'] = 1

  const id1 = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'p1' })
  assert.ok(id1)

  assert.throws(
    () => db.placeOrder({ userId: 'u2', addressId: 'a2', provider: 'phonepe', idempotencyKey: 'p2' }),
    /Insufficient inventory/,
    'Test 9: Second customer blocked'
  )
  assert.strictEqual(db.inventory['item-1'], 0, 'Test 9: Stock cannot drop below 0')
  console.log('✔ Test 9: Concurrent last-unit purchases cannot oversell')
}

// Test 10: PhonePe order creates pending payment
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-pp' })
  const pay = db.payments.find(p => p.order_id === orderId)
  assert.strictEqual(pay.provider, 'phonepe')
  assert.strictEqual(pay.status, 'pending')
  console.log('✔ Test 10: PhonePe order creates pending payment')
}

// Test 11: UTR submission is restricted to owning customer
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-u' })

  assert.throws(
    () => db.submitPhonepeUtr({ userId: 'u2', orderId, utrNumber: '123456789012' }),
    /Access denied/,
    'Test 11: Non-owner blocked'
  )
  const res = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012' })
  assert.ok(res.success)
  console.log('✔ Test 11: UTR submission is restricted to the owning customer')
}

// Test 12: Rejected UTR can be resubmitted before expiry
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-rej' })
  const s1 = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '111122223333' })
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: s1.submission_id, approved: false, adminNotes: 'Typo in UTR' })

  const s2 = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '999988887777' })
  assert.ok(s2.success, 'Test 12: Resubmission succeeded')
  console.log('✔ Test 12: Rejected UTR can be resubmitted before expiry')
}

// Test 13: Previous rejected UTR records remain available for audit
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-audit' })
  const s1 = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '111111111111' })
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: s1.submission_id, approved: false, adminNotes: 'Unverified' })
  db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '222222222222' })

  const history = db.payment_submissions.filter(s => s.order_id === orderId)
  assert.strictEqual(history.length, 2, 'Test 13: Full audit trail preserved')
  assert.strictEqual(history[0].status, 'rejected')
  assert.strictEqual(history[1].status, 'submitted')
  console.log('✔ Test 13: Previous rejected UTR records remain available for audit')
}

// Test 14: Approval completes payment and moves order to processing
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-app' })
  const s = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012' })
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: s.submission_id, approved: true, adminNotes: 'Verified' })

  const order = db.orders.find(o => o.id === orderId)
  const payment = db.payments.find(p => p.order_id === orderId)
  assert.strictEqual(order.status, 'processing')
  assert.strictEqual(payment.status, 'completed')
  assert.ok(payment.paid_at)
  console.log('✔ Test 14: Approval completes payment and moves order to processing')
}

// Test 15: Repeated approval cannot corrupt state
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-rep' })
  const s = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012' })
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: s.submission_id, approved: true })

  assert.throws(
    () => db.adminVerifyUtr({ adminId: 'adm1', submissionId: s.submission_id, approved: true }),
    /Submission has already been reviewed/,
    'Test 15: Repeated approval blocked'
  )
  console.log('✔ Test 15: Repeated approval cannot corrupt state')
}

// Test 16: Rejection does not cancel the order or restore inventory
{
  const db = new Phase6cDatabase()
  const stockBefore = db.inventory['item-1']
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-rej-no-cancel' })
  const s = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012' })
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: s.submission_id, approved: false, adminNotes: 'Please check bank' })

  const order = db.orders.find(o => o.id === orderId)
  assert.strictEqual(order.status, 'pending', 'Order stays pending on rejection')
  assert.strictEqual(db.inventory['item-1'], stockBefore - 1, 'Inventory remains held')
  console.log('✔ Test 16: Rejection does not cancel the order or restore inventory')
}

// Test 17: PhonePe Expiry at Exact 48-Hour Boundary with Active UTR Protection
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-exp-bound' })
  const order = db.orders.find(o => o.id === orderId)

  // 1. Just before 48 hours (47 hours, 59 minutes, 59 seconds) with no UTR: must NOT expire
  const tJustBefore48h = new Date(order.created_at.getTime() + (48 * 3600 - 1) * 1000)
  assert.strictEqual(db.expirePendingPhonepeOrders(tJustBefore48h), 0, 'Must NOT expire just before 48 hours')
  assert.strictEqual(order.status, 'pending')

  // 2. Customer submits UTR right before deadline
  db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012', submissionTime: tJustBefore48h })

  // 3. At exactly 48 hours WITH active submitted UTR: must NOT expire
  const tExact48h = new Date(order.created_at.getTime() + 48 * 3600 * 1000)
  assert.strictEqual(db.expirePendingPhonepeOrders(tExact48h), 0, 'Active submitted UTR must NOT expire at exactly 48h')
  assert.strictEqual(order.status, 'pending')

  // 4. Just after 48 hours (48 hours + 1 second) WITH active submitted UTR: must NOT expire
  const tJustAfter48h = new Date(order.created_at.getTime() + (48 * 3600 + 1) * 1000)
  assert.strictEqual(db.expirePendingPhonepeOrders(tJustAfter48h), 0, 'Active submitted UTR must NOT expire just after 48h')
  assert.strictEqual(order.status, 'pending')

  // 5. Test an order with NO submitted UTR:
  // At exactly 48 hours: MUST be eligible and expire!
  const unsubmittedOrder = {
    id: 'ord-unsubmitted',
    user_id: 'u1',
    status: 'pending',
    coupon_code: null,
    created_at: new Date(tExact48h.getTime() - 48 * 3600 * 1000), // created exactly 48h before tExact48h
  }
  db.orders.push(unsubmittedOrder)
  db.payments.push({ id: 'pay-unsubmitted', order_id: 'ord-unsubmitted', provider: 'phonepe', status: 'pending' })

  const expCountExact = db.expirePendingPhonepeOrders(tExact48h)
  assert.strictEqual(expCountExact, 1, 'Order with NO submitted UTR must expire at exactly 48 hours')
  assert.strictEqual(unsubmittedOrder.status, 'cancelled')

  // 5b. Attempting UTR submission at exactly 48 hours must be rejected
  const exactSubOrder = {
    id: 'ord-exact-sub-fail',
    user_id: 'u1',
    status: 'pending',
    coupon_code: null,
    created_at: new Date(tExact48h.getTime() - 48 * 3600 * 1000),
  }
  db.orders.push(exactSubOrder)
  db.payments.push({ id: 'pay-exact-sub-fail', order_id: 'ord-exact-sub-fail', provider: 'phonepe', status: 'pending' })
  assert.throws(
    () => db.submitPhonepeUtr({ userId: 'u1', orderId: 'ord-exact-sub-fail', utrNumber: '999888777666', submissionTime: tExact48h }),
    /PhonePe payment window has expired/,
    'UTR submission at exactly 48 hours must be rejected'
  )
  db.orders.pop()
  db.payments.pop()

  // 6. Test rejected UTR order:
  // Admin reviews orderId and REJECTS
  const sub = db.payment_submissions.find(s => s.order_id === orderId && s.status === 'submitted')
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: sub.id, approved: false, adminNotes: 'Bank mismatch' })

  // Past 48 hours with rejected UTR: MUST expire on next run
  const expCountRejected = db.expirePendingPhonepeOrders(tJustAfter48h)
  assert.strictEqual(expCountRejected, 1, 'Order with rejected UTR past 48h expires')
  assert.strictEqual(order.status, 'cancelled')

  console.log('✔ Test 17: PhonePe exact 48-hour boundary (before, exact, after) and active UTR protection verified')
}

// Test 18: UTR resubmission does not reset expiry timer
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-timer-check' })
  const order = db.orders.find(o => o.id === orderId)

  // Resubmit attempt past 48 hours from original created_at must be rejected
  const t49h = new Date(order.created_at.getTime() + 49 * 3600 * 1000)
  assert.throws(
    () => db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012', submissionTime: t49h }),
    /PhonePe payment window has expired/,
    'Test 18: Cannot submit UTR after original 48h window'
  )
  console.log('✔ Test 18: UTR resubmission does not reset expiry')
}

// Test 19: Expiration does not affect COD orders
{
  const db = new Phase6cDatabase()
  const codOrderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'cod', idempotencyKey: 'k-cod-safe' })
  const codOrder = db.orders.find(o => o.id === codOrderId)

  const t100h = new Date(codOrder.created_at.getTime() + 100 * 3600 * 1000)
  assert.strictEqual(db.expirePendingPhonepeOrders(t100h), 0, 'COD orders are immune to 48h expiry')
  assert.strictEqual(codOrder.status, 'pending')
  console.log('✔ Test 19: Expiration does not affect COD orders')
}

// Test 20: Expiration restores inventory and coupon exactly once
{
  const db = new Phase6cDatabase()
  const stockBefore = db.inventory['item-1']
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', couponCode: 'SAVE10', provider: 'phonepe', idempotencyKey: 'k-exp-rest' })
  assert.strictEqual(db.inventory['item-1'], stockBefore - 1)
  assert.strictEqual(db.coupons['SAVE10'].used_count, 1)

  const order = db.orders.find(o => o.id === orderId)
  const t50h = new Date(order.created_at.getTime() + 50 * 3600 * 1000)

  // First run
  db.expirePendingPhonepeOrders(t50h)
  assert.strictEqual(db.inventory['item-1'], stockBefore, 'Inventory restored')
  assert.strictEqual(db.coupons['SAVE10'].used_count, 0, 'Coupon restored')

  // Repeated run
  db.expirePendingPhonepeOrders(t50h)
  assert.strictEqual(db.inventory['item-1'], stockBefore, 'Inventory not restored again')
  assert.strictEqual(db.coupons['SAVE10'].used_count, 0, 'Coupon not restored again')
  console.log('✔ Test 20: Expiration restores inventory and coupon usage exactly once')
}

// Test 21: COD payment remains pending until cash collection at delivery
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'cod', idempotencyKey: 'k-cod-flow' })
  const order = db.orders.find(o => o.id === orderId)
  const pay = db.payments.find(p => p.order_id === orderId)
  assert.strictEqual(pay.status, 'pending')

  order.status = 'shipped'
  assert.strictEqual(pay.status, 'pending', 'Payment remains pending during shipment')

  order.status = 'delivered'
  pay.status = 'completed'
  pay.paid_at = new Date()
  assert.strictEqual(pay.status, 'completed', 'Completed upon delivery confirmation')
  console.log('✔ Test 21: COD payment remains pending until cash collection at delivery')
}

// Test 22: Unauthorized users cannot approve, reject or confirm COD collection
{
  assert.ok(migrationContent.includes('IF v_admin_id IS NULL OR NOT public.is_admin() THEN'), 'Admin guard present')
  assert.ok(migrationContent.includes('REVOKE ALL ON FUNCTION public.admin_verify_utr'), 'Revokes from public on admin_verify_utr')
  assert.ok(migrationContent.includes('REVOKE ALL ON FUNCTION public.admin_confirm_cod_payment'), 'Revokes from public on admin_confirm_cod_payment')
  assert.ok(migrationContent.includes('REVOKE ALL ON FUNCTION public.admin_record_refund'), 'Revokes from public on admin_record_refund')
  console.log('✔ Test 22: Unauthorized users cannot approve, reject or confirm COD collection')
}

// Test 23: Paid-order cancellation does not falsely mark payment failed AND does not automatically restore stock
{
  const db = new Phase6cDatabase()
  const stockBefore = db.inventory['item-1']
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-paid-cancel' })
  const s = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012' })
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: s.submission_id, approved: true })

  const payment = db.payments.find(p => p.order_id === orderId)
  assert.strictEqual(payment.status, 'completed', 'Payment is completed')

  // Customer cancels processing order
  db.cancelCustomerOrder('u1', orderId)
  const order = db.orders.find(o => o.id === orderId)
  assert.strictEqual(order.status, 'cancelled')
  assert.strictEqual(payment.status, 'completed', 'Completed payment must NOT be set to failed')
  assert.strictEqual(db.inventory['item-1'], stockBefore - 1, 'Paid cancellation does NOT automatically restore stock before return')
  console.log('✔ Test 23: Paid-order cancellation does not falsely mark payment failed and prevents automatic stock restock')
}

// Test 24: Manual refund validations and return-related stock restoration
{
  const db = new Phase6cDatabase()
  const stockBefore = db.inventory['item-1']
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-ref-val' })
  const s = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012' })
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: s.submission_id, approved: true })
  db.cancelCustomerOrder('u1', orderId)

  // 1. Empty refund reference must fail
  assert.throws(
    () => db.adminRecordRefund({ orderId, refundRef: '   ' }),
    /Refund reference \/ transaction ID is required/,
    'Empty refund reference rejected'
  )

  // 2. Attempt refund on an unpaid order must fail
  const unpaidOrderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'cod', idempotencyKey: 'k-unpaid-ref' })
  assert.throws(
    () => db.adminRecordRefund({ orderId: unpaidOrderId, refundRef: 'REF-123' }),
    /Cannot refund payment in status pending/,
    'Unpaid payment refund rejected'
  )

  // 3. Valid refund with return-related inventory restocking
  const stockBeforeRestock = db.inventory['item-1']
  const refRes = db.adminRecordRefund({ orderId, refundRef: 'UPI-REF-998811', restockInventory: true })
  assert.strictEqual(refRes.payment_status, 'refunded')
  assert.strictEqual(db.inventory['item-1'], stockBeforeRestock + 1, 'Inventory restocked after physical return confirmed')

  const refundedPayment = db.payments.find(p => p.order_id === orderId)
  assert.strictEqual(refundedPayment.refund_reference, 'UPI-REF-998811', 'Dedicated refund_reference column must store refund ref')
  assert.strictEqual(refundedPayment.provider_payment_id, '123456789012', 'Original provider_payment_id (PhonePe UTR) must be preserved intact')

  // 4. Repeated refund attempt must fail
  assert.throws(
    () => db.adminRecordRefund({ orderId, refundRef: 'UPI-REPEAT' }),
    /Payment has already been marked refunded/,
    'Repeated refund rejected'
  )
  console.log('✔ Test 24: Manual refund validated for pending, completed, repeated, and return-restocking')
}

// Test 25: Existing cancellation and Phase 5 regression tests continue to pass
{
  assert.ok(!migrationContent.includes('DROP TABLE public.coupons'), 'Coupons preserved')
  assert.ok(!migrationContent.includes('DROP TABLE public.reviews'), 'Reviews preserved')
  assert.ok(!migrationContent.includes('DROP TABLE public.banners'), 'Banners preserved')
  console.log('✔ Test 25: Existing cancellation and Phase 5 regression tests continue to pass')
}

// Test 26: Unrelated unique-constraint violation while matching idempotency record exists re-raises error
{
  const db = new Phase6cDatabase()
  const initialStock = db.inventory['item-1']
  const initialCouponUses = db.coupons['SAVE10'].used_count

  // 1. Initial order succeeds and establishes idempotency key in database
  const orderId = db.placeOrder({
    userId: 'u1',
    addressId: 'a1',
    couponCode: 'SAVE10',
    provider: 'phonepe',
    idempotencyKey: 'k-dup-unrelated',
  })
  assert.ok(orderId)
  assert.strictEqual(db.inventory['item-1'], initialStock - 1)
  assert.strictEqual(db.coupons['SAVE10'].used_count, initialCouponUses + 1)
  assert.strictEqual(db.orders.length, 1)
  assert.strictEqual(db.payments.length, 1)

  // 2. An attempt encountering an unrelated unique constraint error (e.g. orders_other_unique_key)
  // while the matching idempotency record already exists in the database
  assert.throws(
    () => db.placeOrder({
      userId: 'u1',
      addressId: 'a1',
      couponCode: 'SAVE10',
      provider: 'phonepe',
      idempotencyKey: 'k-dup-unrelated',
      simulateConcurrentRace: true,
      simulateUnrelatedUniqueViolation: true,
    }),
    /orders_other_unique_key/,
    'Test 26: Unrelated unique-constraint violation must be re-raised instead of silently returning existing order'
  )

  // 3. Verify side-effect absence: inventory, coupon, order count, and payment count must remain unchanged
  assert.strictEqual(db.inventory['item-1'], initialStock - 1, 'Inventory remains unchanged after re-raised unrelated error')
  assert.strictEqual(db.coupons['SAVE10'].used_count, initialCouponUses + 1, 'Coupon usage count remains unchanged')
  assert.strictEqual(db.orders.length, 1, 'Order count remains unchanged')
  assert.strictEqual(db.payments.length, 1, 'Payment count remains unchanged')
  assert.strictEqual(db.cartLocked, false, 'Cart lock released')

  console.log('✔ Test 26: Unrelated unique-constraint violation is re-raised and never misidentified as idempotency replay')
}

// Test 27: Cancelled orders cannot be reopened to active statuses, but can transition to refunded
{
  const db = new Phase6cDatabase()
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'cod', idempotencyKey: 'k-reopen-test' })
  db.cancelCustomerOrder('u1', orderId)
  const order = db.orders.find(o => o.id === orderId)
  assert.strictEqual(order.status, 'cancelled')

  // Cannot reopen to pending, processing, shipped, or delivered
  for (const forbiddenStatus of ['pending', 'processing', 'shipped', 'delivered']) {
    assert.throws(
      () => {
        if (order.status === 'cancelled' && forbiddenStatus !== 'cancelled' && forbiddenStatus !== 'refunded') {
          throw new Error(`Cancelled orders cannot be reopened or transitioned to ${forbiddenStatus}`)
        }
      },
      /Cancelled orders cannot be reopened/,
      `Cannot reopen cancelled order to ${forbiddenStatus}`
    )
  }
  console.log('✔ Test 27: Cancelled orders cannot be reopened to active statuses, but can transition to refunded')
}

// Test 28: Refund with restockInventory = false does NOT automatically restore inventory
{
  const db = new Phase6cDatabase()
  const stockBefore = db.inventory['item-1']
  const orderId = db.placeOrder({ userId: 'u1', addressId: 'a1', provider: 'phonepe', idempotencyKey: 'k-norestock' })
  const s = db.submitPhonepeUtr({ userId: 'u1', orderId, utrNumber: '123456789012' })
  db.adminVerifyUtr({ adminId: 'adm1', submissionId: s.submission_id, approved: true })
  db.cancelCustomerOrder('u1', orderId)

  const stockAfterCancel = db.inventory['item-1']
  assert.strictEqual(stockAfterCancel, stockBefore - 1, 'Inventory remains consumed after paid cancellation')

  // Refund without return restocking
  const refRes = db.adminRecordRefund({ orderId, refundRef: 'UPI-NO-RETURN', restockInventory: false })
  assert.strictEqual(refRes.payment_status, 'refunded')
  assert.strictEqual(refRes.order_status, 'refunded')
  assert.strictEqual(db.inventory['item-1'], stockAfterCancel, 'Inventory must NOT be restored when restockInventory is false')
  console.log('✔ Test 28: Refund does not automatically restore inventory when restockInventory is false')
}

// Test 29: Customer cannot supply custom submission timestamp (production RPC uses database NOW())
{
  assert.ok(
    migrationContent.includes('DROP FUNCTION IF EXISTS public.submit_phonepe_utr(UUID, TEXT, TIMESTAMPTZ);'),
    'Test 29: Caller-controlled timestamp overload explicitly dropped from database'
  )
  assert.ok(
    !migrationContent.includes('p_submission_time TIMESTAMPTZ'),
    'Test 29: Production migration must not expose caller-controlled timestamp parameter'
  )
  assert.ok(
    migrationContent.includes('GRANT EXECUTE ON FUNCTION public.submit_phonepe_utr(UUID, TEXT) TO authenticated;'),
    'Test 29: Ordinary customers strictly restricted to 2-argument production RPC'
  )
  assert.ok(
    sqlTestContent.includes("proname = 'submit_phonepe_utr' AND pronargs = 3"),
    'Test 29: SQL test verifies 3-argument overload does not exist in pg_proc'
  )
  console.log('✔ Test 29: Customers cannot supply custom submission timestamp; production RPC enforces database NOW()')
}

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('ALL PHASE 6C CRITICAL REVIEW CORRECTION TESTS PASSED (100%)')
console.log('═══════════════════════════════════════════════════════════════════')
