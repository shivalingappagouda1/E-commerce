import assert from 'node:assert/strict'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

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
  adminSaveBanner,
  adminToggleBannerActive,
  getBannerStatus,
  normalizeBannerRow,
  validateBannerPayload,
} = await import('./src/services/adminService.js')

const bannerRow = (overrides = {}) => ({
  id: 1,
  title: 'Mega Electronics Sale',
  subtitle: 'Up to 60% off on laptops and audio gear',
  cta: 'Shop Electronics',
  cta_link: '/category/electronics',
  image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
  bg_from: '#1e3a5f',
  bg_to: '#2563eb',
  sort_order: 1,
  is_active: true,
  starts_at: null,
  ends_at: null,
  created_at: '2026-11-10T10:00:00.000Z',
  updated_at: '2026-11-10T10:00:00.000Z',
  ...overrides,
})

function createMockSupabaseClient(handler) {
  const calls = []
  const client = {
    calls,
    from(table) {
      const ctx = {
        table,
        op: null,
        selectCols: null,
        insertPayload: null,
        updatePayload: null,
        filters: [],
        orders: [],
        singleMode: false,
      }
      const builder = {
        select(cols = '*') {
          if (!ctx.op) ctx.op = 'select'
          ctx.selectCols = cols
          return builder
        },
        insert(payload) {
          ctx.op = 'insert'
          ctx.insertPayload = payload
          return builder
        },
        update(payload) {
          ctx.op = 'update'
          ctx.updatePayload = payload
          return builder
        },
        delete() {
          ctx.op = 'delete'
          return builder
        },
        eq(col, val) {
          ctx.filters.push({ col, val })
          return builder
        },
        order(col, opts) {
          ctx.orders.push({ col, opts })
          return builder
        },
        single() {
          ctx.singleMode = true
          return builder
        },
        then(resolve, reject) {
          calls.push({
            ...ctx,
            filters: [...ctx.filters],
            orders: [...ctx.orders],
          })
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

console.log('=== TEST SUITE: PHASE 5 STAGE B3 — ADMIN BANNERS SUPABASE INTEGRATION ===\n')

await runTest('1. Supabase fetch requests sort_order then id ascending and normalizes schema columns', async () => {
  const client = createMockSupabaseClient(() => ({
    data: [
      bannerRow({ id: 2, sort_order: 5, title: 'Second' }),
      bannerRow({ id: 1, sort_order: 1, title: 'First', ctaLink: '/legacy', bgFrom: '#111111', bgTo: '#222222' }),
    ],
    error: null,
  }))

  const { data, error } = await adminFetchBanners(client, true)
  assert.equal(error, null)
  assert.equal(client.calls[0].table, 'banners')
  assert.deepEqual(client.calls[0].orders, [
    { col: 'sort_order', opts: { ascending: true } },
    { col: 'id', opts: { ascending: true } },
  ])
  assert.deepEqual(data.map(b => b.id), [1, 2])
  assert.equal(data[0].bg_from, '#1e3a5f')
  assert.equal(data[0].cta_link, '/category/electronics')

  const legacyNormalized = normalizeBannerRow({
    id: 3,
    title: 'Legacy',
    ctaLink: '/fashion',
    image: 'https://example.com/a.jpg',
    bgFrom: '#ABCDEF',
    bgTo: '#123456',
  })
  assert.equal(legacyNormalized.cta_link, '/fashion')
  assert.equal(legacyNormalized.image_url, 'https://example.com/a.jpg')
  assert.equal(legacyNormalized.bg_from, '#abcdef')
  assert.equal(legacyNormalized.bg_to, '#123456')
})

await runTest('2. Empty Supabase banner table returns [] and never falls back to or modifies LocalStorage', async () => {
  const sentinel = JSON.stringify([bannerRow()])
  globalThis.localStorage.setItem(ADMIN_BANNERS_STORAGE, sentinel)
  const client = createMockSupabaseClient(() => ({ data: [], error: null }))

  const { data, error } = await adminFetchBanners(client, true)
  assert.equal(error, null)
  assert.deepEqual(data, [])
  assert.equal(globalThis.localStorage.getItem(ADMIN_BANNERS_STORAGE), sentinel)
})

await runTest('3. Supabase fetch error is returned without LocalStorage fallback', async () => {
  const sentinel = JSON.stringify([bannerRow()])
  globalThis.localStorage.setItem(ADMIN_BANNERS_STORAGE, sentinel)
  const dbError = { code: '42501', message: 'permission denied for table banners' }
  const client = createMockSupabaseClient(() => ({ data: null, error: dbError }))

  const { data, error } = await adminFetchBanners(client, true)
  assert.equal(data, null)
  assert.equal(error.message, 'permission denied for table banners')
  assert.equal(globalThis.localStorage.getItem(ADMIN_BANNERS_STORAGE), sentinel)
})

await runTest('4. Validate banner payload accepts valid fields and rejects invalid URLs, colors, sort_order, and schedules', () => {
  const ok = validateBannerPayload({
    title: '  Festive Sale  ',
    subtitle: '  Big discounts  ',
    cta: '  Buy Now  ',
    cta_link: '  /category/fashion  ',
    image_url: 'https://cdn.example.com/hero.jpg',
    bg_from: '#1E3A5F',
    bg_to: '#2563EB',
    sort_order: '2',
    is_active: true,
    starts_at: '2026-11-01T10:00:00Z',
    ends_at: '2026-11-30T10:00:00Z',
  })
  assert.equal(ok.valid, true)
  assert.equal(ok.payload.title, 'Festive Sale')
  assert.equal(ok.payload.bg_from, '#1e3a5f')
  assert.equal(ok.payload.sort_order, 2)
  assert.equal('id' in ok.payload, false)

  assert.equal(validateBannerPayload({ title: '   ' }).valid, false)
  assert.equal(validateBannerPayload({ title: 'X', bg_from: 'red' }).valid, false)
  assert.equal(validateBannerPayload({ title: 'X', cta_link: 'javascript:alert(1)' }).valid, false)
  assert.equal(validateBannerPayload({ title: 'X', image_url: 'data:text/html,<script>' }).valid, false)
  assert.equal(validateBannerPayload({ title: 'X', sort_order: -1 }).valid, false)
  assert.equal(validateBannerPayload({ title: 'X', sort_order: 1.5 }).valid, false)
  assert.equal(validateBannerPayload({
    title: 'X',
    starts_at: '2026-11-10T10:00:00Z',
    ends_at: '2026-11-10T09:00:00Z',
  }).valid, false)
})

await runTest('5. Banner creation omits client-side id (uses PostgreSQL SERIAL id) and returns created row', async () => {
  const client = createMockSupabaseClient(ctx => ({
    data: bannerRow({ id: 42, ...ctx.insertPayload[0] }),
    error: null,
  }))

  const { data, error } = await adminSaveBanner({
    title: 'Winter Collection',
    subtitle: 'Cozy essentials',
    cta: 'Shop Winter',
    cta_link: '/category/fashion',
    image_url: 'https://example.com/winter.jpg',
    bg_from: '#0f172a',
    bg_to: '#334155',
    sort_order: 4,
    is_active: true,
  }, client, true)

  assert.equal(error, null)
  assert.equal(client.calls[0].op, 'insert')
  assert.equal('id' in client.calls[0].insertPayload[0], false)
  assert.equal('created_at' in client.calls[0].insertPayload[0], false)
  assert.equal(data.id, 42)
  assert.equal(data.title, 'Winter Collection')
})

await runTest('6. Banner update targets exact SERIAL integer id and rejects synthetic or invalid IDs without calling DB', async () => {
  const client = createMockSupabaseClient(ctx => ({
    data: bannerRow({ id: 7, ...ctx.updatePayload }),
    error: null,
  }))

  const updated = await adminSaveBanner({
    id: 7,
    title: 'Updated Hero',
    bg_from: '#112233',
    bg_to: '#445566',
    sort_order: 3,
    is_active: false,
  }, client, true)

  assert.equal(updated.error, null)
  assert.equal(client.calls.length, 1)
  assert.equal(client.calls[0].op, 'update')
  assert.deepEqual(client.calls[0].filters, [{ col: 'id', val: 7 }])
  assert.equal('id' in client.calls[0].updatePayload, false)

  const invalidOverflow = await adminSaveBanner({ id: 1794427893414, title: 'Overflow ID' }, client, true)
  const invalidText = await adminSaveBanner({ id: 'banner-temp', title: 'Synthetic ID' }, client, true)
  assert.equal(invalidOverflow.data, null)
  assert.equal(invalidOverflow.error.code, 'VALIDATION_ERROR')
  assert.equal(invalidText.data, null)
  assert.equal(invalidText.error.code, 'VALIDATION_ERROR')
  assert.equal(client.calls.length, 1)
})

await runTest('7. Save treats missing returned row and PGRST116/database errors as failures', async () => {
  const zeroRowClient = createMockSupabaseClient(() => ({ data: null, error: { code: 'PGRST116', message: 'zero rows' } }))
  const resZero = await adminSaveBanner({ id: 5, title: 'Ghost Banner' }, zeroRowClient, true)
  assert.equal(resZero.data, null)
  assert.match(resZero.error.message, /not found or permission denied/)

  const missingDataClient = createMockSupabaseClient(() => ({ data: null, error: null }))
  const resMissing = await adminSaveBanner({ title: 'Unconfirmed Insert' }, missingDataClient, true)
  assert.equal(resMissing.data, null)
  assert.match(resMissing.error.message, /could not be confirmed/)
})

await runTest('8. Toggle active status updates only is_active, validates id/boolean, and detects missing rows', async () => {
  const client = createMockSupabaseClient(() => ({ data: bannerRow({ id: 9, is_active: false }), error: null }))

  const badBool = await adminToggleBannerActive(9, 'true', client, true)
  const badId = await adminToggleBannerActive('abc', false, client, true)
  assert.equal(badBool.success, false)
  assert.equal(badId.success, false)
  assert.equal(client.calls.length, 0)

  const ok = await adminToggleBannerActive(9, false, client, true)
  assert.equal(ok.success, true)
  assert.equal(ok.error, null)
  assert.deepEqual(client.calls[0].updatePayload, { is_active: false })
  assert.deepEqual(client.calls[0].filters, [{ col: 'id', val: 9 }])
  assert.equal(ok.data.is_active, false)

  const zeroClient = createMockSupabaseClient(() => ({ data: null, error: null }))
  const missingRes = await adminToggleBannerActive(9, true, zeroClient, true)
  assert.equal(missingRes.success, false)
  assert.match(missingRes.error.message, /not found or permission denied/)
})

await runTest('9. Delete verifies returned deleted row and rejects invalid IDs, zero-row results, and DB errors', async () => {
  const okClient = createMockSupabaseClient(() => ({ data: { id: 12 }, error: null }))
  const badId = await adminDeleteBanner('1794427893414', okClient, true)
  assert.equal(badId.success, false)
  assert.equal(okClient.calls.length, 0)

  const ok = await adminDeleteBanner(12, okClient, true)
  assert.equal(ok.success, true)
  assert.equal(ok.error, null)
  assert.equal(okClient.calls[0].op, 'delete')
  assert.equal(okClient.calls[0].selectCols, 'id')
  assert.equal(okClient.calls[0].singleMode, true)
  assert.deepEqual(okClient.calls[0].filters, [{ col: 'id', val: 12 }])

  const pgrstClient = createMockSupabaseClient(() => ({ data: null, error: { code: 'PGRST116', message: '0 rows' } }))
  const resZero = await adminDeleteBanner(12, pgrstClient, true)
  assert.equal(resZero.success, false)
  assert.match(resZero.error.message, /not found or permission denied/)

  const unconfirmedClient = createMockSupabaseClient(() => ({ data: null, error: null }))
  const resMissing = await adminDeleteBanner(12, unconfirmedClient, true)
  assert.equal(resMissing.success, false)
  assert.match(resMissing.error.message, /not found or permission denied/)
})

await runTest('10. Demo mode initializes shopkart_admin_banners, generates sequential integer IDs (no Date.now()), and persists CRUD', async () => {
  const fetched = await adminFetchBanners(null, false)
  assert.equal(fetched.error, null)
  assert.equal(fetched.data.length, 3)

  const created = await adminSaveBanner({
    title: 'Demo Spring Sale',
    subtitle: 'Fresh arrivals',
    cta: 'Explore',
    cta_link: '/featured',
    image_url: 'https://example.com/spring.jpg',
    bg_from: '#1e293b',
    bg_to: '#0ea5e9',
    sort_order: 2,
    is_active: true,
  }, null, false)
  assert.equal(created.error, null)
  assert.equal(created.data.id, 4)
  assert.ok(created.data.id < 1000)

  const updated = await adminSaveBanner({
    id: 4,
    title: 'Demo Spring Sale Revised',
    sort_order: 1,
  }, null, false)
  assert.equal(updated.error, null)
  assert.equal(updated.data.title, 'Demo Spring Sale Revised')

  const toggled = await adminToggleBannerActive(4, false, null, false)
  assert.equal(toggled.success, true)
  assert.equal(toggled.data.is_active, false)

  const deleted = await adminDeleteBanner(4, null, false)
  assert.equal(deleted.success, true)

  const after = await adminFetchBanners(null, false)
  assert.equal(after.data.length, 3)
  assert.equal(after.data.some(b => b.id === 4), false)
})

await runTest('11. Demo mode persists empty array without reseeding SAMPLE_BANNERS on next adminFetchBanners', async () => {
  await adminFetchBanners(null, false)
  await adminDeleteBanner(1, null, false)
  await adminDeleteBanner(2, null, false)
  await adminDeleteBanner(3, null, false)

  const after = await adminFetchBanners(null, false)
  assert.equal(after.error, null)
  assert.deepEqual(after.data, [])
})

await runTest('12. Banner schedule status helper matches RLS visibility rules', () => {
  const now = new Date('2026-11-12T00:00:00.000Z')
  assert.equal(getBannerStatus({ is_active: false }, now), 'Hidden')
  assert.equal(getBannerStatus({ is_active: true, starts_at: '2026-11-15T00:00:00Z' }, now), 'Scheduled')
  assert.equal(getBannerStatus({ is_active: true, ends_at: '2026-11-11T23:59:59Z' }, now), 'Expired')
  assert.equal(getBannerStatus({ is_active: true, starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-20T00:00:00Z' }, now), 'Active')
})

// UI & HeroBanner component integration via Vite SSR module loading
const fs = await import('node:fs')
const { createServer } = await import('vite')
const bridge = { supabase: null }
const supabasePath = path.resolve('src/lib/supabase.js').replace(/\\/g, '/')

let viteServer
try {
  viteServer = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
    plugins: [
      {
        name: 'stage-b3-supabase-mock',
        enforce: 'pre',
        load(id) {
          if (id.split('?')[0].replace(/\\/g, '/') === supabasePath) {
            return `
              export const isSupabaseConfigured = true
              export const supabase = new Proxy({}, {
                get(_, prop) {
                  const active = globalThis.__B3_BRIDGE__?.supabase
                  if (!active) return undefined
                  const value = active[prop]
                  return typeof value === 'function' ? value.bind(active) : value
                }
              })
            `
          }
          return null
        },
      },
    ],
  })

  globalThis.__B3_BRIDGE__ = bridge

  function findElements(node, predicate, results = []) {
    if (!node || typeof node !== 'object') return results
    if (Array.isArray(node)) {
      for (const child of node) findElements(child, predicate, results)
      return results
    }
    if (predicate(node)) results.push(node)
    if (node.props?.children) findElements(node.props.children, predicate, results)
    return results
  }

  function getTextContent(node) {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(getTextContent).join('')
    if (node && typeof node === 'object' && node.props?.children !== undefined) {
      return getTextContent(node.props.children)
    }
    return ''
  }

  function createReactMountHarness(Component) {
    let hookIndex = 0
    const hookValues = []
    const effects = []
    let unmounted = false
    let vnode = null
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

    const dispatcher = {
      useState(initial) {
        const index = hookIndex++
        if (hookValues.length <= index) {
          hookValues[index] = typeof initial === 'function' ? initial() : initial
        }
        const setState = action => {
          if (unmounted) return
          const next = typeof action === 'function' ? action(hookValues[index]) : action
          if (!Object.is(next, hookValues[index])) {
            hookValues[index] = next
            render()
          }
        }
        return [hookValues[index], setState]
      },
      useRef(initial) {
        const index = hookIndex++
        if (hookValues.length <= index) hookValues[index] = { current: initial }
        return hookValues[index]
      },
      useEffect(create, deps) {
        const index = hookIndex++
        const previous = hookValues[index]
        const changed = !previous || !deps || !previous.deps || deps.length !== previous.deps.length
          || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
        if (changed) effects.push({ index, create, deps })
        hookValues[index] = { deps, cleanup: previous?.cleanup }
      },
      useCallback(fn) {
        const index = hookIndex++
        hookValues[index] = fn
        return fn
      },
      useMemo(fn) {
        const index = hookIndex++
        hookValues[index] = fn()
        return hookValues[index]
      },
      useContext(context) {
        return context._currentValue
      },
    }

    function render() {
      const previous = internals.H
      hookIndex = 0
      internals.H = dispatcher
      try {
        vnode = Component()
      } finally {
        internals.H = previous
      }
      while (effects.length) {
        const effect = effects.shift()
        if (typeof hookValues[effect.index]?.cleanup === 'function') {
          hookValues[effect.index].cleanup()
        }
        hookValues[effect.index].cleanup = effect.create()
      }
      return vnode
    }

    render()
    return {
      get tree() { return vnode },
      html() { return renderToStaticMarkup(vnode) },
      findButton(text) {
        return findElements(
          vnode,
          element => element.type === 'button'
            && (element.props?.['aria-label'] === text || getTextContent(element).trim().includes(text))
        )
      },
      findForms() { return findElements(vnode, el => el.type === 'form') },
      findInputs(typeFilter) {
        return findElements(vnode, el => el.type === 'input' && (!typeFilter || el.props?.type === typeFilter))
      },
      async flush(ticks = 8) {
        for (let i = 0; i < ticks; i++) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      },
      unmount() {
        unmounted = true
        for (const entry of hookValues) {
          if (typeof entry?.cleanup === 'function') entry.cleanup()
        }
      },
    }
  }

  const { default: AdminBannersPage } = await viteServer.ssrLoadModule('/src/pages/admin/AdminBannersPage.jsx')
  const { default: HeroBanner } = await viteServer.ssrLoadModule('/src/components/layout/HeroBanner.jsx')

  await runTest('13. AdminBannersPage: loading state transitions cleanly to empty state without error state', async () => {
    let release
    bridge.supabase = createMockSupabaseClient(() => new Promise(resolve => {
      release = () => resolve({ data: [], error: null })
    }))

    const app = createReactMountHarness(AdminBannersPage)
    await app.flush(2)
    assert.match(app.html(), /Loading promotional banners/)
    release()
    await app.flush()
    const html = app.html()
    assert.match(html, /No promotional banners found/)
    assert.doesNotMatch(html, /Failed to load promotional banners/)
    app.unmount()
  })

  await runTest('14. AdminBannersPage: fetch failure shows error state; Retry enters loading and blocks duplicate fetches', async () => {
    let calls = 0
    let release
    bridge.supabase = createMockSupabaseClient(() => {
      calls++
      if (calls === 1) return { data: null, error: { message: 'banners read denied' } }
      return new Promise(resolve => { release = () => resolve({ data: [], error: null }) })
    })

    const app = createReactMountHarness(AdminBannersPage)
    await app.flush()
    assert.match(app.html(), /Failed to load promotional banners/)
    assert.match(app.html(), /banners read denied/)

    app.findButton('Retry')[0].props.onClick()
    assert.match(app.html(), /Loading promotional banners/)
    app.findButton('Refresh banners')[0].props.onClick()
    await app.flush(2)
    assert.equal(calls, 2)

    release()
    await app.flush()
    assert.match(app.html(), /No promotional banners found/)
    app.unmount()
  })

  await runTest('15. AdminBannersPage: create modal blocks duplicate submit and preserves modal/no-success on error', async () => {
    let releaseInsert
    let insertCalls = 0
    let mode = 'hang'
    bridge.supabase = createMockSupabaseClient(ctx => {
      if (ctx.op === 'select') return { data: [], error: null }
      if (ctx.op === 'insert') {
        insertCalls++
        if (mode === 'error') {
          return { data: null, error: { code: '42501', message: 'insert denied by RLS' } }
        }
        return new Promise(resolve => {
          releaseInsert = () => resolve({
            data: bannerRow({ id: 101, ...ctx.insertPayload[0] }),
            error: null,
          })
        })
      }
      return { data: null, error: null }
    })

    const app = createReactMountHarness(AdminBannersPage)
    await app.flush()
    app.findButton('Add Banner')[0].props.onClick()
    assert.match(app.html(), /Create Banner/)

    // Fill required Headline input
    const textInputs = app.findInputs('text')
    textInputs[0].props.onChange({ target: { value: 'Monsoon Mega Deal' } })

    const form = app.findForms()[0]
    mode = 'hang'
    form.props.onSubmit({ preventDefault() {} })
    form.props.onSubmit({ preventDefault() {} })
    await app.flush(2)
    assert.equal(insertCalls, 1)

    releaseInsert()
    await app.flush()
    assert.match(app.html(), /Banner &quot;Monsoon Mega Deal&quot; created successfully|Banner "Monsoon Mega Deal" created successfully/)

    // Now test error path stays open with alert and no false success
    app.findButton('Add Banner')[0].props.onClick()
    app.findInputs('text')[0].props.onChange({ target: { value: 'Failing Banner' } })
    mode = 'error'
    app.findForms()[0].props.onSubmit({ preventDefault() {} })
    await app.flush()
    assert.match(app.html(), /insert denied by RLS/)
    assert.match(app.html(), /Create Banner/)
    assert.doesNotMatch(app.html(), /created successfully/)
    app.unmount()
  })

  await runTest('16. AdminBannersPage: duplicate toggle clicks are locked and failed toggle shows error without flipping card', async () => {
    let toggleCalls = 0
    let releaseToggle
    let failMode = false
    bridge.supabase = createMockSupabaseClient(ctx => {
      if (ctx.op === 'select') return { data: [bannerRow({ id: 3, title: 'Hero Deal', is_active: true })], error: null }
      if (ctx.op === 'update') {
        toggleCalls++
        if (failMode) {
          return { data: null, error: { code: '42501', message: 'toggle rejected' } }
        }
        return new Promise(resolve => {
          releaseToggle = () => resolve({
            data: bannerRow({ id: 3, title: 'Hero Deal', is_active: false }),
            error: null,
          })
        })
      }
      return { data: null, error: null }
    })

    const app = createReactMountHarness(AdminBannersPage)
    await app.flush()

    const toggleBtn = app.findButton('Deactivate banner Hero Deal')[0]
    toggleBtn.props.onClick()
    toggleBtn.props.onClick()
    await app.flush(2)
    assert.equal(toggleCalls, 1)

    releaseToggle()
    await app.flush()
    assert.match(app.html(), /Hidden/)

    failMode = true
    app.findButton('Activate banner Hero Deal')[0].props.onClick()
    await app.flush()
    assert.match(app.html(), /toggle rejected/)
    assert.match(app.html(), /Hidden/)
    app.unmount()
  })

  await runTest('17. AdminBannersPage: delete confirmation prevents duplicates and keeps banner when delete fails', async () => {
    let deleteCalls = 0
    let releaseDelete
    let failDelete = true
    bridge.supabase = createMockSupabaseClient(ctx => {
      if (ctx.op === 'select') return { data: [bannerRow({ id: 5, title: 'Clearance Banner' })], error: null }
      if (ctx.op === 'delete') {
        deleteCalls++
        if (failDelete) return { data: null, error: { code: '42501', message: 'delete forbidden' } }
        return new Promise(resolve => {
          releaseDelete = () => resolve({ data: { id: 5 }, error: null })
        })
      }
      return { data: null, error: null }
    })

    const app = createReactMountHarness(AdminBannersPage)
    await app.flush()

    app.findButton('Delete banner Clearance Banner')[0].props.onClick()
    assert.match(app.html(), /Delete banner/)

    const confirmBtn = app.findButton('Delete banner').find(btn => !btn.props?.['aria-label'])
    confirmBtn.props.onClick()
    await app.flush()
    assert.equal(deleteCalls, 1)
    assert.match(app.html(), /delete forbidden/)
    assert.match(app.html(), /Clearance Banner/)

    failDelete = false
    const retryConfirm = app.findButton('Delete banner').find(btn => !btn.props?.['aria-label'])
    retryConfirm.props.onClick()
    retryConfirm.props.onClick()
    await app.flush(2)
    assert.equal(deleteCalls, 2)

    releaseDelete()
    await app.flush()
    assert.match(app.html(), /No promotional banners found/)
    assert.match(app.html(), /deleted successfully/)
    app.unmount()
  })

  await runTest('18. HeroBanner renders database bg_from/bg_to gradient, image_url, and relative vs external cta_link', () => {
    const dbBanners = [
      bannerRow({
        id: 10,
        title: 'Storefront Synced Hero',
        subtitle: 'Matches PostgreSQL gradient and image',
        cta: 'Buy Audio',
        cta_link: '/category/audio',
        image_url: 'https://example.com/audio.jpg',
        bg_from: '#123456',
        bg_to: '#654321',
      }),
    ]
    const internalHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(HeroBanner, { banners: dbBanners }))
    )
    assert.match(internalHtml, /Storefront Synced Hero/)
    assert.match(internalHtml, /linear-gradient\(135deg, #123456 0%, #654321 100%\)/)
    assert.match(internalHtml, /src="https:\/\/example\.com\/audio\.jpg"/)
    assert.match(internalHtml, /href="\/category\/audio"/)

    const extHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(HeroBanner, {
        banners: [bannerRow({ id: 11, cta_link: 'https://shopkart.example.com/promo' })],
      }))
    )
    assert.match(extHtml, /href="https:\/\/shopkart\.example\.com\/promo"/)
    assert.match(extHtml, /target="_blank"/)
  })

  await runTest('19. Storefront compatibility: productService.fetchBanners reads admin-persisted demo banners in sort_order & filters inactive', async () => {
    const demoServer = await createServer({
      server: { middlewareMode: true, watch: null },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true },
      logLevel: 'silent',
      plugins: [
        {
          name: 'stage-b3-demo-supabase-off',
          enforce: 'pre',
          load(id) {
            if (id.split('?')[0].replace(/\\/g, '/') === supabasePath) {
              return 'export const isSupabaseConfigured = false\nexport const supabase = null\n'
            }
            return null
          },
        },
      ],
    })
    try {
      const { fetchBanners } = await demoServer.ssrLoadModule('/src/services/productService.js')
      await adminFetchBanners(null, false)
      await adminSaveBanner({ id: 2, title: 'Fashion Promoted First', sort_order: 0, is_active: true }, null, false)
      await adminToggleBannerActive(1, false, null, false)

      const storefrontResult = await fetchBanners()
      assert.equal(storefrontResult.error, null)
      assert.deepEqual(storefrontResult.data.map(b => b.id), [2, 3])
      assert.equal(storefrontResult.data[0].title, 'Fashion Promoted First')
    } finally {
      await demoServer.close()
    }
  })

  await runTest('20. AdminBannersPage and adminService never generate Date.now() IDs for banners', () => {
    const adminPageSrc = fs.readFileSync('src/pages/admin/AdminBannersPage.jsx', 'utf8')
    const adminSvcSrc = fs.readFileSync('src/services/adminService.js', 'utf8')
    const bannersSection = adminSvcSrc.slice(adminSvcSrc.indexOf('PHASE 5 STAGE B3'))
    assert.equal(/Date\.now/.test(adminPageSrc), false)
    assert.equal(/Date\.now/.test(bannersSection), false)
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
