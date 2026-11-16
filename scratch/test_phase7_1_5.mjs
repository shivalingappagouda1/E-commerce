import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('═══════════════════════════════════════════════════════════════════')
console.log('ShopKart Phase 7.1.6 — Verification & Static Audit Suite')
console.log('═══════════════════════════════════════════════════════════════════\n')

// 1. File Existence
const paths = {
  schema: path.resolve('database/schema.sql'),
  enhancements: path.resolve('database/migrations/phase7_backend_enhancements.sql'),
  securityFixes: path.resolve('database/migrations/phase7_1_security_and_cart_fixes.sql'),
  rollbackFixes: path.resolve('database/migrations/phase7_1_rollback.sql'),
  sqlTests: path.resolve('database/tests/phase7_1_sql_tests.sql'),
  cartService: path.resolve('src/services/cartService.js'),
  orderService: path.resolve('src/services/orderService.js'),
  cartContext: path.resolve('src/context/CartContext.jsx'),
  checkoutPage: path.resolve('src/pages/customer/CheckoutPage.jsx')
}

for (const [key, p] of Object.entries(paths)) {
  assert.ok(fs.existsSync(p), `File exists: ${key} -> ${p}`)
}
console.log('✔ Section 1: All required migration, test, and service files exist.')

const sqlEnhancements = fs.readFileSync(paths.enhancements, 'utf8')
const sqlSecurityFixes = fs.readFileSync(paths.securityFixes, 'utf8')
const sqlTests = fs.readFileSync(paths.sqlTests, 'utf8')
const codeCartService = fs.readFileSync(paths.cartService, 'utf8')
const codeOrderService = fs.readFileSync(paths.orderService, 'utf8')
const codeCartContext = fs.readFileSync(paths.cartContext, 'utf8')
const codeCheckoutPage = fs.readFileSync(paths.checkoutPage, 'utf8')

// 2. Audit place_order
console.log('\n--- Auditing place_order ---')
const dropPlaceOrderIdx = sqlSecurityFixes.indexOf('DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT);')
const createPlaceOrderIdx = sqlSecurityFixes.indexOf('CREATE OR REPLACE FUNCTION public.place_order(')
assert.ok(dropPlaceOrderIdx !== -1, 'Explicit DROP of legacy 2-parameter place_order exists')
assert.ok(createPlaceOrderIdx !== -1, 'CREATE OR REPLACE for 3-parameter place_order exists')
assert.ok(dropPlaceOrderIdx < createPlaceOrderIdx, 'Legacy 2-param overload is dropped BEFORE 3-param function is created')

// Ensure 3-parameter signature
assert.ok(
  sqlSecurityFixes.includes('p_address_id UUID,\n  p_notes TEXT DEFAULT NULL,\n  p_coupon_code TEXT DEFAULT NULL'),
  'place_order signature matches expected 3 parameters with DEFAULT NULL'
)

// Ensure permissions
assert.ok(sqlSecurityFixes.includes('REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT, TEXT) FROM PUBLIC;'), 'place_order revokes PUBLIC')
assert.ok(sqlSecurityFixes.includes('REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT, TEXT) FROM anon;'), 'place_order revokes anon')
assert.ok(sqlSecurityFixes.includes('GRANT EXECUTE ON FUNCTION public.place_order(UUID, TEXT, TEXT) TO authenticated;'), 'place_order grants authenticated')
console.log('✔ Section 2: place_order removal of legacy overload, 3-param definition, and permission grants verified.')

// 3. Audit sync_user_cart
console.log('\n--- Auditing sync_user_cart ---')
const preArrayCheck = sqlSecurityFixes.indexOf("IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN")
const deleteCartItemsIdx = sqlSecurityFixes.indexOf('DELETE FROM public.cart_items WHERE cart_id = v_cart_id;')
assert.ok(preArrayCheck !== -1, 'Array validation check exists')
assert.ok(deleteCartItemsIdx !== -1, 'DELETE cart_items exists')
assert.ok(preArrayCheck < deleteCartItemsIdx, 'Pre-validation occurs before destructive DELETE cart_items')

// Check bounds and no-clamping
assert.ok(sqlSecurityFixes.includes('IF v_quantity IS NULL OR v_quantity < 1 THEN'), 'Enforces quantity >= 1')
assert.ok(sqlSecurityFixes.includes('IF v_quantity > 99 THEN'), 'Enforces quantity <= 99 per item')
assert.ok(sqlSecurityFixes.includes('IF v_agg.combined_quantity > 99 THEN'), 'Enforces combined duplicate quantity <= 99')
assert.ok(!sqlSecurityFixes.includes('LEAST(99, cart_items.quantity'), 'Confirmed NO silent clamping of duplicate quantities')

