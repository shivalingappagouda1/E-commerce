import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Vite resolves extensionless relative imports automatically; register the same
// .js resolution fallback for Node ESM so real service modules run unmodified.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL
    ) {
      const parentPath = fileURLToPath(context.parentURL)
      const candidate = path.resolve(path.dirname(parentPath), `${specifier}.js`)
      if (fs.existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const {
  LEGACY_WISHLIST_STORAGE_KEY,
  GUEST_WISHLIST_STORAGE_KEY,
  isValidUUID,
  getIdentityOwnerKey,
  normalizeWishlistProduct,
  readGuestWishlist,
  writeGuestWishlist,
  clearGuestWishlist,
  purgeLegacyWishlistKey,
  resolveActiveWishlist,
  mergeWishlistItems,
  mapSafeWishlistError,
  moveWishlistItemToCart,
  moveAllWishlistItemsToCart,
} = await import('./src/utils/wishlistHelpers.js')

const { validateCartAddition } = await import('./src/services/cartService.js')
const { updateCustomerProfile } = await import('./src/services/orderService.js')

const {
  getOrCreateUserWishlist,
  fetchDatabaseWishlist,
  addDatabaseWishlistItem,
  removeDatabaseWishlistItem,
  clearDatabaseWishlist,
  mergeGuestWishlistToDatabase,
} = await import('./src/services/wishlistService.js')

const {
  MAX_AVATAR_SIZE_BYTES,
  validateAvatarFile,
  mapSafeUploadError,
  extractOwnedAvatarPath,
  removeAvatarObject,
  uploadAvatar,
} = await import('./src/services/authService.js')

const ROOT = process.cwd()

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null
    },
    setItem(k, v) {
      store.set(k, String(v))
    },
    removeItem(k) {
      store.delete(k)
    },
    snapshot() {
      return Object.fromEntries(store.entries())
    },
  }
}

function createMockWishlistSupabase(seed = {}) {
  const wishlists = [...(seed.wishlists || [])]
  const wishlistItems = [...(seed.wishlistItems || [])]
  const products = [...(seed.products || [])]
  const calls = []
  let failOn = seed.failOn || null
  let nextIdCounter = 100

  function makeQuery(table) {
    const state = {
      table,
      op: 'select',
      eqs: {},
      ins: {},
      rows: null,
      wantSingle: false,
      wantMaybeSingle: false,
    }

    const q = {
      select(cols) {
        if (state.op === 'select') {
          state.cols = cols
        }
        return q
      },
      insert(rows) {
        state.op = 'insert'
        state.rows = rows
        return q
      },
      delete() {
        state.op = 'delete'
        return q
      },
      eq(col, val) {
        state.eqs[col] = val
        return q
      },
      in(col, vals) {
        state.ins[col] = vals
        return q
      },
      single() {
        state.wantSingle = true
        return execute()
      },
      maybeSingle() {
        state.wantMaybeSingle = true
        return execute()
      },
      then(resolve, reject) {
        return execute().then(resolve, reject)
      },
    }

    async function execute() {
      calls.push({ table, op: state.op, eqs: { ...state.eqs }, ins: { ...state.ins } })

      if (failOn && failOn.table === table && failOn.op === state.op) {
        if (failOn.once) {
          const err = failOn.error
          failOn = null
          return { data: null, error: err }
        }
        return { data: null, error: failOn.error }
      }

      if (table === 'wishlists') {
        if (state.op === 'select') {
          const match = wishlists.find((w) => w.user_id === state.eqs.user_id) || null
          if (!match) {
            return { data: null, error: null }
          }
          const itemsForWishlist = wishlistItems
            .filter((wi) => wi.wishlist_id === match.id)
            .map((wi) => ({
              ...wi,
              products: products.find((p) => p.id === wi.product_id) || null,
            }))
          return {
            data: { ...match, wishlist_items: itemsForWishlist },
            error: null,
          }
        }
        if (state.op === 'insert') {
          const input = state.rows[0]
          const dup = wishlists.find((w) => w.user_id === input.user_id)
          if (dup) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } }
          }
          const created = { id: `99999999-9999-4999-8999-999999999${nextIdCounter++}`, user_id: input.user_id }
          wishlists.push(created)
          return { data: created, error: null }
        }
      }

      if (table === 'wishlist_items') {
        if (state.op === 'select') {
          const matched = wishlistItems.filter((wi) => wi.wishlist_id === state.eqs.wishlist_id)
          return { data: matched, error: null }
        }
        if (state.op === 'insert') {
          for (const row of state.rows) {
            const exists = wishlistItems.some(
              (wi) => wi.wishlist_id === row.wishlist_id && wi.product_id === row.product_id
            )
            if (exists) {
              return { data: null, error: { code: '23505', message: 'duplicate wishlist item' } }
            }
            wishlistItems.push({
              id: `wi-${nextIdCounter++}`,
              wishlist_id: row.wishlist_id,
              product_id: row.product_id,
              added_at: new Date().toISOString(),
            })
          }
          return { data: state.rows, error: null }
        }
        if (state.op === 'delete') {
          for (let i = wishlistItems.length - 1; i >= 0; i -= 1) {
            const wi = wishlistItems[i]
            const matchWl = state.eqs.wishlist_id ? wi.wishlist_id === state.eqs.wishlist_id : true
            const matchProd = state.eqs.product_id ? wi.product_id === state.eqs.product_id : true
            if (matchWl && matchProd) {
              wishlistItems.splice(i, 1)
            }
          }
          return { data: null, error: null }
        }
      }

      if (table === 'products' && state.op === 'select') {
        const candidateIds = state.ins.id || null
        const eqId = state.eqs.id || null
        const activeFilter = state.eqs.is_active
        const matched = products.filter((p) => {
          const idMatch = candidateIds
            ? candidateIds.includes(p.id)
            : eqId
            ? p.id === eqId
            : true
          const activeMatch = activeFilter === undefined ? true : p.is_active === activeFilter
          return idMatch && activeMatch
        })
        if (state.wantMaybeSingle || state.wantSingle) {
          return { data: matched[0] || null, error: null }
        }
        return { data: matched, error: null }
      }

      return { data: null, error: null }
    }

    return q
  }

  return {
    from(table) {
      return makeQuery(table)
    },
    _wishlists: wishlists,
    _wishlistItems: wishlistItems,
    _calls: calls,
    setFailOn(next) {
      failOn = next
    },
  }
}

