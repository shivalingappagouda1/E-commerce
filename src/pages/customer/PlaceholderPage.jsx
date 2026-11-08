import { Construction } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Reusable placeholder for pages not yet implemented. */
export default function PlaceholderPage({ title = 'Coming Soon' }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <Construction size={48} className="text-brand-300 mb-4" />
      <h1 className="text-2xl font-bold text-slate-700 mb-2">{title}</h1>
      <p className="text-slate-500 mb-6">This page is under construction and will be available soon.</p>
      <Link to="/" className="text-brand-600 hover:underline font-medium">← Back to Home</Link>
    </div>
  )
}
