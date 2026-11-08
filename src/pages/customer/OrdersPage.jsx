import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, Calendar, Clock, ChevronRight, AlertCircle,
  ShoppingBag, CheckCircle2, Truck, RotateCcw, MapPin,
  ExternalLink, ArrowRight
} from 'lucide-react'
import { fetchCustomerOrders } from '../../services/orderService'
import { useCart } from '../../context/CartContext'
import { formatPrice } from '../../utils/format'

const STATUS_BADGE = {
  pending: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  processing: 'bg-blue-50 text-blue-800 border-blue-200',
  shipped: 'bg-purple-50 text-purple-800 border-purple-200',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-red-50 text-red-800 border-red-200',
  refunded: 'bg-slate-50 text-slate-800 border-slate-200',
}

const STEPS = ['Placed', 'Confirmed', 'Shipped', 'Out for Delivery', 'Delivered']

function getStepIndex(status) {
  const s = (status || '').toLowerCase()
  if (s === 'delivered') return 4
  if (s === 'shipped') return 2
  if (s === 'processing') return 1
  if (s === 'cancelled' || s === 'refunded') return -1
  return 0 // pending
}

export default function OrdersPage() {
  const { addItem } = useCart()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    fetchCustomerOrders().then(({ data }) => {
      setOrders(data || [])
      setLoading(false)
    })
  }, [])

  const filteredOrders = useMemo(() => {
    if (filterStatus === 'all') return orders
    if (filterStatus === 'active') {
      return orders.filter(o => ['pending', 'processing', 'shipped'].includes(o.status?.toLowerCase()))
    }
    if (filterStatus === 'delivered') {
      return orders.filter(o => o.status?.toLowerCase() === 'delivered')
    }
    if (filterStatus === 'cancelled') {
      return orders.filter(o => ['cancelled', 'refunded'].includes(o.status?.toLowerCase()))
    }
    return orders
  }, [orders, filterStatus])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48 animate-pulse" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 bg-white rounded-3xl border border-slate-100 p-6 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 max-w-md mx-auto shadow-xs space-y-4">
          <div className="w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center mx-auto text-brand-500">
            <ShoppingBag size={38} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">No Orders Placed Yet</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Once you checkout and place an order, your packages and live delivery tracking milestones will appear here.
            </p>
          </div>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-xs transition-colors"
            >
              <span>Start Shopping</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Title & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">My Orders & Tracking</h1>
          <p className="text-xs text-slate-500 mt-0.5">Track shipment milestones, inspect invoices and re-order items</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'active', label: 'In Progress' },
            { id: 'delivered', label: 'Delivered' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filterStatus === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-5">
        {filteredOrders.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 text-center text-slate-400 text-xs">
            No orders found under "{filterStatus}".
          </div>
        ) : (
          filteredOrders.map(order => {
            const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
            const statusKey = (order.status || 'pending').toLowerCase()
            const badgeClass = STATUS_BADGE[statusKey] || STATUS_BADGE.pending
            const itemsList = order.order_items || order.items || []
            const stepIndex = getStepIndex(statusKey)
            const isCancelled = statusKey === 'cancelled' || statusKey === 'refunded'

            return (
              <div
                key={order.id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Header */}
                <div className="bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 text-xs">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Order ID</span>
                      <span className="font-mono font-bold text-slate-900">{order.id}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Placed On</span>
                      <span className="font-medium text-slate-700">{dateStr}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Total Amount</span>
                      <span className="font-black text-slate-900">{formatPrice(order.total_amount || order.subtotal)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wide ${badgeClass}`}>
                      {order.status || 'Processing'}
                    </span>
                    <Link
                      to={`/order-success/${order.id}`}
                      className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-bold"
                    >
                      <span>Receipt</span>
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>

                {/* Tracking Stepper (if not cancelled) */}
                {!isCancelled && (
                  <div className="px-6 py-4 bg-white border-b border-slate-100">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Shipment Status
                    </p>
                    <div className="flex items-center justify-between relative max-w-xl">
                      {STEPS.map((step, idx) => {
                        const isDone = idx <= stepIndex
                        const isCurrent = idx === stepIndex

                        return (
                          <div key={step} className="flex flex-col items-center relative z-10">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                              isDone ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}>
                              {isDone ? <CheckCircle2 size={15} /> : idx + 1}
                            </div>
                            <span className={`text-[10px] mt-1.5 font-semibold text-center ${
                              isCurrent ? 'text-emerald-700 font-bold' : isDone ? 'text-slate-700' : 'text-slate-400'
                            }`}>
                              {step}
                            </span>
                          </div>
                        )
                      })}
                      {/* Connecting Line */}
                      <div className="absolute top-3.5 left-4 right-4 h-0.5 bg-slate-100 -z-0" />
                    </div>
                  </div>
                )}

                {/* Items in order */}
                <div className="p-6 divide-y divide-slate-100">
                  {itemsList.map((item, idx) => (
                    <div key={idx} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-14 h-14 bg-slate-50 rounded-xl p-1.5 border border-slate-100 shrink-0 flex items-center justify-center">
                          {item.image ? (
                            <img src={item.image} alt={item.product_name} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <Package size={22} className="text-slate-300" />
                          )}
                        </div>
                        <div className="truncate">
                          <h4 className="font-bold text-slate-900 truncate">{item.product_name}</h4>
                          <p className="text-slate-400 text-[11px] mt-0.5">
                            Quantity: <strong>{item.quantity}</strong> × {formatPrice(item.unit_price)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <span className="font-black text-slate-900 text-sm">
                          {formatPrice(item.total_price || item.unit_price * item.quantity)}
                        </span>
                        <div>
                          <button
                            onClick={() => {
                              addItem({
                                id: item.product_id,
                                name: item.product_name,
                                price: item.unit_price,
                                image: item.image,
                              })
                            }}
                            className="text-[11px] font-bold text-brand-600 hover:text-brand-700 hover:underline"
                          >
                            Buy Again
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Destination info */}
                {order.address && (
                  <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-slate-400" />
                      Delivery to: <strong className="text-slate-800">{order.address.full_name}</strong>, {order.address.city} - {order.address.pincode}
                    </span>
                    <span className="text-slate-400">Payment: COD / Verified</span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
