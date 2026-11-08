import { Link } from 'react-router-dom'
import { Heart, ShoppingBag, Trash2, ShoppingCart, ArrowRight } from 'lucide-react'
import { useWishlist } from '../../context/WishlistContext'
import { useCart } from '../../context/CartContext'
import { formatPrice } from '../../utils/format'
import StarRating from '../../components/common/StarRating'
import Badge from '../../components/common/Badge'

export default function WishlistPage() {
  const { items, toggle, count } = useWishlist()
  const { addItem, isInCart } = useCart()

  if (count === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-100 p-12 max-w-md mx-auto shadow-sm">
          <Heart size={56} className="text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">Your wishlist is empty</h2>
          <p className="text-xs text-slate-500 mt-2 mb-6">
            Save items you love by clicking the heart icon on any product card.
          </p>
          <Link
            to="/"
            className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors inline-block"
          >
            Discover Products
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            My Wishlist ({count} {count === 1 ? 'item' : 'items'})
          </h1>
          <p className="text-xs text-slate-500 mt-1">Saved products ready to add to your bag</p>
        </div>
        <Link
          to="/cart"
          className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1"
        >
          <span>View Cart</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {items.map(product => {
          const inCart = isInCart(product.id)
          return (
            <div
              key={product.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col group relative"
            >
              {/* Product Thumbnail */}
              <Link to={`/product/${product.slug}`} className="relative bg-slate-50 p-4 block">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-48 object-contain group-hover:scale-105 transition-transform duration-300"
                  onError={e => { e.currentTarget.src = 'https://placehold.co/300x300?text=Product' }}
                />
                {product.discount > 0 && (
                  <span className="absolute top-3 left-3 bg-brand-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {product.discount}% OFF
                  </span>
                )}
                <button
                  onClick={e => {
                    e.preventDefault()
                    toggle(product)
                  }}
                  className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-white text-slate-400 hover:text-red-500 rounded-full shadow-sm transition-colors"
                  aria-label="Remove from wishlist"
                >
                  <Trash2 size={16} />
                </button>
              </Link>

              {/* Product Body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <Badge label={product.badge} />
                  <Link to={`/product/${product.slug}`}>
                    <h3 className="font-semibold text-sm text-slate-800 line-clamp-2 hover:text-brand-600 transition-colors">
                      {product.name}
                    </h3>
                  </Link>
                  <p className="text-xs text-slate-400 capitalize">{product.category}</p>
                  <div className="pt-1">
                    <StarRating rating={product.rating} count={product.reviewCount} />
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-50">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold text-slate-900">
                      {formatPrice(product.price)}
                    </span>
                    {product.originalPrice > product.price && (
                      <span className="text-xs text-slate-400 line-through">
                        {formatPrice(product.originalPrice)}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => addItem(product)}
                    disabled={!product.inStock}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                      !product.inStock
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : inCart
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm'
                    }`}
                  >
                    <ShoppingCart size={14} />
                    {!product.inStock ? 'Out of Stock' : inCart ? 'Added to Cart' : 'Move to Cart'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
