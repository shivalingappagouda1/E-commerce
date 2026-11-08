import { useState, useEffect } from 'react'
import { Ticket, Plus, Trash2, Edit2, CheckCircle2, XCircle, X } from 'lucide-react'
import { formatPrice } from '../../utils/format'

const COUPONS_STORAGE = 'shopkart_admin_coupons'

const INITIAL_COUPONS = [
  {
    id: 'c1',
    code: 'SHOPKART10',
    discount_type: 'percent',
    discount_value: 10,
    min_order_value: 999,
    max_uses: 500,
    used_count: 42,
    is_active: true,
  },
  {
    id: 'c2',
    code: 'WELCOME500',
    discount_type: 'fixed',
    discount_value: 500,
    min_order_value: 4999,
    max_uses: 1000,
    used_count: 128,
    is_active: true,
  },
]

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: '',
    min_order_value: 0,
    max_uses: 100,
    is_active: true,
  })

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COUPONS_STORAGE)
      setCoupons(stored ? JSON.parse(stored) : INITIAL_COUPONS)
    } catch {
      setCoupons(INITIAL_COUPONS)
    }
  }, [])

  function persist(data) {
    setCoupons(data)
    localStorage.setItem(COUPONS_STORAGE, JSON.stringify(data))
  }

  function handleSave(e) {
    e.preventDefault()
    if (!formData.code || !formData.discount_value) return

    const newCoupon = {
      ...formData,
      id: `c-${Date.now()}`,
      code: formData.code.toUpperCase().trim(),
      discount_value: Number(formData.discount_value),
      min_order_value: Number(formData.min_order_value || 0),
      max_uses: Number(formData.max_uses || 100),
      used_count: 0,
    }
    persist([newCoupon, ...coupons])
    setModalOpen(false)
  }

  function handleDelete(id) {
    if (window.confirm('Delete this coupon code?')) {
      persist(coupons.filter(c => c.id !== id))
    }
  }

  function handleToggle(id) {
    persist(coupons.map(c => c.id === id ? { ...c, is_active: !c.is_active } : c))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Coupon Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create promotional discount codes and monitor usage counts
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({
              code: '',
              discount_type: 'percent',
              discount_value: '',
              min_order_value: 0,
              max_uses: 200,
              is_active: true,
            })
            setModalOpen(true)
          }}
          className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors self-start"
        >
          <Plus size={16} /> Create Coupon
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {coupons.map(c => (
          <div
            key={c.id}
            className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-extrabold text-sm text-slate-900 bg-brand-50 text-brand-700 px-2.5 py-1 rounded-lg border border-brand-200">
                {c.code}
              </span>
              <button
                onClick={() => handleToggle(c.id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {c.is_active ? 'Active' : 'Disabled'}
              </button>
            </div>

            <div className="text-xs space-y-1">
              <p className="text-base font-extrabold text-slate-800">
                {c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `₹${c.discount_value} FLAT OFF`}
              </p>
              <p className="text-slate-500 text-[11px]">
                Min Order: <strong>{c.min_order_value > 0 ? formatPrice(c.min_order_value) : 'None'}</strong>
              </p>
              <p className="text-slate-500 text-[11px]">
                Redeemed: <strong>{c.used_count}</strong> / {c.max_uses || 'Unlimited'} uses
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400">Cart Checkout Code</span>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                aria-label="Delete coupon"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Create New Coupon</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Coupon Code (e.g. FLASH20) *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="CODE20"
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono text-xs uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Discount Type</label>
                  <select
                    value={formData.discount_type}
                    onChange={e => setFormData({ ...formData, discount_type: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Discount Value *</label>
                  <input
                    type="number"
                    required
                    value={formData.discount_value}
                    onChange={e => setFormData({ ...formData, discount_value: e.target.value })}
                    placeholder="15"
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Minimum Order Value (₹)</label>
                  <input
                    type="number"
                    value={formData.min_order_value}
                    onChange={e => setFormData({ ...formData, min_order_value: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Usage Limit (Max Uses)</label>
                  <input
                    type="number"
                    value={formData.max_uses}
                    onChange={e => setFormData({ ...formData, max_uses: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-5 py-2 rounded-xl transition-colors shadow-sm"
                >
                  Save Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
