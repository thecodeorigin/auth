# Phase 05 — Seed fixture + verification proof

**Deliverables:**
1. `server/tasks/seed/authz-fixtures.ts` — also write abilities (role `viewer`) on NordVPN via
   the single writer `clientUpdate` (exercises the R1 re-pin path).
2. `examples/abilities-proof.mjs` — userinfo resolution proof + leak checks.

Depends on Phases 02–04. Per the `data` skill, the only non-route write goes through the
existing task → service (`clientUpdate`), never ad-hoc SQL.

---

## Step 5.1 — Edit `server/tasks/seed/authz-fixtures.ts`

The fixture already resolves `adapter` and the NordVPN client and grants alice (role `viewer`)
exact access to NordVPN. Add an abilities write **under the `viewer` role key** (which is what
`claimsResolve` returns for the NordVPN→alice flow), so the proof can read it back from
userinfo. Insert after the `accessSet(...)` call (line ~50), before `return`:

```ts
    // Phase-5: app-role abilities on NordVPN for role `viewer`. Goes through clientUpdate
    // (the single writer) — this also re-pins metadata.clientId, so authz-proof.mjs doubles
    // as the regression guard that id_token scoping survived the metadata write.
    await clientUpdate(adapter, nordvpn.clientId, {
      abilities: {
        viewer: [
          { action: 'view', subject: 'Post' },
          { action: 'manage', subject: 'Post', conditions: { authorId: '${user.id}' } },
        ],
      },
    })
```

Add the import at the top of the file:

```ts
import { clientUpdate } from '../../services/client'
```

> `clientUpdate`'s other auto-imported deps are unaffected. If the task file relies on
> auto-imports for services (check the existing `accessSet`/`accessClearMember` usage — they
> appear unimported, so Nitro auto-imports `server/services/*`), then the explicit import may be
> unnecessary; match whatever pattern `accessSet` uses in this file. **cook: confirm by how
> `accessSet` is referenced here** — it is used without an import, so likely just call
> `clientUpdate(...)` directly with no new import line. Use the same style.

Also extend the returned object so the proof can locate the client deterministically:

```ts
    return {
      result: 'ok',
      aliceId: alice.id,
      orgB: org.id,
      personalOrg: `org-u-${alice.id}`,
      nordvpnClientId: nordvpn.clientId,
      abilitiesRole: 'viewer', // ← new
    }
```

## Step 5.2 — Create `examples/abilities-proof.mjs`

Mirrors `authz-proof.mjs`'s sign-in + PKCE token flow, then calls the OIDC **userinfo**
endpoint (discovered from `.well-known/openid-configuration`) and asserts the resolved
`abilities` claim. Local-only (writes the fixture); reads `.clients.json` from `seed:idp`.

```js
// Abilities proof: an app's per-role CASL rules are emitted into userinfo, with ${user.id}
// substituted to the caller's sub, and nothing else leaks. Fixture (seed:authz-fixtures):
// NordVPN defines abilities under role `viewer`; alice resolves to `viewer` for NordVPN.
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const IDP = process.env.IDP || 'http://localhost:3000/api/auth'
const ORIGIN = new URL(IDP).origin
const EMAIL = process.env.EMAIL || 'alice@seed.local'
const PASSWORD = process.env.PASSWORD || 'Passw0rd!'

const ALL = JSON.parse(readFileSync(new URL('./.clients.json', import.meta.url), 'utf8'))
const byName = name => ALL.find(c => c.name === name)
const toClient = c => ({ id: c.clientId, secret: c.clientSecret ?? null, redirect: c.redirectUris[0], public: Boolean(c.public) })
const nordvpn = toClient(byName('NordVPN'))
if (!nordvpn)
  throw new Error('NordVPN not found in .clients.json — run seed:idp first')

const b64url = b => b.toString('base64url')
const setCookie = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

const si = await fetch(`${IDP}/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'origin': ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!si.ok)
  throw new Error(`sign-in failed: ${si.status} ${await si.text()}`)
const cookie = setCookie(si)

if (!ORIGIN.includes('localhost'))
  throw new Error('abilities-proof writes a fixture — run against local only')
const fxRes = await fetch(`${ORIGIN}/_nitro/tasks/seed:authz-fixtures`, { method: 'POST' })
const fxJson = await fxRes.json().catch(() => ({}))
const fx = fxJson && typeof fxJson.result === 'object' ? fxJson.result : fxJson
if (!fx.aliceId)
  throw new Error(`fixture task did not return ids: ${JSON.stringify(fxJson)}`)

