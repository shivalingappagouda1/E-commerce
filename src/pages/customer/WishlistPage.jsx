import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Trash2, ShoppingCart, ArrowRight, AlertCircle, X, Loader2 } from 'lucide-react'
import { useWishlist } from '../../context/WishlistContext'
import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  isValidUUID,
  moveWishlistItemToCart,
  moveAllWishlistItemsToCart,
} from '../../utils/wishlistHelpers'
import { formatPrice } from '../../utils/format'

export default function WishlistPage() {
  const { items, removeItem, clearWishlist, isItemPending, count, loading, error, clearError } = useWishlist()
  const { addItem, isInCart } = useCart()
  const { user } = useAuth()
  const [moveError, setMoveError] = useState('')
  const [movingBulk, setMovingBulk] = useState(false)

  function isCartEligible(product) {
    return !(isSupabaseConfigured && !isValidUUID(product?.id))
  }

  async function handleMoveToCart(product) {
    if (!product?.id || isItemPending(product.id) || movingBulk) return
    setMoveError('')
    const result = await moveWishlistItemToCart(product, {
      addToCartFn: addItem,
      removeFromWishlistFn: removeItem,
    })
    if (!result.ok && result.error) {
      setMoveError(result.error)
    }
  }

  async function handleAddAllToCart() {
    if (loading || movingBulk || items.length === 0) return
    setMoveError('')
    setMovingBulk(true)
    try {
      const result = await moveAllWishlistItemsToCart(items, {
        addToCartFn: addItem,
        removeFromWishlistFn: removeItem,
        clearWishlistFn: clearWishlist,
      })
      if (result.error) {
        setMoveError(result.error)
      }
    } finally {
      setMovingBulk(false)
    }
  }

  const activeError = error || moveError
  function handleDismissError() {
    setMoveError('')
    clearError()
  }

  const errorBanner = activeError ? (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 shadow-xs"
    >
      <div className="flex items-center gap-2">
        <AlertCircle size={15} className="shrink-0 text-red-500" />
        <span className="font-medium">{activeError}</span>
      </div>
      <button
        type="button"
        onClick={handleDismissError}
        aria-label="Dismiss wishlist error"
        className="text-red-400 hover:text-red-700 transition-colors cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  ) : null

  if (loading && count === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="h-8 w-56 rounded-lg bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((skeleton) => (
            <div key={skeleton} className="bg-white rounded-3xl border border-slate-200/80 p-4 space-y-3">
              <div className="aspect-square rounded-2xl bg-slate-100 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-slate-200 animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-slate-200 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (count === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center space-y-6">
        {errorBanner && <div className="max-w-md mx-auto text-left">{errorBanner}</div>}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 max-w-md mx-auto shadow-xs space-y-4">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto text-red-500">
            <Heart size={38} className="fill-red-500/20" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Your Wishlist is Empty</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Save your favorite items here while exploring our products. Tap the heart icon on any product to save it.
            </p>
          </div>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-xs transition-colors"
            >
              <span>Explore Products</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const syncSubtitle = user
    ? isSupabaseConfigured
      ? 'Saved to your account wishlist'
      : 'Saved to your session wishlist'
    : 'Saved on this device — sign in to sync to your account'

  const hasEligibleCartItems = items.some((p) => p?.id && isCartEligible(p))

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {errorBanner}

      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            My Wishlist ({count} {count === 1 ? 'item' : 'items'})
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{syncSubtitle}</p>
        </div>

        <button
          onClick={handleAddAllToCart}
          disabled={!hasEligibleCartItems || loading || movingBulk}
          aria-busy={movingBulk}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          {movingBulk ? <Loader2 size={15} className="animate-spin" /> : <ShoppingCart size={15} />}
          <span>{movingBulk ? 'Moving to Cart...' : 'Move All to Cart'}</span>
        </button>
      </div>

      {/* Grid of Wishlist Items */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map(product => {
          const inCart = isInCart(product.id)
          const isAvailable = product.inStock !== false && product.is_active !== false
          const itemPending = isItemPending(product.id)
          const cartEligible = isCartEligible(product)

          return (
            <div
              key={product.id}
              className="group bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden relative"
            >
              {/* Image */}
              <div className="relative aspect-square w-full bg-slate-50/80 p-4 flex items-center justify-center">
                <Link to={`/product/${product.slug}`} className="w-full h-full flex items-center justify-center">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                    onError={e => { e.currentTarget.src = 'https://placehold.co/200x200?text=Product' }}
                  />
                </Link>

                {/* Remove button */}
                <button
                  onClick={() => removeItem(product.id)}
                  disabled={itemPending}
                  aria-busy={itemPending}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/90 text-slate-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-wait shadow-xs border border-slate-200 transition-colors cursor-pointer"
                  title="Remove from wishlist"
                  aria-label="Remove from wishlist"
                >
                  {itemPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>

              {/* Info */}
              <div className="p-4 flex flex-col flex-1 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {product.category || 'Goods'}
                </span>

                <Link to={`/product/${product.slug}`}>
                  <h3 className="font-bold text-xs text-slate-900 hover:text-brand-600 line-clamp-2 leading-snug">
                    {product.name}
                  </h3>
                </Link>

                <div className="flex items-baseline gap-2 mt-auto pt-1">
                  <span className="font-black text-slate-900 text-sm">
                    {formatPrice(product.price)}
                  </span>
                  {product.originalPrice > product.price && (
                    <span className="text-xs text-slate-400 line-through">
                      {formatPrice(product.originalPrice)}
                    </span>
                  )}
                </div>

                {/* Move to Cart */}
                <button
                  onClick={() => handleMoveToCart(product)}
                  disabled={!isAvailable || !cartEligible || itemPending || movingBulk}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors mt-2 ${
                    !isAvailable || !cartEligible || itemPending || movingBulk
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : inCart
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer'
                      : 'bg-brand-500 hover:bg-brand-600 text-white shadow-xs cursor-pointer'
                  }`}
                >
                  <ShoppingCart size={13} />
                  <span>{inCart ? 'Already in Cart' : 'Move to Cart'}</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
