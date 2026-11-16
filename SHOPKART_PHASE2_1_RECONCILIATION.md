# ShopKart — Phase 2.1: Independent Audit Reconciliation & Corrections

**Document Purpose:** Independent technical reconciliation and factual correction of the Phase 2 backend and database deep audit reports.  
**Audit Mode:** STRICTLY READ-ONLY (No code modified, no SQL executed, no remote connections).  
**Repository State:** Verified against exact file revisions, cryptographic hashes (SHA-256), AST/SQL syntax, and application source code.

---

## 1. Phase 9.2 File Integrity & Authoritative Revision Mapping (Item 1)

In the previous Phase 2 reports, discrepancies existed regarding the line counts, byte sizes, and exact revisions of the Phase 9.2 package. Below is the verified file inventory and cryptographic fingerprinting across all Phase 9.2 artifacts.

### Authoritative Package: `supabase/phase-9.2/`
| File Path | Actual Lines | Byte Size | SHA-256 Checksum | Authoritative Status |
| :--- | :--- | :--- | :--- | :--- |
| `supabase/phase-9.2/migration.sql` | **848** | 47,704 | `197cbfa73d837b5e5550d5fca8012848aee8e13d700fa18ef9fb6525f12f95e1` | **Authoritative Migration** |
| `supabase/phase-9.2/rollback.sql` | **848** | 45,800 | `ead101f989188ee1a42decde79f12ddd819dce0373064629d100087101b93311` | **Authoritative Rollback** |
| `supabase/phase-9.2/verification.sql` | **531** | 33,111 | `fef12dc6c8d558065b96c6045b1eeb80d810c05e0a31402958ef6c1a20007006` | **Authoritative Verification** |
| `supabase/phase-9.2/README.md` | 266 | 12,987 | `03d157a3e7a3f37b98f2ea8e09e25d2b79a52862c938386f56b5be8b7beff7ea` | Authoritative Package Docs |
| `supabase/phase-9.2/security-audit.md` | 338 | 15,224 | `1ba725c83fa9b7941fcdd059b008d51fa9c095318e8df5e8d5f3d3cfc5c165ef` | Authoritative Security Audit |

### Integration Correction Kit: `supabase/phase-9.2/review/`
| File Path | Actual Lines | Byte Size | SHA-256 Checksum | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `supabase/phase-9.2/review/verification.sql` | 140 | 5,736 | `5e54dd67e887296edb2170c2c3e5d7904499db50b93f77331ceb7bbc0b3d49cd` | Reference verification subset |
| `supabase/phase-9.2/review/snapshot_compatibility_check.sql` | 67 | 2,893 | `857fc995020681e527018ca655125e5216f27b7a2e1bc11ec65e60f5a2e14fa2` | Diagnostic compatibility check |

### Modular Predecessors: `database/migrations/phase9_2_*.sql`
| File Path | Actual Lines | Byte Size | SHA-256 Checksum | Relationship |
| :--- | :--- | :--- | :--- | :--- |
| `phase9_2_function_security_hardening.sql` | 156 | 6,306 | `043da2dff30a736e5e08f7acb7fa53b0621a9c33267c2162b7022a60c332f324` | Superseded by `supabase/phase-9.2/migration.sql` |
| `phase9_2_storage_hardening.sql` | 183 | 8,432 | `a321cfed4f52332bd3f4f69e6ad253d980799f67be274c600554419d0c269f18` | Superseded by `supabase/phase-9.2/migration.sql` |
| `phase9_2_function_rollback.sql` | 142 | 5,943 | `6d274ee4b419d91d15818a11aac0989958c8b973ef861a23d17c8ba51b7a07e1` | Superseded by `supabase/phase-9.2/rollback.sql` |
| `phase9_2_storage_rollback.sql` | 63 | 2,318 | `b9a18203f0708cc96ab1f4b4fac9b38028eb9a8100bdce6fefa99687ca8ecfe6` | Superseded by `supabase/phase-9.2/rollback.sql` |

