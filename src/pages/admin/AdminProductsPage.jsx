import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Search, Edit2, Trash2, Filter, X
} from 'lucide-react'
import {
  adminFetchProducts,
  adminSaveProduct,
  adminDeleteProduct,
  adminToggleProductActive,
  adminFetchCategories,
} from '../../services/adminService'
import { formatPrice } from '../../utils/format'

/**
 * Resolves category UUID / ID from product record across Supabase and local demo models.
 */
function resolveProductCategoryId(product, availableCategories = []) {
  if (!product) return ''
  if (product.category_id) {
    const match = availableCategories.find(c => String(c.id) === String(product.category_id))
    if (match) return String(match.id)
    return String(product.category_id)
  }
  if (product.categories?.id) {
    return String(product.categories.id)
  }
  const catName = product.category || product.categories?.name
  if (catName) {
    const match = availableCategories.find(c => c.name.toLowerCase() === catName.toLowerCase())
    if (match) return String(match.id)
  }
  return ''
}

/**
 * Resolves human-readable category name from product record or category id.
 */
function resolveProductCategoryName(product, availableCategories = [], categoryId = null) {
  if (!product && !categoryId) return 'Unassigned'
  const idToLookup = categoryId || (product && (product.category_id || product.categories?.id))
  if (idToLookup) {
    const match = availableCategories.find(c => String(c.id) === String(idToLookup))
    if (match) return match.name
  }
  if (product?.categories?.name) return product.categories.name
  if (product?.category) return product.category
  return 'Unassigned'
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    category_id: '',
    category: '',
    price: '',
    original_price: '',
    discount_percent: 0,
    stock: 20,
    badge: '',
    image: '',
    is_featured: false,
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [prodRes, catRes] = await Promise.all([
      adminFetchProducts(),
      adminFetchCategories(),
    ])
    setProducts(prodRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const catName = resolveProductCategoryName(p, categories, p.category_id)
      const pCatId = resolveProductCategoryId(p, categories)
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          catName.toLowerCase().includes(searchTerm.toLowerCase())

      let matchCat = true
      if (categoryFilter === 'unassigned') {
        matchCat = !pCatId && (catName === 'Unassigned' || !catName)
      } else if (categoryFilter !== 'all') {
        const filterCatObj = categories.find(c => String(c.id) === String(categoryFilter))
        matchCat = String(pCatId) === String(categoryFilter) ||
                   (filterCatObj && catName.toLowerCase() === filterCatObj.name.toLowerCase())
      }
      return matchSearch && matchCat
    })
  }, [products, categories, searchTerm, categoryFilter])

  function handleOpenAdd() {
    setEditingProduct(null)
    const firstCat = categories[0]
    setFormData({
      name: '',
      slug: '',
      category_id: firstCat ? String(firstCat.id) : '',
      category: firstCat ? firstCat.name : '',
      price: '',
      original_price: '',
      discount_percent: 0,
      stock: 25,
      badge: '',
      image: '',
      is_featured: false,
      is_active: true,
    })
    setErrorMsg('')
    setModalOpen(true)
  }

  function handleOpenEdit(product) {
    setEditingProduct(product)
    const catId = resolveProductCategoryId(product, categories)
    const catName = resolveProductCategoryName(product, categories, catId)

    setFormData({
      name: product.name || '',
      slug: product.slug || '',
      category_id: catId,
      category: catName !== 'Unassigned' ? catName : '',
      price: product.price || '',
      original_price: product.original_price || product.originalPrice || '',
      discount_percent: product.discount_percent || product.discount || 0,
      stock: product.stock ?? product.inventory?.[0]?.quantity ?? 20,
      badge: product.badge || '',
      image: product.image || product.product_images?.[0]?.image_url || '',
      is_featured: product.is_featured || product.featured || false,
      is_active: product.is_active !== undefined ? product.is_active : product.inStock,
    })
    setErrorMsg('')
    setModalOpen(true)
  }

  function handleNameChange(name) {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    setFormData(prev => ({ ...prev, name, slug }))
  }

  function handlePriceChange(field, val) {
    const next = { ...formData, [field]: val }
    const p = Number(next.price) || 0
    const op = Number(next.original_price) || 0
    if (op > p && op > 0) {
      next.discount_percent = Math.round(((op - p) / op) * 100)
    } else {
      next.discount_percent = 0
    }
    setFormData(next)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!formData.name || !formData.price) {
      setErrorMsg('Product name and selling price are required.')
      return
    }

    setSaving(true)
    setErrorMsg('')

    const productPayload = {
      ...(editingProduct ? { id: editingProduct.id } : {}),
      ...formData,
      category_id: formData.category_id || null,
    }

    const { error } = await adminSaveProduct(productPayload)
    setSaving(false)

    if (error) {
      setErrorMsg(error.message || 'Failed to save product.')
      return
    }

    setModalOpen(false)
    loadData()
  }

  async function handleDelete(id, name) {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      await adminDeleteProduct(id)
      setProducts(prev => prev.filter(p => p.id !== id))
    }
  }

  async function handleToggleStatus(id, currentStatus) {
    const res = await adminToggleProductActive(id, currentStatus)
    if (res.success) {
      setProducts(prev => prev.map(p => {
        if (p.id === id) {
          return { ...p, is_active: res.newStatus, inStock: res.newStatus }
        }
        return p
      }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Products Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your store catalog, update prices, discounts, and inventory status
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors self-start"
        >
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by product name or category..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter size={14} className="text-slate-400" />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full sm:w-48"
          >
            <option value="all">All Categories</option>
            <option value="unassigned">Unassigned (No Category)</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Discount</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400">
                    Loading products catalog...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400">
                    No products found matching your search.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(prod => {
                  const isActive = prod.is_active !== undefined ? prod.is_active : prod.inStock
                  const stockQty = prod.stock ?? prod.inventory?.[0]?.quantity ?? 20
                  const imgUrl = prod.image || prod.product_images?.[0]?.image_url
                  const resolvedCategoryName = resolveProductCategoryName(prod, categories, prod.category_id)

                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Product Thumbnail + Name */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 max-w-xs">
                          <img
                            src={imgUrl}
                            alt={prod.name}
                            className="w-10 h-10 object-contain rounded-lg bg-slate-50 p-1 border border-slate-100 flex-shrink-0"
                            onError={e => { e.currentTarget.src = 'https://placehold.co/40x40?text=P' }}
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate">{prod.name}</span>
                            <span className="text-[11px] text-slate-400 font-mono truncate block">/{prod.slug}</span>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-3 text-slate-600 font-medium">
                        {resolvedCategoryName}
                      </td>

                      {/* Price */}
                      <td className="px-5 py-3 font-bold text-slate-900">
                        {formatPrice(prod.price)}
                      </td>

                      {/* Discount */}
                      <td className="px-5 py-3">
                        {prod.discount > 0 || prod.discount_percent > 0 ? (
                          <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-[11px] font-bold">
                            {prod.discount || prod.discount_percent}% OFF
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="px-5 py-3">
                        <span className={`font-semibold ${stockQty < 5 ? 'text-red-500' : 'text-slate-700'}`}>
                          {stockQty} units
                        </span>
                      </td>

                      {/* Active Status */}
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleToggleStatus(prod.id, isActive)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${
                            isActive
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {isActive ? 'Active' : 'Disabled'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(prod)}
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            aria-label="Edit product"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(prod.id, prod.name)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label="Delete product"
                          >
                            <Trash2 size={15} />
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

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
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
                <label className="block font-semibold text-slate-700 mb-1">Product Title *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="e.g. Sony WH-1000XM5 Wireless Headphones"
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Slug (URL friendly) *</label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={e => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category_id || ''}
                    onChange={e => {
                      const selectedId = e.target.value
                      const matched = categories.find(c => String(c.id) === String(selectedId))
                      setFormData(prev => ({
                        ...prev,
                        category_id: selectedId,
                        category: matched ? matched.name : '',
                      }))
                    }}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  >
                    <option value="">Unassigned (No Category)</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    required
                    value={formData.price}
                    onChange={e => handlePriceChange('price', e.target.value)}
                    placeholder="29990"
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Original Price (₹)</label>
                  <input
                    type="number"
                    value={formData.original_price}
                    onChange={e => handlePriceChange('original_price', e.target.value)}
                    placeholder="34990"
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Discount %</label>
                  <input
                    type="text"
                    readOnly
                    value={`${formData.discount_percent}%`}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stock Quantity</label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={e => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Promotional Badge</label>
                  <select
                    value={formData.badge}
                    onChange={e => setFormData({ ...formData, badge: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  >
                    <option value="">No Badge</option>
                    <option value="Best Seller">Best Seller</option>
                    <option value="Trending">Trending</option>
                    <option value="Deal of the Day">Deal of the Day</option>
                    <option value="Hot">Hot</option>
                    <option value="Top Deal">Top Deal</option>
                    <option value="Premium">Premium</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Image URL</label>
                <input
                  type="url"
                  value={formData.image}
                  onChange={e => setFormData({ ...formData, image: e.target.value })}
                  placeholder="https://images.unsplash.com/photo-..."
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.is_featured}
                    onChange={e => setFormData({ ...formData, is_featured: e.target.checked })}
                    className="accent-brand-500"
                  />
                  <span>Feature on Homepage</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                    className="accent-brand-500"
                  />
                  <span>Available for Purchase (Active)</span>
                </label>
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
                  {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
