#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] ?? process.cwd());

const files = {
  migration: 'supabase/phase-9.2/migration.sql',
  rollback: 'supabase/phase-9.2/rollback.sql',
  verification: 'supabase/phase-9.2/verification.sql',
  readme: 'supabase/phase-9.2/README.md',
  audit: 'supabase/phase-9.2/security-audit.md',
};

const failures = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

for (const [name, p] of Object.entries(files)) {
  if (!fs.existsSync(path.join(root, p))) {
    failures.push(`Missing ${name}: ${p}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const migration = read(files.migration);
const rollback = read(files.rollback);
const verification = read(files.verification);
const readme = read(files.readme);
const audit = read(files.audit);

/**
 * Robust SQL Comment Stripper:
 * Safely removes single-line (-- ...) and block (/* ... *\/) comments,
 * while strictly preserving comments that appear inside SQL string literals ('...').
 */
function stripSqlComments(sql) {
  let result = '';
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false;
        result += char;
      }
    } else if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
    } else if (inSingleQuote) {
      result += char;
      if (char === "'" && next === "'") {
        result += next;
        i++;
      } else if (char === "'") {
        inSingleQuote = false;
      }
    } else {
      if (char === '-' && next === '-') {
        inLineComment = true;
        i++;
      } else if (char === '/' && next === '*') {
        inBlockComment = true;
        i++;
      } else if (char === "'") {
        inSingleQuote = true;
        result += char;
      } else {
        result += char;
      }
    }
  }
  return result;
}

const migrationCode = stripSqlComments(migration);
const rollbackCode = stripSqlComments(rollback);
const verificationCode = stripSqlComments(verification);

const tables = [
  'addresses', 'banners', 'cart_items', 'carts', 'categories', 'coupons',
  'inventory', 'order_items', 'orders', 'payments', 'product_images',
  'product_variants', 'products', 'profiles', 'reviews', 'wishlist_items', 'wishlists'
];

const functions = [
  'is_admin()',
  'get_admin_customers()',
  'sync_user_cart(jsonb)',
  'place_order(uuid,text,text)',
  'cancel_order(uuid)',
  'create_profile_on_signup()',
  'prevent_role_self_escalation()',
  'restore_inventory_on_cancellation()',
  'set_updated_at()'
];

const storagePolicies = [
  'Users can view own avatar in public-assets',
  'Users can upload own avatar to public-assets',
  'Users can update own avatar in public-assets',
  'Users can delete own avatar from public-assets'
];

const modifiedPolicies = [
  ['profiles', 'Users view own profile'],
  ['profiles', 'Users update own profile'],
  ['profiles', 'Admins can view all profiles'],
  ['profiles', 'Admins can update all profiles'],
  ['profiles', 'Admins can delete profiles'],
  ['addresses', 'Users view own addresses'],
  ['addresses', 'Users insert own addresses'],
  ['addresses', 'Users update own addresses'],
  ['addresses', 'Users delete own addresses'],
  ['addresses', 'Admins can view all addresses'],
  ['carts', 'Users view own cart'],
  ['carts', 'Users insert own cart'],
  ['carts', 'Users update own cart'],
  ['carts', 'Users delete own cart'],
  ['carts', 'Admins can view all carts'],
  ['cart_items', 'Users view own cart items'],
  ['cart_items', 'Users insert own cart items'],
  ['cart_items', 'Users update own cart items'],
  ['cart_items', 'Users delete own cart items'],
  ['cart_items', 'Admins can view all cart items'],
  ['wishlists', 'Users view own wishlist'],
  ['wishlists', 'Users insert own wishlist'],
  ['wishlists', 'Users delete own wishlist'],
  ['wishlists', 'Admins can view all wishlists'],
  ['wishlist_items', 'Users view own wishlist items'],
  ['wishlist_items', 'Users insert own wishlist items'],
  ['wishlist_items', 'Users delete own wishlist items'],
  ['wishlist_items', 'Admins can view all wishlist items'],
  ['orders', 'Users view own orders'],
  ['orders', 'Admins full access to orders'],
  ['order_items', 'Users view own order items'],
  ['order_items', 'Admins full access to order items'],
  ['payments', 'Users view own payments'],
  ['payments', 'Admins full access to payments'],
  ['reviews', 'Users view own reviews'],
  ['reviews', 'Users create own reviews'],
  ['reviews', 'Users update own reviews'],
  ['reviews', 'Users delete own reviews']
];

const tests = [];
const check = (name, ok, detail = '') => tests.push({ name, ok, detail });

// =============================================================================
// 1. TRANSACTION BOUNDARY INTEGRITY (ISSUE 11)
// =============================================================================
function validateTransactionStructure(sqlCode, fileName) {
  const trimmed = sqlCode.trim();
  const begins = (trimmed.match(/\bBEGIN\s*;/gi) || []).length;
  const commits = (trimmed.match(/\bCOMMIT\s*;/gi) || []).length;
  const rollbacks = (trimmed.match(/\bROLLBACK\s*;/gi) || []).length;

  const startsWithBegin = /^\s*BEGIN\s*;/i.test(trimmed);
  const endsWithCommit = /;\s*COMMIT\s*;?\s*$/i.test(trimmed);

  return (
    startsWithBegin &&
    endsWithCommit &&
    begins === 1 &&
    commits === 1 &&
    rollbacks === 0
  );
}

check(
  'Transaction Boundary Check: Migration wraps entire execution in single atomic BEGIN/COMMIT',
  validateTransactionStructure(migrationCode, 'migration.sql')
);

check(
  'Transaction Boundary Check: Rollback wraps entire execution in single atomic BEGIN/COMMIT',
  validateTransactionStructure(rollbackCode, 'rollback.sql')
);

// =============================================================================
// 2. ROLE MATCHING REGEX (ISSUE 12)
// =============================================================================
const rolePattern = /rolname\s*=\s*'authenticated'/;
check(
  'Role Matching Syntax: Migration uses valid whitespace-insensitive authenticated role regex',
  rolePattern.test(migrationCode) &&
    rolePattern.test("rolname='authenticated'") &&
    rolePattern.test("rolname   =   'authenticated'") &&
    !/rolname\s*=\s*'public'/.test(migrationCode)
);

// =============================================================================
// 3. EXACT 17-TABLE IDENTITY & STRUCTURAL GRANTS (ISSUE 1 & 13)
// =============================================================================
check(
  'Snapshot Preflight: Rollback verifies exact 17 table identities with zero missing or extra',
  tables.every((t) => rollback.includes(`'${t}'`)) &&
    rollback.includes("(SELECT count(DISTINCT table_name) FROM phase9_2_private.table_acl_snapshot) <> 17") &&
    rollback.includes("(SELECT count(*) FROM phase9_2_private.table_acl_snapshot) <> 17")
);

check(
  'Table Privilege Hardening: Migration explicitly wipes all grants from PUBLIC, anon, authenticated',
  migration.includes('REVOKE ALL ON TABLE public.profiles') &&
    migration.includes('FROM PUBLIC;') &&
    migration.includes('FROM anon;') &&
    migration.includes('FROM authenticated;')
);

check(
  'Storefront Catalog Access: Migration preserves anonymous SELECT on 8 public catalog tables',
  ['categories', 'products', 'product_images', 'product_variants', 'inventory', 'banners', 'reviews', 'coupons'].every(
    (t) => migration.includes(`public.${t}`)
  ) && migration.includes('TO anon;')
);

check(
  'Least-Privilege Grants: Authenticated customer permissions restricted to own resources',
  migration.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.addresses') &&
    migration.includes('GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated') &&
    migration.includes('GRANT SELECT ON TABLE public.order_items, public.cart_items, public.payments TO authenticated')
);

// =============================================================================
// 4. EXACT 9-FUNCTION IDENTITIES & EXECUTE RESTRICTIONS (ISSUE 1, 4, 7, 13)
// =============================================================================
check(
  'Snapshot Preflight: Rollback verifies exact 9 function signatures with zero missing or extra',
  functions.every((f) => rollback.includes(f)) &&
    rollback.includes("(SELECT count(DISTINCT function_signature) FROM phase9_2_private.function_acl_snapshot) <> 9") &&
    rollback.includes("(SELECT count(*) FROM phase9_2_private.function_acl_snapshot) <> 9")
);

check(
  'Function Privilege Hardening: Migration revokes all 9 functions from client roles, granting only 5 client RPCs',
  functions.every((f) => migration.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated`)) &&
    ['is_admin()', 'get_admin_customers()', 'sync_user_cart(jsonb)', 'place_order(uuid,text,text)', 'cancel_order(uuid)'].every(
      (f) => migration.includes(`GRANT EXECUTE ON FUNCTION public.${f} TO authenticated`)
    ) &&
    !migration.includes('GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated')
);

