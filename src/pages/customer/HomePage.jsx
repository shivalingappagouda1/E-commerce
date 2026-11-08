import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeroBanner    from '../../components/layout/HeroBanner'
import ProductGrid   from '../../components/products/ProductGrid'
import SectionHeading from '../../components/common/SectionHeading'
import {
  fetchBanners,
  fetchFeaturedProducts,
  fetchBestSellers,
  fetchTrendingProducts,
  fetchDeals,
} from '../../services/productService'
import { SAMPLE_CATEGORIES } from '../../utils/sampleData'
import { formatPrice } from '../../utils/format'

/** Minimal loading skeleton for a product section */
function ProductSectionSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-100 overflow-hidden animate-pulse">
          <div className="h-52 bg-slate-100" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-slate-100 rounded w-3/4" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
            <div className="h-5 bg-slate-100 rounded w-1/3 mt-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Category icon strip */
function CategoryStrip() {
  return (
    <section>
      <SectionHeading title="Shop by Category" />
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
        {SAMPLE_CATEGORIES.map(cat => (
          <Link
            key={cat.id}
            to={`/category/${cat.slug}`}
            className="flex flex-col items-center gap-2 p-3 bg-white rounded-xl border border-slate-100 hover:border-brand-300 hover:shadow-md transition-all group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">{cat.icon}</span>
            <span className="text-xs font-medium text-slate-600 text-center leading-tight">{cat.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Product section with loading state */
function ProductSection({ title, subtitle, viewAllLink, loadFn, cols = 4 }) {
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    loadFn().then(({ data }) => {
      setProducts(data || [])
      setLoading(false)
    })
  }, [loadFn])

  return (
    <section>
      <SectionHeading title={title} subtitle={subtitle} viewAllLink={viewAllLink} />
      {loading ? <ProductSectionSkeleton /> : <ProductGrid products={products} cols={cols} />}
    </section>
  )
}

/** Deal of the Day strip */
function DealsStrip() {
  const [deals,   setDeals]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDeals().then(({ data }) => { setDeals(data || []); setLoading(false) })
  }, [])

  if (loading) return null

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <SectionHeading
        title="🔥 Deals of the Day"
        subtitle="Limited time offers — grab them before they're gone!"
        viewAllLink="/deals"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {deals.map(product => (
          <Link
            key={product.id}
            to={`/product/${product.slug}`}
            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-brand-300 hover:shadow-md transition-all group text-center"
          >
            <img
              src={product.image}
              alt={product.name}
              className="w-20 h-20 object-contain group-hover:scale-105 transition-transform"
              loading="lazy"
              onError={e => { e.currentTarget.src = 'https://placehold.co/80x80?text=?' }}
            />
            <span className="text-xs font-medium text-slate-700 line-clamp-2 leading-tight">{product.name}</span>
            <span className="text-sm font-bold text-slate-900">{formatPrice(product.price)}</span>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              {product.discount}% off
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Main homepage */
export default function HomePage() {
  const [banners, setBanners] = useState([])

  useEffect(() => {
    fetchBanners().then(({ data }) => setBanners(data || []))
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-10">
      {/* Hero */}
      <HeroBanner banners={banners} />

      {/* Category strip */}
      <CategoryStrip />

      {/* Featured products */}
      <ProductSection
        title="Featured Products"
        subtitle="Handpicked selections just for you"
        viewAllLink="/featured"
        loadFn={fetchFeaturedProducts}
      />

      {/* Deals of the day */}
      <DealsStrip />

      {/* Best Sellers */}
      <ProductSection
        title="Best Sellers"
        subtitle="Loved by millions of customers"
        viewAllLink="/best-sellers"
        loadFn={fetchBestSellers}
      />

      {/* Trending */}
      <ProductSection
        title="Trending Now"
        subtitle="What everyone's shopping this week"
        viewAllLink="/trending"
        loadFn={fetchTrendingProducts}
      />

      {/* Newsletter CTA */}
      <section className="bg-gradient-to-r from-brand-600 to-brand-500 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-2">Get exclusive deals in your inbox</h2>
        <p className="text-brand-100 mb-6 text-sm">Subscribe and be the first to know about flash sales and new arrivals.</p>
        <form
          onSubmit={e => e.preventDefault()}
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <input
            type="email"
            placeholder="Enter your email"
            className="flex-1 px-4 py-2.5 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <button
            type="submit"
            className="bg-white text-brand-700 font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-brand-50 transition-colors"
          >
            Subscribe
          </button>
        </form>
      </section>
    </div>
  )
}
