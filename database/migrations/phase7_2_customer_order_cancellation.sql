-- ═══════════════════════════════════════════════════════════════════
-- Phase 7.2: Customer Order Cancellation RPC
-- Apply this addition in the Supabase Dashboard SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. SECURE CUSTOMER ORDER CANCELLATION RPC
-- ─────────────────────────────────────────────────────────────────
-- Allows authenticated customers to cancel their own orders while in
-- an active pre-fulfillment status ('pending' or 'processing').
--
-- Security & Concurrency Guarantees:
-- 1. Uses auth.uid() to identify the caller; unauthenticated calls are rejected.
-- 2. Acquires an exclusive row-level lock (FOR UPDATE) on the order row
--    to serialize concurrent requests and eliminate race conditions.
-- 3. Strictly verifies order ownership (orders.user_id = auth.uid()).
-- 4. Verifies current status is eligible ('pending' or 'processing').
-- 5. Rejects attempts to cancel orders that are 'shipped', 'delivered',
--    already 'cancelled', or 'refunded' with explicit informative errors.
-- 6. Executes with SECURITY DEFINER and an empty search_path to prevent
--    search-path spoofing attacks.
-- 7. Triggers the existing `trg_restore_inventory_on_cancel` trigger on
--    public.orders, which atomically restores item stock in public.inventory
--    and releases any consumed coupon usage in public.coupons.
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
  -- 1. Authentication check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to cancel order';
  END IF;

  -- 2. Validate input parameter
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  -- 3. Lock order row FOR UPDATE to serialize concurrent cancellation requests
  SELECT id, user_id, status INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- 4. Customer authorization check: order must belong to the authenticated user
  IF v_order.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Access denied: You can only cancel your own orders';
  END IF;

  -- 5. Business logic validation on order status
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

  -- 6. Transition order to 'cancelled' status
  -- This activates trg_restore_inventory_on_cancel which automatically
  -- restores inventory and releases any consumed coupon exactly once.
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

-- Revoke all permissions from PUBLIC and anonymous callers
REVOKE ALL ON FUNCTION public.cancel_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order(UUID) FROM anon;

-- Grant execution strictly to authenticated customers
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated;
