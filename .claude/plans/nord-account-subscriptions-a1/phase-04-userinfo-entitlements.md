# Phase 04 — OIDC userinfo entitlements + proof updates

Expose the user's subscription entitlement to RP apps via the **userinfo**
endpoint only (re-resolved per call). The immutable `id_token` is untouched, so
`sso-proof` / `authz-proof` id_token assertions stay valid. Add a third proof.

## Step 4.1 — merge entitlement into `customUserInfoClaims` (`server/auth.config.ts`)

Add import:
```ts
import { entitlementsResolve } from './services/entitlements'
```

Replace the userinfo hook body (lines ~92–96) with a merge:

```ts
// userinfo hook gets the validated access-token payload; azp = requesting client.
async customUserInfoClaims({ user, jwt }) {
  const clientId = (jwt as { azp?: string, client_id?: string } | undefined)?.azp
    ?? (jwt as { client_id?: string } | undefined)?.client_id ?? null
  const [claims, entitlement] = await Promise.all([
    claimsResolve(user.id, clientId),
    entitlementsResolve(user.id, clientId), // live per-call → reflects current DB
  ])
  // entitlement is null when the requesting client maps to no Nord product.
  return { ...claims, entitlement }
},
```

> The `id_token` hook (`customIdTokenClaims`) is **NOT** changed — entitlements
> must never be baked into an immutable token. RP apps that need current
> entitlement call `/api/auth/oauth2/userinfo` (or `userInfo`), which re-runs
> `entitlementsResolve` against live DB. This sidesteps the "downgrade can't
> retract a minted token" problem entirely.

### userinfo claim shape (contract for RPs)
```jsonc
{
  "sub": "…", "org": "org-b", "roles": "viewer", "personal": false,
  "entitlement": {
    "product": "nordpass",
    "plan": "nordpass-premium",
    "status": "active",
    "active": true,
    "currentPeriodEnd": 1822521600000
  }
}
```
For the NordVPN client (whose seeded sub is expired) → `entitlement.active=false`,
`status="expired"`.

## Step 4.2 — update `examples/authz-proof.mjs` for the renamed clients

The proof picks clients by name (`byName('Express RP')`, `byName('Vue SPA')`).
After the Phase 02 rename:

```js
const nordvpn = toClient(byName('NordVPN'))     // was Express RP (confidential, tier-0 grant)
const vue = toClient(byName('Nord Web'))        // was Vue SPA (public/PKCE, default-closed)
if (!nordvpn || !vue)
  throw new Error('NordVPN / Nord Web not found in .clients.json — run seed:idp first')
```
Then replace every later `express` reference with `nordvpn`, and the log/assert
labels `'Express RP …'` → `'NordVPN …'`, `'Vue SPA …'` → `'Nord Web …'`. The
fixture (`seed:authz-fixtures`, Step 2.5) now grants alice the **NordVPN** client
in Org B, so:
- `assert('NordVPN org is Org B', nordvpnClaims.org, fx.orgB)` ✓
- `assert('NordVPN roles is viewer', nordvpnClaims.roles, 'viewer')` ✓
- Nord Web → personal org (default-closed) ✓

id_token assertions are unchanged in meaning — entitlements live in userinfo, not
here.

## Step 4.3 — `examples/entitlement-proof.mjs` (new oracle)

