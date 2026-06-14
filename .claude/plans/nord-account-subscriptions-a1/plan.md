# Nord Account — Subscription & Billing Platform

Turn the OIDC IdP admin console into a **Nord Account–style account-management
portal**: a signed-in user sees their products & services (NordVPN, NordPass,
NordLocker, Dark Web Monitor) with subscription status, browses plans, checks
out via **Polar (live sandbox)**, manages billing through the Polar customer
portal, and runs a 6-seat **NordPass Family** plan. Seed data is reskinned to
Nord products so the platform is demoable end-to-end. Subscription tier is
exposed to relying-party apps via the OIDC **userinfo** endpoint.

---

## Open questions (resolved — recorded for cook)

| # | Question | Decision |
|---|----------|----------|
| 1 | Polar depth | **Full live sandbox integration.** `runtimeConfig.polarAccessToken` is already provided; `polar({ client })` boilerplate already in `server/auth.config.ts`. We add the `use:[checkout, portal, webhooks, usage]` subplugins + `createCustomerOnSignUp`. The 4 products must exist in the Polar **sandbox** dashboard; their IDs are wired via env (`polarProduct*`). |
| 2 | Entitlements in OIDC tokens | **Yes, via `customUserInfoClaims` only** (re-resolved per call). The immutable `id_token` is left untouched, so `sso-proof` / `authz-proof` id_token assertions stay valid. |
| 3 | Which user gets seeded subscriptions | **Both** `alice@seed.local` (member persona, matches screenshots) **and** `admin@thecodeorigin.com` (the operator login), so whoever signs in sees the Nord data. |
| 4 | Rename demo OAuth clients | **Yes** — `Express/Next/Nuxt RP` + `Vue SPA` → `NordVPN`, `NordPass`, `NordLocker`, `Nord Web` (public/PKCE). Ripples into `seed:authz-fixtures` and `authz-proof.mjs` (both reference clients by name); handled in Phase 2 + Phase 4. |

**Remaining external dependency cook cannot self-serve:** the 4 Polar **sandbox**
product IDs and a `POLAR_WEBHOOK_SECRET`. Cook must (a) put placeholders in
`.env`, (b) build/verify everything that doesn't need live Polar offline, and
(c) flag the live checkout/webhook walk as "blocked on real sandbox IDs" if the
user hasn't supplied them. Local seed + offline proofs must pass regardless.

---

## Goal

A logged-in user can, from this app:
1. See a **home dashboard** listing every product they own with status
   (Active / Renews on … / Expired) and a renew/manage CTA, plus an
   expired-subscription banner — mirroring `my.nordaccount.com`.
2. Open a **product page** (e.g. NordPass) showing its plan(s), manage actions,
   download links, and — for **NordPass Family** — the seat roster with
   add/remove member.
3. Browse **Available plans** and start a **Polar checkout**.
4. Manage **Billing** via the Polar customer portal + see order history.
5. Have RP apps (NordVPN/NordPass) read the user's **entitlement** from the
   OIDC userinfo endpoint at SSO time.

## Approach (after 3-critic debate — see `research/debate-synthesis.md`)

**Local DB is the source of truth; Polar is the live payment rail that syncs
*into* it via webhooks.** This is the only design that satisfies both "seed the
platform offline" and "real Polar checkout."

- **Two tables only** (`subscription`, `subscriptionMember`). The product/plan
  **catalog is a static typed `shared/catalog.ts`** (4 products never change at
  runtime) — no `product`/`plan` tables, no catalog seed task, no admin CRUD.
- **`subscription.userId`** owner (no polymorphic `referenceId`/org billing) —
  eliminates a class of IDOR/ownership bugs.
- **Family seats = dedicated `subscriptionMember`**, owner-gated, seat-cap
  enforced by a conditional insert (no org reuse, no email/token flow in v1 —
  members are added directly with `status='member'|'invited'`).
- **Polar full**: `checkout` + `portal` + `webhooks` + `usage` subplugins,
  `createCustomerOnSignUp`, client plugin, webhook→`subscriptionUpsertFromPolar`
  keyed on a **UNIQUE `polarSubscriptionId`** with an **`updatedAt` staleness
  guard** (mirrors the existing `access.ts` upsert idempotency pattern).
- **Entitlements** ride into **userinfo** only, re-resolved per call by a new
  `entitlementsResolve(userId, clientId)` service. The `id_token` hook is
  unchanged.
- **New `subscription` Nuxt layer** owns the front end (pages, nav, composables,
  components). All backend stays in the centralized root `server/` (schema,
  services, routes, tasks, `auth.config.ts`) per the project's layout.

### Rejected alternatives (full reasoning in synthesis)
- **Polar as source of truth (no local tables):** can't seed offline; poisons
  the token hot path with a live API call. Rejected.
- **Local-only, no Polar:** user explicitly chose full Polar. Rejected.
- **Reuse org model for family seats:** orgs feed OIDC claims + per-app access;
  a "family" would pollute every RP token and trigger `accessGrantAll`. Rejected
  in favor of `subscriptionMember`.
