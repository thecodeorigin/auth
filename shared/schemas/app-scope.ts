import { z } from 'zod'

export const orgMemberParamsSchema = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
})

export const setAppScopeBodySchema = z.object({
  // '*' = all apps; otherwise an oauthClient.clientId. Adding specific clients restricts to them.
  clientId: z.string().min(1).default('*'),
  role: z.string().min(1).nullable().optional(), // null/undefined => inherit member.role
})

export const revokeAppScopeParamsSchema = orgMemberParamsSchema.extend({
  clientId: z.string().min(1),
})
