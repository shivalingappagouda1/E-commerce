import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Filter, SlidersHorizontal, ChevronRight, AlertCircle } from 'lucide-react'
import { fetchProducts } from '../../services/productService'
import { SAMPLE_CATEGORIES } from '../../utils/sampleData'
import ProductGrid from '../../components/products/ProductGrid'

export default function CategoryPage() {
  const { slug } = useParams()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('featured')
  const [priceRange, setPriceRange] = useState(150000)

  // Find category object
  const currentCategory = SAMPLE_CATEGORIES.find(c => c.slug === slug)

  useEffect(() => {
    setLoading(true)
    fetchProducts().then(({ data }) => {
      setProducts(data || [])
      setLoading(false)
    })
  }, [slug])

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        // If currentCategory found, match category name case-insensitively
        const matchesCategory = currentCategory 
          ? p.category?.toLowerCase() === currentCategory.name.toLowerCase()
          : true
        const matchesPrice = p.price <= priceRange
        return matchesCategory && matchesPrice
      })
      .sort((a, b) => {
        if (sortBy === 'price-low') return a.price - b.price
        if (sortBy === 'price-high') return b.price - a.price
        if (sortBy === 'rating') return b.rating - a.rating
        return b.featured ? 1 : -1
      })
  }, [products, currentCategory, priceRange, sortBy])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-brand-600">Home</Link>
        <ChevronRight size={14} />
        <span>Categories</span>
        <ChevronRight size={14} />
        <span className="text-slate-900 font-semibold">{currentCategory ? currentCategory.name : slug}</span>
      </nav>

      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span>{currentCategory?.icon}</span>
            <span>{currentCategory ? currentCategory.name : 'Category Products'}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Showing {filteredProducts.length} items
          </p>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-3">
          <SlidersHorizontal size={16} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase">Sort by:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="featured">Featured</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="rating">Customer Rating</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Filters Sidebar */}
        <aside className="bg-white p-5 rounded-2xl border border-slate-100 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Filter size={16} /> Filters
            </h2>
            <button
              onClick={() => setPriceRange(150000)}
              className="text-xs text-brand-600 hover:underline"
            >
              Reset
            </button>
          </div>

          {/* Max Price Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">
              Max Price: ₹{priceRange.toLocaleString('en-IN')}
            </label>
            <input
              type="range"
              min="500"
              max="150000"
              step="500"
              value={priceRange}
              onChange={e => setPriceRange(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>₹500</span>
              <span>₹1,50,000</span>
            </div>
          </div>

          {/* Other Categories */}
          <div>
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">Categories</h3>
            <ul className="space-y-1.5 text-xs">
              {SAMPLE_CATEGORIES.map(cat => (
                <li key={cat.id}>
                  <Link
                    to={`/category/${cat.slug}`}
                    className={`flex items-center gap-2 py-1 px-2 rounded-lg transition-colors ${
                      cat.slug === slug 
                        ? 'bg-brand-50 text-brand-700 font-semibold' 
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Product Grid Area */}
        <main className="lg:col-span-3">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 bg-slate-200 rounded-xl" />
              ))}
            </div>
          ) : filteredProducts.length > 0 ? (
            <ProductGrid products={filteredProducts} cols={3} />
          ) : (
            <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center">
              <AlertCircle size={40} className="text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">No products match your filters</h3>
              <p className="text-xs text-slate-400 mt-1 mb-4">Try increasing the price filter or exploring another category.</p>
              <button
                onClick={() => setPriceRange(150000)}
                className="bg-brand-500 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
