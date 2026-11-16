import { useLocation, Link } from 'react-router-dom'
import { Info, ArrowLeft, ArrowRight, HelpCircle } from 'lucide-react'

const INFORMATIONAL_PAGES = {
  '/about': {
    title: 'About ShopKart',
    category: 'Company',
    description: 'Learn about our journey, vision, and commitment to providing high quality e-commerce products across India.',
  },
  '/careers': {
    title: 'Careers & Opportunities',
    category: 'Company',
    description: 'Join our technology, logistics, and merchandising teams. Information about current openings will be updated shortly.',
  },
  '/press': {
    title: 'Press & Media Relations',
    category: 'Company',
    description: 'Official press releases, media kits, brand assets, and platform announcements.',
  },
  '/blog': {
    title: 'ShopKart Insights & Blog',
    category: 'Company',
    description: 'Articles on the latest tech innovations, style guides, smart home tips, and platform news.',
  },
  '/help': {
    title: 'Help Center & Customer Support',
    category: 'Customer Service',
    description: 'Frequently asked questions regarding order placement, tracking, payments, and account management.',
  },
  '/returns': {
    title: 'Returns & Exchange Policy',
    category: 'Customer Service',
    description: 'Details on our 7-day doorstep return and exchange procedures, eligibility conditions, and refund timelines.',
  },
  '/track-order': {
    title: 'Track Your Shipment',
    category: 'Customer Service',
    description: 'Live delivery updates and carrier milestone information. You can also view active shipments directly in your Orders page.',
  },
  '/shipping': {
    title: 'Shipping & Delivery Information',
    category: 'Customer Service',
    description: 'Information regarding domestic shipping rates, free shipping eligibility (orders above ₹999), and delivery timeframes.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    category: 'Legal & Compliance',
    description: 'How ShopKart safeguards customer information, data retention practices, and your privacy rights under applicable data protection laws.',
  },
  '/terms': {
    title: 'Terms of Service',
    category: 'Legal & Compliance',
    description: 'The terms, user agreements, and conditions governing browsing, purchasing, and interacting on the ShopKart marketplace.',
  },
  '/cookies': {
    title: 'Cookie & Storage Policy',
    category: 'Legal & Compliance',
    description: 'How ShopKart uses essential cookies and local storage tokens to preserve shopping carts, active sessions, and preferences.',
  },
}

/**
 * Reusable informational page for standard company and policy links.
 * Avoids 404s, provides accurate titles, and clearly indicates when policy documentation is under editorial review.
 */
export default function PlaceholderPage({ title, description, category }) {
  const location = useLocation()
  const path = location.pathname.toLowerCase().replace(/\/+$/, '')
  const meta = INFORMATIONAL_PAGES[path] || {}

  const pageTitle = title || meta.title || 'Information Center'
  const pageCategory = category || meta.category || 'ShopKart Storefront'
  const pageDesc = description || meta.description || 'This section is being updated with the latest documentation and guidelines.'

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-brand-600 transition-colors">Home</Link>
        <span>/</span>
        <span className="text-slate-400">{pageCategory}</span>
        <span>/</span>
        <span className="text-slate-800 font-bold">{pageTitle}</span>
      </nav>

      {/* Main Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-8 sm:p-12 space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto shadow-xs">
          <Info size={32} />
        </div>

        <div className="space-y-2 max-w-xl mx-auto">
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-100">
            {pageCategory}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {pageTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-1">
            {pageDesc}
          </p>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl max-w-lg mx-auto text-left text-xs text-slate-600 space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <HelpCircle size={15} className="text-brand-500 shrink-0" />
            <span>Need immediate assistance?</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-normal">
            For active order questions or account help, visit <Link to="/orders" className="text-brand-600 font-bold hover:underline">My Orders</Link> or contact our customer support team directly.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} />
            <span>Return to Storefront</span>
          </Link>
          <Link
            to="/category/all"
            className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-6 py-3 rounded-xl transition-colors cursor-pointer"
          >
            <span>Browse Products</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  )
}
