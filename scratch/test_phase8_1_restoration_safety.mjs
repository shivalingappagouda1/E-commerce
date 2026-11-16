import assert from 'node:assert'
import fs from 'node:fs'

console.log('═══════════════════════════════════════════════════════════════════')
console.log('ShopKart — Phase 8.1 Shipped-Order Inventory Restoration Safety')
console.log('═══════════════════════════════════════════════════════════════════\n')

const migration8_1 = fs.readFileSync('database/migrations/phase8_1_inventory_restoration_safety.sql', 'utf8')
const rollback8_1 = fs.readFileSync('database/migrations/phase8_1_rollback.sql', 'utf8')
const testSql8_1 = fs.readFileSync('database/tests/phase8_1_sql_tests.sql', 'utf8')
const migration7_2 = fs.readFileSync('database/migrations/phase7_2_customer_order_cancellation.sql', 'utf8')

// ── 1. Static Security & Function Structure Verification ──────────
console.log('--- 1. Static Security & Function Structure Verification ---')
assert.ok(migration8_1.includes("CREATE OR REPLACE FUNCTION public.restore_inventory_on_cancellation()"), 'Declares restore_inventory_on_cancellation')
assert.ok(migration8_1.includes("SECURITY DEFINER"), 'Preserves SECURITY DEFINER')
assert.ok(migration8_1.includes("SET search_path = ''"), 'Preserves search_path = empty')
assert.ok(migration8_1.includes("REVOKE ALL ON FUNCTION public.restore_inventory_on_cancellation()"), 'Revokes execution from client roles')
assert.ok(migration8_1.includes("DROP TRIGGER IF EXISTS trg_restore_inventory_on_cancel"), 'Clean trigger drop')
assert.ok(migration8_1.includes("CREATE TRIGGER trg_restore_inventory_on_cancel"), 'Recreates trigger')
assert.ok(migration8_1.includes("AFTER UPDATE OF status ON public.orders"), 'Attaches to status column update')

// Crucial: check status condition
assert.ok(
  migration8_1.includes("IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'processing') THEN"),
  'Status condition strictly restricted to pending and processing'
)
assert.ok(
  !migration8_1.includes("OLD.status IN ('pending', 'processing', 'shipped')"),
  'Shipped is strictly removed from restoration condition in migration 8.1'
)
assert.ok(
  rollback8_1.includes("OLD.status IN ('pending', 'processing', 'shipped')"),
  'Rollback accurately restores shipped restoration if needed'
)
console.log('✔ Static Security & Function Structure Passed')

// ── 2. SQL Test File Integrity Verification ───────────────────────
console.log('--- 2. SQL Test File Integrity Verification ---')
assert.ok(testSql8_1.includes('\nBEGIN;'), 'Test suite contains BEGIN transaction wrapper')
assert.ok(testSql8_1.trim().endsWith('ROLLBACK;'), 'Test suite ends with ROLLBACK to isolate fixtures')
assert.ok(testSql8_1.includes("has_function_privilege('anon', 'public.restore_inventory_on_cancellation()', 'execute')"), 'Inspects anon privilege via has_function_privilege')
assert.ok(testSql8_1.includes("has_function_privilege('authenticated', 'public.restore_inventory_on_cancellation()', 'execute')"), 'Inspects authenticated privilege via has_function_privilege')
assert.ok(testSql8_1.includes("aclexplode(p.proacl)"), 'Uses aclexplode for PUBLIC ACL inspection')
assert.ok(testSql8_1.includes("acl.grantee = 0"), 'Checks PUBLIC pseudo-role grantee 0')
assert.ok(!testSql8_1.includes("has_function_privilege('public'"), 'Does not use has_function_privilege for PUBLIC pseudo-role')
assert.ok(!testSql8_1.includes("PERFORM public.restore_inventory_on_cancellation();"), 'Does not directly execute trigger function')
assert.ok(testSql8_1.includes("tgname = 'trg_restore_inventory_on_cancel'"), 'Inspects trigger attachment in pg_trigger')
assert.ok(testSql8_1.includes("v_tgfoid <> v_fn_oid"), 'Verifies trigger function OID matches target function')
assert.ok(testSql8_1.includes("v_tgenabled NOT IN ('O', 'A')"), 'Verifies trigger is actively enabled')
assert.ok(testSql8_1.includes("INSERT INTO auth.users"), 'Satisfies auth.users foreign key')
assert.ok(testSql8_1.includes("INSERT INTO public.profiles"), 'Satisfies profiles foreign key')
assert.ok(testSql8_1.includes("INSERT INTO public.addresses"), 'Satisfies addresses foreign key')
assert.ok(testSql8_1.includes("address_id"), 'Uses valid address_id column in orders')
assert.ok(!testSql8_1.includes("shipping_address"), 'Does not use invalid shipping_address column in orders')
assert.ok(testSql8_1.includes("UPDATE public.orders\n  SET status = 'cancelled'\n  WHERE id = v_order_pending_id;"), 'Tests repeated cancellation with SET status = cancelled')
assert.ok(testSql8_1.includes("cancel_order(v_order_delivered_c1_id)"), 'Tests customer cancel_order on delivered orders')
console.log('✔ SQL Test File Integrity Passed')

