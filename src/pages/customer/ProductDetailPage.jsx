import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Heart, ShoppingCart, Star, ShieldCheck, CheckCircle2,
  Truck, RotateCcw, Check, AlertCircle, ChevronRight,
  Zap, MapPin, MessageSquare, Plus, X, ChevronLeft, Video as VideoIcon, PlayCircle
} from 'lucide-react'
import {
  fetchProductBySlug,
  fetchFeaturedProducts,
  fetchProductReviews,
  submitProductReview
} from '../../services/productService'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'
import { useAuth } from '../../context/AuthContext'
import { formatPrice } from '../../utils/format'
import Badge from '../../components/common/Badge'
import ProductGrid from '../../components/products/ProductGrid'

export default function ProductDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { addItem, isInCart } = useCart()
  const { toggle, isWishlisted, isItemPending } = useWishlist()
  const { user, profile } = useAuth()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [related, setRelated] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [selectedVariant, setSelectedVariant] = useState(null)

  // PIN Code check
  const [pinCode, setPinCode] = useState('')
  const [deliveryEstimate, setDeliveryEstimate] = useState(null)
  const [pinError, setPinError] = useState('')

  // Reviews state
  const [reviews, setReviews] = useState([])
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [newRating, setNewRating] = useState(5)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewBody, setReviewBody] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewSuccess, setReviewSuccess] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const reviewSubmitLockRef = useRef(false)

  // Added to cart feedback toast
  const [addedToast, setAddedToast] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchProductBySlug(slug).then(({ data }) => {
      setProduct(data)
      const orderedImages = (data?.product_images || [])
        .slice()
        .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
      setSelectedImage(data?.image || orderedImages[0]?.image_url || null)
      setSelectedVideo(null)
      if (data?.product_variants && data.product_variants.length > 0) {
        setSelectedVariant(data.product_variants[0])
      }
      setLoading(false)

      // Fetch reviews by product UUID (falling back to name for demo mode)
      const reviewTarget = data?.id || data?.name
      if (reviewTarget) {
        fetchProductReviews(reviewTarget).then(({ data: revs }) => {
          setReviews(revs || [])
        })
      }
    })

    fetchFeaturedProducts().then(({ data }) => {
      setRelated((data || []).filter(p => p.slug !== slug).slice(0, 4))
    })
  }, [slug])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
          <div className="h-96 bg-slate-200 rounded-3xl" />
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
        <p className="text-slate-500 text-xs mt-1 mb-6">The item you are searching for does not exist or has been removed from catalog.</p>
        <Link to="/" className="text-brand-600 font-bold text-sm hover:underline">← Return to Storefront</Link>
      </div>
    )
  }

  const wishlisted = isWishlisted(product.id)
  const wishPending = isItemPending(product.id)
  const inCart = isInCart(product.id)
  const isAvailable = product.inStock !== false && product.is_active !== false

  // Variant adjustment
  const currentPrice = selectedVariant?.price !== undefined
    ? Number(selectedVariant.price)
    : (Number(product.price) + Number(selectedVariant?.price_delta || 0))
  const originalPrice = product.original_price || product.originalPrice || currentPrice
  const discountPercent = product.discount_percent || product.discount || (
    originalPrice > currentPrice ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0
  )

  const maxStock = product.stock !== undefined ? Number(product.stock) : 99

  function handleAddToCart() {
    addItem(product, quantity, selectedVariant)
    setAddedToast(true)
    setTimeout(() => setAddedToast(false), 3000)
  }

  function handleBuyNow() {
    addItem(product, quantity, selectedVariant)
    navigate('/checkout')
  }

  function handleCheckPin(e) {
    e.preventDefault()
    setPinError('')
    if (/^\d{6}$/.test(pinCode.trim())) {
      const deliveryDate = new Date()
      deliveryDate.setDate(deliveryDate.getDate() + 3)
      const dateFormatted = deliveryDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })
      setDeliveryEstimate(`Guaranteed Free Delivery by ${dateFormatted}`)
    } else {
      setPinError('Please enter a valid 6-digit Indian PIN code.')
      setDeliveryEstimate(null)
    }
  }

  async function handleReviewSubmit(e) {
    e.preventDefault()

    // Synchronous double-submission lock before React re-renders disabled button state
    if (reviewSubmitLockRef.current || reviewSubmitting) return

    setReviewError('')

    if (!reviewTitle.trim() || !reviewBody.trim()) {
      setReviewError('Please provide both a review headline and comments.')
      return
    }

    reviewSubmitLockRef.current = true
    setReviewSubmitting(true)
    const reviewerName = profile?.full_name || user?.email?.split('@')[0] || 'Verified Buyer'

    try {
      const { data: reviewData, error: submitErr } = await submitProductReview({
        productId: product.id,
        productName: product.name,
        userName: reviewerName,
        rating: newRating,
        title: reviewTitle.trim(),
        body: reviewBody.trim(),
      })

      if (submitErr || !reviewData) {
        setReviewError(submitErr?.message || 'Failed to submit review. Please try again.')
        return
      }

      setReviewSuccess(true)
      setReviewModalOpen(false)
      setReviewTitle('')
      setReviewBody('')
      setReviewError('')

      // Isolated review refresh: a refresh error must not turn a successful submission into a failure
      try {
        const refreshTarget = product?.id || product?.name
        const { data: updatedRevs } = await fetchProductReviews(refreshTarget)
        if (updatedRevs) setReviews(updatedRevs)
      } catch (refreshErr) {
        console.warn('[ProductDetailPage] Non-fatal error refreshing reviews:', refreshErr)
      }

      setTimeout(() => setReviewSuccess(false), 4000)
    } catch (err) {
      console.error('[ProductDetailPage] Exception during review submission:', err)
      setReviewError(err?.message || 'An unexpected error occurred while submitting your review.')
    } finally {
      reviewSubmitLockRef.current = false
      setReviewSubmitting(false)
    }
  }

  // Combined image and video gallery.
  const galleryMedia = [
    ...Array.from(new Set([
      product.image,
      ...((product.product_images || [])
        .slice()
        .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
        .map(img => img.image_url)),
    ].filter(Boolean))).map(url => ({ type: 'image', url, key: `image:${url}` })),
    ...((product.product_videos || [])
      .slice()
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((video, index) => ({
        type: video.video_type === 'youtube' ? 'youtube' : 'video',
        url: video.video_url,
        title: video.title || `Product video ${index + 1}`,
        key: `video:${video.id || video.video_url}`,
      }))),
  ]

  const selectedMediaIndex = Math.max(0, galleryMedia.findIndex(item =>
    selectedVideo ? item.url === selectedVideo : item.url === selectedImage
  ))
  const activeMedia = galleryMedia[selectedMediaIndex] || galleryMedia[0]

  function selectGalleryMedia(item) {
    if (item.type === 'image') {
      setSelectedImage(item.url)
      setSelectedVideo(null)
    } else {
      setSelectedVideo(item.url)
    }
  }

  function moveGallery(direction) {
    if (galleryMedia.length < 2) return
    const nextIndex = (selectedMediaIndex + direction + galleryMedia.length) % galleryMedia.length
    selectGalleryMedia(galleryMedia[nextIndex])
  }

  function getYouTubeEmbedUrl(url) {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
      const id = host === 'youtu.be'
        ? parsed.pathname.split('/').filter(Boolean)[0]
        : (parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1])
      return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null
    } catch {
      return null
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-10">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-brand-600 transition-colors">Home</Link>
        <ChevronRight size={14} />
        <Link to={`/category/${product.category?.toLowerCase()}`} className="hover:text-brand-600 capitalize">
          {product.category || 'Products'}
        </Link>
        <ChevronRight size={14} />
        <span className="text-slate-800 font-bold truncate max-w-sm">{product.name}</span>
      </nav>

      {/* Product Showcase: Gallery + Buy Box */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        {/* Gallery */}
        <div className="space-y-4">
          <div className="relative bg-white rounded-3xl border border-slate-200/80 p-8 flex items-center justify-center min-h-[420px] shadow-xs overflow-hidden">
            {activeMedia?.type === 'youtube' ? (
              <iframe
                key={activeMedia.url}
                src={getYouTubeEmbedUrl(activeMedia.url) || ''}
                title={activeMedia.title || `${product.name} video`}
                className="w-full aspect-video rounded-xl"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : activeMedia?.type === 'video' ? (
              <video
                key={activeMedia.url}
                src={activeMedia.url}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[380px] rounded-xl bg-black"
              >
                Your browser does not support HTML video.
              </video>
            ) : (
              <img
                src={activeMedia?.url || selectedImage || product.image}
                alt={product.name}
                className="max-h-[380px] w-full object-contain transition-all duration-300"
                onError={e => { e.currentTarget.src = 'https://placehold.co/400x400?text=Product+Image' }}
              />
            )}

            {galleryMedia.length > 1 && (
              <>
                <button type="button" onClick={() => moveGallery(-1)} aria-label="Previous product media" className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/95 border border-slate-200 shadow-md text-slate-700 hover:text-brand-600 flex items-center justify-center">
                  <ChevronLeft size={19} />
                </button>
                <button type="button" onClick={() => moveGallery(1)} aria-label="Next product media" className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/95 border border-slate-200 shadow-md text-slate-700 hover:text-brand-600 flex items-center justify-center">
                  <ChevronRight size={19} />
                </button>
                <span className="absolute bottom-3 right-3 z-10 rounded-full bg-slate-900/65 text-white text-[10px] font-semibold px-2.5 py-1">
                  {selectedMediaIndex + 1} / {galleryMedia.length}
                </span>
              </>
            )}

            {/* Discount Ribbon */}
            {discountPercent > 0 && (
              <span className="absolute top-4 left-4 bg-emerald-600 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-xs">
                {discountPercent}% OFF
              </span>
            )}

            {/* Wishlist Button */}
            <button
              onClick={() => {
                if (!wishPending) toggle(product)
              }}
              disabled={wishPending}
              aria-busy={wishPending}
              className={`absolute top-4 right-4 p-3 rounded-full border shadow-xs transition-colors ${
                wishPending ? 'opacity-60 cursor-wait' : 'cursor-pointer'
              } ${
                wishlisted
                  ? 'bg-red-50 text-red-500 border-red-200 shadow-sm'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-red-500'
              }`}
              aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Heart size={20} className={wishlisted ? 'fill-current' : ''} />
            </button>
          </div>

          {/* Image and video thumbnails */}
          {galleryMedia.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {galleryMedia.map((item, idx) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectGalleryMedia(item)}
                  aria-label={item.type === 'image' ? `Show product image ${idx + 1}` : `Play ${item.title || 'product video'}`}
                  className={`relative w-16 h-16 shrink-0 rounded-xl border p-1 bg-white transition-all cursor-pointer ${
                    idx === selectedMediaIndex ? 'border-brand-500 ring-2 ring-brand-300' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {item.type === 'image' ? (
                    <img src={item.url} alt={`Product thumbnail ${idx + 1}`} className="w-full h-full object-contain" />
                  ) : (
                    <span className="w-full h-full rounded-md bg-slate-900 text-white flex flex-col items-center justify-center gap-0.5">
                      <PlayCircle size={20} />
                      <span className="text-[8px] font-bold">VIDEO</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Details & Actions */}
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge label={product.badge || 'Verified Quality'} />
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                {product.category}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              {product.name}
            </h1>

            {/* Rating summary */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md text-xs font-bold border border-amber-200/60">
                <span>{Number(product.rating || 4.5).toFixed(1)}</span>
                <Star size={12} className="fill-amber-500 text-amber-500" />
              </div>
              <span className="text-xs text-slate-500">
                ({product.reviewCount || product.review_count || reviews.length || 148} customer ratings & reviews)
              </span>
            </div>
          </div>

          {/* Pricing Box */}
          <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl sm:text-4xl font-black text-slate-900">
                {formatPrice(currentPrice)}
              </span>
              {originalPrice > currentPrice && (
                <span className="text-base text-slate-400 line-through">
                  {formatPrice(originalPrice)}
                </span>
              )}
              {discountPercent > 0 && (
                <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Save {formatPrice(originalPrice - currentPrice)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">Inclusive of all taxes • Free nationwide shipping</p>
          </div>

          {/* Product Description */}
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {product.description || 'Engineered for exceptional daily performance, premium aesthetics, and long-lasting durability. Every detail is crafted with precision to deliver a first-class user experience.'}
          </p>

          {/* Variants (Storage / Color if configured) */}
          {product.product_variants && product.product_variants.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Select Option:</span>
              <div className="flex flex-wrap gap-2">
                {product.product_variants.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedVariant?.id === v.id
                        ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-300'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {v.name || (v.variant_value ? `${v.variant_type ? `${v.variant_type}: ` : ''}${v.variant_value}` : (v.color || v.size || 'Default'))}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stock & Quantity */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-700">Availability:</span>
              {isAvailable ? (
                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                  <Check size={14} /> In Stock & Dispatched in 24 Hours
                </span>
              ) : (
                <span className="text-red-500 font-bold">Currently Out of Stock</span>
              )}
            </div>

            {isAvailable && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700">Quantity:</span>
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="px-3 py-1.5 text-slate-600 font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    -
                  </button>
                  <span className="px-4 py-1.5 text-xs font-bold text-slate-900 bg-white">{quantity}</span>
                  <button
                    onClick={() => setQuantity(q => Math.min(maxStock, q + 1))}
                    className="px-3 py-1.5 text-slate-600 font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleAddToCart}
              disabled={!isAvailable}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer ${
                !isAvailable
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-600 text-white'
              }`}
            >
              <ShoppingCart size={17} />
              <span>{inCart ? 'Add More to Cart' : 'Add to Cart'}</span>
            </button>

            <button
              onClick={handleBuyNow}
              disabled={!isAvailable}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold text-xs sm:text-sm bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-all cursor-pointer disabled:opacity-40"
            >
              <Zap size={17} className="text-amber-400 fill-amber-400" />
              <span>Buy Now</span>
            </button>
          </div>

          {/* Added to cart toast */}
          {addedToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center justify-between animate-in fade-in">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Added {quantity} item(s) to your shopping cart!
              </span>
              <Link to="/cart" className="text-emerald-900 underline font-extrabold">
                View Cart →
              </Link>
            </div>
          )}

          {/* Delivery PIN Code Checker */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <MapPin size={15} className="text-brand-500" />
              <span>Check Estimated Delivery</span>
            </div>
            <form onSubmit={handleCheckPin} className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={pinCode}
                onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit PIN code"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
              >
                Check
              </button>
            </form>
            {deliveryEstimate && (
              <p className="text-emerald-700 font-bold text-[11px] pt-1">{deliveryEstimate}</p>
            )}
            {pinError && (
              <p className="text-red-600 text-[11px] pt-1">{pinError}</p>
            )}
          </div>

          {/* Trust Guarantees */}
          <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[11px] font-semibold text-slate-600">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center gap-1">
              <RotateCcw size={16} className="text-brand-500" />
              <span>7 Days Return</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center gap-1">
              <Truck size={16} className="text-brand-500" />
              <span>Free Delivery</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center gap-1">
              <ShieldCheck size={16} className="text-brand-500" />
              <span>1 Year Warranty</span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Specifications & Details Table */}
      <section className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 space-y-4 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">Product Specifications</h2>
        <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
          <div className="grid grid-cols-3 p-3 bg-slate-50 font-semibold text-slate-600">
            <span>Product Type</span>
            <span className="col-span-2 text-slate-900 font-normal">{product.category || 'Standard Goods'}</span>
          </div>
          <div className="grid grid-cols-3 p-3 font-semibold text-slate-600">
            <span>Model Name</span>
            <span className="col-span-2 text-slate-900 font-normal">{product.name}</span>
          </div>
          <div className="grid grid-cols-3 p-3 bg-slate-50 font-semibold text-slate-600">
            <span>Authenticity</span>
            <span className="col-span-2 text-slate-900 font-normal">100% Original Certified Manufacturer Unit</span>
          </div>
          <div className="grid grid-cols-3 p-3 font-semibold text-slate-600">
            <span>Warranty Period</span>
            <span className="col-span-2 text-slate-900 font-normal">1 Year Official Brand Warranty</span>
          </div>
          <div className="grid grid-cols-3 p-3 bg-slate-50 font-semibold text-slate-600">
            <span>Country of Origin</span>
            <span className="col-span-2 text-slate-900 font-normal">India</span>
          </div>
        </div>
      </section>

      {/* Customer Reviews & Feedback */}
      <section className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Customer Ratings & Reviews</h2>
            <p className="text-xs text-slate-500 mt-0.5">Real verified purchases from authentic customers</p>
          </div>
          <button
            onClick={() => setReviewModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Plus size={15} /> Write a Review
          </button>
        </div>

        {reviewSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>Thank you! Your product review has been submitted successfully.</span>
          </div>
        )}

        {reviews.length === 0 ? (
          <div className="py-8 text-center text-slate-400 space-y-2">
            <MessageSquare size={36} className="mx-auto text-slate-300" />
            <p className="text-xs text-slate-500">No customer reviews yet. Be the first to share your thoughts!</p>
          </div>
        ) : (
          <div className="space-y-4 divide-y divide-slate-100">
            {reviews.map(rev => (
              <div key={rev.id} className="pt-4 first:pt-0 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{rev.profiles?.full_name || rev.user_name || 'Verified Buyer'}</span>
                    <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-200">
                      Verified
                    </span>
                  </div>
                  <span className="text-slate-400 text-[11px]">
                    {rev.created_at
                      ? new Date(rev.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Recently'}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: rev.rating || 5 }).map((_, i) => (
                    <Star key={i} size={12} className="fill-amber-400" />
                  ))}
                </div>

                {rev.title && (
                  <h4 className="font-bold text-slate-800 text-xs">{rev.title}</h4>
                )}

                <p className="text-slate-600 leading-relaxed">{rev.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Related Products Grid */}
      {related.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Similar Products You Might Like</h2>
          <ProductGrid products={related} cols={4} />
        </section>
      )}

      {/* Write a Review Modal */}
      {reviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Write a Review</h3>
              <button
                type="button"
                onClick={() => {
                  setReviewModalOpen(false)
                  setReviewError('')
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {reviewError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={16} className="text-red-600 shrink-0" />
                <span>{reviewError}</span>
              </div>
            )}

            <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Your Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewRating(star)}
                      className="p-1 cursor-pointer"
                    >
                      <Star
                        size={22}
                        className={star <= newRating ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Headline / Title *</label>
                <input
                  type="text"
                  required
                  value={reviewTitle}
                  onChange={e => setReviewTitle(e.target.value)}
                  placeholder="e.g. Great sound quality & battery!"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Review Comments *</label>
                <textarea
                  required
                  rows={3}
                  value={reviewBody}
                  onChange={e => setReviewBody(e.target.value)}
                  placeholder="What did you like or dislike about this item?"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReviewModalOpen(false)
                    setReviewError('')
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
