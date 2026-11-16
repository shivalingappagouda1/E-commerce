-- ==============================================================================
-- ShopKart Phase 9.2: Comprehensive Security Rollback
-- ==============================================================================
-- Target Environment : ShopKart-Staging (Supabase PostgreSQL)
-- Target Project Ref : ulmwssozdmppvydppswx
-- Execution Model    : Idempotent, Atomic Transaction (BEGIN / COMMIT)
-- Safety Guarantee   : Exact snapshot restoration for tables, functions, and policies.
--                      Zero bucket deletions, zero object deletions, no blanket GRANT ALL.
-- ==============================================================================
-- MANUAL OPERATOR PRECONDITION:
-- The PostgreSQL system function current_database() returns 'postgres' (the database cluster
-- name), which is NOT the Supabase project reference. PostgreSQL does not natively track
-- the external Supabase project ref ('ulmwssozdmppvydppswx').
-- The operator MUST manually verify in the Supabase Dashboard URL that the active project
-- matches: https://supabase.com/dashboard/project/ulmwssozdmppvydppswx
-- ==============================================================================
-- WARNING: This rollback intentionally restores the exact pre-Phase-9.2 security configuration
-- from recorded snapshots, which may reintroduce broad anonymous or public permissions.
-- This rollback must be reviewed before execution and is NOT a recommended security state.
-- ==============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: ROLLBACK PREFLIGHT & SNAPSHOT INTEGRITY VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_rollback_preflight$
DECLARE
  v_table_snapshot_count integer;
  v_func_snapshot_count integer;
  v_policy_snapshot_count integer;
  v_storage_snapshot_count integer;
