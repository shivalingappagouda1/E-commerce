import { useState, useEffect } from 'react'
import { AlertTriangle, Search, Save } from 'lucide-react'
import { adminFetchProducts, adminUpdateStock } from '../../services/adminService'
import { formatPrice } from '../../utils/format'

export default function AdminInventoryPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [stockInputs, setStockInputs] = useState({})

  async function loadInventory() {
    setLoading(true)
    const { data } = await adminFetchProducts()
    const prods = data || []
    setProducts(prods)
    const initialInputs = {}
    prods.forEach(p => {
      initialInputs[p.id] = p.stock ?? p.inventory?.[0]?.quantity ?? 20
    })
    setStockInputs(initialInputs)
    setLoading(false)
  }

  useEffect(() => {
    loadInventory()
  }, [])

  function handleInputChange(id, val) {
    setStockInputs(prev => ({ ...prev, [id]: Number(val) }))
  }

  async function handleQuickSave(id) {
    setSavingId(id)
    const newQty = stockInputs[id] ?? 0
    await adminUpdateStock(id, newQty)
    setSavingId(null)
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, stock: newQty, inStock: newQty > 0 }
      }
      return p
    }))
  }

  const filteredProducts = products.filter(p => {
    const q = searchTerm.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
  })

  const lowStockItems = products.filter(p => {
    const qty = p.stock ?? p.inventory?.[0]?.quantity ?? 20
    return qty < 10
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Inventory Management</h1>
        <p className="text-xs text-slate-500 mt-1">
          Monitor warehouse stock, adjust product quantities, and manage low-stock thresholds
        </p>
      </div>

      {/* Low Stock Alert Strip */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-800 shadow-sm">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold">Attention: {lowStockItems.length} product(s) running low on stock</h3>
            <p className="text-amber-700 leading-relaxed">
              Items with fewer than 10 units in stock require replenishment soon to avoid fulfillment delays.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filter inventory by product name or category..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-5 py-3">Product Name</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Unit Price</th>
                <th className="px-5 py-3">Stock Level</th>
                <th className="px-5 py-3">Quick Adjust</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-400">
                    Loading warehouse stock...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-400">
                    No matching products found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(prod => {
                  const currentStock = prod.stock ?? prod.inventory?.[0]?.quantity ?? 20
                  const isLow = currentStock < 10
                  const isOut = currentStock <= 0
                  const inputValue = stockInputs[prod.id] ?? currentStock

                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-900 max-w-xs truncate">
                        {prod.name}
                      </td>

                      <td className="px-5 py-3 text-slate-600 font-medium">
                        {prod.category || 'General'}
                      </td>

                      <td className="px-5 py-3 font-bold text-slate-900">
                        {formatPrice(prod.price)}
                      </td>

                      <td className="px-5 py-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            isOut
                              ? 'bg-red-100 text-red-700'
                              : isLow
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'Optimal'} ({currentStock})
                        </span>
                      </td>

                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 max-w-[120px]">
                          <input
                            type="number"
                            min="0"
                            value={inputValue}
                            onChange={e => handleInputChange(prod.id, e.target.value)}
                            className="w-20 p-1.5 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500 text-center"
                          />
                          <span className="text-slate-400 text-[11px]">pcs</span>
                        </div>
                      </td>

                      <td className="px-5 py-3 text-right">
                        <button
                          disabled={savingId === prod.id || inputValue === currentStock}
                          onClick={() => handleQuickSave(prod.id)}
                          className="bg-brand-500 hover:bg-brand-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center gap-1"
                        >
                          <Save size={13} /> Save
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
