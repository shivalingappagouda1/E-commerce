# ShopKart — Phase 2: Backend & Database Deep Audit
## Document 2: Complete RLS Policy & Permission Matrix

**Audit Status:** COMPLETE  
**Audit Mode:** STRICTLY READ-ONLY  
**PostgreSQL Security Model:** Multi-layered Defense (PostgreSQL Table Grants + Row Level Security + Storage Policies)  
**Audited Sources:** `database/schema.sql`, `database/migrations/phase9_security_hardening*.sql`, `supabase/phase-9.2/migration.sql`

---

## 1. Executive Summary: Security Architecture

ShopKart implements a dual-boundary PostgreSQL access model:
1. **Layer 1: PostgreSQL Table-Level Grants (ACLs)**: Explicitly hardened in Phase 9.2 (`supabase/phase-9.2/migration.sql:313-368`). Default broad grants to `PUBLIC`, `anon`, and `authenticated` were wiped with `REVOKE ALL`, and minimum least-privilege grants were re-issued. If a role lacks table-level privileges, queries fail immediately before evaluating RLS.
2. **Layer 2: Row Level Security (RLS)**: Enforced on all 17 tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`). Every row returned or modified must satisfy permissive policies.
3. **Layer 3: Supabase Storage Objects**: `storage.objects` policies govern media assets within the `public-assets` bucket (`supabase/phase-9.2/migration.sql:629-798`).

---

## 2. Table-by-Table RLS Matrix (17 Public Tables)

### Table 1: `public.profiles`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `UPDATE`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own profile"` | `public` | `SELECT` | PERMISSIVE | `auth.uid() = id` | None |
  | `"Users update own profile"`| `public` | `UPDATE` | PERMISSIVE | `auth.uid() = id` | `auth.uid() = id` |
  | `"Admins can view all profiles"` | `public` | `SELECT` | PERMISSIVE | `is_admin()` | None |
  | `"Admins can update all profiles"`| `public` | `UPDATE` | PERMISSIVE | `is_admin()` | `is_admin()` |
  | `"Admins can delete profiles"` | `public` | `DELETE` | PERMISSIVE | `is_admin()` | None |
- **Security Analysis:**
  - Insert is restricted: profiles are created by the `on_auth_user_created` trigger executing `create_profile_on_signup()`.
  - Self-escalation protection: The `guard_role_escalation` trigger prevents updating the `role` column unless `is_admin()` evaluates to `TRUE`.

---

### Table 2: `public.addresses`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own addresses"` | `public` | `SELECT` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Users insert own addresses"`| `public` | `INSERT` | PERMISSIVE | None | `auth.uid() = user_id` |
  | `"Users update own addresses"`| `public` | `UPDATE` | PERMISSIVE | `auth.uid() = user_id` | `auth.uid() = user_id` |
  | `"Users delete own addresses"`| `public` | `DELETE` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Admins can view all addresses"` | `public` | `SELECT` | PERMISSIVE | `is_admin()` | None |
- **Security Analysis:** Customers can only read and manage their own shipping addresses. Admins have read-only visibility for customer support.

---

### Table 3: `public.categories`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` (admin)
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Public can view active categories"` | `public` | `SELECT` | PERMISSIVE | `is_active = TRUE` | None |
  | `"Admins full access to categories"` | `authenticated` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |
- **Security Analysis:** Anonymous and ordinary users can only see active categories. Role is scoped `TO authenticated` under Phase 9.1/9.2 hardening.

---

### Table 4: `public.products`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` (admin)
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Public can view active products"` | `public` | `SELECT` | PERMISSIVE | `is_active = TRUE` | None |
  | `"Admins full access to products"` | `authenticated` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |
- **Security Analysis:** Anonymous visitors can only query active catalog items. Inactive/draft products are completely isolated to administrators.

---

