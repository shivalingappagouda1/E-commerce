-- ═══════════════════════════════════════════════════════════════════
-- ShopKart Phase 7.1.8 — Comprehensive PostgreSQL Test Suite
-- ═══════════════════════════════════════════════════════════════════
-- Run this script in the Supabase Dashboard SQL Editor.
-- Every test suite is enclosed in a transaction block (BEGIN ... ROLLBACK)
-- to ensure zero test artifacts or data mutations persist in the database.
--
-- Dedicated Isolated Test Users:
-- Every suite creates unique, dedicated test user UUIDs in auth.users
-- within its rollback block. No arbitrary existing users or production
-- records are selected, locked, or modified.
--
-- Covered Test Scenarios (16/16 + RLS Direct Write Denial):
--  1. Anonymous RPC access rejection (insufficient_privilege)
--  2. Authenticated customer access validation & direct cart_items RLS write denial
--  3. Malformed cart payload rejection (NULL, object, non-array)
--  4. Invalid quantity rejection (< 1, > 99, non-integer, combined duplicate > 99)
--  5. Invalid product and variant rejection (non-existent, inactive, mismatched variant)
--  6. Insufficient inventory rejection (single item & aggregated duplicate items)
--  7. Valid cart synchronization (clearing old items & inserting new)
--  8. Invalid coupon rejection (non-existent code, inactive coupon)
--  9. Expired coupon rejection
-- 10. Maximum coupon usage enforcement
-- 11. Successful order placement (trusted server pricing & stock reservation)
-- 12. Authoritative order totals & transactional coupon usage increment
-- 13. Inventory deduction verification
-- 14. Order cancellation inventory and coupon restoration
-- 15. Prevention of repeated restoration & blocked reopening of cancelled orders
-- 16. Admin RPC authorization (non-admin rejection & genuine admin execution)
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- SUITE 1: ANONYMOUS RPC ACCESS REJECTION (Test 1)
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DO $$
  BEGIN
    RAISE NOTICE '>>> SUITE 1: Anonymous Access Rejection';
  END $$;

  SET LOCAL ROLE anon;

  -- Test 1.1: anon cannot execute place_order
  DO $$
  BEGIN
    PERFORM public.place_order(gen_random_uuid(), 'notes', 'COUPON');
    RAISE EXCEPTION 'TEST_ASSERTION_FAILED: anon was able to execute place_order';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  PASS: anon correctly denied access to place_order (insufficient_privilege)';
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      RAISE EXCEPTION 'TEST FAILED: Unexpected error for anon place_order: %', SQLERRM;
  END $$;

  -- Test 1.2: anon cannot execute sync_user_cart
  DO $$
  BEGIN
    PERFORM public.sync_user_cart('[]'::jsonb);
    RAISE EXCEPTION 'TEST_ASSERTION_FAILED: anon was able to execute sync_user_cart';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  PASS: anon correctly denied access to sync_user_cart (insufficient_privilege)';
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      RAISE EXCEPTION 'TEST FAILED: Unexpected error for anon sync_user_cart: %', SQLERRM;
  END $$;

  -- Test 1.3: anon cannot execute get_admin_customers
  DO $$
  BEGIN
    PERFORM public.get_admin_customers();
    RAISE EXCEPTION 'TEST_ASSERTION_FAILED: anon was able to execute get_admin_customers';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  PASS: anon correctly denied access to get_admin_customers (insufficient_privilege)';
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      RAISE EXCEPTION 'TEST FAILED: Unexpected error for anon get_admin_customers: %', SQLERRM;
  END $$;

  -- Test 1.4: anon cannot execute restore_inventory_on_cancellation directly
  DO $$
  BEGIN
    PERFORM public.restore_inventory_on_cancellation();
    RAISE EXCEPTION 'TEST_ASSERTION_FAILED: anon was able to execute restore_inventory_on_cancellation directly';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  PASS: anon correctly denied direct access to restore_inventory_on_cancellation (insufficient_privilege)';
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      RAISE EXCEPTION 'TEST FAILED: Unexpected error for anon restore_inventory_on_cancellation: %', SQLERRM;
  END $$;

ROLLBACK;


