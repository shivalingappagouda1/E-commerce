# ShopKart — Phase 3: Security Hardening & Master Security Audit
## Document 4: Supabase Storage Architecture & Object Security

**Audit Phase:** Phase 3 — Stage A  
**Scope:** `storage.buckets`, `storage.objects`, Phase 9.2 Storage Hardening Package  
**Target Bucket:** `public-assets`  
**Security Principles:** OWASP File Upload Security, Path Traversal Defense (CWE-22), Unauthorized Overwrites (CWE-284)

---

## 1. Storage Architecture Overview

ShopKart leverages Supabase Storage for customer avatars and media assets:
1. **Bucket Definition:** `public-assets` (`public = true`). Configured for high-throughput public CDN downloads of avatars and public assets.
2. **Path Convention:** Avatars are stored under `avatars/<userId>.<ext>`.
3. **Database Control Layer:** Object manipulation permissions are enforced through PostgreSQL Row Level Security (RLS) on `storage.objects`.

---

## 2. Storage RLS Policy Deep Audit (Phase 9.2 Package)

Defined in `supabase/phase-9.2/migration.sql:629-770`:

### Policy 1: SELECT (Object Read / Listing via API)
- **Policy Name:** `"Users can view own avatar in public-assets"`
- **Target Role:** `authenticated`
- **Command:** `SELECT`
- **Definition:**
  ```sql
  bucket_id = 'public-assets'
  AND (storage.foldername(name))[1] = 'avatars'
  AND array_length(storage.foldername(name), 1) = 1
  AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
  ```
- **Security Analysis:** Enforces that direct Storage API read and listing requests are restricted to the user's own avatar object. Note that raw HTTP asset downloads via the public CDN URL are served directly by the CDN layer because the bucket is configured as `public = true`.

### Policy 2: INSERT (Upload)
- **Policy Name:** `"Users can upload own avatar to public-assets"`
- **Target Role:** `authenticated`
- **Command:** `INSERT`
- **WITH CHECK Clause:**
  ```sql
  bucket_id = 'public-assets'
  AND (storage.foldername(name))[1] = 'avatars'
  AND array_length(storage.foldername(name), 1) = 1
  AND storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')
  ```
- **Security Guarantees:**
  - **Single Folder Depth:** `array_length(storage.foldername(name), 1) = 1` prevents nested folder creation or path traversal attacks (e.g. `avatars/nested/subfolder/...`).
  - **Path Traversal Defense:** `(storage.foldername(name))[1] = 'avatars'` ensures files cannot be uploaded outside the `avatars/` prefix.
  - **Ownership Binding:** `storage.filename(name)` must start with `auth.uid()`. User A cannot upload a file targeting User B’s identifier.

### Policy 3: UPDATE (Overwrite / Replace)
- **Policy Name:** `"Users can update own avatar in public-assets"`
- **Target Role:** `authenticated`
- **Command:** `UPDATE`
- **USING & WITH CHECK:** Both clauses enforce the identical single-depth and `auth.uid()` filename binding.
- **Security Guarantee:** Users can only replace their own existing avatar file.

### Policy 4: DELETE (Removal)
- **Policy Name:** `"Users can delete own avatar from public-assets"`
- **Target Role:** `authenticated`
- **Command:** `DELETE`
- **USING Clause:** Enforces identical path and `auth.uid()` ownership.
- **Security Guarantee:** Users cannot delete other users' avatars or platform assets.

---

## 3. Storage Vulnerabilities & Implementation Gaps

### Finding SEC-02: Rollback Section 6.4 Incomplete Verification for Preserved Policies
- **Location:** `supabase/phase-9.2/rollback.sql:810-821`
- **Code:**
  ```sql
  IF v_cur.cmd <> v_rec.cmd OR v_cur.roles::text[] <> v_rec.roles THEN
    RAISE EXCEPTION 'ROLLBACK POSTFLIGHT FAIL: Pre-existing storage policy "%" definition was modified!', v_rec.policyname;
  END IF;
  ```
- **Defect:** Section 6.4 asserts policy name, command, and roles, but fails to verify that `v_cur.qual` (`USING`) and `v_cur.with_check` match `v_rec.expected_definition`.
- **Remediation:** In Phase 3 implementation, update line 818 to check expression equivalence for preserved policies.

### Finding SEC-03: Storage Regex Case Sensitivity
- **Location:** `supabase/phase-9.2/migration.sql:635`
- **Code:** `~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')`
- **Defect:** In PostgreSQL, `~` is case-sensitive regular expression matching. If an image has an uppercase extension (e.g., `avatar.JPG`, `photo.PNG`), PostgreSQL rejects the upload with permission denied.
- **Remediation:**
  1. Frontend: In `authService.js:uploadAvatar`, normalize the extension to lowercase: `const ext = file.name.split('.').pop().toLowerCase()`.
  2. SQL: Update the policy regex to use `~*` (case-insensitive) for defense-in-depth.

### Finding SEC-04: Client-Side File Validation Gap
- **Location:** `src/services/authService.js:30-49` (`uploadAvatar`)
- **Defect:** `uploadAvatar` does not validate file size or MIME type before initiating the upload to Supabase Storage.
- **Remediation:** Enforce a maximum file size limit (e.g. 5 MB) and a strict MIME-type whitelist (`image/jpeg`, `image/png`, `image/webp`) in `authService.js`.

---

## 4. Product Images and Admin Media Storage

- **Audit Finding:** Product images in `AdminProductsPage.jsx` and `adminService.js` are currently saved as external URL strings (`image_url` on `product_images`) rather than direct file uploads into `storage.objects`.
- **Implication:** The `public-assets` bucket policies strictly govern user avatar media. There are currently no public upload attack surfaces for product catalog media.
