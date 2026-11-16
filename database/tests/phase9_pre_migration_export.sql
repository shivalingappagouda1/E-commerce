-- ShopKart Phase 9.1 — read-only pre-migration inventory
-- Run in Supabase SQL Editor on ShopKart-Staging and SAVE every result set.
-- This is not a backup and generates no executable restoration script.
-- The reviewed baseline includes eight catalog admin policies currently assigned TO public;
-- the migration will narrow only those exact eight policies to authenticated, preserving predicates.

-- 1. Complete policy inventory for all Phase 9 tables and Storage objects.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname='storage' AND tablename='objects')
   OR (schemaname='public' AND tablename IN
      ('categories','products','product_images','product_variants','inventory',
       'coupons','banners','reviews','profiles','addresses','carts','cart_items',
       'orders','order_items','payments'))
ORDER BY schemaname, tablename, policyname;

-- 2. Table owners and RLS flags.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN
      ('categories','products','product_images','product_variants','inventory',
       'coupons','banners','reviews','profiles','addresses','carts','cart_items',
       'orders','order_items','payments'))
   OR (n.nspname='storage' AND c.relname='objects')
ORDER BY 1,2;

-- 3. Bucket configuration; this migration does not modify it.
SELECT id, name, owner, created_at, updated_at, public, avif_autodetection,
       file_size_limit, allowed_mime_types
FROM storage.buckets ORDER BY id;

-- 4. Critical function metadata and ACLs.
SELECT n.nspname, p.proname, p.oid::regprocedure AS signature,
       pg_get_userbyid(p.proowner) AS owner, r.rolsuper, r.rolbypassrls,
       p.prosecdef, p.proconfig, p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_roles r ON r.oid=p.proowner
WHERE n.nspname IN ('public','auth')
  AND p.proname IN ('is_admin','place_order','sync_user_cart','cancel_order',
    'restore_inventory_on_cancellation','create_profile_on_signup',
    'prevent_role_self_escalation','get_admin_customers')
ORDER BY n.nspname,p.proname,p.oid::regprocedure::text;

-- 5. Trigger inventory: pg_get_triggerdef exposes timing, events, row/statement.
SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname,
       t.tgenabled, p.oid::regprocedure AS trigger_function,
       pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal
  AND ((n.nspname='auth' AND c.relname='users')
    OR (n.nspname='public' AND c.relname IN ('orders','profiles')))
ORDER BY 1,2,3;

-- 6. Explicit function privilege summary.
SELECT p.oid::regprocedure AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.proacl,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='is_admin';

-- Recovery warning: this is an inventory only. It does not capture table data,
-- Storage object bytes, Auth users, secrets, role passwords, external provider
-- state, or a point-in-time database image. Use Supabase backup/PITR as well.
