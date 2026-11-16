import { useState, useEffect, useRef } from 'react'
import {
  Ticket,
  Plus,
  Trash2,
  Edit2,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Calendar,
  RefreshCw,
} from 'lucide-react'
import { formatPrice } from '../../utils/format'
import {
  adminFetchCoupons,
  adminSaveCoupon,
  adminToggleCouponActive,
  adminDeleteCoupon,
  validateCouponPayload,
  getCouponStatus,
} from '../../services/adminService'

const EMPTY_FORM = {
  code: '',
  discount_type: 'percent',
  discount_value: '',
  min_order_value: '0',
  max_uses: '',
  expires_at: '',
  is_active: true,
}

const STATUS_BADGE_STYLES = {
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  Expired: 'bg-red-100 text-red-700 border-red-200',
  'Limit Reached': 'bg-amber-100 text-amber-800 border-amber-200',
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatExpiryDisplay(isoString) {
  if (!isoString) return 'No expiry'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasFetchedSuccessfully, setHasFetchedSuccessfully] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [pageError, setPageError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const fetchInFlightRef = useRef(false)
  const saveLockRef = useRef(false)
  const mountedRef = useRef(true)

  function executeFetchCoupons() {
    if (fetchInFlightRef.current) return
    fetchInFlightRef.current = true
    Promise.resolve()
      .then(() => adminFetchCoupons())
      .then(({ data, error }) => {
        if (!mountedRef.current) return
        if (error) {
          setHasFetchedSuccessfully(false)
          setFetchError(error.message || 'Failed to load coupons from database.')
        } else {
          setHasFetchedSuccessfully(true)
          setFetchError('')
          setCoupons(data || [])
        }
      })
      .catch(err => {
        if (!mountedRef.current) return
        setHasFetchedSuccessfully(false)
        setFetchError(err?.message || 'Failed to load coupons from database.')
      })
      .finally(() => {
        fetchInFlightRef.current = false
        if (mountedRef.current) setLoading(false)
      })
  }

  function loadCoupons() {
    if (fetchInFlightRef.current) return
    setLoading(true)
    setFetchError('')
    setPageError('')
    executeFetchCoupons()
  }

  useEffect(() => {
    mountedRef.current = true
    executeFetchCoupons()
    return () => {
      mountedRef.current = false
    }
  }, [])

  function handleOpenCreate() {
    setEditingCoupon(null)
    setFormData(EMPTY_FORM)
    setFormError('')
    setPageSuccess('')
    setModalOpen(true)
  }

  function handleOpenEdit(coupon) {
    setEditingCoupon(coupon)
    setFormData({
      code: coupon.code || '',
      discount_type: coupon.discount_type === 'fixed' ? 'fixed' : 'percent',
      discount_value: coupon.discount_value !== undefined && coupon.discount_value !== null ? String(coupon.discount_value) : '',
      min_order_value: coupon.min_order_value !== undefined && coupon.min_order_value !== null ? String(coupon.min_order_value) : '0',
      max_uses: coupon.max_uses !== undefined && coupon.max_uses !== null ? String(coupon.max_uses) : '',
      expires_at: toDatetimeLocalValue(coupon.expires_at),
      is_active: coupon.is_active !== false,
    })
    setFormError('')
    setPageSuccess('')
    setModalOpen(true)
  }

  function handleCloseModal() {
    if (saving) return
    setModalOpen(false)
    setEditingCoupon(null)
    setFormError('')
  }

  function handleOpenDelete(coupon) {
    setDeleteError('')
    setPageError('')
    setPageSuccess('')
    setDeleteTarget(coupon)
  }

  function handleCloseDelete() {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    if (saveLockRef.current || saving) return

    const candidate = {
      ...(editingCoupon?.id ? { id: editingCoupon.id } : {}),
      code: formData.code,
      discount_type: formData.discount_type,
      discount_value: formData.discount_value,
      min_order_value: formData.min_order_value === '' ? 0 : formData.min_order_value,
      max_uses: formData.max_uses === '' ? null : formData.max_uses,
      expires_at: formData.expires_at === '' ? null : formData.expires_at,
      is_active: Boolean(formData.is_active),
    }

    const validation = validateCouponPayload(candidate)
    if (!validation.valid) {
      setFormError(validation.error)
      return
    }

    saveLockRef.current = true
    setSaving(true)
    setFormError('')
    setPageSuccess('')

    try {
      const { data: saved, error } = await adminSaveCoupon(candidate)
      if (!mountedRef.current) return

      if (error || !saved) {
        setFormError(error?.message || 'Failed to save coupon.')
        return
      }

      setCoupons(prev => {
        if (editingCoupon) {
          return prev.map(item => (item.id === saved.id ? saved : item))
        }
        return [saved, ...prev]
      })
      setHasFetchedSuccessfully(true)
      setFetchError('')
      setPageSuccess(
        editingCoupon
          ? `Coupon "${saved.code}" updated successfully.`
          : `Coupon "${saved.code}" created successfully.`
      )
      setModalOpen(false)
      setEditingCoupon(null)
    } finally {
      saveLockRef.current = false
      if (mountedRef.current) setSaving(false)
    }
  }

  async function handleToggle(coupon) {
    if (busyId) return
    setBusyId(coupon.id)
    setPageError('')
    setPageSuccess('')

    const { data: updated, success, error } = await adminToggleCouponActive(coupon.id, coupon.is_active)
    if (!mountedRef.current) return

    if (!success || error) {
      setPageError(error?.message || `Failed to update coupon "${coupon.code}".`)
    } else if (updated) {
      setCoupons(prev => prev.map(item => (item.id === updated.id ? updated : item)))
      setPageSuccess(
        `Coupon "${updated.code}" ${updated.is_active ? 'activated' : 'deactivated'}.`
      )
    }
    setBusyId(null)
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setDeleteError('')
    setPageError('')
    setPageSuccess('')

    const targetId = deleteTarget.id
    const targetCode = deleteTarget.code
    const { success, error } = await adminDeleteCoupon(targetId)
    if (!mountedRef.current) return

    if (!success || error) {
      setDeleteError(error?.message || `Failed to delete coupon "${targetCode}".`)
    } else {
      setCoupons(prev => prev.filter(item => item.id !== targetId))
      setDeleteTarget(null)
      setDeleteError('')
      setPageSuccess(`Coupon "${targetCode}" deleted permanently.`)
    }
    setDeleting(false)
  }

  async function handleDeactivateInstead() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setDeleteError('')
    setPageError('')
    setPageSuccess('')

    const { data: updated, success, error } = await adminToggleCouponActive(deleteTarget.id, true)
    if (!mountedRef.current) return

    if (!success || error) {
      setDeleteError(error?.message || `Failed to deactivate coupon "${deleteTarget.code}".`)
    } else if (updated) {
      setCoupons(prev => prev.map(item => (item.id === updated.id ? updated : item)))
      setDeleteTarget(null)
      setDeleteError('')
      setPageSuccess(`Coupon "${updated.code}" deactivated. Historical orders remain intact.`)
    }
    setDeleting(false)
  }

  const showErrorState = !loading && Boolean(fetchError)
  const showEmptyState = !loading && !fetchError && hasFetchedSuccessfully && coupons.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Coupon Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create promotional discount codes, manage expiry, and monitor usage counts
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadCoupons}
            disabled={loading}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Refresh coupons"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus size={16} /> Create Coupon
          </button>
        </div>
      </div>

      {pageSuccess && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            <span>{pageSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageSuccess('')}
            className="p-1 text-emerald-600 hover:text-emerald-800 rounded-lg"
            aria-label="Dismiss success message"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {pageError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{pageError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageError('')}
            className="p-1 text-red-500 hover:text-red-700 rounded-lg"
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center justify-center gap-3 text-slate-500 text-xs">
          <Loader2 size={24} className="animate-spin text-brand-500" />
          <span>Loading promotional coupons...</span>
        </div>
      ) : showErrorState ? (
        <div
          role="alert"
          className="bg-white rounded-2xl border border-red-200 p-12 text-center space-y-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Failed to load coupons</h2>
          <p className="text-xs text-red-600 max-w-md mx-auto">{fetchError}</p>
          <button
            type="button"
            onClick={loadCoupons}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : showEmptyState ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center mx-auto">
            <Ticket size={24} />
          </div>
          <h2 className="text-sm font-bold text-slate-800">No coupons configured</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Create your first promotional code to offer percentage or flat discounts at checkout.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} /> Create Coupon
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map(c => {
            const status = getCouponStatus(c)
            const badgeStyle = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES.Inactive
            const isBusy = busyId === c.id

            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-extrabold text-sm bg-brand-50 text-brand-700 px-2.5 py-1 rounded-lg border border-brand-200 truncate">
                      {c.code}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0 ${badgeStyle}`}>
                      {status}
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5">
                    <p className="text-base font-extrabold text-slate-800">
                      {c.discount_type === 'percent'
                        ? `${Number(c.discount_value)}% OFF`
                        : `₹${Number(c.discount_value)} FLAT OFF`}
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      Min Order:{' '}
                      <strong>
                        {Number(c.min_order_value) > 0 ? formatPrice(Number(c.min_order_value)) : 'None'}
                      </strong>
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      Redeemed: <strong>{Number(c.used_count || 0)}</strong> /{' '}
                      {c.max_uses !== null && c.max_uses !== undefined ? c.max_uses : 'Unlimited'} uses
                    </p>
                    <p className="text-slate-500 text-[11px] flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400 shrink-0" />
                      <span>Expires: {formatExpiryDisplay(c.expires_at)}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleToggle(c)}
                    disabled={isBusy}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] border transition-colors disabled:opacity-50 ${
                      c.is_active
                        ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {isBusy ? 'Updating...' : c.is_active ? 'Deactivate' : 'Activate'}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(c)}
                      disabled={isBusy}
                      className="text-slate-400 hover:text-brand-600 p-1.5 rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50"
                      aria-label={`Edit coupon ${c.code}`}
                      title="Edit coupon"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDelete(c)}
                      disabled={isBusy}
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      aria-label={`Delete coupon ${c.code}`}
                      title="Delete coupon"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-4 text-xs max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                {editingCoupon ? `Edit Coupon (${editingCoupon.code})` : 'Create New Coupon'}
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={saving}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-50"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {editingCoupon && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-600 flex items-center justify-between">
                <span>Current Redemptions:</span>
                <strong className="text-slate-800">{Number(editingCoupon.used_count || 0)} uses</strong>
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{formError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormError('')}
                  className="text-red-500 hover:text-red-700"
                  aria-label="Dismiss validation error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Coupon Code (e.g. FLASH20) *
                </label>
                <input
                  type="text"
                  required
                  disabled={saving}
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="CODE20"
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono text-xs uppercase disabled:bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Discount Type</label>
                  <select
                    disabled={saving}
                    value={formData.discount_type}
                    onChange={e => setFormData({ ...formData, discount_type: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white disabled:bg-slate-50"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Discount Value {formData.discount_type === 'percent' ? '(%)' : '(₹)'} *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    max={formData.discount_type === 'percent' ? '100' : undefined}
                    disabled={saving}
                    value={formData.discount_value}
                    onChange={e => setFormData({ ...formData, discount_value: e.target.value })}
                    placeholder={formData.discount_type === 'percent' ? '15' : '500'}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Minimum Order Value (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={saving}
                    value={formData.min_order_value}
                    onChange={e => setFormData({ ...formData, min_order_value: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Usage Limit (Max Uses)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={saving}
                    value={formData.max_uses}
                    onChange={e => setFormData({ ...formData, max_uses: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Expiry Date & Time (Optional)</label>
                <input
                  type="datetime-local"
                  disabled={saving}
                  value={formData.expires_at}
                  onChange={e => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Leave blank if the coupon does not expire automatically.
                </p>
              </div>

              <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={saving}
                  checked={Boolean(formData.is_active)}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="font-semibold text-slate-700">Coupon is active</span>
              </label>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCloseModal}
                  className="border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-5 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Saving...' : editingCoupon ? 'Update Coupon' : 'Save Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Delete Coupon</h2>
              <button
                type="button"
                disabled={deleting}
                onClick={handleCloseDelete}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-50"
                aria-label="Close delete dialog"
              >
                <X size={18} />
              </button>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{deleteError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteError('')}
                  className="text-red-500 hover:text-red-700"
                  aria-label="Dismiss delete error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <p className="text-slate-600 leading-relaxed">
              Are you sure you want to delete coupon{' '}
              <span className="font-mono font-bold text-slate-900">{deleteTarget.code}</span>?
            </p>

            {Number(deleteTarget.used_count || 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 flex items-start gap-2.5 text-[11px] leading-relaxed">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    Redeemed {Number(deleteTarget.used_count)} time{Number(deleteTarget.used_count) === 1 ? '' : 's'}
                  </p>
                  <p className="mt-0.5">
                    Deleting a redeemed coupon may clear the <code className="font-mono">coupon_id</code>{' '}
                    association on historical orders (<code className="font-mono">ON DELETE SET NULL</code>).
                    Deactivating the coupon preserves order reporting while blocking future checkout use.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={deleting}
                onClick={handleCloseDelete}
                className="border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              {Number(deleteTarget.used_count || 0) > 0 && deleteTarget.is_active && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeactivateInstead}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Processing...' : 'Deactivate Instead'}
                </button>
              )}
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-60"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
