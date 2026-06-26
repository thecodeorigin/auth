import type { H3Event } from 'h3'
import { createError, defineEventHandler } from 'h3'
import type { ServerAuthSession } from './session'
import { getServerAuthSession } from './session'

export function defineAuthenticatedHandler<T>(
  handler: (event: H3Event, session: NonNullable<ServerAuthSession>) => Promise<T> | T,
) {
  return defineEventHandler(async (event) => {
    const session = await getServerAuthSession(event)
    if (!session)
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    // routes may still access event.context.activeOrganizationId for legacy compat
    event.context.activeOrganizationId = session.activeOrg
    return handler(event, session)
  })
}

export function defineAuthorizedHandler<T>(
  _checks: string[],
  handler: (event: H3Event, ctx: { session: NonNullable<ServerAuthSession> }) => Promise<T> | T,
) {
  return defineAuthenticatedHandler(async (event, session) => handler(event, { session }))
}

export function defineAdminHandler<T>(
  _checks: string[],
  handler: (event: H3Event, ctx: { session: NonNullable<ServerAuthSession> }) => Promise<T> | T,
) {
  return defineAuthenticatedHandler(async (event, session) => {
    if (session.systemRole !== 'admin')
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    return handler(event, { session })
  })
}
