import { useState } from 'react'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, Package, Tags, Warehouse, ShoppingBag,
  CreditCard, Users, Image, Ticket, Star, BarChart3, Settings,
  Menu, X, ChevronRight, LogOut, Bell, Store
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard',             to: '/admin',               icon: LayoutDashboard, end: true },
  { label: 'Products',              to: '/admin/products',       icon: Package },
  { label: 'Categories',            to: '/admin/categories',     icon: Tags },
  { label: 'Inventory',             to: '/admin/inventory',      icon: Warehouse },
  { label: 'Orders',                to: '/admin/orders',         icon: ShoppingBag },
  { label: 'Payment Verification',  to: '/admin/payments',       icon: CreditCard },
  { label: 'Customers',             to: '/admin/customers',      icon: Users },
  { label: 'Banners',               to: '/admin/banners',        icon: Image },
  { label: 'Coupons',               to: '/admin/coupons',        icon: Ticket },
  { label: 'Reviews',               to: '/admin/reviews',        icon: Star },
  { label: 'Analytics',             to: '/admin/analytics',      icon: BarChart3 },
  { label: 'Settings',              to: '/admin/settings',       icon: Settings },
]

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-100 font-sans">
      {/* ── Sidebar ── */}
      <aside
        className={`flex-shrink-0 flex flex-col bg-slate-900 text-white transition-all duration-300 ${
          sidebarOpen ? 'w-56' : 'w-14'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-4 border-b border-slate-800">
          {sidebarOpen && (
            <Link to="/admin" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-black text-xs">SK</span>
              </div>
              <span className="font-bold text-sm text-white">ShopKart Admin</span>
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto overflow-x-hidden">
          {NAV_ITEMS.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={17} className="flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
              {sidebarOpen && <ChevronRight size={13} className="ml-auto opacity-30 group-hover:opacity-60" />}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          <Link
            to="/"
            className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors ${
              sidebarOpen ? '' : 'justify-center'
            }`}
          >
            <Store size={15} />
            {sidebarOpen && <span>Back to Store</span>}
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs text-red-300 hover:bg-slate-800 hover:text-red-200 transition-colors disabled:opacity-60 ${
              sidebarOpen ? '' : 'justify-center'
            }`}
            title="Sign out"
          >
            <LogOut size={15} />
            {sidebarOpen && <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>}
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-sm font-semibold text-slate-700">Admin Panel</h1>
            <p className="text-xs text-slate-400">ShopKart Management Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors" aria-label="Notifications">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                <span className="text-brand-700 font-bold text-sm">A</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-slate-700">Admin User</p>
                <p className="text-xs text-slate-400">admin@shopkart.in</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
