import { useState, useMemo, useEffect } from 'react'
import {
  QrCode,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Copy,
  Check,
  ShieldCheck,
  Smartphone,
  RotateCcw,
} from 'lucide-react'
import { submitPhonepeUtr } from '../../services/orderService'
import { formatPrice } from '../../utils/format'
import { validateUtrFormat, computePhonepeDeadline } from '../../utils/paymentHelpers'

export const DEFAULT_PUBLIC_QR_PATH = '/phonepe-qr.png'

/**
 * Pure logic helper: resolves candidate QR image URL from prop, env, or public default.
 */
export function resolveQrImageSrc(propUrl, envUrl, defaultPath = DEFAULT_PUBLIC_QR_PATH) {
  if (propUrl !== undefined) {
    return propUrl
  }
  return envUrl || defaultPath
}

/**
 * Pure logic helper: calculates next fallback QR source when image loading fails.
 * When an environment URL or explicitly supplied custom QR URL fails to load, attempts defaultPath (/phonepe-qr.png).
 * If the fallback itself fails or is already exhausted, returns null to trigger administrative setup placeholder.
 */
export function getNextQrFallback(currentSrc, defaultPath = DEFAULT_PUBLIC_QR_PATH) {
  if (currentSrc && currentSrc !== defaultPath) {
    return defaultPath
  }
  return null
}

/**
 * PhonePePaymentSection — Customer PhonePe QR & 12-digit UTR checkout component.
 *
 * Displays:
 * 1. 48-hour submission deadline (authoritative deadline anchored to order creation).
 * 2. Static PhonePe QR code container with exact payable amount reminder.
 *    - Uses VITE_PHONEPE_QR_IMAGE_URL if configured, or explicit custom qrImageUrl prop.
 *    - Falls back to /phonepe-qr.png when custom/env QR fails or is unconfigured.
 *    - Displays administrative setup placeholder if fallback also fails or neither exists.
 * 3. 12-digit numeric UTR input with real-time feedback & double-submission lock.
 * 4. Submission confirmation awaiting administrator verification.
 * 5. Rejection and resubmission alerts (retaining the original 48-hour deadline).
 */
