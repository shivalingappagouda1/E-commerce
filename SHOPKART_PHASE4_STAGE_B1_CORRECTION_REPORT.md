# ShopKart — Phase 4 Stage B1 Correction Report

**Document Version:** 1.0.0  
**Phase:** Phase 4 — Customer Storefront Enhancements (Stage B1 Correction Pass)  
**Author:** Senior React + Supabase Systems Engineer  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  

---

## 1. Executive Summary

This correction pass addresses five specific findings identified during independent review of the original Phase 4 Stage B1 implementation:
- **Correction A (STF-03)**: Aligned curated product feeds with truth-in-advertising principles, removed all unsupported sales, popularity, and urgency claims (including a simulated countdown timer), and prevented invalid feed slugs from silently dumping the full catalog.
- **Correction B (STF-04)**: Implemented account-aware coupon persistence using identity-scoped storage keys (`shopkart_applied_coupon_<uuid>` and `shopkart_applied_coupon_guest`), purged the legacy global key, and ensured zero coupon leakage across account switching while preserving server-authoritative discount validation.
- **Correction C (STF-06)**: Hardened `handleReviewSubmit` against unexpected rejected promises with `try/catch/finally`, ensured `reviewSubmitting` loading state always resets, protected against duplicate submissions, and isolated review list refresh so refresh timeouts cannot fail a verified submission.
- **Correction D**: Implemented a dedicated `/reset-password` recovery destination (`ResetPasswordPage.jsx`), integrated it with Supabase Auth recovery sessions, improved `ForgotPasswordPage.jsx` error handling, and removed internal references (`.env.local`).
- **Correction E**: Hardened `AuthContext.jsx` with request sequence generation counters and active identity tracking, preventing older profile network requests from overwriting newer user profiles or resurrecting profiles after logout.

All corrections strictly complied with authorization boundaries:
- **Zero SQL changes** and zero database migrations.
- **Zero remote Supabase connections** or operations.
- **Zero Git commits, checkouts, resets, rebases, or branch changes**.
- **Preserved all pre-existing user code and styling patterns**.

---

## 2. Detailed Findings & Corrections

### 2.1 CORRECTION A — STF-03: Make Curated Product Feeds Truthful

#### Original Defect & Root Cause
The initial implementation of curated feeds used promotional headings and subtitles that claimed business facts unsupported by the query logic:
- Best sellers claimed products were "ordered by thousands of customers" when the query only filtered by `rating >= 4.5` and sorted by `review_count`.
- Trending claimed products were "flying off the shelves this week" when the query only filtered by static product badges (`Trending`, `Hot`, `Top Deal`).
- Deals featured a fake 8-hour countdown timer ("Ends in: 07h:42m:18s") and claimed "flash discounts updated every 24 hours" when discounts are fixed catalog values.
- If an invalid feed slug was supplied (e.g. `feed="unknown"`), `CategoryPage.jsx` silently fell back to `fetchProducts()`, dumping the entire product catalog under an empty feed label.

#### Exact Correction
1. **Terminology Corrections**:
   - `/featured`: Renamed to **Featured Products** ("Catalog items highlighted as featured").
   - `/best-sellers`: Renamed to **Top Rated & Reviewed** ("Products with customer rating 4.5+ sorted by review count").
   - `/trending`: Renamed to **Tagged Picks** ("Products tagged with promotional badges (Trending, Hot, Top Deal)").
   - `/deals`: Renamed to **30%+ Discounts** ("Products discounted by 30% or more off list price").
2. **Homepage Cleanup**:
   - Replaced `FlashDealsStrip` with truthful `DealsStrip`.
   - Removed the simulated interval timer and fake "Ends in" countdown pill.
   - Added a direct "View All Discounts" link to `/deals`.
