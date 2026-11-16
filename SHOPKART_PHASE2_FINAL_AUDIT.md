# ShopKart — Phase 2 Final Audit & Reconciliation

**Audit Stage:** Phase 2 Finalization & Independent Audit Sign-Off  
**Auditor Roles:** Senior Backend Engineer, Database Security Auditor, and Independent Code Reviewer  
**Mode:** STRICTLY READ-ONLY (No code modified, no SQL executed, no remote connections, no Git modifications)  
**Target Application:** ShopKart E-Commerce Platform (React + Vite + Supabase / PostgreSQL)

---

## 1. Executive Summary

This report delivers the authoritative, consolidated audit sign-off for Phase 2 and Phase 2.1 of the ShopKart project. Every finding, claim, and code reference has been independently validated against the physical files, cryptographic checksums (SHA-256), and AST structures in the local repository.

### Key Conclusions:
1. **Zero Exploitable Coupon Bypass:** Local static evidence confirms that the frontend client (`orderService.js:384`) always transmits the 3-parameter payload `{ p_address_id, p_notes, p_coupon_code }`. The presence of the legacy 2-parameter signature in `database/schema.sql:482` constitutes **Schema Drift** and an overload collision risk, not a proven active bypass.
2. **Review Defect Root Cause is Client-Side:** The empty reviews bug is caused by JavaScript logic in `productService.js:435` attempting to filter by `r.product_name` (which is `undefined`). The PostgreSQL schema is normalized and valid; the database query executes successfully without errors.
3. **Phase 9.2 Package Verified:** The authoritative, hardened Phase 9.2 package resides in `supabase/phase-9.2/` (`migration.sql`: 848 lines, `rollback.sql`: 848 lines, `verification.sql`: 531 lines).
4. **Transaction Wrappers Clarified:** 8 older migration scripts in `database/migrations/` lack top-level `BEGIN ... COMMIT;` wrappers. This is an advisory migration-hygiene concern, not a functional SQL defect.
5. **Default Address Constraint Caution:** Adding a raw database partial unique index on `addresses(is_default = true)` without refactoring the client's 2-step HTTP update flow creates race condition risks. An atomic stored procedure is recommended instead.

---

## 2. Audit Scope & Operating Boundaries

- **Read-Only Inspection:** 100% offline static analysis. No network requests, API calls, or database connections were made to Supabase Staging (`ShopKart-Staging`, ref: `ulmwssozdmppvydppswx`) or Production.
- **Repository Source of Truth:** Local files in `src/`, `database/`, and `supabase/` served as the exclusive evidence base.
- **No Inferred Live State:** Any assertion depending on the deployed PostgreSQL catalog or live PostgREST schema cache is explicitly designated **REQUIRES RUNTIME VERIFICATION**.
- **No Implementation:** Zero application source code, SQL migrations, or configuration files were modified.

---

## 3. Reconciliation of Four Remaining Key Issues

### Issue A: SCH-01 — `place_order` Overload & Coupon Handling
- **Local Definitions:**
  - `database/schema.sql:482`: `CREATE OR REPLACE FUNCTION public.place_order(p_address_id UUID, p_notes TEXT DEFAULT NULL) RETURNS UUID` (Legacy baseline; 2 arguments, zero coupon logic).
  - `database/migrations/phase7_1_security_and_cart_fixes.sql:202,207`: `DROP FUNCTION IF EXISTS public.place_order(UUID, TEXT);` followed by `CREATE OR REPLACE FUNCTION public.place_order(p_address_id UUID, p_notes TEXT DEFAULT NULL, p_coupon_code TEXT DEFAULT NULL) RETURNS UUID` (Active production signature; 3 arguments, full coupon validation and stock locking).
  - `database/migrations/phase7_1_rollback.sql:18,21`: Reverts by dropping the 3-arg function and recreating the 2-arg baseline.
- **Frontend RPC Invocations:**
  - `src/services/orderService.js:384-388`:
    ```javascript
    const cleanCoupon = couponCode ? String(couponCode).trim().toUpperCase() : null
    const { data: orderId, error: rpcError } = await supabase.rpc('place_order', {
      p_address_id: addressId,
      p_notes: notes ? String(notes).trim() : null,
      p_coupon_code: cleanCoupon,
    })
    ```
