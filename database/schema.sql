-- =============================================================
-- ShopKart — Supabase PostgreSQL Schema (Production-Hardened)
-- =============================================================
-- REVIEW BEFORE APPLYING.
-- Apply via: Supabase Dashboard → SQL Editor → Run
--
-- Re-runnable policy/function/trigger setup:
--   - Tables use CREATE TABLE IF NOT EXISTS (does NOT migrate existing columns)
--   - Functions use CREATE OR REPLACE FUNCTION with fixed search_path
--   - Triggers are safely dropped before re-creation
--   - Existing policies on the 17 application tables are removed before
--     the reviewed policy set is recreated
-- REVIEW existing database structure before using this on a live project.
--
-- Tables (17):
--   1. profiles          7. inventory        13. order_items
--   2. addresses         8. carts            14. payments
--   3. categories        9. cart_items       15. reviews
--   4. products         10. wishlists        16. banners
--   5. product_images   11. wishlist_items   17. coupons
--   6. product_variants 12. orders
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- Note: gen_random_uuid() is built into PostgreSQL 13+ (standard in Supabase)

-- ─────────────────────────────────────────────────────────────
-- HELPER: updated_at trigger function
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES (extends auth.users)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('customer', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. ADDRESSES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label         TEXT,
  full_name     TEXT NOT NULL,
  phone         TEXT NOT NULL,
  line1         TEXT NOT NULL,
  line2         TEXT,
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  pincode       TEXT NOT NULL,
  country       TEXT NOT NULL DEFAULT 'India',
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS addresses_updated_at ON addresses;
CREATE TRIGGER addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. CATEGORIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  slug          TEXT NOT NULL UNIQUE,
  image_url     TEXT,
  parent_id     INT REFERENCES categories(id) ON DELETE SET NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS categories_updated_at ON categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_categories_slug   ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

-- ─────────────────────────────────────────────────────────────
-- 4. PRODUCTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      INT REFERENCES categories(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT,
  price            NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  original_price   NUMERIC(12,2) CHECK (original_price >= 0),
  discount_percent INT CHECK (discount_percent BETWEEN 0 AND 100),
  rating           NUMERIC(3,2) DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  review_count     INT DEFAULT 0 CHECK (review_count >= 0),
  badge            TEXT,
  is_featured      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_products_slug      ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active    ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_featured  ON products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- 5. PRODUCT IMAGES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  alt_text    TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- ─────────────────────────────────────────────────────────────
-- 6. PRODUCT VARIANTS (size, color, storage, etc.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_type  TEXT NOT NULL,
  variant_value TEXT NOT NULL,
  price_delta   NUMERIC(10,2) NOT NULL DEFAULT 0,
  sku           TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS product_variants_updated_at ON product_variants;
CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- ─────────────────────────────────────────────────────────────
-- 7. INVENTORY (separated from product catalog descriptions)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id    UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity      INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_at  INT NOT NULL DEFAULT 5,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, variant_id)
);

DROP TRIGGER IF EXISTS inventory_updated_at ON inventory;
CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);

-- Partial index to enforce one inventory row per product when variant_id is NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_no_variant
  ON inventory(product_id) WHERE variant_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 8. CARTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  session_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS carts_updated_at ON carts;
CREATE TRIGGER carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_carts_session
  ON carts(session_id) WHERE session_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 9. CART ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity    INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

-- Partial index to enforce uniqueness when variant_id is NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_no_variant
  ON cart_items(cart_id, product_id) WHERE variant_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 10. WISHLISTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 11. WISHLIST ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wishlist_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);

-- ─────────────────────────────────────────────────────────────
-- 12. COUPONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value  NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_value NUMERIC(10,2) DEFAULT 0 CHECK (min_order_value >= 0),
  max_uses        INT CHECK (max_uses IS NULL OR max_uses > 0),
  used_count      INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS coupons_updated_at ON coupons;
CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- ─────────────────────────────────────────────────────────────
-- 13. ORDERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  address_id      UUID REFERENCES addresses(id) ON DELETE SET NULL,
  coupon_id       UUID REFERENCES coupons(id)   ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','shipped','delivered','cancelled','refunded')),
  subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  total_amount    NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_orders_user    ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 14. ORDER ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id    UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity      INT NOT NULL CHECK (quantity >= 1),
  total_price   NUMERIC(12,2) NOT NULL CHECK (total_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ─────────────────────────────────────────────────────────────
-- 15. PAYMENTS
-- Note: ON DELETE RESTRICT preserves payment audit history
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider            TEXT NOT NULL,
  provider_payment_id TEXT,
  amount              NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','completed','failed','refunded')),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- ─────────────────────────────────────────────────────────────
-- 16. REVIEWS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  body        TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, user_id)
);

DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user    ON reviews(user_id);

-- ─────────────────────────────────────────────────────────────
-- 17. BANNERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  cta         TEXT,
  cta_link    TEXT,
  image_url   TEXT,
  bg_from     TEXT DEFAULT '#1e3a5f',
  bg_to       TEXT DEFAULT '#2563eb',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS banners_updated_at ON banners;
CREATE TRIGGER banners_updated_at
  BEFORE UPDATE ON banners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(is_active, sort_order);


-- =============================================================
-- FUNCTIONS & SECURITY TRIGGERS
-- =============================================================

-- ── Admin Authorization Helper ───────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ── Role Self-Escalation Prevention Trigger ───────────────────
-- Strictly prevents non-admins from changing the role column
CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Only administrators can modify user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_role_escalation ON profiles;
CREATE TRIGGER guard_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();

-- ── Auto-Profile Creation on Signup ──────────────────────────
-- Always forces role to 'customer', ignoring any raw metadata role tampering
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup();


-- ── Trusted checkout RPC ──────────────────────────────────────
-- Browser clients must call this function instead of inserting orders or
-- order_items directly. It derives prices from products/variants, validates
-- address ownership and stock, locks inventory rows, creates order snapshots,
-- decrements stock, and clears the user's cart in one transaction.
CREATE OR REPLACE FUNCTION public.place_order(
  p_address_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cart_id UUID;
  v_order_id UUID;
  v_subtotal NUMERIC(12,2) := 0;
  v_unit_price NUMERIC(12,2);
  v_product_name TEXT;
  v_stock INT;
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.addresses
    WHERE id = p_address_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Invalid delivery address';
  END IF;

  SELECT id INTO v_cart_id
  FROM public.carts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'Cart not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cart_items WHERE cart_id = v_cart_id
  ) THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- First pass: validate every product and lock every inventory row before
  -- calculating the total. Locks remain held until the transaction finishes.
  FOR v_item IN
    SELECT ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = v_cart_id
    ORDER BY ci.product_id, ci.variant_id
  LOOP
    SELECT p.price + COALESCE(pv.price_delta, 0), p.name
      INTO v_unit_price, v_product_name
    FROM public.products p
    LEFT JOIN public.product_variants pv
      ON pv.id = v_item.variant_id AND pv.product_id = p.id
    WHERE p.id = v_item.product_id
      AND p.is_active = TRUE
      AND (v_item.variant_id IS NULL OR pv.id IS NOT NULL);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A cart product or variant is unavailable';
    END IF;

    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Invalid product price';
    END IF;

    SELECT quantity INTO v_stock
    FROM public.inventory
    WHERE product_id = v_item.product_id
      AND variant_id IS NOT DISTINCT FROM v_item.variant_id
    FOR UPDATE;

    IF NOT FOUND OR v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient or unconfigured inventory for product %', v_item.product_id;
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);
  END LOOP;

  INSERT INTO public.orders (
    user_id, address_id, status, subtotal, discount_amount,
    tax_amount, shipping_amount, total_amount, notes
  )
  VALUES (
    v_user_id, p_address_id, 'pending', v_subtotal, 0,
    0, 0, v_subtotal, p_notes
  )
  RETURNING id INTO v_order_id;

  -- Second pass: write trusted line-item snapshots and reserve stock.
  FOR v_item IN
    SELECT ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = v_cart_id
    ORDER BY ci.product_id, ci.variant_id
  LOOP
    SELECT p.price + COALESCE(pv.price_delta, 0), p.name
      INTO v_unit_price, v_product_name
    FROM public.products p
    LEFT JOIN public.product_variants pv
      ON pv.id = v_item.variant_id AND pv.product_id = p.id
    WHERE p.id = v_item.product_id
      AND p.is_active = TRUE
      AND (v_item.variant_id IS NULL OR pv.id IS NOT NULL);

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name,
      unit_price, quantity, total_price
    )
    VALUES (
      v_order_id, v_item.product_id, v_item.variant_id, v_product_name,
      v_unit_price, v_item.quantity, v_unit_price * v_item.quantity
    );

    UPDATE public.inventory
    SET quantity = quantity - v_item.quantity
    WHERE product_id = v_item.product_id
      AND variant_id IS NOT DISTINCT FROM v_item.variant_id;
  END LOOP;

  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, TEXT) TO authenticated;