> [!IMPORTANT]
> **Authoritative Revision Determination:**  
> The canonical production package resides strictly under `supabase/phase-9.2/`. The earlier modular scripts in `database/migrations/` represent intermediate working stages. Previous report references citing 718 lines for `rollback.sql` or 273 lines for `verification.sql` reflected pre-correction line counts before the implementation of Section 2 full expression equivalence and expanded assertion coverage.

---

## 2. File-by-File Transaction Inventory (Item 2)

**Correction:** The claim in `SHOPKART_MIGRATION_HISTORY_AUDIT.md` Section 4.1 that *"Every migration and rollback script in `database/migrations/` and `supabase/phase-9.2/` is wrapped in explicit `BEGIN ... COMMIT;` transaction blocks"* is **factually incorrect**.

Only Phase 9.1 and Phase 9.2 scripts implement top-level transactional boundaries. The historical migrations in `database/migrations/` rely entirely on PostgreSQL function bodies (`AS $$ BEGIN ... END; $$`) or raw DDL without top-level transaction management.

### Full Inventory Table
| File Path | Top-Level `BEGIN;` | Top-Level `COMMIT;` | Transaction Wrapping Status |
| :--- | :---: | :---: | :--- |
| `database/migrations/phase7_1_security_and_cart_fixes.sql` | **NO** | **NO** | **UNWRAPPED** (Raw DDL + function bodies) |
| `database/migrations/phase7_1_rollback.sql` | **NO** | **NO** | **UNWRAPPED** (Raw DDL + function bodies) |
| `database/migrations/phase7_2_customer_order_cancellation.sql` | **NO** | **NO** | **UNWRAPPED** (Raw DDL + function body) |
| `database/migrations/phase7_2_rollback.sql` | **NO** | **NO** | **UNWRAPPED** (Raw `DROP FUNCTION` statement) |
| `database/migrations/phase7_backend_enhancements.sql` | **NO** | **NO** | **UNWRAPPED** (Raw DDL + function bodies) |
| `database/migrations/phase8_1_inventory_restoration_safety.sql` | **NO** | **NO** | **UNWRAPPED** (Raw DDL + function body) |
| `database/migrations/phase8_1_rollback.sql` | **NO** | **NO** | **UNWRAPPED** (Raw DDL + function body) |
| `database/migrations/phase9_security_hardening.sql` | **NO** | **NO** | **UNWRAPPED** (Raw DDL statements) |
| `database/migrations/phase9_security_hardening_corrected.sql` | **YES** | **YES** | **WRAPPED** (`BEGIN;` line 21, `COMMIT;` line 159) |
| `database/migrations/phase9_rollback.sql` | **YES** | **YES** | **WRAPPED** (`BEGIN;` line 6, `COMMIT;` line 73) |
| `database/migrations/phase9_2_function_security_hardening.sql` | **YES** | **YES** | **WRAPPED** (`BEGIN;` line 7, `COMMIT;` line 156) |
| `database/migrations/phase9_2_function_rollback.sql` | **YES** | **YES** | **WRAPPED** (`BEGIN;` line 7, `COMMIT;` line 142) |
| `database/migrations/phase9_2_storage_hardening.sql` | **YES** | **YES** | **WRAPPED** (`BEGIN;` line 7, `COMMIT;` line 183) |
| `database/migrations/phase9_2_storage_rollback.sql` | **YES** | **YES** | **WRAPPED** (`BEGIN;` line 5, `COMMIT;` line 63) |
| `supabase/phase-9.2/migration.sql` | **YES** | **YES** | **WRAPPED** (`BEGIN;` line 46, `COMMIT;` line 848) |
| `supabase/phase-9.2/rollback.sql` | **YES** | **YES** | **WRAPPED** (`BEGIN;` line 39, `COMMIT;` line 848) |
| `supabase/phase-9.2/verification.sql` | **NO** | **NO** | **N/A** (Read-only `SELECT` assertions) |
| `supabase/phase-9.2/review/verification.sql` | **NO** | **NO** | **N/A** (Read-only `SELECT` assertions) |
| `supabase/phase-9.2/review/snapshot_compatibility_check.sql` | **NO** | **NO** | **N/A** (Read-only diagnostic script) |

