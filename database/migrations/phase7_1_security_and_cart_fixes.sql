-- ═══════════════════════════════════════════════════════════════════
-- Phase 7.1: Backend Security Corrections, Atomic Cart Sync & Coupons
-- Apply these additions in the Supabase Dashboard SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. ATOMIC USER CART SYNCHRONIZATION RPC
-- ─────────────────────────────────────────────────────────────────
-- Replaces non-atomic client-side multi-request synchronization with
-- an atomic, transactionally-safe single-trip PostgreSQL function.
-- Serializes concurrent tabs by locking the user's cart row FOR UPDATE.
-- Enforces strict payload validation BEFORE destructive operations,
-- rejects invalid UUIDs, verifies active catalog products and variants,
-- checks inventory stock across aggregated duplicates without silent
-- clamping, and enforces quantity boundaries (1..99).
CREATE OR REPLACE FUNCTION public.sync_user_cart(
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cart_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_quantity INT;
  v_prod RECORD;
  v_stock INT;
  v_count INT := 0;
  v_agg RECORD;
BEGIN
  -- 1. Authentication check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for cart synchronization';
  END IF;

  -- 2. Validate payload: MUST be a non-null JSON array
  -- Validated BEFORE any cart modification to protect existing cart data on malformed requests
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid cart payload: expected a JSON array of items';
  END IF;

  -- 3. PASS 1: Validate individual item structure, UUID format, and catalog active status
  -- Entire validation completes BEFORE touching cart_items table
  IF jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      -- Check element is a JSON object
      IF jsonb_typeof(v_item) <> 'object' THEN
        RAISE EXCEPTION 'Invalid cart item: expected a JSON object';
      END IF;

      -- Validate product_id UUID syntax
      IF v_item->>'product_id' IS NULL OR v_item->>'product_id' = '' THEN
        RAISE EXCEPTION 'Cart item missing required product_id';
      END IF;

      BEGIN
        v_product_id := (v_item->>'product_id')::UUID;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid product UUID format in cart item';
      END;

      -- Validate variant_id UUID syntax if present
      IF v_item->>'variant_id' IS NOT NULL 
         AND v_item->>'variant_id' <> '' 
         AND v_item->>'variant_id' <> 'null' THEN
        BEGIN
          v_variant_id := (v_item->>'variant_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Invalid variant UUID format in cart item';
        END;
      ELSE
        v_variant_id := NULL;
      END IF;

      -- Validate quantity integer syntax: strictly between 1 and 99
      BEGIN
        v_quantity := (v_item->>'quantity')::INT;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid quantity format: must be an integer';
      END;

      IF v_quantity IS NULL OR v_quantity < 1 THEN
        RAISE EXCEPTION 'Invalid item quantity (%): must be at least 1', COALESCE(v_quantity, 0);
      END IF;

      IF v_quantity > 99 THEN
        RAISE EXCEPTION 'Item quantity (%) exceeds maximum allowed limit of 99 per item', v_quantity;
      END IF;

      -- Verify product exists and is active in catalog
      SELECT p.id, p.is_active INTO v_prod
      FROM public.products p
      WHERE p.id = v_product_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist in catalog', v_product_id;
      END IF;

      IF v_prod.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Product % is currently inactive', v_product_id;
      END IF;

      -- If variant provided, verify variant exists and belongs to this product
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.product_variants pv
          WHERE pv.id = v_variant_id AND pv.product_id = v_product_id
        ) THEN
          RAISE EXCEPTION 'Variant % does not belong to product % or does not exist', v_variant_id, v_product_id;
        END IF;
      END IF;
    END LOOP;

    -- 4. PASS 2: Aggregate quantities across duplicate items, verify combined limit (<= 99)
    -- and verify total inventory stock. NO SILENT CLAMPING!
    FOR v_agg IN
      SELECT
        (elem->>'product_id')::UUID AS product_id,
        CASE
          WHEN elem->>'variant_id' IS NOT NULL AND elem->>'variant_id' <> '' AND elem->>'variant_id' <> 'null'
          THEN (elem->>'variant_id')::UUID
          ELSE NULL
        END AS variant_id,
        SUM((elem->>'quantity')::INT)::INT AS combined_quantity
      FROM jsonb_array_elements(p_items) AS elem
      GROUP BY 1, 2
    LOOP
      IF v_agg.combined_quantity > 99 THEN
        RAISE EXCEPTION 'Combined item quantity (%) exceeds maximum allowed limit of 99 per item', v_agg.combined_quantity;
      END IF;

      -- Validate total stock availability against combined quantity
      SELECT quantity INTO v_stock
      FROM public.inventory
      WHERE product_id = v_agg.product_id
        AND variant_id IS NOT DISTINCT FROM v_agg.variant_id;

      IF NOT FOUND OR v_stock < v_agg.combined_quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product % (requested %, available %)',
          v_agg.product_id, v_agg.combined_quantity, COALESCE(v_stock, 0);
      END IF;
    END LOOP;
  END IF;

  -- 5. Resolve or create user cart atomically, then acquire exclusive row-level lock
  INSERT INTO public.carts (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_cart_id;

  -- Lock the user cart row FOR UPDATE to serialize all concurrent sync requests
  PERFORM 1 FROM public.carts WHERE id = v_cart_id FOR UPDATE;

  -- 6. Atomically wipe prior items in this transaction (ONLY after all validations pass)
  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  -- 7. Insert the validated and aggregated items into cart_items
  IF jsonb_array_length(p_items) > 0 THEN
    FOR v_agg IN
      SELECT
        (elem->>'product_id')::UUID AS product_id,
        CASE
          WHEN elem->>'variant_id' IS NOT NULL AND elem->>'variant_id' <> '' AND elem->>'variant_id' <> 'null'
          THEN (elem->>'variant_id')::UUID
          ELSE NULL
        END AS variant_id,
        SUM((elem->>'quantity')::INT)::INT AS combined_quantity
      FROM jsonb_array_elements(p_items) AS elem
      GROUP BY 1, 2
    LOOP
      INSERT INTO public.cart_items (cart_id, product_id, variant_id, quantity)
      VALUES (v_cart_id, v_agg.product_id, v_agg.variant_id, v_agg.combined_quantity);

      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cart_id', v_cart_id,
    'item_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_cart(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_user_cart(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_user_cart(JSONB) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- 2. AUTHORITATIVE SERVER-SIDE ORDER PLACEMENT & COUPON ENGINE
-- ─────────────────────────────────────────────────────────────────
-- Explicitly remove the legacy two-parameter place_order overload
-- to ensure no coupon-less bypass path exists for authenticated users.
DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT);

-- Enhanced place_order RPC accepting coupon code, performing
-- transactional row-locking on coupons, calculating discounts
-- server-side, and incrementing used_count atomically.
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

  -- Validate delivery address belongs to the authenticated user
  IF p_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.addresses
    WHERE id = p_address_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Invalid delivery address';
  END IF;

  -- Lock user cart to ensure single checkout thread
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

  -- First pass: validate each item, lock product/variant rows FOR SHARE, lock inventory FOR UPDATE,
  -- and capture an authoritative, immutable price snapshot for subtotal and order_items consistency.
  FOR v_item IN
    SELECT ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = v_cart_id
    ORDER BY ci.product_id, ci.variant_id
  LOOP
    -- Lock product row FOR SHARE to prevent concurrent catalog price modifications during checkout
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

    -- Capture immutable validated line-item price snapshot
    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'product_id', v_item.product_id,
      'variant_id', v_item.variant_id,
      'product_name', v_product_name,
      'unit_price', v_unit_price,
      'quantity', v_item.quantity,
      'total_price', v_unit_price * v_item.quantity
    );
  END LOOP;

  -- Server-side coupon validation & transactional row locking
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

    -- Calculate authoritative discount amount
    IF v_coupon.discount_type = 'percent' THEN
      v_discount_amount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
    ELSIF v_coupon.discount_type = 'fixed' THEN
      v_discount_amount := LEAST(v_subtotal, v_coupon.discount_value);
    ELSE
      RAISE EXCEPTION 'Unsupported coupon discount type: %', v_coupon.discount_type;
    END IF;

    -- Clamp discount to subtotal
    v_discount_amount := LEAST(v_subtotal, GREATEST(0, v_discount_amount));
    v_coupon_id := v_coupon.id;

    -- Consume coupon usage inside this transaction
    UPDATE public.coupons
    SET used_count = used_count + 1
    WHERE id = v_coupon.id;
  END IF;

  -- Insert order with authoritative server-computed totals
  INSERT INTO public.orders (
    user_id, address_id, coupon_id, status, subtotal, discount_amount,
    tax_amount, shipping_amount, total_amount, notes
  )
  VALUES (
    v_user_id, p_address_id, v_coupon_id, 'pending', v_subtotal, v_discount_amount,
    0, 0, GREATEST(0, v_subtotal - v_discount_amount), p_notes
  )
  RETURNING id INTO v_order_id;

  -- Second pass: write trusted line-item snapshots directly from the validated price snapshot
  -- This guarantees exact price consistency between orders.subtotal and order_items.unit_price
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

  -- Clear cart after order creation
  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, TEXT, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- 3. SAFE INVENTORY & COUPON RESTORATION ON CANCELLATION
