# Plan — Fix slow perceived first-page load (SSR the dashboard waterfall)

**Plan id:** `perf-first-load-ssr-b2`
**Goal:** Make a cold first load of the dashboard paint real content fast, by
removing the client-side data waterfall — without breaking impersonation,
authz, or tripping the production rate limiter.

---

## Open questions (read first)

1. **Cold-start vs content-latency (decided by Phase 0).** Phase 0 measurement
   tells us whether the pain is the *data waterfall* (→ this whole plan applies)
   or *Worker cold-start per nav* (→ we'd pivot toward an SPA shell). The plan
   assumes the waterfall, which the code strongly supports. **If Phase 0 shows
   cold-start dominates, stop and reconsider Phase 3 before building it.**
2. **Rate-limiter keying is a hard precondition for SSR self-fetch (Phase 2).**
   On Cloudflare Workers an SSR `$http` call does not carry `CF-Connecting-IP`,
   so nuxt-security's R2 rate limiter (150 tokens / 5 min) would collapse every
   user onto one bucket → mass 429s. **Phase 2 MUST land the IP-forwarding fix
   and verify keying before any `server: false` is removed or any SSR bootstrap
   ships.** This gate protects Phases 2 and 3.
3. **Raw-HTML scaffold pages** (`app/pages/orgs/index.vue`,
   `app/pages/admin/users.vue`, `app/pages/admin/orgs/[orgId].vue`) violate the
   "Nuxt UI only" hard rule and look like dev scaffolding. They are **not** the
   real member/admin surfaces (those live under `layers/`). This plan does **not**
   refactor or SSR them — it only removes a verified-redundant `fetchSession`
   from `admin/users.vue` in Phase 1. Flag for separate cleanup.

---

## Current state (5 lines)

Every dashboard page fetches its data **client-side after hydration** because the
better-auth **client** SDK is null on SSR. First paint = empty skeletons, then a
chain: SSR session (in payload) → `useActiveOrg` resolves the active org's full
detail + member role (2 client calls, `server: false`) → the page's own
`onMounted(load)` (often 2 sequential calls). The **server** better-auth instance
(`serverAuth(event)` / `auth.api.*`) is already available and used in custom
routes — so the data *can* be resolved on the server; it just isn't.

### Three surprises
- `useActiveOrg` **already** skips the `list()→setActive()→fetchSession()` dance
  when `session.activeOrganizationId` is set (`useActiveOrg.ts:18`). That dance
  only runs for members with **no** active org (first-ever load). The persistent
  per-page cost is the client-only `getFull` + `getActiveMemberRole`.
- The home page `/` is backed by a **cookie-resolving custom Nitro route**
  (`/api/account/subscriptions` → `requireUserSession`), yet is pinned
  `{ server: false }` (`index.vue:10`) — it could SSR today once the rate-limiter
  precondition is met.
- For **members** (non-admins), `$ability` depends on `activeMemberRole`, which is
  written **client-side only**. So on SSR a member's ability is empty — any SSR
  move of nav/data must SSR the role too, or it hydration-mismatches.

### Three confirmations
- `$http` already forwards the `cookie` header on SSR (`ofetch.ts:38-41`).
- `serverAuth(event)` + `await auth.$context` + `auth.api.*({ headers })` are the
  proven server-side data path (`server/api/auth/oauth2/clients/[id].get.ts:8-10`,
  `server/tasks/seed/idp.ts`).
- `requireUserSession(event)` / `getUserSession(event)` (auto-imported from
  `@onmax/nuxt-better-auth`) resolve the session from the cookie server-side.

---

## Approach

Collapse the waterfall in layers, safest first. Each phase is independently
shippable and independently valuable.

| Phase | Title | Impact | Risk | Files |
|---|---|---|---|---|
| 0 | Measure correctly (prod build, not dev) | Baseline | none | 0 (commands) |
| 1 | Client-side wins (parallelize, audit `fetchSession`) | Medium | low | ~3 |
| 2 | Rate-limiter IP fix + SSR the `$http`-backed home | High | **gated** | 2 |
| 3 | Layout `serverAuth` bootstrap (SSR session+org+role once) | High | medium | ~5 |
| 4 | One bundle-analysis glance | Low | none | 0–1 |

**Why this order:** Phase 0 prevents chasing Vite-dev-compile ghosts. Phase 1 is
pure client-side and ships today. Phase 2's IP-forwarding fix is the precondition
that makes *any* SSR self-fetch safe, so it must precede Phase 3. Phase 3 is the
real fix — it SSR-resolves the shared waterfall **head** (session → org → role)
once at the layout, so nav + ability + the home content are correct and present
at first paint. Phase 4 is a cheap glance, not a tuning project.

### Explicitly rejected (from debate — see `research/debate-synthesis.md`)
- **Per-page custom Nitro routes for every list page** — rejected. The list pages
  aren't the cold-landing path, and this duplicates the better-auth method names
  the project keeps single-sourced. Deferred indefinitely; Phase 3 SSRs the
  *shared head* only, page data tails stay client-side for now.
- **Blanket removal of `fetchSession({force})`** — rejected. Most are
  post-mutation (impersonation/accept-invite/setActive) and removing them is a
  security-visible bug. Phase 1 removes exactly one verified mount-refresh.
- **Bundle/prefetch/lazy-hydration/smart-placement tuning** — mostly rejected.
  None target a round-trip waterfall. Reduced to a single `nuxi analyze` glance
  in Phase 4.

---

## Cross-phase file map

| File | Phase | Change |
|---|---|---|
| (commands only) | 0 | `pnpm build && pnpm preview`, DevTools waterfall capture |
| `layers/organization/app/pages/orgs/[slug]/members.vue` | 1 | `Promise.allSettled` for `listMembers`+`listRoles` |
| `app/pages/admin/users.vue` | 1 | drop the mount `fetchSession({force})` (line 64) |
| `app/lib/ofetch.ts` | 2 | forward `cf-connecting-ip`/`x-forwarded-for`/`x-real-ip` on SSR; SSR-safe 401 |
| `app/pages/index.vue` | 2 | drop `{ server: false }` (SSR the home subscriptions) |
| `server/api/bootstrap.get.ts` | 3 | **new** — returns `{ activeOrg, memberRole }` via `serverAuth` |
| `app/composables/useBootstrap.ts` | 3 | **new** — SSR `useAsyncData` seeding `activeOrgSlug` + `ability.orgRole` |
| `app/layouts/default.vue` | 3 | call `useBootstrap()` so the head resolves on SSR |
| `app/composables/useActiveOrg.ts` | 3 | consume bootstrap; keep no-active-org dance as client fallback |
| `shared/subscription.ts` / types | 3 | (only if a shared type is needed for the bootstrap payload) |
| (commands only) | 4 | `nuxi analyze`; act only on an obvious heavy chunk |

---

## Test / verification strategy

No Vitest/Playwright runner is wired for unit checks; oracles are:

1. `pnpm lint` — clean.
2. `pnpm exec nuxi typecheck` — **0 errors** (hard rule).
3. `node examples/sso-proof.mjs && node examples/authz-proof.mjs && node
   examples/entitlement-proof.mjs && node examples/billing-proof.mjs` — all pass
   (the SSR/session changes must not alter the OIDC/authz invariants).
4. **Live browser walk (Chrome DevTools MCP)** against `pnpm preview` (prod
   build), repeated as the before/after oracle for Phase 0/2/3:
   - Cold load `/` → count client API calls before content paints; confirm
     subscriptions arrive in the SSR payload (Phase 2) not a client call.
   - Cold load an org page as a **member** → confirm nav + org switcher render
     immediately with no flicker, ability-gated items don't toggle after
     hydration (Phase 3 mismatch check).
   - **Rate-limiter check (Phase 2 gate):** hit a `$http`-SSR page repeatedly
     from one browser; confirm you are *not* globally throttled, and that the
     bucket is per-client-IP (two different IPs / a second device get independent
     budgets). This is the production-outage guard.
   - Impersonation: start + stop impersonation; banner shows the correct subject
     and the `[Impersonating]` title prefix appears (Phase 1 `fetchSession`
     audit guard).

---

## Acceptance criteria

- [ ] Phase 0 baseline recorded (commands + a before-waterfall note) so Phase
      2/3 wins are measurable, taken from a **prod build**, not `pnpm dev`.
- [ ] `/` paints subscription content from the **SSR payload** — zero client
      round-trips for subscriptions on cold load (Network shows it server-side).
- [ ] A member cold-loading an org page sees the sidebar nav, org switcher, and
      ability-gated items in their final state at first paint — **no post-hydration
      flicker / no transient 403**.
- [ ] The R2 rate limiter still keys per client IP after the ofetch change;
      repeated SSR loads from one client do not exhaust a shared bucket.
- [ ] All four proof scripts pass; impersonation start/stop banner correct.
- [ ] `pnpm lint` clean; `nuxi typecheck` 0 errors.

---

## Suggested cook invocation

> Execute `.claude/plans/perf-first-load-ssr-b2/`. Do Phase 0 first and paste the
> baseline waterfall before touching code. Ship Phase 1, then Phase 2 — but do
> **not** remove any `server: false` until the ofetch IP-forwarding fix is in and
> the rate-limiter keying is verified per the Phase 2 gate. Then Phase 3. Run
> lint + typecheck + all four proof scripts after each phase.

See `phase-00`…`phase-04` files for executable steps and `research/debate-synthesis.md`
for the decision record.
