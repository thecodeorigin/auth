import { z } from 'zod'
import { abilityRuleSchema } from '#shared/abilities'

export const RpOrganizationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  role: z.string(),
  personal: z.boolean(),
})
export type RpOrganization = z.infer<typeof RpOrganizationSchema>

/** The full custom claim set emitted into /oauth2/userinfo for a relying party. */
export const UserinfoClaimsSchema = z.object({
  // existing, unchanged
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
  // new in phase 1
  organizations: z.array(RpOrganizationSchema),
  abilities: z.array(abilityRuleSchema),
  role: z.string().nullable(),
})
export type UserinfoClaims = z.infer<typeof UserinfoClaimsSchema>
