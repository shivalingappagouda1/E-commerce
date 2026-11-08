import { Construction } from 'lucide-react'

/**
 * Shared placeholder used by all admin sub-pages not yet implemented.
 * Replace with the real implementation in Phase 2.
 */
export default function AdminPlaceholder({ title, description }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
      <Construction size={48} className="text-slate-200 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-slate-700 mb-2">{title}</h2>
      <p className="text-slate-400 max-w-sm mx-auto">
        {description || 'This section will be implemented in the next development phase.'}
      </p>
    </div>
  )
}
