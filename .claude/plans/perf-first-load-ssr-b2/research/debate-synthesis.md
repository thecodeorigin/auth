# Debate synthesis — perf-first-load-ssr-b2

Three critics ran in parallel against the draft (YAGNI, failure-mode, architecture).
Each objection below is recorded as **Accept** (plan changed), **Reject** (kept,
with reason), or **Defer** (open question).

## Failure-mode critic

1. **SSR `$http` self-fetch collapses every user onto one R2 rate-limit bucket →
   production outage (highest severity).** On CF Workers the subrequest carries no
   `CF-Connecting-IP`; nuxt-security keys on IP; 150 tokens/5min shared → mass 429s.
   → **ACCEPT.** Phase 2 is gated: the ofetch IP-forwarding fix (forward
   `cf-connecting-ip`/`x-forwarded-for`/`x-real-ip`) + an explicit keying
   verification (Step 2.2) must land **before** any `server: false` removal or SSR
   bootstrap. Made a top-level open question (#2) and an acceptance criterion.

2. **SSR 401 in `$http` would render a 500 instead of redirecting** (the bounce is
   `import.meta.client`-only). → **ACCEPT.** Phase 2.1 makes the 401 handler
   SSR-safe: propagate on server, let `useAsyncData` default + page empty-state
   absorb it; client keeps the `/sign-in` bounce.

3. **Most `fetchSession({force})` calls are post-mutation, not redundant —
   removing them breaks impersonation/accept-invite/set-active.** → **ACCEPT.**
   Phase 1 explicitly removes exactly **one** verified mount-refresh
   (`admin/users.vue:64`) and lists every post-mutation call to KEEP. Blanket
   removal rejected.

4. **Member hydration mismatch: SSR slug but client-only `activeMemberRole` →
   nav/ability flicker + transient 403.** → **ACCEPT.** Phase 3's bootstrap
   SSR-resolves the role *in lockstep* with the slug and seeds `ability.orgRole`
   on the server, so member ability is correct at first paint. The full-org
   watcher is made non-clobbering (never writes a null slug).

5. **`Promise.all` rejects the whole page if one read 403s.** → **ACCEPT.** Phase 1
   uses `Promise.allSettled` and degrades roles to the built-in set.

6. **New SSR org route could leak cross-org data if it doesn't pin
   `organizationId`.** → **ACCEPT (by design).** The bootstrap calls
   `getFullOrganization`/`getActiveMemberRole` with **no** query, which resolves
   the *session's active org* server-side — the same org the client uses. No
   `:slug`-vs-active mismatch because we never pass a URL slug into the route.

## Architecture critic

7. **A server better-auth instance already exists (`serverAuth(event)` /
   `auth.api.*`) — "SDK only works in browser" is half-true.** → **ACCEPT.** This
   is the foundation of Phase 3. The bootstrap uses `serverAuth(event)` exactly as
   the OAuth admin routes do.

8. **The waterfall HEAD (session→org→role) is layout-level, not page-level —
   per-page SSR routes treat it wrong.** → **ACCEPT.** Replaced the draft's
   "per-page custom Nitro routes" (step 3) with a single **layout bootstrap** that
   resolves the shared head once. Per-page data **tails** stay client-side.

9. **Per-page route proliferation duplicates the single-sourced better-auth method
   names.** → **ACCEPT.** Dropped. Only one new route (`/api/bootstrap`), and it
   carries a SEC-NAMES verify note for the two `auth.api` methods it calls.

10. **Consider SPA shell (`ssr:false`) if Worker cold-start dominates.** →
    **DEFER.** Captured as open question #1; Phase 0 measurement decides. If
    cold-start (not content latency) is the villain, stop before Phase 3 and
    reconsider. Not adopted now because the code points squarely at a data
    waterfall.

11. **Drop "smart placement" as a crutch.** → **ACCEPT.** Cut from Phase 4.

## YAGNI critic

12. **Cut per-page SSR routes (Phase 3 draft) — list pages aren't the cold-landing
    path.** → **ACCEPT** (same as #8). The deep page-tail SSR is deferred
    indefinitely; Phase 3 is now the bounded layout bootstrap.

13. **Gut Phase 4 — bundle/prefetch/lazy-hydrate/smart-placement don't touch a
    round-trip waterfall.** → **ACCEPT.** Phase 4 reduced to a single `nuxi
    analyze` glance with "act only on an obvious win; otherwise stop."

14. **Phase 0 over-instrumented.** → **PARTIAL ACCEPT.** Kept the load-bearing
    insight (measure a prod build, not `pnpm dev`'s Vite-compile first hit) and a
    home-page before/after waterfall; dropped the idea of formally baselining all
    ~20 pages.

15. **`useActiveOrg` already short-circuits the list→setActive→fetchSession dance
    when `activeOrganizationId` exists (`:18`).** → **ACCEPT (correction).** The
    draft over-claimed this dance as the persistent cost. Corrected: the
    persistent cost is the client-only `getFull` + `getActiveMemberRole`, which
    Phase 3 moves to SSR. The dance only runs for first-ever members with no
    active org, and is kept as a client fallback.

16. **YAGNI claim that `layouts/default.vue:28` is an every-page mount
    `fetchSession`.** → **REJECT (critic was wrong).** Verified: line 28 is inside
    `stopImpersonating()`, a post-mutation handler, not a mount call. Left intact;
    documented in Phase 1 so cook doesn't "fix" it.

## Net effect on the plan

- The dangerous step (drop `server:false` everywhere) became a **gated, two-file**
  change behind a rate-limiter precondition.
- The big architectural step became a **bounded layout bootstrap** (one route +
  one composable + a `useActiveOrg` refactor) instead of ~20 per-page routes.
- The `fetchSession` cleanup shrank from a sweep to **one** audited line.
- Phase 4 shrank from a tuning project to **one** command.
