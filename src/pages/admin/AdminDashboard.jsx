
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ShoppingBag,
  Users,
  Package,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'

import { formatPrice } from '../../utils/format'
import { supabase, isSupabaseConfigured } from '../../lib/supabase.js'

import {
  adminFetchOrders,
  adminFetchProducts,
  adminFetchCustomers,
} from '../../services/adminService.js'

function StatCard({ icon: Icon, label, value, change, positive, color, loading }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {label}
        </span>

        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={16} className="text-white" />
        </div>
      </div>

      <div>
        <p className="text-2xl font-black text-slate-800">
          {loading ? '...' : value}
        </p>

        <div
          className={`flex items-center gap-1 mt-1 text-xs font-medium ${
            positive ? 'text-green-600' : 'text-red-500'
          }`}
        >
          {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          <span>{loading ? 'Loading data...' : change}</span>
        </div>
      </div>
    </div>
  )
}

const STATUS_STYLES = {
  delivered: 'bg-green-100 text-green-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-600',
  pending: 'bg-yellow-100 text-yellow-700',
  refunded: 'bg-purple-100 text-purple-700',
}

function getMonthRange(offset = 0) {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1)

  return {
    start: date,
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  }
}

function isInRange(dateValue, range) {
  if (!dateValue) return false

  const date = new Date(dateValue)

  return (
    !Number.isNaN(date.getTime()) &&
    date >= range.start &&
    date < range.end
  )
}

function getPercentageChange(current, previous) {
  if (previous === 0) {
    return current > 0 ? 'New this month' : 'No change'
  }

  const percentage = ((current - previous) / previous) * 100
  const rounded = Math.abs(percentage).toFixed(1)

  return `${percentage >= 0 ? '+' : '-'}${rounded}% vs last month`
}

function getCountChange(current, previous) {
  const difference = current - previous

  if (difference === 0) return 'No change vs last month'

  return `${difference > 0 ? '+' : ''}${difference} vs last month`
}

function getOrderPaymentStatus(order) {
  return (
    order.payment?.status ||
    order.payment_status ||
    order.payments?.[0]?.status ||
    ''
  ).toLowerCase()
}

function getOrderAmount(order) {
  return Number(
    order.payment?.amount ??
    order.total_amount ??
    order.total ??
    0
  ) || 0
}

function getCustomerName(order) {
  return (
    order.profiles?.full_name ||
    order.addresses?.full_name ||
    order.customer_name ||
    'Customer'
  )
}

function getProductName(order) {
  const items = order.order_items || order.items || []
  if (!Array.isArray(items) || items.length === 0) return '—'

  const getName = item =>
    item.product_name ||
    item.name ||
    item.product?.name ||
    item.products?.name ||
    item.product_details?.name ||
    'Product name unavailable'

  const firstName = getName(items[0])
  return items.length > 1
    ? `${firstName} + ${items.length - 1} more`
    : firstName
}

function getOrderStatus(order) {
  return String(order.status || 'pending').toLowerCase()
}

