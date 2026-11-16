/**
 * Payment and UTR helper utilities for ShopKart (Phase 6E).
 */

/**
 * Validates a 12-digit numeric PhonePe / UPI UTR string.
 * @param {string} utr
 * @returns {{ isValid: boolean, error: string | null }}
 */
export function validateUtrFormat(utr) {
  const trimmed = typeof utr === 'string' ? utr.trim() : String(utr || '').trim()
  if (!trimmed) {
    return { isValid: false, error: 'UTR number is required.' }
  }
  if (!/^\d+$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'UTR must contain only numeric digits (0-9). Alphabets and special characters are not allowed.',
    }
  }
  if (trimmed.length !== 12) {
    return {
      isValid: false,
      error: `UTR must be exactly 12 numeric digits (currently ${trimmed.length} digits).`,
    }
  }
  return { isValid: true, error: null }
}

/**
 * Computes the 48-hour payment deadline from an order creation timestamp.
 * Note: Never substitutes the current time when createdAt is missing or invalid.
 * Resubmission does not reset the original deadline.
 *
 * @param {string|Date|number} createdAt
 * @returns {{ deadlineDate: Date | null, formatted: string | null, isExpired: boolean, isUnavailable: boolean, deadlineMs?: number, error?: string }}
 */
export function computePhonepeDeadline(createdAt) {
  if (!createdAt) {
    return {
      deadlineDate: null,
      formatted: null,
      isExpired: false,
      isUnavailable: true,
      error: 'Order creation timestamp is unavailable.',
    }
  }

  const createdTime = new Date(createdAt).getTime()
  if (Number.isNaN(createdTime) || createdTime <= 0) {
    return {
      deadlineDate: null,
      formatted: null,
      isExpired: false,
      isUnavailable: true,
      error: 'Invalid order creation timestamp.',
    }
  }

  const deadlineMs = createdTime + 48 * 60 * 60 * 1000
  const deadlineDate = new Date(deadlineMs)
  const isExpired = Date.now() >= deadlineMs

  const formatted = deadlineDate.toLocaleString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  return { deadlineDate, formatted, isExpired, isUnavailable: false, deadlineMs }
}

/**
 * Calculates comprehensive financial breakdown for an order.
 * Handles missing fields and derives values from order items if needed.
 *
 * @param {object} order
 * @returns {{ subtotal: number, discountAmount: number, shippingAmount: number, totalAmount: number, couponCode: string | null }}
 */
export function getOrderFinancials(order) {
  if (!order) {
    return { subtotal: 0, discountAmount: 0, shippingAmount: 0, totalAmount: 0, couponCode: null }
  }

  const items = order.order_items || order.items || []
  let calculatedSubtotal = 0
  if (order.subtotal !== undefined && order.subtotal !== null) {
    calculatedSubtotal = Number(order.subtotal) || 0
  } else if (items.length > 0) {
    calculatedSubtotal = items.reduce((sum, item) => {
      const lineTotal = Number(item.total_price) || ((Number(item.unit_price) || 0) * (Number(item.quantity) || 1))
      return sum + lineTotal
    }, 0)
  } else {
    calculatedSubtotal = Number(order.total_amount) || 0
  }

  const discountAmount = Number(order.discount_amount) || 0

  let shippingAmount = 0
  if (order.shipping_amount !== undefined && order.shipping_amount !== null) {
    shippingAmount = Number(order.shipping_amount) || 0
  } else {
    // Standard rule: gross subtotal >= 999 qualifies for free delivery
    shippingAmount = calculatedSubtotal >= 999 ? 0 : (calculatedSubtotal > 0 ? 99 : 0)
  }

  let totalAmount = 0
  if (order.total_amount !== undefined && order.total_amount !== null) {
    totalAmount = Number(order.total_amount) || 0
  } else {
    totalAmount = Math.max(0, calculatedSubtotal - discountAmount + shippingAmount)
  }

  return {
    subtotal: calculatedSubtotal,
    discountAmount,
    shippingAmount,
    totalAmount,
    couponCode: order.coupon_code || null,
  }
}

/**
 * Derives comprehensive payment and verification status details for customer views.
 *
 * @param {object} order
 * @param {object|null} paymentData
 * @returns {object} status details
 */