function createMockStorageSupabase({ uploadError = null, publicUrl = 'https://cdn.example.com/storage/v1/object/public/public-assets' } = {}) {
  const uploaded = []
  const removed = []
  return {
    storage: {
      from(bucket) {
        return {
          async upload(storagePath, file, options) {
            uploaded.push({ bucket, path: storagePath, file, options })
            if (uploadError) return { error: uploadError }
            return { data: { path: storagePath }, error: null }
          },
          async remove(paths) {
            removed.push({ bucket, paths })
            return { error: null }
          },
          getPublicUrl(storagePath) {
            return { data: { publicUrl: `${publicUrl}/${storagePath}` } }
          },
        }
      },
    },
    _uploaded: uploaded,
    _removed: removed,
  }
}

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const PROD_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PROD_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const PROD_INACTIVE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'

const results = []

async function runTest(category, name, fn) {
  try {
    await fn()
    results.push({ category, name, status: 'PASS' })
    console.log(`PASS [${category}] ${name}`)
  } catch (err) {
    results.push({ category, name, status: 'FAIL', error: err.message })
    console.error(`FAIL [${category}] ${name}: ${err.message}`)
  }
}

// =========================================================================
// [MODULE BEHAVIOR] — Real authService.js + wishlistHelpers.js + wishlistService.js
// =========================================================================

await runTest('MODULE BEHAVIOR', 'authService: rejects 0-byte, >5 MB, MIME mismatch, and accepts exact 5 MB with lowercase ext', async () => {
  assert.equal(validateAvatarFile({ userId: USER_A, file: { name: 'empty.png', type: 'image/png', size: 0 } }).valid, false)

  const overLimit = validateAvatarFile({
    userId: USER_A,
    file: { name: 'big.jpg', type: 'image/jpeg', size: MAX_AVATAR_SIZE_BYTES + 1 },
  })
  assert.equal(overLimit.valid, false)
  assert.match(overLimit.error.message, /maximum of 5 MB/i)

  const exactLimit = validateAvatarFile({
    userId: USER_A,
    file: { name: 'EXACT.PNG', type: 'image/png', size: MAX_AVATAR_SIZE_BYTES },
  })
  assert.equal(exactLimit.valid, true)
  assert.equal(exactLimit.ext, 'png')
  assert.equal(exactLimit.path, `avatars/${USER_A}.png`)

  const mismatch = validateAvatarFile({
    userId: USER_A,
    file: { name: 'fake.png', type: 'image/jpeg', size: 1024 },
  })
  assert.equal(mismatch.valid, false)
  assert.match(mismatch.error.message, /contradicts validated MIME type/i)
})

