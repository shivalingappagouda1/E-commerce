import { useState, useEffect } from 'react'
import { Tags, Plus, Edit2, Trash2, X, AlertCircle } from 'lucide-react'
import {
  adminFetchCategories,
  adminSaveCategory,
  adminDeleteCategory,
} from '../../services/adminService'

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    icon: '📦',
    sort_order: 0,
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    setLoading(true)
    const { data } = await adminFetchCategories()
    setCategories(data || [])
    setLoading(false)
  }

  function handleOpenAdd() {
    setEditingCategory(null)
    setFormData({
      name: '',
      slug: '',
      icon: '✨',
      sort_order: categories.length + 1,
      is_active: true,
    })
    setErrorMsg('')
    setModalOpen(true)
  }

  function handleOpenEdit(cat) {
    setEditingCategory(cat)
    setFormData({
      name: cat.name || '',
      slug: cat.slug || '',
      icon: cat.icon || '📦',
      sort_order: cat.sort_order || 0,
      is_active: cat.is_active !== undefined ? cat.is_active : true,
    })
    setErrorMsg('')
    setModalOpen(true)
  }

  function handleNameChange(name) {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    setFormData(prev => ({ ...prev, name, slug }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!formData.name.trim()) {
      setErrorMsg('Category name is required.')
      return
    }

    setSaving(true)
    setErrorMsg('')

    const payload = {
      ...(editingCategory ? { id: editingCategory.id } : {}),
      ...formData,
    }

    const { error } = await adminSaveCategory(payload)
    setSaving(false)

    if (error) {
      setErrorMsg(error.message || 'Failed to save category.')
      return
    }

    setModalOpen(false)
    loadCategories()
  }

  async function handleDelete(id, name) {
    if (window.confirm(`Are you sure you want to delete category "${name}"?`)) {
      await adminDeleteCategory(id)
      setCategories(prev => prev.filter(c => c.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Categories Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Organize website catalog navigation, category icons and slugs
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors self-start"
        >
          <Plus size={16} /> Add Category
        </button>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 h-28 animate-pulse" />
          ))
        ) : categories.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center text-slate-400 rounded-2xl border border-slate-100">
            No categories available. Add one above.
          </div>
        ) : (
          categories.map(cat => (
            <div
              key={cat.id}
              className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between gap-3 group hover:border-brand-200 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl p-2 bg-slate-50 rounded-xl flex-shrink-0">
                  {cat.icon || '📦'}
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm truncate">{cat.name}</h3>
                  <p className="text-[11px] text-slate-400 font-mono truncate">/{cat.slug}</p>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleOpenEdit(cat)}
                  className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-50 rounded-lg transition-colors"
                  aria-label="Edit category"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(cat.id, cat.name)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Delete category"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Category Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="e.g. Gaming & Consoles"
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">URL Slug</label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={e => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Icon (Emoji)</label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="🎮"
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-center text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Display Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={e => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
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
                  disabled={saving}
                  className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-5 py-2 rounded-xl transition-colors shadow-sm"
                >
                  {saving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