-- ─────────────────────────────────────────────────────────────────
-- Enhances the cancellation trigger to also restore used_count on
-- the associated coupon if one was consumed during order creation.
CREATE OR REPLACE FUNCTION public.restore_inventory_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Guard: Prevent reopening or transitioning already cancelled orders back to active states
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled orders cannot be reopened or transitioned to %', NEW.status;
  END IF;

  -- Only execute when status changes from active (pending/processing/shipped) to cancelled
  IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'processing', 'shipped') THEN
    -- Restore inventory for each line item
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

    -- Release consumed coupon back to pool
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

DROP TRIGGER IF EXISTS trg_restore_inventory_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_inventory_on_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_inventory_on_cancellation();


-- ─────────────────────────────────────────────────────────────────
-- 4. HARDEN CART_ITEMS ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────────
-- Remove direct customer INSERT, UPDATE, and DELETE policies on cart_items.
-- All customer cart mutations must occur exclusively through the
-- validated, parent-cart locked sync_user_cart() SECURITY DEFINER RPC.
-- Authenticated customers retain SELECT access restricted to their own cart.
-- Administrators retain SELECT access for customer support.
DROP POLICY IF EXISTS "Users manage own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users insert own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users update own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users delete own cart items" ON public.cart_items;

-- Ensure read policies are explicitly affirmed
DROP POLICY IF EXISTS "Users view own cart items" ON public.cart_items;
CREATE POLICY "Users view own cart items"
  ON public.cart_items FOR SELECT
  USING (cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can view all cart items" ON public.cart_items;
CREATE POLICY "Admins can view all cart items"
  ON public.cart_items FOR SELECT
  USING (public.is_admin());
