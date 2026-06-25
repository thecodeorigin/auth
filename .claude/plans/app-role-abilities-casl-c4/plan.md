# Plan — Per-app, per-role CASL abilities (the "Add ability" form)

**Plan id:** `app-role-abilities-casl-c4`
**Skill to execute:** `cook`
**Impact:** Medium (~5 new files, ~6 edits, **no DB migration**). Touches the sensitive
userinfo claim path → debate done (see `research/debate-synthesis.md`).

---

## Goal (the verbatim ask)

On the OAuth application detail page (`/platform/applications/:clientId`) add an **"Add
ability"** form. The form has **item groups** + an **"Add ability"** button. Each item group =
an **action** select (`create | view | update | delete | manage`), a **subject** text input,
and an **"extra rule" (condition)** input for "self" (e.g. *manage self-created posts*).
The defined abilities are emitted as CASL rules into the app's **OIDC userinfo** so the
relying app builds its `$ability` from them.

## Locked decisions (from the user)

1. **Consumption:** abilities are emitted as CASL rules in **userinfo** (alongside the
   existing `entitlement` claim), re-resolved live — never the immutable id_token.
2. **Condition model:** **structured CASL condition + placeholders** (e.g.
   `{ "authorId": "${user.id}" }`), substituted server-side at emit time.
3. **Scope:** **per-role within the app** — the userinfo `roles` claim selects which rule set
   applies. Storage shape is `{ [roleName]: AbilityRule[] }`.
4. **Storage:** a **JSON column on the OAuth client** → concretely
   `oauthClient.metadata.abilities` (the plugin's sanctioned `metadata` extension point;
   no new table, no migration).

## Refinements applied from the critic debate (please skim — these tighten, not change, the above)

- **R1 — `clientId` is re-pinned authoritatively on every metadata write.** The
  `metadata.clientId` field scopes every id_token; sharing the blob risks clobbering it
  (and the adapter may double-stringify metadata). The single writer always re-derives
  `metadata.clientId` from the authoritative `oauthClient.clientId` column, so an abilities
  edit can **never** break id_token scoping. (Security C1/H1.)
- **R2 — Condition values are whitelisted.** v1 supports the **`${user.id}`** placeholder
  only; any other `${…}` token is rejected at validation (no `${user.password}`
  exfiltration). `${org}` / `${roles}` are deferred (YAGNI) — add when a real consumer
  needs them. (Security C3.)
- **R3 — Default-closed everywhere.** `abilities[roleName]` resolves to `[]` when the role
  is `null`/absent (own-property check only); a rule whose required placeholder resolves to
  empty is **dropped**, never emitted with a blank scope. (Security C4/M1.)
- **R4 — Hardened validation.** Zod rejects reserved keys (`__proto__`/`constructor`/
  `prototype`), forbids `subject: "all"` (CASL god-mode), constrains the subject/key
  charset, enforces string-only condition values, and caps roles/rules/lengths. The
  resolver builds output objects with `Object.create(null)`. (Security C2/H2/H3/M2.)
