import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import ProductCard from './ProductCard'

/**
 * Horizontal product carousel.
 * Every card remains on one line; arrows scroll this section independently.
 */
export default function ProductGrid({ products = [], cols = 4, cardTheme }) {
  const scrollRef = useRef(null)

  if (!products.length) {
    return (
      <div className="py-10 text-center text-slate-400">
        <p className="text-sm">No products found.</p>
      </div>
    )
  }

  const scroll = direction => {
    const element = scrollRef.current
    if (!element) return

    element.scrollBy({
      left: direction * Math.max(element.clientWidth * 0.82, 280),
      behavior: 'smooth',
    })
  }

  return (
    <div className="shopkart-carousel">
      <button
        type="button"
        className="shopkart-carousel__arrow shopkart-carousel__arrow--left"
        aria-label="Scroll products left"
        onClick={() => scroll(-1)}
      >
        <ChevronLeft size={22} strokeWidth={2.5} />
      </button>

      <div
        ref={scrollRef}
        className="shopkart-carousel__track"
        role="region"
        aria-label="Product list"
        tabIndex={0}
      >
        {products.map(product => (
          <div className="shopkart-carousel__item" key={product.id}>
            <ProductCard product={product} cardTheme={cardTheme} />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="shopkart-carousel__arrow shopkart-carousel__arrow--right"
        aria-label="Scroll products right"
        onClick={() => scroll(1)}
      >
        <ChevronRight size={22} strokeWidth={2.5} />
      </button>
    </div>
  )
}
