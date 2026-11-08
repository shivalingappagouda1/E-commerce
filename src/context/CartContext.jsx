import { createContext, useContext, useReducer, useEffect } from 'react'

const CartContext = createContext(null)

const STORAGE_KEY = 'shopkart_cart'

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.find(i => i.id === action.payload.id)
      if (existing) {
        return state.map(i =>
          i.id === action.payload.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...state, { ...action.payload, quantity: 1 }]
    }
    case 'REMOVE_ITEM':
      return state.filter(i => i.id !== action.payload)
    case 'UPDATE_QUANTITY':
      return state.map(i =>
        i.id === action.payload.id
          ? { ...i, quantity: Math.max(1, action.payload.quantity) }
          : i
      )
    case 'CLEAR_CART':
      return []
    case 'HYDRATE':
      return action.payload
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

  const addItem      = (product) => dispatch({ type: 'ADD_ITEM',       payload: product })
  const removeItem   = (id)      => dispatch({ type: 'REMOVE_ITEM',    payload: id })
  const updateQty    = (id, qty) => dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity: qty } })
  const clearCart    = ()        => dispatch({ type: 'CLEAR_CART' })
  const totalItems   = items.reduce((s, i) => s + i.quantity, 0)
  const totalPrice   = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const isInCart     = (id)      => items.some(i => i.id === id)

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalItems, totalPrice, isInCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
