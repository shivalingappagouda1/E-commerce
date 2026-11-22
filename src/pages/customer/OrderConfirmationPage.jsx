import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  CheckCircle2,
  Package,
  Home,
  Calendar,
  MapPin,
  Banknote,
  QrCode,
  XCircle,
  RotateCcw,
  AlertCircle,
} from 'lucide-react'
import { fetchOrderById, fetchOrderPayment } from '../../services/orderService'
import { formatPrice } from '../../utils/format'
import { getOrderFinancials } from '../../utils/paymentHelpers'
import PhonePePaymentSection from '../../components/checkout/PhonePePaymentSection'

export default function OrderConfirmationPage({
  initialOrder = null,
  initialPaymentData = null,
  initialPaymentError = null,
  initialIsRetrying = false,
  onControllerReady = null,
  orderService = null,
} = {}) {
  const fetchOrder = orderService?.fetchOrderById || fetchOrderById
  const fetchPayment = orderService?.fetchOrderPayment || fetchOrderPayment

  const params = useParams()
  const routeOrderId = params?.orderId || null
  const effectiveOrderId = initialOrder?.id || routeOrderId

  const [order, setOrder] = useState(initialOrder)
  const [paymentData, setPaymentData] = useState(initialPaymentData)
  const [loading, setLoading] = useState(!initialOrder)
  const [loadError, setLoadError] = useState(null)
  const [paymentError, setPaymentError] = useState(initialPaymentError)
  const [isRetryingPayment, setIsRetryingPayment] = useState(initialIsRetrying)

  const formattedDeliveryDate = useMemo(() => {
    const deliveryDate = new Date()
    deliveryDate.setDate(deliveryDate.getDate() + 4)
    return deliveryDate.toLocaleDateString('en-IN', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  }, [])

  const loadOrderData = useCallback(async () => {
    if (!effectiveOrderId) {
      setLoading(false)
      return
    }

    if (!initialOrder) {
      setLoading(true)
    }
    // Set retrying state; DO NOT clear paymentError before successful fetch
    setIsRetryingPayment(true)
    setLoadError(null)

    let orderRes = null
    let orderErr = null
    let paymentRes = null
    let paymentErr = null

    try {
      try {
        orderRes = await fetchOrder(effectiveOrderId)
      } catch (err) {
        orderErr = err
      }

      try {
        paymentRes = await fetchPayment(effectiveOrderId)
      } catch (err) {
        paymentErr = err
      }

      if (orderRes?.data && paymentRes?.data && !paymentRes?.error && !paymentErr) {
        // Full success: both fresh order and payment records successfully retrieved
        const merged = {
          ...orderRes.data,
          payment: paymentRes.data.payment || orderRes.data.payment || null,
        }
        setOrder(merged)
        setPaymentData(paymentRes.data)
        // Clear paymentError ONLY after valid payment data is successfully returned
        setPaymentError(null)
      } else if (orderRes?.data && (paymentErr || paymentRes?.error)) {
        // Order succeeded, but payment fetch threw an error or returned an error object
        const errMsg =
          paymentErr?.message ||
          paymentRes?.error?.message ||
          'Failed to retrieve payment verification status.'
        setPaymentError(errMsg)
        // Wipe stale payment data from order and payment state
        setOrder({
          ...orderRes.data,
          payment: null,
        })
        setPaymentData(null)
      } else if (orderErr || orderRes?.error) {
        // Order retrieval failed: even if payment fetch succeeded, order failure prevents authoritative payment status
        setLoadError(orderErr?.message || orderRes?.error?.message || 'Unable to load order details.')
        setPaymentError('Order details could not be verified. Payment status held unavailable.')
        setPaymentData(null)
        setOrder(prev => (prev ? { ...prev, payment: null } : null))
      } else if (!initialOrder) {
        setLoadError('Order not found or you do not have permission to view it.')
        setPaymentError('Order not found. Payment status unavailable.')
        setPaymentData(null)
        setOrder(null)
      }
    } catch (unexpectedErr) {
      setLoadError(unexpectedErr?.message || 'Failed to load order.')
      setPaymentError(unexpectedErr?.message || 'Payment status unavailable.')
      setPaymentData(null)
      setOrder(prev => (prev ? { ...prev, payment: null } : null))
    } finally {
      setLoading(false)
      setIsRetryingPayment(false)
    }
  }, [effectiveOrderId, initialOrder, fetchOrder, fetchPayment])

  useEffect(() => {
    if (!initialOrder) {
      loadOrderData()
    }
  }, [initialOrder, loadOrderData])

  useEffect(() => {
    if (typeof onControllerReady === 'function') {
      onControllerReady({
        loadOrderData,
        order,
        paymentData,
        paymentError,
        isRetryingPayment,
      })
    }
  }, [onControllerReady, loadOrderData, order, paymentData, paymentError, isRetryingPayment])

  function handleUtrSubmitted(newSub) {
    setPaymentData(prev => ({
      ...prev,
      activeSubmission: newSub,
      latestSubmission: newSub,
      submissions: [newSub, ...(prev?.submissions || [])],
    }))
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">Retrieving your order details...</p>
      </div>
    )
  }

  if (loadError && !order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Order Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">{loadError}</p>
        <div className="pt-2 flex justify-center gap-3">
          <Link
            to="/orders"
            className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs py-2.5 px-5 rounded-xl transition-colors shadow-xs"
          >
            Go to My Orders
          </Link>
          <Link
            to="/"
            className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 px-5 rounded-xl transition-colors"
          >
            Storefront
          </Link>
        </div>
      </div>
    )
  }



  const paymentProvider =
    paymentData?.payment?.provider || order?.payment?.provider || order?.payment_provider || 'cod'
  const isPhonePe = paymentProvider === 'phonepe'
  const isCod = paymentProvider === 'cod'

  const orderStatus = (order?.status || 'pending').toLowerCase()
  const paymentStatus = (paymentData?.payment?.status || order?.payment?.status || '').toLowerCase()

  const isPaymentUnavailable = Boolean(paymentError || isRetryingPayment)

  // Authoritative cancellation and refund status strictly require that payment/order details are verified.
  // When payment details could not be verified (paymentError or isRetryingPayment), stale refund/cancellation claims are suppressed.
  const isCancelled = !isPaymentUnavailable && (orderStatus === 'cancelled' || paymentStatus === 'failed')
  const isRefunded = !isPaymentUnavailable && (orderStatus === 'refunded' || paymentStatus === 'refunded')

  // Authoritative payment completion strictly requires payment status === 'completed' AND no paymentError AND not retrying.
  // Order status (processing, delivered, etc.) must NEVER infer payment completion.
  // When payment status could not be verified (paymentError or isRetryingPayment), authoritative completion claims are suppressed.
  const isPaymentCompleted =
    !isCancelled &&
    !isRefunded &&
    !isPaymentUnavailable &&
    (paymentData?.payment?.status === 'completed' || order?.payment?.status === 'completed')

  const financials = getOrderFinancials(order)

  // Strictly use actual refund_reference. Never substitute provider_payment_id.
  // When payment status is unavailable, suppress stale refund references.
  const refundRef = !isPaymentUnavailable
    ? paymentData?.payment?.refund_reference || order?.payment?.refund_reference || null
    : null

  const items = order?.order_items || order?.items || []
  const address = order?.address || order?.addresses || null

  return (
    <main className="min-h-[calc(100vh-120px)] w-full bg-[radial-gradient(ellipse_at_top_left,_#fff7ed_0%,_transparent_35%),radial-gradient(ellipse_at_bottom_right,_#dbeafe_0%,_transparent_40%),#f8fafc]">
      <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-5 xl:px-6 py-5 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.96fr)] gap-3.5 xl:gap-4 items-start">
          <section className="min-w-0 space-y-3">
            {/* ── Payment Section: PhonePe QR & UTR Component vs COD Instructions (Strictly hidden whenever isPaymentUnavailable) ── */}
      {!isPaymentUnavailable && (
        <>
          {isPhonePe && !isCancelled && !isRefunded && (
            <PhonePePaymentSection
              order={order}
              activeSubmission={paymentData?.activeSubmission || order?.activeSubmission || null}
              latestSubmission={paymentData?.latestSubmission || order?.latestSubmission || null}
              submissions={paymentData?.submissions || order?.payment_submissions || []}
              onUtrSubmitted={handleUtrSubmitted}
            />
          )}

          {isCod && !isCancelled && !isRefunded && (
            <div className={`rounded-2xl p-5 text-xs space-y-1.5 shadow-xs border ${
              isPaymentCompleted
                ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-950'
                : orderStatus === 'delivered'
                ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                : 'bg-amber-50/80 border-amber-200/80 text-amber-950'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {isPaymentCompleted ? (
                  <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
                ) : (
                  <Banknote size={20} className="text-amber-600 flex-shrink-0" />
                )}
                <span>
                  {isPaymentCompleted
                    ? 'COD Collected & Verified'
                    : orderStatus === 'delivered'
                    ? 'Delivery Complete — Collection Verification Pending'
                    : 'Cash on Delivery (COD) Confirmed — Payment Due Upon Delivery'}
                </span>
              </div>
              <p className={`leading-relaxed text-[11px] ${isPaymentCompleted ? 'text-emerald-800' : 'text-amber-800'}`}>
                {isPaymentCompleted
                  ? `Cash collection of ${formatPrice(financials.totalAmount)} has been confirmed by our delivery and verification team.`
                  : orderStatus === 'delivered'
                  ? 'Your package has been delivered. Final administrative reconciliation of cash collection is in progress.'
                  : <>Please keep <strong>{formatPrice(order?.total_amount || financials.totalAmount || 0)}</strong> ready in cash or have UPI ready on your phone when our delivery agent arrives.</>}
              </p>
            </div>
          )}
        </>
      )}

      
            {/* ── When Payment Fetch Failed or Status Unavailable for COD: display unverified notice ── */}
      {isCod && isPaymentUnavailable && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-lg">
              <Banknote size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Cash on Delivery</h3>
              <p className="text-xs text-slate-500">Payment verification unconfirmed</p>
            </div>
            <div className="ml-auto">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full">
                COD Status Check Unavailable
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Due to an unverified payment status, latest collection records cannot be displayed. Payment actions remain disabled until fresh status is retrieved.
          </p>
        </div>
      )}

      
          </section>
          <section className="min-w-0 space-y-3">
            {/* ── Status Hero ── */}
      <div className="bg-gradient-to-br from-sky-50 via-white to-blue-100 rounded-2xl border border-sky-100 p-5 sm:p-6 text-center shadow-[0_8px_22px_rgba(30,64,110,0.08)] space-y-2.5">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-sm ${
            isPaymentUnavailable
              ? 'bg-amber-100 text-amber-600'
              : isCancelled
              ? 'bg-red-100 text-red-600'
              : isRefunded
              ? 'bg-slate-200 text-slate-700'
              : isPhonePe && !isPaymentCompleted
              ? 'bg-purple-100 text-purple-600'
              : 'bg-green-100 text-green-600'
          }`}
        >
          {isPaymentUnavailable ? (
            <AlertCircle size={28} />
          ) : isCancelled ? (
            <XCircle size={28} />
          ) : isRefunded ? (
            <RotateCcw size={26} />
          ) : isPhonePe && !isPaymentCompleted ? (
            <QrCode size={26} />
          ) : (
            <CheckCircle2 size={28} />
          )}
        </div>

        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
          {isPaymentUnavailable
            ? 'Payment Status Unavailable'
            : isCancelled
            ? 'Order Cancelled'
            : isRefunded
            ? 'Order Payment Refunded'
            : isPhonePe && !isPaymentCompleted
            ? 'Order Placed — Complete UPI Payment'
            : 'Order Placed Successfully!'}
        </h1>

        <p className="text-xs text-slate-600 max-w-md mx-auto">
          {isPaymentUnavailable
            ? 'We were unable to verify the authoritative payment status for this order. Please retry using the button below.'
            : isCancelled
            ? 'This order has been cancelled.'
            : isRefunded
            ? 'The payment for this order has been refunded. The transaction has been credited to your payment method.'
            : isPhonePe && !isPaymentCompleted
            ? 'Your order has been placed. Please complete your PhonePe UPI payment and submit your 12-digit UTR for administrator verification.'
            : "Thank you for shopping with ShopKart. We've received your order and are getting it ready for delivery."}
        </p>

        <div className="inline-block bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-[11px] text-slate-700">
          <span>Order ID: </span>
          <strong className="text-slate-900 font-mono text-sm ml-1">#{effectiveOrderId}</strong>
        </div>
      </div>

      
            {/* ── Payment Retrieval Error Alert (if fetchOrderPayment failed) ── */}
      {paymentError && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-950 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
            <span>Payment Status Retrieval Error</span>
          </div>
          <p className="text-amber-800 leading-relaxed text-[11px]">
            We were unable to retrieve the latest payment verification details for this order ({paymentError}). Payment submission and verification actions are temporarily disabled to prevent unverified submissions.
          </p>
          <button
            type="button"
            onClick={(e) => {
              const p = loadOrderData()
              if (e?.currentTarget) e.currentTarget._lastPromise = p
              return p
            }}
            disabled={isRetryingPayment}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors shadow-xs cursor-pointer"
          >
            <RotateCcw size={13} className={isRetryingPayment ? 'animate-spin' : ''} />
            <span>{isRetryingPayment ? 'Verifying Payment...' : 'Retry Payment Status Check'}</span>
          </button>
        </div>
      )}

      
            {/* ── Refund Notice Banner (Refunded Orders) ── */}
      {isRefunded && (
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-xs text-slate-800 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-950">
            <RotateCcw size={20} className="text-slate-700 flex-shrink-0" />
            <span>Refund Processed & Credited</span>
          </div>
          <p className="text-slate-700 leading-relaxed text-[11px]">
            The payment of <strong>{formatPrice(financials.totalAmount)}</strong> has been refunded to your source payment account.
          </p>
          <div className="pt-1.5 border-t border-slate-200 font-mono text-[11px] text-slate-700">
            {refundRef ? (
              <>
                Bank / Gateway Reference ID: <strong className="text-slate-950 font-bold">{refundRef}</strong>
              </>
            ) : (
              <span className="text-slate-500 italic">Reference ID has not been provided yet</span>
            )}
          </div>
        </div>
      )}

      
            {/* Details Grid: Estimated Delivery & Address */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Estimated Delivery */}
        <div className="bg-white p-3.5 rounded-2xl border border-sky-100 shadow-sm flex items-start gap-3">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
            <Calendar size={19} />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-slate-400 uppercase tracking-wide">Estimated Delivery</p>
            <p className="text-sm font-bold text-slate-800">{formattedDeliveryDate}</p>
            <p className="text-slate-500">Standard Delivery by 9:00 PM</p>
          </div>
        </div>

        {/* Delivery Address */}
        <div className="bg-white p-3.5 rounded-2xl border border-sky-100 shadow-sm flex items-start gap-3">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
            <MapPin size={19} />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-slate-400 uppercase tracking-wide">Delivering To</p>
            {address ? (
              <>
                <p className="font-bold text-slate-800 text-sm">
                  {address.full_name} {address.phone ? `(${address.phone})` : ''}
                </p>
                <p className="text-slate-500 leading-relaxed">
                  {address.line1 ? `${address.line1}, ` : ''}{address.city},{' '}
                  {address.state ? `${address.state} - ` : ''}{address.pincode}
                </p>
              </>
            ) : (
              <p className="text-slate-500">Customer Registered Address</p>
            )}
          </div>
        </div>
      </div>

      
            {/* Items & Financial Breakdown Summary */}
      {items.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm space-y-3">
          <h2 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2 flex items-center gap-2">
            <Package size={16} className="text-brand-500" /> Items in this Order ({items.length})
          </h2>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id || idx} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-none">
                <div className="flex items-center gap-3">
                  {item.image && (
                    <img src={item.image} alt={item.product_name} className="w-11 h-11 object-contain rounded-lg bg-sky-50 p-1" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-800">{item.product_name}</p>
                    <p className="text-slate-400 text-[11px]">
                      Qty: {item.quantity} × {formatPrice(item.unit_price)}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-slate-900">
                  {formatPrice(item.total_price || item.unit_price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Full Financial Breakdown */}
          <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal:</span>
              <span className="font-semibold text-slate-800">{formatPrice(financials.subtotal)}</span>
            </div>

            {financials.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
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

            <div className="flex justify-between text-slate-600">
              <span>Delivery Fee:</span>
              <span className="font-semibold text-slate-800">
                {financials.shippingAmount === 0 ? (
                  <span className="text-emerald-600 font-bold">FREE</span>
                ) : (
                  formatPrice(financials.shippingAmount)
                )}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
              <span>
                {isPaymentUnavailable
                  ? 'Order Total'
                  : isPhonePe && !isPaymentCompleted
                  ? 'Total Payable'
                  : 'Total Paid'}
              </span>
              <span className="text-orange-600 text-base font-black">{formatPrice(financials.totalAmount)}</span>
            </div>
          </div>
        </div>
      )}

      
            {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <Link
          to="/orders"
          className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm text-xs"
        >
          <Package size={16} /> View My Orders
        </Link>
        <Link
          to="/"
          className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all text-xs"
        >
          <Home size={16} /> Continue Shopping
        </Link>
      </div>
          </section>
        </div>
      </div>
    </main>
  )
}
