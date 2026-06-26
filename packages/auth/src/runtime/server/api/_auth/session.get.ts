import { defineEventHandler } from 'h3'
import { readSessionRecord, toPublicSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  return s ? toPublicSession(s.rec) : null
})
