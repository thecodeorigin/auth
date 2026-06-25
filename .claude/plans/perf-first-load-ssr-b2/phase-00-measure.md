# Phase 0 — Measure correctly (prod build, not dev)

**Why:** `pnpm dev` first-load includes Vite **on-demand compilation** of every
route/component the first time it's hit — that can dwarf the real app latency and
is not representative of production. Measuring the dev server would send us
chasing a ghost. Measure a **production build** locally, and capture the cold-load
network waterfall so Phases 2/3 have a concrete before/after.

> This phase changes **no code**. It establishes the baseline and decides the
> open question "waterfall vs cold-start" (plan.md, open question #1).

## Steps

### 1. Build and preview a production bundle locally

```bash
pnpm build
pnpm preview        # nuxt preview — serves the built output (Nitro), ~prod parity
```

Expected: a local server (usually `http://localhost:3000`) serving the compiled
output. Note the start log line with the URL.

> Note: `pnpm preview` runs the Node/Nitro build, which is representative for
> *app/data* latency but **not** for Cloudflare Worker cold-start. Worker
> cold-start is only observable on a deployed Worker; if Phase 0 numbers look
> fine locally but prod feels slow, the villain is cold-start — revisit open
> question #1 before building Phase 3.

### 2. Capture the cold-load waterfall (Chrome DevTools MCP)

Walk these flows against `pnpm preview`, recording the Network panel each time
(disable cache; "cold" = hard reload):

| Flow | What to record |
|---|---|
| Sign in, then **hard reload `/`** | TTFB of the HTML doc; list every XHR/fetch that fires *after* the doc and *before* subscription cards paint; total time-to-content |
| Hard reload an **org page as a member** (e.g. `/orgs/<slug>/members`) | Same; note when the sidebar nav + org switcher become populated; note any visible flicker of nav items after hydration |
| Hard reload the **same** `$http`-backed page 5× quickly | Watch for any `429`/`500` from the rate limiter (baseline — should be none today since fetches are client-side) |

Record for each: **(a)** number of client round-trips before content, **(b)**
which calls are sequential vs parallel, **(c)** whether any data is already in the
SSR payload (`window.__NUXT__`).

### 3. Write the baseline down

Append a short table to this file (or `research/baseline.md`) like:

```
/ (home), cold, prod build:
  doc TTFB:           __ ms
  client calls before content: __  (list: get-session?, getFullOrganization, getActiveMemberRole, subscriptions)
  time to first content card:  __ ms
org/members, cold:
  client calls before table:   __
  nav populated at:            __ ms (flicker? y/n)
```

## Acceptance

- [ ] Numbers captured from `pnpm preview` (a prod build), **not** `pnpm dev`.
- [ ] The cold-`/` waterfall is written down (call count + sequence) as the
      before-state for Phase 2.
- [ ] A note on whether local content latency looks like the problem (→ proceed)
      or whether it's suspiciously fast locally (→ cold-start suspected; flag
      before Phase 3).
