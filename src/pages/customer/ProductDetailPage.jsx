import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  Heart, ShoppingCart, Star, ShieldCheck, 
  Truck, RotateCcw, Check, AlertCircle, ChevronRight 
} from 'lucide-react'
import { fetchProductBySlug, fetchFeaturedProducts } from '../../services/productService'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'
import { formatPrice } from '../../utils/format'
import StarRating from '../../components/common/StarRating'
import Badge from '../../components/common/Badge'
import ProductGrid from '../../components/products/ProductGrid'

export default function ProductDetailPage() {
  const { slug } = useParams()
  const { addItem, isInCart } = useCart()
  const { toggle, isWishlisted } = useWishlist()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [related, setRelated] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    setLoading(true)
    fetchProductBySlug(slug).then(({ data }) => {
      setProduct(data)
      setSelectedImage(data?.image || null)
      setLoading(false)
    })

    fetchFeaturedProducts().then(({ data }) => {
      setRelated((data || []).filter(p => p.slug !== slug).slice(0, 4))
    })
  }, [slug])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
          <div className="h-96 bg-slate-200 rounded-2xl" />
          <div className="space-y-4">
            <div className="h-8 bg-slate-200 rounded w-3/4" />
            <div className="h-6 bg-slate-200 rounded w-1/4" />
            <div className="h-10 bg-slate-200 rounded w-1/2" />
            <div className="h-32 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
        <AlertCircle size={48} className="text-amber-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-800">Product Not Found</h2>
        <p className="text-slate-500 mt-1 mb-6">The item you are searching for does not exist or has been removed.</p>
        <Link to="/" className="text-brand-600 font-semibold hover:underline">← Back to shopping</Link>
      </div>
    )
  }

  const wishlisted = isWishlisted(product.id)
  const inCart = isInCart(product.id)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-12">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-brand-600">Home</Link>
        <ChevronRight size={14} />
        <span className="capitalize">{product.category || 'Product'}</span>
        <ChevronRight size={14} />
        <span className="text-slate-800 font-medium truncate max-w-xs">{product.name}</span>
      </nav>

      {/* Main product showcase */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Media / Images */}
        <div className="space-y-4">
          <div className="relative bg-white rounded-2xl border border-slate-100 p-6 flex items-center justify-center min-h-[400px]">
            <img
              src={selectedImage || product.image}
              alt={product.name}
              className="max-h-[380px] w-full object-contain"
              onError={e => { e.currentTarget.src = 'https://placehold.co/400x400?text=Product+Image' }}
            />
            {product.discount > 0 && (
              <span className="absolute top-4 left-4 bg-brand-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {product.discount}% OFF
              </span>
            )}
            <button
              onClick={() => toggle(product)}
              className={`absolute top-4 right-4 p-2.5 rounded-full border shadow-sm transition-colors ${
                wishlisted
                  ? 'bg-red-50 text-red-500 border-red-200'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-red-500'
              }`}
              aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart size={20} className={wishlisted ? 'fill-current' : ''} />
            </button>
          </div>
        </div>

        {/* Product Details */}
        <div className="flex flex-col space-y-5">
          <div>
            <Badge label={product.badge} />
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 leading-tight">
              {product.name}
            </h1>
            <p className="text-xs text-slate-400 mt-1">Category: <span className="text-slate-600 font-medium">{product.category}</span></p>
          </div>

          <div className="flex items-center gap-3">
            <StarRating rating={product.rating} count={product.reviewCount} size="md" />
            <span className="text-xs text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
              Verified Purchase
            </span>
          </div>

          <div className="border-y border-slate-100 py-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-slate-900">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice > product.price && (
                <span className="text-slate-400 line-through text-sm">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
              {product.discount > 0 && (
                <span className="text-sm font-semibold text-green-600">
                  Save {formatPrice(product.originalPrice - product.price)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">Inclusive of all taxes</p>
          </div>

          {/* Description */}
          <div className="text-sm text-slate-600 leading-relaxed">
            {product.description || 'Experience premium performance and superior reliability with this carefully crafted product designed for modern living.'}
          </div>

          {/* Stock status & quantity selector */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700">Status:</span>
              {product.inStock ? (
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <Check size={16} /> In Stock & Ready to Ship
                </span>
              ) : (
                <span className="text-red-500 font-medium">Currently Out of Stock</span>
              )}
            </div>

            {product.inStock && (
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-slate-700">Quantity:</span>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-semibold"
                  >
                    -
                  </button>
                  <span className="px-4 py-1 text-sm font-semibold text-slate-800">{quantity}</span>
                  <button
                    onClick={() => setQuantity(q => q + 1)}
                    className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-semibold"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action CTA */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              onClick={() => {
                for (let i = 0; i < quantity; i++) addItem(product)
              }}
              disabled={!product.inStock}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold transition-all ${
                !product.inStock
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : inCart
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-brand-500 hover:bg-brand-600 text-white shadow-md hover:shadow-lg'
              }`}
            >
              <ShoppingCart size={18} />
              {inCart ? 'Added to Cart' : 'Add to Cart'}
            </button>
            <button
              onClick={() => toggle(product)}
              className="py-3.5 px-6 rounded-xl border border-slate-200 hover:border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <Heart size={18} className={wishlisted ? 'fill-red-500 text-red-500' : ''} />
              {wishlisted ? 'Wishlisted' : 'Add to Wishlist'}
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="grid grid-cols-3 gap-2 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
            <div className="flex flex-col items-center gap-1 p-2">
              <Truck size={20} className="text-brand-500" />
              <span>Fast Delivery</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-2">
              <RotateCcw size={20} className="text-brand-500" />
              <span>7-Day Return</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-2">
              <ShieldCheck size={20} className="text-brand-500" />
              <span>100% Genuine</span>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <div className="pt-8 border-t border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Similar Products You Might Like</h2>
          <ProductGrid products={related} cols={4} />
        </div>
      )}
    </div>
  )
}
