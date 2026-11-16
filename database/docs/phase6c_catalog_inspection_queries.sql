-- =============================================================================
-- ShopKart Phase 6C — Catalog Inspection Queries
-- =============================================================================
-- PURPOSE: Safe, read-only queries for an independent reviewer to verify that
-- the Phase 6C migration has been applied correctly to an isolated PostgreSQL
-- instance.
--
-- SAFETY RULE: These are SELECT / \d-equivalent queries ONLY.
-- DO NOT run against production Supabase.
-- Run against: a local Docker container or a dedicated review instance.
--
-- HOW TO USE:
--   psql -h 127.0.0.1 -U postgres -d postgres -f this_file.sql
-- =============================================================================

-- 1. VERIFY FUNCTION OVERLOAD INVENTORY
-- After Phase 6C the ONLY surviving place_order signature must be the 5-argument one.
-- Any leftover 2-, 3-, or 4-argument overloads are a schema defect.
SELECT
  p.proname                                    AS function_name,
  pg_get_function_arguments(p.oid)             AS argument_list,
  pg_get_function_result(p.oid)                AS return_type,
  p.prosecdef                                  AS security_definer,
  p.proacl                                     AS raw_acl,
  array_to_string(p.proacl::text[], ', ')      AS acl_readable,
  n.nspname                                    AS schema
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'place_order',
  'cancel_order',
  'submit_phonepe_utr',
  'admin_record_refund',
  'expire_pending_phonepe_orders',
  'restore_inventory_on_cancellation',
  'guard_order_status_transition',
  'guard_role_escalation',
  'admin_create_return_inspection',
  'admin_complete_return_inspection',
  '_restock_approved_return_inspections'
)
ORDER BY p.proname, pg_get_function_arguments(p.oid);

-- Expected result:
--   place_order                       → exactly ONE row: (UUID, TEXT, TEXT, TEXT, TEXT) → UUID
--   cancel_order                      → exactly ONE row
--   submit_phonepe_utr                → exactly ONE row
--   admin_record_refund               → exactly ONE row: (UUID, TEXT, TEXT, BOOLEAN) → JSONB
--   admin_create_return_inspection    → exactly ONE row: (UUID, UUID, INT, TEXT) → UUID
--   admin_complete_return_inspection  → exactly ONE row: (UUID, TEXT, INT, TEXT, TEXT, BOOLEAN) → JSONB
--   _restock_approved_return_inspections → exactly ONE row: (UUID) → INT (service_role only)
--   All others                        → exactly ONE row each

-- =============================================================================
-- 2. VERIFY FUNCTION ACL (GRANT / REVOKE)
-- =============================================================================
-- For each function, the ACL column must show grants only to intended roles.
-- place_order, cancel_order, submit_phonepe_utr:
--   Must be: GRANT EXECUTE TO authenticated
--   Must NOT include: anon, PUBLIC
-- admin_record_refund:
--   Must be: GRANT EXECUTE TO service_role (admin-only, called server-side)
--   Must NOT include: authenticated, anon, PUBLIC
SELECT
  p.proname                                AS function_name,
  pg_get_function_arguments(p.oid)         AS arguments,
  array_to_string(p.proacl::text[], ', ')  AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('place_order','cancel_order','submit_phonepe_utr','admin_record_refund','admin_create_return_inspection','admin_complete_return_inspection','_restock_approved_return_inspections','expire_pending_phonepe_orders')
ORDER BY p.proname;

-- =============================================================================
-- 3. VERIFY TABLE PRIVILEGE MATRIX
-- =============================================================================
-- payment_submissions and physical_return_inspections tables must have:
--   authenticated: SELECT only
--   service_role:  ALL
--   anon:          no grants
--   PUBLIC:        no grants
SELECT
  grantee,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('payment_submissions', 'physical_return_inspections')
ORDER BY table_name, grantee, privilege_type;

-- orders, order_items, payments — verify authenticated cannot insert directly
-- (all writes must go through place_order / cancel_order RPCs)
SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items', 'payments')
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- =============================================================================
-- 4. VERIFY ROW-LEVEL SECURITY
-- =============================================================================
-- RLS must be ENABLED and FORCED on these tables.
SELECT
  relname              AS table_name,
  relrowsecurity       AS rls_enabled,
  relforcerowsecurity  AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND relname IN (
    'orders', 'order_items', 'payments',
    'payment_submissions', 'physical_return_inspections', 'addresses', 'carts', 'cart_items',
    'coupons', 'inventory', 'products', 'profiles'
  )
