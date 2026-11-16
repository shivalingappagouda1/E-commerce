# ShopKart Phase 4 Stage B2 — Change Register

**Date:** 2026-11-12  
**Status:** **IMPLEMENTATION COMPLETE WITH DOCUMENTED LIMITATION — DEFERRED TO FINAL REVIEW**  
**Scope:** Authorized Phase 4 Stage B2 (**STF-01** & **STF-05**) + Review Corrections + Option 2 Storage RLS Preservation

---

## 1. Added Files

| Path | Type | Summary |
|---|---|---|
| `src/utils/wishlistHelpers.js` | Utility module | Scoped guest key persistence, legacy key purge, UUID/product normalization, deduplication, synchronous render-time ownership guard `resolveActiveWishlist`, `mergeWishlistItems`, `mapSafeWishlistError`, and wishlist-to-cart confirmation helpers `moveWishlistItemToCart` / `moveAllWishlistItemsToCart`. |
| `src/services/wishlistService.js` | Service module | Supabase `wishlists` & `wishlist_items` CRUD + active-product verification on both single add (`addDatabaseWishlistItem`) and guest merge (`mergeGuestWishlistToDatabase`). |
| `test_phase4_stage_b2.mjs` | Test script | 15-case automated suite covering Stage B2 behavior and review correction regressions. |
| `SHOPKART_PHASE4_STAGE_B2_*.md` (4 files) | Reports | Implementation, test results, change register, and acceptance checklist documenting Option 2 deferral. |

---

## 2. Modified Frontend Files

| Path | Summary of Changes |
|---|---|
| `src/services/authService.js` | Exported `validateAvatarFile`, `mapSafeUploadError`, `extractOwnedAvatarPath`, `removeAvatarObject`; updated `uploadAvatar` with injectable `client`, cache-busting `?v=${Date.now()}`, and `previousStoragePath` return without pre-DB deletion. Retained Phase 9.2-compatible `avatars/${userId}.${ext}` + `upsert: true` upload path (Option 2). |
| `src/services/orderService.js` | Updated `updateCustomerProfile` to accept `expectedUserId` and injectable `client`, verifying authenticated `user.id === expectedUserId` before updating `profiles`. |
| `src/context/AuthContext.jsx` | Returned `{ data, error }` from `fetchProfile` and exported sequence-guarded `refreshProfile(expectedUserId = null)`. |
| `src/pages/customer/ProfilePage.jsx` | Added device avatar upload UI, double-submit lock, stage feedback (`validating` → `uploading` → `saving`), initiating-user identity guards across async upload/update/cleanup/refresh, rollback of failed newly created differing-extension paths, null-profile field resets, and image fallback. |
| `src/components/layout/Navbar.jsx` | Displayed `profile.avatar_url` with `failedAvatarUrl` `onError` fallback to `<User />`. |
| `src/services/cartService.js` | Exported `validateCartAddition()` returning explicit `{ ok, error }` validation results. |
| `src/context/CartContext.jsx` | Updated `addItem()` to validate via `validateCartAddition()` and reliably return `{ ok: true, error: null }` or `{ ok: false, error }`. |
| `src/context/WishlistContext.jsx` | Rebuilt state around `useAuth()`, `resolveActiveWishlist`, legacy purge, safe guest-to-DB merge (clearing guest key only when `!mergeRes.error`), sequence guards, per-product pending lock (`isItemPending`), `removeItem`, `clearWishlist`, loading, and error states. |
| `src/pages/customer/WishlistPage.jsx` | Integrated `moveWishlistItemToCart`, `moveAllWishlistItemsToCart`, `moveError` / `errorBanner` alerts, loading skeletons, truthful sync copy, and pending/disabled states so failed cart additions preserve wishlist entries in both single and bulk flows. |
| `src/components/products/ProductCard.jsx` | Consumed `isItemPending(product.id)` to lock concurrent wishlist toggle clicks. |
| `src/pages/customer/ProductDetailPage.jsx` | Consumed `isItemPending(product.id)` to lock concurrent wishlist toggle clicks. |

---

## 3. Intentionally Unchanged / Deferred Items

- Zero modifications to `.sql` files, migrations, rollback scripts, RLS policies, Storage policies, bucket configuration, `.env*` secrets, Git history, or deployment config.
- Versioned non-overwriting avatar Storage paths remain **unimplemented** by approved **Option 2** decision because existing Phase 9.2 Storage RLS policies permit only `avatars/${auth.uid()}.${ext}` at folder depth 1; safe non-overwriting same-extension replacement is deferred to the final consolidated security and functionality review.
