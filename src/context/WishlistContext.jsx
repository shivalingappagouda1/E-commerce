import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  fetchDatabaseWishlist,
  addDatabaseWishlistItem,
  removeDatabaseWishlistItem,
  clearDatabaseWishlist,
  mergeGuestWishlistToDatabase,
} from '../services/wishlistService'
import {
  isValidUUID,
  getIdentityOwnerKey,
  normalizeWishlistProduct,
  deduplicateWishlistItems,
  readGuestWishlist,
  writeGuestWishlist,
  clearGuestWishlist,
  purgeLegacyWishlistKey,
  resolveActiveWishlist,
  mapSafeWishlistError,
} from '../utils/wishlistHelpers'

const WishlistContext = createContext(null)

export function WishlistProvider({ children }) {
  const { user, loading: authLoading } = useAuth()

  // Owner-tagged wishlist state prevents stale previous-user items flashing on render
  const [wishlistState, setWishlistState] = useState({ ownerId: null, items: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingIds, setPendingIds] = useState([])

  // Sequence & concurrency control refs
  const syncSeqRef = useRef(0)
  const activeOwnerRef = useRef(null)
  const pendingIdsRef = useRef(new Set())
  const mountedRef = useRef(true)

  // Synchronous render-time ownership & authLoading guard
  const items = resolveActiveWishlist(wishlistState, user?.id, authLoading)

  useEffect(() => {
    mountedRef.current = true
    purgeLegacyWishlistKey(localStorage)
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Synchronize wishlist whenever authenticated user identity or auth loading state changes
  useEffect(() => {
    const reqSeq = ++syncSeqRef.current

    if (authLoading) {
      activeOwnerRef.current = null
      setWishlistState({ ownerId: null, items: [] })
      setLoading(true)
      setError('')
      return
    }

    const ownerId = getIdentityOwnerKey(user?.id)
    activeOwnerRef.current = ownerId

    // Guest session OR Demo Mode (Supabase unconfigured)
    if (!isSupabaseConfigured || !user?.id) {
      const guestItems = !user?.id ? readGuestWishlist(localStorage) : []
      setWishlistState({ ownerId, items: guestItems })
      setLoading(false)
      setError('')
      return
    }

    // Authenticated Supabase session: clear previous owner's in-memory state immediately
    setWishlistState({ ownerId, items: [] })
    setLoading(true)
    setError('')

    let cancelled = false

    async function loadAndSyncUserWishlist() {
      let mergeWarning = ''

      try {
        // 1. Read any pre-login guest wishlist items and merge valid active UUIDs additively
        const guestItems = readGuestWishlist(localStorage)
        if (guestItems.length > 0) {
          const mergeRes = await mergeGuestWishlistToDatabase(user.id, guestItems)
          if (cancelled || !mountedRef.current || reqSeq !== syncSeqRef.current || activeOwnerRef.current !== ownerId) {
            return
          }
          if (!mergeRes.error) {
            clearGuestWishlist(localStorage)
          } else {
            mergeWarning = mapSafeWishlistError(
              mergeRes.error,
              'Signed in, but some guest wishlist items could not be merged yet.'
            )
          }
        }

        // 2. Fetch authoritative database wishlist for current authenticated user
        const { data: dbItems, error: fetchErr } = await fetchDatabaseWishlist(user.id)
        if (cancelled || !mountedRef.current || reqSeq !== syncSeqRef.current || activeOwnerRef.current !== ownerId) {
          return
        }

        if (fetchErr) {
          setWishlistState({ ownerId, items: [] })
          setError(mapSafeWishlistError(fetchErr, 'Unable to load your saved wishlist.'))
          setLoading(false)
          return
        }

        setWishlistState({ ownerId, items: deduplicateWishlistItems(dbItems || []) })
        setError(mergeWarning)
        setLoading(false)
      } catch (err) {
        if (cancelled || !mountedRef.current || reqSeq !== syncSeqRef.current || activeOwnerRef.current !== ownerId) {
          return
        }
        setWishlistState({ ownerId, items: [] })
        setError(mapSafeWishlistError(err, 'Unable to load your saved wishlist.'))
        setLoading(false)
      }
    }

    loadAndSyncUserWishlist()

    return () => {
      cancelled = true
    }
  }, [user?.id, authLoading])

  function setProductPending(productId, isPending) {
    if (isPending) {
      pendingIdsRef.current.add(productId)
    } else {
      pendingIdsRef.current.delete(productId)
    }
    if (mountedRef.current) {
      setPendingIds([...pendingIdsRef.current])
    }
  }

  async function toggle(product) {
    const normalized = normalizeWishlistProduct(product)
    if (!normalized || authLoading) {
      return { ok: false, error: 'Invalid product.' }
    }

    const productId = normalized.id
    if (pendingIdsRef.current.has(productId)) {
      return { ok: false, pending: true }
    }

    const ownerId = getIdentityOwnerKey(user?.id)
    const opSeq = syncSeqRef.current

    // Guest / Demo mode
    if (!isSupabaseConfigured || !user?.id) {
      setError('')
      setWishlistState(prev => {
        const base = prev.ownerId === ownerId && Array.isArray(prev.items) ? prev.items : []
        const exists = base.some(i => i.id === productId)
        const nextItems = exists
          ? base.filter(i => i.id !== productId)
          : deduplicateWishlistItems([...base, normalized])
        if (!user?.id) {
          writeGuestWishlist(localStorage, nextItems)
        }
        return { ownerId, items: nextItems }
      })
      return { ok: true, error: null }
    }

    // Authenticated Supabase mode
    if (!isValidUUID(productId)) {
      const msg = 'This item cannot be saved to your account wishlist because it lacks a valid product ID.'
      setError(msg)
      return { ok: false, error: msg }
    }

    const currentlyWishlisted = items.some(i => i.id === productId)
    setProductPending(productId, true)
    setError('')

    try {
      const res = currentlyWishlisted
        ? await removeDatabaseWishlistItem(user.id, productId)
        : await addDatabaseWishlistItem(user.id, productId)

      if (!mountedRef.current || opSeq !== syncSeqRef.current || activeOwnerRef.current !== ownerId) {
        return { ok: false, stale: true }
      }

      if (!res.ok || res.error) {
        const msg = mapSafeWishlistError(res.error, 'Could not update your wishlist. Please try again.')
        setError(msg)
        return { ok: false, error: msg }
      }

      setWishlistState(prev => {
        if (prev.ownerId !== ownerId) return prev
        const nextItems = currentlyWishlisted
          ? prev.items.filter(i => i.id !== productId)
          : deduplicateWishlistItems([normalized, ...prev.items])
        return { ownerId, items: nextItems }
      })

      return { ok: true, error: null }
    } catch (err) {
      if (mountedRef.current && opSeq === syncSeqRef.current && activeOwnerRef.current === ownerId) {
        const msg = mapSafeWishlistError(err, 'Could not update your wishlist. Please try again.')
        setError(msg)
        return { ok: false, error: msg }
      }
      return { ok: false, error: 'Wishlist update interrupted.' }
    } finally {
      setProductPending(productId, false)
    }
  }

  async function removeItem(productId) {
    const id = productId ? String(productId) : ''
    if (!id || authLoading) return { ok: false }

    if (items.some(i => i.id === id)) {
      const target = items.find(i => i.id === id)
      return toggle(target)
    }
    return { ok: true }
  }

  async function clearWishlist() {
    if (authLoading) return { ok: false }

    const ownerId = getIdentityOwnerKey(user?.id)
    const opSeq = syncSeqRef.current

    if (!isSupabaseConfigured || !user?.id) {
      clearGuestWishlist(localStorage)
      setWishlistState({ ownerId, items: [] })
      setError('')
      return { ok: true, error: null }
    }

    setError('')
    try {
      const res = await clearDatabaseWishlist(user.id)
      if (!mountedRef.current || opSeq !== syncSeqRef.current || activeOwnerRef.current !== ownerId) {
        return { ok: false, stale: true }
      }
      if (!res.ok || res.error) {
        const msg = mapSafeWishlistError(res.error, 'Unable to clear your wishlist right now.')
        setError(msg)
        return { ok: false, error: msg }
      }
      setWishlistState({ ownerId, items: [] })
      return { ok: true, error: null }
    } catch (err) {
      if (mountedRef.current && opSeq === syncSeqRef.current && activeOwnerRef.current === ownerId) {
        const msg = mapSafeWishlistError(err, 'Unable to clear your wishlist right now.')
        setError(msg)
        return { ok: false, error: msg }
      }
      return { ok: false, error: 'Clear interrupted.' }
    }
  }

  const isWishlisted = (id) => items.some(i => i.id === String(id))
  const isItemPending = (id) => pendingIds.includes(String(id))
  const clearError = () => setError('')
  const count = items.length

  return (
    <WishlistContext.Provider
      value={{
        items,
        toggle,
        removeItem,
        clearWishlist,
        isWishlisted,
        isItemPending,
        count,
        loading,
        error,
        clearError,
      }}
    >
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider')
  return ctx
}
