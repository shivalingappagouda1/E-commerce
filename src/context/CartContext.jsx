import { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { fetchDatabaseCart, syncCartToSupabase, clearDatabaseCart } from '../services/cartService'
import { isSupabaseConfigured } from '../lib/supabase'

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
  const { user } = useAuth()
  const syncTimeoutRef = useRef(null)
  const isHydratedRef = useRef(false)

  // 1. Initial hydration from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        dispatch({ type: 'HYDRATE', payload: JSON.parse(stored) })
      }
    } catch {
      // ignore parse errors
    }
    isHydratedRef.current = true
  }, [])

  // 2. Persist to localStorage whenever items change
  useEffect(() => {
    if (!isHydratedRef.current) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  // 3. Authenticated database synchronization
  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return

    let cancelled = false

    async function handleUserCartSync() {
      // If user logs in and client cart has items, sync them to Supabase
      if (items.length > 0) {
        await syncCartToSupabase(items, user.id)
      } else {
        // If client cart is empty, check if database cart has existing items
        const { data: dbItems } = await fetchDatabaseCart(user.id)
        if (!cancelled && Array.isArray(dbItems) && dbItems.length > 0) {
          dispatch({ type: 'HYDRATE', payload: dbItems })
        }
      }
    }

    handleUserCartSync()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  // 4. Debounced database synchronization on cart modifications
  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id || !isHydratedRef.current) return

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(() => {
      syncCartToSupabase(items, user.id)
    }, 1500)

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [items, user?.id])

  const addItem = (product, quantity = 1, variant = null) => {
    dispatch({
      type: 'ADD_ITEM',
      payload: { product, quantity, variant },
    })
  }

  const removeItem = (id) => dispatch({ type: 'REMOVE_ITEM', payload: id })
  const updateQty = (id, qty) => dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity: qty } })

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' })
    localStorage.removeItem(STORAGE_KEY)
    if (isSupabaseConfigured && user?.id) {
      clearDatabaseCart(user.id)
    }
  }

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
