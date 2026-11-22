import { useState, useEffect, useMemo } from 'react'

import {

  Plus, Search, Edit2, Trash2, Filter, X, Upload, Star, Video, PlayCircle

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

  const [imageItems, setImageItems] = useState([])

  const [videoItems, setVideoItems] = useState([])

  const [videoUrlDraft, setVideoUrlDraft] = useState('')

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

    setImageItems([])

    setVideoItems([])

    setVideoUrlDraft('')

    setErrorMsg('')

    setModalOpen(true)

  }

  function handleOpenEdit(product) {

    setEditingProduct(product)

    const catId = resolveProductCategoryId(product, categories)

    const catName = resolveProductCategoryName(product, categories, catId)

    const existingImages = (product.product_images || [])

      .slice()

      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))

      .map(item => ({ url: item.image_url, file: null }))

      .filter(item => item.url)

    if (!existingImages.length && product.image) existingImages.push({ url: product.image, file: null })

    setImageItems(existingImages.slice(0, 10))

    setVideoItems((product.product_videos || []).slice(0, 2).map(item => ({

      id: item.id,

      type: item.video_type || 'youtube',

      url: item.video_url,

      title: item.title || '',

      file: null,

    })))

    setVideoUrlDraft('')

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

  function handleImageSelection(event) {

    const files = Array.from(event.target.files || [])

    event.target.value = ''

    if (!files.length) return

    const remaining = 10 - imageItems.length

    if (files.length > remaining) setErrorMsg(`Maximum 10 images per product. ${remaining} slot(s) remaining.`)

    const accepted = files.slice(0, Math.max(0, remaining))

    const valid = accepted.filter(file => {

      const okType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)

      const okSize = file.size <= 512 * 1024

      if (!okType) setErrorMsg(`${file.name}: use JPG, PNG, WEBP, or GIF images.`)

      else if (!okSize) setErrorMsg(`${file.name}: image must be 0.5 MB (512 KB) or smaller.`)

      return okType && okSize

    })

    setImageItems(current => [...current, ...valid.map(file => ({ file, url: URL.createObjectURL(file) }))])

  }

  function removeImage(index) {

    setImageItems(current => current.filter((_, i) => i !== index))

  }

  function makePrimaryImage(index) {

    setImageItems(current => {

      const next = [...current]

      const [selected] = next.splice(index, 1)

      next.unshift(selected)

      return next

    })

  }

  function addYouTubeVideo() {

    const value = videoUrlDraft.trim()

    if (!value) return

    if (videoItems.length >= 2) {

      setErrorMsg('Maximum 2 videos per product.')

      return

    }

    let parsed

    try {

      parsed = new URL(value)

    } catch {

      setErrorMsg('Enter a valid YouTube video URL.')

      return

    }

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()

    const validHost = ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)

    const videoId = host === 'youtu.be'

      ? parsed.pathname.split('/').filter(Boolean)[0]

      : (parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1])

    if (!validHost || !videoId || !/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {

      setErrorMsg('Enter a valid YouTube watch, Shorts, or youtu.be link.')

      return

    }

    setVideoItems(current => [...current, { type: 'youtube', url: value, title: 'Product video', file: null }])

    setVideoUrlDraft('')

    setErrorMsg('')

  }

  function handleVideoSelection(event) {

    const files = Array.from(event.target.files || [])

    event.target.value = ''

    if (!files.length) return

    const remaining = 2 - videoItems.length

    if (files.length > remaining) setErrorMsg(`Maximum 2 videos per product. ${remaining} slot(s) remaining.`)

    const accepted = files.slice(0, Math.max(0, remaining)).filter(file => {

      const okType = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)

      const okSize = file.size <= 3 * 1024 * 1024

      if (!okType) setErrorMsg(`${file.name}: use MP4, WEBM, or MOV video files.`)

      else if (!okSize) setErrorMsg(`${file.name}: video must be 3 MB or smaller.`)

      return okType && okSize

    })

    setVideoItems(current => [...current, ...accepted.map(file => ({

      type: 'upload', file, url: URL.createObjectURL(file), title: file.name,

    }))])

  }

  function removeVideo(index) {

    setVideoItems(current => current.filter((_, i) => i !== index))

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

      images: imageItems,

      image: imageItems[0]?.url || '',

      videos: videoItems,

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

              <div className="space-y-2">

                <div className="flex items-center justify-between gap-3">

                  <label className="block font-semibold text-slate-700">Product Images</label>

                  <span className="text-[11px] text-slate-500">{imageItems.length}/10 images</span>

                </div>

                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-brand-400 rounded-xl p-5 cursor-pointer bg-slate-50 hover:bg-brand-50/30 transition-colors">

                  <Upload size={22} className="text-slate-500" />

                  <span className="font-semibold text-slate-700">Choose images from your device</span>

                  <span className="text-[10px] text-slate-500">JPG, PNG, WEBP or GIF · Maximum 0.5 MB (512 KB) each · Up to 10 images</span>

                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={imageItems.length >= 10} onChange={handleImageSelection} className="sr-only" />

                </label>

                {imageItems.length > 0 && (

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">

                    {imageItems.map((item, index) => (

                      <div key={`${item.url}-${index}`} className="relative rounded-xl border border-slate-200 bg-white p-2">

                        <img src={item.url} alt={`Product image ${index + 1}`} className="w-full h-20 object-contain rounded-lg" />

                        {index === 0 && <span className="absolute left-1 top-1 bg-brand-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">PRIMARY</span>}

                        <div className="flex items-center justify-between mt-2">

                          <button type="button" onClick={() => makePrimaryImage(index)} disabled={index === 0} title="Set as primary" className="p-1 text-amber-500 disabled:opacity-30"><Star size={14} fill={index === 0 ? 'currentColor' : 'none'} /></button>

                          <button type="button" onClick={() => removeImage(index)} title="Remove image" className="p-1 text-red-500 hover:bg-red-50 rounded"><X size={14} /></button>

                        </div>

                      </div>

                    ))}

                  </div>

                )}

              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">

                <div className="flex items-center justify-between">

                  <label className="block font-semibold text-slate-700">Product Videos</label>

                  <span className="text-[11px] text-slate-500">{videoItems.length}/2 videos</span>

                </div>

                <div className="space-y-2">

                  <label className="block text-[11px] font-semibold text-slate-600">Upload MP4 / WEBM / MOV (max 3 MB each)</label>

                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-brand-400 rounded-xl p-3 cursor-pointer bg-slate-50 hover:bg-brand-50/30 transition-colors">

                    <Video size={18} className="text-slate-500" />

                    <span className="font-semibold text-slate-700">Choose video from device</span>

                    <input type="file" accept="video/mp4,video/webm,video/quicktime" multiple disabled={videoItems.length >= 2} onChange={handleVideoSelection} className="sr-only" />

                  </label>

                </div>

                <div className="space-y-1">

                  <label className="block text-[11px] font-semibold text-slate-600">Or add a YouTube link</label>

                  <div className="flex gap-2">

                    <input type="url" value={videoUrlDraft} onChange={e => setVideoUrlDraft(e.target.value)} placeholder="https://www\.youtube.com/watch?v=..." disabled={videoItems.length >= 2} className="min-w-0 flex-1 p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500" />

                    <button type="button" onClick={addYouTubeVideo} disabled={videoItems.length >= 2 || !videoUrlDraft.trim()} className="px-3 rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-40">Add link</button>

                  </div>

                </div>

                {videoItems.length > 0 && (

                  <div className="space-y-2">

                    {videoItems.map((item, index) => (

                      <div key={`${item.url}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">

                        <div className="w-16 h-12 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0"><PlayCircle size={22} /></div>

                        <div className="min-w-0 flex-1">

                          <p className="font-semibold text-slate-700 truncate">{item.title || (item.type === 'youtube' ? 'YouTube video' : 'Uploaded video')}</p>

                          <p className="text-[10px] text-slate-400">{item.type === 'youtube' ? 'YouTube link' : item.file ? `${(item.file.size / (1024 * 1024)).toFixed(1)} MB · Upload pending` : 'Stored video'}</p>

                        </div>

                        <button type="button" onClick={() => removeVideo(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label="Remove video"><X size={15} /></button>

                      </div>

                    ))}

                  </div>

                )}

                <p className="text-[10px] text-slate-400">Up to 2 videos per product. Uploaded videos are stored in Supabase; YouTube links are embedded in the storefront.</p>

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
