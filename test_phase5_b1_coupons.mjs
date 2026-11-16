        import assert from 'node:assert/strict'
        import path from 'node:path'
        import React from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createServer } from 'vite'

        // Install isolated in-memory localStorage mock to detect any forbidden fallback in Supabase mode
        function createMemoryStorage(initial = {}) {
          const store = new Map(Object.entries(initial))
          return {
            get length() {
              return store.size
            },
            getItem(key) {
              return store.has(key) ? store.get(key) : null
            },
            setItem(key, value) {
              store.set(key, String(value))
            },
            removeItem(key) {
              store.delete(key)
            },
            clear() {
              store.clear()
            },
          }
        }

        globalThis.localStorage = createMemoryStorage()

        const {
          ADMIN_COUPONS_STORAGE,
          validateCouponPayload,
          getCouponStatus,
          adminFetchCoupons,
          adminSaveCoupon,
          adminToggleCouponActive,
          adminDeleteCoupon,
        } = await import('./src/services/adminService.js')

        const VALID_UUID_1 = '00000000-0000-4000-e000-000000000001'
        const VALID_UUID_2 = '11111111-2222-4333-8444-555555555555'

        /**
         * Creates a fluent mock Supabase client recording executed table calls and payloads.
         */
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
                insert(rows) {
                  ctx.op = 'insert'
                  ctx.insertPayload = rows
                  return builder
                },
                update(patch) {
                  ctx.op = 'update'
                  ctx.updatePayload = patch
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
                  calls.push({ ...ctx })
                  Promise.resolve(handler(ctx)).then(resolve, reject)
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
          } catch (err) {
            failed++
            console.error(`FAIL: ${name}`)
            console.error(err)
          }
        }

        console.log('=== TEST SUITE: PHASE 5 STAGE B1 — ADMIN COUPONS SUPABASE INTEGRATION ===\n')

        // 1. Uppercase and whitespace normalization
        await runTest('1. Uppercase and whitespace normalization in validateCouponPayload and adminSaveCoupon', async () => {
          const v = validateCouponPayload({
            code: '  flash25  ',
            discount_type: 'percent',
            discount_value: 25,
            min_order_value: 500,
            max_uses: 100,
            expires_at: null,
            is_active: true,
          })
          assert.equal(v.valid, true)
          assert.equal(v.payload.code, 'FLASH25')

          const mockClient = createMockSupabaseClient(ctx => ({
            data: { id: VALID_UUID_2, ...ctx.insertPayload[0], used_count: 0 },
            error: null,
          }))

          const { data, error } = await adminSaveCoupon(
            {
              code: '  winter50  ',
              discount_type: 'fixed',
              discount_value: 50,
            },
            mockClient,
            true
          )
          assert.equal(error, null)
          assert.equal(mockClient.calls[0].insertPayload[0].code, 'WINTER50')
          assert.equal(data.code, 'WINTER50')
        })

        // 2. Rejection of empty coupon codes
        await runTest('2. Rejects empty or whitespace-only coupon codes without calling DB', async () => {
          const mockClient = createMockSupabaseClient(() => {
            throw new Error('Should not hit database')
          })

          for (const badCode of ['', '   ', null, undefined]) {
            const res = await adminSaveCoupon(
              { code: badCode, discount_type: 'percent', discount_value: 10 },
              mockClient,
              true
            )
            assert.equal(res.data, null)
            assert.equal(res.error.code, 'VALIDATION_ERROR')
            assert.match(res.error.message, /code/i)
          }
          assert.equal(mockClient.calls.length, 0)
        })

        // 3. Rejection of unsupported discount types
        await runTest('3. Rejects unsupported discount types without calling DB', async () => {
          const mockClient = createMockSupabaseClient(() => {
            throw new Error('Should not hit database')
          })

          for (const badType of ['bogo', 'amount', 'percentage', '', null, undefined]) {
            const res = await adminSaveCoupon(
              { code: 'BADTYPE', discount_type: badType, discount_value: 10 },
              mockClient,
              true
            )
            assert.equal(res.data, null)
            assert.equal(res.error.code, 'VALIDATION_ERROR')
          }
          assert.equal(mockClient.calls.length, 0)
        })

        // 4. Percentage values above 100
        await runTest('4. Rejects percentage discount values above 100 and accepts 100', async () => {
          const mockClient = createMockSupabaseClient(ctx => ({
            data: { id: VALID_UUID_2, ...ctx.insertPayload[0] },
            error: null,
          }))

          const over100 = await adminSaveCoupon(
            { code: 'OVER100', discount_type: 'percent', discount_value: 100.01 },
            mockClient,
            true
          )
          assert.equal(over100.data, null)
          assert.equal(over100.error.code, 'VALIDATION_ERROR')
          assert.equal(mockClient.calls.length, 0)

          const exact100 = await adminSaveCoupon(
            { code: 'FREE100', discount_type: 'percent', discount_value: 100 },
            mockClient,
            true
          )
          assert.equal(exact100.error, null)
          assert.equal(exact100.data.discount_value, 100)
        })

        // 5. Zero or negative discount values
        await runTest('5. Rejects zero, negative, empty, and non-numeric discount values', async () => {
          const mockClient = createMockSupabaseClient(() => {
            throw new Error('Should not hit database')
          })

          for (const badVal of [0, -1, -50, '', null, NaN, 'abc']) {
            for (const type of ['percent', 'fixed']) {
              const res = await adminSaveCoupon(
                { code: 'BADVAL', discount_type: type, discount_value: badVal },
                mockClient,
                true
              )
              assert.equal(res.data, null)
              assert.equal(res.error.code, 'VALIDATION_ERROR')
            }
          }
          assert.equal(mockClient.calls.length, 0)
        })

        // 6. Negative minimum order value
        await runTest('6. Rejects negative min_order_value and accepts 0 or empty string', async () => {
          const neg = validateCouponPayload({
            code: 'MINNEG',
            discount_type: 'fixed',
            discount_value: 100,
            min_order_value: -1,
          })
          assert.equal(neg.valid, false)

          const zero = validateCouponPayload({
            code: 'MINZERO',
            discount_type: 'fixed',
            discount_value: 100,
            min_order_value: 0,
          })
          assert.equal(zero.valid, true)
          assert.equal(zero.payload.min_order_value, 0)

          const blank = validateCouponPayload({
            code: 'MINBLANK',
            discount_type: 'fixed',
            discount_value: 100,
            min_order_value: '',
          })
          assert.equal(blank.valid, true)
          assert.equal(blank.payload.min_order_value, 0)
        })

        // 7. Invalid max_uses
        await runTest('7. Rejects invalid max_uses (0, negative, decimal, non-numeric)', async () => {
          for (const badUses of [0, -10, 5.5, 'ten', NaN]) {
            const res = validateCouponPayload({
              code: 'BADUSES',
              discount_type: 'percent',
              discount_value: 10,
              max_uses: badUses,
            })
            assert.equal(res.valid, false, `Expected ${badUses} to be rejected`)
          }
        })

        // 8. Valid max_uses: null (and blank)
        await runTest('8. Accepts max_uses: null and positive integers', async () => {
          const nullUses = validateCouponPayload({
            code: 'UNLIMITED',
            discount_type: 'percent',
            discount_value: 10,
            max_uses: null,
          })
          assert.equal(nullUses.valid, true)
          assert.equal(nullUses.payload.max_uses, null)

          const intUses = validateCouponPayload({
            code: 'LIMITED50',
            discount_type: 'percent',
            discount_value: 10,
            max_uses: '50',
          })
          assert.equal(intUses.valid, true)
          assert.equal(intUses.payload.max_uses, 50)
        })

        // 9. Valid and null expires_at
        await runTest('9. Normalizes valid expires_at to ISO, allows null, and rejects invalid dates', async () => {
          const nullExp = validateCouponPayload({
            code: 'NOEXP',
            discount_type: 'fixed',
            discount_value: 200,
            expires_at: null,
          })
          assert.equal(nullExp.valid, true)
          assert.equal(nullExp.payload.expires_at, null)

          const validExp = validateCouponPayload({
            code: 'WITHEXP',
            discount_type: 'fixed',
            discount_value: 200,
            expires_at: '2027-01-15T18:30:00.000Z',
          })
          assert.equal(validExp.valid, true)
          assert.equal(validExp.payload.expires_at, '2027-01-15T18:30:00.000Z')

          const badExp = validateCouponPayload({
            code: 'BADEXP',
            discount_type: 'fixed',
            discount_value: 200,
            expires_at: 'not-a-valid-date',
          })
          assert.equal(badExp.valid, false)
        })

        // 10. Duplicate code error (23505) mapping
        await runTest('10. Maps PostgreSQL 23505 duplicate error clearly and skips LocalStorage', async () => {
          const mockClient = createMockSupabaseClient(() => ({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint "coupons_code_key"' },
          }))

          const { data, error } = await adminSaveCoupon(
            { code: 'SHOPKART10', discount_type: 'percent', discount_value: 10 },
            mockClient,
            true
          )
          assert.equal(data, null)
          assert.equal(error.code, '23505')
          assert.match(error.message, /SHOPKART10/i)
          assert.match(error.message, /already exists/i)
          assert.equal(globalThis.localStorage.getItem(ADMIN_COUPONS_STORAGE), null)
        })

        // 11. Supabase empty result returns an empty list
        await runTest('11. Supabase empty coupons table returns [] without falling back or seeding LocalStorage', async () => {
          const mockClient = createMockSupabaseClient(() => ({
            data: [],
            error: null,
          }))

          const { data, error } = await adminFetchCoupons(mockClient, true)
          assert.equal(error, null)
          assert.deepEqual(data, [])
          assert.equal(globalThis.localStorage.getItem(ADMIN_COUPONS_STORAGE), null)
        })

        // 12. Supabase errors do not fall back to LocalStorage
        await runTest('12. Supabase errors on fetch, save, toggle, delete never fall back to LocalStorage', async () => {
          globalThis.localStorage.setItem(
            ADMIN_COUPONS_STORAGE,
            JSON.stringify([{ id: 'c1', code: 'DEMO10', discount_type: 'percent', discount_value: 10, is_active: true }])
          )

          const errClient = createMockSupabaseClient(() => ({
            data: null,
            error: { code: '42501', message: 'new row violates row-level security policy' },
          }))

          const fetchRes = await adminFetchCoupons(errClient, true)
          assert.deepEqual(fetchRes.data, [])
          assert.equal(fetchRes.error.code, '42501')

          const saveRes = await adminSaveCoupon(
            { code: 'RLSFAIL', discount_type: 'percent', discount_value: 15 },
            errClient,
            true
          )
          assert.equal(saveRes.data, null)
          assert.equal(saveRes.error.code, '42501')

          const toggleRes = await adminToggleCouponActive(VALID_UUID_1, true, errClient, true)
          assert.equal(toggleRes.success, false)
          assert.equal(toggleRes.error.code, '42501')

          const deleteRes = await adminDeleteCoupon(VALID_UUID_1, errClient, true)
          assert.equal(deleteRes.success, false)
          assert.equal(deleteRes.error.code, '42501')

          const stored = JSON.parse(globalThis.localStorage.getItem(ADMIN_COUPONS_STORAGE))
          assert.equal(stored.length, 1)
          assert.equal(stored[0].id, 'c1')
        })

        // 13. Insert omits synthetic IDs (and non-schema fields like max_discount / used_count)
        await runTest('13. Insert omits synthetic IDs and non-schema fields', async () => {
          const mockClient = createMockSupabaseClient(ctx => ({
            data: { id: VALID_UUID_2, ...ctx.insertPayload[0], used_count: 0 },
            error: null,
          }))

          await adminSaveCoupon(
            {
              id: 'c-1790000000000',
              code: 'NEWLAUNCH15',
              discount_type: 'percent',
              discount_value: 15,
              min_order_value: 1000,
              max_uses: 250,
              used_count: 99,
              max_discount: 500,
              is_active: true,
            },
            mockClient,
            true
          )

          const call = mockClient.calls[0]
          assert.equal(call.op, 'insert')
          assert.equal(Object.hasOwn(call.insertPayload[0], 'id'), false)
          assert.equal(Object.hasOwn(call.insertPayload[0], 'used_count'), false)
          assert.equal(Object.hasOwn(call.insertPayload[0], 'max_discount'), false)
          assert.deepEqual(Object.keys(call.insertPayload[0]).sort(), [
            'code',
            'discount_type',
            'discount_value',
            'expires_at',
            'is_active',
            'max_uses',
            'min_order_value',
          ])
        })

        // 14. Update targets the actual coupon UUID
        await runTest('14. Update targets exact PostgreSQL UUID without sending id in update body', async () => {
          const mockClient = createMockSupabaseClient(ctx => ({
            data: { id: VALID_UUID_1, ...ctx.updatePayload, used_count: 5 },
            error: null,
          }))

          const { data, error } = await adminSaveCoupon(
            {
              id: VALID_UUID_1,
              code: 'SHOPKART15',
              discount_type: 'percent',
              discount_value: 15,
              min_order_value: 999,
              max_uses: 500,
              is_active: false,
            },
            mockClient,
            true
          )

          assert.equal(error, null)
          assert.equal(data.id, VALID_UUID_1)
          const call = mockClient.calls[0]
          assert.equal(call.op, 'update')
          assert.deepEqual(call.filters, [{ col: 'id', val: VALID_UUID_1 }])
          assert.equal(Object.hasOwn(call.updatePayload, 'id'), false)
          assert.equal(call.updatePayload.code, 'SHOPKART15')
          assert.equal(call.updatePayload.is_active, false)
        })

        // 15. Deletion returned-row verification (1 row vs 0 rows vs DB error vs demo mode) & toggle
        await runTest('15. Service deletion requires returned deleted row, handles 0-row/errors, preserves demo deletion', async () => {
          // 15a: Toggle + Delete returning 1 row succeeds
          const successClient = createMockSupabaseClient(ctx => {
            if (ctx.op === 'update') {
              return { data: { id: VALID_UUID_1, is_active: ctx.updatePayload.is_active }, error: null }
            }
            if (ctx.op === 'delete') {
              return { data: { id: VALID_UUID_1 }, error: null }
            }
            return { data: null, error: null }
          })

          const toggleRes = await adminToggleCouponActive(VALID_UUID_1, true, successClient, true)
          assert.equal(toggleRes.success, true)
          assert.equal(toggleRes.data.is_active, false)
          assert.equal(successClient.calls[0].op, 'update')
          assert.deepEqual(successClient.calls[0].filters, [{ col: 'id', val: VALID_UUID_1 }])

          const delOk = await adminDeleteCoupon(VALID_UUID_1, successClient, true)
          assert.equal(delOk.success, true)
          assert.equal(delOk.error, null)
          assert.equal(successClient.calls[1].op, 'delete')
          assert.equal(successClient.calls[1].selectCols, 'id')
          assert.equal(successClient.calls[1].singleMode, true)
          assert.deepEqual(successClient.calls[1].filters, [{ col: 'id', val: VALID_UUID_1 }])

          // 15b: Zero rows returned via PostgREST PGRST116 must fail cleanly
          const pgrst116Client = createMockSupabaseClient(() => ({
            data: null,
            error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' },
          }))
          const delZeroPgrst = await adminDeleteCoupon(VALID_UUID_1, pgrst116Client, true)
          assert.equal(delZeroPgrst.success, false)
          assert.ok(delZeroPgrst.error?.message)

          // 15c: Zero rows returned even with null error must fail cleanly (no false success)
          const silentZeroClient = createMockSupabaseClient(() => ({
            data: null,
            error: null,
          }))
          const delZeroSilent = await adminDeleteCoupon(VALID_UUID_1, silentZeroClient, true)
          assert.equal(delZeroSilent.success, false)
          assert.match(delZeroSilent.error.message, /0 database rows|not found|permission denied/i)

          const emptyArrayZeroClient = createMockSupabaseClient(() => ({
            data: [],
            error: null,
          }))
          const delZeroArr = await adminDeleteCoupon(VALID_UUID_1, emptyArrayZeroClient, true)
          assert.equal(delZeroArr.success, false)

          // Synthetic non-UUID blocked before reaching Supabase
          const badToggle = await adminToggleCouponActive('c1', true, successClient, true)
          assert.equal(badToggle.success, false)
          const badDel = await adminDeleteCoupon('c-123', successClient, true)
          assert.equal(badDel.success, false)
          assert.equal(successClient.calls.length, 2)

          // 15d: Demo mode deletion continues to remove target coupon from LocalStorage
          globalThis.localStorage.setItem(
            ADMIN_COUPONS_STORAGE,
            JSON.stringify([
              { id: 'c1', code: 'SHOPKART10', discount_type: 'percent', discount_value: 10, is_active: true },
              { id: 'c2', code: 'WELCOME500', discount_type: 'fixed', discount_value: 500, is_active: true },
            ])
          )
          const demoDel = await adminDeleteCoupon('c1', null, false)
          assert.equal(demoDel.success, true)
          assert.equal(demoDel.error, null)
          const remaining = JSON.parse(globalThis.localStorage.getItem(ADMIN_COUPONS_STORAGE))
          assert.equal(remaining.length, 1)
          assert.equal(remaining[0].id, 'c2')
        })

        // 16. Status helper check
        await runTest('16. Computed status badges (Active, Inactive, Expired, Limit Reached)', async () => {
          const now = new Date('2026-11-12T00:00:00.000Z')
          assert.equal(getCouponStatus({ is_active: false, expires_at: null, max_uses: null, used_count: 0 }, now), 'Inactive')
          assert.equal(getCouponStatus({ is_active: true, expires_at: '2026-11-11T23:59:59.000Z', max_uses: null, used_count: 0 }, now), 'Expired')
          assert.equal(getCouponStatus({ is_active: true, expires_at: '2026-12-01T00:00:00.000Z', max_uses: 10, used_count: 10 }, now), 'Limit Reached')
          assert.equal(getCouponStatus({ is_active: true, expires_at: '2026-12-01T00:00:00.000Z', max_uses: 10, used_count: 9 }, now), 'Active')
        })

        // =========================================================================
        // REAL COMPONENT BEHAVIORAL SUITE FOR AdminCouponsPage.jsx (via Vite SSR)
        // =========================================================================
        const VIRTUAL_SUPABASE_ID = path.resolve(process.cwd(), 'src/lib/supabase.js')

        const testMockBridge = {
          supabase: null,
          isSupabaseConfigured: true,
        }
        globalThis.__PHASE5_B1_SUPABASE_BRIDGE__ = testMockBridge

        const viteServer = await createServer({
          server: { middlewareMode: true },
          appType: 'custom',
          optimizeDeps: { noDiscovery: true },
          plugins: [
            {
              name: 'phase5-b1-supabase-bridge',
              enforce: 'pre',
              resolveId(source, importer) {
                if (source === '../lib/supabase.js' || source === '../../lib/supabase' || source === '../lib/supabase') {
                  return VIRTUAL_SUPABASE_ID
                }
                if (importer && path.resolve(path.dirname(importer), source) === VIRTUAL_SUPABASE_ID) {
                  return VIRTUAL_SUPABASE_ID
                }
                return null
              },
              load(id) {
                if (path.resolve(id) === VIRTUAL_SUPABASE_ID || id.endsWith('/src/lib/supabase.js')) {
                  return `
                    export const isSupabaseConfigured = true
                    export const supabase = new Proxy({}, {
                      get(_, prop) {
                        const target = globalThis.__PHASE5_B1_SUPABASE_BRIDGE__?.supabase
                        if (!target) return undefined
                        const val = target[prop]
                        return typeof val === 'function' ? val.bind(target) : val
                      }
                    })
                  `
                }
                return null
              },
            },
          ],
        })

        function findElements(node, predicate, out = []) {
          if (!node || typeof node !== 'object') return out
          if (Array.isArray(node)) {
            for (const child of node) findElements(child, predicate, out)
            return out
          }
          if (React.isValidElement(node)) {
            if (predicate(node)) out.push(node)
            if (node.props?.children !== undefined) {
              findElements(node.props.children, predicate, out)
            }
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
          const INTERNALS = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
          const hookValues = []
          const effects = []
          let hookIndex = 0
          let vnode = null
          let unmounted = false

          const dispatcher = {
            useState(initial) {
              const idx = hookIndex++
              if (!(idx in hookValues)) {
                hookValues[idx] = typeof initial === 'function' ? initial() : initial
              }
              const setter = next => {
                const computed = typeof next === 'function' ? next(hookValues[idx]) : next
                if (!Object.is(computed, hookValues[idx])) {
                  hookValues[idx] = computed
                  if (!unmounted) render()
                }
              }
              return [hookValues[idx], setter]
            },
            useRef(initial) {
              const idx = hookIndex++
              if (!(idx in hookValues)) {
                hookValues[idx] = { current: initial }
              }
              return hookValues[idx]
            },
            useEffect(create, deps) {
              const idx = hookIndex++
              const prev = hookValues[idx]
              const changed =
                !prev ||
                !deps ||
                !prev.deps ||
                deps.length !== prev.deps.length ||
                deps.some((d, i) => !Object.is(d, prev.deps[i]))
              if (changed) {
                effects.push({ idx, create, deps })
              }
              hookValues[idx] = { deps, cleanup: prev?.cleanup }
            },
            useCallback(fn) {
              const idx = hookIndex++
              hookValues[idx] = fn
              return fn
            },
            useMemo(fn) {
              const idx = hookIndex++
              hookValues[idx] = fn()
              return hookValues[idx]
            },
            useContext(ctx) {
              return ctx._currentValue
            },
          }

          function render() {
            const prevDispatcher = INTERNALS.H
            hookIndex = 0
            INTERNALS.H = dispatcher
            try {
              vnode = Component()
            } finally {
              INTERNALS.H = prevDispatcher
            }
            while (effects.length > 0) {
              const eff = effects.shift()
              if (typeof hookValues[eff.idx]?.cleanup === 'function') {
                hookValues[eff.idx].cleanup()
              }
              const cleanup = eff.create()
              hookValues[eff.idx].cleanup = cleanup
            }
            return vnode
          }

          render()

          return {
            get tree() {
              return vnode
            },
            html() {
              return renderToStaticMarkup(vnode)
            },
            findButton(labelOrText) {
              return findElements(
                vnode,
                el =>
                  el.type === 'button' &&
                  (el.props?.['aria-label'] === labelOrText || getTextContent(el).trim().includes(labelOrText))
              )
            },
            async flush(ticks = 6) {
              for (let i = 0; i < ticks; i++) {
                await new Promise(resolve => setTimeout(resolve, 0))
              }
            },
            unmount() {
              unmounted = true
              for (const entry of hookValues) {
                if (entry && typeof entry.cleanup === 'function') entry.cleanup()
              }
            },
          }
        }

        try {
          const { default: AdminCouponsPage } = await viteServer.ssrLoadModule('/src/pages/admin/AdminCouponsPage.jsx')

          // 17. UI Empty State: shown cleanly when fetch succeeds with 0 coupons
          await runTest('17. AdminCouponsPage: successful fetch with zero coupons displays empty state (no error state)', async () => {
            testMockBridge.supabase = createMockSupabaseClient(() => ({ data: [], error: null }))
            const app = createReactMountHarness(AdminCouponsPage)
            await app.flush()

            const html = app.html()
            assert.match(html, /No coupons configured/)
            assert.doesNotMatch(html, /Failed to load coupons/)
            app.unmount()
          })

          // 18. UI Failed Fetch -> Error State (NEVER Empty State), Retry -> Loading -> Duplicate Fetch Prevention -> Recovery
          await runTest('18. AdminCouponsPage: failed fetch shows Error State (not Empty State), Retry shows Loading & blocks duplicate fetches', async () => {
            let phase = 'fail'
            let resolveDeferredFetch = null
            let fetchCalls = 0

            testMockBridge.supabase = createMockSupabaseClient(() => {
              fetchCalls++
              if (phase === 'fail') {
                return { data: null, error: { code: '42501', message: 'permission denied for table coupons' } }
              }
              if (phase === 'pending') {
                return new Promise(resolve => {
                  resolveDeferredFetch = resolve
                })
              }
              return { data: [], error: null }
            })

            const app = createReactMountHarness(AdminCouponsPage)
            await app.flush()

            const errHtml = app.html()
            assert.match(errHtml, /Failed to load coupons/)
            assert.match(errHtml, /permission denied for table coupons/)
            assert.doesNotMatch(errHtml, /No coupons configured/)

            // Switch fetch to deferred pending and trigger Retry
            phase = 'pending'
            const retryButtons = app.findButton('Retry')
            assert.equal(retryButtons.length, 1, 'Expected Retry button in error state')
            retryButtons[0].props.onClick()

            // While pending, loading state must appear and concurrent Retry/Refresh clicks must NOT trigger duplicate fetches
            const loadingHtml = app.html()
            assert.match(loadingHtml, /Loading promotional coupons/)
            assert.doesNotMatch(loadingHtml, /No coupons configured/)

            const refreshButtons = app.findButton('Refresh')
            assert.equal(refreshButtons.length, 1)
            assert.equal(refreshButtons[0].props.disabled, true)
            refreshButtons[0].props.onClick()
            retryButtons[0].props.onClick()

            await app.flush()
            // Call 1 was initial mount fail; Call 2 was Retry; concurrent Refresh/Retry added 0 extra calls
            assert.equal(fetchCalls, 2)

            // Complete Retry with genuine empty DB list -> should now display Empty State cleanly
            resolveDeferredFetch({ data: [], error: null })
            await app.flush()

            const recoveredHtml = app.html()
            assert.match(recoveredHtml, /No coupons configured/)
            assert.doesNotMatch(recoveredHtml, /Failed to load coupons/)
            app.unmount()
          })

          // 19. UI Failed Deletion (0-row & DB error) does NOT remove coupon or show success
          await runTest('19. AdminCouponsPage: failed deletion (0 rows or error) keeps coupon in UI, shows error, shows no success', async () => {
            const sampleCoupon = {
              id: VALID_UUID_1,
              code: 'SHOPKART10',
              discount_type: 'percent',
              discount_value: 10,
              min_order_value: 999,
              max_uses: 500,
              used_count: 3,
              expires_at: null,
              is_active: true,
            }

            let deleteBehavior = 'zero-rows'
            testMockBridge.supabase = createMockSupabaseClient(ctx => {
              if (ctx.op === 'select') {
                return { data: [sampleCoupon], error: null }
              }
              if (ctx.op === 'delete') {
                if (deleteBehavior === 'zero-rows') {
                  return { data: null, error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' } }
                }
                if (deleteBehavior === 'db-error') {
                  return { data: null, error: { code: '42501', message: 'RLS delete rejected' } }
                }
                return { data: { id: VALID_UUID_1 }, error: null }
              }
              return { data: null, error: null }
            })

            const app = createReactMountHarness(AdminCouponsPage)
            await app.flush()
            assert.match(app.html(), /SHOPKART10/)

            // Open delete confirmation dialog
            const trashBtn = app.findButton('Delete coupon SHOPKART10')
            assert.equal(trashBtn.length, 1)
            trashBtn[0].props.onClick()
            assert.match(app.html(), /ON DELETE SET NULL/)

            // Case A: 0 rows deleted -> coupon stays, error shown, NO success banner
            app.findButton('Delete Permanently')[0].props.onClick()
            await app.flush()
            const zeroRowHtml = app.html()
            assert.match(zeroRowHtml, /SHOPKART10/)
            assert.match(zeroRowHtml, /not found or permission denied/i)
            assert.doesNotMatch(zeroRowHtml, /deleted permanently/i)

            // Case B: Explicit Supabase error -> coupon still stays, error shown, NO success banner
            deleteBehavior = 'db-error'
            app.findButton('Delete Permanently')[0].props.onClick()
            await app.flush()
            const dbErrHtml = app.html()
            assert.match(dbErrHtml, /SHOPKART10/)
            assert.match(dbErrHtml, /RLS delete rejected/)
            assert.doesNotMatch(dbErrHtml, /deleted permanently/i)

            // Case C: Successful 1-row delete -> removes coupon and displays success message
            deleteBehavior = 'success'
            app.findButton('Delete Permanently')[0].props.onClick()
            await app.flush()
            const deletedHtml = app.html()
            assert.match(deletedHtml, /deleted permanently/i)
            assert.match(deletedHtml, /No coupons configured/)

            app.unmount()
          })
        } finally {
          delete globalThis.__PHASE5_B1_SUPABASE_BRIDGE__
          await viteServer.close()
        }

        console.log(`\nSummary: ${passed} passed, ${failed} failed (total ${passed + failed})`)
        if (failed > 0) process.exit(1)
