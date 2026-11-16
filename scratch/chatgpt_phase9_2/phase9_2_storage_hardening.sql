-- ShopKart Phase 9.2 — Storage hardening (fail-closed)
-- public-assets is intentionally PUBLIC for avatar display. Public bucket downloads
-- bypass storage.objects RLS; never store private documents in this bucket.
-- Avatar write access is restricted to avatars/<auth.uid()>.<approved-image-extension>.
-- Run only after confirming the Supabase project ref is the intended staging project.

BEGIN;

DO $phase9_2_storage_preflight$
DECLARE
  v_bucket_public boolean;
  v_conflicts text;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'ABORT: Supabase Storage catalog tables are unavailable';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass) THEN
    RAISE EXCEPTION 'ABORT: RLS is not enabled on storage.objects';
  END IF;

  SELECT public INTO v_bucket_public FROM storage.buckets WHERE id='public-assets';
  IF FOUND AND v_bucket_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: existing public-assets bucket is not public; no changes made';
  END IF;

  -- Strong conservative rule: any other permissive policy on storage.objects
  -- is a conflict. PostgreSQL permissive policies OR together. This intentionally
  -- aborts even for unrelated buckets until an administrator proves it harmless.
  SELECT string_agg(format('%I (cmd=%s roles=%s)', policyname, cmd, roles), E'\n')
    INTO v_conflicts
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND permissive='PERMISSIVE'
    AND policyname NOT IN (
      'Users can view own avatar in public-assets',
      'Users can upload own avatar to public-assets',
      'Users can update own avatar in public-assets',
      'Users can delete own avatar from public-assets'
    );

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: pre-existing permissive storage.objects policies require manual review before Phase 9.2:%', E'\n'||v_conflicts;
  END IF;

  -- Existing expected names are accepted only if they carry our marker.
  -- An unmarked same-name policy is treated as pre-existing and causes abort.
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='storage' AND p.tablename='objects'
      AND p.policyname IN (
        'Users can view own avatar in public-assets',
        'Users can upload own avatar to public-assets',
        'Users can update own avatar in public-assets',
        'Users can delete own avatar from public-assets'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy pol
        JOIN pg_description d ON d.objoid=pol.oid AND d.classoid='pg_policy'::regclass
        WHERE pol.polrelid='storage.objects'::regclass
          AND pol.polname=p.policyname
          AND d.description='SHOPKART_PHASE9_2_CREATED_V1'
      )
  ) THEN
    RAISE EXCEPTION 'ABORT: one or more expected policy names already exist without the Phase 9.2 ownership marker; inspect manually';
  END IF;
END
$phase9_2_storage_preflight$;

-- Create bucket only if absent. Never alter an existing bucket.
INSERT INTO storage.buckets (id, name, public)
SELECT 'public-assets', 'public-assets', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='public-assets');

DO $phase9_2_storage_create_policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='Users can view own avatar in public-assets') THEN
    CREATE POLICY "Users can view own avatar in public-assets" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id='public-assets'
        AND (storage.foldername(name))[1]='avatars'
        AND array_length(storage.foldername(name),1)=1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      );
    COMMENT ON POLICY "Users can view own avatar in public-assets" ON storage.objects
      IS 'SHOPKART_PHASE9_2_CREATED_V1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='Users can upload own avatar to public-assets') THEN
    CREATE POLICY "Users can upload own avatar to public-assets" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id='public-assets'
        AND (storage.foldername(name))[1]='avatars'
        AND array_length(storage.foldername(name),1)=1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      );
    COMMENT ON POLICY "Users can upload own avatar to public-assets" ON storage.objects
      IS 'SHOPKART_PHASE9_2_CREATED_V1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='Users can update own avatar in public-assets') THEN
    CREATE POLICY "Users can update own avatar in public-assets" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id='public-assets'
        AND (storage.foldername(name))[1]='avatars'
        AND array_length(storage.foldername(name),1)=1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      )
      WITH CHECK (
        bucket_id='public-assets'
        AND (storage.foldername(name))[1]='avatars'
        AND array_length(storage.foldername(name),1)=1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      );
    COMMENT ON POLICY "Users can update own avatar in public-assets" ON storage.objects
      IS 'SHOPKART_PHASE9_2_CREATED_V1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='Users can delete own avatar from public-assets') THEN
    CREATE POLICY "Users can delete own avatar from public-assets" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id='public-assets'
        AND (storage.foldername(name))[1]='avatars'
        AND array_length(storage.foldername(name),1)=1
        AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
      );
    COMMENT ON POLICY "Users can delete own avatar from public-assets" ON storage.objects
      IS 'SHOPKART_PHASE9_2_CREATED_V1';
  END IF;
END
$phase9_2_storage_create_policies$;

-- Postflight: verify each policy's command, roles and all required expression fragments.
DO $phase9_2_storage_postflight$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='public-assets' AND public=true) THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: public-assets bucket missing or not public';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND roles::text[] = ARRAY['authenticated']::text[]
    AND (
      (policyname='Users can view own avatar in public-assets' AND cmd='SELECT'
       AND qual LIKE '%bucket_id%' AND qual LIKE '%public-assets%'
       AND qual LIKE '%foldername%' AND qual LIKE '%auth.uid()%' AND qual LIKE '%filename%')
      OR
      (policyname='Users can upload own avatar to public-assets' AND cmd='INSERT'
       AND with_check LIKE '%bucket_id%' AND with_check LIKE '%public-assets%'
       AND with_check LIKE '%foldername%' AND with_check LIKE '%auth.uid()%' AND with_check LIKE '%filename%')
      OR
      (policyname='Users can update own avatar in public-assets' AND cmd='UPDATE'
       AND qual LIKE '%bucket_id%' AND qual LIKE '%public-assets%'
       AND qual LIKE '%foldername%' AND qual LIKE '%auth.uid()%' AND qual LIKE '%filename%'
       AND with_check LIKE '%bucket_id%' AND with_check LIKE '%public-assets%'
       AND with_check LIKE '%foldername%' AND with_check LIKE '%auth.uid()%' AND with_check LIKE '%filename%')
      OR
      (policyname='Users can delete own avatar from public-assets' AND cmd='DELETE'
       AND qual LIKE '%bucket_id%' AND qual LIKE '%public-assets%'
       AND qual LIKE '%foldername%' AND qual LIKE '%auth.uid()%' AND qual LIKE '%filename%')
    );

  IF v_count <> 4 THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: expected four avatar policies with required expression components; found %', v_count;
  END IF;
END
$phase9_2_storage_postflight$;

COMMIT;
