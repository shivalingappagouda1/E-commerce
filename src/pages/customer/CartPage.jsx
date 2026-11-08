import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Trash2, ShoppingBag, ArrowRight, ShieldCheck, Tag,
  Heart, Truck, ArrowLeft, CheckCircle2, AlertCircle
} from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'
import { formatPrice } from '../../utils/format'

const FREE_SHIPPING_THRESHOLD = 999
const STANDARD_SHIPPING_FEE = 99

export default function CartPage() {
  const navigate = useNavigate()
  const { items, updateQty, removeItem, clearCart, totalPrice, originalTotalPrice, totalSavings, totalItems } = useCart()
  const { toggle: toggleWishlist, isWishlisted } = useWishlist()

  // Coupon state
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponError, setCouponError] = useState('')
  const [couponSuccess, setCouponSuccess] = useState('')

  // Free shipping calculation
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - totalPrice)
  const isFreeShipping = totalPrice >= FREE_SHIPPING_THRESHOLD
  const shippingFee = isFreeShipping || items.length === 0 ? 0 : STANDARD_SHIPPING_FEE

  // Coupon calculation
  let couponDiscount = 0
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percent') {
      couponDiscount = Math.round((totalPrice * appliedCoupon.value) / 100)
    } else if (appliedCoupon.type === 'fixed') {
      couponDiscount = Math.min(totalPrice, appliedCoupon.value)
    }
  }

  const finalTotal = Math.max(0, totalPrice - couponDiscount + shippingFee)

  function handleApplyCoupon(e) {
    e.preventDefault()
    setCouponError('')
    setCouponSuccess('')

    const code = couponCode.trim().toUpperCase()
    if (!code) return

    // Validate coupons
    if (code === 'SHOPKART10') {
      if (totalPrice < 999) {
        setCouponError('SHOPKART10 requires a minimum order of ₹999.')
        return
      }
      setAppliedCoupon({ code: 'SHOPKART10', type: 'percent', value: 10 })
      setCouponSuccess('Coupon SHOPKART10 applied! 10% discount added.')
    } else if (code === 'WELCOME500') {
      if (totalPrice < 4999) {
        setCouponError('WELCOME500 requires a minimum order of ₹4,999.')
        return
      }
      setAppliedCoupon({ code: 'WELCOME500', type: 'fixed', value: 500 })
      setCouponSuccess('Coupon WELCOME500 applied! ₹500 discount added.')
    } else {
      setCouponError('Invalid coupon code. Try SHOPKART10 or WELCOME500.')
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponSuccess('')
    setCouponError('')
  }

  function handleMoveToWishlist(item) {
    if (!isWishlisted(item.id)) {
      toggleWishlist(item)
    }
    removeItem(item.id)
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 max-w-md mx-auto shadow-sm space-y-4">
          <div className="w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center mx-auto text-brand-500">
            <ShoppingBag size={38} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Your Shopping Cart is Empty</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Explore our trending tech, fashion & home collections and add items to your bag.
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
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Shopping Cart ({totalItems} {totalItems === 1 ? 'item' : 'items'})
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Review items before proceeding to secure checkout</p>
        </div>

        <button
          onClick={clearCart}
          className="text-xs font-semibold text-slate-400 hover:text-red-600 transition-colors self-start sm:self-auto cursor-pointer"
        >
          Clear All Items
        </button>
      </div>

      {/* Free Shipping Progress Meter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-1.5 text-slate-800">
            <Truck size={16} className="text-brand-500" />
            <span>{isFreeShipping ? '🎉 You qualify for FREE Delivery!' : `Add ${formatPrice(amountToFreeShipping)} more to get FREE Delivery!`}</span>
          </div>
          <span className="text-brand-600 font-extrabold">{isFreeShipping ? 'FREE' : formatPrice(STANDARD_SHIPPING_FEE)}</span>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-brand-500 to-emerald-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.round((totalPrice / FREE_SHIPPING_THRESHOLD) * 100))}%` }}
          />
        </div>
      </div>

      {/* Cart Grid: Items List (Col 2) + Price Summary (Col 1) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => {
            const itemKey = item.cartItemId || item.id
            const itemSavings = (item.originalPrice && item.originalPrice > item.price)
              ? (item.originalPrice - item.price) * item.quantity
              : 0

            return (
              <div
                key={itemKey}
                className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center gap-4 transition-all"
              >
                {/* Product Thumbnail */}
                <Link
                  to={`/product/${item.slug}`}
                  className="w-24 h-24 sm:w-28 sm:h-28 bg-slate-50 p-2 rounded-2xl shrink-0 flex items-center justify-center border border-slate-100"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="max-h-full max-w-full object-contain"
                    onError={e => { e.currentTarget.src = 'https://placehold.co/100x100?text=Product' }}
                  />
                </Link>

                {/* Details */}
                <div className="flex-1 min-w-0 space-y-1.5 text-center sm:text-left w-full">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {item.category || 'Goods'}
                    </span>
                    {item.variant && (
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold">
                        {item.variant.name || item.variant.color || item.variant.size}
                      </span>
                    )}
                  </div>

                  <Link to={`/product/${item.slug}`}>
                    <h3 className="font-bold text-slate-900 text-sm hover:text-brand-600 line-clamp-1 transition-colors">
                      {item.name}
                    </h3>
                  </Link>

                  {/* Price */}
                  <div className="flex items-baseline justify-center sm:justify-start gap-2 pt-0.5">
                    <span className="font-black text-slate-900 text-base">
                      {formatPrice(item.price)}
                    </span>
                    {item.originalPrice > item.price && (
                      <span className="text-xs text-slate-400 line-through">
                        {formatPrice(item.originalPrice)}
                      </span>
                    )}
                    {itemSavings > 0 && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        Save {formatPrice(itemSavings)}
                      </span>
                    )}
                  </div>

                  {/* Quantity & Actions Bar */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 mt-2">
                    {/* Stepper */}
                    <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                      <button
                        onClick={() => updateQty(itemKey, Math.max(1, item.quantity - 1))}
                        className="px-2.5 py-1 text-slate-600 font-bold hover:bg-slate-200 transition-colors cursor-pointer text-xs"
                      >
                        -
                      </button>
                      <span className="px-3 py-1 text-xs font-bold text-slate-900 bg-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(itemKey, item.quantity + 1)}
                        className="px-2.5 py-1 text-slate-600 font-bold hover:bg-slate-200 transition-colors cursor-pointer text-xs"
                      >
                        +
                      </button>
                    </div>

                    {/* Secondary Actions */}
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        onClick={() => handleMoveToWishlist(item)}
                        className="text-slate-500 hover:text-brand-600 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Heart size={13} /> Save for later
                      </button>
                      <button
                        onClick={() => removeItem(itemKey)}
                        className="text-slate-400 hover:text-red-600 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="pt-2 flex items-center justify-between text-xs">
            <Link to="/" className="inline-flex items-center gap-1.5 font-bold text-brand-600 hover:underline">
              <ArrowLeft size={14} /> Continue Shopping
            </Link>
          </div>
        </div>

        {/* Right Column: Order Summary & Checkout */}
        <div className="space-y-4">
          {/* Promo Coupon Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Tag size={15} className="text-brand-500" />
              <span>Apply Discount Coupon</span>
            </div>

            {appliedCoupon ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-emerald-800 uppercase">{appliedCoupon.code}</span>
                  <p className="text-[11px] text-emerald-600">
                    {appliedCoupon.type === 'percent' ? `${appliedCoupon.value}% discount applied` : `₹${appliedCoupon.value} off applied`}
                  </p>
                </div>
                <button
                  onClick={handleRemoveCoupon}
                  className="text-emerald-800 hover:text-red-600 font-bold text-xs cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyCoupon} className="flex gap-2 text-xs">
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value)}
                  placeholder="e.g. SHOPKART10"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 uppercase font-semibold"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Apply
                </button>
              </form>
            )}

            {couponError && (
              <p className="text-red-600 text-[11px] font-semibold">{couponError}</p>
            )}
            {couponSuccess && !appliedCoupon && (
              <p className="text-emerald-600 text-[11px] font-semibold">{couponSuccess}</p>
            )}

            <div className="text-[10px] text-slate-400 space-y-0.5 pt-1">
              <p>• Use <strong>SHOPKART10</strong> for 10% off (orders ₹999+)</p>
              <p>• Use <strong>WELCOME500</strong> for ₹500 off (orders ₹4,999+)</p>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Order Summary
            </h2>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Total MRP ({totalItems} items)</span>
                <span>{formatPrice(originalTotalPrice || totalPrice)}</span>
              </div>

              {totalSavings > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Product Savings</span>
                  <span>- {formatPrice(totalSavings)}</span>
                </div>
              )}

              {appliedCoupon && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Coupon ({appliedCoupon.code})</span>
                  <span>- {formatPrice(couponDiscount)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>Shipping Fee</span>
                <span>
                  {isFreeShipping ? (
                    <span className="text-emerald-600 font-bold">FREE</span>
                  ) : (
                    formatPrice(shippingFee)
                  )}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline text-slate-900">
                <span className="text-sm font-bold">Total Amount</span>
                <span className="text-xl font-black text-brand-600">{formatPrice(finalTotal)}</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/checkout')}
              className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-brand-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight size={16} />
            </button>

            <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Safe & Secure 256-Bit Encrypted Payments</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
