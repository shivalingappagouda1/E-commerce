import { createContext, useContext, useReducer, useEffect } from 'react'

const CartContext = createContext(null)

const STORAGE_KEY = 'shopkart_cart'

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const payload = action.payload
      const product = payload.product || payload
      const quantityToAdd = Math.max(1, Number(payload.quantity) || 1)
      const variant = payload.variant || null
      const itemKey = variant ? `${product.id}-${variant.id || variant.name}` : product.id

      const existingIndex = state.findIndex(i => (i.cartItemId || i.id) === itemKey)
      if (existingIndex > -1) {
        return state.map((item, idx) => {
          if (idx === existingIndex) {
            const newQty = item.quantity + quantityToAdd
            const maxStock = item.stock !== undefined ? Number(item.stock) : Infinity
            return {
              ...item,
              quantity: Math.min(newQty, maxStock > 0 ? maxStock : newQty),
            }
          }
          return item
        })
      }

      return [
        ...state,
        {
          ...product,
          cartItemId: itemKey,
          variant,
          quantity: quantityToAdd,
        },
      ]
    }
    case 'REMOVE_ITEM':
      return state.filter(i => (i.cartItemId || i.id) !== action.payload && i.id !== action.payload)
    case 'UPDATE_QUANTITY':
      return state.map(i => {
        if ((i.cartItemId || i.id) === action.payload.id || i.id === action.payload.id) {
          const maxStock = i.stock !== undefined ? Number(i.stock) : Infinity
          const clamped = Math.max(1, Math.min(action.payload.quantity, maxStock > 0 ? maxStock : action.payload.quantity))
          return { ...i, quantity: clamped }
        }
        return i
      })
    case 'CLEAR_CART':
      return []
    case 'HYDRATE':
      return Array.isArray(action.payload) ? action.payload : []
    default:
      return state
  }
}

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(cartReducer, [])

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) dispatch({ type: 'HYDRATE', payload: JSON.parse(stored) })
    } catch {
      // ignore parse errors
    }
  }, [])

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = (product, quantity = 1, variant = null) => {
    dispatch({
      type: 'ADD_ITEM',
      payload: { product, quantity, variant },
    })
  }

  const removeItem = (id) => dispatch({ type: 'REMOVE_ITEM', payload: id })
  const updateQty = (id, qty) => dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity: qty } })
  const clearCart = () => dispatch({ type: 'CLEAR_CART' })

  const totalItems = items.reduce((s, i) => s + (Number(i.quantity) || 1), 0)
  const totalPrice = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0)
  const originalTotalPrice = items.reduce((s, i) => {
    const orig = i.originalPrice || i.price || 0
    return s + orig * (Number(i.quantity) || 1)
  }, 0)
  const totalSavings = Math.max(0, originalTotalPrice - totalPrice)
  const isInCart = (id) => items.some(i => i.id === id || i.cartItemId === id)

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      totalItems,
      totalPrice,
      originalTotalPrice,
      totalSavings,
      isInCart,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
