# ShopKart — Database Integration Map & Schema Contract

**Date:** 11 November 2026  
**Auditor:** Senior Full-Stack Engineer & Database Architect  
**Authoritative Schema Source:** [`database/schema.sql`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/schema.sql)

---

## 1. Complete 17-Table Schema & Frontend Integration Mapping

| # | Table Name | Primary Key | Key Columns & Data Types | Foreign Keys & Cascades | Frontend Service & Component | Current Integration State | RLS Policies Active |
|---|---|---|---|---|---|---|---|
| 1 | `profiles` | `id UUID` | `full_name TEXT, avatar_url TEXT, role TEXT, phone TEXT, created_at TIMESTAMPTZ` | `id REFERENCES auth.users(id) ON DELETE CASCADE` | `AuthContext.jsx`, `orderService.js:updateCustomerProfile`, `adminService.js:adminFetchCustomers` | **LIVE SUPABASE** | Customer views/updates own; Admin full access; Role escalation blocked by trigger. |
| 2 | `addresses` | `id UUID` | `user_id UUID, full_name TEXT, phone TEXT, line1 TEXT, line2 TEXT, city TEXT, state TEXT, pincode TEXT, country TEXT, is_default BOOLEAN` | `user_id REFERENCES profiles(id) ON DELETE CASCADE` | `orderService.js:fetchAddresses, createAddress, updateAddress, deleteAddress`, `ProfilePage.jsx`, `CheckoutPage.jsx` | **LIVE SUPABASE** | Customer views/manages own (`auth.uid() = user_id`); Admin can view all. |
| 3 | `categories` | `id SERIAL` | `name TEXT UNIQUE, slug TEXT UNIQUE, description TEXT, image_url TEXT, is_active BOOLEAN` | None | `productService.js:fetchCategories`, `adminService.js:adminFetchCategories, adminSaveCategory, adminDeleteCategory`, `AdminCategoriesPage.jsx` | **LIVE SUPABASE** | Public anonymous SELECT for active categories; Admin full CRUD. |
| 4 | `products` | `id UUID` | `name TEXT, slug TEXT UNIQUE, description TEXT, price NUMERIC(10,2), original_price NUMERIC(10,2), category_id INT, is_active BOOLEAN, is_featured BOOLEAN, rating NUMERIC(3,2), review_count INT` | `category_id REFERENCES categories(id) ON DELETE SET NULL` | `productService.js:fetchProducts, fetchProductBySlug`, `adminService.js:adminFetchProducts, adminSaveProduct, adminDeleteProduct`, `AdminProductsPage.jsx` | **LIVE SUPABASE** | Public anonymous SELECT for active products; Admin full CRUD. |
| 5 | `product_images` | `id UUID` | `product_id UUID, image_url TEXT, is_primary BOOLEAN, sort_order INT` | `product_id REFERENCES products(id) ON DELETE CASCADE` | `productService.js` (joined on products), `adminService.js` | **LIVE SUPABASE** | Public anonymous SELECT; Admin full access. |
| 6 | `product_variants`| `id UUID` | `product_id UUID, name TEXT, sku TEXT, price_override NUMERIC, stock INT` | `product_id REFERENCES products(id) ON DELETE CASCADE` | `productService.js` (joined on products), `ProductDetailPage.jsx` | **LIVE SUPABASE** | Public anonymous SELECT; Admin full access. |
| 7 | `inventory` | `id UUID` | `product_id UUID UNIQUE, quantity INT, reserved_quantity INT, low_stock_threshold INT` | `product_id REFERENCES products(id) ON DELETE CASCADE` | `adminService.js:adminUpdateStock`, `AdminInventoryPage.jsx`, `orderService.js:place_order` | **LIVE SUPABASE** | Public SELECT (via views/services); Admin update; Atomic deduction in `place_order`. |
| 8 | `carts` | `id UUID` | `user_id UUID UNIQUE, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ` | `user_id REFERENCES profiles(id) ON DELETE CASCADE` | `cartService.js:getOrCreateUserCart`, `CartContext.jsx` | **LIVE SUPABASE** | Customer views/manages own (`auth.uid() = user_id`); Admin can view. |
| 9 | `cart_items` | `id UUID` | `cart_id UUID, product_id UUID, variant_id UUID, quantity INT` | `cart_id REFERENCES carts(id) ON DELETE CASCADE`, `product_id REFERENCES products(id) ON DELETE CASCADE` | `cartService.js:syncCartToSupabase`, `CartContext.jsx` | **LIVE SUPABASE** | Customer views/manages own via cart ownership subquery; Admin can view. |
| 10| `wishlists` | `id UUID` | `user_id UUID UNIQUE, created_at TIMESTAMPTZ` | `user_id REFERENCES profiles(id) ON DELETE CASCADE` | `WishlistContext.jsx` (Currently NOT calling Supabase) | **DISCONNECTED** (Frontend uses localStorage) | Customer views/manages own (`auth.uid() = user_id`); Admin can view. |
| 11| `wishlist_items` | `id UUID` | `wishlist_id UUID, product_id UUID, added_at TIMESTAMPTZ` | `wishlist_id REFERENCES wishlists(id) ON DELETE CASCADE`, `product_id REFERENCES products(id) ON DELETE CASCADE` | `WishlistContext.jsx` (Currently NOT calling Supabase) | **DISCONNECTED** (Frontend uses localStorage) | Customer views/manages own via wishlist subquery; Admin can view. |
| 12| `coupons` | `id UUID` | `code TEXT UNIQUE, discount_type TEXT, discount_value NUMERIC(10,2), min_order_value NUMERIC(10,2), max_uses INT, used_count INT, expires_at TIMESTAMPTZ, is_active BOOLEAN` | None | `productService.js:validateCoupon` (Read-only); `AdminCouponsPage.jsx` (Uses localStorage) | **PARTIALLY CONNECTED** (Checkout reads; Admin uses localStorage) | Public view active valid coupons; Admin full CRUD. |
| 13| `orders` | `id UUID` | `user_id UUID, address_id UUID, status TEXT, subtotal NUMERIC, discount_amount NUMERIC, shipping_amount NUMERIC, total_amount NUMERIC, coupon_code TEXT, notes TEXT` | `user_id REFERENCES profiles(id)`, `address_id REFERENCES addresses(id)` | `orderService.js:placeOrder, fetchCustomerOrders, cancelCustomerOrder`, `adminService.js:adminFetchOrders, adminUpdateOrderStatus` | **LIVE SUPABASE** | Customers view own orders; Admin full access; Order creation via `place_order` RPC. |
| 14| `order_items` | `id UUID` | `order_id UUID, product_id UUID, product_name TEXT, unit_price NUMERIC, quantity INT, total_price NUMERIC` | `order_id REFERENCES orders(id) ON DELETE CASCADE`, `product_id REFERENCES products(id) ON DELETE SET NULL` | `orderService.js:fetchCustomerOrders`, `adminService.js:adminFetchOrders` | **LIVE SUPABASE** | Customers view own order items; Admin full access. |
| 15| `payments` | `id UUID` | `order_id UUID, amount NUMERIC(10,2), provider TEXT, status TEXT, transaction_id TEXT, created_at TIMESTAMPTZ` | `order_id REFERENCES orders(id) ON DELETE CASCADE` | None (No gateway integration currently exists) | **UNPOPULATED** (Zero records created) | Customers view own payments; Admin full access. |
| 16| `reviews` | `id UUID` | `product_id UUID, user_id UUID, rating INT, title TEXT, body TEXT, is_approved BOOLEAN` | `product_id REFERENCES products(id) ON DELETE CASCADE`, `user_id REFERENCES profiles(id) ON DELETE CASCADE` | `productService.js:submitProductReview` (Inserts); `AdminReviewsPage.jsx` (Uses localStorage) | **PARTIALLY CONNECTED** (Submission inserts; Admin uses localStorage; Query broken) | Public view approved (`is_approved = true`); Users create/view own; Admin full access. |
| 17| `banners` | `id SERIAL` | `title TEXT, subtitle TEXT, cta TEXT, cta_link TEXT, image_url TEXT, bg_from TEXT, bg_to TEXT, sort_order INT, is_active BOOLEAN, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ` | None | `productService.js:fetchBanners` (Reads); `AdminBannersPage.jsx` (Uses localStorage) | **PARTIALLY CONNECTED** (Storefront reads; Admin uses localStorage) | Public view active banners; Admin full access. |

