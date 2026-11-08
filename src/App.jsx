import { BrowserRouter } from 'react-router-dom'
import { AuthProvider }     from './context/AuthContext'
import { CartProvider }     from './context/CartContext'
import { WishlistProvider } from './context/WishlistContext'
import AppRoutes            from './routes/AppRoutes'

/**
 * App — root component.
 *
 * Provider hierarchy (outer → inner):
 *   BrowserRouter → AuthProvider → CartProvider → WishlistProvider → Routes
 *
 * Keep this file thin. Business logic lives in pages and services.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <AppRoutes />
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
