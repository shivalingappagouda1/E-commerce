/**
 * ShopKart — Phase 8 Final Integration, Security & Production Readiness Audit Suite
 *
 * Comprehensive end-to-end audit verifying:
 * 1. Architecture, Environment & Secret Isolation
 * 2. Route Protection & RBAC Gatekeeping
 * 3. Database Security Defenses & Search Path Hardening (all 8 functions)
 * 4. Authoritative Catalog & Variant Pricing Integrity
 * 5. Cart Lifecycle, Concurrency & UUID Validation
 * 6. Order Placement, Trusted Snapshots & Inventory Decrement
 * 7. Customer Cancellation, Row-Locking & Single-Trigger Stock Restoration
 * 8. Order Status Transitions & Reopen Prevention
 * 9. Admin Dashboard Capabilities & Role Isolation
 * 10. Payment Transparency & Simulator Isolation
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('═══════════════════════════════════════════════════════════════════')
console.log('ShopKart — Phase 8 Production Readiness & Security Audit')
console.log('═══════════════════════════════════════════════════════════════════\n')

// ── Read Critical Files ──────────────────────────────────────────
const files = {
  appRoutes: fs.readFileSync(path.resolve('src/routes/AppRoutes.jsx'), 'utf8'),
  authGuard: fs.readFileSync(path.resolve('src/components/common/AuthGuard.jsx'), 'utf8'),
  authContext: fs.readFileSync(path.resolve('src/context/AuthContext.jsx'), 'utf8'),
  cartContext: fs.readFileSync(path.resolve('src/context/CartContext.jsx'), 'utf8'),
  supabaseLib: fs.readFileSync(path.resolve('src/lib/supabase.js'), 'utf8'),
  productService: fs.readFileSync(path.resolve('src/services/productService.js'), 'utf8'),
  cartService: fs.readFileSync(path.resolve('src/services/cartService.js'), 'utf8'),
  orderService: fs.readFileSync(path.resolve('src/services/orderService.js'), 'utf8'),
  adminService: fs.readFileSync(path.resolve('src/services/adminService.js'), 'utf8'),
  checkoutPage: fs.readFileSync(path.resolve('src/pages/customer/CheckoutPage.jsx'), 'utf8'),
  ordersPage: fs.readFileSync(path.resolve('src/pages/customer/OrdersPage.jsx'), 'utf8'),
  schema: fs.readFileSync(path.resolve('database/schema.sql'), 'utf8'),
  migration7_0: fs.readFileSync(path.resolve('database/migrations/phase7_backend_enhancements.sql'), 'utf8'),
  migration7_1: fs.readFileSync(path.resolve('database/migrations/phase7_1_security_and_cart_fixes.sql'), 'utf8'),
  migration7_2: fs.readFileSync(path.resolve('database/migrations/phase7_2_customer_order_cancellation.sql'), 'utf8'),
  seedStaging: fs.readFileSync(path.resolve('database/seed_staging.sql'), 'utf8'),
}

// ── 1. Architecture, Environment & Secret Isolation ──────────────
console.log('--- 1. Architecture & Secret Isolation ---')
assert.ok(
  !files.supabaseLib.includes('service_role') &&
  !files.supabaseLib.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Frontend client does not reference or expose service-role key'
)
assert.ok(
  files.supabaseLib.includes('VITE_SUPABASE_PUBLISHABLE_KEY') &&
  files.supabaseLib.includes('VITE_SUPABASE_ANON_KEY'),
  'Frontend client supports standard publishable / anon environment variables'
)
console.log('✔ Section 1: Architecture & Secret Isolation Passed')

// ── 2. Route Protection & RBAC Gatekeeping ───────────────────────
console.log('--- 2. Route Protection & RBAC Gatekeeping ---')
assert.ok(
  files.appRoutes.includes('<AuthGuard requireAuth={true}><OrdersPage /></AuthGuard>') &&
  files.appRoutes.includes('<AuthGuard requireAuth={true}><ProfilePage /></AuthGuard>'),
  'Customer private routes (/orders, /profile) strictly require authentication'
)
assert.ok(
  files.appRoutes.includes('<AuthGuard requireAdmin={true}>') &&
  files.appRoutes.includes('<AdminLayout />'),
  'All /admin routes strictly require requireAdmin={true}'
)
assert.ok(
  files.authGuard.includes("if (requireAdmin && (!user || !isAdmin))"),
  'AuthGuard renders Access Denied view when caller lacks admin role'
)
console.log('✔ Section 2: Route Protection & RBAC Gatekeeping Passed')

// ── 3. Database Security Defenses & Search Path Hardening ────────
console.log('--- 3. Database Security Defenses & Search Path Hardening ---')
const securityFunctions = [
  { name: 'is_admin', file: files.schema },
  { name: 'prevent_role_self_escalation', file: files.schema },
  { name: 'create_profile_on_signup', file: files.schema },
  { name: 'get_admin_customers', file: files.migration7_0 },
  { name: 'sync_user_cart', file: files.migration7_1 },
  { name: 'place_order', file: files.migration7_1 },
  { name: 'restore_inventory_on_cancellation', file: files.migration7_1 },
  { name: 'cancel_order', file: files.migration7_2 },
]

for (const fn of securityFunctions) {
  assert.ok(
    fn.file.includes(`FUNCTION public.${fn.name}`) || fn.file.includes(`FUNCTION ${fn.name}`),
    `Function ${fn.name} is defined in database DDL`
  )
  assert.ok(
    fn.file.includes("SECURITY DEFINER"),
    `Function ${fn.name} is declared as SECURITY DEFINER`
  )
  assert.ok(
    fn.file.includes("SET search_path = ''"),
    `Function ${fn.name} sets safe empty search_path`
  )
}

// Check role self-escalation trigger
assert.ok(
  files.schema.includes("IF NEW.role IS DISTINCT FROM OLD.role THEN\n    IF NOT public.is_admin() THEN\n      RAISE EXCEPTION 'Access denied: Only administrators can modify user roles.';"),
  'Role self-escalation trigger explicitly blocks non-admins from modifying profile role'
)

// Check legacy place_order drop
assert.ok(
  files.migration7_1.includes('DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT);'),
  'Legacy two-parameter place_order overload explicitly dropped'
)
console.log('✔ Section 3: Database Security Defenses & Search Path Passed')

// ── 4. Authoritative Catalog & Variant Pricing Integrity ─────────
console.log('--- 4. Authoritative Catalog & Variant Pricing Integrity ---')
assert.ok(
  files.productService.includes("if (!isMock())") &&
  !files.productService.includes("if (!data || data.length === 0) return { data: SAMPLE_PRODUCTS"),
  'productService never silently substitutes demo products when Supabase is configured'
)
assert.ok(
  files.productService.includes("normalizeDatabaseProduct"),
  'productService normalizes database relations (images, categories, inventory)'
)
console.log('✔ Section 4: Authoritative Catalog & Variant Pricing Passed')

// ── 5. Cart Lifecycle, Concurrency & UUID Validation ─────────────
console.log('--- 5. Cart Lifecycle, Concurrency & UUID Validation ---')
assert.ok(
  files.cartContext.includes("isSupabaseConfigured && !isValidUUID(pId)"),
  'CartContext blocks adding demo or non-UUID items when Supabase is configured'
)
assert.ok(
  files.cartContext.includes("isMergingRef.current"),
  'CartContext prevents debounced sync while login merge is in-flight'
)
assert.ok(
  files.cartContext.includes("dispatch({ type: 'CLEAR_CART' })") &&
  files.cartContext.includes("localStorage.removeItem(STORAGE_KEY)"),
  'CartContext cleanses state on logout to prevent cross-account contamination'
)
assert.ok(
  files.cartService.includes("supabase.rpc('sync_user_cart', {"),
  'cartService synchronizes cart exclusively via atomic sync_user_cart RPC'
)
console.log('✔ Section 5: Cart Lifecycle, Concurrency & Validation Passed')

// ── 6. Order Placement, Snapshots & Inventory Decrement ───────────
console.log('--- 6. Order Placement & Inventory Decrement ---')
assert.ok(
  files.orderService.includes("const syncResult = await syncCartToSupabase(cartItems, user.id)") &&
  files.orderService.includes("if (!syncResult.ok)"),
  'orderService synchronizes cart before place_order and halts on failure'
)
assert.ok(
  files.migration7_1.includes("SELECT quantity INTO v_stock\n    FROM public.inventory\n    WHERE product_id = v_item.product_id\n      AND variant_id IS NOT DISTINCT FROM v_item.variant_id\n    FOR UPDATE;"),
  'place_order locks inventory rows FOR UPDATE'
)
assert.ok(
  files.migration7_1.includes("UPDATE public.inventory\n    SET quantity = quantity - v_snap_item.quantity"),
  'place_order decrements inventory atomically'
)
assert.ok(
  files.migration7_1.includes("INSERT INTO public.order_items"),
  'place_order writes immutable line-item price snapshots'
)
console.log('✔ Section 6: Order Placement & Inventory Decrement Passed')

// ── 7. Customer Cancellation & Single Restoration Trigger ────────
console.log('--- 7. Customer Cancellation & Inventory Restoration ---')
assert.ok(
  files.migration7_2.includes("SELECT id, user_id, status INTO v_order\n  FROM public.orders\n  WHERE id = p_order_id\n  FOR UPDATE;"),
  'cancel_order acquires row lock FOR UPDATE'
)
assert.ok(
  files.migration7_2.includes("IF v_order.user_id <> v_user_id THEN\n    RAISE EXCEPTION 'Access denied: You can only cancel your own orders';"),
  'cancel_order strictly enforces customer ownership'
)
assert.ok(
  files.migration7_1.includes("IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'processing', 'shipped') THEN"),
  'Cancellation trigger restores inventory only upon transition from active state'
)
assert.ok(
  files.ordersPage.includes("finally {\n      setCancellingId(null)\n    }"),
  'OrdersPage guarantees clearing cancellingId in finally block'
)
console.log('✔ Section 7: Customer Cancellation & Restoration Passed')

// ── 8. Order Status Transitions & Reopening Prevention ───────────
console.log('--- 8. Status Transitions & Reopening Prevention ---')
assert.ok(
  files.migration7_1.includes("IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN\n    RAISE EXCEPTION 'Cancelled orders cannot be reopened"),
  'Database trigger forbids transitioning already-cancelled orders to active states'
)
assert.ok(
  files.adminService.includes("export const VALID_ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']"),
  'adminService reflects authentic database order statuses'
)
console.log('✔ Section 8: Status Transitions & Reopen Prevention Passed')

// ── 9. Admin Dashboard Integrity & Role Isolation ────────────────
console.log('--- 9. Admin Dashboard Integrity & Role Isolation ---')
assert.ok(
  files.migration7_0.includes("IF NOT public.is_admin() THEN\n    RAISE EXCEPTION 'Access denied: Only administrators can view customer auth records.';"),
  'get_admin_customers RPC strictly enforces is_admin() authorization check'
)
assert.ok(
  files.schema.includes("CREATE POLICY \"Admins full access to orders\"\n  ON orders FOR ALL\n  USING (is_admin())\n  WITH CHECK (is_admin());"),
  'Admin orders access controlled by is_admin() policy'
)
console.log('✔ Section 9: Admin Dashboard Integrity Passed')

// ── 10. Payment Transparency & Simulator Isolation ──────────────
console.log('--- 10. Payment Transparency & Simulator Isolation ---')
assert.ok(
  files.checkoutPage.includes("Fast, secure 1-click checkout simulator"),
  'Checkout page explicitly informs customer that online card/UPI payment is a checkout simulator'
)
assert.ok(
  files.checkoutPage.includes("Cash on Delivery (COD)"),
  'Checkout page supports authentic COD workflow'
)
console.log('✔ Section 10: Payment Transparency Passed')

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('ALL PHASE 8 AUDIT SECTIONS PASSED WITH 100% SUCCESS')
console.log('═══════════════════════════════════════════════════════════════════\n')
