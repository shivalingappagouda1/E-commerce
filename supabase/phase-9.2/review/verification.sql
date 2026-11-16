-- ShopKart Phase 9.2 — Read-only package compatibility and security review
-- SAFE: SELECT-only. This file does not alter tables, policies, grants, functions, or Storage.
-- Run only after reviewing the target project in the Supabase Dashboard.
-- It intentionally reports evidence; it does not certify frontend behavior.

WITH expected_tables(table_name) AS (
  VALUES
    ('addresses'), ('banners'), ('cart_items'), ('carts'), ('categories'),
    ('coupons'), ('inventory'), ('order_items'), ('orders'), ('payments'),
    ('product_images'), ('product_variants'), ('products'), ('profiles'),
    ('reviews'), ('wishlist_items'), ('wishlists')
),
table_state AS (
  SELECT e.table_name,
         c.oid IS NOT NULL AS exists_in_db,
         COALESCE(c.relrowsecurity, false) AS rls_enabled,
         COALESCE(c.relforcerowsecurity, false) AS force_rls,
         c.relacl IS NULL AS acl_is_null,
         pg_get_userbyid(c.relowner) AS owner_name
  FROM expected_tables e
  LEFT JOIN pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_class c ON c.relnamespace = n.oid
                      AND c.relname = e.table_name
                      AND c.relkind IN ('r','p')
),
privileges AS (
  SELECT e.table_name, r.role_name, p.privilege_name,
         CASE WHEN to_regclass(format('public.%I', e.table_name)) IS NULL
              THEN NULL
              ELSE has_table_privilege(r.role_name,
                                       format('public.%I', e.table_name),
                                       p.privilege_name)
          END AS has_privilege
  FROM expected_tables e
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role_name)
  CROSS JOIN (VALUES
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
  ) p(privilege_name)
),
expected_functions(signature) AS (
  VALUES
    ('public.is_admin()'),
    ('public.get_admin_customers()'),
    ('public.sync_user_cart(jsonb)'),
    ('public.place_order(uuid,text,text)'),
    ('public.cancel_order(uuid)'),
    ('public.create_profile_on_signup()'),
    ('public.prevent_role_self_escalation()'),
    ('public.restore_inventory_on_cancellation()'),
    ('public.set_updated_at()')
),
function_state AS (
  SELECT e.signature,
         to_regprocedure(e.signature) IS NOT NULL AS exists_in_db,
         CASE WHEN to_regprocedure(e.signature) IS NOT NULL
              THEN has_function_privilege('anon', to_regprocedure(e.signature), 'EXECUTE')
         END AS anon_execute,
         CASE WHEN to_regprocedure(e.signature) IS NOT NULL
              THEN has_function_privilege('authenticated', to_regprocedure(e.signature), 'EXECUTE')
         END AS authenticated_execute
  FROM expected_functions e
),
policy_state AS (
  SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
  WHERE (schemaname = 'public' AND tablename IN (
    SELECT table_name FROM expected_tables
  ))
  OR (schemaname = 'storage' AND tablename = 'objects')
),
snapshot_state AS (
  SELECT
    to_regclass('phase9_2_private.table_acl_snapshot') IS NOT NULL AS table_snapshot_exists,
    to_regclass('phase9_2_private.function_acl_snapshot') IS NOT NULL AS function_snapshot_exists,
    to_regclass('phase9_2_private.policy_snapshot') IS NOT NULL AS policy_snapshot_exists,
    to_regclass('phase9_2_private.storage_policy_created') IS NOT NULL AS storage_tracker_exists
)
SELECT 'TABLE_RLS' AS section, table_name AS item,
       CASE WHEN NOT exists_in_db THEN 'FAIL: MISSING'
            WHEN NOT rls_enabled THEN 'FAIL: RLS DISABLED'
            WHEN force_rls THEN 'REVIEW: FORCE RLS ENABLED'
            ELSE 'OBSERVED: RLS ENABLED' END AS result,
       format('owner=%s; acl_is_null=%s', owner_name, acl_is_null) AS detail
FROM table_state

UNION ALL

SELECT 'TABLE_PRIVILEGE' AS section,
       format('%s / %s / %s', table_name, role_name, privilege_name) AS item,
       CASE WHEN has_privilege IS NULL THEN 'FAIL: TABLE MISSING'
            WHEN has_privilege THEN 'GRANTED'
            ELSE 'NOT GRANTED' END AS result,
       'Effective privilege, including inherited grants' AS detail
FROM privileges

UNION ALL

SELECT 'FUNCTION_EXECUTE' AS section, signature AS item,
       CASE WHEN NOT exists_in_db THEN 'FAIL: FUNCTION MISSING'
            ELSE format('anon=%s; authenticated=%s',
                        anon_execute, authenticated_execute) END AS result,
       'Effective EXECUTE privileges' AS detail
FROM function_state

UNION ALL

SELECT 'POLICY' AS section,
       format('%s.%s :: %s', schemaname, tablename, policyname) AS item,
       format('cmd=%s; roles=%s', cmd, roles) AS result,
       format('USING=%s; WITH CHECK=%s', COALESCE(qual,'<NULL>'),
              COALESCE(with_check,'<NULL>')) AS detail
FROM policy_state

UNION ALL

SELECT 'SNAPSHOT_TABLE' AS section, x.item,
       CASE WHEN x.present THEN 'PRESENT' ELSE 'MISSING' END AS result,
       'Presence alone does not prove snapshot completeness or reversibility' AS detail
FROM snapshot_state s
CROSS JOIN LATERAL (VALUES
  ('table_acl_snapshot', s.table_snapshot_exists),
  ('function_acl_snapshot', s.function_snapshot_exists),
  ('policy_snapshot', s.policy_snapshot_exists),
  ('storage_policy_created', s.storage_tracker_exists)
) x(item, present)

UNION ALL

SELECT 'STORAGE_BUCKET' AS section, 'public-assets' AS item,
       CASE WHEN EXISTS (
         SELECT 1 FROM storage.buckets WHERE id = 'public-assets' AND public
       ) THEN 'PRESENT AND PUBLIC'
       WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'public-assets')
         THEN 'PRESENT BUT NOT PUBLIC'
       ELSE 'MISSING' END AS result,
       'Bucket status only; inspect full policy definitions above' AS detail

ORDER BY section, item;
