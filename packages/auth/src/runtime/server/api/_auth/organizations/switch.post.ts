import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { readSessionRecord, toPublicSession, writeSessionRecord } from '../../../utils/session'

const bodySchema = z.object({ organizationId: z.string() })

export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const { organizationId } = await readValidatedBody(event, bodySchema.parse)
  const org = s.rec.organizations.find(o => o.id === organizationId)
  if (!org)
    throw createError({ statusCode: 403, statusMessage: 'Not a member of that organization' })
  s.rec.activeOrg = org.id
  await writeSessionRecord(s.id, s.rec)
  return toPublicSession(s.rec)
})
