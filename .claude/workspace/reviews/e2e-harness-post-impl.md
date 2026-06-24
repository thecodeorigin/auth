# Post-implementation review — e2e testing harness
=============================
Reviewer: principal-engineer + security lens
Verdict: APPROVE-WITH-NOTES

---

## CRITICAL (must fix before merge)

None. The critical-path mitigations from the pre-impl review are all present and correct (see detailed verification below).

---

## HIGH

### H-1 [tests/e2e/auth.spec.ts:281] — `waitForSelector` bypasses Playwright's auto-retry
`await page.waitForSelector('input[type="password"]', { state: 'visible' })` is the old Playwright v1 API; it resolves on the first matching element and does not retry on assertion failure the way `expect(locator).toBeVisible()` does. Additionally `input[type="password"]` is a CSS attribute selector — the same pattern flagged in H-2 below.
**Fix:** replace with `await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 8_000 })`.

### H-2 [tests/e2e/members-seats.spec.ts:116,180,203,219] — XPath parent-traversal locators `locator('../..')`
Using `locator('../..')` couples the test to the precise DOM depth of the member-row component. Any Nuxt UI v4 wrapper div change breaks these silently (the locator resolves to a different ancestor). There is no `data-testid` or semantic role on the row container to anchor to.
**Fix:** add `data-testid="member-row"` to the member row element in the `SubscriptionMembersCard` component and replace all `emailP.locator('../..')` with `page.locator('[data-testid="member-row"]').filter({ hasText: uniqueEmail })`.

### H-3 [tests/e2e/plans.spec.ts:37,55] — `locator('../../..')` three-level parent traversal
Same problem as H-2, but one level deeper. The plan card DOM depth is assumed to be exactly `h3 → div → body → card-root`.
**Fix:** add `data-testid="plan-card"` to each `UCard` in the Plans page and scope with `page.locator('[data-testid="plan-card"]').filter({ hasText: 'NordLocker Free' })`.

---

## MEDIUM

### M-1 [tests/e2e/home-dashboard.spec.ts:32] — CSS class substring selector `[class*="text-error"]`
`page.locator('[class*="text-error"]')` is a style-layer concern, not a semantic one. If Nuxt UI v4 ever renames the Tailwind utility (e.g. `text-(--ui-color-error-500)` after a theme token rename) this locator silently stops matching.
**Fix:** add an `aria-label` or `data-testid="expired-icon"` to the expiry icon in the expiry banner component and use `page.getByTestId('expired-icon')`.

### M-2 [tests/e2e/admin-platform.spec.ts:183,221] — `page.once('dialog', ...)` race window
Registering the dialog handler with `.once` immediately before `.click()` is correct, but if the click somehow triggers a navigation that shows the dialog before the listener fires (race in slow CI), the dialog auto-dismisses as rejected rather than accepted. The pattern is widely used in Playwright but is worth noting.
**Fix (recommendation):** use `page.on('dialog', ...)` + `page.off(...)` in a try/finally block, or extract a `confirmDialog(page, fn)` helper. Low urgency since workers=1 on CI.

### M-3 [tests/e2e/auth.spec.ts:51-52,62-63,76,85,95-96] — Hardcoded seeded password `Passw0rd!` in test file
`Passw0rd!` is the seed password for `alice@seed.local`. It lives in both the seed task and the test file with no shared constant. A future seed password change will silently break T-007 without a type error.
**Fix:** extract to a shared test-constant file (e.g. `tests/e2e/seed-constants.ts`) and import in both the seed task and auth.spec.ts.

### M-4 [tests/e2e/global-setup.ts:14] — Nitro task seed endpoint unauthenticated in dev
`POST /_nitro/tasks/:task` has no auth gate in dev. This is fine for local use, but if `E2E_BASE_URL` accidentally points at a staging/prod URL, the seed tasks would fire against live data. The CI flag `reuseExistingServer: !process.env.CI` won't prevent this.
**Fix (recommendation):** add a guard in `globalSetup` — assert `base.includes('localhost') || base.includes('127.0.0.1')` before running seeds, throwing if not.

### M-5 [tests/e2e/auth.spec.ts:26-39] — `__vueParentComponent` is a non-public Vue 3 internal
`waitForFormReady` polls for `form.__vueParentComponent` to detect Vue hydration. This is not a documented Vue 3 API and could vanish in a minor Vue release.
**Fix (recommendation):** use `waitForFunction(() => document.querySelector('form')?.__vue_app__ !== undefined)` or — better — give the UForm a `data-hydrated` attribute that a `onMounted` hook sets, avoiding the Vue internals dependency entirely. Acceptable workaround for now; document as a known fragility.