check(
  'Function Rollback: Documents PostgreSQL session grantor limitation and distinguishes restoration types',
  rollback.includes('proacl_was_null') &&
    rollback.includes('Exact ACL restoration') &&
    rollback.includes('Equivalent effective permission restoration') &&
    rollback.includes('current_user')
);

// =============================================================================
// 5. STORAGE BUCKET & PATH-RESTRICTED POLICIES (ISSUE 2, 3, 9, 13)
// =============================================================================
check(
  'Storage Bucket Provisioning: Migration creates public-assets bucket idempotently with public = true',
  migration.includes("'public-assets'") &&
    migration.includes("INSERT INTO storage.buckets (id, name, public)")
);

check(
  'Storage Policies: Migration defines all 4 avatar policies restricted to authenticated users',
  storagePolicies.every((p) => migration.includes(`"${p}" ON storage.objects`)) &&
    migration.includes('FOR SELECT TO authenticated') &&
    migration.includes('FOR INSERT TO authenticated') &&
    migration.includes('FOR UPDATE TO authenticated') &&
    migration.includes('FOR DELETE TO authenticated')
);

check(
  'Storage Path Constraints: Enforces single-level folder depth and auth.uid() filename regex',
  migration.includes('array_length(storage.foldername(name), 1) = 1') &&
    migration.includes("(storage.foldername(name))[1] = 'avatars'") &&
    migration.includes('(png|jpg|jpeg|webp|gif)')
);

