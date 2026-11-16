-- ShopKart Phase 9.2 — Snapshot schema compatibility inspection
-- SAFE: SELECT-only. Use this to compare the migration's snapshot schema with rollback.sql.
-- Do not run a rollback until every required column and every expected snapshot row is verified.

WITH required_columns(table_name, column_name) AS (
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
),
actual_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'phase9_2_private'
)
SELECT r.table_name, r.column_name,
       CASE WHEN a.column_name IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM required_columns r
LEFT JOIN actual_columns a
  ON a.table_name = r.table_name
 AND a.column_name = r.column_name
ORDER BY r.table_name, r.column_name;

-- Expected row counts for the migration described in the reviewed source:
-- 17 table ACL rows; 9 function ACL rows; policy rows should match the explicit
-- policy allowlist; Storage tracker rows should match policies created by this run.
SELECT 'table_acl_snapshot' AS snapshot_name,
       count(*) AS actual_rows,
       17 AS minimum_expected_rows,
       CASE WHEN count(*) >= 17 THEN 'ROW COUNT OK' ELSE 'INCOMPLETE' END AS status
FROM phase9_2_private.table_acl_snapshot
UNION ALL
SELECT 'function_acl_snapshot', count(*), 9,
       CASE WHEN count(*) >= 9 THEN 'ROW COUNT OK' ELSE 'INCOMPLETE' END
FROM phase9_2_private.function_acl_snapshot
UNION ALL
SELECT 'policy_snapshot', count(*), 1,
       CASE WHEN count(*) >= 1 THEN 'INSPECT AGAINST ALLOWLIST' ELSE 'EMPTY' END
FROM phase9_2_private.policy_snapshot
UNION ALL
SELECT 'storage_policy_created', count(*), 0,
       'INSPECT CREATED VS PRESERVED; zero may be valid if all were pre-existing'
FROM phase9_2_private.storage_policy_created;