function formatDate(dateValue) {
  if (!dateValue) return '—'

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatOrderId(order) {
  const value = order.order_number || order.id || '—'
  return String(value).startsWith('#') ? value : `#${value}`
}

function isCompletedPayment(order) {
  return getOrderPaymentStatus(order) === 'completed'
}

export default function AdminDashboard() {
  const [stats, setStats] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchingRef = useRef(false)
  const mountedRef = useRef(false)

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured || !supabase) {
      setError(
        'Supabase is not configured. Check your VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.'
      )
      setLoading(false)
      return
    }

    if (fetchingRef.current) return

    fetchingRef.current = true

    if (!silent) {
      setRefreshing(true)
    }

    try {
      const [ordersResult, productsResult, customersResult] =
        await Promise.all([
          adminFetchOrders(),
          adminFetchProducts(),
          adminFetchCustomers(),
        ])

      if (!mountedRef.current) return

      if (ordersResult.error) {
        throw new Error(
          ordersResult.error.message || 'Unable to fetch orders.'
        )
      }

      if (productsResult.error) {
        throw new Error(
          productsResult.error.message || 'Unable to fetch products.'
        )
      }

      if (customersResult.error) {
        throw new Error(
          customersResult.error.message || 'Unable to fetch customers.'
        )
      }

      const orders = Array.isArray(ordersResult.data)
        ? ordersResult.data
        : []

      const products = Array.isArray(productsResult.data)
        ? productsResult.data
        : []

      const customers = Array.isArray(customersResult.data)
        ? customersResult.data.filter(
            customer =>
              customer.role === 'customer' &&
              customer.is_demo !== true
          )
        : []

      const currentMonth = getMonthRange(0)
      const previousMonth = getMonthRange(-1)

      // Revenue includes only orders with completed payments.
      const paidOrders = orders.filter(isCompletedPayment)

      const totalRevenue = paidOrders.reduce(
        (sum, order) => sum + getOrderAmount(order),
        0
      )

      const currentMonthRevenue = paidOrders
        .filter(order =>
          isInRange(
            order.payment?.paid_at || order.created_at,
            currentMonth
          )
        )
        .reduce((sum, order) => sum + getOrderAmount(order), 0)

      const previousMonthRevenue = paidOrders
        .filter(order =>
          isInRange(
            order.payment?.paid_at || order.created_at,
            previousMonth
          )
        )
        .reduce((sum, order) => sum + getOrderAmount(order), 0)

      const currentMonthOrders = orders.filter(order =>
        isInRange(order.created_at, currentMonth)
      ).length

      const previousMonthOrders = orders.filter(order =>
        isInRange(order.created_at, previousMonth)
      ).length

      const currentMonthProducts = products.filter(product =>
        isInRange(product.created_at, currentMonth)
      ).length

      const previousMonthProducts = products.filter(product =>
        isInRange(product.created_at, previousMonth)
      ).length

      const currentMonthCustomers = customers.filter(customer =>
        isInRange(customer.created_at, currentMonth)
      ).length

      const previousMonthCustomers = customers.filter(customer =>
        isInRange(customer.created_at, previousMonth)
      ).length

      setStats([
        {
          icon: TrendingUp,
          label: 'Total Revenue',
          value: formatPrice(totalRevenue),
          change: getPercentageChange(
            currentMonthRevenue,
            previousMonthRevenue
          ),
          positive: currentMonthRevenue >= previousMonthRevenue,
          color: 'bg-brand-500',
        },
        {
          icon: ShoppingBag,
          label: 'Total Orders',
          value: orders.length.toLocaleString('en-IN'),
          change: getCountChange(
            currentMonthOrders,
            previousMonthOrders
          ),
          positive: currentMonthOrders >= previousMonthOrders,
          color: 'bg-blue-500',
        },
        {
          icon: Package,
          label: 'Products Listed',
          value: products.length.toLocaleString('en-IN'),
          change: getCountChange(
            currentMonthProducts,
            previousMonthProducts
          ),
          positive: currentMonthProducts >= previousMonthProducts,
          color: 'bg-purple-500',
        },
        {
          icon: Users,
          label: 'Customers',
          value: customers.length.toLocaleString('en-IN'),
          change: getCountChange(
            currentMonthCustomers,
            previousMonthCustomers
          ),
          positive: currentMonthCustomers >= previousMonthCustomers,
          color: 'bg-green-500',
        },
      ])

      const sortedOrders = [...orders].sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      )

      setRecentOrders(sortedOrders.slice(0, 5))
      setError('')
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[AdminDashboard] Dashboard fetch failed:', err)

      if (mountedRef.current) {
        setError(err.message || 'Unable to load dashboard data.')
      }
    } finally {
      fetchingRef.current = false

      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    fetchDashboardData()

    if (!supabase || !isSupabaseConfigured) {
      return () => {
        mountedRef.current = false
      }
    }

    // Subscribe to changes in dashboard-related database tables.
    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchDashboardData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => fetchDashboardData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => fetchDashboardData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => fetchDashboardData(true)
      )
      .subscribe()

    // Fallback refresh in case Realtime events are unavailable.
    const refreshInterval = window.setInterval(
      () => fetchDashboardData(true),
      60000
    )

    return () => {
      mountedRef.current = false
      window.clearInterval(refreshInterval)
      supabase.removeChannel(channel)
    }
  }, [fetchDashboardData])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Dashboard Overview
          </h2>

          <p className="text-sm text-slate-500 mt-0.5">
            Welcome back! Here's what's happening with your store today.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchDashboardData()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={refreshing ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Dashboard data could not be loaded</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.length > 0
          ? stats.map(stat => (
              <StatCard
                key={stat.label}
                {...stat}
                loading={loading}
              />
            ))
          : ['Total Revenue', 'Total Orders', 'Products Listed', 'Customers'].map(
              label => (
                <div
                  key={label}
                  className="bg-white rounded-xl border border-slate-100 shadow-sm p-5"
                >
                  <p className="text-xs font-semibold text-slate-500 uppercase">
                    {label}
                  </p>
                  <p className="mt-4 text-2xl font-black text-slate-300">
                    {loading ? '...' : '—'}
                  </p>
                </div>
              )
            )}
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">
            Recent Orders
          </h3>

          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={12} />
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString('en-IN')}`
              : 'Waiting for database'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50">
                {[
                  'Order ID',
                  'Customer',
                  'Product',
                  'Amount',
                  'Date',
                  'Status',
                ].map(heading => (
                  <th
                    key={heading}
                    className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-slate-400"
                  >
                    Loading real orders...
                  </td>
                </tr>
              ) : recentOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-slate-400"
                  >
                    {error
                      ? 'Orders are unavailable. Check the error above.'
                      : 'No orders found in your database yet.'}
                  </td>
                </tr>
              ) : (
                recentOrders.map(order => {
                  const status = getOrderStatus(order)

                  return (
                    <tr
                      key={order.id}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {formatOrderId(order)}
                      </td>

                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {getCustomerName(order)}
                      </td>

                      <td className="px-6 py-3 text-slate-600 max-w-[220px] truncate">
                        {getProductName(order)}
                      </td>

                      <td className="px-6 py-3 font-semibold text-slate-800 whitespace-nowrap">
                        {formatPrice(getOrderAmount(order))}
                      </td>

                      <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </td>

                      <td className="px-6 py-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                            STATUS_STYLES[status] ||
                            'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live data notice */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <span className="mt-0.5 h-2 w-2 rounded-full bg-green-500 shrink-0" />

        <div>
          <strong>Live database connection.</strong>
          <p className="mt-1">
            Dashboard statistics are fetched from Supabase. Realtime
            subscriptions update the overview when database records change.
            A periodic refresh also runs every 60 seconds.
          </p>
        </div>
      </div>
    </div>
  )
}
