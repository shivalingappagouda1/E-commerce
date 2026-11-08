import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Promotional hero banner carousel.
 * Accepts banners from the service layer or sample data.
 */
export default function HeroBanner({ banners = [] }) {
  const [current, setCurrent] = useState(0)
  const [paused,  setPaused]  = useState(false)

  const prev = useCallback(() => setCurrent(c => (c - 1 + banners.length) % banners.length), [banners.length])
  const next = useCallback(() => setCurrent(c => (c + 1) % banners.length),                  [banners.length])

  useEffect(() => {
    if (paused || banners.length <= 1) return
    const id = setInterval(next, 4500)
    return () => clearInterval(id)
  }, [next, paused, banners.length])

  if (!banners.length) return null

  const banner = banners[current]

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slide */}
      <div
        className="relative w-full h-56 sm:h-72 md:h-80 lg:h-96 flex items-center transition-all duration-700"
        style={{ background: `linear-gradient(135deg, ${banner.bgFrom} 0%, ${banner.bgTo} 100%)` }}
      >
        {/* Text content */}
        <div className="relative z-10 max-w-lg px-8 md:px-14 py-8 text-white">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight mb-2">
            {banner.title}
          </h1>
          <p className="text-sm sm:text-base text-white/80 mb-6">{banner.subtitle}</p>
          <Link
            to={banner.ctaLink}
            className="inline-block bg-white text-slate-900 font-bold text-sm px-6 py-2.5 rounded-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            {banner.cta} →
          </Link>
        </div>

        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute right-16 bottom-0 w-96 h-96 rounded-full bg-white/5 pointer-events-none" />
      </div>

      {/* Nav arrows */}
      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
