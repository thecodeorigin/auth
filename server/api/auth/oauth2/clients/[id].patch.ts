import { z } from 'zod'
import { abilityMapSchema } from '#shared/abilities'

const redirectUri = z.string().url().refine(
  uri => /^https?:\/\//i.test(uri),
  { message: 'Only http:// and https:// redirect URIs are permitted' },
)

const bodySchema = z.object({
  name: z.string().min(1).optional(),
  redirectUris: z.array(redirectUri).min(1).optional(),
  skipConsent: z.boolean().optional(),
  disabled: z.boolean().optional(),
  abilities: abilityMapSchema.optional(),
}).refine(
  obj => Object.values(obj).some(v => v !== undefined),
  { message: 'At least one field must be provided' },
)

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const clientId = getRouterParam(event, 'id')
  if (!clientId)
    throw createError({ statusCode: 400, statusMessage: 'Missing client id' })

  const body = await readValidatedBody(event, bodySchema.parse)
  const ctx = await serverAuth(event).$context
  const ok = await clientUpdate(ctx.adapter, clientId, body)

  if (!ok)
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })

  return { ok: true }
})
