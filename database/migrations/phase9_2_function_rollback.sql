-- ShopKart Phase 9.2 — Function ACL rollback (fail-closed)
-- Restores the supported original ACL snapshot. Never guesses grants.
-- Run only if the Phase 9.2 snapshot table or catalog comment snapshot is intact.

BEGIN;

DO $phase9_2_func_rollback$
DECLARE
  v_oid oid := to_regprocedure('public.is_admin()');
  s record;
  v_role text;
  v_comment text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK ABORT: public.is_admin() does not exist';
  END IF;

  -- 1. Read snapshot from phase9_2_private table or function catalog comment
  IF to_regclass('phase9_2_private.function_acl_snapshot') IS NOT NULL THEN
    SELECT * INTO s
    FROM phase9_2_private.function_acl_snapshot
    WHERE snapshot_key = 'public.is_admin()' AND snapshot_version = 1;
  END IF;

  v_comment := obj_description(v_oid, 'pg_proc');

  IF s.snapshot_key IS NULL THEN
    -- Fallback to catalog comment snapshot
    IF v_comment IS NULL OR v_comment NOT LIKE 'PHASE9_2_SNAPSHOT|%' THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: verified original snapshot missing in table and comment; manual baseline restoration required';
    END IF;
  ELSE
    -- Verify function identity/body/owner/config changed since snapshot
    IF s.function_oid <> v_oid
       OR s.function_identity <> v_oid::regprocedure::text
       OR s.prosrc IS DISTINCT FROM (SELECT prosrc FROM pg_proc WHERE oid = v_oid)
       OR s.prosecdef IS DISTINCT FROM (SELECT prosecdef FROM pg_proc WHERE oid = v_oid)
       OR s.owner_oid IS DISTINCT FROM (SELECT proowner FROM pg_proc WHERE oid = v_oid)
       OR s.proconfig IS DISTINCT FROM (SELECT proconfig FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: function identity/body/owner/config changed since snapshot; manual review required';
    END IF;

    -- Only ACLs with owner/PUBLIC/anon/authenticated grantees and no grant options are accepted
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

    -- Verify caller has authority to execute rollback
    IF current_user <> s.owner_name
       AND NOT pg_has_role(current_user, s.owner_oid, 'USAGE')
       AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'ROLLBACK ABORT: execute rollback as function owner % (current user is %)', s.owner_name, current_user;
    END IF;
  END IF;

  -- 2. Remove only the grants changed by Phase 9.2
  REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;

  -- 3. Restore original permissions
  IF s.snapshot_key IS NOT NULL THEN
    -- Restore from structured JSON snapshot
    IF s.proacl_was_null THEN
      GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC;
    ELSE
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
    END IF;

    -- Restore original comment exactly
    EXECUTE format(
      'COMMENT ON FUNCTION public.is_admin() IS %s',
      CASE WHEN s.original_comment IS NULL THEN 'NULL'
           ELSE quote_literal(s.original_comment) END
    );
  ELSE
    -- Restore from comment snapshot
    IF v_comment LIKE '%PROACL_IS_NULL=true%' OR v_comment LIKE '%ANON_EXEC=true%' THEN
      GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC;
    END IF;
    COMMENT ON FUNCTION public.is_admin() IS NULL;
  END IF;

  -- 4. Postflight privilege verification
  IF s.snapshot_key IS NOT NULL THEN
    IF has_function_privilege('anon', v_oid, 'EXECUTE') IS DISTINCT FROM
       (s.proacl_was_null OR EXISTS (
         SELECT 1 FROM jsonb_to_recordset(s.original_acl_json)
           AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
         WHERE x.privilege='EXECUTE'
           AND (x.grantee_oid=0 OR x.grantee_oid=(SELECT oid FROM pg_roles WHERE rolname='anon'))
       )) THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: anon effective EXECUTE differs from snapshot';
    END IF;

    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') IS DISTINCT FROM
       (s.proacl_was_null OR EXISTS (
         SELECT 1 FROM jsonb_to_recordset(s.original_acl_json)
           AS x(grantee_oid oid, grantor_oid oid, privilege text, is_grantable boolean)
         WHERE x.privilege='EXECUTE'
           AND (x.grantee_oid=0 OR x.grantee_oid=(SELECT oid FROM pg_roles WHERE rolname='authenticated'))
       )) THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: authenticated effective EXECUTE differs from snapshot';
    END IF;
  ELSE
    IF NOT has_function_privilege('anon', v_oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: privileges not restored';
    END IF;
  END IF;

  RAISE NOTICE 'Phase 9.2 function rollback complete: original permissions and metadata restored.';
END
$phase9_2_func_rollback$;

COMMIT;