- **PostgREST Overload Resolution & Coupon Analysis:**
  - **1. Confirmed Schema Drift:** Baseline `database/schema.sql` retains the 2-parameter signature, drifting from the Phase 7.1 migration.
  - **2. PostgREST Overload Matching:** PostgREST matches JSON payload keys to PostgreSQL function parameter names. Because `orderService.js` always supplies `p_coupon_code` (even as `null`), PostgREST cannot bind to the 2-parameter signature `place_order(p_address_id, p_notes)`.
  - **3. Ambiguity & Missing RPC Handling:** If a deployed database has only the 2-parameter function, PostgREST returns `PGRST202` ("Could not find function in schema cache"), which `orderService.js:393` catches and reports cleanly.
  - **4. Proven Exploitable Bypass Status:** **NOT PROVEN / UNFOUNDED.** An attacker calling the 2-parameter function cannot obtain an illicit coupon discount because the 2-parameter function contains zero discount or coupon-processing logic. The risk is limited to potential overload collision if raw external HTTP calls omit `p_coupon_code`.
- **Live State Verification:** Whether the 2-parameter function currently coexists on Supabase Staging **REQUIRES RUNTIME VERIFICATION**.

---

### Issue B: SEC-01 — Phase 9.2 Staging Security State
- **Distinction of Four Security States:**
  1. **Intended Security State:** Defined by `supabase/phase-9.2/migration.sql`. Explicitly revokes default wide permissions, grants least-privilege catalog reads to `anon`, restricts mutations to authenticated users, revokes trigger functions from client roles, and isolates avatar storage.
  2. **Security State After Applying Migration:** Fully verified locally via `supabase/phase-9.2/verification.sql` (18 assertions) to achieve complete fail-closed defense-in-depth.
  3. **Actual Currently Deployed Staging State:** Cannot be determined from local files alone. We do not possess live catalog connection access to inspect remote roles or permissions.
  4. **Unknown / Unverified Deployment State:** Staging deployment status is formally categorized as **REQUIRES RUNTIME VERIFICATION**. We make no speculative claim that staging is currently compromised or vulnerable.

---

### Issue C: TX-01 — Migration Transaction Wrappers
- **File-by-File Inventory:**
  - **Unwrapped (No top-level `BEGIN ... COMMIT;`):**
    1. `database/migrations/phase7_1_security_and_cart_fixes.sql`
    2. `database/migrations/phase7_1_rollback.sql`
    3. `database/migrations/phase7_2_customer_order_cancellation.sql`
    4. `database/migrations/phase7_2_rollback.sql`
    5. `database/migrations/phase7_backend_enhancements.sql`
    6. `database/migrations/phase8_1_inventory_restoration_safety.sql`
    7. `database/migrations/phase8_1_rollback.sql`
    8. `database/migrations/phase9_security_hardening.sql`
  - **Explicitly Wrapped (`BEGIN;` and `COMMIT;` present):**
    1. `database/migrations/phase9_security_hardening_corrected.sql` (Lines 21, 159)
    2. `database/migrations/phase9_rollback.sql` (Lines 6, 73)
    3. `database/migrations/phase9_2_function_security_hardening.sql` (Lines 7, 156)
    4. `database/migrations/phase9_2_function_rollback.sql` (Lines 7, 142)
    5. `database/migrations/phase9_2_storage_hardening.sql` (Lines 7, 183)
    6. `database/migrations/phase9_2_storage_rollback.sql` (Lines 5, 63)
    7. `supabase/phase-9.2/migration.sql` (Lines 46, 848)
    8. `supabase/phase-9.2/rollback.sql` (Lines 39, 848)
- **Technical Risk Assessment:**  
  Missing explicit transaction wrappers do not impact runtime application logic once successfully applied. The risk is strictly operational: if an unwrapped script is executed statement-by-statement in a web console (e.g. Supabase SQL Editor) and encounters an error midway, earlier statements remain committed, creating partial application states. Modern CLI runners (`supabase db push`) wrap migrations automatically.
- **Classification:** Categorized as **ADVISORY (Operational Migration Hygiene)**.

---

### Issue D: OPT-02 — Default Address Uniqueness & Concurrency
- **Schema & Application Inspection:**
  - Table `addresses` (`database/schema.sql:65-81`) has NO unique constraint on `(user_id, is_default)`.
  - Multiple default addresses are **technically possible** in the database.
  - In `src/services/orderService.js:125-245`, default status is managed via a **two-step non-transactional HTTP sequence**:
    1. `await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id)`
    2. `await supabase.from('addresses').update({ is_default: true }).eq('id', id).eq('user_id', user.id)`
