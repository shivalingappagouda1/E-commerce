import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Edit2,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import {
  adminDeleteBanner,
  adminFetchBanners,
  adminSaveBanner,
  adminToggleBannerActive,
  getBannerStatus,
  validateBannerPayload,
} from '../../services/adminService'

const EMPTY_FORM = {
  title: '',
  subtitle: '',
  cta: 'Shop Now',
  cta_link: '/category/electronics',
  image_url: '',
  bg_from: '#1e3a5f',
  bg_to: '#2563eb',
  sort_order: '0',
  is_active: true,
  starts_at: '',
  ends_at: '',
}

const STATUS_STYLES = {
  Active: { badge: 'bg-green-500/80 text-white', label: 'Active on Homepage' },
  Hidden: { badge: 'bg-black/40 text-white/75', label: 'Hidden' },
  Scheduled: { badge: 'bg-amber-500/90 text-slate-950', label: 'Scheduled' },
  Expired: { badge: 'bg-red-500/85 text-white', label: 'Expired' },
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatScheduleDate(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sortBannerList(list) {
  return [...list].sort((a, b) => {
    const orderDiff = (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0)
    if (orderDiff !== 0) return orderDiff
    return (Number(a?.id) || 0) - (Number(b?.id) || 0)
  })
}

export default function AdminBannersPage() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasFetchedSuccessfully, setHasFetchedSuccessfully] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [pageError, setPageError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')
  const [busyIds, setBusyIds] = useState([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editingBanner, setEditingBanner] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [imagePreviewError, setImagePreviewError] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchInFlightRef = useRef(false)
  const saveLockRef = useRef(false)
  const mutationLocksRef = useRef(new Set())
  const mountedRef = useRef(true)

  function executeFetch() {
    if (fetchInFlightRef.current) return
    fetchInFlightRef.current = true

    Promise.resolve()
      .then(() => adminFetchBanners())
      .then(({ data, error }) => {
        if (!mountedRef.current) return
        if (error) {
          setHasFetchedSuccessfully(false)
          setFetchError(error.message || 'Failed to load banners.')
          return
        }
        setHasFetchedSuccessfully(true)
        setFetchError('')
        setBanners(Array.isArray(data) ? sortBannerList(data) : [])
      })
      .catch(error => {
        if (!mountedRef.current) return
        setHasFetchedSuccessfully(false)
        setFetchError(error?.message || 'Failed to load banners.')
      })
      .finally(() => {
        fetchInFlightRef.current = false
        if (mountedRef.current) setLoading(false)
      })
  }

  function loadBanners() {
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

  function handleOpenAdd() {
    const nextSortOrder = banners.reduce((maxOrder, b) => Math.max(maxOrder, Number(b.sort_order) || 0), 0) + 1
    setEditingBanner(null)
    setFormData({
      ...EMPTY_FORM,
      sort_order: String(nextSortOrder),
    })
    setFormError('')
    setImagePreviewError(false)
    setPageError('')
    setPageSuccess('')
    setModalOpen(true)
  }

  function handleOpenEdit(banner) {
    setEditingBanner(banner)
    setFormData({
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      cta: banner.cta ?? 'Shop Now',
      cta_link: banner.cta_link || banner.ctaLink || '/category/electronics',
      image_url: banner.image_url || banner.image || '',
      bg_from: banner.bg_from || banner.bgFrom || '#1e3a5f',
      bg_to: banner.bg_to || banner.bgTo || '#2563eb',
      sort_order: banner.sort_order !== undefined && banner.sort_order !== null ? String(banner.sort_order) : '0',
      is_active: banner.is_active !== false,
      starts_at: toDatetimeLocalValue(banner.starts_at),
      ends_at: toDatetimeLocalValue(banner.ends_at),
    })
    setFormError('')
    setImagePreviewError(false)
    setPageError('')
    setPageSuccess('')
    setModalOpen(true)
  }

  function handleCloseModal() {
    if (saving || saveLockRef.current) return
    setModalOpen(false)
    setEditingBanner(null)
    setFormError('')
    setImagePreviewError(false)
  }

  async function handleSave(e) {
    if (e?.preventDefault) e.preventDefault()
    if (saveLockRef.current || saving) return

    const candidate = {
      ...(editingBanner?.id !== undefined && editingBanner?.id !== null ? { id: editingBanner.id } : {}),
      title: formData.title,
      subtitle: formData.subtitle,
      cta: formData.cta,
      cta_link: formData.cta_link,
      image_url: formData.image_url,
      bg_from: formData.bg_from,
      bg_to: formData.bg_to,
      sort_order: formData.sort_order === '' ? 0 : formData.sort_order,
      is_active: Boolean(formData.is_active),
      starts_at: formData.starts_at === '' ? null : formData.starts_at,
      ends_at: formData.ends_at === '' ? null : formData.ends_at,
    }

    const validation = validateBannerPayload(candidate)
    if (!validation.valid) {
      setFormError(validation.error)
      return
    }

    saveLockRef.current = true
    setSaving(true)
    setFormError('')
    setPageError('')
    setPageSuccess('')

    try {
      const { data: saved, error } = await adminSaveBanner(candidate)
      if (!mountedRef.current) return

      if (error || !saved) {
        setFormError(error?.message || 'Failed to save banner.')
        return
      }

      setBanners(previous => {
        const nextList = editingBanner
          ? previous.map(item => (item.id === saved.id ? saved : item))
          : [...previous, saved]
        return sortBannerList(nextList)
      })
      setHasFetchedSuccessfully(true)
      setFetchError('')
      setPageSuccess(
        editingBanner
          ? `Banner "${saved.title}" updated successfully.`
          : `Banner "${saved.title}" created successfully.`
      )
      setModalOpen(false)
      setEditingBanner(null)
    } catch (error) {
      if (mountedRef.current) {
        setFormError(error?.message || 'Failed to save banner.')
      }
    } finally {
      saveLockRef.current = false
      if (mountedRef.current) setSaving(false)
    }
  }

  async function handleToggle(banner) {
    const id = banner.id
    if (mutationLocksRef.current.has(id) || deleting) return
    mutationLocksRef.current.add(id)
    setBusyIds(previous => [...previous, id])
    setPageError('')
    setPageSuccess('')

    try {
      const nextActive = !(banner.is_active !== false)
      const { data: updated, success, error } = await adminToggleBannerActive(id, nextActive)
      if (!mountedRef.current) return

      if (!success || error || !updated) {
        setPageError(error?.message || `Failed to ${nextActive ? 'activate' : 'deactivate'} banner "${banner.title}".`)
        return
      }

      setBanners(previous => sortBannerList(previous.map(item => (item.id === updated.id ? updated : item))))
      setPageSuccess(`Banner "${updated.title}" ${updated.is_active ? 'activated' : 'deactivated'}.`)
    } catch (error) {
      if (mountedRef.current) {
        setPageError(error?.message || `Unable to update banner "${banner.title}".`)
      }
    } finally {
      mutationLocksRef.current.delete(id)
      if (mountedRef.current) {
        setBusyIds(previous => previous.filter(item => item !== id))
      }
    }
  }

  function openDeleteConfirmation(banner) {
    setDeleteError('')
    setPageError('')
    setPageSuccess('')
    setDeleteTarget(banner)
  }

  function closeDeleteConfirmation() {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError('')
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
      const { success, error } = await adminDeleteBanner(target.id)
      if (!mountedRef.current) return

      if (!success || error) {
        setDeleteError(error?.message || `Failed to delete banner "${target.title}".`)
        return
      }

      setBanners(previous => previous.filter(item => item.id !== target.id))
      setDeleteTarget(null)
      setPageSuccess(`Banner "${target.title}" deleted successfully.`)
    } catch (error) {
      if (mountedRef.current) {
        setDeleteError(error?.message || `Unable to delete banner "${target.title}".`)
      }
    } finally {
      mutationLocksRef.current.delete(target.id)
      if (mountedRef.current) setDeleting(false)
    }
  }

  const showErrorState = !loading && Boolean(fetchError)
  const showEmptyState = !loading && !fetchError && hasFetchedSuccessfully && banners.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Promotional Banners</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage carousel hero banners displayed on the customer storefront
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadBanners}
            disabled={loading}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
            aria-label="Refresh banners"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus size={16} /> Add Banner
          </button>
        </div>
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
          <span>Loading promotional banners...</span>
        </div>
      ) : showErrorState ? (
        <div role="alert" className="bg-white rounded-2xl border border-red-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Failed to load promotional banners</h2>
          <p className="text-xs text-red-600 max-w-md mx-auto">{fetchError}</p>
          <button
            type="button"
            onClick={loadBanners}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : showEmptyState ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center mx-auto">
            <ImageIcon size={24} />
          </div>
          <h2 className="text-sm font-bold text-slate-800">No promotional banners found</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Create your first promotional banner to highlight offers and collections on the storefront homepage.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banners.map(b => {
            const isActive = b.is_active !== false
            const isBusy = busyIds.includes(b.id)
            const statusKey = getBannerStatus(b)
            const statusStyle = STATUS_STYLES[statusKey] || STATUS_STYLES.Hidden
            const bgFrom = b.bg_from || b.bgFrom || '#1e3a5f'
            const bgTo = b.bg_to || b.bgTo || '#2563eb'
            const imageUrl = b.image_url || b.image || ''
            const ctaLink = b.cta_link || b.ctaLink || '/'

            return (
              <div
                key={b.id}
                className="relative rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between"
                style={{ background: `linear-gradient(135deg, ${bgFrom} 0%, ${bgTo} 100%)` }}
              >
                {imageUrl && (
                  <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-25 pointer-events-none">
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="relative z-10 p-6 text-white space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyle.badge}`}>
                        {statusStyle.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/30 text-white/90">
                        Order #{b.sort_order ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-black/30 backdrop-blur-xs rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(b)}
                        disabled={isBusy || deleting}
                        className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                        aria-label={`Edit banner ${b.title}`}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteConfirmation(b)}
                        disabled={isBusy || deleting}
                        className="p-1 text-white/80 hover:text-red-300 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                        aria-label={`Delete banner ${b.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold pt-2">{b.title}</h3>
                  {b.subtitle && <p className="text-xs text-white/85">{b.subtitle}</p>}
                  {(b.starts_at || b.ends_at) && (
                    <p className="text-[10px] text-white/75 flex items-center gap-1">
                      <Calendar size={11} />
                      <span>
                        {b.starts_at ? `From ${formatScheduleDate(b.starts_at)}` : 'Immediate'}
                        {' · '}
                        {b.ends_at ? `Until ${formatScheduleDate(b.ends_at)}` : 'No end date'}
                      </span>
                    </p>
                  )}
                  <div className="pt-2">
                    <span className="inline-block bg-white text-slate-900 font-bold text-xs px-3 py-1 rounded-full shadow-sm">
                      {b.cta || 'Shop Now'} →
                    </span>
                  </div>
                </div>

                <div className="relative z-10 bg-black/25 px-6 py-2.5 flex items-center justify-between text-[11px] text-white/80 border-t border-white/10">
                  <span className="truncate max-w-[220px]">Link: {ctaLink}</span>
                  <button
                    type="button"
                    onClick={() => handleToggle(b)}
                    disabled={isBusy || deleting}
                    aria-label={`${isActive ? 'Deactivate' : 'Activate'} banner ${b.title}`}
                    className="hover:text-white font-semibold underline disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> Updating...
                      </>
                    ) : isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="banner-modal-title"
            className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="banner-modal-title" className="text-base font-bold text-slate-900">
                {editingBanner ? 'Edit Banner' : 'Create Banner'}
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={saving}
                aria-label="Close modal"
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div role="alert" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

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
                    value={formData.cta_link}
                    onChange={e => setFormData({ ...formData, cta_link: e.target.value })}
                    placeholder="/category/electronics or https://..."
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Banner Image URL (Optional)</label>
                <input
                  type="text"
                  value={formData.image_url}
                  onChange={e => {
                    setImagePreviewError(false)
                    setFormData({ ...formData, image_url: e.target.value })
                  }}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                {formData.image_url.trim() && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 h-24 flex items-center justify-center">
                    {imagePreviewError ? (
                      <span className="text-[11px] text-slate-500">Preview unavailable for this image URL</span>
                    ) : (
                      <img
                        src={formData.image_url.trim()}
                        alt="Banner preview"
                        onError={() => setImagePreviewError(true)}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gradient Start Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#([0-9a-f]{6})$/i.test(formData.bg_from) ? formData.bg_from : '#1e3a5f'}
                      onChange={e => setFormData({ ...formData, bg_from: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={formData.bg_from}
                      onChange={e => setFormData({ ...formData, bg_from: e.target.value })}
                      className="flex-1 p-2 border border-slate-200 rounded-lg font-mono text-[11px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gradient End Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#([0-9a-f]{6})$/i.test(formData.bg_to) ? formData.bg_to : '#2563eb'}
                      onChange={e => setFormData({ ...formData, bg_to: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={formData.bg_to}
                      onChange={e => setFormData({ ...formData, bg_to: e.target.value })}
                      className="flex-1 p-2 border border-slate-200 rounded-lg font-mono text-[11px]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.sort_order}
                    onChange={e => setFormData({ ...formData, sort_order: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.is_active)}
                      onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Active on storefront</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Starts At (Optional)</label>
                  <input
                    type="datetime-local"
                    value={formData.starts_at}
                    onChange={e => setFormData({ ...formData, starts_at: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ends At (Optional)</label>
                  <input
                    type="datetime-local"
                    value={formData.ends_at}
                    onChange={e => setFormData({ ...formData, ends_at: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-5 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Saving...
                    </>
                  ) : 'Save Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-banner-title" className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 size={19} />
              </div>
              <div>
                <h2 id="delete-banner-title" className="font-bold text-slate-900">Delete banner &ldquo;{deleteTarget.title}&rdquo;?</h2>
                <p className="text-xs text-slate-500 mt-1">
                  This permanently removes the promotional banner. This action cannot be undone.
                </p>
              </div>
            </div>
            {deleteError && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={deleting}
                className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} /> Delete banner
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
