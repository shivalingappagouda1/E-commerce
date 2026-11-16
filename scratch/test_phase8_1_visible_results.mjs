import assert from 'node:assert'
import fs from 'node:fs'

console.log('Testing database/tests/phase8_1_visible_results.sql architecture and semantics...')

const sql = fs.readFileSync('database/tests/phase8_1_visible_results.sql', 'utf8')

// 1. Transaction-boundary check: Must NOT wrap the whole script in BEGIN ... ROLLBACK
assert.ok(!sql.match(/^BEGIN;/m), 'Script must NOT have a top-level BEGIN wrapping results insertion')
assert.ok(!sql.match(/^ROLLBACK;/m), 'Script must NOT have a top-level ROLLBACK wiping out results insertion')
console.log('✔ Confirmed: Top-level BEGIN/ROLLBACK removed so result rows are not destroyed')

// 2. Temp table creation and truncation before DO block
const createPos = sql.indexOf('CREATE TEMP TABLE IF NOT EXISTS phase8_1_visible_test_results')
const truncatePos = sql.indexOf('TRUNCATE TABLE phase8_1_visible_test_results;')
const doPos = sql.indexOf('\nDO $$')
assert.ok(createPos !== -1, 'Creates session temporary table using IF NOT EXISTS')
assert.ok(truncatePos !== -1, 'Truncates session temporary table to clear stale data')
assert.ok(doPos !== -1, 'Contains DO block')
assert.ok(createPos < truncatePos, 'Creation happens before TRUNCATE')
assert.ok(truncatePos < doPos, 'Truncation happens before DO block')
console.log('✔ Confirmed: Clean session temp table creation (IF NOT EXISTS) + TRUNCATE before DO block')

// 3. Subtransaction rollback proof
assert.ok(sql.includes("RAISE EXCEPTION 'PHASE8_1_ROLLBACK_FIXTURES';"), 'Contains intentional subtransaction rollback exception')
assert.ok(sql.includes("WHEN OTHERS THEN"), 'Contains exception handler catching the rollback')
assert.ok(sql.includes("SQLERRM = 'PHASE8_1_ROLLBACK_FIXTURES'"), 'Checks for intentional fixture rollback exception')
const rollbackRaisePos = sql.indexOf("RAISE EXCEPTION 'PHASE8_1_ROLLBACK_FIXTURES';")
const insertResultsPos = sql.indexOf('INSERT INTO phase8_1_visible_test_results (test_number, scenario, result) VALUES')
assert.ok(rollbackRaisePos < insertResultsPos, 'Fixture rollback happens BEFORE result rows are inserted into temp table')
console.log('✔ Confirmed: Fixture subtransaction rollback happens strictly BEFORE result rows are inserted')

// 4. Table definition with exact required columns
assert.ok(sql.includes('test_number INT'), 'Includes test_number column')
assert.ok(sql.includes('scenario TEXT'), 'Includes scenario column')
assert.ok(sql.includes('result TEXT'), 'Includes result column')

// 5. Verifies all 8 scenarios are inserted
for (let i = 1; i <= 8; i++) {
  assert.ok(sql.includes(`(${i}, v_scen${i}, v_res${i})`), `Scenario ${i} is inserted into visible results table`)
}
console.log('✔ Confirmed: All 8 scenarios recorded into visible results table')

// 6. Exact assertion preservation
assert.ok(sql.includes('v_current_stock <> v_initial_stock + 2'), 'Scenario 1 asserts pending stock restoration')
assert.ok(sql.includes('v_current_stock <> v_initial_stock + 3'), 'Scenario 2 asserts processing stock restoration')
assert.ok(sql.includes('v_current_stock <> v_initial_stock'), 'Scenario 3 asserts shipped non-restoration')
assert.ok(sql.includes('cancel_order(v_order_delivered_c1_id)'), 'Scenario 4 asserts customer cancel_order on delivered')
assert.ok(sql.includes("Cannot cancel an order that has already been delivered"), 'Scenario 4 asserts specific delivered rejection message')
assert.ok(sql.includes("SET status = 'cancelled'\n      WHERE id = v_order_pending_id"), 'Scenario 5 asserts repeated cancellation')
assert.ok(sql.includes("SET status = 'pending'\n        WHERE id = v_order_pending_id"), 'Scenario 6 asserts reopen rejection')
assert.ok(sql.includes("Cancelled orders cannot be reopened or transitioned to"), 'Scenario 6 asserts specific reopen rejection message')
assert.ok(sql.includes('cancel_order(v_order_c1_pending2_id)'), 'Scenario 7 asserts ownership rejection')
assert.ok(sql.includes("Access denied: You can only cancel your own orders"), 'Scenario 7 asserts specific unauthorized customer rejection message')
assert.ok(sql.includes("has_function_privilege('anon', 'public.restore_inventory_on_cancellation()', 'execute')"), 'Scenario 8 checks anon privilege')
assert.ok(sql.includes("has_function_privilege('authenticated', 'public.restore_inventory_on_cancellation()', 'execute')"), 'Scenario 8 checks authenticated privilege')
assert.ok(sql.includes('acl.grantee = 0'), 'Scenario 8 checks PUBLIC grantee 0')
assert.ok(sql.includes('aclexplode(p.proacl)'), 'Scenario 8 uses aclexplode')
assert.ok(sql.includes("tgname = 'trg_restore_inventory_on_cancel'"), 'Scenario 8 verifies trigger attachment')
assert.ok(sql.includes('v_tgfoid <> v_fn_oid'), 'Scenario 8 verifies trigger function OID')
assert.ok(sql.includes("v_tgenabled NOT IN ('O', 'A')"), 'Scenario 8 verifies trigger is enabled')
console.log('✔ Confirmed: All assertions and specific error matchers preserved without weakening')

// 7. Final SELECT statement
const selectPos = sql.lastIndexOf('SELECT \n  test_number,\n  scenario,\n  result\nFROM phase8_1_visible_test_results\nORDER BY test_number;')
assert.ok(selectPos !== -1, 'Final SELECT statement exists')
assert.ok(doPos < selectPos, 'DO block finishes before final SELECT')
assert.ok(sql.trim().endsWith('ORDER BY test_number;'), 'Script terminates with the final SELECT query')
console.log('✔ Confirmed: Final statement is the visible results SELECT')

console.log('\nAll phase8_1_visible_results.sql checks passed successfully!')