-- =============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================

-- Enable RLS across all 17 tables
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory        ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners          ENABLE ROW LEVEL SECURITY;


-- ═════════════════════════════════════════════════════════════
-- 1. PUBLIC READ POLICIES (Catalog & Marketing Data)
-- ═════════════════════════════════════════════════════════════

-- Categories
DROP POLICY IF EXISTS "Public can view active categories" ON categories;
CREATE POLICY "Public can view active categories"
  ON categories FOR SELECT
  USING (is_active = TRUE);

-- Products
DROP POLICY IF EXISTS "Public can view active products" ON products;
CREATE POLICY "Public can view active products"
  ON products FOR SELECT
  USING (is_active = TRUE);

-- Product Images (scoped strictly to active products)
DROP POLICY IF EXISTS "Public can view product images" ON product_images;
DROP POLICY IF EXISTS "Public can view images of active products" ON product_images;
CREATE POLICY "Public can view images of active products"
  ON product_images FOR SELECT
  USING (product_id IN (SELECT id FROM products WHERE is_active = TRUE));

-- Product Variants (scoped strictly to active products)
DROP POLICY IF EXISTS "Public can view product variants" ON product_variants;
DROP POLICY IF EXISTS "Public can view variants of active products" ON product_variants;
CREATE POLICY "Public can view variants of active products"
  ON product_variants FOR SELECT
  USING (product_id IN (SELECT id FROM products WHERE is_active = TRUE));

-- Inventory (scoped strictly to active products)
DROP POLICY IF EXISTS "Public can view inventory" ON inventory;
DROP POLICY IF EXISTS "Public can view inventory (quantity only)" ON inventory;
DROP POLICY IF EXISTS "Public can view inventory of active products" ON inventory;
CREATE POLICY "Public can view inventory of active products"
  ON inventory FOR SELECT
  USING (product_id IN (SELECT id FROM products WHERE is_active = TRUE));

-- Banners (active and currently scheduled)
DROP POLICY IF EXISTS "Public can view active banners" ON banners;
CREATE POLICY "Public can view active banners"
  ON banners FOR SELECT
  USING (
    is_active = TRUE
    AND (starts_at IS NULL OR starts_at <= NOW())
    AND (ends_at   IS NULL OR ends_at   >  NOW())
  );

-- Coupons (active and unexpired)
DROP POLICY IF EXISTS "Public can view active valid coupons" ON coupons;
CREATE POLICY "Public can view active valid coupons"
  ON coupons FOR SELECT
  USING (
    is_active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Reviews (approved reviews are public)
DROP POLICY IF EXISTS "Public can view approved reviews" ON reviews;
CREATE POLICY "Public can view approved reviews"
  ON reviews FOR SELECT
  USING (is_approved = TRUE);

-- Do not expose profiles publicly. The profiles table contains private fields
-- such as phone numbers. Public reviewer display data should be served through
-- a separately designed, column-limited view or RPC if needed.


-- ═════════════════════════════════════════════════════════════
-- 2. CUSTOMER DATA POLICIES (Strict Self-Ownership)
-- ═════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own profile" ON profiles;
CREATE POLICY "Users view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
-- Note: guard_role_escalation trigger rejects any update that changes role

-- ── addresses ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own addresses" ON addresses;
DROP POLICY IF EXISTS "Users view own addresses" ON addresses;
DROP POLICY IF EXISTS "Users insert own addresses" ON addresses;
DROP POLICY IF EXISTS "Users update own addresses" ON addresses;
DROP POLICY IF EXISTS "Users delete own addresses" ON addresses;

CREATE POLICY "Users view own addresses"
  ON addresses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own addresses"
  ON addresses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own addresses"
  ON addresses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own addresses"
  ON addresses FOR DELETE
  USING (auth.uid() = user_id);

-- ── carts ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own cart" ON carts;
DROP POLICY IF EXISTS "Users view own cart" ON carts;
DROP POLICY IF EXISTS "Users insert own cart" ON carts;
DROP POLICY IF EXISTS "Users update own cart" ON carts;
DROP POLICY IF EXISTS "Users delete own cart" ON carts;

CREATE POLICY "Users view own cart"
  ON carts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own cart"
  ON carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own cart"
  ON carts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own cart"
  ON carts FOR DELETE
  USING (auth.uid() = user_id);

-- ── cart_items ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users view own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users insert own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users update own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users delete own cart items" ON cart_items;

CREATE POLICY "Users view own cart items"
  ON cart_items FOR SELECT
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

CREATE POLICY "Users insert own cart items"
  ON cart_items FOR INSERT
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

CREATE POLICY "Users update own cart items"
  ON cart_items FOR UPDATE
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()))
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

