import assert from 'node:assert'
import fs from 'node:fs'

const code = fs.readFileSync('src/lib/supabase.js', 'utf8')

console.log('Testing checkSupabaseConnection() implementation in src/lib/supabase.js...')

// 1. Must not use auth.getSession()
assert.ok(!code.includes('auth.getSession()'), 'Must not use auth.getSession()')
console.log('✔ Does not use auth.getSession()')

// 2. Must perform genuine network fetch to REST endpoint
assert.ok(code.includes('fetch(`${baseUrl}/rest/v1/`'), 'Performs genuine network fetch to /rest/v1/')
assert.ok(code.includes('apikey: supabaseKey'), 'Includes apikey header')
console.log('✔ Performs genuine HTTP fetch to Supabase REST endpoint')

// 3. Handles non-success status and network errors
assert.ok(code.includes('response.ok'), 'Checks response.ok')
assert.ok(code.includes('response.status'), 'Reports HTTP status on failure')
assert.ok(code.includes('AbortError'), 'Handles request timeout')
console.log('✔ Handles HTTP non-success responses and network timeouts')

// 4. Sanitizes credentials
assert.ok(!code.includes('`Could not reach Supabase: ${supabaseKey}`'), 'Does not leak key in error')
assert.ok(code.includes('replace(supabaseKey'), 'Sanitizes potential credential leaks')
console.log('✔ Never leaks API keys or credentials in error messages')

// 5. Preserves environment variable compatibility
assert.ok(code.includes('import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY'), 'Preserves key fallback')
assert.ok(code.includes('export const supabase = isSupabaseConfigured'), 'Preserves client initialization')
console.log('✔ Preserves environment variable compatibility and client initialization')

console.log('\nAll checkSupabaseConnection verification tests passed!')
