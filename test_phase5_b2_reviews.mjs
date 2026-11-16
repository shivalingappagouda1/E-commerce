import assert from 'node:assert/strict'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    get length() { return store.size },
    getItem(key) { return store.has(key) ? store.get(key) : null },
    setItem(key, value) { store.set(key, String(value)) },
    removeItem(key) { store.delete(key) },
    clear() { store.clear() },
  }
}
globalThis.localStorage = createMemoryStorage()

const {
  ADMIN_REVIEWS_STORAGE,
  adminFetchReviews,
  adminToggleReviewApproval,
  adminDeleteReview,
} = await import('./src/services/adminService.js')

const UUID_1 = '00000000-0000-4000-8000-000000000001'
const UUID_2 = '00000000-0000-4000-8000-000000000002'
const reviewRow = (overrides = {}) => ({
  id: UUID_1,
  product_id: '00000000-0000-4000-8000-000000000010',
  user_id: '00000000-0000-4000-8000-000000000020',
  rating: 5,
  title: 'Excellent',
  body: 'Very good product',
  is_approved: false,
  created_at: '2026-11-10T10:00:00.000Z',
  updated_at: '2026-11-10T10:00:00.000Z',
  products: { name: 'Test Product' },
  profiles: { full_name: 'Test Customer', avatar_url: 'https://example.test/avatar.png' },
  ...overrides,
})

