-- ═══════════════════════════════════════════════════════════════════
-- Phase 8.1: Shipped-Order Inventory Restoration Safety
-- Additive Migration: Restrict automatic inventory & coupon restoration
-- strictly to pre-fulfillment cancellations ('pending', 'processing').
-- Shipped and delivered orders MUST NOT automatically restore sellable stock.
-- Apply this addition in the Supabase Dashboard SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. HARDEN INVENTORY & COUPON RESTORATION TRIGGER FUNCTION
-- ─────────────────────────────────────────────────────────────────
-- When an order is cancelled before fulfillment ('pending' or 'processing'),
-- physical items are still in warehouse stock, so restoring sellable stock
-- and releasing the consumed coupon is automated and safe.
--
-- When an order is 'shipped', physical items have left the warehouse and are
-- in the custody of shipping carriers. Automatically returning shipped items
-- to active inventory risks phantom stock, overselling, and unfulfillable orders.
-- Shipped orders that are cancelled (RTO/failed delivery) must be physically
-- inspected before manual stock adjustment via the Admin Inventory portal.
CREATE OR REPLACE FUNCTION public.restore_inventory_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Guard 1: Prevent reopening or transitioning already cancelled orders back to active states
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled orders cannot be reopened or transitioned to %', NEW.status;
  END IF;

  -- Guard 2: Only execute restoration when status changes to 'cancelled' from pre-fulfillment statuses.
  -- Shipped and delivered orders MUST NOT restore inventory or decrement coupon usage automatically.
  IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'processing') THEN
    -- Restore inventory for each line item in the order
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

-- Revoke direct execution permissions from client-facing roles.
-- This function is exclusively triggered by PostgreSQL on UPDATE OF status.
REVOKE ALL ON FUNCTION public.restore_inventory_on_cancellation()
FROM PUBLIC, anon, authenticated;

-- Ensure trigger is cleanly attached to public.orders
DROP TRIGGER IF EXISTS trg_restore_inventory_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_inventory_on_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_inventory_on_cancellation();

COMMENT ON FUNCTION public.restore_inventory_on_cancellation() IS
'Phase 8.1: Safe inventory and coupon restoration on order cancellation. Restricts automated restoration strictly to pre-fulfillment statuses (pending, processing). Shipped and delivered cancellations do not automatically restock sellable inventory.';
