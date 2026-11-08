import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { MapPin, Plus, CheckCircle2, ShieldCheck, Truck, CreditCard, Banknote, AlertCircle, ArrowLeft } from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'
import { fetchAddresses, createAddress, placeOrder } from '../../services/orderService'
import { formatPrice } from '../../utils/format'

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, totalPrice, totalItems, clearCart } = useCart()
  const { user } = useAuth()

  const [addresses, setAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [loadingAddresses, setLoadingAddresses] = useState(true)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-sm">
          <AlertCircle size={48} className="text-amber-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-800">Your cart is empty</h2>
          <p className="text-xs text-slate-500 mt-1 mb-6">You need at least one item in your cart to proceed with checkout.</p>
          <Link to="/" className="bg-brand-500 text-white text-xs font-bold px-6 py-2.5 rounded-lg hover:bg-brand-600 transition-colors inline-block">
            Shop Products
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
    setError('')
    if (!selectedAddressId) {
      setError('Please select or add a delivery address.')
      return
    }

    setSubmitting(true)
    const chosenAddress = addresses.find(a => a.id === selectedAddressId)
    const { data: orderResult, error: orderError } = await placeOrder({
      addressId: selectedAddressId,
      notes: `Payment method: ${paymentMethod.toUpperCase()}`,
      cartItems: items,
      totalAmount: totalPrice,
      address: chosenAddress,
    })

    setSubmitting(false)

    if (orderError) {
      setError(orderError.message || 'Failed to place order. Please try again.')
      return
    }

    clearCart()
    navigate(`/order-success/${orderResult.id}`)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link to="/cart" className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Secure Checkout</h1>
          <p className="text-xs text-slate-500">Complete your shipping and payment details</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3 flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Delivery Address & Payment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Delivery Address */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <MapPin size={18} className="text-brand-500" /> 1. Select Delivery Address
              </h2>
              {!showAddressForm && (
                <button
                  onClick={() => setShowAddressForm(true)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add New Address
                </button>
              )}
            </div>

            {loadingAddresses ? (
              <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ) : showAddressForm ? (
              <form onSubmit={handleAddAddress} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Receiver name"
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="10-digit mobile number"
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Address (House / Flat / Street) *</label>
                  <input
                    type="text"
                    required
                    value={formData.line1}
                    onChange={e => setFormData({ ...formData, line1: e.target.value })}
                    placeholder="e.g. Flat 301, Sunshine Heights"
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">City / District *</label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">State *</label>
                    <input
                      type="text"
                      required
                      value={formData.state}
                      onChange={e => setFormData({ ...formData, state: e.target.value })}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">PIN Code *</label>
                    <input
                      type="text"
                      required
                      value={formData.pincode}
                      onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                      placeholder="6 digits"
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
                  >
                    Save & Deliver Here
                  </button>
                  {addresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAddressForm(false)}
                      className="border border-slate-200 text-slate-600 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
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
                      onClick={() => setSelectedAddressId(addr.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="delivery_address"
                        checked={isSelected}
                        onChange={() => setSelectedAddressId(addr.id)}
                        className="mt-1 accent-brand-500"
                      />
                      <div className="flex-1 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{addr.full_name}</span>
                          <span className="text-slate-500">{addr.phone}</span>
                          {addr.is_default && (
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded">
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
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <CreditCard size={18} className="text-brand-500" /> 2. Payment Method
            </h2>

            <div className="space-y-3">
              {/* COD */}
              <div
                onClick={() => setPaymentMethod('cod')}
                className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                  paymentMethod === 'cod'
                    ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Banknote className="text-slate-500" size={20} />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Cash on Delivery (COD)</p>
                    <p className="text-[11px] text-slate-400">Pay cash or UPI at your doorstep</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                  className="accent-brand-500"
                />
              </div>

              {/* Online Payment (UPI / Cards Simulation) */}
              <div
                onClick={() => setPaymentMethod('online')}
                className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                  paymentMethod === 'online'
                    ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="text-slate-500" size={20} />
                  <div>
                    <p className="text-xs font-bold text-slate-800">UPI / Debit & Credit Card</p>
                    <p className="text-[11px] text-slate-400">Instant checkout simulation</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'online'}
                  onChange={() => setPaymentMethod('online')}
                  className="accent-brand-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
          <h2 className="font-bold text-slate-800 text-base border-b border-slate-100 pb-3">
            Order Summary ({totalItems} {totalItems === 1 ? 'item' : 'items'})
          </h2>

          {/* Items mini-list */}
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 text-xs">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-12 h-12 object-contain bg-slate-50 p-1 rounded-lg border border-slate-100 flex-shrink-0"
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

          {/* Price Breakdown */}
          <div className="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
            <div className="flex justify-between">
              <span>Items Subtotal</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery Fee</span>
              <span className="text-green-600 font-semibold">FREE</span>
            </div>
            <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-sm text-slate-900">
              <span>Total Payable</span>
              <span className="text-base text-brand-600">{formatPrice(totalPrice)}</span>
            </div>
          </div>

          {/* Place Order CTA */}
          <button
            onClick={handlePlaceOrder}
            disabled={submitting || !selectedAddressId}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-bold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Confirm & Place Order</span>
            )}
          </button>

          <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[11px] pt-1">
            <ShieldCheck size={14} className="text-green-600" />
            <span>Guaranteed Safe & Secure Checkout</span>
          </div>
        </div>
      </div>
    </div>
  )
}
