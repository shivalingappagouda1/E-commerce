import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Plus,
  ShieldCheck,
  Truck,
  Banknote,
  AlertCircle,
  ArrowLeft,
  Tag,
  CheckCircle2,
  X,
  Lock,
  QrCode,
} from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import { fetchAddresses, createAddress, placeOrder } from '../../services/orderService'
import { validateCoupon } from '../../services/productService'
import { formatPrice } from '../../utils/format'

const FREE_SHIPPING_THRESHOLD = 999
const SHIPPING_FEE = 99

function generateIdempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export default function CheckoutPage({ initialItems = null } = {}) {
  const navigate = useNavigate()
  const cart = useCart()
  const items = initialItems || cart.items
  const rawTotalPrice = initialItems
    ? initialItems.reduce((acc, i) => acc + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0)
    : cart.totalPrice
  const totalPrice = rawTotalPrice
  const totalItems = initialItems
    ? initialItems.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0)
    : cart.totalItems
  const {
    clearCart,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    couponDiscount,
  } = cart
  const { user } = useAuth()

  const [addresses, setAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [loadingAddresses, setLoadingAddresses] = useState(true)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Idempotency Key Lifecycle:
  // Persisted in sessionStorage so the same attempt key survives a page refresh.
  // Regenerates only when order inputs genuinely change or after a confirmed order.
  // useRef-based synchronous submission lock prevents double-click / React-batching races.
  const submittingRef = useRef(false)

  const sortedItemsFingerprint = [...items]
    .map(i => {
      const pId = i.product_id || i.productId || i.id || ''
      const vId = i.variant_id || i.variantId || 'null'
      const qty = i.quantity || 1
      return `${pId}:${vId}:${qty}`
    })
    .sort()
    .join(',')

  const orderFingerprint = `${selectedAddressId || ''}|${paymentMethod || 'cod'}|${appliedCoupon?.code ? appliedCoupon.code.toUpperCase().trim() : ''}|${sortedItemsFingerprint}`
  const prevFingerprintRef = useRef(null)

  const [checkoutAttemptKey, setCheckoutAttemptKey] = useState(() => {
    try {
      const stored = sessionStorage.getItem('shopkart_checkout_attempt')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.idempotencyKey) return parsed.idempotencyKey
      }
    } catch {}
    return generateIdempotencyKey()
  })

  // Synchronize idempotency key with order fingerprint changes
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('shopkart_checkout_attempt')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.fingerprint === orderFingerprint && parsed?.idempotencyKey) {
          if (parsed.idempotencyKey !== checkoutAttemptKey) {
            setCheckoutAttemptKey(parsed.idempotencyKey)
          }
          prevFingerprintRef.current = orderFingerprint
          return
        }
      }
    } catch {}

    if (prevFingerprintRef.current !== null && prevFingerprintRef.current !== orderFingerprint) {
      const newKey = generateIdempotencyKey()
      setCheckoutAttemptKey(newKey)
      try {
        sessionStorage.setItem('shopkart_checkout_attempt', JSON.stringify({
          fingerprint: orderFingerprint,
          idempotencyKey: newKey,
        }))
      } catch {}
    } else {
      try {
        sessionStorage.setItem('shopkart_checkout_attempt', JSON.stringify({
          fingerprint: orderFingerprint,
          idempotencyKey: checkoutAttemptKey,
        }))
      } catch {}
    }
    prevFingerprintRef.current = orderFingerprint
  }, [orderFingerprint, checkoutAttemptKey])

  // Coupon UI feedback state
  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState('')
  const [couponSuccess, setCouponSuccess] = useState('')

  // New address form state
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
  })

  useEffect(() => {
    fetchAddresses().then(({ data }) => {
      setAddresses(data || [])
      if (data && data.length > 0) {
        const defaultAddr = data.find(a => a.is_default) || data[0]
        setSelectedAddressId(defaultAddr.id)
      } else {
        setShowAddressForm(true)
      }
      setLoadingAddresses(false)
    })
  }, [])

  // Shipping calculation
  const shippingFee = totalPrice >= FREE_SHIPPING_THRESHOLD || totalPrice === 0 ? 0 : SHIPPING_FEE

  const finalPayable = Math.max(0, totalPrice - couponDiscount + shippingFee)

  async function handleApplyCoupon(e) {
    e.preventDefault()
    setCouponError('')
    setCouponSuccess('')

    const code = couponCode.trim().toUpperCase()
    if (!code) return

    const result = await validateCoupon(code, totalPrice)
    if (!result.valid) {
      setCouponError(result.error)
      return
    }

    applyCoupon(result.coupon)
    const discountText = result.coupon.type === 'percent'
      ? `${result.coupon.value}% discount applied!`
      : `₹${result.coupon.value} discount applied!`
    setCouponSuccess(discountText)
  }

  function handleRemoveCoupon() {
    removeCoupon()
    setCouponCode('')
    setCouponSuccess('')
    setCouponError('')
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-3xl border border-slate-200/80 p-10 max-w-md mx-auto shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Your cart is empty</h2>
          <p className="text-xs text-slate-500">You need at least one item in your cart to proceed with checkout.</p>
          <Link
            to="/"
            className="inline-block bg-brand-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl hover:bg-brand-600 transition-colors shadow-md"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    )
  }

  async function handleAddAddress(e) {
    e.preventDefault()
    setError('')
    if (!formData.full_name || !formData.phone || !formData.line1 || !formData.city || !formData.state || !formData.pincode) {
      setError('Please fill in all required address fields.')
      return
    }

    const { data: newAddr, error: addrError } = await createAddress(formData)
    if (addrError) {
      setError(addrError.message || 'Failed to save address')
      return
    }

    if (newAddr) {
      setAddresses(prev => [newAddr, ...prev])
      setSelectedAddressId(newAddr.id)
      setShowAddressForm(false)
      setFormData({
        full_name: '',
        phone: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        pincode: '',
      })
    }
  }

  async function handlePlaceOrder() {
    // Synchronous ref-based guard prevents double-clicks and React-batching races.
    // This fires before any await, making it race-condition-safe unlike useState.
    if (submittingRef.current) return
    submittingRef.current = true

    setError('')
    setSubmitting(true)

    if (!selectedAddressId) {
      setError('Please select or add a delivery address.')
      setSubmitting(false)
      submittingRef.current = false
      return
    }

    const chosenAddress = addresses.find(a => a.id === selectedAddressId)

    try {
      const { data: orderResult, error: orderError } = await placeOrder({
        addressId: selectedAddressId,
        notes: `Payment method: ${paymentMethod.toUpperCase()}${appliedCoupon ? ` | Coupon: ${appliedCoupon.code}` : ''}`,
        couponCode: appliedCoupon?.code || null,
        paymentProvider: paymentMethod,
        idempotencyKey: checkoutAttemptKey,
        cartItems: items,
        subtotal: totalPrice,
        discountAmount: couponDiscount,
        shippingAmount: shippingFee,
        totalAmount: finalPayable,
        address: chosenAddress,
      })

      if (orderError) {
        setError(orderError.message || 'Failed to place order. Please try again.')
        return
      }

      // Rotate the idempotency key and clear sessionStorage only after confirmed success
      const nextKey = generateIdempotencyKey()
      setCheckoutAttemptKey(nextKey)
      try { sessionStorage.removeItem('shopkart_checkout_attempt') } catch {}
      clearCart()
      navigate(`/order-success/${orderResult.id}`)
    } catch (unexpected) {
      setError('An unexpected error occurred. Please try again.')
      console.error('[CheckoutPage] Unexpected error in handlePlaceOrder:', unexpected)
    } finally {
      // Always release the submission lock so the UI recovers from any path
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  // Estimated delivery preview
  const estDate = new Date()
  estDate.setDate(estDate.getDate() + 4)
  const estDateStr = estDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/cart"
          className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          title="Back to Cart"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Secure Checkout
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
              <Lock size={12} /> 256-Bit SSL
            </span>
          </h1>
          <p className="text-xs text-slate-500">Review your order, address, and payment method</p>
        </div>
      </div>

      {/* Supabase unauthenticated warning banner */}
      {isSupabaseConfigured && !user && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold">Sign In Required for Secure Checkout</p>
              <p className="text-[11px] text-amber-700">Please sign in to your ShopKart account to register your delivery address and save your order.</p>
            </div>
          </div>
          <Link
            to="/login"
            state={{ from: '/checkout' }}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors shrink-0 shadow-xs"
          >
            Sign In to Checkout
          </Link>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3.5 flex items-center gap-2.5 shadow-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Delivery Address & Payment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Delivery Address */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">1</span>
                <span>Select Delivery Address</span>
              </h2>
              {!showAddressForm && (
                <button
                  onClick={() => setShowAddressForm(true)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={14} /> Add New Address
                </button>
              )}
            </div>

            {loadingAddresses ? (
              <div className="h-28 bg-slate-100 rounded-2xl animate-pulse" />
            ) : showAddressForm ? (
              <form onSubmit={handleAddAddress} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Receiver name"
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="10-digit mobile number"
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Address (House / Flat / Street) *</label>
                  <input
                    type="text"
                    required
                    value={formData.line1}
                    onChange={e => setFormData({ ...formData, line1: e.target.value })}
                    placeholder="e.g. Flat 301, Sunshine Heights"
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">City / District *</label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">State *</label>
                    <input
                      type="text"
                      required
                      value={formData.state}
                      onChange={e => setFormData({ ...formData, state: e.target.value })}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Code *</label>
                    <input
                      type="text"
                      required
                      value={formData.pincode}
                      onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                      placeholder="6 digits"
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                  >
                    Save & Deliver Here
                  </button>
                  {addresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAddressForm(false)}
                      className="border border-slate-200 text-slate-600 font-semibold text-xs px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                {addresses.map(addr => {
                  const isSelected = selectedAddressId === addr.id
                  return (
                    <div
                      key={addr.id}
                      onClick={() => !submitting && setSelectedAddressId(addr.id)}
                      className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${submitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/20 ring-2 ring-brand-500/20 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="delivery_address"
                        checked={isSelected}
                        onChange={() => setSelectedAddressId(addr.id)}
                        disabled={submitting}
                        className="mt-1 accent-brand-500 h-4 w-4"
                      />
                      <div className="flex-1 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{addr.full_name}</span>
                          <span className="text-slate-500 text-xs">{addr.phone}</span>
                          {addr.is_default && (
                            <span className="bg-brand-100 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}, {addr.state} - {addr.pincode}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section 2: Payment Method */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">2</span>
              <span>Payment Method</span>
            </h2>

            <div className="space-y-3">
              {/* COD */}
              <div
                onClick={() => !submitting && setPaymentMethod('cod')}
                className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${submitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
                  paymentMethod === 'cod'
                    ? 'border-brand-500 bg-brand-50/20 ring-2 ring-brand-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Banknote size={22} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Cash on Delivery (COD)</p>
                    <p className="text-[11px] text-slate-500">Pay cash or UPI at your doorstep upon delivery</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                  disabled={submitting}
                  className="accent-brand-500 h-4 w-4"
                />
              </div>

              {/* PhonePe / UPI QR */}
              <div
                onClick={() => !submitting && setPaymentMethod('phonepe')}
                className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${submitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
                  paymentMethod === 'phonepe'
                    ? 'border-purple-500 bg-purple-50/20 ring-2 ring-purple-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                    <QrCode size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">PhonePe / UPI QR</p>
                      <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Scan QR with PhonePe, GPay, Paytm & submit 12-digit UTR</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'phonepe'}
                  onChange={() => setPaymentMethod('phonepe')}
                  disabled={submitting}
                  className="accent-purple-600 h-4 w-4"
                />
              </div>

              {/* Informational callout for PhonePe selection */}
              {paymentMethod === 'phonepe' && (
                <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-3.5 text-xs text-purple-900 flex items-start gap-2.5">
                  <QrCode size={18} className="text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">PhonePe UPI Payment Instructions</p>
                    <p className="text-[11px] text-purple-800 mt-0.5 leading-relaxed">
                      After confirming your order, a static PhonePe QR code will be presented.
                      Complete payment in PhonePe or any UPI app and submit your 12-digit UTR within 48 hours to confirm your order.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary & Coupon */}
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-base">
                Order Summary
              </h2>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                {totalItems} {totalItems === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Delivery Estimate pill */}
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-emerald-800">
              <Truck size={16} className="text-emerald-600 flex-shrink-0" />
              <span>Est. Delivery by <strong>{estDateStr}</strong></span>
            </div>

            {/* Items mini-list */}
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 text-xs">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-12 h-12 object-contain bg-slate-50 p-1 rounded-xl border border-slate-100 flex-shrink-0"
                    onError={e => { e.currentTarget.src = 'https://placehold.co/60x60?text=Item' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-slate-400 text-[11px]">Qty: {item.quantity} × {formatPrice(item.price)}</p>
                  </div>
                  <span className="font-bold text-slate-900">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            {/* Coupon Application Box */}
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Tag size={14} className="text-brand-500" /> Apply Coupon
              </p>

              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} />
                    <span className="font-bold">{appliedCoupon.code}</span>
                    <span>(-{formatPrice(couponDiscount)})</span>
                  </div>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-slate-400 hover:text-slate-600"
                    title="Remove coupon"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. SHOPKART10"
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value)}
                      className="flex-1 text-xs uppercase px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button
                      type="submit"
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                  {couponError && <p className="text-[11px] text-red-500">{couponError}</p>}
                  {couponSuccess && <p className="text-[11px] text-emerald-600">{couponSuccess}</p>}
                </form>
              )}
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <span>Items Subtotal</span>
                <span>{formatPrice(totalPrice)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Coupon Discount ({appliedCoupon.code})</span>
                  <span>-{formatPrice(couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Delivery Fee</span>
                {shippingFee === 0 ? (
                  <span className="text-emerald-600 font-semibold">FREE</span>
                ) : (
                  <span>{formatPrice(shippingFee)}</span>
                )}
              </div>
              <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-sm text-slate-900">
                <span>Total Payable</span>
                <span className="text-base text-brand-600">{formatPrice(finalPayable)}</span>
              </div>
            </div>

            {/* Place Order CTA */}
            {isSupabaseConfigured && !user ? (
              <Link
                to="/login"
                state={{ from: '/checkout' }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all text-center"
              >
                Sign In to Place Order
              </Link>
            ) : (
              <button
                onClick={handlePlaceOrder}
                disabled={submitting || !selectedAddressId}
                className={`w-full text-white font-bold text-sm py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all ${
                  paymentMethod === 'phonepe'
                    ? 'bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 shadow-purple-600/25'
                    : 'bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 shadow-brand-500/25'
                }`}
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>
                    {paymentMethod === 'phonepe'
                      ? `Confirm & Pay via PhonePe QR • ${formatPrice(finalPayable)}`
                      : `Confirm & Place Order (COD) • ${formatPrice(finalPayable)}`}
                  </span>
                )}
              </button>
            )}

            <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[11px] pt-1">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Guaranteed Safe & Secure Checkout</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