---

## 3. Storage Rollback Expression Preservation Analysis (Item 3)

**File Under Review:** `supabase/phase-9.2/rollback.sql` (Sections 2 and 6.4)

### Analysis of Section 2 (Lines 218–456): Created Policy Removal
- **Mechanism:** Section 2 evaluates policies where `creation_status = 'CREATED'`.
- **Expression Comparison:** The implementation compares `v_pol.qual` and `v_pol.with_check` against `v_rec.expected_definition`. It verifies:
  1. Policy identity (schemaname, tablename, policyname, cmd, permissive, roles).
  2. Comment marker (`SHOPKART_PHASE9_2_CREATED_V1`).
  3. Expression equivalence preserving parentheses and logical clauses (handling formatting whitespace normalization `\s+` to `' '`).
- **Verdict for Section 2:** Confirmed robust for newly created policies.

### Analysis of Section 6.4 (Lines 787–828): Preserved Policy Restoration Verification
- **Code Inspection (`supabase/phase-9.2/rollback.sql:810-821`):**
  ```sql
  -- 3. Verify pre-existing storage policies are preserved intact
  FOR v_rec IN
    SELECT policyname, schemaname, tablename, cmd, roles, expected_definition
    FROM phase9_2_private.storage_policy_created
    WHERE creation_status = 'PRESERVED'
  LOOP
    SELECT * INTO v_cur FROM pg_policies
    WHERE schemaname = v_rec.schemaname AND tablename = v_rec.tablename AND policyname = v_rec.policyname;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Pre-existing storage policy "%" was removed during rollback!', v_rec.policyname;
    END IF;
    IF v_cur.cmd <> v_rec.cmd OR v_cur.roles::text[] <> v_rec.roles THEN
      RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Pre-existing storage policy "%" definition was modified!', v_rec.policyname;
    END IF;
  END LOOP;
  ```
- **Correction & Critical Finding:**  
  Although `v_rec.expected_definition` is retrieved from `storage_policy_created` in the query, **line 818 never evaluates `v_cur.qual` (`USING`) or `v_cur.with_check` against `v_rec.expected_definition`**.
  It asserts ONLY `v_cur.cmd <> v_rec.cmd` and `v_cur.roles::text[] <> v_rec.roles`.
- **Risk:** If a pre-existing storage policy's `USING` or `WITH CHECK` expression were altered, Section 6.4 would still pass provided the policy name, command, and roles matched. Full expression verification is missing from Section 6.4 for pre-existing policies.

---

## 4. Bucket Configuration Restoration Audit (Item 4)

**Context:** Supabase Storage `storage.buckets` configuration.

In PostgreSQL Supabase Storage, the `storage.buckets` table defines the following attributes:
- `id` (`TEXT PK`)
- `name` (`TEXT`)
- `owner` (`UUID`)
- `created_at` (`TIMESTAMPTZ`)
- `updated_at` (`TIMESTAMPTZ`)
- `public` (`BOOLEAN`)
- `avif_autodetection` (`BOOLEAN`)
- `file_size_limit` (`BIGINT`)
- `allowed_mime_types` (`TEXT[]`)

### Audit of `migration.sql` (Lines 589–599)
```sql
SELECT public INTO v_bucket_public FROM storage.buckets WHERE id = 'public-assets';
IF NOT FOUND THEN
  INSERT INTO storage.buckets (id, name, public) VALUES ('public-assets', 'public-assets', true);
  RAISE NOTICE 'Created storage bucket "public-assets" with public=true';
ELSIF v_bucket_public IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'PHASE9_2 ABORT: existing public-assets bucket is not public; manual review required';
END IF;
```
- The migration provisions **only** `(id, name, public)`. It leaves `file_size_limit`, `allowed_mime_types`, `avif_autodetection`, and `owner` as `NULL` or defaults.