3. **Invalid Slug Guard**:
   - Added `isInvalidFeed = isFeedRoute && !activeFeed` detection in `CategoryPage.jsx`.
   - When an invalid feed is requested, `loadProductsPromise` immediately resolves to `{ data: [] }` rather than calling `fetchProducts()`.
   - Rendered a dedicated "Curated Collection Not Found" error banner with a link to browse all products.

**Acceptance Status:** **PASS**

---

### 2.2 CORRECTION B — STF-04: Fix Coupon Persistence and Account Isolation

#### Original Defect & Root Cause
The initial Stage B1 implementation persisted applied coupons under a single global LocalStorage key: `shopkart_applied_coupon`.
This introduced a cross-account leakage risk: if User A applied a coupon and User B signed in on the same browser (or if an unauthenticated guest applied a coupon), User B or the authenticated user would inherit the previous user's coupon state.

#### Exact Correction
1. **Account-Aware Storage Scoping**:
   - Implemented `getCouponStorageKey(userId)`:
     - Authenticated users: `shopkart_applied_coupon_<user-uuid>`
     - Guests: `shopkart_applied_coupon_guest`
2. **Legacy Storage Purge**:
   - Purged legacy `shopkart_applied_coupon` without transferring it across accounts.
3. **Authentication Lifecycle Synchronization**:
   - While `authLoading` is true during bootstrap, `appliedCoupon` remains `null` to prevent UI flashing of another account's state.
   - On identity change, `CartContext` dynamically loads only the coupon corresponding to the active `user?.id` or `guest`.
   - When Account A signs out and Account B signs in, Account B reads `shopkart_applied_coupon_<userB>`, ensuring complete isolation.
   - When Account A logs back in, Account A's coupon is restored from its own scoped key.
   - `clearCart()` removes only the active user's/guest's coupon.
4. **Server-Side Authority Preserved**:
   - LocalStorage stores only minimal display metadata (`code, type, value, min_order_value`).
   - The authoritative discount computation remains strictly inside the database RPC `place_order(p_address_id, p_notes, p_coupon_code)`.

**Acceptance Status:** **PASS**

---

### 2.3 CORRECTION C — STF-06: Make Review Submission Resilient to Rejected Promises

#### Original Defect & Root Cause
In `ProductDetailPage.jsx`, `handleReviewSubmit` inspected `{ data, error }` return values from `submitProductReview()`, but was not wrapped in `try/catch/finally`. If `submitProductReview()` threw an unhandled exception (such as a network drop or client timeout), `reviewSubmitting` remained `true`, permanently freezing the form. Additionally, if the subsequent `fetchProductReviews` failed, it could reject without error handling.

#### Exact Correction
1. **Double Submission Guard**: Added `if (reviewSubmitting) return` at the top of `handleReviewSubmit`.
2. **Guaranteed State Reset**: Enclosed the entire submission workflow in `try/catch/finally`, with `setReviewSubmitting(false)` in `finally`.
3. **Exception Handling**: Caught promise rejections in `catch(err)` and set user-friendly error feedback while preserving user comments and keeping the modal open.
4. **Isolated Review Refresh**: Enclosed `fetchProductReviews()` in a nested `try/catch` block so a refresh failure or network glitch cannot cause unhandled rejections or convert a successful review insertion into a failure.

**Acceptance Status:** **PASS**

---

### 2.4 CORRECTION D — Password Reset Flow and Reset Password Destination

#### Original Defect & Root Cause
`AuthContext.jsx` initiated password recovery redirects to `${window.location.origin}/reset-password`, but `/reset-password` was never registered in `AppRoutes.jsx`, resulting in a 404 error when users clicked reset links. Additionally, `ForgotPasswordPage.jsx` exposed implementation details (`.env.local`) and did not manage loading state with `try/finally`.

#### Exact Correction
1. **Dedicated Reset Password Page (`src/pages/customer/ResetPasswordPage.jsx`)**:
   - Created a dedicated page that checks for an active Supabase recovery session via `getSession()` and listens for `PASSWORD_RECOVERY` events.
   - If no recovery session exists, displays a clear "Invalid or Expired Link" card with a button to request a new link.
   - Enforces password validation (minimum 6 characters, confirmation match).
   - Calls `supabase.auth.updateUser({ password })`.
   - On success, displays a confirmation screen and guides the user to `/login`.
