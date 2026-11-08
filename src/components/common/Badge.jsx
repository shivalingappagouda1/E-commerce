/**
 * Reusable badge pill for product cards.
 */
const BADGE_STYLES = {
  'Best Seller':    'bg-green-100 text-green-800',
  'Trending':       'bg-purple-100 text-purple-800',
  'Hot':            'bg-red-100 text-red-700',
  'Top Deal':       'bg-orange-100 text-orange-700',
  'Deal of the Day':'bg-blue-100 text-blue-800',
  'Premium':        'bg-slate-100 text-slate-700',
  'Value Pick':     'bg-teal-100 text-teal-800',
  'New':            'bg-pink-100 text-pink-700',
}

export default function Badge({ label }) {
  if (!label) return null
  const cls = BADGE_STYLES[label] || 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}
