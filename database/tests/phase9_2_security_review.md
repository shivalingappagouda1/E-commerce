# ShopKart Phase 9.2 — Security Review & Technical Architecture
## Storage Security + Admin Function Permission Hardening

**Review Timestamp:** 2026-11-09  
**Status:** **Phase 9.2 Best-Option Package Integrated & Staging-Ready**  
**Target Environment:** `ShopKart-Staging` (Supabase PostgreSQL)  
**Security Scope:** Storage bucket provisioning, storage object RLS policies, and `public.is_admin()` execution permissions.

---

## 1. Scope of Phase 9.2

Phase 9.2 delivers targeted security hardening for the two operational deficiencies identified during the Phase 9.1 audit:
1. **Storage Bucket & Object Isolation:** Provisions the `public-assets` bucket and enforces path-restricted Row Level Security policies on `storage.objects` for user avatar uploads (`avatars/<userId>.<approved-image-extension>`), strictly preventing cross-user tampering, path traversal, or non-image uploads.
2. **Admin Function Permission Lockdown:** Revokes `EXECUTE` privilege on `public.is_admin()` from `PUBLIC` and `anon`, preserving execution access solely for the `authenticated` role and the function owner, with verifiable pre-migration ACL snapshot capture.

> [!NOTE]
> This phase does **NOT** implement Razorpay or any payment gateway integration. Payment gateway integration remains an isolated architectural task scheduled for Phase 10.

---

## 2. Files Inspected & Comparative Review

The following files and revisions were evaluated:
- **ChatGPT Revised Package:** `ShopKart_Phase_9_2_Corrected_SQL_Package.zip`
  - `phase9_2_storage_hardening.sql`
  - `phase9_2_function_security_hardening.sql`
  - `phase9_2_storage_rollback.sql`
  - `phase9_2_function_rollback.sql`
  - `phase9_2_security_verification.sql`
  - `README_PHASE9_2_REVIEW_FIRST.txt`
- **Existing Baseline Files:**
  - `src/services/authService.js` (avatar upload implementation)
  - `src/context/AuthContext.jsx` (authentication bootstrap & admin check)
  - `test_phase9_2_validation.mjs` (22 static assertions)

---

## 3. Comparative Architecture & Best-Option Decisions

| Component | ChatGPT Approach | Previous Approach | Chosen Best Option & Rationale |
|---|---|---|---|
| **Storage Filename Regex** | POSIX regex `~ ('^' \|\| auth.uid()::text \|\| '\.(png\|jpg\|jpeg\|webp\|gif)$')` | Standard SQL `LIKE (auth.uid()::text \|\| '.%')` | **ChatGPT Option Adopted:** Restricts uploads strictly to approved image extensions (`png`, `jpg`, `jpeg`, `webp`, `gif`), blocking malicious uploads like `.svg` (stored XSS vector), `.html`, or executables. |
| **Storage Conflict Preflight** | Aborts if ANY other permissive policy exists on `storage.objects` | Targeted `public-assets` and untargeted policies | **ChatGPT Option Adopted:** Conservatively warns the project owner that permissive policies in PostgreSQL combine with `OR`, ensuring unvetted broad storage policies are reviewed before deployment. |
| **Storage Policy Tagging** | Tagged with `'SHOPKART_PHASE9_2_CREATED_V1'` in `pg_description` | Tagged with `'PHASE9_2_CREATED'` in `pg_description` | **ChatGPT Option Adopted:** Versioned marker is clean, explicit, and tracked across migration and rollback. |
| **Storage Rollback Integrity** | Verifies policy definition still contains `public-assets` and `auth.uid()` before dropping | Checked tag only | **ChatGPT Option Adopted:** Protects against dropping policies that were subsequently modified by an administrator. Zero bucket deletions. |
| **Function ACL Snapshot** | Dedicated private table `phase9_2_private.function_acl_snapshot` with `aclexplode()` JSONB | Stored structured snapshot string in `COMMENT ON FUNCTION` | **Integrated Dual-Snapshot Option:** Records the immutable JSONB audit trail in `phase9_2_private.function_acl_snapshot` **AND** records the structured snapshot comment on the function. Provides maximum resilience without single points of failure. |
| **Function Rollback Authority** | Strict `current_user <> s.owner_name` equality check | Permission grant check | **Enhanced Guard Adopted:** Allows `current_user = s.owner_name OR pg_has_role(current_user, s.owner_oid, 'USAGE') OR current_user IN ('postgres', 'supabase_admin')`. Prevents project owners from being locked out in the Supabase SQL Editor if the function was originally created by a system admin role. |

