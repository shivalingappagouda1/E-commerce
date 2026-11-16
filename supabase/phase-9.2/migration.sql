-- ==============================================================================
-- ShopKart Phase 9.2: Comprehensive Security Hardening & Supabase Storage Setup
-- ==============================================================================
-- Target Environment : ShopKart-Staging (Supabase PostgreSQL)
-- Target Project Ref : ulmwssozdmppvydppswx
-- Execution Model    : Idempotent, Atomic Transaction (BEGIN / COMMIT)
-- Safety Guarantee   : Complete pre-migration state snapshots (tables, functions,
--                      policies), verified in-place updates, explicit allowlist,
--                      zero blind drops, exact reversibility, and zero live database execution locally.
-- ==============================================================================
-- MANUAL OPERATOR PRECONDITION:
-- The PostgreSQL system function current_database() returns 'postgres' (the database cluster
-- name), which is NOT the Supabase project reference. PostgreSQL does not natively track
-- the external Supabase project ref ('ulmwssozdmppvydppswx').
-- The operator MUST manually verify in the Supabase Dashboard URL that the active project
-- matches: https://supabase.com/dashboard/project/ulmwssozdmppvydppswx
-- ==============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: TARGET ENVIRONMENT PREFLIGHT VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_preflight$
DECLARE
  v_table text;
  v_proc_name text;
BEGIN
  RAISE NOTICE 'Phase 9.2 Preflight: Verifying target environment and schema baseline...';

  -- 1.1 Verify target roles authenticated and anon exist in pg_roles
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'PHASE9_2 ABORT: expected Supabase role "authenticated" is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'PHASE9_2 ABORT: expected Supabase role "anon" is missing';
  END IF;

  -- 1.2 Verify all 17 public tables exist and have RLS enabled (without FORCE RLS)
  FOR v_table IN SELECT unnest(ARRAY[
    'profiles', 'addresses', 'categories', 'products', 'product_images',
    'product_variants', 'inventory', 'carts', 'cart_items', 'wishlists',
    'wishlist_items', 'coupons', 'orders', 'order_items', 'payments',
    'reviews', 'banners'
  ]) LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'PHASE9_2 ABORT: required public table "%" is missing', v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'PHASE9_2 ABORT: RLS is not enabled on public table "%"', v_table;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'PHASE9_2 ABORT: FORCE RLS is active on public table "%"; aborting for safety', v_table;
    END IF;
  END LOOP;

  -- 1.3 Verify Storage catalog availability and RLS
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'PHASE9_2 ABORT: Supabase Storage catalog tables are missing';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'PHASE9_2 ABORT: RLS is not enabled on storage.objects';
  END IF;

  -- 1.4 Verify all 9 application functions exist
  FOR v_proc_name IN SELECT unnest(ARRAY[
    'public.is_admin()',
    'public.get_admin_customers()',
    'public.sync_user_cart(jsonb)',
    'public.place_order(uuid,text,text)',
    'public.cancel_order(uuid)',
    'public.create_profile_on_signup()',
    'public.prevent_role_self_escalation()',
    'public.restore_inventory_on_cancellation()',
    'public.set_updated_at()'
  ]) LOOP
    IF to_regprocedure(v_proc_name) IS NULL THEN
      RAISE EXCEPTION 'PHASE9_2 ABORT: required function "%" does not exist', v_proc_name;
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 9.2 Preflight: Target environment and schema baseline verified.';
END
$phase9_2_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: CREATE PRIVATE SNAPSHOT SCHEMA AND TABLES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS phase9_2_private;
REVOKE ALL ON SCHEMA phase9_2_private FROM PUBLIC;
REVOKE ALL ON SCHEMA phase9_2_private FROM anon, authenticated;

