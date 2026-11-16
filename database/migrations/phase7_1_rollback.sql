-- =====================================================================
-- SHOPKART - PHASE 7.1 ROLLBACK SCRIPT
-- =====================================================================
-- Run this script in the Supabase SQL Editor ONLY if you need to
-- revert all Phase 7.1 changes back to the original baseline schema.
--
-- IRREVERSIBLE DATA CONSIDERATIONS:
-- 1. Orders placed while Phase 7.1 was active retain their recorded
--    coupon_id, discount_amount, and total_amount.
-- 2. Consumed coupon usage counts and decremented inventory remain in
--    their post-checkout state.
-- =====================================================================

-- 1. Drop the atomic cart sync RPC
DROP FUNCTION IF EXISTS public.sync_user_cart(JSONB);

-- 2. Drop the 3-parameter place_order RPC
DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT, TEXT);

-- 3. Restore the original 2-parameter place_order RPC from database/schema.sql
CREATE OR REPLACE FUNCTION public.place_order(
  p_address_id UUID,
  p_notes TEXT DEFAULT NULL
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
  v_unit_price NUMERIC(12,2);
  v_product_name TEXT;
  v_stock INT;
  v_item RECORD;
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
  END LOOP;

  INSERT INTO public.orders (
    user_id, address_id, status, subtotal, discount_amount,
    tax_amount, shipping_amount, total_amount, notes
  )
  VALUES (
    v_user_id, p_address_id, 'pending', v_subtotal, 0,
    0, 0, v_subtotal, p_notes
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = v_cart_id
    ORDER BY ci.product_id, ci.variant_id
  LOOP
    SELECT p.price + COALESCE(pv.price_delta, 0), p.name
      INTO v_unit_price, v_product_name
    FROM public.products p
    LEFT JOIN public.product_variants pv
      ON pv.id = v_item.variant_id AND pv.product_id = p.id
    WHERE p.id = v_item.product_id
      AND p.is_active = TRUE
      AND (v_item.variant_id IS NULL OR pv.id IS NOT NULL);

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name,
      unit_price, quantity, total_price
    )
    VALUES (
      v_order_id, v_item.product_id, v_item.variant_id, v_product_name,
      v_unit_price, v_item.quantity, v_unit_price * v_item.quantity
    );

    UPDATE public.inventory
    SET quantity = quantity - v_item.quantity
    WHERE product_id = v_item.product_id
      AND variant_id IS NOT DISTINCT FROM v_item.variant_id;
  END LOOP;

  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, TEXT) TO authenticated;

-- 4. Restore base cancellation trigger (without coupon restoration)
CREATE OR REPLACE FUNCTION public.restore_inventory_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'processing', 'shipped') THEN
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_inventory_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_inventory_on_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_inventory_on_cancellation();

-- 5. Restore original customer write policies on cart_items from schema.sql
DROP POLICY IF EXISTS "Users insert own cart items" ON public.cart_items;
CREATE POLICY "Users insert own cart items"
  ON public.cart_items FOR INSERT
  WITH CHECK (cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users update own cart items" ON public.cart_items;
CREATE POLICY "Users update own cart items"
  ON public.cart_items FOR UPDATE
  USING (cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid()))
  WITH CHECK (cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users delete own cart items" ON public.cart_items;
CREATE POLICY "Users delete own cart items"
  ON public.cart_items FOR DELETE
  USING (cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid()));
