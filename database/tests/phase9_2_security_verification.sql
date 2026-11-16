-- ShopKart Phase 9.2 — Read-only verification
-- SELECT/CTE only. No DDL/DML. Run after migrations on the verified staging project.
-- A PASS here is catalog-level evidence, not a substitute for cross-user runtime tests.

WITH
bucket_check AS (
  SELECT 'STORAGE-A-BUCKET-EXISTS' AS test_id,
         'Section A: Storage Bucket' AS category,
         'Storage bucket exists and is public' AS test_name,
         CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END AS status,
         coalesce(string_agg(format('%s public=%s', id, public), '; '), 'missing') AS observed,
         'id=public-assets public=true' AS expected
  FROM storage.buckets WHERE id='public-assets' AND public=true
),
policy_rows AS (
  SELECT * FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
),
policy_check AS (
  SELECT 'STORAGE-B-POLICY-AVATARS' AS test_id,
         'Section B: Storage Policies' AS category,
         'Four avatar policies have expected commands, role and ownership/path predicates' AS test_name,
         CASE WHEN count(*)=4 THEN 'PASS' ELSE 'FAIL' END AS status,
         coalesce(string_agg(format('%s cmd=%s roles=%s', policyname, cmd, roles), E'\n'), 'missing policies') AS observed,
         '4 policies on storage.objects targeting authenticated role' AS expected
  FROM policy_rows
  WHERE roles::text[] = ARRAY['authenticated']::text[]
    AND (
      (policyname='Users can view own avatar in public-assets' AND cmd='SELECT'
       AND qual LIKE '%public-assets%' AND qual LIKE '%foldername%'
       AND qual LIKE '%auth.uid()%' AND qual LIKE '%filename%')
      OR
      (policyname='Users can upload own avatar to public-assets' AND cmd='INSERT'
       AND with_check LIKE '%public-assets%' AND with_check LIKE '%foldername%'
       AND with_check LIKE '%auth.uid()%' AND with_check LIKE '%filename%')
      OR
      (policyname='Users can update own avatar in public-assets' AND cmd='UPDATE'
       AND qual LIKE '%public-assets%' AND qual LIKE '%foldername%'
       AND qual LIKE '%auth.uid()%' AND qual LIKE '%filename%'
       AND with_check LIKE '%public-assets%' AND with_check LIKE '%foldername%'
       AND with_check LIKE '%auth.uid()%' AND with_check LIKE '%filename%')
      OR
      (policyname='Users can delete own avatar from public-assets' AND cmd='DELETE'
       AND qual LIKE '%public-assets%' AND qual LIKE '%foldername%'
       AND qual LIKE '%auth.uid()%' AND qual LIKE '%filename%')
    )
),
policy_conflicts AS (
  SELECT 'STORAGE-C-CONFLICTS' AS test_id,
         'Section C: Policy Conflicts' AS category,
         'Other permissive policies on storage.objects require manual review' AS test_name,
         CASE WHEN count(*)=0 THEN 'PASS' ELSE 'NEEDS MANUAL REVIEW' END AS status,
         coalesce(string_agg(format('%s cmd=%s roles=%s', policyname, cmd, roles), E'\n'), 'none') AS observed,
         'Zero conflicting permissive policies on storage.objects' AS expected
  FROM policy_rows
  WHERE permissive='PERMISSIVE'
    AND policyname NOT IN (
      'Users can view own avatar in public-assets',
      'Users can upload own avatar to public-assets',
      'Users can update own avatar in public-assets',
      'Users can delete own avatar from public-assets'
    )
),
func_identity AS (
  SELECT 'FUNC-D1-IDENTITY-SECDEF' AS test_id,
         'Section D: Function Security' AS category,
         'Exact public.is_admin() exists and is SECURITY DEFINER' AS test_name,
         CASE WHEN p.oid IS NOT NULL AND p.prosecdef THEN 'PASS' ELSE 'FAIL' END AS status,
         coalesce(format('identity=%s owner=%s config=%s',
           p.oid::regprocedure, pg_get_userbyid(p.proowner), p.proconfig), 'function missing') AS observed,
         'signature=public.is_admin(); secdef=true' AS expected
  FROM (SELECT to_regprocedure('public.is_admin()') AS oid) x
  LEFT JOIN pg_proc p ON p.oid=x.oid
),
func_acl AS (
  SELECT 'FUNC-D2-EXECUTE-PRIVILEGES' AS test_id,
         'Section D: Function Security' AS category,
         'anon cannot execute; authenticated can execute public.is_admin()' AS test_name,
         CASE WHEN to_regprocedure('public.is_admin()') IS NOT NULL
                   AND NOT has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')
                   AND has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE')
              THEN 'PASS' ELSE 'FAIL' END AS status,
         format('anon=%s authenticated=%s acl=%s',
           coalesce(has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'), false),
           coalesce(has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'), false),
           (SELECT proacl FROM pg_proc WHERE oid=to_regprocedure('public.is_admin()'))) AS observed,
         'anon=false authenticated=true' AS expected
),
snapshot_check AS (
  SELECT 'FUNC-D3-SNAPSHOT-VERIFICATION' AS test_id,
         'Section D: Function Security' AS category,
         'Pre-migration snapshot exists and matches function identity' AS test_name,
         CASE WHEN to_regclass('phase9_2_private.function_acl_snapshot') IS NOT NULL
                   AND EXISTS (SELECT 1 FROM phase9_2_private.function_acl_snapshot
                                WHERE snapshot_key='public.is_admin()'
                                  AND function_oid=to_regprocedure('public.is_admin()')
                                  AND snapshot_version=1) THEN 'PASS'
              WHEN (SELECT obj_description(to_regprocedure('public.is_admin()'), 'pg_proc')) LIKE 'PHASE9_2_SNAPSHOT|%' THEN 'PASS'
              ELSE 'NEEDS MANUAL REVIEW' END AS status,
         CASE WHEN to_regclass('phase9_2_private.function_acl_snapshot') IS NOT NULL
              THEN 'phase9_2_private.function_acl_snapshot active'
              ELSE coalesce((SELECT obj_description(to_regprocedure('public.is_admin()'), 'pg_proc')), 'snapshot missing') END AS observed,
         'Verified pre-migration snapshot available' AS expected
),
app_compat AS (
  SELECT 'APP-E-COMPATIBILITY' AS test_id,
         'Section E: App Compatibility' AS category,
         'Frontend does not invoke is_admin() anonymously' AS test_name,
         'NEEDS MANUAL REVIEW' AS status,
         'Requires source-code search and runtime tests; SQL cannot prove frontend call paths' AS observed,
         'Frontend code audit confirms zero anonymous RPC calls to is_admin()' AS expected
)
SELECT * FROM bucket_check
UNION ALL SELECT * FROM policy_check
UNION ALL SELECT * FROM policy_conflicts
UNION ALL SELECT * FROM func_identity
UNION ALL SELECT * FROM func_acl
UNION ALL SELECT * FROM snapshot_check
UNION ALL SELECT * FROM app_compat
ORDER BY category, test_id;