// ── 3. Simulated State Machine & Inventory Lifecycle Tests ────────
console.log('--- 3. Simulated Inventory Lifecycle & State Machine Tests ---')

class MockOrderInventoryEngine {
  constructor() {
    this.inventory = { 'prod-1': 100 }
    this.coupons = { 'coupon-1': { used_count: 5 } }
    this.orders = {
      'order-pending': { id: 'order-pending', user_id: 'user-1', status: 'pending', coupon_id: 'coupon-1', items: [{ product_id: 'prod-1', qty: 2 }] },
      'order-processing': { id: 'order-processing', user_id: 'user-1', status: 'processing', coupon_id: 'coupon-1', items: [{ product_id: 'prod-1', qty: 3 }] },
      'order-shipped': { id: 'order-shipped', user_id: 'user-1', status: 'shipped', coupon_id: 'coupon-1', items: [{ product_id: 'prod-1', qty: 4 }] },
      'order-delivered': { id: 'order-delivered', user_id: 'user-1', status: 'delivered', coupon_id: 'coupon-1', items: [{ product_id: 'prod-1', qty: 2 }] },
      'order-cancelled': { id: 'order-cancelled', user_id: 'user-1', status: 'cancelled', coupon_id: 'coupon-1', items: [{ product_id: 'prod-1', qty: 1 }] },
    }
  }

  // Simulates trigger trg_restore_inventory_on_cancel logic
  updateOrderStatus(orderId, newStatus) {
    const order = this.orders[orderId]
    if (!order) throw new Error('Order not found')
    const oldStatus = order.status

    // Trigger Guard 1: Prevent reopening
    if (oldStatus === 'cancelled' && newStatus !== 'cancelled') {
      throw new Error(`Cancelled orders cannot be reopened or transitioned to ${newStatus}`)
    }

    // Update status
    order.status = newStatus

    // Trigger Guard 2: Inventory restoration condition
    if (newStatus === 'cancelled' && ['pending', 'processing'].includes(oldStatus)) {
      for (const item of order.items) {
        this.inventory[item.product_id] = (this.inventory[item.product_id] || 0) + item.qty
      }
      if (order.coupon_id && this.coupons[order.coupon_id]) {
        this.coupons[order.coupon_id].used_count = Math.max(0, this.coupons[order.coupon_id].used_count - 1)
      }
    }
    // Shipped or delivered transitions do NOT execute the block above
    return order
  }

  // Simulates cancel_order(UUID) RPC logic
  customerCancelOrder(orderId, callerUserId) {
    const order = this.orders[orderId]
    if (!order) throw new Error('Order not found')
    if (order.user_id !== callerUserId) {
      throw new Error('Access denied: You can only cancel your own orders')
    }
    if (order.status === 'cancelled') throw new Error('Order is already cancelled')
    if (order.status === 'refunded') throw new Error('Order has already been refunded and cannot be cancelled')
    if (order.status === 'shipped') throw new Error('Cannot cancel an order that has already been shipped')
    if (order.status === 'delivered') throw new Error('Cannot cancel an order that has already been delivered')
    if (!['pending', 'processing'].includes(order.status)) {
      throw new Error(`Order cannot be cancelled in status: ${order.status}`)
    }

    return this.updateOrderStatus(orderId, 'cancelled')
  }
}

const engine = new MockOrderInventoryEngine()

