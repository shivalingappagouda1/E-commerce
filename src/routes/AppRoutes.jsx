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
import NotFoundPage          from '../pages/customer/NotFoundPage'

// Admin pages
import AdminDashboard   from '../pages/admin/AdminDashboard'
import AdminPlaceholder from '../pages/admin/AdminPlaceholder'

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
        <Route path="products"   element={<AdminPlaceholder title="Product Management"   description="Add, edit, and manage your product catalog." />} />
        <Route path="categories" element={<AdminPlaceholder title="Category Management"  description="Organize products into browsable categories." />} />
        <Route path="inventory"  element={<AdminPlaceholder title="Inventory Management" description="Track and update stock quantities per product." />} />
        <Route path="orders"     element={<AdminPlaceholder title="Order Management"     description="View, process, and update customer orders." />} />
        <Route path="customers"  element={<AdminPlaceholder title="Customer Management"  description="View customer profiles and purchase history." />} />
        <Route path="banners"    element={<AdminPlaceholder title="Banner Management"    description="Upload and schedule promotional banners." />} />
        <Route path="coupons"    element={<AdminPlaceholder title="Coupon Management"    description="Create discount codes and promotional offers." />} />
        <Route path="reviews"    element={<AdminPlaceholder title="Reviews Management"   description="Moderate and respond to customer reviews." />} />
        <Route path="analytics"  element={<AdminPlaceholder title="Analytics"            description="Sales trends, revenue charts and insights." />} />
        <Route path="settings"   element={<AdminPlaceholder title="Store Settings"       description="Configure store name, payment and shipping settings." />} />
      </Route>
    </Routes>
  )
}
