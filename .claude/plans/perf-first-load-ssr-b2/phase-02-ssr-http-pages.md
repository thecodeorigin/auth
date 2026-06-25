# Phase 2 — Rate-limiter IP fix, then SSR the `$http`-backed home

This phase has a **hard gate**: the IP-forwarding fix and its verification MUST
land before any `server: false` is removed. Skipping the gate ships a production
outage (failure-mode critic's #1 landmine).

## Why the gate exists

On Cloudflare Workers, when a page SSRs and `$http` calls `/api/...`, that's a new
HTTP subrequest **originating from the Worker**. `ofetch.ts` currently forwards
only the `cookie` header (`ofetch.ts:38-41`). nuxt-security's rate limiter keys on
the request IP (from `x-forwarded-for` / `cf-connecting-ip`). The subrequest has
**no** client IP header → every SSR-rendered user's API calls land in **one shared
bucket** (150 tokens / 5 min, `throwError: true`) → mass `429/500` under any real
traffic. Today this never happens because these fetches are `server: false`
(browser-originated, real client IP).

## Step 2.1 — Forward the client IP (and SSR-safe 401) in `$http`

**File:** `app/lib/ofetch.ts` — extend the SSR branch of `onRequest` and make the
401 handler SSR-safe.

Replace the server-side header block (currently lines 38–41):

```ts
    if (import.meta.server) {
      // Forward cookie (for session) AND the real client IP, so same-origin SSR
      // subrequests are rate-limited against the *client's* bucket, not a single
      // shared Worker-egress bucket. Without this, SSR self-fetch 429s everyone.
      const headers = useRequestHeaders([
        'cookie',
        'cf-connecting-ip',
        'x-forwarded-for',
        'x-real-ip',
      ])
      options.headers = { ...options.headers, ...headers } as typeof options.headers
    }
```

And make the 401 handler not assume a browser (currently lines 51–63). On SSR we
must not call `navigateTo` from inside a fetch error handler; let the rejection
propagate so the page's `useAsyncData` can fall back to its `default`:

```ts
  onResponseError(error) {
    if (!error.options.silent && import.meta.client) {
      useLoadingIndicator().finish({ error: true })
    }

    // Client-only bounce to /sign-in on 401. On SSR we let the error propagate;
    // auth.global already gates unauthenticated users before render, so an SSR
    // 401 is an edge case (cookie expired mid-request) handled by useAsyncData's
    // default + the page's existing empty state — never a 500.
    if (error?.response?.status === 401 && import.meta.client) {
      const path = useRoute().fullPath
      if (!path.startsWith('/sign-in')) {
        navigateTo(`/sign-in?redirect=${encodeURIComponent(path)}&reason=session_expired`)
      }
    }
  },
```

## Step 2.2 — VERIFY rate-limiter keying (the gate)

Do **not** proceed to 2.3 until this passes. nuxt-security's rate limiter reads
the IP via h3's `getRequestIP(event, { xForwardedFor: true })`; the forwarded
`x-forwarded-for` / `cf-connecting-ip` must produce a per-client key.

Against `pnpm preview` (and ideally a Workers preview / deployed canary, since the
bucket only matters with the R2 driver in `$production`):

1. Temporarily SSR one `$http` page (you can do 2.3's `index.vue` change behind a
   quick local toggle) and hard-reload it ~10× rapidly from **one** browser.
   - Expect: normal renders, **no** `429`. (10 SSR loads << 150 tokens for one IP.)
2. From a **second** device / different IP (or `curl` with a spoofed
   `X-Forwarded-For` against the *dev* build where the lruCache driver is used),
   confirm it gets an **independent** budget — exhausting one IP's bucket does not
   throttle the other.
3. If keying is wrong (one bucket for all), **stop**: either fix the forwarded
   header name nuxt-security expects, or exempt the specific internal routes from
   the limiter via `routeRules` before removing `server: false`. Record the
   outcome in this file.

> Dev note: in `$development` the limiter uses `lruCache` with localhost
> whitelisted (`nuxt.config.ts:127-132`), so local `pnpm dev` won't reproduce the
> bucket collision — that's exactly why this must be checked against the prod
> driver, not dev.

## Step 2.3 — SSR the home subscriptions

Only after 2.2 passes. The home page is backed by `/api/account/subscriptions`
(`requireUserSession` → server-resolved session), so once the cookie + IP are
forwarded it SSRs cleanly and ships data in the payload.

**File:** `app/pages/index.vue` — drop `server: false` (currently lines 8–11):

```ts
// Backed by a cookie-resolving custom Nitro route; with ofetch forwarding the
// session cookie on SSR, this fetches during render and ships in the payload —
// no client round-trip for subscriptions on cold load.
const { data: subs } = await useAsyncData('home-subscriptions', () => subsApi.list(), {
  default: () => [] as SubscriptionRow[],
})
```

> **Scope note:** the other `server: false` occurrences
> (`products/[slug].vue`, `orgs/[slug]/settings.vue`, `orgs/[slug]/index.vue`,
> `invitations/[id].vue`, `platform/organizations/[id].vue`) are backed by the
> **better-auth client SDK**, which is null on SSR — they **cannot** SSR in this
> phase. Leave them. They become SSR-able only via the `serverAuth` path, which
> Phase 3 establishes for the shared head; converting those page **tails** is
> deferred (YAGNI).

## Verification

```bash
pnpm build && pnpm preview
pnpm exec nuxi typecheck    # 0 errors
pnpm lint
node examples/sso-proof.mjs && node examples/authz-proof.mjs \
  && node examples/entitlement-proof.mjs && node examples/billing-proof.mjs
```

- [ ] **Gate passed:** rate-limiter keys per client IP (Step 2.2).
- [ ] Cold `/`: `window.__NUXT__` contains `home-subscriptions`; Network shows
      **no** client-side `/api/account/subscriptions` call before content.
- [ ] Subscription cards / empty state render in the first paint.
- [ ] An expired-cookie SSR load renders the empty state (or bounces on the
      client), **not** a 500 error page.
- [ ] All four proof scripts pass.