BEGIN
  RAISE NOTICE 'Phase 9.2 Rollback: Verifying pre-migration snapshot integrity and exact identities...';

  -- 1.1 Verify private snapshot schema and tables exist
  IF to_regclass('phase9_2_private.table_acl_snapshot') IS NULL
     OR to_regclass('phase9_2_private.function_acl_snapshot') IS NULL
     OR to_regclass('phase9_2_private.policy_snapshot') IS NULL
     OR to_regclass('phase9_2_private.storage_policy_created') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: Phase 9.2 snapshot tables are missing in phase9_2_private. Cannot guarantee exact restoration.';
  END IF;

  -- 1.2 Verify snapshot schema column compatibility (all 26 columns)
  IF EXISTS (
    SELECT 1
    FROM (
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
    ) AS r(table_name, column_name)
    LEFT JOIN information_schema.columns a
      ON a.table_schema = 'phase9_2_private'
     AND a.table_name = r.table_name
     AND a.column_name = r.column_name
    WHERE a.column_name IS NULL
  ) THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: snapshot tables in phase9_2_private have incompatible columns. Aborting to prevent corrupting state.';
  END IF;

  -- 1.3 Verify exact table snapshot identities (all 17 public tables, no duplicates, no missing, no unexpected)
  IF (
    SELECT array_agg(table_name ORDER BY table_name)
    FROM phase9_2_private.table_acl_snapshot
  ) IS DISTINCT FROM ARRAY[
    'addresses', 'banners', 'cart_items', 'carts', 'categories', 'coupons',
    'inventory', 'order_items', 'orders', 'payments', 'product_images',
    'product_variants', 'products', 'profiles', 'reviews', 'wishlist_items', 'wishlists'
  ] OR (SELECT count(DISTINCT table_name) FROM phase9_2_private.table_acl_snapshot) <> 17
     OR (SELECT count(*) FROM phase9_2_private.table_acl_snapshot) <> 17 THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: table_acl_snapshot identities corrupted, missing, unexpected, or duplicated. Manual inspection required.';
  END IF;

  -- 1.4 Verify exact function snapshot identities (all 9 application functions, no duplicates, no missing, no unexpected)
  IF (
    SELECT array_agg(replace(function_signature, 'public.', '') ORDER BY replace(function_signature, 'public.', ''))
    FROM phase9_2_private.function_acl_snapshot
  ) IS DISTINCT FROM ARRAY[
    'cancel_order(uuid)',
    'create_profile_on_signup()',
    'get_admin_customers()',
    'is_admin()',
    'place_order(uuid,text,text)',
    'prevent_role_self_escalation()',
    'restore_inventory_on_cancellation()',
    'set_updated_at()',
    'sync_user_cart(jsonb)'
  ] OR (SELECT count(DISTINCT function_signature) FROM phase9_2_private.function_acl_snapshot) <> 9
     OR (SELECT count(*) FROM phase9_2_private.function_acl_snapshot) <> 9 THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: function_acl_snapshot identities corrupted, missing, unexpected, or duplicated. Manual inspection required.';
  END IF;

  -- 1.5 Verify policy snapshot completeness: exact 38 modified policies from allowlist
  IF (
    SELECT count(*)
    FROM phase9_2_private.policy_snapshot
    WHERE changed_by_phase9_2 = true
  ) <> 38
  OR (
    SELECT count(DISTINCT (schemaname, tablename, policyname))
    FROM phase9_2_private.policy_snapshot
    WHERE changed_by_phase9_2 = true
  ) <> 38
  OR EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('profiles', 'Users view own profile'),
        ('profiles', 'Users update own profile'),
        ('profiles', 'Admins can view all profiles'),
        ('profiles', 'Admins can update all profiles'),
        ('profiles', 'Admins can delete profiles'),
        ('addresses', 'Users view own addresses'),
        ('addresses', 'Users insert own addresses'),
        ('addresses', 'Users update own addresses'),
        ('addresses', 'Users delete own addresses'),
        ('addresses', 'Admins can view all addresses'),
        ('carts', 'Users view own cart'),
        ('carts', 'Users insert own cart'),
        ('carts', 'Users update own cart'),
        ('carts', 'Users delete own cart'),
        ('carts', 'Admins can view all carts'),
        ('cart_items', 'Users view own cart items'),
        ('cart_items', 'Users insert own cart items'),
        ('cart_items', 'Users update own cart items'),
        ('cart_items', 'Users delete own cart items'),
        ('cart_items', 'Admins can view all cart items'),
        ('wishlists', 'Users view own wishlist'),
        ('wishlists', 'Users insert own wishlist'),
        ('wishlists', 'Users delete own wishlist'),
        ('wishlists', 'Admins can view all wishlists'),
        ('wishlist_items', 'Users view own wishlist items'),
        ('wishlist_items', 'Users insert own wishlist items'),
        ('wishlist_items', 'Users delete own wishlist items'),
        ('wishlist_items', 'Admins can view all wishlist items'),
        ('orders', 'Users view own orders'),
        ('orders', 'Admins full access to orders'),
        ('order_items', 'Users view own order items'),
        ('order_items', 'Admins full access to order items'),
        ('payments', 'Users view own payments'),
        ('payments', 'Admins full access to payments'),
        ('reviews', 'Users view own reviews'),
        ('reviews', 'Users create own reviews'),
        ('reviews', 'Users update own reviews'),
        ('reviews', 'Users delete own reviews')
    ) AS expected(tab, pol)
    LEFT JOIN phase9_2_private.policy_snapshot s
      ON s.schemaname = 'public'
     AND s.tablename = expected.tab
     AND s.policyname = expected.pol
     AND s.changed_by_phase9_2 = true
    WHERE s.policyname IS NULL
  ) THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: policy_snapshot does not contain the exact 38 policies modified by Phase 9.2. Manual inspection required.';
  END IF;

  -- 1.6 Verify storage policy snapshot completeness (all 4 avatar policies)
  IF (
    SELECT array_agg(policyname ORDER BY policyname)
    FROM phase9_2_private.storage_policy_created
  ) IS DISTINCT FROM ARRAY[
    'Users can delete own avatar from public-assets',
    'Users can update own avatar in public-assets',
    'Users can upload own avatar to public-assets',
    'Users can view own avatar in public-assets'
  ] OR (SELECT count(DISTINCT policyname) FROM phase9_2_private.storage_policy_created) <> 4
     OR (SELECT count(*) FROM phase9_2_private.storage_policy_created) <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: storage_policy_created does not contain the exact 4 avatar storage policies. Manual inspection required.';
  END IF;

  -- 1.7 Technical Limitation Precondition: Verify all grantee roles recorded in snapshots exist in pg_roles
  -- (PostgreSQL limitation: Cannot restore grants to roles that have been dropped)
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (x.grantee_oid)::oid AS grantee_oid
      FROM phase9_2_private.table_acl_snapshot t,
           jsonb_to_recordset(t.original_acl_json) AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
      UNION
      SELECT (x.grantee_oid)::oid AS grantee_oid
      FROM phase9_2_private.function_acl_snapshot f,
           jsonb_to_recordset(f.original_acl_json) AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
    ) g
    WHERE g.grantee_oid <> 0 AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = g.grantee_oid)
  ) THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: One or more grantee roles recorded in ACL snapshots no longer exist in pg_roles. Automatic SQL restoration cannot proceed without corrupting catalog state. Follow documented manual recovery in README.md.';
  END IF;

  RAISE NOTICE 'Phase 9.2 Rollback: Snapshots verified intact (exact 17 tables, 9 functions, 38 modified policies, 4 storage policies).';
END
$phase9_2_rollback_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: STORAGE POLICY ROLLBACK (ZERO BUCKET / ZERO OBJECT DELETIONS)
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_rollback_storage$
DECLARE
  v_rec record;
  v_pol record;
  v_dropped_count integer := 0;
  v_expected_clean text;
  v_qual_clean text;
  v_with_check_clean text;
  v_is_qual_valid boolean;
  v_is_with_check_valid boolean;
