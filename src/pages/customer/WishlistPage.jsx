import { Link } from 'react-router-dom'
import { Heart, Trash2, ShoppingCart, ArrowRight, ShoppingBag } from 'lucide-react'
import { useWishlist } from '../../context/WishlistContext'
import { useCart } from '../../context/CartContext'
import { formatPrice } from '../../utils/format'

export default function WishlistPage() {
  const { items, toggle, count } = useWishlist()
  const { addItem, isInCart } = useCart()

  function handleMoveToCart(product) {
    addItem(product)
    toggle(product) // remove from wishlist
  }

  function handleAddAllToCart() {
    items.forEach(p => {
      addItem(p)
      toggle(p)
    })
  }

  if (count === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            My Wishlist ({count} {count === 1 ? 'item' : 'items'})
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Your saved items are synced and saved</p>
        </div>

        <button
          onClick={handleAddAllToCart}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <ShoppingCart size={15} />
          <span>Move All to Cart</span>
        </button>
      </div>

      {/* Grid of Wishlist Items */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map(product => {
          const inCart = isInCart(product.id)
          const isAvailable = product.inStock !== false && product.is_active !== false

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
                  onClick={() => toggle(product)}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/90 text-slate-400 hover:text-red-600 shadow-xs border border-slate-200 transition-colors cursor-pointer"
                  title="Remove from wishlist"
                >
                  <Trash2 size={14} />
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
                  disabled={!isAvailable}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer mt-2 ${
                    !isAvailable
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : inCart
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-brand-500 hover:bg-brand-600 text-white shadow-xs'
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