---

## 4. Storage Bucket Configuration

- **Bucket ID:** `public-assets`
- **Bucket Name:** `public-assets`
- **Public Visibility:** `public = true`
- **Creation Logic:** Conditionally created with `INSERT INTO storage.buckets (id, name, public) VALUES ('public-assets', 'public-assets', true)` only if missing.
- **Safety Guarantee:** If `public-assets` already exists with `public = true`, it is left untouched. If it exists with conflicting settings (`public = false`), the preflight block aborts the transaction. Unrelated buckets are never modified.
- **Finding Status:** **PASS** (Statically verified).

---

## 5. Storage Avatar Policy Design

Four uniquely named policies are enforced on `storage.objects` targeting the `authenticated` role:

| Policy Name | Operation | Clause | Enforcement Predicate |
|---|:---:|:---:|---|
| `Users can view own avatar in public-assets` | `SELECT` | `USING` | `bucket_id='public-assets' AND (storage.foldername(name))[1]='avatars' AND array_length(storage.foldername(name),1)=1 AND storage.filename(name) ~ ('^' \|\| auth.uid()::text \|\| '\.(png\|jpg\|jpeg\|webp\|gif)$')` |
| `Users can upload own avatar to public-assets` | `INSERT` | `WITH CHECK` | `bucket_id='public-assets' AND (storage.foldername(name))[1]='avatars' AND array_length(storage.foldername(name),1)=1 AND storage.filename(name) ~ ('^' \|\| auth.uid()::text \|\| '\.(png\|jpg\|jpeg\|webp\|gif)$')` |
| `Users can update own avatar in public-assets` | `UPDATE` | `USING` & `WITH CHECK` | `bucket_id='public-assets' AND (storage.foldername(name))[1]='avatars' AND array_length(storage.foldername(name),1)=1 AND storage.filename(name) ~ ('^' \|\| auth.uid()::text \|\| '\.(png\|jpg\|jpeg\|webp\|gif)$')` |
| `Users can delete own avatar from public-assets` | `DELETE` | `USING` | `bucket_id='public-assets' AND (storage.foldername(name))[1]='avatars' AND array_length(storage.foldername(name),1)=1 AND storage.filename(name) ~ ('^' \|\| auth.uid()::text \|\| '\.(png\|jpg\|jpeg\|webp\|gif)$')` |

### Key Policy Invariants:
1. **Safe Policy Creation:** Checks `pg_policies` before creating; preserves if matching; aborts if an unmarked same-name policy pre-exists.
2. **Image Extension Restriction:** Strictly allows only `.png`, `.jpg`, `.jpeg`, `.webp`, and `.gif`.
3. **Folder Depth Enforcement:** `array_length(storage.foldername(name), 1) = 1` prevents nested subdirectories like `avatars/extra/<uid>.png`.
4. **Move/Rename Prevention:** For `UPDATE`, both `USING` and `WITH CHECK` enforce identical ownership predicates.
5. **Policy Ownership Tracking:** Policies are tagged with `COMMENT ON POLICY ... IS 'SHOPKART_PHASE9_2_CREATED_V1'`.
- **Finding Status:** **PASS** (Statically verified).

---

## 6. Public Bucket Visibility Implications

The `public-assets` bucket is configured with `public = true`.

> [!IMPORTANT]
> **PUBLIC CDN DOWNLOAD ARCHITECTURE**  
> In Supabase Storage, objects stored in a bucket configured with `public = true` are served directly via the public CDN endpoint (`/storage/v1/object/public/public-assets/avatars/...`) without evaluating Row Level Security on `storage.objects`.  
> All avatar files placed in `public-assets` are intentionally downloadable by anyone who possesses the public URL.  
> The four storage RLS policies govern **API-level mutations and operations** (`INSERT`, `UPDATE`, `DELETE`, and PostgREST authenticated `SELECT`). Private customer data (invoices, addresses, identity proofs) must **never** be placed in `public-assets`.