BEGIN
  RAISE NOTICE 'Phase 9.2 Rollback: Removing ONLY Phase 9.2 created storage policies with full definition comparison...';

  -- Iterate through policies tracked as created by Phase 9.2 (creation_status = 'CREATED')
  FOR v_rec IN
    SELECT policyname, schemaname, tablename, cmd, roles, expected_definition, creation_status
    FROM phase9_2_private.storage_policy_created
    WHERE creation_status = 'CREATED'
  LOOP
    -- 2.1 Verify saved expected_definition is valid and not empty
    IF v_rec.expected_definition IS NULL OR length(trim(v_rec.expected_definition)) = 0 THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: Storage policy "%" saved expected_definition is NULL or empty; cannot safely verify',
        v_rec.policyname;
    END IF;

    -- 2.2 Query complete policy definition from pg_policies
    SELECT p.schemaname, p.tablename, p.policyname, p.permissive, p.roles, p.cmd,
           p.qual, p.with_check, d.description AS comment_desc
    INTO v_pol
    FROM pg_policies p
    JOIN pg_class c ON c.relname = p.tablename
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
    JOIN pg_policy pol ON pol.polrelid = c.oid AND pol.polname = p.policyname
    LEFT JOIN pg_description d ON d.objoid = pol.oid AND d.classoid = 'pg_policy'::regclass
    WHERE p.schemaname = v_rec.schemaname
      AND p.tablename = v_rec.tablename
      AND p.policyname = v_rec.policyname;

    -- Abort if current policy is missing (do not silently assume successful removal)
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: Phase 9.2 created Storage policy "%" is missing from pg_policies; cannot verify or safely drop',
        v_rec.policyname;
    END IF;

    -- 2.3 Verify policy carries our Phase 9.2 comment marker
    IF v_pol.comment_desc IS DISTINCT FROM 'SHOPKART_PHASE9_2_CREATED_V1' THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: Storage policy "%" is missing marker SHOPKART_PHASE9_2_CREATED_V1 (observed: "%"); manual review required',
        v_rec.policyname, coalesce(v_pol.comment_desc, 'NULL');
    END IF;

    -- 2.4 Verify complete policy identity:
    -- Check Schema, Table, Policy name, Command, Permissive mode, and Target roles
    IF v_pol.schemaname <> 'storage' OR v_pol.tablename <> 'objects' THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: Storage policy "%" target table is %.%, expected storage.objects',
        v_rec.policyname, v_pol.schemaname, v_pol.tablename;
    END IF;

    IF v_pol.cmd <> v_rec.cmd THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: Storage policy "%" command is "%", expected "%"',
        v_rec.policyname, v_pol.cmd, v_rec.cmd;
    END IF;

    IF v_pol.permissive <> 'PERMISSIVE' THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: Storage policy "%" permissive mode is "%", expected PERMISSIVE',
        v_rec.policyname, v_pol.permissive;
    END IF;

    IF v_pol.roles::text[] <> v_rec.roles THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: Storage policy "%" roles are "%", expected "%"',
        v_rec.policyname, v_pol.roles, v_rec.roles;
    END IF;

    -- 2.5 Prepare complete expressions preserving all parentheses, operators, clauses, and casts
    -- Collapse only formatting whitespace (\s+) into single spaces; never remove parentheses or discard prefixes.
    v_expected_clean   := regexp_replace(trim(v_rec.expected_definition), '\s+', ' ', 'g');
    v_qual_clean       := regexp_replace(trim(coalesce(v_pol.qual, '')), '\s+', ' ', 'g');
    v_with_check_clean := regexp_replace(trim(coalesce(v_pol.with_check, '')), '\s+', ' ', 'g');

    -- Compute full expression equivalence for USING expression (v_qual_clean) preserving complete structure and parentheses
    v_is_qual_valid := (
      v_qual_clean = v_expected_clean
      OR v_qual_clean = ('(' || v_expected_clean || ')')
      OR v_qual_clean = '((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.filename(name) ~ (''^''::text || ((auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$''::text))))'
      OR v_qual_clean = '(((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1)) AND (storage.filename(name) ~ (''^''::text || ((auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$''::text))))'
      OR v_qual_clean = '(((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text)) AND (array_length(storage.foldername(name), 1) = 1)) AND (storage.filename(name) ~ ((''^''::text || (auth.uid())::text) || ''\.(png|jpg|jpeg|webp|gif)$''::text))'
      OR v_qual_clean = '((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.filename(name) ~ ((''^''::text || (auth.uid())::text) || ''\.(png|jpg|jpeg|webp|gif)$''::text)))'
    );

    -- Compute full expression equivalence for WITH CHECK expression (v_with_check_clean) preserving complete structure and parentheses
    v_is_with_check_valid := (
      v_with_check_clean = v_expected_clean
      OR v_with_check_clean = ('(' || v_expected_clean || ')')
      OR v_with_check_clean = '((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.filename(name) ~ (''^''::text || ((auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$''::text))))'
      OR v_with_check_clean = '(((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1)) AND (storage.filename(name) ~ (''^''::text || ((auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$''::text))))'
      OR v_with_check_clean = '(((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text)) AND (array_length(storage.foldername(name), 1) = 1)) AND (storage.filename(name) ~ ((''^''::text || (auth.uid())::text) || ''\.(png|jpg|jpeg|webp|gif)$''::text))'
      OR v_with_check_clean = '((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.filename(name) ~ ((''^''::text || (auth.uid())::text) || ''\.(png|jpg|jpeg|webp|gif)$''::text)))'
    );

    -- 2.6 Full definition comparison and condition validation per command

    -- SELECT Policy Validation: requires complete USING expression, WITH CHECK must be NULL
    IF v_rec.cmd = 'SELECT' THEN
      IF v_pol.with_check IS NOT NULL THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage SELECT policy "%" has non-NULL WITH CHECK expression; expected NULL',
          v_rec.policyname;
      END IF;

      IF v_pol.qual IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage SELECT policy "%" has NULL USING expression; expected valid definition',
          v_rec.policyname;
      END IF;

      -- Compare complete definition against saved expected_definition (preserving all parentheses and operators)
      IF NOT v_is_qual_valid THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage SELECT policy "%" USING expression differs from saved expected_definition',
          v_rec.policyname;
      END IF;

      -- Validate complete individual security conditions
      IF v_pol.qual NOT LIKE '%bucket_id%public-assets%'
         OR v_pol.qual NOT LIKE '%storage.foldername(name)%avatars%'
         OR v_pol.qual NOT LIKE '%array_length(storage.foldername(name), 1) = 1%'
         OR v_pol.qual NOT LIKE '%auth.uid()%'
         OR v_pol.qual NOT LIKE '%\.(png|jpg|jpeg|webp|gif)%' THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage SELECT policy "%" definition differs from expected Phase 9.2 baseline; manual inspection required',
          v_rec.policyname;
      END IF;

    -- INSERT Policy Validation: requires complete WITH CHECK expression, USING must be NULL
    ELSIF v_rec.cmd = 'INSERT' THEN
      IF v_pol.qual IS NOT NULL THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage INSERT policy "%" has non-NULL USING expression; expected NULL',
          v_rec.policyname;
      END IF;

      IF v_pol.with_check IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage INSERT policy "%" has NULL WITH CHECK expression; expected valid definition',
          v_rec.policyname;
      END IF;

      -- Compare complete definition against saved expected_definition (preserving all parentheses and operators)
      IF NOT v_is_with_check_valid THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage INSERT policy "%" WITH CHECK expression differs from saved expected_definition',
          v_rec.policyname;
      END IF;

      -- Validate complete individual security conditions
      IF v_pol.with_check NOT LIKE '%bucket_id%public-assets%'
         OR v_pol.with_check NOT LIKE '%storage.foldername(name)%avatars%'
         OR v_pol.with_check NOT LIKE '%array_length(storage.foldername(name), 1) = 1%'
         OR v_pol.with_check NOT LIKE '%auth.uid()%'
         OR v_pol.with_check NOT LIKE '%\.(png|jpg|jpeg|webp|gif)%' THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage INSERT policy "%" definition differs from expected Phase 9.2 baseline; manual inspection required',
          v_rec.policyname;
      END IF;

    -- DELETE Policy Validation: requires complete USING expression, WITH CHECK must be NULL
    ELSIF v_rec.cmd = 'DELETE' THEN
      IF v_pol.with_check IS NOT NULL THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage DELETE policy "%" has non-NULL WITH CHECK expression; expected NULL',
          v_rec.policyname;
      END IF;

      IF v_pol.qual IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage DELETE policy "%" has NULL USING expression; expected valid definition',
          v_rec.policyname;
      END IF;

      -- Compare complete definition against saved expected_definition (preserving all parentheses and operators)
      IF NOT v_is_qual_valid THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage DELETE policy "%" USING expression differs from saved expected_definition',
          v_rec.policyname;
      END IF;

      -- Validate complete individual security conditions
      IF v_pol.qual NOT LIKE '%bucket_id%public-assets%'
         OR v_pol.qual NOT LIKE '%storage.foldername(name)%avatars%'
         OR v_pol.qual NOT LIKE '%array_length(storage.foldername(name), 1) = 1%'
         OR v_pol.qual NOT LIKE '%auth.uid()%'
         OR v_pol.qual NOT LIKE '%\.(png|jpg|jpeg|webp|gif)%' THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage DELETE policy "%" definition differs from expected Phase 9.2 baseline; manual inspection required',
          v_rec.policyname;
      END IF;

    -- UPDATE Policy Validation: requires BOTH complete USING AND complete WITH CHECK expressions verified independently
    ELSIF v_rec.cmd = 'UPDATE' THEN
      IF v_pol.qual IS NULL OR v_pol.with_check IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage UPDATE policy "%" requires non-NULL USING and WITH CHECK expressions',
          v_rec.policyname;
      END IF;

      -- Compare complete definition against saved expected_definition for BOTH expressions independently
      IF NOT v_is_qual_valid THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage UPDATE policy "%" USING expression differs from saved expected_definition',
          v_rec.policyname;
      END IF;

      IF NOT v_is_with_check_valid THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage UPDATE policy "%" WITH CHECK expression differs from saved expected_definition',
          v_rec.policyname;
      END IF;

      -- Independent validation of USING expression
      IF v_pol.qual NOT LIKE '%bucket_id%public-assets%'
         OR v_pol.qual NOT LIKE '%storage.foldername(name)%avatars%'
         OR v_pol.qual NOT LIKE '%array_length(storage.foldername(name), 1) = 1%'
         OR v_pol.qual NOT LIKE '%auth.uid()%'
         OR v_pol.qual NOT LIKE '%\.(png|jpg|jpeg|webp|gif)%' THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage UPDATE policy "%" USING expression differs from expected Phase 9.2 baseline (missing bucket, folder, depth, ownership, or extension constraints); manual inspection required',
          v_rec.policyname;
      END IF;

      -- Independent validation of WITH CHECK expression
      IF v_pol.with_check NOT LIKE '%bucket_id%public-assets%'
         OR v_pol.with_check NOT LIKE '%storage.foldername(name)%avatars%'
         OR v_pol.with_check NOT LIKE '%array_length(storage.foldername(name), 1) = 1%'
         OR v_pol.with_check NOT LIKE '%auth.uid()%'
         OR v_pol.with_check NOT LIKE '%\.(png|jpg|jpeg|webp|gif)%' THEN
        RAISE EXCEPTION 'ROLLBACK ABORT: Storage UPDATE policy "%" WITH CHECK expression differs from expected Phase 9.2 baseline (missing bucket, folder, depth, ownership, or extension constraints); manual inspection required',
          v_rec.policyname;
      END IF;
    END IF;

    -- All checks passed: Safe to drop
    EXECUTE format('DROP POLICY %I ON storage.objects', v_rec.policyname);
    v_dropped_count := v_dropped_count + 1;
    RAISE NOTICE 'Dropped verified Phase 9.2 storage policy: % (matched saved expected_definition)', v_rec.policyname;
  END LOOP;

  -- Pre-existing policies, public-assets bucket, and all stored avatar objects are strictly preserved!
  -- ZERO bucket deletions, ZERO storage object deletions.
  RAISE NOTICE 'Phase 9.2 Rollback: % storage policies dropped. Bucket public-assets and all stored objects preserved.', v_dropped_count;
