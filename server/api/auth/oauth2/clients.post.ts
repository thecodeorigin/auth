import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1),
  redirectUris: z.array(z.string().url()).min(1),
  type: z.enum(['web', 'native', 'user-agent-based']).optional(),
  public: z.boolean().optional(),
  skipConsent: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readValidatedBody(event, bodySchema.parse)
  const auth = serverAuth(event)
  const ctx = await auth.$context

  return createOAuthClient(ctx.adapter, body)
})
