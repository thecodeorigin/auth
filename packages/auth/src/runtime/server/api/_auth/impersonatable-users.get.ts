import { createError, defineEventHandler, getQuery } from 'h3'
import { idpFetch } from '../../utils/idp'
import { readSessionRecord } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return idpFetch(event, s.id, s.rec, '/api/auth/rp/impersonatable-users', { query: getQuery(event) as Record<string, string> })
})