### Audit of `rollback.sql` (Lines 823–828)
```sql
SELECT * INTO v_bucket FROM storage.buckets WHERE id = 'public-assets';
IF NOT FOUND THEN
  RAISE EXCEPTION 'ROLLBACK POSTFLIGHT CRITICAL FAIL: storage bucket "public-assets" is missing!';
END IF;
IF v_bucket.public IS NOT TRUE THEN
  RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: storage bucket "public-assets" public configuration is %, expected true', v_bucket.public;
END IF;
```
- **Factual Finding:** Rollback purposely does not drop `storage.buckets` (to protect stored objects from cascade deletion). However, **it does not capture or restore other bucket properties** (`file_size_limit`, `allowed_mime_types`, `avif_autodetection`). If a bucket previously had custom MIME type constraints or file size limits, neither migration nor rollback tracks or restores those specific attributes.

---

## 5. Reassessment of DEFECT-01: Reviews Query Architecture (Item 5)

**Original Claim in Document 5:** *"The reviews table contains ... It does not have a product_name column. Any query or insert targeting reviews.product_name triggers a PostgreSQL error column 'product_name' of relation 'reviews' does not exist."*

### Source Code Evidence
1. **Database Schema (`database/schema.sql:361-373`):**
   ```sql
   CREATE TABLE IF NOT EXISTS reviews (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
     title TEXT,
     body TEXT,
     is_approved BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (product_id, user_id)
   );
   ```
2. **Review Fetching Service (`src/services/productService.js:420-438`):**
   ```javascript
   export async function fetchProductReviews(productName) {
     const { data, error } = await supabase
       .from('reviews')
       .select('*, profiles(full_name, avatar_url)')
       .eq('is_approved', true)
       .order('created_at', { ascending: false })

     const matching = (data || []).filter(r =>
       (!productName || (r.product_name && r.product_name.toLowerCase().includes(productName.toLowerCase())))
     )
     return { data: matching, error: null }
   }
   ```
3. **Review Submission Service (`src/services/productService.js:470-482`):**
   ```javascript
   const { data, error } = await supabase
     .from('reviews')
     .insert([{
       product_id: productId,
       user_id: user.id,
       rating: Number(rating) || 5,
       title,
       body,
       is_approved: false,
     }])
   ```

### Technical Distinction & Correction
- **PostgreSQL Does NOT Error:** The SQL query executed via PostgREST is `SELECT *, profiles(...) FROM reviews WHERE is_approved = true`. The wildcard `*` expands only to actual database columns. PostgreSQL executes this query with zero errors.
- **The True Bug is Client-Side JavaScript Logic:**
  - In `src/pages/customer/ProductDetailPage.jsx:64`, the page calls `fetchProductReviews(data.name)`.
  - In `productService.js:435`, the JavaScript filter checks `r.product_name.toLowerCase().includes(...)`.
  - Because `r.product_name` is `undefined` on rows returned from PostgreSQL, `(!productName || (r.product_name && ...))` evaluates to `false`.
  - **Result:** The JavaScript filter silently discards **100% of reviews**, returning an empty list (`[]`) to the UI!
  - In addition, the query fetches all approved reviews for the entire platform across all products instead of scoping the query with `.eq('product_id', productId)`.
- **Classification Correction:** Reclassified from a PostgreSQL schema error to a **High-Severity Frontend/Service Logic Defect**.

---

## 6. Reassessment of DEFECT-02: PostgreSQL Overload Resolution (Item 6)

**The Issue:** `database/schema.sql:482` defines `public.place_order(UUID, TEXT)`, whereas `phase7_1_security_and_cart_fixes.sql:207` defines `public.place_order(UUID, TEXT, TEXT)`.

### PostgreSQL Overload Resolution Rules
In PostgreSQL, functions are identified by `(schema_name, function_name, argument_types)`. When multiple functions share a name:
1. **Positional Arguments:** If invoked with 2 arguments `(p_address_id, p_notes)`, PostgreSQL checks matching signatures:
   - Candidate A: `place_order(UUID, TEXT)` (Exact parameter count match = 2).
   - Candidate B: `place_order(UUID, TEXT, TEXT DEFAULT NULL)` (Parameter count = 3, matches via default).
   - PostgreSQL prioritizes exact parameter count matches without defaults, selecting Candidate A.
