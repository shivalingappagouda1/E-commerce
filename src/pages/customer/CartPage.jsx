import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, ShoppingBag, ArrowRight, ShieldCheck, Tag } from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { formatPrice } from '../../utils/format'

export default function CartPage() {
  const { items, updateQty, removeItem, clearCart, totalPrice, totalItems } = useCart()
  const [coupon, setCoupon] = useState('')
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponError, setCouponError] = useState('')

  // Savings calculation
  const originalTotalPrice = items.reduce((sum, item) => {
    const orig = item.originalPrice || item.price
    return sum + orig * item.quantity
  }, 0)
  const totalSavings = originalTotalPrice - totalPrice

  const discountAmount = couponApplied ? Math.round(totalPrice * 0.1) : 0
  const finalTotal = Math.max(0, totalPrice - discountAmount)

  function handleApplyCoupon(e) {
    e.preventDefault()
    setCouponError('')
    if (coupon.trim().toUpperCase() === 'SHOPKART10') {
      setCouponApplied(true)
    } else {
      setCouponError('Invalid coupon code. Try SHOPKART10 for 10% off.')
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-100 p-12 max-w-md mx-auto shadow-sm">
          <ShoppingBag size={56} className="text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">Your cart is empty</h2>
          <p className="text-xs text-slate-500 mt-2 mb-6">
            Looks like you haven't added anything to your cart yet.
          </p>
          <Link
            to="/"
            className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors inline-block"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          Shopping Cart ({totalItems} {totalItems === 1 ? 'item' : 'items'})
        </h1>
        <button
          onClick={clearCart}
          className="text-xs text-slate-400 hover:text-red-600 transition-colors"
        >
          Clear Cart
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Cart Item List */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 flex flex-col sm:flex-row items-center gap-4 shadow-sm"
            >
              {/* Product Thumbnail */}
              <Link to={`/product/${item.slug}`} className="flex-shrink-0 bg-slate-50 p-2 rounded-xl">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 sm:w-24 sm:h-24 object-contain"
                  onError={e => { e.currentTarget.src = 'https://placehold.co/100x100?text=Product' }}
                />
              </Link>

              {/* Info */}
              <div className="flex-1 space-y-1 text-center sm:text-left">
                <Link to={`/product/${item.slug}`}>
                  <h3 className="font-semibold text-slate-800 text-sm hover:text-brand-600 line-clamp-1 transition-colors">
                    {item.name}
                  </h3>
                </Link>
                <p className="text-xs text-slate-400 capitalize">{item.category}</p>
                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                  <span className="font-bold text-slate-900 text-base">
                    {formatPrice(item.price)}
                  </span>
                  {item.originalPrice > item.price && (
                    <span className="text-xs text-slate-400 line-through">
                      {formatPrice(item.originalPrice)}
                    </span>
                  )}
                  {item.discount > 0 && (
                    <span className="text-xs font-semibold text-green-600">
                      {item.discount}% off
                    </span>
                  )}
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => updateQty(item.id, item.quantity - 1)}
                    className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-semibold"
                  >
                    -
                  </button>
                  <span className="px-3 py-1 text-sm font-bold text-slate-800">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.id, item.quantity + 1)}
                    className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-semibold"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Remove item"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
          <h2 className="font-bold text-slate-800 text-base border-b border-slate-100 pb-3">
            Price Details
          </h2>

          <div className="space-y-3 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Price ({totalItems} items)</span>
              <span>{formatPrice(originalTotalPrice)}</span>
            </div>
            {totalSavings > 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Discount</span>
                <span>- {formatPrice(totalSavings)}</span>
              </div>
            )}
            {couponApplied && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Coupon (SHOPKART10)</span>
                <span>- {formatPrice(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Delivery Charges</span>
              <span className="text-green-600 font-semibold">FREE</span>
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-sm text-slate-900">
              <span>Total Amount</span>
              <span>{formatPrice(finalTotal)}</span>
            </div>
          </div>

          {totalSavings > 0 && (
            <p className="text-xs text-green-700 font-semibold bg-green-50 p-2.5 rounded-lg text-center">
              You will save {formatPrice(totalSavings + discountAmount)} on this order!
            </p>
          )}

          {/* Coupon Input Form */}
          <form onSubmit={handleApplyCoupon} className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={coupon}
                  onChange={e => setCoupon(e.target.value)}
                  placeholder="Coupon code (e.g. SHOPKART10)"
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 uppercase"
                />
              </div>
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-3 py-2 rounded-lg transition-colors"
              >
                Apply
              </button>
            </div>
            {couponError && <p className="text-[11px] text-red-500">{couponError}</p>}
            {couponApplied && <p className="text-[11px] text-green-600 font-semibold">10% discount applied!</p>}
          </form>

          {/* Checkout CTA */}
          <Link
            to="/checkout"
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight size={16} />
          </Link>

          <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[11px] pt-2">
            <ShieldCheck size={14} /> Safe & Secure Payments
          </div>
        </div>
      </div>
    </div>
  )
}
