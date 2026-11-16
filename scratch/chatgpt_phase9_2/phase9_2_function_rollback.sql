-- ShopKart Phase 9.2 — Function ACL rollback (fail-closed)
-- Restores the supported original ACL snapshot. Never guesses grants.
-- Run only if the Phase 9.2 snapshot table is intact.

BEGIN;

DO $phase9_2_func_rollback$
DECLARE
  v_oid oid := to_regprocedure('public.is_admin()');
  s record;
  v_role text;
  v_grantor text;
  v_sql text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: public.is_admin() does not exist';
  END IF;

  IF to_regclass('phase9_2_private.function_acl_snapshot') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: snapshot table missing; manual baseline restoration required';
  END IF;

  SELECT * INTO s
  FROM phase9_2_private.function_acl_snapshot
  WHERE snapshot_key = 'public.is_admin()' AND snapshot_version = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: verified original snapshot missing';
  END IF;

  IF s.function_oid <> v_oid
     OR s.function_identity <> v_oid::regprocedure::text
     OR s.prosrc IS DISTINCT FROM (SELECT prosrc FROM pg_proc WHERE oid = v_oid)
     OR s.prosecdef IS DISTINCT FROM (SELECT prosecdef FROM pg_proc WHERE oid = v_oid)
     OR s.owner_oid IS DISTINCT FROM (SELECT proowner FROM pg_proc WHERE oid = v_oid)
     OR s.proconfig IS DISTINCT FROM (SELECT proconfig FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: function identity/body/owner/config changed since snapshot; manual review required';
  END IF;

  -- Only ACLs with owner/PUBLIC/anon/authenticated grantees and no grant options
  -- are accepted by the paired migration.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(s.original_acl_json)
      AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
    WHERE x.privilege <> 'EXECUTE'
       OR x.is_grantable
       OR (x.grantee_oid <> s.owner_oid AND x.grantee_oid <> 0
           AND x.grantee_oid NOT IN (
             (SELECT oid FROM pg_roles WHERE rolname='anon'),
             (SELECT oid FROM pg_roles WHERE rolname='authenticated')
           ))
  ) THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: snapshot contains ACL entries outside the supported safe restoration set';
  END IF;

  -- Ensure all recorded grantors are the function owner/current execution role.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(s.original_acl_json)
      AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
    WHERE x.grantor_oid <> s.owner_oid
  ) THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: original ACL has a non-owner grantor; exact grantor restoration cannot be guaranteed';
  END IF;

  IF current_user <> s.owner_name THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: execute rollback as the exact function owner to preserve original ACL grantor identity';
  END IF;

  -- Remove only the grants changed by Phase 9.2.
  REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;

  -- Restore original non-owner EXECUTE entries from the immutable snapshot.
  FOR v_role IN
    SELECT CASE
      WHEN x.grantee_oid = 0 THEN 'PUBLIC'
      ELSE quote_ident(r.rolname)
    END
    FROM jsonb_to_recordset(s.original_acl_json)
      AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
    LEFT JOIN pg_roles r ON r.oid = x.grantee_oid
    WHERE x.privilege = 'EXECUTE'
      AND x.grantee_oid <> s.owner_oid
    ORDER BY x.grantee_oid
  LOOP
    IF v_role = 'PUBLIC' THEN
      GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC;
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.is_admin() TO %s', v_role);
    END IF;
  END LOOP;

  -- Restore original function comment exactly, including NULL.
  EXECUTE format(
    'COMMENT ON FUNCTION public.is_admin() IS %s',
    CASE WHEN s.original_comment IS NULL THEN 'NULL'
         ELSE quote_literal(s.original_comment) END
  );

  -- Validate effective privileges against the saved ACL's expected grantees.
  IF has_function_privilege('anon', v_oid, 'EXECUTE') IS DISTINCT FROM
     EXISTS (
       SELECT 1 FROM jsonb_to_recordset(s.original_acl_json)
         AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
       WHERE x.privilege='EXECUTE'
         AND (x.grantee_oid=0 OR x.grantee_oid=(SELECT oid FROM pg_roles WHERE rolname='anon'))
     ) THEN
    RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: anon effective EXECUTE differs from snapshot';
  END IF;

  IF has_function_privilege('authenticated', v_oid, 'EXECUTE') IS DISTINCT FROM
     EXISTS (
       SELECT 1 FROM jsonb_to_recordset(s.original_acl_json)
         AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
       WHERE x.privilege='EXECUTE'
         AND (x.grantee_oid=0 OR x.grantee_oid=(SELECT oid FROM pg_roles WHERE rolname='authenticated'))
     ) THEN
    RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: authenticated effective EXECUTE differs from snapshot';
  END IF;
END
$phase9_2_func_rollback$;

COMMIT;