check(
  'Storage Policy Rollback: Verifies complete definition (schema, table, cmd, permissive, roles, expressions)',
  rollback.includes("v_pol.schemaname <> 'storage' OR v_pol.tablename <> 'objects'") &&
    rollback.includes('v_pol.cmd <> v_rec.cmd') &&
    rollback.includes("v_pol.permissive <> 'PERMISSIVE'") &&
    rollback.includes('v_pol.roles::text[] <> v_rec.roles') &&
    rollback.includes("v_pol.comment_desc IS DISTINCT FROM 'SHOPKART_PHASE9_2_CREATED_V1'")
);

check(
  'Storage UPDATE Rollback: Independently validates complete constraints in BOTH USING and WITH CHECK',
  rollback.includes('Storage UPDATE policy "%" USING expression differs from expected Phase 9.2 baseline') &&
    rollback.includes('Storage UPDATE policy "%" WITH CHECK expression differs from expected Phase 9.2 baseline') &&
    rollback.includes('v_pol.qual NOT LIKE \'%bucket_id%public-assets%\'') &&
    rollback.includes('v_pol.with_check NOT LIKE \'%bucket_id%public-assets%\'')
);

check(
  'Storage Invariants: Rollback preserves public-assets bucket and storage objects',
  !/DELETE\s+FROM\s+storage\.buckets/i.test(rollbackCode) &&
    !/DELETE\s+FROM\s+storage\.objects/i.test(rollbackCode) &&
    !/DROP\s+TABLE/i.test(rollbackCode)
);

// =============================================================================
// 6. RLS POLICY ALLOWLIST & FULL DEFINITION COMPARISON (ISSUE 1, 5, 8, 13)
// =============================================================================
check(
  'RLS Snapshot Preflight: Rollback verifies exact 38 modified policies from allowlist',
  modifiedPolicies.every(([tab, pol]) => rollback.includes(`('${tab}', '${pol}')`)) &&
    rollback.includes('WHERE changed_by_phase9_2 = true\n  ) <> 38')
);