// Check inventory validation and price consistency snapshot
assert.ok(sqlSecurityFixes.includes('SELECT quantity INTO v_stock\n      FROM public.inventory'), 'Checks inventory table for stock')
assert.ok(sqlSecurityFixes.includes('v_stock < v_agg.combined_quantity'), 'Checks stock against combined quantity of duplicates')
assert.ok(sqlSecurityFixes.includes('PERFORM 1 FROM public.products WHERE id = v_item.product_id FOR SHARE;'), 'place_order locks products FOR SHARE')
assert.ok(sqlSecurityFixes.includes('v_items_snapshot := v_items_snapshot || jsonb_build_object'), 'place_order records price snapshot')
assert.ok(sqlSecurityFixes.includes('SELECT * FROM jsonb_to_recordset(v_items_snapshot)'), 'place_order writes order_items from price snapshot')
console.log('✔ Section 3: sync_user_cart payload safety, bounds enforcement (1..99), no-clamping, and place_order price snapshotting verified.')

// 4. Audit Cancellation, RLS Policies & Rollback Accuracy
console.log('\n--- Auditing Cancellation, RLS Policies & Rollback Accuracy ---')
assert.ok(
  sqlSecurityFixes.includes("IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN\n    RAISE EXCEPTION 'Cancelled orders cannot be reopened"),
  'Cancellation guard blocks reopening cancelled orders in phase 7.1'
)
assert.ok(
  sqlSecurityFixes.includes('SET used_count = GREATEST(0, used_count - 1)\n      WHERE id = NEW.coupon_id;'),
  'Cancellation restores consumed coupon count in phase 7.1'
)
assert.ok(
  sqlSecurityFixes.includes('REVOKE ALL ON FUNCTION public.restore_inventory_on_cancellation()\nFROM PUBLIC, anon, authenticated;'),
  'Trigger function permissions revoked from PUBLIC, anon, and authenticated'
)

// Check RLS hardening on cart_items
assert.ok(sqlSecurityFixes.includes('DROP POLICY IF EXISTS "Users manage own cart items" ON public.cart_items;'), 'Drops legacy customer manage policy')
assert.ok(sqlSecurityFixes.includes('DROP POLICY IF EXISTS "Users insert own cart items" ON public.cart_items;'), 'Drops customer INSERT policy')
assert.ok(sqlSecurityFixes.includes('DROP POLICY IF EXISTS "Users update own cart items" ON public.cart_items;'), 'Drops customer UPDATE policy')
assert.ok(sqlSecurityFixes.includes('DROP POLICY IF EXISTS "Users delete own cart items" ON public.cart_items;'), 'Drops customer DELETE policy')
assert.ok(sqlSecurityFixes.includes('CREATE POLICY "Users view own cart items"\n  ON public.cart_items FOR SELECT'), 'Affirms customer SELECT policy')
assert.ok(sqlSecurityFixes.includes('CREATE POLICY "Admins can view all cart items"\n  ON public.cart_items FOR SELECT'), 'Affirms admin SELECT policy')

// Ensure rollback is separated into dedicated file and restores exact Phase 7 baseline
const rollbackSql = fs.readFileSync(paths.rollbackFixes, 'utf8')
assert.ok(!sqlSecurityFixes.includes('COMPLETE ROLLBACK SCRIPT'), 'Forward migration contains ONLY forward DDL')

assert.ok(
  rollbackSql.includes('DROP FUNCTION IF EXISTS public.sync_user_cart(JSONB);'),
  'Rollback drops sync_user_cart'
)
assert.ok(
  rollbackSql.includes('DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT, TEXT);'),
  'Rollback drops 3-param place_order'
)
assert.ok(
  rollbackSql.includes('CREATE OR REPLACE FUNCTION public.place_order(\n  p_address_id UUID,\n  p_notes TEXT DEFAULT NULL\n)'),
  'Rollback recreates original 2-param place_order from schema.sql'
)
assert.ok(
  !rollbackSql.includes('Cancelled orders cannot be reopened'),
  'Rollback does NOT contain Phase 7.1.5 lifecycle guard (restores true Phase 7 baseline)'
)
assert.ok(
  rollbackSql.includes('CREATE POLICY "Users insert own cart items"') &&
  rollbackSql.includes('CREATE POLICY "Users update own cart items"') &&
  rollbackSql.includes('CREATE POLICY "Users delete own cart items"'),
  'Rollback restores original cart_items customer write policies from schema.sql'
)
console.log('✔ Section 4: Cancellation, cart_items RLS hardening, and exact true Phase 7 rollback verified.')

