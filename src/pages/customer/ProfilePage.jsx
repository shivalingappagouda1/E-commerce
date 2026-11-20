import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  User, Mail, Phone, MapPin, Plus, Trash2, Edit2,
  CheckCircle2, ShieldCheck, ShoppingBag, AlertCircle,
  Save, X, Star, Upload, Loader2
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import AccountDeletionPanel from '../../components/account/AccountDeletionPanel'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  validateAvatarFile,
  uploadAvatar,
  removeAvatarObject,
} from '../../services/authService'
import {
  fetchAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  updateCustomerProfile
} from '../../services/orderService'

const AVATAR_OPTIONS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
]

export default function ProfilePage() {
  const { user, profile, isAdmin, refreshProfile } = useAuth()

  // Tabs: 'profile' | 'addresses'
  const [activeTab, setActiveTab] = useState('profile')

  // Profile Form state
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState('')

  // Avatar Upload state
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarStage, setAvatarStage] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [avatarSuccess, setAvatarSuccess] = useState(false)
  const [avatarPreviewError, setAvatarPreviewError] = useState(false)
  const fileInputRef = useRef(null)
  const avatarUploadLockRef = useRef(false)
  const profileSaveLockRef = useRef(false)
  const activeUserIdRef = useRef(user?.id || null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    activeUserIdRef.current = user?.id || null
    avatarUploadLockRef.current = false
    setAvatarUploading(false)
    setAvatarStage('')
    setAvatarError('')
    setAvatarSuccess(false)
  }, [user?.id])

  // Addresses state
  const [addresses, setAddresses] = useState([])
  const [addressLoading, setAddressLoading] = useState(true)
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [addressForm, setAddressForm] = useState({
    full_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    is_default: false,
  })
  const [addressError, setAddressError] = useState('')
  const [addressSuccess, setAddressSuccess] = useState(false)

  // Initialize / reset profile fields cleanly when user or profile changes
  useEffect(() => {
    setAvatarPreviewError(false)
    if (profile) {
      setFullName(profile.full_name || '')
      setPhone(profile.phone || '')
      setSelectedAvatar(profile.avatar_url || '')
    } else if (user) {
      setFullName(user.user_metadata?.full_name || user.email?.split('@')[0] || '')
      setPhone('')
      setSelectedAvatar('')
    } else {
      // Demo guest user info
      try {
        const demoUser = JSON.parse(localStorage.getItem('shopkart_demo_user') || '{}')
        setFullName(demoUser.full_name || 'Demo Customer')
        setPhone(demoUser.phone || '+91 98765 43210')
        setSelectedAvatar(demoUser.avatar_url || '')
      } catch {
        setFullName('Demo Customer')
        setPhone('')
        setSelectedAvatar('')
      }
    }
  }, [profile, user])

  // Load addresses
  useEffect(() => {
    loadAddressList()
  }, [user?.id])

  async function loadAddressList() {
    setAddressLoading(true)
    const { data } = await fetchAddresses()
    setAddresses(data || [])
    setAddressLoading(false)
  }

  // Handle Avatar Upload from Device
  async function handleAvatarFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (avatarUploadLockRef.current || avatarUploading) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setAvatarError('')
    setAvatarSuccess(false)

    const initiatingUserId = user?.id || null
    const previousAvatar = selectedAvatar

    if (!isSupabaseConfigured || !initiatingUserId) {
      setAvatarError('Avatar upload requires a signed-in account connected to Supabase.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setAvatarStage('validating')
    const validation = validateAvatarFile({ userId: initiatingUserId, file })
    if (!validation.valid) {
      setAvatarStage('')
      setAvatarError(validation.error?.message || 'Selected image file is not supported.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    avatarUploadLockRef.current = true
    setAvatarUploading(true)
    setAvatarStage('uploading')

    try {
      const uploadRes = await uploadAvatar({
        userId: initiatingUserId,
        file,
        previousAvatarUrl: previousAvatar,
      })

      // Abort before profile mutation if user logged out or switched accounts mid-upload
      if (!mountedRef.current || activeUserIdRef.current !== initiatingUserId) {
        return
      }

      if (uploadRes.error || !uploadRes.url) {
        setAvatarError(uploadRes.error?.message || 'Failed to upload avatar image. Please try again.')
        return
      }

      setAvatarStage('saving')
      const { error: updateErr } = await updateCustomerProfile({
        avatar_url: uploadRes.url,
        expectedUserId: initiatingUserId,
      })

      if (!mountedRef.current || activeUserIdRef.current !== initiatingUserId) {
        return
      }

      if (updateErr) {
        // Preserve previous avatar completely; roll back only newly created differing-extension object
        if (!uploadRes.replacedExistingPath && uploadRes.storagePath) {
          await removeAvatarObject(uploadRes.storagePath)
        }
        if (mountedRef.current && activeUserIdRef.current === initiatingUserId) {
          setAvatarError('Image upload succeeded, but updating your profile failed. Previous avatar preserved.')
        }
        return
      }

      // Profile DB persistence succeeded for initiating user — update UI, clean up old object, refresh auth profile
      setSelectedAvatar(uploadRes.url)
      setAvatarPreviewError(false)
      setAvatarSuccess(true)

      if (uploadRes.previousStoragePath && activeUserIdRef.current === initiatingUserId) {
        await removeAvatarObject(uploadRes.previousStoragePath)
      }

      if (mountedRef.current && activeUserIdRef.current === initiatingUserId && typeof refreshProfile === 'function') {
        await refreshProfile(initiatingUserId)
      }

      setTimeout(() => {
        if (mountedRef.current && activeUserIdRef.current === initiatingUserId) {
          setAvatarSuccess(false)
        }
      }, 4000)
    } catch {
      if (mountedRef.current && activeUserIdRef.current === initiatingUserId) {
        setAvatarError('An unexpected error occurred while uploading your avatar. Please try again.')
      }
    } finally {
      if (mountedRef.current && activeUserIdRef.current === initiatingUserId) {
        avatarUploadLockRef.current = false
        setAvatarUploading(false)
        setAvatarStage('')
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle Profile Save
  async function handleProfileSubmit(e) {
    e.preventDefault()
    if (profileSaveLockRef.current || profileSaving) return

    setProfileError('')
    setProfileSuccess(false)

    if (!fullName.trim()) {
      setProfileError('Full name cannot be empty.')
      return
    }

    const initiatingUserId = user?.id || null
    profileSaveLockRef.current = true
    setProfileSaving(true)
    try {
      const { error } = await updateCustomerProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
        avatar_url: selectedAvatar,
        expectedUserId: initiatingUserId,
      })

      if (!mountedRef.current || (initiatingUserId && activeUserIdRef.current !== initiatingUserId)) {
        return
      }

      if (error) {
        setProfileError(error.message || 'Failed to update profile.')
      } else {
        setProfileSuccess(true)
        if (typeof refreshProfile === 'function') {
          await refreshProfile(initiatingUserId)
        }
        setTimeout(() => {
          if (mountedRef.current) {
            setProfileSuccess(false)
          }
        }, 3000)
      }
    } catch {
      if (mountedRef.current) {
        setProfileError('An unexpected error occurred while saving your profile.')
      }
    } finally {
      if (mountedRef.current) {
        profileSaveLockRef.current = false
        setProfileSaving(false)
      }
    }
  }

  // Open Address Modal (New or Edit)
  function handleOpenAddressModal(addr = null) {
    setAddressError('')
    if (addr) {
      setEditingAddressId(addr.id)
      setAddressForm({
        full_name: addr.full_name || '',
        phone: addr.phone || '',
        line1: addr.line1 || '',
        line2: addr.line2 || '',
        city: addr.city || '',
        state: addr.state || '',
        pincode: addr.pincode || '',
        is_default: addr.is_default || false,
      })
    } else {
      setEditingAddressId(null)
      setAddressForm({
        full_name: fullName || '',
        phone: phone || '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        pincode: '',
        is_default: addresses.length === 0,
      })
    }
    setAddressModalOpen(true)
  }

  // Save Address (Create or Update)
  async function handleAddressSubmit(e) {
    e.preventDefault()
    setAddressError('')

    if (!addressForm.full_name || !addressForm.phone || !addressForm.line1 || !addressForm.city || !addressForm.state || !addressForm.pincode) {
      setAddressError('Please fill in all mandatory address fields.')
      return
    }

    if (editingAddressId) {
      const { error } = await updateAddress(editingAddressId, addressForm)
      if (error) {
        setAddressError(error.message || 'Failed to update address.')
        return
      }
    } else {
      const { error } = await createAddress(addressForm)
      if (error) {
        setAddressError(error.message || 'Failed to create address.')
        return
      }
    }

    setAddressModalOpen(false)
    setAddressSuccess(true)
    setTimeout(() => setAddressSuccess(false), 3000)
    loadAddressList()
  }

  // Delete Address
  async function handleDeleteAddress(id) {
    if (window.confirm('Are you sure you want to delete this delivery address?')) {
      await deleteAddress(id)
      loadAddressList()
    }
  }

  // Set Default
  async function handleSetDefault(id) {
    await setDefaultAddress(id)
    loadAddressList()
  }

  const userEmail = user?.email || 'customer@shopkart.in'
  const initials = (fullName || 'U')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {selectedAvatar && !avatarPreviewError ? (
            <img
              src={selectedAvatar}
              alt={fullName}
              onError={() => setAvatarPreviewError(true)}
              className="w-16 h-16 rounded-full object-cover border-2 border-brand-500 shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-brand-600 to-amber-500 text-white font-black text-xl flex items-center justify-center shadow-sm">
              {initials}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{fullName || 'My Account'}</h1>
              {isAdmin && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-md">
                  Admin
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{userEmail}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/orders"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
          >
            <ShoppingBag size={14} /> My Orders
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl transition-colors"
            >
              <ShieldCheck size={14} /> Admin Dashboard
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'profile'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Profile Information
        </button>
        <button
          onClick={() => setActiveTab('addresses')}
          className={`pb-3 transition-colors border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'addresses'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Delivery Addresses
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {addresses.length}
          </span>
        </button>
      </div>

      {/* TAB 1: Profile Information */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 max-w-2xl space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Personal Information</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage your personal details and contact numbers</p>
          </div>

          {profileSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>Profile updated successfully!</span>
            </div>
          )}

          {profileError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
              <AlertCircle size={16} className="text-red-600" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4 text-xs">
            {/* Avatar Upload & Selection */}
            <div className="space-y-3">
              <label className="block font-semibold text-slate-700">Profile Avatar</label>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarFileChange}
                  disabled={avatarUploading || !isSupabaseConfigured || !user?.id}
                  className="hidden"
                  aria-label="Upload profile avatar image"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading || profileSaving || !isSupabaseConfigured || !user?.id}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {avatarUploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>
                        {avatarStage === 'saving'
                          ? 'Saving to profile...'
                          : 'Uploading photo...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      <span>Upload Photo</span>
                    </>
                  )}
                </button>

                <span className="text-[11px] text-slate-500">
                  {isSupabaseConfigured && user?.id
                    ? 'JPEG, PNG, WEBP, or GIF up to 5 MB'
                    : 'Sign in with a connected account to upload a custom photo'}
                </span>
              </div>

              {avatarUploading && (
                <div className="space-y-1.5" role="status" aria-live="polite">
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-brand-500 transition-all duration-300 ${
                        avatarStage === 'saving'
                          ? 'w-5/6'
                          : avatarStage === 'uploading'
                          ? 'w-1/2'
                          : 'w-1/4'
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {avatarStage === 'saving'
                      ? 'Step 2/2: Updating profile record...'
                      : 'Step 1/2: Uploading avatar image to secure storage...'}
                  </p>
                </div>
              )}

              {avatarSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>Avatar uploaded and saved to your profile!</span>
                </div>
              )}

              {avatarError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={15} className="text-red-600 shrink-0" />
                  <span>{avatarError}</span>
                </div>
              )}

              <div className="pt-1">
                <p className="text-[11px] font-medium text-slate-500 mb-2">Or choose a quick preset avatar:</p>
                <div className="flex items-center gap-3">
                  {AVATAR_OPTIONS.map((imgUrl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setSelectedAvatar(imgUrl)
                        setAvatarPreviewError(false)
                      }}
                      className={`relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                        selectedAvatar === imgUrl ? 'border-brand-500 ring-2 ring-brand-300' : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <img src={imgUrl} alt="Avatar preset" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  disabled
                  value={userEmail}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed font-medium"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Account login email cannot be changed</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mobile Phone</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={profileSaving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save size={15} />
                <span>{profileSaving ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: Delivery Addresses */}
      {activeTab === 'addresses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Saved Addresses</h2>
              <p className="text-xs text-slate-500 mt-0.5">Where your orders get delivered</p>
            </div>
            <button
              onClick={() => handleOpenAddressModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={15} /> Add New Address
            </button>
          </div>

          {addressSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>Address saved successfully!</span>
            </div>
          )}

          {addressLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
              <div className="h-40 bg-slate-100 rounded-2xl" />
              <div className="h-40 bg-slate-100 rounded-2xl" />
            </div>
          ) : addresses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-400">
              <MapPin size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-slate-700 text-sm">No saved addresses</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Add your delivery location to streamline checkout.</p>
              <button
                onClick={() => handleOpenAddressModal()}
                className="px-4 py-2 bg-brand-500 text-white font-bold text-xs rounded-xl"
              >
                Add Address
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addresses.map(addr => (
                <div
                  key={addr.id}
                  className={`bg-white rounded-2xl border p-5 relative flex flex-col justify-between transition-all ${
                    addr.is_default ? 'border-brand-500 ring-1 ring-brand-300 shadow-xs' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">{addr.full_name}</span>
                      {addr.is_default && (
                        <span className="text-[10px] font-bold uppercase bg-brand-50 text-brand-600 border border-brand-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Star size={10} className="fill-brand-500" /> Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {addr.line1}
                      {addr.line2 ? `, ${addr.line2}` : ''}
                      <br />
                      {addr.city}, {addr.state} - {addr.pincode}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Phone size={12} /> {addr.phone}
                    </p>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    {!addr.is_default ? (
                      <button
                        onClick={() => handleSetDefault(addr.id)}
                        className="text-slate-500 hover:text-brand-600 font-medium"
                      >
                        Set as Default
                      </button>
                    ) : <span />}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenAddressModal(addr)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Edit address"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete address"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Address Form Modal */}
      {addressModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <h3 className="font-bold text-slate-800 text-base">
                {editingAddressId ? 'Edit Delivery Address' : 'Add New Delivery Address'}
              </h3>
              <button
                onClick={() => setAddressModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddressSubmit} className="p-6 space-y-4 text-xs">
              {addressError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                  {addressError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.full_name}
                    onChange={e => setAddressForm(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Recipient's Name"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.phone}
                    onChange={e => setAddressForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="10-digit mobile number"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Address Line 1 (House/Flat, Building) *</label>
                <input
                  type="text"
                  required
                  value={addressForm.line1}
                  onChange={e => setAddressForm(p => ({ ...p, line1: e.target.value }))}
                  placeholder="e.g. Flat 402, Green Valley Apartments"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Address Line 2 (Street, Landmark)</label>
                <input
                  type="text"
                  value={addressForm.line2}
                  onChange={e => setAddressForm(p => ({ ...p, line2: e.target.value }))}
                  placeholder="e.g. Near Indiranagar Metro"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.city}
                    onChange={e => setAddressForm(p => ({ ...p, city: e.target.value }))}
                    placeholder="City"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.state}
                    onChange={e => setAddressForm(p => ({ ...p, state: e.target.value }))}
                    placeholder="State"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PIN Code *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.pincode}
                    onChange={e => setAddressForm(p => ({ ...p, pincode: e.target.value }))}
                    placeholder="6-digit PIN"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addressForm.is_default}
                  onChange={e => setAddressForm(p => ({ ...p, is_default: e.target.checked }))}
                  className="rounded text-brand-500 focus:ring-brand-500"
                />
                <span className="text-slate-700 font-medium">Make this my default delivery address</span>
              </label>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddressModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-lg"
                >
                  Save Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {!isAdmin && <AccountDeletionPanel />}
    </div>
  )
}
