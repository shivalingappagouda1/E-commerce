-- ShopKart Phase 9.1 — guarded rollback of the eight policy role changes
-- Restores the exact pre-migration role target (public) for the eight reviewed policies.
-- Does not drop policies or change predicates, customer policies, Storage, functions, grants, triggers, or data.

BEGIN;

DO $phase9_rollback_preflight$
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
    RAISE EXCEPTION 'ROLLBACK ABORT: expected eight unchanged Phase 9.1 policies; found % matching definitions. No changes made.', v_count;
  END IF;
END
$phase9_rollback_preflight$;

ALTER POLICY "Admins full access to categories" ON public.categories TO public;
ALTER POLICY "Admins full access to products" ON public.products TO public;
ALTER POLICY "Admins full access to product images" ON public.product_images TO public;
ALTER POLICY "Admins full access to product variants" ON public.product_variants TO public;
ALTER POLICY "Admins full access to inventory" ON public.inventory TO public;
ALTER POLICY "Admins full access to coupons" ON public.coupons TO public;
ALTER POLICY "Admins full access to banners" ON public.banners TO public;
ALTER POLICY "Admins full access to reviews" ON public.reviews TO public;

DO $phase9_rollback_postflight$
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
    AND permissive='PERMISSIVE' AND cmd='ALL'
    AND roles::text[]=ARRAY['public']::text[]
    AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') IN ('is_admin','public.is_admin')
    AND regexp_replace(lower(coalesce(with_check,'')), '[[:space:]()]', '', 'g') IN ('is_admin','public.is_admin');
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: postflight expected eight restored public policies, found %', v_count;
  END IF;
END
$phase9_rollback_postflight$;

COMMIT;
