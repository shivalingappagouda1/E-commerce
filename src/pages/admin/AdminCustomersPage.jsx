import { useState, useEffect, useMemo } from 'react'
import {
  Users, UserCheck, CreditCard, TrendingUp, Search,
  ChevronLeft, ChevronRight, Eye, X, Calendar, Phone,
  Mail, MapPin, ShoppingBag, ShieldCheck, AlertCircle, UserPlus
} from 'lucide-react'
import { adminFetchCustomers, adminFetchCustomerDetails, adminPromoteCustomerToAdmin } from '../../services/adminService'
import { formatPrice } from '../../utils/format'

const ITEMS_PER_PAGE = 8

const ORDER_FILTER_OPTIONS = [
  { value: 'all', label: 'All Customers' },
  { value: 'repeat', label: 'Repeat Buyers (2+ orders)' },
  { value: 'single', label: 'Single-order Buyers (1 order)' },
  { value: 'zero', label: 'No Orders Yet (0 orders)' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'spend_desc', label: 'Highest Spend' },
  { value: 'orders_desc', label: 'Most Orders' },
  { value: 'name_asc', label: 'Name (A–Z)' },
]

const STATUS_BADGE = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-purple-50 text-purple-700 border-purple-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [orderFilter, setOrderFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [currentPage, setCurrentPage] = useState(1)

  // Details Modal
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [customerDetails, setCustomerDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [promotingCustomerId, setPromotingCustomerId] = useState(null)
  const [actionMessage, setActionMessage] = useState(null)

  useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await adminFetchCustomers()
      if (err) {
        setError(err)
      } else {
        setCustomers(data || [])
      }
      setLoading(false)
    }
    init()
  }, [])

  // Open detail modal and fetch full orders
  async function handleViewCustomer(customerId) {
    setSelectedCustomerId(customerId)
    setDetailsLoading(true)
    const { data } = await adminFetchCustomerDetails(customerId)
    setCustomerDetails(data)
    setDetailsLoading(false)
  }

  function handleCloseModal() {
    setSelectedCustomerId(null)
    setCustomerDetails(null)
  }


  async function handlePromoteCustomer(customer) {
    if (!customer || customer.role !== 'customer' || customer.is_demo) return

    const confirmed = window.confirm(
      `Promote ${customer.full_name || customer.email || 'this account'} to Admin? They will receive administrator privileges after promotion.`
    )
    if (!confirmed) return

    setPromotingCustomerId(customer.id)
    setActionMessage(null)

    const result = await adminPromoteCustomerToAdmin(customer.id)
    if (!result.success) {
      setActionMessage({
        type: 'error',
        text: result.error?.message || 'Could not promote this account.',
      })
      setPromotingCustomerId(null)
      return
    }

    // Reflect the confirmed database result immediately in the current list.
    setCustomers(current => current.map(item =>
      String(item.id) === String(customer.id)
        ? { ...item, role: 'admin' }
        : item
    ))
    setActionMessage({
      type: 'success',
      text: `${customer.email || customer.full_name || 'Account'} has been promoted to Admin.`,
    })
    setPromotingCustomerId(null)
  }

  // Filter & Sort
  const filteredCustomers = useMemo(() => {
    let result = [...customers]

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(c =>
        (c.full_name && c.full_name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q))
      )
    }

    // Purchase filter
    if (orderFilter === 'repeat') {
      result = result.filter(c => (c.order_count || 0) >= 2)
    } else if (orderFilter === 'single') {
      result = result.filter(c => (c.order_count || 0) === 1)
    } else if (orderFilter === 'zero') {
      result = result.filter(c => (c.order_count || 0) === 0)
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at)
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
      if (sortBy === 'spend_desc') return (b.total_spend || 0) - (a.total_spend || 0)
      if (sortBy === 'orders_desc') return (b.order_count || 0) - (a.order_count || 0)
      if (sortBy === 'name_asc') return (a.full_name || '').localeCompare(b.full_name || '')
      return 0
    })

    return result
  }, [customers, searchTerm, orderFilter, sortBy])

  // Pagination with clamped safe page
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedCustomers = useMemo(() => {
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE
    return filteredCustomers.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredCustomers, safeCurrentPage])

  // High-level KPI summary
  const stats = useMemo(() => {
    const total = customers.length
    const activeBuyers = customers.filter(c => (c.order_count || 0) > 0).length
    const totalSpend = customers.reduce((sum, c) => sum + (c.total_spend || 0), 0)
    const avgSpend = total > 0 ? Math.round(totalSpend / total) : 0
    return { total, activeBuyers, totalSpend, avgSpend }
  }, [customers])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage customer accounts, purchase history, and lifetime spending.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Customers</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '—' : stats.total}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Users size={22} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Buyers</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '—' : stats.activeBuyers}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <UserCheck size={22} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer Spend</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '—' : formatPrice(stats.totalSpend)}</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <CreditCard size={22} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg. Customer Value</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '—' : formatPrice(stats.avgSpend)}</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <TrendingUp size={22} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, phone or city..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter by Order History */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={orderFilter}
            onChange={e => setOrderFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {ORDER_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>Error loading customer records: {error}</span>
        </div>
      )}

      {actionMessage && (
        <div className={`p-3 rounded-xl border text-sm ${
          actionMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {actionMessage.text}
        </div>
      )}

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Contact Info</th>
                <th className="py-3.5 px-4">Joined</th>
                <th className="py-3.5 px-4 text-center">Orders</th>
                <th className="py-3.5 px-4 text-right">Lifetime Spend</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                // Skeletons
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200" />
                        <div className="space-y-1.5">
                          <div className="w-28 h-3.5 bg-slate-200 rounded" />
                          <div className="w-20 h-3 bg-slate-100 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-1.5">
                        <div className="w-32 h-3.5 bg-slate-200 rounded" />
                        <div className="w-24 h-3 bg-slate-100 rounded" />
                      </div>
                    </td>
                    <td className="py-4 px-4"><div className="w-20 h-3.5 bg-slate-200 rounded" /></td>
                    <td className="py-4 px-4 text-center"><div className="w-8 h-5 bg-slate-200 rounded mx-auto" /></td>
                    <td className="py-4 px-4 text-right"><div className="w-16 h-3.5 bg-slate-200 rounded ml-auto" /></td>
                    <td className="py-4 px-4 text-center"><div className="w-12 h-6 bg-slate-200 rounded mx-auto" /></td>
                  </tr>
                ))
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Users size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-base font-semibold text-slate-700">No customers found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm || orderFilter !== 'all'
                        ? 'Try clearing your search query or changing filters.'
                        : 'No customer accounts registered yet.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map(customer => {
                  const initials = (customer.full_name || 'U')
                    .split(' ')
                    .map(n => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()

                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {customer.avatar_url ? (
                            <img
                              src={customer.avatar_url}
                              alt={customer.full_name}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-semibold text-xs flex items-center justify-center shrink-0 shadow-xs">
                              {initials}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                              {customer.full_name || 'Customer'}
                              {customer.role === 'admin' && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.2">
                                  <ShieldCheck size={11} /> Admin
                                </span>
                              )}
                              {customer.is_demo && (
                                <span className="inline-flex items-center text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.2">
                                  Demo
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {customer.city ? `${customer.city}${customer.state ? `, ${customer.state}` : ''}` : 'Location unlisted'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Info */}
                      <td className="py-3.5 px-4 text-xs space-y-0.5">
                        <div className="text-slate-700 font-medium flex items-center gap-1.5">
                          <Mail size={12} className="text-slate-400" />
                          <span>
                            {customer.email ? (
                              customer.email
                            ) : (
                              <span className="text-slate-400 italic font-normal">Auth-protected</span>
                            )}
                          </span>
                        </div>
                        {customer.phone && customer.phone !== 'N/A' && (
                          <div className="text-slate-500 flex items-center gap-1.5">
                            <Phone size={12} className="text-slate-400" />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {new Date(customer.created_at).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Orders Count */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          (customer.order_count || 0) > 0
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {customer.order_count || 0}
                        </span>
                      </td>

                      {/* Lifetime Spend */}
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                        {formatPrice(customer.total_spend || 0)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-wrap items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewCustomer(customer.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>
                          {customer.role === 'customer' && !customer.is_demo && (
                            <button
                              onClick={() => handlePromoteCustomer(customer)}
                              disabled={promotingCustomerId === customer.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Promote this verified account to administrator"
                            >
                              <UserPlus size={13} />
                              <span>{promotingCustomerId === customer.id ? 'Promoting…' : 'Make Admin'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {!loading && filteredCustomers.length > 0 && (
          <div className="py-3 px-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              Showing <span className="font-semibold text-slate-700">{(safeCurrentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
              <span className="font-semibold text-slate-700">
                {Math.min(safeCurrentPage * ITEMS_PER_PAGE, filteredCustomers.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-700">{filteredCustomers.length}</span> customers
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg font-medium transition-colors ${
                      safeCurrentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Details Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">
                  {(customerDetails?.full_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">
                    {detailsLoading ? 'Loading profile...' : customerDetails?.full_name || 'Customer Details'}
                  </h3>
                  <p className="text-xs text-slate-500">ID: {selectedCustomerId}</p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {detailsLoading ? (
                <div className="py-12 text-center text-slate-400 animate-pulse">Loading order history...</div>
              ) : customerDetails ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                      <span className="text-xs text-slate-500 font-medium">Total Orders</span>
                      <p className="text-xl font-bold text-slate-800 mt-0.5">
                        {customerDetails.orders?.length || 0}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                      <span className="text-xs text-slate-500 font-medium">Lifetime Spend</span>
                      <p className="text-xl font-bold text-emerald-600 mt-0.5">
                        {formatPrice(customerDetails.total_spend || 0)}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                      <span className="text-xs text-slate-500 font-medium">Avg Order</span>
                      <p className="text-xl font-bold text-blue-600 mt-0.5">
                        {formatPrice(
                          customerDetails.orders?.length
                            ? Math.round(
                                (customerDetails.total_spend || 0) /
                                  (customerDetails.orders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded').length || 1)
                              )
                            : 0
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Profile info block */}
                  <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Mail size={14} className="text-slate-400" />
                      <span className="font-semibold">Email:</span>
                      <span>{customerDetails.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Phone size={14} className="text-slate-400" />
                      <span className="font-semibold">Phone:</span>
                      <span>{customerDetails.phone || 'Not provided'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin size={14} className="text-slate-400" />
                      <span className="font-semibold">City/State:</span>
                      <span>{customerDetails.city ? `${customerDetails.city}, ${customerDetails.state || ''}` : 'Not provided'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Calendar size={14} className="text-slate-400" />
                      <span className="font-semibold">Joined On:</span>
                      <span>{new Date(customerDetails.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Order History */}
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                      <ShoppingBag size={16} className="text-blue-600" />
                      Order History ({customerDetails.orders?.length || 0})
                    </h4>

                    {customerDetails.orders?.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No orders placed by this customer yet.</p>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-3">Order ID</th>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {customerDetails.orders.map(o => (
                              <tr key={o.id} className="hover:bg-slate-50/50">
                                <td className="py-2.5 px-3 font-semibold text-slate-800">{o.id}</td>
                                <td className="py-2.5 px-3 text-slate-500">
                                  {new Date(o.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_BADGE[o.status] || 'bg-slate-100 text-slate-700'}`}>
                                    {o.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                                  {formatPrice(o.total_amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex justify-end">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
