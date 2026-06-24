// Billing/seat API proof: the account subscription, billing, and family-seat
// routes behave correctly and are owner-scoped. Uses the dev agent endpoint for
// auth (NUXT_SANDBOX_MODE=true). Idempotent: adds a unique seat then removes it.
import { agentLogin } from './agent-proof.mjs'

const ORIGIN = process.env.IDP_ORIGIN || 'http://localhost:3000'

let failures = 0
function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? '✓' : '✗'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ` — EXPECTED ${JSON.stringify(expected)}`}`)
  if (!ok)
    failures++
}
const G = (path, cookie) => fetch(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : {})
const J = (path, cookie) => G(path, cookie).then(r => r.json())
const POST = (path, cookie, body) => fetch(`${ORIGIN}${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const DEL = (path, cookie) => fetch(`${ORIGIN}${path}`, { method: 'DELETE', headers: { cookie } })

const alice = await agentLogin('member')
const admin = await agentLogin('admin')
const aliceId = (await J('/api/auth/get-session', alice.cookie)).user.id
const adminId = (await J('/api/auth/get-session', admin.cookie)).user.id
const aliceFam = `sub-seed-${aliceId}-nordpass-family`
const adminFam = `sub-seed-${adminId}-nordpass-family`

// --- subscription + billing reads ---
const subs = await J('/api/account/subscriptions', alice.cookie)
assert('alice owns 5 subscriptions', Array.isArray(subs) && subs.length, 5)
const fam = subs.find(s => s.planSlug === 'nordpass-family')
assert('nordpass-family seats capacity', fam?.seats, 6)
const cfg = await J('/api/billing/config', alice.cookie)
assert('billing config has polarConfigured flag', typeof cfg.polarConfigured, 'boolean')
const prods = await J('/api/billing/products', alice.cookie)
assert('billing products shape', typeof prods.products, 'object')

// --- members: list / add (fill-or-grow, seeded → no charge) / remove ---
const before = await J(`/api/account/family/${aliceFam}/members`, alice.cookie)
assert('family roster >= 6', Array.isArray(before) && before.length >= 6, true)

const email = `seat-proof-${Date.now()}@example.com`
const addRes = await POST(`/api/account/family/${aliceFam}/members`, alice.cookie, { email })
const addBody = await addRes.json().catch(() => ({}))
assert('add seat status 200', addRes.status, 200)
assert('seeded add is not charged', addBody.charged, false)
const afterAdd = await J(`/api/account/family/${aliceFam}/members`, alice.cookie)
assert('roster grew by 1', afterAdd.length, before.length + 1)

const added = afterAdd.find(m => m.email === email)
if (!added) {
  console.error('❌ BILLING FAIL: added seat not found in roster')
  process.exit(1)
}
const delRes = await DEL(`/api/account/family/${aliceFam}/members/${added.id}`, alice.cookie)
assert('remove seat status 200', delRes.status, 200)
const afterDel = await J(`/api/account/family/${aliceFam}/members`, alice.cookie)
assert('roster back to original', afterDel.length, before.length)

// --- negatives: authn / IDOR / validation / duplicate ---
assert('anon subscriptions → 401', (await G('/api/account/subscriptions')).status, 401)
assert('IDOR: alice → admin family → 403', (await POST(`/api/account/family/${adminFam}/members`, alice.cookie, { email: 'x@y.com' })).status, 403)
assert('bad email → 400', (await POST(`/api/account/family/${aliceFam}/members`, alice.cookie, { email: 'not-an-email' })).status, 400)
assert('duplicate (owner) → 409', (await POST(`/api/account/family/${aliceFam}/members`, alice.cookie, { email: 'alice@seed.local' })).status, 409)

if (failures) {
  console.error(`\n❌ BILLING FAIL: ${failures} assertion(s).`)
  process.exit(1)
}
console.log('\n✅ BILLING PROVEN: subscription/billing/seat routes work; owner-scoped (401/403); validated (400/409); seat add/remove idempotent.')
