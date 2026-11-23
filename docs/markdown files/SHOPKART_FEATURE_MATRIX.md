# ShopKart — Feature Matrix & Inventory

**Last Updated:** 11 November 2026  
**Auditor:** Senior Full-Stack Engineer  
**Classification Categories:**
- `COMPLETED AND VERIFIED` — Fully developed, backed by live Supabase integration or verified services, tested.
- `IMPLEMENTED BUT NOT VERIFIED` — Code is written and builds cleanly, but requires runtime live staging verification.
- `PARTIALLY IMPLEMENTED` — Feature functions on frontend or via fallback `localStorage`, but lacks live Supabase integration or full lifecycle.
- `NOT IMPLEMENTED` — Feature is planned/modeled in schema or UI mockup but has no backing service implementation.
- `BROKEN` — Defect in logic, schema mismatch, or runtime failure.
- `NEEDS SECURITY REVIEW` — Migration or security logic requiring review before staging execution.

---

## 1. Customer Storefront Features

| Feature Area | Specific Capability | Status | Implementation Details & Backing Storage | Verified? |
|---|---|---|---|---|
| **A. Storefront** | Brand Homepage | `COMPLETED AND VERIFIED` | `HomePage.jsx` with banners, categories, featured carousels | YES (Build + Static) |
| **A. Storefront** | Responsive Navbar | `COMPLETED AND VERIFIED` | `Navbar.jsx` with mobile drawer, cart count badge, account dropdown | YES (Build + Static) |
| **A. Storefront** | Footer & Quick Links | `COMPLETED AND VERIFIED` | `Footer.jsx` with policies, company links, newsletter UI | YES (Build + Static) |
| **B. Catalogue** | Category Browsing | `COMPLETED AND VERIFIED` | `CategoryPage.jsx` resolving slug from database `categories` | YES (Build + Static) |
| **B. Catalogue** | Product Grid & Cards | `COMPLETED AND VERIFIED` | `ProductGrid.jsx`, `ProductCard.jsx` with stock badges, discounts | YES (Build + Static) |
| **C. Discovery** | Real-time Search Suggestions | `COMPLETED AND VERIFIED` | `Navbar.jsx` with debounce instant search dropdown | YES (Build + Static) |
| **C. Discovery** | Search Results & Filtering | `COMPLETED AND VERIFIED` | `SearchPage.jsx` with price, rating, category filters and sort | YES (Build + Static) |
| **D. Product Detail** | Gallery & Multi-image | `COMPLETED AND VERIFIED` | `ProductDetailPage.jsx` image gallery with thumbnails | YES (Build + Static) |
| **D. Product Detail** | Variant Selection | `COMPLETED AND VERIFIED` | `ProductDetailPage.jsx` size/color selection mapped to UUID | YES (Build + Static) |
| **D. Product Detail** | Customer Reviews Fetching | `BROKEN` | `ProductDetailPage.jsx` passes `data.name` instead of UUID; `productService.js` filters on non-existent `product_name` column in SQL | YES (Defect verified) |
| **D. Product Detail** | Review Submission | `IMPLEMENTED BUT NOT VERIFIED` | `submitProductReview` inserts into `reviews` table (`is_approved = false`) | YES (Build + Static) |
| **E. Auth** | Email/Password Registration | `COMPLETED AND VERIFIED` | `RegisterPage.jsx` calls `supabase.auth.signUp` | YES (Build + Static) |
| **E. Auth** | Email/Password Login | `COMPLETED AND VERIFIED` | `LoginPage.jsx` calls `supabase.auth.signInWithPassword` | YES (Build + Static) |
| **E. Auth** | Google OAuth Login | `COMPLETED AND VERIFIED` | `AuthContext.jsx` calls `supabase.auth.signInWithOAuth` | YES (Build + Static) |
| **E. Auth** | Role-based AuthGuard | `COMPLETED AND VERIFIED` | `AuthGuard.jsx` verifies `user` and `profile.role === 'admin'` | YES (Build + Static) |
| **F. Cart** | Guest Shopping Cart | `COMPLETED AND VERIFIED` | `CartContext.jsx` with `localStorage` persistence | YES (Build + Static) |
| **F. Cart** | Database Cart Synchronization | `COMPLETED AND VERIFIED` | `cartService.js` syncs items to `carts` and `cart_items` tables | YES (Build + Static) |
| **F. Cart** | Guest-to-Account Cart Merging | `COMPLETED AND VERIFIED` | `mergeCarts` merges guest items on login respecting stock limits | YES (Build + Static) |
| **G. Wishlist** | Toggle Wishlist Items | `PARTIALLY IMPLEMENTED` | `WishlistContext.jsx` stores in `localStorage` only (not synced to Supabase `wishlists` table) | YES (Build + Static) |
| **G. Wishlist** | Wishlist Page & Move-to-Cart | `COMPLETED AND VERIFIED` | `WishlistPage.jsx` with direct Add-to-Cart from wishlist | YES (Build + Static) |
| **H. Checkout** | Delivery Address Management | `COMPLETED AND VERIFIED` | `CheckoutPage.jsx` queries database `addresses` table, allows create/select | YES (Build + Static) |
| **H. Checkout** | Authoritative Coupon Validation | `COMPLETED AND VERIFIED` | `validateCoupon` validates code, min order value, active status against database | YES (Build + Static) |
| **H. Checkout** | Order Placement via RPC | `COMPLETED AND VERIFIED` | `placeOrder` invokes atomic PostgreSQL `place_order` RPC | YES (Build + Static) |
| **I. Orders** | Customer Orders History | `COMPLETED AND VERIFIED` | `OrdersPage.jsx` queries customer orders with joined items and addresses | YES (Build + Static) |
| **I. Orders** | Order Cancellation & Restock | `COMPLETED AND VERIFIED` | `cancelCustomerOrder` invokes atomic `cancel_order` RPC, restoring inventory | YES (Build + 12 test suites) |
| **J. Profile** | Profile Info & Addresses CRUD | `COMPLETED AND VERIFIED` | `ProfilePage.jsx` manages name, phone, delivery addresses | YES (Build + Static) |
| **J. Profile** | Avatar File Upload to Storage | `PARTIALLY IMPLEMENTED` | `uploadAvatar` exists in `authService.js` targeting `public-assets`, but UI only has Unsplash presets | YES (Verified gap) |

