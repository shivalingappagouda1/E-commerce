# ShopKart — Final Prioritized Development Plan

**Date:** 11 November 2026  
**Document Type:** Phased Development Plan & Dependency Sequence  
**Status:** Phase 1 & 1.2 Complete — Awaiting Approval for Phase 2  

---

## 1. Prioritized Task Sequence & Execution Matrix

```
┌─────────────────────────────────────────────────────────────┐
│ 1. PHASE 1 & 1.2: AUDIT & VALIDATION (COMPLETED)            │
│ ✓ Complete codebase & schema inspection                     │
│ ✓ Verified Review bug, Avatar UI gap & Admin CMS gaps       │
│ ✓ Reconciled Phase 9.2 rollback full-expression logic       │
│ ✓ Reclassified all features under strict verification rules │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. PHASE 2: BACKEND & DATABASE AUDIT (IMMEDIATE NEXT TASK)  │
│ • Deep-dive audit of all 17 public tables in schema.sql     │
│ • Validate all 9 stored functions, triggers, and search path│
│ • Map table constraints, foreign key cascades, and indexes  │
│ • Review staging seeds and identify duplicate migrations    │
│ • Deliverable: SHOPKART_BACKEND_DATABASE_AUDIT.md           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PHASE 3: SECURITY HARDENING (PHASE 9.2 PREPARATION)      │
│ • Local failure-injection tests for Phase 9.2 package       │
│ • Verify table ACL wipe, storefront public SELECTs, and RPCs│
│ • Ensure zero remote execution boundary is maintained       │
│ • Deliverable: PHASE_9_2_PREPARATION_SUMMARY.md             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. PHASE 4: CUSTOMER STOREFRONT ENHANCEMENTS                │
│ • Task 4.1: Fix Product Review Fetching Bug (product_id)    │
│ • Task 4.2: Connect Profile Avatar File Upload to Storage   │
│ • Task 4.3: Implement Database-Backed Wishlist Sync         │
│ • Task 4.4: Verify Responsive UI, Empty States & Cart Merges│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. PHASE 5: ADMIN DASHBOARD FULL DATABASE INTEGRATION       │
│ • Task 5.1: Connect Admin Coupons to `public.coupons` table │
│ • Task 5.2: Connect Admin Reviews Moderation to `reviews`   │
│ • Task 5.3: Connect Admin Banners CMS to `public.banners`   │
│ • Task 5.4: Verify Admin Role Authorization & RLS Isolation │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. PHASE 6: PAYMENT GATEWAY & BUSINESS LOGIC                │
│ • Task 6.1: Integrate Payment Gateway (Razorpay/Stripe)     │
│ • Task 6.2: Record Transactions in Database `payments` Table│
│ • Task 6.3: Webhook Signature Verification & Status Updates │
│ • Task 6.4: Enforce Idempotency & Duplicate Order Prevention│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. PHASE 7: COMPLETE TESTING                                │
│ • Task 7.1: Automated End-to-End Test Matrix Execution      │
│ • Task 7.2: Customer Lifecycle Testing (Signup to Delivery) │
│ • Task 7.3: Order Cancellation & Stock Restoration Testing  │
│ • Task 7.4: Production Build & Lint Verification            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. PHASE 8: PRODUCTION DEPLOYMENT                           │
│ • Task 8.1: Production Configuration & Secrets Verification │
│ • Task 8.2: Hardened Supabase RLS & Storage Verification    │
│ • Task 8.3: Production Smoke Testing & Handover Sign-off    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Dependencies & Blockers

| Task / Phase | Depends On | Unblocks | Blocker Details |
|---|---|---|---|
| **Phase 2 (Database Audit)** | Phase 1 & 1.2 Approval | Phase 3, 4, 5 | None. Read-only static inspection. |
| **Phase 3 (Security Review)** | Phase 2 Audit Findings | Remote Migration Approval | Remote execution is blocked pending explicit user authorization. |
| **Phase 4 (Customer Storefront)** | Phase 2 Audit | Phase 5 Admin Integration | Must use verified database UUIDs and relationships. |
| **Phase 5 (Admin CMS Sync)** | Phase 4 & Phase 2 | Phase 6 Payments | Admin review moderation requires customer reviews to exist with valid UUID foreign keys. |
| **Phase 6 (Payment Gateway)** | Phase 5 Admin Orders | Phase 7 E2E Testing | Requires selection of payment provider credentials. |
| **Phase 7 (Full Testing)** | Phase 4, 5, 6 | Phase 8 Deployment | All core flows must be complete. |
| **Phase 8 (Deployment)** | Phase 7 Approval | Production Launch | Requires explicit operator approval. |

---

## 3. Strict Operating Rules

1. **Zero Premature Code Mutations:** Do not begin modifying application code or database schemas until Phase 2 and respective implementation phases are formally reached.
2. **Zero Remote Execution:** Never execute remote SQL migrations or rollbacks against Supabase Staging or Production without explicit, affirmative user instruction.
3. **Preserve Existing Architecture:** Do not replace working components (e.g. cart reducer, product filters) with third-party wrappers or unnecessary redesigns.
4. **Preserve Documentation Integrity:** Maintain all development artifacts in the project root.
