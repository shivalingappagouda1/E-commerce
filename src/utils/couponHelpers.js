/**
 * Account-isolated coupon persistence & render-time guard helpers.
 * Used by CartContext and exercised directly by automated tests.
 */

export const LEGACY_COUPON_STORAGE_KEY = 'shopkart_applied_coupon'

export function getCouponStorageKey(userId) {
  return userId ? `shopkart_applied_coupon_${userId}` : 'shopkart_applied_coupon_guest'
}

export function getIdentityOwnerKey(userId) {
  return userId ? String(userId) : 'guest'
}

export function sanitizeCouponMetadata(coupon) {
  if (!coupon || !coupon.code) return null
  return {
    code: String(coupon.code).trim().toUpperCase(),
    type: coupon.type === 'percent' ? 'percent' : 'fixed',
    value: Number(coupon.value) || 0,
    min_order_value: Number(coupon.min_order_value || coupon.minOrderValue || 0),
  }
}

export function readScopedCoupon(storage, userId) {
  if (!storage) return null
  const key = getCouponStorageKey(userId)
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.code) {
      return null
    }
    return sanitizeCouponMetadata(parsed)
  } catch {
    return null
  }
}

/**
 * Synchronous render-time ownership guard for in-memory coupon state.
 * Guarantees that:
 * 1. While auth is loading, no coupon is exposed.
 * 2. During an identity transition (even before effects execute),
 *    the previous identity's coupon is NEVER exposed to the new identity.
 */
export function resolveActiveCoupon(couponState, currentUserId, authLoading) {
  if (authLoading) return null
  if (!couponState || !couponState.coupon) return null
  const expectedOwner = getIdentityOwnerKey(currentUserId)
  if (couponState.ownerId !== expectedOwner) {
    return null
  }
  return couponState.coupon
}

export function calculateCouponDiscount(activeCoupon, totalPrice) {
  if (!activeCoupon || !totalPrice || totalPrice <= 0) return 0
  const minVal = Number(activeCoupon.min_order_value || activeCoupon.minOrderValue || 0)
  if (minVal > 0 && totalPrice < minVal) {
    return 0
  }
  if (activeCoupon.type === 'percent') {
    return Math.round((totalPrice * Number(activeCoupon.value)) / 100)
  }
  if (activeCoupon.type === 'fixed') {
    return Math.min(totalPrice, Number(activeCoupon.value) || 0)
  }
  return 0
}
