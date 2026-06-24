import type { AgentRole } from './fixtures'
import { expect, test } from './fixtures'

// Validates the harness foundation: the agent endpoint signs in each seeded role
// and lands authenticated (the user menu shows the signed-in account).
const ROLES: { role: AgentRole, menu: string }[] = [
  { role: 'admin', menu: 'System Admin' },
  { role: 'member', menu: 'Alice Member' },
  { role: 'viewer', menu: 'Bob Viewer' },
]

for (const { role, menu } of ROLES) {
  test(`agent sign-in as ${role} lands authenticated`, async ({ page, signInAs }) => {
    await signInAs(role, '/')
    await expect(page).toHaveURL(/\/$/)
    // The dashboard shell shows the signed-in user's menu button.
    await expect(page.getByRole('button', { name: menu })).toBeVisible()
  })
}

test('agent endpoint rejects open-redirect', async ({ page }) => {
  await page.goto('/api/_agent/sign-in?role=member&redirect=https://evil.com')
  await expect(page).toHaveURL(/localhost:3000\/$/)
})
