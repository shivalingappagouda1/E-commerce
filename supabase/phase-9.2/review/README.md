# ShopKart Phase 9.2 — Integration Correction Kit

## Purpose

This kit is a **review and integration aid**, not an approved migration. It contains:
- `verification.sql`: read-only inspection of table grants, RLS, function execution, policy definitions, snapshot table presence, and Storage bucket status.
- `snapshot_compatibility_check.sql`: read-only check of the snapshot schema expected by the latest migration source and the presence/count of snapshot rows.

Neither SQL file performs DDL or DML. Do not run the migration or rollback as part of this review.

## Where the actual problem is

The central defect is **package-version mismatch**, not one isolated typo:

1. The latest consolidated migration source defines:
   - `phase9_2_private.function_acl_snapshot` with `function_signature`, `function_oid`, `owner_name`, `proacl_was_null`, `original_acl_text`, `original_acl_json`, `original_comment`, `prosecdef`, `proconfig`, and `prosrc`.
   - It snapshots all nine named application functions.
   - It defines `table_acl_snapshot`, `policy_snapshot`, and `storage_policy_created` with its own column names.

2. The older standalone `phase9_2_function_rollback.sql` expects a different schema:
   - `snapshot_key`, `snapshot_version`, `function_identity`, and `owner_oid`.
   - It only restores `public.is_admin()`.
   - Those fields are not defined by the consolidated migration shown in the reviewed source.
   - Therefore that rollback cannot be paired with that migration.

3. The older `phase9_2_storage_rollback.sql` also assumes a different tracker/marker contract and validates policy definitions using partial `LIKE` checks. Partial text matches are not an exact policy-definition check.

4. The README/report claims a consolidated `rollback.sql` and verification suite, but the ZIP previously supplied contains separate function/storage scripts. The deliverable names and actual files must be made consistent.

## File-level diagnosis

| File | Finding | Required action |
|---|---|---|
| `migration.sql` | Latest source has a newer snapshot schema and explicit policy allowlist. It is not safe to pair with older rollback scripts. Also, `CREATE TABLE IF NOT EXISTS` does not validate an already-existing snapshot table's schema before reuse. | Add strict schema/version guards; abort if snapshot tables pre-exist with a different shape or prior migration marker. |
| `rollback.sql` | **Primary blocker.** The rollback distributed in the older ZIP expects columns absent from the migration's snapshot schema and only handles one function. | Rewrite against the exact current migration schema; restore all captured functions and tables, or fail closed where exact restoration cannot be guaranteed. |
| `verification.sql` | Prior reported verification coverage and the delivered standalone verification file do not match the consolidated migration/report. | Verify every required privilege (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER), effective role inheritance, function EXECUTE, exact policy roles/definitions, and snapshot completeness. |
| `security-audit.md` | Contains claims such as “exact rollback” and “all tests passed” that must be backed by the exact current files and actual test output. | Reconcile evidence and label unverified statements as manual review. |
| `README.md` | Describes five consolidated deliverables while the previously uploaded ZIP contains six differently named split scripts. | Align file list, run order, and warnings with the actual final package. |

## Important technical limits

- `current_database()` cannot prove the external Supabase project reference. The operator must manually verify the project reference in the Dashboard URL.
- A snapshot of `proacl`/`relacl` is not automatically an exact rollback. PostgreSQL does not expose a normal supported SQL assignment for arbitrary ACL arrays. Reconstruct grants with supported `GRANT`/`REVOKE` only when grantor, grant options, owner, and NULL/default ACL semantics can be preserved. Otherwise abort and require a documented manual restore.
- Trigger functions can be invoked by triggers without granting client roles direct RPC execution, but preserve function owner and security context.
- An extension's functions must not be modified.
- Extension/MIME validation and content sniffing are separate. An extension regex alone does not prove uploaded bytes are a safe image.
- The `public-assets` bucket being public means object reads are public; only writes/updates/deletes should be owner-restricted.
- Confirm the real frontend path in `src/services/authService.js`. The reviewed report says `avatars/${userId}.${ext}` (one folder level, UUID in filename). The Storage policy must match that exact path.

## Safe sequence

1. Integrate this kit into a branch only.
2. Ask Anti-Gravity to reconcile all five deliverables against the current source files.
3. Review the generated diff.
4. Run local static checks and a production build.
5. Run `verification.sql` only against the intended staging project after manually confirming its Dashboard reference.
6. Do not run `migration.sql` until the rollback and verification SQL have been reviewed together.
7. Do not run rollback unless the snapshot compatibility checks pass and the rollback has been tested on a disposable clone.

## Status

**NOT APPROVED FOR STAGING EXECUTION.** This kit intentionally does not pretend to supply an exact rollback where PostgreSQL's ACL restoration constraints and the current snapshot schema have not yet been reconciled.
