SHOPKART PHASE 9.2 — CORRECTED SQL PACKAGE
================================================

IMPORTANT: These are conservative templates, not a guarantee of production safety.
Do not run on production. Confirm the Supabase project ref in the dashboard first.

FILES
1. phase9_2_storage_hardening.sql
2. phase9_2_function_security_hardening.sql
3. phase9_2_storage_rollback.sql
4. phase9_2_function_rollback.sql
5. phase9_2_security_verification.sql

EXECUTION ORDER (STAGING ONLY)
1. Confirm backup/export and exact Supabase project ref.
2. Run storage_hardening.sql.
3. Run function_security_hardening.sql.
4. Run security_verification.sql.
5. Perform manual cross-user runtime tests before any production decision.

ROLLBACK
- Storage rollback only removes policies carrying the migration marker and
  checks that the policy still has expected bucket/ownership fragments.
- Function rollback reads the snapshot table and aborts if it cannot safely
  reconstruct the original ACL. It does not guess.
- Neither rollback deletes the public-assets bucket or stored objects.

CONSERVATIVE BEHAVIOR
- Storage migration aborts if any other permissive storage.objects policy exists.
  This may require manual review in projects with unrelated storage policies.
- Function migration aborts if the original ACL includes extra grantees or
  grant options outside the supported safe subset.
- The filename rule permits png, jpg, jpeg, webp and gif only. Confirm that
  the application uses one of these extensions before running.
- public-assets is a public bucket. Public downloads bypass object RLS.
  Never store private documents or sensitive files in it.

IMPORTANT LIMITATIONS
- SQL catalog checks do not prove all runtime behavior.
- PostgreSQL ACL grantor semantics and Supabase role memberships must be
  verified on the target database. The function rollback intentionally aborts
  for non-owner grantors rather than claiming exact restoration.
- The storage postflight checks catalog expression fragments; it is not a
  formal SQL expression equivalence proof.
- Review all five files against the actual deployed schema and app code.
- No SQL has been executed by creating this package.
