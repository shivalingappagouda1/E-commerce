-- ShopKart Phase 9.1 — post-migration verification (read-only)
-- Run only AFTER the corrected migration completes on the confirmed ShopKart-Staging project.
-- PASS means catalog policy metadata matches. MANUAL REVIEW is not a pass.
WITH expected(table_name, policy_name) AS (VALUES
 ('categories','Admins full access to categories'),
 ('products','Admins full access to products'),
 ('product_images','Admins full access to product images'),
 ('product_variants','Admins full access to product variants'),
 ('inventory','Admins full access to inventory'),
 ('coupons','Admins full access to coupons'),
 ('banners','Admins full access to banners'),
 ('reviews','Admins full access to reviews')
), policy_results AS (
 SELECT 'CATALOG-'||e.table_name AS test_id,
        'Catalog admin policy' AS category,
        'Existing admin policy targets authenticated and retains is_admin predicates on '||e.table_name AS test,
        CASE WHEN p.policyname IS NULL THEN 'FAIL'
             WHEN p.cmd='ALL' AND p.permissive='PERMISSIVE'
              AND p.roles::text[]=ARRAY['authenticated']::text[]
              AND regexp_replace(lower(coalesce(p.qual,'')), '[[:space:]()]', '', 'g') IN ('is_admin','public.is_admin')
              AND regexp_replace(lower(coalesce(p.with_check,'')), '[[:space:]()]', '', 'g') IN ('is_admin','public.is_admin')
             THEN 'PASS' ELSE 'FAIL' END AS status,
        coalesce(format('policy=%s; cmd=%s; permissive=%s; roles=%s; using=%s; check=%s',
          p.policyname,p.cmd,p.permissive,p.roles,p.qual,p.with_check),'policy missing') AS observed,
        'PERMISSIVE; ALL; authenticated; original USING and WITH CHECK is_admin() retained' AS expected
 FROM expected e LEFT JOIN pg_policies p
   ON p.schemaname='public' AND p.tablename=e.table_name AND p.policyname=e.policy_name
), table_results AS (
 SELECT 'RLS-'||t.table_name AS test_id, 'RLS state' AS category,
        'RLS enabled and FORCE RLS disabled on '||t.table_name AS test,
        CASE WHEN c.oid IS NULL THEN 'FAIL'
             WHEN c.relrowsecurity AND NOT c.relforcerowsecurity THEN 'PASS' ELSE 'FAIL' END AS status,
        coalesce(format('rls=%s; force_rls=%s',c.relrowsecurity,c.relforcerowsecurity),'table missing') AS observed,
        'rls=true; force_rls=false' AS expected
 FROM (SELECT unnest(ARRAY['categories','products','product_images','product_variants','inventory','coupons','banners','reviews']) AS table_name) t
 LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||t.table_name)
), customer_inventory AS (
 SELECT 'CUSTOMER-POLICIES' AS test_id, 'Customer policy review' AS category,
        'Review each customer policy for auth.uid() ownership and operation scope' AS test,
        'NEEDS MANUAL REVIEW' AS status,
        coalesce(string_agg(format('%s: cmd=%s roles=%s using=%s check=%s',policyname,cmd,roles,qual,with_check),E'\n' ORDER BY tablename,policyname),'No customer policies found') AS observed,
        'Compare every policy against intended user_id/owner relationship and application access' AS expected
 FROM pg_policies WHERE schemaname='public'
   AND tablename IN ('profiles','addresses','carts','cart_items','orders','order_items','payments','wishlists','wishlist_items')
), storage_inventory AS (
 SELECT 'STORAGE-POLICIES' AS test_id, 'Storage policy review' AS category,
        'Review all storage.objects policies and their permissive OR interaction' AS test,
        'NEEDS MANUAL REVIEW' AS status,
        coalesce(string_agg(format('%s: cmd=%s roles=%s using=%s check=%s',policyname,cmd,roles,qual,with_check),E'\n' ORDER BY policyname),'No storage.objects policies found') AS observed,
        'No Storage policy is changed by this migration; review bucket access separately' AS expected
 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
), function_inventory AS (
 SELECT 'FUNCTIONS' AS test_id, 'Function security review' AS category,
        'Review function owner, BYPASSRLS, SECURITY DEFINER, search_path and effective grants' AS test,
        'NEEDS MANUAL REVIEW' AS status,
        coalesce(string_agg(format('%s owner=%s super=%s bypassrls=%s secdef=%s config=%s acl=%s anon_exec=%s auth_exec=%s',
          p.oid::regprocedure,pg_get_userbyid(p.proowner),r.rolsuper,r.rolbypassrls,p.prosecdef,p.proconfig,p.proacl,
          has_function_privilege('anon',p.oid,'EXECUTE'),has_function_privilege('authenticated',p.oid,'EXECUTE')),E'\n' ORDER BY p.oid::regprocedure::text),'No target functions found') AS observed,
        'Compare against the approved function security baseline' AS expected
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
 WHERE n.nspname IN ('public','auth') AND p.proname IN
 ('is_admin','place_order','sync_user_cart','cancel_order','restore_inventory_on_cancellation','create_profile_on_signup','prevent_role_self_escalation','get_admin_customers')
), trigger_inventory AS (
 SELECT 'TRIGGERS' AS test_id, 'Trigger review' AS category,
        'Review full trigger definitions, timing, events and enabled state' AS test,
        'NEEDS MANUAL REVIEW' AS status,
        coalesce(string_agg(format('%s on %s enabled=%s function=%s definition=%s',t.tgname,t.tgrelid::regclass,t.tgenabled,p.oid::regprocedure,pg_get_triggerdef(t.oid,true)),E'\n' ORDER BY t.tgname),'No target triggers found') AS observed,
        'Compare exact trigger definitions with approved schema baseline' AS expected
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE NOT t.tgisinternal AND ((n.nspname='auth' AND c.relname='users') OR (n.nspname='public' AND c.relname IN ('orders','profiles')))
)
SELECT * FROM policy_results
UNION ALL SELECT * FROM table_results
UNION ALL SELECT * FROM customer_inventory
UNION ALL SELECT * FROM storage_inventory
UNION ALL SELECT * FROM function_inventory
UNION ALL SELECT * FROM trigger_inventory
ORDER BY category,test_id;
