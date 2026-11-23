import { Heart, ShoppingCart, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import Badge from '../common/Badge'
import { formatPrice } from '../../utils/format'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'
import './product-card-chocolate.css'

export default function ProductCard({ product, cardTheme }) {
  const { addItem, items, updateQty } = useCart()
  const { toggle, isWishlisted, isItemPending } = useWishlist()

  if (!product) return null

  const wishlisted = isWishlisted(product.id)
  const wishPending = isItemPending(product.id)
  const cartItem = items.find(i => i.id === product.id || i.cartItemId === product.id)
  const inCart = Boolean(cartItem)
  const isAvailable = product.inStock !== false && product.is_active !== false

  const discountPercent = Number(
    product.discount_percent ||
    product.discount ||
    (product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0)
  )

  const originalPrice = product.original_price || product.originalPrice || product.price
  const rating = Number(product.rating || 4.5).toFixed(1)

  return (
    <article className="product-card product-card--milk-chocolate group relative flex min-w-0 flex-col overflow-hidden rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className="product-card__image relative aspect-[5/3] w-full overflow-hidden p-2 sm:p-2.5">
        <Link to={`/product/${product.slug}`} className="flex h-full w-full items-center justify-center">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={e => { e.currentTarget.src = 'https://placehold.co/400x300?text=ShopKart' }}
          />
        </Link>

        {discountPercent > 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-1 text-[9px] font-extrabold leading-none text-white shadow-sm sm:text-[10px]">
            {discountPercent}% OFF
          </span>
        )}

        {!isAvailable && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700">
              Out of Stock
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            if (!wishPending) toggle(product)
          }}
          disabled={wishPending}
          aria-busy={wishPending}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          className={`absolute right-2 top-2 z-20 grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition hover:text-red-500 ${
            wishPending ? 'cursor-wait opacity-60' : 'cursor-pointer'
          } ${wishlisted ? 'text-red-500' : ''}`}
        >
          <Heart size={14} className={wishlisted ? 'fill-current' : ''} />
        </button>
      </div>

      <div className="product-card__content flex flex-1 flex-col gap-1.5 p-2.5 sm:p-3">
        <div className="flex min-w-0 items-center justify-between gap-1">
          <span className="product-card__category truncate text-[9px] font-bold uppercase tracking-wide sm:text-[10px]">
            {product.category || 'General'}
          </span>
          {product.badge && (
            <span className="max-w-[48%] truncate rounded-full bg-white/70 px-1.5 py-0.5 text-[8px] font-bold uppercase text-[#75472F]">
              {product.badge}
            </span>
          )}
        </div>

        <Link to={`/product/${product.slug}`} className="block min-h-[2.35rem]">
          <h3 className="product-card__title line-clamp-2 text-[11px] font-extrabold leading-[1.2rem] sm:text-xs">
            {product.name}
          </h3>
        </Link>

        <div className="flex items-center gap-1">
          <span className="product-card__rating inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-900">
            {rating}
            <Star size={9} className="fill-amber-500 text-amber-500" />
          </span>
        </div>

        <div className="mt-auto flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 pt-1">
          <span className="product-card__price text-xs font-black sm:text-sm">
            {formatPrice(product.price)}
          </span>
          {originalPrice > product.price && (
            <span className="product-card__original-price text-[9px] line-through sm:text-[10px]">
              {formatPrice(originalPrice)}
            </span>
          )}
        </div>

        <div className="pt-1">
          {!isAvailable ? (
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-lg bg-slate-200 px-2 py-2 text-[10px] font-bold text-slate-500"
            >
              Unavailable
            </button>
          ) : inCart ? (
            <div className="product-card__quantity flex items-center justify-between rounded-lg p-1">
              <button
                type="button"
                onClick={() => updateQty(product.id, Math.max(0, cartItem.quantity - 1))}
                aria-label="Decrease quantity"
                className="grid h-6 w-6 place-items-center rounded-md bg-white text-xs font-bold text-slate-700"
              >
                −
              </button>
              <span className="product-card__quantity-label text-[10px] font-bold">
                {cartItem.quantity} in Cart
              </span>
              <button
                type="button"
                onClick={() => updateQty(product.id, cartItem.quantity + 1)}
                aria-label="Increase quantity"
                className="grid h-6 w-6 place-items-center rounded-md bg-[#854B2B] text-xs font-bold text-white"
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => addItem(product)}
              className="product-card__add-button flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-extrabold text-white shadow-sm transition hover:shadow-md active:scale-[0.98] sm:text-[11px]"
            >
              <ShoppingCart size={12} />
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
