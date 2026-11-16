-- ═══════════════════════════════════════════════════════════════════
-- ShopKart Phase 7.2 — Customer Order Cancellation SQL Tests
-- ═══════════════════════════════════════════════════════════════════
-- Run this script in the Supabase Dashboard SQL Editor.
-- Every test suite is enclosed in a transaction block (BEGIN ... ROLLBACK)
-- to ensure zero test artifacts or data mutations persist in the database.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- SUITE 1: ANONYMOUS ACCESS REJECTION
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DO $$
  BEGIN
    RAISE NOTICE '>>> SUITE 1: Anonymous cancel_order Rejection';
  END $$;

  SET LOCAL ROLE anon;

  -- anon cannot execute cancel_order
  DO $$
  BEGIN
    PERFORM public.cancel_order(gen_random_uuid());
    RAISE EXCEPTION 'TEST_ASSERTION_FAILED: anon was able to execute cancel_order';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  PASS: anon correctly denied access to cancel_order (insufficient_privilege)';
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      RAISE EXCEPTION 'TEST FAILED: Unexpected error for anon cancel_order: %', SQLERRM;
  END $$;

ROLLBACK;


-- ─────────────────────────────────────────────────────────────────
-- SUITE 2: SUCCESSFUL CUSTOMER CANCELLATION & INVENTORY RESTORATION
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DO $$
  DECLARE
    v_user_id UUID := gen_random_uuid();
    v_prod_id UUID;
    v_addr_id UUID;
    v_order_id UUID;
    v_res JSONB;
    v_order RECORD;
    v_stock_before INT := 10;
    v_stock_after INT;
  BEGIN
    RAISE NOTICE '>>> SUITE 2: Successful Customer Order Cancellation';

    -- 1. Create isolated customer
    INSERT INTO auth.users (id, aud, role, email)
    VALUES (v_user_id, 'authenticated', 'authenticated', 'cancel_test_' || v_user_id || '@shopkart-test.local');

    INSERT INTO public.addresses (user_id, full_name, phone, line1, city, state, pincode)
    VALUES (v_user_id, 'Customer', '9876543210', '123 Main St', 'Bengaluru', 'Karnataka', '560001')
    RETURNING id INTO v_addr_id;

    -- 2. Create product & stock
    INSERT INTO public.products (name, slug, price, is_active)
    VALUES ('Cancel Test Product', 'cancel-test-prod-' || v_user_id, 1000.00, TRUE)
    RETURNING id INTO v_prod_id;

    INSERT INTO public.inventory (product_id, quantity)
    VALUES (v_prod_id, 8); -- 8 remaining after 2 ordered

    -- 3. Create pending order for customer
    INSERT INTO public.orders (user_id, address_id, status, subtotal, total_amount)
    VALUES (v_user_id, v_addr_id, 'pending', 2000.00, 2000.00)
    RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, total_price)
    VALUES (v_order_id, v_prod_id, 'Cancel Test Product', 1000.00, 2, 2000.00);

    -- 4. Execute cancellation as authenticated customer
    EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_user_id);
    SET LOCAL ROLE authenticated;

    v_res := public.cancel_order(v_order_id);
    IF (v_res->>'success')::BOOLEAN IS NOT TRUE THEN
      RAISE EXCEPTION 'TEST FAILED: cancel_order did not return success: true';
    END IF;

    -- Verify order status is 'cancelled'
    SELECT * INTO v_order FROM public.orders WHERE id = v_order_id;
    IF v_order.status <> 'cancelled' THEN
      RAISE EXCEPTION 'TEST FAILED: Order status is % instead of cancelled', v_order.status;
    END IF;

    -- Verify inventory restored by trigger (8 + 2 = 10)
    SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_id;
    IF v_stock_after <> 10 THEN
      RAISE EXCEPTION 'TEST FAILED: Expected stock 10, got %', v_stock_after;
    END IF;

    RAISE NOTICE '  PASS: Order cancelled and inventory restored from 8 to 10';
  END $$;
ROLLBACK;