```js
// Entitlement proof: the OIDC userinfo endpoint returns the user's LIVE subscription
// entitlement for the requesting client. NordPass client → active; NordVPN → expired.
// Reuses the seeded subscriptions (seed:subscriptions) for alice@seed.local.
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const IDP = process.env.IDP || 'http://localhost:3000/api/auth'
const ORIGIN = new URL(IDP).origin
const EMAIL = process.env.EMAIL || 'alice@seed.local'
const PASSWORD = process.env.PASSWORD || 'Passw0rd!'

const ALL = JSON.parse(readFileSync(new URL('./.clients.json', import.meta.url), 'utf8'))
const byName = n => ALL.find(c => c.name === n)
const toClient = c => ({ id: c.clientId, secret: c.clientSecret ?? null, redirect: c.redirectUris[0], public: Boolean(c.public) })
const nordpass = toClient(byName('NordPass'))
const nordvpn = toClient(byName('NordVPN'))

const b64url = b => b.toString('base64url')
const setCookie = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

const si = await fetch(`${IDP}/sign-in/email`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!si.ok) throw new Error(`sign-in failed: ${si.status}`)
const cookie = setCookie(si)

// Ensure the demo subscriptions exist (idempotent, local only).
if (ORIGIN.includes('localhost'))
  await fetch(`${ORIGIN}/_nitro/tasks/seed:subscriptions`, { method: 'POST' })

async function accessTokenFor(c) {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const url = new URL(`${IDP}/oauth2/authorize`)
  url.search = new URLSearchParams({
    response_type: 'code', client_id: c.id, redirect_uri: c.redirect,
    scope: 'openid profile email', state: b64url(crypto.randomBytes(8)),
    code_challenge: challenge, code_challenge_method: 'S256',
  }).toString()
  const ares = await fetch(url, { headers: { cookie, origin: ORIGIN }, redirect: 'manual' })
  let loc = ares.headers.get('location') || (await ares.clone().json().catch(() => ({})))?.url
  const code = new URL(loc).searchParams.get('code')
  const headers = { 'content-type': 'application/x-www-form-urlencoded' }
  const body = { grant_type: 'authorization_code', code, redirect_uri: c.redirect, code_verifier: verifier }
  if (c.public) body.client_id = c.id
  else headers.authorization = `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`
  const tres = await fetch(`${IDP}/oauth2/token`, { method: 'POST', headers, body: new URLSearchParams(body).toString() })
  if (!tres.ok) throw new Error(`token failed for ${c.id}: ${tres.status} ${await tres.text()}`)
  return JSON.parse(await tres.text()).access_token
}

async function userinfo(token) {
  const res = await fetch(`${IDP}/oauth2/userinfo`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`userinfo failed: ${res.status} ${await res.text()}`)
  return res.json()
}

let failures = 0
const assert = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? '✓' : '✗'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ` — EXPECTED ${JSON.stringify(expected)}`}`)
  if (!ok) failures++
}

const npInfo = await userinfo(await accessTokenFor(nordpass))
console.log(`NordPass userinfo.entitlement → ${JSON.stringify(npInfo.entitlement)}`)
assert('NordPass entitlement product', npInfo.entitlement?.product, 'nordpass')
assert('NordPass entitlement active', npInfo.entitlement?.active, true)

const nvInfo = await userinfo(await accessTokenFor(nordvpn))
console.log(`NordVPN userinfo.entitlement → ${JSON.stringify(nvInfo.entitlement)}`)
assert('NordVPN entitlement product', nvInfo.entitlement?.product, 'nordvpn')
assert('NordVPN entitlement active (expired sub)', nvInfo.entitlement?.active, false)

if (failures) { console.error(`\n❌ ENTITLEMENT FAIL: ${failures} assertion(s).`); process.exit(1) }
console.log('\n✅ ENTITLEMENT PROVEN: userinfo carries live per-client subscription entitlement.')
```

> Confirm the userinfo path. The oauth-provider plugin typically serves
> `/api/auth/oauth2/userinfo`. If it differs, fix the URL (check the plugin
> routes / OpenAPI reference). The NordPass seeded sub is **premium/active**;
> NordVPN is **expired** — so the two assertions exercise both branches of
> `isActive`.

## Verify (Phase 04 done)

```bash
pnpm exec nuxi typecheck            # 0
node examples/sso-proof.mjs         # green (unchanged behavior, renamed clients)
node examples/authz-proof.mjs       # green (NordVPN tier-0; userinfo entitlements don't affect id_token)
node examples/entitlement-proof.mjs # green (NordPass active, NordVPN expired)
```
