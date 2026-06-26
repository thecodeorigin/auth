import { createError, defineEventHandler } from 'h3'
import { readSessionRecord } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return s.rec.organizations
})
