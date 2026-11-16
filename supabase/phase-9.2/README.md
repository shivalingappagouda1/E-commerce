# ShopKart — Phase 9.2: Security Hardening & Supabase Storage Setup

**Package Location:** `supabase/phase-9.2/`  
**Target Environment:** `ShopKart-Staging` (Supabase PostgreSQL)  
**Expected Project Reference:** `ulmwssozdmppvydppswx`  
**Role:** Senior Full-Stack Engineer & Supabase Security Specialist  

---

## 1. Package Contents

This directory contains the complete Phase 9.2 security-hardening and storage-provisioning deliverables for the ShopKart e-commerce platform:

### Primary Deliverables
1. [`migration.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/migration.sql): The primary idempotent migration script. Captures pre-migration snapshots, hardens table grants across all 17 public tables, locks down function permissions, standardizes customer and administrative RLS policies to `authenticated` via an explicit allowlist, and provisions the `public-assets` storage bucket with path-restricted avatar policies.
2. [`verification.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/verification.sql): Strictly read-only SQL diagnostic containing 12 checks that audit project identity, RLS status, table grants (all 7 privileges), function execution rights, triggers, storage bucket configuration, avatar policies, and snapshot schema/row completeness.
3. [`rollback.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql): Idempotent, snapshot-driven rollback script that restores pre-migration ACLs and policy roles, drops Phase 9.2 storage policies, and preserves the `public-assets` bucket and stored files without blanket `GRANT ALL`.
4. [`security-audit.md`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/security-audit.md): Exhaustive technical security audit documenting threat vectors, permission matrices, storage architecture, and residual risks.
5. [`README.md`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/README.md): Operational instructions, verification guides, rollback procedures, and manual staging checklists.

### Integration & Review Diagnostics (`review/`)
The [`review/`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/review) directory contains supplementary read-only diagnostic tools from the Phase 9.2 Integration Correction Kit:
- [`review/snapshot_compatibility_check.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/review/snapshot_compatibility_check.sql): Standalone read-only query inspecting the presence of all 26 required snapshot columns across `phase9_2_private` tables and row count completeness.
- [`review/verification.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/review/verification.sql): Standalone read-only matrix verifying effective table privileges and function execution.
- [`review/README.md`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/review/README.md): Kit background documentation on schema contract alignment.
- [`review/ANTI_GRAVITY_INTEGRATION_PROMPT.txt`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/review/ANTI_GRAVITY_INTEGRATION_PROMPT.txt): Architectural guidelines and integration requirements.

### Static Validation Test Suites
The package is validated by two automated Node.js test scripts located in the project root:
- [`test_phase9_validation.mjs`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/test_phase9_validation.mjs): Static test suite verifying Phase 9.2 transaction boundaries, allowlist structure, table privilege matrix, function restrictions, storage policies, and deliberate corruption rejection.
- [`test_phase9_2_validation.mjs`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/test_phase9_2_validation.mjs): Comprehensive 45-point static test suite auditing all 26 snapshot columns, RLS allowlists, and rollback invariants.

### External Prerequisites (Non-Package Dependencies)
- `database/tests/phase9_pre_migration_export.sql`: An external diagnostic export script that captures raw PostgreSQL catalog metadata (`pg_policies`, `relrowsecurity`, `storage.buckets`, `pg_proc`, `pg_trigger`) prior to migration.
  - **How it is generated:** Open `database/tests/phase9_pre_migration_export.sql` in the Supabase Dashboard SQL Editor, click **Run**, and export the tabular output as CSV/Text.
  - **Where it must be saved:** Save the output to `database/tests/pre_migration_export_<timestamp>.txt` (or a secure external audit repository) before executing any DDL.

> [!CAUTION]
> **STRICT PRODUCTION SAFETY RESTRICTION**  
> None of the SQL scripts in this package or repository may be executed against the **production** Supabase environment without explicit written authorization and change-window sign-off. All initial testing and staging validation must occur exclusively on the `ShopKart-Staging` project (`ulmwssozdmppvydppswx`) or a disposable local PostgreSQL container.

---

## 2. Mandatory Execution Order

Follow this exact sequence for evaluation, deployment, and testing:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PHASE 9.2 MANDATORY EXECUTION ORDER                  │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Pre-Migration Export (database/tests/phase9_pre_migration_export)  │
│                                ▼                                       │
│ 2. Package Review (Inspect migration.sql, rollback.sql, security audit)│
│                                ▼                                       │
│ 3. Local Static Validation (node test_phase9_validation.mjs)           │
│                                ▼                                       │
│ 4. Staging Migration Execution (supabase/phase-9.2/migration.sql)      │
│                                ▼                                       │
│ 5. Verification Execution (supabase/phase-9.2/verification.sql)        │
│                                ▼                                       │
│ 6. Staging Smoke Testing (Manual browser and API tests)                │
│                                ▼                                       │
│ 7. Rollback Validation (Test rollback.sql on disposable branch/clone)  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Before Migration Checklist

Before running any SQL script on the target environment, verify the following prerequisites:

- [ ] **Confirm Supabase Project Reference:** Confirm that the active project URL in your Supabase dashboard corresponds to `ulmwssozdmppvydppswx` (`ShopKart-Staging`). (Database cluster name `postgres` cannot verify this; manual URL confirmation is required).
- [ ] **Pre-Migration Export Run:** Execute `database/tests/phase9_pre_migration_export.sql` in the SQL editor and save the output.
- [ ] **Database Backup:** Confirm that a point-in-time recovery (PITR) backup or a manual SQL export exists before applying changes.
- [ ] **Review Migration SQL:** Inspect `migration.sql` to verify table grants, function revocations, explicit allowlist, and storage policies.
- [ ] **Review Rollback SQL:** Inspect `rollback.sql` to understand the recovery procedure and snapshot dependencies.
- [ ] **Confirm Storage Implementation:** Confirm that the client application uploads profile avatars using `avatars/${userId}.${ext}` in `src/services/authService.js`.
- [ ] **Baseline Status:** Confirm that Phase 9.1 was applied and that all 17 public tables have Row Level Security enabled.

---

## 3. Execution Sequence (Staging Deployment)

Follow this exact manual execution sequence in the **Supabase Dashboard SQL Editor**:

```
┌────────────────────────────────────────────────────────┐
│               PHASE 9.2 STAGING RUNBOOK                │
├────────────────────────────────────────────────────────┤
│ 1. Confirm dashboard URL matches ulmwssozdmppvydppswx  │
│                          ▼                             │
│ 2. Confirm database backup / export exists             │
│                          ▼                             │
│ 3. Review & approve migration package                  │
│                          ▼                             │
│ 4. Execute database/tests/phase9_pre_migration_export  │
│                          ▼                             │
│ 5. Execute supabase/phase-9.2/migration.sql            │
│                          ▼                             │
│ 6. Execute supabase/phase-9.2/verification.sql         │
│                          ▼                             │
│ 7. Review results (Checks 2-11 PASS; 1 & 12 MANUAL)    │
│                          ▼                             │
│ 8. Perform application staging smoke tests             │
│                          ▼                             │
│ 9. Stage Approval / Production Readiness Decision      │
└────────────────────────────────────────────────────────┘
```

1. Open [`supabase/phase-9.2/migration.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/migration.sql) in the Supabase SQL Editor and click **Run**.
   - *Expected Result:* `Success. No rows returned.` (with informational `NOTICE` statements confirming snapshot capture, grant hardening, allowlist policy updates, and storage setup).
