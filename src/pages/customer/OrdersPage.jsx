import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Package, Calendar, Clock, ChevronRight, AlertCircle, ShoppingBag } from 'lucide-react'
import { fetchCustomerOrders } from '../../services/orderService'
import { formatPrice } from '../../utils/format'

const STATUS_BADGE = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-purple-50 text-purple-700 border-purple-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-slate-50 text-slate-700 border-slate-200',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCustomerOrders().then(({ data }) => {
      setOrders(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48 animate-pulse" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 bg-white rounded-2xl border border-slate-100 p-6 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-3xl border border-slate-100 p-12 max-w-md mx-auto shadow-sm">
          <ShoppingBag size={56} className="text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">No Orders Placed Yet</h2>
          <p className="text-xs text-slate-500 mt-2 mb-6">
            When you purchase items on ShopKart, your orders and tracking details will appear here.
          </p>
          <Link
            to="/"
            className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-6 py-3 rounded-xl transition-colors inline-block"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">My Orders</h1>
        <p className="text-xs text-slate-500 mt-1">Track, manage and view all your purchases</p>
      </div>

      <div className="space-y-4">
        {orders.map(order => {
          const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
          const badgeClass = STATUS_BADGE[order.status?.toLowerCase()] || STATUS_BADGE.pending
          const itemsList = order.order_items || order.items || []

          return (
            <div
              key={order.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
            >
              {/* Order Header */}
              <div className="bg-slate-50/70 px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Order ID</span>
                    <span className="font-mono font-bold text-slate-800">{order.id}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Date Placed</span>
                    <span className="font-medium text-slate-700">{dateStr}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase ${badgeClass}`}>
                    {order.status || 'Processing'}
                  </span>
                  <span className="font-extrabold text-sm text-slate-900">
                    {formatPrice(order.total_amount || order.subtotal)}
                  </span>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-6 divide-y divide-slate-100">
                {itemsList.map(item => (
                  <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-50 rounded-lg p-1 border border-slate-100 flex-shrink-0 flex items-center justify-center">
                        {item.image ? (
                          <img src={item.image} alt={item.product_name} className="max-h-full max-w-full object-contain" />
                        ) : (
                          <Package size={20} className="text-slate-300" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800">{item.product_name}</h4>
                        <p className="text-slate-400 text-[11px]">Qty: {item.quantity} × {formatPrice(item.unit_price)}</p>
                      </div>
                    </div>
                    <span className="font-bold text-slate-800">{formatPrice(item.total_price || item.unit_price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Delivery destination */}
              {order.address && (
                <div className="px-6 py-3 bg-slate-50/40 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>
                    Delivering to: <strong className="text-slate-700">{order.address.full_name}</strong>, {order.address.city}
                  </span>
                  <Link
                    to={`/order-success/${order.id}`}
                    className="text-brand-600 hover:underline font-semibold flex items-center gap-0.5"
                  >
                    View Receipt <ChevronRight size={13} />
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