- **DB-backed catalog / admin catalog CRUD / referenceId polymorphism /
  redeem-refer-downloads pages:** YAGNI for the stated goal. Cut.

---

## Phase table

| Phase | Title | Files | Depends on |
|------|-------|------|-----------|
| 01 | Schema + static catalog + shared helpers | `server/db/schema/billing.ts`, `shared/catalog.ts`, `shared/subscription.ts`, migration | — |
| 02 | Services + Nord reseed + cleanup hooks | `server/services/subscription.ts`, `family.ts`, `entitlements.ts`, `polar-products.ts`; edit `tasks/seed/idp.ts`, `tasks/seed/authz-fixtures.ts`; new `tasks/seed/subscriptions.ts`; edit `auth.config.ts` (user-delete hook) | 01 |
| 03 | Polar full live integration | edit `server/auth.config.ts` (subplugins, webhooks), `app/auth.config.ts` (client plugin), `nuxt.config.ts` (env + routeRule), `.env.example` | 01, 02 |
| 03b | Dev webhook auto-provision (ngrok↔Polar) | `server/utils/polar-dev.ts`, `server/plugins/polar-webhook.dev.ts`, `nuxt.config.ts` (`ngrok.domain`) | 03 |
| 04 | OIDC userinfo entitlements + proof updates | edit `auth.config.ts` userinfo hook, `services/entitlements.ts`; edit `examples/authz-proof.mjs`; new `examples/entitlement-proof.mjs` | 02, 03 |
| 05 | Custom Nitro routes + composables | `server/api/account/subscriptions/*`, `server/api/account/family/*`, `server/api/billing/config.get.ts`; `app/composables/useSubscriptionsApi.ts`, `useFamilyApi.ts`, `useBillingApi.ts` | 02, 03 |
| 06 | UI — the portal | `layers/subscription/*` (nuxt.config, nav contribute, pages, components); repurpose `app/pages/index.vue` | 05 |

Medium-to-high coupling between 02→05; UI (06) is the widest. Build in order.

---

## Cross-phase file map

**New (backend):**
- `server/db/schema/billing.ts` — `subscription`, `subscriptionMember` tables
- `server/services/subscription.ts` — list/get/cancel/upsertFromPolar/clearForUser + `isActive`
- `server/services/family.ts` — members list/add/remove (owner-gated, seat-cap)
- `server/services/entitlements.ts` — `entitlementsResolve(userId, clientId)`
- `server/services/polar-products.ts` — env-driven `productId ⇄ planSlug` map + checkout product list
- `server/utils/polar-dev.ts` — dev-only Polar webhook reconciler (Phase 03b)
- `server/plugins/polar-webhook.dev.ts` — dev-only Nitro plugin that provisions the webhook + sets the secret (Phase 03b)
- `server/tasks/seed/subscriptions.ts` — `seed:subscriptions`
- `server/api/account/subscriptions/index.get.ts`
- `server/api/account/subscriptions/[id]/cancel.post.ts`
- `server/api/account/family/[subscriptionId]/members.get.ts`
- `server/api/account/family/[subscriptionId]/members.post.ts`
- `server/api/account/family/[subscriptionId]/members/[memberId].delete.ts`
- `server/api/billing/config.get.ts`

**New (shared):**
- `shared/catalog.ts` — products + plans (Nord, static, typed)
- `shared/subscription.ts` — types + `isActive` + `formatPeriodEnd`

**New (frontend layer `layers/subscription/`):**
- `nuxt.config.ts`
- `app/plugins/99.contribute.subscription.client.ts`
- `app/composables/useSubscriptionsApi.ts`, `useFamilyApi.ts`, `useBillingApi.ts`
- `app/pages/account/products/[slug].vue`
- `app/pages/account/plans.vue`
- `app/pages/account/billing.vue`
- `app/components/Subscription/*` (ProductCard, StatusBadge, FamilyMembers, ExpiryBanner)

**Edited:**
- `server/auth.config.ts` — Polar subplugins + webhooks + `createCustomerOnSignUp`; user-delete cleanup hook; userinfo entitlements merge
- `app/auth.config.ts` — add `polarClient()`
- `nuxt.config.ts` — `polarWebhookSecret` + `polarProduct*` runtimeConfig; `/polar/**` routeRule if needed
- `server/tasks/seed/idp.ts` — rename `DEMO_CLIENTS` to Nord products
- `server/tasks/seed/authz-fixtures.ts` — reference `NordVPN` instead of `Express RP`
- `examples/authz-proof.mjs` — `byName('NordVPN')` / `byName('Nord Web')`
- `app/pages/index.vue` — repurpose to the Nord home dashboard
- `.env.example` (or create) — Polar env vars

---

## Security checklist (applied)

- **authn:** every `/api/account/**` route calls `requireUserSession(event)`.
- **authz / ownership:** every subscription/family route **loads the row and
  asserts `subscription.userId === session.user.id`** before mutating. Family
  add/remove additionally require the caller to be the subscription owner.
  Non-owner family members get read-only.
