-- ═══════════════════════════════════════════════════════════════════
-- Phase 6C: Database & Business Logic Implementation
-- Order Creation, Shipping Calculations, Concurrency & Idempotency,
-- PhonePe QR Payments, UTR Submissions, Expiry, and COD Lifecycle
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. ADD IDEMPOTENCY KEY AND REFUND REFERENCE COLUMNS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idempotency
  ON public.orders(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Dedicated refund_reference column on payments table (preserves original provider_payment_id intact)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_reference TEXT;

-- ─────────────────────────────────────────────────────────────────
-- 2. CREATE PAYMENT SUBMISSIONS TABLE (UTR AUDIT HISTORY)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id   UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  utr_number   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'submitted'
                 CHECK (status IN ('submitted', 'approved', 'rejected')),
  admin_notes  TEXT,
  reviewed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_order ON public.payment_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_user  ON public.payment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_utr   ON public.payment_submissions(utr_number);

-- Enforce at most one active ('submitted') review per order at any given time
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_submissions_active_pending
  ON public.payment_submissions(order_id)
  WHERE status = 'submitted';

-- Prevent duplicate approval of the same UTR across the platform
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_submissions_approved_utr
  ON public.payment_submissions(utr_number)
  WHERE status = 'approved';

-- Enable and Force Row Level Security
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_submissions FORCE ROW LEVEL SECURITY;

-- Customers can view their own payment submissions
DROP POLICY IF EXISTS "Users view own payment submissions" ON public.payment_submissions;
CREATE POLICY "Users view own payment submissions"
  ON public.payment_submissions FOR SELECT
  USING (auth.uid() = user_id);

-- Admins have full access
DROP POLICY IF EXISTS "Admins full access to payment submissions" ON public.payment_submissions;
CREATE POLICY "Admins full access to payment submissions"
  ON public.payment_submissions FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Explicit Table Privileges:
-- Explicitly revokes all default/inherited privileges from PUBLIC and anon.
-- Explicitly revokes all direct DML write operations (INSERT, UPDATE, DELETE, TRUNCATE) from authenticated users.
-- Submissions and verifications MUST occur exclusively through the SECURITY DEFINER RPCs (submit_phonepe_utr, admin_verify_utr).
REVOKE ALL ON TABLE public.payment_submissions FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_submissions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payment_submissions FROM authenticated;
GRANT SELECT ON TABLE public.payment_submissions TO authenticated;
GRANT ALL ON TABLE public.payment_submissions TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 3. AUTHORITATIVE PLACE_ORDER RPC WITH CONCURRENCY-SAFE IDEMPOTENCY
-- ─────────────────────────────────────────────────────────────────
-- Dependency & Overload Analysis:
-- 1. Baseline database/schema.sql defined place_order(p_address_id UUID, p_notes TEXT DEFAULT NULL).
-- 2. Phase 7.1 defined place_order(p_address_id UUID, p_notes TEXT DEFAULT NULL, p_coupon_code TEXT DEFAULT NULL).
-- 3. If legacy 2-arg or 3-arg functions coexist with the 5-arg function having default parameter values,
--    PostgreSQL encounters 'ERROR: function place_order(...) is not unique' (error 42725: ambiguous_function)
--    and PostgREST fails schema cache lookup.
-- 4. No triggers, views, or database tables depend on place_order. The only caller in the frontend
--    is orderService.js, which invokes the full 5-argument signature:
--    (p_address_id, p_notes, p_coupon_code, p_payment_provider, p_idempotency_key).
-- 5. By safely dropping legacy 2-arg, 3-arg, and 4-arg overloads, any 1, 2, 3, 4, or 5 argument
--    invocation routes unambiguously to this authoritative 5-argument function via its DEFAULT parameter values.
DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT);
DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.place_order(
  p_address_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL,
  p_payment_provider TEXT DEFAULT 'cod',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cart_id UUID;
  v_order_id UUID;
  v_existing_order_id UUID;
  v_clean_idempotency TEXT;
  v_provider TEXT;
  v_subtotal NUMERIC(12,2) := 0;
  v_discount_amount NUMERIC(12,2) := 0;
  v_shipping_amount NUMERIC(12,2) := 0;
  v_total_amount NUMERIC(12,2) := 0;
  v_unit_price NUMERIC(12,2);
  v_product_name TEXT;
  v_stock INT;
  v_item RECORD;
  v_clean_coupon TEXT;
  v_coupon RECORD;
  v_coupon_id UUID := NULL;
  v_items_snapshot JSONB := '[]'::jsonb;
  v_snap_item RECORD;
  v_violated_constraint TEXT;
BEGIN
  -- 1. Authentication check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Idempotency initial pre-check (fast-path before taking locks)
  v_clean_idempotency := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  IF v_clean_idempotency IS NOT NULL THEN
    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE user_id = v_user_id AND idempotency_key = v_clean_idempotency;

    IF v_existing_order_id IS NOT NULL THEN
      RETURN v_existing_order_id;
    END IF;
  END IF;

  -- 3. Validate payment provider
  v_provider := LOWER(TRIM(COALESCE(p_payment_provider, 'cod')));
  IF v_provider NOT IN ('cod', 'phonepe') THEN
    RAISE EXCEPTION 'Invalid payment provider: %. Supported providers are cod, phonepe', p_payment_provider;
  END IF;

  -- 4. Validate delivery address ownership
  IF p_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.addresses
    WHERE id = p_address_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Invalid delivery address';
  END IF;

  -- 5. Lock user cart to serialize concurrent checkout requests for this user
  SELECT id INTO v_cart_id
  FROM public.carts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'Cart not found';
  END IF;

  -- 5b. Concurrency-Safe Recheck: Under the exclusive cart lock, recheck if a
  -- concurrent transaction using the same idempotency key just committed.
  IF v_clean_idempotency IS NOT NULL THEN
    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE user_id = v_user_id AND idempotency_key = v_clean_idempotency;

    IF v_existing_order_id IS NOT NULL THEN
      RETURN v_existing_order_id;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cart_items WHERE cart_id = v_cart_id
  ) THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- 6. Validate items, lock products FOR SHARE, lock inventory FOR UPDATE,
  -- and capture authoritative server-side price snapshot
  FOR v_item IN
    SELECT ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = v_cart_id
    ORDER BY ci.product_id, ci.variant_id
  LOOP
    PERFORM 1 FROM public.products WHERE id = v_item.product_id FOR SHARE;

    IF v_item.variant_id IS NOT NULL THEN
      PERFORM 1 FROM public.product_variants WHERE id = v_item.variant_id FOR SHARE;
    END IF;

    SELECT p.price + COALESCE(pv.price_delta, 0), p.name
      INTO v_unit_price, v_product_name
    FROM public.products p
    LEFT JOIN public.product_variants pv
      ON pv.id = v_item.variant_id AND pv.product_id = p.id
    WHERE p.id = v_item.product_id
      AND p.is_active = TRUE
      AND (v_item.variant_id IS NULL OR pv.id IS NOT NULL);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A cart product or variant is unavailable';
    END IF;

    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Invalid product price';
    END IF;

    SELECT quantity INTO v_stock
    FROM public.inventory
    WHERE product_id = v_item.product_id
      AND variant_id IS NOT DISTINCT FROM v_item.variant_id
    FOR UPDATE;

    IF NOT FOUND OR v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient or unconfigured inventory for product %', v_item.product_id;
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);

    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'product_id', v_item.product_id,
      'variant_id', v_item.variant_id,
      'product_name', v_product_name,
      'unit_price', v_unit_price,
      'quantity', v_item.quantity,
      'total_price', v_unit_price * v_item.quantity
    );
  END LOOP;

  -- 7. Authoritative Shipping Calculation:
  -- Free shipping applies when gross product subtotal is at least ₹999, before coupon discount.
  -- Standard shipping below ₹999 is ₹99.
  IF v_subtotal >= 999.00 OR v_subtotal = 0 THEN
    v_shipping_amount := 0.00;
  ELSE
    v_shipping_amount := 99.00;
  END IF;

  -- 8. Server-side coupon validation & transactional row locking
  v_clean_coupon := NULLIF(TRIM(UPPER(COALESCE(p_coupon_code, ''))), '');
  IF v_clean_coupon IS NOT NULL THEN
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE UPPER(code) = v_clean_coupon
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid coupon code: %', v_clean_coupon;
    END IF;

    IF v_coupon.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Coupon % is not active', v_clean_coupon;
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
      RAISE EXCEPTION 'Coupon % has expired', v_clean_coupon;
    END IF;

    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
      RAISE EXCEPTION 'Coupon % usage limit has been reached', v_clean_coupon;
    END IF;

    IF v_coupon.min_order_value IS NOT NULL AND v_subtotal < v_coupon.min_order_value THEN
      RAISE EXCEPTION 'Order subtotal (₹%) does not meet the minimum requirement of ₹% for coupon %',
        v_subtotal, v_coupon.min_order_value, v_clean_coupon;
    END IF;

    IF v_coupon.discount_type = 'percent' THEN
      v_discount_amount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
    ELSIF v_coupon.discount_type = 'fixed' THEN
      v_discount_amount := LEAST(v_subtotal, v_coupon.discount_value);
    ELSE
      RAISE EXCEPTION 'Unsupported coupon discount type: %', v_coupon.discount_type;
    END IF;

    v_discount_amount := LEAST(v_subtotal, GREATEST(0, v_discount_amount));
    v_coupon_id := v_coupon.id;
    -- Note: Coupon used_count increment is deferred to step 11b (after successful order insertion)
    -- to prevent coupon usage leakage if an idempotency replay occurs.
  END IF;

  -- 9. Authoritative Total Payable Calculation
  v_total_amount := GREATEST(0, v_subtotal - v_discount_amount + v_shipping_amount);

  -- 10. Insert order row with race-condition handling for idempotency
  BEGIN
    INSERT INTO public.orders (
      user_id, address_id, coupon_id, status, subtotal, discount_amount,
      tax_amount, shipping_amount, total_amount, notes, idempotency_key
    )
    VALUES (
      v_user_id, p_address_id, v_coupon_id, 'pending', v_subtotal, v_discount_amount,
      0, v_shipping_amount, v_total_amount, p_notes, v_clean_idempotency
    )
    RETURNING id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    -- Identify the exact constraint that triggered the unique violation
    GET STACKED DIAGNOSTICS v_violated_constraint = CONSTRAINT_NAME;

    -- Return existing order ONLY if the violation was specifically caused by idx_orders_user_idempotency
    IF v_violated_constraint = 'idx_orders_user_idempotency' AND v_clean_idempotency IS NOT NULL THEN
      SELECT id INTO v_existing_order_id
      FROM public.orders
      WHERE user_id = v_user_id AND idempotency_key = v_clean_idempotency;

      IF v_existing_order_id IS NOT NULL THEN
        RETURN v_existing_order_id;
      END IF;
    END IF;

    -- Re-raise every other unrelated unique constraint violation
    RAISE;
  END;

  -- 11. Write order line items and decrement inventory
  FOR v_snap_item IN
    SELECT * FROM jsonb_to_recordset(v_items_snapshot) AS x(
      product_id UUID,
      variant_id UUID,
      product_name TEXT,
      unit_price NUMERIC(12,2),
      quantity INT,
      total_price NUMERIC(12,2)
    )
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name,
      unit_price, quantity, total_price
    )
    VALUES (
      v_order_id, v_snap_item.product_id, v_snap_item.variant_id, v_snap_item.product_name,
      v_snap_item.unit_price, v_snap_item.quantity, v_snap_item.total_price
    );

    UPDATE public.inventory
    SET quantity = quantity - v_snap_item.quantity
    WHERE product_id = v_snap_item.product_id
      AND variant_id IS NOT DISTINCT FROM v_snap_item.variant_id;
  END LOOP;

  -- 11b. Increment coupon usage atomically only after order row insertion succeeds
  IF v_coupon_id IS NOT NULL THEN
    UPDATE public.coupons
    SET used_count = used_count + 1
    WHERE id = v_coupon_id;
  END IF;

  -- 12. Create associated payment record in pending status
  INSERT INTO public.payments (
    order_id, provider, provider_payment_id, amount, currency, status
  )
  VALUES (
    v_order_id, v_provider, NULL, v_total_amount, 'INR', 'pending'
  );

  -- 13. Clear cart items
  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4. CUSTOMER UTR SUBMISSION RPC
