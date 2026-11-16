-- ═══════════════════════════════════════════════════════════════════
-- ShopKart — Phase 9: Database Security Hardening & Storage Policies
-- Migration File: database/migrations/phase9_security_hardening.sql
--
-- TARGET: Supabase PostgreSQL (Staging / Production)
-- STATUS: PREPARED / AUDIT REMEDIATION (DO NOT EXECUTE AUTOMATICALLY)
--
-- This additive migration addresses defense-in-depth hardening identified
-- during the Phase 9 Complete Database Security & RLS Audit:
--
-- 1. Explicit Role Scoping on Admin Policies:
--    Ensures admin policies on publicly queryable catalog tables specify
--    `TO authenticated` so unauthenticated (`anon`) visitors never evaluate
--    administrative policies or encounter permission barriers on is_admin().
--
-- 2. Safe is_admin() Execution for Anonymous Callers:
--    Grants EXECUTE on public.is_admin() to `anon` as defense-in-depth.
--    Because is_admin() strictly checks `auth.uid()`, anonymous calls
--    safely evaluate to FALSE with zero data exposure.
--
-- 3. Supabase Storage RLS Policies for Avatar Uploads:
--    Defines strict RLS policies on `storage.objects` for the `public-assets`
--    bucket used by uploadAvatar():
--      - Public read access for avatars.
--      - Authenticated upload/update/delete restricted to `avatars/<auth.uid>.*`.
--      - Full administrative management.
--
-- 4. Defense-in-Depth Table Owner RLS Enforcement:
--    Enforces FORCE ROW LEVEL SECURITY on sensitive customer tables
--    (profiles, addresses, carts, cart_items, orders, order_items, payments).
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. GRANT EXECUTE ON is_admin() TO anon (Defense-in-Depth)
-- ─────────────────────────────────────────────────────────────────
-- Completely safe: when auth.uid() is NULL, function evaluates to FALSE.
-- Prevents "permission denied for function is_admin" during guest policy evaluation.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;


-- ─────────────────────────────────────────────────────────────────
-- 2. SCOPE ADMIN CATALOG POLICIES EXPLICITLY TO authenticated ROLE
-- ─────────────────────────────────────────────────────────────────
-- Drops and recreates admin policies with explicit `TO authenticated` clause.

-- Categories
DROP POLICY IF EXISTS "Admins full access to categories" ON public.categories;
CREATE POLICY "Admins full access to categories"
  ON public.categories FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Products
DROP POLICY IF EXISTS "Admins full access to products" ON public.products;
CREATE POLICY "Admins full access to products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Product Images
DROP POLICY IF EXISTS "Admins full access to product images" ON public.product_images;
CREATE POLICY "Admins full access to product images"
  ON public.product_images FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Product Variants
DROP POLICY IF EXISTS "Admins full access to product variants" ON public.product_variants;
CREATE POLICY "Admins full access to product variants"
  ON public.product_variants FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Inventory
DROP POLICY IF EXISTS "Admins full access to inventory" ON public.inventory;
CREATE POLICY "Admins full access to inventory"
  ON public.inventory FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Coupons
DROP POLICY IF EXISTS "Admins full access to coupons" ON public.coupons;
CREATE POLICY "Admins full access to coupons"
  ON public.coupons FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Banners
DROP POLICY IF EXISTS "Admins full access to banners" ON public.banners;
CREATE POLICY "Admins full access to banners"
  ON public.banners FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Reviews
DROP POLICY IF EXISTS "Admins full access to reviews" ON public.reviews;
CREATE POLICY "Admins full access to reviews"
  ON public.reviews FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────
-- 3. SUPABASE STORAGE RLS POLICIES FOR public-assets BUCKET
-- ─────────────────────────────────────────────────────────────────
-- Ensures avatar uploads are strictly owned and managed by the uploader.

-- Create bucket if not present
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-assets', 'public-assets', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- Policy 1: Public Read Access on public-assets
DROP POLICY IF EXISTS "Public can view public-assets" ON storage.objects;
CREATE POLICY "Public can view public-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'public-assets');

-- Policy 2: Authenticated Users Upload strictly their own Avatar
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'public-assets'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')
  );

-- Policy 3: Authenticated Users Update strictly their own Avatar
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
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

-- Policy 4: Authenticated Users Delete strictly their own Avatar
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'public-assets'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (storage.filename(name)) LIKE (auth.uid()::text || '.%')
  );

-- Policy 5: Admins Have Full Control on public-assets
DROP POLICY IF EXISTS "Admins full access to public-assets storage" ON storage.objects;
CREATE POLICY "Admins full access to public-assets storage"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'public-assets' AND public.is_admin())
  WITH CHECK (bucket_id = 'public-assets' AND public.is_admin());


-- ─────────────────────────────────────────────────────────────────
-- 4. DEFENSE-IN-DEPTH: FORCE ROW LEVEL SECURITY ON CUSTOMER TABLES
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.addresses    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.carts        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments     FORCE ROW LEVEL SECURITY;
