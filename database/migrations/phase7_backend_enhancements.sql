-- ═══════════════════════════════════════════════════════════════════
-- Phase 7: Backend Enhancements & Security Functions
-- Apply these additions in the Supabase Dashboard SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. SECURE ADMIN CUSTOMERS FUNCTION WITH GENUINE AUTH EMAILS
-- ─────────────────────────────────────────────────────────────────
-- Profiles table does not duplicate the email column. This SECURITY DEFINER
-- function allows only authenticated admins (is_admin() = TRUE) to retrieve
-- verified emails from auth.users without exposing service-role keys.
CREATE OR REPLACE FUNCTION public.get_admin_customers()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Strict administrative authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can view customer auth records.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    u.email::TEXT,
    p.phone,
    p.avatar_url,
    p.role,
    p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

-- Revoke public execution; enforce explicit invocation
REVOKE ALL ON FUNCTION public.get_admin_customers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_customers() TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- 2. SAFE INVENTORY RESTORATION ON ORDER CANCELLATION
-- ─────────────────────────────────────────────────────────────────
-- When an order status transitions to 'cancelled', restore stock
-- in the inventory table for all line items in that order.
CREATE OR REPLACE FUNCTION public.restore_inventory_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Only execute when status changes from active (pending/processing/shipped) to cancelled
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