export default function PhonePePaymentSection({
  order,
  activeSubmission: initialActiveSubmission = null,
  latestSubmission: initialLatestSubmission = null,
  onUtrSubmitted = null,
  qrImageUrl,
  client,
  configured,
}) {
  const [utrInput, setUtrInput] = useState('')
  const [upiIdInput, setUpiIdInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
  const [submissionSuccess, setSubmissionSuccess] = useState('')
  const [copiedAmount, setCopiedAmount] = useState(false)

  // QR Asset Resolution:
  // 1. Explicit prop qrImageUrl (if provided). If null, explicitly no image.
  // 2. VITE_PHONEPE_QR_IMAGE_URL environment variable if defined.
  // 3. Fallback to '/phonepe-qr.png' (standard public directory asset).
  const envQrUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PHONEPE_QR_IMAGE_URL
      ? import.meta.env.VITE_PHONEPE_QR_IMAGE_URL
      : null

  const resolvedInitialQr = useMemo(() => {
    return resolveQrImageSrc(qrImageUrl, envQrUrl, DEFAULT_PUBLIC_QR_PATH)
  }, [qrImageUrl, envQrUrl])

  const [currentQrSrc, setCurrentQrSrc] = useState(resolvedInitialQr)
  const [qrImgFailed, setQrImgFailed] = useState(!resolvedInitialQr)

  useEffect(() => {
    setCurrentQrSrc(resolvedInitialQr)
    setQrImgFailed(!resolvedInitialQr)
  }, [resolvedInitialQr])

  function handleQrImageError() {
    // When an environment URL or explicitly supplied custom QR URL fails, attempt /phonepe-qr.png as fallback
    const fallbackSrc = getNextQrFallback(currentQrSrc, DEFAULT_PUBLIC_QR_PATH)
    if (fallbackSrc) {
      setCurrentQrSrc(fallbackSrc)
    } else {
      // If '/phonepe-qr.png' also fails (or was already the source), activate administrative setup placeholder
      setQrImgFailed(true)
    }
  }

  // Local state for active submission to provide instant feedback without requiring a full reload
  const [activeSub, setActiveSub] = useState(initialActiveSubmission)
  const [latestSub, setLatestSub] = useState(initialLatestSubmission)

  const orderTotal = order?.total_amount || 0
  const orderCreatedAt = order?.created_at || null

  const deadlineInfo = useMemo(() => {
    return computePhonepeDeadline(orderCreatedAt)
  }, [orderCreatedAt])

  // UTR Validation state (evaluates exact raw input without silently stripping characters)
  const validation = useMemo(() => {
    const trimmed = utrInput.trim()
    if (!trimmed) {
      return { isValid: false, message: 'Enter the 12-digit UTR from your UPI payment app.', error: null }
    }
    return validateUtrFormat(trimmed)
  }, [utrInput])

  function handleUtrInputChange(e) {
    setSubmissionError('')
    setSubmissionSuccess('')
    // Do NOT silently transform or strip characters.
    // The user must see what they type/paste so validation errors can be corrected.
    setUtrInput(e.target.value)
  }

  function handleCopyAmount() {
    if (orderTotal) {
      navigator.clipboard?.writeText(String(orderTotal))
      setCopiedAmount(true)
      setTimeout(() => setCopiedAmount(false), 2000)
    }
  }

  async function handleSubmitUtr(e) {
    if (e) e.preventDefault()
    if (isSubmitting) return

    if (deadlineInfo.isExpired) {
      setSubmissionError('The 48-hour payment window for this order has expired. UTR submissions are no longer accepted.')
      return
    }

    const cleanUpiId = upiIdInput.trim()
    if (!/^[^\s@]+@[^\s@]+$/.test(cleanUpiId)) {
      setSubmissionError('Enter a valid UPI ID (for example, name@bank).')
      return
    }

    const formatCheck = validateUtrFormat(utrInput)
    if (!formatCheck.isValid) {
      setSubmissionError(formatCheck.error || 'Invalid UTR format.')
      return
    }

    if (!order?.id) {
      setSubmissionError('Order information is missing. Please refresh the page.')
      return
    }

    setIsSubmitting(true)
    setSubmissionError('')
    setSubmissionSuccess('')

    try {
      // NOTE: submitPhonepeUtr strictly omits any client-side timestamp argument.
      const result = await submitPhonepeUtr(
        {
          orderId: order.id,
          utrNumber: utrInput.trim(),
          upiId: cleanUpiId,
        },
        client,
        configured
      )

      if (result.error) {
        setSubmissionError(
          result.error.message || 'Failed to submit UTR. Please verify and try again.'
        )
      } else {
        if (!result.data || !result.data.id) {
          setSubmissionError(
            'The server did not confirm your UTR submission. Please refresh the order and check its payment status before trying again.'
          )
          return
        }

        const submittedRecord = result.data

        setActiveSub(submittedRecord)
        setLatestSub(submittedRecord)
        setSubmissionSuccess(
          `UTR ${utrInput.trim()} submitted successfully! Your payment is now awaiting administrator verification.`
        )
        setUtrInput('')
        setUpiIdInput('')

        if (typeof onUtrSubmitted === 'function') {
          onUtrSubmitted(submittedRecord)
        }
      }
    } catch (err) {
      console.error('[PhonePePaymentSection] Error submitting UTR:', err)
      setSubmissionError(err?.message || 'An unexpected error occurred while submitting UTR.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isOrderCancelledOrExpired =
    order?.status === 'cancelled' ||
    order?.payment?.status === 'failed' ||
    order?.status === 'refunded'

  const isPaymentCompleted = order?.payment?.status === 'completed'

  const hasNonDigits = /\D/.test(utrInput.trim())
  const isTooShort = utrInput.trim().length > 0 && utrInput.trim().length < 12 && !hasNonDigits
  const isTooLong = utrInput.trim().length > 12 && !hasNonDigits
  const isExact12Digits = utrInput.trim().length === 12 && validation.isValid

  return (
    <div className="bg-white rounded-2xl border border-sky-100 p-4 sm:p-5 shadow-[0_8px_24px_rgba(30,64,110,0.07)] space-y-3.5">
      {/* ── Section Header ── */}
      <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <QrCode size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>PhonePe UPI QR Payment</span>
              <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Direct UPI
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              {!qrImgFailed && currentQrSrc
                ? 'Scan with PhonePe or any UPI app and enter the 12-digit UTR reference'
                : 'Payment QR unavailable — enter UTR only if you already paid via verified merchant channel'}
            </p>
          </div>
        </div>

        {/* Payment Status Pill */}
        <div>
          {isPaymentCompleted ? (
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full">
              <CheckCircle2 size={14} /> Payment Verified
            </span>
          ) : activeSub?.status === 'submitted' ? (
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold px-3 py-1 rounded-full">
              <Clock size={14} className="animate-pulse" /> UTR Awaiting Verification
            </span>
          ) : isOrderCancelledOrExpired || deadlineInfo.isExpired ? (
            <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-bold px-3 py-1 rounded-full">
              <XCircle size={14} /> Order Cancelled / Expired
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-1 rounded-full">
              <Clock size={14} /> Pending Payment & UTR
            </span>
          )}
        </div>
      </div>

      {/* ── 48-Hour Deadline Alert Banner ── */}
      {!isPaymentCompleted && !isOrderCancelledOrExpired && (
        <>
          {deadlineInfo.isUnavailable ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Order Creation Timestamp Unavailable</p>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  The order creation timestamp could not be verified on the client. The database strictly enforces the 48-hour payment window based on server time.
                </p>
              </div>
            </div>
          ) : deadlineInfo.isExpired ? (
            <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-950">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">48-Hour Payment Window Elapsed</p>
                <p className="text-amber-900 leading-relaxed text-[11px]">
                  The 48-hour payment deadline for this order passed on <strong className="underline">{deadlineInfo.formatted}</strong>. Submissions past the deadline will be rejected by the server unless already under administrator review.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-purple-900">
              <Clock size={18} className="text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">48-Hour Payment Window</p>
                <p className="text-purple-800 leading-relaxed text-[11px]">
                  Please submit your 12-digit UTR before{' '}
                  <strong className="underline decoration-purple-300">{deadlineInfo.formatted}</strong>.
                  Orders without a submitted UTR within 48 hours are automatically cancelled.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Rejection Notice Banner (if previous submission was rejected) ── */}
      {!isPaymentCompleted && !activeSub && latestSub?.status === 'rejected' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
            <span>Previous UTR Submission Was Rejected</span>
          </div>
          <p className="text-[11px] text-amber-700 leading-relaxed">
            The previous UTR ({latestSub.utr_number}) was reviewed and rejected by the administrator.
            {latestSub.admin_notes && (
              <span className="block mt-1 font-medium text-amber-900">
                {latestSub.admin_notes}
              </span>
            )}
            {latestSub.admin_notes?.startsWith('The amount received is insufficient.') && (
              <span className="block mt-2 rounded-xl border border-amber-200 bg-white p-3 text-amber-950 not-italic">
                <strong className="block">Refund destination</strong>
                <span className="block font-mono">{latestSub.upi_id || 'UPI ID not available for this older submission'}</span>
                <span className="block mt-1">Our team will manually process the refund within 48 hours.</span>
              </span>
            )}
          </p>
          {!deadlineInfo.isExpired ? (
            <p className="text-[11px] text-amber-800 font-semibold flex items-center gap-1">
              <RotateCcw size={13} /> You may submit a corrected 12-digit UTR below within the original 48-hour deadline.
            </p>
          ) : (
            <p className="text-[11px] text-red-700 font-semibold flex items-center gap-1">
              <XCircle size={13} /> The 48-hour deadline has expired. Resubmissions are no longer permitted.
            </p>
          )}
        </div>
      )}

      {/* ── Expired Window Notice (When expired and no active submission) ── */}
      {!isPaymentCompleted && !isOrderCancelledOrExpired && !activeSub && deadlineInfo.isExpired && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center space-y-2">
          <XCircle size={28} className="text-red-500 mx-auto" />
          <h3 className="font-bold text-sm text-red-900">48-Hour Payment Window Has Expired</h3>
          <p className="text-xs text-red-700 max-w-md mx-auto leading-relaxed">
            The 48-hour payment deadline for this order passed on <strong>{deadlineInfo.formatted}</strong>. New UTR submissions and resubmissions are no longer accepted for this order.
          </p>
        </div>
      )}

      {/* ── Expired / Cancelled Banner ── */}
      {isOrderCancelledOrExpired && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-red-800">
            <XCircle size={18} className="flex-shrink-0" />
            <span>Payment Window Expired or Order Cancelled</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            This order is no longer eligible for payment verification. If money was deducted from your bank account,
            please contact support with your transaction details for assistance, or place a new order.
          </p>
        </div>
      )}

      {/* ── Payment Completed Banner ── */}
      {isPaymentCompleted && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-5 text-center space-y-2">
          <CheckCircle2 size={32} className="text-emerald-600 mx-auto" />
          <h3 className="font-bold text-sm text-emerald-900">Payment Successfully Verified!</h3>
          <p className="text-xs text-emerald-700 max-w-md mx-auto">
            Your PhonePe payment has been confirmed by our team. Your order is now being processed for delivery.
          </p>
        </div>
      )}

      {/* ── Active Submission Awaiting Verification Card ── */}
      {activeSub?.status === 'submitted' && !isPaymentCompleted && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
            <span className="text-xs font-bold text-blue-900 flex items-center gap-2">
              <ShieldCheck size={16} className="text-blue-600" />
              UTR Submitted — Awaiting Review
            </span>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full">
              Under Verification
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[11px] text-blue-600 font-medium">Submitted 12-Digit UTR</p>
              <p className="text-sm font-bold text-blue-950 font-mono tracking-wider">
                {activeSub.utr_number}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-blue-600 font-medium">Verification Status</p>
              <p className="text-xs font-semibold text-blue-900">
                Pending Administrator Approval
              </p>
            </div>
          </div>

          <p className="text-[11px] text-blue-700 leading-relaxed pt-1">
            Our finance team matches UTR numbers directly against PhonePe Business statements.
            Your order will remain pending until approved. You do not need to resubmit unless requested by our team.
          </p>
        </div>
      )}

      {/* ── Middle: QR Code & Payment Instructions (Shown when pending, within deadline, and no active submission) ── */}
      {!isPaymentCompleted && !isOrderCancelledOrExpired && !activeSub && !deadlineInfo.isExpired && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center bg-sky-50/60 border border-sky-100 rounded-2xl p-3">
          {/* QR Code Frame or Unmistakable Configuration Placeholder */}
          <div className="flex flex-col items-center justify-center text-center space-y-2">
            {!qrImgFailed && currentQrSrc ? (
              <div className="relative p-2.5 bg-white rounded-2xl border border-purple-200 shadow-sm">
                <img
                  src={currentQrSrc}
                  alt="PhonePe QR Code"
                  onError={handleQrImageError}
                  className="w-36 h-36 sm:w-40 sm:h-40 object-contain rounded-2xl"
                />

                {/* Scanning Corner Guides */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-purple-500 rounded-tl" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-purple-500 rounded-tr" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-purple-500 rounded-bl" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-purple-500 rounded-br" />
              </div>
            ) : (
              /* Unmistakable Administrative Setup Placeholder (NOT presented as a usable payment QR) */
              <div className="w-full h-full min-h-[170px] rounded-2xl bg-amber-50/70 border-2 border-dashed border-amber-300 p-3 flex flex-col items-center justify-center text-center space-y-2.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Merchant QR Not Configured
                  </h3>
                  <p className="text-[11px] text-amber-800 font-medium mt-1 leading-relaxed max-w-xs">
                    Payment cannot be initiated via QR scan at this time. The store administrator has not yet configured the merchant PhonePe QR code.
                  </p>
                </div>
                <div className="bg-white/80 border border-amber-200 rounded-xl px-3 py-2 text-[10px] text-slate-600 font-mono text-left space-y-0.5">
                  <p className="font-sans font-bold text-slate-700">Store Setup Required:</p>
                  <p>1. Place QR image at <span className="text-amber-800 font-bold">public/phonepe-qr.png</span></p>
                  <p>2. Or configure <span className="text-amber-800 font-bold">VITE_PHONEPE_QR_IMAGE_URL</span></p>
                </div>
              </div>
            )}

            {!qrImgFailed && currentQrSrc && (
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Smartphone size={13} className="text-purple-600" />
                Scan with PhonePe, GPay, Paytm, or BHIM UPI
              </p>
            )}
          </div>

          {/* Payment Instructions & Amount Card */}
          <div className="space-y-2.5 text-xs flex flex-col justify-between">
            {/* Payable Amount Highlight */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-1">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Exact Amount to Pay
              </p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-purple-700">
                  {formatPrice(orderTotal)}
                </span>
                <button
                  type="button"
                  onClick={handleCopyAmount}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg transition-colors"
                  title="Copy exact amount"
                >
                  {copiedAmount ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedAmount ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[11px] text-amber-700 font-medium">
                ⚠️ Pay the exact amount to avoid verification failure or delay.
              </p>
            </div>

            {/* Steps Checklist or Missing-QR Note */}
            {!qrImgFailed && currentQrSrc ? (
              <div className="space-y-1.5 text-slate-600">
                <p className="font-bold text-slate-800 text-xs">How to Complete Payment:</p>
                <ol className="space-y-1.5 text-[11px] list-decimal list-inside leading-relaxed text-slate-600">
                  <li>Open your UPI app (<span className="font-semibold text-purple-700">PhonePe</span>, GPay, Paytm).</li>
                  <li>Scan the QR code on the left.</li>
                  <li>Enter the exact amount: <strong className="text-slate-900">{formatPrice(orderTotal)}</strong>.</li>
                  <li>Complete the payment with your UPI PIN.</li>
                  <li>Locate the <strong>12-digit UTR / UPI Ref ID</strong> in your payment details.</li>
                  <li>Enter the 12 digits below and submit.</li>
                </ol>
              </div>
            ) : (
              <div className="bg-amber-50/60 rounded-2xl p-4 text-[11px] text-amber-950 space-y-2 border border-amber-200/80">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-amber-700 flex-shrink-0" />
                  <span>Payment Initiation Unavailable</span>
                </p>
                <p className="text-amber-900/90 leading-relaxed">
                  New payments cannot be initiated through this screen while merchant QR and payment details remain unconfigured.
                </p>
                <div className="pt-2 border-t border-amber-200/60 space-y-1">
                  <p className="font-semibold text-slate-800">Already paid through verified channel?</p>
                  <p className="leading-relaxed text-[11px] text-slate-600">
                    Submit your 12-digit UTR below <strong className="text-slate-900 underline">only if you have already transferred {formatPrice(orderTotal)}</strong> through an officially verified merchant payment channel. Unmatched or unverified UTR submissions will be rejected by the administrator.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 12-Digit UTR Input Form (Available only within 48-hour deadline and when not under review) ── */}
      {!isPaymentCompleted && !isOrderCancelledOrExpired && !activeSub && !deadlineInfo.isExpired && (
        <form onSubmit={handleSubmitUtr} className="space-y-2.5 pt-1">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">Your UPI ID used for payment *</label>
            <input type="text" value={upiIdInput} onChange={e => { setUpiIdInput(e.target.value); setSubmissionError('') }} disabled={isSubmitting} placeholder="e.g. yourname@okaxis" autoComplete="off" className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none" />
            <p className="text-[11px] text-slate-400">This is your UPI ID (VPA), not the 12-digit UTR. It is used only if a refund is required.</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Enter 12-Digit UTR / UPI Reference Number *
            </label>
            <div className="relative">
              <input
                type="text"
                value={utrInput}
                onChange={handleUtrInputChange}
                disabled={isSubmitting}
                placeholder="e.g. 432109876543 (exactly 12 numeric digits)"
                className={`w-full text-xs font-mono tracking-wider p-2.5 rounded-xl border transition-all focus:outline-none ${
                  isExact12Digits
                    ? 'border-emerald-500 bg-emerald-50/20 ring-2 ring-emerald-500/20'
                    : hasNonDigits || isTooLong
                    ? 'border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-500/20'
                    : isTooShort
                    ? 'border-amber-400 bg-amber-50/20 focus:ring-2 focus:ring-amber-500/20'
                    : 'border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                }`}
              />
              <div className="absolute right-3.5 top-3.5 text-xs font-bold font-mono text-slate-400">
                {utrInput.trim().length}/12
              </div>
            </div>

            {/* Live Validation Feedback */}
            <div className="text-[11px]">
              {hasNonDigits ? (
                <p className="text-red-600 font-semibold flex items-center gap-1">
                  <AlertCircle size={13} /> Invalid character: UTR must contain only numeric digits (0-9). Alphabets and special characters are not allowed.
                </p>
              ) : isTooLong ? (
                <p className="text-red-600 font-semibold flex items-center gap-1">
                  <AlertCircle size={13} /> UTR is too long ({utrInput.trim().length} digits). Exactly 12 numeric digits are required.
                </p>
              ) : isExact12Digits ? (
                <p className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check size={13} /> ✓ 12-digit numeric UTR verified. Ready to submit.
                </p>
              ) : isTooShort ? (
                <p className="text-amber-600 font-medium">
                  {utrInput.trim().length}/12 digits entered ({12 - utrInput.trim().length} more required).
                </p>
              ) : (
                <p className="text-slate-400">
                  {validation.message}
                </p>
              )}
            </div>
          </div>

          {/* Submission Error Alert */}
          {submissionError && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3 flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{submissionError}</span>
            </div>
          )}

          {/* Submission Success Banner */}
          {submissionSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl p-3 flex items-center gap-2">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              <span>{submissionSuccess}</span>
            </div>
          )}

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={!validation.isValid || isSubmitting}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm py-3 px-5 rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Submitting UTR to ShopKart...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>
                  {latestSub?.status === 'rejected' ? 'Resubmit 12-Digit UTR' : 'Submit 12-Digit UTR'}
                </span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
