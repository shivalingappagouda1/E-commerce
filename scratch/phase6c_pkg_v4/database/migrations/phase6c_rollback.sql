-- ═══════════════════════════════════════════════════════════════════
-- CRITICAL WARNING — DESTRUCTIVE ROLLBACK SCRIPT
-- ═══════════════════════════════════════════════════════════════════
-- DO NOT EXECUTE WITHOUT AN UP-TO-DATE FULL DATABASE BACKUP AND
-- EXPLICIT WRITTEN APPROVAL FROM THE SYSTEM ADMINISTRATOR.
--
-- Executing this script will permanently DESTROY:
-- 1. public.payment_submissions (all customer PhonePe UTR submissions and reviewer audit history)
-- 2. public.orders.idempotency_key (historical checkout idempotency keys)
-- 3. Any active PhonePe review, COD confirmation, or refund audit notes
-- ═══════════════════════════════════════════════════════════════════

-- 1. Drop newly created RPCs
DROP FUNCTION IF EXISTS public.admin_complete_return_inspection(UUID, TEXT, INT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_create_return_inspection(UUID, UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public._restock_approved_return_inspections(UUID);
DROP FUNCTION IF EXISTS public.admin_record_refund(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_record_refund(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.expire_pending_phonepe_orders();
DROP FUNCTION IF EXISTS public.expire_pending_phonepe_orders(TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.admin_confirm_cod_payment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_verify_utr(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.submit_phonepe_utr(UUID, TEXT);
DROP FUNCTION IF EXISTS public.submit_phonepe_utr(UUID, TEXT, TIMESTAMPTZ);

-- 2. Restore Phase 8.1 restore_inventory_on_cancellation trigger function
CREATE OR REPLACE FUNCTION public.restore_inventory_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled orders cannot be reopened or transitioned to %', NEW.status;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'processing') THEN
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

    IF NEW.coupon_id IS NOT NULL THEN
      UPDATE public.coupons
      SET used_count = GREATEST(0, used_count - 1)
      WHERE id = NEW.coupon_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_inventory_on_cancellation() FROM PUBLIC, anon, authenticated;

-- 3. Restore Phase 7.2 cancel_order RPC
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to cancel order';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

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

-- 4. Restore Phase 7.1 3-parameter place_order RPC
DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.place_order(
  p_address_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
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
  v_subtotal NUMERIC(12,2) := 0;
  v_discount_amount NUMERIC(12,2) := 0;
  v_unit_price NUMERIC(12,2);
  v_product_name TEXT;
  v_stock INT;
  v_item RECORD;
  v_clean_coupon TEXT;
  v_coupon RECORD;
  v_coupon_id UUID := NULL;
  v_items_snapshot JSONB := '[]'::jsonb;
  v_snap_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.addresses
    WHERE id = p_address_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Invalid delivery address';
  END IF;

  SELECT id INTO v_cart_id
  FROM public.carts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'Cart not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cart_items WHERE cart_id = v_cart_id
  ) THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

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

    UPDATE public.coupons
    SET used_count = used_count + 1
    WHERE id = v_coupon.id;
  END IF;

  INSERT INTO public.orders (
    user_id, address_id, coupon_id, status, subtotal, discount_amount,
    tax_amount, shipping_amount, total_amount, notes
  )
  VALUES (
    v_user_id, p_address_id, v_coupon_id, 'pending', v_subtotal, v_discount_amount,
    0, 0, GREATEST(0, v_subtotal - v_discount_amount), p_notes
  )
  RETURNING id INTO v_order_id;

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

  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, TEXT, TEXT) TO authenticated;

-- 5. Drop payment submissions and physical return tables (without CASCADE to protect core tables)
DROP TABLE IF EXISTS public.physical_return_inspections;
DROP TABLE IF EXISTS public.payment_submissions;

-- 6. Drop idempotency column and index from orders, and refund_reference from payments
DROP INDEX IF EXISTS public.idx_orders_user_idempotency;
ALTER TABLE public.orders DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE public.payments DROP COLUMN IF EXISTS refund_reference;