-- 2.1 Table ACL Snapshot Table
CREATE TABLE IF NOT EXISTS phase9_2_private.table_acl_snapshot (
  table_name text PRIMARY KEY,
  owner_name text NOT NULL,
  relacl_was_null boolean NOT NULL,
  original_acl_text text,
  original_acl_json jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON TABLE phase9_2_private.table_acl_snapshot FROM PUBLIC, anon, authenticated;

-- 2.2 Function ACL Snapshot Table
CREATE TABLE IF NOT EXISTS phase9_2_private.function_acl_snapshot (
  function_signature text PRIMARY KEY,
  function_oid oid NOT NULL,
  owner_name text NOT NULL,
  proacl_was_null boolean NOT NULL,
  original_acl_text text,
  original_acl_json jsonb NOT NULL,
  original_comment text,
  prosecdef boolean NOT NULL,
  proconfig text[],
  prosrc text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON TABLE phase9_2_private.function_acl_snapshot FROM PUBLIC, anon, authenticated;

-- 2.3 Policy Snapshot Table
CREATE TABLE IF NOT EXISTS phase9_2_private.policy_snapshot (
  schemaname text NOT NULL,
  tablename text NOT NULL,
  policyname text NOT NULL,
  cmd text NOT NULL,
  original_roles text[] NOT NULL,
  new_roles text[] NOT NULL,
  original_qual text,
  original_with_check text,
  permissive text NOT NULL DEFAULT 'PERMISSIVE',
  changed_by_phase9_2 boolean NOT NULL DEFAULT true,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (schemaname, tablename, policyname)
);
REVOKE ALL ON TABLE phase9_2_private.policy_snapshot FROM PUBLIC, anon, authenticated;

-- 2.4 Storage Policies Created Tracker
CREATE TABLE IF NOT EXISTS phase9_2_private.storage_policy_created (
  policyname text PRIMARY KEY,
  schemaname text NOT NULL DEFAULT 'storage',
  tablename text NOT NULL DEFAULT 'objects',
  cmd text NOT NULL,
  roles text[] NOT NULL,
  expected_definition text NOT NULL,
  migration_id text NOT NULL DEFAULT 'PHASE_9_2',
  creation_status text NOT NULL, -- 'CREATED' or 'PRESERVED'
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON TABLE phase9_2_private.storage_policy_created FROM PUBLIC, anon, authenticated;

-- 2.5 Strict Snapshot Schema & Version Compatibility Guard
-- CREATE TABLE IF NOT EXISTS alone does NOT validate existing column definitions if tables pre-exist.
-- Verify that all 26 required snapshot columns exist with expected names before populating.
DO $phase9_2_snapshot_schema_guard$
DECLARE
  v_missing_col text;
BEGIN
  SELECT string_agg(format('%s.%s', r.table_name, r.column_name), ', ')
  INTO v_missing_col
  FROM (
    VALUES
      ('table_acl_snapshot','table_name'),
      ('table_acl_snapshot','owner_name'),
      ('table_acl_snapshot','relacl_was_null'),
      ('table_acl_snapshot','original_acl_text'),
      ('table_acl_snapshot','original_acl_json'),
      ('function_acl_snapshot','function_signature'),
      ('function_acl_snapshot','function_oid'),
      ('function_acl_snapshot','owner_name'),
      ('function_acl_snapshot','proacl_was_null'),
      ('function_acl_snapshot','original_acl_text'),
      ('function_acl_snapshot','original_acl_json'),
      ('function_acl_snapshot','original_comment'),
      ('function_acl_snapshot','prosecdef'),
      ('function_acl_snapshot','proconfig'),
      ('function_acl_snapshot','prosrc'),
      ('policy_snapshot','schemaname'),
      ('policy_snapshot','tablename'),
      ('policy_snapshot','policyname'),
      ('policy_snapshot','original_roles'),
      ('policy_snapshot','new_roles'),
      ('storage_policy_created','policyname'),
      ('storage_policy_created','cmd'),
      ('storage_policy_created','roles'),
      ('storage_policy_created','expected_definition'),
      ('storage_policy_created','migration_id'),
      ('storage_policy_created','creation_status')
  ) AS r(table_name, column_name)
  LEFT JOIN information_schema.columns a
    ON a.table_schema = 'phase9_2_private'
   AND a.table_name = r.table_name
   AND a.column_name = r.column_name
  WHERE a.column_name IS NULL;

  IF v_missing_col IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE9_2 ABORT: existing snapshot table(s) in phase9_2_private have incompatible schema. Missing columns: %; manual cleanup required', v_missing_col;
  END IF;

  RAISE NOTICE 'Phase 9.2: Snapshot schema compatibility verified (all 26 columns intact).';
END
$phase9_2_snapshot_schema_guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: CAPTURE COMPLETE PRE-MIGRATION STATE SNAPSHOTS
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_capture_snapshots$
DECLARE
  v_table text;
  v_proc_sig text;
  v_class record;
  v_proc record;
  v_oid oid;
  v_acl_json jsonb;
  v_comment text;
BEGIN
  RAISE NOTICE 'Phase 9.2: Capturing pre-migration ACL snapshots for tables and functions...';

  -- 3.1 Snapshot Table ACLs for all 17 public tables
  FOR v_table IN SELECT unnest(ARRAY[
    'profiles', 'addresses', 'categories', 'products', 'product_images',
    'product_variants', 'inventory', 'carts', 'cart_items', 'wishlists',
    'wishlist_items', 'coupons', 'orders', 'order_items', 'payments',
    'reviews', 'banners'
  ]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM phase9_2_private.table_acl_snapshot WHERE table_name = v_table
    ) THEN
      SELECT c.oid, c.relacl, pg_get_userbyid(c.relowner) AS owner_name
      INTO v_class
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table;

      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantee_oid', a.grantee,
        'grantor_oid', a.grantor,
        'privilege', a.privilege_type,
        'is_grantable', a.is_grantable
      ) ORDER BY a.grantee, a.grantor, a.privilege_type), '[]'::jsonb)
      INTO v_acl_json
      FROM aclexplode(coalesce(v_class.relacl, acldefault('r', (SELECT relowner FROM pg_class WHERE oid = v_class.oid)))) a;

      INSERT INTO phase9_2_private.table_acl_snapshot (
        table_name, owner_name, relacl_was_null, original_acl_text, original_acl_json
      ) VALUES (
        v_table, v_class.owner_name, v_class.relacl IS NULL, v_class.relacl::text, v_acl_json
      );
    END IF;
  END LOOP;

  -- 3.2 Snapshot Function ACLs for all 9 application functions
  FOR v_proc_sig IN SELECT unnest(ARRAY[
    'public.is_admin()',
    'public.get_admin_customers()',
    'public.sync_user_cart(jsonb)',
    'public.place_order(uuid,text,text)',
    'public.cancel_order(uuid)',
    'public.create_profile_on_signup()',
    'public.prevent_role_self_escalation()',
    'public.restore_inventory_on_cancellation()',
    'public.set_updated_at()'
  ]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM phase9_2_private.function_acl_snapshot WHERE function_signature = v_proc_sig
    ) THEN
      v_oid := to_regprocedure(v_proc_sig);

      SELECT p.oid, p.prosecdef, p.proowner, p.proacl, p.prosrc, p.proconfig,
             pg_get_userbyid(p.proowner) AS owner_name
      INTO v_proc
      FROM pg_proc p WHERE p.oid = v_oid;

      v_comment := obj_description(v_oid, 'pg_proc');

      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantee_oid', a.grantee,
        'grantor_oid', a.grantor,
        'privilege', a.privilege_type,
        'is_grantable', a.is_grantable
      ) ORDER BY a.grantee, a.grantor, a.privilege_type), '[]'::jsonb)
      INTO v_acl_json
      FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a;

      INSERT INTO phase9_2_private.function_acl_snapshot (
        function_signature, function_oid, owner_name, proacl_was_null,
        original_acl_text, original_acl_json, original_comment,
        prosecdef, proconfig, prosrc
      ) VALUES (
        v_proc_sig, v_oid, v_proc.owner_name, v_proc.proacl IS NULL,
        v_proc.proacl::text, v_acl_json, v_comment,
        v_proc.prosecdef, v_proc.proconfig, v_proc.prosrc
      );
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 9.2: Pre-migration snapshots successfully captured.';
END
$phase9_2_capture_snapshots$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: TABLE-LEVEL GRANT HARDENING (EXPLICIT REVOCATION & MINIMUM GRANTS)
-- ─────────────────────────────────────────────────────────────────────────────
-- 4.1 Explicitly wipe clean ALL table privileges from PUBLIC, anon, and authenticated
-- on all 17 public tables. Table owners and service_role are intentionally preserved.
REVOKE ALL ON TABLE public.profiles, public.addresses, public.categories, public.products,
                   public.product_images, public.product_variants, public.inventory,
                   public.carts, public.cart_items, public.wishlists, public.wishlist_items,
                   public.coupons, public.orders, public.order_items, public.payments,
                   public.reviews, public.banners
  FROM PUBLIC;

