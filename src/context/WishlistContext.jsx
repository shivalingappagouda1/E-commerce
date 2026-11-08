import { createContext, useContext, useState, useEffect } from 'react'

const WishlistContext = createContext(null)
const STORAGE_KEY = 'shopkart_wishlist'

export function WishlistProvider({ children }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setItems(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const toggle = (product) => {
    setItems(prev =>
      prev.some(i => i.id === product.id)
        ? prev.filter(i => i.id !== product.id)
        : [...prev, product]
    )
  }

  const isWishlisted = (id) => items.some(i => i.id === id)
  const count = items.length

  return (
    <WishlistContext.Provider value={{ items, toggle, isWishlisted, count }}>
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider')
  return ctx
}
