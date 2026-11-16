import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'

const DEFAULT_HERO_BANNERS = [
  {
    id: 'b1',
    title: 'Flagship Tech & Audio Fest',
    subtitle: 'Experience industry-leading ANC headphones, 4K OLED displays & smart home devices with up to 45% off.',
    cta: 'Shop Electronics',
    ctaLink: '/category/electronics',
    badge: 'Limited Time Deal',
    bgGradient: 'from-slate-950 via-slate-900 to-blue-950',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'b2',
    title: 'The Modern Lifestyle Edit',
    subtitle: 'Curated premium fashion, athletic activewear & designer denim crafted for effortless everyday comfort.',
    cta: 'Explore Collection',
    ctaLink: '/category/fashion',
    badge: 'Trending Styles',
    bgGradient: 'from-stone-950 via-stone-900 to-amber-950',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'b3',
    title: 'Smart Home & Kitchen Innovations',
    subtitle: 'Air fryers, robotic vacuums, and smart kitchen essentials that elevate your living space.',
    cta: 'Upgrade Your Home',
    ctaLink: '/category/home-living',
    badge: 'New Arrivals',
    bgGradient: 'from-emerald-950 via-slate-900 to-teal-950',
    image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80',
  },
]

export default function HeroBanner({ banners = [] }) {
  const displayBanners = banners && banners.length > 0
    ? banners
    : (!isSupabaseConfigured ? DEFAULT_HERO_BANNERS : [])
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)

  const prev = useCallback(() => {
    if (displayBanners.length === 0) return
    setCurrent(c => (c - 1 + displayBanners.length) % displayBanners.length)
  }, [displayBanners.length])

  const next = useCallback(() => {
    if (displayBanners.length === 0) return
    setCurrent(c => (c + 1) % displayBanners.length)
  }, [displayBanners.length])

  useEffect(() => {
    if (paused || displayBanners.length <= 1) return
    const id = setInterval(next, 5000)
    return () => clearInterval(id)
  }, [next, paused, displayBanners.length])

  const safeCurrent = displayBanners.length > 0 ? current % displayBanners.length : 0
  const banner = displayBanners[safeCurrent]
  if (!banner) return null

  const bannerImage = banner.image || banner.image_url
  const bannerCtaLink = banner.ctaLink || banner.cta_link || '/'
  const bgFrom = banner.bg_from || banner.bgFrom
  const bgTo = banner.bg_to || banner.bgTo
  const bannerStyle = !banner.bgGradient && bgFrom && bgTo
    ? { background: `linear-gradient(135deg, ${bgFrom} 0%, ${bgTo} 100%)` }
    : undefined
  const isExternalLink = /^https?:\/\//i.test(bannerCtaLink)

  return (
    <div
      className="relative overflow-hidden rounded-3xl shadow-md border border-slate-800/20 group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Banner Slide */}
      <div
        className={`relative w-full min-h-[320px] sm:min-h-[380px] md:min-h-[440px] ${bannerStyle ? '' : `bg-gradient-to-r ${banner.bgGradient || 'from-slate-950 to-brand-950'}`} flex items-center`}
        style={bannerStyle}
      >
        {/* Background lifestyle image with subtle gradient overlay */}
        {bannerImage && (
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-3/5 opacity-35 sm:opacity-50 overflow-hidden mix-blend-luminosity">
            <img
              src={bannerImage}
              alt={banner.title}
              className="w-full h-full object-cover object-center transform scale-105 group-hover:scale-100 transition-transform duration-1000 ease-out"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-transparent to-transparent sm:via-slate-950/40" />
          </div>
        )}

        {/* Content Block */}
        <div className="relative z-10 max-w-xl px-6 sm:px-12 md:px-16 py-10 text-white space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold text-amber-300">
            <Sparkles size={13} className="text-amber-400" />
            <span>{banner.badge || 'Featured Collection'}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight text-white drop-shadow-xs">
            {banner.title}
          </h1>

          {banner.subtitle && (
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md">
              {banner.subtitle}
            </p>
          )}

          <div className="pt-2">
            {isExternalLink ? (
              <a
                href={bannerCtaLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-lg hover:shadow-brand-500/30 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-98"
              >
                <span>{banner.cta || 'Shop Now'}</span>
                <ArrowRight size={16} />
              </a>
            ) : (
              <Link
                to={bannerCtaLink}
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-lg hover:shadow-brand-500/30 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-98"
              >
                <span>{banner.cta || 'Shop Now'}</span>
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Arrow Controls */}
      {displayBanners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
            aria-label="Previous slide"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
            aria-label="Next slide"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Indicator Dots */}
      {displayBanners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          {displayBanners.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                i === current ? 'w-8 bg-brand-400' : 'w-2 bg-white/40 hover:bg-white/70'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
