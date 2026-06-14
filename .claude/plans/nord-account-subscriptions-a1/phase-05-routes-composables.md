# Phase 05 — Custom Nitro routes + composables

User-facing read/mutation routes (Zod-validated, session-gated, ownership-checked)
and the data-layer composables the UI binds to. Mirrors the
`server/api/auth/oauth2/clients/*` pattern + the `use*Api` composable shape.

## Ownership helper — `server/utils/subscription-owner.ts`

```ts
import { subscriptionGet } from '../services/subscription'
import type { SubscriptionRow } from '#shared/subscription'

/** Load a subscription and assert the session user OWNS it. 404 if missing, 403 if not owner. */
export async function requireOwnedSubscription(event: H3Event, id: string, userId: string): Promise<SubscriptionRow> {
  const sub = await subscriptionGet(id)
  if (!sub)
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  if (sub.userId !== userId)
    throw createError({ statusCode: 403, statusMessage: 'Not your subscription' })
  return sub
}
```

> `H3Event` type + `createError`/`getRouterParam`/`readValidatedBody` are
> Nitro auto-imports. `requireUserSession(event)` comes from `@onmax/nuxt-better-auth`
> server utils — **confirm the exact helper name** (search existing routes for how
> they read the session; `requireAdmin` exists per the applications routes, so a
> sibling user-session helper likely does too). If only `requireAdmin` exists,
> add a `requireUserSession` util that returns `{ user }` or 401.

## Step 5.1 — `server/api/account/subscriptions/index.get.ts`

```ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return subscriptionListForUser(user.id) // SubscriptionRow[]
})
```

## Step 5.2 — `server/api/account/subscriptions/[id]/cancel.post.ts`

```ts
import { z } from 'zod'

const bodySchema = z.object({ cancel: z.boolean().default(true) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const { cancel } = await readValidatedBody(event, bodySchema.parse)
  const sub = await requireOwnedSubscription(event, id, user.id)

  // Seeded (local-only) subs never touch Polar.
  if (sub.source === 'polar' && sub.polarSubscriptionId) {
    if (!isPolarConfigured())
      throw createError({ statusCode: 503, statusMessage: 'Billing temporarily unavailable' })
    // Authoritative cancel happens in the Polar customer portal; here we only
    // record intent so the dashboard reflects it immediately. The webhook will
    // reconcile the real state. (Direct Polar cancel API can be added later.)
  }
  await subscriptionSetCancelAtPeriodEnd(id, cancel)
  return { ok: true }
})
```

> `isPolarConfigured` + `subscriptionSetCancelAtPeriodEnd` + `subscriptionListForUser`
> are auto-imported from `server/services`. For a true Polar cancel, call the
> Polar SDK in a follow-up; the portal link (Step 5.5) is the primary cancel UX.

## Step 5.3 — `server/api/account/family/[subscriptionId]/members.get.ts`

```ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const subscriptionId = getRouterParam(event, 'subscriptionId')!
  await requireOwnedSubscription(event, subscriptionId, user.id) // owner-only view of seats
  return familyMembers(subscriptionId)
})
```

> Decision: family roster is **owner-only** in v1 (owner === subscription.userId).
> Non-owner seat-holders don't have a portal account flow yet. Simpler + safe.

## Step 5.4 — `server/api/account/family/[subscriptionId]/members.post.ts`

```ts
import { z } from 'zod'

const bodySchema = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const subscriptionId = getRouterParam(event, 'subscriptionId')!
  const { email } = await readValidatedBody(event, bodySchema.parse)
  const sub = await requireOwnedSubscription(event, subscriptionId, user.id)

  const result = await familyAddMember(subscriptionId, sub.planSlug, email)
  if (result === 'full')
    throw createError({ statusCode: 409, statusMessage: 'All seats are taken' })
  if (result === 'duplicate')
    throw createError({ statusCode: 409, statusMessage: 'Already a member' })
  return { ok: true }
})
```

### `server/api/account/family/[subscriptionId]/members/[memberId].delete.ts`

```ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const subscriptionId = getRouterParam(event, 'subscriptionId')!
  const memberId = getRouterParam(event, 'memberId')!
  await requireOwnedSubscription(event, subscriptionId, user.id)
  const removed = await familyRemoveMember(subscriptionId, memberId)
  if (!removed)
    throw createError({ statusCode: 400, statusMessage: 'Cannot remove this member' })
  return { ok: true }
})
```

## Step 5.5 — `server/api/billing/config.get.ts`

```ts
export default defineEventHandler(async () => {
  // Public-ish flag so the UI can hide checkout/portal when billing is unconfigured.
  return { polarConfigured: isPolarConfigured() }
})
```

## Step 5.6 — composables (`app/composables/` — global, project-wide)

> These live in the **root** `app/composables/` (auto-imported app-wide), matching
> `useUsersApi` etc. The new `subscription` layer's pages consume them.

`useSubscriptionsApi.ts`:
```ts
import type { SubscriptionRow } from '#shared/subscription'

export function useSubscriptionsApi() {
  return {
    list: () => $http<SubscriptionRow[]>('/api/account/subscriptions'),
    cancel: (id: string, cancel = true) =>
      $http<{ ok: true }>(`/api/account/subscriptions/:id/cancel`, { method: 'POST', query: { id }, body: { cancel } }),
  }
}
```

`useFamilyApi.ts`:
```ts
import type { FamilyMember } from '../../server/services/family' // type-only import OK

export function useFamilyApi() {
  return {
    members: (subscriptionId: string) =>
      $http<FamilyMember[]>(`/api/account/family/:subscriptionId/members`, { query: { subscriptionId } }),
    add: (subscriptionId: string, email: string) =>
      $http<{ ok: true }>(`/api/account/family/:subscriptionId/members`, { method: 'POST', query: { subscriptionId }, body: { email } }),
    remove: (subscriptionId: string, memberId: string) =>
      $http<{ ok: true }>(`/api/account/family/:subscriptionId/members/:memberId`, { method: 'DELETE', query: { subscriptionId, memberId } }),
  }
}
```

> `$http` interpolates `:param` from `query` (see `app/lib/ofetch.ts`
> `interpolatePath`) and forwards cookies on SSR. Type-only import of
> `FamilyMember` from the server service is fine (erased at build); if the
> linter objects to crossing the server boundary, re-declare the interface in
> `#shared/subscription.ts` and import from there instead.

`useBillingApi.ts`:
```ts
export function useBillingApi() {
  const client = useAuthClient()
  function c() {
    if (!client)
      throw createError({ statusCode: 500, statusMessage: 'Auth client unavailable' })
    return client
  }
  return {
    config: () => $http<{ polarConfigured: boolean }>('/api/billing/config'),
    // Polar redirects: full-page navigation (CSP-safe; no embed).
    checkout: (slug: string) => c().checkout({ slug }),
    portal: () => c().customer.portal(),
    state: () => c().customer.state(),
    orders: (query: { page?: number, limit?: number } = {}) => c().customer.orders.list({ query: { page: 1, limit: 20, ...query } }),
  }
}
```

> `authClient.checkout` / `customer.*` exist only after Phase 03's client plugin.
> They run **client-side only** (CLAUDE.md hard rule #4) — call them from event
> handlers / `onMounted`, never in SSR setup. `checkout({ slug })` performs the
> redirect itself (returns a URL / navigates); confirm whether it returns
> `{ data: { url } }` (then `window.location.href = data.url`) or auto-redirects,
> and wire the plans page (Phase 06) accordingly.

## Verify (Phase 05 done)

```bash
pnpm exec nuxi typecheck   # 0
pnpm lint                  # clean
```
Manual route probes (dev, signed in as alice — grab a cookie):
```bash
curl -s --cookie "$COOKIE" localhost:3000/api/account/subscriptions | jq length        # 5
curl -s --cookie "$COOKIE" localhost:3000/api/account/family/sub-seed-<aliceId>-nordpass-family/members | jq length  # 6
curl -s localhost:3000/api/billing/config            # { polarConfigured: <bool> }
```
IDOR check: requesting another user's `subscriptionId` → **403**. Over-cap add →
**409**.
