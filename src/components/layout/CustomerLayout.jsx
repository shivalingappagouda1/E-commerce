import { Outlet } from 'react-router-dom'
import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'

/**
 * Shared customer shell using the ShopKart Ocean Blue theme.
 * Keeps route rendering and existing navigation/footer behaviour intact.
 */
export default function CustomerLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F6F3EE] text-[#172B3A]">
      <Navbar />
      <main className="flex-1 bg-[#F6F3EE]">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