-- ─────────────────────────────────────────────────────────────────
-- Production customer RPC: Evaluates strictly using database current timestamp NOW()
CREATE OR REPLACE FUNCTION public.submit_phonepe_utr(
  p_order_id UUID,
  p_utr_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_utr TEXT;
  v_order RECORD;
  v_payment RECORD;
  v_sub_id UUID;
BEGIN
  -- 1. Authentication check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit payment UTR';
  END IF;

  -- 2. Input validation
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  v_clean_utr := TRIM(COALESCE(p_utr_number, ''));
  IF v_clean_utr !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'Invalid UTR format. UTR must be exactly 12 numeric digits';
  END IF;

  -- 3. Lock and validate order
  SELECT id, user_id, status, created_at INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Access denied: You can only submit a UTR for your own orders';
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Order is not eligible for payment submission (current status: %)', v_order.status;
  END IF;

  -- 4. 48-Hour Expiration Check (using database actual current time NOW())
  -- Boundary rule: Before 48 hours is allowed. At or after 48 hours (<= deadline) is rejected.
  IF v_order.created_at <= NOW() - INTERVAL '48 hours' THEN
    RAISE EXCEPTION 'PhonePe payment window has expired (48 hours exceeded). Order cannot be verified.';
  END IF;

  -- 5. Lock and validate payment record
  SELECT id, provider, status, amount INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id AND provider = 'phonepe'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending PhonePe payment record found for this order';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment is already in % status and cannot accept new UTR submissions', v_payment.status;
  END IF;

  -- 6. Prevent concurrent duplicate active submissions
  IF EXISTS (
    SELECT 1 FROM public.payment_submissions
    WHERE order_id = p_order_id AND status = 'submitted'
  ) THEN
    RAISE EXCEPTION 'A UTR submission is currently pending administrator verification for this order';
  END IF;

  -- 7. Prevent reuse of already approved UTR
  IF EXISTS (
    SELECT 1 FROM public.payment_submissions
    WHERE utr_number = v_clean_utr AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'This UTR has already been approved for another order';
  END IF;

  -- 8. Record new submission (preserves historical rejected submissions) using actual created_at column
  INSERT INTO public.payment_submissions (
    order_id, payment_id, user_id, utr_number, status, created_at
  )
  VALUES (
    p_order_id, v_payment.id, v_user_id, v_clean_utr, 'submitted', NOW()
  )
  RETURNING id INTO v_sub_id;

  -- Update active UTR reference on payment record
  UPDATE public.payments
  SET provider_payment_id = v_clean_utr,
      updated_at = NOW()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_sub_id,
    'order_id', p_order_id,
    'utr_number', v_clean_utr,
    'status', 'submitted',
    'message', 'UTR submitted successfully. Pending administrator verification.'
  );
END;
$$;

-- Permissions: Production RPC is granted to authenticated customers
REVOKE ALL ON FUNCTION public.submit_phonepe_utr(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_phonepe_utr(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_phonepe_utr(UUID, TEXT) TO authenticated;

-- Ensure any legacy caller-controlled timestamp overload is explicitly removed.
-- The production system strictly uses submit_phonepe_utr(UUID, TEXT) with database NOW().
DROP FUNCTION IF EXISTS public.submit_phonepe_utr(UUID, TEXT, TIMESTAMPTZ);

-- ─────────────────────────────────────────────────────────────────
-- 5. ADMIN UTR VERIFICATION RPC (APPROVAL & REJECTION)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_verify_utr(
  p_submission_id UUID,
  p_approved BOOLEAN,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_sub RECORD;
  v_order RECORD;
  v_payment RECORD;
BEGIN
  -- 1. Authorization check
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required';
  END IF;

  IF p_submission_id IS NULL OR p_approved IS NULL THEN
    RAISE EXCEPTION 'Submission ID and approval decision are required';
  END IF;

  -- 2. Lock submission
  SELECT * INTO v_sub
  FROM public.payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment submission not found';
  END IF;

  IF v_sub.status <> 'submitted' THEN
    RAISE EXCEPTION 'Submission has already been reviewed (current status: %)', v_sub.status;
  END IF;

  -- 3. Lock order and payment
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_sub.order_id
  FOR UPDATE;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Order is not in pending status (current status: %)', v_order.status;
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = v_sub.payment_id
  FOR UPDATE;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment is not in pending status (current status: %)', v_payment.status;
  END IF;

  -- 4. Process Decision
  IF p_approved = TRUE THEN
    -- Approve specific submission
    UPDATE public.payment_submissions
    SET status = 'approved',
        admin_notes = p_admin_notes,
        reviewed_by = v_admin_id,
        reviewed_at = NOW()
    WHERE id = p_submission_id;

    -- Mark payment completed
    UPDATE public.payments
    SET status = 'completed',
        paid_at = NOW(),
        provider_payment_id = v_sub.utr_number,
        updated_at = NOW()
    WHERE id = v_payment.id;

    -- Advance order to processing
    UPDATE public.orders
    SET status = 'processing',
        updated_at = NOW()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
      'success', true,
      'submission_id', p_submission_id,
      'decision', 'approved',
      'order_id', v_order.id,
      'order_status', 'processing',
      'payment_status', 'completed',
      'message', 'Payment verified successfully. Order moved to processing.'
    );
  ELSE
    -- Reject specific submission ONLY
    -- Keeps order pending, keeps payment pending, does not cancel order or restore inventory.
    -- Allows customer to resubmit another UTR before the original 48h deadline.
    UPDATE public.payment_submissions
    SET status = 'rejected',
        admin_notes = p_admin_notes,
        reviewed_by = v_admin_id,
        reviewed_at = NOW()
    WHERE id = p_submission_id;

    UPDATE public.payments
    SET updated_at = NOW()
    WHERE id = v_payment.id;

    RETURN jsonb_build_object(
      'success', true,
      'submission_id', p_submission_id,
      'decision', 'rejected',
      'order_id', v_order.id,
      'order_status', 'pending',
      'payment_status', 'pending',
      'message', 'UTR submission rejected. Customer may resubmit before expiration.'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_utr(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_verify_utr(UUID, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_utr(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 6. ADMIN COD PAYMENT COLLECTION CONFIRMATION RPC
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_confirm_cod_payment(
  p_order_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_order RECORD;
  v_payment RECORD;
BEGIN
  -- 1. Authorization check
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  -- 2. Lock order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- COD payment is completed only when cash is collected at delivery
  IF v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'COD payment can only be confirmed upon delivery (current order status: %)', v_order.status;
  END IF;

  -- 3. Lock COD payment record
  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id AND provider = 'cod'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No COD payment record found for this order';
  END IF;

  IF v_payment.status = 'completed' THEN
    RAISE EXCEPTION 'COD payment has already been confirmed as completed on %', v_payment.paid_at;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'COD payment is in invalid status: %', v_payment.status;
  END IF;

  -- 4. Mark payment completed
  UPDATE public.payments
  SET status = 'completed',
      paid_at = NOW(),
      updated_at = NOW()
  WHERE id = v_payment.id;

  IF p_admin_notes IS NOT NULL AND TRIM(p_admin_notes) <> '' THEN
    UPDATE public.orders
    SET notes = COALESCE(notes || ' | ', '') || 'COD Collection: ' || TRIM(p_admin_notes),
        updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'payment_status', 'completed',
    'paid_at', NOW(),
    'message', 'COD payment marked as completed upon delivery.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_cod_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_confirm_cod_payment(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_cod_payment(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 7. 48-HOUR PHONEPE ORDER EXPIRATION OPERATION
-- ─────────────────────────────────────────────────────────────────
-- Drop any legacy caller-controlled timestamp overload.
-- Production expiry strictly enforces database NOW() and cannot be caller-manipulated.
DROP FUNCTION IF EXISTS public.expire_pending_phonepe_orders(TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.expire_pending_phonepe_orders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_expired_count INT := 0;
  v_order RECORD;
  v_expired_ids UUID[] := ARRAY[]::UUID[];
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Restrict direct execution to authenticated administrators or internal service role
  IF v_caller_id IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator or service privileges required';
  END IF;

  -- Iterate through pending PhonePe orders older than or equal to 48 hours relative to database NOW().
  -- CRITICAL RULE: If a customer submitted a UTR within the 48-hour window, the order MUST NOT
  -- expire while awaiting review. Only orders with NO active 'submitted' UTR may be expired.
  FOR v_order IN
    SELECT o.id, o.created_at
    FROM public.orders o
    JOIN public.payments p ON p.order_id = o.id
    WHERE o.status = 'pending'
      AND p.provider = 'phonepe'
      AND p.status = 'pending'
      AND o.created_at <= v_now - INTERVAL '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_submissions ps
        WHERE ps.order_id = o.id AND ps.status = 'submitted'
      )
    ORDER BY o.created_at ASC
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    -- Concurrency recheck under row lock: Ensure no active submission was just committed
    IF EXISTS (
      SELECT 1 FROM public.payment_submissions ps
      WHERE ps.order_id = v_order.id AND ps.status = 'submitted'
    ) THEN
      CONTINUE;
    END IF;

    -- 1. Mark payment failed
    UPDATE public.payments
    SET status = 'failed',
        updated_at = v_now
    WHERE order_id = v_order.id AND status = 'pending';

    -- 2. Cancel order
    -- This fires trg_restore_inventory_on_cancel to restore inventory and coupon usage exactly once
    UPDATE public.orders
    SET status = 'cancelled',
        notes = COALESCE(notes || ' | ', '') || 'Expired: Unverified after 48 hours',
        updated_at = v_now
    WHERE id = v_order.id;

    v_expired_count := v_expired_count + 1;
    v_expired_ids := array_append(v_expired_ids, v_order.id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count,
    'expired_order_ids', v_expired_ids,
    'executed_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.expire_pending_phonepe_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_pending_phonepe_orders() FROM anon;
REVOKE ALL ON FUNCTION public.expire_pending_phonepe_orders() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_phonepe_orders() TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 8. SECURE MANUAL REFUND RECORDING RPC & PHYSICAL RETURN WORKFLOW (OPTION B)
-- ─────────────────────────────────────────────────────────────────
-- Standard Operating Procedure (SOP) for Admin Refunds & Restocking (Option B):
-- 1. Physical Return Receipt: Returned item is physically received at warehouse and logged
--    in public.physical_return_inspections via admin_create_return_inspection.
-- 2. Warehouse QC Inspection: Goods are physically inspected for condition/completeness.
--    Inspection outcome, condition, approved quantity, and notes are recorded via
--    admin_complete_return_inspection. Only undamaged, approved items may be restocked.
-- 3. Separation of Concerns: Financial disbursement (gateway/UPI refund) is recorded
--    via admin_record_refund with the external transaction ID (refund_reference).
--    If p_restock_inventory = TRUE, it requires an approved, un-restocked physical inspection.
-- 4. No Automated Restocking: Shipped and delivered orders NEVER restock automatically.
--    Duplicate restocking is strictly prevented by tracking restocked = TRUE.

CREATE TABLE IF NOT EXISTS public.physical_return_inspections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id       UUID NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id          UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id          UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  returned_quantity   INT NOT NULL CHECK (returned_quantity > 0),
  approved_quantity   INT NOT NULL DEFAULT 0 CHECK (approved_quantity >= 0),
  receipt_confirmed   BOOLEAN NOT NULL DEFAULT TRUE,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inspection_outcome  TEXT NOT NULL DEFAULT 'pending' CHECK (inspection_outcome IN ('pending', 'passed', 'rejected', 'partially_passed')),
  condition           TEXT NOT NULL DEFAULT 'uninspected' CHECK (condition IN ('uninspected', 'good', 'damaged', 'defective', 'wrong_item', 'unusable')),
  inspection_notes    TEXT,
  inspector_id        UUID REFERENCES auth.users(id),
  inspected_at        TIMESTAMPTZ,
  restocked           BOOLEAN NOT NULL DEFAULT FALSE,
  restocked_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_outcome_qty CHECK (
    (inspection_outcome = 'pending' AND approved_quantity = 0) OR
    (inspection_outcome = 'rejected' AND approved_quantity = 0) OR
    (inspection_outcome = 'passed' AND approved_quantity = returned_quantity) OR
    (inspection_outcome = 'partially_passed' AND approved_quantity > 0 AND approved_quantity < returned_quantity)
  ),
  CONSTRAINT chk_approved_qty CHECK (approved_quantity <= returned_quantity)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_outcome_qty'
  ) THEN
    ALTER TABLE public.physical_return_inspections
      ADD CONSTRAINT chk_outcome_qty CHECK (
        (inspection_outcome = 'pending' AND approved_quantity = 0) OR
        (inspection_outcome = 'rejected' AND approved_quantity = 0) OR
        (inspection_outcome = 'passed' AND approved_quantity = returned_quantity) OR
        (inspection_outcome = 'partially_passed' AND approved_quantity > 0 AND approved_quantity < returned_quantity)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_return_inspections_order ON public.physical_return_inspections(order_id);
CREATE INDEX IF NOT EXISTS idx_return_inspections_item ON public.physical_return_inspections(order_item_id);
CREATE INDEX IF NOT EXISTS idx_return_inspections_restocked ON public.physical_return_inspections(order_id, restocked);

-- RLS & Privileges for physical_return_inspections
ALTER TABLE public.physical_return_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_return_inspections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.physical_return_inspections FROM PUBLIC;
REVOKE ALL ON TABLE public.physical_return_inspections FROM anon;
REVOKE ALL ON TABLE public.physical_return_inspections FROM authenticated;
GRANT SELECT ON TABLE public.physical_return_inspections TO authenticated;
GRANT ALL ON TABLE public.physical_return_inspections TO service_role;

DROP POLICY IF EXISTS "Customers can view return inspections for own orders" ON public.physical_return_inspections;
CREATE POLICY "Customers can view return inspections for own orders"
  ON public.physical_return_inspections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = physical_return_inspections.order_id
        AND o.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- RPC 8a: Admin logs physical return receipt
CREATE OR REPLACE FUNCTION public.admin_create_return_inspection(
  p_order_id UUID,
  p_order_item_id UUID,
  p_returned_quantity INT,
  p_receipt_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_item RECORD;
  v_already_returned INT;
  v_inspection_id UUID;
  v_locked_order_id UUID;
BEGIN
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required';
  END IF;

  IF p_order_id IS NULL OR p_order_item_id IS NULL THEN
    RAISE EXCEPTION 'Order ID and Order Item ID are required';
  END IF;

  IF p_returned_quantity IS NULL OR p_returned_quantity <= 0 THEN
    RAISE EXCEPTION 'Returned quantity must be greater than zero';
  END IF;

  -- 1. Tier 1 Lock: Parent order row lock (establishes universal lock hierarchy for this order)
  SELECT id INTO v_locked_order_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- 2. Tier 2 Lock: Verify order item belongs to order and lock it
  SELECT id, order_id, product_id, variant_id, quantity
  INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id AND order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item % not found for order %', p_order_item_id, p_order_id;
  END IF;

  -- Check cumulative returned quantity does not exceed purchased quantity
  SELECT COALESCE(SUM(returned_quantity), 0)
  INTO v_already_returned
  FROM public.physical_return_inspections
  WHERE order_item_id = p_order_item_id;

  IF (v_already_returned + p_returned_quantity) > v_item.quantity THEN
    RAISE EXCEPTION 'Cumulative returned quantity (% + %) exceeds purchased quantity (%)',
      v_already_returned, p_returned_quantity, v_item.quantity;
  END IF;

  INSERT INTO public.physical_return_inspections (
    order_id,
    order_item_id,
    product_id,
    variant_id,
    returned_quantity,
    approved_quantity,
    receipt_confirmed,
    received_at,
    inspection_outcome,
    condition,
    inspection_notes,
    inspector_id,
    restocked
  ) VALUES (
    p_order_id,
    p_order_item_id,
    v_item.product_id,
    v_item.variant_id,
    p_returned_quantity,
    0,
    TRUE,
    NOW(),
    'pending',
    'uninspected',
    p_receipt_notes,
    v_admin_id,
    FALSE
  ) RETURNING id INTO v_inspection_id;

  RETURN v_inspection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_return_inspection(UUID, UUID, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_return_inspection(UUID, UUID, INT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_return_inspection(UUID, UUID, INT, TEXT) TO authenticated;

-- Helper RPC: Restocks approved return inspections atomically with deterministic row-locking
CREATE OR REPLACE FUNCTION public._restock_approved_return_inspections(
  p_order_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_locked_order_id UUID;
  v_locked_rec RECORD;
  v_locked_ids UUID[] := ARRAY[]::UUID[];
  v_item RECORD;
  v_rows_updated INT;
  v_total_restocked INT := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required for restocking approved inspections';
  END IF;

  -- 1. Tier 1 Lock: Parent order row lock
  -- Establishes universal lock hierarchy across all physical-return operations.
  SELECT id INTO v_locked_order_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found for restocking', p_order_id;
  END IF;

  -- 2. Tier 2 Lock: Deterministically lock eligible, un-restocked inspections using FOR UPDATE
  -- Ordered by pri.id ASC to eliminate deadlock risk between concurrent calls.
  -- Condition strictly includes receipt_confirmed = TRUE and restocked = FALSE.
  -- In PostgreSQL Read Committed mode, if another concurrent transaction committed restocked = TRUE
  -- while we were waiting for the lock, once we acquire the lock the updated row is re-evaluated
  -- and skipped because restocked is no longer FALSE.
  FOR v_locked_rec IN
    SELECT pri.id, pri.product_id, pri.variant_id, pri.approved_quantity
    FROM public.physical_return_inspections pri
    WHERE pri.order_id = p_order_id
      AND pri.receipt_confirmed = TRUE
      AND pri.inspection_outcome IN ('passed', 'partially_passed')
      AND pri.approved_quantity > 0
      AND pri.restocked = FALSE
    ORDER BY pri.id ASC
    FOR UPDATE
  LOOP
    v_locked_ids := array_append(v_locked_ids, v_locked_rec.id);
  END LOOP;

  -- If no un-restocked inspections were locked by this transaction, return 0 immediately
  IF array_length(v_locked_ids, 1) IS NULL OR array_length(v_locked_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- 3. Tier 3 Lock & Aggregation: Update inventory with deterministic ordering across products & variants
  FOR v_item IN
    SELECT pri.product_id, pri.variant_id, SUM(pri.approved_quantity)::int AS quantity
    FROM public.physical_return_inspections pri
    WHERE pri.id = ANY(v_locked_ids)
    GROUP BY pri.product_id, pri.variant_id
    ORDER BY pri.product_id, pri.variant_id
  LOOP
    UPDATE public.inventory
    SET quantity = quantity + v_item.quantity,
        updated_at = NOW()
    WHERE product_id = v_item.product_id
      AND variant_id IS NOT DISTINCT FROM v_item.variant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
      RAISE EXCEPTION 'Inventory record missing for product %; restocking transaction rolled back', v_item.product_id;
    END IF;

    v_total_restocked := v_total_restocked + v_item.quantity;
  END LOOP;

  -- 4. Mark strictly the exact locked inspection IDs as restocked
  UPDATE public.physical_return_inspections
  SET restocked = TRUE,
      restocked_at = NOW(),
      updated_at = NOW()
  WHERE id = ANY(v_locked_ids);

  RETURN v_total_restocked;
END;
$$;

REVOKE ALL ON FUNCTION public._restock_approved_return_inspections(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._restock_approved_return_inspections(UUID) FROM anon;
REVOKE ALL ON FUNCTION public._restock_approved_return_inspections(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._restock_approved_return_inspections(UUID) TO service_role;

-- RPC 8b: Admin completes physical inspection outcome
CREATE OR REPLACE FUNCTION public.admin_complete_return_inspection(
  p_inspection_id UUID,
  p_outcome TEXT,
  p_approved_quantity INT,
  p_condition TEXT,
  p_notes TEXT,
  p_restock_now BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_ins RECORD;
  v_order_id UUID;
  v_clean_notes TEXT;
  v_clean_outcome TEXT;
  v_clean_condition TEXT;
BEGIN
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required';
  END IF;

  IF p_inspection_id IS NULL THEN
    RAISE EXCEPTION 'Inspection ID is required';
  END IF;

  v_clean_notes := TRIM(COALESCE(p_notes, ''));
  IF v_clean_notes = '' THEN
    RAISE EXCEPTION 'Inspection notes are mandatory';
  END IF;

  v_clean_outcome := LOWER(TRIM(COALESCE(p_outcome, '')));
  IF v_clean_outcome NOT IN ('passed', 'partially_passed', 'rejected') THEN
    RAISE EXCEPTION 'Invalid inspection outcome: %. Must be passed, partially_passed, or rejected', p_outcome;
  END IF;

  v_clean_condition := LOWER(TRIM(COALESCE(p_condition, '')));
  IF v_clean_condition NOT IN ('good', 'damaged', 'defective', 'wrong_item', 'unusable') THEN
    RAISE EXCEPTION 'Invalid condition: %. Must be good, damaged, defective, wrong_item, or unusable', p_condition;
  END IF;

  -- 1. Look up parent order ID for this inspection
  SELECT order_id INTO v_order_id
  FROM public.physical_return_inspections
  WHERE id = p_inspection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection record not found';
  END IF;

  -- 2. Establish Tier 1 Lock: Parent order row lock
  -- This serializes all physical-return operations for the same order, guaranteeing that
  -- concurrent inspection completions on the same order cannot interleave and acquire
  -- inspection locks in conflicting orders (deadlock elimination).
  PERFORM 1
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  -- 3. Establish Tier 2 Lock: Lock target inspection record
  SELECT * INTO v_ins
  FROM public.physical_return_inspections
  WHERE id = p_inspection_id
  FOR UPDATE;

  IF v_ins.restocked = TRUE THEN
    RAISE EXCEPTION 'Cannot modify inspection: inventory has already been restocked for this inspection';
  END IF;

  IF v_clean_outcome = 'rejected' THEN
    IF p_approved_quantity IS NOT NULL AND p_approved_quantity > 0 THEN
      RAISE EXCEPTION 'Rejected inspection cannot approve restock quantity greater than 0';
    END IF;
    p_approved_quantity := 0;
  ELSIF v_clean_outcome = 'passed' THEN
    IF p_approved_quantity IS NULL OR p_approved_quantity <> v_ins.returned_quantity THEN
      RAISE EXCEPTION 'Passed inspection must approve exact returned quantity (%)', v_ins.returned_quantity;
    END IF;
  ELSIF v_clean_outcome = 'partially_passed' THEN
    IF p_approved_quantity IS NULL OR p_approved_quantity <= 0 OR p_approved_quantity >= v_ins.returned_quantity THEN
      RAISE EXCEPTION 'Partially passed inspection must approve between 1 and % units (exclusive)', v_ins.returned_quantity;
    END IF;
  END IF;

  UPDATE public.physical_return_inspections
  SET inspection_outcome = v_clean_outcome,
      approved_quantity = p_approved_quantity,
      condition = v_clean_condition,
      inspection_notes = v_clean_notes,
      inspector_id = v_admin_id,
      inspected_at = NOW(),
      updated_at = NOW()
  WHERE id = p_inspection_id;

  -- If restock requested immediately and approved_quantity > 0, delegate to shared atomic helper
  IF p_restock_now = TRUE AND p_approved_quantity > 0 THEN
    PERFORM public._restock_approved_return_inspections(v_ins.order_id);
  END IF;

  RETURN jsonb_build_object(
    'inspection_id', p_inspection_id,
    'outcome', v_clean_outcome,
    'condition', v_clean_condition,
    'approved_quantity', p_approved_quantity,
    'restocked', (p_restock_now = TRUE AND p_approved_quantity > 0),
    'inspected_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_complete_return_inspection(UUID, TEXT, INT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_complete_return_inspection(UUID, TEXT, INT, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_return_inspection(UUID, TEXT, INT, TEXT, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_record_refund(
  p_order_id UUID,
  p_refund_reference TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_restock_inventory BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_order RECORD;
  v_payment RECORD;
  v_clean_ref TEXT;
  v_approved_inspections_count INT;
  v_total_approved_qty INT;
  v_restocked_qty INT;
BEGIN
  -- 1. Authorization check
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  v_clean_ref := TRIM(COALESCE(p_refund_reference, ''));
  IF v_clean_ref = '' THEN
    RAISE EXCEPTION 'Refund reference / transaction ID is required';
  END IF;

  -- 2. Tier 1 Lock: Parent order row lock (acquired FIRST before inspecting or reading child records)
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Order must be in a cancellable or refundable state
  IF v_order.status NOT IN ('cancelled', 'delivered', 'processing', 'shipped') THEN
    RAISE EXCEPTION 'Cannot record refund for order in status: %', v_order.status;
  END IF;

  -- 2b. Physical Return Inspection Requirement (Option B):
  -- Restocking inventory (p_restock_inventory = TRUE) strictly requires an approved,
  -- un-restocked physical return inspection record in public.physical_return_inspections
  -- as well as mandatory inspection notes in p_admin_notes.
  IF p_restock_inventory = TRUE THEN
    IF p_admin_notes IS NULL OR TRIM(p_admin_notes) = '' THEN
      RAISE EXCEPTION 'Physical inspection notes are mandatory in admin_notes when authorizing inventory restocking for returned goods';
    END IF;

    SELECT COUNT(*)::int, COALESCE(SUM(approved_quantity), 0)::int
    INTO v_approved_inspections_count, v_total_approved_qty
    FROM public.physical_return_inspections
    WHERE order_id = p_order_id
      AND receipt_confirmed = TRUE
      AND inspection_outcome IN ('passed', 'partially_passed')
      AND restocked = FALSE
      AND approved_quantity > 0;

    IF v_approved_inspections_count = 0 OR v_total_approved_qty = 0 THEN
      RAISE EXCEPTION 'Cannot restock inventory: no approved, un-restocked physical return inspection found for order %. Physical receipt and inspection approval are required prior to restocking.', p_order_id;
    END IF;
  END IF;

  -- 3. Tier 2 Lock: Lock payment
  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No payment record found for order';
  END IF;

  IF v_payment.status = 'refunded' THEN
    RAISE EXCEPTION 'Payment has already been marked refunded';
  END IF;

  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'Cannot refund payment in status % (only completed payments can be refunded)', v_payment.status;
  END IF;

  -- 4. Mark payment refunded only after actual return confirmation
  -- Preserves original provider_payment_id (e.g. PhonePe UTR or gateway ID) intact and stores refund reference in dedicated column
  UPDATE public.payments
  SET status = 'refunded',
      refund_reference = v_clean_ref,
      updated_at = NOW()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET status = 'refunded',
      notes = COALESCE(notes || ' | ', '') || 'Refund Confirmed: ' || v_clean_ref ||
              CASE WHEN p_admin_notes IS NOT NULL THEN ' (' || TRIM(p_admin_notes) || ')' ELSE '' END,
      updated_at = NOW()
  WHERE id = v_order.id;

  -- 5. Physical return-related inventory restocking (Option B: from approved inspections)
  -- Restores EXACT approved quantities from physical_return_inspections via shared helper.
  -- Marks inspections as restocked to strictly prevent duplicate restocking.
  IF p_restock_inventory = TRUE THEN
    v_restocked_qty := public._restock_approved_return_inspections(p_order_id);
    IF v_restocked_qty = 0 THEN
      RAISE EXCEPTION 'Cannot restock inventory: approved inspections for order % were already restocked or unavailable.', p_order_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'payment_status', 'refunded',
    'order_status', 'refunded',
    'refund_reference', v_clean_ref,
    'inventory_restocked', p_restock_inventory,
    'refunded_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_refund(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_refund(UUID, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_refund(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 9. SAFE INVENTORY RESTORATION TRIGGER (UNPAID ORDERS ONLY)
-- ─────────────────────────────────────────────────────────────────
-- Restricts automated inventory and coupon restoration strictly to UNPAID
-- pre-fulfillment cancellations ('pending').
-- Paid processing orders, shipped orders, and delivered orders MUST NOT
-- restore inventory automatically before physical inspection and return.
CREATE OR REPLACE FUNCTION public.restore_inventory_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
  v_is_paid BOOLEAN := FALSE;
BEGIN
  -- Guard 1: Prevent reopening cancelled orders back to active states ('pending', 'processing', 'shipped', 'delivered').
  -- Transition from 'cancelled' to 'refunded' is an authorized terminal transition performed during refund recording.
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND NEW.status <> 'refunded' THEN
    RAISE EXCEPTION 'Cancelled orders cannot be reopened or transitioned to %', NEW.status;
  END IF;

  -- Check if order has a completed payment (i.e. Paid order)
  SELECT EXISTS (
    SELECT 1 FROM public.payments
    WHERE order_id = NEW.id AND status = 'completed'
  ) INTO v_is_paid;

  -- Guard 2: Only execute automated restoration when status changes to 'cancelled' from pre-fulfillment unpaid status ('pending').
  -- Paid processing orders and shipped/delivered orders MUST NOT restore inventory automatically before physical return/inspection.
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' AND NOT v_is_paid THEN
    FOR v_item IN
      SELECT oi.product_id, oi.variant_id, oi.quantity
      FROM public.order_items oi
      WHERE oi.order_id = NEW.id
    LOOP
      UPDATE public.inventory
      SET quantity = quantity + v_item.quantity
      WHERE product_id = v_item.product_id
        AND variant_id IS NOT DISTINCT FROM v_item.variant_id;
    END LOOP;

    -- Release consumed coupon back to the pool
    IF NEW.coupon_id IS NOT NULL THEN
      UPDATE public.coupons
      SET used_count = GREATEST(0, used_count - 1)
      WHERE id = NEW.coupon_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_inventory_on_cancellation()
FROM PUBLIC, anon, authenticated;

-- Ensure trigger is cleanly attached to public.orders
DROP TRIGGER IF EXISTS trg_restore_inventory_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_inventory_on_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_inventory_on_cancellation();

-- ─────────────────────────────────────────────────────────────────
-- 10. UPDATE CUSTOMER ORDER CANCELLATION RPC TO MANAGE PAYMENTS SAFELY
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order RECORD;
  v_payment RECORD;
BEGIN
  -- 1. Authentication check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to cancel order';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  -- 2. Lock order row
  SELECT id, user_id, status INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Access denied: You can only cancel your own orders';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Order is already cancelled';
  END IF;

  IF v_order.status = 'refunded' THEN
    RAISE EXCEPTION 'Order has already been refunded and cannot be cancelled';
  END IF;

  IF v_order.status = 'shipped' THEN
    RAISE EXCEPTION 'Cannot cancel an order that has already been shipped';
  END IF;

  IF v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'Cannot cancel an order that has already been delivered';
  END IF;

  IF v_order.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'Order cannot be cancelled in status: %', v_order.status;
  END IF;

  -- 3. Lock payment record
  SELECT id, provider, status INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  FOR UPDATE;

  -- 4. Payment lifecycle handling on customer cancellation:
  -- - If payment is pending (unpaid PhonePe or COD): mark payment failed and reject open submissions
  -- - If payment is completed (already approved/paid processing order): DO NOT mark failed! Keep completed for manual refund.
  IF v_payment.id IS NOT NULL AND v_payment.status = 'pending' THEN
    UPDATE public.payments
    SET status = 'failed',
        updated_at = NOW()
    WHERE id = v_payment.id;

    UPDATE public.payment_submissions
    SET status = 'rejected',
        admin_notes = 'Order cancelled by customer',
        reviewed_at = NOW()
    WHERE order_id = p_order_id AND status = 'submitted';
  END IF;

  -- 5. Transition order to 'cancelled' status
  -- Activates trg_restore_inventory_on_cancel which atomically
  -- restores inventory and releases any consumed coupon for unpaid pending orders.
  UPDATE public.orders
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled',
    'message', 'Order cancelled successfully'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated;