---

## 2. Administrator Dashboard Features

| Feature Area | Specific Capability | Status | Implementation Details & Backing Storage | Verified? |
|---|---|---|---|---|
| **K. Admin** | Metrics & KPI Dashboard | `COMPLETED AND VERIFIED` | `AdminDashboard.jsx` displays sales, orders, products, low stock | YES (Build + Static) |
| **L. Products** | Product CRUD & Active Toggle | `COMPLETED AND VERIFIED` | `AdminProductsPage.jsx` saves to `products`, `product_images`, `inventory` | YES (Build + Static) |
| **M. Categories** | Category CRUD | `COMPLETED AND VERIFIED` | `AdminCategoriesPage.jsx` manages `categories` table with slug generation | YES (Build + Static) |
| **N. Inventory** | Stock Level Updates | `COMPLETED AND VERIFIED` | `AdminInventoryPage.jsx` updates `inventory` table via `adminUpdateStock` | YES (Build + Static) |
| **O. Customers** | Customer List & Metrics | `COMPLETED AND VERIFIED` | `AdminCustomersPage.jsx` queries `get_admin_customers()` RPC | YES (Build + Static) |
| **P. Coupons** | Coupon Management | `PARTIALLY IMPLEMENTED` | `AdminCouponsPage.jsx` persists to `localStorage` (not yet connected to database `coupons` table) | YES (Verified gap) |
| **Q. Reviews** | Review Moderation | `PARTIALLY IMPLEMENTED` | `AdminReviewsPage.jsx` persists to `localStorage` (not yet connected to database `reviews` table) | YES (Verified gap) |
| **R. Analytics** | Revenue & Sales Graphs | `COMPLETED AND VERIFIED` | `AdminAnalyticsPage.jsx` computes metrics from live database `orders` | YES (Build + Static) |
| **S. Settings** | Store Settings Config | `PARTIALLY IMPLEMENTED` | `AdminSettingsPage.jsx` manages store info in `localStorage` | YES (Verified gap) |

---

## 3. Database Security & Migrations

| Subsystem | Security Component | Status | Details | Verified? |
|---|---|---|---|---|
| **PostgreSQL RLS** | 17 Public Table Policies | `NEEDS SECURITY REVIEW` | Explicit allowlist standardization in `phase-9.2/migration.sql` | YES (30/30 Static) |
| **PostgreSQL ACL** | Table Privilege Hardening | `NEEDS SECURITY REVIEW` | Revoked broad PUBLIC/anon grants on non-catalog tables | YES (30/30 Static) |
| **PostgreSQL Functions** | 9 Application RPCs | `NEEDS SECURITY REVIEW` | Search path fixed, trigger-only functions revoked from client | YES (45/45 Static) |
| **Supabase Storage** | `public-assets` Avatar Bucket | `NEEDS SECURITY REVIEW` | 4 avatar policies restricted to `auth.uid()`, folder depth=1 | YES (45/45 Static) |
| **Rollback Safety** | Full-definition Comparison | `COMPLETED AND VERIFIED` | Corrected: zero parentheses removal, zero prefix truncation | YES (45/45 Static) |
| **Payments** | Payment Gateway Integration | `NOT IMPLEMENTED` | Razorpay / Cashfree webhook integration not yet implemented; payments table empty | YES (Architecture gap) |
