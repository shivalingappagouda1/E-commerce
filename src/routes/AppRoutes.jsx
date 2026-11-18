import { lazy, Suspense } from 'react'
import { Navigate, Routes, Route } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Layouts
import CustomerLayout from '../components/layout/CustomerLayout'
import AdminLayout from '../components/admin/AdminLayout'

// Security
import AuthGuard from '../components/common/AuthGuard'

// Customer pages (lazy loaded)
const HomePage = lazy(() => import('../pages/customer/HomePage'))
const ProductDetailPage = lazy(() => import('../pages/customer/ProductDetailPage'))
const CategoryPage = lazy(() => import('../pages/customer/CategoryPage'))
const SearchPage = lazy(() => import('../pages/customer/SearchPage'))
const CartPage = lazy(() => import('../pages/customer/CartPage'))
const WishlistPage = lazy(() => import('../pages/customer/WishlistPage'))
const LoginPage = lazy(() => import('../pages/customer/LoginPage'))
const RegisterPage = lazy(() => import('../pages/customer/RegisterPage'))
const CheckoutPage = lazy(() => import('../pages/customer/CheckoutPage'))
const OrderConfirmationPage = lazy(() => import('../pages/customer/OrderConfirmationPage'))
const OrdersPage = lazy(() => import('../pages/customer/OrdersPage'))
const ProfilePage = lazy(() => import('../pages/customer/ProfilePage'))
const ForgotPasswordPage = lazy(() => import('../pages/customer/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('../pages/customer/ResetPasswordPage'))
const AdminOtpPage = lazy(() => import('../pages/customer/AdminOtpPage'))
const PlaceholderPage = lazy(() => import('../pages/customer/PlaceholderPage'))
const NotFoundPage = lazy(() => import('../pages/customer/NotFoundPage'))

// Admin pages (lazy loaded)
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'))
const AdminProductsPage = lazy(() => import('../pages/admin/AdminProductsPage'))
const AdminCategoriesPage = lazy(() => import('../pages/admin/AdminCategoriesPage'))
const AdminOrdersPage = lazy(() => import('../pages/admin/AdminOrdersPage'))
const AdminPaymentVerificationPage = lazy(() => import('../pages/admin/AdminPaymentVerificationPage'))
const AdminInventoryPage = lazy(() => import('../pages/admin/AdminInventoryPage'))
const AdminBannersPage = lazy(() => import('../pages/admin/AdminBannersPage'))
const AdminCouponsPage = lazy(() => import('../pages/admin/AdminCouponsPage'))
const AdminReviewsPage = lazy(() => import('../pages/admin/AdminReviewsPage'))
const AdminCustomersPage = lazy(() => import('../pages/admin/AdminCustomersPage'))
const AdminAnalyticsPage = lazy(() => import('../pages/admin/AdminAnalyticsPage'))
const AdminSettingsPage = lazy(() => import('../pages/admin/AdminSettingsPage'))

function RouteLoadingFallback() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-slate-400 font-medium mt-3">Loading page...</p>
    </div>
  )
}

// Google OAuth returns to "/". Route administrators to OTP before showing
// the normal store homepage; customers continue to see the homepage unchanged.
function StoreHomeRoute() {
  const { user, loading, isAdmin, adminOtpVerified, adminOtpRequired } = useAuth()
  if (loading) return <RouteLoadingFallback />
  if (user && isAdmin && !adminOtpVerified && adminOtpRequired) {
    return <Navigate to="/admin/verify" replace />
  }
  return <HomePage />
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* Admin OTP route is deliberately outside both layouts. */}
        <Route path="/admin/verify" element={<AdminOtpPage />} />

        {/* Customer routes */}
        <Route element={<CustomerLayout />}>
          <Route index element={<StoreHomeRoute />} />\n          <Route path="customer" element={<StoreHomeRoute />} />
          <Route path="category/:slug" element={<CategoryPage />} />
          <Route path="product/:slug" element={<ProductDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="wishlist" element={<WishlistPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="order-success/:orderId" element={<OrderConfirmationPage />} />
          <Route path="orders" element={<AuthGuard requireAuth><OrdersPage /></AuthGuard>} />
          <Route path="profile" element={<AuthGuard requireAuth><ProfilePage /></AuthGuard>} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="featured" element={<CategoryPage feed="featured" />} />
          <Route path="best-sellers" element={<CategoryPage feed="best-sellers" />} />
          <Route path="trending" element={<CategoryPage feed="trending" />} />
          <Route path="deals" element={<CategoryPage feed="deals" />} />
          <Route path="about" element={<PlaceholderPage />} />
          <Route path="careers" element={<PlaceholderPage />} />
          <Route path="press" element={<PlaceholderPage />} />
          <Route path="blog" element={<PlaceholderPage />} />
          <Route path="help" element={<PlaceholderPage />} />
          <Route path="returns" element={<PlaceholderPage />} />
          <Route path="track-order" element={<PlaceholderPage />} />
          <Route path="shipping" element={<PlaceholderPage />} />
          <Route path="privacy" element={<PlaceholderPage />} />
          <Route path="terms" element={<PlaceholderPage />} />
          <Route path="cookies" element={<PlaceholderPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Admin routes: OTP is checked before AdminLayout is rendered. */}
        <Route path="/admin" element={<AuthGuard requireAdmin><AdminLayout /></AuthGuard>}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="inventory" element={<AdminInventoryPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="payments" element={<AdminPaymentVerificationPage />} />
          <Route path="banners" element={<AdminBannersPage />} />
          <Route path="coupons" element={<AdminCouponsPage />} />
          <Route path="reviews" element={<AdminReviewsPage />} />
          <Route path="customers" element={<AdminCustomersPage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
