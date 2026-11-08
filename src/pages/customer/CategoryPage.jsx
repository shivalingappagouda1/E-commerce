import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Filter, SlidersHorizontal, ChevronRight, AlertCircle,
  X, Star, Check, Grid, List, RotateCcw
} from 'lucide-react'
import { fetchProducts, fetchCategories } from '../../services/productService'
import { SAMPLE_CATEGORIES } from '../../utils/sampleData'
import ProductCard from '../../components/products/ProductCard'
import { formatPrice } from '../../utils/format'

const PRICE_PRESETS = [
  { label: 'All Prices', min: 0, max: 200000 },
  { label: 'Under ₹1,000', min: 0, max: 1000 },
  { label: '₹1,000 - ₹5,000', min: 1000, max: 5000 },
  { label: '₹5,000 - ₹25,000', min: 5000, max: 25000 },
  { label: 'Above ₹25,000', min: 25000, max: 200000 },
]

export default function CategoryPage() {
  const { slug } = useParams()

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState(SAMPLE_CATEGORIES)
  const [loading, setLoading] = useState(true)

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState(slug || 'all')
  const [priceMax, setPriceMax] = useState(200000)
  const [minRating, setMinRating] = useState(0)
  const [inStockOnly, setInStockOnly] = useState(false)
  const [sortBy, setSortBy] = useState('featured')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  // Sync selectedCategory when URL slug changes
  useEffect(() => {
    setSelectedCategory(slug || 'all')
  }, [slug])

  // Load products and categories
  useEffect(() => {
    setLoading(true)
    Promise.all([fetchProducts(), fetchCategories()]).then(([prodRes, catRes]) => {
      setProducts(prodRes.data || [])
      if (catRes.data && catRes.data.length > 0) setCategories(catRes.data)
      setLoading(false)
    })
  }, [])

  // Find category metadata
  const currentCategoryObj = categories.find(c => c.slug === selectedCategory)

  // Filter & Sort
  const filteredProducts = useMemo(() => {
    let result = [...products]

    // 1. Category filter
    if (selectedCategory && selectedCategory !== 'all') {
      const catObj = categories.find(c => c.slug === selectedCategory)
      const targetName = (catObj ? catObj.name : selectedCategory).toLowerCase()
      result = result.filter(p => {
        const pCat = (p.category || p.categories?.name || '').toLowerCase()
        return pCat === targetName || p.category_id === catObj?.id
      })
    }

    // 2. Max Price
    result = result.filter(p => (Number(p.price) || 0) <= priceMax)

    // 3. Minimum Rating
    if (minRating > 0) {
      result = result.filter(p => (Number(p.rating) || 0) >= minRating)
    }

    // 4. In Stock Only
    if (inStockOnly) {
      result = result.filter(p => p.inStock !== false && p.is_active !== false)
    }

    // 5. Sorting
    result.sort((a, b) => {
      if (sortBy === 'price-low') return (Number(a.price) || 0) - (Number(b.price) || 0)
      if (sortBy === 'price-high') return (Number(b.price) || 0) - (Number(a.price) || 0)
      if (sortBy === 'rating') return (Number(b.rating) || 0) - (Number(a.rating) || 0)
      if (sortBy === 'newest') return (b.id || 0) - (a.id || 0)
      return b.featured ? 1 : -1
    })

    return result
  }, [products, selectedCategory, categories, priceMax, minRating, inStockOnly, sortBy])

  function resetFilters() {
    setPriceMax(200000)
    setMinRating(0)
    setInStockOnly(false)
    setSortBy('featured')
  }

  const hasActiveFilters = priceMax < 200000 || minRating > 0 || inStockOnly

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-brand-600 transition-colors">Home</Link>
        <ChevronRight size={14} />
        <span className="text-slate-400">Categories</span>
        <ChevronRight size={14} />
        <span className="text-slate-900 font-bold capitalize">
          {currentCategoryObj ? currentCategoryObj.name : selectedCategory}
        </span>
      </nav>

      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{currentCategoryObj?.icon || '🛍️'}</span>
            <h1 className="text-2xl font-black text-slate-900">
              {currentCategoryObj ? currentCategoryObj.name : 'All Products'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Showing <strong className="text-slate-800">{filteredProducts.length}</strong> items available in catalog
          </p>
        </div>

        {/* Controls: Filter Drawer Toggle (Mobile), Sort & View Switcher */}
        <div className="flex items-center gap-3">
          {/* Mobile Filter Button */}
          <button
            onClick={() => setMobileFilterOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl"
          >
            <Filter size={15} /> Filters {hasActiveFilters && '•'}
          </button>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs font-semibold text-slate-500 uppercase">Sort:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800 cursor-pointer"
            >
              <option value="featured">Featured Picks</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Top Customer Rated</option>
              <option value="newest">Newest Arrivals</option>
            </select>
          </div>

          {/* Grid vs List View Mode */}
          <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Grid View"
            >
              <Grid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="font-semibold text-slate-400">Active Filters:</span>
          {priceMax < 200000 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
              Up to {formatPrice(priceMax)}
              <button onClick={() => setPriceMax(200000)} className="hover:text-red-500"><X size={12} /></button>
            </span>
          )}
          {minRating > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
              {minRating}★ & Above
              <button onClick={() => setMinRating(0)} className="hover:text-red-500"><X size={12} /></button>
            </span>
          )}
          {inStockOnly && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
              In Stock Only
              <button onClick={() => setInStockOnly(false)} className="hover:text-red-500"><X size={12} /></button>
            </span>
          )}
          <button
            onClick={resetFilters}
            className="text-brand-600 hover:underline font-bold text-xs ml-1"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Main Content Layout: Sidebar + Product Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Desktop Filters Sidebar */}
        <aside className="hidden lg:block bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Filter size={16} className="text-brand-500" /> Filters
            </h2>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-xs text-brand-600 hover:underline font-semibold">
                Reset
              </button>
            )}
          </div>

          {/* 1. Category Filter */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Department</h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                  selectedCategory === 'all' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>All Departments</span>
                <span className="text-[10px] text-slate-400">{products.length}</span>
              </button>

              {categories.map(cat => {
                const isSelected = selectedCategory === cat.slug
                const count = products.filter(p => (p.category || '').toLowerCase() === cat.name.toLowerCase()).length
                return (
                  <button
                    key={cat.id || cat.slug}
                    onClick={() => setSelectedCategory(cat.slug)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{cat.icon || '•'}</span>
                      <span>{cat.name}</span>
                    </span>
                    <span className="text-[10px] text-slate-400">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 2. Price Range Slider & Presets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Max Price</h3>
              <span className="text-xs font-black text-slate-900">{formatPrice(priceMax)}</span>
            </div>
            <input
              type="range"
              min="500"
              max="200000"
              step="500"
              value={priceMax}
              onChange={e => setPriceMax(Number(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
            {/* Quick Price Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRICE_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setPriceMax(preset.max)}
                  className={`text-[10px] px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                    priceMax === preset.max ? 'bg-brand-50 border-brand-300 text-brand-700 font-bold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 3. Customer Rating */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Customer Rating</h3>
            <div className="space-y-1 text-xs">
              {[4, 3, 2].map(r => (
                <button
                  key={r}
                  onClick={() => setMinRating(minRating === r ? 0 : r)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer transition-colors ${
                    minRating === r ? 'bg-amber-50 text-amber-900 font-bold' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="flex text-amber-500">
                      {Array.from({ length: r }).map((_, idx) => (
                        <Star key={idx} size={13} className="fill-amber-400" />
                      ))}
                    </span>
                    <span>& above</span>
                  </span>
                  {minRating === r && <Check size={14} className="text-amber-600" />}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 4. Availability Toggle */}
          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-bold text-slate-800">In Stock Only</span>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={e => setInStockOnly(e.target.checked)}
                className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500 border-slate-300"
              />
            </label>
          </div>
        </aside>

        {/* Product Grid Area */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-80 bg-white rounded-2xl border border-slate-100 p-4" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-4">
              <AlertCircle size={48} className="text-slate-300 mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-slate-800">No matching products found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Try relaxing your price slider, rating filter, or search across another department.
                </p>
              </div>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 text-white font-bold text-xs rounded-xl hover:bg-brand-600 transition-colors cursor-pointer"
              >
                <RotateCcw size={14} /> Reset All Filters
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredProducts.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            /* List View */
            <div className="space-y-3">
              {filteredProducts.map(p => (
                <div key={p.id} className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center gap-4 hover:shadow-md transition-shadow">
                  <Link to={`/product/${p.slug}`} className="w-28 h-28 bg-slate-50 rounded-xl p-2 shrink-0 flex items-center justify-center">
                    <img src={p.image} alt={p.name} className="max-h-full max-w-full object-contain" />
                  </Link>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase">{p.category}</p>
                    <Link to={`/product/${p.slug}`}>
                      <h3 className="text-sm font-bold text-slate-900 hover:text-brand-600 line-clamp-1">{p.name}</h3>
                    </Link>
                    <div className="flex items-center gap-1 text-xs text-amber-600 font-bold">
                      <Star size={12} className="fill-amber-400" />
                      <span>{Number(p.rating || 4.5).toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-slate-900">{formatPrice(p.price)}</p>
                    {p.originalPrice > p.price && (
                      <p className="text-xs text-slate-400 line-through">{formatPrice(p.originalPrice)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filters Slide-in Modal */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-xs h-full p-6 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Filter size={18} /> Filter Products
              </h3>
              <button onClick={() => setMobileFilterOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* Department */}
            <div>
              <p className="text-xs font-bold text-slate-800 uppercase mb-2">Category</p>
              <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
                {categories.map(c => (
                  <button
                    key={c.id || c.slug}
                    onClick={() => {
                      setSelectedCategory(c.slug)
                      setMobileFilterOpen(false)
                    }}
                    className={`w-full text-left p-2 rounded-lg ${selectedCategory === c.slug ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Max */}
            <div>
              <p className="text-xs font-bold text-slate-800 uppercase mb-1">Max Price: {formatPrice(priceMax)}</p>
              <input
                type="range"
                min="500"
                max="200000"
                step="500"
                value={priceMax}
                onChange={e => setPriceMax(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>

            <button
              onClick={() => setMobileFilterOpen(false)}
              className="w-full py-2.5 bg-brand-500 text-white font-bold text-xs rounded-xl shadow-xs"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
