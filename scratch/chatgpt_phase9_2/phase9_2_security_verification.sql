-- ShopKart Phase 9.2 — Read-only verification
-- SELECT/CTE only. No DDL/DML. Run after migrations on the verified staging project.
-- A PASS here is catalog-level evidence, not a substitute for cross-user runtime tests.

WITH
bucket_check AS (
  SELECT 'A_BUCKET' test_id, 'Storage bucket exists and is public' test_name,
         CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END status,
         coalesce(string_agg(format('%s public=%s',id,public),'; '),'missing') observed
  FROM storage.buckets WHERE id='public-assets' AND public=true
),
policy_rows AS (
  SELECT * FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
),
policy_check AS (
  SELECT 'B_POLICIES' test_id,
         'Four avatar policies have expected commands, role and ownership/path predicates' test_name,
         CASE WHEN count(*)=4 THEN 'PASS' ELSE 'FAIL' END status,
         coalesce(string_agg(format('%s cmd=%s roles=%s using=%s check=%s',
           policyname,cmd,roles,qual,with_check),E'\n'),'missing policies') observed
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
  SELECT 'C_OTHER_PERMISSIVE_POLICIES' test_id,
         'Other permissive policies on storage.objects require manual review' test_name,
         CASE WHEN count(*)=0 THEN 'PASS' ELSE 'NEEDS MANUAL REVIEW' END status,
         coalesce(string_agg(format('%s cmd=%s roles=%s using=%s check=%s',
           policyname,cmd,roles,qual,with_check),E'\n'),'none') observed
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
  SELECT 'D1_FUNCTION_IDENTITY' test_id,
         'Exact public.is_admin() exists and is SECURITY DEFINER' test_name,
         CASE WHEN p.oid IS NOT NULL AND p.prosecdef THEN 'PASS' ELSE 'FAIL' END status,
         coalesce(format('identity=%s owner=%s config=%s',
           p.oid::regprocedure,pg_get_userbyid(p.proowner),p.proconfig),'function missing') observed
  FROM (SELECT to_regprocedure('public.is_admin()') oid) x
  LEFT JOIN pg_proc p ON p.oid=x.oid
),
func_acl AS (
  SELECT 'D2_FUNCTION_EFFECTIVE_PRIVILEGES' test_id,
         'anon cannot execute; authenticated can execute public.is_admin()' test_name,
         CASE WHEN to_regprocedure('public.is_admin()') IS NOT NULL
                   AND NOT has_function_privilege('anon','public.is_admin()','EXECUTE')
                   AND has_function_privilege('authenticated','public.is_admin()','EXECUTE')
              THEN 'PASS' ELSE 'FAIL' END status,
         format('anon=%s authenticated=%s acl=%s',
           coalesce(has_function_privilege('anon','public.is_admin()','EXECUTE'),false),
           coalesce(has_function_privilege('authenticated','public.is_admin()','EXECUTE'),false),
           (SELECT proacl FROM pg_proc WHERE oid=to_regprocedure('public.is_admin()'))) observed
),
snapshot_check AS (
  SELECT 'D3_SNAPSHOT' test_id,
         'Original ACL snapshot exists and matches function identity' test_name,
         CASE WHEN to_regclass('phase9_2_private.function_acl_snapshot') IS NULL THEN 'NEEDS MANUAL REVIEW'
              WHEN EXISTS (SELECT 1 FROM phase9_2_private.function_acl_snapshot
                           WHERE snapshot_key='public.is_admin()'
                             AND function_oid=to_regprocedure('public.is_admin()')
                             AND snapshot_version=1) THEN 'PASS'
              ELSE 'FAIL' END status,
         CASE WHEN to_regclass('phase9_2_private.function_acl_snapshot') IS NULL
              THEN 'snapshot table absent'
              ELSE 'inspect phase9_2_private.function_acl_snapshot' END observed
),
app_compat AS (
  SELECT 'E_APP_COMPATIBILITY' test_id,
         'Frontend does not invoke is_admin() anonymously' test_name,
         'NEEDS MANUAL REVIEW' status,
         'Requires source-code search and runtime tests; SQL cannot prove frontend call paths' observed
)
SELECT * FROM bucket_check
UNION ALL SELECT * FROM policy_check
UNION ALL SELECT * FROM policy_conflicts
UNION ALL SELECT * FROM func_identity
UNION ALL SELECT * FROM func_acl
UNION ALL SELECT * FROM snapshot_check
UNION ALL SELECT * FROM app_compat
ORDER BY test_id;