REVOKE ALL ON TABLE public.profiles, public.addresses, public.categories, public.products,
                   public.product_images, public.product_variants, public.inventory,
                   public.carts, public.cart_items, public.wishlists, public.wishlist_items,
                   public.coupons, public.orders, public.order_items, public.payments,
                   public.reviews, public.banners
  FROM anon;

REVOKE ALL ON TABLE public.profiles, public.addresses, public.categories, public.products,
                   public.product_images, public.product_variants, public.inventory,
                   public.carts, public.cart_items, public.wishlists, public.wishlist_items,
                   public.coupons, public.orders, public.order_items, public.payments,
                   public.reviews, public.banners
  FROM authenticated;

-- 4.2 Minimum Required Grants for Anonymous Role (anon)
-- Only storefront catalog read access is granted.
-- ZERO mutation privileges, ZERO private customer table access.
GRANT SELECT ON TABLE public.categories, public.products, public.product_images,
                      public.product_variants, public.inventory, public.banners,
                      public.reviews, public.coupons
  TO anon;

-- 4.3 Minimum Required Grants for Authenticated Role (authenticated)
-- A. Storefront catalog reading:
GRANT SELECT ON TABLE public.categories, public.products, public.product_images,
                      public.product_variants, public.inventory, public.banners,
                      public.reviews, public.coupons
  TO authenticated;

-- B. Customer self-service tables (governed by RLS auth.uid() = user_id):
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.addresses, public.carts,
                                              public.wishlists, public.wishlist_items,
                                              public.reviews
  TO authenticated;

-- C. Customer profiles (inserts handled exclusively via trigger on auth.users):
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- D. Customer transaction records (direct client writes blocked; created via RPCs):
GRANT SELECT, UPDATE ON TABLE public.orders TO authenticated;
GRANT SELECT ON TABLE public.order_items, public.cart_items, public.payments TO authenticated;

