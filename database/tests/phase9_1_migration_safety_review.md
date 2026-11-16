# ShopKart Phase 9.1 — Migration Safety Review & Hardening Audit Report

**Status:** REVISED & STAGING-READY. Validated against actual `ShopKart-Staging` database observations. Ready for controlled staging execution. Strictly NOT approved for blind production execution.

---

## 1. Executive Summary & Deliverables Inventory

The Phase 9.1 security hardening package has undergone a comprehensive technical audit and correction. The objective of Phase 9.1 is to narrow the role target of the existing eight catalog administrator policies from `public` to `authenticated` while preserving existing predicates, customer policies, Storage buckets, functions, triggers, and table data.

### Final Deliverables (Exact File Paths)

1. **`database/migrations/phase9_security_hardening_corrected.sql`**
   The guarded migration script. Performs in-place `ALTER POLICY ... TO authenticated` on exactly eight catalog administrator policies inside a single transactional block with strict preflight and postflight assertions.
2. **`database/tests/phase9_security_verification.sql`**
   Read-only post-migration verification script. Returns structured `PASS`, `FAIL`, or `NEEDS MANUAL REVIEW` statuses across catalog policies, table RLS states, customer policies, storage policies, function security, and triggers.
3. **`database/tests/phase9_pre_migration_export.sql`**
   Read-only pre-migration inventory script. Contains six distinct diagnostic queries capturing policies, table RLS/FORCE RLS states, storage buckets, function definitions/privileges, trigger definitions, and `is_admin()` execution grants.
4. **`database/migrations/phase9_rollback.sql`**
   Guarded rollback migration script. Reverts the eight catalog policies back to `public` using `ALTER POLICY ... TO public` with preflight and postflight assertions.
5. **`test_phase9_validation.mjs`**
   Offline static validation script at the repository root. Enforces 18 architectural, syntactic, and security safety assertions across all SQL and markdown deliverables.
6. **`database/tests/phase9_1_migration_safety_review.md`** (mirrored at `reports/phase9_1_migration_safety_review.md`)
   This comprehensive safety review and audit report.

---

## 2. Actual Staging Baseline Analysis

The audit examined real database inspection exports from the `ShopKart-Staging` Supabase environment:

- **Total RLS Policy Inventory:** 43 policies exist across all schemas.
- **Admin-Related Policies:** 19 admin-related policies exist in the database.
- **Catalog Administrator Policies (Target Set):** Exactly eight policies protect the catalog tables. All eight currently target the implicit pseudo-role `public`:
  1. `public.categories` — `"Admins full access to categories"` (`cmd = ALL`, `permissive = PERMISSIVE`, `roles = {public}`, `using = is_admin()`, `with_check = is_admin()`)
  2. `public.products` — `"Admins full access to products"` (`cmd = ALL`, `permissive = PERMISSIVE`, `roles = {public}`, `using = is_admin()`, `with_check = is_admin()`)
  3. `public.product_images` — `"Admins full access to product images"` (`cmd = ALL`, `permissive = PERMISSIVE`, `roles = {public}`, `using = is_admin()`, `with_check = is_admin()`)
  4. `public.product_variants` — `"Admins full access to product variants"` (`cmd = ALL`, `permissive = PERMISSIVE`, `roles = {public}`, `using = is_admin()`, `with_check = is_admin()`)
  5. `public.inventory` — `"Admins full access to inventory"` (`cmd = ALL`, `permissive = PERMISSIVE`, `roles = {public}`, `using = is_admin()`, `with_check = is_admin()`)
  6. `public.coupons` — `"Admins full access to coupons"` (`cmd = ALL`, `permissive = PERMISSIVE`, `roles = {public}`, `using = is_admin()`, `with_check = is_admin()`)
  7. `public.banners` — `"Admins full access to banners"` (`cmd = ALL`, `permissive = PERMISSIVE`, `roles = {public}`, `using = is_admin()`, `with_check = is_admin()`)
  8. `public.reviews` — `"Admins full access to reviews"` (`cmd = ALL`, `permissive = PERMISSIVE`, `roles = {public}`, `using = is_admin()`, `with_check = is_admin()`)
- **Storage Buckets:** `storage.buckets` returned 0 rows in staging. Generic Storage policies remain untouched.
- **Function Privileges:** `public.is_admin()` is owned by `postgres`, has `rolbypassrls = true`, `prosecdef = true`, and both `anon` and `authenticated` roles currently have EXECUTE privilege (`anon_can_execute = true`, `authenticated_can_execute = true`).

---

## 3. PostgreSQL `PUBLIC` Pseudo-Role Defect & Resolution