- **Finding Status:** **PASS** (Documented and architecturally intended for public avatar display).

---

## 7. Function Permission Hardening

- **Target Identity:** Exact zero-argument function identity `to_regprocedure('public.is_admin()')`.
- **Preflight Checks:** Validates existence, `prosecdef = true`, source baseline (`auth.uid()` and `'admin'`), verifies no ungrantable ACL grant options exist, and records an immutable snapshot table in `phase9_2_private.function_acl_snapshot` and in the function catalog comment.
- **Permission Statements:**
  ```sql
  REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
  ```
- **Postflight Checks:** Verifies `has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') = false` and `has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE') = true`. Confirms function definition, owner, and search path were not altered.
- **Finding Status:** **PASS** (Statically verified).

---

## 8. Frontend Compatibility Analysis

- **`src/services/authService.js`:**
  - Uses `supabase.storage.from('public-assets').upload(\`avatars/${userId}.${ext}\`, ...)`.
  - Allowed extensions (`png`, `jpg`, `jpeg`, `webp`, `gif`) match typical image uploads.
- **`src/context/AuthContext.jsx`:**
  - Queries `profiles.role` directly for authenticated user sessions.
  - Contains **zero** anonymous RPC calls to `is_admin()`.
  - Anonymous visitors browse catalog products without evaluating `is_admin()`.
- **Finding Status:** **PASS** (Compatibility confirmed).

---

## 9. Rollback Safety

1. **Storage Rollback (`database/migrations/phase9_2_storage_rollback.sql`):**
   - **Zero bucket deletions** (`DELETE FROM storage.buckets` is absent).
   - Drops ONLY policies on `storage.objects` tagged with `'SHOPKART_PHASE9_2_CREATED_V1'` whose predicates still match expected ownership fragments.
   - Preserves pre-existing storage policies and all stored files.
2. **Function Rollback (`database/migrations/phase9_2_function_rollback.sql`):**
   - Inspects `phase9_2_private.function_acl_snapshot` (with fallback to catalog comment snapshot).
   - Aborts safely if the snapshot is missing, modified, or contains unsupported grantors.
   - Restores original permissions based on verified baseline (`GRANT EXECUTE ... TO PUBLIC` if original `proacl` was NULL).
   - Restores original function catalog comment.
- **Finding Status:** **PASS** (Guarded against accidental data loss and lock-outs).

---

## 10. Verification Procedure

Run [`database/tests/phase9_2_security_verification.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/tests/phase9_2_security_verification.sql) in the Supabase SQL Editor:
- **Section A:** Bucket `public-assets` exists and `public = true`.
- **Section B:** 4 policies exist on `storage.objects` with correct operations, authenticated roles, depth=1 folder checks, and filename ownership predicates.
- **Section C:** Zero conflicting permissive policies on `storage.objects`.
- **Section D:** `is_admin()` execution revoked from `anon` and `PUBLIC`, retained for `authenticated`, and pre-migration snapshot verified.
- **Section E:** Application compatibility documented as `NEEDS MANUAL REVIEW` / `NOT VERIFIABLE BY SQL`.

---

## 11. Remaining Risks

- **Pre-existing Storage Objects:** If non-avatar objects or objects with unsupported file extensions already exist in `public-assets`, authenticated users will not be able to select or modify them through PostgREST (though public CDN downloads remain accessible).
- **Manual Execution Requirement:** Security improvements do not take effect until the SQL files are executed in the Supabase SQL Editor on `ShopKart-Staging`.
- **Finding Status:** **NEEDS MANUAL REVIEW** (Requires project owner execution on staging).

---

## 12. Explicit Deployment Prerequisites

Before running Phase 9.2 SQL on `ShopKart-Staging`:
1. Confirm Supabase project reference is `ulmwssozdmppvydppswx` (Staging).
2. Confirm Phase 9.1 migration was applied successfully.
3. Run `database/tests/phase9_2_security_verification.sql` before migration to confirm pre-migration baseline.

---

## 13. What Has Not Been Tested

- **Live Supabase Execution:** Per strict safety constraints, zero SQL statements were executed against live Supabase instances during this task.
- **Storage Binary Uploads:** Real network multipart uploads to Supabase Storage were not performed.
- **Finding Status:** **NOT TESTED** (Requires live staging validation by project owner).
