import assert from 'node:assert/strict'
import path from 'node:path'
import { createServer } from 'vite'

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
  ADMIN_BANNERS_STORAGE,
  adminDeleteBanner,
  adminFetchBanners,
} = await import('./src/services/adminService.js')

const supabasePath = path.resolve('src/lib/supabase.js').replace(/\\/g, '/')
const bridge = { configured: false, supabase: null }

function createMockSupabaseBannersClient(handler) {
  const calls = []
  return {
    calls,
    from(table) {
      const ctx = { table, selectCols: null, filters: [], orders: [] }
      const builder = {
        select(cols = '*') { ctx.selectCols = cols; return builder },
        eq(col, val) { ctx.filters.push({ col, val }); return builder },
        order(col, opts) { ctx.orders.push({ col, opts }); return builder },
        then(resolve, reject) {
          calls.push({ ...ctx, filters: [...ctx.filters], orders: [...ctx.orders] })
          Promise.resolve().then(() => handler(ctx)).then(resolve, reject)
        },
      }
      return builder
    },
  }
}

let viteServer
let passed = 0
let failed = 0

async function runTest(name, fn) {
  globalThis.localStorage = createMemoryStorage()
  try {
    await fn()
    passed++
    console.log(`PASS: ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL: ${name}`)
    console.error(error)
  }
}

console.log('=== REGRESSION TEST SUITE: EMPTY DEMO BANNER FALLBACK ===\n')

try {
  viteServer = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
    plugins: [
      {
        name: 'demo-banner-fallback-supabase-mock',
        enforce: 'pre',
        load(id) {
          if (id.split('?')[0].replace(/\\/g, '/') === supabasePath) {
            return `
              export function __getBridge() { return globalThis.__DEMO_BANNER_BRIDGE__ }
              export const isSupabaseConfigured = true
              export const supabase = null
            `
          }
          return null
        },
        transform(code, id) {
          if (id.split('?')[0].replace(/\\/g, '/').endsWith('/src/services/productService.js')) {
            return code.replace(
              'const isMock = () => !isSupabaseConfigured || !supabase',
              'const isMock = () => !globalThis.__DEMO_BANNER_BRIDGE__?.configured || !globalThis.__DEMO_BANNER_BRIDGE__?.supabase'
            ).replace(
              "supabase\n        .from('banners')",
              "globalThis.__DEMO_BANNER_BRIDGE__.supabase\n        .from('banners')"
            )
          }
          return null
        },
      },
    ],
  })

  globalThis.__DEMO_BANNER_BRIDGE__ = bridge

  const { BANNERS_STORAGE_KEY, fetchBanners } = await viteServer.ssrLoadModule('/src/services/productService.js')
  const { SAMPLE_BANNERS } = await viteServer.ssrLoadModule('/src/utils/sampleData.js')

  await runTest('1. Missing key (null): initializes shopkart_admin_banners with SAMPLE_BANNERS and returns sample banners', async () => {
    bridge.configured = false
    bridge.supabase = null
    assert.equal(globalThis.localStorage.getItem(BANNERS_STORAGE_KEY), null)

    const { data, error } = await fetchBanners()
    assert.equal(error, null)
    assert.deepEqual(data, SAMPLE_BANNERS)
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(BANNERS_STORAGE_KEY)), SAMPLE_BANNERS)
  })

  await runTest('2. Non-empty array: uses stored banners, filters inactive, and sorts by sort_order', async () => {
    bridge.configured = false
    bridge.supabase = null
    const storedBanners = [
      { id: 10, title: 'Third Priority Active', sort_order: 5, is_active: true },
      { id: 11, title: 'Hidden Banner', sort_order: 1, is_active: false },
      { id: 12, title: 'First Priority Active', sort_order: 2, is_active: true },
    ]
    globalThis.localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify(storedBanners))

    const { data, error } = await fetchBanners()
    assert.equal(error, null)
    assert.deepEqual(data.map(b => b.id), [12, 10])
    assert.equal(data.some(b => b.id === 11), false)
  })

  await runTest('3. Empty array ([]): returns empty array and does not restore SAMPLE_BANNERS', async () => {
    bridge.configured = false
    bridge.supabase = null
    globalThis.localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify([]))

    const { data, error } = await fetchBanners()
    assert.equal(error, null)
    assert.deepEqual(data, [])
    assert.equal(globalThis.localStorage.getItem(BANNERS_STORAGE_KEY), '[]')
  })

  await runTest('4. Deleting all banners in admin demo mode leaves storefront fetchBanners() empty without restoring SAMPLE_BANNERS', async () => {
    bridge.configured = false
    bridge.supabase = null

    await adminFetchBanners(null, false)
    await adminDeleteBanner(1, null, false)
    await adminDeleteBanner(2, null, false)
    await adminDeleteBanner(3, null, false)

    assert.equal(globalThis.localStorage.getItem(ADMIN_BANNERS_STORAGE), '[]')
    const { data, error } = await fetchBanners()
    assert.equal(error, null)
    assert.deepEqual(data, [])
    assert.equal(globalThis.localStorage.getItem(BANNERS_STORAGE_KEY), '[]')
  })

  await runTest('5. Non-empty array with all inactive banners returns [] without restoring SAMPLE_BANNERS', async () => {
    bridge.configured = false
    bridge.supabase = null
    globalThis.localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify([
      { id: 1, title: 'Deactivated Hero', sort_order: 1, is_active: false },
    ]))

    const { data, error } = await fetchBanners()
    assert.equal(error, null)
    assert.deepEqual(data, [])
  })

  await runTest('6. Supabase mode behavior and error handling remain preserved without LocalStorage fallback', async () => {
    globalThis.localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify([{ id: 99, title: 'Demo Sentinel', is_active: true }]))

    bridge.configured = true
    bridge.supabase = createMockSupabaseBannersClient(() => ({ data: [], error: null }))
    const emptyRes = await fetchBanners()
    assert.equal(emptyRes.error, null)
    assert.deepEqual(emptyRes.data, [])
    assert.equal(bridge.supabase.calls[0].table, 'banners')
    assert.deepEqual(bridge.supabase.calls[0].filters, [{ col: 'is_active', val: true }])
    assert.deepEqual(bridge.supabase.calls[0].orders, [{ col: 'sort_order', opts: undefined }])

    const dbError = { code: '42501', message: 'permission denied' }
    bridge.supabase = createMockSupabaseBannersClient(() => ({ data: null, error: dbError }))
    const errRes = await fetchBanners()
    assert.deepEqual(errRes.data, [])
    assert.equal(errRes.error, dbError)
  })
} finally {
  if (viteServer) await viteServer.close()
}

console.log(`\nSummary: ${passed} passed, ${failed} failed (total ${passed + failed})`)
if (failed > 0) process.exitCode = 1