### The Defect
Previous iterations of the migration preflight block contained the following guard:
```sql
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
   OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='public') THEN
  RAISE EXCEPTION 'PHASE9 ABORT: expected Supabase roles are missing';
END IF;
```
In PostgreSQL, **`PUBLIC` is not a physical role in `pg_roles` (or `pg_authid`)**. It is an implicit keyword and pseudo-group representing all roles. Therefore:
```sql
SELECT 1 FROM pg_roles WHERE rolname = 'public';
```
**unconditionally evaluates to `FALSE`** on any PostgreSQL database. Running this check caused the preflight block to abort immediately, halting the migration on healthy Supabase environments.

### The Resolution
1. **Catalog Role Check:** The preflight check was corrected to verify only explicit roles that exist in `pg_roles`:
   ```sql
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
     RAISE EXCEPTION 'PHASE9 ABORT: expected Supabase role authenticated is missing';
   END IF;
   ```
2. **Policy Role Verification:** When policies are assigned `TO public`, PostgreSQL stores `{'public'}` in the `pg_policy.polroles` decompiled column (`pg_policies.roles`). The preflight correctly verifies:
   ```sql
   v_policy.roles::text[] = ARRAY['public']::text[]
   ```
   This accurately validates that the existing policies are indeed assigned to `public` without querying `pg_roles`.
3. **Validator Enforcement:** `test_phase9_validation.mjs` contains a dedicated test asserting that `rolname = 'public'` is never queried against `pg_roles` while `rolname = 'authenticated'` is verified.

---

## 4. Policy In-Place Alteration Model

### Why `ALTER POLICY` is Mandatory
Previous draft migrations attempted to `DROP POLICY` and `CREATE POLICY`. This approach was rejected for critical safety reasons:
- **Security Gaps:** Dropping a policy temporarily opens a security hole or leaves the table without administrative write capabilities while the migration executes.
- **Race Conditions:** Any concurrent API request between `DROP` and `CREATE` experiences authorization failures.
- **Object ID Churn:** Dropping policies destroys catalog OIDs, invalidating dependent cached query plans.
- **Risk of Accidental Alteration:** Recreating policies from scratch introduces risks of subtle syntax differences in `USING` and `WITH CHECK` clauses.

### Implemented Alteration
Phase 9.1 uses atomic in-place role alteration:
```sql
ALTER POLICY "Admins full access to categories" ON public.categories TO authenticated;
ALTER POLICY "Admins full access to products" ON public.products TO authenticated;
ALTER POLICY "Admins full access to product images" ON public.product_images TO authenticated;
ALTER POLICY "Admins full access to product variants" ON public.product_variants TO authenticated;
ALTER POLICY "Admins full access to inventory" ON public.inventory TO authenticated;
ALTER POLICY "Admins full access to coupons" ON public.coupons TO authenticated;
ALTER POLICY "Admins full access to banners" ON public.banners TO authenticated;
ALTER POLICY "Admins full access to reviews" ON public.reviews TO authenticated;
```
This changes solely the role list (`polroles`) from `public` to `authenticated`. The policy names, permissive mode (`PERMISSIVE`), command (`ALL`), `USING` predicate (`is_admin()`), and `WITH CHECK` predicate (`is_admin()`) remain 100% untouched.

---

## 5. Function Security Risk Analysis (`is_admin()`)

### Findings from Staging Baseline
The staging diagnostic reveals:
```text
is_admin() owner=postgres super=true bypassrls=true secdef=true config={search_path=public,pg_temp} anon_exec=true auth_exec=true
```
- **SECURITY DEFINER:** The function runs with the privileges of its owner (`postgres`).
- **BYPASSRLS:** The owner role has `BYPASSRLS`, meaning internal queries inside `is_admin()` bypass RLS.
- **Search Path Hardened:** `proconfig` contains `{search_path=public,pg_temp}`, preventing search path hijacking.
- **Anon Execution Allowed:** `has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')` is `true`. In PostgreSQL and Supabase, newly created functions in public schemas default to granting `EXECUTE` to `PUBLIC` unless explicitly revoked.

### Threat Evaluation & Mitigation
- **Direct RPC Threat:** An unauthenticated visitor can execute `SELECT is_admin()`. However, `is_admin()` checks `auth.uid()` / user session JWT. For unauthenticated (`anon`) users, `auth.uid()` is `NULL`. Consequently, `is_admin()` safely returns `FALSE`.
- **RLS Evaluation Bypass Defense:** When policies are set `TO public`, PostgreSQL must execute `is_admin()` for every row evaluated during anonymous queries. By altering the policies `TO authenticated`, **PostgreSQL short-circuits evaluation at the role layer**. Anonymous requests are immediately denied by RLS before `is_admin()` is ever invoked.
- **Scope Boundary:** Phase 9.1 deliberately does **NOT** execute `REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;`. Revoking execution on a core function during a policy migration could disrupt edge functions, login hooks, or client auth listeners that rely on checking admin status during initialization. Function-level privilege hardening is deferred to Phase 9.2.