await runTest('MODULE BEHAVIOR', 'authService: uploadAvatar sanitizes storage errors, preserves previous avatar until DB save, returns previousStoragePath, appends cache-buster', async () => {
  const failingClient = createMockStorageSupabase({
    uploadError: { message: 'new row violates row-level security policy for internal/bucket/secret' },
  })
  const failRes = await uploadAvatar({
    userId: USER_A,
    file: { name: 'photo.JPEG', type: 'image/jpeg', size: 2048 },
    client: failingClient,
  })
  assert.ok(failRes.error)
  assert.doesNotMatch(failRes.error.message, /internal\/bucket\/secret/)

  const okClient = createMockStorageSupabase()
  const prevUrl = `https://cdn.example.com/storage/v1/object/public/public-assets/avatars/${USER_A}.png?v=123`
  const okRes = await uploadAvatar({
    userId: USER_A,
    file: { name: 'avatar.WEBP', type: 'image/webp', size: 4096 },
    previousAvatarUrl: prevUrl,
    client: okClient,
  })
  assert.equal(okRes.error, null)
  assert.equal(okRes.storagePath, `avatars/${USER_A}.webp`)
  assert.equal(okRes.previousStoragePath, `avatars/${USER_A}.png`)
  assert.equal(okRes.replacedExistingPath, false)
  assert.match(okRes.url, new RegExp(`avatars/${USER_A}\\.webp\\?v=\\d+$`))
  assert.equal(okClient._uploaded.length, 1)
  // Issue 1 fix: uploadAvatar must NOT delete previous avatar before DB profile update succeeds
  assert.equal(okClient._removed.length, 0)

  // Verify foreign avatar path is never extracted for removal
  assert.equal(
    extractOwnedAvatarPath(`https://cdn.example.com/storage/v1/object/public/public-assets/avatars/${USER_B}.png`, USER_A),
    null
  )

  const mappedNetwork = mapSafeUploadError({ message: 'Failed to fetch storage object' })
  assert.match(mappedNetwork.message, /Network error during upload/)
  const rmRes = await removeAvatarObject(okRes.previousStoragePath, okClient)
  assert.equal(rmRes.error, null)
  assert.deepEqual(okClient._removed[0].paths, [`avatars/${USER_A}.png`])
})

await runTest('MODULE BEHAVIOR', 'Issue 2 regression: updateCustomerProfile aborts if authenticated user switched after upload started', async () => {
  const profileUpdates = []
  const switchedClient = {
    auth: {
      async getUser() {
        return { data: { user: { id: USER_B } }, error: null }
      },
    },
    from(table) {
      return {
        update(updates) {
          profileUpdates.push({ table, updates })
          return this
        },
        eq() {
          return this
        },
        select() {
          return this
        },
        async single() {
          return { data: null, error: null }
        },
      }
    },
  }

  const res = await updateCustomerProfile(
    {
      avatar_url: `https://cdn.example.com/public-assets/avatars/${USER_A}.webp?v=1`,
      expectedUserId: USER_A,
    },
    switchedClient
  )
  assert.ok(res.error)
  assert.match(res.error.message, /Account session changed/i)
  assert.equal(profileUpdates.length, 0)
})

