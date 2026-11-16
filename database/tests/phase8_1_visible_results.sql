-- ═══════════════════════════════════════════════════════════════════
-- ShopKart Phase 8.1: Visible Results SQL Test Verification Script
-- File: database/tests/phase8_1_visible_results.sql
--
-- Executes all eight Phase 8.1 scenarios against the actual PostgreSQL
-- database and renders the results as a visible table:
--   - test_number (INT)
--   - scenario (TEXT)
--   - result (TEXT: PASS / FAIL: <reason>)
--
-- Transaction Architecture & Fixture Rollback Proof:
-- 1. In PostgreSQL, inserting into a temporary table inside an explicit
--    transaction (BEGIN ... ROLLBACK) causes the inserted rows to be rolled
--    back along with the transaction.
-- 2. To ensure test fixtures are 100% rolled back while test results survive:
--    a. A session temporary table is created (CREATE TEMP TABLE IF NOT EXISTS)
--       and truncated (TRUNCATE TABLE) to ensure a clean state.
--    b. An anonymous code block (DO $$ ... $$) executes. Inside it, all test
--       fixtures (auth.users, profiles, addresses, products, inventory,
--       coupons, orders) and scenario assertions execute within an explicit
--       PL/pgSQL subtransaction block (BEGIN ... EXCEPTION).
--    c. Each scenario records its PASS/FAIL status into local PL/pgSQL variables
--       (v_res1 .. v_res8) residing in PL/pgSQL interpreter memory.
--    d. At the conclusion of the test scenarios, a deliberate exception
--       (RAISE EXCEPTION 'PHASE8_1_ROLLBACK_FIXTURES') is raised.
--    e. The enclosing EXCEPTION handler catches this exception. Under PostgreSQL
--       PL/pgSQL semantics (PostgreSQL doc § 43.6.8), trapping an error rolls
--       back the subtransaction savepoint, completely undoing all persistent
--       database modifications (all fixture inserts and status updates).
--    f. Local PL/pgSQL variables are NOT database state and survive this rollback.
--    g. After the subtransaction block has aborted and rolled back, the DO block
--       inserts the 8 result records from the variables into the session
--       temporary table. This INSERT occurs outside the aborted subtransaction
--       and is committed when the DO block completes.
-- 3. The final statement of the script is SELECT * FROM phase8_1_visible_test_results,
--    ensuring Supabase SQL Editor renders the complete 8-row grid in the Results tab.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Create Session Temporary Results Table ─────────────────────
CREATE TEMP TABLE IF NOT EXISTS phase8_1_visible_test_results (
  test_number INT,
  scenario TEXT,
  result TEXT
);

-- ── 2. Truncate Temporary Results Table ───────────────────────────
TRUNCATE TABLE phase8_1_visible_test_results;

-- ── 3. Execute Scenarios in Isolated Subtransaction & Record Results
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
  v_rejection_err TEXT;
  v_test_slug TEXT;
  v_test_coupon_code TEXT;
  v_setup_error TEXT;
  v_failed_count INT := 0;

  -- Result variables preserved in PL/pgSQL memory across subtransaction rollback
  v_res1 TEXT := 'FAIL: Scenario 1 not executed';
  v_res2 TEXT := 'FAIL: Scenario 2 not executed';
  v_res3 TEXT := 'FAIL: Scenario 3 not executed';
  v_res4 TEXT := 'FAIL: Scenario 4 not executed';
  v_res5 TEXT := 'FAIL: Scenario 5 not executed';
  v_res6 TEXT := 'FAIL: Scenario 6 not executed';
  v_res7 TEXT := 'FAIL: Scenario 7 not executed';
  v_res8 TEXT := 'FAIL: Scenario 8 not executed';

  v_scen1 TEXT := 'Pending order cancellation restores inventory (+2) and decrements coupon usage count (10 -> 9)';
  v_scen2 TEXT := 'Processing order cancellation restores inventory (+3) and decrements coupon usage count (9 -> 8)';
  v_scen3 TEXT := 'Shipped order cancellation safely bypasses automatic inventory restocking and coupon decrement';
  v_scen4 TEXT := 'Delivered cancellation: DB update permits without stock return; customer cancel_order strictly rejected';
  v_scen5 TEXT := 'Repeated cancellation with SET status = ''cancelled'' safely prevents duplicate stock or coupon restoration';
  v_scen6 TEXT := 'Cancelled orders cannot be reopened or transitioned back to active status (trigger guard)';
  v_scen7 TEXT := 'Unauthorized customers cannot cancel another customer order (cancel_order ownership guard)';
  v_scen8 TEXT := 'Privilege inspection (anon, authenticated, PUBLIC grantee 0 revoked) and trigger catalog verification';
