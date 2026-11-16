-- ShopKart Phase 9.2 — Storage rollback (fail-closed)
-- Drops only policies created by this migration and still matching its expected
-- signature. Never deletes bucket rows or storage objects.

BEGIN;

DO $phase9_2_storage_rollback$
DECLARE
  v_pol record;
  v_expected text;
BEGIN
  FOR v_pol IN
    SELECT p.oid, p.polname, p.polcmd, p.polqual, p.polwithcheck, p.polroles
    FROM pg_policy p
    WHERE p.polrelid='storage.objects'::regclass
      AND p.polname IN (
        'Users can view own avatar in public-assets',
        'Users can upload own avatar to public-assets',
        'Users can update own avatar in public-assets',
        'Users can delete own avatar from public-assets'
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_description d
      WHERE d.objoid=v_pol.oid
        AND d.classoid='pg_policy'::regclass
        AND d.description='SHOPKART_PHASE9_2_CREATED_V1'
    ) THEN
      RAISE NOTICE 'Preserving unmarked policy %', v_pol.polname;
      CONTINUE;
    END IF;

    -- Verify the policy still references the expected bucket and ownership checks.
    IF NOT (
      coalesce(pg_get_expr(v_pol.polqual, v_pol.oid), '') LIKE '%public-assets%'
      OR coalesce(pg_get_expr(v_pol.polwithcheck, v_pol.oid), '') LIKE '%public-assets%'
    ) OR NOT (
      coalesce(pg_get_expr(v_pol.polqual, v_pol.oid), '') LIKE '%auth.uid()%'
      OR coalesce(pg_get_expr(v_pol.polwithcheck, v_pol.oid), '') LIKE '%auth.uid()%'
    ) THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: tagged policy % was modified after creation; manual review required', v_pol.polname;
    END IF;

    EXECUTE format('DROP POLICY %I ON storage.objects', v_pol.polname);
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_description d ON d.objoid=p.oid AND d.classoid='pg_policy'::regclass
    WHERE p.polrelid='storage.objects'::regclass
      AND d.description='SHOPKART_PHASE9_2_CREATED_V1'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Phase 9.2 policy markers remain';
  END IF;
END
$phase9_2_storage_rollback$;

-- Intentionally do not delete public-assets bucket or any stored objects.
COMMIT;