await runTest('MODULE BEHAVIOR', 'wishlistHelpers: scoped guest key isolation, legacy key purge, corrupted JSON recovery', () => {
  assert.equal(LEGACY_WISHLIST_STORAGE_KEY, 'shopkart_wishlist')
  assert.equal(GUEST_WISHLIST_STORAGE_KEY, 'shopkart_wishlist_guest')

  const storage = createMemoryStorage({
    [LEGACY_WISHLIST_STORAGE_KEY]: JSON.stringify([{ id: '1', name: 'Legacy' }]),
    [GUEST_WISHLIST_STORAGE_KEY]: '{corrupted-json',
  })
  assert.deepEqual(readGuestWishlist(storage), [])

  storage.setItem(GUEST_WISHLIST_STORAGE_KEY, JSON.stringify({ not: 'an-array' }))
  assert.deepEqual(readGuestWishlist(storage), [])

  purgeLegacyWishlistKey(storage)
  assert.equal(storage.getItem(LEGACY_WISHLIST_STORAGE_KEY), null)

  writeGuestWishlist(storage, [
    normalizeWishlistProduct({ id: PROD_1, name: 'Widget', price: 199 }),
    { id: PROD_1, name: 'Duplicate Widget', price: 199 },
    { name: 'Missing ID' },
  ])
  const saved = readGuestWishlist(storage)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].id, PROD_1)

  clearGuestWishlist(storage)
  assert.deepEqual(readGuestWishlist(storage), [])
})

await runTest('MODULE BEHAVIOR', 'wishlistHelpers: resolveActiveWishlist enforces synchronous render-time isolation & authLoading guard', () => {
  const userAState = {
    ownerId: getIdentityOwnerKey(USER_A),
    items: [{ id: PROD_1, name: 'A Item', price: 100 }],
  }
  assert.equal(resolveActiveWishlist(userAState, USER_A, false).length, 1)
  assert.deepEqual(resolveActiveWishlist(userAState, USER_A, true), [])
  assert.deepEqual(resolveActiveWishlist(userAState, USER_B, false), [])
  assert.deepEqual(resolveActiveWishlist(userAState, null, false), [])

  const merged = mergeWishlistItems([{ id: PROD_1, name: 'DB Name' }], [
    { id: PROD_1, name: 'Guest Name' },
    { id: PROD_2, name: 'Guest Only' },
  ])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].name, 'DB Name')
  assert.equal(merged[1].id, PROD_2)
  assert.match(mapSafeWishlistError({ message: 'JWT expired' }), /session has expired/i)
})

