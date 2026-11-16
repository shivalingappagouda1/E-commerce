# ShopKart — Phase 1.2: Independent Audit Validation Report

**Date:** 11 November 2026  
**Auditor:** Senior Full-Stack Engineer & Supabase Security Architect  
**Project:** ShopKart  
**Status:** Independent Audit Validation Complete (Zero Code Modifications)

---

## 1. Product Review Bug Deep Dive

### 1.1 Actual PostgreSQL `reviews` Table Structure
Inspected directly from [`database/schema.sql:361-381`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/schema.sql#L361-L381):
```sql
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
```
Indexes:
- `idx_reviews_product ON reviews(product_id)`
- `idx_reviews_user ON reviews(user_id)`

### 1.2 Column Verification: Does `product_name` Exist?
**NO.** The PostgreSQL catalog table `reviews` contains only:
`id`, `product_id`, `user_id`, `rating`, `title`, `body`, `is_approved`, `created_at`, `updated_at`.
There is no `product_name` column in the database schema.

### 1.3 All Call Sites of `fetchProductReviews`
1. **Declaration:** [`src/services/productService.js:420`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/productService.js#L420)
   ```javascript
   export async function fetchProductReviews(productName)
   ```
2. **Initial Mount Fetch:** [`src/pages/customer/ProductDetailPage.jsx:64`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L64)
   ```javascript
   fetchProductReviews(data.name).then(({ data: revs }) => {
     setReviews(revs || [])
   })
   ```
3. **Post-Submission Refresh:** [`src/pages/customer/ProductDetailPage.jsx:165`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L165)
   ```javascript
   const { data: updatedRevs } = await fetchProductReviews(product.name)
   setReviews(updatedRevs || [])
   ```

### 1.4 Relationship & Join Verification
- **Relationship:** `reviews.product_id` is foreign-keyed to `products.id`. Querying by product must filter on `product_id = <product UUID>`.
- **Profiles Join:** `reviews.user_id` is foreign-keyed to `profiles.id`. In PostgREST, `.select('*, profiles(full_name, avatar_url)')` is a valid embedded resource join.
- **Approved Reviews:** Database query in `productService.js:426` has `.eq('is_approved', true)`. However, line 434 filters in JavaScript:
  ```javascript
  const matching = (data || []).filter(r =>
    (!productName || (r.product_name && r.product_name.toLowerCase().includes(productName.toLowerCase())))
  )
  ```
  Since `r.product_name` is `undefined`, `matching` evaluates to an empty array for any specific product name passed!
- **Submission vs. Refresh Lifecycle:**
  `submitProductReview` inserts reviews with `is_approved: false`. When `ProductDetailPage.jsx` refreshes reviews, `fetchProductReviews` queries only `is_approved = true`. Therefore, newly submitted reviews will not immediately appear until an admin approves them. The UI must clarify that reviews are pending approval.

---

## 2. Avatar Upload & Storage Policy Validation

### 2.1 Existence and Signature of `uploadAvatar`
Inspected from [`src/services/authService.js:30-47`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/services/authService.js#L30-L47):
```javascript
export async function uploadAvatar({ userId, file }) {
  if (!supabase) return { error: { message: 'Supabase not configured.' } }

  const ext  = file.name.split('.').pop()
  const path = `avatars/${userId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('public-assets')
    .upload(path, file, { upsert: true })

  if (uploadError) return { error: uploadError }

  const { data } = supabase.storage
    .from('public-assets')
    .getPublicUrl(path)

  return { url: data.publicUrl, error: null }
}
```
- **Arguments:** An object `{ userId, file }`.
- **Return Format:** `{ url: string, error: null }` on success, or `{ error: object }` on failure.

### 2.2 Client-Side Validation Gaps
`uploadAvatar` lacks client-side validation:
1. No file size check (fails to restrict files to < 2MB or < 5MB).
2. No MIME type / extension whitelist (does not enforce `png|jpg|jpeg|webp|gif`).
3. No file existence check before reading `file.name`.

### 2.3 Storage Policy Compatibility
In `supabase/phase-9.2/migration.sql:632-635` and `database/schema.sql`:
- **Bucket:** `public-assets`
- **Folder:** `(storage.foldername(name))[1] = 'avatars'` with depth `array_length(storage.foldername(name), 1) = 1`
- **Filename Regex:** `storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')`

**Compatibility Assessment:**
When `userId === auth.uid()` and `ext` is in lowercase `(png|jpg|jpeg|webp|gif)`, the path `avatars/${userId}.${ext}` matches the policy exactly. However, if the user uploads a file with an uppercase extension (`.JPG`, `.PNG`), the regex fails. Lowercasing `ext.toLowerCase()` is required.

### 2.4 Profile Persistence & Ownership
- `updateCustomerProfile` in `orderService.js` and `updateProfile` in `authService.js` properly persist `avatar_url` to the `profiles` table.
- Storage RLS ensures a customer can only write to a path containing their own `auth.uid()`.

---

## 3. Wishlist Persistence Architecture

### 3.1 Database Relational Structure
Inspected from [`database/schema.sql:245-260`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/database/schema.sql#L245-L260):
- `wishlists`: `id UUID PRIMARY KEY`, `user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE`.
- `wishlist_items`: `id UUID PRIMARY KEY`, `wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE`, `product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE`, `added_at TIMESTAMPTZ`, `UNIQUE (wishlist_id, product_id)`.

### 3.2 Existing RLS Policies
- `wishlists`: `auth.uid() = user_id` for SELECT, INSERT, DELETE; `is_admin()` can SELECT.
- `wishlist_items`: `wishlist_id IN (SELECT id FROM wishlists WHERE user_id = auth.uid())` for SELECT, INSERT, DELETE; `is_admin()` can SELECT.

### 3.3 Implementation Design Proposal (Without Modifying Code)
1. **Service Layer (`wishlistService.js`):**
   - `getOrCreateUserWishlist(userId)`: Queries `wishlists` for `user_id = userId`; inserts if missing.
   - `fetchDatabaseWishlist(userId)`: Queries `wishlist_items` joining `products(*)`.
   - `addToDatabaseWishlist(wishlistId, productId)`: Inserts with `ON CONFLICT (wishlist_id, product_id) DO NOTHING`.
   - `removeFromDatabaseWishlist(wishlistId, productId)`: Deletes matching row.
2. **Context Layer (`WishlistContext.jsx`):**
   - Listen to `useAuth()`.
   - When user logs in, merge guest `localStorage` items into the database wishlist.
   - When user logs out, reset active wishlist to prevent cross-account pollution.

---

## 4. Admin Database Integration Mapping

| Admin Feature | Current Storage | Actual Database Table | Primary Columns & Types | Service Functions Status |
|---|---|---|---|---|
| **Coupons** | `localStorage` (`shopkart_admin_coupons`) | `public.coupons` | `id UUID, code TEXT UNIQUE, discount_type TEXT, discount_value NUMERIC(10,2), min_order_value NUMERIC(10,2), max_uses INT, used_count INT, expires_at TIMESTAMPTZ, is_active BOOLEAN` | Missing in `adminService.js`. Customer checkout uses `productService.js:validateCoupon`. |
| **Reviews Moderation** | `localStorage` (`shopkart_admin_reviews`) | `public.reviews` | `id UUID, product_id UUID FK, user_id UUID FK, rating INT, title TEXT, body TEXT, is_approved BOOLEAN` | Missing in `adminService.js`. `database/schema.sql` has admin policy `USING (is_admin())`. |
| **Banners CMS** | `localStorage` (`shopkart_admin_banners`) | `public.banners` | `id SERIAL, title TEXT, subtitle TEXT, cta TEXT, cta_link TEXT, image_url TEXT, bg_from TEXT, bg_to TEXT, sort_order INT, is_active BOOLEAN, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ` | Missing in `adminService.js`. Storefront `HomePage.jsx` queries `banners` table via `fetchBanners`. |
| **Store Settings** | `localStorage` (`shopkart_store_settings`) | *None* | No database table exists in `database/schema.sql`. | `adminFetchSettings` & `adminSaveSettings` in `adminService.js` use `localStorage`. |

---

## 5. Checkout & Payment Architecture Verification

### 5.1 Current Workflows
1. **Cash on Delivery (COD):**
   Selects COD -> Appends `Payment method: COD` to order notes -> Calls `place_order` RPC. Order created in `pending` status.
2. **Online Payment (Simulated):**
   Selects Online -> Appends `Payment method: ONLINE` to order notes -> Calls `place_order` RPC. Order created in `pending` status **without any payment gateway interaction**.
3. **Gateway Integration:** NONE. No SDK, webhook, or signature verification.
4. **`payments` Table Utilization:** Zero records created. Table remains completely unpopulated.
5. **Idempotency & Duplicate Prevention:** Button is disabled via `submitting` boolean, but no server-side idempotency key exists in the database.

---

## 6. Summary of Feature Verification Classifications

- Total Inspected Features: 32
- **CODE PRESENT & STATIC VERIFIED:** 24 features
- **PARTIALLY IMPLEMENTED (Client-only / LocalStorage):** 4 features (Wishlist sync, Admin Coupons, Admin Reviews, Admin Banners)
- **BROKEN (Schema / Parameter Mismatch):** 1 feature (Product Review Fetching)
- **NOT IMPLEMENTED:** 1 feature (Payment Gateway Integration)
- **NEEDS SECURITY REVIEW:** 2 packages (Phase 9.2 Migration and Rollback)
- **RUNTIME VERIFIED:** 0 features (No local/staging live database testing performed in Phase 1)
