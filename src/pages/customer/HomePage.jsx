import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Truck, ShieldCheck, RotateCcw, Lock, ArrowRight,
  Flame, Clock, Sparkles, CheckCircle2, PackageOpen
} from 'lucide-react'
import HeroBanner from '../../components/layout/HeroBanner'
import ProductGrid from '../../components/products/ProductGrid'
import SectionHeading from '../../components/common/SectionHeading'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  fetchBanners,
  fetchFeaturedProducts,
  fetchBestSellers,
  fetchTrendingProducts,
  fetchDeals,
  fetchCategories,
} from '../../services/productService'
import { SAMPLE_CATEGORIES } from '../../utils/sampleData'
import { formatPrice } from '../../utils/format'

/** Loading Skeleton for product grids */
function ProductSectionSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 animate-pulse">
          <div className="aspect-square bg-slate-100 rounded-xl" />
          <div className="h-3.5 bg-slate-100 rounded w-3/4" />
          <div className="h-3 bg-slate-100 rounded w-1/2" />
          <div className="h-6 bg-slate-100 rounded w-1/3 mt-2" />
        </div>
      ))}
    </div>
  )
}

/** Trust & Value Proposition Strip */
function ValuePropsStrip() {
  const props = [
    {
      icon: Truck,
      title: 'Free Express Delivery',
      desc: 'On all orders above ₹999 nationwide',
      color: 'text-blue-600 bg-blue-50',
    },
    {
      icon: ShieldCheck,
      title: '100% Authentic Products',
      desc: 'Direct from certified brands & manufacturers',
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      icon: RotateCcw,
      title: '7-Day Easy Returns',
      desc: 'Hassle-free doorstep pickup & exchange',
      color: 'text-amber-600 bg-amber-50',
    },
    {
      icon: Lock,
      title: 'Safe & Secure Payments',
      desc: 'Encrypted via UPI, NetBanking & Cards',
      color: 'text-purple-600 bg-purple-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {props.map((p, idx) => {
        const Icon = p.icon
        return (
          <div
            key={idx}
            className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center gap-3.5 shadow-2xs hover:shadow-sm transition-shadow"
          >
            <div className={`p-2.5 rounded-xl shrink-0 ${p.color}`}>
              <Icon size={22} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">{p.title}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{p.desc}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Modern Visual Categories Strip */
function CategoryStrip({ categories, loading = false }) {
  const list = categories && categories.length > 0
    ? categories
    : (!isSupabaseConfigured ? SAMPLE_CATEGORIES : [])

  if (list.length === 0) {
    if (loading) {
      return (
        <section className="space-y-4">
          <SectionHeading
            title="Explore Top Categories"
            subtitle="Discover millions of products across your favorite departments"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-2xl border border-slate-100 p-4" />
            ))}
          </div>
        </section>
      )
    }
    return null
  }

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Explore Top Categories"
        subtitle="Discover millions of products across your favorite departments"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {list.map(cat => (
          <Link
            key={cat.id || cat.slug}
            to={`/category/${cat.slug}`}
            className="group flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl border border-slate-200/80 hover:border-brand-300 hover:shadow-md transition-all text-center cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-50 group-hover:bg-brand-50 flex items-center justify-center overflow-hidden transition-colors group-hover:scale-110 duration-300">
              {cat.image_url ? (
                <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">{cat.icon || '🛍️'}</span>
              )}
            </div>
            <span className="text-xs font-bold text-slate-700 group-hover:text-brand-600 transition-colors truncate max-w-full">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** 30%+ Discounts Strip */
function DealsStrip() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDeals(6).then(({ data }) => {
      setDeals(data || [])
      setLoading(false)
    })
  }, [])

  if (!loading && (!deals || deals.length === 0)) return null

  return (
    <section className="bg-gradient-to-br from-amber-500/10 via-brand-500/5 to-white rounded-3xl border border-amber-200/80 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 bg-amber-500 text-white rounded-lg">
              <Flame size={18} />
            </span>
            <h2 className="text-xl font-black text-slate-900">30%+ Discounts</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">Products discounted by 30% or more off list price</p>
        </div>

        <Link
          to="/deals"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-100 hover:bg-amber-200/80 px-3.5 py-2 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
        >
          <span>View All Discounts</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Deals Grid */}
      {loading ? (
        <ProductSectionSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {deals.map(p => (
            <Link
              key={p.id}
              to={`/product/${p.slug}`}
              className="bg-white rounded-2xl border border-slate-200/70 p-3 flex flex-col items-center gap-2 hover:shadow-md hover:border-amber-300 transition-all text-center group cursor-pointer"
            >
              <div className="relative aspect-square w-full bg-slate-50 rounded-xl p-2 flex items-center justify-center overflow-hidden">
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-full h-full object-contain group-hover:scale-108 transition-transform duration-300"
                  onError={e => { e.currentTarget.src = 'https://placehold.co/100x100?text=Deal' }}
                />
                <span className="absolute top-1.5 left-1.5 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">
                  {p.discount}% OFF
                </span>
              </div>
              <h3 className="text-xs font-semibold text-slate-800 line-clamp-1 leading-snug group-hover:text-brand-600">
                {p.name}
              </h3>
              <div className="mt-auto">
                <p className="text-sm font-black text-slate-900">{formatPrice(p.price)}</p>
                {p.originalPrice > p.price && (
                  <p className="text-[10px] text-slate-400 line-through">{formatPrice(p.originalPrice)}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/** Product Section Container */
function ProductSection({ title, subtitle, viewAllLink, loadFn, cardTheme }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFn().then(({ data }) => {
      setProducts(data || [])
      setLoading(false)
    })
  }, [loadFn])

  if (!loading && products.length === 0) return null

  return (
    <section className="space-y-4">
      <SectionHeading title={title} subtitle={subtitle} viewAllLink={viewAllLink} />
      {loading ? <ProductSectionSkeleton count={4} /> : <ProductGrid products={products} cols={4} cardTheme={cardTheme} />}
    </section>
  )
}

/** Promotional Duo Banners */
function PromoBanners() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Banner 1 */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 to-indigo-950 p-8 text-white flex flex-col justify-between min-h-[200px] border border-slate-800">
        <div className="space-y-2 z-10 max-w-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-500/20 px-2.5 py-1 rounded-full">
            Special Launch
          </span>
          <h3 className="text-xl sm:text-2xl font-black leading-tight">Next-Gen Audio Experience</h3>
          <p className="text-xs text-slate-300">Immerse yourself in lossless spatial sound with active cancellation.</p>
        </div>
        <div className="pt-4 z-10">
          <Link
            to="/category/electronics"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl transition-colors"
          >
            Shop Audio Gear <ArrowRight size={14} />
          </Link>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-400 to-transparent pointer-events-none" />
      </div>

      {/* Banner 2 */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-950 to-orange-950 p-8 text-white flex flex-col justify-between min-h-[200px] border border-amber-900/50">
        <div className="space-y-2 z-10 max-w-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/20 px-2.5 py-1 rounded-full">
            Festive Edit
          </span>
          <h3 className="text-xl sm:text-2xl font-black leading-tight">Exclusive Style Essentials</h3>
          <p className="text-xs text-amber-200/80">Upgrade your wardrobe with hand-stitched premium seasonal collections.</p>
        </div>
        <div className="pt-4 z-10">
          <Link
            to="/category/fashion"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 px-4 py-2 rounded-xl transition-colors"
          >
            Explore Fashion <ArrowRight size={14} />
          </Link>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-400 to-transparent pointer-events-none" />
      </div>
    </div>
  )
}

/** Newsletter Section */
function NewsletterSection() {
  const [subscribed, setSubscribed] = useState(false)
  const [email, setEmail] = useState('')

  function handleSubscribe(e) {
    e.preventDefault()
    if (email.trim() && email.includes('@')) {
      setSubscribed(true)
    }
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-500 to-amber-600 p-8 sm:p-12 text-white text-center shadow-lg">
      <div className="relative z-10 max-w-xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-amber-200">
          <Sparkles size={14} />
          <span>VIP Early Access</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
          Unlock 10% Off Your Next Order
        </h2>

        <p className="text-xs sm:text-sm text-brand-100 leading-relaxed">
          Subscribe to the ShopKart insider newsletter for flash drops, exclusive member coupons, and product previews.
        </p>

        {subscribed ? (
          <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center gap-2 font-bold text-xs animate-in fade-in">
            <CheckCircle2 size={18} className="text-amber-300" />
            <span>Thank you for subscribing! Check your inbox for your 10% discount voucher.</span>
          </div>
        ) : (
          <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto pt-2">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email address..."
              className="flex-1 px-4 py-3 rounded-xl text-slate-800 text-xs bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-xs"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer shrink-0"
            >
              Join VIP Club
            </button>
          </form>
        )}
      </div>

      <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/10 pointer-events-none" />
    </section>
  )
}

/** Main Customer Storefront HomePage */
export default function HomePage() {
  const [banners, setBanners] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchBanners().then(({ data }) => setBanners(data || [])),
      fetchCategories().then(({ data }) => setCategories(data || [])),
    ]).finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-12">
      {/* 1. Hero Carousel */}
      <HeroBanner banners={banners} />

      {/* 2. Value Propositions */}
      <ValuePropsStrip />

      {/* Empty State Banner when Supabase is configured but catalog has 0 records */}
      {isSupabaseConfigured && !loading && categories.length === 0 && (
        <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400">
            <PackageOpen size={32} />
          </div>
          <h3 className="text-base font-bold text-slate-800">Staging Catalog Is Currently Empty</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No categories or products have been published in this database yet. Run <code className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-600 font-mono">database/seed_staging.sql</code> in your Supabase SQL Editor to populate the catalog with verified products and categories.
          </p>
        </div>
      )}

      {/* 3. Category Discovery */}
      <CategoryStrip categories={categories} loading={loading} />

      {/* 4. Deals (30%+ Discounts) */}
      <DealsStrip />

      {/* 5. Featured Products */}
      <ProductSection
        title="Featured Products"
        subtitle="Catalog items marked as featured"
        viewAllLink="/featured"
        loadFn={fetchFeaturedProducts}
        cardTheme="ocean-blue"
      />

      {/* 6. Promotional Split Banners */}
      <PromoBanners />

      {/* 7. Top Rated & Reviewed */}
      <ProductSection
        title="Top Rated & Reviewed"
        subtitle="Products with customer rating 4.5+ sorted by review count"
        viewAllLink="/best-sellers"
        loadFn={fetchBestSellers}
        cardTheme="ocean-blue"
      />

      {/* 8. Tagged Picks */}
      <ProductSection
        title="Tagged Picks"
        subtitle="Products tagged with Trending, Hot, or Top Deal badges"
        viewAllLink="/trending"
        loadFn={fetchTrendingProducts}
        cardTheme="ocean-blue"
      />

      {/* 9. VIP Newsletter */}
      <NewsletterSection />
    </div>
  )
}
