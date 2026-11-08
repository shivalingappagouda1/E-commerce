import { Link } from 'react-router-dom'
import { ShoppingBag } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <ShoppingBag size={64} className="text-slate-200 mb-4" />
      <h1 className="text-6xl font-black text-slate-200 mb-2">404</h1>
      <h2 className="text-xl font-bold text-slate-700 mb-2">Page Not Found</h2>
      <p className="text-slate-500 mb-6 max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors">
        Back to Home
      </Link>
    </div>
  )
}
