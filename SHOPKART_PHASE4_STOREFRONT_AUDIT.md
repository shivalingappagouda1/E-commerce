# ShopKart — Phase 4 Storefront Audit (Stage A: Read-Only)

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-11  
**Project:** ShopKart E-Commerce Platform  
**Phase:** Phase 4 — Customer Storefront Enhancements (Stage A: Read-Only Audit)  
**Auditor:** Senior Frontend Architect & Application Security Engineer  
**Authorization Mode:** STRICT READ-ONLY (Zero source, schema, test, or database modifications)

---

## 1. Executive Summary

This document presents the comprehensive, read-only architectural and functional audit of the customer-facing storefront for **ShopKart**.

Phase 1 (Initial Audit), Phase 2 / 2.1 (Backend & Database Deep Audit), Phase 3 Stage A (Security Architecture), and Phase 3 Stage B (Authorized Security Fixes & Final Verification) established that ShopKart has a robust backend schema, hardened Storage RLS policies, transactional RPCs (`place_order`, `sync_user_cart`, `cancel_order`), and strict UUID review fetching.

However, the customer-facing storefront currently exhibits critical disconnects between the UI layer, client contexts, and backend capabilities:
1. **Missing Avatar File Upload UI (`STF-01`):** While `authService.uploadAvatar` was hardened in Phase 3 Stage B with 5 MB size validation, MIME whitelisting, and extension normalization, `ProfilePage.jsx` does not have a file upload input (`<input type="file" />`) and only allows users to select 4 hardcoded static Unsplash URLs.
2. **Missing Routes & Dead Footer / Auth Links (`STF-02`):** Clicking any of the 11 footer links (`/about`, `/careers`, `/help`, `/returns`, `/privacy`, etc.) or the login "Forgot password?" link (`/forgot-password`) routes to a 404 Not Found page.
3. **Route Misalignment on Catalog Feeds (`STF-03`):** Routes `/featured`, `/best-sellers`, `/trending`, and `/deals` in `AppRoutes.jsx` point to `CategoryPage.jsx` without route parameters or query filters, causing them to render the entire catalog ("All Products") rather than curated sets.
4. **Checkout Coupon State Loss (`STF-04`):** Applying a valid coupon code in `CartPage.jsx` stores it only in local component state. When the customer clicks "Proceed to Checkout", the coupon state is dropped, forcing the user to re-apply the coupon on `CheckoutPage.jsx`.
5. **Wishlist Lack of Account Isolation & Supabase Sync (`STF-05`):** `WishlistContext.jsx` persists exclusively to a single un-scoped `localStorage` key (`shopkart_wishlist`), leaking saved items across different customer accounts on shared devices, and has zero Supabase database synchronization.
6. **Silent Review Submission Failure (`STF-06`):** `ProductDetailPage.jsx` does not check the error response returned by `submitProductReview`. If an unauthenticated user or invalid payload is submitted, the UI displays a green success message despite database rejection.
7. **Client-Side Heavy Catalog Fetching (`STF-07`):** `SearchPage.jsx` and `CategoryPage.jsx` fetch all products into client memory via `fetchProducts()` and filter in JavaScript without server-side pagination, database full-text search, or infinite scrolling, presenting serious performance bottlenecks at scale.

---

## 2. Storefront Architecture Overview

### 2.1 Technology Stack & Dependencies
- **Core Framework:** React 19 (`react: ^19.2.8`, `react-dom: ^19.2.8`)
- **Build System:** Vite 8 (`vite: ^8.3.0`, `@vitejs/plugin-react: ^6.1.1`)
- **Styling System:** Tailwind CSS v4 (`tailwindcss: ^4.3.5`, `@tailwindcss/vite: ^4.3.5`)
- **Routing:** React Router DOM v7 (`react-router-dom: ^7.18.5`)
- **Icons:** Lucide React (`lucide-react: ^1.70.0`)
- **Backend SDK:** `@supabase/supabase-js: ^2.119.0`
- **Linting:** Oxlint (`oxlint: ^1.81.0`)

