import { useState, useEffect } from 'react'
import {
  Settings, Store, Mail, MapPin, IndianRupee, ShieldAlert,
  Save, RotateCcw, CheckCircle2, AlertCircle, Info, Phone
} from 'lucide-react'
import { adminFetchSettings, adminSaveSettings, DEFAULT_STORE_SETTINGS } from '../../services/adminService'

export default function AdminSettingsPage() {
  const [formData, setFormData] = useState(DEFAULT_STORE_SETTINGS)
  const [initialData, setInitialData] = useState(DEFAULT_STORE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  // Maintenance Confirmation Modal
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)
  const [pendingMaintenanceValue, setPendingMaintenanceValue] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      const { data } = await adminFetchSettings()
      if (data) {
        setFormData(data)
        setInitialData(data)
      }
      setLoading(false)
    }
    loadSettings()
  }, [])

  function handleChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
    setSaveSuccess(false)
    setErrorMessage(null)
  }

  function handleMaintenanceToggle(checked) {
    if (checked) {
      // Require confirmation to enable maintenance mode
      setPendingMaintenanceValue(true)
      setShowMaintenanceModal(true)
    } else {
      handleChange('maintenanceMode', false)
    }
  }

  function confirmMaintenance() {
    handleChange('maintenanceMode', pendingMaintenanceValue)
    setShowMaintenanceModal(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // Validations
    if (!formData.storeName.trim()) {
      setErrorMessage('Store name cannot be empty.')
      return
    }

    if (!formData.supportEmail.trim() || !formData.supportEmail.includes('@')) {
      setErrorMessage('Please enter a valid support email address.')
      return
    }

    if (Number(formData.freeShippingThreshold) < 0 || Number(formData.defaultShippingFee) < 0) {
      setErrorMessage('Shipping fees and thresholds must be non-negative numbers.')
      return
    }

    if (Number(formData.taxRatePercent) < 0 || Number(formData.taxRatePercent) > 100) {
      setErrorMessage('Tax rate must be between 0% and 100%.')
      return
    }

    setSaving(true)
    setErrorMessage(null)

    const { data, error } = await adminSaveSettings(formData)
    setSaving(false)

    if (error) {
      setErrorMessage(error)
    } else {
      setInitialData(data)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 4000)
    }
  }

  function handleReset() {
    setFormData(initialData)
    setErrorMessage(null)
    setSaveSuccess(false)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Store Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure store identity, support contacts, tax rules, shipping fees, and maintenance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs disabled:opacity-40 cursor-pointer"
          >
            <Save size={14} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Storage Architecture Notice */}
      <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-3 text-xs text-blue-900 leading-relaxed">
        <Info size={17} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-blue-950">Storage Architecture Notice: </span>
          The PostgreSQL schema (<code className="bg-blue-100/70 px-1 py-0.5 rounded text-blue-950 font-mono">database/schema.sql</code>)
          defines 17 domain tables and does not include a dedicated store configuration table.
          These store settings are persisted in browser demo storage (<code className="bg-blue-100/70 px-1 py-0.5 rounded text-blue-950 font-mono">shopkart_store_settings</code>).
          In a production migration, a table such as <code className="bg-blue-100/70 px-1 py-0.5 rounded text-blue-950 font-mono">store_settings (key text primary key, value jsonb)</code> with RLS policies would host these values.
        </div>
      </div>

      {/* Alerts */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-medium animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>Store settings have been successfully saved and applied!</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800 text-xs font-medium animate-in fade-in">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Store Identity */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <Store size={18} className="text-blue-600" />
            <h2 className="font-bold text-slate-800 text-base">Store Identity</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Store Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.storeName}
                onChange={e => handleChange('storeName', e.target.value)}
                placeholder="e.g. ShopKart"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tagline</label>
              <input
                type="text"
                value={formData.tagline}
                onChange={e => handleChange('tagline', e.target.value)}
                placeholder="e.g. India's Premier Online Store"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Store Description</label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Brief summary of your e-commerce catalog..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Contact & Support */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <Mail size={18} className="text-blue-600" />
            <h2 className="font-bold text-slate-800 text-base">Contact & Support</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Support Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={formData.supportEmail}
                  onChange={e => handleChange('supportEmail', e.target.value)}
                  placeholder="support@shopkart.in"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Support Phone</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={formData.supportPhone}
                  onChange={e => handleChange('supportPhone', e.target.value)}
                  placeholder="+91 80 4567 8900"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Store / Business Address</label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={e => handleChange('address', e.target.value)}
                  placeholder="Headquarters address..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Currency & Localization */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <IndianRupee size={18} className="text-blue-600" />
            <h2 className="font-bold text-slate-800 text-base">Currency & Localization</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Currency Code</label>
              <input
                type="text"
                disabled
                value={formData.currency}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-medium"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Fixed to INR for India storefront</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Currency Symbol</label>
              <input
                type="text"
                disabled
                value={formData.currencySymbol}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-medium"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Rupee symbol (₹)</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Store Timezone</label>
              <input
                type="text"
                value={formData.timezone}
                onChange={e => handleChange('timezone', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Commerce & Shipping Rules */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <Settings size={18} className="text-blue-600" />
            <h2 className="font-bold text-slate-800 text-base">Shipping & Tax Rules</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Free Shipping Threshold (₹)</label>
              <input
                type="number"
                min="0"
                value={formData.freeShippingThreshold}
                onChange={e => handleChange('freeShippingThreshold', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Orders above this qualify for free shipping</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Standard Shipping Fee (₹)</label>
              <input
                type="number"
                min="0"
                value={formData.defaultShippingFee}
                onChange={e => handleChange('defaultShippingFee', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Fee applied below free shipping threshold</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">GST / Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.taxRatePercent}
                onChange={e => handleChange('taxRatePercent', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Standard tax applied to eligible merchandise</span>
            </div>
          </div>

          {/* Checkout & Review Toggles */}
          <div className="pt-3 border-t border-slate-100 space-y-3 text-xs">
            <label className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
              <div>
                <p className="font-semibold text-slate-800">Allow Guest Checkout</p>
                <p className="text-[11px] text-slate-400">Allow visitors to place orders without creating an account first</p>
              </div>
              <input
                type="checkbox"
                checked={formData.allowGuestCheckout}
                onChange={e => handleChange('allowGuestCheckout', e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
              <div>
                <p className="font-semibold text-slate-800">Auto-Approve Reviews</p>
                <p className="text-[11px] text-slate-400">Publish customer reviews immediately without manual moderation</p>
              </div>
              <input
                type="checkbox"
                checked={formData.autoApproveReviews}
                onChange={e => handleChange('autoApproveReviews', e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
            </label>
          </div>
        </div>

        {/* Section 5: Operations & Maintenance */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <ShieldAlert size={18} className="text-amber-600" />
            <h2 className="font-bold text-slate-800 text-base">Store Operations & Maintenance</h2>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/60 border border-amber-200/70">
            <div>
              <p className="font-bold text-amber-950 text-xs">Storefront Maintenance Mode</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                When enabled, the public customer storefront displays a maintenance message. Admins retain full dashboard access.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleMaintenanceToggle(!formData.maintenanceMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                formData.maintenanceMode
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {formData.maintenanceMode ? 'Active (Enabled)' : 'Disabled'}
            </button>
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 cursor-pointer"
          >
            Cancel Changes
          </button>
          <button
            type="submit"
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs disabled:opacity-40 cursor-pointer"
          >
            <Save size={14} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Maintenance Mode Confirmation Modal */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-2 bg-amber-100 rounded-xl">
                <ShieldAlert size={22} />
              </div>
              <h3 className="font-bold text-slate-800 text-base">Enable Maintenance Mode?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Enabling maintenance mode will temporarily prevent customers from browsing products and placing orders.
              Are you sure you want to enable this for the storefront?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMaintenanceModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMaintenance}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                Confirm & Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
