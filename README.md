# ShopKart — Full-Stack E-Commerce Platform

A production-oriented e-commerce platform built with **React + Vite**, **Tailwind CSS**, **React Router DOM** and **Supabase**.

---

## Tech Stack

| Layer        | Technology                        |
|--------------|-----------------------------------|
| Frontend     | React 19 + Vite 8                 |
| Styling      | Tailwind CSS v4 (via @tailwindcss/vite) |
| Routing      | React Router DOM v7               |
| Database     | Supabase (PostgreSQL)             |
| Auth         | Supabase Auth                     |
| Storage      | Supabase Storage                  |
| Icons        | Lucide React                      |
| Deployment   | Vercel                            |

---

## Project Structure

```
src/
  assets/           # Static images, fonts
  components/
    common/         # StarRating, Badge, SectionHeading
    layout/         # Navbar, Footer, CustomerLayout, HeroBanner
    products/       # ProductCard, ProductGrid
    admin/          # AdminLayout
  pages/
    customer/       # HomePage, PlaceholderPage, NotFoundPage
    admin/          # AdminDashboard, AdminPlaceholder
  routes/           # AppRoutes.jsx — central routing
  context/          # CartContext, WishlistContext
  services/         # productService.js — data access layer
  lib/              # supabase.js — Supabase client
  utils/            # sampleData.js, format.js
  styles/           # (additional global styles if needed)
  App.jsx
  main.jsx
  index.css         # Tailwind directives + design tokens

database/
  schema.sql        # Full Supabase PostgreSQL schema (review before applying)

public/
  favicon.svg
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
```

> **Important:** Never commit `.env.local`. Never put the `service_role` key in frontend code.

### 3. Apply the database schema (optional for Phase 1)

Open **Supabase Dashboard → SQL Editor**, paste the contents of `database/schema.sql`, and run it.

The app runs with **sample data** when Supabase is not configured — no database connection required to see the UI.

### 4. Run in development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 5. Build for production

```bash
npm run build
npm run preview    # preview the production build locally
```

---

## Routes

| Path                  | Description                          |
|-----------------------|--------------------------------------|
| `/`                   | Customer homepage                    |
| `/category/:slug`     | Category product listing             |
| `/product/:slug`      | Product detail page                  |
| `/search?q=`          | Search results                       |
| `/cart`               | Shopping cart                        |
| `/wishlist`           | Saved wishlist                       |
| `/checkout`           | Secure checkout                      |
| `/order-success/:id`  | Order confirmation receipt           |
| `/orders`             | Order history & shipment tracking    |
| `/profile`            | Customer profile & address manager   |
| `/login`              | Login page                           |
| `/register`           | Registration page                    |
| `/admin`              | Admin dashboard overview             |
| `/admin/products`     | Product management & pricing         |
| `/admin/categories`   | Category management                  |
| `/admin/inventory`    | Stock & inventory management         |
| `/admin/orders`       | Order status & fulfillment           |
| `/admin/customers`    | Customer CRM & metrics               |
| `/admin/banners`      | Promotional banners management       |
| `/admin/coupons`      | Discount coupon management           |
| `/admin/reviews`      | Customer review moderation           |
| `/admin/analytics`    | Sales, revenue & orders analytics    |
| `/admin/settings`     | Store & platform settings            |

---

## Security

- **Row Level Security (RLS)** is configured on every Supabase table.
- Customers can only read/write their own data.
- Admin access is enforced via a `role` column on the `profiles` table and an `is_admin()` PostgreSQL function.
- The `service_role` key is **never** used in frontend code.
- Hiding admin routes in the UI is **not** relied upon as a security mechanism; all `/admin/*` routes are secured with `AuthGuard` requiring `role === 'admin'`.

---

## Development Phases

| Phase | Status        | Scope                                                            |
|-------|---------------|------------------------------------------------------------------|
| 1 & 2 | ✅ Complete   | Foundation, routing, layout, DB schema, auth flow, security      |
| 3 & 4 | ✅ Complete   | Admin CMS suite — products, categories, inventory, orders, CMS   |
| 5     | ✅ Complete   | Admin Customer CRM, Revenue Analytics, and Platform Settings     |
| 6     | ✅ Complete   | Customer storefront redesign, live search, catalog filters, UX   |

---

## Environment Variables Reference

| Variable                | Required | Description                            |
|-------------------------|----------|----------------------------------------|
| `VITE_SUPABASE_URL`     | Yes      | Your Supabase project URL              |
| `VITE_SUPABASE_PUBLISHABLE_KEY`| Yes      | Supabase publishable (anon) key        |

---

## License

MIT
