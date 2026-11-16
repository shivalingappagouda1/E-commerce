# ShopKart — Master Development Plan & Execution Roadmap

**Date:** 11 November 2026  
**Auditor & Lead Architect:** Senior Full-Stack Engineer  
**Reference Document:** ShopKart Master Project Development Instructions  
**Status:** Phase 1 Complete — Ready for Phase 2 Approval  

---

## 1. Development Roadmap Overview

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Complete Project Audit (COMPLETED)                │
│ ✓ Inspect repository, build, lint & test suites             │
│ ✓ Identify architecture, feature inventory & bug register   │
│ ✓ Generate Audit, Feature Matrix, Bug Report & Plan         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Backend & Database Schema Audit (NEXT STEP)        │
│ • Inspect all 17 public tables, constraints & indexes       │
│ • Audit 9 PostgreSQL functions, triggers & search paths     │
│ • Audit foreign keys, cart persistence & order transactions │
│ • Document duplicate/legacy migrations without remote SQL   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Security Hardening Review (Phase 9.2 Package)      │
│ • Review corrected Section 2 Storage rollback comparison   │
│ • Audit table ACLs, function execution grants & allowlists  │
│ • Run local static safety test suites (30/30 & 45/45)       │
│ • Maintain zero remote execution boundary until approval   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 4: Customer Storefront Enhancements                   │
│ • Fix Bug 1: Correct review query to use product_id UUID    │
│ • Fix Bug 2: Hook up avatar file upload to Storage bucket   │
│ • Fix Bug 3: Implement database-backed wishlist sync        │
│ • Validate responsive layout, empty states & loading UI     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 5: Admin Dashboard Full Supabase Integration          │
│ • Connect Admin Coupons to database `coupons` table         │
│ • Connect Admin Reviews to database `reviews` table         │
│ • Connect Admin Banners to database `banners` table         │
│ • Verify admin authorization boundaries & RLS policies      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 6: Payment Gateway & Business Logic                   │
│ • Select & integrate real payment provider (Razorpay/Stripe)│
│ • Record payment transactions in database `payments` table  │
│ • Verify webhook signature verification & order transitions │
│ • Test stock reservation & cancellation refunds             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 7: Complete End-to-End Testing                        │
│ • Execute full customer lifecycle test (Sign-up to delivery)│
│ • Execute admin lifecycle test (Product/Order/Stock updates)│
│ • Run cross-browser and mobile responsive checks            │
│ • Document all test runs and outputs                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 8: Production Deployment                              │
│ • Prepare production environment configuration              │
│ • Verify domain, SSL, CDN & database hardening              │
│ • Execute smoke tests under explicit operator authorization │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Detailed Task Breakdown & Dependencies

### Phase 2: Backend and Database Audit
- **Objective:** Deep-dive analysis of PostgreSQL relational integrity, RLS policy coverage, and stored procedure behaviors.
- **Tasks:**
  1. Audit schema definitions in `database/schema.sql` against staging seeds (`seed_staging.sql`).
  2. Verify all foreign key cascade rules (`ON DELETE CASCADE` vs `RESTRICT`).
  3. Validate RLS policy predicates across all 17 tables for `anon` and `authenticated` roles.
  4. Inspect all 9 stored functions:
     - `public.place_order(uuid, text, text)`
     - `public.cancel_order(uuid)`
     - `public.restore_inventory_on_cancellation()`
     - `public.sync_user_cart(jsonb)`
     - `public.get_admin_customers()`
     - `public.is_admin()`
     - `public.create_profile_on_signup()`
     - `public.prevent_role_self_escalation()`
     - `public.set_updated_at()`
  5. Check for legacy/duplicate migrations in `database/migrations/`.
- **Preconditions:** None (read-only code inspection).
- **Deliverables:** `SHOPKART_BACKEND_DATABASE_AUDIT.md`.

