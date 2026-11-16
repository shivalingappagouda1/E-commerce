-- ═══════════════════════════════════════════════════════════════════
-- Phase 7.2 Rollback Script: Customer Order Cancellation RPC
-- Apply in Supabase SQL Editor ONLY if reverting Phase 7.2 changes
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.cancel_order(UUID);