CREATE POLICY "Users delete own cart items"
  ON cart_items FOR DELETE
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

-- ── wishlists ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own wishlist" ON wishlists;
DROP POLICY IF EXISTS "Users view own wishlist" ON wishlists;
DROP POLICY IF EXISTS "Users insert own wishlist" ON wishlists;
DROP POLICY IF EXISTS "Users delete own wishlist" ON wishlists;

CREATE POLICY "Users view own wishlist"
  ON wishlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own wishlist"
  ON wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own wishlist"
  ON wishlists FOR DELETE
  USING (auth.uid() = user_id);

-- ── wishlist_items ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own wishlist items" ON wishlist_items;
DROP POLICY IF EXISTS "Users view own wishlist items" ON wishlist_items;
DROP POLICY IF EXISTS "Users insert own wishlist items" ON wishlist_items;
DROP POLICY IF EXISTS "Users delete own wishlist items" ON wishlist_items;

CREATE POLICY "Users view own wishlist items"
  ON wishlist_items FOR SELECT
  USING (wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid()));

CREATE POLICY "Users insert own wishlist items"
  ON wishlist_items FOR INSERT
  WITH CHECK (wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid()));

CREATE POLICY "Users delete own wishlist items"
  ON wishlist_items FOR DELETE
  USING (wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid()));

-- ── orders (Checkout Security) ──────────────────────────────
-- Customers can ONLY view their own orders
DROP POLICY IF EXISTS "Users view own orders" ON orders;
CREATE POLICY "Users view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

-- Customers cannot insert orders directly. Use the place_order() RPC below,
-- which calculates prices from the database and checks stock transactionally.
DROP POLICY IF EXISTS "Users create own orders" ON orders;

-- Customers CANNOT update or delete orders directly.

-- ── order_items ─────────────────────────────────────────────
-- Customers can view items in their own orders
DROP POLICY IF EXISTS "Users view own order items" ON order_items;
CREATE POLICY "Users view own order items"
  ON order_items FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

-- Customers cannot insert order items directly. place_order() creates
-- immutable snapshots of product names and prices from trusted database values.
DROP POLICY IF EXISTS "Users create own order items" ON order_items;

-- Customers CANNOT update or delete order items directly.

-- ── payments ────────────────────────────────────────────────
-- Customers can view payment records for their own orders
DROP POLICY IF EXISTS "Users view own payments" ON payments;
CREATE POLICY "Users view own payments"
  ON payments FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

-- Customers cannot create or modify payment records. Create/update payment
-- rows only from a trusted server-side payment integration (Edge Function /
-- webhook using a server credential), never from the browser.
DROP POLICY IF EXISTS "Users create own payments" ON payments;

-- Customers CANNOT update or delete payments.

-- ── reviews ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users create own reviews" ON reviews;
DROP POLICY IF EXISTS "Users update own reviews" ON reviews;
DROP POLICY IF EXISTS "Users delete own reviews" ON reviews;

-- Customers can view their own pending/unapproved reviews
DROP POLICY IF EXISTS "Users view own reviews" ON reviews;
CREATE POLICY "Users view own reviews"
  ON reviews FOR SELECT
  USING (auth.uid() = user_id);

-- Customers can insert reviews only for themselves, and is_approved MUST be false
CREATE POLICY "Users create own reviews"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_approved = FALSE
  );

-- Customers can update their own reviews, but cannot self-approve
CREATE POLICY "Users update own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND is_approved = FALSE
  );

-- Customers can delete their own reviews
CREATE POLICY "Users delete own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);