2. **Routing Integration (`src/routes/AppRoutes.jsx`)**:
   - Added lazy-loaded chunk for `ResetPasswordPage` and registered route `/reset-password`.
3. **Forgot Password Hardening (`src/pages/customer/ForgotPasswordPage.jsx`)**:
   - Converted to `try/catch/finally` to guarantee `submitting` resets to `false`.
   - Removed `.env.local` reference.
   - Maintained privacy-preserving generic confirmation.

**Acceptance Status:** **PASS**

---

### 2.5 CORRECTION E — AuthContext: Prevent Stale Profile Updates

#### Original Defect & Root Cause
In `AuthContext.jsx`, `fetchProfile(userId)` fetched user profile rows asynchronously. If User A signed in, triggering a slow profile request, and User B signed in shortly afterward (or if User A logged out), the older request could resolve later and overwrite the profile state with User A's data, creating an account data leak and privilege state corruption.

#### Exact Correction
1. **Sequence Number Tracking**: Introduced `profileFetchSeqRef = useRef(0)` and `activeUserIdRef = useRef(null)`.
2. **Stale Request Discarding**: Incremented sequence counter on every `fetchProfile` call. When a response arrives, it is discarded if `currentSeq !== profileFetchSeqRef.current || activeUserIdRef.current !== userId`.
3. **Immediate Reset on Auth State Change**: When `session?.user?.id` changes or user logs out, `setProfile(null)` is called immediately, and `activeUserIdRef` is updated before dispatching any new request.
4. **Preserved Fields**: Preserved all profile fields (`id, full_name, avatar_url, role, phone`) and `isAdmin` behavior.

**Acceptance Status:** **PASS**

---

## 3. Summary of Files Changed

| File Path | Action | Description |
|---|---|---|
| `src/context/AuthContext.jsx` | Modified | Added request sequence counter and active user ref to prevent stale profile overwrites (`Correction E`) |
| `src/context/CartContext.jsx` | Modified | Implemented user-scoped and guest-scoped coupon storage keys and legacy purge (`Correction B`) |
| `src/pages/customer/CategoryPage.jsx` | Modified | Truthful feed labels, subtitles, and invalid slug catalog dumping guard (`Correction A`) |
| `src/pages/customer/HomePage.jsx` | Modified | Truthful section titles, removed fake timer and countdown urgency (`Correction A`) |
| `src/pages/customer/ProductDetailPage.jsx` | Modified | `try/catch/finally` error handling, double submission guard, isolated refresh (`Correction C`) |
| `src/pages/customer/ForgotPasswordPage.jsx` | Modified | Managed loading state with `try/finally`, safe error handling, removed `.env.local` (`Correction D`) |
| `src/pages/customer/ResetPasswordPage.jsx` | **NEW** | Dedicated password reset page with recovery session detection and `updateUser` (`Correction D`) |
| `src/routes/AppRoutes.jsx` | Modified | Registered lazy-loaded `/reset-password` route (`Correction D`) |
| `test_phase4_stage_b1_corrections.mjs` | **NEW** | 15-test automated verification suite covering all 5 corrections |

---

## 4. Remaining External Dependencies & Limitations

1. **Supabase Dashboard Redirect URL Configuration**:
   The `/reset-password` workflow depends on Supabase Auth configuration allowing `${window.location.origin}/reset-password` in the project's **Redirect URLs** allowlist in the Supabase Dashboard. Under strict read-only backend operating rules, this setting cannot be verified or altered locally.
2. **Staging Database Product Badges**:
   The `/trending` feed queries `badge in ('Trending', 'Hot', 'Top Deal')`. This requires catalog products to have these values assigned in the `products` table (populated via `database/seed_staging.sql`).