function createMockSupabaseClient(handler) {
  const calls = []
  const client = {
    calls,
    from(table) {
      const ctx = { table, op: null, selectCols: null, updatePayload: null, filters: [], orders: [], singleMode: false }
      const builder = {
        select(cols = '*') { if (!ctx.op) ctx.op = 'select'; ctx.selectCols = cols; return builder },
        update(payload) { ctx.op = 'update'; ctx.updatePayload = payload; return builder },
        delete() { ctx.op = 'delete'; return builder },
        eq(col, val) { ctx.filters.push({ col, val }); return builder },
        order(col, opts) { ctx.orders.push({ col, opts }); return builder },
        single() { ctx.singleMode = true; return builder },
        then(resolve, reject) {
          calls.push({ ...ctx, filters: [...ctx.filters], orders: [...ctx.orders] })
          Promise.resolve().then(() => handler(ctx)).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return client
}

let passed = 0
let failed = 0
async function runTest(name, fn) {
  globalThis.localStorage = createMemoryStorage()
  try { await fn(); passed++; console.log(`PASS: ${name}`) }
  catch (error) { failed++; console.error(`FAIL: ${name}`); console.error(error) }
}

console.log('=== TEST SUITE: PHASE 5 STAGE B2 — ADMIN REVIEWS SUPABASE INTEGRATION ===\n')

await runTest('1. Fetch normalizes product and profile relationship data', async () => {
  const client = createMockSupabaseClient(() => ({ data: [reviewRow()], error: null }))
  const { data, error } = await adminFetchReviews(client, true)
  assert.equal(error, null)
  assert.equal(data[0].id, UUID_1)
  assert.equal(data[0].product_name, 'Test Product')
  assert.equal(data[0].user_name, 'Test Customer')
  assert.equal(data[0].user_avatar_url, 'https://example.test/avatar.png')
  assert.match(client.calls[0].selectCols, /products\(name\)/)
  assert.match(client.calls[0].selectCols, /profiles\(full_name, avatar_url\)/)
})

await runTest('2. Fetch requests newest-first ordering by created_at', async () => {
  const client = createMockSupabaseClient(() => ({ data: [reviewRow({ id: UUID_1 }), reviewRow({ id: UUID_2, created_at: '2026-11-11T10:00:00Z' })], error: null }))
  const { data } = await adminFetchReviews(client, true)
  assert.deepEqual(data.map(row => row.id), [UUID_2, UUID_1])
  assert.deepEqual(client.calls[0].orders, [{ col: 'created_at', opts: { ascending: false } }])
})

await runTest('3. Empty Supabase result stays empty and does not touch LocalStorage', async () => {
  globalThis.localStorage.setItem(ADMIN_REVIEWS_STORAGE, JSON.stringify([reviewRow()]))
  const client = createMockSupabaseClient(() => ({ data: [], error: null }))
  const { data, error } = await adminFetchReviews(client, true)
  assert.deepEqual(data, [])
  assert.equal(error, null)
  assert.equal(globalThis.localStorage.getItem(ADMIN_REVIEWS_STORAGE), JSON.stringify([reviewRow()]))
})

await runTest('4. Fetch errors are returned without LocalStorage fallback', async () => {
  globalThis.localStorage.setItem(ADMIN_REVIEWS_STORAGE, JSON.stringify([reviewRow()]))
  const dbError = { code: '42501', message: 'permission denied' }
  const client = createMockSupabaseClient(() => ({ data: null, error: dbError }))
  const result = await adminFetchReviews(client, true)
  assert.equal(result.data, null)
  assert.equal(result.error, dbError)
  assert.equal(globalThis.localStorage.getItem(ADMIN_REVIEWS_STORAGE), JSON.stringify([reviewRow()]))
})

await runTest('5. Missing product/profile relationships use safe display labels', async () => {
  const client = createMockSupabaseClient(() => ({ data: [reviewRow({ products: null, profiles: null })], error: null }))
  const { data } = await adminFetchReviews(client, true)
  assert.equal(data[0].product_name, 'Unknown product')
  assert.equal(data[0].user_name, 'Customer')
  assert.equal(data[0].user_avatar_url, null)
})

await runTest('6. Approve updates only is_approved=true and targets exact UUID', async () => {
  const client = createMockSupabaseClient(ctx => ({ data: reviewRow({ is_approved: true }), error: null }))
  const result = await adminToggleReviewApproval(UUID_1, true, client, true)
  assert.equal(result.success, true)
  assert.equal(result.data.is_approved, true)
  assert.deepEqual(client.calls[0].updatePayload, { is_approved: true })
  assert.deepEqual(client.calls[0].filters, [{ col: 'id', val: UUID_1 }])
})

await runTest('7. Reject updates is_approved=false', async () => {
  const client = createMockSupabaseClient(() => ({ data: reviewRow({ is_approved: false }), error: null }))
  const result = await adminToggleReviewApproval(UUID_1, false, client, true)
  assert.equal(result.success, true)
  assert.deepEqual(client.calls[0].updatePayload, { is_approved: false })
})

await runTest('8. Invalid UUID and invalid approval value do not call database', async () => {
  const client = createMockSupabaseClient(() => { throw new Error('Should not execute') })
  const badId = await adminToggleReviewApproval('rev-1', true, client, true)
  const badValue = await adminToggleReviewApproval(UUID_1, 'true', client, true)
  assert.equal(badId.success, false)
  assert.equal(badId.error.code, 'VALIDATION_ERROR')
  assert.equal(badValue.success, false)
  assert.equal(client.calls.length, 0)
})

await runTest('9. Zero-row update and update errors are failures', async () => {
  const zeroClient = createMockSupabaseClient(() => ({ data: null, error: { code: 'PGRST116', message: 'zero rows' } }))
  const zero = await adminToggleReviewApproval(UUID_1, true, zeroClient, true)
  assert.equal(zero.success, false)
  const dbError = { code: '42501', message: 'RLS update rejected' }
  const errorClient = createMockSupabaseClient(() => ({ data: null, error: dbError }))
  const failedUpdate = await adminToggleReviewApproval(UUID_1, true, errorClient, true)
  assert.equal(failedUpdate.success, false)
  assert.equal(failedUpdate.error, dbError)
})

await runTest('10. Delete targets exact UUID and confirms returned deleted row', async () => {
  const client = createMockSupabaseClient(() => ({ data: { id: UUID_1 }, error: null }))
  const result = await adminDeleteReview(UUID_1, client, true)
  assert.equal(result.success, true)
  assert.deepEqual(client.calls[0].filters, [{ col: 'id', val: UUID_1 }])
  assert.equal(client.calls[0].op, 'delete')
  assert.equal(client.calls[0].selectCols, 'id')
})

await runTest('11. Invalid UUID does not call delete database operation', async () => {
  const client = createMockSupabaseClient(() => { throw new Error('Should not execute') })
  const result = await adminDeleteReview('rev-1', client, true)
  assert.equal(result.success, false)
  assert.equal(result.error.code, 'VALIDATION_ERROR')
  assert.equal(client.calls.length, 0)
})

await runTest('12. Zero-row deletion and database deletion errors are failures', async () => {
  const zeroClient = createMockSupabaseClient(() => ({ data: null, error: { code: 'PGRST116', message: 'zero rows' } }))
  assert.equal((await adminDeleteReview(UUID_1, zeroClient, true)).success, false)
  const dbError = { code: '42501', message: 'RLS delete rejected' }
  const errorClient = createMockSupabaseClient(() => ({ data: null, error: dbError }))
  const result = await adminDeleteReview(UUID_1, errorClient, true)
  assert.equal(result.success, false)
  assert.equal(result.error, dbError)
})

await runTest('13. Missing returned update/delete rows are never treated as success', async () => {
  const updateClient = createMockSupabaseClient(() => ({ data: null, error: null }))
  const updateResult = await adminToggleReviewApproval(UUID_1, true, updateClient, true)
  assert.equal(updateResult.success, false)
  const deleteClient = createMockSupabaseClient(() => ({ data: null, error: null }))
  const deleteResult = await adminDeleteReview(UUID_1, deleteClient, true)
  assert.equal(deleteResult.success, false)
})

await runTest('14. Demo mode fetch initializes and returns demo reviews', async () => {
  const { data, error } = await adminFetchReviews(null, false)
  assert.equal(error, null)
  assert.ok(data.length >= 3)
  assert.ok(globalThis.localStorage.getItem(ADMIN_REVIEWS_STORAGE))
})

await runTest('15. Demo mode approval/rejection persists locally', async () => {
  const { data: initial } = await adminFetchReviews(null, false)
  const target = initial[0]
  const result = await adminToggleReviewApproval(target.id, !target.is_approved, null, false)
  assert.equal(result.success, true)
  const { data: updated } = await adminFetchReviews(null, false)
  assert.equal(updated.find(row => row.id === target.id).is_approved, !target.is_approved)
})

await runTest('16. Demo mode deletion removes only the selected review', async () => {
  const { data: initial } = await adminFetchReviews(null, false)
  const targetId = initial[0].id
  const result = await adminDeleteReview(targetId, null, false)
  assert.equal(result.success, true)
  const { data: remaining } = await adminFetchReviews(null, false)
  assert.equal(remaining.some(row => row.id === targetId), false)
})

// Actual page behavior tests use Vite SSR with a bridge to mocked Supabase.
const VIRTUAL_SUPABASE_ID = path.resolve(process.cwd(), 'src/lib/supabase.js')
const bridge = { supabase: null }
globalThis.__PHASE5_B2_SUPABASE_BRIDGE__ = bridge
let viteServer
try {
  const { createServer } = await import('vite')
  viteServer = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  plugins: [{
    name: 'phase5-b2-supabase-bridge',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '../lib/supabase.js' || source === '../../lib/supabase' || source === '../lib/supabase') return VIRTUAL_SUPABASE_ID
      if (importer && path.resolve(path.dirname(importer), source) === VIRTUAL_SUPABASE_ID) return VIRTUAL_SUPABASE_ID
      return null
    },
    load(id) {
      if (path.resolve(id) === VIRTUAL_SUPABASE_ID || id.endsWith('/src/lib/supabase.js')) {
        return `
          export const isSupabaseConfigured = true
          export const supabase = new Proxy({}, { get(_, prop) {
            const target = globalThis.__PHASE5_B2_SUPABASE_BRIDGE__?.supabase
            if (!target) return undefined
            const value = target[prop]
            return typeof value === 'function' ? value.bind(target) : value
          }})
        `
      }
      return null
    },
  }],
})

function findElements(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) findElements(child, predicate, out); return out }
  if (React.isValidElement(node)) {
    if (predicate(node)) out.push(node)
    if (node.props?.children !== undefined) findElements(node.props.children, predicate, out)
  }
  return out
}
function getTextContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getTextContent).join('')
  if (React.isValidElement(node)) return getTextContent(node.props?.children)
  return ''
}
function createReactMountHarness(Component) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
  const hookValues = []
  const effects = []
  let hookIndex = 0
  let vnode = null
  let unmounted = false
  const dispatcher = {
    useState(initial) {
      const index = hookIndex++
      if (!(index in hookValues)) hookValues[index] = typeof initial === 'function' ? initial() : initial
      const setter = next => {
        const value = typeof next === 'function' ? next(hookValues[index]) : next
        if (!Object.is(value, hookValues[index])) { hookValues[index] = value; if (!unmounted) render() }
      }
      return [hookValues[index], setter]
    },
    useRef(initial) { const index = hookIndex++; if (!(index in hookValues)) hookValues[index] = { current: initial }; return hookValues[index] },
    useEffect(create, deps) {
      const index = hookIndex++
      const previous = hookValues[index]
      const changed = !previous || !deps || !previous.deps || deps.length !== previous.deps.length || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
      if (changed) effects.push({ index, create, deps })
      hookValues[index] = { deps, cleanup: previous?.cleanup }
    },
    useCallback(fn) { const index = hookIndex++; hookValues[index] = fn; return fn },
    useMemo(fn) { const index = hookIndex++; hookValues[index] = fn(); return hookValues[index] },
    useContext(context) { return context._currentValue },
  }
  function render() {
    const previous = internals.H
    hookIndex = 0
    internals.H = dispatcher
    try { vnode = Component() } finally { internals.H = previous }
    while (effects.length) {
      const effect = effects.shift()
      if (typeof hookValues[effect.index]?.cleanup === 'function') hookValues[effect.index].cleanup()
      hookValues[effect.index].cleanup = effect.create()
    }
    return vnode
  }
  render()
  return {
    get tree() { return vnode },
    html() { return renderToStaticMarkup(vnode) },
    findButton(text) { return findElements(vnode, element => element.type === 'button' && (element.props?.['aria-label'] === text || getTextContent(element).trim().includes(text))) },
    async flush(ticks = 8) { for (let i = 0; i < ticks; i++) await new Promise(resolve => setTimeout(resolve, 0)) },
    unmount() { unmounted = true; for (const entry of hookValues) if (typeof entry?.cleanup === 'function') entry.cleanup() },
  }
}

  const { default: AdminReviewsPage } = await viteServer.ssrLoadModule('/src/pages/admin/AdminReviewsPage.jsx')

  await runTest('17. AdminReviewsPage: successful empty fetch displays empty state, not error state', async () => {
    bridge.supabase = createMockSupabaseClient(() => ({ data: [], error: null }))
    const app = createReactMountHarness(AdminReviewsPage)
    await app.flush()
    const html = app.html()
    assert.match(html, /No reviews found/)
    assert.doesNotMatch(html, /Failed to load reviews/)
    app.unmount()
  })

  await runTest('18. AdminReviewsPage: failed fetch shows error state; retry enters loading and blocks duplicate fetch', async () => {
    let calls = 0
    let release
    bridge.supabase = createMockSupabaseClient(() => {
      calls++
      if (calls === 1) return { data: null, error: { message: 'fetch denied' } }
      return new Promise(resolve => { release = () => resolve({ data: [], error: null }) })
    })
    const app = createReactMountHarness(AdminReviewsPage)
    await app.flush()
    assert.match(app.html(), /Failed to load reviews/)
    app.findButton('Retry')[0].props.onClick()
    assert.match(app.html(), /Loading customer reviews/)
    app.findButton('Refresh')[0].props.onClick()
    app.findButton('Retry')[0]?.props.onClick?.()
    await app.flush(2)
    assert.equal(calls, 2)
    release()
    await app.flush()
    assert.match(app.html(), /No reviews found/)
    app.unmount()
  })

  await runTest('19. AdminReviewsPage: failed deletion keeps review visible and displays error', async () => {
    bridge.supabase = createMockSupabaseClient(ctx => {
      if (ctx.op === 'select') return { data: [reviewRow()], error: null }
      if (ctx.op === 'delete') return { data: null, error: { code: '42501', message: 'delete denied' } }
      return { data: null, error: null }
    })
    const app = createReactMountHarness(AdminReviewsPage)
    await app.flush()
    assert.match(app.html(), /Test Product/)
    const deleteButton = app.findButton('Delete review by Test Customer')[0]
    deleteButton.props.onClick()
    assert.match(app.html(), /Delete this review/)
    app.findButton('Delete review')[0].props.onClick()
    await app.flush()
    assert.match(app.html(), /delete denied/)
    assert.match(app.html(), /Test Product/)
    app.unmount()
  })

  await runTest('20. AdminReviewsPage: duplicate approval clicks are locked while request is pending', async () => {
    let release
    let updateCalls = 0
    bridge.supabase = createMockSupabaseClient(ctx => {
      if (ctx.op === 'select') return { data: [reviewRow()], error: null }
      if (ctx.op === 'update') {
        updateCalls++
        return new Promise(resolve => { release = () => resolve({ data: reviewRow({ is_approved: true }), error: null }) })
      }
      return { data: null, error: null }
    })
    const app = createReactMountHarness(AdminReviewsPage)
    await app.flush()
    const approve = app.findButton('Approve review by Test Customer')[0]
    approve.props.onClick()
    approve.props.onClick()
    await app.flush(2)
    assert.equal(updateCalls, 1)
    release()
    await app.flush()
    assert.match(app.html(), /Approved &amp; Public|Approved & Public/)
    app.unmount()
  })

  await runTest('21. AdminReviewsPage: failed approval shows error and does not show success', async () => {
    bridge.supabase = createMockSupabaseClient(ctx => {
      if (ctx.op === 'select') return { data: [reviewRow()], error: null }
      if (ctx.op === 'update') return { data: null, error: { code: '42501', message: 'approval denied' } }
      return { data: null, error: null }
    })
    const app = createReactMountHarness(AdminReviewsPage)
    await app.flush()
    app.findButton('Approve review by Test Customer')[0].props.onClick()
    await app.flush()
    assert.match(app.html(), /approval denied/)
    assert.doesNotMatch(app.html(), /Review approved successfully/)
    app.unmount()
  })

  await runTest('22. AdminReviewsPage: duplicate delete confirmation clicks issue only one request', async () => {
    let release
    let deleteCalls = 0
    bridge.supabase = createMockSupabaseClient(ctx => {
      if (ctx.op === 'select') return { data: [reviewRow()], error: null }
      if (ctx.op === 'delete') {
        deleteCalls++
        return new Promise(resolve => { release = () => resolve({ data: { id: UUID_1 }, error: null }) })
      }
      return { data: null, error: null }
    })
    const app = createReactMountHarness(AdminReviewsPage)
    await app.flush()
    app.findButton('Delete review by Test Customer')[0].props.onClick()
    const confirm = app.findButton('Delete review')[0]
    confirm.props.onClick()
    confirm.props.onClick()
    await app.flush(2)
    assert.equal(deleteCalls, 1)
    release()
    await app.flush()
    assert.doesNotMatch(app.html(), /Test Product/)
    app.unmount()
  })
} catch (error) {
  if (String(error?.message || '').includes('Cannot find native binding')) {
    console.warn('SKIP: UI behavior tests require the platform-specific Vite/Rolldown native binding.')
  } else {
    throw error
  }
} finally {
  if (viteServer) await viteServer.close()
}

console.log(`\nSummary: ${passed} passed, ${failed} failed (total ${passed + failed})`)
if (failed > 0) process.exitCode = 1