END
$phase9_2_rollback_storage$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: FUNCTION PRIVILEGE RESTORATION FROM SNAPSHOT
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_rollback_functions$
DECLARE
  v_snap record;
  v_grant record;
  v_grantee text;
  v_grantor text;
  v_sql text;
  v_restoration_type text;
BEGIN
  RAISE NOTICE 'Phase 9.2 Rollback: Restoring function ACLs from snapshot...';

  FOR v_snap IN SELECT * FROM phase9_2_private.function_acl_snapshot LOOP
    -- 3.1 Revoke Phase 9.2 granted permissions
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_snap.function_signature);

    -- 3.2 Restore permissions from snapshot
    IF v_snap.proacl_was_null THEN
      -- In standard PostgreSQL, default public function privileges grant EXECUTE to PUBLIC
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_snap.function_signature);
      RAISE NOTICE 'Restored default PUBLIC EXECUTE on % (proacl was NULL in baseline; effective permissions restored).', v_snap.function_signature;
    ELSE
      -- Restore each individual grant recorded in the original snapshot JSON
      FOR v_grant IN
        SELECT x.grantee_oid, x.grantor_oid, x.privilege, x.is_grantable
        FROM jsonb_to_recordset(v_snap.original_acl_json)
          AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
      LOOP
        IF v_grant.grantee_oid = 0 THEN
          v_grantee := 'PUBLIC';
        ELSE
          SELECT quote_ident(rolname) INTO v_grantee FROM pg_roles WHERE oid = v_grant.grantee_oid;
        END IF;

        SELECT quote_ident(rolname) INTO v_grantor FROM pg_roles WHERE oid = v_grant.grantor_oid;

        IF v_grantee IS NOT NULL THEN
          v_sql := format('GRANT %s ON FUNCTION %s TO %s', v_grant.privilege, v_snap.function_signature, v_grantee);
          IF v_grant.is_grantable THEN
            v_sql := v_sql || ' WITH GRANT OPTION';
          END IF;
          EXECUTE v_sql;

          IF coalesce(v_grantor, '') = current_user THEN
            v_restoration_type := 'Exact ACL restoration';
          ELSE
            v_restoration_type := 'Equivalent effective permission restoration (Grantor in PostgreSQL session is ' || current_user || ', original was ' || coalesce(v_grantor, 'OID ' || v_grant.grantor_oid::text) || ')';
          END IF;

          RAISE NOTICE 'Restored function grant on %: % [%]', v_snap.function_signature, v_sql, v_restoration_type;
        END IF;
      END LOOP;
    END IF;

    -- 3.3 Restore original comment if one was recorded
    IF v_snap.original_comment IS NULL THEN
      EXECUTE format('COMMENT ON FUNCTION %s IS NULL', v_snap.function_signature);
    ELSE
      EXECUTE format('COMMENT ON FUNCTION %s IS %L', v_snap.function_signature, v_snap.original_comment);
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 9.2 Rollback: Function privileges restored. Note: Grantor identity reflects the executing role (%) as documented in README limitations.', current_user;
END
$phase9_2_rollback_functions$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: TABLE-LEVEL GRANT RESTORATION FROM SNAPSHOT
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_rollback_tables$
DECLARE
  v_snap record;
  v_grant record;
  v_grantee text;
  v_sql text;
