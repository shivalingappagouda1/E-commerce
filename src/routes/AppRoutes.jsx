import { Routes, Route } from 'react-router-dom'

// Layouts
import CustomerLayout from '../components/layout/CustomerLayout'
import AdminLayout    from '../components/admin/AdminLayout'

// Security
import AuthGuard from '../components/common/AuthGuard'

// Customer pages
import HomePage              from '../pages/customer/HomePage'
import ProductDetailPage     from '../pages/customer/ProductDetailPage'
import CategoryPage          from '../pages/customer/CategoryPage'
import SearchPage            from '../pages/customer/SearchPage'
import CartPage              from '../pages/customer/CartPage'
import WishlistPage          from '../pages/customer/WishlistPage'
import LoginPage             from '../pages/customer/LoginPage'
import RegisterPage          from '../pages/customer/RegisterPage'
import CheckoutPage          from '../pages/customer/CheckoutPage'
import OrderConfirmationPage from '../pages/customer/OrderConfirmationPage'
import OrdersPage            from '../pages/customer/OrdersPage'
import ProfilePage           from '../pages/customer/ProfilePage'
import NotFoundPage          from '../pages/customer/NotFoundPage'

// Admin pages
import AdminDashboard        from '../pages/admin/AdminDashboard'
import AdminProductsPage     from '../pages/admin/AdminProductsPage'
import AdminCategoriesPage   from '../pages/admin/AdminCategoriesPage'
import AdminOrdersPage       from '../pages/admin/AdminOrdersPage'
import AdminInventoryPage    from '../pages/admin/AdminInventoryPage'
import AdminBannersPage      from '../pages/admin/AdminBannersPage'
import AdminCouponsPage      from '../pages/admin/AdminCouponsPage'
import AdminReviewsPage      from '../pages/admin/AdminReviewsPage'
import AdminCustomersPage    from '../pages/admin/AdminCustomersPage'
import AdminAnalyticsPage    from '../pages/admin/AdminAnalyticsPage'
import AdminSettingsPage     from '../pages/admin/AdminSettingsPage'

/**
 * AppRoutes — central route configuration.
 *
 * Customer routes live under <CustomerLayout />.
 * Admin routes live under <AdminLayout /> at /admin/* and are secured
 * with AuthGuard requiring role === 'admin'.
 */
export default function AppRoutes() {
  return (
    <Routes>
      {/* ── Customer routes ── */}
      <Route element={<CustomerLayout />}>
        <Route index element={<HomePage />} />
        <Route path="category/:slug"           element={<CategoryPage />} />
        <Route path="product/:slug"            element={<ProductDetailPage />} />
        <Route path="search"                   element={<SearchPage />} />
        <Route path="cart"                     element={<CartPage />} />
        <Route path="wishlist"                 element={<WishlistPage />} />
        <Route path="checkout"                 element={<CheckoutPage />} />
        <Route path="order-success/:orderId"   element={<OrderConfirmationPage />} />
        <Route path="orders"                   element={<OrdersPage />} />
        <Route path="profile"                  element={<ProfilePage />} />
        <Route path="login"                    element={<LoginPage />} />
        <Route path="register"                 element={<RegisterPage />} />
        <Route path="featured"                 element={<CategoryPage />} />
        <Route path="best-sellers"             element={<CategoryPage />} />
        <Route path="trending"                 element={<CategoryPage />} />
        <Route path="deals"                    element={<CategoryPage />} />
        <Route path="*"                        element={<NotFoundPage />} />
      </Route>

      {/* ── Admin routes (Protected by AuthGuard) ── */}
      <Route
        path="/admin"
        element={
          <AuthGuard requireAdmin={true}>
            <AdminLayout />
          </AuthGuard>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="products"   element={<AdminProductsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="inventory"  element={<AdminInventoryPage />} />
        <Route path="orders"     element={<AdminOrdersPage />} />
        <Route path="banners"    element={<AdminBannersPage />} />
        <Route path="coupons"    element={<AdminCouponsPage />} />
        <Route path="reviews"    element={<AdminReviewsPage />} />
        <Route path="customers"  element={<AdminCustomersPage />} />
        <Route path="analytics"  element={<AdminAnalyticsPage />} />
        <Route path="settings"   element={<AdminSettingsPage />} />
      </Route>
    </Routes>
  )
}
