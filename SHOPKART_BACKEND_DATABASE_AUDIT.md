# ShopKart — Phase 2: Backend & Database Deep Audit
## Document 1: Comprehensive Database Schema & Structural Audit

**Audit Status:** COMPLETE  
**Audit Mode:** STRICTLY READ-ONLY (No code modified, no remote SQL executed)  
**Database Engine:** PostgreSQL 15+ (Supabase)  
**Audited Baseline:** `database/schema.sql` (1,067 lines) & `database/migrations/*.sql`

---

## 1. Executive Summary: Schema Architecture

The ShopKart relational schema consists of **17 public tables** designed to support an enterprise e-commerce workflow: identity profiles, shipping addresses, hierarchical product catalogs, product variants, inventory, shopping carts, wishlists, promotional coupons, order processing, payments, reviews, and promotional hero banners.

### Primary Architectural Characteristics
1. **Primary Key Strategy:** 15 tables utilize `UUID` primary keys with `DEFAULT gen_random_uuid()` (or `REFERENCES auth.users(id)` for `profiles`). Two tables (`categories` and `banners`) utilize legacy PostgreSQL `SERIAL` (auto-incrementing 32-bit integers).
2. **Foreign Key Integrity:** Extensive use of foreign key constraints with explicit `ON DELETE CASCADE`, `ON DELETE SET NULL`, and `ON DELETE RESTRICT` clauses.
3. **Data Type Selection:** Monetary values uniformly employ `NUMERIC(12,2)` or `NUMERIC(10,2)` (avoiding IEEE 754 floating-point inaccuracies). Timestamps uniformly utilize `TIMESTAMPTZ` (UTC-aware).
4. **Security Enforcement:** Row-Level Security (RLS) is explicitly enabled on all 17 public tables via `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`.
5. **Audit Triggers:** 12 tables have automated `BEFORE UPDATE` triggers executing `public.set_updated_at()`.

---

## 2. Table-by-Table Structural Audit (17 Public Tables)

### Table 1: `public.profiles`
- **Location:** `database/schema.sql:46-56`
- **Purpose:** Stores customer and administrator profile metadata extending `auth.users`.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | None | `PRIMARY KEY`, `REFERENCES auth.users(id) ON DELETE CASCADE` |
  | `full_name` | `TEXT` | `NULL` | None | None |
  | `phone` | `TEXT` | `NULL` | None | None |
  | `avatar_url`| `TEXT` | `NULL` | None | None |
  | `role` | `TEXT` | `NOT NULL` | `'customer'` | `CHECK (role IN ('customer', 'admin'))` |
  | `created_at`| `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
  | `updated_at`| `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `profiles_pkey` on `id` (Primary Key).
- **Triggers:**
  - `profiles_updated_at`: `BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:58`)
  - `guard_role_escalation`: `BEFORE UPDATE OF role ON profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();` (`schema.sql:451`)
- **Integrity Observations:**
  - Deleting an `auth.users` row cascades and completely purges the user profile.
  - Role escalation is strictly defended at the trigger level (`prevent_role_self_escalation`).

---

### Table 2: `public.addresses`
- **Location:** `database/schema.sql:65-81`
- **Purpose:** Customer shipping and billing address directory.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `user_id` | `UUID` | `NOT NULL` | None | `REFERENCES profiles(id) ON DELETE CASCADE` |
  | `label` | `TEXT` | `NULL` | None | e.g., 'Home', 'Work' |
  | `full_name` | `TEXT` | `NOT NULL` | None | Recipient name |
  | `phone` | `TEXT` | `NOT NULL` | None | Contact phone |
  | `line1` | `TEXT` | `NOT NULL` | None | Street address |
  | `line2` | `TEXT` | `NULL` | None | Apt/Suite/Unit |
  | `city` | `TEXT` | `NOT NULL` | None | City name |
  | `state` | `TEXT` | `NOT NULL` | None | State / Province |
  | `pincode` | `TEXT` | `NOT NULL` | None | Postal code |
  | `country` | `TEXT` | `NOT NULL` | `'India'` | Default destination |
  | `is_default`| `BOOLEAN` | `NOT NULL` | `FALSE` | Primary address flag |
  | `created_at`| `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
  | `updated_at`| `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `addresses_pkey` on `id`
  - `idx_addresses_user` on `addresses(user_id)` (`schema.sql:87`)