await runTest('MODULE BEHAVIOR', 'wishlistService: enforces active DB products on single insert, valid UUIDs, 23505 idempotency, and explicit errors', async () => {
  const dbClient = createMockWishlistSupabase({
    products: [
      { id: PROD_1, name: 'Active One', slug: 'active-one', price: 499, original_price: 599, is_active: true, inventory: [{ quantity: 5 }] },
      { id: PROD_2, name: 'Active Two', slug: 'active-two', price: 299, original_price: 299, is_active: true, inventory: [{ quantity: 3 }] },
      { id: PROD_INACTIVE, name: 'Inactive', slug: 'inactive', price: 99, is_active: false, inventory: [{ quantity: 5 }] },
    ],
  })

  // Issue 4 regression: reject inactive or non-existent DB products BEFORE creating wishlist or inserting row
  const inactiveAdd = await addDatabaseWishlistItem(USER_A, PROD_INACTIVE, dbClient)
  assert.equal(inactiveAdd.ok, false)
  assert.match(inactiveAdd.error.message, /does not exist or is no longer available/i)
  assert.equal(dbClient._wishlists.length, 0)
  assert.equal(dbClient._wishlistItems.length, 0)

  const missingProdAdd = await addDatabaseWishlistItem(USER_A, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', dbClient)
  assert.equal(missingProdAdd.ok, false)
  assert.equal(dbClient._wishlistItems.length, 0)

  // Reject non-UUID product ID
  const badProd = await addDatabaseWishlistItem(USER_A, 'legacy-non-uuid', dbClient)
  assert.equal(badProd.ok, false)
  assert.equal(isValidUUID('legacy-non-uuid'), false)

  // Handle concurrent wishlist creation (23505) gracefully
  dbClient._wishlists.push({ id: '88888888-8888-4888-8888-888888888881', user_id: USER_A })
  const gotWl = await getOrCreateUserWishlist(USER_A, dbClient)
  assert.equal(gotWl.error, null)
  assert.equal(gotWl.wishlistId, '88888888-8888-4888-8888-888888888881')

  // Merge guest items: skips non-UUID and inactive DB products, inserts only active UUIDs
  const mergeRes = await mergeGuestWishlistToDatabase(
    USER_A,
    [{ id: 'sample-1' }, { id: PROD_INACTIVE }, { id: PROD_1 }, { id: PROD_1 }],
    dbClient
  )
  assert.equal(mergeRes.error, null)
  assert.equal(mergeRes.mergedCount, 1)

  // Add second active item + idempotent duplicate retry
  const add2 = await addDatabaseWishlistItem(USER_A, PROD_2, dbClient)
  assert.equal(add2.ok, true)
  const addDup = await addDatabaseWishlistItem(USER_A, PROD_2, dbClient)
  assert.equal(addDup.ok, true)

  // Fetch DB wishlist returns both active items
  const fetched = await fetchDatabaseWishlist(USER_A, dbClient)
  assert.equal(fetched.error, null)
  assert.equal(fetched.data.length, 2)

  // Verify DB write failure returns explicit error without silent success
  dbClient.setFailOn({
    table: 'wishlist_items',
    op: 'delete',
    once: true,
    error: { message: 'network timeout during delete' },
  })
  const failedDel = await removeDatabaseWishlistItem(USER_A, PROD_1, dbClient)
  assert.equal(failedDel.ok, false)
  assert.ok(failedDel.error)

  // Subsequent valid remove & clear succeed cleanly
  const okDel = await removeDatabaseWishlistItem(USER_A, PROD_1, dbClient)
  assert.equal(okDel.ok, true)
  const okClear = await clearDatabaseWishlist(USER_A, dbClient)
  assert.equal(okClear.ok, true)
  const afterClear = await fetchDatabaseWishlist(USER_A, dbClient)
  assert.equal(afterClear.data.length, 0)
})

await runTest('MODULE BEHAVIOR', 'Issue 3 regression: validateCartAddition & wishlist-to-cart helpers preserve failed wishlist items on individual & bulk moves', async () => {
  // Cart validation contract checks
  assert.equal(validateCartAddition(null).ok, false)
  assert.equal(validateCartAddition({ id: PROD_1, stock: 0 }).ok, false)
  assert.equal(validateCartAddition({ id: PROD_1, is_active: false }).ok, false)
  assert.equal(validateCartAddition({ id: PROD_1, inStock: false }).ok, false)
  assert.equal(validateCartAddition({ id: 'sample-1', price: 100 }, 1, { supabaseConfigured: true }).ok, false)
  assert.equal(validateCartAddition({ id: PROD_1, price: 100, stock: 5 }, 1, { supabaseConfigured: true }).ok, true)

  // Single item move fails when cart addition fails -> wishlist item preserved
  const removedSingle = []
  const singleFail = await moveWishlistItemToCart(
    { id: PROD_1, name: 'Out of stock item', stock: 0 },
    {
      addToCartFn: (p) => validateCartAddition(p, 1, { supabaseConfigured: true }),
      removeFromWishlistFn: async (id) => {
        removedSingle.push(id)
        return { ok: true }
      },
    }
  )
  assert.equal(singleFail.ok, false)
  assert.equal(removedSingle.length, 0)

  // Bulk move with partial failure -> failed item kept, clearWishlist NEVER called
  const bulkItems = [
    { id: PROD_1, name: 'Valid Product', price: 100, stock: 3 },
    { id: PROD_2, name: 'Out of stock Product', price: 200, stock: 0 },
  ]
  const bulkRemoved = []
  let bulkCleared = false
  const partialBulk = await moveAllWishlistItemsToCart(bulkItems, {
    addToCartFn: (p) => validateCartAddition(p, 1, { supabaseConfigured: true }),
    removeFromWishlistFn: async (id) => {
      bulkRemoved.push(id)
      return { ok: true }
    },
    clearWishlistFn: async () => {
      bulkCleared = true
      return { ok: true }
    },
  })
  assert.equal(partialBulk.movedCount, 1)
  assert.equal(partialBulk.failedCount, 1)
  assert.ok(partialBulk.error)
  assert.equal(bulkCleared, false)
  assert.deepEqual(bulkRemoved, [PROD_1])

  // Bulk move where all succeed -> clearWishlist called cleanly
  let allCleared = false
  const allOk = await moveAllWishlistItemsToCart(
    [{ id: PROD_1, name: 'P1', stock: 2 }, { id: PROD_2, name: 'P2', stock: 4 }],
    {
      addToCartFn: (p) => validateCartAddition(p, 1, { supabaseConfigured: true }),
      removeFromWishlistFn: async () => ({ ok: true }),
      clearWishlistFn: async () => {
        allCleared = true
        return { ok: true }
      },
    }
  )
  assert.equal(allOk.movedCount, 2)
  assert.equal(allOk.failedCount, 0)
  assert.equal(allOk.error, null)
  assert.equal(allCleared, true)
})

// =========================================================================
// [SIMULATION] — Guest -> Login Merge Fail-Safe -> Logout -> Account Switch
// =========================================================================

await runTest('SIMULATION', 'Wishlist guest -> failed merge retains guest items -> retry succeeds -> logout clears state -> user B isolated', async () => {
  const storage = createMemoryStorage()
  writeGuestWishlist(storage, [
    { id: PROD_1, name: 'Guest Item 1', price: 100 },
    { id: 'non-uuid-sample', name: 'Sample Item', price: 50 },
  ])

  const dbClient = createMockWishlistSupabase({
    products: [{ id: PROD_1, name: 'Active One', slug: 'active-one', price: 100, is_active: true, inventory: [{ quantity: 2 }] }],
    failOn: { table: 'products', op: 'select', once: true, error: { message: 'temporary outage' } },
  })

  // First login merge fails -> guest storage MUST remain intact
  const firstMerge = await mergeGuestWishlistToDatabase(USER_A, readGuestWishlist(storage), dbClient)
  assert.ok(firstMerge.error)
  assert.equal(readGuestWishlist(storage).length, 2)

  // Retry succeeds -> guest storage cleared
  const secondMerge = await mergeGuestWishlistToDatabase(USER_A, readGuestWishlist(storage), dbClient)
  assert.equal(secondMerge.error, null)
  assert.equal(secondMerge.mergedCount, 1)
  clearGuestWishlist(storage)
  assert.equal(readGuestWishlist(storage).length, 0)

  // User A fetches synced wishlist; User B sees zero items from User A
  const userAWishlist = await fetchDatabaseWishlist(USER_A, dbClient)
  const userBWishlist = await fetchDatabaseWishlist(USER_B, dbClient)
  assert.equal(userAWishlist.data.length, 1)
  assert.equal(userBWishlist.data.length, 0)
})

await runTest('SIMULATION', 'Issue 1 & 2 simulation: failed profile DB save preserves old avatar and rolls back only new path; account switch blocks User B overwrite', async () => {
  const storageClient = createMockStorageSupabase()
  const prevUrl = `https://cdn.example.com/storage/v1/object/public/public-assets/avatars/${USER_A}.png?v=1`
  const up = await uploadAvatar({
    userId: USER_A,
    file: { name: 'new.webp', type: 'image/webp', size: 2048 },
    previousAvatarUrl: prevUrl,
    client: storageClient,
  })
  assert.equal(up.error, null)
  assert.equal(storageClient._removed.length, 0)

  // Simulate DB update failure: only new path removed; previousStoragePath preserved
  if (!up.replacedExistingPath && up.storagePath) {
    await removeAvatarObject(up.storagePath, storageClient)
  }
  assert.deepEqual(storageClient._removed[0].paths, [`avatars/${USER_A}.webp`])

  // Verify previous avatar path was never touched
  const removedPaths = storageClient._removed.flatMap((r) => r.paths)
  assert.equal(removedPaths.includes(`avatars/${USER_A}.png`), false)
})

// =========================================================================
// [STATIC CHECK] — AuthContext, ProfilePage, Navbar, CartContext, WishlistContext, WishlistPage
// =========================================================================

await runTest('STATIC CHECK', 'AuthContext exposes sequence-guarded refreshProfile with expectedUserId guard', () => {
  const src = readSrc('src/context/AuthContext.jsx')
  assert.match(src, /async function refreshProfile\s*\(expectedUserId = null\)/)
  assert.match(src, /expectedUserId && targetUserId !== expectedUserId/)
  assert.match(src, /profileFetchSeqRef\.current/)
  assert.match(src, /refreshProfile\s*,?\s*\}/)
})