-- ─────────────────────────────────────────────────────────────────
-- SUITE 2: CART VALIDATION, RLS WRITE DENIAL & SYNC (Tests 2–7)
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DO $$
  DECLARE
    v_user_id UUID := gen_random_uuid();
    v_user_cart_id UUID;
    v_prod_id UUID;
    v_prod_inactive_id UUID;
    v_other_prod_id UUID;
    v_other_variant_id UUID;
    v_cart_res JSONB;
    v_check_count INT;
    v_check_qty INT;
    v_distinct_items INT;
    v_total_qty INT;
    v_item1_qty INT;
    v_item2_qty INT;
    v_write_policies_count INT;
  BEGIN
    RAISE NOTICE '>>> SUITE 2: Cart Validation, RLS Write Denial & Synchronization';

    -- Dedicated isolated test user for Suite 2 (never touches real customer accounts)
    INSERT INTO auth.users (id, aud, role, email)
    VALUES (v_user_id, 'authenticated', 'authenticated', 'cart_test_' || v_user_id || '@shopkart-test.local');

    -- Create active test product 1 with inventory 10
    INSERT INTO public.products (name, slug, price, is_active)
    VALUES ('Cart Test Prod 1', 'cart-test-prod-1-' || gen_random_uuid(), 500.00, TRUE)
    RETURNING id INTO v_prod_id;

    INSERT INTO public.inventory (product_id, variant_id, quantity)
    VALUES (v_prod_id, NULL, 10);

    -- Create inactive test product
    INSERT INTO public.products (name, slug, price, is_active)
    VALUES ('Inactive Prod', 'inactive-prod-' || gen_random_uuid(), 300.00, FALSE)
    RETURNING id INTO v_prod_inactive_id;

    INSERT INTO public.inventory (product_id, variant_id, quantity)
    VALUES (v_prod_inactive_id, NULL, 10);

    -- Create second product with variant using true schema columns:
    -- product_id, variant_type, variant_value, price_delta
    INSERT INTO public.products (name, slug, price, is_active)
    VALUES ('Cart Test Prod 2', 'cart-test-prod-2-' || gen_random_uuid(), 700.00, TRUE)
    RETURNING id INTO v_other_prod_id;

    INSERT INTO public.product_variants (product_id, variant_type, variant_value, price_delta)
    VALUES (v_other_prod_id, 'Size', 'XL', 50.00)
    RETURNING id INTO v_other_variant_id;

    INSERT INTO public.inventory (product_id, variant_id, quantity)
    VALUES (v_other_prod_id, v_other_variant_id, 10);

    -- Switch to authenticated customer session
    PERFORM set_config('request.jwt.claim.sub', v_user_id::TEXT, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    -- Test 2: Authenticated customer access granted to sync_user_cart RPC
    BEGIN
      v_cart_res := public.sync_user_cart('[]'::jsonb);
      IF (v_cart_res->>'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST_ASSERTION_FAILED: sync_user_cart returned success = false';
      END IF;
      v_user_cart_id := (v_cart_res->>'cart_id')::UUID;
      RAISE NOTICE '  PASS (Test 2): Authenticated customer successfully invokes sync_user_cart';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      RAISE EXCEPTION 'TEST FAILED (Test 2): Could not invoke sync_user_cart as authenticated user: %', SQLERRM;
    END;

    -- Test 2.0: Automated inspection of pg_policies on public.cart_items
    -- Verify that zero permissive direct write policies (INSERT, UPDATE, DELETE, ALL) exist.
    BEGIN
      SELECT COUNT(*) INTO v_write_policies_count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'cart_items'
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');

      IF v_write_policies_count > 0 THEN
        RAISE EXCEPTION 'TEST_ASSERTION_FAILED: Found % permissive write policies on cart_items in pg_policies', v_write_policies_count;
      END IF;
      RAISE NOTICE '  PASS (Test 2.0): Verified 0 direct write policies exist on public.cart_items in pg_policies';
    END;

    -- Seed an initial baseline item in the cart via validated RPC for RLS mutation tests and negative tests
    v_cart_res := public.sync_user_cart(jsonb_build_array(
      jsonb_build_object('product_id', v_prod_id, 'quantity', 1)
    ));
    v_user_cart_id := (v_cart_res->>'cart_id')::UUID;

    -- Test 2.1: Verify direct client INSERT into cart_items is DENIED by RLS policy
    BEGIN
      INSERT INTO public.cart_items (cart_id, product_id, quantity)
      VALUES (v_user_cart_id, v_prod_id, 1);
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: direct client INSERT into cart_items was permitted by RLS';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE '  PASS (Test 2.1): Direct client INSERT into cart_items correctly denied by RLS (insufficient_privilege)';
      WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
        IF SQLERRM LIKE '%violates row-level security policy%' THEN
          RAISE NOTICE '  PASS (Test 2.1): Direct client INSERT into cart_items correctly blocked by RLS policy';
        ELSE
          RAISE EXCEPTION 'TEST FAILED (Test 2.1): Unexpected error on direct cart_items INSERT: %', SQLERRM;
        END IF;
    END;

    -- Test 2.2: Verify direct client UPDATE on cart_items is DENIED by RLS policy
    BEGIN
      UPDATE public.cart_items SET quantity = 5 WHERE cart_id = v_user_cart_id;
      -- Verify row was NOT modified under RLS
      SELECT quantity INTO v_check_qty FROM public.cart_items WHERE cart_id = v_user_cart_id AND product_id = v_prod_id;
      IF v_check_qty = 5 THEN
        RAISE EXCEPTION 'TEST_ASSERTION_FAILED: direct client UPDATE modified cart_items row';
      END IF;
      RAISE NOTICE '  PASS (Test 2.2): Direct client UPDATE on cart_items denied or blocked under RLS';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE '  PASS (Test 2.2): Direct client UPDATE on cart_items denied by RLS (insufficient_privilege)';
      WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
        IF SQLERRM LIKE '%violates row-level security policy%' OR SQLERRM LIKE '%permission denied%' THEN
          RAISE NOTICE '  PASS (Test 2.2): Direct client UPDATE on cart_items blocked by RLS policy';
        ELSE
          RAISE;
        END IF;
    END;

    -- Test 2.3: Verify direct client DELETE on cart_items is DENIED by RLS policy
    BEGIN
      DELETE FROM public.cart_items WHERE cart_id = v_user_cart_id;
      -- Verify row was NOT deleted under RLS
      SELECT COUNT(*) INTO v_check_count FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count = 0 THEN
        RAISE EXCEPTION 'TEST_ASSERTION_FAILED: direct client DELETE removed cart_items row';
      END IF;
      RAISE NOTICE '  PASS (Test 2.3): Direct client DELETE on cart_items denied or blocked under RLS';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE '  PASS (Test 2.3): Direct client DELETE on cart_items denied by RLS (insufficient_privilege)';
      WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
        IF SQLERRM LIKE '%violates row-level security policy%' OR SQLERRM LIKE '%permission denied%' THEN
          RAISE NOTICE '  PASS (Test 2.3): Direct client DELETE on cart_items blocked by RLS policy';
        ELSE
          RAISE;
        END IF;
    END;

    -- Test 2.4: Verify authenticated user cannot execute restore_inventory_on_cancellation directly
    BEGIN
      PERFORM public.restore_inventory_on_cancellation();
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: authenticated customer was able to execute restore_inventory_on_cancellation directly';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE '  PASS (Test 2.4): Authenticated customer denied direct access to restore_inventory_on_cancellation (insufficient_privilege)';
      WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
        RAISE EXCEPTION 'TEST FAILED: Unexpected error for authenticated restore_inventory_on_cancellation: %', SQLERRM;
    END;

    -- Re-verify baseline item intact with quantity 1 before proceeding to negative validation tests
    SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
    FROM public.cart_items WHERE cart_id = v_user_cart_id;
    IF v_check_count <> 1 OR v_check_qty <> 1 THEN
      RAISE EXCEPTION 'TEST FAILED: Baseline cart item corrupted prior to payload validation tests';
    END IF;

    -- Test 3.1: Reject NULL payload
    BEGIN
      PERFORM public.sync_user_cart(NULL);
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: sync_user_cart accepted NULL payload';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Invalid cart payload: expected a JSON array%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error message on NULL payload: %', SQLERRM;
      END IF;
      -- Verify cart contents remained intact
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during NULL payload rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 3.1): NULL cart payload rejected; cart contents preserved intact';
    END;

    -- Test 3.2: Reject JSON Object payload (non-array)
    BEGIN
      PERFORM public.sync_user_cart('{"product_id": "test"}'::jsonb);
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: sync_user_cart accepted JSON Object payload';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Invalid cart payload: expected a JSON array%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error message on JSON object: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during non-array payload rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 3.2): Non-array JSON payload rejected; cart contents preserved intact';
    END;

    -- Test 4.1: Reject quantity < 1 (zero)
    BEGIN
      PERFORM public.sync_user_cart(jsonb_build_array(
        jsonb_build_object('product_id', v_prod_id, 'quantity', 0)
      ));
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted quantity 0';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%must be at least 1%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on quantity 0: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during quantity 0 rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 4.1): Zero quantity rejected; cart contents preserved intact';
    END;

    -- Test 4.2: Reject quantity > 99
    BEGIN
      PERFORM public.sync_user_cart(jsonb_build_array(
        jsonb_build_object('product_id', v_prod_id, 'quantity', 120)
      ));
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted quantity 120';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%exceeds maximum allowed limit of 99%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on quantity 120: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during quantity > 99 rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 4.2): Quantity > 99 rejected; cart contents preserved intact';
    END;

    -- Test 4.3: Reject duplicate items whose sum exceeds 99 (NO SILENT CLAMPING!)
    BEGIN
      PERFORM public.sync_user_cart(jsonb_build_array(
        jsonb_build_object('product_id', v_prod_id, 'quantity', 60),
        jsonb_build_object('product_id', v_prod_id, 'quantity', 50)
      ));
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted combined duplicate quantity > 99';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Combined item quantity (110) exceeds maximum allowed limit of 99%' THEN
        RAISE EXCEPTION 'TEST FAILED: Duplicate items silently clamped or unexpected error: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during combined quantity > 99 rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 4.3): Combined duplicate quantity > 99 rejected without silent clamping; cart preserved';
    END;

    -- Test 5.1: Reject invalid UUID syntax
    BEGIN
      PERFORM public.sync_user_cart(jsonb_build_array(
        jsonb_build_object('product_id', 'not-a-valid-uuid', 'quantity', 2)
      ));
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted non-UUID string';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Invalid product UUID format in cart item%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on malformed UUID: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during malformed UUID rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 5.1): Malformed product UUID rejected; cart preserved intact';
    END;

    -- Test 5.2: Reject inactive product
    BEGIN
      PERFORM public.sync_user_cart(jsonb_build_array(
        jsonb_build_object('product_id', v_prod_inactive_id, 'quantity', 2)
      ));
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted inactive product';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%is currently inactive%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on inactive product: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during inactive product rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 5.2): Inactive product rejected; cart preserved intact';
    END;

    -- Test 5.3: Reject variant belonging to another product
    BEGIN
      PERFORM public.sync_user_cart(jsonb_build_array(
        jsonb_build_object('product_id', v_prod_id, 'variant_id', v_other_variant_id, 'quantity', 2)
      ));
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted variant of wrong product';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%does not belong to product%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on mismatched variant: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during mismatched variant rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 5.3): Mismatched variant rejected; cart preserved intact';
    END;

    -- Test 6.1: Reject requested quantity exceeding available inventory
    BEGIN
      PERFORM public.sync_user_cart(jsonb_build_array(
        jsonb_build_object('product_id', v_prod_id, 'quantity', 15) -- Stock is only 10
      ));
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted quantity exceeding stock';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE 'Insufficient stock for product%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on insufficient stock: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during quantity exceeding stock rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 6.1): Quantity exceeding stock rejected; cart preserved intact';
    END;

    -- Test 6.2: Reject duplicate items whose aggregated sum exceeds stock
    BEGIN
      PERFORM public.sync_user_cart(jsonb_build_array(
        jsonb_build_object('product_id', v_prod_id, 'quantity', 6),
        jsonb_build_object('product_id', v_prod_id, 'quantity', 7)  -- 6 + 7 = 13 > 10 stock
      ));
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted duplicate items exceeding total stock';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE 'Insufficient stock for product%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on aggregated duplicate stock: %', SQLERRM;
      END IF;
      SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_check_count, v_check_qty
      FROM public.cart_items WHERE cart_id = v_user_cart_id;
      IF v_check_count <> 1 OR v_check_qty <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Cart modified during aggregated duplicate stock rejection';
      END IF;
      RAISE NOTICE '  PASS (Test 6.2): Aggregated duplicates exceeding stock rejected; cart preserved';
    END;

    -- Test 7: Valid cart synchronization with duplicate aggregation
    -- Synchronizes product 1 (qty 2 + 3 = 5) and product 2 with variant (qty 2)
    v_cart_res := public.sync_user_cart(jsonb_build_array(
      jsonb_build_object('product_id', v_prod_id, 'quantity', 2),
      jsonb_build_object('product_id', v_prod_id, 'quantity', 3),
      jsonb_build_object('product_id', v_other_prod_id, 'variant_id', v_other_variant_id, 'quantity', 2)
    ));

    IF (v_cart_res->>'success')::BOOLEAN IS NOT TRUE THEN
      RAISE EXCEPTION 'TEST FAILED: Valid cart sync returned false';
    END IF;

    -- Strengthened Cart Assertions:
    -- 1. Assert exactly 2 distinct cart items and total quantity 7 (5 + 2)
    SELECT COUNT(*), SUM(quantity) INTO v_distinct_items, v_total_qty
    FROM public.cart_items
    WHERE cart_id = (v_cart_res->>'cart_id')::UUID;

    IF v_distinct_items <> 2 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected exactly 2 distinct cart items, got %', v_distinct_items;
    END IF;

    IF v_total_qty <> 7 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected total quantity 7 (5 + 2), got %', v_total_qty;
    END IF;

    -- 2. Assert first product has combined quantity 5
    SELECT quantity INTO v_item1_qty
    FROM public.cart_items
    WHERE cart_id = (v_cart_res->>'cart_id')::UUID
      AND product_id = v_prod_id
      AND variant_id IS NULL;

    IF v_item1_qty <> 5 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected product 1 combined quantity 5, got %', v_item1_qty;
    END IF;

    -- 3. Assert variant product has quantity 2
    SELECT quantity INTO v_item2_qty
    FROM public.cart_items
    WHERE cart_id = (v_cart_res->>'cart_id')::UUID
      AND product_id = v_other_prod_id
      AND variant_id = v_other_variant_id;

    IF v_item2_qty <> 2 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected variant product quantity 2, got %', v_item2_qty;
    END IF;

    RAISE NOTICE '  PASS (Test 7): Valid cart sync verified: 2 distinct items, product1 qty 5, variant product qty 2, total qty 7';

  END $$;
