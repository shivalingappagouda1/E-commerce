-- ShopKart Phase 9.2 — Function privilege hardening (fail-closed)
-- Target: ShopKart-Staging ONLY. Review the project ref in Supabase before running.
-- Scope: public.is_admin() EXECUTE ACL only. No function body/owner/config changes.
-- IMPORTANT: one-time migration. A second run aborts; never overwrites the original snapshot.

BEGIN;

CREATE SCHEMA IF NOT EXISTS phase9_2_private;
REVOKE ALL ON SCHEMA phase9_2_private FROM PUBLIC;
REVOKE ALL ON SCHEMA phase9_2_private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS phase9_2_private.function_acl_snapshot (
  snapshot_key text PRIMARY KEY CHECK (snapshot_key = 'public.is_admin()'),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  function_oid oid NOT NULL,
  function_identity text NOT NULL,
  owner_oid oid NOT NULL,
  owner_name text NOT NULL,
  proacl_was_null boolean NOT NULL,
  original_acl_text text,
  original_acl_json jsonb NOT NULL,
  original_comment text,
  prosecdef boolean NOT NULL,
  proconfig text[],
  prosrc text NOT NULL,
  snapshot_version integer NOT NULL CHECK (snapshot_version = 1)
);

REVOKE ALL ON TABLE phase9_2_private.function_acl_snapshot FROM PUBLIC;
REVOKE ALL ON TABLE phase9_2_private.function_acl_snapshot FROM anon, authenticated;

DO $phase9_2_func_hardening$
DECLARE
  v_oid oid := to_regprocedure('public.is_admin()');
  v_proc record;
  v_comment text;
  v_acl_json jsonb;
  v_acl_count integer;
  v_proacl_is_null boolean;
  v_acl_text text;
  v_search_path text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'ABORT: exact function public.is_admin() does not exist';
  END IF;

  SELECT p.oid, p.prosecdef, p.proowner, p.proacl, p.prosrc, p.proconfig,
         pg_get_userbyid(p.proowner) AS owner_name,
         p.oid::regprocedure::text AS identity
    INTO v_proc
  FROM pg_proc p WHERE p.oid = v_oid;

  IF NOT v_proc.prosecdef THEN
    RAISE EXCEPTION 'ABORT: public.is_admin() is not SECURITY DEFINER';
  END IF;

  IF NOT (v_proc.prosrc ILIKE '%auth.uid()%' AND v_proc.prosrc ILIKE '%admin%') THEN
    RAISE EXCEPTION 'ABORT: function body does not match expected is_admin implementation';
  END IF;

  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: authenticated currently lacks effective EXECUTE';
  END IF;

  -- Restrict automatic rollback to ACLs whose grants can be reconstructed safely.
  -- Only owner, PUBLIC, anon and authenticated entries are supported. No grant options.
  SELECT count(*) INTO v_acl_count
  FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
  WHERE a.grantee <> v_proc.proowner
    AND a.grantee <> 0
    AND a.grantee NOT IN (
      (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
      (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
    );

  IF v_acl_count > 0 THEN
    RAISE EXCEPTION 'ABORT: ACL contains additional grantees; automatic exact rollback is not supported. No changes made.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
    WHERE a.privilege_type = 'EXECUTE' AND a.is_grantable
  ) THEN
    RAISE EXCEPTION 'ABORT: ACL contains EXECUTE grant options; automatic exact rollback is not supported. No changes made.';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'grantee_oid', a.grantee,
    'grantor_oid', a.grantor,
    'privilege', a.privilege_type,
    'is_grantable', a.is_grantable
  ) ORDER BY a.grantee, a.grantor, a.privilege_type), '[]'::jsonb)
  INTO v_acl_json
  FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a;

  v_comment := obj_description(v_oid, 'pg_proc');
  v_proacl_is_null := (v_proc.proacl IS NULL);
  v_acl_text := coalesce(v_proc.proacl::text, 'NONE');
  v_search_path := coalesce(array_to_string(v_proc.proconfig, ','), 'DEFAULT_SEARCH_PATH');

  -- Immutable one-time snapshot. A rerun must not overwrite the baseline.
  IF EXISTS (SELECT 1 FROM phase9_2_private.function_acl_snapshot
             WHERE snapshot_key = 'public.is_admin()') THEN
    RAISE EXCEPTION 'ABORT: Phase 9.2 snapshot already exists. Refusing to overwrite original baseline or rerun migration.';
  END IF;

  INSERT INTO phase9_2_private.function_acl_snapshot (
    snapshot_key, function_oid, function_identity, owner_oid, owner_name,
    proacl_was_null, original_acl_text, original_acl_json, original_comment,
    prosecdef, proconfig, prosrc, snapshot_version
  ) VALUES (
    'public.is_admin()', v_oid, v_proc.identity, v_proc.proowner, v_proc.owner_name,
    v_proacl_is_null, v_proc.proacl::text, v_acl_json, v_comment,
    v_proc.prosecdef, v_proc.proconfig, v_proc.prosrc, 1
  );

  -- Store structured snapshot in function catalog comment as well
  EXECUTE format(
    'COMMENT ON FUNCTION public.is_admin() IS %L',
    'PHASE9_2_SNAPSHOT|PROACL_IS_NULL=' || v_proacl_is_null::text ||
    '|PROACL=' || v_acl_text ||
    '|ORIGINAL_COMMENT=' || replace(coalesce(v_comment, 'NONE'), '|', '%7C') ||
    '|OWNER=' || v_proc.owner_name ||
    '|SEARCH_PATH=' || v_search_path ||
    '|ANON_EXEC=' || has_function_privilege('anon', v_oid, 'EXECUTE')::text ||
    '|AUTH_EXEC=' || has_function_privilege('authenticated', v_oid, 'EXECUTE')::text
  );

  REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: anon retains effective EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: authenticated lacks effective EXECUTE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN phase9_2_private.function_acl_snapshot s ON s.function_oid = p.oid
    WHERE p.prosrc IS DISTINCT FROM s.prosrc
       OR p.prosecdef IS DISTINCT FROM s.prosecdef
       OR p.proowner IS DISTINCT FROM s.owner_oid
       OR p.proconfig IS DISTINCT FROM s.proconfig
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: function definition, owner, SECURITY DEFINER or configuration changed';
  END IF;

  RAISE NOTICE 'Phase 9.2 function security hardening complete: public.is_admin() revoked from anon and PUBLIC, retained for authenticated.';
END
$phase9_2_func_hardening$;

COMMIT;
