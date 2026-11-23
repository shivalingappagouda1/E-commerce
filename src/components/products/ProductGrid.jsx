import ProductCard from './ProductCard'

/**
 * Compact responsive product grid.
 * Displays up to 8 cards per row on wide desktop screens.
 */
export default function ProductGrid({ products = [], cols = 4, cardTheme }) {
  if (!products.length) {
    return (
      <div className="py-10 text-center text-slate-400">
        <p className="text-sm">No products found.</p>
      </div>
    )
  }

  const columnClasses = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
    8: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8',
  }

  const gridClass = columnClasses[cols] || columnClasses[4]

  return (
    <div className={`grid ${gridClass} items-stretch gap-2.5 lg:gap-3`}>
      {products.map(product => (
        <ProductCard
          key={product.id}
          product={product}
          cardTheme={cardTheme}
        />
      ))}
    </div>
  )
}