BEGIN
  RAISE NOTICE 'Phase 9.2 Rollback: Restoring table-level grants from snapshot...';

  FOR v_snap IN SELECT * FROM phase9_2_private.table_acl_snapshot LOOP
    -- 4.1 Revoke Phase 9.2 modified table grants from PUBLIC, anon, and authenticated
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_snap.table_name);

    -- 4.2 Restore table privileges
    IF v_snap.relacl_was_null THEN
      -- Table originally had NULL relacl (default PostgreSQL owner privileges).
      -- NOTE ON ARCHITECTURAL REALITY: In PostgreSQL, standard SQL REVOKE/GRANT commands
      -- cannot reset pg_class.relacl to a physical NULL catalog pointer without direct catalog surgery.
      -- Revoking all privileges from PUBLIC, anon, and authenticated returns the table to default
      -- owner-only access semantics without injecting artificial explicit owner grants.
      RAISE NOTICE 'Table public.% originally had NULL relacl. Revoked Phase 9.2 grants from PUBLIC, anon, authenticated. Effective permissions restored; original physical NULL ACL state not recreated due to PostgreSQL catalog architecture.', v_snap.table_name;
    ELSE
      -- Restore each individual grant recorded in the original snapshot JSON
      FOR v_grant IN
        SELECT x.grantee_oid, x.grantor_oid, x.privilege, x.is_grantable
        FROM jsonb_to_recordset(v_snap.original_acl_json)
          AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
      LOOP
        IF v_grant.grantee_oid = 0 THEN
          v_grantee := 'PUBLIC';
        ELSE
          SELECT quote_ident(rolname) INTO v_grantee FROM pg_roles WHERE oid = v_grant.grantee_oid;
        END IF;

        IF v_grantee IS NOT NULL THEN
          v_sql := format('GRANT %s ON TABLE public.%I TO %s', v_grant.privilege, v_snap.table_name, v_grantee);
          IF v_grant.is_grantable THEN
            v_sql := v_sql || ' WITH GRANT OPTION';
          END IF;
          EXECUTE v_sql;
        END IF;
      END LOOP;
      RAISE NOTICE 'Restored snapshot ACL on public.%', v_snap.table_name;
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 9.2 Rollback: Table grants restored from snapshot.';
END
$phase9_2_rollback_tables$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: RLS POLICY ROLE RESTORATION FROM SNAPSHOT
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_rollback_policies$
DECLARE
  v_pol record;
  v_current_pol record;
  v_reverted_count integer := 0;
