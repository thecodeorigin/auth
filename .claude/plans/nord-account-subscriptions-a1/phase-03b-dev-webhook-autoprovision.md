# Phase 03b — Dev-only auto-provisioning of the Polar webhook (solves the ngrok ↔ webhook chicken-egg)

The problem: the ngrok tunnel only exists once `pnpm dev` runs, but the Polar
webhook (and its signing secret) can only be created against a live URL — and the
secret then has to reach `runtimeConfig.polarWebhookSecret` before verification.

## Three facts that make this clean (verified in node_modules)

1. **`serverAuth()` rebuilds `betterAuth()` per request** (`@onmax/nuxt-better-auth`
   `dist/runtime/server/utils/auth.js`): it calls our `defineServerAuth` factory
   every call, and the `_authCache` is **bypassed whenever a `database` is present**
   (always true — NuxtHub D1). So `webhooks({ secret: runtimeConfig.polarWebhookSecret })`
   reads the secret **fresh on every request** → mutating `runtimeConfig.polarWebhookSecret`
   at runtime is honored immediately. **No singleton race, no warm-up needed.**
2. **Polar SDK `@polar-sh/sdk@0.48.1`**: `WebhookEndpointCreate` accepts only
   `{ url, name?, format, events, organizationId? }` — **no caller-supplied secret**,
   so read-back is required. `createWebhookEndpoint()` returns `WebhookEndpoint`
   **with `.secret`**. Also available: `listWebhookEndpoints`,
   `deleteWebhookEndpoint({ id })`, `resetWebhookEndpointSecret({ id })`.
   `format` enum = `'raw' | 'discord' | 'slack'` → use **`'raw'`** (standardwebhooks,
   what `@polar-sh/better-auth` `validateEvent` expects).
3. **`@nuxtjs/ngrok` v4 exposes no URL** (connects in a Nuxt `listen` hook, logs
   the URL, discards the listener). So don't try to read the live URL — make it
   deterministic.

## Decision: **Design B — own the tunnel** (chosen: no paid ngrok / no fixed domain)

The user is on **free ngrok with a rotating `*.ngrok-free.app` URL each run**, so
we don't try to make the URL deterministic — we read it from `@ngrok/ngrok`'s
`listener.url()` and reconcile Polar to the current URL on every boot. The
rotating URL is a non-issue because reconcile-on-boot deletes the prior run's
dead endpoint and creates one for the new URL. Combined with fact #1 (auth
rebuilds per request), setting `runtimeConfig.polarWebhookSecret` at init is
honored for the actual webhook POST.

> **Design A (static domain)** is documented at the end as a simpler alternative
> *if* a fixed domain ever becomes available (ngrok's free tier does include one
> static domain at dashboard.ngrok.com/domains — but Design B needs nothing paid
> and nothing reserved).

### Build steps (Design B)

**1. Dependencies / module wiring.** `@ngrok/ngrok` is currently only a
*transitive* dep of `@nuxtjs/ngrok`; under pnpm's strict layout our own code
**cannot import a transitive dep**, so add it directly, and stop the module's
auto-connect so we don't open two tunnels:
```bash
pnpm add @ngrok/ngrok
pnpm remove @nuxtjs/ngrok    # optional; or just drop it from modules below
```
`nuxt.config.ts`:
```ts
modules: [
  // …remove '@nuxtjs/ngrok'…
],
// the module used to set this; replicate so Vite's dev-server host check lets the
// ngrok host (and Polar's webhook POST Host header) through:
vite: {
  optimizeDeps: { include: ['@casl/ability', '@casl/vue'] },
  server: { allowedHosts: ['.ngrok-free.app'] },
},
```
> Without `allowedHosts`, Vite returns "Blocked request. This host is not
> allowed" for the ngrok Host header and the webhook never reaches Nitro.
> Keep the `ngrok` runtimeConfig block (authtoken) — the plugin reads it.

**2. `server/utils/polar-dev.ts`** — the reconciler (see Step 3b.2 below;
identical for both designs).

**3. `server/plugins/polar.dev.ts`** — the Design-B plugin (see the
"Design B — own the tunnel" section below; it is the primary file, not a
fallback, for this project).

