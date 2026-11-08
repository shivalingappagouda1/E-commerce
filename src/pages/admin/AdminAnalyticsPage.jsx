import { useState, useEffect } from 'react'
import {
  TrendingUp, ShoppingBag, Users, DollarSign, Clock,
  CheckCircle2, AlertCircle
} from 'lucide-react'
import { adminFetchAnalytics } from '../../services/adminService'
import { formatPrice } from '../../utils/format'

const TIME_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d',    label: 'Last 7 Days' },
  { value: '30d',   label: 'Last 30 Days' },
  { value: '90d',   label: 'Last 90 Days' },
  { value: '1y',    label: 'Past Year' },
  { value: 'all',   label: 'All Time' },
]

export default function AdminAnalyticsPage() {
  const [timeRange, setTimeRange] = useState('30d')
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hoveredPoint, setHoveredPoint] = useState(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await adminFetchAnalytics(timeRange)
      if (err) {
        setError(err)
      } else {
        setAnalytics(data)
      }
      setLoading(false)
    }
    loadData()
  }, [timeRange])

  // Chart computation
  const trendPoints = analytics?.trendPoints || []
  const maxRevenue = Math.max(...trendPoints.map(p => p.revenue), 1)

  // SVG dimensions
  const svgWidth = 800
  const svgHeight = 220
  const paddingX = 40
  const paddingY = 30
  const plotWidth = svgWidth - paddingX * 2
  const plotHeight = svgHeight - paddingY * 2

  const pointsCoordinates = trendPoints.map((pt, idx) => {
    const x = paddingX + (plotWidth / Math.max(trendPoints.length - 1, 1)) * idx
    const y = svgHeight - paddingY - (pt.revenue / maxRevenue) * plotHeight
    return { ...pt, x, y }
  })

  // Build SVG path
  const pathD = pointsCoordinates.length > 0
    ? pointsCoordinates.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '')
    : ''

  // Area path for gradient background
  const areaD = pointsCoordinates.length > 0
    ? `${pathD} L ${pointsCoordinates[pointsCoordinates.length - 1].x} ${svgHeight - paddingY} L ${pointsCoordinates[0].x} ${svgHeight - paddingY} Z`
    : ''

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analytics & Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor real-time sales performance, revenue trends, and customer metrics.
          </p>
        </div>

        {/* Time range selector pills */}
        <div className="flex flex-wrap items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
          {TIME_RANGES.map(tr => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                timeRange === tr.value
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>Error loading analytics data: {error}</span>
        </div>
      )}

      {/* 6 Key Performance Indicator Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Revenue */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Revenue</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign size={15} />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {loading ? '—' : formatPrice(analytics?.totalRevenue || 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Excludes cancelled</p>
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Orders</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <ShoppingBag size={15} />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {loading ? '—' : (analytics?.totalOrders || 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">In selected range</p>
        </div>

        {/* Average Order Value */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Avg Order</span>
            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
              <TrendingUp size={15} />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {loading ? '—' : formatPrice(analytics?.averageOrderValue || 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Per paid order</p>
        </div>

        {/* Total Customers */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Customers</span>
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users size={15} />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {loading ? '—' : (analytics?.totalCustomers || 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Registered base</p>
        </div>

        {/* Pending & Processing */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">To Fulfill</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Clock size={15} />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {loading ? '—' : (analytics?.pendingOrders || 0)}
          </p>
          <p className="text-[11px] text-amber-600 font-medium mt-1">Pending / Processing</p>
        </div>

        {/* Delivered Orders */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Delivered</span>
            <div className="p-1.5 bg-green-50 text-green-600 rounded-lg">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {loading ? '—' : (analytics?.deliveredOrders || 0)}
          </p>
          <p className="text-[11px] text-green-600 font-medium mt-1">
            {analytics?.totalOrders
              ? `${Math.round(((analytics.deliveredOrders || 0) / analytics.totalOrders) * 100)}% fulfilled`
              : '100% fulfilled'}
          </p>
        </div>
      </div>

      {/* Revenue Trend Interactive SVG Chart */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" />
              Revenue Over Time
            </h3>
            <p className="text-xs text-slate-400">
              Interactive timeline visualization for {TIME_RANGES.find(t => t.value === timeRange)?.label.toLowerCase()}
            </p>
          </div>

          {hoveredPoint && (
            <div className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-3 animate-in fade-in">
              <span className="text-slate-300 font-medium">{hoveredPoint.label}:</span>
              <span className="font-bold text-emerald-400">{formatPrice(hoveredPoint.revenue)}</span>
              <span className="text-slate-400">({hoveredPoint.orders} orders)</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="h-56 bg-slate-50 rounded-xl animate-pulse flex items-center justify-center text-slate-400 text-sm">
            Generating chart...
          </div>
        ) : pointsCoordinates.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
            No sales recorded during this period.
          </div>
        ) : (
          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-56 select-none overflow-visible"
            >
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = svgHeight - paddingY - pct * plotHeight
                return (
                  <g key={i}>
                    <line
                      x1={paddingX}
                      y1={y}
                      x2={svgWidth - paddingX}
                      y2={y}
                      stroke="#f1f5f9"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={paddingX - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="text-[10px] fill-slate-400 font-sans"
                    >
                      {formatPrice(Math.round(pct * maxRevenue))}
                    </text>
                  </g>
                )
              })}

              {/* Area fill */}
              {areaD && (
                <path d={areaD} fill="url(#revenueGradient)" />
              )}

              {/* Line */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points */}
              {pointsCoordinates.map((pt, i) => {
                const isHovered = hoveredPoint?.label === pt.label
                return (
                  <g key={i} className="cursor-pointer" onMouseEnter={() => setHoveredPoint(pt)} onMouseLeave={() => setHoveredPoint(null)}>
                    {/* Hover target circle */}
                    <circle cx={pt.x} cy={pt.y} r="12" fill="transparent" />
                    {/* Visual dot */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 6 : 4}
                      fill={isHovered ? '#1d4ed8' : '#3b82f6'}
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="transition-all duration-150"
                    />
                    {/* X-axis labels */}
                    <text
                      x={pt.x}
                      y={svgHeight - 10}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-400 font-sans"
                    >
                      {pt.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Row: Category Breakdown + Order Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Category */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 text-base mb-1">Sales by Category</h3>
          <p className="text-xs text-slate-400 mb-4">Revenue and quantity contribution across catalog departments</p>

          {loading ? (
            <div className="space-y-3 py-4 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-full" />
              <div className="h-4 bg-slate-100 rounded w-3/4" />
              <div className="h-4 bg-slate-100 rounded w-1/2" />
            </div>
          ) : !analytics?.salesByCategory?.length ? (
            <div className="py-8 text-center text-slate-400 text-xs">No category sales recorded yet.</div>
          ) : (
            <div className="space-y-4">
              {analytics.salesByCategory.map((cat, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{cat.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{cat.units} sold</span>
                      <span className="font-bold text-slate-800">{formatPrice(cat.revenue)}</span>
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {cat.percentage}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(cat.percentage, 3)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Fulfillment Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-base mb-1">Order Fulfillment Status</h3>
            <p className="text-xs text-slate-400 mb-4">Distribution of all placed orders in selected timeframe</p>

            {loading ? (
              <div className="py-8 text-center text-slate-400 text-xs animate-pulse">Calculating status...</div>
            ) : (
              <div className="space-y-3">
                {/* Delivered */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-green-50/60 border border-green-100 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="font-semibold text-green-900">Delivered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-green-800">{analytics?.orderStatusBreakdown?.delivered?.count || 0}</span>
                    <span className="text-[10px] text-green-700">({analytics?.orderStatusBreakdown?.delivered?.percent || 0}%)</span>
                  </div>
                </div>

                {/* Shipped */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-50/60 border border-purple-100 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <span className="font-semibold text-purple-900">Shipped</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-purple-800">{analytics?.orderStatusBreakdown?.shipped?.count || 0}</span>
                    <span className="text-[10px] text-purple-700">({analytics?.orderStatusBreakdown?.shipped?.percent || 0}%)</span>
                  </div>
                </div>

                {/* Processing */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="font-semibold text-blue-900">Processing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-800">{analytics?.orderStatusBreakdown?.processing?.count || 0}</span>
                    <span className="text-[10px] text-blue-700">({analytics?.orderStatusBreakdown?.processing?.percent || 0}%)</span>
                  </div>
                </div>

                {/* Pending */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-yellow-50/60 border border-yellow-100 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <span className="font-semibold text-yellow-900">Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-yellow-800">{analytics?.orderStatusBreakdown?.pending?.count || 0}</span>
                    <span className="text-[10px] text-yellow-700">({analytics?.orderStatusBreakdown?.pending?.percent || 0}%)</span>
                  </div>
                </div>

                {/* Cancelled */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-red-50/60 border border-red-100 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="font-semibold text-red-900">Cancelled / Refunded</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-red-800">{analytics?.orderStatusBreakdown?.cancelled?.count || 0}</span>
                    <span className="text-[10px] text-red-700">({analytics?.orderStatusBreakdown?.cancelled?.percent || 0}%)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Cancellation Rate</span>
            <span className="font-bold text-slate-800">
              {analytics?.orderStatusBreakdown?.cancelled?.percent || 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Row: Top 5 Best-Selling Products & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Products */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 text-base mb-1">Top Selling Products</h3>
          <p className="text-xs text-slate-400 mb-4">Highest revenue-generating catalog items</p>

          {loading ? (
            <div className="py-8 text-center text-slate-400 text-xs animate-pulse">Loading top items...</div>
          ) : !analytics?.topProducts?.length ? (
            <div className="py-8 text-center text-slate-400 text-xs">No product sales in this timeframe.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {analytics.topProducts.map((prod, idx) => (
                <div key={idx} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0 text-[10px]">
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <p className="font-semibold text-slate-800 truncate">{prod.name}</p>
                      <p className="text-slate-400 text-[11px]">{prod.units} units sold</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900">{formatPrice(prod.revenue)}</p>
                    <p className="text-slate-400 text-[10px]">{formatPrice(prod.unitPrice)}/unit</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders Stream */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 text-base mb-1">Recent Transactions</h3>
          <p className="text-xs text-slate-400 mb-4">Latest orders placed through storefront and checkout</p>

          {loading ? (
            <div className="py-8 text-center text-slate-400 text-xs animate-pulse">Loading transactions...</div>
          ) : !analytics?.recentOrders?.length ? (
            <div className="py-8 text-center text-slate-400 text-xs">No orders placed yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {analytics.recentOrders.map(ord => (
                <div key={ord.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{ord.id}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-medium text-slate-600">
                        {ord.customer_name || ord.profiles?.full_name || 'Customer'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      {new Date(ord.created_at).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">{formatPrice(ord.total_amount)}</p>
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize mt-0.5 ${
                      ord.status === 'delivered' ? 'bg-green-50 text-green-700' :
                      ord.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                      ord.status === 'shipped' ? 'bg-purple-50 text-purple-700' :
                      ord.status === 'cancelled' ? 'bg-red-50 text-red-700' :
                      'bg-yellow-50 text-yellow-700'
                    }`}>
                      {ord.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