ORDER BY relname;

-- List the actual RLS policies on these tables
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'orders', 'order_items', 'payments',
    'payment_submissions', 'physical_return_inspections', 'addresses', 'carts', 'cart_items'
  )
ORDER BY tablename, policyname;

-- =============================================================================
-- 5. VERIFY UNIQUE INDEX FOR IDEMPOTENCY
-- =============================================================================
-- The orders.idempotency_key column must have a UNIQUE index.
SELECT
  ix.indisunique  AS is_unique,
  ix.indisprimary AS is_primary,
  a.attname       AS column_name,
  t.relname       AS table_name,
  i.relname       AS index_name
FROM pg_index ix
JOIN pg_class t  ON t.oid = ix.indrelid
JOIN pg_class i  ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'orders'
  AND a.attname = 'idempotency_key';

-- =============================================================================
-- 6. VERIFY COLUMN PRESENCE
-- =============================================================================
-- Confirm that all Phase 6C columns exist on their respective tables.
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'orders'   AND column_name IN ('payment_provider','idempotency_key'))
 OR (table_name = 'payments' AND column_name IN ('refund_reference','provider'))
 OR (table_name = 'payment_submissions' AND column_name IN ('order_id','utr_number','status','submitted_at'))
  )
ORDER BY table_name, column_name;

-- =============================================================================
-- 7. VERIFY TRIGGERS
-- =============================================================================
SELECT
  trigger_name,
  event_object_table  AS table_name,
  event_manipulation  AS event,
  action_timing       AS timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'trg_restore_inventory_on_cancellation',
    'trg_guard_order_status_transition',
    'trg_guard_role_escalation'
  )
ORDER BY table_name, trigger_name;

-- =============================================================================
-- 8. VERIFY POSTG REST VISIBILITY (functions the API exposes)
-- =============================================================================
-- PostgREST only exposes functions in the exposed schema with SECURITY DEFINER
-- or explicit GRANT to anon/authenticated. This query shows what is currently
-- callable via /rpc/.
SELECT
  p.proname                             AS rpc_name,
  pg_get_function_arguments(p.oid)      AS arguments,
  p.prosecdef                           AS security_definer,
  array_to_string(p.proacl::text[], ' | ') AS grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (
    p.proacl::text LIKE '%authenticated%'
    OR p.proacl::text LIKE '%anon%'
    OR p.prosecdef = TRUE
  )
ORDER BY p.proname;

-- =============================================================================
-- 9. VERIFY SEARCH_PATH IS RESTRICTED
-- =============================================================================
-- 9. VERIFY STRICT EXACT EMPTY SEARCH_PATH IS CONFIGURED
-- =============================================================================
-- All SECURITY DEFINER functions must have strictly empty search_path (search_path = '')
-- in their proconfig to eliminate search_path hijacking vulnerabilities.
SELECT
  p.proname,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'place_order','cancel_order','submit_phonepe_utr','admin_record_refund',
    'expire_pending_phonepe_orders','admin_create_return_inspection',
    'admin_complete_return_inspection','_restock_approved_return_inspections',
    'restore_inventory_on_cancellation'
  );

-- Expected: proconfig = {search_path=""} (strict empty string search_path)
-- Bad:      proconfig IS NULL   (inherits caller search_path — schema injection risk)

-- =============================================================================
-- 10. VERIFY FUNCTION DEPENDENCIES (pg_depend)
-- =============================================================================
-- Confirm that all 2-, 3-, 4-argument place_order overloads were dropped.
-- If this query returns any rows for the 2-/3-/4-arg signatures, the old
-- overloads still exist.
SELECT
  p.proname,
  pg_get_function_arguments(p.oid)  AS arguments,
  p.oid
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'place_order';

-- Expected: exactly ONE row with arguments:
--   p_address_id uuid, p_notes text, p_coupon_code text, p_payment_provider text, p_idempotency_key text

-- =============================================================================
-- 11. VERIFY PHYSICAL RETURN INSPECTION CONSTRAINTS
-- =============================================================================
-- Confirm that chk_outcome_qty and chk_approved_qty exist on physical_return_inspections.
SELECT
  conname,
  contype,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'physical_return_inspections'
  AND c.conname IN ('chk_outcome_qty', 'chk_approved_qty');
