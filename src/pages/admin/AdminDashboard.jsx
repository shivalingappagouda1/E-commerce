import {
  ShoppingBag, Users, Package, TrendingUp,
  ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react'
import { formatPrice } from '../../utils/format'

/** Stat card for the dashboard overview */
function StatCard({ icon: Icon, label, value, change, positive, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={16} className="text-white" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-black text-slate-800">{value}</p>
        <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
          {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          <span>{change} vs last month</span>
        </div>
      </div>
    </div>
  )
}

const STATS = [
  { icon: TrendingUp, label: 'Total Revenue',  value: formatPrice(1284500), change: '+12.4%', positive: true,  color: 'bg-brand-500' },
  { icon: ShoppingBag,label: 'Total Orders',   value: '3,847',              change: '+8.1%',  positive: true,  color: 'bg-blue-500'  },
  { icon: Package,    label: 'Products Listed',value: '248',                change: '+3',      positive: true,  color: 'bg-purple-500'},
  { icon: Users,      label: 'Customers',      value: '11,230',             change: '+5.6%',  positive: true,  color: 'bg-green-500' },
]

const RECENT_ORDERS = [
  { id: '#ORD-10041', customer: 'Rahul Sharma',   product: 'Sony WH-1000XM5',       amount: 29990, status: 'Delivered',  date: 'Nov 7' },
  { id: '#ORD-10040', customer: 'Priya Mehta',    product: 'iPhone 15 Pro 256GB',   amount: 134900, status: 'Processing', date: 'Nov 7' },
  { id: '#ORD-10039', customer: 'Amit Verma',     product: 'Samsung 55" QLED TV',   amount: 54999, status: 'Shipped',    date: 'Nov 6' },
  { id: '#ORD-10038', customer: 'Sneha Patel',    product: 'Nike Air Max 270',       amount: 7995,  status: 'Delivered',  date: 'Nov 6' },
  { id: '#ORD-10037', customer: 'Karan Joshi',    product: 'Dyson V15 Vacuum',       amount: 42900, status: 'Cancelled',  date: 'Nov 5' },
]

const STATUS_STYLES = {
  Delivered:  'bg-green-100 text-green-700',
  Processing: 'bg-blue-100 text-blue-700',
  Shipped:    'bg-amber-100 text-amber-700',
  Cancelled:  'bg-red-100 text-red-600',
}

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Dashboard Overview</h2>
        <p className="text-sm text-slate-500 mt-0.5">Welcome back! Here's what's happening with your store today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map(stat => <StatCard key={stat.label} {...stat} />)}
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Recent Orders</h3>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={12} /> Live data once Supabase is connected
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50">
                {['Order ID', 'Customer', 'Product', 'Amount', 'Date', 'Status'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECENT_ORDERS.map(order => (
                <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-700 whitespace-nowrap">{order.id}</td>
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{order.customer}</td>
                  <td className="px-6 py-3 text-slate-600 max-w-[180px] truncate">{order.product}</td>
                  <td className="px-6 py-3 font-semibold text-slate-800 whitespace-nowrap">{formatPrice(order.amount)}</td>
                  <td className="px-6 py-3 text-slate-400 whitespace-nowrap">{order.date}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notice banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>Phase 1 — Foundation Complete.</strong> This dashboard shows sample data.
        Connect Supabase in <code className="bg-blue-100 px-1 rounded">.env.local</code> to activate live data, authentication and full CRUD functionality.
      </div>
    </div>
  )
}