-- ─────────────────────────────────────────────────────────────────
-- SUITE 3: OWNERSHIP & STATUS REJECTION CHECKS
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DO $$
  DECLARE
    v_user_a UUID := gen_random_uuid();
    v_user_b UUID := gen_random_uuid();
    v_prod_id UUID;
    v_addr_a UUID;
    v_order_a UUID;
    v_order_shipped UUID;
    v_order_delivered UUID;
    v_order_cancelled UUID;
  BEGIN
    RAISE NOTICE '>>> SUITE 3: Ownership & Status Transition Denials';

    -- Setup Users A and B
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_user_a, 'authenticated', 'authenticated', 'user_a_' || v_user_a || '@test.local'),
      (v_user_b, 'authenticated', 'authenticated', 'user_b_' || v_user_b || '@test.local');

    INSERT INTO public.addresses (user_id, full_name, phone, line1, city, state, pincode)
    VALUES (v_user_a, 'User A', '9876543210', 'Street 1', 'City', 'State', '111111')
    RETURNING id INTO v_addr_a;

    INSERT INTO public.products (name, slug, price, is_active)
    VALUES ('Prod A', 'prod-a-' || v_user_a, 500.00, TRUE)
    RETURNING id INTO v_prod_id;

    INSERT INTO public.inventory (product_id, quantity) VALUES (v_prod_id, 10);

    -- Order belonging to User A
    INSERT INTO public.orders (user_id, address_id, status, subtotal, total_amount)
    VALUES (v_user_a, v_addr_a, 'pending', 500.00, 500.00)
    RETURNING id INTO v_order_a;

    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, total_price)
    VALUES (v_order_a, v_prod_id, 'Prod A', 500.00, 1, 500.00);

    -- Test 3.1: User B attempts to cancel User A's order -> DENIED
    EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_user_b);
    SET LOCAL ROLE authenticated;

    BEGIN
      PERFORM public.cancel_order(v_order_a);
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: User B was able to cancel User A order';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM LIKE '%Access denied%' THEN
        RAISE NOTICE '  PASS (Test 3.1): Another customer order cancellation denied';
      ELSE
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
      END IF;
    END;

    -- Reset back to superuser for setting up other statuses
    RESET ROLE;

    -- Shipped order
    INSERT INTO public.orders (user_id, address_id, status, subtotal, total_amount)
    VALUES (v_user_a, v_addr_a, 'shipped', 500.00, 500.00)
    RETURNING id INTO v_order_shipped;

    -- Delivered order
    INSERT INTO public.orders (user_id, address_id, status, subtotal, total_amount)
    VALUES (v_user_a, v_addr_a, 'delivered', 500.00, 500.00)
    RETURNING id INTO v_order_delivered;

    -- Already cancelled order
    INSERT INTO public.orders (user_id, address_id, status, subtotal, total_amount)
    VALUES (v_user_a, v_addr_a, 'cancelled', 500.00, 500.00)
    RETURNING id INTO v_order_cancelled;

    -- Act as User A
    EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_user_a);
    SET LOCAL ROLE authenticated;

    -- Test 3.2: User A attempts to cancel shipped order -> DENIED
    BEGIN
      PERFORM public.cancel_order(v_order_shipped);
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: Shipped order cancellation succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM LIKE '%shipped%' THEN
        RAISE NOTICE '  PASS (Test 3.2): Shipped order cancellation rejected';
      ELSE
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
      END IF;
    END;

    -- Test 3.3: User A attempts to cancel delivered order -> DENIED
    BEGIN
      PERFORM public.cancel_order(v_order_delivered);
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: Delivered order cancellation succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM LIKE '%delivered%' THEN
        RAISE NOTICE '  PASS (Test 3.3): Delivered order cancellation rejected';
      ELSE
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
      END IF;
    END;

    -- Test 3.4: User A attempts to cancel already-cancelled order -> DENIED
    BEGIN
      PERFORM public.cancel_order(v_order_cancelled);
      RAISE EXCEPTION 'TEST_ASSERTION_FAILED: Repeated cancellation succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_ASSERTION_FAILED%' THEN RAISE; END IF;
      IF SQLERRM LIKE '%already cancelled%' THEN
        RAISE NOTICE '  PASS (Test 3.4): Already-cancelled order cancellation rejected';
      ELSE
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
      END IF;
    END;

  END $$;
ROLLBACK;
