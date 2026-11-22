import ProductCard from './ProductCard'

/**
 * Responsive product grid. Renders a list of ProductCard components.
 * @param {object[]} products - normalized product array from the service layer
 * @param {number}   cols     - max columns (default 4)
 */
export default function ProductGrid({ products = [], cols = 4, cardTheme }) {
  if (!products.length) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="text-lg">No products found.</p>
      </div>
    )
  }

  const gridClass =
    cols === 2 ? 'grid-cols-1 sm:grid-cols-2'
    : cols === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'

  return (
    <div className={`grid ${gridClass} gap-4`}>
      {products.map(product => (
        <ProductCard key={product.id} product={product} cardTheme={cardTheme} />
      ))}
    </div>
  )
}