await runTest('STATIC CHECK', 'ProfilePage enforces account-switch guards, post-DB old avatar cleanup, rollback, and refreshProfile(initiatingUserId)', () => {
  const src = readSrc('src/pages/customer/ProfilePage.jsx')
  assert.match(src, /uploadAvatar/)
  assert.match(src, /removeAvatarObject/)
  assert.match(src, /refreshProfile\(initiatingUserId\)/)
  assert.match(src, /expectedUserId:\s*initiatingUserId/)
  assert.match(src, /activeUserIdRef\.current !== initiatingUserId/)
  assert.match(src, /uploadRes\.previousStoragePath && activeUserIdRef\.current === initiatingUserId/)
  assert.match(src, /avatarUploadLockRef/)
  assert.match(src, /type="file"/)
  assert.match(src, /accept="image\/jpeg,image\/png,image\/webp,image\/gif"/)
  assert.match(src, /Upload Photo/)
  assert.match(src, /avatarStage/)
  assert.match(src, /onError=\{\(\) => setAvatarPreviewError\(true\)\}/)
})

await runTest('STATIC CHECK', 'Navbar displays profile.avatar_url with failedAvatarUrl fallback to User icon', () => {
  const src = readSrc('src/components/layout/Navbar.jsx')
  assert.match(src, /const \[failedAvatarUrl, setFailedAvatarUrl\] = useState\(null\)/)
  assert.match(src, /profile\?\.avatar_url && failedAvatarUrl !== profile\.avatar_url/)
  assert.match(src, /onError=\{\(\) => setFailedAvatarUrl\(profile\.avatar_url\)\}/)
})