### Step 3b.1 — config: claim + set the static ngrok domain  *(Design A only — SKIP for this project)*

```bash
# one-time: reserve your free static domain at https://dashboard.ngrok.com/domains
# e.g. apt-civil-mallard.ngrok-free.app
```
`nuxt.config.ts` → extend the existing `ngrok` block:
```ts
ngrok: {
  authtoken: process.env.NUXT_NGROK_AUTHTOKEN,
  domain: process.env.NUXT_NGROK_DOMAIN, // static reserved domain (dev only)
},
```
`.env`:
```bash
NUXT_NGROK_DOMAIN=your-reserved-domain.ngrok-free.app
```
> The module already mirrors `runtimeConfig.ngrok` and adds the domain to
> `vite.server.allowedHosts`, so the tunnel comes up on that fixed host.

### Step 3b.2 — `server/utils/polar-dev.ts` (reconciler)

```ts
import { Polar } from '@polar-sh/sdk'

const MANAGED_NAME = 'auth-hub dev (auto)' // tag so we only ever touch OUR endpoints
const WEBHOOK_PATH = '/api/auth/polar/webhooks'
const EVENTS = [
  'subscription.created', 'subscription.updated', 'subscription.active',
  'subscription.canceled', 'subscription.uncanceled', 'subscription.revoked',
  'subscription.past_due', 'order.paid',
] as const

/**
 * Reconcile the Polar (sandbox) webhook for the current dev URL and return a
 * usable signing secret. Idempotent across restarts:
 *   - deletes our stale managed endpoints (old ngrok URLs)
 *   - if an endpoint already targets this URL → reset its secret (recovers one)
 *   - else create it
 * Polar does not require the URL to be live at call time.
 */
export async function ensureDevPolarWebhook(accessToken: string, publicBaseUrl: string): Promise<string> {
  const polar = new Polar({ accessToken, server: 'sandbox' })
  const url = `${publicBaseUrl.replace(/\/$/, '')}${WEBHOOK_PATH}`

  // List all endpoints (handle pagination defensively across SDK shapes).
  const all: Array<{ id: string, url: string, name?: string | null }> = []
  const pager: any = await polar.webhooks.listWebhookEndpoints({})
  for await (const page of pager) {
    const items = page?.result?.items ?? page?.items ?? []
    for (const e of items) all.push(e)
  }

  const ours = all.filter(e => e.name === MANAGED_NAME)
  const match = ours.find(e => e.url === url)

  // Clean stale managed endpoints (previous runs' URLs) — never deletes non-managed ones.
  for (const e of ours) {
    if (e.id !== match?.id)
      await polar.webhooks.deleteWebhookEndpoint({ id: e.id }).catch(() => {})
  }

  if (match) {
    const reset = await polar.webhooks.resetWebhookEndpointSecret({ id: match.id })
    return reset.secret
  }
  const created = await polar.webhooks.createWebhookEndpoint({
    url,
    name: MANAGED_NAME,
    format: 'raw',
    events: EVENTS as unknown as string[] as never, // SDK WebhookEventType enum
    // organizationId: <orgId>  // ONLY if polarAccessToken is a personal (non-org) token
  })
  return created.secret
}
```

> Cook: confirm the `listWebhookEndpoints` iteration shape against the SDK
> (`PageIterator`); the defensive `page?.result?.items ?? page?.items` covers both.
> If `polarAccessToken` is a **personal** token (not an Organization Access
> Token), `createWebhookEndpoint` needs `organizationId` — add it from
> `runtimeConfig.polarOrganizationId`.

### Step 3b.3 — `server/plugins/polar.dev.ts`  *(Design A variant — SKIP for this project; use the Design B plugin below)*

