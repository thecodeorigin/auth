import { z } from 'zod'

/**
 * Per-app, per-role CASL ability rules emitted into OIDC userinfo (never the id_token).
 * Consumed by relying apps to build their CASL $ability. This is a PARALLEL store to
 * better-auth's access-control statements (shared/permissions.ts) — it does not touch them.
 */

/** Actions surfaced in the authoring form. `manage` is the CASL wildcard action. */
export const ABILITY_ACTIONS = ['create', 'view', 'update', 'delete', 'manage'] as const
export type AbilityAction = typeof ABILITY_ACTIONS[number]

/**
 * Suggested role keys. Custom org-role names are also valid (free text) but are org-local
 *  — see plan Open Q2. The key is matched against the server-resolved `roles` claim.
 */
export const BUILTIN_ROLE_KEYS = ['owner', 'admin', 'member'] as const

/** The ONLY placeholder tokens substituted server-side at emit time (R2). */
// eslint-disable-next-line no-template-curly-in-string
export const ABILITY_PLACEHOLDERS = ['${user.id}'] as const
export type AbilityPlaceholder = typeof ABILITY_PLACEHOLDERS[number]

/** Keys that must never appear (prototype-pollution guard, R4/C2). */
export const RESERVED_KEYS = ['__proto__', 'prototype', 'constructor'] as const
const isReserved = (k: string) => (RESERVED_KEYS as readonly string[]).includes(k)

/** Caps — DoS + userinfo size guard (R4/M2). */
export const ABILITY_CAPS = {
  rolesPerClient: 20,
  rulesPerRole: 50,
  conditionsPerRule: 10,
  subjectMaxLen: 64,
  conditionKeyMaxLen: 64,
  conditionValueMaxLen: 200,
  roleKeyMaxLen: 64,
} as const

/** A condition value is EITHER a whitelisted placeholder OR a literal with no ${…} smuggling. */
const conditionValueSchema = z.string()
  .min(1)
  .max(ABILITY_CAPS.conditionValueMaxLen)
  .refine(

    v => (ABILITY_PLACEHOLDERS as readonly string[]).includes(v) || !v.includes('${'),
    // eslint-disable-next-line no-template-curly-in-string
    { message: 'Only the ${user.id} placeholder is supported' },
  )

// Use z.record(z.string(), value) + superRefine for key validation — Zod v4 compatible.
const conditionSchema = z.record(z.string(), conditionValueSchema)
  .superRefine((obj, ctx) => {
    const keys = Object.keys(obj)
    if (keys.length > ABILITY_CAPS.conditionsPerRule)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many conditions' })
    for (const k of keys) {
      if (k.length === 0 || k.length > ABILITY_CAPS.conditionKeyMaxLen)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: 'Condition key length out of range' })
      else if (!/^[A-Z_]\w*$/i.test(k))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: 'Condition field must be a plain identifier' })
      else if (isReserved(k))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: 'Reserved key is not allowed' })
    }
  })

export const abilityRuleSchema = z.object({
  action: z.enum(ABILITY_ACTIONS),
  subject: z.string()
    .min(1)
    .max(ABILITY_CAPS.subjectMaxLen)
    .regex(/^[\w.:-]+$/, 'Subject may use letters, digits, _ . : -')
    .refine(s => s.toLowerCase() !== 'all', { message: '`all` subject is not allowed' }),
  conditions: conditionSchema.optional(),
}).strict()
export type AbilityRule = z.infer<typeof abilityRuleSchema>

export const abilityMapSchema = z.record(z.string(), z.array(abilityRuleSchema).max(ABILITY_CAPS.rulesPerRole))
  .superRefine((m, ctx) => {
    const keys = Object.keys(m)
    if (keys.length > ABILITY_CAPS.rolesPerClient)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many roles' })
    for (const k of keys) {
      if (k.length === 0 || k.length > ABILITY_CAPS.roleKeyMaxLen)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: 'Role key length out of range' })
      else if (!/^[\w-]+$/.test(k))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: 'Role key may use letters, digits, _ -' })
      else if (isReserved(k))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: 'Reserved key is not allowed' })
    }
  })
export type AbilityMap = z.infer<typeof abilityMapSchema>

/** Build a "self" condition for a subject's owner field (used by the form's quick-fill). */
export function selfCondition(ownerField = 'userId'): Record<string, AbilityPlaceholder> {
  // eslint-disable-next-line no-template-curly-in-string
  return { [ownerField]: '${user.id}' }
}
