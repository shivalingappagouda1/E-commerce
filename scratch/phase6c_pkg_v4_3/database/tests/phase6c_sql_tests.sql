-- ═══════════════════════════════════════════════════════════════════
-- Phase 6C: Comprehensive Authoritative SQL Test Suite (PostgreSQL 15+)
-- Structural, Security, Privilege, Role Isolation, Inventory,
-- Shipping/Coupon, PhonePe Lifecycle, and Refund Tests
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 0. Test Logging Infrastructure
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public._phase6c_test_log (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category TEXT NOT NULL,
  test_name TEXT NOT NULL,
  status TEXT NOT NULL
);

TRUNCATE TABLE public._phase6c_test_log;

CREATE OR REPLACE FUNCTION public._log_test_pass(p_category TEXT, p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public._phase6c_test_log (category, test_name, status)
  VALUES (p_category, p_name, 'PASS');
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 1. Structural and Security Schema Verification
-- ─────────────────────────────────────────────────────────────────

-- Verify column idempotency_key exists on orders and refund_reference on payments
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'idempotency_key'
  ), 'Assertion Failed: orders.idempotency_key column missing';
  PERFORM public._log_test_pass('Schema', 'orders.idempotency_key column exists');

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'refund_reference'
  ), 'Assertion Failed: payments.refund_reference column missing';
  PERFORM public._log_test_pass('Schema', 'payments.refund_reference column exists');
END $$;

-- Verify payment_submissions table exists with expected structure
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_submissions'
  ), 'Assertion Failed: payment_submissions table missing';
  PERFORM public._log_test_pass('Schema', 'payment_submissions table exists');

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_submissions' AND column_name = 'utr_number'
  ), 'Assertion Failed: payment_submissions.utr_number missing';
  PERFORM public._log_test_pass('Schema', 'payment_submissions.utr_number column exists');

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_submissions' AND column_name = 'status'
  ), 'Assertion Failed: payment_submissions.status missing';
  PERFORM public._log_test_pass('Schema', 'payment_submissions.status column exists');
END $$;

-- Verify RLS is enabled and forced on payment_submissions
DO $$
DECLARE
  v_relrow RECORD;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity INTO v_relrow
  FROM pg_class
  WHERE relname = 'payment_submissions' AND relnamespace = 'public'::regnamespace;

  ASSERT v_relrow.relrowsecurity = TRUE, 'Assertion Failed: RLS not enabled on payment_submissions';
  PERFORM public._log_test_pass('Security', 'RLS enabled on payment_submissions');

  ASSERT v_relrow.relforcerowsecurity = TRUE, 'Assertion Failed: FORCE RLS not enabled on payment_submissions';
  PERFORM public._log_test_pass('Security', 'FORCE RLS enabled on payment_submissions');

  -- Verify RLS and FORCE RLS on physical_return_inspections (Option B)
  SELECT relrowsecurity, relforcerowsecurity INTO v_relrow
  FROM pg_class
  WHERE relname = 'physical_return_inspections' AND relnamespace = 'public'::regnamespace;

  ASSERT v_relrow.relrowsecurity = TRUE, 'Assertion Failed: RLS not enabled on physical_return_inspections';
  PERFORM public._log_test_pass('Security', 'RLS enabled on physical_return_inspections');

  ASSERT v_relrow.relforcerowsecurity = TRUE, 'Assertion Failed: FORCE RLS not enabled on physical_return_inspections';
  PERFORM public._log_test_pass('Security', 'FORCE RLS enabled on physical_return_inspections');
END $$;

-- Verify Function Security: SECURITY DEFINER and STRICT EXACT empty search_path
DO $$
DECLARE
  v_fn RECORD;
  v_functions TEXT[] := ARRAY[
    'place_order(uuid,text,text,text,text)',
    'submit_phonepe_utr(uuid,text)',
    'admin_verify_utr(uuid,boolean,text)',
    'admin_confirm_cod_payment(uuid,text)',
    'expire_pending_phonepe_orders()',
    'admin_record_refund(uuid,text,text,boolean)',
    'restore_inventory_on_cancellation()',
    'cancel_order(uuid)',
    'admin_create_return_inspection(uuid,uuid,integer,text)',
    'admin_complete_return_inspection(uuid,text,integer,text,text,boolean)',
    '_restock_approved_return_inspections(uuid)'
  ];
  v_fn_sig TEXT;
  v_is_empty_search_path BOOLEAN;
  v_negative_caught BOOLEAN := FALSE;
  v_neg_cfg TEXT[];
BEGIN
  FOREACH v_fn_sig IN ARRAY v_functions LOOP
    SELECT p.prosecdef, p.proconfig INTO v_fn
    FROM pg_proc p
    WHERE p.oid = v_fn_sig::regprocedure;

    ASSERT v_fn.prosecdef = TRUE,
      'Assertion Failed: ' || v_fn_sig || ' is not SECURITY DEFINER';
    PERFORM public._log_test_pass('Security', v_fn_sig || ' is SECURITY DEFINER');

    -- Strict verification: Must contain empty search_path and NO non-empty search_path
    v_is_empty_search_path := (
      (v_fn.proconfig @> ARRAY['search_path=""'] OR v_fn.proconfig @> ARRAY['search_path='])
      AND NOT EXISTS (
        SELECT 1 FROM unnest(v_fn.proconfig) AS cfg
        WHERE cfg ~ '^search_path=.+' AND cfg NOT IN ('search_path=""', 'search_path=')
      )
    );

    ASSERT v_is_empty_search_path = TRUE,
      'Assertion Failed: ' || v_fn_sig || ' does not have strictly empty search_path';
    PERFORM public._log_test_pass('Security', v_fn_sig || ' has strictly empty search_path');
  END LOOP;

  -- ── Negative Tests for search_path Assertion ──
  -- Create temporary test functions with non-empty search paths and verify that assertion fails
  CREATE OR REPLACE FUNCTION public._test_unsafe_search_path_single()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $f$ BEGIN NULL; END; $f$;

  CREATE OR REPLACE FUNCTION public._test_unsafe_search_path_multi()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public, auth' AS $f$ BEGIN NULL; END; $f$;

  -- Test single non-empty search_path rejection
  SELECT proconfig INTO v_neg_cfg FROM pg_proc WHERE oid = 'public._test_unsafe_search_path_single()'::regprocedure;
  v_negative_caught := FALSE;
  BEGIN
    ASSERT (
      (v_neg_cfg @> ARRAY['search_path=""'] OR v_neg_cfg @> ARRAY['search_path='])
      AND NOT EXISTS (
        SELECT 1 FROM unnest(v_neg_cfg) AS cfg
        WHERE cfg ~ '^search_path=.+' AND cfg NOT IN ('search_path=""', 'search_path=')
      )
    ), 'Unsafe function with search_path=public should fail';
  EXCEPTION WHEN assert_failure THEN
    v_negative_caught := TRUE;
  END;
  ASSERT v_negative_caught = TRUE, 'Assertion Failed: Unsafe search_path=public must be rejected by assertion';
  PERFORM public._log_test_pass('Security', 'Negative test: search_path=public is rejected by assertion');

  -- Test multi non-empty search_path rejection
  SELECT proconfig INTO v_neg_cfg FROM pg_proc WHERE oid = 'public._test_unsafe_search_path_multi()'::regprocedure;
  v_negative_caught := FALSE;
  BEGIN
    ASSERT (
      (v_neg_cfg @> ARRAY['search_path=""'] OR v_neg_cfg @> ARRAY['search_path='])
      AND NOT EXISTS (
        SELECT 1 FROM unnest(v_neg_cfg) AS cfg
        WHERE cfg ~ '^search_path=.+' AND cfg NOT IN ('search_path=""', 'search_path=')
      )
    ), 'Unsafe function with search_path=public, auth should fail';
  EXCEPTION WHEN assert_failure THEN
    v_negative_caught := TRUE;
  END;
  ASSERT v_negative_caught = TRUE, 'Assertion Failed: Unsafe search_path=public, auth must be rejected by assertion';
  PERFORM public._log_test_pass('Security', 'Negative test: search_path=public, auth is rejected by assertion');

  DROP FUNCTION public._test_unsafe_search_path_single();
  DROP FUNCTION public._test_unsafe_search_path_multi();

  -- Verify place_order return type is strictly UUID
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_type t ON p.prorettype = t.oid
    WHERE p.oid = 'place_order(uuid,text,text,text,text)'::regprocedure
      AND t.typname = 'uuid'
  ), 'Assertion Failed: place_order must return UUID';
  PERFORM public._log_test_pass('Security', 'place_order return type is strictly UUID');

  -- Verify 3-argument caller-controlled timestamp overload submit_phonepe_utr DOES NOT EXIST
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'submit_phonepe_utr' AND pronargs = 3
  ), 'Assertion Failed: 3-argument submit_phonepe_utr with custom timestamp must NOT exist';
  PERFORM public._log_test_pass('Security', '3-argument submit_phonepe_utr with custom timestamp does not exist');

  -- Verify caller-controlled timestamp overload expire_pending_phonepe_orders DOES NOT EXIST
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'expire_pending_phonepe_orders' AND pronargs > 0
  ), 'Assertion Failed: expire_pending_phonepe_orders with custom timestamp must NOT exist';
  PERFORM public._log_test_pass('Security', 'expire_pending_phonepe_orders with custom timestamp does not exist');
END $$;

-- Verify Execution Grants: PUBLIC and anon are revoked for EVERY RPC, and client RPCs granted to authenticated
DO $$
DECLARE
  v_all_functions TEXT[] := ARRAY[
    'place_order(uuid,text,text,text,text)',
    'submit_phonepe_utr(uuid,text)',
    'admin_verify_utr(uuid,boolean,text)',
    'admin_confirm_cod_payment(uuid,text)',
    'expire_pending_phonepe_orders()',
    'admin_record_refund(uuid,text,text,boolean)',
    'restore_inventory_on_cancellation()',
    'cancel_order(uuid)',
    'admin_create_return_inspection(uuid,uuid,integer,text)',
    'admin_complete_return_inspection(uuid,text,integer,text,text,boolean)',
    '_restock_approved_return_inspections(uuid)'
  ];
  v_client_rpcs TEXT[] := ARRAY[
    'place_order(uuid,text,text,text,text)',
    'submit_phonepe_utr(uuid,text)',
    'admin_verify_utr(uuid,boolean,text)',
    'admin_confirm_cod_payment(uuid,text)',
    'admin_record_refund(uuid,text,text,boolean)',
    'cancel_order(uuid)',
    'admin_create_return_inspection(uuid,uuid,integer,text)',
    'admin_complete_return_inspection(uuid,text,integer,text,text,boolean)'
  ];
  v_service_only_rpcs TEXT[] := ARRAY[
    'expire_pending_phonepe_orders()',
    '_restock_approved_return_inspections(uuid)'
  ];
  v_fn_sig TEXT;
