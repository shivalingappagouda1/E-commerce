import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Search, SlidersHorizontal, AlertCircle } from 'lucide-react'
import { fetchProducts } from '../../services/productService'
import ProductGrid from '../../components/products/ProductGrid'

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('relevance')

  useEffect(() => {
    setLoading(true)
    fetchProducts().then(({ data }) => {
      setProducts(data || [])
      setLoading(false)
    })
  }, [])

  const results = useMemo(() => {
    if (!query.trim()) return products
    const q = query.toLowerCase()
    return products
      .filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.category?.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (sortBy === 'price-low') return a.price - b.price
        if (sortBy === 'price-high') return b.price - a.price
        if (sortBy === 'rating') return b.rating - a.rating
        return 0
      })
  }, [products, query, sortBy])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-semibold">
            <Search size={14} /> Search Results
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">
            {query ? (
              <>Results for <span className="text-brand-600 font-extrabold">"{query}"</span></>
            ) : (
              'All Products'
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Found {results.length} items</p>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-3">
          <SlidersHorizontal size={16} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase">Sort by:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="relevance">Relevance</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="rating">Rating</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 bg-slate-200 rounded-xl" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <ProductGrid products={results} cols={4} />
      ) : (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center">
          <AlertCircle size={48} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-700">No results found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-6">
            We couldn't find anything matching "{query}". Check your spelling or try more general keywords.
          </p>
          <Link
            to="/"
            className="bg-brand-500 text-white text-xs font-bold px-5 py-2.5 rounded-lg hover:bg-brand-600 transition-colors inline-block"
          >
            Explore Trending Products
          </Link>
        </div>
      )}
    </div>
  )
}
