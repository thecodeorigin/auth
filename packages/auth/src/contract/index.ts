import { z } from 'zod'

export const RpOrganizationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  role: z.string(),
  personal: z.boolean(),
})
export type RpOrganization = z.infer<typeof RpOrganizationSchema>

/** CASL ability rule emitted into /oauth2/userinfo by the IdP. */
export const AbilityRuleSchema = z.object({
  action: z.string(),
  subject: z.string(),
  conditions: z.record(z.string(), z.string()).optional(),
})
export type AbilityRule = z.infer<typeof AbilityRuleSchema>

export const UserinfoClaimsSchema = z.object({
  org: z.string().nullable(),
  roles: z.string().nullable(),
  personal: z.boolean(),
  entitlement: z
    .object({
      product: z.string(),
      plan: z.string(),
      status: z.string(),
      active: z.boolean(),
      currentPeriodEnd: z.number().nullable(),
    })
    .nullable(),
  organizations: z.array(RpOrganizationSchema),
  abilities: z.array(AbilityRuleSchema),
  role: z.string().nullable(),
})
export type UserinfoClaims = z.infer<typeof UserinfoClaimsSchema>

export const PublicUserSchema = z.object({
  sub: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
})
export type PublicUser = z.infer<typeof PublicUserSchema>

export const ImpersonationCandidateSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
})
export type ImpersonationCandidate = z.infer<typeof ImpersonationCandidateSchema>

/** Server-safe session projection — no tokens, no KV internals. */
export interface ServerAuthSession {
  sub: string
  email: string
  name: string | null
  picture: string | null
  systemRole: string | null
  abilities: AbilityRule[]
  organizations: RpOrganization[]
  activeOrg: string | null
  entitlement: {
    product: string
    plan: string
    status: string
    active: boolean
    currentPeriodEnd: number | null
  } | null
  isImpersonation: boolean
  impersonator: PublicUser | null
}

/** Browser-visible session — NO tokens. */
export const PublicSessionSchema = z.object({
  user: PublicUserSchema,
  abilities: z.array(AbilityRuleSchema),
  systemRole: z.string().nullable(),
  organizations: z.array(RpOrganizationSchema),
  activeOrg: z.string().nullable(),
  entitlement: UserinfoClaimsSchema.shape.entitlement,
  impersonator: PublicUserSchema.nullable(),
})
export type PublicSession = z.infer<typeof PublicSessionSchema>
