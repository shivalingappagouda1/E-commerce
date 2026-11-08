import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, ShoppingCart, Heart, User, Menu, X,
  ChevronDown, MapPin, Package, LogOut, ShieldAlert
} from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'
import { useAuth } from '../../context/AuthContext'
import { SAMPLE_CATEGORIES } from '../../utils/sampleData'

export default function Navbar() {
  const { totalItems } = useCart()
  const { count: wlCount } = useWishlist()
  const { user, profile, isAdmin, signOut } = useAuth()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const navigate = useNavigate()

  function handleSearch(e) {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  async function handleLogout() {
    setUserOpen(false)
    await signOut()
    navigate('/')
  }

  // Display user name or email prefix
  const displayName = profile?.full_name || user?.email?.split('@')[0] || null

  return (
    <header className="sticky top-0 z-50 bg-brand-600 shadow-md">
      {/* ── Top bar ── */}
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Logo */}
        <Link to="/" className="flex-shrink-0 flex items-center gap-2 group">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow">
            <span className="text-brand-600 font-black text-sm leading-none">SK</span>
          </div>
          <div className="hidden sm:block">
            <span className="text-white font-black text-xl leading-none tracking-tight">ShopKart</span>
            <span className="block text-brand-200 text-[9px] leading-none tracking-widest uppercase">
              Explore · Buy · Enjoy
            </span>
          </div>
        </Link>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex-1 max-w-2xl">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products, brands and more…"
              className="w-full py-2.5 pl-4 pr-12 rounded-lg text-sm bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 shadow-sm"
            />
            <button
              type="submit"
              className="absolute right-0 top-0 h-full px-3.5 bg-brand-500 hover:bg-brand-700 text-white rounded-r-lg flex items-center transition-colors"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
          </div>
        </form>

        {/* Right actions */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Account Dropdown */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => setUserOpen(o => !o)}
              className="flex items-center gap-1.5 text-white hover:bg-brand-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <User size={18} />
              <span className="hidden md:inline max-w-[120px] truncate">
                {user ? displayName : 'Account'}
              </span>
              <ChevronDown size={14} className={`transition-transform ${userOpen ? 'rotate-180' : ''}`} />
            </button>

            {userOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-50">
                {user ? (
                  <>
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-800 truncate">{displayName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                    </div>

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setUserOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-brand-600 font-semibold hover:bg-brand-50 transition-colors"
                      >
                        <ShieldAlert size={15} /> Admin Dashboard
                      </Link>
                    )}

                    <Link
                      to="/orders"
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors"
                    >
                      <Package size={15} /> My Orders
                    </Link>

                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-slate-100"
                    >
                      <LogOut size={15} /> Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors"
                    >
                      <User size={15} /> Sign In
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors"
                    >
                      <Package size={15} /> Create Account
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Wishlist */}
          <Link
            to="/wishlist"
            className="relative flex items-center gap-1 text-white hover:bg-brand-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Heart size={18} />
            <span className="hidden md:inline">Wishlist</span>
            {wlCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {wlCount > 9 ? '9+' : wlCount}
              </span>
            )}
          </Link>

          {/* Cart */}
          <Link
            to="/cart"
            className="relative flex items-center gap-1 text-white hover:bg-brand-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <ShoppingCart size={18} />
            <span className="hidden md:inline">Cart</span>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-900 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="sm:hidden flex items-center text-white hover:bg-brand-700 p-2 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* ── Category navigation ── */}
      <nav className="hidden sm:block border-t border-brand-700 bg-brand-700">
        <div className="max-w-7xl mx-auto px-4">
          <ul className="flex items-center gap-0 overflow-x-auto">
            {SAMPLE_CATEGORIES.map(cat => (
              <li key={cat.id}>
                <Link
                  to={`/category/${cat.slug}`}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-brand-100 hover:text-white hover:bg-brand-600 rounded transition-colors whitespace-nowrap"
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* ── Mobile menu ── */}
      {menuOpen && (
        <div className="sm:hidden bg-white border-t border-brand-700 shadow-lg">
          <div className="p-4 space-y-1">
            {user ? (
              <>
                <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100 mb-2">
                  Signed in as: <strong className="text-slate-800">{displayName}</strong>
                </div>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="block px-3 py-2 text-sm text-brand-600 font-semibold rounded-lg hover:bg-brand-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Admin Dashboard
                  </Link>
                )}
                <Link
                  to="/orders"
                  className="block px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  My Orders
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    handleLogout()
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="block px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="block px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Create Account
                </Link>
              </>
            )}

            <hr className="border-slate-100 my-2" />
            <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Categories</p>
            {SAMPLE_CATEGORIES.map(cat => (
              <Link
                key={cat.id}
                to={`/category/${cat.slug}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
