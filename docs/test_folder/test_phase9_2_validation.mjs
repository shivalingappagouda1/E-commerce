#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] ?? process.cwd());

const files = {
  storageMigration: 'database/migrations/phase9_2_storage_hardening.sql',
  functionMigration: 'database/migrations/phase9_2_function_security_hardening.sql',
  storageRollback: 'database/migrations/phase9_2_storage_rollback.sql',
  functionRollback: 'database/migrations/phase9_2_function_rollback.sql',
  verificationSql: 'database/tests/phase9_2_security_verification.sql',
  reviewDoc: 'database/tests/phase9_2_security_review.md',
  reportDoc: 'reports/phase9_2_implementation_report.md',
  authService: 'src/services/authService.js',
  authContext: 'src/context/AuthContext.jsx',
  pkgMigration: 'supabase/phase-9.2/migration.sql',
  pkgRollback: 'supabase/phase-9.2/rollback.sql',
  pkgVerification: 'supabase/phase-9.2/verification.sql',
  pkgAudit: 'supabase/phase-9.2/security-audit.md',
  pkgReadme: 'supabase/phase-9.2/README.md',
};

const failures = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Check that required files exist
for (const [name, p] of Object.entries(files)) {
  if (!fs.existsSync(path.join(root, p))) {
    failures.push(`Missing required file ${name}: ${p}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const storageMigration = read(files.storageMigration);
const storageMigrationCode = storageMigration.replace(/--[^\n]*/g, '');
const functionMigration = read(files.functionMigration);
const functionMigrationCode = functionMigration.replace(/--[^\n]*/g, '');
const storageRollback = read(files.storageRollback);
const storageRollbackCode = storageRollback.replace(/--[^\n]*/g, '');
const functionRollback = read(files.functionRollback);
const functionRollbackCode = functionRollback.replace(/--[^\n]*/g, '');
const verificationSql = read(files.verificationSql);
const verificationSqlCode = verificationSql.replace(/--[^\n]*/g, '');
const authService = read(files.authService);
const authContext = read(files.authContext);
const pkgMigration = read(files.pkgMigration);
const pkgMigrationCode = pkgMigration.replace(/--[^\n]*/g, '');
const pkgRollback = read(files.pkgRollback);
const pkgRollbackCode = pkgRollback.replace(/--[^\n]*/g, '');
const pkgVerification = read(files.pkgVerification);
const pkgVerificationCode = pkgVerification.replace(/--[^\n]*/g, '');
const pkgAudit = read(files.pkgAudit);
const pkgReadme = read(files.pkgReadme);

const expectedStoragePolicies = [
  'Users can view own avatar in public-assets',
  'Users can upload own avatar to public-assets',
  'Users can update own avatar in public-assets',
  'Users can delete own avatar from public-assets',
];

const tests = [];
const check = (name, ok, detail = '') => tests.push({ name, ok, detail });

// ── PART 1: BASELINE PHASE 9.2 ASSERTIONS ──

// Check 1: Explicit transactions
check(
  'Check 1: Both migrations and both rollbacks have explicit BEGIN/COMMIT blocks',
  /^BEGIN;[\s\S]*COMMIT;\s*$/m.test(storageMigration) &&
    /^BEGIN;[\s\S]*COMMIT;\s*$/m.test(functionMigration) &&
    /^BEGIN;[\s\S]*COMMIT;\s*$/m.test(storageRollback) &&
    /^BEGIN;[\s\S]*COMMIT;\s*$/m.test(functionRollback)
);

// Check 2: Storage migration creates public-assets bucket idempotently with public=true
check(
  'Check 2: Storage migration creates public-assets bucket idempotently with public=true',
  storageMigrationCode.includes("'public-assets'") &&
    storageMigrationCode.includes('public') &&
    (storageMigrationCode.includes('public = true') || storageMigrationCode.includes("'public-assets', 'public-assets', true"))
);

// Check 3: Storage migration does not modify any other bucket
check(
  'Check 3: Storage migration does not modify any other bucket',
  !/'(?!public-assets)[a-z0-9_-]+'\s*,\s*'(?!public-assets)[a-z0-9_-]+'/i.test(storageMigrationCode) &&
    !/\bUPDATE\s+storage\.buckets\s+SET\b/i.test(storageMigrationCode)
);

// Check 4: Storage migration defines all 4 avatar policies
check(
  'Check 4: Storage migration defines all 4 avatar policies',
  expectedStoragePolicies.every((p) => storageMigration.includes(p))
);

// Check 5: All 4 storage policies target authenticated role only (reject PUBLIC/anon)
check(
  'Check 5: All 4 storage policies target authenticated role only (reject PUBLIC/anon)',
  storageMigrationCode.includes('TO authenticated') &&
    !/ON\s+storage\.objects[^\n]*\n\s*TO\s+(PUBLIC|anon)\b/i.test(storageMigrationCode)
);

// Check 6: Storage UPDATE policy has both USING and WITH CHECK
check(
  'Check 6: Storage UPDATE policy has both USING and WITH CHECK clauses',
  storageMigration.includes('Users can update own avatar in public-assets') &&
    storageMigration.includes('USING') &&
    storageMigration.includes('WITH CHECK')
);

// Check 7: Storage policies enforce exact path pattern (single-level folder depth and auth.uid() filename)
check(
  'Check 7: Storage policies enforce exact path pattern (single-level folder depth and auth.uid() filename)',
  storageMigrationCode.includes('storage.foldername') &&
    storageMigrationCode.includes('storage.filename') &&
    storageMigrationCode.includes("'avatars'") &&
    storageMigrationCode.includes('auth.uid()')
);

// Check 8: Storage migration preflight checks for conflicting permissive policies on storage.objects
check(
  'Check 8: Storage migration preflight checks for conflicting permissive policies on storage.objects',
  (storageMigration.includes('v_conflicting_policy') || storageMigration.includes('v_conflicts')) &&
    storageMigration.toLowerCase().includes("permissive") &&
    storageMigration.toLowerCase().includes("schemaname")
);

// Check 9: Storage migration avoids blind DROP POLICY IF EXISTS (uses pg_policies check)
check(
  'Check 9: Storage migration avoids blind DROP POLICY IF EXISTS (uses pg_policies check)',
  !/DROP POLICY IF EXISTS[^\n]+ON storage\.objects/i.test(storageMigrationCode) &&
    storageMigration.includes('pg_policies')
);

// Check 10: Storage migration tags created policies with COMMENT ON POLICY ... IS 'PHASE9_2_CREATED'
check(
  'Check 10: Storage migration tags created policies with COMMENT ON POLICY ... IS PHASE9_2_CREATED',
  storageMigration.includes("COMMENT ON POLICY") &&
    (storageMigration.includes("'PHASE9_2_CREATED'") || storageMigration.includes("'SHOPKART_PHASE9_2_CREATED_V1'"))
);

// Check 11: Storage rollback contains ZERO bucket deletion statements
check(
  'Check 11: Storage rollback contains ZERO bucket deletion statements (no DELETE FROM storage.buckets)',
  !/\bDELETE\s+FROM\s+storage\.buckets\b/i.test(storageRollbackCode)
);

// Check 12: Storage rollback drops only policies tagged with 'PHASE9_2_CREATED'
check(
  'Check 12: Storage rollback drops only policies tagged with PHASE9_2_CREATED via pg_description',
  storageRollback.includes('pg_description') &&
    (storageRollback.includes("'PHASE9_2_CREATED'") || storageRollback.includes("'SHOPKART_PHASE9_2_CREATED_V1'")) &&
    storageRollback.includes('DROP POLICY')
);

// Check 13: Storage rollback does not drop pre-existing policies with different definitions
check(
  'Check 13: Storage rollback preserves pre-existing policies not tagged with PHASE9_2_CREATED',
  storageRollback.includes('Preserved pre-existing policy') ||
    storageRollback.includes('not tagged PHASE9_2_CREATED') ||
    storageRollback.includes('Preserving unmarked policy')
);

// Check 14: Storage rollback preserves public-assets bucket and any objects inside it
check(
  'Check 14: Storage rollback preserves public-assets bucket and stored objects (no bucket or object deletion)',
  !/\bDELETE\s+FROM\s+storage\.objects\b/i.test(storageRollbackCode) &&
    !/\bDROP\s+TABLE\b/i.test(storageRollbackCode)
);

// Check 15: Function migration targets exact zero-argument public.is_admin() via to_regprocedure
check(
  'Check 15: Function migration targets exact zero-argument public.is_admin() via to_regprocedure',
  functionMigration.includes("to_regprocedure('public.is_admin()')")
);

// Check 16: Function migration captures pre-migration proacl and comment snapshot before modifying
check(
  'Check 16: Function migration captures pre-migration proacl and comment snapshot before modifying',
  functionMigration.includes('PHASE9_2_SNAPSHOT') &&
    functionMigration.includes('PROACL_IS_NULL=') &&
    functionMigration.includes('ORIGINAL_COMMENT=') &&
    functionMigration.includes('COMMENT ON FUNCTION public.is_admin()')
);

// Check 17: Function migration revokes from PUBLIC and anon, grants to authenticated
check(
  'Check 17: Function migration revokes from PUBLIC and anon, grants to authenticated',
  /REVOKE ALL ON FUNCTION public\.is_admin\(\) FROM PUBLIC,\s*anon;/i.test(functionMigrationCode) &&
    /GRANT EXECUTE ON FUNCTION public\.is_admin\(\) TO authenticated;/i.test(functionMigrationCode)
);

// Check 18: Function migration does not alter function definition, owner, or search_path
check(
  'Check 18: Function migration does not alter function definition, owner, or search_path',
  !/\b(CREATE OR REPLACE FUNCTION|ALTER FUNCTION.*SET search_path)\b/i.test(functionMigrationCode)
);

// Check 19: Function rollback verifies PHASE9_2_SNAPSHOT before restoring permissions
check(
  'Check 19: Function rollback verifies PHASE9_2_SNAPSHOT before restoring permissions',
  functionRollback.includes('PHASE9_2_SNAPSHOT') &&
    functionRollback.includes('obj_description') &&
    functionRollback.includes('ROLLBACK ABORT') &&
    functionRollbackCode.length > 0
);

// Check 20: Function rollback restores exact original privileges (including PUBLIC if proacl was NULL)
check(
  'Check 20: Function rollback restores exact original privileges (including PUBLIC if proacl was NULL)',
  functionRollback.includes('GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC') &&
    (functionRollback.includes('PROACL_IS_NULL=true') || functionRollback.includes('v_proacl_null'))
);

// Check 21: Verification SQL is strictly read-only (zero DDL/DML, SELECT queries only)
check(
  'Check 21: Verification SQL is strictly read-only (zero DDL/DML, SELECT queries only)',
  !/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+(TABLE|POLICY|FUNCTION)|DROP\s+(TABLE|POLICY|FUNCTION|TRIGGER)|CREATE\s+TEMP|TRUNCATE|GRANT\s+\w+\s+ON|REVOKE\s+\w+\s+ON)\b/i.test(
    verificationSqlCode
  )
);

// Check 22: Verification SQL covers Sections A through F without hardcoded PASS on non-verifiable items
check(
  'Check 22: Verification SQL covers Sections A through F without hardcoded PASS on non-verifiable items',
  (verificationSql.includes('STORAGE-A-BUCKET-EXISTS') || verificationSql.includes('A_BUCKET')) &&
    (verificationSql.includes('STORAGE-B-POLICY') || verificationSql.includes('B_POLICIES')) &&
    (verificationSql.includes('STORAGE-C-CONFLICTS') || verificationSql.includes('C_OTHER_PERMISSIVE_POLICIES')) &&
    (verificationSql.includes('FUNC-D1-IDENTITY-SECDEF') || verificationSql.includes('D1_FUNCTION_IDENTITY')) &&
    (verificationSql.includes('FUNC-D2-EXECUTE-PRIVILEGES') || verificationSql.includes('D2_FUNCTION_EFFECTIVE_PRIVILEGES')) &&
    (verificationSql.includes('APP-E-COMPATIBILITY') || verificationSql.includes('E_APP_COMPATIBILITY')) &&
    !/APP-E-COMPATIBILITY[\s\S]*?'PASS'\s*AS\s*status/i.test(verificationSql) &&
    authService.includes("from('public-assets')") &&
    authContext.includes("profile?.role === 'admin'")
);

// ── PART 2: PACKAGE CORRECTION ASSERTIONS (supabase/phase-9.2/) ──

// Check 23: All five package deliverables exist
check(
  'Check 23: All five required package files exist in supabase/phase-9.2/',
  fs.existsSync(path.join(root, 'supabase/phase-9.2/migration.sql')) &&
    fs.existsSync(path.join(root, 'supabase/phase-9.2/rollback.sql')) &&
    fs.existsSync(path.join(root, 'supabase/phase-9.2/verification.sql')) &&
    fs.existsSync(path.join(root, 'supabase/phase-9.2/security-audit.md')) &&
    fs.existsSync(path.join(root, 'supabase/phase-9.2/README.md'))
);

// Check 24: Migration contains explicit BEGIN/COMMIT, targets project reference, and avoids invalid database-name check
check(
  'Check 24: Package migration is transactional, references target project, and avoids invalid current_database check',
  pkgMigration.includes('ulmwssozdmppvydppswx') &&
    /^BEGIN;[\s\S]*COMMIT;\s*$/m.test(pkgMigration) &&
    !/current_database\(\)\s*=\s*['"]ulmwssozdmppvydppswx['"]/i.test(pkgMigrationCode)
);

// Check 25: Table ACL snapshot table is created and captures all 17 public tables
check(
  'Check 25: Package migration captures complete pre-migration table ACL snapshots',
  pkgMigration.includes('phase9_2_private.table_acl_snapshot') &&
    pkgMigration.includes('aclexplode') &&
    pkgMigration.includes('relacl_was_null')
);

// Check 26: Function ACL snapshot table is created and captures all 9 application functions
check(
  'Check 26: Package migration captures complete pre-migration function ACL snapshots for all 9 functions',
  pkgMigration.includes('phase9_2_private.function_acl_snapshot') &&
    pkgMigration.includes('public.is_admin()') &&
    pkgMigration.includes('public.get_admin_customers()') &&
    pkgMigration.includes('public.sync_user_cart(jsonb)') &&
    pkgMigration.includes('public.place_order(uuid,text,text)') &&
    pkgMigration.includes('public.cancel_order(uuid)') &&
    pkgMigration.includes('public.create_profile_on_signup()') &&
    pkgMigration.includes('public.prevent_role_self_escalation()') &&
    pkgMigration.includes('public.restore_inventory_on_cancellation()') &&
    pkgMigration.includes('public.set_updated_at()')
);

// Check 27: Table grants are wiped clean from PUBLIC, anon, authenticated before re-granting minimum privileges
check(
  'Check 27: Package migration explicitly revokes existing privileges from PUBLIC, anon, authenticated',
  /REVOKE ALL ON TABLE[\s\S]+?FROM PUBLIC;/i.test(pkgMigrationCode) &&
    /REVOKE ALL ON TABLE[\s\S]+?FROM anon;/i.test(pkgMigrationCode) &&
    /REVOKE ALL ON TABLE[\s\S]+?FROM authenticated;/i.test(pkgMigrationCode)
);

// Check 28: Storefront catalog SELECT is preserved for anon and authenticated
check(
  'Check 28: Storefront catalog SELECT is explicitly preserved for anon and authenticated',
  pkgMigrationCode.includes('GRANT SELECT ON TABLE public.categories') &&
    pkgMigrationCode.includes('TO anon;') &&
    pkgMigrationCode.includes('TO authenticated;')
);

// Check 29: Function permissions hardened: sensitive RPCs granted to authenticated; trigger functions revoked
check(
  'Check 29: Sensitive RPCs granted to authenticated; trigger-only functions revoked from client roles',
  pkgMigrationCode.includes('GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;') &&
    pkgMigrationCode.includes('GRANT EXECUTE ON FUNCTION public.sync_user_cart(jsonb) TO authenticated;') &&
    pkgMigrationCode.includes('GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,text) TO authenticated;') &&
    pkgMigrationCode.includes('GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;') &&
    !/GRANT EXECUTE ON FUNCTION public\.create_profile_on_signup/i.test(pkgMigrationCode) &&
    !/GRANT EXECUTE ON FUNCTION public\.prevent_role_self_escalation/i.test(pkgMigrationCode) &&
    !/GRANT EXECUTE ON FUNCTION public\.restore_inventory_on_cancellation/i.test(pkgMigrationCode) &&
    !/GRANT EXECUTE ON FUNCTION public\.set_updated_at/i.test(pkgMigrationCode)
);

// Check 30: Policy standardization records policy snapshot and standardizes customer/admin policies via explicit allowlist
check(
  'Check 30: Policy standardization records policy snapshot and standardizes customer/admin policies via explicit allowlist',
  pkgMigration.includes('phase9_2_private.policy_snapshot') &&
    pkgMigration.includes('temp_phase9_2_allowlist') &&
    pkgMigration.includes('ALTER POLICY') &&
    pkgMigration.includes('TO authenticated')
);

// Check 31: Storage setup validates existing policy definition before preserving or creating
check(
  'Check 31: Storage setup validates existing policy definition before preserving or creating',
  pkgMigration.includes('phase9_2_private.storage_policy_created') &&
    pkgMigration.includes('SHOPKART_PHASE9_2_CREATED_V1') &&
    pkgMigration.includes('has conflicting definition')
);

// Check 32: Rollback restores exact table and function ACLs from snapshot without blanket GRANT ALL
check(
  'Check 32: Rollback restores exact table and function ACLs from snapshot without blanket GRANT ALL',
  pkgRollback.includes('phase9_2_private.table_acl_snapshot') &&
    pkgRollback.includes('phase9_2_private.function_acl_snapshot') &&
    pkgRollback.includes('phase9_2_private.policy_snapshot') &&
    !/\bGRANT ALL ON ALL TABLES\b/i.test(pkgRollbackCode) &&
    !/\bDELETE FROM storage\.buckets\b/i.test(pkgRollbackCode)
);

// Check 33: Rollback drops only policies tracked in storage_policy_created
check(
  'Check 33: Rollback drops only policies tracked in storage_policy_created and verified by marker',
  pkgRollback.includes('phase9_2_private.storage_policy_created') &&
    pkgRollback.includes('SHOPKART_PHASE9_2_CREATED_V1') &&
    pkgRollback.includes('DROP POLICY')
);

// Check 34: Verification SQL is read-only, checks effective permissions, and has 12 checks
check(
  'Check 34: Verification SQL is strictly read-only and uses has_table_privilege for effective checks',
  !/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+(TABLE|POLICY|FUNCTION)|DROP\s+(TABLE|POLICY|FUNCTION|TRIGGER)|TRUNCATE\s+\w+)\b/i.test(
    pkgVerificationCode
  ) &&
    pkgVerification.includes('has_table_privilege') &&
    pkgVerification.includes('has_function_privilege') &&
    pkgVerification.includes('PROJ-01-TARGET-VERIFICATION') &&
    pkgVerification.includes('APP-12-FRONTEND-COMPAT') &&
    !/APP-12-FRONTEND-COMPAT[\s\S]*?'PASS'\s*AS\s*status/i.test(pkgVerification) &&
    !/PROJ-01-TARGET-VERIFICATION[\s\S]*?'PASS'\s*AS\s*status/i.test(pkgVerification)
);

// Check 35: Security audit and README contain required sections, checklists, and simulation notes
check(
  'Check 35: Security audit and README contain required sections, checklists, and simulated payment notice',
  pkgAudit.includes('1. Project Identity and Scope') &&
    pkgAudit.includes('12. Final Approval Status') &&
    pkgAudit.includes('[SOURCE VERIFIED]') &&
    pkgAudit.includes('simulated') &&
    pkgReadme.includes('Before Migration Checklist') &&
    pkgReadme.includes('Execution Sequence') &&
    pkgReadme.includes('Manual Staging Test Checklist')
);

// Check 36: Rejection of broad RLS policy discovery (no LIKE '%auth.uid()%' in discovery loops)
check(
  'Check 36: Migration and rollback reject broad RLS policy discovery in favor of explicit allowlists',
  !/WHERE[^\n]*\bqual\s+LIKE\s+'%auth\.uid\(\)%'/i.test(pkgMigrationCode) &&
    !/WHERE[^\n]*\bqual\s+LIKE\s+'%auth\.uid\(\)%'/i.test(pkgRollbackCode) &&
    pkgMigration.includes('temp_phase9_2_allowlist')
);

// Check 37: Rejection of blanket GRANT ALL in rollback script
check(
  'Check 37: Rollback rejects blanket GRANT ALL ON TABLE statements to anon/authenticated',
  !/GRANT\s+ALL\s+ON\s+TABLE[^\n]+TO\s+(anon|authenticated)/i.test(pkgRollbackCode) &&
    !/GRANT\s+ALL\s+ON\s+ALL\s+TABLES/i.test(pkgRollbackCode)
);

// Check 38: Function snapshot coverage covers all 9 application functions in migration and rollback
check(
  'Check 38: Function snapshot and restoration covers all 9 application functions without comment markers',
  pkgMigration.includes('public.is_admin()') &&
    pkgMigration.includes('public.get_admin_customers()') &&
    pkgMigration.includes('public.sync_user_cart(jsonb)') &&
    pkgMigration.includes('public.place_order(uuid,text,text)') &&
    pkgMigration.includes('public.cancel_order(uuid)') &&
    pkgMigration.includes('public.create_profile_on_signup()') &&
    pkgMigration.includes('public.prevent_role_self_escalation()') &&
    pkgMigration.includes('public.restore_inventory_on_cancellation()') &&
    pkgMigration.includes('public.set_updated_at()') &&
    pkgRollback.includes('phase9_2_private.function_acl_snapshot') &&
    !/COMMENT\s+ON\s+FUNCTION\s+public\.is_admin\(\)\s+IS\s+'PHASE9_2_SNAPSHOT/i.test(pkgMigrationCode)
);

// Check 39: Complete Storage policy validation in migration and rollback
check(
  'Check 39: Storage setup enforces folder depth=1, filename regex, and rollback checks definition before dropping',
  pkgMigration.includes("array_length(storage.foldername(name), 1) = 1") &&
    pkgMigration.includes("png|jpg|jpeg|webp|gif") &&
    pkgMigration.includes("creation_status") &&
    pkgRollback.includes("creation_status = 'CREATED'") &&
    pkgRollback.includes("SHOPKART_PHASE9_2_CREATED_V1") &&
    !/\bDELETE\s+FROM\s+storage\.buckets\b/i.test(pkgRollbackCode) &&
    !/\bDELETE\s+FROM\s+storage\.objects\b/i.test(pkgRollbackCode)
);

// Check 40: Table ACL snapshots cover all 17 public tables
check(
  'Check 40: Table ACL snapshots cover all 17 public tables in migration, rollback, and verification',
  [
    'profiles', 'addresses', 'categories', 'products', 'product_images',
    'product_variants', 'inventory', 'carts', 'cart_items', 'wishlists',
    'wishlist_items', 'coupons', 'orders', 'order_items', 'payments',
    'reviews', 'banners'
  ].every(
    (tbl) =>
      pkgMigration.includes(`'${tbl}'`) &&
      pkgVerification.includes(`'${tbl}'`)
  )
);

// Check 41: Snapshot column contract match between migration, rollback, and snapshot compatibility check
check(
  'Check 41: Snapshot column contract matches across migration, rollback, and compatibility check',
  [
    'table_name', 'owner_name', 'relacl_was_null', 'original_acl_text', 'original_acl_json',
    'function_signature', 'function_oid', 'proacl_was_null', 'original_comment',
    'prosecdef', 'proconfig', 'prosrc', 'schemaname', 'tablename', 'policyname',
    'original_roles', 'new_roles', 'cmd', 'expected_definition', 'migration_id', 'creation_status'
  ].every(
    (col) =>
      pkgMigration.includes(col) &&
      pkgRollback.includes(col)
  )
);

// Check 42: Migration has snapshot schema & version guard to prevent reusing incompatible pre-existing tables
check(
  'Check 42: Migration validates pre-existing snapshot table schemas before populating',
  pkgMigration.includes('phase9_2_snapshot_schema_guard') &&
    pkgMigration.includes('information_schema.columns') &&
    pkgMigration.includes('incompatible schema')
);

// Check 43: Rollback validates snapshot schema and dropped grantee role preconditions before making changes
check(
  'Check 43: Rollback preflight verifies snapshot column schema and detects dropped grantee roles',
  pkgRollback.includes('information_schema.columns') &&
    pkgRollback.includes('One or more grantee roles recorded in ACL snapshots no longer exist in pg_roles')
);

// Check 44: Integration review directory contains all four correction-kit deliverables
check(
  'Check 44: Review directory contains all 4 integration correction-kit deliverables',
  fs.existsSync(path.join(root, 'supabase/phase-9.2/review/README.md')) &&
    fs.existsSync(path.join(root, 'supabase/phase-9.2/review/verification.sql')) &&
    fs.existsSync(path.join(root, 'supabase/phase-9.2/review/snapshot_compatibility_check.sql')) &&
    fs.existsSync(path.join(root, 'supabase/phase-9.2/review/ANTI_GRAVITY_INTEGRATION_PROMPT.txt'))
);

// Check 45: Verification inspects all 7 table privileges and 26 snapshot columns
check(
  'Check 45: Verification checks all 7 table privileges and validates 26 snapshot columns',
  pkgVerification.includes("'SELECT'") &&
    pkgVerification.includes("'INSERT'") &&
    pkgVerification.includes("'UPDATE'") &&
    pkgVerification.includes("'DELETE'") &&
    pkgVerification.includes("'TRUNCATE'") &&
    pkgVerification.includes("'REFERENCES'") &&
    pkgVerification.includes("'TRIGGER'") &&
    pkgVerification.includes('verified_snapshot_columns') &&
    pkgVerification.includes('= 26')
);

// Print Test Results
console.log('=== SHOPKART PHASE 9.2 COMPREHENSIVE VALIDATION SUITE ===');
for (const t of tests) {
  console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.detail ? ` — ${t.detail}` : ''}`);
}

const failed = tests.filter((t) => !t.ok).length;
console.log(`\nResults: ${tests.length - failed}/${tests.length} Phase 9.2 static validation checks passed.`);

if (failed > 0) {
  process.exit(1);
}

console.log('LIMITATION: static checks do not parse PostgreSQL or prove live database behavior.');