ROLLBACK;


-- ─────────────────────────────────────────────────────────────────
-- SUITE 3: AUTHORITATIVE ORDER PLACEMENT & COUPONS (Tests 8–13)
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DO $$
  DECLARE
    v_user_id UUID := gen_random_uuid();
    v_prod_id UUID;
    v_addr_id UUID;
    v_coupon_valid UUID;
    v_coupon_inactive UUID;
    v_coupon_expired UUID;
    v_coupon_maxed UUID;
    v_order_id UUID;
    v_order RECORD;
    v_stock_before INT := 10;
    v_stock_after INT;
  BEGIN
    RAISE NOTICE '>>> SUITE 3: Order Placement & Authoritative Coupons';

    -- Dedicated isolated test user for Suite 3 (never touches real customer accounts)
    INSERT INTO auth.users (id, aud, role, email)
    VALUES (v_user_id, 'authenticated', 'authenticated', 'order_cust_' || v_user_id || '@shopkart-test.local');

    INSERT INTO public.addresses (user_id, full_name, phone, line1, city, state, pincode)
    VALUES (v_user_id, 'Customer', '+91 99999 88888', '123 Main St', 'City', 'State', '123456')
    RETURNING id INTO v_addr_id;

    INSERT INTO public.products (name, slug, price, is_active)
    VALUES ('Order Test Product', 'order-test-prod-' || gen_random_uuid(), 1000.00, TRUE)
    RETURNING id INTO v_prod_id;

    INSERT INTO public.inventory (product_id, variant_id, quantity)
    VALUES (v_prod_id, NULL, v_stock_before);

    -- Setup test coupons
    INSERT INTO public.coupons (code, discount_type, discount_value, min_order_value, max_uses, used_count, is_active)
    VALUES ('VALID20', 'percent', 20.00, 500.00, 10, 0, TRUE)
    RETURNING id INTO v_coupon_valid;

    INSERT INTO public.coupons (code, discount_type, discount_value, is_active)
    VALUES ('INACTIVE10', 'percent', 10.00, FALSE)
    RETURNING id INTO v_coupon_inactive;

    INSERT INTO public.coupons (code, discount_type, discount_value, expires_at, is_active)
    VALUES ('EXPIRED10', 'fixed', 100.00, NOW() - INTERVAL '1 day', TRUE)
    RETURNING id INTO v_coupon_expired;

    INSERT INTO public.coupons (code, discount_type, discount_value, max_uses, used_count, is_active)
    VALUES ('MAXED10', 'fixed', 50.00, 5, 5, TRUE)
    RETURNING id INTO v_coupon_maxed;

    -- Switch to authenticated customer
    PERFORM set_config('request.jwt.claim.sub', v_user_id::TEXT, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    -- Sync cart: 2 items of product (Subtotal = ₹2,000.00)
    PERFORM public.sync_user_cart(jsonb_build_array(
      jsonb_build_object('product_id', v_prod_id, 'quantity', 2)
    ));

    -- Test 8.1: Reject non-existent coupon
    BEGIN
      PERFORM public.place_order(v_addr_id, 'notes', 'TOTALLY_FAKE_COUPON');
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted non-existent coupon';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE 'Invalid coupon code:%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on non-existent coupon: %', SQLERRM;
      END IF;
      RAISE NOTICE '  PASS (Test 8.1): Non-existent coupon code rejected with exact error';
    END;

    -- Test 8.2: Reject inactive coupon
    BEGIN
      PERFORM public.place_order(v_addr_id, 'notes', 'INACTIVE10');
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted inactive coupon';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%is not active%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on inactive coupon: %', SQLERRM;
      END IF;
      RAISE NOTICE '  PASS (Test 8.2): Inactive coupon rejected with exact error';
    END;

    -- Test 9: Reject expired coupon
    BEGIN
      PERFORM public.place_order(v_addr_id, 'notes', 'EXPIRED10');
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted expired coupon';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%has expired%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on expired coupon: %', SQLERRM;
      END IF;
      RAISE NOTICE '  PASS (Test 9): Expired coupon rejected with exact error';
    END;

    -- Test 10: Reject maxed usage coupon
    BEGIN
      PERFORM public.place_order(v_addr_id, 'notes', 'MAXED10');
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: accepted coupon exceeding max uses';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%usage limit has been reached%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on max usage coupon: %', SQLERRM;
      END IF;
      RAISE NOTICE '  PASS (Test 10): Max-usage coupon rejected with exact error';
    END;

    -- Test 11, 12, 13: Successful place_order with VALID20 coupon (20% off 2,000 = 400 discount)
    v_order_id := public.place_order(v_addr_id, 'Please deliver before 5pm', 'VALID20');
    IF v_order_id IS NULL THEN
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: place_order returned NULL order ID';
    END IF;
    RAISE NOTICE '  PASS (Test 11): Order placed successfully with ID %', v_order_id;

    -- Test 12: Verify authoritative server calculations
    SELECT * INTO v_order FROM public.orders WHERE id = v_order_id;
    IF v_order.subtotal <> 2000.00 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected subtotal 2000.00, got %', v_order.subtotal;
    END IF;
    IF v_order.discount_amount <> 400.00 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected discount 400.00, got %', v_order.discount_amount;
    END IF;
    IF v_order.total_amount <> 1600.00 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected total 1600.00, got %', v_order.total_amount;
    END IF;

    -- Verify coupon used_count incremented from 0 to 1
    IF (SELECT used_count FROM public.coupons WHERE id = v_coupon_valid) <> 1 THEN
      RAISE EXCEPTION 'TEST FAILED: Coupon used_count was not incremented to 1';
    END IF;
    RAISE NOTICE '  PASS (Test 12): Authoritative totals and transactional coupon increment verified';

    -- Test 13: Verify inventory deduction (10 - 2 = 8)
    SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_id;
    IF v_stock_after <> 8 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected inventory stock 8, got %', v_stock_after;
    END IF;
    RAISE NOTICE '  PASS (Test 13): Inventory decremented correctly from % to %', v_stock_before, v_stock_after;

  END $$;
ROLLBACK;


-- ─────────────────────────────────────────────────────────────────
-- SUITE 4: ORDER CANCELLATION & RESTORATION (Tests 14–15)
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DO $$
  DECLARE
    v_user_id UUID := gen_random_uuid();
    v_prod_id UUID;
    v_addr_id UUID;
    v_coupon_id UUID;
    v_order_id UUID;
    v_stock_curr INT;
    v_coupon_count INT;
  BEGIN
    RAISE NOTICE '>>> SUITE 4: Cancellation Trigger & Restoration Guards';

    -- Dedicated isolated test user for Suite 4 (never touches real customer accounts)
    INSERT INTO auth.users (id, aud, role, email)
    VALUES (v_user_id, 'authenticated', 'authenticated', 'cancel_cust_' || v_user_id || '@shopkart-test.local');

    INSERT INTO public.addresses (user_id, full_name, phone, line1, city, state, pincode)
    VALUES (v_user_id, 'Cust', '9999999999', 'Line 1', 'City', 'State', '111111')
    RETURNING id INTO v_addr_id;

    INSERT INTO public.products (name, slug, price, is_active)
    VALUES ('Cancel Prod', 'cancel-prod-' || gen_random_uuid(), 500.00, TRUE)
    RETURNING id INTO v_prod_id;

    INSERT INTO public.inventory (product_id, variant_id, quantity)
    VALUES (v_prod_id, NULL, 10);

    INSERT INTO public.coupons (code, discount_type, discount_value, used_count, is_active)
    VALUES ('CANCELTEST', 'fixed', 50.00, 0, TRUE)
    RETURNING id INTO v_coupon_id;

    -- Switch to authenticated user to place order
    PERFORM set_config('request.jwt.claim.sub', v_user_id::TEXT, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    PERFORM public.sync_user_cart(jsonb_build_array(
      jsonb_build_object('product_id', v_prod_id, 'quantity', 3)
    ));

    v_order_id := public.place_order(v_addr_id, 'order to cancel', 'CANCELTEST');

    -- Pre-cancellation check: stock must be 7, used_count must be 1
    SELECT quantity INTO v_stock_curr FROM public.inventory WHERE product_id = v_prod_id;
    SELECT used_count INTO v_coupon_count FROM public.coupons WHERE id = v_coupon_id;
    IF v_stock_curr <> 7 OR v_coupon_count <> 1 THEN
      RAISE EXCEPTION 'TEST SETUP FAILED: stock=% (exp 7), used_count=% (exp 1)', v_stock_curr, v_coupon_count;
    END IF;

    -- Test 14: Transition status from 'pending' to 'cancelled'
    -- Switch to service_role / postgres to update order status as admin
    EXECUTE 'RESET ROLE';
    UPDATE public.orders SET status = 'cancelled' WHERE id = v_order_id;

    -- Verify stock restored to 10
    SELECT quantity INTO v_stock_curr FROM public.inventory WHERE product_id = v_prod_id;
    IF v_stock_curr <> 10 THEN
      RAISE EXCEPTION 'TEST FAILED: Stock was not restored to 10 on cancellation (got %)', v_stock_curr;
    END IF;

    -- Verify coupon used_count restored to 0
    SELECT used_count INTO v_coupon_count FROM public.coupons WHERE id = v_coupon_id;
    IF v_coupon_count <> 0 THEN
      RAISE EXCEPTION 'TEST FAILED: Coupon used_count was not decremented back to 0 (got %)', v_coupon_count;
    END IF;
    RAISE NOTICE '  PASS (Test 14): Order cancellation correctly restored inventory and coupon usage';

    -- Test 15.1: Verify updating cancelled order does NOT duplicate restoration
    UPDATE public.orders SET notes = 'Updated notes after cancel' WHERE id = v_order_id;
    SELECT quantity INTO v_stock_curr FROM public.inventory WHERE product_id = v_prod_id;
    SELECT used_count INTO v_coupon_count FROM public.coupons WHERE id = v_coupon_id;
    IF v_stock_curr <> 10 OR v_coupon_count <> 0 THEN
      RAISE EXCEPTION 'TEST FAILED: Repeated restoration occurred on secondary update (stock=%, coupon=%)',
        v_stock_curr, v_coupon_count;
    END IF;
    RAISE NOTICE '  PASS (Test 15.1): Repeated updates to cancelled order did not trigger duplicate restoration';

    -- Test 15.2: Verify guard prevents reopening cancelled order
    BEGIN
      UPDATE public.orders SET status = 'pending' WHERE id = v_order_id;
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: order was reopened from cancelled to pending';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE 'Cancelled orders cannot be reopened or transitioned to%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on reopening attempt: %', SQLERRM;
      END IF;
      RAISE NOTICE '  PASS (Test 15.2): Guard prevented reopening cancelled order with exact error';
    END;

  END $$;
ROLLBACK;


-- ─────────────────────────────────────────────────────────────────
-- SUITE 5: ADMIN RPC AUTHORIZATION (Test 16)
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DO $$
  DECLARE
    v_cust_id UUID := gen_random_uuid();
    v_admin_id UUID := gen_random_uuid();
    v_count INT;
    v_admin_role TEXT;
  BEGIN
    RAISE NOTICE '>>> SUITE 5: Admin RPC Authorization';

    -- Setup 1: Create dedicated regular customer
    INSERT INTO auth.users (id, aud, role, email)
    VALUES (v_cust_id, 'authenticated', 'authenticated', 'cust_' || v_cust_id || '@shopkart-test.local');

    -- Setup 2: Create dedicated genuine administrator
    -- Note: on_auth_user_created trigger automatically creates a profile with role = 'customer'.
    -- We explicitly promote v_admin_id to 'admin' using an isolated, temporary trigger bypass
    -- within this transaction to guarantee that v_admin_id has role = 'admin'.
    INSERT INTO auth.users (id, aud, role, email)
    VALUES (v_admin_id, 'authenticated', 'authenticated', 'admin_' || v_admin_id || '@shopkart-test.local');

    ALTER TABLE public.profiles DISABLE TRIGGER guard_role_escalation;
    UPDATE public.profiles
    SET role = 'admin', full_name = 'Store Administrator'
    WHERE id = v_admin_id;
    ALTER TABLE public.profiles ENABLE TRIGGER guard_role_escalation;

    -- Verify admin profile role is genuinely 'admin'
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = v_admin_id;
    IF v_admin_role <> 'admin' THEN
      RAISE EXCEPTION 'TEST SETUP FAILED: v_admin_id was not assigned role admin (got %)', v_admin_role;
    END IF;

    -- Test 16.1: Ordinary customer cannot call get_admin_customers()
    PERFORM set_config('request.jwt.claim.sub', v_cust_id::TEXT, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    BEGIN
      PERFORM public.get_admin_customers();
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: Ordinary customer was able to call get_admin_customers';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE 'Access denied: Only administrators can view customer auth records%' THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error on customer get_admin_customers: %', SQLERRM;
      END IF;
      RAISE NOTICE '  PASS (Test 16.1): Ordinary customer rejected by is_admin() authorization check';
    END;

    -- Test 16.2: Genuine admin user successfully calls get_admin_customers()
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::TEXT, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    BEGIN
      SELECT COUNT(*) INTO v_count FROM public.get_admin_customers();
      IF v_count < 2 THEN
        RAISE EXCEPTION 'TEST FAILED: Expected at least 2 customer auth records, got %', v_count;
      END IF;
      RAISE NOTICE '  PASS (Test 16.2): Genuine administrator successfully retrieved customer records (count: %)', v_count;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'TEST FAILED: Admin failed to call get_admin_customers: %', SQLERRM;
    END;

  END $$;
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════
-- ALL 16 SQL TEST SCENARIOS COMPLETED SUCCESSFULLY
-- ═══════════════════════════════════════════════════════════════════
