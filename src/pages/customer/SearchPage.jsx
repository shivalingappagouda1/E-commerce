import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Search, SlidersHorizontal, AlertCircle, Filter,
  Star, ChevronRight, RotateCcw, X
} from 'lucide-react'
import { fetchProducts, fetchCategories } from '../../services/productService'
import ProductCard from '../../components/products/ProductCard'
import { formatPrice } from '../../utils/format'

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedCat, setSelectedCat] = useState('all')
  const [maxPrice, setMaxPrice] = useState(200000)
  const [minRating, setMinRating] = useState(0)
  const [sortBy, setSortBy] = useState('relevance')

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchProducts(), fetchCategories()]).then(([pRes, cRes]) => {
      setProducts(pRes.data || [])
      setCategories(cRes.data || [])
      setLoading(false)
    })
  }, [])

  const results = useMemo(() => {
    let list = [...products]

    // Text match
    if (query.trim()) {
      const q = query.toLowerCase().trim()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      )
    }

    // Category filter
    if (selectedCat !== 'all') {
      list = list.filter(p => (p.category || '').toLowerCase() === selectedCat.toLowerCase())
    }

    // Price
    list = list.filter(p => (Number(p.price) || 0) <= maxPrice)

    // Rating
    if (minRating > 0) {
      list = list.filter(p => (Number(p.rating) || 0) >= minRating)
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'price-low') return (Number(a.price) || 0) - (Number(b.price) || 0)
      if (sortBy === 'price-high') return (Number(b.price) || 0) - (Number(a.price) || 0)
      if (sortBy === 'rating') return (Number(b.rating) || 0) - (Number(a.rating) || 0)
      return 0
    })

    return list
  }, [products, query, selectedCat, maxPrice, minRating, sortBy])

  function resetFilters() {
    setSelectedCat('all')
    setMaxPrice(200000)
    setMinRating(0)
    setSortBy('relevance')
  }

  const hasActiveFilters = selectedCat !== 'all' || maxPrice < 200000 || minRating > 0

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-brand-600">Home</Link>
        <ChevronRight size={14} />
        <span className="text-slate-400">Search</span>
        {query && (
          <>
            <ChevronRight size={14} />
            <span className="text-slate-900 font-bold truncate max-w-xs">"{query}"</span>
          </>
        )}
      </nav>

      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-semibold">
            <Search size={14} /> Search Results
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {query ? (
              <>Results for <span className="text-brand-600 font-extrabold">"{query}"</span></>
            ) : (
              'All Catalog Products'
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Found <strong className="text-slate-800">{results.length}</strong> matching products</p>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 uppercase">Sort:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 cursor-pointer"
          >
            <option value="relevance">Best Match</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="rating">Top Customer Rated</option>
          </select>
        </div>
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-400">Filters:</span>
          {selectedCat !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
              Category: {selectedCat}
              <button onClick={() => setSelectedCat('all')} className="hover:text-red-500"><X size={12} /></button>
            </span>
          )}
          {maxPrice < 200000 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
              Under {formatPrice(maxPrice)}
              <button onClick={() => setMaxPrice(200000)} className="hover:text-red-500"><X size={12} /></button>
            </span>
          )}
          {minRating > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
              {minRating}★ & Above
              <button onClick={() => setMinRating(0)} className="hover:text-red-500"><X size={12} /></button>
            </span>
          )}
          <button onClick={resetFilters} className="text-brand-600 hover:underline font-bold text-xs ml-1">
            Clear All
          </button>
        </div>
      )}

      {/* Main Grid + Filter Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Filter Sidebar */}
        <aside className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Filter size={16} className="text-brand-500" /> Filter Results
            </h2>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-xs text-brand-600 hover:underline">Reset</button>
            )}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Category</h3>
            <div className="space-y-1 text-xs">
              <button
                onClick={() => setSelectedCat('all')}
                className={`w-full text-left p-2 rounded-xl transition-colors cursor-pointer ${
                  selectedCat === 'all' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                All Categories
              </button>
              {categories.map(c => (
                <button
                  key={c.id || c.slug}
                  onClick={() => setSelectedCat(c.name)}
                  className={`w-full text-left p-2 rounded-xl transition-colors cursor-pointer ${
                    selectedCat === c.name ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Price */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 uppercase">Max Price</span>
              <span className="font-black text-slate-900">{formatPrice(maxPrice)}</span>
            </div>
            <input
              type="range"
              min="500"
              max="200000"
              step="500"
              value={maxPrice}
              onChange={e => setMaxPrice(Number(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
          </div>

          <hr className="border-slate-100" />

          {/* Rating */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-800 uppercase block">Customer Rating</span>
            <div className="space-y-1 text-xs">
              {[4, 3].map(r => (
                <button
                  key={r}
                  onClick={() => setMinRating(minRating === r ? 0 : r)}
                  className={`w-full flex items-center gap-1.5 p-2 rounded-xl transition-colors cursor-pointer ${
                    minRating === r ? 'bg-amber-50 text-amber-900 font-bold' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Star size={13} className="fill-amber-400 text-amber-500" />
                  <span>{r} Stars & Above</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Results Grid */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-80 bg-white rounded-2xl border border-slate-100 p-4" />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {results.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-4">
              <AlertCircle size={48} className="text-slate-300 mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-slate-800">No results found for "{query}"</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Try checking your spelling, using more general keywords, or browsing our categories below.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {categories.slice(0, 4).map(c => (
                  <Link
                    key={c.id || c.slug}
                    to={`/category/${c.slug}`}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-brand-50 hover:text-brand-600 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