- **Triggers:**
  - `addresses_updated_at`: `BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:83`)
- **Integrity Observations:**
  - No database-level partial unique constraint `UNIQUE (user_id) WHERE is_default = TRUE`. This permits multiple default addresses if not enforced by application logic.

---

### Table 3: `public.categories`
- **Location:** `database/schema.sql:92-103`
- **Purpose:** Hierarchical taxonomy for products.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `SERIAL` | `NOT NULL` | Auto-increment | `PRIMARY KEY` |
  | `name` | `TEXT` | `NOT NULL` | None | `UNIQUE` |
  | `slug` | `TEXT` | `NOT NULL` | None | `UNIQUE` |
  | `image_url` | `TEXT` | `NULL` | None | None |
  | `parent_id` | `INT` | `NULL` | None | `REFERENCES categories(id) ON DELETE SET NULL` |
  | `sort_order`| `INT` | `NOT NULL` | `0` | UI ordering |
  | `is_active` | `BOOLEAN` | `NOT NULL` | `TRUE` | Soft-delete / visibility flag |
  | `created_at`| `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
  | `updated_at`| `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `categories_pkey` on `id`
  - `idx_categories_slug` on `categories(slug)` (`schema.sql:109`)
  - `idx_categories_active` on `categories(is_active)` (`schema.sql:110`)
- **Triggers:**
  - `categories_updated_at`: `BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:105`)
- **Integrity Observations:**
  - Missing index on self-referential foreign key `parent_id`. Finding subcategories requires a sequential scan when category tables grow.

---

### Table 4: `public.products`
- **Location:** `database/schema.sql:115-132`
- **Purpose:** Core catalog products.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `category_id` | `INT` | `NULL` | None | `REFERENCES categories(id) ON DELETE SET NULL` |
  | `name` | `TEXT` | `NOT NULL` | None | Product title |
  | `slug` | `TEXT` | `NOT NULL` | None | `UNIQUE` |
  | `description`| `TEXT` | `NULL` | None | Detailed description |
  | `price` | `NUMERIC(12,2)` | `NOT NULL` | None | `CHECK (price >= 0)` |
  | `original_price`| `NUMERIC(12,2)`| `NULL` | None | `CHECK (original_price >= 0)` |
  | `discount_percent`| `INT` | `NULL` | None | `CHECK (discount_percent BETWEEN 0 AND 100)` |
  | `rating` | `NUMERIC(3,2)` | `NULL` | `0` | `CHECK (rating BETWEEN 0 AND 5)` |
  | `review_count`| `INT` | `NULL` | `0` | `CHECK (review_count >= 0)` |
  | `badge` | `TEXT` | `NULL` | None | e.g., 'Bestseller', 'Trending' |
  | `is_featured` | `BOOLEAN` | `NOT NULL` | `FALSE` | Featured flag |
  | `is_active` | `BOOLEAN` | `NOT NULL` | `TRUE` | Catalog visibility flag |
  | `created_at` | `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
  | `updated_at` | `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `products_pkey` on `id`
  - `idx_products_slug` on `products(slug)` (`schema.sql:138`)
  - `idx_products_category` on `products(category_id)` (`schema.sql:139`)
  - `idx_products_active` on `products(is_active)` (`schema.sql:140`)
  - `idx_products_featured` on `products(is_featured) WHERE is_featured = TRUE` (`schema.sql:141`)
  - `idx_products_name_trgm` on `products USING gin(name gin_trgm_ops)` (`schema.sql:142`)
- **Triggers:**
  - `products_updated_at`: `BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:134`)
- **Integrity Observations:**
  - `pg_trgm` extension is required and enabled (`schema.sql:3`) for the GIN trigram index on `name`.
  - `rating` and `review_count` are denormalized aggregates on `products`; updating reviews currently does not automatically recalculate these values via trigger.

---

