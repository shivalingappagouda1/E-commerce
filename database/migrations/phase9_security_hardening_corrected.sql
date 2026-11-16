-- ShopKart Phase 9.1 — guarded standardization of existing catalog admin policies
-- PostgreSQL / Supabase. Run only on the confirmed ShopKart-Staging project.
--
-- CHANGE FROM THE PREVIOUS PACKAGE:
--   * The staging export showed that the eight target admin policies already exist.
--   * They are PERMISSIVE FOR ALL with is_admin() in USING and WITH CHECK,
--     but are assigned TO public rather than TO authenticated.
--   * This migration alters ONLY the role target of those exact eight policies.
--
-- SAFETY SCOPE:
--   * Alters eight existing policy role lists from public to authenticated.
--   * Preserves each policy name, command, permissive mode, USING and WITH CHECK.
--   * Does not create duplicate policies or drop any policy.
--   * Does not change customer policies, Storage, functions, grants, triggers, or data.
--   * Aborts unless the live definitions exactly match the reviewed staging export.
--
-- IMPORTANT: Run only after confirming the SQL Editor is connected to ShopKart-Staging.

BEGIN;

DO $phase9_preflight$
DECLARE
  v_table text;
  v_policy_name text;
  v_policy record;
  v_expected record;
  v_count integer;
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'PHASE9 ABORT: public.is_admin() does not exist';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE9 ABORT: authenticated role lacks EXECUTE on public.is_admin()';
  END IF;

  FOR v_table IN SELECT unnest(ARRAY[
    'categories','products','product_images','product_variants',
    'inventory','coupons','banners','reviews'
  ]) LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'PHASE9 ABORT: required table public.% is missing', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'PHASE9 ABORT: RLS is not enabled on public.%', v_table;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_table AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'PHASE9 ABORT: FORCE RLS is enabled on public.%; investigate first', v_table;
    END IF;
  END LOOP;

  -- Verify the target role exists in pg_roles.
  -- Note: PUBLIC is an implicit pseudo-role in PostgreSQL and does not exist in pg_roles.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    RAISE EXCEPTION 'PHASE9 ABORT: expected Supabase role authenticated is missing';
  END IF;

  -- Exact baseline from the supplied ShopKart-Staging pg_policies export.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('categories','Admins full access to categories'),
      ('products','Admins full access to products'),
      ('product_images','Admins full access to product images'),
      ('product_variants','Admins full access to product variants'),
      ('inventory','Admins full access to inventory'),
      ('coupons','Admins full access to coupons'),
      ('banners','Admins full access to banners'),
      ('reviews','Admins full access to reviews')
    ) AS expected(table_name, policy_name)
  LOOP
    SELECT * INTO v_policy
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename=v_expected.table_name
      AND policyname=v_expected.policy_name;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PHASE9 ABORT: expected existing policy public.%.% was not found',
        v_expected.table_name, v_expected.policy_name;
    END IF;

    IF v_policy.permissive <> 'PERMISSIVE'
       OR v_policy.cmd <> 'ALL'
       OR v_policy.roles::text[] <> ARRAY['public']::text[]
       OR regexp_replace(lower(coalesce(v_policy.qual,'')), '[[:space:]()]', '', 'g') NOT IN ('is_admin','public.is_admin')
       OR regexp_replace(lower(coalesce(v_policy.with_check,'')), '[[:space:]()]', '', 'g') NOT IN ('is_admin','public.is_admin') THEN
      RAISE EXCEPTION 'PHASE9 ABORT: existing policy %.% differs from reviewed baseline; no changes made',
        v_expected.table_name, v_expected.policy_name;
    END IF;
  END LOOP;

  -- Ensure there are exactly eight target policy rows with the expected names.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public'
    AND (tablename, policyname) IN (
      ('categories','Admins full access to categories'),
      ('products','Admins full access to products'),
      ('product_images','Admins full access to product images'),
      ('product_variants','Admins full access to product variants'),
      ('inventory','Admins full access to inventory'),
      ('coupons','Admins full access to coupons'),
      ('banners','Admins full access to banners'),
      ('reviews','Admins full access to reviews')
    );
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'PHASE9 ABORT: expected exactly eight reviewed target policies, found %', v_count;
  END IF;
END
$phase9_preflight$;

-- Narrow each existing policy from PUBLIC to authenticated.
-- Names and all policy predicates remain unchanged.
ALTER POLICY "Admins full access to categories" ON public.categories TO authenticated;
ALTER POLICY "Admins full access to products" ON public.products TO authenticated;
ALTER POLICY "Admins full access to product images" ON public.product_images TO authenticated;
ALTER POLICY "Admins full access to product variants" ON public.product_variants TO authenticated;
ALTER POLICY "Admins full access to inventory" ON public.inventory TO authenticated;
ALTER POLICY "Admins full access to coupons" ON public.coupons TO authenticated;
ALTER POLICY "Admins full access to banners" ON public.banners TO authenticated;
ALTER POLICY "Admins full access to reviews" ON public.reviews TO authenticated;

DO $phase9_postflight$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public'
    AND (tablename, policyname) IN (
      ('categories','Admins full access to categories'),
      ('products','Admins full access to products'),
      ('product_images','Admins full access to product images'),
      ('product_variants','Admins full access to product variants'),
      ('inventory','Admins full access to inventory'),
      ('coupons','Admins full access to coupons'),
      ('banners','Admins full access to banners'),
      ('reviews','Admins full access to reviews')
    )
    AND permissive='PERMISSIVE'
    AND cmd='ALL'
    AND roles::text[]=ARRAY['authenticated']::text[]
    AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') IN ('is_admin','public.is_admin')
    AND regexp_replace(lower(coalesce(with_check,'')), '[[:space:]()]', '', 'g') IN ('is_admin','public.is_admin');

  IF v_count <> 8 THEN
    RAISE EXCEPTION 'PHASE9 ABORT: postflight expected eight authenticated admin policies, found %', v_count;
  END IF;
  RAISE NOTICE 'Phase 9.1 complete: eight existing catalog admin policies now target authenticated. Predicates and unrelated policies were preserved.';
END
$phase9_postflight$;

COMMIT;