### Phase 3: Security Hardening (Phase 9.2 Package)
- **Objective:** Review the Phase 9.2 hardening package and ensure it addresses all outstanding vulnerabilities.
- **Tasks:**
  1. Inspect the corrected `rollback.sql` Section 2: verify zero parentheses removal, zero prefix truncation, and independent clause verification for SELECT, INSERT, UPDATE, and DELETE.
  2. Verify preflight snapshot checks for 17 tables, 9 functions, 38 RLS policies, 4 storage policies, and 26 snapshot columns.
  3. Confirm that preflight checks abort if grantee roles are dropped.
  4. Run failure-injection tests (`testSafeguardCommandMismatch`, `testSafeguardUsingMismatch`, `testSafeguardStorageUpdateWithCheckMismatch`, `testSafeguardMissingSnapshotIdentity`).
- **Dependencies:** Requires Phase 2 schema audit.
- **Security Boundary:** No remote execution without explicit operator approval.

### Phase 4: Customer Storefront Enhancements
- **Objective:** Fix frontend data layer defects and complete customer lifecycle features.
- **Tasks:**
  1. Fix review fetching in `ProductDetailPage.jsx` and `productService.js`: pass `product.id` and filter by `product_id = productId`.
  2. Add avatar upload component in `ProfilePage.jsx` calling `uploadAvatar({ userId, file })` with type/size validation (png, jpg, webp, gif; < 2MB).
  3. Implement `src/services/wishlistService.js` to sync wishlist items with `wishlists` and `wishlist_items` tables for authenticated users.
  4. Verify all customer storefront empty states, loading indicators, and error toasts.
- **Dependencies:** Requires Phase 2 & 3.

### Phase 5: Admin Dashboard Full Supabase Integration
- **Objective:** Connect remaining admin CMS pages to live Supabase database tables.
- **Tasks:**
  1. Connect `AdminCouponsPage.jsx` to `public.coupons` table via `adminService.js`.
  2. Connect `AdminReviewsPage.jsx` to `public.reviews` table (approval/rejection) via `adminService.js`.
  3. Connect `AdminBannersPage.jsx` to `public.banners` table via `adminService.js`.
  4. Connect `AdminSettingsPage.jsx` to database settings table or documented configuration pattern.
  5. Validate admin authorization boundaries and RLS denial for non-admin accounts.
- **Dependencies:** Requires Phase 4.

### Phase 6: Payment Gateway & Business Logic
- **Objective:** Transition from simulated checkout to production-grade payment architecture.
- **Tasks:**
  1. Select payment provider (e.g. Razorpay / Cashfree / Stripe).
  2. Implement backend payment initialization and client checkout modal.
  3. Record payment rows in database `payments` table with transaction ID, provider, and status.
  4. Implement webhook/signature verification to transition order status from `pending` to `processing`.
  5. Validate refund handling on order cancellation.
- **Dependencies:** Requires Phase 5.

### Phase 7: Complete Testing
- **Objective:** Comprehensive functional, security, and responsive test pass.
- **Tasks:**
  1. Run complete automated validation suites (`test_phase9_validation.mjs`, `test_phase9_2_validation.mjs`, `test_cancellation_suite.mjs`).
  2. Execute manual test matrix across all customer and admin flows.
  3. Verify responsive layout on mobile, tablet, and desktop viewports.
  4. Run production build and linting checks.
- **Dependencies:** Requires Phase 6.

### Phase 8: Production Deployment
- **Objective:** Deploy hardened application and database to production environment.
- **Tasks:**
  1. Verify production environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
  2. Audit production Supabase RLS policies and bucket configurations.
  3. Perform production smoke testing under explicit operator supervision.
- **Dependencies:** Requires Phase 7 approval.

---

## 3. Strict Operating Rules Checklist

- [x] Zero remote database executions during audit phases.
- [x] No modifications to application source code during Phase 1.
- [x] All 21 feature areas inspected directly from source files.
- [x] Every defect independently verified against existing code.
- [x] Wait for explicit user review and approval before starting Phase 2.
