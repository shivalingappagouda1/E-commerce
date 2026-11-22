import { Heart, ShoppingCart, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import Badge from '../common/Badge'
import { formatPrice } from '../../utils/format'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'

const CARD_THEMES = ['navy', 'teal', 'purple', 'burgundy', 'slate', 'forest']

function getCardTheme(product) {
  const source = String(product?.id || product?.slug || product?.category || product?.name || 'shopkart')
  let hash = 0

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0
  }

  return CARD_THEMES[Math.abs(hash) % CARD_THEMES.length]
}

export default function ProductCard({ product, cardTheme: cardThemeOverride }) {
  const { addItem, items, updateQty } = useCart()
  const { toggle, isWishlisted, isItemPending } = useWishlist()

  if (!product) return null

  const wishlisted = isWishlisted(product.id)
  const wishPending = isItemPending(product.id)
  const cartItem = items.find(i => i.id === product.id || i.cartItemId === product.id)
  const inCart = Boolean(cartItem)
  const isAvailable = product.inStock !== false && product.is_active !== false
  const cardTheme = cardThemeOverride || getCardTheme(product)

  const discountPercent = product.discount_percent || product.discount || (
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0
  )

  const originalPrice = product.original_price || product.originalPrice || product.price

  return (
    <div className={`product-card product-card--${cardTheme} group relative rounded-2xl shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col overflow-hidden`}>
      {/* Product image area remains light for clear product visibility */}
      <div className="product-card__image relative aspect-square w-full overflow-hidden flex items-center justify-center p-4">
        <Link to={`/product/${product.slug}`} className="w-full h-full flex items-center justify-center">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
            onError={e => { e.currentTarget.src = 'https://placehold.co/400x400?text=ShopKart' }}
          />
        </Link>

        {discountPercent > 0 && (
          <span className="absolute top-2.5 left-2.5 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs tracking-wider uppercase">
            {discountPercent}% OFF
          </span>
        )}

        {!isAvailable && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-2xs flex items-center justify-center z-10">
            <span className="text-xs font-bold text-slate-700 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs">
              Out of Stock
            </span>
          </div>
        )}

        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!wishPending) toggle(product)
          }}
          disabled={wishPending}
          aria-busy={wishPending}
          className={`absolute top-2.5 right-2.5 p-2 rounded-full border shadow-xs transition-all z-20 ${
            wishPending ? 'opacity-60 cursor-wait' : 'cursor-pointer'
          } ${
            wishlisted
              ? 'bg-red-50 text-red-500 border-red-200 shadow-sm'
              : 'bg-white/95 backdrop-blur-2xs text-slate-500 border-slate-200 hover:text-red-500 hover:border-red-200 hover:bg-white'
          }`}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart size={15} className={wishlisted ? 'fill-current' : ''} />
        </button>
      </div>

      {/* Dark, color-coded information panel */}
      <div className="product-card__content flex flex-col flex-1 p-4 gap-2">
        <div className="flex items-center justify-between gap-1">
          <span className="product-card__category text-[11px] font-semibold uppercase tracking-wide truncate">
            {product.category || 'General'}
          </span>
          {product.badge && <Badge label={product.badge} />}
        </div>

        <Link to={`/product/${product.slug}`} className="block">
          <h3 className="product-card__title text-xs sm:text-sm font-semibold line-clamp-2 leading-snug transition-colors">
            {product.name}
          </h3>
        </Link>

        <div className="flex items-center gap-1.5 pt-0.5">
          <div className="flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[11px] font-bold">
            <span>{Number(product.rating || 4.5).toFixed(1)}</span>
            <Star size={11} className="fill-amber-500 text-amber-500" />
          </div>
          <span className="product-card__reviews text-[11px]">
            ({product.reviewCount || product.review_count || 120})
          </span>
        </div>

        <div className="flex items-baseline gap-2 mt-auto pt-2">
          <span className="product-card__price text-base sm:text-lg font-black">
            {formatPrice(product.price)}
          </span>
          {originalPrice > product.price && (
            <span className="product-card__original-price text-xs line-through">
              {formatPrice(originalPrice)}
            </span>
          )}
        </div>

        <div className="pt-2">
          {!isAvailable ? (
            <button
              disabled
              className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-slate-200 text-slate-500 cursor-not-allowed"
            >
              Unavailable
            </button>
          ) : inCart ? (
            <div className="product-card__quantity flex items-center justify-between rounded-xl p-1">
              <button
                onClick={() => updateQty(product.id, Math.max(0, cartItem.quantity - 1))}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                -
              </button>
              <span className="product-card__quantity-label text-xs font-bold">
                {cartItem.quantity} in Cart
              </span>
              <button
                onClick={() => updateQty(product.id, cartItem.quantity + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-brand-500 font-bold text-white hover:bg-brand-600 transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={() => addItem(product)}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-98"
            >
              <ShoppingCart size={14} />
              <span>Add to Cart</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