### 2.2 Provider Hierarchy
The application context tree is cleanly arranged in `src/App.jsx`:
$$\text{BrowserRouter} \longrightarrow \text{AuthProvider} \longrightarrow \text{CartProvider} \longrightarrow \text{WishlistProvider} \longrightarrow \text{AppRoutes}$$

- **`AuthProvider` (`src/context/AuthContext.jsx`):** Listens to Supabase Auth state changes, resolves the customer profile row, and computes `isAdmin`.
- **`CartProvider` (`src/context/CartContext.jsx`):** Manages local cart state, hydrates from `localStorage`, validates product UUIDs, debounces synchronization to PostgreSQL via `sync_user_cart` RPC, and executes intelligent cart merging upon login.
- **`WishlistProvider` (`src/context/WishlistContext.jsx`):** Standalone `localStorage` store for favorited products.
- **`CustomerLayout` (`src/components/layout/CustomerLayout.jsx`):** Wraps all storefront routes with the shared sticky `Navbar` and `Footer`.

---

## 3. Inventory of Pages and Components Inspected

| Category | File Path | Primary Function | State & Integration |
|---|---|---|---|
| **Layout** | `src/components/layout/CustomerLayout.jsx` | Top-level customer shell | Renders Navbar, main `<Outlet />`, Footer |
| **Layout** | `src/components/layout/Navbar.jsx` | Primary header & navigation | Live autocomplete search, category strip, cart/wishlist counters, user menu |
| **Layout** | `src/components/layout/HeroBanner.jsx` | Homepage hero carousel | 3 auto-rotating promo slides with indicator dots and pause-on-hover |
| **Layout** | `src/components/layout/Footer.jsx` | Storefront footer | Value trust badges, company links, customer service links, social icons |
| **Common** | `src/components/common/AuthGuard.jsx` | Route gatekeeper | Protects `/orders`, `/profile`, and `/admin/*` routes |
| **Common** | `src/components/common/Badge.jsx` | Reusable product tag | Style dictionary for "Best Seller", "Trending", "Hot", "Top Deal", etc. |
| **Common** | `src/components/common/SectionHeading.jsx` | Section title & "View All" link | Standard header for product discovery rows |
| **Common** | `src/components/common/StarRating.jsx` | Star rating display | Renders full, half, and empty stars with review count |
| **Products**| `src/components/products/ProductCard.jsx` | Universal product card | Image, discount badge, stock status, wishlist toggle, cart stepper / add button |
| **Products**| `src/components/products/ProductGrid.jsx` | Responsive product grid | Configurable columns (`cols={4}`, etc.) |
| **Pages** | `src/pages/customer/HomePage.jsx` | Storefront homepage | Hero banner, value propositions, categories, flash deals, featured, best sellers, trending, newsletter |
| **Pages** | `src/pages/customer/CategoryPage.jsx` | Department catalog | Category sidebar, price slider, star filter, stock filter, grid/list view switcher |
| **Pages** | `src/pages/customer/ProductDetailPage.jsx`| Product details & reviews | Multi-image gallery, variant selector, PIN code checker, specs table, review submit/list |
| **Pages** | `src/pages/customer/SearchPage.jsx` | Search results | Text query matching, category filter, price slider, rating filter, sort dropdown |
| **Pages** | `src/pages/customer/CartPage.jsx` | Shopping cart | Item list, quantity stepper, free shipping progress bar, coupon input, order summary |
| **Pages** | `src/pages/customer/WishlistPage.jsx` | Customer wishlist | Saved items grid, move-to-cart, move-all-to-cart, item removal |
| **Pages** | `src/pages/customer/CheckoutPage.jsx` | Multi-step checkout | Saved address selector, new address modal, coupon input, payment method, order placement |
| **Pages** | `src/pages/customer/OrderConfirmationPage.jsx`| Order placement confirmation | Success hero, generated order ID, estimated delivery date, delivery address summary |
| **Pages** | `src/pages/customer/OrdersPage.jsx` | Order history & tracking | Order status filtering, live delivery stepper, customer order cancellation modal |
| **Pages** | `src/pages/customer/ProfilePage.jsx` | Account & addresses | Profile information form, preset avatar picker, delivery address management |
| **Pages** | `src/pages/customer/LoginPage.jsx` | Customer login | Email/password sign-in, Google OAuth trigger, link to register and forgot-password |
| **Pages** | `src/pages/customer/RegisterPage.jsx` | Customer registration | Full name, email, password, confirm password, Google OAuth trigger |
| **Pages** | `src/pages/customer/NotFoundPage.jsx` | 404 error page | Not found message with link back to homepage |
| **Pages** | `src/pages/customer/PlaceholderPage.jsx` | Stub page component | Under-construction placeholder (currently unrouted) |