await runTest('STATIC CHECK', 'CartContext.addItem returns explicit { ok, error } contract via validateCartAddition', () => {
  const src = readSrc('src/context/CartContext.jsx')
  assert.match(src, /validateCartAddition/)
  assert.match(src, /return \{ ok: false, error: validation\.error \}/)
  assert.match(src, /return \{ ok: true, error: null \}/)
})

await runTest('STATIC CHECK', 'WishlistContext enforces scoped guest key, legacy purge, owner+authLoading guard, pending locks, and safe DB merge', () => {
  const src = readSrc('src/context/WishlistContext.jsx')
  assert.match(src, /purgeLegacyWishlistKey\(localStorage\)/)
  assert.match(src, /resolveActiveWishlist\(wishlistState,\s*user\?\.id,\s*authLoading\)/)
  assert.match(src, /mergeGuestWishlistToDatabase/)
  assert.match(src, /if \(!mergeRes\.error\)[\s\S]*clearGuestWishlist/)
  assert.match(src, /pendingIdsRef\.current\.has\(productId\)/)
  assert.match(src, /(?:reqSeq|opSeq) !== syncSeqRef\.current/)
  assert.match(src, /isItemPending/)
  assert.match(src, /removeItem/)
  assert.match(src, /clearWishlist/)
})

await runTest('STATIC CHECK', 'WishlistPage, ProductCard, ProductDetailPage consume Stage B2 error, loading, UUID, confirmed moves, and pending states', () => {
  const page = readSrc('src/pages/customer/WishlistPage.jsx')
  assert.match(page, /moveWishlistItemToCart/)
  assert.match(page, /moveAllWishlistItemsToCart/)
  assert.match(page, /moveError/)
  assert.match(page, /isItemPending/)
  assert.match(page, /clearWishlist/)
  assert.match(page, /errorBanner/)
  assert.match(page, /role="alert"/)
  assert.match(page, /isValidUUID/)

  const card = readSrc('src/components/products/ProductCard.jsx')
  assert.match(card, /isItemPending/)
  assert.match(card, /disabled=\{wishPending\}/)

  const detail = readSrc('src/pages/customer/ProductDetailPage.jsx')
  assert.match(detail, /isItemPending/)
  assert.match(detail, /disabled=\{wishPending\}/)
})

const passed = results.filter((r) => r.status === 'PASS').length
const failed = results.filter((r) => r.status === 'FAIL').length

console.log(`\nPhase 4 Stage B2 Test Summary: ${passed}/${results.length} passed, ${failed} failed.`)
if (failed > 0) {
  process.exit(1)
}