2. **PostgREST / Supabase RPC Resolution:**
   - When a frontend client executes `supabase.rpc('place_order', { p_address_id, p_notes })`:
   - PostgREST inspects its cached OpenAPI schema. If `{ p_address_id, p_notes }` matches the exact argument names of Candidate A, PostgREST binds directly to Candidate A.
   - If Candidate A executes, **coupon validation, coupon discount deduction, and coupon quota consumption are completely bypassed**.
   - If both overloads exist with overlapping parameter names, PostgREST may also raise a schema resolution ambiguity error: `PGRST203: More than one function matching ...`.
3. **Security Permission Discrepancy:**
   - In `supabase/phase-9.2/migration.sql:379-390`, permission hardening explicitly executes:
     `REVOKE ALL ON FUNCTION public.place_order(uuid,text,text) FROM PUBLIC, anon, authenticated;`
     `GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,text) TO authenticated;`
   - It targets **only** the 3-argument signature. If the 2-argument signature exists on the database, its permissions were never revoked by Phase 9.2, creating an untracked privilege anomaly.
- **Classification:** Confirmed as an **Authoritative Schema Drift & Dual-Signature Conflict Defect**.

---

## 7. Reassessment of Missing Foreign Key Indexes (Item 7)

**Original Claim in Document 5:** Classified missing foreign key indexes as a `PERFORMANCE RISK`.

### Verification Against Actual Schema
| Proposed Index Target | Column Exists? | Indexed in `database/schema.sql`? | Query Access Pattern | Staging Impact |
| :--- | :---: | :---: | :--- | :--- |
| `orders(address_id)` | YES | **NO** | Filtered via `orders(user_id)` | Negligible (< 1 ms scan) |
| `orders(coupon_id)` | YES | **NO** | Analytics / Coupon reports | Negligible |
| `order_items(product_id)` | YES | **NO** | Sales analytics by product | Negligible |
| `order_items(variant_id)` | YES | **NO** | Variant sales analytics | Negligible |
| `cart_items(variant_id)` | YES | **NO** (Only partial on null) | Filtered via `cart_id` | Negligible |
| `inventory(variant_id)` | YES | **NO** (Only composite unique) | Filtered via `product_id` | Negligible |
| `categories(parent_id)` | YES | **NO** | Category taxonomy tree (< 50 rows) | Seq scan faster than index |

### Engineering Distinction
- **Missing Index vs Demonstrated Performance Bottleneck:**  
  None of these missing indexes represent active performance bottlenecks in the application. In PostgreSQL, sequential scans on tables with small cardinality (< 10,000 rows) are faster than index scans due to caching and eliminating index tree traversal.
- Foreign key indexes are primarily beneficial to prevent table-level share locks on parent table deletions (`DELETE FROM addresses WHERE id = ...`).
- **Classification Correction:** Downgraded from `PERFORMANCE RISK` to **Low-Priority Schema Optimization (Advisory)**.

---

## 8. Reassessment of Default Address Uniqueness (Item 8)

**Original Recommendation in Document 5:** `CREATE UNIQUE INDEX idx_unique_default_address ON addresses(user_id) WHERE is_default = TRUE;`.

### Application Implementation Review
Inspecting `src/services/orderService.js:125-245`:
```javascript
// From setDefaultAddress(id) in orderService.js:
// 1. Unset existing defaults
await supabase
  .from('addresses')
  .update({ is_default: false })
  .eq('user_id', user.id)

// 2. Set chosen address to default
const { error } = await supabase
  .from('addresses')
  .update({ is_default: true })
  .eq('id', id)
  .eq('user_id', user.id)
```
Inspecting `src/pages/customer/CheckoutPage.jsx:60`:
```javascript
const defaultAddr = data.find(a => a.is_default) || data[0]
```

