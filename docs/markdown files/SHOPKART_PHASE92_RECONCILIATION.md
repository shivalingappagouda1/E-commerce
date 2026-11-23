# ShopKart — Phase 9.2 Package Reconciliation & Security Verification Report

**Date:** 11 November 2026  
**Auditor:** Senior Supabase Security Engineer & PostgreSQL Architect  
**Package Inspected:** `supabase/phase-9.2/`  
**Target Environment:** `ShopKart-Staging` (`ulmwssozdmppvydppswx`)  
**Status:** Audit & Version Reconciliation Complete (Remote Execution Prohibited)

---

## 1. Executive Summary: Handover vs. Actual Repository Reconciled

The Project Handover Report issued a critical security warning:
> *"The latest reviewed Storage rollback SQL contains unsafe expression normalization that can remove parentheses and discard parts of policy expressions. Do not execute Phase 9.2 migration or rollback against remote Supabase."*

### Reconciled Verification Finding:
Upon independent inspection of [`supabase/phase-9.2/rollback.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L218-L454), **the unsafe regex normalization has been replaced with a strict full-expression equivalence verification engine**. 

Specifically:
- `regexp_replace(..., '[()\s]', '', 'g')` (which stripped all parentheses) has been **completely removed**.
- `regexp_replace(..., '^.*?(bucket_id.*)$', '\1')` (which truncated expression prefixes) has been **completely removed**.
- Parentheses are 100% preserved.
- Full expressions for `USING` and `WITH CHECK` are evaluated independently against the saved `expected_definition` and its canonical PostgreSQL ruleutils decompiler representations.

---

## 2. Detailed Technical Audit of the 12 Safety Criteria

### Item 1: Is Unsafe Regex Normalization Still Present?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:294-296`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L294-L296)
- **Current Implementation:**
  ```sql
  v_expected_clean   := regexp_replace(trim(v_rec.expected_definition), '\s+', ' ', 'g');
  v_qual_clean       := regexp_replace(trim(coalesce(v_pol.qual, '')), '\s+', ' ', 'g');
  v_with_check_clean := regexp_replace(trim(coalesce(v_pol.with_check, '')), '\s+', ' ', 'g');
  ```
- **Finding:** **CORRECTED.** The only transformation applied is collapsing multiple whitespace characters (`\s+`) into a single space. Zero characters, parentheses, prefixes, or suffixes are stripped.

### Item 2: Are Parentheses Preserved?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:298-316`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L298-L316)
- **Finding:** **VERIFIED.** Every parenthesis in `(storage.foldername(name))[1]`, `array_length(storage.foldername(name), 1)`, `(auth.uid())::text`, and subexpression groupings is preserved and compared.

### Item 3 & 4: Are Complete USING and WITH CHECK Expressions Compared?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:298-316`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L298-L316)
- **Current Implementation:**
  ```sql
  v_is_qual_valid := (
    v_qual_clean = v_expected_clean
    OR v_qual_clean = ('(' || v_expected_clean || ')')
    OR v_qual_clean = '((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.filename(name) ~ (''^''::text || ((auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$''::text))))'
    OR v_qual_clean = '(((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1)) AND (storage.filename(name) ~ (''^''::text || ((auth.uid())::text || ''\.(png|jpg|jpeg|webp|gif)$''::text))))'
    OR v_qual_clean = '(((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text)) AND (array_length(storage.foldername(name), 1) = 1)) AND (storage.filename(name) ~ ((''^''::text || (auth.uid())::text) || ''\.(png|jpg|jpeg|webp|gif)$''::text))'
    OR v_qual_clean = '((bucket_id = ''public-assets''::text) AND ((storage.foldername(name))[1] = ''avatars''::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.filename(name) ~ ((''^''::text || (auth.uid())::text) || ''\.(png|jpg|jpeg|webp|gif)$''::text)))'
  );
  ```
  Identical complete matching logic is independently applied to `v_is_with_check_valid` for `v_with_check_clean`.
- **Finding:** **VERIFIED.** Compares the complete expression without partial substitutes.

### Item 5: Are Policy Metadata & Identity Verified?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:270-290`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L270-L290)
- **Checks Executed:**
  - `schemaname = 'storage' AND tablename = 'objects'`
  - `cmd = v_rec.cmd`
  - `permissive = 'PERMISSIVE'`
  - `roles::text[] = v_rec.roles` (strictly `ARRAY['authenticated']`)
  - `comment_desc IS NOT DISTINCT FROM 'SHOPKART_PHASE9_2_CREATED_V1'`
