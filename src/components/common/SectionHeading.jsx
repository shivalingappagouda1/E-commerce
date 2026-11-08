/**
 * Generic section heading with optional "View All" link.
 */
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SectionHeading({ title, subtitle, viewAllLink }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-800 leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {viewAllLink && (
        <Link
          to={viewAllLink}
          className="flex items-center gap-0.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          View All <ChevronRight size={16} />
        </Link>
      )}
    </div>
  )
}