### M-6 [server/api/_agent/sign-in.get.ts] — nuxt-security rate-limiter applies to `/api/**` in prod, but the limiter driver is `cloudflare-r2-binding` which is unavailable in dev
The `$development` override switches the rate-limiter driver to `lruCache` and whitelists localhost, so this does not affect e2e. However `/api/_agent/sign-in` does not have its own `routeRules` entry to exempt it from the global `requestSizeLimiter` or the XSS validator. Because it only accepts query parameters (no body), `requestSizeLimiter` is benign, and the XSS validator on a GET with no body is also benign. Non-blocking, but worth noting.

---

## LOW

### L-1 [tests/e2e/admin-platform.spec.ts:115] — T-115 leaves a test application un-cleaned
The "admin creates application and sees secret modal" test (T-115) creates an application named `E2E Test App` but does not delete it. Comment says "skip for now; seed is idempotent". This accumulates stale records on repeated local runs.
**Fix (recommendation):** after verifying the secret modal, call the admin delete API via `request.delete('/api/auth/oauth2/clients/:id')` or navigate to the list and delete. Or at minimum filter the app name in the UI before creating: if it already exists, skip the create.

### L-2 [tests/e2e/billing.spec.ts] — `Promise.race` with an `expect` call
`Promise.race([expect(errorToast).toBeVisible(...), polarRedirect])` — Playwright's `expect` returns a Promise that rejects on assertion failure. If `polarRedirect` resolves first, the dangling `expect` promise rejection is swallowed unobserved, which can mask a real failure. Playwright logs an unhandled rejection warning.
**Fix:** use a conditional pattern: wait for either URL change or the error toast, then assert which one occurred; or wrap the expect in `.catch(() => null)`.

### L-3 [examples/agent-proof.mjs:28] — entry-point detection heuristic is fragile
`process.argv[1]?.endsWith('agent-proof.mjs')` will not match if the file is run via `node ./examples/agent-proof.mjs` with a leading `./` on some shells, or if the path contains symlinks. The `import.meta.url === file://...` branch handles the `node` invocation correctly. The `.endsWith` branch is redundant and potentially misleading.
**Fix:** remove the `|| process.argv[1]?.endsWith('agent-proof.mjs')` branch; the `import.meta.url` check is sufficient and correct.

### L-4 [examples/billing-proof.mjs:50] — cleanup depends on `added.id` from `afterAdd.find()`
If `afterAdd.find(m => m.email === email)` returns `undefined` (server returned unexpected shape or the add silently failed), line 50 `added.id` throws a runtime TypeError that aborts without running the delete. The seat leaks.
**Fix:** assert `added` is not undefined before accessing `.id`, e.g. `if (!added) throw new Error('added seat not found in roster')`.

### L-5 [playwright.config.ts:19] — `retries: 1` on CI with `workers: 1`
One retry is sensible for flaky tests, but with serial tests in `members-seats.spec.ts` sharing mutable state, a retry after partial mutation could corrupt state for subsequent tests in the `describe` block. The `mode: 'serial'` pragma stops subsequent tests in the block if one fails, but a *retried* test may re-run a mutation that already partially applied.
**Fix (recommendation):** add `test.describe.configure({ retries: 0 })` inside the `nordpass Members card` block to opt that suite out of CI retries.

---

## SECURITY CHECKLIST — agent endpoint mitigations

1. **Double gate (import.meta.dev AND agentAuthEnabled)** — CONFIRMED CORRECT.
   Line 31: `if (!import.meta.dev || !useRuntimeConfig().agentAuthEnabled)` throws 404.
   Both conditions must be truthy. `import.meta.dev` is a Vite/Nitro compile-time constant — it is statically replaced with `false` in the production bundle; Rollup dead-code-eliminates the handler body. The runtime flag defaults to `''` (falsy) in `nuxt.config.ts:114`, requiring an explicit opt-in. A dev server pointed at the live D1 without the env var cannot reach the handler body.

2. **Passwordless session creation** — CONFIRMED CORRECT.
   The handler calls `createSession(event, user.id)` (the adapter-level session mint from `@onmax/nuxt-better-auth`) and `setSessionCookie(event, session.token)`. No credential lookup, no hardcoded password, no `signInEmail` call anywhere in the file.

