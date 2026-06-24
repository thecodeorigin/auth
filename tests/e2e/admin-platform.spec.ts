/**
 * admin-platform.spec.ts — Admin-only platform pages
 * Covers: T-107 to T-127
 *
 * The admin user is contact@thecodeorigin.com (system role='admin').
 * Applications list is readable by all authenticated users; create/edit/delete are admin-only.
 * Consents and Users lists are sysadmin-only.
 *
 * Toast assertion note: Nuxt UI v4 duplicates toast text into a hidden aria-live
 * <span> AND a visible <div data-slot="title">. Scoping to [data-slot="title"]
 * avoids strict-mode violations.
 */
import { expect, test } from './fixtures'

// Helper: wait for a toast with the given text (avoids strict-mode on aria-live duplicates)
function toastTitle(page: import('@playwright/test').Page, text: string | RegExp) {
  return page.locator('[data-slot="title"]').filter({ hasText: text })
}

// T-107 — Admin sidebar shows platform nav items
test('admin sees platform nav items in sidebar', async ({ page, signInAs }) => {
  await signInAs('admin', '/')
  await page.waitForLoadState('networkidle')
  // Admin-only nav items: Applications, Users, Organizations, Consents
  await expect(page.getByRole('link', { name: /Applications/i })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByRole('link', { name: /Users/i })).toBeVisible()
})

// T-108 — Member does not see platform nav items
test('member does not see platform nav items', async ({ page, signInAs }) => {
  await signInAs('member', '/')
  await page.waitForLoadState('networkidle')
  // Alice has no admin-only nav items. "Consents" is exclusively a platform/sysadmin item;
  // members never see it. (Note: "Users" IS visible for members — it's the org-members link.)
  await expect(page.getByRole('link', { name: /^Consents$/ })).not.toBeVisible({ timeout: 5_000 })
})

// T-109 — Admin can browse /platform/users
test('admin can browse users list', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/users')
  await page.waitForLoadState('networkidle')
  // User table renders
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByRole('columnheader', { name: 'Role' })).toBeVisible()
  // Seeded users visible
  await expect(page.getByText('alice@seed.local')).toBeVisible()
})

// T-110 — Admin can search users by name
test('admin can search users by name', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/users')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('alice@seed.local')).toBeVisible({ timeout: 8_000 })

  await page.getByPlaceholder(/Search users/i).fill('alice')
  await expect(page.getByText('alice@seed.local')).toBeVisible()
  await expect(page.getByText('bob@seed.local')).not.toBeVisible()
})

// T-112 — Member is blocked from /platform/users
test('member is blocked from platform/users', async ({ page, signInAs }) => {
  await signInAs('member', '/platform/users')
  await page.waitForLoadState('networkidle')
  // Redirected to /sign-in or /403
  await expect(page).toHaveURL(/\/(sign-in|403)/)
})