### Table 5: `public.product_images`
- **Location:** `database/schema.sql:147-155`
- **Purpose:** Multi-image gallery for catalog items.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `product_id`| `UUID` | `NOT NULL` | None | `REFERENCES products(id) ON DELETE CASCADE` |
  | `image_url` | `TEXT` | `NOT NULL` | None | Asset URL |
  | `alt_text` | `TEXT` | `NULL` | None | Accessibility description |
  | `is_primary`| `BOOLEAN` | `NOT NULL` | `FALSE` | Primary thumbnail flag |
  | `sort_order`| `INT` | `NOT NULL` | `0` | Display order |
  | `created_at`| `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `product_images_pkey` on `id`
  - `idx_product_images_product` on `product_images(product_id)` (`schema.sql:157`)
- **Triggers:** None (immutable or static image rows).
- **Integrity Observations:**
  - Cascade delete correctly ensures purging orphaned image links when products are removed.

---

### Table 6: `public.product_variants`
- **Location:** `database/schema.sql:162-172`
- **Purpose:** SKU variants (size, color, storage, style) with price differentials.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `product_id` | `UUID` | `NOT NULL` | None | `REFERENCES products(id) ON DELETE CASCADE` |
  | `variant_type` | `TEXT` | `NOT NULL` | None | e.g. 'Size', 'Color' |
  | `variant_value`| `TEXT` | `NOT NULL` | None | e.g. 'XL', 'Blue' |
  | `price_delta` | `NUMERIC(10,2)`| `NOT NULL` | `0` | Adjustment to base price |
  | `sku` | `TEXT` | `NULL` | None | `UNIQUE` |
  | `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
  | `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `product_variants_pkey` on `id`
  - `idx_variants_product` on `product_variants(product_id)` (`schema.sql:178`)
- **Triggers:**
  - `product_variants_updated_at`: `BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:174`)

---

### Table 7: `public.inventory`
- **Location:** `database/schema.sql:183-192`
- **Purpose:** Real-time stock levels per product and variant combination.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `product_id` | `UUID` | `NOT NULL` | None | `REFERENCES products(id) ON DELETE CASCADE` |
  | `variant_id` | `UUID` | `NULL` | None | `REFERENCES product_variants(id) ON DELETE CASCADE` |
  | `quantity` | `INT` | `NOT NULL` | `0` | `CHECK (quantity >= 0)` |
  | `low_stock_at`| `INT` | `NOT NULL` | `5` | Alert threshold |
  | `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
  | Constraint | `UNIQUE (product_id, variant_id)` | | | Composite unique |
- **Indexes:**
  - `inventory_pkey` on `id`
  - `idx_inventory_product` on `inventory(product_id)` (`schema.sql:198`)
  - `idx_inventory_product_no_variant` on `inventory(product_id) WHERE variant_id IS NULL` (`schema.sql:201`)
- **Triggers:**
  - `inventory_updated_at`: `BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:194`)
- **Integrity Observations:**
  - The partial index `idx_inventory_product_no_variant` solves PostgreSQL's standard SQL NULL handling where `NULL <> NULL` prevents standard `UNIQUE (product_id, variant_id)` from enforcing uniqueness when `variant_id IS NULL`. This is a high-grade design decision.

---

### Table 8: `public.carts`
- **Location:** `database/schema.sql:207-214`
- **Purpose:** Shopping cart root record per authenticated user or guest session.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `user_id` | `UUID` | `NULL` | None | `UNIQUE`, `REFERENCES profiles(id) ON DELETE CASCADE` |
  | `session_id` | `TEXT` | `NULL` | None | Guest browser session ID |
  | `created_at` | `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
  | `updated_at` | `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `carts_pkey` on `id`
  - `idx_carts_session` on `carts(session_id) WHERE session_id IS NOT NULL` (`schema.sql:220`)
- **Triggers:**
  - `carts_updated_at`: `BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:216`)
- **Integrity Observations:**
  - `user_id` is unique: each customer has at most one persistent cart.

---