---

## 4. Comprehensive Feature Audit Matrix

| Feature | Existing Implementation | Status | Problem Identified | Priority | Recommended Improvement |
|---|---|---|---|---|---|
| **Avatar File Upload** | `src/services/authService.js` (backend helper) vs `ProfilePage.jsx` (UI) | **BROKEN** | UI only displays 4 preset Unsplash URLs. No `<input type="file" />` exists. `uploadAvatar` is never called. | **P0** | Add `<input type="file" />` with drag-and-drop or file picker, wiring directly to `uploadAvatar`. |
| **Informational Routes** | `Footer.jsx` links to `/about`, `/help`, `/terms`, etc. | **BROKEN** | 11 footer links route to 404 page because routes are absent from `AppRoutes.jsx`. | **P1** | Add informative content pages or wire to `PlaceholderPage` with clear titles. |
| **Forgot Password Route** | `LoginPage.jsx:95` links to `/forgot-password` | **BROKEN** | Clicking "Forgot password?" hits 404 Not Found. | **P1** | Implement `ForgotPasswordPage.jsx` invoking `resetPassword` from `AuthContext`. |
| **Curated Feed Routing** | `AppRoutes.jsx:77-80` maps `/featured`, `/trending`, etc. to `CategoryPage` | **PARTIALLY WORKING** | `useParams().slug` is `undefined`. Loads all products rather than filtering by curated feed. | **P1** | Pass filter mode to `CategoryPage` or support feed parameters (`feed="featured"`, etc.). |
| **Checkout Coupon Retention** | `CartPage.jsx` state vs `CheckoutPage.jsx` state | **BROKEN** | Coupon applied in cart is lost upon navigating to checkout; customer must re-enter. | **P1** | Lift applied coupon into `CartContext` or pass via router navigation state. |
| **Wishlist Account Isolation** | `WishlistContext.jsx` uses `'shopkart_wishlist'` | **PARTIALLY WORKING** | Un-scoped key leaks wishlist items across different accounts on the same computer. | **P1** | Scope storage key to `shopkart_wishlist_${user?.id || 'guest'}` and sync with Supabase. |
| **Review Submission Feedback** | `ProductDetailPage.jsx:150-169` | **BROKEN** | `handleReviewSubmit` ignores error returned by service, falsely showing success on failure. | **P1** | Check `{ error }` from `submitProductReview` and display accurate error alert to user. |
| **Catalog Pagination** | `CategoryPage.jsx` & `SearchPage.jsx` render all matches | **PARTIALLY WORKING** | Fetches and renders all items in one DOM render. No pagination or infinite scroll. | **P2** | Implement pagination controls (e.g. 12 items/page) or windowed infinite scroll. |
| **Product Image Zoom** | `ProductDetailPage.jsx:195-201` | **MISSING** | Image display is a static box without hover zoom, magnifier lens, or lightbox modal. | **P2** | Add a hover zoom lens or full-screen modal zoom for high-res product inspection. |
| **Live Search Backend Query** | `Navbar.jsx:43-55` filters in-memory products | **PARTIALLY WORKING** | Pulls all products into client memory to autocomplete. Unscalable for large catalog. | **P2** | Implement debounced Supabase `ilike` or text search RPC for search suggestions. |
| **Recently Viewed Products** | Homepage and Product Detail Page | **MISSING** | No tracking of recently viewed product slugs or display row on homepage. | **P3** | Store recent product slugs in `localStorage` and display "Recently Viewed" section. |
| **Customer Order Cancellation** | `OrdersPage.jsx` with modal confirmation | **WORKING** | Verifies cancellable status, invokes `cancel_order` RPC, locks rows, restores inventory. | **P0** | Retain existing hardened implementation. |
| **Order Placement & RPC** | `CheckoutPage.jsx` calling `placeOrder` | **WORKING** | Validates address ownership, syncs cart, calls `place_order` RPC with coupon code. | **P0** | Retain existing hardened implementation. |
| **Cart Quantity Clamping** | `CartContext.jsx` & `ProductCard.jsx` | **WORKING** | Clamps between 1 and inventory stock; updates debounced to database. | **P1** | Retain existing implementation. |

