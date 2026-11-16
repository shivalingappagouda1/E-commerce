-- ═══════════════════════════════════════════════════════════════════
-- Phase 8.1 Rollback: Restore Phase 7.1 Inventory Restoration Function
-- Reverts restore_inventory_on_cancellation to allow restoration from 'shipped'.
-- Apply in Supabase Dashboard SQL Editor ONLY if rollback is required.
-- ═══════════════════════════════════════════════════════════════════

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

  -- Revert to Phase 7.1 condition: pending, processing, shipped
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