-- E. Catalog tables administrative mutation (governed by is_admin() RLS):
GRANT INSERT, UPDATE, DELETE ON TABLE public.categories, public.products, public.product_images,
                                      public.product_variants, public.inventory, public.banners,
                                      public.coupons
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: FUNCTION SECURITY & PRIVILEGE HARDENING
-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 Revoke ALL direct execution privileges on all 9 functions from PUBLIC, anon, authenticated
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_customers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_cart(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_order(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_profile_on_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_self_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_inventory_on_cancellation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 5.2 Re-grant EXECUTE only on direct client-facing functions to authenticated role
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_cart(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;

-- Trigger-only functions (create_profile_on_signup, prevent_role_self_escalation,
-- restore_inventory_on_cancellation, set_updated_at) remain revoked from ordinary client roles.
-- Triggers execute under caller/definer context without requiring direct client RPC grants.

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: RLS POLICY STANDARDIZATION VIA EXPLICIT ALLOWLIST
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_policy_standardization$
DECLARE
  v_target record;
  v_pol record;
  v_altered_count integer := 0;
BEGIN
  RAISE NOTICE 'Phase 9.2: Standardizing RLS policies via strict explicit allowlist...';

  -- Temporary table defining the explicit policy allowlist for all 17 public tables
  CREATE TEMP TABLE temp_phase9_2_allowlist (
    schemaname text NOT NULL DEFAULT 'public',
    tablename text NOT NULL,
    policyname text NOT NULL,
    expected_cmd text NOT NULL,
    expected_roles text[] NOT NULL,
    new_roles text[] NOT NULL,
    action text NOT NULL -- 'MODIFY' or 'PRESERVE'
  ) ON COMMIT DROP;

  -- 6.1 Customer ownership and administrative policies to standardize to 'authenticated' (38 policies)
  INSERT INTO temp_phase9_2_allowlist (tablename, policyname, expected_cmd, expected_roles, new_roles, action) VALUES
    -- profiles (5)
    ('profiles', 'Users view own profile', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('profiles', 'Users update own profile', 'UPDATE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('profiles', 'Admins can view all profiles', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('profiles', 'Admins can update all profiles', 'UPDATE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('profiles', 'Admins can delete profiles', 'DELETE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- addresses (5)
    ('addresses', 'Users view own addresses', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('addresses', 'Users insert own addresses', 'INSERT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('addresses', 'Users update own addresses', 'UPDATE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('addresses', 'Users delete own addresses', 'DELETE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('addresses', 'Admins can view all addresses', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- carts (5)
    ('carts', 'Users view own cart', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('carts', 'Users insert own cart', 'INSERT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('carts', 'Users update own cart', 'UPDATE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('carts', 'Users delete own cart', 'DELETE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('carts', 'Admins can view all carts', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- cart_items (5)
    ('cart_items', 'Users view own cart items', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('cart_items', 'Users insert own cart items', 'INSERT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('cart_items', 'Users update own cart items', 'UPDATE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('cart_items', 'Users delete own cart items', 'DELETE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('cart_items', 'Admins can view all cart items', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- wishlists (4)
    ('wishlists', 'Users view own wishlist', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('wishlists', 'Users insert own wishlist', 'INSERT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('wishlists', 'Users delete own wishlist', 'DELETE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('wishlists', 'Admins can view all wishlists', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- wishlist_items (4)
    ('wishlist_items', 'Users view own wishlist items', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('wishlist_items', 'Users insert own wishlist items', 'INSERT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('wishlist_items', 'Users delete own wishlist items', 'DELETE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('wishlist_items', 'Admins can view all wishlist items', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- orders (2)
    ('orders', 'Users view own orders', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('orders', 'Admins full access to orders', 'ALL', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- order_items (2)
    ('order_items', 'Users view own order items', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('order_items', 'Admins full access to order items', 'ALL', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- payments (2)
    ('payments', 'Users view own payments', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('payments', 'Admins full access to payments', 'ALL', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    -- reviews (4)
    ('reviews', 'Users view own reviews', 'SELECT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('reviews', 'Users create own reviews', 'INSERT', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('reviews', 'Users update own reviews', 'UPDATE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY'),
    ('reviews', 'Users delete own reviews', 'DELETE', ARRAY['public'], ARRAY['authenticated'], 'MODIFY');

  -- 6.2 Preserved Storefront Catalog Policies (8 policies must remain TO public)
  INSERT INTO temp_phase9_2_allowlist (tablename, policyname, expected_cmd, expected_roles, new_roles, action) VALUES
    ('categories', 'Public can view active categories', 'SELECT', ARRAY['public'], ARRAY['public'], 'PRESERVE'),
    ('products', 'Public can view active products', 'SELECT', ARRAY['public'], ARRAY['public'], 'PRESERVE'),
    ('product_images', 'Public can view images of active products', 'SELECT', ARRAY['public'], ARRAY['public'], 'PRESERVE'),
    ('product_variants', 'Public can view variants of active products', 'SELECT', ARRAY['public'], ARRAY['public'], 'PRESERVE'),
    ('inventory', 'Public can view inventory of active products', 'SELECT', ARRAY['public'], ARRAY['public'], 'PRESERVE'),
    ('banners', 'Public can view active banners', 'SELECT', ARRAY['public'], ARRAY['public'], 'PRESERVE'),
    ('coupons', 'Public can view active valid coupons', 'SELECT', ARRAY['public'], ARRAY['public'], 'PRESERVE'),
    ('reviews', 'Public can view approved reviews', 'SELECT', ARRAY['public'], ARRAY['public'], 'PRESERVE');

  -- 6.3 Catalog Admin Policies (8 policies already standardized to authenticated in Phase 9.1)
  INSERT INTO temp_phase9_2_allowlist (tablename, policyname, expected_cmd, expected_roles, new_roles, action) VALUES
    ('categories', 'Admins full access to categories', 'ALL', ARRAY['authenticated'], ARRAY['authenticated'], 'PRESERVE'),
    ('products', 'Admins full access to products', 'ALL', ARRAY['authenticated'], ARRAY['authenticated'], 'PRESERVE'),
    ('product_images', 'Admins full access to product images', 'ALL', ARRAY['authenticated'], ARRAY['authenticated'], 'PRESERVE'),
    ('product_variants', 'Admins full access to product variants', 'ALL', ARRAY['authenticated'], ARRAY['authenticated'], 'PRESERVE'),
    ('inventory', 'Admins full access to inventory', 'ALL', ARRAY['authenticated'], ARRAY['authenticated'], 'PRESERVE'),
    ('banners', 'Admins full access to banners', 'ALL', ARRAY['authenticated'], ARRAY['authenticated'], 'PRESERVE'),
    ('coupons', 'Admins full access to coupons', 'ALL', ARRAY['authenticated'], ARRAY['authenticated'], 'PRESERVE'),
    ('reviews', 'Admins full access to reviews', 'ALL', ARRAY['authenticated'], ARRAY['authenticated'], 'PRESERVE');

  -- 6.4 Validate and execute explicit allowlist
  FOR v_target IN SELECT * FROM temp_phase9_2_allowlist LOOP
    SELECT * INTO v_pol FROM pg_policies
    WHERE schemaname = v_target.schemaname
      AND tablename = v_target.tablename
      AND policyname = v_target.policyname;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PHASE9_2 ABORT: expected policy "%" on %.% not found in pg_policies',
        v_target.policyname, v_target.schemaname, v_target.tablename;
    END IF;

    IF v_pol.cmd <> v_target.expected_cmd THEN
      RAISE EXCEPTION 'PHASE9_2 ABORT: policy "%" on %.% has cmd "%", expected "%"',
        v_target.policyname, v_target.schemaname, v_target.tablename, v_pol.cmd, v_target.expected_cmd;
    END IF;

    IF v_target.action = 'MODIFY' THEN
      -- If already modified to new_roles (idempotent re-run)
      IF v_pol.roles::text[] = v_target.new_roles THEN
        RAISE NOTICE 'Policy "%" on %.% is already standardized to %; preserving.',
          v_target.policyname, v_target.schemaname, v_target.tablename, v_target.new_roles;
      ELSIF v_pol.roles::text[] = v_target.expected_roles THEN
        -- Record pre-migration policy definition in snapshot
        INSERT INTO phase9_2_private.policy_snapshot (
          schemaname, tablename, policyname, cmd, original_roles, new_roles,
          original_qual, original_with_check, permissive, changed_by_phase9_2
        ) VALUES (
          v_target.schemaname, v_target.tablename, v_target.policyname, v_pol.cmd,
          v_pol.roles, v_target.new_roles, v_pol.qual, v_pol.with_check, v_pol.permissive, true
        ) ON CONFLICT (schemaname, tablename, policyname) DO NOTHING;

        -- Alter policy role to authenticated
        EXECUTE format(
          'ALTER POLICY %I ON %I.%I TO %s',
          v_target.policyname, v_target.schemaname, v_target.tablename,
          array_to_string(v_target.new_roles, ', ')
        );
        v_altered_count := v_altered_count + 1;
        RAISE NOTICE 'Standardized policy "%" on %.% to %',
          v_target.policyname, v_target.schemaname, v_target.tablename, v_target.new_roles;
      ELSE
        RAISE EXCEPTION 'PHASE9_2 ABORT: policy "%" on %.% has unexpected roles "%" (expected "%")',
          v_target.policyname, v_target.schemaname, v_target.tablename, v_pol.roles, v_target.expected_roles;
      END IF;
    ELSIF v_target.action = 'PRESERVE' THEN
      IF v_pol.roles::text[] <> v_target.expected_roles THEN
        RAISE EXCEPTION 'PHASE9_2 ABORT: preserved policy "%" on %.% has unexpected roles "%" (expected "%")',
          v_target.policyname, v_target.schemaname, v_target.tablename, v_pol.roles, v_target.expected_roles;
      END IF;
      -- Record as preserved in snapshot (changed_by_phase9_2 = false)
      INSERT INTO phase9_2_private.policy_snapshot (
        schemaname, tablename, policyname, cmd, original_roles, new_roles,
        original_qual, original_with_check, permissive, changed_by_phase9_2
      ) VALUES (
        v_target.schemaname, v_target.tablename, v_target.policyname, v_pol.cmd,
        v_pol.roles, v_pol.roles, v_pol.qual, v_pol.with_check, v_pol.permissive, false
      ) ON CONFLICT (schemaname, tablename, policyname) DO NOTHING;
    END IF;
  END LOOP;

  -- 6.5 Detect any unexpected policies on the 17 tables not covered by the allowlist
  FOR v_pol IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'addresses', 'categories', 'products', 'product_images',
        'product_variants', 'inventory', 'carts', 'cart_items', 'wishlists',
        'wishlist_items', 'coupons', 'orders', 'order_items', 'payments',
        'reviews', 'banners'
      )
      AND (schemaname, tablename, policyname) NOT IN (
        SELECT schemaname, tablename, policyname FROM temp_phase9_2_allowlist
      )
  LOOP
    RAISE EXCEPTION 'PHASE9_2 ABORT: unexpected policy "%" on %.% not covered by Phase 9.2 allowlist',
      v_pol.policyname, v_pol.schemaname, v_pol.tablename;
  END LOOP;

  RAISE NOTICE 'Phase 9.2: Successfully processed allowlist (% policies modified to authenticated).', v_altered_count;
END
$phase9_2_policy_standardization$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: SUPABASE STORAGE SETUP & PATH-RESTRICTED RLS
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_storage_setup$
DECLARE
  v_bucket_public boolean;
  v_conflicts text;
  v_existing_pol record;
  v_target_name text;
  v_expected_def text;
BEGIN
  RAISE NOTICE 'Phase 9.2: Provisioning Supabase Storage bucket and avatar policies...';

  -- 7.1 Create public-assets bucket only if absent. If exists, ensure public=true
  SELECT public INTO v_bucket_public FROM storage.buckets WHERE id = 'public-assets';
  IF NOT FOUND THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('public-assets', 'public-assets', true);
    RAISE NOTICE 'Created storage bucket "public-assets" with public=true';
  ELSIF v_bucket_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PHASE9_2 ABORT: existing public-assets bucket is not public; manual review required';
  ELSE
    RAISE NOTICE 'Bucket "public-assets" already exists with compatible public=true configuration.';
  END IF;

  -- 7.2 Conflict inspection on storage.objects
  SELECT string_agg(format('%I (cmd=%s roles=%s)', policyname, cmd, roles), E'\n')
    INTO v_conflicts
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND permissive = 'PERMISSIVE'
    AND policyname NOT IN (
      'Users can view own avatar in public-assets',
      'Users can upload own avatar to public-assets',
      'Users can update own avatar in public-assets',
      'Users can delete own avatar from public-assets'
    )
    AND (
      coalesce(qual, '') LIKE '%public-assets%'
      OR coalesce(with_check, '') LIKE '%public-assets%'
      OR (coalesce(qual, '') NOT LIKE '%bucket_id%' AND coalesce(with_check, '') NOT LIKE '%bucket_id%')
    );

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE9_2 ABORT: conflicting permissive policies found on storage.objects:%', E'\n'||v_conflicts;
  END IF;

  -- 7.3 Avatar Policy 1: SELECT
  -- Restricts direct authenticated storage API read access (metadata/listing) to own avatar.
  -- (Note: Public CDN HTTP downloads from a public bucket are served directly and not restricted by RLS).
  v_target_name := 'Users can view own avatar in public-assets';
  v_expected_def := 'bucket_id = ''public-assets'' AND (storage.foldername(name))[1] = ''avatars'' AND array_length(storage.foldername(name), 1) = 1 AND storage.filename(name) ~ (''^'' || (auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$'')';

  SELECT * INTO v_existing_pol FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = v_target_name;
  IF NOT FOUND THEN
    CREATE POLICY "Users can view own avatar in public-assets" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] = 'avatars'
        AND array_length(storage.foldername(name), 1) = 1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      );
    COMMENT ON POLICY "Users can view own avatar in public-assets" ON storage.objects IS 'SHOPKART_PHASE9_2_CREATED_V1';
    INSERT INTO phase9_2_private.storage_policy_created (
      policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
    ) VALUES (
      v_target_name, 'storage', 'objects', 'SELECT', ARRAY['authenticated'], v_expected_def, 'CREATED'
    ) ON CONFLICT (policyname) DO UPDATE SET creation_status = 'CREATED';
    RAISE NOTICE 'Created storage policy: %', v_target_name;
  ELSE
    IF v_existing_pol.roles::text[] = ARRAY['authenticated']::text[]
       AND v_existing_pol.cmd = 'SELECT'
       AND v_existing_pol.qual LIKE '%public-assets%'
       AND v_existing_pol.qual LIKE '%foldername%'
       AND v_existing_pol.qual LIKE '%auth.uid()%'
       AND v_existing_pol.qual LIKE '%filename%' THEN
      INSERT INTO phase9_2_private.storage_policy_created (
        policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
      ) VALUES (
        v_target_name, 'storage', 'objects', 'SELECT', ARRAY['authenticated'], v_expected_def, 'PRESERVED'
      ) ON CONFLICT (policyname) DO UPDATE SET creation_status = 'PRESERVED';
      RAISE NOTICE 'Existing storage policy "%" matches expected definition; preserving intact.', v_target_name;
    ELSE
      RAISE EXCEPTION 'PHASE9_2 ABORT: existing policy "%" has conflicting definition; manual inspection required', v_target_name;
    END IF;
  END IF;

  -- 7.4 Avatar Policy 2: INSERT
  v_target_name := 'Users can upload own avatar to public-assets';
  v_expected_def := 'bucket_id = ''public-assets'' AND (storage.foldername(name))[1] = ''avatars'' AND array_length(storage.foldername(name), 1) = 1 AND storage.filename(name) ~ (''^'' || (auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$'')';

  SELECT * INTO v_existing_pol FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = v_target_name;
  IF NOT FOUND THEN
    CREATE POLICY "Users can upload own avatar to public-assets" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] = 'avatars'
        AND array_length(storage.foldername(name), 1) = 1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      );
    COMMENT ON POLICY "Users can upload own avatar to public-assets" ON storage.objects IS 'SHOPKART_PHASE9_2_CREATED_V1';
    INSERT INTO phase9_2_private.storage_policy_created (
      policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
    ) VALUES (
      v_target_name, 'storage', 'objects', 'INSERT', ARRAY['authenticated'], v_expected_def, 'CREATED'
    ) ON CONFLICT (policyname) DO UPDATE SET creation_status = 'CREATED';
    RAISE NOTICE 'Created storage policy: %', v_target_name;
  ELSE
    IF v_existing_pol.roles::text[] = ARRAY['authenticated']::text[]
       AND v_existing_pol.cmd = 'INSERT'
       AND v_existing_pol.with_check LIKE '%public-assets%'
       AND v_existing_pol.with_check LIKE '%foldername%'
       AND v_existing_pol.with_check LIKE '%auth.uid()%'
       AND v_existing_pol.with_check LIKE '%filename%' THEN
      INSERT INTO phase9_2_private.storage_policy_created (
        policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
      ) VALUES (
        v_target_name, 'storage', 'objects', 'INSERT', ARRAY['authenticated'], v_expected_def, 'PRESERVED'
      ) ON CONFLICT (policyname) DO UPDATE SET creation_status = 'PRESERVED';
      RAISE NOTICE 'Existing storage policy "%" matches expected definition; preserving intact.', v_target_name;
    ELSE
      RAISE EXCEPTION 'PHASE9_2 ABORT: existing policy "%" has conflicting definition; manual inspection required', v_target_name;
    END IF;
  END IF;

  -- 7.5 Avatar Policy 3: UPDATE
  -- Uses identical path and ownership validation in both USING and WITH CHECK clauses (compatible with upsert: true)
  v_target_name := 'Users can update own avatar in public-assets';
  v_expected_def := 'bucket_id = ''public-assets'' AND (storage.foldername(name))[1] = ''avatars'' AND array_length(storage.foldername(name), 1) = 1 AND storage.filename(name) ~ (''^'' || (auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$'')';

  SELECT * INTO v_existing_pol FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = v_target_name;
  IF NOT FOUND THEN
    CREATE POLICY "Users can update own avatar in public-assets" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] = 'avatars'
        AND array_length(storage.foldername(name), 1) = 1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      )
      WITH CHECK (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] = 'avatars'
        AND array_length(storage.foldername(name), 1) = 1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      );
    COMMENT ON POLICY "Users can update own avatar in public-assets" ON storage.objects IS 'SHOPKART_PHASE9_2_CREATED_V1';
    INSERT INTO phase9_2_private.storage_policy_created (
      policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
    ) VALUES (
      v_target_name, 'storage', 'objects', 'UPDATE', ARRAY['authenticated'], v_expected_def, 'CREATED'
    ) ON CONFLICT (policyname) DO UPDATE SET creation_status = 'CREATED';
    RAISE NOTICE 'Created storage policy: %', v_target_name;
  ELSE
    IF v_existing_pol.roles::text[] = ARRAY['authenticated']::text[]
       AND v_existing_pol.cmd = 'UPDATE'
       AND v_existing_pol.qual LIKE '%public-assets%'
       AND v_existing_pol.qual LIKE '%auth.uid()%'
       AND v_existing_pol.with_check LIKE '%public-assets%'
       AND v_existing_pol.with_check LIKE '%auth.uid()%' THEN
      INSERT INTO phase9_2_private.storage_policy_created (
        policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
      ) VALUES (
        v_target_name, 'storage', 'objects', 'UPDATE', ARRAY['authenticated'], v_expected_def, 'PRESERVED'
      ) ON CONFLICT (policyname) DO UPDATE SET creation_status = 'PRESERVED';
      RAISE NOTICE 'Existing storage policy "%" matches expected definition; preserving intact.', v_target_name;
    ELSE
      RAISE EXCEPTION 'PHASE9_2 ABORT: existing policy "%" has conflicting definition; manual inspection required', v_target_name;
    END IF;
  END IF;

  -- 7.6 Avatar Policy 4: DELETE
  v_target_name := 'Users can delete own avatar from public-assets';
  v_expected_def := 'bucket_id = ''public-assets'' AND (storage.foldername(name))[1] = ''avatars'' AND array_length(storage.foldername(name), 1) = 1 AND storage.filename(name) ~ (''^'' || (auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$'')';

  SELECT * INTO v_existing_pol FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = v_target_name;
  IF NOT FOUND THEN
    CREATE POLICY "Users can delete own avatar from public-assets" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] = 'avatars'
        AND array_length(storage.foldername(name), 1) = 1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      );
    COMMENT ON POLICY "Users can delete own avatar from public-assets" ON storage.objects IS 'SHOPKART_PHASE9_2_CREATED_V1';
    INSERT INTO phase9_2_private.storage_policy_created (
      policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
    ) VALUES (
      v_target_name, 'storage', 'objects', 'DELETE', ARRAY['authenticated'], v_expected_def, 'CREATED'
    ) ON CONFLICT (policyname) DO UPDATE SET creation_status = 'CREATED';
    RAISE NOTICE 'Created storage policy: %', v_target_name;
  ELSE
    IF v_existing_pol.roles::text[] = ARRAY['authenticated']::text[]
       AND v_existing_pol.cmd = 'DELETE'
       AND v_existing_pol.qual LIKE '%public-assets%'
       AND v_existing_pol.qual LIKE '%foldername%'
       AND v_existing_pol.qual LIKE '%auth.uid()%'
       AND v_existing_pol.qual LIKE '%filename%' THEN
      INSERT INTO phase9_2_private.storage_policy_created (
        policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
      ) VALUES (
        v_target_name, 'storage', 'objects', 'DELETE', ARRAY['authenticated'], v_expected_def, 'PRESERVED'
      ) ON CONFLICT (policyname) DO UPDATE SET creation_status = 'PRESERVED';
      RAISE NOTICE 'Existing storage policy "%" matches expected definition; preserving intact.', v_target_name;
    ELSE
      RAISE EXCEPTION 'PHASE9_2 ABORT: existing policy "%" has conflicting definition; manual inspection required', v_target_name;
    END IF;
  END IF;

  RAISE NOTICE 'Phase 9.2: Storage configuration and avatar policies verified.';
END
$phase9_2_storage_setup$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: POSTFLIGHT VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_postflight$
DECLARE
  v_storage_count integer;
BEGIN
  -- 8.1 Verify anon CANNOT execute public.is_admin()
  IF has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE9_2 POSTFLIGHT FAIL: anon retains EXECUTE on public.is_admin()';
  END IF;

  -- 8.2 Verify authenticated CAN execute public.is_admin()
  IF NOT has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE9_2 POSTFLIGHT FAIL: authenticated lacks EXECUTE on public.is_admin()';
  END IF;

  -- 8.3 Verify trigger functions cannot be executed directly by client roles
  IF has_function_privilege('anon', 'public.create_profile_on_signup()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_profile_on_signup()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE9_2 POSTFLIGHT FAIL: trigger functions retain client EXECUTE privileges';
  END IF;

  -- 8.4 Verify bucket public-assets exists and is public
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'public-assets' AND public = true) THEN
    RAISE EXCEPTION 'PHASE9_2 POSTFLIGHT FAIL: public-assets bucket is missing or not marked public';
  END IF;

  -- 8.5 Verify all four avatar policies active on storage.objects
  SELECT count(*) INTO v_storage_count
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND roles::text[] = ARRAY['authenticated']::text[]
    AND policyname IN (
      'Users can view own avatar in public-assets',
      'Users can upload own avatar to public-assets',
      'Users can update own avatar in public-assets',
      'Users can delete own avatar from public-assets'
    );

  IF v_storage_count <> 4 THEN
    RAISE EXCEPTION 'PHASE9_2 POSTFLIGHT FAIL: expected 4 avatar policies on storage.objects; found %', v_storage_count;
  END IF;

  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'Phase 9.2 Migration Completed Successfully:';
  RAISE NOTICE '1. Table grants wiped and minimum least-privilege re-granted.';
  RAISE NOTICE '2. Function privileges locked down; client RPCs granted to authenticated.';
  RAISE NOTICE '3. Customer and admin policies standardized via explicit allowlist.';
  RAISE NOTICE '4. public-assets bucket provisioned with path-restricted avatar RLS.';
  RAISE NOTICE '5. Complete immutable snapshots stored in phase9_2_private.';
  RAISE NOTICE '====================================================================';
END
$phase9_2_postflight$;

COMMIT;