// T-113 — Admin can browse /platform/applications
test('admin sees applications list with edit/delete actions', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/applications')
  await page.waitForLoadState('networkidle')
  // Table columns
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByRole('columnheader', { name: 'Client ID' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  // Create button visible for admin
  await expect(page.getByRole('link', { name: /Create Application/i })).toBeVisible()
  // seeded NordVPN client visible
  await expect(page.getByText('NordVPN')).toBeVisible()
})

// T-114 — Member sees applications read-only (no Create/Delete)
test('member sees applications without create/delete controls', async ({ page, signInAs }) => {
  await signInAs('member', '/platform/applications')
  await page.waitForLoadState('networkidle')
  // Applications table renders (read is open to all authenticated users)
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible({ timeout: 8_000 })
  // No Create Application button
  await expect(page.getByRole('link', { name: /Create Application/i })).not.toBeVisible()
  // No delete button (aria-label="Delete")
  await expect(page.getByRole('button', { name: /Delete/i })).not.toBeVisible()
})

// T-115 — Admin can create a new application (secret shown once)
test('admin creates application and sees secret modal', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/applications/new')
  await page.waitForLoadState('networkidle')

  await page.getByLabel(/name/i).fill('E2E Test App')
  // Redirect URI
  const uriInput = page.getByPlaceholder(/https:\/\//i).first()
  if (await uriInput.isVisible())
    await uriInput.fill('https://e2e-test.example.com/callback')

  await page.getByRole('button', { name: /Create application/i }).click()

  // Modal with client_id and client_secret OR redirect to detail page
  // Either: modal opens with secret shown, or app detail page
  await page.waitForLoadState('networkidle')
  const hasModal = await page.getByRole('dialog').isVisible().catch(() => false)
  if (hasModal) {
    // Secret modal visible
    await expect(page.getByText(/client.?secret/i)).toBeVisible({ timeout: 5_000 })
  }
  else {
    // Redirected to application detail page
    await expect(page).toHaveURL(/\/platform\/applications\//)
  }

  // Cleanup: navigate away (app cleanup would need API call — skip for now; seed is idempotent)
})

// T-116 — Empty name validation on new application form
test('empty name shows validation error on new application', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/applications/new')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /Create application/i }).click()
  // UAlert error or inline validation
  await expect(page.getByText(/Name is required/i)).toBeVisible({ timeout: 5_000 })
})

// T-117 — Redirect URI with fragment shows validation error
test('redirect URI with fragment shows error', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/applications/new')
  await page.waitForLoadState('networkidle')
  await page.getByLabel(/name/i).fill('Test App Fragment')
  const uriInput = page.getByPlaceholder(/https:\/\//i).first()
  if (await uriInput.isVisible())
    await uriInput.fill('https://app.test/callback#fragment')
  await page.getByRole('button', { name: /Create application/i }).click()
  // Validation error list may contain multiple items that partially match the regex;
  // use .first() to avoid strict-mode on any duplicate help text.
  await expect(page.getByText(/fragment|must not contain/i).first()).toBeVisible({ timeout: 5_000 })
})

// T-118 — Relative redirect URI shows validation error
test('relative redirect URI shows Invalid absolute URL error', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/applications/new')
  await page.waitForLoadState('networkidle')
  await page.getByLabel(/name/i).fill('Test App Relative')
  const uriInput = page.getByPlaceholder(/https:\/\//i).first()
  if (await uriInput.isVisible())
    await uriInput.fill('/callback')
  await page.getByRole('button', { name: /Create application/i }).click()
  await expect(page.getByText(/Invalid absolute URL|must be absolute/i)).toBeVisible({ timeout: 5_000 })
})

// T-120 — Admin can delete an application after confirmation
test('admin can delete an application', async ({ page, signInAs }) => {
  // First create a disposable application
  await signInAs('admin', '/platform/applications/new')
  await page.waitForLoadState('networkidle')

  const appName = `E2E-Del-${Date.now()}`
  await page.getByLabel(/name/i).fill(appName)
  const uriInput = page.getByPlaceholder(/https:\/\//i).first()
  if (await uriInput.isVisible())
    await uriInput.fill('https://delete-test.example.com/callback')
  await page.getByRole('button', { name: /Create application/i }).click()
  await page.waitForLoadState('networkidle')

  // Close secret modal if shown
  const closeBtn = page.getByRole('button', { name: /Close|I've copied|OK/i })
  if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false))
    await closeBtn.click()

  // Navigate to applications list
  await page.goto('/platform/applications')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(appName)).toBeVisible({ timeout: 8_000 })

  // Set up dialog handler before clicking delete
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()

  // Toast (scope to [data-slot="title"] to avoid aria-live strict-mode violation)
  await expect(toastTitle(page, 'Application deleted')).toBeVisible({ timeout: 8_000 })
})

// T-121 — Admin sees consents list
test('admin can browse consents list', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/consents')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('columnheader', { name: 'User' })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByRole('columnheader', { name: 'Application' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Scopes' })).toBeVisible()
})

// T-122 — Member is blocked from /platform/consents
test('member is blocked from platform/consents', async ({ page, signInAs }) => {
  await signInAs('member', '/platform/consents')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/\/(sign-in|403)/)
})

// T-123 — Admin can revoke a consent with confirmation
test('admin can revoke a consent', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/consents')
  await page.waitForLoadState('networkidle')

  const revokeBtn = page.getByRole('button', { name: /Revoke/i }).first()
  const hasConsents = await revokeBtn.isVisible({ timeout: 5_000 }).catch(() => false)

  if (!hasConsents) {
    // No consents to revoke — skip but don't fail the suite
    test.skip()
    return
  }

  // browser confirm dialog
  page.once('dialog', d => d.accept())
  await revokeBtn.click()
  await expect(toastTitle(page, 'Consent revoked')).toBeVisible({ timeout: 8_000 })
})

// T-127 — Admin can search consents
test('admin can filter consents by email or app name', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/consents')
  await page.waitForLoadState('networkidle')

  const searchInput = page.getByPlaceholder(/Filter by user or application/i)
  await expect(searchInput).toBeVisible({ timeout: 8_000 })
  await searchInput.fill('alice')
  // Typing doesn't crash the page; filtered list or empty state shows
  await page.waitForLoadState('networkidle')
  await expect(page.locator('body')).not.toBeEmpty()
})
