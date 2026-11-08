import { useState, useEffect } from 'react'
import { Star, Check, X, Trash2, MessageSquare, ThumbsUp } from 'lucide-react'
import StarRating from '../../components/common/StarRating'

const REVIEWS_STORAGE = 'shopkart_admin_reviews'

const INITIAL_REVIEWS = [
  {
    id: 'rev-1',
    product_name: 'Sony WH-1000XM5 Wireless Headphones',
    user_name: 'Vikram Seth',
    rating: 5,
    title: 'Outstanding Noise Cancellation',
    body: 'The sound quality and active noise cancellation are completely unmatched. Worth every rupee.',
    is_approved: true,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'rev-2',
    product_name: 'boAt Airdopes 141 TWS Earbuds',
    user_name: 'Anjali Sharma',
    rating: 4,
    title: 'Good battery life for the price',
    body: 'Decent bass and good microphone quality during calls. Fits comfortably.',
    is_approved: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'rev-3',
    product_name: 'Nike Air Max 270 Running Shoes',
    user_name: 'Karan Mehra',
    rating: 5,
    title: 'Super comfortable for daily running',
    body: 'The air cushion feels like walking on clouds. Excellent grip and breathable mesh.',
    is_approved: true,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
]

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(REVIEWS_STORAGE)
      setReviews(stored ? JSON.parse(stored) : INITIAL_REVIEWS)
    } catch {
      setReviews(INITIAL_REVIEWS)
    }
  }, [])

  function persist(data) {
    setReviews(data)
    localStorage.setItem(REVIEWS_STORAGE, JSON.stringify(data))
  }

  function handleToggleApprove(id) {
    const updated = reviews.map(r => r.id === id ? { ...r, is_approved: !r.is_approved } : r)
    persist(updated)
  }

  function handleDelete(id) {
    if (window.confirm('Delete this review?')) {
      persist(reviews.filter(r => r.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reviews & Moderation</h1>
        <p className="text-xs text-slate-500 mt-1">
          Approve customer feedback, ratings, and maintain authentic community reviews
        </p>
      </div>

      <div className="space-y-3">
        {reviews.map(r => {
          const dateStr = new Date(r.created_at).toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          return (
            <div
              key={r.id}
              className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-start justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">{r.product_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.is_approved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {r.is_approved ? 'Approved & Public' : 'Pending Approval'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <StarRating rating={r.rating} size="sm" />
                  <span className="font-bold text-slate-800">{r.title}</span>
                </div>

                <p className="text-slate-600 leading-relaxed text-xs">{r.body}</p>

                <div className="pt-1 text-[11px] text-slate-400">
                  By <strong className="text-slate-700">{r.user_name}</strong> on {dateStr}
                </div>
              </div>

              {/* Moderation Actions */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => handleToggleApprove(r.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors ${
                    r.is_approved
                      ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                      : 'bg-green-600 hover:bg-green-700 text-white shadow-sm'
                  }`}
                >
                  {r.is_approved ? <><X size={14} /> Reject</> : <><Check size={14} /> Approve</>}
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  aria-label="Delete review"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