---

## 5. Functional Defects Analysis

### 5.1 STF-01: Avatar Upload UI Completely Disconnected from `authService.js`
- **Location:** [`src/pages/customer/ProfilePage.jsx:294-310`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProfilePage.jsx#L294-L310)
- **Defect:** In Phase 3 Stage B, `authService.uploadAvatar({ userId, file })` was hardened with 5 MB file size checks, MIME whitelisting, lowercase normalization, and MIME-to-extension contradiction checks. However, `ProfilePage.jsx` does not have an `<input type="file" />` element. Customers can only click 4 preset Unsplash avatar URLs. `uploadAvatar` is not even imported.
- **Impact:** Customers cannot upload their own profile pictures, completely disabling a primary customer customization feature.

### 5.2 STF-02: Missing Informational & Auth Routes Resulting in 404 Errors
- **Location:** [`src/components/layout/Footer.jsx:5-21`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/components/layout/Footer.jsx#L5-L21) and [`src/pages/customer/LoginPage.jsx:95`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/LoginPage.jsx#L95)
- **Defect:** `Footer.jsx` renders links to `/about`, `/careers`, `/press`, `/blog`, `/help`, `/returns`, `/track-order`, `/shipping`, `/privacy`, `/terms`, and `/cookies`. `LoginPage.jsx` renders a link to `/forgot-password`. None of these routes exist in `AppRoutes.jsx`, causing all of them to fall through to `<NotFoundPage />`.
- **Impact:** Broken customer trust, poor SEO, and inability to reset forgotten passwords.

### 5.3 STF-03: Curated Homepage Feed Links Render Unfiltered Catalog
- **Location:** [`src/routes/AppRoutes.jsx:77-80`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/routes/AppRoutes.jsx#L77-L80) and [`src/pages/customer/CategoryPage.jsx:21, 38`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CategoryPage.jsx#L21)
- **Defect:** Clicking "View All" on Homepage sections (Featured Collections $\rightarrow$ `/featured`, Best Selling Products $\rightarrow$ `/best-sellers`, Trending $\rightarrow$ `/trending`, Super Deals $\rightarrow$ `/deals`) routes to `CategoryPage`. Because `CategoryPage` reads `const { slug } = useParams()`, `slug` is `undefined`, causing `selectedCategory` to default to `'all'` and rendering the entire product catalog rather than the filtered subset.
- **Impact:** Misleading user experience; customers clicking "Super Deals" or "Best Sellers" do not get the curated list.

### 5.4 STF-04: Coupon State Lost During Cart-to-Checkout Navigation
- **Location:** [`src/pages/customer/CartPage.jsx:21-22, 353`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CartPage.jsx#L21-L22) and [`src/pages/customer/CheckoutPage.jsx:39-44`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/CheckoutPage.jsx#L39-L44)
- **Defect:** Customers can validate and apply coupons (e.g., `SHOPKART10`) on the Cart page. However, `appliedCoupon` is held in local component state. When the user clicks "Proceed to Checkout", navigation occurs without passing the coupon object, and `CheckoutPage.jsx` initializes with `appliedCoupon = null`.
- **Impact:** Customer frustration; users believe their discount was discarded or not honored, increasing checkout abandonment.

### 5.5 STF-05: Review Submission Silent Failure on Auth Rejection
- **Location:** [`src/pages/customer/ProductDetailPage.jsx:143-170`](file:///c:/Users/shiva/OneDrive/Documents/3)projects/E-Commerece/src/pages/customer/ProductDetailPage.jsx#L143-L170)
- **Defect:** `handleReviewSubmit` invokes `await submitProductReview(...)` without checking the return value. If the customer is not logged in or Supabase returns an error, the code still sets `reviewSuccess = true` and shows `"Thank you! Your product review has been submitted successfully."` while the review was never inserted into the database.
- **Impact:** False confirmation to customer; user thinks their review was saved when it was discarded.

---

## 6. UI/UX and Visual Quality Findings

1. **Design System & Visual Consistency:**
   - Styling is built on Tailwind CSS v4 using brand tokens (`--color-brand-500: #f97316`, modern slate neutrals, emerald accents).
   - Card surfaces, badges, and typography (`Inter` / system-ui sans-serif) are clean and Flipkart/Amazon-aligned.
2. **Missing Product Image Zoom:**
   - On the Product Detail Page (`ProductDetailPage.jsx`), product images are rendered in a fixed container. There is no hover-zoom lens or click-to-expand modal, which is standard for e-commerce platforms.
3. **Empty States:**
   - Cart (`CartPage.jsx`), Wishlist (`WishlistPage.jsx`), Search Results (`SearchPage.jsx`), and Category filtering all feature custom empty-state illustrations with actionable buttons ("Explore Products", "Reset Filters").
4. **Header Navigation Overload on Tablet Breakpoints:**
   - `Navbar.jsx` contains brand logo, search bar, account dropdown, wishlist icon, and cart pill. On medium tablet screens (`768px` to `1024px`), the search bar and account pill can compress or wrap awkwardly.
5. **Lack of Breadcrumbs on Cart & Checkout:**
   - `ProductDetailPage.jsx` and `CategoryPage.jsx` have breadcrumbs, but `CheckoutPage.jsx` and `CartPage.jsx` only have a simple back arrow.

---

## 7. Performance and Frontend Quality Findings

1. **Client-Side Catalog Filtering:**
   - Both `CategoryPage.jsx` and `SearchPage.jsx` call `fetchProducts()` without category parameters or limit arguments, downloading the entire product catalog into client memory before filtering in JavaScript. While acceptable for a small dataset, this causes high memory consumption and latency on larger catalogs.
2. **Missing Pagination / Virtualization:**
   - If a category contains 500+ items, `filteredProducts.map(...)` renders all 500 DOM cards simultaneously.
3. **Oxlint Diagnostic Warnings:**
   - Running `npm run lint` (`oxlint`) reveals 61 non-blocking warnings:
     - Impure function `Date.now()` called during render in `ProductDetailPage.jsx:502`.
     - `setState()` called synchronously within `useEffect()` across `ProductDetailPage`, `OrdersPage`, `CategoryPage`.
     - Unused import `ShoppingBag` in `WishlistPage.jsx:2`.
4. **Production Build Metrics:**
   - Production build (`npm run build`) generates 53 assets in 1.42s with zero compiler errors. Main application bundle is 314.76 kB (97.82 kB gzip) and Supabase vendor chunk is 216.34 kB (55.87 kB gzip).

---

## 8. Security and Data Handling Observations

1. **Authoritative Server-Side Pricing:**
   - `orderService.js` and PostgreSQL RPC `place_order` recalculate prices directly from the `products` table and calculate discounts using database coupons. Client-side price tampering is completely prevented.
2. **Address Ownership Verification:**
   - In `orderService.js:347-359`, `placeOrder` verifies that `address_id` belongs to the authenticated user (`user_id = auth.uid()`) before initiating cart synchronization and order placement.
3. **Storage Security Readiness:**
   - `supabase/phase-9.2/migration.sql` enforces path regex matching `auth.uid()`, preventing cross-user avatar overwrites.
4. **Wishlist Storage Isolation Risk:**
   - Because `WishlistContext.jsx` stores items in un-scoped `localStorage.getItem('shopkart_wishlist')`, wishlists persist across logout/login boundaries on shared browsers.

---

## 9. Functional Testing Evidence (14 Required Workflows)

All 14 customer workflows were tested using safe local data, simulated mocks, and static code inspection:

| Workflow | Description | Observed Result | Evidence | Status |
|---|---|---|---|---|
| **1. Homepage Exploration** | Open homepage, verify banners, deals, sections | All sections render cleanly; timer counts down; hero carousel transitions smoothly. | `HomePage.jsx`, `HeroBanner.jsx` | **PASS** |
| **2. Category Navigation** | Click department links from sub-nav and category cards | `/category/electronics` filters correctly. `/featured`, `/best-sellers`, `/deals` fail to filter (`STF-03`). | `CategoryPage.jsx`, `AppRoutes.jsx` | **PARTIAL** |
| **3. Product Search** | Type query in search bar, test autocomplete suggestions | Autocomplete dropdown renders top 5 matching products; submit navigates to `/search?q=...`. | `Navbar.jsx:43-80` | **PASS** |
| **4. Filters and Sorting** | Adjust price slider, rating filter, stock filter, sort | Filtering logic in `useMemo` correctly recalculates count and updates grid/list view. | `CategoryPage.jsx:55-91` | **PASS** |
| **5. Product Details** | Open product page, view details, switch gallery images | Thumbnail clicks update main image; specs table and verified reviews render properly. | `ProductDetailPage.jsx:52-74` | **PASS** |
| **6. Quantity Selection** | Increment/decrement product quantity | Clamps to `[1, maxStock]`; updates subtotal. | `ProductDetailPage.jsx:329-348` | **PASS** |
| **7. Add to Cart** | Add item from ProductCard and ProductDetailPage | Dispatches `ADD_ITEM`, shows success toast, increments navbar badge. | `CartContext.jsx:18-52` | **PASS** |
| **8. Update Cart Quantity** | Increment/decrement items inside CartPage | Updates item count, recalculates subtotal, total savings, and shipping threshold. | `CartPage.jsx:141-240` | **PASS** |
| **9. Remove Cart Item** | Click "Remove" and "Save for later" in CartPage | Removes item cleanly; "Save for later" moves item to wishlist. | `CartPage.jsx:71-76` | **PASS** |
| **10. Wishlist Operations** | Toggle wishlist heart icon, view WishlistPage | Items persist in `localStorage`; "Move All to Cart" transfers all items. Lacks user scoping (`STF-05`). | `WishlistContext.jsx:20-35` | **PARTIAL** |
| **11. Customer Account Navigation** | Access user menu, navigate to profile and orders | AuthGuard redirects to `/login` when unauthenticated in Supabase mode. | `AuthGuard.jsx:34-36` | **PASS** |
| **12. Profile Editing & Avatar** | Edit full name, phone; attempt avatar upload | Text fields update; avatar upload fails due to missing file input (`STF-01`). | `ProfilePage.jsx:294-310` | **PARTIAL** |
| **13. Checkout Flow (Safe Walkthrough)** | Select address, apply coupon, verify payment selector | Address selection and order summary work; coupon from cart is lost (`STF-04`). | `CheckoutPage.jsx:56-110` | **PARTIAL** |
| **14. Order History & Cancellation** | View orders, filter by status, test cancel modal | Renders order items and tracking stepper; cancellation modal triggers `cancel_order` RPC. | `OrdersPage.jsx:44-99` | **PASS** |

---

## 10. Unverified Areas (Offline Audit Boundaries)

1. **Remote Supabase Realtime Subscriptions:** Real-time push updates for order status updates on `OrdersPage.jsx` cannot be verified without a live Supabase websocket connection.
2. **Third-Party Payment Gateways:** Razorpay / Stripe integrations are not provisioned; checkout currently supports Cash on Delivery (`cod`) and simulated online payments.
3. **Live SMS/Email Notifications:** Notification delivery on order confirmation or password reset cannot be tested offline without external SMTP / SMS credentials.
