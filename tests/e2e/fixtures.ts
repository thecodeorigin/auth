import { test as base, expect } from '@playwright/test'

export type AgentRole = 'admin' | 'member' | 'viewer'

/**
 * `signInAs(role)` establishes a real session via the dev-only agent endpoint
 * (/api/_agent/sign-in) and lands the page authenticated. No password/MFA, so
 * automation is never blocked. Seeded role → user:
 *   admin  → admin@thecodeorigin.com (system admin)
 *   member → alice@seed.local        (subscriptions, NordPass Family owner)
 *   viewer → bob@seed.local          (project-viewer dynamic role)
 */
export const test = base.extend<{ signInAs: (role: AgentRole, redirect?: string, org?: string) => Promise<void> }>({
  signInAs: async ({ page }, use) => {
    await use(async (role, redirect = '/', org) => {
      const orgParam = org ? `&org=${encodeURIComponent(org)}` : ''
      const res = await page.goto(`/api/_agent/sign-in?role=${role}&redirect=${encodeURIComponent(redirect)}${orgParam}`)
      expect(res?.ok(), `agent sign-in for ${role}`).toBeTruthy()
      await page.waitForLoadState('networkidle')
    })
  },
})

export { expect }
