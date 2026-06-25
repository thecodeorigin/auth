# Debate synthesis — app-role-abilities-casl-c4

Three critics ran in parallel: **YAGNI**, **failure-mode/security**, **architecture**.
Each objection below is marked **Accept** (plan changed), **Reject** (kept, with reason), or
**Defer** (open question in `plan.md`).

## Architecture critic

| # | Objection | Disposition |
|---|---|---|
| A1 | Don't build it in the IdP at all — ship `roles` + `sub`, let each RP own a static `role→rules` map. "Self" = `sub`. Near-zero IdP code. | **Defer → Open Q1.** The user explicitly asked for an admin-console form ⇒ they want non-technical, no-redeploy, per-app authoring. That answers the critic's deciding question ("who edits, can they redeploy?"). Recorded as the one product assumption to re-check before cooking. |
| A2 | Normalized table vs JSON blob. | **Reject (keep JSON).** Abilities are always read as a whole document for one `clientId` at userinfo time — never queried by predicate. JSON column is the right shape; avoids a migration + D1 no-cascade cleanup. |
| A3 | Never share the `metadata` blob — `clientId` clobber risk. | **Accept (R1).** Single writer re-pins `metadata.clientId` from the authoritative column on every write; a dedicated column was rejected because `metadata` is the plugin's sanctioned extension point (`metadata?: string`) and adding a column fights better-auth schema generation. Re-pin fully neutralizes the clobber. |
| A4 | Keying by the single `roles` string is the weakest axis — custom role names are org-local; map only reliably matches built-ins; leaks org vocabulary. | **Accept-partial → Open Q2.** Documented as a known limitation; built-ins are suggested in the UI; free-text keys are still allowed (honours the user's "editor" example). It's a UX/coupling caveat, not a security hole (role assignment stays org-admin-gated; abilities are app+role scoped; emission uses the *server-resolved* role only). |
| A5 | Extend `organizationRole.permission` with conditions instead. | **Reject.** That column is written by better-auth `dynamicAccessControl` and the AC model **cannot** represent conditions; co-opting it would diverge server-AC and client-CASL. Confirms conditions belong in a separate CASL-layer store. |
| A6 | IdP shipping CASL rules in userinfo is non-standard (IdP-as-policy-engine smell). | **Accept-as-tradeoff.** Defensible in this closed all-CASL ecosystem; mitigated by keeping it in userinfo (live, revocable) not id_token, and by a versionable, constrained rule shape (R2/R4). Noted in Open Q1. |

## Failure-mode / security critic (all accepted)

| # | Objection | Disposition |
|---|---|---|
| C1 | Read-merge-write clobbers `metadata.clientId` (esp. if adapter returns a stringified blob) → breaks id_token scoping / cross-app leak. | **Accept (R1).** Defensive 3-deep parse (mirrors `parseStringArray`/`orgParseMeta`) + authoritative `clientId` re-pin. authz-proof becomes the regression guard. |
| C2 | Prototype pollution via `__proto__`/`constructor` condition or role keys; crosses into the RP's CASL. | **Accept (R4).** Zod rejects reserved keys; resolver builds with `Object.create(null)` and `Object.hasOwn`. |
| C3 | Placeholder resolver exfiltrates arbitrary `user.*` (e.g. `${user.password}`). | **Accept (R2).** Fixed token map (`${user.id}` only); any other `${…}` rejected at validation. |
| C4 | Placeholder resolving to null → match-all / wrong-tenant escalation in CASL. | **Accept (R3).** Any rule whose required placeholder resolves empty is dropped (default-closed). |
| H1 | Lost-update race on the shared blob (D1 has no interactive txn). | **Accept-bounded.** Sysadmin-only, low-frequency edits; re-pin means a race can only lose an abilities edit, never break auth. Optimistic lock judged overkill (noted). |
| H2 | Non-string / nested condition values throw or under-substitute. | **Accept (R4).** v1 = string values only; nested CASL operators explicitly out of scope. |
| H3 | `manage`+`all` god-mode; subject injection. | **Accept (R4).** `subject:"all"` forbidden; subject charset-constrained, non-empty. |
| H4 | Org-admin mints a role name matching an app ability key → self-grant. | **Accept-bounded → Open Q2.** Role *assignment* stays org-admin-gated and abilities are scoped to that org context; documented. (Built-in-only keying considered but rejected as too restrictive vs the user's "editor" example.) |
| M1 | Default-closed lookup discipline. | **Accept (R3).** `Object.hasOwn` + `Array.isArray`; no fallback role. |
| M2 | Caps: rules/roles/lengths/size; dedupe. | **Accept (R4).** Caps in `ABILITY_CAPS`. |
| M3 | userinfo staleness + TOCTOU between two resolutions. | **Accept (R6).** Resolve `claims` once; derive abilities from `claims.roles`. RP cache TTL documented. |
| M4 | `roleName` must stay server-resolved. | **Accept.** Passed straight from `claimsResolve`; code comment forbids wiring it from request input. |
| Tests | Extend authz-proof to prove `clientId` survives; add userinfo abilities proof. | **Accept (P05).** Fixture writes abilities via `clientUpdate`; authz-proof = clientId-survival guard; new abilities-proof = resolution + leak checks. |

## YAGNI critic

| # | Objection | Disposition |
|---|---|---|
| Y1 | Delete the new `GET/PUT …/abilities` routes; fold into existing `[id].get.ts`/`[id].patch.ts`. | **Accept (R5).** |
| Y2 | Drop `clientSetAbilities`; add `abilities?` to `ClientPatch`/`clientUpdate`. | **Accept (R5).** |
| Y3 | Drop `getAbilities`/`setAbilities` composable methods; reuse `get`/`update`. | **Accept (R5).** |
| Y4 | Collapse `shared/abilities.ts` to Zod + `z.infer` (no duplicate hand-written types). | **Accept.** Types are `z.infer`. |
| Y5 | Drop `${org}`/`${roles}`; ship `${user.id}` only. | **Accept (R2).** |
| Y6 | Per-role → app-global (re-confirm). | **Reject.** User explicitly chose per-role; keep `{ [role]: rules }`. |
| Y7 | Generic key/value editor → "self" toggle (re-confirm). | **Reject-partial → Open Q3.** Keep the structured key/value editor (honours locked decision #2) **with** a "self" quick-fill; the toggle is a strict subset we can fall back to. |
| Y8 | Efficiency: 3× `oauthClient` lookups per userinfo call. | **Accept-as-note.** Resolver mirrors `entitlementsResolve` (self-contained fetch) for codebase consistency; consolidating the fetch is a documented, deferred micro-opt (not worth coupling the two resolvers now). |
| Keep | proof script, `abilitiesResolve`, userinfo merge, component+card. | **Kept** — these are the feature. |

## Net effect

From 9 proposed artifacts → **4 new** (`shared/abilities.ts`, `server/services/abilities.ts`,
`PlatformAppAbilities.vue`, `examples/abilities-proof.mjs`) + small edits to 6 existing files,
**no migration**, with the security surface closed (R1–R4) and the one strategic assumption
(IdP-side authoring) surfaced as Open Q1.