BEGIN
  -- 1. Verify PUBLIC and anon are revoked across ALL functions
  FOREACH v_fn_sig IN ARRAY v_all_functions LOOP
    ASSERT has_function_privilege('public', v_fn_sig, 'execute') = FALSE,
      'Assertion Failed: PUBLIC has execute privilege on ' || v_fn_sig;
    PERFORM public._log_test_pass('Privileges', 'PUBLIC revoked on ' || v_fn_sig);

    ASSERT has_function_privilege('anon', v_fn_sig, 'execute') = FALSE,
      'Assertion Failed: anon has execute privilege on ' || v_fn_sig;
    PERFORM public._log_test_pass('Privileges', 'anon revoked on ' || v_fn_sig);
  END LOOP;

  -- 2. Verify authenticated is granted execute on all client RPCs
  FOREACH v_fn_sig IN ARRAY v_client_rpcs LOOP
    ASSERT has_function_privilege('authenticated', v_fn_sig, 'execute') = TRUE,
      'Assertion Failed: authenticated lacks execute privilege on ' || v_fn_sig;
    PERFORM public._log_test_pass('Privileges', 'authenticated granted execute on ' || v_fn_sig);
  END LOOP;

  -- 3. Verify service-only functions are revoked from authenticated and granted to service_role
  FOREACH v_fn_sig IN ARRAY v_service_only_rpcs LOOP
    ASSERT has_function_privilege('authenticated', v_fn_sig, 'execute') = FALSE,
      'Assertion Failed: authenticated must NOT have execute privilege on ' || v_fn_sig;
    PERFORM public._log_test_pass('Privileges', 'authenticated revoked on ' || v_fn_sig);

    ASSERT has_function_privilege('service_role', v_fn_sig, 'execute') = TRUE,
      'Assertion Failed: service_role lacks execute privilege on ' || v_fn_sig;
    PERFORM public._log_test_pass('Privileges', 'service_role granted execute on ' || v_fn_sig);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. Real PostgreSQL Role & RLS Isolation Verification
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_u1 UUID := '11111111-1111-4111-8111-111111111111';
  v_u2 UUID := '22222222-2222-4222-8222-222222222222';
  v_admin UUID := '33333333-3333-4333-8333-333333333333';
  v_ord1 UUID := gen_random_uuid();
  v_ord2 UUID := gen_random_uuid();
  v_pay1 UUID := gen_random_uuid();
  v_pay2 UUID := gen_random_uuid();
  v_sub1 UUID := gen_random_uuid();
  v_sub2 UUID := gen_random_uuid();
  v_cnt INT;
  v_insert_failed BOOLEAN := FALSE;
  v_update_failed BOOLEAN := FALSE;
  v_delete_failed BOOLEAN := FALSE;
  v_anon_failed BOOLEAN := FALSE;
BEGIN
  -- Setup test users
  INSERT INTO auth.users (id, email) VALUES
    (v_u1, 'rls_user1@shopkart.in'),
    (v_u2, 'rls_user2@shopkart.in'),
    (v_admin, 'rls_admin@shopkart.in')
    ON CONFLICT (id) DO NOTHING;

  ALTER TABLE public.profiles DISABLE TRIGGER guard_role_escalation;
  INSERT INTO public.profiles (id, full_name, role) VALUES
    (v_u1, 'Customer 1', 'customer'),
    (v_u2, 'Customer 2', 'customer'),
    (v_admin, 'Administrator', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  ALTER TABLE public.profiles ENABLE TRIGGER guard_role_escalation;

  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount) VALUES
    (v_ord1, v_u1, 'pending', 500.00, 599.00),
    (v_ord2, v_u2, 'pending', 500.00, 599.00);

  INSERT INTO public.payments (id, order_id, provider, amount, status) VALUES
    (v_pay1, v_ord1, 'phonepe', 599.00, 'pending'),
    (v_pay2, v_ord2, 'phonepe', 599.00, 'pending');

  INSERT INTO public.payment_submissions (id, order_id, payment_id, user_id, utr_number, status) VALUES
    (v_sub1, v_ord1, v_pay1, v_u1, 'UTR-TEST-USER1', 'submitted'),
    (v_sub2, v_ord2, v_pay2, v_u2, 'UTR-TEST-USER2', 'submitted');

  -- ── Test Under SET ROLE authenticated (Customer 1) ──
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_u1::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Customer 1 must only see Customer 1's submission (RLS customer isolation)
  SELECT count(*) INTO v_cnt FROM public.payment_submissions;
  ASSERT v_cnt = 1, 'Assertion Failed: Customer 1 saw more than 1 submission under RLS';
  PERFORM public._log_test_pass('RLS Enforcement', 'Customer 1 sees only own submission under SET ROLE authenticated');

  SELECT count(*) INTO v_cnt FROM public.payment_submissions WHERE utr_number = 'UTR-TEST-USER2';
  ASSERT v_cnt = 0, 'Assertion Failed: Customer 1 was able to view Customer 2 submission';
  PERFORM public._log_test_pass('RLS Enforcement', 'Customer 1 cannot view Customer 2 submission');

  -- Direct DML restriction: Authenticated user cannot direct INSERT into payment_submissions
  BEGIN
    INSERT INTO public.payment_submissions (id, order_id, payment_id, user_id, utr_number, status)
    VALUES (gen_random_uuid(), v_ord1, v_pay1, v_u1, 'HACK-UTR', 'submitted');
  EXCEPTION WHEN insufficient_privilege THEN
    v_insert_failed := TRUE;
  END;
  ASSERT v_insert_failed = TRUE, 'Assertion Failed: Direct INSERT on payment_submissions must be rejected';
  PERFORM public._log_test_pass('RLS Enforcement', 'Direct INSERT on payment_submissions rejected for authenticated user');

  -- Direct DML restriction: Authenticated user cannot direct UPDATE on payment_submissions
  BEGIN
    UPDATE public.payment_submissions SET status = 'approved' WHERE id = v_sub1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_update_failed := TRUE;
  END;
  ASSERT v_update_failed = TRUE, 'Assertion Failed: Direct UPDATE on payment_submissions must be rejected';
  PERFORM public._log_test_pass('RLS Enforcement', 'Direct UPDATE on payment_submissions rejected for authenticated user');

  -- Direct DML restriction: Authenticated user cannot direct DELETE on payment_submissions
  BEGIN
    DELETE FROM public.payment_submissions WHERE id = v_sub1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_delete_failed := TRUE;
  END;
  ASSERT v_delete_failed = TRUE, 'Assertion Failed: Direct DELETE on payment_submissions must be rejected';
  PERFORM public._log_test_pass('RLS Enforcement', 'Direct DELETE on payment_submissions rejected for authenticated user');

  -- ── Test Under SET ROLE authenticated (Administrator) ──
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Administrator must see all submissions across all customers
  SELECT count(*) INTO v_cnt FROM public.payment_submissions;
  ASSERT v_cnt >= 2, 'Assertion Failed: Admin did not see all submissions under RLS';
  PERFORM public._log_test_pass('RLS Enforcement', 'Administrator views all submissions across customers');

  -- ── Test Under SET ROLE anon ──
  SET ROLE anon;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  BEGIN
    SELECT count(*) INTO v_cnt FROM public.payment_submissions;
  EXCEPTION WHEN insufficient_privilege THEN
    v_anon_failed := TRUE;
  END;
  ASSERT (v_anon_failed = TRUE OR v_cnt = 0), 'Assertion Failed: anon was able to read payment_submissions';
  PERFORM public._log_test_pass('RLS Enforcement', 'Anon access to payment_submissions blocked or returns 0 rows');

  RESET ROLE;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. Behavioral Verification with Fixtures
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_other_user_id UUID := gen_random_uuid();
  v_admin_id UUID := gen_random_uuid();
  v_address_id UUID;
  v_prod_500_id UUID;
  v_prod_999_id UUID;
  v_prod_1000_id UUID;
  v_prod_1200_id UUID;
  v_prod_limited_id UUID;
  v_coupon_fixed_id UUID;
  v_cart_id UUID;
  v_order_id UUID;
  v_ret_order_id UUID;
  v_order_retry_id UUID;
  v_order_rec RECORD;
  v_pay_rec RECORD;
  v_sub_res JSONB;
  v_verify_res JSONB;
  v_cod_res JSONB;
  v_refund_res JSONB;
  v_stock_before INT := 20;
  v_stock_after INT;
  v_sub_id UUID;
  v_pre_delivery_failed BOOLEAN := FALSE;
  v_unauth_verify_failed BOOLEAN := FALSE;
  v_unauth_cod_failed BOOLEAN := FALSE;
  v_unauth_refund_failed BOOLEAN := FALSE;
  v_unauth_expiry_failed BOOLEAN := FALSE;
  v_other_user_utr_failed BOOLEAN := FALSE;
  v_pending_refund_failed BOOLEAN := FALSE;
  v_empty_ref_failed BOOLEAN := FALSE;
  v_repeat_refund_failed BOOLEAN := FALSE;
  v_unrelated_err_caught BOOLEAN := FALSE;
  v_unrelated_constraint_name TEXT;
  v_err_msg TEXT;
  v_test_boundary_now TIMESTAMPTZ;
  v_exact_48h_sub_failed BOOLEAN := FALSE;
  v_customer_custom_time_blocked BOOLEAN := FALSE;
  v_reopen_pending_failed BOOLEAN := FALSE;
  v_reopen_processing_failed BOOLEAN := FALSE;
  v_reopen_shipped_failed BOOLEAN := FALSE;
  v_reopen_delivered_failed BOOLEAN := FALSE;
  v_insufficient_stock_failed BOOLEAN := FALSE;
  v_repeat_cancel_failed BOOLEAN := FALSE;
  v_repeat_refund_norestock_failed BOOLEAN := FALSE;
  v_paid_cancel_norestock_id UUID;
  v_paid_cancel_restock_id UUID;
  v_prod_no_inv_id UUID;
  v_ord_missing_id UUID;
  v_ord_multi_id UUID;
  v_missing_inv_failed BOOLEAN := FALSE;
  v_missing_notes_failed BOOLEAN := FALSE;
  v_unsubmitted_order_id UUID;
  v_order_47h_id UUID;
  v_order_exact_48h_id UUID;
  v_order_48h_1s_id UUID;
  v_coupon_count_before INT;
  v_coupon_count_after INT;
  v_orders_count_before INT;
  v_payments_count_before INT;
  v_exp_res JSONB;
  v_orig_created_at TIMESTAMPTZ;
  v_resub_created_at TIMESTAMPTZ;
  v_missing_insp_failed BOOLEAN := FALSE;
  v_dup_restock_failed BOOLEAN := FALSE;
  v_rejected_restock_failed BOOLEAN := FALSE;
  v_insp_id UUID;
  v_insp_item_id UUID;
  v_ord_partial_id UUID;
  v_item_partial_id UUID;
  v_insp_partial_id UUID;
  v_ord_rejected_id UUID;
  v_item_rejected_id UUID;
  v_insp_rejected_id UUID;
  v_insp_res JSONB;
  v_item RECORD;
