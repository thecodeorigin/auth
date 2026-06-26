import { createError, defineEventHandler } from 'h3'
import { useStorage } from 'nitropack/runtime'
import { idpFetch } from '../../utils/idp'
import { resolveAuthConfig } from '../../utils/oidc'
import { readSessionRecord, readSessionRecordById, toPublicSession, writeSessionRecord } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s || !s.rec.isImpersonation)
    throw createError({ statusCode: 400, statusMessage: 'Not impersonating' })

  try {
    await idpFetch(event, s.id, s.rec, '/api/auth/rp/stop-impersonating', { method: 'POST' })
  }
  catch {}

  const backup = s.rec.backupId ? await readSessionRecordById(s.rec.backupId) : null
  if (!backup)
    throw createError({ statusCode: 500, statusMessage: 'Original session missing — sign in again' })

  await writeSessionRecord(s.id, backup)
  const cfg = resolveAuthConfig()
  await useStorage(cfg.storageBase).removeItem(`session:${s.rec.backupId}`)
  return toPublicSession(backup)
})