export function getPaymentStatusInfo(order = {}, paymentData = null) {
  const payment = paymentData?.payment || order?.payment || null
  const provider = (payment?.provider || order?.payment_provider || 'cod').toLowerCase()
  const orderStatus = (order?.status || 'pending').toLowerCase()

  // Payment status determination
  let status = (payment?.status || '').toLowerCase()
  if (!status) {
    if (orderStatus === 'cancelled') {
      status = 'failed'
    } else if (orderStatus === 'refunded') {
      status = 'refunded'
    } else if (provider === 'cod') {
      // COD remains pending even if delivered, until admin collection confirmation
      status = 'pending'
    } else {
      status = 'pending'
    }
  }

  const isPhonePe = provider === 'phonepe'
  const isCod = provider === 'cod'

  // Submissions
  const subs = (paymentData?.submissions || order?.payment_submissions || []).slice()
  const activeSub = paymentData?.activeSubmission || order?.activeSubmission || subs.find(s => s.status === 'submitted') || null
  const latestSub = paymentData?.latestSubmission || order?.latestSubmission || subs[0] || null

  // 48-Hour Deadline
  const deadline = computePhonepeDeadline(order?.created_at)

  // Status flags
  const isRefunded = orderStatus === 'refunded' || status === 'refunded'
  const isCancelled = orderStatus === 'cancelled' || status === 'failed'

  // Authoritative payment completion strictly requires payment status === 'completed'.
  // An order in 'processing' or 'delivered' must NEVER be inferred as paid while payment is pending.
  const isCompleted = !isRefunded && !isCancelled && status === 'completed'

  const isAwaitingVerification = isPhonePe && !isCompleted && !isCancelled && !isRefunded && activeSub?.status === 'submitted'
  const isUtrRejected = isPhonePe && !isCompleted && !isCancelled && !isRefunded && !activeSub && latestSub?.status === 'rejected'
  const isPaymentPending = !isCompleted && !isCancelled && !isRefunded && !isAwaitingVerification

  // Resubmission eligibility
  const canResubmitUtr = isUtrRejected && !deadline.isExpired && !deadline.isUnavailable && !isCancelled && !isCompleted
  const canSubmitFirstUtr = isPhonePe && !activeSub && !latestSub && !deadline.isExpired && !deadline.isUnavailable && !isCancelled && !isCompleted

  // Refund reference: strictly inspect actual refund_reference field; never substitute provider_payment_id
  const refundReference = payment?.refund_reference || order?.payment?.refund_reference || null

  // Badge config
  let badgeLabel = 'Payment Pending'
  let badgeClass = 'bg-yellow-50 text-yellow-800 border-yellow-200'

  if (isRefunded) {
    badgeLabel = 'Refunded'
    badgeClass = 'bg-slate-100 text-slate-800 border-slate-300'
  } else if (isCancelled) {
    badgeLabel = 'Cancelled / Expired'
    badgeClass = 'bg-red-50 text-red-700 border-red-200'
  } else if (isCompleted) {
    badgeLabel = isCod ? 'COD Collected & Verified' : 'Payment Verified'
    badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200'
  } else if (isAwaitingVerification) {
    badgeLabel = 'UTR Awaiting Verification'
    badgeClass = 'bg-blue-50 text-blue-800 border-blue-200'
  } else if (isUtrRejected) {
    badgeLabel = 'UTR Rejected'
    badgeClass = 'bg-amber-50 text-amber-800 border-amber-300'
  } else if (isCod) {
    badgeLabel = orderStatus === 'delivered' ? 'Collection Verification Pending' : 'Payment Due Upon Delivery'
    badgeClass = 'bg-amber-50 text-amber-800 border-amber-200'
  }

  return {
    provider,
    status,
    orderStatus,
    isPhonePe,
    isCod,
    isCompleted,
    isCancelled,
    isRefunded,
    isPending: isPaymentPending,
    isAwaitingVerification,
    isUtrRejected,
    canResubmitUtr,
    canSubmitFirstUtr,
    activeSub,
    latestSub,
    deadline,
    refundReference,
    badge: {
      label: badgeLabel,
      className: badgeClass,
    },
  }
}