- **validation:** Zod at every route boundary (email, ids, pagination).
- **seat-cap race:** `familyAddMember` uses a **conditional insert** gated on
  `(SELECT count(*) …) < seats` + `UNIQUE(subscriptionId, email)`, checks
  `rowsAffected`, 409 on loss (no TOCTOU count-then-insert).
- **webhook idempotency:** `UNIQUE(polarSubscriptionId)` + `onConflictDoUpdate`
  + drop events whose `updatedAt <= existing.updatedAt`.
- **client-supplied data:** checkout never accepts a `referenceId`/`userId` from
  the client — derived from the session server-side.
- **Polar guard:** seeded subs (`source='seed'`, null `polarSubscriptionId`)
  never call Polar; cancel takes a **local-only path**. Polar-dependent routes
  return **503** (not 404) when `polarAccessToken` is unset.
- **secrets:** Polar access token + webhook secret are server-only
  `runtimeConfig` (never `public`). Webhook signature verified by the plugin.
- **CSP:** unchanged. Checkout/portal are full-page redirects to Polar
  (`window.location`), not embedded — no `connect-src`/`frame-src` change.
- **D1 cleanup (no FK cascade in app logic):** `subscription` delete cascades
  `subscriptionMember` (FK `onDelete:'cascade'` is declared, but D1 ignores FK
  cascade at runtime → the service deletes members explicitly too); user delete
  → new `subscriptionClearForUser` hook.

## Permission impact

**No CASL catalog change.** Subscriptions are **self-scoped** (owner checks in
server routes), not org-RBAC. We do **not** touch `shared/permissions.ts`,
`SYSTEM_GRANTS`, or `DEFAULT_*_ABILITIES`. Nav items gate by `role:'member'`
only. (If admin oversight is added later, that's when a `subscription` subject
enters the catalog — out of scope here.)

## Data-write inventory (all via tasks → services)

| Write | Task | Service |
|-------|------|---------|
| Rename Nord OAuth clients | `seed:idp` (edited) | `clientCreate` (existing) |
| Seed Nord subscriptions + family seats | `seed:subscriptions` (new) | `subscription.ts`, `family.ts` |
| Live subscription create/update/cancel | Polar webhook (runtime) | `subscriptionUpsertFromPolar` |
| User-delete cleanup | `user.delete` auth hook | `subscriptionClearForUser` |

No raw SQL, no `nuxt db sql`, no one-off `tsx`. Webhook is the one runtime
writer and reuses the same service the seed task calls.

---

## Test strategy / verification oracles

1. `pnpm exec nuxi typecheck` → **0 errors** (after every phase).
2. `pnpm lint` → clean.
3. `pnpm dev` boots; `curl -X POST …/_nitro/tasks/seed:idp` then
   `…/seed:subscriptions` → both `ok`; query D1 confirms rows.
4. `node examples/sso-proof.mjs` → green (clients renamed, still PKCE-enforced).
5. `node examples/authz-proof.mjs` → green (NordVPN tier-0 beats personal `*`).
6. `node examples/entitlement-proof.mjs` (new) → userinfo for NordPass client
   returns `entitlement.active === true`; for NordVPN (expired) returns
   `active === false`.
7. **Browser walk (Chrome DevTools MCP)** signed in as alice: home shows 5
   product cards with correct statuses + expired banner; NordPass page shows
   6/6 family seats; remove → 5/6; add → 6/6; plans page renders; checkout
   button redirects to Polar sandbox (if IDs configured) or shows the 503
   "billing unavailable" state.
8. **Live Polar (if sandbox IDs provided):** complete a sandbox checkout →
   webhook hits `…/polar/webhooks` → a new `subscription` row appears with
   `source='polar'`; re-deliver the same webhook → no duplicate (idempotent).

## Acceptance criteria

- [ ] Home dashboard renders every owned product with Nord-accurate status &
      dates from local DB; expired products surface a banner.
- [ ] NordPass Family page lists 6 seats; owner can add (≤6, 409 on overflow)
      and remove members; non-owner cannot mutate.
- [ ] Plans page lists purchasable plans; checkout redirects to Polar sandbox.
- [ ] Billing page opens the Polar customer portal.
- [ ] Polar webhook upserts local subscriptions idempotently (UNIQUE + stale
      guard); seeded subs never call Polar.
- [ ] `customUserInfoClaims` returns `entitlement` for the requesting client,
      re-resolved live; `id_token` shape unchanged.
- [ ] typecheck 0, lint clean, sso-proof + authz-proof + entitlement-proof
      green, offline seed works without a Polar token.

---

## Suggested cook invocation

```
/cook .claude/plans/nord-account-subscriptions-a1/plan.md
```

Build phases **in order** (01→06); run the typecheck oracle after each. Phase
03's live-Polar verification is the only step that may be blocked on
externally-provided sandbox product IDs — everything else is self-contained and
offline-verifiable. See each `phase-XX-*.md` for the exact code.
