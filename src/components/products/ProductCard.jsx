import { Heart, ShoppingCart, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import StarRating from '../common/StarRating'
import Badge from '../common/Badge'
import { formatPrice } from '../../utils/format'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'

/**
 * ProductCard — the core reusable card displayed across all product grids.
 * Receives a normalized product object (from service layer or sample data).
 */
export default function ProductCard({ product }) {
  const { addItem, isInCart }   = useCart()
  const { toggle, isWishlisted } = useWishlist()

  const wishlisted = isWishlisted(product.id)
  const inCart     = isInCart(product.id)

  return (
    <div className="group relative bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col">
      {/* Image */}
      <Link to={`/product/${product.slug}`} className="relative block overflow-hidden bg-slate-50">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-52 object-contain p-3 group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          onError={e => { e.currentTarget.src = 'https://placehold.co/400x300?text=No+Image' }}
        />

        {/* Discount ribbon */}
        {product.discount > 0 && (
          <span className="absolute top-2 left-2 bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {product.discount}% off
          </span>
        )}

        {/* Out of stock overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-sm font-semibold text-slate-500 bg-white px-3 py-1 rounded-full border">
              Out of Stock
            </span>
          </div>
        )}

        {/* Quick action buttons — appear on hover */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => { e.preventDefault(); toggle(product) }}
            className={`p-1.5 rounded-full shadow-md border transition-colors ${
              wishlisted
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-white text-slate-500 border-slate-200 hover:border-red-400 hover:text-red-500'
            }`}
            aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart size={14} className={wishlisted ? 'fill-current' : ''} />
          </button>
          <Link
            to={`/product/${product.slug}`}
            className="p-1.5 rounded-full shadow-md bg-white text-slate-500 border border-slate-200 hover:border-brand-400 hover:text-brand-500 transition-colors"
            aria-label="Quick view"
          >
            <Eye size={14} />
          </Link>
        </div>
      </Link>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 gap-1.5">
        {/* Badge */}
        <Badge label={product.badge} />

        {/* Name */}
        <Link to={`/product/${product.slug}`}>
          <h3 className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug hover:text-brand-600 transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Category */}
        <p className="text-xs text-slate-400">{product.category}</p>

        {/* Rating */}
        <StarRating rating={product.rating} count={product.reviewCount} />

        {/* Price row */}
        <div className="flex items-baseline gap-2 mt-auto pt-1">
          <span className="text-base font-bold text-slate-900">{formatPrice(product.price)}</span>
          {product.originalPrice > product.price && (
            <span className="text-xs text-slate-400 line-through">{formatPrice(product.originalPrice)}</span>
          )}
        </div>

        {/* Add to Cart */}
        <button
          onClick={() => addItem(product)}
          disabled={!product.inStock || inCart}
          className={`mt-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
            !product.inStock
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : inCart
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-brand-500 hover:bg-brand-600 text-white'
          }`}
        >
          <ShoppingCart size={15} />
          {!product.inStock ? 'Out of Stock' : inCart ? 'Added to Cart' : 'Add to Cart'}
        </button>
      </div>
    </div>
  )
}