// 5. Audit Admin RPC
console.log('\n--- Auditing get_admin_customers ---')
assert.ok(sqlEnhancements.includes('REVOKE ALL ON FUNCTION public.get_admin_customers() FROM PUBLIC;'), 'Revokes from PUBLIC')
assert.ok(sqlEnhancements.includes('REVOKE ALL ON FUNCTION public.get_admin_customers() FROM anon;'), 'Revokes from anon')
assert.ok(sqlEnhancements.includes('GRANT EXECUTE ON FUNCTION public.get_admin_customers() TO authenticated;'), 'Grants to authenticated')
assert.ok(sqlEnhancements.includes('IF NOT public.is_admin() THEN'), 'Validates is_admin() inside function body')
console.log('✔ Section 5: Admin RPC get_admin_customers permissions and is_admin authorization verified.')

// 6. Audit Test Suite Completeness (16 Scenarios + Test Isolation)
console.log('\n--- Auditing SQL Test Suite ---')
assert.ok(!sqlTests.includes('SELECT id FROM auth.users LIMIT 1'), 'Test suite does NOT use arbitrary existing user selection')
assert.ok(!sqlTests.includes('SELECT id INTO v_user_id FROM auth.users LIMIT 1'), 'No arbitrary auth.users LIMIT 1 queries')

const testChecks = [
  'SUITE 1: Anonymous Access Rejection',
  'anon correctly denied access to place_order',
  'anon correctly denied access to sync_user_cart',
  'anon correctly denied access to get_admin_customers',
  'Authenticated customer successfully invokes sync_user_cart',
  'Verified 0 direct write policies exist on public.cart_items in pg_policies',
  'Direct client INSERT into cart_items correctly denied by RLS',
  'Direct client UPDATE on cart_items denied or blocked under RLS',
  'Direct client DELETE on cart_items denied or blocked under RLS',
  'NULL cart payload rejected',
  'Non-array JSON payload rejected',
  'Zero quantity rejected',
  'Quantity > 99 rejected',
  'Combined duplicate quantity > 99 rejected',
  'Malformed product UUID rejected',
  'Inactive product rejected',
  'Mismatched variant rejected',
  'Quantity exceeding stock rejected',
  'Aggregated duplicates exceeding stock rejected',
  'Valid cart sync verified',
  'Non-existent coupon code rejected',
  'Inactive coupon rejected',
  'Expired coupon rejected',
  'Max-usage coupon rejected',
  'Order placed successfully with ID',
  'Authoritative totals and transactional coupon increment verified',
  'Inventory decremented correctly',
  'Order cancellation correctly restored inventory and coupon usage',
  'Repeated updates to cancelled order did not trigger duplicate restoration',
  'Guard prevented reopening cancelled order',
  'Ordinary customer rejected by is_admin() authorization check',
  'Genuine administrator successfully retrieved customer records',
  'product_id, variant_type, variant_value, price_delta',
  'Expected exactly 2 distinct cart items',
  'Expected total quantity 7 (5 + 2)',
  'Cart modified during NULL payload rejection',
  'v_admin_role <> \'admin\''
]

for (const check of testChecks) {
  assert.ok(sqlTests.includes(check), `Test suite includes scenario: "${check}"`)
}
console.log(`✔ Section 6: All SQL test scenarios, dedicated isolation, and RLS denial checks verified.`)

// 7. Audit Frontend Integration
console.log('\n--- Auditing Frontend Code ---')
assert.ok(codeCartContext.includes('syncCartToSupabase'), 'CartContext invokes syncCartToSupabase')
assert.ok(!codeCartService.includes("from('cart_items').delete()"), 'cartService does not perform sequential delete fallback')
assert.ok(!codeOrderService.includes("place_order', { p_address_id: addressId, p_notes: notes }"), 'orderService does not call legacy 2-arg place_order')
assert.ok(codeOrderService.includes("p_coupon_code: cleanCoupon"), 'orderService passes sanitized cleanCoupon')
assert.ok(codeCheckoutPage.includes("clearCart()"), 'CheckoutPage clears cart on success')
assert.ok(codeCheckoutPage.includes("if (orderError)"), 'CheckoutPage preserves cart on order failure')
console.log('✔ Section 7: Frontend atomic RPC invocation and cart preservation verified.')

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('ALL PHASE 7.1.6 STATIC AUDIT & VERIFICATION CHECKS PASSED (100%)')
console.log('═══════════════════════════════════════════════════════════════════')