### Table 5: `public.product_images`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` (admin)
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Public can view images of active products"` | `public` | `SELECT` | PERMISSIVE | `product_id IN (SELECT id FROM products WHERE is_active = TRUE)` | None |
  | `"Admins full access to product images"` | `authenticated` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |
- **Security Analysis:** Subquery ensures that images for inactive products cannot be leaked to public users.

---

### Table 6: `public.product_variants`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` (admin)
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Public can view variants of active products"` | `public` | `SELECT` | PERMISSIVE | `product_id IN (SELECT id FROM products WHERE is_active = TRUE)` | None |
  | `"Admins full access to product variants"` | `authenticated` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |

---

### Table 7: `public.inventory`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` (admin)
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Public can view inventory of active products"` | `public` | `SELECT` | PERMISSIVE | `product_id IN (SELECT id FROM products WHERE is_active = TRUE)` | None |
  | `"Admins full access to inventory"` | `authenticated` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |
- **Security Analysis:** Stock levels are readable for active items to display availability on product pages. Mutations are restricted to admins or via `place_order`/`restore_inventory_on_cancellation` (SECURITY DEFINER).

---

### Table 8: `public.carts`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own cart"` | `public` | `SELECT` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Users insert own cart"` | `public` | `INSERT` | PERMISSIVE | None | `auth.uid() = user_id` |
  | `"Users update own cart"` | `public` | `UPDATE` | PERMISSIVE | `auth.uid() = user_id` | `auth.uid() = user_id` |
  | `"Users delete own cart"` | `public` | `DELETE` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Admins can view all carts"` | `public` | `SELECT` | PERMISSIVE | `is_admin()` | None |

---

### Table 9: `public.cart_items`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT` (plus mutations in Phase 7.1)
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own cart items"` | `public` | `SELECT` | PERMISSIVE | `cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())` | None |
  | `"Users insert own cart items"`| `public` | `INSERT` | PERMISSIVE | None | `cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())` |
  | `"Users update own cart items"`| `public` | `UPDATE` | PERMISSIVE | `cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())` | `cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())` |
  | `"Users delete own cart items"`| `public` | `DELETE` | PERMISSIVE | `cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())` | None |
  | `"Admins can view all cart items"`| `public` | `SELECT` | PERMISSIVE | `is_admin()` | None |

---

### Table 10: `public.wishlists`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own wishlist"` | `public` | `SELECT` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Users insert own wishlist"` | `public` | `INSERT` | PERMISSIVE | None | `auth.uid() = user_id` |
  | `"Users delete own wishlist"` | `public` | `DELETE` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Admins can view all wishlists"` | `public` | `SELECT` | PERMISSIVE | `is_admin()` | None |

---

### Table 11: `public.wishlist_items`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own wishlist items"` | `public` | `SELECT` | PERMISSIVE | `wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid())` | None |
  | `"Users insert own wishlist items"`| `public` | `INSERT` | PERMISSIVE | None | `wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid())` |
  | `"Users delete own wishlist items"`| `public` | `DELETE` | PERMISSIVE | `wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid())` | None |
  | `"Admins can view all wishlist items"` | `public` | `SELECT` | PERMISSIVE | `is_admin()` | None |

---

### Table 12: `public.coupons`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` (admin)
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Public can view active valid coupons"` | `public` | `SELECT` | PERMISSIVE | `is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())` | None |
  | `"Admins full access to coupons"` | `authenticated` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |

---

### Table 13: `public.orders`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`, `UPDATE`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own orders"` | `public` | `SELECT` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Admins full access to orders"` | `public` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |
- **Security Analysis:** Customers CANNOT directly INSERT into `orders`. All orders must be placed via `public.place_order(...)` RPC (SECURITY DEFINER). Customers can UPDATE their orders only through `public.cancel_order(...)` or where explicitly allowed.

---

### Table 14: `public.order_items`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own order items"` | `public` | `SELECT` | PERMISSIVE | `order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())` | None |
  | `"Admins full access to order items"`| `public` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |
- **Security Analysis:** Completely immutable from client side. Inserted strictly by `public.place_order(...)`.

---

### Table 15: `public.payments`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: NONE | `authenticated`: `SELECT`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Users view own payments"` | `public` | `SELECT` | PERMISSIVE | `order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())` | None |
  | `"Admins full access to payments"` | `public` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |

---

### Table 16: `public.reviews`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Public can view approved reviews"` | `public` | `SELECT` | PERMISSIVE | `is_approved = TRUE` | None |
  | `"Users view own reviews"` | `public` | `SELECT` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Users create own reviews"` | `public` | `INSERT` | PERMISSIVE | None | `auth.uid() = user_id AND is_approved = FALSE` |
  | `"Users update own reviews"` | `public` | `UPDATE` | PERMISSIVE | `auth.uid() = user_id` | `auth.uid() = user_id AND is_approved = FALSE` |
  | `"Users delete own reviews"` | `public` | `DELETE` | PERMISSIVE | `auth.uid() = user_id` | None |
  | `"Admins full access to reviews"` | `authenticated` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |
- **Security Analysis:** Enforces moderation: users can create and edit their reviews, but the `WITH CHECK` constraint forces `is_approved = FALSE`. Users cannot approve their own reviews.

---

### Table 17: `public.banners`
- **RLS Enabled:** YES
- **Table Grants (Phase 9.2):** `anon`: `SELECT` | `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` (admin)
- **Policies:**
  | Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `"Public can view active banners"` | `public` | `SELECT` | PERMISSIVE | `is_active = TRUE AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())` | None |
  | `"Admins full access to banners"` | `authenticated` | `ALL` | PERMISSIVE | `is_admin()` | `is_admin()` |

---

## 3. Storage Security Matrix (`storage.objects`)

Bucket: `public-assets` (Phase 9.2 Hardening, `migration.sql:629-798`)
| Policy Name | Target Role | Command | Mode | USING Clause | WITH CHECK Clause |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `"Users can view own avatar in public-assets"` | `authenticated` | `SELECT` | PERMISSIVE | `bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'avatars' AND (storage.filename(name) LIKE (auth.uid()::text || '.%') OR storage.filename(name) = auth.uid()::text)` | None |
| `"Users can upload own avatar to public-assets"` | `authenticated` | `INSERT` | PERMISSIVE | None | `bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'avatars' AND (storage.filename(name) LIKE (auth.uid()::text || '.%') OR storage.filename(name) = auth.uid()::text)` |
| `"Users can update own avatar in public-assets"` | `authenticated` | `UPDATE` | PERMISSIVE | `bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'avatars' AND (storage.filename(name) LIKE (auth.uid()::text || '.%') OR storage.filename(name) = auth.uid()::text)` | `bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'avatars' AND (storage.filename(name) LIKE (auth.uid()::text || '.%') OR storage.filename(name) = auth.uid()::text)` |
| `"Users can delete own avatar from public-assets"` | `authenticated` | `DELETE` | PERMISSIVE | `bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'avatars' AND (storage.filename(name) LIKE (auth.uid()::text || '.%') OR storage.filename(name) = auth.uid()::text)` | None |

---

## 4. Permission & RLS Vulnerability Findings

1. **Direct Orders Modification Defended:**
   - Customers have no direct `INSERT` policy on `orders` or `order_items`. This prevents malicious callers from tampering with prices, discounts, or stock bypasses via direct Supabase PostgREST endpoints.

2. **Cart Isolation:**
   - Both `carts` and `cart_items` enforce strict `auth.uid()` filtering. A user cannot read or mutate another customer's cart.

3. **Admin Policy Role Scoping:**
   - Prior to Phase 9.1/9.2, admin policies were assigned `TO public`. Unauthenticated visitors evaluating catalog queries caused `is_admin()` to evaluate unnecessarily. Phase 9.2 strictly re-targets admin policies `TO authenticated`.