---

## 6. Trigger & Storage Architecture Preservation

1. **Trigger Architecture Preserved:**
   - `on_auth_user_created` on `auth.users` -> calls `public.create_profile_on_signup()`.
   - `prevent_role_escalation` on `public.profiles` -> calls `public.prevent_role_self_escalation()`.
   - `trg_cancel_order_restore_inv` on `public.orders` -> calls `public.restore_inventory_on_cancellation()`.
   - None of these triggers are modified, replaced, or disabled by Phase 9.1.
2. **Storage Architecture Preserved:**
   - Staging export confirms `storage.buckets` has 0 configured buckets.
   - No generic `storage.objects` policies are dropped or altered. Storage policy restructuring is deferred until storage buckets are formally deployed.

---

## 7. Verification & Rollback Procedures

### Post-Migration Verification (`phase9_security_verification.sql`)
The verification script is completely read-only. It executes diagnostic CTEs categorizing results:
- **`CATALOG-*` (8 tests):** Validates that all eight policies exist, are `PERMISSIVE`, `ALL`, target `authenticated`, and retain `is_admin()` in `USING` and `WITH CHECK`. Expected status: **PASS**.
- **`RLS-*` (8 tests):** Validates that `relrowsecurity` is `true` and `relforcerowsecurity` is `false` on all eight tables. Expected status: **PASS**.
- **`CUSTOMER-POLICIES`:** Lists all customer policies on profiles, carts, orders, etc. Status: **NEEDS MANUAL REVIEW**.
- **`STORAGE-POLICIES`:** Lists storage policies. Status: **NEEDS MANUAL REVIEW**.
- **`FUNCTIONS`:** Reports function owners, ACLs, and execution privileges. Status: **NEEDS MANUAL REVIEW**.
- **`TRIGGERS`:** Reports trigger definitions via `pg_get_triggerdef`. Status: **NEEDS MANUAL REVIEW**.

> [!IMPORTANT]
> A status of `NEEDS MANUAL REVIEW` is informational and does not indicate a migration failure. Only `FAIL` indicates a failure.

### Rollback Procedure (`phase9_rollback.sql`)
The rollback script is fully transactional (`BEGIN; ... COMMIT;`):
1. **Preflight Guard:** Confirms that all eight policies exist and target `authenticated`. If any policy has been altered or dropped, it aborts.
2. **Alteration:** Executes `ALTER POLICY "Admins full access to <table_name>" ON public.<table_name> TO public;` across all eight tables.
3. **Postflight Guard:** Verifies that all eight policies are back to targeting `public`.

---

## 8. Staging Execution Protocol

Follow these exact steps when executing on `ShopKart-Staging`:

```bash
# Step 1: Run offline static checks locally
node --check test_phase9_validation.mjs
node test_phase9_validation.mjs .
```

1. **Verify Connection:** Open the Supabase SQL Editor. Confirm the active project is `ShopKart-Staging`. (Verify the reference ID matches the staging project).
2. **Run Pre-Migration Export:** Execute `database/tests/phase9_pre_migration_export.sql`. Save all six result tabs/CSV exports for audit records.
3. **Confirm Baseline:** Verify that query 1 shows all eight target policies targeting `public`.
4. **Execute Migration:** Execute `database/migrations/phase9_security_hardening_corrected.sql`. Confirm output:
   ```text
   NOTICE: Phase 9.1 complete: eight existing catalog admin policies now target authenticated. Predicates and unrelated policies were preserved.
   ```
5. **Run Verification:** Execute `database/tests/phase9_security_verification.sql`.
   - Verify that all 16 `CATALOG-*` and `RLS-*` rows display `PASS`.
   - Verify that no row displays `FAIL`.
6. **Rollback (Only if required):** If unexpected regressions occur, execute `database/migrations/phase9_rollback.sql` and re-run verification.

---

## 9. Limitations & Offline Boundary Notice

- **No Live DB Execution:** No SQL was executed during this audit and revision. No connection to live Supabase or PostgreSQL instances was initiated.
- **Static vs. Engine Verification:** The Node.js validator (`test_phase9_validation.mjs`) evaluates AST-like lexical structures and regex patterns. Final execution behavior is guaranteed by PostgreSQL's transaction rollback on preflight/postflight exception.
- **Staging Isolation:** This package is validated specifically for `ShopKart-Staging`. Execution in production is strictly prohibited until staging testing is signed off.