3. **Path off the auth namespace** — CONFIRMED CORRECT.
   File lives at `server/api/_agent/sign-in.get.ts` → route `/api/_agent/sign-in`. Not under `/api/auth/**`. The `nuxt-security` route rule that strips the XSS validator from `/api/auth/**` does not apply here; nuxt-security's full pipeline (XSS validator, request size limiter) remains active on this GET route.

4. **Open-redirect guard** — CONFIRMED CORRECT.
   Line 59: `const safe = redirect && /^\/(?!\/)/.test(redirect) ? redirect : '/'`
   The regex requires the string to start with exactly one `/` and the lookahead `(?!\/)` rejects a second leading `/`. This correctly rejects `//evil.com` (protocol-relative) and `https://evil.com` (absolute URL). Falls back to `/`. The agent-proof.mjs script verifies both attack vectors. The guard is correct and matches the stated spec.

5. **Audit log on every invocation** — CONFIRMED CORRECT.
   Line 56: `console.warn('[agent-login][DEV] session for ${email} (role=${role}) from ${getRequestIP(event) ?? 'unknown'}')`. Fires after the session is created and before the redirect. `console.warn` (not `console.log`) surfaces in Nitro's output even in production builds — but since the handler body is dead-code-eliminated in prod, this line never executes in the production bundle.

6. **Org param abuse** — SAFE. The `org` query parameter only updates `activeOrganizationId` on the session row that was *just* created by this request. It resolves the slug via `ctx.adapter.findOne` against the organization model; if the slug does not exist `orgRow` is null and the update is skipped (line 50 if-guard). There is no cross-user impact: the session ID being updated belongs exclusively to the user just signed in.

7. **Production absence** — CONFIRMED SAFE with a note.
   `import.meta.dev === false` in production → Rollup eliminates the entire handler body at build time; the route exports a `defineEventHandler` that immediately throws 404. The `agentAuthEnabled` key is in the server-only `runtimeConfig` (not under `public`); it is not present in the client bundle. The Cloudflare Worker bundle will not contain the working handler body.
   NOTE: The route file itself (`/api/_agent/sign-in`) remains present in the Worker bundle as a thin 404 stub. This is acceptable — the path name alone exposes no information. If the team wants zero presence, add `_agent/**` to `.cfignore` or a Nitro `ignore` rule.

---

## PRAISE

- The double-gate pattern (`import.meta.dev` AND runtime flag) is exactly right and well-documented inline. Many dev-only backdoors choose only one gate.
- `getValidatedQuery` with a Zod schema on the agent endpoint — the project convention is followed even on a dev route.
- `as const` on `AGENT_EMAILS` (not `as Record<...>`). Correct use of the one permitted `as` form.
- `billing-proof.mjs` is genuinely idempotent: it adds a seat then removes it in the same run, and tests the negative cases (401, 403, 400, 409) that matter most.
- `test.describe.configure({ mode: 'serial' })` on the mutable-state suite is the right call.
- `toastTitle` helper localizing to `[data-slot="title"]` is a clean workaround for the Nuxt UI v4 aria-live duplication issue, and is consistently applied across spec files.
- `test.fixme` for the broken invitation flow (T-138) is honest — it documents a product gap rather than suppressing a real failure.
- The `waitForFormReady` helper in auth.spec.ts solves a real Nuxt 4 SSR hydration timing problem with a clear comment explaining why native form submission occurs before hydration.

---

## OPEN QUESTIONS

1. `seed:subscriptions` is not in CLAUDE.md's workflow section. Is it already idempotent and safe to run repeatedly? The global-setup runs it unconditionally before every full e2e suite. If it fails (e.g. the dev server is not started with `NUXT_AGENT_AUTH_ENABLED=true`), should it be a warning rather than a hard throw?

2. The `webServer.reuseExistingServer: !process.env.CI` flag means on a developer's machine the e2e suite will reuse whatever dev server is running — including one *without* `NUXT_AGENT_AUTH_ENABLED=true`. Is there a guard that verifies the flag is active before proceeding? Currently the suite will fail with "agent sign-in expected 302, got 404" rather than a clear error.

3. `import.meta.dev` dead-code elimination is confirmed for the Nitro/Cloudflare build. Has this been verified in the actual Cloudflare Worker bundle (e.g. by inspecting the built `_worker.js`)? If not, adding the check to the deploy verification step in CLAUDE.md would be prudent.