- **R5 — Routes folded in.** No new `GET/PUT …/abilities` routes — abilities are one more
  field on the existing `clientGet` + `[id].patch.ts`. One writer (`clientUpdate`). (YAGNI
  #1–3.)
- **R6 — Resolve role once.** `customUserInfoClaims` calls `claimsResolve` once and passes
  `claims.roles` to the abilities resolver, so abilities derive from the same snapshot
  (no TOCTOU between two resolutions). (Security M3.)

## Open questions (read before cooking — none block, but #1 is a product call)

1. **Is IdP-side authoring definitely wanted (vs. defining the rules in the relying app)?**
   The architecture critic's strongest point: in a closed all-CASL ecosystem you could ship
   only `roles` + `sub` and let each RP own a static `role → rules-with-conditions` map
   (≈ zero new IdP code). We are **building the IdP form because the user explicitly asked
   for it** — i.e. they want non-technical, per-app, no-redeploy authoring in the admin
   console. If that assumption is wrong, stop and reconsider. Recorded, not blocking.
2. **Custom org-role keys are org-local (known limitation).** Role keys are free text
   (built-ins `owner/admin/member` suggested). A key like `editor` matches the *resolved*
   `roles` claim string app-wide, regardless of which org minted it. This is the intended
   product semantic ("the app defines what an `editor` may do in it"), but the sysadmin
   author must know the role vocabulary. Documented in the form's help text. Not blocking.
3. **Condition authoring UI** = a structured **key → value** pair editor (honours decision
   #2) with a **"self" quick-fill** button that inserts `authorId: ${user.id}`. Values are
   validated to the whitelist (R2). If you'd prefer a bare "scope to self" toggle, that's a
   strict subset — but the key/value editor is what honours the locked "structured" choice.

---

## Approach (one paragraph)

A client's abilities live in `oauthClient.metadata.abilities` as
`{ [roleName]: AbilityRule[] }`. A shared Zod schema (`#shared/abilities`) is the single
contract for client + server. A new `server/services/abilities.ts` reads + validates that
map, and `abilitiesResolve(userId, clientId, roleName)` (mirroring `entitlementsResolve`)
picks the role's rules and substitutes `${user.id}` into condition values, dropping any rule
whose scope can't resolve. `customUserInfoClaims` merges the resolved `abilities` array.
Writes go through the existing `clientUpdate` (extended with an `abilities?` field) which
re-pins `metadata.clientId` authoritatively; `clientGet` returns the current map. The admin
edits it via a new `PlatformAppAbilities.vue` card on the detail page (role groups → item
groups → action select + subject input + condition editor + "Add ability"), saved with the
existing `useApplicationsApi().update`. Verified by a new `examples/abilities-proof.mjs`
(userinfo resolution) plus the existing `authz-proof.mjs` (proves `clientId` survived the
write).

## Phase table

| Phase | File | What it delivers | Depends on |
|---|---|---|---|
| 01 | `phase-01-shared-contract.md` | `shared/abilities.ts` — Zod schema, types, caps, placeholder + reserved-key constants | — |
| 02 | `phase-02-server-resolution-storage.md` | `server/services/abilities.ts` (resolver + parse), `client.ts` read/write w/ clientId re-pin, `auth.config.ts` userinfo merge | 01 |
| 03 | `phase-03-api-routes.md` | `[id].patch.ts` accepts `abilities`; `[id].get.ts` returns it (via `clientGet`) | 02 |
| 04 | `phase-04-composable-ui.md` | `useApplicationsApi` types; `PlatformAppAbilities.vue`; card in `[clientId].vue` | 03 |
| 05 | `phase-05-seed-proof.md` | abilities fixture in `seed:authz-fixtures`; `examples/abilities-proof.mjs` | 02–04 |

## Cross-phase file map

**New**
- `shared/abilities.ts` (P01)
- `server/services/abilities.ts` (P02)
- `layers/admin/app/components/Platform/PlatformAppAbilities.vue` (P04)
- `examples/abilities-proof.mjs` (P05)

**Edited**
- `server/services/client.ts` — `ClientPatch`/`ClientView` + `clientGet`/`clientUpdate` (P02)
- `server/auth.config.ts` — `customUserInfoClaims` merges `abilities` (P02)
- `server/api/auth/oauth2/clients/[id].patch.ts` — `abilities` in body schema (P03)
- `app/composables/useApplicationsApi.ts` — `ClientDetail.abilities`, `ClientPatch.abilities` (P04)
- `layers/admin/app/pages/platform/applications/[clientId].vue` — render the abilities card (P04)
- `server/tasks/seed/authz-fixtures.ts` — seed abilities under role `viewer` on NordVPN (P05)

## Permission / data notes

- **CASL catalog (`shared/permissions.ts`): UNCHANGED.** This feature is a *parallel*
  CASL-rule store consumed by the RP; it does not touch better-auth's access-control
  statements, built-in roles, org dynamic roles, or any `hasPermission` check.
- **Grant sets:** none touched. The new form is **sysadmin-only** (route `requireAdmin`,
  page `middleware: 'sysadmin'`), same as all other client mutations.
- **Data writes:** the only non-route write is the **seed fixture**, which goes through the
  existing `seed:authz-fixtures` task calling `clientUpdate` (the single writer) — per the
  `data` skill (no ad-hoc SQL/`tsx`).

## Test / verification strategy (project oracles)

1. `pnpm lint` → 0
2. `pnpm exec nuxi typecheck` → 0
3. Restart `pnpm dev`, then `curl -X POST http://localhost:3000/_nitro/tasks/seed:idp`
   and `…/seed:authz-fixtures` (writes abilities via `clientUpdate`).
4. `node examples/authz-proof.mjs` → still green **(proves R1: `metadata.clientId` survived
   the abilities write — id_token org/role scoping intact).**
5. `node examples/abilities-proof.mjs` → new; asserts NordVPN userinfo `abilities` for alice
   (`view Post`; `manage Post` with `conditions.authorId === alice.sub`), and that **no
   literal `${…}`** and **no extra `user.*`** leak into the claim.
6. Live browser walk (sysadmin): open an app → Abilities card → add a role group → add an
   item group (`manage` / `Post` / quick-fill "self") → Save → reload shows it persisted.

## Acceptance criteria (checkable)

- [ ] An "Abilities" card on `/platform/applications/:clientId` lets a sysadmin define, per
      role, a list of `(action, subject, condition)` item groups, with "Add ability" /
      remove / "self" quick-fill, and persists via one Save.
- [ ] Stored at `oauthClient.metadata.abilities`; **no new table / migration**.
- [ ] After save, `metadata.clientId` is intact (authz-proof still green).
- [ ] userinfo for the app returns `abilities` for the user's resolved role, with
      `${user.id}` substituted to the user's `sub`; default-closed `[]` otherwise.
- [ ] Validation rejects `subject:"all"`, reserved keys, non-`${user.id}` placeholders, and
      over-cap maps. Reserved keys cannot reach the emitted object.
- [ ] `pnpm lint` and `nuxi typecheck` both 0; `authz-proof.mjs` + `abilities-proof.mjs` pass.

## Suggested cook invocation

```
/cook .claude/plans/app-role-abilities-casl-c4/plan.md
```
Execute phases 01→05 in order; run the verification block after P05.
