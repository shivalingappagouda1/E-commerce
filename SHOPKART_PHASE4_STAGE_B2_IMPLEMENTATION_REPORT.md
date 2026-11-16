# ShopKart Phase 4 Stage B2 — Implementation Report

**Date:** 2026-11-12  
**Scope:** Authorized Phase 4 Stage B2 Storefront Implementations (**STF-01** & **STF-05**) + Review Corrections + Option 2 Storage RLS Decision  
**Status:** **IMPLEMENTATION COMPLETE WITH DOCUMENTED LIMITATION — DEFERRED TO FINAL REVIEW**

---

## 1. Executive Summary

Phase 4 Stage B2 implemented two storefront capabilities (**STF-01** and **STF-05**) and applied the four targeted frontend review corrections while preserving all Phase 3 Stage B, Phase 4 Stage B1, database schema, SQL migration, RLS policy, and Storage policy boundaries:

1. **STF-01 — Customer Profile Avatar Upload Integration:** Integrated file validation (`validateAvatarFile`), synchronous upload locking (`avatarUploadLockRef`), stage progress UI (`validating` → `uploading` → `saving`), profile persistence (`updateCustomerProfile`), sequence-guarded `AuthContext.refreshProfile(expectedUserId)`, differing-extension rollback of failed new uploads (`removeAvatarObject`), post-DB-save cleanup of replaced differing-extension objects, cache-busted public URLs (`?v=${Date.now()}`), account-switch guards, and broken-image fallback in `ProfilePage.jsx` and `Navbar.jsx`.
2. **STF-05 — Account-Scoped Wishlist & Supabase Synchronization:** Replaced unscoped `localStorage['shopkart_wishlist']` with identity-scoped helpers (`wishlistHelpers.js`), database persistence (`wishlistService.js`), synchronous render-time ownership/loading isolation (`resolveActiveWishlist`), validated UUID additive guest merge (`mergeGuestWishlistToDatabase`), active-product checking on single wishlist adds (`addDatabaseWishlistItem`), per-product pending locks (`pendingIdsRef` / `isItemPending`), explicit wishlist-to-cart confirmation (`CartContext.addItem` `{ ok, error }` + `moveWishlistItemToCart` / `moveAllWishlistItemsToCart`), and clean logout/account switching across `WishlistContext.jsx`, `WishlistPage.jsx`, `ProductCard.jsx`, and `ProductDetailPage.jsx`.

---

## 2. Unresolved Limitation — Same-Extension Avatar Replacement (Deferred to Final Review)

- **Classification:** **UNRESOLVED LIMITATION** (not a completed fix; deferred to the final consolidated security and functionality review).
- **Root Cause & Behavior:**
  - The current frontend upload implementation in `src/services/authService.js` uploads to `avatars/${userId}.${ext}` with `{ upsert: true }`.
  - When replacing an avatar using the **same file extension** (for example, PNG → PNG), Storage overwrites the existing `avatars/${userId}.png` object during upload **before** `updateCustomerProfile()` confirms database persistence on `profiles.avatar_url`. If the subsequent database update fails, Storage already contains the new bytes and cannot restore the overwritten object.
- **Why Versioned Paths Were Not Introduced Under Stage B2 Scope:**
  - All four Storage policies on `storage.objects` in `database/migrations/phase9_2_storage_hardening.sql` (lines 79–137) and `supabase/phase-9.2/migration.sql` (lines 629–760) enforce **strict single-slot path rules**:
    - `(storage.foldername(name))[1] = 'avatars'`
    - `array_length(storage.foldername(name), 1) = 1`
    - `storage.filename(name) ~ ('^' || auth.uid()::text || '\.(png|jpg|jpeg|webp|gif)$')`
  - Only the exact user-specific filename `avatars/${userId}.${ext}` matches this RLS policy (`compatible with upsert: true`). Versioned filenames or per-user subdirectories would be rejected on live Supabase with Storage RLS authorization errors.
  - Per approved **Option 2** (keep Storage RLS policies untouched), existing compatible avatar upload paths were retained. Safe non-overwriting replacement across same-extension uploads requires a separately authorized Storage RLS policy change in a consolidated final review phase.

---

## 3. Applied Review Corrections

1. **Differing-Extension Replacement Ordering (`src/services/authService.js`, `src/pages/customer/ProfilePage.jsx`):** `uploadAvatar()` no longer deletes `previousAvatarUrl`'s object prior to database persistence; `ProfilePage.jsx` runs best-effort `removeAvatarObject(uploadRes.previousStoragePath)` strictly **after** `updateCustomerProfile()` succeeds for the initiating user. On DB failure with a differing extension (`!uploadRes.replacedExistingPath`), the prior object remains untouched and only the newly uploaded object is rolled back best-effort.
2. **Account-Switch Protection (`src/pages/customer/ProfilePage.jsx`, `src/services/orderService.js`, `src/context/AuthContext.jsx`):** Captures `initiatingUserId`, validates `expectedUserId` in `orderService.updateCustomerProfile()` immediately after `auth.getUser()` before updating `profiles`, aborts state updates/cleanup/refresh if `activeUserIdRef.current !== initiatingUserId`, and guards `AuthContext.refreshProfile(expectedUserId)` against cross-account updates.
3. **Wishlist-to-Cart Confirmation (`src/services/cartService.js`, `src/context/CartContext.jsx`, `src/utils/wishlistHelpers.js`, `src/pages/customer/WishlistPage.jsx`):** Added `validateCartAddition()`, updated `CartContext.addItem()` to return `{ ok, error }`, and gated individual and bulk wishlist removals (`moveWishlistItemToCart`, `moveAllWishlistItemsToCart`) on verified cart addition confirmation so failed additions preserve wishlist items and surface errors.
4. **Active Product Validation on Single Wishlist Insert (`src/services/wishlistService.js`, `src/utils/wishlistHelpers.js`):** Updated `addDatabaseWishlistItem()` to verify `products.is_active = true` before creating a wishlist or inserting into `wishlist_items`.

---

## 4. Scope Restrictions & Known Environment Dependencies

- **Boundaries Preserved:** Zero edits to `.sql` files, database schemas, functions/RPCs, RLS policies, Storage policies, bucket configuration, `.env*` secrets, Git history, or deployment configs. Phase 3 Stage B and Phase 4 Stage B1 implementations remain intact and re-verified.
- **Pre-Existing Bucket Dependency:** Repository SQL leaves `public-assets` `allowed_mime_types` and `file_size_limit` as `NULL`.
- **Untested Live Runtime:** Live browser React DOM interactions and live remote Supabase Auth/Storage/PostgreSQL RLS behavior remain `NOT TESTED` in CLI.
