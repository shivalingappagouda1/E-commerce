import { useState, useEffect } from 'react'
import { Image as ImageIcon, Plus, Edit2, Trash2, CheckCircle2, XCircle, X, ExternalLink } from 'lucide-react'
import { SAMPLE_BANNERS } from '../../utils/sampleData'

const BANNERS_STORAGE = 'shopkart_admin_banners'

export default function AdminBannersPage() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBanner, setEditingBanner] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    cta: 'Shop Now',
    ctaLink: '/category/electronics',
    bgFrom: '#1e3a5f',
    bgTo: '#2563eb',
    is_active: true,
  })

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BANNERS_STORAGE)
      setBanners(stored ? JSON.parse(stored) : SAMPLE_BANNERS)
    } catch {
      setBanners(SAMPLE_BANNERS)
    }
    setLoading(false)
  }, [])

  function persist(data) {
    setBanners(data)
    localStorage.setItem(BANNERS_STORAGE, JSON.stringify(data))
  }

  function handleOpenAdd() {
    setEditingBanner(null)
    setFormData({
      title: '',
      subtitle: '',
      cta: 'Shop Now',
      ctaLink: '/category/electronics',
      bgFrom: '#1e3a5f',
      bgTo: '#2563eb',
      is_active: true,
    })
    setModalOpen(true)
  }

  function handleOpenEdit(b) {
    setEditingBanner(b)
    setFormData({
      title: b.title || '',
      subtitle: b.subtitle || '',
      cta: b.cta || 'Shop Now',
      ctaLink: b.ctaLink || '/category/electronics',
      bgFrom: b.bgFrom || '#1e3a5f',
      bgTo: b.bgTo || '#2563eb',
      is_active: b.is_active !== undefined ? b.is_active : true,
    })
    setModalOpen(true)
  }

  function handleSave(e) {
    e.preventDefault()
    if (!formData.title.trim()) return

    if (editingBanner) {
      const updated = banners.map(b => b.id === editingBanner.id ? { ...b, ...formData } : b)
      persist(updated)
    } else {
      const newBanner = { ...formData, id: Date.now() }
      persist([newBanner, ...banners])
    }
    setModalOpen(false)
  }

  function handleDelete(id) {
    if (window.confirm('Are you sure you want to delete this promotional banner?')) {
      const updated = banners.filter(b => b.id !== id)
      persist(updated)
    }
  }

  function handleToggle(id) {
    const updated = banners.map(b => b.id === id ? { ...b, is_active: !(b.is_active !== false) } : b)
    persist(updated)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Promotional Banners</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage carousel hero banners displayed on the customer storefront
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors self-start"
        >
          <Plus size={16} /> Add Banner
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {banners.map(b => {
          const isActive = b.is_active !== false
          return (
            <div
              key={b.id}
              className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between"
              style={{ background: `linear-gradient(135deg, ${b.bgFrom} 0%, ${b.bgTo} 100%)` }}
            >
              <div className="p-6 text-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isActive ? 'bg-green-500/80 text-white' : 'bg-black/40 text-white/70'}`}>
                    {isActive ? 'Active on Homepage' : 'Hidden'}
                  </span>
                  <div className="flex items-center gap-1 bg-black/30 backdrop-blur-xs rounded-lg p-1">
                    <button
                      onClick={() => handleOpenEdit(b)}
                      className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors"
                      aria-label="Edit banner"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="p-1 text-white/80 hover:text-red-300 hover:bg-white/20 rounded transition-colors"
                      aria-label="Delete banner"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <h3 className="text-xl font-bold pt-2">{b.title}</h3>
                <p className="text-xs text-white/80">{b.subtitle}</p>
                <div className="pt-2">
                  <span className="inline-block bg-white text-slate-900 font-bold text-xs px-3 py-1 rounded-full shadow-sm">
                    {b.cta} →
                  </span>
                </div>
              </div>

              <div className="bg-black/20 px-6 py-2.5 flex items-center justify-between text-[11px] text-white/70 border-t border-white/10">
                <span className="truncate max-w-[200px]">Link: {b.ctaLink}</span>
                <button
                  onClick={() => handleToggle(b.id)}
                  className="hover:text-white font-semibold underline"
                >
                  {isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                {editingBanner ? 'Edit Banner' : 'Create Banner'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Banner Headline *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Mega Summer Tech Sale"
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subtitle</label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={e => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="e.g. Up to 50% discount on headphones & laptops"
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Button Text</label>
                  <input
                    type="text"
                    value={formData.cta}
                    onChange={e => setFormData({ ...formData, cta: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Destination URL</label>
                  <input
                    type="text"
                    value={formData.ctaLink}
                    onChange={e => setFormData({ ...formData, ctaLink: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gradient Start Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.bgFrom}
                      onChange={e => setFormData({ ...formData, bgFrom: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={formData.bgFrom}
                      onChange={e => setFormData({ ...formData, bgFrom: e.target.value })}
                      className="flex-1 p-2 border border-slate-200 rounded-lg font-mono text-[11px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gradient End Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.bgTo}
                      onChange={e => setFormData({ ...formData, bgTo: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={formData.bgTo}
                      onChange={e => setFormData({ ...formData, bgTo: e.target.value })}
                      className="flex-1 p-2 border border-slate-200 rounded-lg font-mono text-[11px]"
                    />
                  </div>
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
                  Save Banner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