### Table 9: `public.cart_items`
- **Location:** `database/schema.sql:226-234`
- **Purpose:** Line items within a shopping cart.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `cart_id` | `UUID` | `NOT NULL` | None | `REFERENCES carts(id) ON DELETE CASCADE` |
  | `product_id` | `UUID` | `NOT NULL` | None | `REFERENCES products(id) ON DELETE CASCADE` |
  | `variant_id` | `UUID` | `NULL` | None | `REFERENCES product_variants(id) ON DELETE SET NULL` |
  | `quantity` | `INT` | `NOT NULL` | `1` | `CHECK (quantity >= 1)` |
  | `added_at` | `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
  | Constraint | `UNIQUE (cart_id, product_id, variant_id)` | | | Composite unique |
- **Indexes:**
  - `cart_items_pkey` on `id`
  - `idx_cart_items_cart` on `cart_items(cart_id)` (`schema.sql:236`)
  - `idx_cart_items_no_variant` on `cart_items(cart_id, product_id) WHERE variant_id IS NULL` (`schema.sql:239`)
- **Triggers:** None.
- **Integrity Observations:**
  - `variant_id` uses `ON DELETE SET NULL`. If a variant is deleted, the cart item remains mapped to the base product.

---

### Table 10: `public.wishlists`
- **Location:** `database/schema.sql:245-249`
- **Purpose:** Customer wishlist container.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `user_id` | `UUID` | `NOT NULL` | None | `UNIQUE`, `REFERENCES profiles(id) ON DELETE CASCADE` |
  | `created_at` | `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `wishlists_pkey` on `id`
  - Unique index implicitly generated by `user_id UNIQUE`.
- **Triggers:** None.

---

### Table 11: `public.wishlist_items`
- **Location:** `database/schema.sql:254-260`
- **Purpose:** Individual products bookmarked in customer wishlist.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `wishlist_id`| `UUID` | `NOT NULL` | None | `REFERENCES wishlists(id) ON DELETE CASCADE` |
  | `product_id` | `UUID` | `NOT NULL` | None | `REFERENCES products(id) ON DELETE CASCADE` |
  | `added_at` | `TIMESTAMPTZ`| `NOT NULL` | `NOW()` | None |
  | Constraint | `UNIQUE (wishlist_id, product_id)` | | | Prevents duplicate wishlist items |
- **Indexes:**
  - `wishlist_items_pkey` on `id`
  - `idx_wishlist_items_wishlist` on `wishlist_items(wishlist_id)` (`schema.sql:262`)
- **Triggers:** None.

---

### Table 12: `public.coupons`
- **Location:** `database/schema.sql:267-280`
- **Purpose:** Promotional discount vouchers.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `code` | `TEXT` | `NOT NULL` | None | `UNIQUE` |
  | `discount_type`| `TEXT` | `NOT NULL` | None | `CHECK (discount_type IN ('percent', 'fixed'))` |
  | `discount_value`|`NUMERIC(10,2)`| `NOT NULL` | None | `CHECK (discount_value > 0)` |
  | `min_order_value`|`NUMERIC(10,2)`| `NULL` | `0` | `CHECK (min_order_value >= 0)` |
  | `max_uses` | `INT` | `NULL` | None | `CHECK (max_uses IS NULL OR max_uses > 0)` |
  | `used_count` | `INT` | `NOT NULL` | `0` | `CHECK (used_count >= 0)` |
  | `expires_at` | `TIMESTAMPTZ` | `NULL` | None | Optional expiry timestamp |
  | `is_active` | `BOOLEAN` | `NOT NULL` | `TRUE` | Master toggle |
  | `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
  | `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `coupons_pkey` on `id`
  - `idx_coupons_code` on `coupons(code)` (`schema.sql:286`)
- **Triggers:**
  - `coupons_updated_at`: `BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:282`)

---

### Table 13: `public.orders`
- **Location:** `database/schema.sql:291-307`
- **Purpose:** Primary customer purchase ledger.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `user_id` | `UUID` | `NOT NULL` | None | `REFERENCES profiles(id) ON DELETE RESTRICT` |
  | `address_id` | `UUID` | `NULL` | None | `REFERENCES addresses(id) ON DELETE SET NULL` |
  | `coupon_id` | `UUID` | `NULL` | None | `REFERENCES coupons(id) ON DELETE SET NULL` |
  | `status` | `TEXT` | `NOT NULL` | `'pending'` | `CHECK (status IN ('pending','processing','shipped','delivered','cancelled','refunded'))` |
  | `subtotal` | `NUMERIC(12,2)`| `NOT NULL` | None | `CHECK (subtotal >= 0)` |
  | `discount_amount`|`NUMERIC(12,2)`| `NOT NULL` | `0` | `CHECK (discount_amount >= 0)` |
  | `tax_amount` | `NUMERIC(12,2)`| `NOT NULL` | `0` | `CHECK (tax_amount >= 0)` |
  | `shipping_amount`|`NUMERIC(12,2)`| `NOT NULL` | `0` | `CHECK (shipping_amount >= 0)` |
  | `total_amount` | `NUMERIC(12,2)`| `NOT NULL` | None | `CHECK (total_amount >= 0)` |
  | `notes` | `TEXT` | `NULL` | None | Order notes / instructions |
  | `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
  | `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `orders_pkey` on `id`
  - `idx_orders_user` on `orders(user_id)` (`schema.sql:313`)
  - `idx_orders_status` on `orders(status)` (`schema.sql:314`)
  - `idx_orders_created` on `orders(created_at DESC)` (`schema.sql:315`)
