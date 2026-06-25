# Phase 4 — One bundle-analysis glance (not a tuning project)

The reported problem is a **round-trip waterfall**, which Phases 1–3 address.
Bundle size / hydration cost is a *different* axis and is almost certainly not the
cause. So this phase is a single cheap look, not the speculative grab-bag the
first draft had (prefetch tuning, lazy hydration, smart placement — all cut by the
YAGNI critic as off-target for a waterfall).

## Step 4.1 — Look at the client bundle

```bash
pnpm exec nuxi analyze
```

This builds and opens the bundle visualizer. Scan **only** for an obviously
oversized client chunk — e.g. a heavy library pulled into the initial entry that
shouldn't be (a date lib, an icon set not tree-shaken, an accidental server-only
dep in the client graph).

## Step 4.2 — Act only on an obvious win

If (and only if) something egregious shows up:

- A heavy component used below the fold → `Lazy`-prefix it (`<LazySomething>`).
- A library in the entry chunk that's only needed on one route → dynamic
  `import()` it in that route.

If nothing egregious shows up, **stop** — record "bundle is fine, waterfall was
the issue" and close the phase. Do **not** add `prefetchOn` tuning, blanket lazy
hydration, or Cloudflare smart placement on spec: none target first-content
latency for this app, and smart placement in particular is a crutch that signals
the architecture wasn't fixed (it was, in Phase 3).

## Acceptance

- [ ] `nuxi analyze` run; result noted (either "no action — bundle fine" or a
      specific oversized chunk + the one targeted fix applied).
- [ ] If a fix was applied: `pnpm lint` + `nuxi typecheck` clean, proof scripts
      pass.
