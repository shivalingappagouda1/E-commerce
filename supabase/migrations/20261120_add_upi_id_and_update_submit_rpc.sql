-- ShopKart: persist the customer's UPI ID separately from the 12-digit UTR.
-- Run once in Supabase SQL Editor after the Phase 6C migration.
-- Existing UTR history is retained; old rows have NULL upi_id.
ALTER TABLE public.payment_submissions
  ADD COLUMN IF NOT EXISTS upi_id TEXT;

-- Remove the old two-argument RPC so PostgREST cannot resolve an ambiguous overload.
DROP FUNCTION IF EXISTS public.submit_phonepe_utr(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.submit_phonepe_utr(
  p_order_id UUID,
  p_utr_number TEXT,
  p_upi_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_utr TEXT;
  v_clean_upi_id TEXT;
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

  v_clean_upi_id := TRIM(COALESCE(p_upi_id, ''));
  IF v_clean_upi_id !~ '^[^[:space:]@]+@[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid UPI ID. Enter a valid UPI ID (VPA)';
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
    order_id, payment_id, user_id, utr_number, upi_id, status, created_at
  )
  VALUES (
    p_order_id, v_payment.id, v_user_id, v_clean_utr, v_clean_upi_id, 'submitted', NOW()
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
    'upi_id', v_clean_upi_id,
    'status', 'submitted',
    'message', 'UTR submitted successfully. Pending administrator verification.'
  );
END;
$$;

-- Permissions: Production RPC is granted to authenticated customers
REVOKE ALL ON FUNCTION public.submit_phonepe_utr(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_phonepe_utr(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_phonepe_utr(UUID, TEXT, TEXT) TO authenticated;

-- Ensure any legacy caller-controlled timestamp overload is explicitly removed.
-- The production system strictly uses submit_phonepe_utr(UUID, TEXT, TEXT) with database NOW().
DROP FUNCTION IF EXISTS public.submit_phonepe_utr(UUID, TEXT, TIMESTAMPTZ);