// PKCE authorize → token (capture BOTH id_token and access_token).
async function tokensFor(c) {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const url = new URL(`${IDP}/oauth2/authorize`)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: c.id,
    redirect_uri: c.redirect,
    scope: 'openid profile email',
    state: b64url(crypto.randomBytes(8)),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()
  const ares = await fetch(url, { headers: { cookie, origin: ORIGIN }, redirect: 'manual' })
  let loc = ares.headers.get('location')
  if (!loc)
    loc = (await ares.clone().json().catch(() => ({})))?.url
  if (!loc || loc.includes('/sign-in'))
    throw new Error(`no authorize redirect for ${c.id}: ${ares.status}`)
  const code = new URL(loc).searchParams.get('code')

  const headers = { 'content-type': 'application/x-www-form-urlencoded' }
  const body = { grant_type: 'authorization_code', code, redirect_uri: c.redirect, code_verifier: verifier }
  if (c.public)
    body.client_id = c.id
  else headers.authorization = `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`
  const tres = await fetch(`${IDP}/oauth2/token`, { method: 'POST', headers, body: new URLSearchParams(body).toString() })
  if (!tres.ok)
    throw new Error(`token exchange failed for ${c.id}: ${tres.status} ${await tres.text()}`)
  return tres.json()
}

// Discover the userinfo endpoint (don't hardcode the path).
const discovery = await (await fetch(`${ORIGIN}/api/auth/.well-known/openid-configuration`)).json().catch(() => ({}))
const userinfoUrl = discovery.userinfo_endpoint || `${IDP}/oauth2/userinfo`

const { access_token } = await tokensFor(nordvpn)
const uiRes = await fetch(userinfoUrl, { headers: { authorization: `Bearer ${access_token}` } })
if (!uiRes.ok)
  throw new Error(`userinfo failed: ${uiRes.status} ${await uiRes.text()}`)
const ui = await uiRes.json()

let failures = 0
function assert(label, cond) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`)
  if (!cond)
    failures++
}

console.log(`NordVPN userinfo → sub=${ui.sub} roles=${ui.roles}`)
console.log(`  abilities=${JSON.stringify(ui.abilities)}`)

const abilities = Array.isArray(ui.abilities) ? ui.abilities : []
const view = abilities.find(a => a.action === 'view' && a.subject === 'Post')
const manage = abilities.find(a => a.action === 'manage' && a.subject === 'Post')

assert('abilities is a non-empty array', abilities.length >= 2)
assert('view Post present (no conditions)', !!view && !view.conditions)
assert('manage Post present with conditions', !!manage && !!manage.conditions)
assert('self placeholder substituted to sub', !!manage && manage.conditions.authorId === ui.sub)
assert('no literal ${…} leaked', !JSON.stringify(abilities).includes('${'))
assert('no foreign user.* leaked (authorId === sub only)', !!manage && manage.conditions.authorId === ui.sub && Object.keys(manage.conditions).length === 1)

if (failures) {
  console.error(`\n❌ ABILITIES FAIL: ${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log('\n✅ ABILITIES PROVEN: per-role CASL rules emitted to userinfo with ${user.id} → sub; no leaks.')
```

> **cook:** verify the discovery path. The IdP mounts better-auth under `/api/auth`, and
> nuxt-security excludes `/api/auth/**` from CSP, so `…/api/auth/.well-known/openid-configuration`
> is the likely discovery URL — confirm against the running server and adjust `userinfoUrl`
> fallback if needed. The proof is robust to the path via discovery.

## Step 5.3 — Full verification run (the plan's oracle)

```bash
pnpm lint                                                  # 0
pnpm exec nuxi typecheck                                   # 0
pnpm dev                                                   # restart (auth/schema regen + rewire DB binding)
curl -X POST http://localhost:3000/_nitro/tasks/seed:idp
node examples/authz-proof.mjs                              # green ⇒ clientId survived the abilities write (R1)
node examples/abilities-proof.mjs                          # green ⇒ userinfo abilities resolve + no leaks
```

## Acceptance

- `seed:authz-fixtures` writes abilities and still returns its ids (now incl. `abilitiesRole`).
- `authz-proof.mjs` stays green (regression guard for `metadata.clientId`).
- `abilities-proof.mjs` passes all 6 assertions.
