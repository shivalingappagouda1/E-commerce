import { Outlet } from 'react-router-dom'
import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'

/**
 * CustomerLayout wraps all customer-facing pages with the shared
 * Navbar and Footer. The <Outlet /> renders the matched child route.
 */
export default function CustomerLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
