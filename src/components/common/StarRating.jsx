import { Star } from 'lucide-react'

/**
 * Renders a star rating row.
 * @param {number} rating - float 0–5
 * @param {number} count  - review count
 * @param {'sm'|'md'} size
 */
export default function StarRating({ rating = 0, count, size = 'sm' }) {
  const full  = Math.floor(rating)
  const half  = rating - full >= 0.5
  const empty = 5 - full - (half ? 1 : 0)
  const sz    = size === 'md' ? 16 : 12

  return (
    <div className="flex items-center gap-1">
      {/* Filled stars */}
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} size={sz} className="fill-amber-400 text-amber-400" />
      ))}
      {/* Half star approximation — show as filled with lower opacity */}
      {half && <Star size={sz} className="fill-amber-200 text-amber-400" />}
      {/* Empty stars */}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} size={sz} className="fill-gray-200 text-gray-300" />
      ))}
      {count != null && (
        <span className="text-xs text-slate-500 ml-1">({count.toLocaleString('en-IN')})</span>
      )}
    </div>
  )
}
