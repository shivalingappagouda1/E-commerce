import { Heart, ShoppingCart, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import Badge from '../common/Badge'
import { formatPrice } from '../../utils/format'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'

export default function ProductCard({ product }) {
  const { addItem, items, updateQty } = useCart()
  const { toggle, isWishlisted } = useWishlist()

  if (!product) return null

  const wishlisted = isWishlisted(product.id)
  const cartItem = items.find(i => i.id === product.id || i.cartItemId === product.id)
  const inCart = Boolean(cartItem)
  const isAvailable = product.inStock !== false && product.is_active !== false

  const discountPercent = product.discount_percent || product.discount || (
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0
  )

  const originalPrice = product.original_price || product.originalPrice || product.price

  return (
    <div className="group relative bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-slate-300 transition-all duration-300 flex flex-col overflow-hidden">
      {/* ── Top Image Area ── */}
      <div className="relative aspect-square w-full bg-slate-50/80 overflow-hidden flex items-center justify-center p-4">
        {/* Product image link */}
        <Link to={`/product/${product.slug}`} className="w-full h-full flex items-center justify-center">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-106 transition-transform duration-500 ease-out"
            loading="lazy"
            onError={e => { e.currentTarget.src = 'https://placehold.co/400x400?text=ShopKart' }}
          />
        </Link>

        {/* Discount Badge */}
        {discountPercent > 0 && (
          <span className="absolute top-2.5 left-2.5 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs tracking-wider uppercase">
            {discountPercent}% OFF
          </span>
        )}

        {/* Out of Stock Overlay */}
        {!isAvailable && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-2xs flex items-center justify-center z-10">
            <span className="text-xs font-bold text-slate-700 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs">
              Out of Stock
            </span>
          </div>
        )}

        {/* Floating Quick Action: Wishlist */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            toggle(product)
          }}
          className={`absolute top-2.5 right-2.5 p-2 rounded-full border shadow-xs transition-all z-20 cursor-pointer ${
            wishlisted
              ? 'bg-red-50 text-red-500 border-red-200 shadow-sm'
              : 'bg-white/90 backdrop-blur-2xs text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-200 hover:bg-white'
          }`}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart size={15} className={wishlisted ? 'fill-current' : ''} />
        </button>
      </div>

      {/* ── Card Content Area ── */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        {/* Category & Badge Row */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide truncate">
            {product.category || 'General'}
          </span>
          {product.badge && (
            <Badge label={product.badge} />
          )}
        </div>

        {/* Product Title */}
        <Link to={`/product/${product.slug}`} className="block">
          <h3 className="text-xs sm:text-sm font-semibold text-slate-800 line-clamp-2 leading-snug group-hover:text-brand-600 transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Rating Row */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[11px] font-bold">
            <span>{Number(product.rating || 4.5).toFixed(1)}</span>
            <Star size={11} className="fill-amber-500 text-amber-500" />
          </div>
          <span className="text-[11px] text-slate-400">
            ({product.reviewCount || product.review_count || 120})
          </span>
        </div>

        {/* Price Row */}
        <div className="flex items-baseline gap-2 mt-auto pt-2">
          <span className="text-base sm:text-lg font-black text-slate-900">
            {formatPrice(product.price)}
          </span>
          {originalPrice > product.price && (
            <span className="text-xs text-slate-400 line-through">
              {formatPrice(originalPrice)}
            </span>
          )}
        </div>

        {/* Add to Cart / Quantity Selector */}
        <div className="pt-2">
          {!isAvailable ? (
            <button
              disabled
              className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-slate-100 text-slate-400 cursor-not-allowed"
            >
              Unavailable
            </button>
          ) : inCart ? (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-1">
              <button
                onClick={() => updateQty(product.id, Math.max(0, cartItem.quantity - 1))}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                -
              </button>
              <span className="text-xs font-bold text-slate-800">
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