- **Triggers:**
  - `orders_updated_at`: `BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:309`)
  - `trg_restore_inventory_on_cancel`: `AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION restore_inventory_on_cancellation();` (Added in `phase7_backend_enhancements.sql:86` / `phase8_1_inventory_restoration_safety.sql:69`)
- **Integrity Observations:**
  - `ON DELETE RESTRICT` on `user_id` protects historical financial and purchase records from accidental profile deletion cascades.
  - Foreign keys `address_id` and `coupon_id` lack dedicated B-tree indexes, causing sequential table scans during address or coupon cascade/set-null lookups.

---

### Table 14: `public.order_items`
- **Location:** `database/schema.sql:320-329`
- **Purpose:** Snapshot of items purchased in an order.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `order_id` | `UUID` | `NOT NULL` | None | `REFERENCES orders(id) ON DELETE CASCADE` |
  | `product_id` | `UUID` | `NOT NULL` | None | `REFERENCES products(id) ON DELETE RESTRICT` |
  | `variant_id` | `UUID` | `NULL` | None | `REFERENCES product_variants(id) ON DELETE SET NULL` |
  | `product_name`| `TEXT` | `NOT NULL` | None | Snapshot of product title at purchase |
  | `unit_price` | `NUMERIC(12,2)`| `NOT NULL` | None | `CHECK (unit_price >= 0)` |
  | `quantity` | `INT` | `NOT NULL` | None | `CHECK (quantity >= 1)` |
  | `total_price`| `NUMERIC(12,2)`| `NOT NULL` | None | `CHECK (total_price >= 0)` |
- **Indexes:**
  - `order_items_pkey` on `id`
  - `idx_order_items_order` on `order_items(order_id)` (`schema.sql:331`)
- **Triggers:** None (immutable audit rows).
- **Integrity Observations:**
  - Capturing `product_name` and `unit_price` as frozen values ensures historical order integrity even if catalog product names or prices change in the future.
  - Foreign key `product_id` has `ON DELETE RESTRICT`, preventing removal of active catalog items with historical sales records.

---

### Table 15: `public.payments`
- **Location:** `database/schema.sql:337-350`
- **Purpose:** Transaction payment records.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `order_id` | `UUID` | `NOT NULL` | None | `REFERENCES orders(id) ON DELETE RESTRICT` |
  | `provider` | `TEXT` | `NOT NULL` | None | e.g. 'razorpay', 'stripe', 'cod' |
  | `provider_payment_id` | `TEXT`| `NULL` | None | Gateway transaction ID |
  | `amount` | `NUMERIC(12,2)`| `NOT NULL` | None | `CHECK (amount >= 0)` |
  | `currency` | `TEXT` | `NOT NULL` | `'INR'` | Currency ISO |
  | `status` | `TEXT` | `NOT NULL` | `'pending'` | `CHECK (status IN ('pending','completed','failed','refunded'))` |
  | `paid_at` | `TIMESTAMPTZ` | `NULL` | None | Timestamp of gateway capture |
  | `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
  | `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `payments_pkey` on `id`
  - `idx_payments_order` on `payments(order_id)` (`schema.sql:356`)
- **Triggers:**
  - `payments_updated_at`: `BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:352`)
- **Integrity Observations:**
  - `place_order` stored procedure currently does not automatically insert a row into `payments`. If gateway webhooks or frontend checkout don't explicitly create a payment record, the table remains empty.

---