-- ═════════════════════════════════════════════════════════════
-- 3. ADMIN POLICIES (Full Management with Explicit WITH CHECK)
-- ═════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (is_admin());

-- ── categories ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to categories" ON categories;
DROP POLICY IF EXISTS "Admins full access to categories" ON categories;
CREATE POLICY "Admins full access to categories"
  ON categories FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── products ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to products" ON products;
DROP POLICY IF EXISTS "Admins full access to products" ON products;
CREATE POLICY "Admins full access to products"
  ON products FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── product_images ──────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to product images" ON product_images;
DROP POLICY IF EXISTS "Admins full access to product images" ON product_images;
CREATE POLICY "Admins full access to product images"
  ON product_images FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── product_variants ────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to product variants" ON product_variants;
DROP POLICY IF EXISTS "Admins full access to product variants" ON product_variants;
CREATE POLICY "Admins full access to product variants"
  ON product_variants FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── inventory ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to inventory" ON inventory;
DROP POLICY IF EXISTS "Admins full access to inventory" ON inventory;
CREATE POLICY "Admins full access to inventory"
  ON inventory FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── orders ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to orders" ON orders;
DROP POLICY IF EXISTS "Admins full access to orders" ON orders;
CREATE POLICY "Admins full access to orders"
  ON orders FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── order_items ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to order items" ON order_items;
DROP POLICY IF EXISTS "Admins full access to order items" ON order_items;
CREATE POLICY "Admins full access to order items"
  ON order_items FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── payments ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to payments" ON payments;
DROP POLICY IF EXISTS "Admins full access to payments" ON payments;
CREATE POLICY "Admins full access to payments"
  ON payments FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── reviews ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to reviews" ON reviews;
DROP POLICY IF EXISTS "Admins full access to reviews" ON reviews;
CREATE POLICY "Admins full access to reviews"
  ON reviews FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── banners ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to banners" ON banners;
DROP POLICY IF EXISTS "Admins full access to banners" ON banners;
CREATE POLICY "Admins full access to banners"
  ON banners FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── coupons ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins have full access to coupons" ON coupons;
DROP POLICY IF EXISTS "Admins full access to coupons" ON coupons;
CREATE POLICY "Admins full access to coupons"
  ON coupons FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── addresses (Admin can view all for delivery fulfillment) ─
DROP POLICY IF EXISTS "Admins can view all addresses" ON addresses;
CREATE POLICY "Admins can view all addresses"
  ON addresses FOR SELECT
  USING (is_admin());

-- ── carts (Admin can view for customer support) ─────────────
DROP POLICY IF EXISTS "Admins can view all carts" ON carts;
DROP POLICY IF EXISTS "Admins can view all cart items" ON cart_items;
CREATE POLICY "Admins can view all carts"
  ON carts FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can view all cart items"
  ON cart_items FOR SELECT
  USING (is_admin());

-- ── wishlists (Admin can view for analytics) ────────────────
DROP POLICY IF EXISTS "Admins can view all wishlists" ON wishlists;
DROP POLICY IF EXISTS "Admins can view all wishlist items" ON wishlist_items;
CREATE POLICY "Admins can view all wishlists"
  ON wishlists FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can view all wishlist items"
  ON wishlist_items FOR SELECT
  USING (is_admin());


-- =============================================================
-- IMPORTANT OPERATIONAL NOTES
-- =============================================================
-- 1. This file does not promote an admin automatically. After creating the
--    intended administrator account, promote it manually from the Supabase
--    SQL Editor using a trusted project-owner session:
--      UPDATE public.profiles SET role = 'admin'
--      WHERE id = '<trusted-auth-user-uuid>';
-- 2. Never expose the service_role key in the browser.
-- 3. Payment creation/status updates must come from a trusted server-side
--    payment integration/webhook, not a browser client.
-- 4. place_order() currently applies no coupon, tax, or shipping calculation.
--    Those business rules must be implemented and tested before real checkout.
-- 5. CREATE TABLE IF NOT EXISTS does not alter an already-existing table.
--    Review/migrate existing columns and constraints separately.
-- 6. Public reviewer names/avatars are intentionally not exposed by profiles.
--    Add a column-limited public view/RPC if the storefront needs that display.

-- =============================================================
-- END OF SCHEMA
-- =============================================================
