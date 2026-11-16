import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import StarRating from '../../components/common/StarRating'
import {
  adminDeleteReview,
  adminFetchReviews,
  adminToggleReviewApproval,
} from '../../services/adminService'

function formatReviewDate(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return date.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasFetchedSuccessfully, setHasFetchedSuccessfully] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [pageError, setPageError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')
  const [busyIds, setBusyIds] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchInFlightRef = useRef(false)
  const mutationLocksRef = useRef(new Set())
  const mountedRef = useRef(true)

  function executeFetch() {
    if (fetchInFlightRef.current) return
    fetchInFlightRef.current = true

    Promise.resolve()
      .then(() => adminFetchReviews())
      .then(({ data, error }) => {
        if (!mountedRef.current) return
        if (error) {
          setHasFetchedSuccessfully(false)
          setFetchError(error.message || 'Failed to load reviews.')
          return
        }
        setHasFetchedSuccessfully(true)
        setFetchError('')
        setReviews(Array.isArray(data) ? data : [])
      })
      .catch(error => {
        if (!mountedRef.current) return
        setHasFetchedSuccessfully(false)
        setFetchError(error?.message || 'Failed to load reviews.')
      })
      .finally(() => {
        fetchInFlightRef.current = false
        if (mountedRef.current) setLoading(false)
      })
  }

  function loadReviews() {
    if (fetchInFlightRef.current) return
    setLoading(true)
    setFetchError('')
    setPageError('')
    executeFetch()
  }

  useEffect(() => {
    mountedRef.current = true
    executeFetch()
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function handleToggleApproval(review) {
    const id = review.id
    if (mutationLocksRef.current.has(id)) return
    mutationLocksRef.current.add(id)
    setBusyIds(previous => [...previous, id])
    setPageError('')
    setPageSuccess('')

    try {
      const { data: updated, success, error } = await adminToggleReviewApproval(id, !review.is_approved)
      if (!mountedRef.current) return
      if (!success || error || !updated) {
        setPageError(error?.message || `Failed to ${review.is_approved ? 'reject' : 'approve'} this review.`)
        return
      }
      setReviews(previous => previous.map(item => item.id === updated.id ? updated : item))
      setPageSuccess(`Review ${updated.is_approved ? 'approved' : 'rejected'} successfully.`)
    } catch (error) {
      if (mountedRef.current) setPageError(error?.message || 'Unable to update review approval.')
    } finally {
      mutationLocksRef.current.delete(id)
      if (mountedRef.current) setBusyIds(previous => previous.filter(item => item !== id))
    }
  }

  function openDeleteConfirmation(review) {
    setDeleteError('')
    setPageError('')
    setPageSuccess('')
    setDeleteTarget(review)
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return
    const target = deleteTarget
    if (mutationLocksRef.current.has(target.id)) return
    mutationLocksRef.current.add(target.id)
    setDeleting(true)
    setDeleteError('')
    setPageError('')
    setPageSuccess('')

    try {
      const { success, error } = await adminDeleteReview(target.id)
      if (!mountedRef.current) return
      if (!success || error) {
        setDeleteError(error?.message || 'Failed to delete review.')
        return
      }
      setReviews(previous => previous.filter(item => item.id !== target.id))
      setDeleteTarget(null)
      setPageSuccess('Review deleted successfully.')
    } catch (error) {
      if (mountedRef.current) setDeleteError(error?.message || 'Unable to delete review.')
    } finally {
      mutationLocksRef.current.delete(target.id)
      if (mountedRef.current) setDeleting(false)
    }
  }

  const showErrorState = !loading && Boolean(fetchError)
  const showEmptyState = !loading && !fetchError && hasFetchedSuccessfully && reviews.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reviews &amp; Moderation</h1>
          <p className="text-xs text-slate-500 mt-1">
            Approve customer feedback, ratings, and maintain authentic community reviews
          </p>
        </div>
        <button
          type="button"
          onClick={loadReviews}
          disabled={loading}
          className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 self-start"
          aria-label="Refresh reviews"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {pageSuccess && (
        <div role="status" className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{pageSuccess}</span>
        </div>
      )}

      {pageError && (
        <div role="alert" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>{pageError}</span>
        </div>
      )}

      {loading ? (
        <div role="status" className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center justify-center gap-3 text-slate-500 text-xs">
          <Loader2 size={24} className="animate-spin text-brand-500" />
          <span>Loading customer reviews...</span>
        </div>
      ) : showErrorState ? (
        <div role="alert" className="bg-white rounded-2xl border border-red-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Failed to load reviews</h2>
          <p className="text-xs text-red-600 max-w-md mx-auto">{fetchError}</p>
          <button
            type="button"
            onClick={loadReviews}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : showEmptyState ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center mx-auto">
            <MessageSquare size={24} />
          </div>
          <h2 className="text-sm font-bold text-slate-800">No reviews found</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Customer reviews will appear here when they are submitted.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(review => {
            const isBusy = busyIds.includes(review.id)
            const dateStr = formatReviewDate(review.created_at)
            return (
              <article
                key={review.id}
                className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-start justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 text-xs min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{review.product_name || 'Unknown product'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${review.is_approved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {review.is_approved ? 'Approved & Public' : 'Pending Approval'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StarRating rating={review.rating} size="sm" />
                    <span className="font-bold text-slate-800">{review.title || 'Untitled review'}</span>
                  </div>

                  <p className="text-slate-600 leading-relaxed text-xs whitespace-pre-wrap">{review.body || 'No written feedback provided.'}</p>

                  <div className="pt-1 text-[11px] text-slate-400 flex flex-wrap items-center gap-1">
                    <span>By <strong className="text-slate-700">{review.user_name || 'Customer'}</strong></span>
                    <span>on {dateStr}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleApproval(review)}
                    disabled={isBusy || deleting}
                    aria-label={`${review.is_approved ? 'Reject' : 'Approve'} review by ${review.user_name || 'Customer'}`}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-50 ${review.is_approved ? 'border border-amber-200 text-amber-700 hover:bg-amber-50' : 'bg-green-600 hover:bg-green-700 text-white shadow-sm'}`}
                  >
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : review.is_approved ? <><X size={14} /> Reject</> : <><Check size={14} /> Approve</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteConfirmation(review)}
                    disabled={isBusy || deleting}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                    aria-label={`Delete review by ${review.user_name || 'Customer'}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-review-title" className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0"><Trash2 size={19} /></div>
              <div>
                <h2 id="delete-review-title" className="font-bold text-slate-900">Delete this review?</h2>
                <p className="text-xs text-slate-500 mt-1">This permanently removes the customer review. This action cannot be undone.</p>
              </div>
            </div>
            {deleteError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { if (!deleting) { setDeleteTarget(null); setDeleteError('') } }} disabled={deleting} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleConfirmDelete} disabled={deleting} className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                {deleting ? <><Loader2 size={14} className="animate-spin" /> Deleting...</> : <><Trash2 size={14} /> Delete review</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
