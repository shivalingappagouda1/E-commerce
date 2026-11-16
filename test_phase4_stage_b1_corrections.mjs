/**
 * ShopKart Phase 4 Stage B1 Final Correction Verification Suite
 *
 * Properly async-aware runner that strictly separates:
 *  - [MODULE BEHAVIOR] : Direct execution of real exported production helpers
 *  - [STATIC CHECK]    : Component wiring & contract assertions on React source files
 *  - [SIMULATION]      : State-machine & concurrency simulations where React DOM is not mounted
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'

import {
  resolveScopedProfile,
  resolveIsAdmin,
  shouldAcceptProfileResponse,
  shouldAcceptBootstrapSession,
  hasRecoveryAmrClaim,
  isValidRecoverySession,
  validateResetPassword,
  mapSafeAuthError,
} from './src/utils/authHelpers.js'

import {
  LEGACY_COUPON_STORAGE_KEY,
  getCouponStorageKey,
  getIdentityOwnerKey,
  sanitizeCouponMetadata,
  readScopedCoupon,
  resolveActiveCoupon,
  calculateCouponDiscount,
} from './src/utils/couponHelpers.js'

const ROOT = process.cwd()

const stats = {
  MODULE_BEHAVIOR: { passed: 0, failed: 0 },
  STATIC_CHECK: { passed: 0, failed: 0 },
  SIMULATION: { passed: 0, failed: 0 },
}

async function runTest(category, name, fn) {
  const labelMap = {
    MODULE_BEHAVIOR: 'MODULE BEHAVIOR',
    STATIC_CHECK: 'STATIC CHECK',
    SIMULATION: 'SIMULATION',
  }
  const tag = labelMap[category] || category
  try {
    await fn()
    console.log(`[PASS] [${tag}] ${name}`)
    stats[category].passed++
  } catch (err) {
    console.error(`[FAIL] [${tag}] ${name}`)
    console.error(`       Error: ${err?.stack || err?.message || err}`)
    stats[category].failed++
  }
}

function createFakeJwt(payloadObj) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url')
  return `${header}.${payload}.fakesig`
}

async function main() {
  console.log('==================================================================')
  console.log('SHOPKART PHASE 4 STAGE B1 FINAL CORRECTION VERIFICATION SUITE')
  console.log('==================================================================\n')

  // ──────────────────────────────────────────────────────────────────
  // SUITE 1: AuthContext & Identity Transition Safety (Correction A)
  // ──────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: Correction A (AuthContext & Identity Safety) ---')

  await runTest(
    'MODULE_BEHAVIOR',
    'resolveScopedProfile & resolveIsAdmin immediately clear stale User A admin rights when user switches to User B (before User B profile loads)',
    async () => {
      const userA = { id: 'user-a-uuid' }
      const userB = { id: 'user-b-uuid' }
      const adminProfileA = { id: 'user-a-uuid', role: 'admin', full_name: 'Admin Alice' }

      // During User A session: valid
      let state = { ownerId: 'user-a-uuid', data: adminProfileA }
      let activeProfile = resolveScopedProfile(userA, state)
      assert.strictEqual(activeProfile?.id, 'user-a-uuid')
      assert.strictEqual(resolveIsAdmin(userA, activeProfile), true)

      // Exact render tick where `user` switches to User B, BEFORE useEffect/fetchProfile updates `profileState`
      activeProfile = resolveScopedProfile(userB, state)
      assert.strictEqual(activeProfile, null, 'User A profile must NEVER be returned during User B render')
      assert.strictEqual(resolveIsAdmin(userB, activeProfile), false, 'Admin privilege must drop to false synchronously')

      // Even if a buggy profile object leaked user A id while ownerId matched userB, still blocked
      const mismatchedState = { ownerId: 'user-b-uuid', data: adminProfileA }
      assert.strictEqual(resolveScopedProfile(userB, mismatchedState), null)
      assert.strictEqual(resolveIsAdmin(userB, adminProfileA), false)

      // When user becomes guest (null) during state cleanup
      assert.strictEqual(resolveScopedProfile(null, state), null)
      assert.strictEqual(resolveIsAdmin(null, adminProfileA), false)
    }
  )

  await runTest(
    'MODULE_BEHAVIOR',
    'resolveScopedProfile preserves valid profile during same-user token refresh',
    async () => {
      const userA = { id: 'user-a-uuid' }
      const refreshedUserA = { id: 'user-a-uuid', updated_at: '2026-11-11T00:00:00Z' }
      const state = { ownerId: 'user-a-uuid', data: { id: 'user-a-uuid', role: 'admin', full_name: 'Admin Alice' } }

      const activeProfile = resolveScopedProfile(refreshedUserA, state)
      assert.strictEqual(activeProfile?.full_name, 'Admin Alice')
      assert.strictEqual(resolveIsAdmin(userA, activeProfile), true)
    }
  )

  await runTest(
    'MODULE_BEHAVIOR',
    'shouldAcceptProfileResponse & shouldAcceptBootstrapSession prevent slow responses and late bootstrap overwrite',
    async () => {
      // Slow response for User A (seq 1) arriving when latest seq is 2 and active user is B
      assert.strictEqual(shouldAcceptProfileResponse(1, 2, 'user-b', 'user-a'), false)
      // Response for User A arriving after logout (activeUserId = null)
      assert.strictEqual(shouldAcceptProfileResponse(1, 2, null, 'user-a'), false)
      // Current response for User B
      assert.strictEqual(shouldAcceptProfileResponse(2, 2, 'user-b', 'user-b'), true)

      // Bootstrap getSession() seq 1 invalidated by onAuthStateChange or signOut incrementing seq to 2
      assert.strictEqual(shouldAcceptBootstrapSession(1, 2), false)
      assert.strictEqual(shouldAcceptBootstrapSession(1, 1), true)
    }
  )

  await runTest(
    'STATIC_CHECK',
    'AuthContext.jsx integrates render-time profile guards, bootstrap rejection handling, recoveryMode tracking, and safe signOut',
    async () => {
      const file = fs.readFileSync(path.join(ROOT, 'src/context/AuthContext.jsx'), 'utf8')
      assert.ok(file.includes('resolveScopedProfile(user, profileState)'), 'Must resolve profile synchronously during render')
      assert.ok(file.includes('resolveIsAdmin(user, safeProfile)'), 'Must compute isAdmin from scoped profile')
      assert.ok(file.includes('authEventSeqRef'), 'Must track authEventSeqRef for bootstrap race safety')
      assert.ok(file.includes('shouldAcceptBootstrapSession('), 'Must gate bootstrap session state with sequence guard')
      assert.ok(file.includes('.catch(') && file.includes('.finally('), 'getSession promise must have catch and finally')
      assert.ok(file.includes("event === 'PASSWORD_RECOVERY'"), 'AuthContext must capture PASSWORD_RECOVERY')
      assert.ok(file.includes('recoveryMode'), 'AuthContext must expose recoveryMode')
      assert.ok(file.includes('previousId !== currentId'), 'AuthContext must distinguish same-user refresh from identity change')
      assert.ok(
        file.includes('return { error }') && file.includes('return { error: err }'),
        'signOut must surface errors cleanly rather than swallowing them'
      )
    }
  )

  await runTest(
    'SIMULATION',
    'AuthContext concurrency simulation: slow bootstrap getSession() resolves after signIn/signOut and is discarded; getSession() rejection settles loading=false',
    async () => {
      let authSeq = 0
      let profileSeq = 0
      let activeUserId = null
      let stateUser = null
      let profileState = { ownerId: null, data: null }
      let loading = true

      const delay = (ms) => new Promise((r) => setTimeout(r, ms))

      async function simulateBootstrap(getSessionPromise) {
        const bSeq = ++authSeq
        try {
          const { data, error } = await getSessionPromise
          if (!shouldAcceptBootstrapSession(bSeq, authSeq)) return
          if (error) {
            activeUserId = null
            stateUser = null
            profileState = { ownerId: null, data: null }
            return
          }
          const uid = data?.session?.user?.id ?? null
          activeUserId = uid
          stateUser = data?.session?.user ?? null
          profileState = { ownerId: uid, data: null }
        } catch {
          if (!shouldAcceptBootstrapSession(bSeq, authSeq)) return
          activeUserId = null
          stateUser = null
          profileState = { ownerId: null, data: null }
        } finally {
          loading = false
        }
      }

      // Case 1: Bootstrap hangs 50ms while User signs in then signs out within 20ms
      const bootstrapTask = simulateBootstrap(
        delay(50).then(() => ({ data: { session: { user: { id: 'stale-user' } } }, error: null }))
      )

      await delay(10)
      // Sign in as User B arrives earlier via onAuthStateChange
      authSeq++
      activeUserId = 'user-b'
      stateUser = { id: 'user-b' }
      profileState = { ownerId: 'user-b', data: { id: 'user-b', role: 'customer' } }

      await delay(10)
      // User B signs out before delayed bootstrap resolves
      authSeq++
      profileSeq++
      activeUserId = null
      stateUser = null
      profileState = { ownerId: null, data: null }

      await bootstrapTask
      assert.strictEqual(activeUserId, null, 'activeUserId ref must remain null after signOut')
      assert.strictEqual(stateUser, null, 'Late bootstrap must NOT resurrect stale-user after newer signOut')
      assert.strictEqual(profileState.data, null)
      assert.strictEqual(loading, false)

      // Case 2: Bootstrap getSession rejects completely
      loading = true
      await simulateBootstrap(Promise.reject(new Error('Network offline')))
      assert.strictEqual(loading, false, 'loading must resolve to false even when getSession rejects')
      assert.strictEqual(activeUserId, null)
      assert.strictEqual(stateUser, null)

      // Unused var assert guard
      assert.strictEqual(profileSeq, 1)
    }
  )

  // ──────────────────────────────────────────────────────────────────
  // SUITE 2: Account-Isolated Coupons & Render Guard (Correction B)
  // ──────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: Correction B (STF-04 Coupon Isolation) ---')

  await runTest(
    'MODULE_BEHAVIOR',
    'couponHelpers lifecycle: guest -> User A -> User B -> render-time transition -> corrupted storage -> authLoading guard -> discount calculation',
    async () => {
      const store = new Map()
      const storage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      }

      assert.strictEqual(LEGACY_COUPON_STORAGE_KEY, 'shopkart_applied_coupon')
      assert.strictEqual(getCouponStorageKey(null), 'shopkart_applied_coupon_guest')
      assert.strictEqual(getCouponStorageKey('uid-A'), 'shopkart_applied_coupon_uid-A')
      assert.strictEqual(getIdentityOwnerKey(null), 'guest')
      assert.strictEqual(getIdentityOwnerKey('uid-A'), 'uid-A')

      // While authLoading is true, no coupon may ever be exposed
      const userAState = {
        ownerId: 'uid-A',
        coupon: sanitizeCouponMetadata({ code: ' save20 ', type: 'percent', value: 20, min_order_value: 500 }),
      }
      assert.strictEqual(userAState.coupon.code, 'SAVE20')
      assert.strictEqual(resolveActiveCoupon(userAState, 'uid-A', true), null, 'authLoading must block coupon exposure')

      // Active render for User A
      const resolvedA = resolveActiveCoupon(userAState, 'uid-A', false)
      assert.strictEqual(resolvedA?.code, 'SAVE20')
      assert.strictEqual(calculateCouponDiscount(resolvedA, 1000), 200)
      assert.strictEqual(calculateCouponDiscount(resolvedA, 300), 0, 'min_order_value must be respected')

      // Render tick immediately after User A switches to User B or guest (before useEffect reloads)
      assert.strictEqual(resolveActiveCoupon(userAState, 'uid-B', false), null, 'User B render must NEVER see User A coupon')
      assert.strictEqual(resolveActiveCoupon(userAState, null, false), null, 'Guest render must NEVER see User A coupon')

      // Persist separate coupons in storage & test corrupted JSON safety
      storage.setItem(getCouponStorageKey('uid-A'), JSON.stringify(userAState.coupon))
      storage.setItem(getCouponStorageKey('uid-B'), '{corrupt-json')
      storage.setItem(getCouponStorageKey(null), JSON.stringify({ code: 'GUEST50', type: 'fixed', value: 50 }))

      assert.strictEqual(readScopedCoupon(storage, 'uid-B'), null, 'Corrupted JSON must safely return null')
      assert.strictEqual(readScopedCoupon(storage, 'uid-A')?.code, 'SAVE20')
      assert.strictEqual(readScopedCoupon(storage, null)?.code, 'GUEST50')

      // Fixed coupon capped at cart subtotal
      const bigFixed = sanitizeCouponMetadata({ code: 'BIG500', type: 'fixed', value: 500 })
      assert.strictEqual(calculateCouponDiscount(bigFixed, 320), 320)
    }
  )

  await runTest(
    'STATIC_CHECK',
    'CartContext.jsx uses render-time resolveActiveCoupon, authLoading guard, owner-tagged couponState, and preserves B1 compatibility keys',
    async () => {
      const file = fs.readFileSync(path.join(ROOT, 'src/context/CartContext.jsx'), 'utf8')
      assert.ok(file.includes('loading: authLoading'), 'CartContext must read authLoading from useAuth')
      assert.ok(file.includes('resolveActiveCoupon(couponState, user?.id, authLoading)'), 'CartContext must apply render-time guard')
      assert.ok(file.includes('readScopedCoupon(localStorage, user?.id)'), 'CartContext must read scoped storage safely')
      assert.ok(file.includes('LEGACY_COUPON_STORAGE_KEY'), 'CartContext must purge legacy global key')
      assert.ok(file.includes('getCouponStorageKey'), 'CartContext must use/export getCouponStorageKey')
    }
  )

  // ──────────────────────────────────────────────────────────────────
  // SUITE 3: Password Recovery Access Control & Submit Safety (Correction C)
  // ──────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: Correction C (Password Reset & Forgot Password) ---')

  await runTest(
    'MODULE_BEHAVIOR',
    'isValidRecoverySession rejects normal SIGNED_IN / password sessions and accepts genuine recovery sessions only',
    async () => {
      const normalPwdJwt = createFakeJwt({ sub: 'u-1', amr: [{ method: 'password', timestamp: 1700000000 }] })
      const recoveryJwt = createFakeJwt({ sub: 'u-1', amr: [{ method: 'recovery', timestamp: 1700000000 }] })

      // Ordinary signed-in user opening /reset-password
      assert.strictEqual(
        isValidRecoverySession({
          recoveryMode: false,
          event: 'SIGNED_IN',
          session: { user: { id: 'u-1' }, access_token: normalPwdJwt },
        }),
        false,
        'Ordinary SIGNED_IN session must be rejected'
      )

      // Ordinary session on getSession() without event
      assert.strictEqual(
        isValidRecoverySession({
          recoveryMode: false,
          event: null,
          session: { user: { id: 'u-1' }, access_token: normalPwdJwt },
        }),
        false,
        'Ordinary getSession without recovery claim/event must be rejected'
      )

      // Missing session even with recoveryMode=true
      assert.strictEqual(
        isValidRecoverySession({ recoveryMode: true, event: null, session: null }),
        false,
        'Null session must be rejected'
      )

      // Valid via PASSWORD_RECOVERY event
      assert.strictEqual(
        isValidRecoverySession({
          recoveryMode: false,
          event: 'PASSWORD_RECOVERY',
          session: { user: { id: 'u-1' }, access_token: 'opaque' },
        }),
        true
      )

      // Valid via root-captured recoveryMode (lazy load timing)
      assert.strictEqual(
        isValidRecoverySession({
          recoveryMode: true,
          event: null,
          session: { user: { id: 'u-1' }, access_token: normalPwdJwt },
        }),
        true
      )

      // Valid via JWT amr recovery claim even after refresh
      assert.strictEqual(hasRecoveryAmrClaim(recoveryJwt), true)
      assert.strictEqual(hasRecoveryAmrClaim(normalPwdJwt), false)
      assert.strictEqual(hasRecoveryAmrClaim('not-a-jwt'), false)
      assert.strictEqual(
        isValidRecoverySession({
          recoveryMode: false,
          event: null,
          session: { user: { id: 'u-1' }, access_token: recoveryJwt },
        }),
        true
      )
    }
  )

  await runTest(
    'MODULE_BEHAVIOR',
    'validateResetPassword preserves whitespace exactly without trimming and mapSafeAuthError strips provider internals',
    async () => {
      // Exact password with leading & trailing spaces preserved
      const ok = validateResetPassword('  pass word  ', '  pass word  ')
      assert.strictEqual(ok.valid, true)

      // Mismatch when one has trailing space (if incorrectly trimmed, these would wrongly match!)
      const mismatch = validateResetPassword('  abcdef  ', 'abcdef')
      assert.strictEqual(mismatch.valid, false)

      // Too short (< 6 chars)
      assert.strictEqual(validateResetPassword('12345', '12345').valid, false)

      // Safe auth error mapping
      const expiredMsg = mapSafeAuthError({ message: 'AuthApiError: invalid JWT token signature expired at node_modules/...' })
      assert.ok(!expiredMsg.includes('AuthApiError') && !expiredMsg.includes('node_modules'))
      assert.ok(expiredMsg.includes('invalid or has expired'))

      const genericMsg = mapSafeAuthError({ message: 'unexpected pgsql internal trace 10.0.0.4' }, 'Fallback safe message.')
      assert.strictEqual(genericMsg, 'Fallback safe message.')
    }
  )

  await runTest(
    'STATIC_CHECK',
    'ResetPasswordPage.jsx & ForgotPasswordPage.jsx implement ref submit locks, untrimmed passwords, safe error mapping, and signOut error warning',
    async () => {
      const resetFile = fs.readFileSync(path.join(ROOT, 'src/pages/customer/ResetPasswordPage.jsx'), 'utf8')
      assert.ok(resetFile.includes('submitLockRef'), 'ResetPasswordPage must have synchronous submitLockRef')
      assert.ok(resetFile.includes('isValidRecoverySession('), 'ResetPasswordPage must use strict isValidRecoverySession')
      assert.ok(resetFile.includes('validateResetPassword(password, confirmPassword)'), 'Must validate exact passwords')
      assert.ok(resetFile.includes('password,\n      }') || resetFile.includes('updateUser({\n        password,'), 'Must submit untrimmed password')
      assert.ok(!resetFile.includes('password.trim()'), 'Must NEVER call password.trim()')
      assert.ok(resetFile.includes('mapSafeAuthError('), 'Must sanitize auth errors')
      assert.ok(resetFile.includes('signOutWarning'), 'Must surface post-reset signOut failures cleanly')
      assert.ok(
        !resetFile.includes('if (session) {\n          setHasRecoverySession(true)\n        }'),
        'Must not blindly trust any active session'
      )

      const forgotFile = fs.readFileSync(path.join(ROOT, 'src/pages/customer/ForgotPasswordPage.jsx'), 'utf8')
      assert.ok(forgotFile.includes('submitLockRef'), 'ForgotPasswordPage must have synchronous submitLockRef')
      assert.ok(!forgotFile.includes('.env.local'), 'Must not expose .env.local')
    }
  )

  await runTest(
    'SIMULATION',
    'ResetPasswordPage async submit simulation: synchronous lock blocks concurrent double-click and resets in finally; signOut error triggers warning',
    async () => {
      let lock = false
      let updateCalls = 0
      let warning = ''
      let success = false

      const delay = (ms) => new Promise((r) => setTimeout(r, ms))

      async function simulateSubmit(updateImpl, signOutImpl) {
        if (lock || success) return 'blocked'
        lock = true
        try {
          updateCalls++
          const { error } = await updateImpl()
          if (error) return 'update_error'
          success = true
          const so = await signOutImpl()
          if (so?.error) warning = 'Recovery session could not be automatically closed.'
          return 'ok'
        } finally {
          lock = false
        }
      }

      // Concurrent double-click before state commits
      const p1 = simulateSubmit(() => delay(25).then(() => ({ error: null })), () => Promise.resolve({ error: { message: 'network' } }))
      const p2 = simulateSubmit(() => delay(25).then(() => ({ error: null })), () => Promise.resolve({ error: null }))
      const [r1, r2] = await Promise.all([p1, p2])

      assert.strictEqual(updateCalls, 1, 'Synchronous ref lock must allow only 1 submission')
      assert.strictEqual(r1, 'ok')
      assert.strictEqual(r2, 'blocked')
      assert.ok(warning.length > 0, 'signOut failure must populate warning')
      assert.strictEqual(lock, false, 'Lock must reset in finally')
    }
  )

  // ──────────────────────────────────────────────────────────────────
  // SUITE 4: Review Submission Resilience & Lock (Correction D)
  // ──────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: Correction D (STF-06 Review Submission) ---')

  await runTest(
    'STATIC_CHECK',
    'ProductDetailPage.jsx implements synchronous reviewSubmitLockRef, isolated refresh catch, and error retention',
    async () => {
      const file = fs.readFileSync(path.join(ROOT, 'src/pages/customer/ProductDetailPage.jsx'), 'utf8')
      const fnStart = file.indexOf('async function handleReviewSubmit')
      const fnEnd = file.indexOf('// Multi-image list')
      assert.ok(fnStart > -1 && fnEnd > fnStart)
      const fnBody = file.substring(fnStart, fnEnd)

      assert.ok(file.includes('reviewSubmitLockRef = useRef(false)'), 'Must declare reviewSubmitLockRef')
      assert.ok(fnBody.includes('if (reviewSubmitLockRef.current || reviewSubmitting) return'), 'Must guard synchronously')
      assert.ok(fnBody.includes('reviewSubmitLockRef.current = true'), 'Must acquire lock after validation')
      assert.ok(fnBody.includes('reviewSubmitLockRef.current = false'), 'Must release lock in finally')
      assert.ok(fnBody.includes('catch (refreshErr)'), 'Must isolate review list refresh failures')
    }
  )

  await runTest(
    'SIMULATION',
    'Review submit simulation: synchronous lock prevents double-submit; rejected submit & data=null preserve inputs; isolated refresh error keeps success',
    async () => {
      let lock = false
      let calls = 0
      let modalOpen = true
      let success = false
      let errMsg = ''
      let title = 'Solid build'
      let body = 'Works reliably'

      const delay = (ms) => new Promise((r) => setTimeout(r, ms))

      async function simulateReviewSubmit(submitFn, refreshFn) {
        if (lock) return 'blocked'
        if (!title.trim() || !body.trim()) return 'invalid'
        lock = true
        try {
          calls++
          const { data, error } = await submitFn()
          if (error || !data) {
            errMsg = error?.message || 'Failed to submit review.'
            return 'failed'
          }
          success = true
          modalOpen = false
          title = ''
          body = ''
          errMsg = ''
          try {
            await refreshFn()
          } catch {
            // isolated non-fatal
          }
          return 'ok'
        } catch (err) {
          errMsg = err?.message || 'Unexpected error'
          return 'threw'
        } finally {
          lock = false
        }
      }

      // Case 1: { data: null, error: null } must NOT show success or wipe inputs
      const c1 = await simulateReviewSubmit(() => Promise.resolve({ data: null, error: null }), () => Promise.resolve())
      assert.strictEqual(c1, 'failed')
      assert.strictEqual(success, false)
      assert.strictEqual(modalOpen, true)
      assert.strictEqual(title, 'Solid build')
      assert.strictEqual(lock, false)

      // Case 2: Promise rejection resets lock and preserves inputs
      const c2 = await simulateReviewSubmit(() => Promise.reject(new Error('500 Server Error')), () => Promise.resolve())
      assert.strictEqual(c2, 'threw')
      assert.strictEqual(errMsg, '500 Server Error')
      assert.strictEqual(modalOpen, true)
      assert.strictEqual(lock, false)

      // Case 3: Rapid double click on success with failing refresh
      const pA = simulateReviewSubmit(
        () => delay(20).then(() => ({ data: { id: 'rev-1' }, error: null })),
        () => Promise.reject(new Error('Refresh timeout'))
      )
      const pB = simulateReviewSubmit(
        () => delay(20).then(() => ({ data: { id: 'rev-2' }, error: null })),
        () => Promise.resolve()
      )
      const [resA, resB] = await Promise.all([pA, pB])
      assert.strictEqual(resA, 'ok')
      assert.strictEqual(resB, 'blocked')
      assert.strictEqual(calls, 3)
      assert.strictEqual(success, true, 'Refresh error must NOT overturn verified review submission')
      assert.strictEqual(modalOpen, false)
      assert.strictEqual(title, '')
    }
  )

  // ──────────────────────────────────────────────────────────────────
  // SUITE 5: Previous B1 Baseline Regression Checks (Correction F)
  // ──────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: Correction F (STF-02, STF-03, Routes Regression) ---')

  await runTest(
    'STATIC_CHECK',
    'STF-03 curated feeds use truthful copy & guard invalid feed slugs; AppRoutes defines reset & forgot password',
    async () => {
      const cat = fs.readFileSync(path.join(ROOT, 'src/pages/customer/CategoryPage.jsx'), 'utf8')
      const home = fs.readFileSync(path.join(ROOT, 'src/pages/customer/HomePage.jsx'), 'utf8')
      const routes = fs.readFileSync(path.join(ROOT, 'src/routes/AppRoutes.jsx'), 'utf8')

      assert.ok(cat.includes("title: 'Featured Products'"))
      assert.ok(cat.includes("title: 'Top Rated & Reviewed'"))
      assert.ok(cat.includes("title: 'Tagged Picks'"))
      assert.ok(cat.includes("title: '30%+ Discounts'"))
      assert.ok(!cat.includes('flying off the shelves') && !home.includes('FlashDealsStrip'))
      assert.ok(cat.includes('isInvalidFeed ? Promise.resolve({ data: [] }) : fetchProducts()'))

      assert.ok(routes.includes('path="forgot-password"'))
      assert.ok(routes.includes('path="reset-password"'))
    }
  )

  // ──────────────────────────────────────────────────────────────────
  // Final Summary (Strict sequential async completion)
  // ──────────────────────────────────────────────────────────────────
  const totalPass = Object.values(stats).reduce((s, c) => s + c.passed, 0)
  const totalFail = Object.values(stats).reduce((s, c) => s + c.failed, 0)

  console.log('\n==================================================================')
  console.log(`MODULE BEHAVIOR TESTS : ${stats.MODULE_BEHAVIOR.passed} passed, ${stats.MODULE_BEHAVIOR.failed} failed`)
  console.log(`STATIC SOURCE CHECKS  : ${stats.STATIC_CHECK.passed} passed, ${stats.STATIC_CHECK.failed} failed`)
  console.log(`CONCURRENCY/STATE SIMS: ${stats.SIMULATION.passed} passed, ${stats.SIMULATION.failed} failed`)
  console.log(`TOTAL RESULTS         : ${totalPass} passed, ${totalFail} failed`)
  console.log('==================================================================')

  if (totalFail > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal test runner exception:', err)
  process.exit(1)
})