- **Finding:** **VERIFIED.** Aborts with `ROLLBACK ABORT` if any property differs.

### Item 6: Are All Four Managed Storage Policies Checked?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:320-441`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L320-L441)
- **Clauses Checked per Command:**
  - `SELECT` (lines 321-346): requires `with_check IS NULL`, `qual IS NOT NULL`, `v_is_qual_valid = TRUE`.
  - `INSERT` (lines 349-374): requires `qual IS NULL`, `with_check IS NOT NULL`, `v_is_with_check_valid = TRUE`.
  - `DELETE` (lines 377-402): requires `with_check IS NULL`, `qual IS NOT NULL`, `v_is_qual_valid = TRUE`.
  - `UPDATE` (lines 405-441): requires **both** `qual` & `with_check` non-null, **independently asserts both** `v_is_qual_valid = TRUE` AND `v_is_with_check_valid = TRUE`.
- **Finding:** **VERIFIED.** UPDATE independently checks both expressions.

### Item 7 & 8: Are Unrelated Policies and Buckets Preserved?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:421-428`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L421-L428) & [`788-812`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L788-L812)
- **Finding:** **VERIFIED.**
  - Zero `DELETE FROM storage.buckets` statements exist in rollback.
  - Zero `DELETE FROM storage.objects` statements exist in rollback.
  - Section 6.4 asserts that pre-existing policies (`creation_status = 'PRESERVED'`) exist and remain unaltered.
  - Section 6.5 asserts that bucket `public-assets` exists and `public = true`.

### Item 9: Is Function ACL Restoration Complete?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:456-520`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L456-L520)
- **Finding:** **VERIFIED.**
  - Section 3 iterates over all 9 functions in `phase9_2_private.function_acl_snapshot`.
  - Properly checks `proacl_was_null`: when true, executes `GRANT EXECUTE ON FUNCTION ... TO PUBLIC` (standard PostgreSQL default public execute). When false, restores individual grant objects from `original_acl_json`.
  - Restores function comments from `original_comment`.

### Item 10: Are Table and Function Grants Verified in Postflight?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:641-718`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L641-L718)
- **Finding:** **VERIFIED.**
  - Section 6.1 audits all 7 table privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) via `has_table_privilege()` for roles `anon` and `authenticated` against the baseline snapshot across all 17 public tables.
  - Section 6.2 audits `has_function_privilege()` for `public`, `anon`, and `authenticated` across all 9 application functions.

### Item 11: Is Snapshot Integrity Verified Before Rollback Starts?
- **Actual File & Lines:** [`supabase/phase-9.2/rollback.sql:36-214`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/supabase/phase-9.2/rollback.sql#L36-L214)
- **Checks Executed:**
  - All 4 snapshot tables exist in `phase9_2_private`.
  - All 26 snapshot columns match the schema contract.
  - Exact 17 public tables match identity array.
  - Exact 9 functions match identity array.
  - Exact 38 RLS policies match allowlist.
  - Exact 4 storage policies match identity array.
  - Verifies that all grantee roles in `original_acl_json` still exist in `pg_roles` (PostgreSQL catalog limitation safeguard).
- **Finding:** **VERIFIED.**

### Item 12: Do Failure Conditions Abort Before Destructive Operations?
- **Finding:** **VERIFIED.** Every preflight and Section 2 check executes `RAISE EXCEPTION 'ROLLBACK ABORT: ...'`, which causes the single transaction block (`BEGIN ... COMMIT`) to abort and roll back all changes atomically before any `DROP POLICY` is committed.

---

## 3. Package File Manifest & Hash Inventory

| File Path | Byte Size | Line Count | Status |
|---|---|---|---|
| `supabase/phase-9.2/migration.sql` | 47,704 bytes | 847 lines | Complete, awaiting staging approval |
| `supabase/phase-9.2/rollback.sql` | 45,800 bytes | 847 lines | Complete, corrected Section 2 |
| `supabase/phase-9.2/verification.sql` | 33,111 bytes | 534 lines | Strictly read-only, non-mutating SELECTs |
| `supabase/phase-9.2/security-audit.md` | 16,728 bytes | 370 lines | Complete documentation |
| `supabase/phase-9.2/README.md` | 16,539 bytes | 408 lines | Operator checklist & run guide |