2. Open [`supabase/phase-9.2/verification.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/verification.sql) in the SQL Editor and click **Run**.
   - *Expected Result:*
     - Check 1 reports `NEEDS MANUAL REVIEW` (prompting operator confirmation of active dashboard URL).
     - Automated checks (Check 2 to Check 11) report `PASS`.
     - Check 12 reports `NEEDS MANUAL REVIEW` (verifying frontend runtime behavior).
3. Do not consider Phase 9.2 approved if any automated check reports `FAIL`.

---

## 4. Rollback Instructions & Technical Limitations

### When Rollback Should Be Considered
- An essential application workflow (such as checkout, cart sync, or product browsing) encounters unexpected database permission errors.
- A critical automated check in `verification.sql` reports `FAIL` and cannot be resolved through manual staging configuration.

### Important Warnings & Technical Limitations
> [!WARNING]
> **POSTGRESQL ACL RESTORATION CONSTRAINTS & LIMITATIONS**  
> In PostgreSQL, ACL arrays (`relacl`, `proacl`) cannot be restored via direct assignment. Rollback reconstructs individual privileges using supported SQL statements (`GRANT`/`REVOKE`) derived from decompiled `aclexplode()` snapshots in `phase9_2_private`.  
> - **Original NULL Table ACLs (`relacl IS NULL`):** In PostgreSQL, when a table is created, its `relacl` catalog column is `NULL` (meaning default owner-only privileges apply). Standard SQL DDL statements cannot reset `pg_class.relacl` back to a physical SQL `NULL` pointer without direct catalog surgery. Rollback revokes all Phase 9.2 grants from `PUBLIC`, `anon`, and `authenticated`, returning the table to semantic default owner-only access. It deliberately avoids injecting artificial `GRANT ALL TO owner` statements.
> - **Function Grantor Identity:** Reconstructed `GRANT` statements are executed under the current session user (`current_user`, e.g. `postgres`). While snapshot metadata captures `grantor_oid`, PostgreSQL assigns the executing role as grantor. Exact grantor catalog OID matching cannot be guaranteed.
> - **Storage Policy Definition Matching:** Rollback verifies the complete identity (schema, table, policyname, cmd, permissive mode, roles, `USING`, `WITH CHECK`, and description marker) before dropping any storage policy. Any post-migration modifications will cause rollback to abort safely to prevent accidental policy deletion.
> - **Dropped Roles:** If any grantee role recorded in the snapshot was deleted from `pg_roles` between migration and rollback, automatic rollback detects this condition during preflight and **aborts immediately** to avoid catalog corruption.  
> - **Weaker Security Restoration:** Rolling back restores the pre-Phase-9.2 security configuration from snapshots, which may reintroduce broad anonymous or public permissions. Rollback is strictly an emergency availability restoration tool.

### Manual Recovery Procedure (If Automatic Rollback Aborts)
If `rollback.sql` aborts due to a missing role or modified state:
1. Review the exception detail to identify the affected table, function, or grantee OID.
2. If a database role was deleted, recreate the role in PostgreSQL or reassign grants manually.
3. Consult `database/tests/phase9_pre_migration_export.sql` or your pre-migration PITR backup to restore the original catalog state.

### Data Preservation Invariants
- `rollback.sql` **never** drops the `public-assets` bucket.
- `rollback.sql` **never** deletes storage objects or avatar files.
- It drops ONLY storage policies created by Phase 9.2 (`creation_status = 'CREATED'` and tagged with `SHOPKART_PHASE9_2_CREATED_V1`).

---

## 5. Manual Staging Test Checklist

> [!NOTE]
> **SQL verification alone does not prove frontend behavior.** Runtime testing in the browser is required to validate complete user workflows.

Perform these manual tests in the web application running against `ShopKart-Staging`:

### Public Storefront Access
- [ ] **Anonymous Catalog Browsing:** Browse home page, product listing, product details, categories, active banners, and view approved reviews without signing in.
- [ ] **Coupon Code Redemption:** Enter promo code `SHOPKART10` in checkout or cart preview; verify the discount calculates correctly.

### Customer Data Isolation
- [ ] **Private Data Protection:** Verify that an unauthenticated client cannot fetch customer profile data, saved addresses, or order histories via API calls.
- [ ] **Customer Profile:** Log in as a customer; verify profile details and saved delivery addresses load correctly.
- [ ] **Cart Synchronization:** Add and update items in the cart; verify `sync_user_cart` executes and updates cart items atomically.
- [ ] **Order Placement:** Complete checkout; verify `place_order` creates the order and decrements inventory.
- [ ] **Order Cancellation:** Cancel a pending order; verify `cancel_order` executes and `trg_restore_inventory_on_cancel` restores stock.

### Storage & Avatar Management
- [ ] **Avatar Upload:** Navigate to `/profile`, upload a `.jpg` or `.png` avatar image, and verify it renders immediately.
- [ ] **Avatar Replacement:** Upload a new avatar image; verify the previous image is replaced via `upsert`.
- [ ] **Avatar Public Display:** Copy the avatar image URL and open it in an incognito window; verify the avatar renders publicly via the CDN.
- [ ] **Cross-User Protection:** Attempt an API upload with another user's UUID in the path; verify Supabase Storage returns an RLS permission error.
- [ ] **File Type Enforcement & Extension Limits:** Attempt to upload a `.svg`, `.html`, or `.exe` file as an avatar; verify the upload is rejected by the filename regex rule. *(Note: Extension regex allowlisting enforces file naming and path structure, but does not perform server-side binary magic-number MIME sniffing; Phase 10 will add edge function content verification).*

### Administrative Management
- [ ] **Admin Dashboard:** Log in as an administrator; verify product, category, banner, review, and customer management flows function without errors.