---

## 2. Type Mapping & Data Integrity Rules

When connecting disconnected admin pages, **do not attempt to insert demo `localStorage` mock data directly into Supabase**. Note the following schema constraints:

1. **Coupons:**
   - Database ID: `UUID` (`gen_random_uuid()`). Demo data uses strings (`c1`, `c2`).
   - `discount_type`: Must be strictly `'percent'` or `'fixed'`.
   - `code`: Must be unique and uppercase.
2. **Reviews:**
   - Foreign Keys: `product_id` and `user_id` **must be valid UUIDs** matching rows in `products` and `profiles`. Demo data (`rev-1`, `rev-2`) has no foreign key references and will violate PostgreSQL foreign key constraints.
   - `UNIQUE (product_id, user_id)`: A customer can only review a product once.
   - Moderation Workflow: Customer submissions set `is_approved = false`. Admin review page must execute:
     `UPDATE reviews SET is_approved = true WHERE id = <review UUID>`.
3. **Banners:**
   - ID: `SERIAL` (integer), auto-incrementing.
   - Column casing: Database uses `cta_link`, `bg_from`, `bg_to`. Frontend state uses `ctaLink`, `bgFrom`, `bgTo`.
4. **Settings:**
   - There is **no `settings` table** in `database/schema.sql`. Store settings should remain in `localStorage` or be modeled as a new schema table if persistence is required in later phases.
