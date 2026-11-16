# ShopKart Phase 4 Stage B2 — Acceptance Checklist

**Date:** 2026-11-12  
**Final Stage Status:** **IMPLEMENTATION COMPLETE WITH DOCUMENTED LIMITATION — DEFERRED TO FINAL REVIEW**

---

## 1. Scope, Review Fixes & Limitation Status

| Item | Requirement | Status | Evidence & Notes |
|---|---|---|---|
| STF-01 (Core Flow) | Device avatar upload UI, validation (`<= 5 MB`, MIME/ext consistency), progress stages, profile DB save, `Navbar` & `AuthContext` refresh | **IMPLEMENTED / VERIFIED OFFLINE** | `authService.js`, `AuthContext.jsx`, `ProfilePage.jsx`, `Navbar.jsx`, `test_phase4_stage_b2.mjs` |
| Review Issue 1 (Differing-Ext Ordering) | Post-DB cleanup for differing extensions; failed DB save keeps prior object intact | **VERIFIED OFFLINE** | `authService.js` (`previousStoragePath`), `ProfilePage.jsx`, `test_phase4_stage_b2.mjs` Cases 2 & 9 |
| **Unresolved Limitation (Same-Ext Overwrite)** | Non-overwriting upload when file extension matches current avatar (`PNG -> PNG`) without `upsert: true` | **UNRESOLVED LIMITATION — DEFERRED TO FINAL REVIEW** | Same-extension replacement overwrites `avatars/${userId}.${ext}` in Storage prior to DB persistence. Active Phase 9.2 RLS policies (`phase9_2_storage_hardening.sql` / `supabase/phase-9.2/migration.sql`) only allow exact `^<auth.uid()>\.(png|jpg|jpeg|webp|gif)$` at folder depth 1. Safe non-overwriting replacement requires a separately authorized Storage RLS policy change. |
| Review Issue 2 (Account-Switch Guard) | Block stale User A upload from updating User B profile or refreshing User B state | **VERIFIED OFFLINE** | `orderService.js` (`expectedUserId`), `ProfilePage.jsx` (`initiatingUserId`), `AuthContext.jsx` (`refreshProfile(expectedUserId)`), `test_phase4_stage_b2.mjs` Cases 3, 9, 10, 11 |
| STF-05 & Review Issue 3 | Account-isolated wishlist, DB sync, guest merge, and `{ ok, error }` wishlist-to-cart confirmation (single + bulk) | **VERIFIED OFFLINE** | `wishlistHelpers.js`, `wishlistService.js`, `cartService.js`, `CartContext.jsx`, `WishlistContext.jsx`, `WishlistPage.jsx`, `ProductCard.jsx`, `ProductDetailPage.jsx`, `test_phase4_stage_b2.mjs` Cases 4, 5, 7, 8, 13, 14, 15 |
| Review Issue 4 | Validate active product (`is_active = true`) before inserting single item via `addDatabaseWishlistItem` | **VERIFIED OFFLINE** | `wishlistService.js`, `wishlistHelpers.js`, `test_phase4_stage_b2.mjs` Case 6 |
| Restrictions | No SQL, migration, RLS, Storage policy, secret, deployment, or Git history modifications | **PASS** | Verified with repository checks and preserved Phase 9.2 Storage RLS policies |

---

## 2. Offline Verification Results

| Verification Gate | Result | Details |
|---|---|---|
| Stage B2 Suite (`node test_phase4_stage_b2.mjs`) | **PASS** | `15/15 passed, 0 failed` |
| Phase 4 Stage B1 Corrections (`node test_phase4_stage_b1_corrections.mjs`) | **PASS** | `14/14 passed, 0 failed` |
| Phase 4 Stage B1 (`node test_phase4_stage_b1.mjs`) | **PASS** | `14/14 passed, 0 failed` |
| Phase 3 Stage B Corrections (`node test_stage_b_corrections.mjs`) | **PASS** | `8/8 checks passed` |
| Phase 3 Stage B (`node test_phase3_stage_b.mjs`) | **PASS** | `12/12 tests passed` |
| Cancellation Safety (`node test_cancellation_suite.mjs` & `test_phase8_1_restoration_safety.mjs`) | **PASS** | `12/12` scenarios + `100%` inventory safety passed |
| Phase 9.2 SQL Static Suite (`node test_phase9_2_validation.mjs`) | **PRE-EXISTING FAIL (UNTOUCHED)** | `44/45 passed` (pre-existing Check 22 failure on untouched SQL file) |
| Workspace Lint (`npm run lint`) | **PASS** | `0 errors`, `68 warnings` across `117 files` |
| Production Bundle (`npm run build`) | **PASS** | `2164` modules built in `1.04s` |

---

## 3. Items Deferred Beyond Stage B2

1. **Storage RLS Policy Update & Versioned Non-Overwriting Avatar Replacement:** Revisit in final consolidated security and functionality review with explicit SQL/Storage RLS authorization.
2. **Remote Bucket Constraints (`allowed_mime_types`, `file_size_limit`) & Live Staging Browser/Supabase QA:** Browser UI rendering, real file picker flows, and live authenticated Supabase Storage/PostgreSQL RLS checks remain `NOT TESTED` in CLI.