BEGIN
  -- Create mock auth users and profiles
  INSERT INTO auth.users (id, email) VALUES (v_user_id, 'customer1@shopkart.in');
  INSERT INTO auth.users (id, email) VALUES (v_other_user_id, 'customer2@shopkart.in');
  INSERT INTO auth.users (id, email) VALUES (v_admin_id, 'admin1@shopkart.in');

  ALTER TABLE public.profiles DISABLE TRIGGER guard_role_escalation;
  INSERT INTO public.profiles (id, full_name, role) VALUES (v_user_id, 'Customer One', 'customer')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;
  INSERT INTO public.profiles (id, full_name, role) VALUES (v_other_user_id, 'Customer Two', 'customer')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;
  INSERT INTO public.profiles (id, full_name, role) VALUES (v_admin_id, 'Administrator', 'admin')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;
  ALTER TABLE public.profiles ENABLE TRIGGER guard_role_escalation;

  INSERT INTO public.addresses (id, user_id, full_name, phone, line1, city, state, pincode)
  VALUES (gen_random_uuid(), v_user_id, 'Customer One', '+91 98765 43210', '123 Test Street', 'Bengaluru', 'Karnataka', '560001')
  RETURNING id INTO v_address_id;

  -- Create products and inventory
  INSERT INTO public.products (id, name, slug, price, is_active)
  VALUES (gen_random_uuid(), 'Product 500', 'product-500', 500.00, TRUE)
  RETURNING id INTO v_prod_500_id;

  INSERT INTO public.products (id, name, slug, price, is_active)
  VALUES (gen_random_uuid(), 'Product 999', 'product-999', 999.00, TRUE)
  RETURNING id INTO v_prod_999_id;

  INSERT INTO public.products (id, name, slug, price, is_active)
  VALUES (gen_random_uuid(), 'Product 1000', 'product-1000', 1000.00, TRUE)
  RETURNING id INTO v_prod_1000_id;

  INSERT INTO public.products (id, name, slug, price, is_active)
  VALUES (gen_random_uuid(), 'Product 1200', 'product-1200', 1200.00, TRUE)
  RETURNING id INTO v_prod_1200_id;

  INSERT INTO public.products (id, name, slug, price, is_active)
  VALUES (gen_random_uuid(), 'Limited Item', 'limited-item', 250.00, TRUE)
  RETURNING id INTO v_prod_limited_id;

  INSERT INTO public.products (id, name, slug, price, is_active)
  VALUES (gen_random_uuid(), 'Product No Inventory', 'product-no-inv', 350.00, TRUE)
  RETURNING id INTO v_prod_no_inv_id;

  INSERT INTO public.inventory (product_id, quantity) VALUES (v_prod_500_id, v_stock_before); -- 20
  INSERT INTO public.inventory (product_id, quantity) VALUES (v_prod_999_id, 20);
  INSERT INTO public.inventory (product_id, quantity) VALUES (v_prod_1000_id, 20);
  INSERT INTO public.inventory (product_id, quantity) VALUES (v_prod_1200_id, 20);
  INSERT INTO public.inventory (product_id, quantity) VALUES (v_prod_limited_id, 1); -- exactly 1 unit

  -- Create coupons
  INSERT INTO public.coupons (id, code, discount_type, discount_value, min_order_value, is_active, max_uses, used_count)
  VALUES (gen_random_uuid(), 'FLAT100', 'fixed', 100.00, 500.00, TRUE, 100, 0)
  RETURNING id INTO v_coupon_fixed_id;

  INSERT INTO public.carts (id, user_id) VALUES (gen_random_uuid(), v_user_id) RETURNING id INTO v_cart_id;

  -- ── Test A: Inventory Deduction on Successful Order (< 999 produces ₹99 shipping) ──
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_before = 20, 'Assertion Failed: initial stock must be 20';

  INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (v_cart_id, v_prod_500_id, 1);

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, TRUE);
  v_order_id := public.place_order(v_address_id, 'Test order 500', NULL, 'phonepe', 'idemp-500-1');

  -- Verify EXACT inventory deduction (20 -> 19)
  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = 19, 'Assertion Failed: Inventory must be deducted by exactly 1 (expected 19)';
  PERFORM public._log_test_pass('Inventory', 'Successful order deducts exactly the requested quantity (20 -> 19)');

  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id;
  ASSERT v_order_rec.subtotal = 500.00, 'Assertion Failed: subtotal must be 500.00';
  PERFORM public._log_test_pass('Checkout', 'Subtotal matches item price sum 500.00');

  ASSERT v_order_rec.shipping_amount = 99.00, 'Assertion Failed: shipping must be 99.00 for subtotal < 999';
  PERFORM public._log_test_pass('Shipping', 'Shipping amount is 99.00 for subtotal < 999');

  ASSERT v_order_rec.total_amount = 599.00, 'Assertion Failed: total must be 599.00';
  PERFORM public._log_test_pass('Checkout', 'Total amount is 599.00 (subtotal + shipping)');

  -- Verify PhonePe payment record created
  SELECT * INTO v_pay_rec FROM public.payments WHERE order_id = v_order_id;
  ASSERT v_pay_rec.provider = 'phonepe', 'Assertion Failed: payment provider must be phonepe';
  PERFORM public._log_test_pass('Payment', 'PhonePe payment record provider is phonepe');

  ASSERT v_pay_rec.status = 'pending', 'Assertion Failed: initial payment status must be pending';
  PERFORM public._log_test_pass('Payment', 'Initial PhonePe payment status is pending');

  ASSERT v_pay_rec.amount = 599.00, 'Assertion Failed: payment amount must match order total';
  PERFORM public._log_test_pass('Payment', 'Payment amount matches order total 599.00');

  -- ── Test A2: Overselling Rejection & Transaction Rollback ──
  -- Limited item has stock = 1. Customer adds 2 units to cart -> place_order must fail and roll back cleanly
  INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (v_cart_id, v_prod_limited_id, 2);
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_limited_id;
  SELECT count(*) INTO v_orders_count_before FROM public.orders WHERE user_id = v_user_id;
  SELECT count(*) INTO v_payments_count_before FROM public.payments;

  BEGIN
    PERFORM public.place_order(v_address_id, 'Oversell attempt', NULL, 'phonepe', 'idemp-oversell-fail');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg LIKE '%Insufficient or unconfigured inventory%' THEN
      v_insufficient_stock_failed := TRUE;
    END IF;
  END;

  ASSERT v_insufficient_stock_failed = TRUE,
    'Assertion Failed: Order exceeding available inventory must be rejected with Insufficient inventory';
  PERFORM public._log_test_pass('Inventory', 'Insufficient stock rejects order placement');

  -- Verify failed order leaves NO partial changes
  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_limited_id;
  ASSERT v_stock_after = v_stock_before, 'Assertion Failed: Stock must not change on failed order';
  PERFORM public._log_test_pass('Inventory', 'Failed order leaves inventory quantity untouched');

  ASSERT (SELECT count(*) FROM public.orders WHERE user_id = v_user_id) = v_orders_count_before,
    'Assertion Failed: No partial order row created on failure';
  PERFORM public._log_test_pass('Inventory', 'Failed order leaves orders table untouched (no partial records)');

  ASSERT (SELECT count(*) FROM public.payments) = v_payments_count_before,
    'Assertion Failed: No partial payment row created on failure';
  PERFORM public._log_test_pass('Inventory', 'Failed order leaves payments table untouched (no partial records)');

  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  -- ── Test B: Idempotency Key Replay Side Effect Absence ──
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;
  SELECT used_count INTO v_coupon_count_before FROM public.coupons WHERE id = v_coupon_fixed_id;
  SELECT count(*) INTO v_orders_count_before FROM public.orders WHERE user_id = v_user_id;
  SELECT count(*) INTO v_payments_count_before FROM public.payments;

  INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (v_cart_id, v_prod_500_id, 1);
  v_order_retry_id := public.place_order(v_address_id, 'Test order 500 retry', 'FLAT100', 'phonepe', 'idemp-500-1');

  ASSERT v_order_retry_id = v_order_id,
    'Assertion Failed: Repeated idempotency key must return original order ID';
  PERFORM public._log_test_pass('Idempotency', 'Repeated token returns original order ID');

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before,
    'Assertion Failed: Inventory must NOT be decremented on idempotency replay';
  PERFORM public._log_test_pass('Idempotency', 'Inventory not decremented on idempotency replay');

  SELECT used_count INTO v_coupon_count_after FROM public.coupons WHERE id = v_coupon_fixed_id;
  ASSERT v_coupon_count_after = v_coupon_count_before,
    'Assertion Failed: Coupon usage must NOT be incremented on idempotency replay';
  PERFORM public._log_test_pass('Idempotency', 'Coupon usage not incremented on idempotency replay');

  ASSERT (SELECT count(*) FROM public.orders WHERE user_id = v_user_id) = v_orders_count_before,
    'Assertion Failed: Orders table count must not increase on idempotency replay';
  PERFORM public._log_test_pass('Idempotency', 'Orders table count not increased on idempotency replay');

  ASSERT (SELECT count(*) FROM public.payments) = v_payments_count_before,
    'Assertion Failed: Payments table count must not increase on idempotency replay';
  PERFORM public._log_test_pass('Idempotency', 'Payments table count not increased on idempotency replay');

  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  -- ── Test B2: place_order() Exception Handler Test for Unrelated Unique Violations ──
  CREATE OR REPLACE FUNCTION public._test_trigger_unrelated_uniq()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $trg$
  BEGIN
    IF pg_trigger_depth() = 1 AND NEW.notes = 'TEST_UNRELATED_UNIQUE_SIMULATION' THEN
      INSERT INTO public.orders (
        id, user_id, status, subtotal, total_amount, notes, idempotency_key
      )
      VALUES (
        gen_random_uuid(), NEW.user_id, 'pending', 500.00, 599.00,
        'CONCURRENTLY_COMMITTED_ORDER', NEW.idempotency_key
      );

      RAISE unique_violation USING
        CONSTRAINT = 'orders_unrelated_test_uniq',
        MESSAGE = 'duplicate key value violates unique constraint "orders_unrelated_test_uniq"';
    END IF;
    RETURN NEW;
  END;
  $trg$;

  CREATE TRIGGER trg_test_unrelated_uniq
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public._test_trigger_unrelated_uniq();

  INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (v_cart_id, v_prod_500_id, 1);
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;
  SELECT used_count INTO v_coupon_count_before FROM public.coupons WHERE id = v_coupon_fixed_id;
  SELECT count(*) INTO v_orders_count_before FROM public.orders WHERE user_id = v_user_id;
  SELECT count(*) INTO v_payments_count_before FROM public.payments;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, TRUE);

  BEGIN
    v_order_retry_id := public.place_order(
      v_address_id,
      'TEST_UNRELATED_UNIQUE_SIMULATION',
      'FLAT100',
      'phonepe',
      'idemp-race-unrelated'
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS
      v_unrelated_constraint_name = CONSTRAINT_NAME,
      v_err_msg = MESSAGE_TEXT;
    IF v_unrelated_constraint_name = 'orders_unrelated_test_uniq' THEN
      v_unrelated_err_caught := TRUE;
    END IF;
  END;

  DROP TRIGGER trg_test_unrelated_uniq ON public.orders;
  DROP FUNCTION public._test_trigger_unrelated_uniq();

  ASSERT v_unrelated_err_caught = TRUE,
    'Assertion Failed: public.place_order() must re-raise unrelated unique violation even when matching idempotency record exists';
  PERFORM public._log_test_pass('Idempotency', 'place_order re-raises unrelated unique violations');

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before,
    'Assertion Failed: Inventory must NOT be decremented on re-raised unrelated unique violation';
  PERFORM public._log_test_pass('Idempotency', 'Inventory not decremented on unrelated unique violation');

  SELECT used_count INTO v_coupon_count_after FROM public.coupons WHERE id = v_coupon_fixed_id;
  ASSERT v_coupon_count_after = v_coupon_count_before,
    'Assertion Failed: Coupon usage must NOT be incremented on re-raised unrelated unique violation';
  PERFORM public._log_test_pass('Idempotency', 'Coupon usage not incremented on unrelated unique violation');

  ASSERT (SELECT count(*) FROM public.orders WHERE notes = 'TEST_UNRELATED_UNIQUE_SIMULATION') = 0,
    'Assertion Failed: The order being placed must not have been created';
  PERFORM public._log_test_pass('Idempotency', 'Order not created on unrelated unique violation');

  ASSERT (SELECT count(*) FROM public.payments) = v_payments_count_before,
    'Assertion Failed: Payment count must NOT increase when unrelated error is re-raised';
  PERFORM public._log_test_pass('Idempotency', 'Payment count not increased on unrelated unique violation');

  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  -- ── Test C: Ownership Check for UTR Submission ──
  PERFORM set_config('request.jwt.claim.sub', v_other_user_id::text, TRUE);
  BEGIN
    PERFORM public.submit_phonepe_utr(v_order_id, '111122223333');
  EXCEPTION WHEN OTHERS THEN
    v_other_user_utr_failed := TRUE;
  END;
  ASSERT v_other_user_utr_failed = TRUE,
    'Assertion Failed: Unauthorized user must not submit UTR for another customer order';
  PERFORM public._log_test_pass('UTR Submission', 'Unauthorized user blocked from submitting UTR for another order');

  -- ── Test D: Customer UTR Submission ──
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, TRUE);
  v_sub_res := public.submit_phonepe_utr(v_order_id, '123456789012');
  ASSERT (v_sub_res->>'success')::boolean = TRUE, 'Assertion Failed: UTR submission should succeed';
  PERFORM public._log_test_pass('UTR Submission', 'Customer UTR submission succeeds');

  v_sub_id := (v_sub_res->>'submission_id')::uuid;

  ASSERT EXISTS (
    SELECT 1 FROM public.payment_submissions
    WHERE id = v_sub_id AND utr_number = '123456789012' AND status = 'submitted' AND created_at IS NOT NULL
  ), 'Assertion Failed: payment_submissions row must exist with status submitted and valid created_at';
  PERFORM public._log_test_pass('UTR Submission', 'payment_submissions row created with status submitted and created_at');

  -- ── Test D2: Customer Blocked from Timestamp-Controlled UTR Overload ──
  BEGIN
    PERFORM public.submit_phonepe_utr(v_order_id, '123456789012', NOW() - INTERVAL '1 hour');
  EXCEPTION WHEN OTHERS THEN
    v_customer_custom_time_blocked := TRUE;
  END;
  ASSERT v_customer_custom_time_blocked = TRUE,
    'Assertion Failed: Authenticated customer must be blocked from executing custom timestamp UTR submission';
  PERFORM public._log_test_pass('UTR Submission', 'Customer blocked from custom timestamp UTR overload');

  -- ── Test E: Unauthorized Users Blocked from Admin RPCs ──
  BEGIN
    PERFORM public.admin_verify_utr(v_sub_id, TRUE, 'Hacker attempt');
  EXCEPTION WHEN OTHERS THEN
    v_unauth_verify_failed := TRUE;
  END;
  ASSERT v_unauth_verify_failed = TRUE,
    'Assertion Failed: Unauthorized customer must be blocked from admin_verify_utr';
  PERFORM public._log_test_pass('Authorization', 'Customer blocked from admin_verify_utr');

  BEGIN
    PERFORM public.admin_confirm_cod_payment(v_order_id, 'Hacker attempt');
  EXCEPTION WHEN OTHERS THEN
    v_unauth_cod_failed := TRUE;
  END;
  ASSERT v_unauth_cod_failed = TRUE,
    'Assertion Failed: Unauthorized customer must be blocked from admin_confirm_cod_payment';
  PERFORM public._log_test_pass('Authorization', 'Customer blocked from admin_confirm_cod_payment');

  BEGIN
    PERFORM public.admin_record_refund(v_order_id, 'REF-123', 'Hacker attempt', FALSE);
  EXCEPTION WHEN OTHERS THEN
    v_unauth_refund_failed := TRUE;
  END;
  ASSERT v_unauth_refund_failed = TRUE,
    'Assertion Failed: Unauthorized customer must be blocked from admin_record_refund';
  PERFORM public._log_test_pass('Authorization', 'Customer blocked from admin_record_refund');

  BEGIN
    PERFORM public.expire_pending_phonepe_orders();
  EXCEPTION WHEN OTHERS THEN
    v_unauth_expiry_failed := TRUE;
  END;
  ASSERT v_unauth_expiry_failed = TRUE,
    'Assertion Failed: Unauthorized customer must be blocked from expire_pending_phonepe_orders';
  PERFORM public._log_test_pass('Authorization', 'Customer blocked from expire_pending_phonepe_orders');

  -- ── Test F: Admin Rejection & Resubmission Without Restocking Inventory ──
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, TRUE);

  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;

  v_verify_res := public.admin_verify_utr(v_sub_id, FALSE, 'UTR mismatch in bank statement');
  ASSERT (v_verify_res->>'decision') = 'rejected', 'Assertion Failed: decision must be rejected';
  PERFORM public._log_test_pass('Admin Verification', 'Admin UTR rejection decision is rejected');

  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id;
  ASSERT v_order_rec.status = 'pending', 'Assertion Failed: order must remain pending after UTR rejection';
  PERFORM public._log_test_pass('Admin Verification', 'Order remains pending after UTR rejection');

  SELECT * INTO v_pay_rec FROM public.payments WHERE order_id = v_order_id;
  ASSERT v_pay_rec.status = 'pending', 'Assertion Failed: payment must remain pending after UTR rejection';
  PERFORM public._log_test_pass('Admin Verification', 'Payment remains pending after UTR rejection');

  -- Inventory must NOT be restored upon UTR rejection
  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before, 'Assertion Failed: UTR rejection must NOT restore inventory';
  PERFORM public._log_test_pass('PhonePe Lifecycle', 'UTR rejection does NOT restore inventory');

  -- ── Test G: Customer Resubmission of Correct UTR Does NOT Reset 48h Deadline ──
  SELECT created_at INTO v_orig_created_at FROM public.orders WHERE id = v_order_id;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, TRUE);
  v_sub_res := public.submit_phonepe_utr(v_order_id, '987654321098');
  ASSERT (v_sub_res->>'success')::boolean = TRUE, 'Assertion Failed: UTR resubmission must succeed';
  PERFORM public._log_test_pass('UTR Resubmission', 'Customer UTR resubmission succeeds');

  v_sub_id := (v_sub_res->>'submission_id')::uuid;

  SELECT created_at INTO v_resub_created_at FROM public.orders WHERE id = v_order_id;
  ASSERT v_resub_created_at = v_orig_created_at,
    'Assertion Failed: UTR resubmission must NOT update orders.created_at or reset the 48-hour deadline';
  PERFORM public._log_test_pass('PhonePe Lifecycle', 'UTR resubmission preserves original orders.created_at and 48h deadline');

  ASSERT (SELECT count(*) FROM public.payment_submissions WHERE order_id = v_order_id) = 2,
    'Assertion Failed: Submission history must preserve both rejected and new submissions';
  PERFORM public._log_test_pass('UTR Resubmission', 'Submission history preserves both rejected and new submissions');

  -- ── Test H: Exact 48-Hour Boundary & Active UTR Protection ──
  v_test_boundary_now := NOW();

  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount, created_at)
  VALUES (gen_random_uuid(), v_user_id, 'pending', 500.00, 599.00, v_test_boundary_now - INTERVAL '47 hours 59 minutes 59 seconds')
  RETURNING id INTO v_order_47h_id;

  INSERT INTO public.payments (order_id, provider, amount, status)
  VALUES (v_order_47h_id, 'phonepe', 599.00, 'pending');

  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount, created_at)
  VALUES (gen_random_uuid(), v_user_id, 'pending', 500.00, 599.00, v_test_boundary_now - INTERVAL '48 hours')
  RETURNING id INTO v_order_exact_48h_id;

  INSERT INTO public.payments (order_id, provider, amount, status)
  VALUES (v_order_exact_48h_id, 'phonepe', 599.00, 'pending');

  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount, created_at)
  VALUES (gen_random_uuid(), v_user_id, 'pending', 500.00, 599.00, v_test_boundary_now - INTERVAL '48 hours 1 second')
  RETURNING id INTO v_order_48h_1s_id;

  INSERT INTO public.payments (order_id, provider, amount, status)
  VALUES (v_order_48h_1s_id, 'phonepe', 599.00, 'pending');

  -- Set v_order_id (active submitted UTR) to 49 hours ago relative to v_test_boundary_now
  UPDATE public.orders
  SET created_at = v_test_boundary_now - INTERVAL '49 hours'
  WHERE id = v_order_id;

  -- Test Production UTR Submission Boundary
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, TRUE);
  BEGIN
    PERFORM public.submit_phonepe_utr(v_order_exact_48h_id, '111122223333');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg LIKE '%PhonePe payment window has expired%' THEN
      v_exact_48h_sub_failed := TRUE;
    END IF;
  END;
  ASSERT v_exact_48h_sub_failed = TRUE,
    'Assertion Failed: Production UTR submission at exactly 48 hours must be rejected';
  PERFORM public._log_test_pass('PhonePe Expiry', 'UTR submission at exactly 48h boundary is rejected');

  v_sub_res := public.submit_phonepe_utr(v_order_47h_id, '222233334444');
  ASSERT (v_sub_res->>'success')::boolean = TRUE,
    'Assertion Failed: Production UTR submission before 48 hours must be accepted';
  PERFORM public._log_test_pass('PhonePe Expiry', 'UTR submission before 48h boundary is accepted');

  -- Run expiry evaluation as administrator strictly using database NOW() (zero arguments)
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, TRUE);
  v_exp_res := public.expire_pending_phonepe_orders();

  BEGIN
    PERFORM public.expire_pending_phonepe_orders(NOW());
  EXCEPTION WHEN undefined_function THEN
    v_unauth_expiry_failed := TRUE;
  WHEN OTHERS THEN
    v_unauth_expiry_failed := TRUE;
  END;
  ASSERT v_unauth_expiry_failed = TRUE,
    'Assertion Failed: Invoking expire_pending_phonepe_orders with a timestamp parameter must be rejected';
  PERFORM public._log_test_pass('PhonePe Expiry', 'Calling expire_pending_phonepe_orders with timestamp argument is rejected');

  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_47h_id;
  ASSERT v_order_rec.status = 'pending',
    'Assertion Failed: Order just before 48h boundary must NOT expire';
  PERFORM public._log_test_pass('PhonePe Expiry', 'Order just before 48h boundary with submitted UTR does not expire');

  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_exact_48h_id;
  ASSERT v_order_rec.status = 'cancelled',
    'Assertion Failed: Order at exactly 48h boundary with no submitted UTR MUST expire';
  PERFORM public._log_test_pass('PhonePe Expiry', 'Order at exactly 48h boundary with no submitted UTR expires');

  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_48h_1s_id;
  ASSERT v_order_rec.status = 'cancelled',
    'Assertion Failed: Order just after 48h boundary with no submitted UTR MUST expire';
  PERFORM public._log_test_pass('PhonePe Expiry', 'Order just after 48h boundary with no submitted UTR expires');

  -- Active submitted UTR awaiting review (49h old) MUST NOT expire
  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id;
  ASSERT v_order_rec.status = 'pending',
    'Assertion Failed: Order with active submitted UTR awaiting review must NOT expire after 48 hours';
  PERFORM public._log_test_pass('PhonePe Expiry', 'Order with active submitted UTR awaiting review does not expire after 48h');

  -- ── Test I: Admin Approval ──
  v_verify_res := public.admin_verify_utr(v_sub_id, TRUE, 'Bank credit verified');
  ASSERT (v_verify_res->>'decision') = 'approved', 'Assertion Failed: decision must be approved';
  PERFORM public._log_test_pass('Admin Verification', 'Admin UTR approval decision is approved');

  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id;
  ASSERT v_order_rec.status = 'processing', 'Assertion Failed: order must transition to processing';
  PERFORM public._log_test_pass('Admin Verification', 'Order transitions to processing upon UTR approval');

  SELECT * INTO v_pay_rec FROM public.payments WHERE order_id = v_order_id;
  ASSERT v_pay_rec.status = 'completed', 'Assertion Failed: payment must transition to completed';
  PERFORM public._log_test_pass('Admin Verification', 'Payment transitions to completed upon UTR approval');

  ASSERT v_pay_rec.paid_at IS NOT NULL, 'Assertion Failed: paid_at must be populated';
  PERFORM public._log_test_pass('Admin Verification', 'Payment paid_at timestamp is populated');

  -- ── Test J: Paid Processing Cancellation (Does NOT automatically restore inventory) ──
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, TRUE);
  PERFORM public.cancel_order(v_order_id);

  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id;
  ASSERT v_order_rec.status = 'cancelled', 'Assertion Failed: Paid order is cancelled';
  PERFORM public._log_test_pass('Cancellation', 'Paid processing order is cancelled');

  SELECT * INTO v_pay_rec FROM public.payments WHERE order_id = v_order_id;
  ASSERT v_pay_rec.status = 'completed',
    'Assertion Failed: Completed payment must NOT be marked failed upon order cancellation';
  PERFORM public._log_test_pass('Cancellation', 'Completed payment NOT marked failed upon order cancellation');

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before,
    'Assertion Failed: Paid processing cancellation must NOT restore inventory before physical return';
  PERFORM public._log_test_pass('Cancellation', 'Paid processing cancellation does NOT restore inventory');

  -- ── Test J2: Cancelled Orders Cannot Be Reopened or Restored Twice ──
  BEGIN
    UPDATE public.orders SET status = 'pending' WHERE id = v_order_id;
  EXCEPTION WHEN OTHERS THEN
    v_reopen_pending_failed := TRUE;
  END;
  ASSERT v_reopen_pending_failed = TRUE,
    'Assertion Failed: Cancelled order cannot be reopened to pending';
  PERFORM public._log_test_pass('Order Lifecycle', 'Cancelled order cannot be reopened to pending');

  BEGIN
    UPDATE public.orders SET status = 'processing' WHERE id = v_order_id;
  EXCEPTION WHEN OTHERS THEN
    v_reopen_processing_failed := TRUE;
  END;
  ASSERT v_reopen_processing_failed = TRUE,
    'Assertion Failed: Cancelled order cannot be reopened to processing';
  PERFORM public._log_test_pass('Order Lifecycle', 'Cancelled order cannot be reopened to processing');

  BEGIN
    UPDATE public.orders SET status = 'shipped' WHERE id = v_order_id;
  EXCEPTION WHEN OTHERS THEN
    v_reopen_shipped_failed := TRUE;
  END;
  ASSERT v_reopen_shipped_failed = TRUE,
    'Assertion Failed: Cancelled order cannot be reopened to shipped';
  PERFORM public._log_test_pass('Order Lifecycle', 'Cancelled order cannot be reopened to shipped');

  BEGIN
    UPDATE public.orders SET status = 'delivered' WHERE id = v_order_id;
  EXCEPTION WHEN OTHERS THEN
    v_reopen_delivered_failed := TRUE;
  END;
  ASSERT v_reopen_delivered_failed = TRUE,
    'Assertion Failed: Cancelled order cannot be reopened to delivered';
  PERFORM public._log_test_pass('Order Lifecycle', 'Cancelled order cannot be reopened to delivered');

  -- ── Test J3: Unpaid Pending Cancellation Restores Inventory Exactly Once ──
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;

  INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (v_cart_id, v_prod_500_id, 2);
  v_order_retry_id := public.place_order(v_address_id, 'Unpaid cancellation test', NULL, 'phonepe', 'idemp-unpaid-cancel');

  -- Stock was decremented by 2
  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before - 2, 'Assertion Failed: stock must be decremented by 2';

  -- Customer cancels unpaid pending order -> trigger MUST restore 2 units
  PERFORM public.cancel_order(v_order_retry_id);

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before,
    'Assertion Failed: Unpaid pending cancellation must restore inventory exactly once';
  PERFORM public._log_test_pass('Cancellation', 'Unpaid pending cancellation restores inventory exactly once');

  -- Repeated cancellation attempt on already cancelled order -> must be rejected
  BEGIN
    PERFORM public.cancel_order(v_order_retry_id);
  EXCEPTION WHEN OTHERS THEN
    v_repeat_cancel_failed := TRUE;
  END;
  ASSERT v_repeat_cancel_failed = TRUE, 'Assertion Failed: Repeated cancel_order must be rejected';
  PERFORM public._log_test_pass('Cancellation', 'Repeated cancel_order invocation is rejected');

  -- Even if direct trigger fired via UPDATE, inventory must NOT be restored twice
  UPDATE public.orders SET status = 'cancelled' WHERE id = v_order_retry_id;
  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before,
    'Assertion Failed: Repeated cancellation status update must NOT restore inventory twice';
  PERFORM public._log_test_pass('Cancellation', 'Repeated cancellation update cannot restore inventory twice');

  -- ── Test K: Refund Validations (Pending vs Completed vs Repeat vs Restock Flag) ──
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, TRUE);

  BEGIN
    PERFORM public.admin_record_refund(v_order_id, '   ', 'Empty ref', FALSE);
  EXCEPTION WHEN OTHERS THEN
    v_empty_ref_failed := TRUE;
  END;
  ASSERT v_empty_ref_failed = TRUE,
    'Assertion Failed: admin_record_refund must reject empty refund reference';
  PERFORM public._log_test_pass('Refunds', 'admin_record_refund rejects empty refund reference');

  -- Restocking without admin inspection notes -> must fail
  BEGIN
    PERFORM public.admin_record_refund(v_order_id, 'REF-UPI-NONOTES', '   ', TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_missing_notes_failed := TRUE;
  END;
  ASSERT v_missing_notes_failed = TRUE,
    'Assertion Failed: admin_record_refund must reject restock_inventory = TRUE without physical inspection notes';
  PERFORM public._log_test_pass('Refunds', 'admin_record_refund rejects restocking without physical inspection notes');

  -- Restocking without approved physical return inspection -> must fail (Option B)
  BEGIN
    PERFORM public.admin_record_refund(v_order_id, 'REF-UPI-NOINSP', 'Missing inspection attempt', TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_missing_insp_failed := TRUE;
  END;
  ASSERT v_missing_insp_failed = TRUE,
    'Assertion Failed: admin_record_refund must reject restock_inventory = TRUE when no approved inspection exists';
  PERFORM public._log_test_pass('Refunds', 'admin_record_refund rejects restocking when no inspection exists');

  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (gen_random_uuid(), v_user_id, 'cancelled', 500.00, 599.00)
  RETURNING id INTO v_unsubmitted_order_id;

  INSERT INTO public.payments (id, order_id, provider, amount, status)
  VALUES (gen_random_uuid(), v_unsubmitted_order_id, 'phonepe', 599.00, 'pending');

  BEGIN
    PERFORM public.admin_record_refund(v_unsubmitted_order_id, 'REF-FAIL', 'Pending order refund', FALSE);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg LIKE '%Cannot refund payment in status pending%' THEN
      v_pending_refund_failed := TRUE;
    END IF;
  END;
  ASSERT v_pending_refund_failed = TRUE,
    'Assertion Failed: admin_record_refund must reject non-completed (pending) payment specifically';
  PERFORM public._log_test_pass('Refunds', 'admin_record_refund rejects non-completed (pending) payment');

  -- Create and approve physical return inspection for delivered order (Option B)
  v_ret_order_id := gen_random_uuid();

  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (v_ret_order_id, v_user_id, 'delivered', 500.00, 599.00);

  INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price)
  VALUES (gen_random_uuid(), v_ret_order_id, v_prod_500_id, 'Product 500 Delivered', 1, 500.00, 500.00)
  RETURNING id INTO v_insp_item_id;

  INSERT INTO public.payments (id, order_id, provider, provider_payment_id, amount, status)
  VALUES (gen_random_uuid(), v_ret_order_id, 'phonepe', '987654321098', 599.00, 'completed');

  v_insp_id := public.admin_create_return_inspection(v_ret_order_id, v_insp_item_id, 1, 'Return received at warehouse');
  PERFORM public.admin_complete_return_inspection(v_insp_id, 'passed', 1, 'good', 'Physical inspection verified intact', FALSE);

  -- Refund completed payment on returned delivered order -> succeeds legitimately without trigger error
  v_refund_res := public.admin_record_refund(v_ret_order_id, 'REF-UPI-776655', 'Returned item refunded to bank', TRUE);
  ASSERT (v_refund_res->>'payment_status') = 'refunded', 'Assertion Failed: payment status must be refunded';
  PERFORM public._log_test_pass('Refunds', 'Refund completed payment succeeds without trigger error');

  SELECT * INTO v_pay_rec FROM public.payments WHERE order_id = v_ret_order_id;
  ASSERT v_pay_rec.status = 'refunded', 'Assertion Failed: payments.status must be refunded';
  PERFORM public._log_test_pass('Refunds', 'Payment status is refunded');

  ASSERT v_pay_rec.refund_reference = 'REF-UPI-776655',
    'Assertion Failed: payments.refund_reference must store dedicated refund reference';
  PERFORM public._log_test_pass('Refunds', 'Dedicated refund_reference column stores refund reference');

  ASSERT v_pay_rec.provider_payment_id = '987654321098',
    'Assertion Failed: payments.provider_payment_id must preserve original UTR without mutation';
  PERFORM public._log_test_pass('Refunds', 'Original UTR provider_payment_id preserved without mutation');

  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_ret_order_id;
  ASSERT v_order_rec.status = 'refunded', 'Assertion Failed: orders.status must be refunded';
  PERFORM public._log_test_pass('Refunds', 'Order status is transitioned to refunded');

  -- 4. Test refund with restock_inventory = FALSE (with real line items) -> must NOT restore inventory
  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (gen_random_uuid(), v_user_id, 'cancelled', 1000.00, 1000.00)
  RETURNING id INTO v_paid_cancel_norestock_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  VALUES (v_paid_cancel_norestock_id, v_prod_500_id, 'Product 500', 2, 500.00, 1000.00);

  INSERT INTO public.payments (id, order_id, provider, amount, status)
  VALUES (gen_random_uuid(), v_paid_cancel_norestock_id, 'phonepe', 1000.00, 'completed');

  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;

  v_refund_res := public.admin_record_refund(v_paid_cancel_norestock_id, 'REF-NO-RESTOCK', 'Refund without physical return', FALSE);
  ASSERT (v_refund_res->>'payment_status') = 'refunded', 'Assertion Failed: payment status must be refunded';
  ASSERT (v_refund_res->>'inventory_restocked')::boolean = FALSE, 'Assertion Failed: inventory_restocked flag must be FALSE';

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before,
    'Assertion Failed: Refund with restock_inventory = FALSE must NOT automatically restore inventory';
  PERFORM public._log_test_pass('Refunds', 'Refund with restock_inventory = FALSE does NOT restore inventory');

  -- 5. Test refund with restock_inventory = TRUE (following physical return inspection) -> MUST restore inventory
  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (gen_random_uuid(), v_user_id, 'delivered', 1500.00, 1500.00)
  RETURNING id INTO v_paid_cancel_restock_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  VALUES (v_paid_cancel_restock_id, v_prod_500_id, 'Product 500', 3, 500.00, 1500.00);

  INSERT INTO public.payments (id, order_id, provider, amount, status)
  VALUES (gen_random_uuid(), v_paid_cancel_restock_id, 'phonepe', 1500.00, 'completed');

  SELECT id INTO v_insp_item_id FROM public.order_items WHERE order_id = v_paid_cancel_restock_id LIMIT 1;
  v_insp_id := public.admin_create_return_inspection(v_paid_cancel_restock_id, v_insp_item_id, 3, 'Full return receipt');
  PERFORM public.admin_complete_return_inspection(v_insp_id, 'passed', 3, 'good', 'All 3 items inspected intact', FALSE);

  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;

  v_refund_res := public.admin_record_refund(v_paid_cancel_restock_id, 'REF-PHYSICAL-RESTOCK', 'Physical items inspected & restocked', TRUE);
  ASSERT (v_refund_res->>'payment_status') = 'refunded', 'Assertion Failed: payment status must be refunded';
  ASSERT (v_refund_res->>'inventory_restocked')::boolean = TRUE, 'Assertion Failed: inventory_restocked flag must be TRUE';

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before + 3,
    'Assertion Failed: Refund with restock_inventory = TRUE must restore inventory by exactly the line items quantity (expected +3)';
  PERFORM public._log_test_pass('Refunds', 'Refund with restock_inventory = TRUE restores inventory by exact item quantity (+3)');

  -- 6. Repeated refund attempt on restocked order -> must fail and cannot restore inventory a second time
  BEGIN
    PERFORM public.admin_record_refund(v_paid_cancel_restock_id, 'REF-REPEAT-RESTOCK', 'Duplicate restock attempt', TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_repeat_refund_norestock_failed := TRUE;
  END;
  ASSERT v_repeat_refund_norestock_failed = TRUE,
    'Assertion Failed: Repeated refund attempt on restocked order must be rejected';
  PERFORM public._log_test_pass('Refunds', 'Repeated refund attempt is rejected');

  -- Verify inventory quantity did not change on failed duplicate refund attempt
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_before = v_stock_after,
    'Assertion Failed: Repeated refund attempt must NOT restore inventory a second time';
  PERFORM public._log_test_pass('Refunds', 'Repeated refund attempt cannot restore inventory twice');

  -- 7. Repeated refund attempt on ordinary order -> must fail
  BEGIN
    PERFORM public.admin_record_refund(v_ret_order_id, 'REF-UPI-REPEAT', 'Duplicate attempt', FALSE);
  EXCEPTION WHEN OTHERS THEN
    v_repeat_refund_failed := TRUE;
  END;
  ASSERT v_repeat_refund_failed = TRUE,
    'Assertion Failed: Repeated refund attempt must be rejected';
  PERFORM public._log_test_pass('Refunds', 'Repeated refund attempt on non-restocked order is rejected');

  -- 8. Missing inventory row causes transaction rollback in admin_record_refund
  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (gen_random_uuid(), v_user_id, 'delivered', 350.00, 350.00)
  RETURNING id INTO v_ord_missing_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  VALUES (v_ord_missing_id, v_prod_no_inv_id, 'Product No Inventory', 1, 350.00, 350.00);

  INSERT INTO public.payments (id, order_id, provider, amount, status)
  VALUES (gen_random_uuid(), v_ord_missing_id, 'phonepe', 350.00, 'completed');

  SELECT id INTO v_insp_item_id FROM public.order_items WHERE order_id = v_ord_missing_id LIMIT 1;
  v_insp_id := public.admin_create_return_inspection(v_ord_missing_id, v_insp_item_id, 1, 'Return for missing inventory product');
  PERFORM public.admin_complete_return_inspection(v_insp_id, 'passed', 1, 'good', 'Good item inspection', FALSE);

  BEGIN
    PERFORM public.admin_record_refund(v_ord_missing_id, 'REF-FAIL-INV', 'Missing inventory test', TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_missing_inv_failed := TRUE;
  END;

  ASSERT v_missing_inv_failed = TRUE,
    'Assertion Failed: admin_record_refund must fail if inventory row is missing';
  PERFORM public._log_test_pass('Refunds', 'admin_record_refund fails when inventory row is missing');

  -- Verify rollback: payment remains completed, order remains delivered
  ASSERT (SELECT status FROM public.payments WHERE order_id = v_ord_missing_id) = 'completed',
    'Assertion Failed: Transaction rollback must leave payment status completed';
  ASSERT (SELECT status FROM public.orders WHERE id = v_ord_missing_id) = 'delivered',
    'Assertion Failed: Transaction rollback must leave order status delivered';
  PERFORM public._log_test_pass('Refunds', 'admin_record_refund transaction cleanly rolls back on missing inventory');

  -- 9. Repeated order lines for the same product consolidated and restocked correctly
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;

  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (gen_random_uuid(), v_user_id, 'delivered', 1500.00, 1500.00)
  RETURNING id INTO v_ord_multi_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  VALUES
    (v_ord_multi_id, v_prod_500_id, 'Product 500 line 1', 2, 500.00, 1000.00),
    (v_ord_multi_id, v_prod_500_id, 'Product 500 line 2', 1, 500.00, 500.00);

  INSERT INTO public.payments (id, order_id, provider, amount, status)
  VALUES (gen_random_uuid(), v_ord_multi_id, 'phonepe', 1500.00, 'completed');

  FOR v_item IN SELECT id, quantity FROM public.order_items WHERE order_id = v_ord_multi_id LOOP
    v_insp_id := public.admin_create_return_inspection(v_ord_multi_id, v_item.id, v_item.quantity, 'Multi-line receipt');
    PERFORM public.admin_complete_return_inspection(v_insp_id, 'passed', v_item.quantity, 'good', 'Intact', FALSE);
  END LOOP;

  PERFORM public.admin_record_refund(v_ord_multi_id, 'REF-MULTI-LINE', 'Physical return multi-line', TRUE);

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before + 3,
    'Assertion Failed: Multi-line restock must restore consolidated sum (stock_before + 3)';
  PERFORM public._log_test_pass('Refunds', 'Multi-line order items consolidated and restocked correctly (+3 units)');

  -- ── Test L: Complete Shipping Boundary Matrix & Coupon Gross Subtotal Rule ──
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, TRUE);

  -- Case 1: Gross subtotal exactly ₹999 -> Free shipping (₹0.00)
  INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (v_cart_id, v_prod_999_id, 1);
  v_order_id := public.place_order(v_address_id, 'Exact 999 boundary order', NULL, 'cod', 'idemp-exact-999');
  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id;
  ASSERT v_order_rec.subtotal = 999.00, 'Assertion Failed: subtotal must be 999.00';
  ASSERT v_order_rec.shipping_amount = 0.00, 'Assertion Failed: gross subtotal = 999 must qualify for free shipping (0.00)';
  ASSERT v_order_rec.total_amount = 999.00, 'Assertion Failed: total must be 999.00';
  PERFORM public._log_test_pass('Shipping Matrix', 'Gross subtotal exactly 999.00 receives free shipping (0.00)');

  -- Case 2: Gross subtotal above ₹999 (₹1,200) -> Free shipping (₹0.00)
  INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (v_cart_id, v_prod_1200_id, 1);
  v_order_id := public.place_order(v_address_id, 'Above 999 order', NULL, 'cod', 'idemp-above-999');
  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id;
  ASSERT v_order_rec.subtotal = 1200.00, 'Assertion Failed: subtotal must be 1200.00';
  ASSERT v_order_rec.shipping_amount = 0.00, 'Assertion Failed: gross subtotal > 999 must qualify for free shipping (0.00)';
  ASSERT v_order_rec.total_amount = 1200.00, 'Assertion Failed: total must be 1200.00';
  PERFORM public._log_test_pass('Shipping Matrix', 'Gross subtotal above 999.00 receives free shipping (0.00)');

  -- Case 3: Coupon reduces payable below ₹999 while gross subtotal remains >= ₹999
  -- Product is ₹1,000.00. Coupon FLAT100 reduces by ₹100 to ₹900.00.
  -- Rule: Free shipping evaluates on gross product subtotal BEFORE discount!
  -- Shipping must remain ₹0.00! Total must be GREATEST(0, 1000 - 100 + 0) = 900.00!
  INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (v_cart_id, v_prod_1000_id, 1);
  v_order_id := public.place_order(v_address_id, 'Gross 1000 with coupon', 'FLAT100', 'cod', 'idemp-gross-1000-coupon');
  SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id;
  ASSERT v_order_rec.subtotal = 1000.00, 'Assertion Failed: gross subtotal must be 1000.00';
  ASSERT v_order_rec.discount_amount = 100.00, 'Assertion Failed: discount amount must be 100.00';
  ASSERT v_order_rec.shipping_amount = 0.00,
    'Assertion Failed: Shipping must be 0.00 when gross subtotal >= 999 even if net subtotal is below 999';
  ASSERT v_order_rec.total_amount = 900.00,
    'Assertion Failed: Total amount must be exactly GREATEST(0, subtotal - discount + shipping) = 900.00';
  PERFORM public._log_test_pass('Shipping Matrix', 'Coupon reducing payable below 999 preserves free shipping (gross >= 999)');
  PERFORM public._log_test_pass('Shipping Matrix', 'Formula confirmed: GREATEST(0, subtotal - discount + shipping) = 900.00');

  -- ── Test M: COD Collection Confirmation After Delivery ──
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, TRUE);
  BEGIN
    PERFORM public.admin_confirm_cod_payment(v_order_id, 'Pre-delivery attempt');
  EXCEPTION WHEN OTHERS THEN
    v_pre_delivery_failed := TRUE;
  END;
  ASSERT v_pre_delivery_failed = TRUE,
    'Assertion Failed: admin_confirm_cod_payment must fail for orders that are not delivered';
  PERFORM public._log_test_pass('COD Collection', 'admin_confirm_cod_payment fails before order is delivered');

  UPDATE public.orders SET status = 'delivered' WHERE id = v_order_id;

  v_cod_res := public.admin_confirm_cod_payment(v_order_id, 'Cash collected by delivery agent');
  ASSERT (v_cod_res->>'payment_status') = 'completed', 'Assertion Failed: COD payment must be marked completed';
  PERFORM public._log_test_pass('COD Collection', 'COD payment marked completed after order delivered');

  SELECT * INTO v_pay_rec FROM public.payments WHERE order_id = v_order_id;
  ASSERT v_pay_rec.status = 'completed', 'Assertion Failed: COD payment status must be completed';
  PERFORM public._log_test_pass('COD Collection', 'Payment status marked completed for collected COD');

  -- ── Test N: Physical Return Inspection & Restocking Suite (Option B) ──
  -- N-1: Partial returns restore only approved quantities
  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (gen_random_uuid(), v_user_id, 'delivered', 1500.00, 1500.00)
  RETURNING id INTO v_ord_partial_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  VALUES (v_ord_partial_id, v_prod_500_id, 'Product 500 partial', 3, 500.00, 1500.00)
  RETURNING id INTO v_item_partial_id;

  INSERT INTO public.payments (id, order_id, provider, amount, status)
  VALUES (gen_random_uuid(), v_ord_partial_id, 'phonepe', 1500.00, 'completed');

  -- Customer returns 2 units (out of 3 purchased)
  v_insp_partial_id := public.admin_create_return_inspection(v_ord_partial_id, v_item_partial_id, 2, 'Customer returned 2 units');

  -- Admin inspects: 1 intact unit approved, 1 damaged unit rejected
  v_insp_res := public.admin_complete_return_inspection(
    v_insp_partial_id, 'partially_passed', 1, 'damaged', '1 intact approved for shelf; 1 damaged rejected', FALSE
  );
  ASSERT (v_insp_res->>'approved_quantity')::int = 1, 'Assertion Failed: approved_quantity must be 1';
  PERFORM public._log_test_pass('Physical Returns', 'Inspection approves partial quantity (1 of 2 units)');

  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;

  -- Admin calls refund with restock_inventory = TRUE
  v_refund_res := public.admin_record_refund(v_ord_partial_id, 'REF-PARTIAL-RETURN', 'Partial return processed', TRUE);
  ASSERT (v_refund_res->>'payment_status') = 'refunded', 'Assertion Failed: payment status must be refunded';
  ASSERT (v_refund_res->>'inventory_restocked')::boolean = TRUE, 'Assertion Failed: inventory_restocked must be true';

  -- Stock must increase by EXACTLY 1 (the approved quantity, not returned 2, not order 3)
  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before + 1,
    'Assertion Failed: Partial return must restore ONLY approved quantity (+1)';
  PERFORM public._log_test_pass('Physical Returns', 'Partial return restores exactly approved quantity (+1)');

  -- N-2: Duplicate restocking strictly prevented
  BEGIN
    PERFORM public.admin_record_refund(v_ord_partial_id, 'REF-PARTIAL-DUP', 'Duplicate restock attempt', TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_dup_restock_failed := TRUE;
  END;
  ASSERT v_dup_restock_failed = TRUE,
    'Assertion Failed: admin_record_refund must reject duplicate restocking when no unrestocked inspection remains';
  PERFORM public._log_test_pass('Physical Returns', 'Duplicate restocking prevented via admin_record_refund');

  -- Also verify inspection cannot be restocked directly after being restocked
  BEGIN
    PERFORM public.admin_complete_return_inspection(
      v_insp_partial_id, 'partially_passed', 1, 'good', 'Direct duplicate restock attempt', TRUE
    );
  EXCEPTION WHEN OTHERS THEN
    v_dup_restock_failed := TRUE;
  END;
  ASSERT v_dup_restock_failed = TRUE,
    'Assertion Failed: admin_complete_return_inspection must reject modifying/restocking already-restocked inspection';
  PERFORM public._log_test_pass('Physical Returns', 'Already-restocked inspection cannot be restocked or modified again');

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before + 1,
    'Assertion Failed: Duplicate restock attempts must not alter inventory';
  PERFORM public._log_test_pass('Physical Returns', 'Inventory unchanged after duplicate restock attempts');

  -- N-3: Rejected inspection does not restore inventory
  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (gen_random_uuid(), v_user_id, 'delivered', 500.00, 500.00)
  RETURNING id INTO v_ord_rejected_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  VALUES (v_ord_rejected_id, v_prod_500_id, 'Product 500 rejected', 1, 500.00, 500.00)
  RETURNING id INTO v_item_rejected_id;

  INSERT INTO public.payments (id, order_id, provider, amount, status)
  VALUES (gen_random_uuid(), v_ord_rejected_id, 'phonepe', 500.00, 'completed');

  v_insp_rejected_id := public.admin_create_return_inspection(v_ord_rejected_id, v_item_rejected_id, 1, 'Customer returned damaged item');

  -- Admin rejects inspection (outcome = 'rejected', approved_quantity = 0)
  PERFORM public.admin_complete_return_inspection(
    v_insp_rejected_id, 'rejected', 0, 'unusable', 'Destroyed by customer negligence; not restockable', FALSE
  );
  PERFORM public._log_test_pass('Physical Returns', 'Return inspection recorded as rejected (unusable condition)');

  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_500_id;

  -- Calling admin_record_refund with restock_inventory = TRUE on rejected inspection must FAIL
  BEGIN
    PERFORM public.admin_record_refund(v_ord_rejected_id, 'REF-REJECT-FAIL', 'Restock attempt on rejected', TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_rejected_restock_failed := TRUE;
  END;
  ASSERT v_rejected_restock_failed = TRUE,
    'Assertion Failed: Restock must fail when inspection outcome is rejected';
  PERFORM public._log_test_pass('Physical Returns', 'Restocking blocked for rejected return inspection');

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_500_id;
  ASSERT v_stock_after = v_stock_before,
    'Assertion Failed: Rejected inspection must NOT restore inventory';
  PERFORM public._log_test_pass('Physical Returns', 'Zero inventory restored for rejected inspection');

  -- Financial refund without restocking succeeds independently
  v_refund_res := public.admin_record_refund(v_ord_rejected_id, 'REF-COURTESY-REFUND', 'Courtesy financial refund granted', FALSE);
  ASSERT (v_refund_res->>'payment_status') = 'refunded', 'Assertion Failed: financial refund must succeed';
  ASSERT (v_refund_res->>'inventory_restocked')::boolean = FALSE, 'Assertion Failed: inventory must not be restocked';
  PERFORM public._log_test_pass('Physical Returns', 'Financial refund recorded independently without inventory restocking');

END $$;

-- ─────────────────────────────────────────────────────────────────
-- 15. Physical Return Constraint & Helper Verification Suite
-- ─────────────────────────────────────────────────────────────────

-- Verify chk_outcome_qty constraint on physical_return_inspections
DO $$
DECLARE
  v_order_id UUID := gen_random_uuid();
  v_item_id UUID := gen_random_uuid();
  v_prod_id UUID;
  v_user_id UUID := '11111111-1111-4111-8111-111111111111';
  v_chk_failed BOOLEAN;
  v_insp_id UUID;
  v_restocked_units INT;
  v_stock_before INT;
  v_stock_after INT;
BEGIN
  SELECT product_id INTO v_prod_id FROM public.inventory WHERE variant_id IS NULL LIMIT 1;

  INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
  VALUES (v_order_id, v_user_id, 'delivered', 100.00, 100.00);

  INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price)
  VALUES (v_item_id, v_order_id, v_prod_id, 'Test Product', 5, 20.00, 100.00);

  -- 1. pending with approved_quantity > 0 must violate chk_outcome_qty
  v_chk_failed := FALSE;
  BEGIN
    INSERT INTO public.physical_return_inspections (
      order_id, order_item_id, product_id, returned_quantity, approved_quantity, inspection_outcome
    ) VALUES (v_order_id, v_item_id, v_prod_id, 2, 1, 'pending');
  EXCEPTION WHEN check_violation THEN
    v_chk_failed := TRUE;
  END;
  ASSERT v_chk_failed = TRUE, 'Assertion Failed: pending outcome with approved_quantity > 0 must violate chk_outcome_qty';
  PERFORM public._log_test_pass('Constraints', 'chk_outcome_qty rejects pending with approved_quantity > 0');

  -- 2. rejected with approved_quantity > 0 must violate chk_outcome_qty
  v_chk_failed := FALSE;
  BEGIN
    INSERT INTO public.physical_return_inspections (
      order_id, order_item_id, product_id, returned_quantity, approved_quantity, inspection_outcome
    ) VALUES (v_order_id, v_item_id, v_prod_id, 2, 1, 'rejected');
  EXCEPTION WHEN check_violation THEN
    v_chk_failed := TRUE;
  END;
  ASSERT v_chk_failed = TRUE, 'Assertion Failed: rejected outcome with approved_quantity > 0 must violate chk_outcome_qty';
  PERFORM public._log_test_pass('Constraints', 'chk_outcome_qty rejects rejected with approved_quantity > 0');

  -- 3. passed with approved_quantity != returned_quantity must violate chk_outcome_qty
  v_chk_failed := FALSE;
  BEGIN
    INSERT INTO public.physical_return_inspections (
      order_id, order_item_id, product_id, returned_quantity, approved_quantity, inspection_outcome
    ) VALUES (v_order_id, v_item_id, v_prod_id, 2, 1, 'passed');
  EXCEPTION WHEN check_violation THEN
    v_chk_failed := TRUE;
  END;
  ASSERT v_chk_failed = TRUE, 'Assertion Failed: passed outcome with approved_quantity != returned_quantity must violate chk_outcome_qty';
  PERFORM public._log_test_pass('Constraints', 'chk_outcome_qty rejects passed with approved_quantity != returned_quantity');

  -- 4. partially_passed with approved_quantity = 0 must violate chk_outcome_qty
  v_chk_failed := FALSE;
  BEGIN
    INSERT INTO public.physical_return_inspections (
      order_id, order_item_id, product_id, returned_quantity, approved_quantity, inspection_outcome
    ) VALUES (v_order_id, v_item_id, v_prod_id, 2, 0, 'partially_passed');
  EXCEPTION WHEN check_violation THEN
    v_chk_failed := TRUE;
  END;
  ASSERT v_chk_failed = TRUE, 'Assertion Failed: partially_passed outcome with approved_quantity = 0 must violate chk_outcome_qty';
  PERFORM public._log_test_pass('Constraints', 'chk_outcome_qty rejects partially_passed with approved_quantity = 0');

  -- 5. partially_passed with approved_quantity >= returned_quantity must violate chk_outcome_qty
  v_chk_failed := FALSE;
  BEGIN
    INSERT INTO public.physical_return_inspections (
      order_id, order_item_id, product_id, returned_quantity, approved_quantity, inspection_outcome
    ) VALUES (v_order_id, v_item_id, v_prod_id, 2, 2, 'partially_passed');
  EXCEPTION WHEN check_violation THEN
    v_chk_failed := TRUE;
  END;
  ASSERT v_chk_failed = TRUE, 'Assertion Failed: partially_passed outcome with approved_quantity >= returned_quantity must violate chk_outcome_qty';
  PERFORM public._log_test_pass('Constraints', 'chk_outcome_qty rejects partially_passed with approved_quantity >= returned_quantity');

  -- 6. Valid partially_passed (0 < approved < returned) must succeed
  INSERT INTO public.physical_return_inspections (
    order_id, order_item_id, product_id, returned_quantity, approved_quantity, inspection_outcome
  ) VALUES (v_order_id, v_item_id, v_prod_id, 3, 2, 'partially_passed');
  PERFORM public._log_test_pass('Constraints', 'chk_outcome_qty accepts valid partially_passed row');

  -- 7. Cumulative return quantity check in admin_create_return_inspection:
  -- Item quantity = 5. Currently returned_quantity = 3 in previous insert.
  -- Attempting to create an inspection with returned_quantity = 3 (3 + 3 = 6 > 5) must fail.
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', TRUE);
  v_chk_failed := FALSE;
  BEGIN
    PERFORM public.admin_create_return_inspection(v_order_id, v_item_id, 3, 'Second return exceeding item total');
  EXCEPTION WHEN OTHERS THEN
    v_chk_failed := TRUE;
  END;
  ASSERT v_chk_failed = TRUE, 'Assertion Failed: Cumulative returned quantity exceeding purchased quantity must be rejected';
  PERFORM public._log_test_pass('Physical Returns', 'Cumulative returned quantity exceeding purchased quantity rejected');

  -- 8. Direct test of shared helper _restock_approved_return_inspections(UUID):
  SELECT id INTO v_insp_id FROM public.physical_return_inspections WHERE order_id = v_order_id LIMIT 1;
  SELECT quantity INTO v_stock_before FROM public.inventory WHERE product_id = v_prod_id;

  v_restocked_units := public._restock_approved_return_inspections(v_order_id);
  ASSERT v_restocked_units = 2, 'Assertion Failed: _restock_approved_return_inspections must return 2 restocked units';
  PERFORM public._log_test_pass('Physical Returns', '_restock_approved_return_inspections restocks approved units (+2)');

  SELECT quantity INTO v_stock_after FROM public.inventory WHERE product_id = v_prod_id;
  ASSERT v_stock_after = v_stock_before + 2, 'Assertion Failed: Inventory must increase by 2';
  PERFORM public._log_test_pass('Physical Returns', 'Inventory increased by exact approved count via helper');

  -- Calling again on same order returns 0 because restocked = TRUE
  v_restocked_units := public._restock_approved_return_inspections(v_order_id);
  ASSERT v_restocked_units = 0, 'Assertion Failed: Second invocation of _restock_approved_return_inspections must restock 0';
  PERFORM public._log_test_pass('Physical Returns', 'Duplicate invocation of _restock_approved_return_inspections restocks 0 units');

  -- 9. receipt_confirmed = FALSE prevents restocking
  DECLARE
    v_unconf_order UUID := gen_random_uuid();
    v_unconf_item UUID := gen_random_uuid();
    v_unconf_insp UUID;
    v_unconf_restocked INT;
  BEGIN
    INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
    VALUES (v_unconf_order, v_user_id, 'delivered', 50.00, 50.00);

    INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES (v_unconf_item, v_unconf_order, v_prod_id, 'Unconfirmed Receipt Prod', 2, 25.00, 50.00);

    INSERT INTO public.physical_return_inspections (
      order_id, order_item_id, product_id, returned_quantity, approved_quantity,
      inspection_outcome, condition, receipt_confirmed, restocked
    ) VALUES (
      v_unconf_order, v_unconf_item, v_prod_id, 2, 2,
      'passed', 'good', FALSE, FALSE
    ) RETURNING id INTO v_unconf_insp;

    -- Calling restocking helper on unconfirmed receipt must return 0
    v_unconf_restocked := public._restock_approved_return_inspections(v_unconf_order);
    ASSERT v_unconf_restocked = 0, 'Assertion Failed: Unconfirmed receipt must NOT be restocked';
    PERFORM public._log_test_pass('Physical Returns', 'Unconfirmed receipt (receipt_confirmed=false) skipped by restocking helper');

    -- Inspection must still be restocked = FALSE
    ASSERT (SELECT restocked FROM public.physical_return_inspections WHERE id = v_unconf_insp) = FALSE,
      'Assertion Failed: Unconfirmed inspection must remain restocked = FALSE';
    PERFORM public._log_test_pass('Physical Returns', 'Unconfirmed inspection remains restocked=false');
  END;

  -- 10. Only exact locked inspections are marked restocked
  DECLARE
    v_mix_order UUID := gen_random_uuid();
    v_mix_item UUID := gen_random_uuid();
    v_mix_insp1 UUID;
    v_mix_insp2 UUID;
    v_mix_restocked INT;
  BEGIN
    INSERT INTO public.orders (id, user_id, status, subtotal, total_amount)
    VALUES (v_mix_order, v_user_id, 'delivered', 100.00, 100.00);

    INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES (v_mix_item, v_mix_order, v_prod_id, 'Mix Item', 4, 25.00, 100.00);

    -- Insp 1: passed, 2 units
    INSERT INTO public.physical_return_inspections (
      order_id, order_item_id, product_id, returned_quantity, approved_quantity,
      inspection_outcome, condition, receipt_confirmed, restocked
    ) VALUES (
      v_mix_order, v_mix_item, v_prod_id, 2, 2,
      'passed', 'good', TRUE, FALSE
    ) RETURNING id INTO v_mix_insp1;

    -- Insp 2: pending, 0 units
    INSERT INTO public.physical_return_inspections (
      order_id, order_item_id, product_id, returned_quantity, approved_quantity,
      inspection_outcome, condition, receipt_confirmed, restocked
    ) VALUES (
      v_mix_order, v_mix_item, v_prod_id, 1, 0,
      'pending', 'uninspected', TRUE, FALSE
    ) RETURNING id INTO v_mix_insp2;

    v_mix_restocked := public._restock_approved_return_inspections(v_mix_order);
    ASSERT v_mix_restocked = 2, 'Assertion Failed: Mixed order must restock exactly 2 units from passed inspection';
    PERFORM public._log_test_pass('Physical Returns', 'Restocking processes strictly eligible inspection rows (+2 units)');

    -- Insp 1 must be restocked = TRUE
    ASSERT (SELECT restocked FROM public.physical_return_inspections WHERE id = v_mix_insp1) = TRUE,
      'Assertion Failed: Passed inspection must be marked restocked = true';
    PERFORM public._log_test_pass('Physical Returns', 'Passed inspection marked restocked=true');

    -- Insp 2 (pending) must remain restocked = FALSE
    ASSERT (SELECT restocked FROM public.physical_return_inspections WHERE id = v_mix_insp2) = FALSE,
      'Assertion Failed: Pending inspection must NOT be marked restocked';
    PERFORM public._log_test_pass('Physical Returns', 'Pending inspection not processed and remains restocked=false');
  END;

END $$;