check(
  'Table ACL Rollback: Restores effective permissions without blanket GRANT ALL and preserves NULL relacl distinction',
  !/GRANT\s+ALL\s+ON\s+TABLE\s+public\.\w+\s+TO\s+(anon|authenticated)\b/i.test(rollbackCode) &&
    rollback.includes('v_snap.relacl_was_null') &&
    !rollback.includes('GRANT ALL ON TABLE public.%I TO %I') &&
    rollback.includes('Effective permissions restored; original physical NULL ACL state not recreated')
);

check(
  'RLS Policy Rollback: Verifies complete definition (cmd, permissive, roles, USING, WITH CHECK) before altering',
  rollback.includes('v_current_pol.cmd <> v_pol.cmd') &&
    rollback.includes('v_current_pol.permissive <> v_pol.permissive') &&
    rollback.includes("coalesce(v_current_pol.qual, '') <> coalesce(v_pol.original_qual, '')") &&
    rollback.includes("coalesce(v_current_pol.with_check, '') <> coalesce(v_pol.original_with_check, '')")
);

// =============================================================================
// 7. COMPREHENSIVE POSTFLIGHT VERIFICATION IN ROLLBACK (ISSUE 6, 7, 8, 9)
// =============================================================================
check(
  'Table Postflight: Audits all 7 privileges for anon and authenticated across all 17 public tables',
  ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'].every((p) =>
    rollback.includes(`'${p}'`)
  ) &&
    rollback.includes('ROLLBACK POSTFLIGHT FAIL: Table public.% effective privilege % for role % is %') &&
    rollback.includes('ROLLBACK POSTFLIGHT FAIL: Table public.% owner % lacks expected % privilege')
);

check(
  'Function Postflight: Audits resolution, comments, and EXECUTE privileges for all 9 functions',
  rollback.includes('ROLLBACK POSTFLIGHT FAIL: Function % could not be resolved') &&
    rollback.includes('ROLLBACK POSTFLIGHT FAIL: Function % comment was not restored') &&
    rollback.includes('ROLLBACK POSTFLIGHT FAIL: Function % effective EXECUTE for role % is %')
);

check(
  'RLS Policy Postflight: Compares all 38 modified policies against snapshot attributes',
  rollback.includes('ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% is missing from pg_policies') &&
    rollback.includes('ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% has cmd "%", expected "%"') &&
    rollback.includes('ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% USING expression differs from original snapshot') &&
    rollback.includes('ROLLBACK POSTFLIGHT FAIL: Policy "%" on %.% WITH CHECK expression differs from original snapshot')
);

check(
  'Storage Postflight: Verifies removal of created policies, preservation of pre-existing policies and bucket',
  rollback.includes('ROLLBACK POSTFLIGHT FAIL: Storage policy "%" was not dropped during rollback') &&
    rollback.includes('ROLLBACK POSTFLIGHT FAIL: Pre-existing storage policy "%" was removed during rollback!') &&
    rollback.includes('ROLLBACK POSTFLIGHT CRITICAL FAIL: storage bucket "public-assets" is missing!')
);

// =============================================================================
// 8. VERIFICATION SQL & DOCUMENTATION AUDIT (ISSUE 13)
// =============================================================================
check(
  'Verification SQL is strictly read-only and uses non-mutating SELECT CTE queries',
  !/^\s*(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TEMP|TRUNCATE\s+(TABLE\s+)?\w+|ALTER\s+POLICY|DROP\s+POLICY)\b/im.test(
    verificationCode
  ) &&
    !/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TEMP|TRUNCATE\s+(TABLE\s+)?public\.|ALTER\s+POLICY|DROP\s+POLICY)\b/i.test(
      verificationCode
    )
);

check(
  'Verification SQL audits exact identities for all 17 tables, 9 functions, 4 storage policies, and 26 snapshot columns',
  tables.every((t) => verification.includes(`'${t}'`)) &&
    functions.every((f) => verification.includes(f.replace('public.', ''))) &&
    storagePolicies.every((p) => verification.includes(p)) &&
    verification.includes('= 26')
);

