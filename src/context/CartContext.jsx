import { createContext, useContext, useReducer, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import {
  fetchDatabaseCart,
  syncCartToSupabase,
  clearDatabaseCart,
  mergeCarts,
  isValidUUID,
  validateCartAddition,
} from '../services/cartService'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  LEGACY_COUPON_STORAGE_KEY,
  getCouponStorageKey,
  getIdentityOwnerKey,
  sanitizeCouponMetadata,
  readScopedCoupon,
  resolveActiveCoupon,
  calculateCouponDiscount,
} from '../utils/couponHelpers'

const CartContext = createContext(null)

const STORAGE_KEY = 'shopkart_cart'
const COUPON_STORAGE_KEY = 'shopkart_applied_coupon'

export { getCouponStorageKey }

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const payload = action.payload
      const product = payload.product || payload
      const quantityToAdd = Math.max(1, Number(payload.quantity) || 1)
      const variant = payload.variant || null
      const pId = product.productId || product.id
      const itemKey = variant ? `${pId}-${variant.id || variant.name}` : pId

      const existingIndex = state.findIndex(i => (i.cartItemId || i.id || i.productId) === itemKey)
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
          id: pId,
          productId: pId,
          cartItemId: itemKey,
          variant,
          quantity: quantityToAdd,
        },
      ]
    }
    case 'REMOVE_ITEM':
      return state.filter(i => (i.cartItemId || i.id || i.productId) !== action.payload && i.id !== action.payload && i.productId !== action.payload)
    case 'UPDATE_QUANTITY':
      return state.map(i => {
        if ((i.cartItemId || i.id || i.productId) === action.payload.id || i.id === action.payload.id || i.productId === action.payload.id) {
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
  const { user, loading: authLoading } = useAuth()
  const syncTimeoutRef = useRef(null)
  const isHydratedRef = useRef(false)
  const lastMergedUserIdRef = useRef(null)
  const isMergingRef = useRef(false)

  // Account-isolated applied coupon state tracked with owner identity
  const [couponState, setCouponState] = useState({ ownerId: null, coupon: null })

  // Synchronous render-time ownership guard: never expose stale or loading-phase coupons
  const appliedCoupon = resolveActiveCoupon(couponState, user?.id, authLoading)

  // 1. Purge legacy global key to prevent un-scoped cross-account leakage
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_COUPON_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  // 2. Synchronize active coupon with current authenticated identity or guest session
  useEffect(() => {
    if (authLoading) {
      setCouponState({ ownerId: null, coupon: null })
      return
    }

    const ownerId = getIdentityOwnerKey(user?.id)
    const loadedCoupon = readScopedCoupon(localStorage, user?.id)
    setCouponState({ ownerId, coupon: loadedCoupon })
  }, [user?.id, authLoading])

  const applyCoupon = (coupon) => {
    const sanitized = sanitizeCouponMetadata(coupon)
    if (!sanitized) return
    const ownerId = getIdentityOwnerKey(user?.id)
    setCouponState({ ownerId, coupon: sanitized })
    const key = getCouponStorageKey(user?.id)
    try {
      localStorage.setItem(key, JSON.stringify(sanitized))
    } catch {
      // ignore storage errors
    }
  }

  const removeCoupon = () => {
    const ownerId = getIdentityOwnerKey(user?.id)
    setCouponState({ ownerId, coupon: null })
    const key = getCouponStorageKey(user?.id)
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore storage errors
    }
  }

  // 1. Initial hydration from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        dispatch({ type: 'HYDRATE', payload: Array.isArray(parsed) ? parsed : [] })
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

  // 3. Authenticated guest-to-database cart merging & account switching
  useEffect(() => {
    if (!isSupabaseConfigured) return

    // When user logs out, reset tracking and cleanse session cart
    if (!user?.id) {
      if (lastMergedUserIdRef.current) {
        dispatch({ type: 'CLEAR_CART' })
        localStorage.removeItem(STORAGE_KEY)
      }
      lastMergedUserIdRef.current = null
      isMergingRef.current = false
      return
    }

    // Avoid duplicate re-merging within the same user session
    if (lastMergedUserIdRef.current === user.id || isMergingRef.current) return
    isMergingRef.current = true

    let cancelled = false

    async function handleUserLoginCartMerge() {
      try {
        const { data: dbItems, error: fetchErr } = await fetchDatabaseCart(user.id)
        if (cancelled) return

        if (fetchErr) {
          console.warn('[CartContext] Could not fetch remote cart during login, retaining local cart:', fetchErr)
          isMergingRef.current = false
          return
        }

        const remoteItems = Array.isArray(dbItems) ? dbItems : []

        // Read current local items from state or fallback to localStorage
        const rawLocal = Array.isArray(items) && items.length > 0
          ? items
          : (() => {
              try {
                const s = localStorage.getItem(STORAGE_KEY)
                return s ? JSON.parse(s) : []
              } catch {
                return []
              }
            })()
        const localItems = Array.isArray(rawLocal) ? rawLocal : []

        // Requirement 3 & 4: Filter out any items with invalid / demo IDs (non-UUIDs)
        const candidateGuestItems = localItems.filter(i => isValidUUID(i.productId || i.id))

        // Requirement 5: Preserve valid guest cart items only when their product IDs
        // correspond to real, active database products in Supabase
        let validGuestItems = []
        if (candidateGuestItems.length > 0 && supabase) {
          const candidateIds = [...new Set(candidateGuestItems.map(i => i.productId || i.id))]
          const { data: realProducts, error: prodErr } = await supabase
            .from('products')
            .select('id')
            .in('id', candidateIds)
            .eq('is_active', true)

          if (cancelled) return

          if (!prodErr && Array.isArray(realProducts)) {
            const realIdSet = new Set(realProducts.map(p => p.id))
            validGuestItems = candidateGuestItems.filter(i => realIdSet.has(i.productId || i.id))
          } else if (prodErr) {
            console.warn('[CartContext] Error validating guest cart product IDs with database:', prodErr)
          }
        }

        if (cancelled) return

        // Case 1: Both valid guest items and remote cart have items -> Safe intelligent merge
        if (validGuestItems.length > 0 && remoteItems.length > 0) {
          const merged = mergeCarts(validGuestItems, remoteItems)
          dispatch({ type: 'HYDRATE', payload: merged })
          await syncCartToSupabase(merged, user.id)
        }
        // Case 2: Only valid guest items exist -> hydrate and sync to remote database
        else if (validGuestItems.length > 0 && remoteItems.length === 0) {
          dispatch({ type: 'HYDRATE', payload: validGuestItems })
          await syncCartToSupabase(validGuestItems, user.id)
        }
        // Case 3: Only remote database items exist -> hydrate into local state
        else if (validGuestItems.length === 0 && remoteItems.length > 0) {
          dispatch({ type: 'HYDRATE', payload: remoteItems })
        }
        // Case 4: Neither exists (or local guest items were invalid demo products) -> clear local cart
        else if (validGuestItems.length === 0 && remoteItems.length === 0 && localItems.length > 0) {
          dispatch({ type: 'CLEAR_CART' })
          localStorage.removeItem(STORAGE_KEY)
        }

        lastMergedUserIdRef.current = user.id
      } catch (err) {
        console.error('[CartContext] Exception during login cart merge:', err)
      } finally {
        if (!cancelled) {
          isMergingRef.current = false
        }
      }
    }

    handleUserLoginCartMerge()

    return () => {
      cancelled = true
      isMergingRef.current = false
    }
  }, [user?.id, items])

  // 4. Debounced database synchronization on subsequent cart modifications
  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id || !isHydratedRef.current) return
    // Ensure initial login merge has executed before enabling debounced sync
    if (isMergingRef.current || lastMergedUserIdRef.current !== user.id) return

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(() => {
      // Requirement 3: Never send demo product IDs or invalid UUIDs to Supabase cart tables
      const validItems = items.filter(i => isValidUUID(i.productId || i.id))
      syncCartToSupabase(validItems, user.id)
    }, 1200)

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [items, user?.id])

  const addItem = (product, quantity = 1, variant = null) => {
    const validation = validateCartAddition(product, quantity, {
      supabaseConfigured: isSupabaseConfigured,
    })

    if (!validation.ok) {
      console.warn('[CartContext] Cannot add product to cart:', validation.error, product)
      return { ok: false, error: validation.error }
    }

    try {
      dispatch({
        type: 'ADD_ITEM',
        payload: { product, quantity, variant },
      })
      return { ok: true, error: null }
    } catch (err) {
      return {
        ok: false,
        error: err?.message || 'Unable to add item to cart. Please try again.',
      }
    }
  }

  const removeItem = (id) => dispatch({ type: 'REMOVE_ITEM', payload: id })
  const updateQty = (id, qty) => dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity: qty } })

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' })
    localStorage.removeItem(STORAGE_KEY)
    removeCoupon()
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
  const isInCart = (id) => items.some(i => i.id === id || i.productId === id || i.cartItemId === id)

  // Calculate client-side display discount from persisted coupon
  // Authoritative discount is computed by the database RPC place_order
  const couponDiscount = calculateCouponDiscount(appliedCoupon, totalPrice)

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
      appliedCoupon,
      applyCoupon,
      removeCoupon,
      couponDiscount,
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
