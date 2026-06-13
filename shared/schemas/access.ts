import { z } from 'zod'

export const OrgMemberParamsSchema = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
})

export const AccessSetBodySchema = z.object({
  // '*' = all apps; otherwise an oauthClient.clientId.
  clientId: z.string().min(1).default('*'),
  role: z.string().min(1).nullable().optional(), // null/undefined => inherit member.role
})

export const AccessRevokeParamsSchema = OrgMemberParamsSchema.extend({
  clientId: z.string().min(1),
})
