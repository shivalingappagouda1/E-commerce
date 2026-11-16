import { useState, useEffect, useMemo } from 'react'
import {
  CreditCard,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  RotateCcw,
  Banknote,
  QrCode,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react'
import {
  adminFetchOrders,
  adminVerifyUtr,
  adminConfirmCodPayment,
  adminRecordRefund,
  adminExpirePendingPhonepeOrders,
} from '../../services/adminService'
import { formatPrice } from '../../utils/format'
import { computePhonepeDeadline } from '../../utils/paymentHelpers'

const PAYMENT_STATUS_BADGE = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-purple-50 text-purple-700 border-purple-200',
  failed: 'bg-slate-100 text-slate-700 border-slate-200',
}

const ORDER_STATUS_BADGE = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-purple-50 text-purple-700 border-purple-200',
}

export default function AdminPaymentVerificationPage({
  initialOrders = null,
  initialSelectedOrder = null,
  initialActiveDialog = null,
} = {}) {
  const [orders, setOrders] = useState(initialOrders || [])
  const [loading, setLoading] = useState(!initialOrders)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [utrFilter, setUtrFilter] = useState('all')

  // Selected Order for Inspection Drawer / Modal
  const [selectedOrder, setSelectedOrder] = useState(initialSelectedOrder)
  const [copiedUtr, setCopiedUtr] = useState(false)

  // Dialog States
  const [activeDialog, setActiveDialog] = useState(initialActiveDialog) // 'approve' | 'reject' | 'cod' | 'refund'
  const [isSubmittingAction, setIsSubmittingAction] = useState(false)
  const [actionError, setActionError] = useState('')

  // Form fields for actions
  const [rejectionReason, setRejectionReason] = useState('')
  const [adminNotesInput, setAdminNotesInput] = useState('')
  const [refundReference, setRefundReference] = useState('')
  const [restockInventory, setRestockInventory] = useState(false)
  const [confirmCertified, setConfirmCertified] = useState(false)

  // Batch expiry execution state
  const [isExpiringOrders, setIsExpiringOrders] = useState(false)

  useEffect(() => {
    if (!initialOrders) {
      loadOrders()
    }
  }, [initialOrders])

  async function loadOrders() {
    setLoading(true)
    setError('')
    try {
      const res = await adminFetchOrders()
      if (res.error) {
        setError(res.error.message || 'Failed to load order payments.')
        setOrders([])
      } else {
        setOrders(res.data || [])
      }
    } catch (err) {
      setError(err?.message || 'Unexpected error loading payment records.')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  // ── Derived Summary Metrics (Calculated 100% from existing real data) ──
  const metrics = useMemo(() => {
    let pendingUtr = 0
    let approvedPayments = 0
    let rejectedPayments = 0
    let pendingCod = 0
    let refundedOrders = 0

    orders.forEach(o => {
      const provider = o.payment?.provider || o.payment_provider || 'cod'
      const payStatus = o.payment?.status || 'pending'
      const hasActiveSub = o.activeSubmission?.status === 'submitted' ||
        (o.payment_submissions || []).some(s => s.status === 'submitted')

      // 1. Pending UTR: PhonePe order with submitted UTR awaiting verification
      if (provider === 'phonepe' && hasActiveSub && payStatus !== 'completed') {
        pendingUtr++
      }

      // 2. Approved Payments: Payment verified
      if (payStatus === 'completed') {
        approvedPayments++
      }

      // 3. Rejected Payments: PhonePe order with rejection or failed payment
      const hasRejectedSub = (o.payment_submissions || []).some(s => s.status === 'rejected')
      if (provider === 'phonepe' && (hasRejectedSub || payStatus === 'failed') && payStatus !== 'completed') {
        rejectedPayments++
      }

      // 4. Pending COD: COD order awaiting cash collection
      if (provider === 'cod' && payStatus === 'pending') {
        pendingCod++
      }

      // 5. Refunded: Order or payment marked as refunded
      if (o.status === 'refunded' || payStatus === 'refunded') {
        refundedOrders++
      }
    })

    return {
      pendingUtr,
      approvedPayments,
      rejectedPayments,
      pendingCod,
      refundedOrders,
      totalOrders: orders.length,
    }
  }, [orders])

  // ── Filtered & Searched Orders ──
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const provider = (o.payment?.provider || o.payment_provider || 'cod').toLowerCase()
      const payStatus = (o.payment?.status || 'pending').toLowerCase()
      const submissions = o.payment_submissions || []
      const activeSub = o.activeSubmission || submissions.find(s => s.status === 'submitted') || null

      // Search matching Order ID, Customer Name/Phone/Email, or UTR Number
      const term = searchTerm.trim().toLowerCase()
      let matchesSearch = true
      if (term) {
        const orderIdMatch = o.id && o.id.toLowerCase().includes(term)
        const customerNameMatch = (o.customer_name || o.profiles?.full_name || o.address?.full_name || '').toLowerCase().includes(term)
        const customerPhoneMatch = (o.customer_phone || o.profiles?.phone || o.address?.phone || '').toLowerCase().includes(term)
        const utrMatch = submissions.some(s => s.utr_number && s.utr_number.toLowerCase().includes(term))
        matchesSearch = orderIdMatch || customerNameMatch || customerPhoneMatch || utrMatch
      }

      // Method filter
      let matchesMethod = true
      if (methodFilter !== 'all') {
        matchesMethod = provider === methodFilter
      }

      // Payment Status filter
      let matchesStatus = true
      if (statusFilter !== 'all') {
        matchesStatus = payStatus === statusFilter
      }

      // UTR Status filter
      let matchesUtr = true
      if (utrFilter === 'submitted') {
        matchesUtr = activeSub?.status === 'submitted'
      } else if (utrFilter === 'approved') {
        matchesUtr = submissions.some(s => s.status === 'approved')
      } else if (utrFilter === 'rejected') {
        matchesUtr = submissions.some(s => s.status === 'rejected')
      } else if (utrFilter === 'none') {
        matchesUtr = submissions.length === 0
      }

      return matchesSearch && matchesMethod && matchesStatus && matchesUtr
    })
  }, [orders, searchTerm, methodFilter, statusFilter, utrFilter])

  // ── Dialog Opener Helpers ──
  function openApproveDialog(order) {
    setSelectedOrder(order)
    setActionError('')
    setAdminNotesInput('Verified in PhonePe Business dashboard')
    setConfirmCertified(false)
    setActiveDialog('approve')
  }

  function openRejectDialog(order) {
    setSelectedOrder(order)
    setActionError('')
    setRejectionReason('')
    setActiveDialog('reject')
  }

  function openCodDialog(order) {
    if (order.status !== 'delivered') {
      setFeedback({
        type: 'error',
        message: `COD confirmation is only permitted after physical delivery (current status: ${order.status}).`,
      })
      return
    }
    setSelectedOrder(order)
    setActionError('')
    setAdminNotesInput('Cash collected upon physical delivery')
    setConfirmCertified(false)
    setActiveDialog('cod')
  }

  function openRefundDialog(order) {
    setSelectedOrder(order)
    setActionError('')
    setRefundReference('')
    setAdminNotesInput('')
    setRestockInventory(false)
    setConfirmCertified(false)
    setActiveDialog('refund')
  }

  function closeDialog() {
    setActiveDialog(null)
    setActionError('')
    setIsSubmittingAction(false)
  }

  // ── Action Handlers ──
  async function handleApproveUtr(e) {
    if (e) e.preventDefault()
    if (!selectedOrder) return

    const sub = selectedOrder.activeSubmission ||
      (selectedOrder.payment_submissions || []).find(s => s.status === 'submitted')

    if (!sub?.id) {
      setActionError('No active UTR submission found to approve.')
      return
    }

    if (!confirmCertified) {
      setActionError('Please confirm that you have manually verified this UTR in PhonePe Business.')
      return
    }

    setIsSubmittingAction(true)
    setActionError('')

    try {
      const res = await adminVerifyUtr({
        submissionId: sub.id,
        approved: true,
        adminNotes: adminNotesInput.trim() || null,
      })

      if (res.error) {
        setActionError(res.error.message || 'Verification approval failed.')
      } else {
        setFeedback({
          type: 'success',
          message: `Payment for Order ${selectedOrder.id} successfully verified and approved!`,
        })
        closeDialog()
        await loadOrders()
      }
    } catch (err) {
      setActionError(err?.message || 'Error executing payment approval.')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  async function handleRejectUtr(e) {
    if (e) e.preventDefault()
    if (!selectedOrder) return

    const sub = selectedOrder.activeSubmission ||
      (selectedOrder.payment_submissions || []).find(s => s.status === 'submitted')

    if (!sub?.id) {
      setActionError('No active UTR submission found to reject.')
      return
    }

    const reason = rejectionReason.trim()
    if (!reason) {
      setActionError('A meaningful rejection reason is required so the customer can correct it.')
      return
    }

    setIsSubmittingAction(true)
    setActionError('')

    try {
      const res = await adminVerifyUtr({
        submissionId: sub.id,
        approved: false,
        adminNotes: reason,
      })

      if (res.error) {
        setActionError(res.error.message || 'Rejection failed.')
      } else {
        setFeedback({
          type: 'success',
          message: `UTR submission for Order ${selectedOrder.id} rejected. Customer may resubmit within the original 48-hour window.`,
        })
        closeDialog()
        await loadOrders()
      }
    } catch (err) {
      setActionError(err?.message || 'Error executing UTR rejection.')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  async function handleConfirmCod(e) {
    if (e) e.preventDefault()
    if (!selectedOrder?.id) return

    if (selectedOrder.status !== 'delivered') {
      setActionError("COD payment can only be confirmed once the order status is 'delivered'.")
      return
    }

    if (!confirmCertified) {
      setActionError('Please certify that cash has actually been collected upon physical delivery.')
      return
    }

    setIsSubmittingAction(true)
    setActionError('')

    try {
      const res = await adminConfirmCodPayment({
        orderId: selectedOrder.id,
        adminNotes: adminNotesInput.trim() || null,
      })

      if (res.error) {
        setActionError(res.error.message || 'COD confirmation failed.')
      } else {
        setFeedback({
          type: 'success',
          message: `COD cash collection confirmed for Order ${selectedOrder.id}. Payment marked completed.`,
        })
        closeDialog()
        await loadOrders()
      }
    } catch (err) {
      setActionError(err?.message || 'Error confirming COD payment.')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  async function handleRecordRefund(e) {
    if (e) e.preventDefault()
    if (!selectedOrder?.id) return

    const cleanRef = refundReference.trim()
    if (!cleanRef) {
      setActionError('A bank or payment refund reference / transaction ID is required.')
      return
    }

    if (!confirmCertified) {
      setActionError('Please certify that monetary funds have actually been transferred back to the customer.')
      return
    }

    setIsSubmittingAction(true)
    setActionError('')

    try {
      const res = await adminRecordRefund({
        orderId: selectedOrder.id,
        refundReference: cleanRef,
        adminNotes: adminNotesInput.trim() || null,
        restockInventory: Boolean(restockInventory),
      })

      if (res.error) {
        setActionError(res.error.message || 'Recording refund failed.')
      } else {
        let restockMsg = ''
        if (res.data?.restocked) {
          restockMsg = ' Inventory was restored.'
        } else if (restockInventory) {
          restockMsg = ' Note: Requested inventory restocking could not be completed (invalid item or product mapping). Refund recorded without restocking.'
        }
        setFeedback({
          type: 'success',
          message: `Refund recorded for Order ${selectedOrder.id}.${restockMsg ? ` ${restockMsg}` : ''}`,
        })
        closeDialog()
        await loadOrders()
      }
    } catch (err) {
      setActionError(err?.message || 'Error recording refund.')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  async function handleRunExpiryCheck() {
    setIsExpiringOrders(true)
    try {
      const res = await adminExpirePendingPhonepeOrders()
      if (res.error) {
        setFeedback({ type: 'error', message: res.error.message || 'Failed to run expiration check.' })
      } else {
        const count = res.data?.expired_count || 0
        setFeedback({
          type: 'success',
          message: `Expiration check complete. ${count} unpaid PhonePe ${count === 1 ? 'order was' : 'orders were'} cancelled.`,
        })
        await loadOrders()
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Error running order expiration.' })
    } finally {
      setIsExpiringOrders(false)
    }
  }

  function handleCopy(text) {
    if (text) {
      navigator.clipboard?.writeText(String(text))
      setCopiedUtr(true)
      setTimeout(() => setCopiedUtr(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header & Top Toolset ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Payment Verification</h1>
            <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
              Phase 6F
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review customer PhonePe UTR submissions, confirm COD cash collections, and manage refunds
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadOrders}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl shadow-xs transition-colors"
            title="Reload orders"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleRunExpiryCheck}
            disabled={isExpiringOrders}
            className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
            title="Scan and cancel PhonePe orders exceeding the 48-hour submission deadline"
          >
            {isExpiringOrders ? (
              <Loader2 size={14} className="animate-spin text-amber-600" />
            ) : (
              <Clock size={14} className="text-amber-600" />
            )}
            <span>Run Expiry Check</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback.message && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback({ type: '', message: '' })}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Summary Metric Cards (Computed 100% from actual data) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Pending UTR */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pending UTR</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <Clock size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">{metrics.pendingUtr}</p>
          <p className="text-[10px] text-slate-400">Awaiting admin approval</p>
        </div>

        {/* Approved Payments */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Approved</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-700">{metrics.approvedPayments}</p>
          <p className="text-[10px] text-slate-400">Verified & confirmed</p>
        </div>

        {/* Rejected Payments */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Rejected</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <XCircle size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-700">{metrics.rejectedPayments}</p>
          <p className="text-[10px] text-slate-400">Eligible for resubmission</p>
        </div>

        {/* Pending COD Collections */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pending COD</span>
            <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
              <Banknote size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">{metrics.pendingCod}</p>
          <p className="text-[10px] text-slate-400">Awaiting cash collection</p>
        </div>

        {/* Refunded Orders */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Refunded</span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <RotateCcw size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-purple-700">{metrics.refundedOrders}</p>
          <p className="text-[10px] text-slate-400">Recorded refunds</p>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by Order ID, UTR number, or customer name..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500 bg-slate-50/50"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-2.5 py-2 bg-slate-50/50 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="all">All Payment Methods</option>
            <option value="phonepe">PhonePe (UPI)</option>
            <option value="cod">Cash on Delivery (COD)</option>
          </select>

          {/* Payment Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-2.5 py-2 bg-slate-50/50 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="all">All Payment Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed / Verified</option>
            <option value="rejected">Rejected</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed / Expired</option>
          </select>

          {/* UTR Submission Filter */}
          <select
            value={utrFilter}
            onChange={e => setUtrFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-2.5 py-2 bg-slate-50/50 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="all">All Submissions</option>
            <option value="submitted">Awaiting Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="none">No UTR</option>
          </select>

          {/* Reset Filters */}
          {(searchTerm || methodFilter !== 'all' || statusFilter !== 'all' || utrFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setMethodFilter('all')
                setStatusFilter('all')
                setUtrFilter('all')
              }}
              className="px-2.5 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Payment Verification Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order Date</th>
                <th className="px-4 py-3">Payment Method</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">UTR Reference</th>
                <th className="px-4 py-3">Submitted At</th>
                <th className="px-4 py-3">Payment Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="9" className="text-center py-12 text-slate-400">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2 text-purple-600" />
                    <span>Loading payment verification records...</span>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-12 text-slate-400">
                    <CreditCard size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No payment records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search query or filters.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  const provider = (order.payment?.provider || order.payment_provider || 'cod').toLowerCase()
                  const isPhonePe = provider === 'phonepe'
                  const isCod = provider === 'cod'
                  const payStatus = order.payment?.status || 'pending'
                  const submissions = order.payment_submissions || []
                  const activeSub = order.activeSubmission || submissions.find(s => s.status === 'submitted') || null
                  const latestSub = submissions[0] || null

                  const customerName =
                    order.customer_name ||
                    order.profiles?.full_name ||
                    order.address?.full_name ||
                    'Customer'

                  const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })

                  const submittedAtStr = latestSub?.created_at
                    ? new Date(latestSub.created_at).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'

                  const deadline = isPhonePe ? computePhonepeDeadline(order.created_at) : null

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Order ID */}
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        {order.id}
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-slate-800 block">{customerName}</span>
                        {(order.customer_phone || order.profiles?.phone || order.address?.phone) && (
                          <span className="text-[10px] text-slate-400 block">
                            {order.customer_phone || order.profiles?.phone || order.address?.phone}
                          </span>
                        )}
                      </td>

                      {/* Order Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                        {dateStr}
                      </td>

                      {/* Payment Method */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isPhonePe ? (
                          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <QrCode size={11} /> PhonePe UPI
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <Banknote size={11} /> Cash on Delivery
                          </span>
                        )}
                      </td>

                      {/* Order Amount */}
                      <td className="px-4 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                        {formatPrice(order.total_amount)}
                      </td>

                      {/* UTR Number */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isPhonePe ? (
                          activeSub ? (
                            <div className="space-y-0.5">
                              <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                {activeSub.utr_number}
                              </span>
                              <span className="text-[10px] font-bold text-blue-600 block">
                                • Awaiting Review
                              </span>
                            </div>
                          ) : latestSub?.status === 'rejected' ? (
                            <div className="space-y-0.5">
                              <span className="font-mono text-slate-600 line-through">
                                {latestSub.utr_number}
                              </span>
                              <span className="text-[10px] font-bold text-amber-600 block">
                                • Rejected (Resubmission open)
                              </span>
                            </div>
                          ) : latestSub?.status === 'approved' ? (
                            <span className="font-mono font-bold text-emerald-800">
                              {latestSub.utr_number}
                            </span>
                          ) : deadline?.isExpired ? (
                            <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                              Window Elapsed
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              Awaiting Customer UTR
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Submitted At */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                        {submittedAtStr}
                      </td>

                      {/* Payment Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase ${
                            PAYMENT_STATUS_BADGE[payStatus] || PAYMENT_STATUS_BADGE.pending
                          }`}
                        >
                          {payStatus === 'completed' && <CheckCircle2 size={11} />}
                          {payStatus === 'pending' && <Clock size={11} />}
                          {payStatus === 'rejected' && <XCircle size={11} />}
                          {payStatus === 'refunded' && <RotateCcw size={11} />}
                          <span>{payStatus}</span>
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {isPhonePe && activeSub?.status === 'submitted' && (
                            <button
                              type="button"
                              onClick={() => openApproveDialog(order)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg transition-colors"
                            >
                              Approve
                            </button>
                          )}

                          {isCod && payStatus === 'pending' && order.status === 'delivered' && (
                            <button
                              type="button"
                              onClick={() => openCodDialog(order)}
                              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg transition-colors"
                            >
                              Collect COD
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors inline-flex items-center gap-1 font-semibold"
                            title="View full details"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Payment Details View Drawer / Modal ── */}
      {selectedOrder && !activeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-7 space-y-6 text-xs animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Payment Verification Inspection
                </span>
                <h2 className="text-base font-bold text-slate-900 font-mono mt-0.5">
                  Order: {selectedOrder.id}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Status Pill Bar */}
            <div className="flex flex-wrap items-center justify-between bg-slate-50 p-3.5 rounded-2xl border border-slate-100 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Order Status:</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                    ORDER_STATUS_BADGE[selectedOrder.status] || ORDER_STATUS_BADGE.pending
                  }`}
                >
                  {selectedOrder.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Payment Status:</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                    PAYMENT_STATUS_BADGE[selectedOrder.payment?.status || 'pending'] || PAYMENT_STATUS_BADGE.pending
                  }`}
                >
                  {selectedOrder.payment?.status || 'pending'}
                </span>
              </div>
            </div>

            {/* Customer & Shipping Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Customer Details</p>
                <p className="font-bold text-slate-800 text-sm">
                  {selectedOrder.customer_name || selectedOrder.profiles?.full_name || selectedOrder.address?.full_name || 'Customer'}
                </p>
                <p className="text-slate-500">
                  {selectedOrder.customer_email || selectedOrder.profiles?.email || 'Email not available'}
                </p>
                <p className="text-slate-500">
                  {selectedOrder.customer_phone || selectedOrder.profiles?.phone || selectedOrder.address?.phone || 'Phone not available'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Shipping Destination</p>
                <p className="text-slate-600 leading-relaxed">
                  {selectedOrder.address_summary || (
                    selectedOrder.address || selectedOrder.addresses ? (
                      `${(selectedOrder.address || selectedOrder.addresses).line1}, ${(selectedOrder.address || selectedOrder.addresses).city}, ${(selectedOrder.address || selectedOrder.addresses).state} - ${(selectedOrder.address || selectedOrder.addresses).pincode}`
                    ) : 'Standard Registered Address'
                  )}
                </p>
              </div>
            </div>

            {/* Financial Breakdown (Adhering to existing contract) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">
                Financial Breakdown
              </span>
              <div className="space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span>Product Subtotal</span>
                  <span className="font-semibold text-slate-800">
                    {formatPrice(selectedOrder.subtotal || selectedOrder.total_amount)}
                  </span>
                </div>
                {Number(selectedOrder.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Coupon Discount</span>
                    <span className="font-semibold">-{formatPrice(selectedOrder.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Shipping Fee</span>
                  <span className="font-semibold text-slate-800">
                    {Number(selectedOrder.shipping_amount) > 0 ? formatPrice(selectedOrder.shipping_amount) : 'Free'}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-bold text-slate-900">
                  <span>Final Payable Amount</span>
                  <span className="text-purple-700 font-black text-base">
                    {formatPrice(selectedOrder.total_amount)}
                  </span>
                </div>
              </div>
            </div>

            {/* UTR & Payment Submission History */}
            {((selectedOrder.payment?.provider || selectedOrder.payment_provider) === 'phonepe') ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    PhonePe UTR Submissions ({ (selectedOrder.payment_submissions || []).length })
                  </span>
                  {selectedOrder.created_at && (
                    <span className="text-[11px] text-slate-500">
                      Window: {computePhonepeDeadline(selectedOrder.created_at).formatted || '48 Hours'}
                    </span>
                  )}
                </div>

                {(selectedOrder.payment_submissions || []).length === 0 ? (
                  <div className="bg-slate-50 p-4 rounded-xl text-center text-slate-400 italic">
                    No UTR numbers submitted by customer yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(selectedOrder.payment_submissions || []).map((sub, idx) => (
                      <div
                        key={sub.id || idx}
                        className={`p-3.5 rounded-2xl border space-y-2 ${
                          sub.status === 'submitted'
                            ? 'bg-blue-50/70 border-blue-200'
                            : sub.status === 'approved'
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : 'bg-amber-50/70 border-amber-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-slate-900">
                              {sub.utr_number}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(sub.utr_number)}
                              className="text-slate-400 hover:text-slate-600 p-0.5"
                              title="Copy UTR"
                            >
                              {copiedUtr ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                            </button>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              sub.status === 'submitted'
                                ? 'bg-blue-100 text-blue-700'
                                : sub.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {sub.status === 'submitted' ? 'Awaiting Review' : sub.status}
                          </span>
                        </div>

                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>
                            Submitted: {sub.created_at ? new Date(sub.created_at).toLocaleString('en-IN') : 'N/A'}
                          </span>
                          {sub.reviewed_at && (
                            <span>
                              Reviewed: {new Date(sub.reviewed_at).toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>

                        {sub.admin_notes && (
                          <div className="bg-white/80 p-2 rounded-lg text-[11px] text-slate-700 border border-slate-100">
                            <strong>Admin Notes:</strong> "{sub.admin_notes}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* COD Information */
              <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-2">
                <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wide block">
                  Cash on Delivery Protocol
                </span>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Cash on Delivery orders remain unpaid until delivery is physically completed by the courier and cash is collected.
                </p>
                <div className="text-[11px] font-semibold text-amber-900">
                  Order Delivery Status: <span className="underline uppercase">{selectedOrder.status}</span>
                </div>
              </div>
            )}

            {/* Action Bar at Bottom of Modal */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2.5 justify-end">
              {/* PhonePe Actions */}
              {((selectedOrder.payment?.provider || selectedOrder.payment_provider) === 'phonepe') &&
                (selectedOrder.activeSubmission || (selectedOrder.payment_submissions || []).some(s => s.status === 'submitted')) &&
                selectedOrder.payment?.status !== 'completed' && (
                  <>
                    <button
                      type="button"
                      onClick={() => openRejectDialog(selectedOrder)}
                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs py-2 px-4 rounded-xl transition-colors flex items-center gap-1.5"
                    >
                      <XCircle size={14} />
                      <span>Reject Submission</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openApproveDialog(selectedOrder)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} />
                      <span>Approve Payment</span>
                    </button>
                  </>
                )}

              {/* COD Action (Strictly when order is delivered and payment is pending) */}
              {((selectedOrder.payment?.provider || selectedOrder.payment_provider) === 'cod') &&
                (selectedOrder.payment?.status || 'pending') === 'pending' &&
                selectedOrder.status === 'delivered' && (
                  <button
                    type="button"
                    onClick={() => openCodDialog(selectedOrder)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <Banknote size={14} />
                    <span>Confirm COD Cash Collection</span>
                  </button>
                )}

              {/* Refund Action (Eligible strictly when payment status is completed and order/payment not yet refunded) */}
              {selectedOrder.payment?.status === 'completed' &&
                selectedOrder.status !== 'refunded' &&
                selectedOrder.payment?.status !== 'refunded' && (
                  <button
                    type="button"
                    onClick={() => openRefundDialog(selectedOrder)}
                    className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs py-2 px-4 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw size={14} />
                    <span>Record Refund</span>
                  </button>
                )}

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs py-2 px-4 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog 1: Approve UTR Confirmation Dialog ── */}
      {activeDialog === 'approve' && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleApproveUtr}
            className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 space-y-4 text-xs animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Approve PhonePe UTR Payment</h3>
                <p className="text-[11px] text-slate-500">Confirm genuine merchant transaction match</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Order ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedOrder.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Payable Amount:</span>
                <span className="font-bold text-purple-700">{formatPrice(selectedOrder.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Submitted 12-Digit UTR:</span>
                <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border">
                  {(selectedOrder.activeSubmission || selectedOrder.payment_submissions?.[0])?.utr_number}
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-[11px] space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-700 flex-shrink-0" />
                <span>Verification Responsibility</span>
              </p>
              <p className="leading-relaxed">
                Approval must only be performed after verifying that the exact amount was received in your PhonePe Business bank account. Never approve a UTR solely because it has 12 numeric digits.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-bold">Admin Verification Notes (Optional)</label>
              <input
                type="text"
                value={adminNotesInput}
                onChange={e => setAdminNotesInput(e.target.value)}
                placeholder="e.g. Verified in PhonePe Business app"
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmCertified}
                onChange={e => setConfirmCertified(e.target.checked)}
                className="mt-0.5 accent-emerald-600 h-4 w-4 rounded"
              />
              <span className="text-[11px] text-slate-700 font-medium">
                I certify that I have cross-checked this UTR in the PhonePe Business merchant portal and received {formatPrice(selectedOrder.total_amount)}.
              </span>
            </label>

            {actionError && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-2.5 rounded-xl text-[11px]">
                {actionError}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmittingAction}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAction || !confirmCertified}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
              >
                {isSubmittingAction ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Approving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Confirm Approval</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Dialog 2: Reject UTR Dialog ── */}
      {activeDialog === 'reject' && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleRejectUtr}
            className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 space-y-4 text-xs animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center">
                <XCircle size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Reject PhonePe UTR Submission</h3>
                <p className="text-[11px] text-slate-500">Provide rejection reason for the customer</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-800 font-bold">
                Mandatory Rejection Reason *
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="e.g. Transaction ID not found in PhonePe statement, or amount received does not match order total."
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <p className="text-[10px] text-slate-400">
                This explanation is displayed directly to the customer on their order confirmation page.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-[11px] text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">48-Hour Deadline Policy:</p>
              <p className="leading-relaxed">
                Rejecting a submission does not cancel the order or restore inventory. The customer retains the ability to submit a corrected 12-digit UTR within their original 48-hour deadline.
              </p>
            </div>

            {actionError && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-2.5 rounded-xl text-[11px]">
                {actionError}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmittingAction}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAction || !rejectionReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
              >
                {isSubmittingAction ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Rejecting...</span>
                  </>
                ) : (
                  <>
                    <XCircle size={14} />
                    <span>Reject UTR</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Dialog 3: Confirm COD Payment Dialog ── */}
      {activeDialog === 'cod' && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleConfirmCod}
            className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 space-y-4 text-xs animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <Banknote size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Confirm COD Cash Collection</h3>
                <p className="text-[11px] text-slate-500">Mark cash collected upon package delivery</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Order ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedOrder.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Cash to Collect:</span>
                <span className="font-bold text-amber-800 text-sm">{formatPrice(selectedOrder.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Delivery Status:</span>
                <span className="font-bold uppercase text-slate-700">{selectedOrder.status}</span>
              </div>
            </div>

            {selectedOrder.status !== 'delivered' && (
              <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-xl text-[11px] space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-700 flex-shrink-0" />
                  <span>Delivery Check Warning</span>
                </p>
                <p className="leading-relaxed">
                  The backend requires orders to be in 'delivered' status before COD payment can be confirmed. Confirming prior to delivery will be rejected by the server.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-slate-700 font-bold">Courier / Agent Collection Notes (Optional)</label>
              <input
                type="text"
                value={adminNotesInput}
                onChange={e => setAdminNotesInput(e.target.value)}
                placeholder="e.g. Cash collected by BlueDart courier agent #412"
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmCertified}
                onChange={e => setConfirmCertified(e.target.checked)}
                className="mt-0.5 accent-amber-600 h-4 w-4 rounded"
              />
              <span className="text-[11px] text-slate-700 font-medium">
                I certify that cash in the amount of {formatPrice(selectedOrder.total_amount)} was physically collected from the customer.
              </span>
            </label>

            {actionError && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-2.5 rounded-xl text-[11px]">
                {actionError}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmittingAction}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAction || !confirmCertified || selectedOrder.status !== 'delivered'}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
              >
                {isSubmittingAction ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Confirm Collection</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Dialog 4: Record Refund Dialog ── */}
      {activeDialog === 'refund' && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleRecordRefund}
            className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 space-y-4 text-xs animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <RotateCcw size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Record Customer Refund</h3>
                <p className="text-[11px] text-slate-500">Record executed monetary refund in ShopKart</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Order ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedOrder.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Refund Amount:</span>
                <span className="font-bold text-purple-700 text-sm">{formatPrice(selectedOrder.total_amount)}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-800 font-bold">
                Bank / Gateway Refund Reference *
              </label>
              <input
                type="text"
                value={refundReference}
                onChange={e => setRefundReference(e.target.value)}
                placeholder="e.g. REF-20261113-984712 (Bank transfer reference)"
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-800 font-bold">Admin Refund Reason & Notes (Optional)</label>
              <input
                type="text"
                value={adminNotesInput}
                onChange={e => setAdminNotesInput(e.target.value)}
                placeholder="e.g. Customer returned sealed item within 7 days"
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Restock Decision Checkbox */}
            <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 space-y-1.5">
              <label className="flex items-start gap-2 cursor-pointer font-bold text-purple-950">
                <input
                  type="checkbox"
                  checked={restockInventory}
                  onChange={e => setRestockInventory(e.target.checked)}
                  className="mt-0.5 accent-purple-600 h-4 w-4 rounded"
                />
                <span>Restock Order Items to Inventory</span>
              </label>
              <p className="text-[10px] text-purple-800 leading-relaxed pl-6">
                Check this ONLY if products were received back in resaleable condition or order was cancelled prior to dispatch. Damaged or missing goods must not be restocked.
              </p>
            </div>

            {/* Monetary Transfer Confirmation Checkbox */}
            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmCertified}
                onChange={e => setConfirmCertified(e.target.checked)}
                className="mt-0.5 accent-purple-600 h-4 w-4 rounded"
              />
              <span className="text-[11px] text-slate-700 font-medium">
                I certify that {formatPrice(selectedOrder.total_amount)} has genuinely been refunded to the customer via banking or UPI channels.
              </span>
            </label>

            {actionError && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-2.5 rounded-xl text-[11px]">
                {actionError}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmittingAction}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAction || !refundReference.trim() || !confirmCertified}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
              >
                {isSubmittingAction ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Recording...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} />
                    <span>Record Refund</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