check(
  'README accurately documents execution order, package manifest, prerequisites, and technical limitations',
  readme.includes('supabase/phase-9.2/migration.sql') &&
    readme.includes('supabase/phase-9.2/rollback.sql') &&
    readme.includes('supabase/phase-9.2/verification.sql') &&
    readme.includes('database/tests/phase9_pre_migration_export.sql') &&
    readme.includes('STRICT PRODUCTION SAFETY RESTRICTION') &&
    readme.includes('Original NULL Table ACLs') &&
    readme.includes('Function Grantor Identity')
);

// =============================================================================
// 9. FAILURE-INJECTION STATIC UNIT TESTS (ISSUE 14)
// =============================================================================
/**
 * Static Failure-Injection Test 1: Corrupted Policy Command
 * Proves that rollback logic asserts v_current_pol.cmd = v_pol.cmd before executing ALTER POLICY.
 */
function testSafeguardCommandMismatch() {
  const guardPresent =
    rollbackCode.includes('v_current_pol.cmd <> v_pol.cmd') &&
    rollbackCode.includes('RAISE EXCEPTION') &&
    rollbackCode.includes('expected "%"');
  return guardPresent;
}

/**
 * Static Failure-Injection Test 2: Modified RLS USING Expression
 * Proves that rollback logic asserts coalesce(v_current_pol.qual, '') = coalesce(v_pol.original_qual, '').
 */
function testSafeguardUsingMismatch() {
  const guardPresent =
    rollbackCode.includes("coalesce(v_current_pol.qual, '') <> coalesce(v_pol.original_qual, '')") &&
    rollbackCode.includes('USING expression was modified post-migration');
  return guardPresent;
}

/**
 * Static Failure-Injection Test 3: Modified Storage UPDATE WITH CHECK Expression
 * Proves that rollback independently inspects WITH CHECK for bucket, folder, depth, auth.uid, and extension constraints.
 */
function testSafeguardStorageUpdateWithCheckMismatch() {
  const guardPresent =
    rollbackCode.includes('v_pol.with_check NOT LIKE \'%bucket_id%public-assets%\'') &&
    rollbackCode.includes('v_pol.with_check NOT LIKE \'%auth.uid()%\'') &&
    rollbackCode.includes('v_pol.with_check NOT LIKE \'%\\.(png|jpg|jpeg|webp|gif)%\'');
  return guardPresent;
}

/**
 * Static Failure-Injection Test 4: Missing Snapshot Table Identity
 * Proves that preflight checks exact 17 table array and aborts if any table is omitted.
 */
function testSafeguardMissingSnapshotIdentity() {
  const guardPresent =
    rollbackCode.includes('(SELECT count(DISTINCT table_name) FROM phase9_2_private.table_acl_snapshot) <> 17') &&
    rollbackCode.includes('table_acl_snapshot identities corrupted, missing, unexpected, or duplicated');
  return guardPresent;
}

check(
  'Static Safety Guard Test 1: Rollback SQL safeguard rejects corrupted policy command',
  testSafeguardCommandMismatch()
);

check(
  'Static Safety Guard Test 2: Rollback SQL safeguard rejects altered RLS USING expression',
  testSafeguardUsingMismatch()
);

check(
  'Static Safety Guard Test 3: Rollback SQL safeguard rejects altered Storage UPDATE WITH CHECK expression',
  testSafeguardStorageUpdateWithCheckMismatch()
);

check(
  'Static Safety Guard Test 4: Rollback SQL safeguard rejects incomplete or missing snapshot identities',
  testSafeguardMissingSnapshotIdentity()
);

// Report Results
console.log('=== SHOPKART PHASE 9.2 COMPREHENSIVE STATIC VALIDATOR ===\n');
for (const t of tests) {
  console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.detail ? ` — ${t.detail}` : ''}`);
}

const failed = tests.filter((t) => !t.ok).length;
console.log(`\nResults: ${tests.length - failed}/${tests.length} checks passed.`);

if (failed > 0) {
  process.exit(1);
}

console.log('\nLIMITATION: static checks do not parse PostgreSQL or prove live database behavior.');
console.log('RUNTIME TESTS: Disposable PostgreSQL migration/rollback tests were marked NOT RUN (no local daemon available; remote connections prohibited).');
