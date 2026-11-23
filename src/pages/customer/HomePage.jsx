import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Truck, ShieldCheck, RotateCcw, Lock, Headset,
  ArrowRight, Flame, Sparkles, Sofa, Headphones,
  ShoppingBag, Smartphone
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

function TrustStrip() {
  const items = [
    { icon: Truck, title: 'Free Express Delivery', desc: 'On orders above ₹999', color: 'text-blue-600 bg-blue-50' },
    { icon: ShieldCheck, title: '100% Authentic Products', desc: 'Trusted brands & sellers', color: 'text-emerald-600 bg-emerald-50' },
    { icon: RotateCcw, title: '7-Day Easy Returns', desc: 'Hassle-free refunds', color: 'text-orange-600 bg-orange-50' },
    { icon: Lock, title: 'Secure Payments', desc: 'UPI, cards & net banking', color: 'text-purple-600 bg-purple-50' },
    { icon: Headset, title: '24×7 Customer Support', desc: 'We are here to help', color: 'text-indigo-600 bg-indigo-50' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map(({ icon: Icon, title, desc, color }) => (
        <div key={title} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${color}`}>
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-extrabold text-slate-800">{title}</h3>
            <p className="mt-1 truncate text-[11px] text-slate-500">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function SidePromotion({ icon: Icon, eyebrow, title, description, link, theme }) {
  const themes = {
    electronics: 'from-violet-950 via-indigo-800 to-blue-700 text-white',
    home: 'from-amber-100 to-orange-50 text-slate-900',
  }

  const dark = theme === 'electronics'

  return (
    <Link
      to={link}
      className={`group relative flex h-full min-h-[190px] flex-col justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${themes[theme]} p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg`}
    >
      <div className="relative z-10 max-w-[85%]">
        <p className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-violet-200' : 'text-slate-500'}`}>
          {eyebrow}
        </p>
        <h3 className="mt-2 text-xl font-black leading-tight">{title}</h3>
        <p className={`mt-2 text-xs ${dark ? 'text-violet-100' : 'text-slate-600'}`}>
          {description}
        </p>
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-orange-500 px-3 py-2 text-xs font-bold text-white">
          Shop now <ArrowRight size={14} />
        </span>
      </div>
      <Icon
        size={92}
        className={`absolute -bottom-4 -right-3 opacity-20 transition-transform group-hover:scale-110 ${dark ? 'text-white' : 'text-slate-700'}`}
      />
    </Link>
  )
}

function CategorySection({ categories, loading }) {
  const list = categories.length
    ? categories.slice(0, 12)
    : (!isSupabaseConfigured ? SAMPLE_CATEGORIES.slice(0, 12) : [])

  if (!list.length && !loading) return null

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Explore Top Categories"
        subtitle="Find everything you need, all in one place"
      />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-12">
        {list.map(cat => (
          <Link
            key={cat.id || cat.slug}
            to={`/category/${cat.slug}`}
            className="group flex min-h-[105px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-md"
          >
            {cat.image_url ? (
              <img src={cat.image_url} alt={cat.name} className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <span className="text-3xl">{cat.icon || '🛍️'}</span>
            )}
            <span className="max-w-full truncate text-xs font-bold text-slate-700 group-hover:text-orange-600">
              {cat.name}
            </span>
          </Link>
        ))}

        {loading && !list.length && Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-[105px] animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
    </section>
  )
}

function DealsSection() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    fetchDeals(6)
      .then(({ data }) => {
        if (active) setDeals(data || [])
      })
      .catch(error => console.error('Deals loading failed:', error))
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  if (!loading && !deals.length) return null

  return (
    <section className="h-full rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 lg:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900">
            <Flame className="text-orange-500" size={22} />
            Today's Flash Deals
          </h2>
          <p className="mt-1 text-xs text-slate-500">Limited-time offers on selected products</p>
        </div>
        <Link to="/deals" className="inline-flex items-center gap-1 text-xs font-bold text-orange-700">
          View all deals <ArrowRight size={14} />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {deals.slice(0, 6).map(product => (
            <Link
              key={product.id}
              to={`/product/${product.slug}`}
              className="deal-product-card group flex min-w-0 flex-col rounded-xl p-2.5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="deal-product-card__image relative mb-2 aspect-square overflow-hidden rounded-lg p-2">
                <img
                  src={product.image}
                  alt={product.name}
                  loading="lazy"
                  className="h-full w-full object-contain transition group-hover:scale-105"
                  onError={e => { e.currentTarget.src = 'https://placehold.co/300x300?text=ShopKart' }}
                />
                <span className="absolute left-2 top-2 rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                  {product.discount_percent || product.discount || 0}% OFF
                </span>
              </div>
              <h3 className="deal-product-card__title line-clamp-2 min-h-8 text-xs font-bold">{product.name}</h3>
              <p className="deal-product-card__price mt-1 text-sm font-black">{formatPrice(product.price)}</p>
              {(product.original_price || product.originalPrice) > product.price && (
                <p className="deal-product-card__original-price text-[10px] line-through">
                  {formatPrice(product.original_price || product.originalPrice)}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function NewArrivalsPanel() {
  return (
    <Link
      to="/trending"
      className="group relative flex min-h-[230px] h-full flex-col justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-[#123B5A] via-[#195B87] to-[#287EAA] p-6 text-white shadow-md"
    >
      <div className="relative z-10 max-w-[75%]">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold text-sky-100">
          <Sparkles size={12} /> JUST ARRIVED
        </span>
        <h2 className="mt-3 text-2xl font-black">New Arrivals</h2>
        <p className="mt-2 text-xs text-sky-100">Discover fresh picks and trending products</p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-xs font-bold">
          Explore now <ArrowRight size={14} />
        </span>
      </div>
      <Smartphone size={110} className="absolute -bottom-5 -right-3 rotate-[-12deg] text-white/10 transition group-hover:scale-110" />
    </Link>
  )
}

function ProductSection({ title, subtitle, viewAllLink, loadFn, limit = 16 }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    loadFn(limit)
      .then(({ data }) => {
        if (active) setProducts((data || []).slice(0, limit))
      })
      .catch(error => console.error(`${title} loading failed:`, error))
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [loadFn, limit, title])

  if (!loading && !products.length) return null

  return (
    <section className="space-y-3">
      <SectionHeading title={title} subtitle={subtitle} viewAllLink={viewAllLink} />
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border bg-white p-3">
              <div className="aspect-square rounded-xl bg-slate-100" />
              <div className="mt-3 h-3 w-3/4 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
              <div className="mt-4 h-8 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : (
        <ProductGrid products={products} cols={8} cardTheme="ocean-blue" />
      )}
    </section>
  )
}

function CampaignBanners() {
  const campaigns = [
    {
      title: 'Winter Collection',
      subtitle: 'Fresh looks for the season',
      link: '/category/fashion',
      theme: 'from-orange-100 to-amber-50',
      icon: ShoppingBag,
    },
    {
      title: 'Home Upgrade Days',
      subtitle: 'Furniture, decor and more',
      link: '/category/home-living',
      theme: 'from-emerald-100 to-teal-50',
      icon: Sofa,
    },
    {
      title: 'Top Branded Mobiles',
      subtitle: 'Latest models and accessories',
      link: '/category/electronics',
      theme: 'from-violet-100 to-indigo-50',
      icon: Smartphone,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {campaigns.map(({ title, subtitle, link, theme, icon: Icon }) => (
        <Link
          key={title}
          to={link}
          className={`group relative flex min-h-[140px] items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-r ${theme} p-5 transition hover:-translate-y-1 hover:shadow-md`}
        >
          <div className="relative z-10 max-w-[75%]">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">SHOPKART COLLECTION</p>
            <h3 className="mt-2 text-lg font-black text-slate-900">{title}</h3>
            <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-orange-700">
              Shop now <ArrowRight size={14} />
            </span>
          </div>
          <Icon size={76} className="absolute bottom-3 right-4 text-slate-800/15 transition group-hover:scale-110" />
        </Link>
      ))}
    </div>
  )
}

export default function HomePage() {
  const [banners, setBanners] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    Promise.all([
      fetchBanners().then(({ data }) => {
        if (active) setBanners(data || [])
      }),
      fetchCategories().then(({ data }) => {
        if (active) setCategories(data || [])
      }),
    ])
      .catch(error => console.error('Homepage data loading failed:', error))
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  return (
    <div className="w-full space-y-6 px-3 py-4 sm:px-5 lg:px-6 2xl:px-8">
      {/* Three compact promotions: 50% hero, 25% electronics, 25% home */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="min-w-0 lg:col-span-2">
          <HeroBanner banners={banners} compact />
        </div>

        <div className="min-w-0 lg:col-span-1">
          <SidePromotion
            icon={Headphones}
            eyebrow="MEGA ELECTRONICS SALE"
            title="Upgrade your tech"
            description="Electronics, laptops & accessories"
            link="/category/electronics"
            theme="electronics"
          />
        </div>

        <div className="min-w-0 lg:col-span-1">
          <SidePromotion
            icon={Sofa}
            eyebrow="HOME & LIVING"
            title="Refresh your space"
            description="Furniture, decor and home essentials"
            link="/category/home-living"
            theme="home"
          />
        </div>
      </section>

      <TrustStrip />

      <CategorySection categories={categories} loading={loading} />

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-12">
        <div className="min-w-0 2xl:col-span-9">
          <DealsSection />
        </div>
        <div className="2xl:col-span-3">
          <NewArrivalsPanel />
        </div>
      </div>

      <ProductSection
        title="Featured Products"
        subtitle="Popular picks selected for you"
        viewAllLink="/featured"
        loadFn={fetchFeaturedProducts}
        limit={16}
      />

      <CampaignBanners />

      <ProductSection
        title="Top Rated & Reviewed"
        subtitle="Customer favourites with excellent ratings"
        viewAllLink="/best-sellers"
        loadFn={fetchBestSellers}
        limit={16}
      />

      <ProductSection
        title="Trending Now"
        subtitle="Products getting attention right now"
        viewAllLink="/trending"
        loadFn={fetchTrendingProducts}
        limit={16}
      />
    </div>
  )
}