BEGIN
  -- ── Subtransaction Block for Fixtures and Execution ──────────────
  -- All database modifications inside this block are rolled back via savepoint
  BEGIN
    -- Setup Test Fixtures with Schema Integrity
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

    INSERT INTO public.addresses (user_id, full_name, phone, line1, city, state, pincode)
    VALUES (v_customer1_id, 'Test Customer One', '9876543210', '123 Main St', 'Bengaluru', 'Karnataka', '560001')
    RETURNING id INTO v_addr1_id;

    v_test_slug := 'phase81-vis-product-' || substr(gen_random_uuid()::TEXT, 1, 8);
    INSERT INTO public.products (name, slug, price, is_active)
    VALUES ('Phase 8.1 Visible Test Product', v_test_slug, 50.00, true)
    RETURNING id INTO v_product_id;

    INSERT INTO public.inventory (product_id, variant_id, quantity)
    VALUES (v_product_id, NULL, 100);

    SELECT quantity INTO v_initial_stock
    FROM public.inventory
    WHERE product_id = v_product_id AND variant_id IS NULL;

    v_test_coupon_code := 'P81V_' || substr(gen_random_uuid()::TEXT, 1, 8);
    INSERT INTO public.coupons (code, discount_type, discount_value, used_count, is_active)
    VALUES (v_test_coupon_code, 'fixed', 10.00, 10, true)
    RETURNING id INTO v_coupon_id;

    SELECT used_count INTO v_initial_coupon_count
    FROM public.coupons
    WHERE id = v_coupon_id;

    -- ── Scenario 1: Pending Order Cancellation Restores Stock & Coupon
    BEGIN
      INSERT INTO public.orders (
        user_id, address_id, coupon_id, status, subtotal, discount_amount, tax_amount, shipping_amount, total_amount
      ) VALUES (
        v_customer1_id, v_addr1_id, v_coupon_id, 'pending', 100.00, 10.00, 0.00, 0.00, 90.00
      ) RETURNING id INTO v_order_pending_id;

      INSERT INTO public.order_items (
        order_id, product_id, variant_id, product_name, unit_price, quantity, total_price
      ) VALUES (
        v_order_pending_id, v_product_id, NULL, 'Phase 8.1 Visible Test Product', 50.00, 2, 100.00
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
        RAISE EXCEPTION 'Stock not restored for pending cancellation. Expected % but got %', v_initial_stock + 2, v_current_stock;
      END IF;

      IF v_current_coupon_count <> v_initial_coupon_count - 1 THEN
        RAISE EXCEPTION 'Coupon count not decremented for pending cancellation. Expected % but got %', v_initial_coupon_count - 1, v_current_coupon_count;
      END IF;

      v_res1 := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      v_res1 := 'FAIL: ' || SQLERRM;
    END;

    -- ── Scenario 2: Processing Order Cancellation Restores Stock & Coupon
    BEGIN
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
        v_order_processing_id, v_product_id, NULL, 'Phase 8.1 Visible Test Product', 50.00, 3, 150.00
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
        RAISE EXCEPTION 'Stock not restored for processing cancellation. Expected % but got %', v_initial_stock + 3, v_current_stock;
      END IF;

      IF v_current_coupon_count <> v_initial_coupon_count - 1 THEN
        RAISE EXCEPTION 'Coupon count not decremented for processing cancellation. Expected % but got %', v_initial_coupon_count - 1, v_current_coupon_count;
      END IF;

      v_res2 := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      v_res2 := 'FAIL: ' || SQLERRM;
    END;

    -- ── Scenario 3: Shipped Order Cancellation DOES NOT Restore Stock or Coupon
    BEGIN
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
        v_order_shipped_id, v_product_id, NULL, 'Phase 8.1 Visible Test Product', 50.00, 4, 200.00
      );

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
        RAISE EXCEPTION 'Shipped cancellation restored inventory! Expected % but got %', v_initial_stock, v_current_stock;
      END IF;

      IF v_current_coupon_count <> v_initial_coupon_count THEN
        RAISE EXCEPTION 'Shipped cancellation decremented coupon! Expected % but got %', v_initial_coupon_count, v_current_coupon_count;
      END IF;

      v_res3 := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      v_res3 := 'FAIL: ' || SQLERRM;
    END;

    -- ── Scenario 4: Delivered Order Lifecycle & Cancellation Behavior ────
    BEGIN
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
        v_order_delivered_id, v_product_id, NULL, 'Phase 8.1 Visible Test Product', 50.00, 2, 100.00
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
        RAISE EXCEPTION 'Delivered cancellation restored inventory! Expected % but got %', v_initial_stock, v_current_stock;
      END IF;

      IF v_current_coupon_count <> v_initial_coupon_count THEN
        RAISE EXCEPTION 'Delivered cancellation decremented coupon! Expected % but got %', v_initial_coupon_count, v_current_coupon_count;
      END IF;

      -- 4b. Customer cancellation RPC cancel_order strictly rejects delivered orders
      INSERT INTO public.orders (
        user_id, address_id, coupon_id, status, subtotal, discount_amount, tax_amount, shipping_amount, total_amount
      ) VALUES (
        v_customer1_id, v_addr1_id, NULL, 'delivered', 50.00, 0.00, 0.00, 0.00, 50.00
      ) RETURNING id INTO v_order_delivered_c1_id;

      EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_customer1_id);
      SET LOCAL ROLE authenticated;

      v_error_caught := false;
      v_rejection_err := NULL;
      BEGIN
        PERFORM public.cancel_order(v_order_delivered_c1_id);
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Cannot cancel an order that has already been delivered%' THEN
          v_error_caught := true;
        ELSE
          v_rejection_err := SQLERRM;
        END IF;
      END;

      RESET ROLE;

      IF NOT v_error_caught THEN
        IF v_rejection_err IS NOT NULL THEN
          RAISE EXCEPTION 'Customer cancel_order rejected with unexpected error: %', v_rejection_err;
        ELSE
          RAISE EXCEPTION 'Customer cancel_order did not reject delivered order!';
        END IF;
      END IF;

      v_res4 := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      v_res4 := 'FAIL: ' || SQLERRM;
    END;

    -- ── Scenario 5: Repeated Cancellation with SET status = 'cancelled' ──
    BEGIN
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
        RAISE EXCEPTION 'Duplicate inventory restoration detected on repeated cancellation! Expected % but got %', v_initial_stock, v_current_stock;
      END IF;

      IF v_current_coupon_count <> v_initial_coupon_count THEN
        RAISE EXCEPTION 'Duplicate coupon decrement detected on repeated cancellation! Expected % but got %', v_initial_coupon_count, v_current_coupon_count;
      END IF;

      v_res5 := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      v_res5 := 'FAIL: ' || SQLERRM;
    END;

    -- ── Scenario 6: Cancelled Orders Cannot Be Reopened ─────────────────
    BEGIN
      v_error_caught := false;
      v_rejection_err := NULL;
      BEGIN
        UPDATE public.orders
        SET status = 'pending'
        WHERE id = v_order_pending_id;
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Cancelled orders cannot be reopened or transitioned to %' THEN
          v_error_caught := true;
        ELSE
          v_rejection_err := SQLERRM;
        END IF;
      END;

      IF NOT v_error_caught THEN
        IF v_rejection_err IS NOT NULL THEN
          RAISE EXCEPTION 'Reopening cancelled order rejected with unexpected error: %', v_rejection_err;
        ELSE
          RAISE EXCEPTION 'Reopening cancelled order was not rejected by database trigger';
        END IF;
      END IF;

      v_res6 := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      v_res6 := 'FAIL: ' || SQLERRM;
    END;

    -- ── Scenario 7: Unauthorized Customers Cannot Cancel Another Customer's Order
    BEGIN
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
      v_rejection_err := NULL;
      BEGIN
        PERFORM public.cancel_order(v_order_c1_pending2_id);
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Access denied: You can only cancel your own orders%' THEN
          v_error_caught := true;
        ELSE
          v_rejection_err := SQLERRM;
        END IF;
      END;

      RESET ROLE;

      IF NOT v_error_caught THEN
        IF v_rejection_err IS NOT NULL THEN
          RAISE EXCEPTION 'Customer cancellation rejected with unexpected error: %', v_rejection_err;
        ELSE
          RAISE EXCEPTION 'Customer 2 was able to cancel Customer 1 order!';
        END IF;
      END IF;

      v_res7 := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      v_res7 := 'FAIL: ' || SQLERRM;
    END;

    -- ── Scenario 8: Privilege Inspection & Trigger Attachment ───────────
    BEGIN
      -- 8a. Verify EXECUTE privilege is revoked from anon and authenticated via effective privilege inspection
      IF has_function_privilege('anon', 'public.restore_inventory_on_cancellation()', 'execute') THEN
        RAISE EXCEPTION 'anon role possesses EXECUTE privilege on public.restore_inventory_on_cancellation()';
      END IF;

      IF has_function_privilege('authenticated', 'public.restore_inventory_on_cancellation()', 'execute') THEN
        RAISE EXCEPTION 'authenticated role possesses EXECUTE privilege on public.restore_inventory_on_cancellation()';
      END IF;

      -- 8b. Verify PUBLIC pseudo-role has no EXECUTE grant using pg_proc.proacl and aclexplode()
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
        RAISE EXCEPTION 'PUBLIC pseudo-role possesses EXECUTE grant on public.restore_inventory_on_cancellation()';
      END IF;

      -- 8c. Strengthen trigger verification on public.orders
      SELECT count(*) INTO v_trigger_count
      FROM pg_trigger tg
      WHERE tg.tgrelid = 'public.orders'::regclass
        AND tg.tgname = 'trg_restore_inventory_on_cancel'
        AND NOT tg.tgisinternal;

      IF v_trigger_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 matching trigger on public.orders, found %', v_trigger_count;
      END IF;

      SELECT tg.tgfoid, tg.tgenabled INTO v_tgfoid, v_tgenabled
      FROM pg_trigger tg
      WHERE tg.tgrelid = 'public.orders'::regclass
        AND tg.tgname = 'trg_restore_inventory_on_cancel'
        AND NOT tg.tgisinternal;

      v_fn_oid := 'public.restore_inventory_on_cancellation()'::regprocedure::oid;

      IF v_tgfoid <> v_fn_oid THEN
        RAISE EXCEPTION 'Trigger function OID (%) does not match public.restore_inventory_on_cancellation() (%)',
          v_tgfoid, v_fn_oid;
      END IF;

      IF v_tgenabled NOT IN ('O', 'A') THEN
        RAISE EXCEPTION 'Trigger trg_restore_inventory_on_cancel is not enabled (tgenabled = %)', v_tgenabled;
      END IF;

      v_res8 := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      v_res8 := 'FAIL: ' || SQLERRM;
    END;

    -- Explicitly trigger rollback of the fixture subtransaction
    RAISE EXCEPTION 'PHASE8_1_ROLLBACK_FIXTURES';
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM = 'PHASE8_1_ROLLBACK_FIXTURES' THEN
        -- Expected subtransaction rollback: all fixture rows (orders, inventory, coupons, users)
        -- created inside this block are rolled back to the savepoint!
        NULL;
      ELSE
        -- Unexpected fixture setup error: mark all unexecuted scenarios with the failure
        v_setup_error := 'Fixture setup error: ' || SQLERRM;
        IF v_res1 = 'FAIL: Scenario 1 not executed' THEN v_res1 := v_setup_error; END IF;
        IF v_res2 = 'FAIL: Scenario 2 not executed' THEN v_res2 := v_setup_error; END IF;
        IF v_res3 = 'FAIL: Scenario 3 not executed' THEN v_res3 := v_setup_error; END IF;
        IF v_res4 = 'FAIL: Scenario 4 not executed' THEN v_res4 := v_setup_error; END IF;
        IF v_res5 = 'FAIL: Scenario 5 not executed' THEN v_res5 := v_setup_error; END IF;
        IF v_res6 = 'FAIL: Scenario 6 not executed' THEN v_res6 := v_setup_error; END IF;
        IF v_res7 = 'FAIL: Scenario 7 not executed' THEN v_res7 := v_setup_error; END IF;
        IF v_res8 = 'FAIL: Scenario 8 not executed' THEN v_res8 := v_setup_error; END IF;
      END IF;
  END;

  -- ── Insert Results OUTSIDE the Rolled-Back Subtransaction ────────
  -- Because this INSERT executes outside the subtransaction block,
  -- these rows are preserved and visible to the subsequent SELECT.
  INSERT INTO phase8_1_visible_test_results (test_number, scenario, result) VALUES
    (1, v_scen1, v_res1),
    (2, v_scen2, v_res2),
    (3, v_scen3, v_res3),
    (4, v_scen4, v_res4),
    (5, v_scen5, v_res5),
    (6, v_scen6, v_res6),
    (7, v_scen7, v_res7),
    (8, v_scen8, v_res8);

  -- Log summary notices
  SELECT count(*) INTO v_failed_count
  FROM phase8_1_visible_test_results
  WHERE result NOT LIKE 'PASS%';

  IF v_failed_count = 0 THEN
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'OVERALL RESULT: ALL 8 SCENARIOS PASSED (100%% SUCCESS)';
    RAISE NOTICE '===============================================================';
  ELSE
    RAISE WARNING '===============================================================';
    RAISE WARNING 'OVERALL RESULT: VERIFICATION FAILED (% OF 8 SCENARIOS FAILED)', v_failed_count;
    RAISE WARNING '===============================================================';
  END IF;

END $$;

-- ── 4. Render Visible Test Results Table (Final Statement) ─────────
SELECT 
  test_number,
  scenario,
  result
FROM phase8_1_visible_test_results
ORDER BY test_number;
