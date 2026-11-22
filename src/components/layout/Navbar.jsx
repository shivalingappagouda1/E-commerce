import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, ShoppingCart, Heart, User, Menu, X,
  ChevronDown, Package, LogOut, ShieldCheck,
  Flame, ArrowRight
} from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import { fetchProducts, fetchCategories } from '../../services/productService'
import { SAMPLE_CATEGORIES } from '../../utils/sampleData'
import { formatPrice } from '../../utils/format'

export default function Navbar() {
  const { totalItems, totalPrice } = useCart()
  const { count: wlCount } = useWishlist()
  const { user, profile, isAdmin, signOut } = useAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [categories, setCategories] = useState(() => isSupabaseConfigured ? [] : SAMPLE_CATEGORIES)
  const [allProducts, setAllProducts] = useState([])
  const [failedAvatarUrl, setFailedAvatarUrl] = useState(null)

  const searchRef = useRef(null)
  const navigate = useNavigate()

  // Load categories and products for instant search
  useEffect(() => {
    fetchCategories().then(({ data }) => {
      if (data) setCategories(data)
    })
    fetchProducts().then(({ data }) => {
      setAllProducts(data || [])
    })
  }, [])

  // Live search filtering
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const q = searchQuery.toLowerCase().trim()
      const matches = allProducts
        .filter(p => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
        .slice(0, 5)
      setSuggestions(matches)
      setShowSuggestions(true)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [searchQuery, allProducts])

  // Close search suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    if (searchQuery.trim()) {
      setShowSuggestions(false)
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  function handleSelectSuggestion(slug) {
    setShowSuggestions(false)
    setSearchQuery('')
    navigate(`/product/${slug}`)
  }

  async function handleLogout() {
    setUserOpen(false)
    await signOut()
    navigate('/')
  }

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'My Account'

  return (
    <header className="sticky top-0 z-50 bg-[#195B87] shadow-lg shadow-[#123B5A]/15">
      {/* ── Main Top Bar ── */}
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3 md:gap-6">
        {/* Brand Logo */}
        <Link to="/" className="flex-shrink-0 flex items-center gap-2 group">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
            <span className="text-brand-600 font-black text-base leading-none">SK</span>
          </div>
          <div className="hidden sm:block">
            <span className="text-white font-black text-xl leading-none tracking-tight">ShopKart</span>
            <span className="block text-brand-100 text-[9px] font-semibold leading-none tracking-widest uppercase mt-0.5">
              Premium Store
            </span>
          </div>
        </Link>

        {/* Live Search Bar with Suggestions */}
        <div ref={searchRef} className="relative flex-1 max-w-2xl">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true)
                }}
                placeholder="Search over 10,000+ products, brands & categories..."
                className="w-full py-2.5 pl-4 pr-11 rounded-xl text-sm bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/40 shadow-xs"
              />
              <button
                type="submit"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Search"
              >
                <Search size={16} />
              </button>
            </div>
          </form>

          {/* Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 py-1.5 animate-in fade-in duration-150">
              <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                Matching Products
              </div>
              {suggestions.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectSuggestion(p.slug)}
                  className="w-full px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left cursor-pointer group"
                >
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-10 h-10 object-contain rounded-lg bg-slate-50 border border-slate-100 p-0.5 shrink-0"
                    onError={e => { e.currentTarget.src = 'https://placehold.co/50x50?text=Product' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-brand-600 transition-colors">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-slate-400">{p.category}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-900">{formatPrice(p.price)}</span>
                    {p.discount > 0 && (
                      <span className="block text-[10px] font-semibold text-emerald-600">
                        {p.discount}% off
                      </span>
                    )}
                  </div>
                </button>
              ))}
              <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                <button
                  onClick={handleSearch}
                  className="w-full py-1 text-center text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center justify-center gap-1 cursor-pointer"
                >
                  View all results for "{searchQuery}" <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Navigation Actions */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Account Menu */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => setUserOpen(o => !o)}
              className="flex items-center gap-2 text-white hover:bg-white/15 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                {profile?.avatar_url && failedAvatarUrl !== profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    onError={() => setFailedAvatarUrl(profile.avatar_url)}
                  />
                ) : (
                  <User size={15} />
                )}
              </div>
              <div className="text-left hidden md:block max-w-[110px]">
                <span className="block text-[10px] text-brand-100 font-normal leading-tight">Hello,</span>
                <span className="block font-bold text-white truncate leading-tight">{displayName}</span>
              </div>
              <ChevronDown size={13} className={`transition-transform duration-200 ${userOpen ? 'rotate-180' : ''}`} />
            </button>

            {userOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in duration-150">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-800 truncate">{displayName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{user?.email || 'Guest Visitor'}</p>
                </div>

                <div className="py-1">
                  <Link
                    to="/profile"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors"
                  >
                    <User size={15} className="text-slate-400" />
                    <span>My Profile & Addresses</span>
                  </Link>

                  <Link
                    to="/orders"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors"
                  >
                    <Package size={15} className="text-slate-400" />
                    <span>My Orders & Tracking</span>
                  </Link>

                  <Link
                    to="/wishlist"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors"
                  >
                    <Heart size={15} className="text-slate-400" />
                    <span>My Wishlist ({wlCount})</span>
                  </Link>

                  {(isAdmin || profile?.role === 'admin') && (
                    <Link
                      to="/admin"
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-brand-600 hover:bg-brand-50 transition-colors"
                    >
                      <ShieldCheck size={15} />
                      <span>Admin Management</span>
                    </Link>
                  )}
                </div>

                <div className="pt-1 border-t border-slate-100">
                  {user ? (
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <LogOut size={14} />
                      <span>Sign Out</span>
                    </button>
                  ) : (
                    <div className="p-2 space-y-1">
                      <Link
                        to="/login"
                        onClick={() => setUserOpen(false)}
                        className="block w-full py-1.5 text-center text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors"
                      >
                        Sign In
                      </Link>
                      <Link
                        to="/register"
                        onClick={() => setUserOpen(false)}
                        className="block w-full py-1 text-center text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        New customer? Sign up
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Wishlist Icon */}
          <Link
            to="/wishlist"
            className="relative p-2 text-white hover:bg-white/15 rounded-xl transition-colors cursor-pointer"
            aria-label="Wishlist"
          >
            <Heart size={20} />
            {wlCount > 0 && (
              <span className="absolute 0 top-0.5 right-0.5 bg-red-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {wlCount > 9 ? '9+' : wlCount}
              </span>
            )}
          </Link>

          {/* Cart Pill */}
          <Link
            to="/cart"
            className="flex items-center gap-2 bg-white text-slate-900 hover:bg-brand-50 px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <div className="relative">
              <ShoppingCart size={17} className="text-brand-600" />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-brand-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItems > 9 ? '9+' : totalItems}
                </span>
              )}
            </div>
            <span className="hidden md:inline font-extrabold">{formatPrice(totalPrice)}</span>
          </Link>

          {/* Mobile menu hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="sm:hidden p-2 text-white hover:bg-white/15 rounded-xl transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* ── Sub-Navigation: Category Strip & Deals ── */}
      <nav className="hidden sm:block border-t border-[#D6E7F3] bg-[#EAF3FA] backdrop-blur-xs">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-xs font-medium text-white">
          <ul className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-none">
            {categories.map(cat => (
              <li key={cat.id || cat.slug}>
                <Link
                  to={`/category/${cat.slug}`}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[#195B87] hover:text-[#123B5A] hover:bg-white transition-colors whitespace-nowrap"
                >
                  <span>{cat.icon || '📦'}</span>
                  <span>{cat.name}</span>
                </Link>
              </li>
            ))}
          </ul>

          <Link
            to="/deals"
            className="flex items-center gap-1 px-3 py-1 bg-[#F97316] text-white font-bold rounded-lg hover:bg-[#EA580C] transition-all shrink-0 shadow-xs"
          >
            <Flame size={13} className="fill-amber-600 text-amber-600" />
            <span>Super Deals</span>
          </Link>
        </div>
      </nav>

      {/* ── Mobile Slideout Drawer ── */}
      {menuOpen && (
        <div className="sm:hidden bg-white border-t border-slate-200 shadow-xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-top-4 duration-200">
          <div className="p-4 space-y-3">
            {/* User Profile Banner in Mobile */}
            <div className="p-3 bg-brand-50 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">{displayName}</p>
                <p className="text-[11px] text-slate-500">{user?.email || 'Guest Customer'}</p>
              </div>
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="text-xs font-bold text-brand-600 hover:underline"
              >
                View Profile
              </Link>
            </div>

            {/* Quick Links */}
            <div className="space-y-1 text-sm font-semibold text-slate-700">
              <Link
                to="/orders"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50"
              >
                <Package size={17} className="text-slate-400" /> My Orders
              </Link>
              <Link
                to="/wishlist"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50"
              >
                <Heart size={17} className="text-slate-400" /> Wishlist ({wlCount})
              </Link>
              <Link
                to="/deals"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 p-2 rounded-lg text-amber-600 hover:bg-amber-50"
              >
                <Flame size={17} /> Super Deals & Discounts
              </Link>
              {(isAdmin || profile?.role === 'admin') && (
                <Link
                  to="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 p-2 rounded-lg text-brand-600 hover:bg-brand-50"
                >
                  <ShieldCheck size={17} /> Admin Dashboard
                </Link>
              )}
            </div>

            <hr className="border-slate-100" />

            {/* Categories */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Shop Categories</p>
              <div className="grid grid-cols-2 gap-1.5">
                {categories.map(cat => (
                  <Link
                    key={cat.id || cat.slug}
                    to={`/category/${cat.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-600"
                  >
                    <span>{cat.icon || '📦'}</span>
                    <span className="truncate">{cat.name}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Auth Button */}
            <div className="pt-2">
              {user ? (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    handleLogout()
                  }}
                  className="w-full py-2.5 text-center text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl"
                >
                  Sign Out
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="py-2.5 text-center text-xs font-bold text-white bg-brand-500 rounded-xl"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMenuOpen(false)}
                    className="py-2.5 text-center text-xs font-bold text-slate-700 bg-slate-100 rounded-xl"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
