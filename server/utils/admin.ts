import type { H3Event } from 'h3'

declare module '#nuxt-better-auth' {
  interface AuthUser {
    role?: string | null
  }
}

export async function requireAdmin(event: H3Event) {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })

  const adminIds = (useRuntimeConfig().adminUserIds || '').split(',').filter(Boolean)
  if (user.role !== 'admin' && !adminIds.includes(user.id))
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })

  return user
}
