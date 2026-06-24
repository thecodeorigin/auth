import { z } from 'zod'

/**
 * DEV-ONLY "Sign in as Agent" — instantly establish a real session as a seeded
 * role so e2e/automation isn't blocked by passwords, email verification, or MFA.
 *
 * Double-gated (security review, CRITICAL): the `import.meta.dev` constant is
 * statically `false` in production builds (handler body dead-code-eliminated, route
 * 404s) AND an explicit `NUXT_DEMO_MODE=true` opt-in is required — so a dev
 * running `pnpm dev` pointed at the live D1 still can't use it unless they opt in.
 *
 * Passwordless: looks the seeded user up by email and mints a session via the
 * better-auth adapter (no credentials in the bundle; bypasses any future MFA).
 *
 *   GET /api/_agent/sign-in?role=admin|member|viewer&redirect=/some/path
 */
const AGENT_EMAILS = {
  admin: 'contact@thecodeorigin.com',
  member: 'alice@seed.local',
  viewer: 'bob@seed.local',
} as const

const querySchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
  redirect: z.string().optional(),
  org: z.string().optional(), // optional org slug → set as the session's active org (deterministic org-scoped e2e)
})

export default defineEventHandler(async (event) => {
  // NUXT_DEMO_MODE is coerced (destr) to a boolean — truthiness covers both.
  if (!import.meta.dev || !useRuntimeConfig().demoMode)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const { role, redirect, org } = await getValidatedQuery(event, querySchema.parse)
  const email = AGENT_EMAILS[role]

  const auth = serverAuth(event)
  const ctx = await auth.$context
  const user = await ctx.adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: email }] })
  if (!user)
    throw createError({ statusCode: 500, statusMessage: `Agent user ${email} not found — run seed:idp first` })

  const session = await createSession(event, user.id)
  if (!session?.token)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create agent session' })

  // Optionally pin the active organization (org pages are active-org-scoped).
  if (org) {
    const orgRow = await ctx.adapter.findOne<{ id: string }>({ model: 'organization', where: [{ field: 'slug', value: org }] })
    if (orgRow)
      await ctx.adapter.update({ model: 'session', where: [{ field: 'id', value: session.id }], update: { activeOrganizationId: orgRow.id } })
  }

  await setSessionCookie(event, session.token)

  console.warn(`[agent-login][DEV] session for ${email} (role=${role}) from ${getRequestIP(event) ?? 'unknown'}`)

  // Relative, same-origin redirect only (no open-redirect via ?redirect=).
  const safe = redirect && /^\/(?!\/)/.test(redirect) ? redirect : '/'
  return sendRedirect(event, safe)
})
