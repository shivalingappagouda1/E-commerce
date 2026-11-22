import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, AlertCircle, ShoppingBag, CheckCircle2,
  MapPin, ExternalLink, ArrowRight, XCircle, X, AlertTriangle, Loader2,
  QrCode, Banknote, ShieldCheck, Clock, RotateCcw
} from 'lucide-react'
import { fetchCustomerOrders, cancelCustomerOrder } from '../../services/orderService'
import { useCart } from '../../context/CartContext'
import { formatPrice } from '../../utils/format'
import { getPaymentStatusInfo, getOrderFinancials } from '../../utils/paymentHelpers'

const CANCELLABLE_STATUSES = ['pending', 'processing']

const STATUS_BADGE = {
  pending: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  processing: 'bg-blue-50 text-blue-800 border-blue-200',
  shipped: 'bg-purple-50 text-purple-800 border-purple-200',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-red-50 text-red-800 border-red-200',
  refunded: 'bg-slate-100 text-slate-800 border-slate-300',
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

export default function OrdersPage({ initialOrders = null } = {}) {
  const { addItem } = useCart()
  const [orders, setOrders] = useState(initialOrders || [])
  const [loading, setLoading] = useState(!initialOrders)
  const [filterStatus, setFilterStatus] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 2

  // Cancellation state
  const [orderToCancel, setOrderToCancel] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const loadOrders = useCallback(async () => {
    if (initialOrders) return
    const { data } = await fetchCustomerOrders()
    setOrders(data || [])
    setLoading(false)
  }, [initialOrders])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const handleConfirmCancel = async () => {
    if (!orderToCancel || cancellingId) return
    const orderId = orderToCancel.id
    setCancellingId(orderId)
    setFeedback(null)

    let cancellationCommitted = false

    try {
      const result = await cancelCustomerOrder(orderId)

      if (result?.success) {
        cancellationCommitted = true
        setOrderToCancel(null)
        setFeedback({
          type: 'success',
          message: `Order #${String(orderId).slice(0, 8)} was cancelled successfully.`,
        })

        // Refresh orders only after confirmed success
        try {
          await loadOrders()
        } catch (refreshErr) {
          console.warn('[OrdersPage] Orders refreshed with warning after cancellation:', refreshErr)
        }
      } else {
        setOrderToCancel(null)
        setFeedback({
          type: 'error',
          message: result?.error?.message || 'Failed to cancel order. Please try again.',
        })
      }
    } catch (err) {
      console.error('[OrdersPage] Unexpected error during cancellation:', err)
      if (!cancellationCommitted) {
        setOrderToCancel(null)
        setFeedback({
          type: 'error',
          message: err?.message || 'An unexpected error occurred while cancelling your order. Please try again.',
        })
      }
    } finally {
      setCancellingId(null)
    }
  }

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

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
              Once you checkout and place an order, your packages, payment status, and delivery milestones will appear here.
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
    <main className="min-h-screen w-full bg-[radial-gradient(ellipse_at_left,_#fff0e9_0%,_transparent_34%),radial-gradient(ellipse_at_right,_#e9edff_0%,_transparent_36%),#f8faff]"><div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 xl:px-0 py-5 lg:py-6 space-y-5">
      {/* Title & Filter Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">My Orders & Tracking</h1>
          <p className="text-xs text-slate-500 mt-0.5">Track shipment milestones, payment status, inspect invoices and re-order items</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-blue-50/90 border border-blue-100 p-1 rounded-full text-xs font-semibold">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'active', label: 'In Progress' },
            { id: 'delivered', label: 'Delivered' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setFilterStatus(tab.id); setCurrentPage(1) }}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filterStatus === tab.id ? 'bg-white text-slate-900 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:text-blue-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl flex items-start justify-between gap-3 text-xs border shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0" />
            )}
            <p className="font-medium leading-relaxed">{feedback.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 shrink-0 p-1 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Orders List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5 items-start w-full">
        {filteredOrders.length === 0 ? (
          <div className="md:col-span-2 bg-white/90 p-8 rounded-3xl border border-blue-100 text-center text-slate-400 text-xs shadow-sm">
            No orders found under "{filterStatus}".
          </div>
        ) : (
          paginatedOrders.map(order => {
            const dateStr = order.created_at
              ? new Date(order.created_at).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : 'Date unavailable'

            const statusKey = (order.status || 'pending').toLowerCase()
            const badgeClass = STATUS_BADGE[statusKey] || STATUS_BADGE.pending
            const itemsList = order.order_items || order.items || []
            const stepIndex = getStepIndex(statusKey)
            const isCancelled = statusKey === 'cancelled' || statusKey === 'refunded'

            const paymentInfo = getPaymentStatusInfo(order)
            const financials = getOrderFinancials(order)
            const address = order.address || order.addresses || null

            return (
              <div
                key={order.id}
                className="bg-gradient-to-br from-[#71847A] via-[#65786E] to-[#586B62] rounded-[24px] border border-[#81948A] shadow-[0_10px_28px_rgba(73,96,83,0.24)] overflow-hidden transition-all hover:border-[#A4B3AA] hover:-translate-y-0.5 space-y-0 min-w-0 w-full"
              >
                {/* 1. Order Card Header */}
                <div className="bg-[#52675D]/45 px-4 sm:px-5 py-4 flex flex-col gap-3 border-b border-[#A5B4AA]/45 text-xs">
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div>
                      <span className="text-[#F2F5F2] block text-[10px] uppercase font-bold tracking-wider">Order ID</span>
                      <span className="font-mono font-bold text-white">#{order.id}</span>
                    </div>
                    <div>
                      <span className="text-[#F2F5F2] block text-[10px] uppercase font-bold tracking-wider">Placed On</span>
                      <span className="font-medium text-white">{dateStr}</span>
                    </div>
                    <div>
                      <span className="text-[#F2F5F2] block text-[10px] uppercase font-bold tracking-wider">Total Amount</span>
                      <span className="font-black text-white">{formatPrice(financials.totalAmount)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Order Status Badge */}
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wide ${badgeClass}`}>
                      {order.status || 'Processing'}
                    </span>

                    {/* Payment Method Badge */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      paymentInfo.isPhonePe
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {paymentInfo.isPhonePe ? <QrCode size={12} /> : <Banknote size={12} />}
                      <span>{paymentInfo.isPhonePe ? 'PhonePe UPI' : 'Cash on Delivery'}</span>
                    </span>

                    {/* Payment Status Pill */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${paymentInfo.badge.className}`}>
                      {paymentInfo.badge.label}
                    </span>

                    <Link
                      to={`/order-success/${order.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-white text-[#34445E] hover:bg-[#EEF2EF] font-bold px-3 py-2 shadow-sm ml-1"
                    >
                      <span>Receipt</span>
                      <ExternalLink size={12} />
                    </Link>

                    {CANCELLABLE_STATUSES.includes(statusKey) && (
                      <button
                        type="button"
                        onClick={() => setOrderToCancel(order)}
                        disabled={cancellingId === order.id}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <XCircle size={12} />
                        <span>Cancel Order</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Payment Lifecycle & Action Banner */}
                <div className="px-3.5 sm:px-4 py-3 border-b border-blue-50 text-xs">
                  {/* Case A: Refunded Order */}
                  {paymentInfo.isRefunded && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-800">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                          <RotateCcw size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Payment Refunded</p>
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            The full amount of <strong>{formatPrice(financials.totalAmount)}</strong> has been refunded to your source payment method.
                          </p>
                          <p className="text-[11px] font-mono font-medium text-slate-700 mt-0.5">
                            Bank / Gateway Reference ID:{' '}
                            {paymentInfo.refundReference ? (
                              <strong className="text-slate-900">{paymentInfo.refundReference}</strong>
                            ) : (
                              <span className="text-slate-500 italic font-normal">Reference ID has not been provided yet</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 bg-slate-200/80 text-slate-800 text-[11px] font-bold px-3 py-1 rounded-xl self-start sm:self-auto">
                        Refund Recorded
                      </span>
                    </div>
                  )}

                  {/* Case B: Cancelled Order (non-refunded) */}
                  {!paymentInfo.isRefunded && paymentInfo.isCancelled && (
                    <div className="bg-red-50/70 border border-red-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-red-900">
                      <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-red-950">Order Cancelled</p>
                        <p className="text-[11px] text-red-800 leading-relaxed">
                          This order has been cancelled. Payment verification window is closed.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Case C: PhonePe Orders (Active, Pending, or Under Verification) */}
                  {!paymentInfo.isRefunded && !paymentInfo.isCancelled && paymentInfo.isPhonePe && (
                    <>
                      {/* Sub-case 1: PhonePe Verified & Completed */}
                      {paymentInfo.isCompleted && (
                        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-emerald-900">
                          <div className="flex items-center gap-2.5">
                            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                            <div>
                              <p className="font-bold text-emerald-950">PhonePe Payment Verified & Completed</p>
                              <p className="text-[11px] text-emerald-800">
                                Your payment has been confirmed by our finance team. Your order is now being processed for delivery.
                                {paymentInfo.latestSub?.utr_number && (
                                  <span className="ml-1 font-mono font-semibold">
                                    (Verified UTR: {paymentInfo.latestSub.utr_number})
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-3 py-1 rounded-xl">
                            Verified
                          </span>
                        </div>
                      )}

                      {/* Sub-case 2: UTR Submitted & Awaiting Verification */}
                      {paymentInfo.isAwaitingVerification && (
                        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-blue-900">
                          <div className="flex items-start gap-2.5">
                            <ShieldCheck size={18} className="text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-blue-950 flex items-center gap-1.5">
                                <span>UTR #{paymentInfo.activeSub?.utr_number} Submitted</span>
                                <span className="bg-blue-200/80 text-blue-800 text-[10px] font-bold px-2 py-0.2 rounded-full uppercase">
                                  Under Review
                                </span>
                              </p>
                              <p className="text-[11px] text-blue-800 leading-relaxed">
                                Our finance team is currently verifying this UTR directly against PhonePe Business statements. Your order will be confirmed upon verification.
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                            <Clock size={12} className="animate-spin" />
                            <span>Verification Pending</span>
                          </span>
                        </div>
                      )}

                      {/* Sub-case 3: UTR Rejected by Admin */}
                      {paymentInfo.isUtrRejected && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
                          <div className="flex items-start gap-2.5">
                            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-amber-950">
                                Previous UTR ({paymentInfo.latestSub?.utr_number}) Was Rejected
                              </p>
                              {paymentInfo.latestSub?.admin_notes && (
                                <p className="text-[11px] text-amber-900 font-medium mt-0.5">
                                  Rejection Reason: {paymentInfo.latestSub.admin_notes}
                                </p>
                              )}
                              {paymentInfo.latestSub?.admin_notes?.startsWith('The amount received is insufficient.') && (
                                <div className="mt-2 rounded-xl border border-amber-200 bg-white p-3 text-[11px] text-amber-950">
                                  <strong className="block">Refund destination</strong>
                                  <span className="block font-mono">{paymentInfo.latestSub.upi_id || 'UPI ID not available for this older submission'}</span>
                                  <span className="block mt-1">Our team will manually process the refund within 48 hours.</span>
                                </div>
                              )}
                              {paymentInfo.canResubmitUtr ? (
                                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                                  You may submit a corrected 12-digit UTR within the original 48-hour deadline (before{' '}
                                  <strong className="underline">{paymentInfo.deadline.formatted}</strong>).
                                </p>
                              ) : (
                                <p className="text-[11px] text-amber-900 font-bold mt-1">
                                  The original 48-hour payment deadline passed on {paymentInfo.deadline.formatted}. Resubmission is no longer permitted.
                                </p>
                              )}
                            </div>
                          </div>
                          {paymentInfo.canResubmitUtr && (
                            <Link
                              to={`/order-success/${order.id}`}
                              className="shrink-0 inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors shadow-xs self-start sm:self-auto"
                            >
                              <RotateCcw size={13} />
                              <span>Resubmit 12-Digit UTR</span>
                            </Link>
                          )}
                        </div>
                      )}

                      {/* Sub-case 4: Pending initial UTR submission */}
                      {!paymentInfo.isCompleted && !paymentInfo.isAwaitingVerification && !paymentInfo.isUtrRejected && (
                        <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-purple-950">
                          <div className="flex items-start gap-2.5">
                            <Clock size={18} className="text-purple-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-purple-950">Payment & UTR Pending</p>
                              {!paymentInfo.deadline.isExpired ? (
                                <p className="text-[11px] text-purple-800 leading-relaxed">
                                  Please scan the PhonePe merchant QR code and submit your 12-digit UTR before{' '}
                                  <strong className="underline decoration-purple-300">{paymentInfo.deadline.formatted}</strong>.
                                </p>
                              ) : (
                                <p className="text-[11px] text-purple-900 font-bold">
                                  The 48-hour payment deadline passed on {paymentInfo.deadline.formatted}. Submissions past deadline are subject to cancellation.
                                </p>
                              )}
                            </div>
                          </div>
                          {!paymentInfo.deadline.isExpired && (
                            <Link
                              to={`/order-success/${order.id}`}
                              className="shrink-0 inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-[11px] px-3 py-2 rounded-xl transition-colors shadow-xs self-start sm:self-auto"
                            >
                              <QrCode size={13} />
                              <span>Complete UPI Payment</span>
                            </Link>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Case D: Cash on Delivery (COD) Orders */}
                  {!paymentInfo.isRefunded && !paymentInfo.isCancelled && paymentInfo.isCod && (
                    <>
                      {paymentInfo.isCompleted ? (
                        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-emerald-900">
                          <div className="flex items-center gap-2.5">
                            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                            <div>
                              <p className="font-bold text-emerald-950">COD Collected & Verified</p>
                              <p className="text-[11px] text-emerald-800">
                                Cash collection of <strong>{formatPrice(financials.totalAmount)}</strong> was verified upon delivery.
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-3 py-1 rounded-xl">
                            Cash Collected
                          </span>
                        </div>
                      ) : statusKey === 'delivered' ? (
                        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-amber-950">
                          <div className="flex items-center gap-2.5">
                            <Clock size={18} className="text-amber-600 shrink-0" />
                            <div>
                              <p className="font-bold text-amber-950">Delivery Complete — Collection Verification Pending</p>
                              <p className="text-[11px] text-amber-800">
                                Your order has been delivered. Final administrative reconciliation of cash payment is currently in progress.
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 bg-amber-100 text-amber-800 text-[11px] font-bold px-3 py-1 rounded-xl">
                            Pending Admin Sign-off
                          </span>
                        </div>
                      ) : (
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-amber-950">
                          <div className="flex items-center gap-2.5">
                            <Banknote size={18} className="text-amber-600 shrink-0" />
                            <div>
                              <p className="font-bold text-amber-950">Cash on Delivery — Payment Due Upon Delivery</p>
                              <p className="text-[11px] text-amber-800">
                                Payment of <strong>{formatPrice(financials.totalAmount)}</strong> is due upon delivery. Please keep cash or UPI ready on your phone when our agent arrives.
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 bg-amber-100 text-amber-800 text-[11px] font-bold px-3 py-1 rounded-xl">
                            Due on Delivery
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 3. Tracking Stepper (if not cancelled or refunded) */}
                {!isCancelled && (
                  <div className="px-4 py-3 bg-[#52675D]/25 border-b border-[#A5B4AA]/45">
                    <p className="text-[11px] font-bold text-[#F2F5F2] uppercase tracking-wider mb-3">
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
                              isCurrent ? 'text-white font-bold' : isDone ? 'text-[#F2F5F2]' : 'text-[#E1E9E3]'
                            }`}>
                              {step}
                            </span>
                          </div>
                        )
                      })}
                      {/* Connecting Line */}
                      <div className="absolute top-3.5 left-4 right-4 h-0.5 bg-[#C4D0C7]/70 -z-0" />
                    </div>
                  </div>
                )}

                {/* 4. Items in order */}
                <div className="mx-3 my-3 px-3 py-2.5 bg-white rounded-xl border border-slate-100 divide-y divide-slate-100 shadow-sm">
                  {itemsList.map((item, idx) => (
                    <div key={idx} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl p-1.5 border border-blue-100 shrink-0 flex items-center justify-center">
                          {item.image ? (
                            <img src={item.image} alt={item.product_name} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <Package size={22} className="text-slate-300" />
                          )}
                        </div>
                        <div className="truncate">
                          <h4 className="font-bold text-slate-900 truncate">{item.product_name}</h4>
                          <p className="text-slate-600 text-[11px] mt-0.5">
                            Quantity: <strong className="text-slate-800">{item.quantity}</strong> × <span className="text-slate-700">{formatPrice(item.unit_price)}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <span className="font-black text-slate-900 text-sm">
                          {formatPrice(item.total_price || item.unit_price * item.quantity)}
                        </span>
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              addItem({
                                id: item.product_id,
                                name: item.product_name,
                                price: item.unit_price,
                                image: item.image,
                              })
                            }}
                            className="text-[11px] font-bold text-brand-600 hover:text-brand-700 hover:underline cursor-pointer"
                          >
                            Buy Again
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 5. Financial Summary Breakdown */}
                <div className="px-4 py-2.5 bg-[#52675D]/30 border-t border-[#A5B4AA]/45 text-xs">
                  <div className="max-w-[260px] ml-auto space-y-1">
                    <div className="flex justify-between text-[#F2F5F2] text-[11px]">
                      <span>Items Subtotal:</span>
                      <span className="font-medium text-white">{formatPrice(financials.subtotal)}</span>
                    </div>

                    {financials.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600 text-[11px] font-medium">
                        <span className="flex items-center gap-1">
                          <span>Coupon Discount:</span>
                          {financials.couponCode && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                              {financials.couponCode}
                            </span>
                          )}
                        </span>
                        <span>- {formatPrice(financials.discountAmount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-[#F2F5F2] text-[11px]">
                      <span>Delivery Fee:</span>
                      <span className="font-medium text-white">
                        {financials.shippingAmount === 0 ? (
                          <span className="text-emerald-600 font-bold">FREE</span>
                        ) : (
                          formatPrice(financials.shippingAmount)
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between text-white font-black text-sm pt-1.5 border-t border-[#C4D0C7]/70">
                      <span>Total Amount:</span>
                      <span className="text-white">{formatPrice(financials.totalAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* 6. Destination info */}
                {address && (
                  <div className="px-4 py-3 bg-[#52675D]/35 border-t border-[#A5B4AA]/45 text-[10px] sm:text-[11px] text-[#F2F5F2] flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-slate-400 shrink-0" />
                      <span>
                        Delivery to: <strong className="text-white">{address.full_name}</strong> {address.phone ? `(${address.phone})` : ''}, {address.line1 ? `${address.line1}, ` : ''}{address.city} - {address.pincode}
                      </span>
                    </span>
                    <span className="font-medium text-slate-600">
                      Method: <strong className="text-white capitalize">{paymentInfo.isPhonePe ? 'PhonePe UPI' : 'Cash on Delivery'}</strong>
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {filteredOrders.length > pageSize && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            className="w-10 h-10 rounded-xl bg-white border border-blue-100 text-blue-800 shadow-sm hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(page => (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
              className={`w-10 h-10 rounded-xl font-bold text-sm shadow-sm transition-colors ${
                currentPage === page
                  ? 'bg-blue-600 text-white border border-blue-600'
                  : 'bg-white text-blue-900 border border-blue-100 hover:bg-blue-50'
              }`}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
            className="w-10 h-10 rounded-xl bg-white border border-blue-100 text-blue-800 shadow-sm hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {orderToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-blue-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 text-base">Cancel Order?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to cancel order <strong className="text-slate-800 font-mono">#{String(orderToCancel.id).slice(0, 8)}</strong>?
                  Your order will be cancelled permanently.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOrderToCancel(null)}
                disabled={Boolean(cancellingId)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={Boolean(cancellingId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {cancellingId === orderToCancel.id ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <XCircle size={14} />
                    <span>Confirm Cancellation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div></main>
  )
}