// Test 3.1: Pending cancellation restores inventory & coupon
console.log('Testing: Pending cancellation restores inventory & coupon...')
assert.strictEqual(engine.inventory['prod-1'], 100)
assert.strictEqual(engine.coupons['coupon-1'].used_count, 5)
engine.updateOrderStatus('order-pending', 'cancelled')
assert.strictEqual(engine.inventory['prod-1'], 102, 'Pending cancellation restored +2 items')
assert.strictEqual(engine.coupons['coupon-1'].used_count, 4, 'Coupon used_count decremented from 5 to 4')
console.log('✔ Test 3.1: Pending cancellation restores inventory and decrements coupon')

// Test 3.2: Processing cancellation restores inventory & coupon
console.log('Testing: Processing cancellation restores inventory & coupon...')
engine.updateOrderStatus('order-processing', 'cancelled')
assert.strictEqual(engine.inventory['prod-1'], 105, 'Processing cancellation restored +3 items')
assert.strictEqual(engine.coupons['coupon-1'].used_count, 3, 'Coupon used_count decremented from 4 to 3')
console.log('✔ Test 3.2: Processing cancellation restores inventory and decrements coupon')

// Test 3.3: Shipped cancellation DOES NOT restore inventory or coupon
console.log('Testing: Shipped cancellation DOES NOT restore inventory or coupon...')
engine.updateOrderStatus('order-shipped', 'cancelled')
assert.strictEqual(engine.inventory['prod-1'], 105, 'Shipped cancellation maintained stock without automatic restoration')
assert.strictEqual(engine.coupons['coupon-1'].used_count, 3, 'Shipped cancellation maintained coupon usage without decrement')
console.log('✔ Test 3.3: Shipped cancellation does NOT restore inventory or coupon')

// Test 3.4: Delivered cancellation DOES NOT restore inventory or coupon
console.log('Testing: Delivered cancellation DOES NOT restore inventory or coupon...')
engine.updateOrderStatus('order-delivered', 'cancelled')
assert.strictEqual(engine.inventory['prod-1'], 105, 'Delivered cancellation maintained stock without automatic restoration')
assert.strictEqual(engine.coupons['coupon-1'].used_count, 3, 'Delivered cancellation maintained coupon usage without decrement')
console.log('✔ Test 3.4: Delivered cancellation does NOT restore inventory or coupon')

// Test 3.5: Repeated cancellation cannot restore inventory twice
console.log('Testing: Repeated cancellation cannot restore inventory twice...')
engine.updateOrderStatus('order-pending', 'cancelled') // updating already cancelled
assert.strictEqual(engine.inventory['prod-1'], 105, 'Duplicate update on cancelled order did not restore stock again')
assert.strictEqual(engine.coupons['coupon-1'].used_count, 3, 'Duplicate update on cancelled order did not decrement coupon again')
console.log('✔ Test 3.5: Duplicate update cannot restore inventory or coupon twice')

// Test 3.6: Cancelled orders cannot be reopened
console.log('Testing: Cancelled orders cannot be reopened...')
assert.throws(
  () => engine.updateOrderStatus('order-cancelled', 'pending'),
  /Cancelled orders cannot be reopened or transitioned to pending/,
  'Throws when attempting to reopen cancelled order'
)
console.log('✔ Test 3.6: Cancelled orders cannot be reopened')

// Test 3.7: Unauthorized customer cannot cancel another customer order
console.log('Testing: Unauthorized customer cannot cancel another customer order...')
assert.throws(
  () => engine.customerCancelOrder('order-pending', 'wrong-user-2'),
  /Access denied: You can only cancel your own orders/,
  'Throws when customer attempts to cancel order belonging to another customer'
)
console.log('✔ Test 3.7: Unauthorized customers blocked from cancelling other orders')

// Test 3.8: Customer cannot cancel shipped or delivered orders via cancel_order
console.log('Testing: Customer cannot cancel shipped or delivered orders...')
const engine2 = new MockOrderInventoryEngine()
assert.throws(
  () => engine2.customerCancelOrder('order-shipped', 'user-1'),
  /Cannot cancel an order that has already been shipped/,
  'Customer cancel_order rejects shipped order'
)
assert.throws(
  () => engine2.customerCancelOrder('order-delivered', 'user-1'),
  /Cannot cancel an order that has already been delivered/,
  'Customer cancel_order rejects delivered order'
)
console.log('✔ Test 3.8: Customer cancel_order strictly forbids cancelling shipped or delivered orders')

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('ALL PHASE 8.1 INVENTORY RESTORATION SAFETY TESTS PASSED (100%)')
console.log('═══════════════════════════════════════════════════════════════════\n')