### Risk of Adding a Database Partial Unique Constraint
1. **Non-Transactional Multi-Step Client Mutation:** The frontend updates addresses in two distinct HTTP round trips: first unsetting `is_default = false`, then setting `is_default = true`.
2. **Race Condition Under Concurrent Updates:** If two browser tabs or updates run concurrently, a standard immediate unique index will reject the second operation with `duplicate key value violates unique constraint`, resulting in unhandled user-facing errors.
3. **Statement-Level vs Deferrable:** If a single statement update like `UPDATE addresses SET is_default = (id = target) WHERE user_id = ...` is used, PostgreSQL evaluates non-deferred constraints row-by-row, which throws a unique constraint violation if the new default is processed before the old default is cleared.
4. **Existing Client Graceful Fallback:** `CheckoutPage.jsx` already resolves multiple or zero default addresses defensively (`data.find(a => a.is_default) || data[0]`).
- **Conclusion & Correction:** A raw database-level unique index must **NOT** be added without first refactoring the address update logic into an atomic PostgreSQL stored procedure (e.g., `set_default_address(p_address_id UUID)`). Reclassified as **Not Recommended in Current Client Architecture**.

---

## 9. Corrected Prioritized Findings Register (Item 9)

Below is the definitive, corrected findings register replacing Document 5's initial classifications:

| ID | Title / Target | Corrected Category | Severity | Root Cause & Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **REV-01** | Reviews Client Filtering Bug | `CONFIRMED DEFECT` | **HIGH** | `ProductDetailPage.jsx:64` and `productService.js:435` filter by non-existent `r.product_name`, silently hiding all reviews. SQL query succeeds. |
| **SCH-01** | Canonical `schema.sql` Overload Drift | `CONFIRMED DEFECT` | **MEDIUM** | `database/schema.sql:482` contains legacy 2-arg `place_order`. Creates overload collision and coupon bypass if reapplied. |
| **SCH-02** | Missing Functions in Baseline Schema | `CONFIRMED DEFECT` | **MEDIUM** | Baseline `database/schema.sql` is missing 4 stored procedures and 1 trigger added in Phases 7–8. |
| **SEC-01** | Pending Phase 9.2 Staging Migration | `SECURITY RISK` | **HIGH** | Staging database runs wide baseline permissions until `supabase/phase-9.2/migration.sql` is executed. |
| **SEC-02** | Avatar Storage Case Sensitivity | `SUSPECTED ISSUE` | **LOW** | Storage policy regex enforces `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`. Uppercase extensions (e.g. `.JPG`) are rejected by SQL policy. |
| **SEC-03** | Preserved Storage Policy Check in Rollback | `SECURITY RISK` | **MEDIUM** | `supabase/phase-9.2/rollback.sql:818` checks `cmd` and `roles` for preserved policies, but fails to check `qual`/`with_check` expressions. |
| **TX-01** | Unwrapped Phase 7–8 Migrations | `CONFIRMED DEFECT` | **LOW** | 8 migration/rollback scripts in `database/migrations/` lack `BEGIN; ... COMMIT;` wrappers. |
| **DAT-01** | Missing PostgreSQL `settings` Table | `FEATURE GAP` | **MEDIUM** | Store settings persist only in browser `localStorage`. No cross-admin persistence. |
| **DAT-02** | Unpopulated `payments` Table | `WORKFLOW GAP` | **LOW** | Checkout flow does not record transaction logs in `payments`. |
| **OPT-01** | Unindexed Foreign Keys | `SUGGESTED ENHANCEMENT` | **LOW** | Foreign keys lack indexes, but small table cardinality shows zero demonstrated latency. |
| **OPT-02** | Default Address Uniqueness Constraint | `NOT RECOMMENDED` | **INFO** | Adding immediate unique index breaks 2-step client mutation pattern in `orderService.js`. |
| **VFY-01** | Remote Verification Suite Execution | `REQUIRES RUNTIME VERIFICATION`| **INFO** | 18 assertions in `supabase/phase-9.2/verification.sql` pass static test harness (45/45) but require live Staging run. |

---

## 10. Verification of Strict Operating Boundaries

During this Phase 2.1 reconciliation:
- **Application source code:** ZERO changes made.
- **SQL / Migration files:** ZERO changes made.
- **Remote Supabase:** ZERO connections made.
- **Git:** ZERO commits or pushes made.
- **Phase 3:** NOT started. Awaiting user review and approval.
