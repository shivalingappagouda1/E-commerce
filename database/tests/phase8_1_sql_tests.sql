-- ═══════════════════════════════════════════════════════════════════
-- ShopKart Phase 8.1: SQL Test Suite for Shipped-Order Inventory Safety
-- Execute this entire file in Supabase SQL Editor.
-- Wrapped in BEGIN ... ROLLBACK to guarantee test data isolation.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_customer1_id UUID := gen_random_uuid();
  v_customer2_id UUID := gen_random_uuid();
  v_addr1_id UUID;
  v_product_id UUID;
  v_coupon_id UUID;
  v_order_pending_id UUID;
  v_order_processing_id UUID;
  v_order_shipped_id UUID;
  v_order_delivered_id UUID;
  v_order_delivered_c1_id UUID;
  v_order_c1_pending2_id UUID;
  v_initial_stock INT;
  v_current_stock INT;
  v_initial_coupon_count INT;
  v_current_coupon_count INT;
  v_trigger_count INT;
  v_tgfoid OID;
  v_tgenabled "char";
  v_fn_oid OID;
  v_error_caught BOOLEAN;
  v_test_slug TEXT;
  v_test_coupon_code TEXT;
BEGIN
  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'STARTING PHASE 8.1 SQL VERIFICATION TEST SUITE';
  RAISE NOTICE '===============================================================';

  -- ── Setup Test Fixtures with Schema Integrity ───────────────────
  -- 1. Create isolated auth users & profiles satisfying foreign key constraints
  INSERT INTO auth.users (id, aud, role, email)
  VALUES (v_customer1_id, 'authenticated', 'authenticated', 'test_cust1_' || v_customer1_id || '@shopkart-test.local')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (v_customer1_id, 'Test Customer One', 'customer')
  ON CONFLICT (id) DO UPDATE SET role = 'customer';

  INSERT INTO auth.users (id, aud, role, email)
  VALUES (v_customer2_id, 'authenticated', 'authenticated', 'test_cust2_' || v_customer2_id || '@shopkart-test.local')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (v_customer2_id, 'Test Customer Two', 'customer')
  ON CONFLICT (id) DO UPDATE SET role = 'customer';

  -- 2. Create customer shipping address
  INSERT INTO public.addresses (user_id, full_name, phone, line1, city, state, pincode)
  VALUES (v_customer1_id, 'Test Customer One', '9876543210', '123 Main St', 'Bengaluru', 'Karnataka', '560001')
  RETURNING id INTO v_addr1_id;

  -- 3. Create isolated product and inventory record
  v_test_slug := 'phase81-test-product-' || substr(gen_random_uuid()::TEXT, 1, 8);
  INSERT INTO public.products (name, slug, price, is_active)
  VALUES ('Phase 8.1 Test Product', v_test_slug, 50.00, true)
  RETURNING id INTO v_product_id;

  INSERT INTO public.inventory (product_id, variant_id, quantity)
  VALUES (v_product_id, NULL, 100);

  SELECT quantity INTO v_initial_stock
  FROM public.inventory
  WHERE product_id = v_product_id AND variant_id IS NULL;

  -- 4. Create isolated coupon
  v_test_coupon_code := 'P81_' || substr(gen_random_uuid()::TEXT, 1, 8);
  INSERT INTO public.coupons (code, discount_type, discount_value, used_count, is_active)
  VALUES (v_test_coupon_code, 'fixed', 10.00, 10, true)
  RETURNING id INTO v_coupon_id;

  SELECT used_count INTO v_initial_coupon_count
  FROM public.coupons
  WHERE id = v_coupon_id;

  -- ── Test 1: Pending Order Cancellation Restores Stock & Coupon ───
  RAISE NOTICE '--- Test 1: Pending Order Cancellation Restores Stock & Coupon ---';
  INSERT INTO public.orders (
    user_id, address_id, coupon_id, status, subtotal, discount_amount, tax_amount, shipping_amount, total_amount
  ) VALUES (
    v_customer1_id, v_addr1_id, v_coupon_id, 'pending', 100.00, 10.00, 0.00, 0.00, 90.00
  ) RETURNING id INTO v_order_pending_id;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, unit_price, quantity, total_price
  ) VALUES (
    v_order_pending_id, v_product_id, NULL, 'Phase 8.1 Test Product', 50.00, 2, 100.00
  );

  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = v_order_pending_id;

  SELECT quantity INTO v_current_stock
  FROM public.inventory
  WHERE product_id = v_product_id AND variant_id IS NULL;

  SELECT used_count INTO v_current_coupon_count
  FROM public.coupons
  WHERE id = v_coupon_id;

  IF v_current_stock <> v_initial_stock + 2 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Stock not restored for pending cancellation. Expected % but got %', v_initial_stock + 2, v_current_stock;
  END IF;

  IF v_current_coupon_count <> v_initial_coupon_count - 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Coupon count not decremented for pending cancellation. Expected % but got %', v_initial_coupon_count - 1, v_current_coupon_count;
  END IF;
  RAISE NOTICE '  PASS: Pending cancellation correctly restored inventory (+2) and decremented coupon usage count (10 -> 9).';

  -- ── Test 2: Processing Order Cancellation Restores Stock & Coupon 
  RAISE NOTICE '--- Test 2: Processing Order Cancellation Restores Stock & Coupon ---';
  v_initial_stock := v_current_stock;
  v_initial_coupon_count := v_current_coupon_count;

  INSERT INTO public.orders (
    user_id, address_id, coupon_id, status, subtotal, discount_amount, tax_amount, shipping_amount, total_amount
  ) VALUES (
    v_customer1_id, v_addr1_id, v_coupon_id, 'processing', 150.00, 10.00, 0.00, 0.00, 140.00
  ) RETURNING id INTO v_order_processing_id;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, unit_price, quantity, total_price
  ) VALUES (
    v_order_processing_id, v_product_id, NULL, 'Phase 8.1 Test Product', 50.00, 3, 150.00
  );

  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = v_order_processing_id;

  SELECT quantity INTO v_current_stock
  FROM public.inventory
  WHERE product_id = v_product_id AND variant_id IS NULL;

  SELECT used_count INTO v_current_coupon_count
  FROM public.coupons
  WHERE id = v_coupon_id;

  IF v_current_stock <> v_initial_stock + 3 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Stock not restored for processing cancellation. Expected % but got %', v_initial_stock + 3, v_current_stock;
  END IF;

  IF v_current_coupon_count <> v_initial_coupon_count - 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Coupon count not decremented for processing cancellation. Expected % but got %', v_initial_coupon_count - 1, v_current_coupon_count;
  END IF;
  RAISE NOTICE '  PASS: Processing cancellation correctly restored inventory (+3) and decremented coupon usage count (9 -> 8).';

  -- ── Test 3: Shipped Order Cancellation DOES NOT Restore Stock or Coupon
  RAISE NOTICE '--- Test 3: Shipped Cancellation DOES NOT Restore Stock or Coupon ---';
  v_initial_stock := v_current_stock;
  v_initial_coupon_count := v_current_coupon_count;

  INSERT INTO public.orders (
    user_id, address_id, coupon_id, status, subtotal, discount_amount, tax_amount, shipping_amount, total_amount
  ) VALUES (
    v_customer1_id, v_addr1_id, v_coupon_id, 'shipped', 200.00, 10.00, 0.00, 0.00, 190.00
  ) RETURNING id INTO v_order_shipped_id;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, unit_price, quantity, total_price
  ) VALUES (
    v_order_shipped_id, v_product_id, NULL, 'Phase 8.1 Test Product', 50.00, 4, 200.00
  );

  -- Administrator transitions shipped order to cancelled
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = v_order_shipped_id;

  SELECT quantity INTO v_current_stock
  FROM public.inventory
  WHERE product_id = v_product_id AND variant_id IS NULL;

  SELECT used_count INTO v_current_coupon_count
  FROM public.coupons
  WHERE id = v_coupon_id;

  IF v_current_stock <> v_initial_stock THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Shipped cancellation restored inventory! Expected % but got %', v_initial_stock, v_current_stock;
  END IF;

  IF v_current_coupon_count <> v_initial_coupon_count THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Shipped cancellation decremented coupon! Expected % but got %', v_initial_coupon_count, v_current_coupon_count;
  END IF;
  RAISE NOTICE '  PASS: Shipped order cancellation safely updated status to cancelled without automatically restocking inventory or decrementing coupon.';

  -- ── Test 4: Delivered Order Lifecycle & Cancellation Behavior ────
  RAISE NOTICE '--- Test 4: Delivered Order Cancellation DOES NOT Restore Stock or Coupon ---';
  v_initial_stock := v_current_stock;
  v_initial_coupon_count := v_current_coupon_count;

  INSERT INTO public.orders (
    user_id, address_id, coupon_id, status, subtotal, discount_amount, tax_amount, shipping_amount, total_amount
  ) VALUES (
    v_customer1_id, v_addr1_id, v_coupon_id, 'delivered', 100.00, 10.00, 0.00, 0.00, 90.00
  ) RETURNING id INTO v_order_delivered_id;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, unit_price, quantity, total_price
  ) VALUES (
    v_order_delivered_id, v_product_id, NULL, 'Phase 8.1 Test Product', 50.00, 2, 100.00
  );

  -- 4a. Direct database UPDATE to cancelled is permitted by schema constraints, but MUST NOT restore inventory/coupons
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = v_order_delivered_id;

  SELECT quantity INTO v_current_stock
  FROM public.inventory
  WHERE product_id = v_product_id AND variant_id IS NULL;

  SELECT used_count INTO v_current_coupon_count
  FROM public.coupons
  WHERE id = v_coupon_id;

  IF v_current_stock <> v_initial_stock THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Delivered cancellation restored inventory! Expected % but got %', v_initial_stock, v_current_stock;
  END IF;

  IF v_current_coupon_count <> v_initial_coupon_count THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Delivered cancellation decremented coupon! Expected % but got %', v_initial_coupon_count, v_current_coupon_count;
  END IF;
  RAISE NOTICE '  PASS: Delivered order cancellation in database permitted by schema but safely bypassed automatic inventory and coupon restoration.';

  -- 4b. Customer cancellation RPC cancel_order strictly rejects delivered orders
  INSERT INTO public.orders (
    user_id, address_id, coupon_id, status, subtotal, discount_amount, tax_amount, shipping_amount, total_amount
  ) VALUES (
    v_customer1_id, v_addr1_id, NULL, 'delivered', 50.00, 0.00, 0.00, 0.00, 50.00
  ) RETURNING id INTO v_order_delivered_c1_id;

  EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_customer1_id);
  SET LOCAL ROLE authenticated;

  v_error_caught := false;
  BEGIN
    PERFORM public.cancel_order(v_order_delivered_c1_id);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE '  PASS: Customer cancel_order on delivered order correctly rejected: %', SQLERRM;
  END;

  RESET ROLE;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Customer cancel_order did not reject delivered order!';
  END IF;

  -- ── Test 5: Repeated Cancellation with SET status = 'cancelled' ──
  RAISE NOTICE '--- Test 5: Repeated Cancellation with SET status = ''cancelled'' ---';
  v_initial_stock := v_current_stock;
  v_initial_coupon_count := v_current_coupon_count;

  -- Explicitly update the already-cancelled order with SET status = 'cancelled'
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = v_order_pending_id;

  SELECT quantity INTO v_current_stock
  FROM public.inventory
  WHERE product_id = v_product_id AND variant_id IS NULL;

  SELECT used_count INTO v_current_coupon_count
  FROM public.coupons
  WHERE id = v_coupon_id;

  IF v_current_stock <> v_initial_stock THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Duplicate inventory restoration detected on repeated cancellation! Expected % but got %', v_initial_stock, v_current_stock;
  END IF;

  IF v_current_coupon_count <> v_initial_coupon_count THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Duplicate coupon decrement detected on repeated cancellation! Expected % but got %', v_initial_coupon_count, v_current_coupon_count;
  END IF;
  RAISE NOTICE '  PASS: Repeated cancellation with SET status = ''cancelled'' safely maintained existing inventory and coupon counts without duplicate restoration.';

  -- ── Test 6: Cancelled Orders Cannot Be Reopened ─────────────────
  RAISE NOTICE '--- Test 6: Cancelled Orders Cannot Be Reopened ---';
  v_error_caught := false;
  BEGIN
    UPDATE public.orders
    SET status = 'pending'
    WHERE id = v_order_pending_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE '  PASS: Reopening cancelled order correctly rejected by trigger: %', SQLERRM;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Reopening cancelled order was not rejected by database trigger';
  END IF;

  -- ── Test 7: Unauthorized Customers Cannot Cancel Another Customer's Order
  RAISE NOTICE '--- Test 7: Unauthorized Customers Cannot Cancel Another Customer Order ---';
  -- Create a new pending order belonging to Customer 1
  INSERT INTO public.orders (
    user_id, address_id, status, subtotal, discount_amount, tax_amount, shipping_amount, total_amount
  ) VALUES (
    v_customer1_id, v_addr1_id, 'pending', 50.00, 0.00, 0.00, 0.00, 50.00
  ) RETURNING id INTO v_order_c1_pending2_id;

  -- Impersonate Customer 2
  EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_customer2_id);
  SET LOCAL ROLE authenticated;

  v_error_caught := false;
  BEGIN
    PERFORM public.cancel_order(v_order_c1_pending2_id);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE '  PASS: Unauthorized customer cancellation correctly rejected: %', SQLERRM;
  END;

  RESET ROLE;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Customer 2 was able to cancel Customer 1 order!';
  END IF;

  -- ── Test 8: Privilege Inspection & Trigger Attachment ───────────
  RAISE NOTICE '--- Test 8: Privilege Inspection and Trigger Attachment Verification ---';
  -- 8a. Verify EXECUTE privilege is revoked from anon and authenticated via effective privilege inspection
  IF has_function_privilege('anon', 'public.restore_inventory_on_cancellation()', 'execute') THEN
    RAISE EXCEPTION 'TEST 8 FAILED: anon role possesses EXECUTE privilege on public.restore_inventory_on_cancellation()';
  END IF;

  IF has_function_privilege('authenticated', 'public.restore_inventory_on_cancellation()', 'execute') THEN
    RAISE EXCEPTION 'TEST 8 FAILED: authenticated role possesses EXECUTE privilege on public.restore_inventory_on_cancellation()';
  END IF;

  -- 8b. Verify PUBLIC pseudo-role has no EXECUTE grant using pg_proc.proacl and aclexplode()
  -- In PostgreSQL, PUBLIC is grantee 0 in aclitem. If proacl is NULL, default function grants apply (granting PUBLIC EXECUTE).
  -- If proacl is populated, no entry with grantee = 0 and privilege_type = 'EXECUTE' may exist.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = 'public.restore_inventory_on_cancellation()'::regprocedure
      AND (
        p.proacl IS NULL
        OR EXISTS (
          SELECT 1
          FROM aclexplode(p.proacl) acl
          WHERE acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
        )
      )
  ) THEN
    RAISE EXCEPTION 'TEST 8 FAILED: PUBLIC pseudo-role possesses EXECUTE grant on public.restore_inventory_on_cancellation()';
  END IF;
  RAISE NOTICE '  PASS: Catalog inspection confirms EXECUTE is revoked from anon, authenticated, and PUBLIC (grantee 0).';

  -- 8c. Strengthen trigger verification on public.orders:
  -- Verify:
  --   1. Exactly one matching trigger exists on public.orders
  --   2. Its function OID matches public.restore_inventory_on_cancellation()
  --   3. The trigger is enabled (tgenabled in ('O', 'A'))
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger tg
  WHERE tg.tgrelid = 'public.orders'::regclass
    AND tg.tgname = 'trg_restore_inventory_on_cancel'
    AND NOT tg.tgisinternal;

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Expected exactly 1 matching trigger on public.orders, found %', v_trigger_count;
  END IF;

  SELECT tg.tgfoid, tg.tgenabled INTO v_tgfoid, v_tgenabled
  FROM pg_trigger tg
  WHERE tg.tgrelid = 'public.orders'::regclass
    AND tg.tgname = 'trg_restore_inventory_on_cancel'
    AND NOT tg.tgisinternal;

  v_fn_oid := 'public.restore_inventory_on_cancellation()'::regprocedure::oid;

  IF v_tgfoid <> v_fn_oid THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Trigger function OID (%) does not match public.restore_inventory_on_cancellation() (%)',
      v_tgfoid, v_fn_oid;
  END IF;

  IF v_tgenabled NOT IN ('O', 'A') THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Trigger trg_restore_inventory_on_cancel is not enabled (tgenabled = %)', v_tgenabled;
  END IF;
  RAISE NOTICE '  PASS: Trigger trg_restore_inventory_on_cancel verified: exactly 1 exists, matches function OID %, and is enabled (%).',
    v_fn_oid, v_tgenabled;

  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'ALL PHASE 8.1 SQL TESTS PASSED SUCCESSFULLY';
  RAISE NOTICE '===============================================================';
END $$;

ROLLBACK;
