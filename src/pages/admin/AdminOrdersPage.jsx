import { useState, useEffect, useMemo } from 'react'
import {
  ShoppingBag, Search, Filter, Eye, ChevronRight,
  Clock, Package, MapPin, Phone, User, X
} from 'lucide-react'
import { adminFetchOrders, adminUpdateOrderStatus } from '../../services/adminService'
import { formatPrice } from '../../utils/format'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_BADGE = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-purple-50 text-purple-700 border-purple-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}


function getOrderProductName(order) {
  const items = order.order_items || order.items || []
  if (!Array.isArray(items) || items.length === 0) return '—'
  const getName = item => item.product_name || item.name || item.product?.name || item.products?.name || 'Product name unavailable'
  const firstName = getName(items[0])
  return items.length > 1 ? `${firstName} + ${items.length - 1} more` : firstName
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    loadOrders()
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await adminFetchOrders()
    setOrders(data || [])
    setLoading(false)
  }

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchStatus = statusFilter === 'all' || o.status?.toLowerCase() === statusFilter.toLowerCase()
      const search = searchTerm.toLowerCase()
      const matchSearch = (o.id && o.id.toLowerCase().includes(search)) ||
                          (o.customer_name && o.customer_name.toLowerCase().includes(search)) ||
                          (o.profiles?.full_name && o.profiles.full_name.toLowerCase().includes(search)) ||
                          (o.address?.full_name && o.address.full_name.toLowerCase().includes(search))
      return matchStatus && matchSearch
    })
  }, [orders, statusFilter, searchTerm])

  async function handleStatusChange(orderId, newStatus) {
    setUpdatingId(orderId)
    const res = await adminUpdateOrderStatus(orderId, newStatus)
    setUpdatingId(null)
    if (res.success) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status: newStatus }))
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Order Management</h1>
        <p className="text-xs text-slate-500 mt-1">
          Review, fulfill, and update the status of customer orders
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by Order ID or customer name..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter size={14} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full sm:w-44"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-5 py-3">Order ID</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Items</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-slate-400">
                    Loading orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-slate-400">
                    No orders found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  const customerName = order.customer_name || order.profiles?.full_name || order.address?.full_name || 'Customer'
                  const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                  const itemsList = order.order_items || order.items || []
                  const currentStatus = order.status?.toLowerCase() || 'pending'
                  const badgeClass = STATUS_BADGE[currentStatus] || STATUS_BADGE.pending

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Order ID */}
                      <td className="px-5 py-3 font-mono font-bold text-slate-900">
                        {order.id}
                      </td>

                      {/* Customer */}
                      <td className="px-5 py-3">
                        <span className="font-semibold text-slate-800 block">{customerName}</span>
                        {order.customer_phone && (
                          <span className="text-[11px] text-slate-400">{order.customer_phone}</span>
                        )}
                      </td>

                      {/* Product Name */}
                      <td className="px-5 py-3 text-slate-600 min-w-[180px] max-w-[260px]">
                        <span className="block truncate" title={getOrderProductName(order)}>
                          {getOrderProductName(order)}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                        {dateStr}
                      </td>

                      {/* Items Count */}
                      <td className="px-5 py-3 text-slate-600 font-medium">
                        {itemsList.length} {itemsList.length === 1 ? 'item' : 'items'}
                      </td>

                      {/* Total Amount */}
                      <td className="px-5 py-3 font-bold text-slate-900 whitespace-nowrap">
                        {formatPrice(order.total_amount || order.subtotal)}
                      </td>

                      {/* Status Dropdown */}
                      <td className="px-5 py-3">
                        <select
                          disabled={updatingId === order.id}
                          value={currentStatus}
                          onChange={e => handleStatusChange(order.id, e.target.value)}
                          className={`text-[11px] font-bold border rounded-lg px-2.5 py-1 focus:outline-none uppercase ${badgeClass}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>

                      {/* View Action */}
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors inline-flex items-center gap-1 font-semibold"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Inspection Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Order Details</span>
                <h2 className="text-base font-bold text-slate-900 font-mono">{selectedOrder.id}</h2>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Delivery Details */}
            <div className="bg-slate-50 p-4 rounded-xl space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                Shipping Destination
              </span>
              <p className="font-bold text-slate-800">
                {selectedOrder.address?.full_name || selectedOrder.customer_name || 'Customer'}
              </p>
              <p className="text-slate-600 leading-relaxed">
                {selectedOrder.address_summary || (
                  selectedOrder.address
                    ? `${selectedOrder.address.line1}, ${selectedOrder.address.city}, ${selectedOrder.address.state} - ${selectedOrder.address.pincode}`
                    : 'Standard Customer Address'
                )}
              </p>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block border-b border-slate-100 pb-1">
                Ordered Products
              </span>
              {(selectedOrder.order_items || selectedOrder.items || []).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-none">
                  <div>
                    <p className="font-semibold text-slate-800">{item.product_name}</p>
                    <p className="text-slate-400 text-[11px]">Qty: {item.quantity} × {formatPrice(item.unit_price)}</p>
                  </div>
                  <span className="font-bold text-slate-900">{formatPrice(item.total_price || item.unit_price * item.quantity)}</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-sm font-bold text-slate-900">
              <span>Total Paid</span>
              <span className="text-brand-600 text-base">{formatPrice(selectedOrder.total_amount || selectedOrder.subtotal)}</span>
            </div>

            {/* Status Change in Modal */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-600">Update Status:</span>
              <select
                value={selectedOrder.status?.toLowerCase() || 'pending'}
                onChange={e => handleStatusChange(selectedOrder.id, e.target.value)}
                className="p-1.5 text-xs border border-slate-200 rounded-lg font-bold uppercase bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
