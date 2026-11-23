import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'

const DEFAULT_HERO_BANNERS = [
  {
    id: 'b1',
    title: 'Flagship Tech & Audio Fest',
    subtitle: 'Discover premium electronics and accessories at unbeatable prices.',
    cta: 'Shop Electronics',
    ctaLink: '/category/electronics',
    badge: 'Limited Time Deal',
    bgGradient: 'from-slate-950 via-slate-900 to-blue-950',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1000&auto=format&fit=crop&q=80',
  },
  {
    id: 'b2',
    title: 'The Modern Lifestyle Edit',
    subtitle: 'Explore premium fashion, activewear and everyday essentials.',
    cta: 'Explore Collection',
    ctaLink: '/category/fashion',
    badge: 'Trending Styles',
    bgGradient: 'from-stone-950 via-stone-900 to-amber-950',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1000&auto=format&fit=crop&q=80',
  },
  {
    id: 'b3',
    title: 'Smart Home & Kitchen',
    subtitle: 'Upgrade your home with useful everyday essentials.',
    cta: 'Upgrade Your Home',
    ctaLink: '/category/home-living',
    badge: 'New Arrivals',
    bgGradient: 'from-emerald-950 via-slate-900 to-teal-950',
    image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1000&auto=format&fit=crop&q=80',
  },
]

export default function HeroBanner({ banners = [], compact = false }) {
  const displayBanners = banners?.length
    ? banners
    : (!isSupabaseConfigured ? DEFAULT_HERO_BANNERS : [])

  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    setCurrent(index => (
      displayBanners.length ? index % displayBanners.length : 0
    ))
  }, [displayBanners.length])

  const prev = useCallback(() => {
    setCurrent(index => (
      displayBanners.length
        ? (index - 1 + displayBanners.length) % displayBanners.length
        : 0
    ))
  }, [displayBanners.length])

  const next = useCallback(() => {
    setCurrent(index => (
      displayBanners.length
        ? (index + 1) % displayBanners.length
        : 0
    ))
  }, [displayBanners.length])

  useEffect(() => {
    if (paused || displayBanners.length <= 1) return undefined

    const intervalId = window.setInterval(next, 5000)
    return () => window.clearInterval(intervalId)
  }, [next, paused, displayBanners.length])

  if (!displayBanners.length) return null

  const banner = displayBanners[current]
  if (!banner) return null

  const bannerImage = banner.image || banner.image_url
  const bannerCtaLink = banner.ctaLink || banner.cta_link || '/'
  const bgFrom = banner.bg_from || banner.bgFrom
  const bgTo = banner.bg_to || banner.bgTo

  const bannerStyle = !banner.bgGradient && bgFrom && bgTo
    ? { background: `linear-gradient(135deg, ${bgFrom} 0%, ${bgTo} 100%)` }
    : undefined

  const isExternalLink = /^https?:\/\//i.test(bannerCtaLink)

  const heightClass = compact
    ? 'min-h-[190px] sm:min-h-[205px] md:min-h-[220px]'
    : 'min-h-[320px] sm:min-h-[380px] md:min-h-[440px]'

  const contentClass = compact
    ? 'max-w-[72%] px-6 sm:px-7 py-6 space-y-2'
    : 'max-w-xl px-6 sm:px-12 md:px-16 py-10 space-y-4'

  const titleClass = compact
    ? 'text-xl sm:text-2xl lg:text-3xl font-black tracking-tight leading-tight text-white'
    : 'text-2xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight text-white drop-shadow-xs'

  const buttonClass = compact
    ? 'inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all'
    : 'inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-lg transition-all'

  return (
    <div
      className="relative isolate h-full overflow-hidden rounded-2xl shadow-md border border-slate-800/20 group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className={`relative w-full ${heightClass} ${
          bannerStyle
            ? ''
            : `bg-gradient-to-r ${banner.bgGradient || 'from-slate-950 to-blue-950'}`
        } flex items-center`}
        style={bannerStyle}
      >
        {bannerImage && (
          <div className={`pointer-events-none absolute inset-0 sm:left-auto sm:w-3/5 overflow-hidden ${compact ? 'opacity-45' : 'opacity-50'}`}>
            <img
              src={bannerImage}
              alt=""
              aria-hidden="true"
              draggable="false"
              className="h-full w-full object-cover object-center transition-transform duration-1000 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/30 to-transparent" />
          </div>
        )}

        <div className={`relative z-10 text-white ${contentClass}`}>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold text-amber-300 backdrop-blur-md">
            <Sparkles size={12} className="text-amber-400" />
            <span>{banner.badge || 'Featured Collection'}</span>
          </div>

          <h1 className={titleClass}>{banner.title}</h1>

          {banner.subtitle && (
            <p className={`text-slate-200 leading-relaxed ${compact ? 'hidden sm:block text-xs line-clamp-2 max-w-sm' : 'text-xs sm:text-sm max-w-md'}`}>
              {banner.subtitle}
            </p>
          )}

          <div className={compact ? 'pt-1' : 'pt-2'}>
            {isExternalLink ? (
              <a
                href={bannerCtaLink}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass}
              >
                {banner.cta || 'Shop Now'}
                <ArrowRight size={15} />
              </a>
            ) : (
              <Link to={bannerCtaLink} className={buttonClass}>
                {banner.cta || 'Shop Now'}
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {displayBanners.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className={`absolute z-30 left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white border border-white/20 shadow-lg transition-all hover:bg-black/75 cursor-pointer ${compact ? 'p-1.5' : 'p-2.5'}`}
            aria-label="Previous banner"
          >
            <ChevronLeft size={compact ? 18 : 22} />
          </button>

          <button
            type="button"
            onClick={next}
            className={`absolute z-30 right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white border border-white/20 shadow-lg transition-all hover:bg-black/75 cursor-pointer ${compact ? 'p-1.5' : 'p-2.5'}`}
            aria-label="Next banner"
          >
            <ChevronRight size={compact ? 18 : 22} />
          </button>

          <div className="absolute z-30 bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {displayBanners.map((item, index) => (
              <button
                key={item.id || index}
                type="button"
                onClick={() => setCurrent(index)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  index === current
                    ? 'w-7 bg-brand-400'
                    : 'w-2 bg-white/50 hover:bg-white/80'
                }`}
                aria-label={`Go to banner ${index + 1}`}
                aria-current={index === current ? 'true' : undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
