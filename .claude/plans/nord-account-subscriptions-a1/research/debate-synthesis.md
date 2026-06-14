# Debate synthesis

Three critics ran in parallel against the initial design (4 tables, Polar-as-
co-equal-rail, new layer, admin pages, family email flow). Below: every
objection, the ruling, and the trace into the plan. The user then chose **full
live Polar** + **userinfo entitlements**, which overrode two YAGNI cuts.

## YAGNI / KISS critic

| Objection | Ruling | Where |
|-----------|--------|-------|
| `product` + `plan` tables are a constant, not a DB — use a static `catalog.ts` | **Accept** | `shared/catalog.ts`; no catalog tables/seed task |
| `features` JSON column is speculative | **Accept** | features live in static `CatalogPlan.features` |
| Admin pages `/platform/subscriptions` + `/platform/products` + CASL subjects premature | **Accept** | cut; no `shared/permissions.ts` change |
| Webhook reconciliation is the hardest part & untestable for a seed | **Reject (user override)** | user chose full live Polar → webhooks built, but with cheap correctness (UNIQUE + upsert + staleness guard), Phase 02/03 |
| Family invite email (nuxt-resend) is the expensive 20% | **Accept** | v1 adds seats directly (`member`/`invited`), no email/token flow |
| `subscription.seats` duplicates catalog | **Accept** | seats derived from `planBySlug().seats` |
| `referenceId = userId\|orgId` polymorphism is hypothetical | **Accept** | `subscription.userId` only |
| redeem / refer / downloads / deals pages | **Accept** | cut (download links shown on product page only) |
| New `subscription` layer vs `/account` scope | **Reject (kept layer)** | the domain is the literal product & large; a dedicated frontend layer matches the per-domain convention. Low cost. Recorded as a deliberate call. |
| Keep `subscription` + `subscriptionMember` + seed + user pages + Polar checkout/portal | **Accept (this is the ask)** | core of the plan |

## Failure-mode / security critic

| Objection | Ruling | Where |
|-----------|--------|-------|
| Polymorphic `referenceId` ownership ambiguous/forgeable | **Accept** (resolved by going userId-only) | no `referenceId`; ownership = `userId===session.user.id` |
| IDOR cancel/read on others' subs | **Accept** | `requireOwnedSubscription` on every route (Phase 05) |
| Family: non-owner mgmt / accept-wrong-invite / token reuse | **Accept (scoped)** | owner-only routes; no public invite/accept flow in v1 (the riskiest surface is removed, not patched) |
| Webhook duplicate/out-of-order/created-before-checkout | **Accept** | UNIQUE `polarSubscriptionId` + `onConflictDoUpdate` + `updatedAt` staleness guard; reference from `metadata.userId`/`customer.external_id`, never guessed (Phase 02/03) |
| Seat-limit TOCTOU on D1 | **Accept** | count-gated conditional `INSERT…SELECT…WHERE count<seats` + `UNIQUE(subscriptionId,email)` + `rowsAffected` check (Phase 02 `familyAddMember`) |
| externalId→org mismatch | **Moot** (no org subs) + reference read from metadata | Phase 02 `subscriptionUpsertFromPolar` |
| Orphans on user/org/plan/sub delete; Polar keeps billing | **Accept** | `subscriptionClearForUser` + new `user.delete` hook; sub delete cascades members; plan is static (no plan-delete orphan). Polar cancel via portal noted. |
| status vs currentPeriodEnd drift + TZ | **Accept** | single `isActive()` helper; epoch-ms UTC integers everywhere (Phase 01) |
| Claims don't reflect sub changes (immutable id_token) | **Accept (drove the userinfo choice)** | entitlements via `customUserInfoClaims`, re-resolved per call; id_token untouched (Phase 04) |
| Unmounted Polar / seeded subs with no polarSubscriptionId | **Accept** | `isPolarConfigured()` 503 gate; seeded subs `source='seed'` take a local-only path; UI hides/disables checkout & portal when unconfigured |

## Architecture critic

| Alternative | Ruling | Rationale |
|-------------|--------|-----------|
| Polar as source of truth (no local tables) | **Reject** | can't seed offline; live API call in the token hot path. User's "simulate with seed data" needs local SoT. |
| Local-only, no Polar | **Reject (user override)** | user explicitly chose full live Polar. |
| Reuse org model for family seats | **Reject** | orgs feed OIDC claims + `accessGrantAll`; a family-as-org pollutes every RP token. `subscriptionMember` is cheaper and isolated. |
| Product-as-OAuth-client (entitlement half) | **Accept (partial)** | products *are* the RP clients → **rename** demo clients to Nord names; entitlement maps `clientId→name→catalog product→subscription` and rides userinfo. Catalog stays separate from `oauthClient` (a client is RP integration, not a catalog product). |

### Net effect of the debate
- 4 tables → **2**. Catalog → **static**. Admin/CASL/redeem/refer/downloads →
  **cut**. Family email/token → **cut** (direct seat add). referenceId → **userId**.
- Hardening adopted wholesale: UNIQUE+upsert+staleness, conditional-insert seat
  cap, ownership asserts, isActive helper, epoch-UTC, user-delete cleanup, Polar
  config guard.
- User decisions layered on top: **full live Polar** (webhooks/checkout/portal/
  usage, sandbox products) and **userinfo entitlements** (not id_token).

### Residual risks flagged for cook (not blockers)
1. Exact better-auth `databaseHooks.user.delete.before` shape (1.6.16) — verify;
   fallback documented.
2. Drizzle `onConflictDoUpdate` `setWhere` support — fallback to conditional
   `update().where(lt(updatedAt))`.
3. `db.run(sql\`…\`)` raw escape hatch on `@nuxthub/db` for the conditional insert.
4. Polar webhook payload field names + mounted path (`/api/auth/polar/webhooks`).
5. `chrome-extension://` redirect URI rejected by hard-rule-#9 validator → omit
   from seed (decided: omit).
6. Live-Polar verification blocked until sandbox product IDs + webhook secret are
   supplied; everything else is offline-verifiable.