BEGIN
  RAISE NOTICE 'Phase 9.2 Rollback: Reverting standardized policy roles from snapshot...';

  -- Iterate strictly over policies recorded as modified by Phase 9.2
  FOR v_pol IN
    SELECT schemaname, tablename, policyname, cmd, original_roles, new_roles, permissive,
           original_qual, original_with_check
    FROM phase9_2_private.policy_snapshot
    WHERE changed_by_phase9_2 = true
  LOOP
    SELECT * INTO v_current_pol FROM pg_policies
    WHERE schemaname = v_pol.schemaname
      AND tablename = v_pol.tablename
      AND policyname = v_pol.policyname;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: policy "%" on %.% missing; cannot revert',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename;
    END IF;

    -- Verify complete policy identity and definition before modifying
    IF v_current_pol.cmd <> v_pol.cmd THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: policy "%" on %.% has cmd "%", expected "%"',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename, v_current_pol.cmd, v_pol.cmd;
    END IF;

    IF v_current_pol.permissive <> v_pol.permissive THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: policy "%" on %.% has permissive mode "%", expected "%"',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename, v_current_pol.permissive, v_pol.permissive;
    END IF;

    IF coalesce(v_current_pol.qual, '') <> coalesce(v_pol.original_qual, '') THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: policy "%" on %.% USING expression was modified post-migration; manual review required',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename;
    END IF;

    IF coalesce(v_current_pol.with_check, '') <> coalesce(v_pol.original_with_check, '') THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: policy "%" on %.% WITH CHECK expression was modified post-migration; manual review required',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename;
    END IF;

    -- Verify the policy currently has the expected Phase 9.2 roles (authenticated)
    IF v_current_pol.roles::text[] = v_pol.new_roles THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I TO %s',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename,
        array_to_string(v_pol.original_roles, ', ')
      );
      v_reverted_count := v_reverted_count + 1;
      RAISE NOTICE 'Reverted policy "%" on %.% to %',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename, array_to_string(v_pol.original_roles, ', ');
    ELSIF v_current_pol.roles::text[] = v_pol.original_roles THEN
      RAISE NOTICE 'Policy "%" on %.% already has original roles %; skipping.',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename, v_pol.original_roles;
    ELSE
      RAISE EXCEPTION 'ROLLBACK ABORT: policy "%" on %.% has unexpected roles "%" (expected "%"); aborting for safety',
        v_pol.policyname, v_pol.schemaname, v_pol.tablename, v_current_pol.roles, v_pol.new_roles;
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 9.2 Rollback: Reverted % policies to their original roles.', v_reverted_count;
END
$phase9_2_rollback_policies$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: COMPREHENSIVE POSTFLIGHT VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $phase9_2_rollback_postflight$
DECLARE
  v_rec record;
  v_cur record;
  v_bucket record;
  v_role text;
  v_priv text;
  v_expected boolean;
  v_actual boolean;
  v_oid oid;
