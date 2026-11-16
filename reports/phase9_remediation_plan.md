# ShopKart — Phase 9: Security Remediation Plan

**Plan Date:** 2026-11-09  
**Target Environment:** ShopKart-Staging (Supabase PostgreSQL)  
**Status:** Audit & Remediation Recommendations  
**Additive Migration Prepared:** `database/migrations/phase9_security_hardening.sql`

---

## 1. Remediation Matrix

| Issue ID | Confirmed Issue | Severity | Affected Object / File | Migration Required? | Remediation Summary |
|---|---|---|---|---|---|
| **SEC-01** | Avatar storage bucket RLS policies not tracked in repository migrations | **MEDIUM** | Supabase Storage (`storage.objects`, bucket `public-assets`) | **YES** | Create additive RLS policies on `storage.objects` to enforce avatar path matching: `bucket_id = 'public-assets'` and filename prefix matching `auth.uid()::text`. |
| **SEC-02** | Admin catalog policies omit explicit `TO authenticated` clause | **LOW** | `categories`, `products`, `product_images`, `product_variants`, `inventory`, `coupons`, `banners`, `reviews` | **YES** | Recreate admin policies on catalog tables with explicit `TO authenticated` clause so `anon` visitors do not evaluate admin checks. |
| **SEC-03** | `public.is_admin()` not executable by `anon` role | **LOW** | `public.is_admin()` | **YES** | `GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;` to prevent policy evaluation permission issues during unauthenticated browsing. |
| **SEC-04** | Table owner RLS bypass not explicitly forced on sensitive tables | **INFO** | `profiles`, `addresses`, `carts`, `cart_items`, `orders`, `order_items`, `payments` | **YES** | Add `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` across sensitive customer tables as a defense-in-depth measure. |
| **SEC-05** | Online payment flow is simulated in frontend prior to gateway launch | **INFO** | `CheckoutPage.jsx`, `orderService.js` | **NO** (Architecture Task) | Implement server-side Razorpay webhook handler to verify HMAC SHA-256 signature and insert authoritative `payments` records before advancing orders to `processing`. |

---

## 2. Detailed Remediation Specifications

### SEC-01: Supabase Storage RLS Policies
- **Problem**: Avatar upload helper in `src/services/authService.js` writes to `public-assets/avatars/${userId}.${ext}` with `{ upsert: true }`. If the bucket was created in the Supabase Studio dashboard without explicit row-level policies on `storage.objects`, any authenticated user could upload or overwrite avatars for arbitrary user IDs.
- **Severity**: **MEDIUM**
- **Recommended Correction**:
  Execute Section 3 of `database/migrations/phase9_security_hardening.sql`:
  ```sql
  CREATE POLICY "Users can upload own avatar"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'public-assets'
      AND (storage.foldername(name))[1] = 'avatars'
      AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')
    );

  CREATE POLICY "Users can update own avatar"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'public-assets'
      AND (storage.foldername(name))[1] = 'avatars'
      AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')
    )
    WITH CHECK (
      bucket_id = 'public-assets'
      AND (storage.foldername(name))[1] = 'avatars'
      AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')
    );

  CREATE POLICY "Users can delete own avatar"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'public-assets'
      AND (storage.foldername(name))[1] = 'avatars'
      AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')
    );
  ```
- **Staging Verification**:
  1. Authenticate as Customer 1 in Staging. Upload an avatar. Confirm upload succeeds.
  2. Attempt to upload a file to `avatars/<customer-2-uuid>.png` using Customer 1's session. Verify that Supabase rejects the upload with RLS violation.

---

### SEC-02 & SEC-03: Scope Admin Policies and Grant `is_admin()` to `anon`
- **Problem**: In PostgreSQL, when an RLS policy does not specify `TO <role>`, it defaults to `PUBLIC` (applying to all roles, including `anon`). Because `categories`, `products`, `banners`, etc., have admin policies calling `is_admin()`, an anonymous guest query evaluates the admin policy. If `is_admin()` is not granted to `anon`, this can cause permission errors or unnecessary evaluation.
- **Severity**: **LOW**
- **Recommended Correction**:
  Execute Sections 1 and 2 of `database/migrations/phase9_security_hardening.sql`:
  1. `GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;`
  2. Recreate admin policies with `TO authenticated`:
     ```sql
     CREATE POLICY "Admins full access to products"
       ON public.products FOR ALL
       TO authenticated
       USING (public.is_admin())
       WITH CHECK (public.is_admin());
     ```
- **Staging Verification**:
  1. In an incognito browser window (unauthenticated `anon` session), browse `/`, `/category/electronics`, and `/search`.
  2. Verify that categories, products, banners, and reviews load without any permission warnings in the browser console.

---

### SEC-04: Defense-in-Depth Table Owner RLS Enforcement
- **Problem**: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` enforces policies on regular roles (`anon`, `authenticated`), but by default PostgreSQL allows the table owner to bypass RLS.
- **Severity**: **INFO**
- **Recommended Correction**:
  Execute Section 4 of `database/migrations/phase9_security_hardening.sql`:
  ```sql
  ALTER TABLE public.profiles     FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.addresses    FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.carts        FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.cart_items   FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.orders       FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.order_items  FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.payments     FORCE ROW LEVEL SECURITY;
  ```
- **Staging Verification**:
  Verify via PostgreSQL catalog query:
  ```sql
  SELECT relname, relrowsecurity, relforcerowsecurity 
  FROM pg_class 
  WHERE relname IN ('profiles', 'orders', 'payments');
  ```
  Confirm `relrowsecurity = true` and `relforcerowsecurity = true`.

---

### SEC-05: Payment Architecture Readiness for Razorpay (Phase 10)
- **Problem**: The frontend checkout currently offers Cash on Delivery (COD) and Simulated Online Payment. In both cases, orders are created in `'pending'` status with the payment method stored in `notes`. Direct browser insertion into `public.payments` is correctly blocked by RLS.
- **Severity**: **INFO** (Architectural prerequisite for live gateway launch)
- **Recommended Implementation for Phase 10**:
  1. Maintain current RLS rules on `public.payments` (no customer insert/update).
  2. Deploy a Supabase Edge Function (`create-razorpay-order`) that uses the server-side `RAZORPAY_KEY_SECRET` to generate an official Razorpay order ID.
  3. Deploy a Supabase Edge Function / Webhook (`verify-razorpay-payment`) that receives Razorpay payment callbacks, verifies the HMAC SHA-256 signature using the secret, inserts an authoritative row into `public.payments` with `status = 'completed'`, and advances the order status to `'processing'`.
- **Staging Verification**:
  Perform end-to-end sandbox payment testing with Razorpay test credentials in Phase 10.

---

## 3. Execution Instructions for Staging Deployment

1. Open the **Supabase Dashboard** for the `ShopKart-Staging` project.
2. Navigate to **SQL Editor** $\rightarrow$ **New Query**.
3. Paste the contents of [`database/migrations/phase9_security_hardening.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/migrations/phase9_security_hardening.sql).
4. Click **Run**.
5. Verify that all policies and grants apply without errors.