### Table 16: `public.reviews`
- **Location:** `database/schema.sql:361-373`
- **Purpose:** Customer product reviews, ratings, and moderation status.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | `PRIMARY KEY` |
  | `product_id` | `UUID` | `NOT NULL` | None | `REFERENCES products(id) ON DELETE CASCADE` |
  | `user_id` | `UUID` | `NOT NULL` | None | `REFERENCES profiles(id) ON DELETE CASCADE` |
  | `rating` | `INT` | `NOT NULL` | None | `CHECK (rating BETWEEN 1 AND 5)` |
  | `title` | `TEXT` | `NULL` | None | Review headline |
  | `body` | `TEXT` | `NULL` | None | Review text |
  | `is_approved` | `BOOLEAN` | `NOT NULL` | `FALSE` | Admin moderation approval |
  | `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
  | `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
  | Constraint | `UNIQUE (product_id, user_id)` | | | One review per user per product |
- **Indexes:**
  - `reviews_pkey` on `id`
  - `idx_reviews_product` on `reviews(product_id)` (`schema.sql:379`)
  - `idx_reviews_user` on `reviews(user_id)` (`schema.sql:380`)
- **Triggers:**
  - `reviews_updated_at`: `BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:375`)
- **Integrity Observations:**
  - **CONFIRMED DEFECT:** There is **NO `product_name` column** on the `reviews` table. Earlier frontend code or legacy review logic attempting to query or insert `product_name` directly onto `reviews` will trigger a PostgreSQL `column does not exist` runtime error. Review displays must join with `products` or `profiles`.

---

### Table 17: `public.banners`
- **Location:** `database/schema.sql:385-401`
- **Purpose:** Marketing hero banners and promotional carousels.
- **Columns & Constraints:**
  | Column | Data Type | Nullable | Default | Constraints / Foreign Keys |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | `SERIAL` | `NOT NULL` | Auto-increment | `PRIMARY KEY` |
  | `title` | `TEXT` | `NOT NULL` | None | Banner heading |
  | `subtitle` | `TEXT` | `NULL` | None | Subheading |
  | `cta` | `TEXT` | `NULL` | None | Button text |
  | `cta_link` | `TEXT` | `NULL` | None | Navigation route / link |
  | `image_url` | `TEXT` | `NULL` | None | Asset URL |
  | `bg_from` | `TEXT` | `NULL` | `'#1e3a5f'` | Gradient start color |
  | `bg_to` | `TEXT` | `NULL` | `'#2563eb'` | Gradient end color |
  | `sort_order` | `INT` | `NOT NULL` | `0` | Carousel index |
  | `is_active` | `BOOLEAN` | `NOT NULL` | `TRUE` | Master toggle |
  | `starts_at` | `TIMESTAMPTZ` | `NULL` | None | Campaign start date |
  | `ends_at` | `TIMESTAMPTZ` | `NULL` | None | Campaign end date |
  | `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
  | `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | None |
- **Indexes:**
  - `banners_pkey` on `id`
  - `idx_banners_active` on `banners(is_active, sort_order)` (`schema.sql:407`)
- **Triggers:**
  - `banners_updated_at`: `BEFORE UPDATE ON banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();` (`schema.sql:403`)

---

## 3. Structural Anomalies & Schema Integrity Findings

1. **Non-Existent `settings` Table:**
   - There is NO database table for platform configuration.
   - `src/pages/admin/AdminSettingsPage.jsx` currently falls back to storing configuration (store name, currency, contact email, maintenance mode) in client-side browser `localStorage` (`shopkart_store_settings`).
   - *Impact:* Settings do not persist across admin users or devices.

2. **Primary Key Inconsistency:**
   - 15 tables use UUID keys (`gen_random_uuid()`), but `categories` and `banners` use PostgreSQL `SERIAL` integers.
   - *Impact:* While functional, client service code must handle numerical IDs for categories/banners and UUID strings for products/orders/users.

3. **Missing Foreign Key Indexes:**
   - PostgreSQL does not automatically create indexes on foreign keys.
   - The following FK columns lack indexes:
     - `public.categories(parent_id)`
     - `public.orders(address_id)`
     - `public.orders(coupon_id)`
     - `public.order_items(product_id)`
     - `public.order_items(variant_id)`
     - `public.cart_items(variant_id)`
     - `public.inventory(variant_id)`
   - *Impact:* High latency on cascade operations or joins under large table sizes.