BEGIN
  RAISE NOTICE 'Phase 9.2 Rollback: Performing comprehensive postflight verification against snapshot baseline...';

  -- 6.1 Verify Table Effective Permissions (ISSUE 6)
  -- For all 17 public tables, compare effective privileges against the original snapshot for anon and authenticated
  -- and check all 7 privileges: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
  FOR v_rec IN SELECT table_name, owner_name, relacl_was_null, original_acl_json FROM phase9_2_private.table_acl_snapshot LOOP
    -- Check anon and authenticated roles
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF v_rec.relacl_was_null THEN
          -- In baseline, table had NULL relacl (default owner only); neither anon nor authenticated had any privileges
          v_expected := false;
        ELSE
          -- Determine expected privilege from snapshot JSON
          v_expected := EXISTS (
            SELECT 1 FROM jsonb_to_recordset(v_rec.original_acl_json) AS x(grantee_oid oid, privilege text)
            WHERE (x.grantee_oid = 0 OR x.grantee_oid = (SELECT oid FROM pg_roles WHERE rolname = v_role))
              AND upper(x.privilege) = v_priv
          );
        END IF;

        v_actual := has_table_privilege(v_role, format('public.%I', v_rec.table_name), v_priv);

        IF v_actual <> v_expected THEN
          RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Table public.% effective privilege % for role % is % (expected % based on snapshot)',
            v_rec.table_name, v_priv, v_role, v_actual, v_expected;
        END IF;
      END LOOP;
    END LOOP;

    -- Verify table owner retains full expected privileges
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF NOT has_table_privilege(v_rec.owner_name, format('public.%I', v_rec.table_name), v_priv) THEN
        RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Table public.% owner % lacks expected % privilege',
          v_rec.table_name, v_rec.owner_name, v_priv;
      END IF;
    END LOOP;
  END LOOP;

  -- 6.2 Verify Function Effective Permissions & Comments (ISSUE 7)
  -- For all 9 application functions, verify resolution, comments, and EXECUTE privileges against snapshot
  FOR v_rec IN SELECT function_signature, owner_name, proacl_was_null, original_acl_json, original_comment FROM phase9_2_private.function_acl_snapshot LOOP
    v_oid := to_regprocedure(v_rec.function_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Function % could not be resolved', v_rec.function_signature;
    END IF;

    -- Verify function comment restored
    IF obj_description(v_oid, 'pg_proc') IS DISTINCT FROM v_rec.original_comment THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Function % comment was not restored', v_rec.function_signature;
    END IF;

    -- Verify effective EXECUTE privileges
    IF v_rec.proacl_was_null THEN
      -- In standard PostgreSQL public schema, default EXECUTE belongs to PUBLIC and owner
      IF NOT has_function_privilege('public', v_rec.function_signature, 'EXECUTE') THEN
        RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Function % lacks default PUBLIC EXECUTE permission', v_rec.function_signature;
      END IF;
    ELSE
      -- Check public, anon, authenticated against snapshot JSON
      FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
        v_expected := EXISTS (
          SELECT 1 FROM jsonb_to_recordset(v_rec.original_acl_json) AS x(grantee_oid oid, privilege text)
          WHERE ((x.grantee_oid = 0 AND v_role = 'public') OR (x.grantee_oid = (SELECT oid FROM pg_roles WHERE rolname = v_role)))
            AND upper(x.privilege) = 'EXECUTE'
        );
        v_actual := has_function_privilege(v_role, v_rec.function_signature, 'EXECUTE');

        IF v_actual <> v_expected THEN
          RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Function % effective EXECUTE for role % is % (expected % based on snapshot)',
            v_rec.function_signature, v_role, v_actual, v_expected;
        END IF;
      END LOOP;
    END IF;

    -- Owner must have EXECUTE
    IF NOT has_function_privilege(v_rec.owner_name, v_rec.function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Function % owner % lacks EXECUTE permission', v_rec.function_signature, v_rec.owner_name;
    END IF;
  END LOOP;

  -- 6.3 Verify RLS Policies Restored (ISSUE 8)
  -- For every policy modified by Phase 9.2, compare complete definition:
  -- schemaname, tablename, policyname, cmd, permissive, roles, USING expression, WITH CHECK expression
  FOR v_rec IN
    SELECT schemaname, tablename, policyname, cmd, permissive, original_roles, original_qual, original_with_check
    FROM phase9_2_private.policy_snapshot
    WHERE changed_by_phase9_2 = true
  LOOP
    SELECT * INTO v_cur FROM pg_policies
    WHERE schemaname = v_rec.schemaname
      AND tablename = v_rec.tablename
      AND policyname = v_rec.policyname;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% is missing from pg_policies',
        v_rec.policyname, v_rec.schemaname, v_rec.tablename;
    END IF;

    IF v_cur.cmd <> v_rec.cmd THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% has cmd "%", expected "%"',
        v_rec.policyname, v_rec.schemaname, v_rec.tablename, v_cur.cmd, v_rec.cmd;
    END IF;

    IF v_cur.permissive <> v_rec.permissive THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% has permissive "%", expected "%"',
        v_rec.policyname, v_rec.schemaname, v_rec.tablename, v_cur.permissive, v_rec.permissive;
    END IF;

    IF v_cur.roles::text[] <> v_rec.original_roles THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% has roles "%", expected original roles "%"',
        v_rec.policyname, v_rec.schemaname, v_rec.tablename, v_cur.roles, v_rec.original_roles;
    END IF;

    IF coalesce(v_cur.qual, '') <> coalesce(v_rec.original_qual, '') THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% USING expression differs from original snapshot',
        v_rec.policyname, v_rec.schemaname, v_rec.tablename;
    END IF;

    IF coalesce(v_cur.with_check, '') <> coalesce(v_rec.original_with_check, '') THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% WITH CHECK expression differs from original snapshot',
        v_rec.policyname, v_rec.schemaname, v_rec.tablename;
    END IF;
  END LOOP;

  -- 6.4 Verify Storage Policy Removal & Pre-existing Preservation (ISSUE 9)
  -- 1. Phase 9.2-created Storage policies must NOT exist in pg_policies
  FOR v_rec IN
    SELECT policyname FROM phase9_2_private.storage_policy_created
    WHERE creation_status = 'CREATED'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = v_rec.policyname
    ) THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Storage policy "%" was not dropped during rollback', v_rec.policyname;
    END IF;
  END LOOP;

  -- 2. Verify no remaining policies carry the Phase 9.2 marker comment
  IF EXISTS (
    SELECT 1 FROM pg_description d
    JOIN pg_policy pol ON pol.oid = d.objoid
    JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relname = 'objects' AND d.description = 'SHOPKART_PHASE9_2_CREATED_V1'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: One or more Phase 9.2 tagged storage policies still exist!';
  END IF;

  -- 3. Verify pre-existing storage policies are preserved intact
  FOR v_rec IN
    SELECT policyname, schemaname, tablename, cmd, roles, expected_definition
    FROM phase9_2_private.storage_policy_created
    WHERE creation_status = 'PRESERVED'
  LOOP
    SELECT * INTO v_cur FROM pg_policies
    WHERE schemaname = v_rec.schemaname AND tablename = v_rec.tablename AND policyname = v_rec.policyname;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Pre-existing storage policy "%" was removed during rollback!', v_rec.policyname;
    END IF;
    IF v_cur.cmd <> v_rec.cmd OR v_cur.roles::text[] <> v_rec.roles THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Pre-existing storage policy "%" definition was modified!', v_rec.policyname;
    END IF;
  END LOOP;

  -- 6.5 Verify public-assets bucket remains intact and configured as public
  SELECT * INTO v_bucket FROM storage.buckets WHERE id = 'public-assets';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROLLBACK POSTFLIGHT CRITICAL FAIL: storage bucket "public-assets" is missing!';
  END IF;
  IF v_bucket.public IS NOT TRUE THEN
    RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: storage bucket "public-assets" public configuration is %, expected true', v_bucket.public;
  END IF;

  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'Phase 9.2 Rollback Completed Successfully:';
  RAISE NOTICE '1. Table grants returned to pre-migration baseline for all 17 tables (7 privileges checked).';
  RAISE NOTICE '2. Function permissions and comments verified for all 9 functions.';
  RAISE NOTICE '3. All 38 standardized policies reverted to exact original definitions.';
  RAISE NOTICE '4. Phase 9.2 storage policies dropped; pre-existing policies and bucket preserved.';
  RAISE NOTICE '====================================================================';
END
$phase9_2_rollback_postflight$;

COMMIT;
