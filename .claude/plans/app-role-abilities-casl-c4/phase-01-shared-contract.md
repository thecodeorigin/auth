# Phase 01 — Shared contract & validation

**Deliverable:** `shared/abilities.ts` — the single Zod contract (types via `z.infer`) imported
by both the PATCH route (server) and the form component (client). This is where every security
constraint from the debate (R2/R3/R4) is enforced.

> Hard rule 9 ("Zod at every server boundary") + the codebase convention that `#shared/*` holds
> isomorphic contracts (see `shared/permissions.ts`, `shared/subscription.ts`).

## Step 1.1 — Create `shared/abilities.ts`

```ts
// shared/abilities.ts
import { z } from 'zod'

/**
 * Per-app, per-role CASL ability rules emitted into OIDC userinfo (never the id_token).
 * Consumed by relying apps to build their CASL `$ability`. This is a PARALLEL store to
 * better-auth's access-control statements (shared/permissions.ts) — it does not touch them.
 */

/** Actions surfaced in the authoring form. `manage` is the CASL wildcard action. */
export const ABILITY_ACTIONS = ['create', 'view', 'update', 'delete', 'manage'] as const
export type AbilityAction = typeof ABILITY_ACTIONS[number]

/** Suggested role keys. Custom org-role names are also valid (free text) but are org-local
 *  — see plan Open Q2. The key is matched against the server-resolved `roles` claim. */
export const BUILTIN_ROLE_KEYS = ['owner', 'admin', 'member'] as const

/** The ONLY placeholder tokens substituted server-side at emit time (R2).
 *  Widen deliberately — every token here is a field a relying app receives. */
export const ABILITY_PLACEHOLDERS = ['${user.id}'] as const
export type AbilityPlaceholder = typeof ABILITY_PLACEHOLDERS[number]

/** Keys that must never appear (prototype-pollution guard, R4/C2). */
export const RESERVED_KEYS = ['__proto__', 'prototype', 'constructor'] as const
const isReserved = (k: string) => (RESERVED_KEYS as readonly string[]).includes(k)

/** Caps — DoS + userinfo size + the hot token path reads the whole row (R4/M2). */
export const ABILITY_CAPS = {
  rolesPerClient: 20,
  rulesPerRole: 50,
  conditionsPerRule: 10,
  subjectMaxLen: 64,
  conditionKeyMaxLen: 64,
  conditionValueMaxLen: 200,
  roleKeyMaxLen: 64,
} as const

const conditionKeySchema = z.string()
  .min(1).max(ABILITY_CAPS.conditionKeyMaxLen)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Condition field must be a plain identifier')
  .refine(k => !isReserved(k), 'Reserved key is not allowed')

/** A condition value is EITHER a whitelisted placeholder OR a literal with no `${…}` smuggling. */
const conditionValueSchema = z.string()
  .min(1).max(ABILITY_CAPS.conditionValueMaxLen)
  .refine(
    v => (ABILITY_PLACEHOLDERS as readonly string[]).includes(v) || !v.includes('${'),
    { message: 'Only the ${user.id} placeholder is supported' },
  )

export const abilityRuleSchema = z.object({
  action: z.enum(ABILITY_ACTIONS),
  subject: z.string()
    .min(1).max(ABILITY_CAPS.subjectMaxLen)
    .regex(/^[A-Za-z0-9_.:-]+$/, 'Subject may use letters, digits, _ . : -')
    .refine(s => s.toLowerCase() !== 'all', { message: '`all` subject is not allowed' }),
  conditions: z.record(conditionKeySchema, conditionValueSchema)
    .refine(o => Object.keys(o).length <= ABILITY_CAPS.conditionsPerRule, { message: 'Too many conditions' })
    .optional(),
}).strict()
export type AbilityRule = z.infer<typeof abilityRuleSchema>

const roleKeySchema = z.string()
  .min(1).max(ABILITY_CAPS.roleKeyMaxLen)
  .regex(/^[A-Za-z0-9_-]+$/, 'Role key may use letters, digits, _ -')
  .refine(k => !isReserved(k), 'Reserved key is not allowed')

/** The whole map stored at `oauthClient.metadata.abilities`. */
export const abilityMapSchema = z.record(
  roleKeySchema,
  z.array(abilityRuleSchema).max(ABILITY_CAPS.rulesPerRole),
).refine(m => Object.keys(m).length <= ABILITY_CAPS.rolesPerClient, { message: 'Too many roles' })
export type AbilityMap = z.infer<typeof abilityMapSchema>

/** Build a "self" condition for a subject's owner field (used by the form's quick-fill). */
export function selfCondition(ownerField = 'userId'): Record<string, AbilityPlaceholder> {
  return { [ownerField]: '${user.id}' }
}
```

## Notes for cook

- **Zod version:** this repo is on Zod v3 (`z.record(keySchema, valueSchema)` two-arg form is
  valid). If `nuxi typecheck` flags the 2-arg `z.record`, fall back to
  `z.record(z.string(), valueSchema).superRefine(...)` validating keys manually with the same
  regex + reserved check — keep the constraints identical.
- Do **not** add hand-written `interface`s mirroring these — export only the `z.infer` types
  (YAGNI Y4).
- `selfCondition` default owner field is `userId`; the form lets the admin override it.

## Acceptance

- `pnpm exec nuxi typecheck` → 0 with the new file present.
- A quick REPL/parse sanity (optional): `abilityMapSchema.safeParse({ member: [{ action:'manage',
  subject:'Post', conditions:{ authorId:'${user.id}' } }] }).success === true`; and
  `{ member: [{ action:'manage', subject:'all' }] }` → `success === false`;
  `{ member: [{ action:'view', subject:'Post', conditions:{ __proto__:'x' } }] }` → `false`.