```ts
export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return
  const rc = useRuntimeConfig()
  if (!rc.polarAccessToken)
    return // offline dev: skip silently (everything else still works)

  const domain = (rc.ngrok as { domain?: string } | undefined)?.domain
  if (!domain) {
    console.warn('[polar] set NUXT_NGROK_DOMAIN (static ngrok domain) to auto-provision the dev webhook — skipping')
    return
  }
  try {
    const secret = await ensureDevPolarWebhook(rc.polarAccessToken, `https://${domain}`)
    rc.polarWebhookSecret = secret // honored per-request (auth rebuilds each request)
    console.log(`[polar] dev webhook ready → https://${domain}/api/auth/polar/webhooks`)
  }
  catch (error) {
    console.error('[polar] dev webhook auto-provision failed', error)
  }
})
```

That's the whole solution for Design A. `rc.polarWebhookSecret` is set at Nitro
init (before the first request); fact #1 means even later mutations would be
honored. The webhook URL is stable, so the endpoint isn't recreated each
restart — only its secret is rotated (a no-op cost in dev).

### Auto-cleanup
- **On boot:** stale managed endpoints (different URLs) are deleted by the
  reconciler — so changing domains never leaves orphans.
- **You don't need to delete on shutdown.** If you still want eager teardown,
  add (Design A doesn't own the tunnel, so only the endpoint):
  ```ts
  // inside the plugin, after success:
  // import type { NitroApp } from 'nitropack'
  // (Design A) optional: nitroApp.hooks.hook('close', () => polar.webhooks.deleteWebhookEndpoint({ id }))
  ```
  Reconcile-on-boot already makes shutdown cleanup optional.

---

## Design B — own the tunnel (dynamic URL, no static domain)

Use when you can't reserve a static domain. Trade-off: stop using
`@nuxtjs/ngrok`'s auto-connect (else two tunnels) and drive `@ngrok/ngrok`
directly so you hold `listener.url()`.

1. `nuxt.config.ts`: **remove `'@nuxtjs/ngrok'` from `modules`**; add
   `vite: { server: { allowedHosts: ['.ngrok-free.app'] } }` (the module used to
   set this). Add `@ngrok/ngrok` to `dependencies` (already transitive).
2. `server/plugins/polar.dev.ts`:
```ts
export default defineNitroPlugin(async (nitroApp) => {
  if (!import.meta.dev)
    return
  const rc = useRuntimeConfig()
  if (!rc.polarAccessToken)
    return
  const { connect } = await import('@ngrok/ngrok')
  const port = Number(process.env.NITRO_PORT || process.env.PORT || 3000)
  const listener = await connect({
    addr: port,
    authtoken: (rc.ngrok as { authtoken?: string })?.authtoken || process.env.NUXT_NGROK_AUTHTOKEN,
  })
  const publicUrl = listener.url()!
  try {
    rc.polarWebhookSecret = await ensureDevPolarWebhook(rc.polarAccessToken, publicUrl)
    rc.public.siteUrl ||= publicUrl // align baseURL + OAuth callbacks with the tunnel
    console.log('[polar] tunnel + webhook ready →', `${publicUrl}/api/auth/polar/webhooks`)
  }
  catch (error) {
    console.error('[polar] dev webhook auto-provision failed', error)
  }
  nitroApp.hooks.hook('close', async () => {
    await listener.close().catch(() => {})
  })
})
```
> `connect({ addr: port })` at init is fine even though the server isn't listening
> yet — ngrok forwards once it comes up moments later. Reconcile-on-boot cleans
> the prior run's now-dead URL each time, so random URLs never accumulate.

## How Phase 03 changes

In `phase-03-polar.md` Step 3.2, the `webhooks({ secret: runtimeConfig.polarWebhookSecret })`
line is unchanged — in **dev** the secret is filled by this plugin; in **prod**
it comes from `NUXT_POLAR_WEBHOOK_SECRET` (a manually-created production endpoint).
Drop the `.env` `NUXT_POLAR_WEBHOOK_SECRET` for dev (auto-provisioned); keep it
for prod.

## Verify

```bash
# .env has NUXT_POLAR_ACCESS_TOKEN + NUXT_NGROK_AUTHTOKEN (+ NUXT_NGROK_DOMAIN for Design A)
pnpm dev
#  → console: "[polar] dev webhook ready → https://<domain>/api/auth/polar/webhooks"
#  → Polar sandbox dashboard shows ONE endpoint named "auth-hub dev (auto)"
# Complete a sandbox checkout → a `subscription` row appears (source='polar').
# Re-deliver the same event from Polar → no duplicate (Phase 02 UNIQUE + staleness guard).
# Restart pnpm dev → still ONE managed endpoint (secret rotated, no orphan).
```