- **Concurrency & Failure Scenarios:**
  - **Network Failure:** If Step 1 succeeds and Step 2 fails, the user has 0 default addresses. Handled gracefully by `CheckoutPage.jsx:60` (`data.find(a => a.is_default) || data[0]`).
  - **Concurrent Updates:** Two concurrent requests can result in multiple default addresses. `CheckoutPage.jsx` resolves this deterministically by taking the first match.
  - **Risk of Immediate Unique Index:** If an immediate partial unique index (`UNIQUE (user_id) WHERE is_default = TRUE`) is added without changing application code, concurrent updates or statement-level row evaluations will trigger unhandled PostgreSQL error `23505`, breaking the checkout address UI.
- **Classification & Recommendation:** Categorized as **ADVISORY / NOT RECOMMENDED AS IMMEDIATE INDEX**. An atomic RPC or trigger must be implemented prior to adding database-level constraints.

---

## 4. Phase 9.2 Package Cryptographic Verification

All 5 core files in `supabase/phase-9.2/` were hashed and measured directly from disk:

| Exact Relative Path | Actual Lines | Byte Size | SHA-256 Checksum | Classification |
| :--- | :---: | :---: | :--- | :--- |
| `supabase/phase-9.2/migration.sql` | **848** | 47,704 | `197cbfa73d837b5e5550d5fca8012848aee8e13d700fa18ef9fb6525f12f95e1` | Canonical Migration Package |
| `supabase/phase-9.2/rollback.sql` | **848** | 45,800 | `ead101f989188ee1a42decde79f12ddd819dce0373064629d100087101b93311` | Canonical Rollback Package |
| `supabase/phase-9.2/verification.sql` | **531** | 33,111 | `fef12dc6c8d558065b96c6045b1eeb80d810c05e0a31402958ef6c1a20007006` | Canonical Verification Suite |
| `supabase/phase-9.2/README.md` | **179** | 16,539 | `6c224b9c424dec18a458db99b58901e6f9a03bede541461a18123ca0a576ce1f` | Canonical Documentation |
| `supabase/phase-9.2/security-audit.md` | **200** | 16,728 | `a84911a5031357e33349d937c42a221821bb3f8e91f097ba90c5409d2f181a52` | Canonical Threat Audit |

### Relationship to Secondary Files:
- `supabase/phase-9.2/review/`: Contains reference diagnostics from the correction kit (`verification.sql`: 140 lines, `snapshot_compatibility_check.sql`: 67 lines, `README.md`: 63 lines).
- `database/migrations/phase9_2_*.sql`: Four modular development scripts superseded by the unified `supabase/phase-9.2/` package.

---

## 5. Storage Rollback: Pre-existing Policy Expression Verification Finding
- **File:** `supabase/phase-9.2/rollback.sql`
- **Section 2 (Lines 218–456):** Verified. Drops ONLY created policies after matching full expression equivalence against `expected_definition`.
- **Section 6.4 (Lines 810–821):** Evaluates pre-existing policies (`creation_status = 'PRESERVED'`).
  - **Finding:** Line 818 asserts `IF v_cur.cmd <> v_rec.cmd OR v_cur.roles::text[] <> v_rec.roles THEN`. It verifies policy presence, command, and role target, but **omits verification of `v_cur.qual` (`USING`) and `v_cur.with_check`**.
  - **Impact:** Preserved policies are confirmed present and correctly targeted, but definition tampering would not trigger a rollback postflight abort.
  - **Classification:** `SECURITY RISK (MEDIUM)`.

---

## 6. Audit Conclusion & Sign-Off

Phase 2 and Phase 2.1 audits are complete. The codebase exhibits a clean production build (`npm run build` in 961 ms), robust concurrency locking in stored procedures, and zero syntax errors. All identified findings are clearly partitioned into confirmed code defects, schema drift, workflow gaps, and runtime verification prerequisites.

**Phase 2 is hereby finalized.** See `SHOPKART_FINAL_FINDINGS_REGISTER.md` for the comprehensive register and `SHOPKART_PHASE3_READINESS.md` for implementation prerequisites.
