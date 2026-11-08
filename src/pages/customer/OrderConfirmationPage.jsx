import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CheckCircle2, Package, ArrowRight, Home, Calendar, MapPin } from 'lucide-react'
import { fetchOrderById } from '../../services/orderService'
import { formatPrice } from '../../utils/format'

export default function OrderConfirmationPage() {
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrderById(orderId).then(({ data }) => {
      setOrder(data)
      setLoading(false)
    })
  }, [orderId])

  const deliveryDate = new Date()
  deliveryDate.setDate(deliveryDate.getDate() + 4)
  const formattedDeliveryDate = deliveryDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      {/* Success Hero */}
      <div className="bg-white rounded-3xl border border-slate-100 p-8 sm:p-12 text-center shadow-sm space-y-4">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 size={36} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Order Placed Successfully!
        </h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Thank you for shopping with ShopKart. We've received your order and are getting it ready for delivery.
        </p>

        <div className="inline-block bg-slate-50 border border-slate-200 rounded-xl px-5 py-2.5 text-xs text-slate-700">
          <span>Order ID: </span>
          <strong className="text-slate-900 font-mono text-sm ml-1">{orderId}</strong>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Estimated Delivery */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
            <Calendar size={24} />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-slate-400 uppercase tracking-wide">Estimated Delivery</p>
            <p className="text-base font-bold text-slate-800">{formattedDeliveryDate}</p>
            <p className="text-slate-500">Standard Delivery by 9:00 PM</p>
          </div>
        </div>

        {/* Delivery Address */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
            <MapPin size={24} />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-slate-400 uppercase tracking-wide">Delivering To</p>
            {order?.address ? (
              <>
                <p className="font-bold text-slate-800 text-sm">{order.address.full_name} ({order.address.phone})</p>
                <p className="text-slate-500 leading-relaxed">
                  {order.address.line1}, {order.address.city}, {order.address.state} - {order.address.pincode}
                </p>
              </>
            ) : (
              <p className="text-slate-500">Customer Registered Address</p>
            )}
          </div>
        </div>
      </div>

      {/* Items Summary (if available) */}
      {order?.items && order.items.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
            <Package size={16} className="text-brand-500" /> Items in this Order ({order.items.length})
          </h2>
          <div className="space-y-3">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-50 last:border-none">
                <div className="flex items-center gap-3">
                  {item.image && (
                    <img src={item.image} alt={item.product_name} className="w-10 h-10 object-contain rounded bg-slate-50 p-1" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-800">{item.product_name}</p>
                    <p className="text-slate-400 text-[11px]">Qty: {item.quantity}</p>
                  </div>
                </div>
                <span className="font-bold text-slate-900">{formatPrice(item.total_price)}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-sm font-bold text-slate-900">
            <span>Total Paid</span>
            <span className="text-brand-600 text-base">{formatPrice(order.total_amount)}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          to="/orders"
          className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <Package size={16} /> View My Orders
        </Link>
        <Link
          to="/"
          className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Home size={16} /> Continue Shopping
        </Link>
      </div>
    </div>
  )
}
