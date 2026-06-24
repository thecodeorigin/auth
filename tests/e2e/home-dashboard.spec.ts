/**
 * home-dashboard.spec.ts — Home page product cards and sidebar widgets
 * Covers: T-055 to T-062
 * Alice's seeded subs: nordvpn-complete (expired), dark-web-monitor (expired),
 * nordpass-premium (active), nordpass-family (active), nordlocker-free (active)
 */
import { expect, test } from './fixtures'

test.describe('home dashboard as member (alice)', () => {
  // T-055 — product cards visible for alice's subs
  test('product cards render for alice subscriptions', async ({ page, signInAs }) => {
    await signInAs('member', '/')
    await page.waitForLoadState('networkidle')
    // Alice has subs spanning nordvpn, dark-web-monitor, nordpass, nordlocker
    // SubscriptionProductCard renders one per subscription
    await expect(page.getByText('Products and services')).toBeVisible({ timeout: 8_000 })
    // At least 4 distinct product names should appear in the card list.
    // Use .first() to avoid strict-mode violations where multiple elements share
    // the same substring (e.g. "NordPass Family" and "NordPass Premium" both match "NordPass").
    await expect(page.getByText('NordVPN').first()).toBeVisible()
    await expect(page.getByText('NordPass').first()).toBeVisible()
    await expect(page.getByText('NordLocker').first()).toBeVisible()
    await expect(page.getByText('Dark Web Monitor').first()).toBeVisible()
  })

  // T-056 — expiry banner shown for expired nordvpn-complete sub
  test('expiry banner visible for expired subscription', async ({ page, signInAs }) => {
    await signInAs('member', '/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/subscription has expired/i)).toBeVisible({ timeout: 8_000 })
    // The icon and product name (NordVPN or Dark Web Monitor — first expired)
    await expect(page.locator('[class*="text-error"]').first()).toBeVisible()
  })

  // T-057 — Renew button navigates to correct product page
  test('expiry banner Renew button navigates to product page', async ({ page, signInAs }) => {
    await signInAs('member', '/')
    await page.waitForLoadState('networkidle')
    // UButton with :to renders as <button> or <a> depending on Nuxt UI v4 context —
    // target by text content to be role-agnostic.
    const renewBtn = page.locator('a, button').filter({ hasText: /^Renew$/ }).first()
    await expect(renewBtn).toBeVisible({ timeout: 8_000 })
    await renewBtn.click()
    // Should navigate to either /account/products/nordvpn or /account/products/dark-web-monitor
    await expect(page).toHaveURL(/\/account\/products\/(nordvpn|dark-web-monitor)/)
  })

  // T-059 — Account settings sidebar card links to /account/profile
  test('Account settings card Manage account links to profile', async ({ page, signInAs }) => {
    await signInAs('member', '/')
    await page.waitForLoadState('networkidle')
    const link = page.getByRole('link', { name: /Manage account/i })
    await expect(link).toBeVisible({ timeout: 8_000 })
    await link.click()
    await expect(page).toHaveURL(/\/account\/profile/)
  })

  // T-060 — Available plans sidebar card links to /account/plans
  test('Available plans card View plans links to plans page', async ({ page, signInAs }) => {
    await signInAs('member', '/')
    await page.waitForLoadState('networkidle')
    const link = page.getByRole('link', { name: /View plans/i })
    await expect(link).toBeVisible({ timeout: 8_000 })
    await link.click()
    await expect(page).toHaveURL(/\/account\/plans/)
  })

  // T-061 — Home navbar title reads "Home"
  test('home page navbar title is Home', async ({ page, signInAs }) => {
    await signInAs('member', '/')
    await page.waitForLoadState('networkidle')
    // DashboardNavbar renders the title as a heading or text element
    await expect(page.getByText('Home').first()).toBeVisible({ timeout: 8_000 })
  })

  // T-062 — admin home dashboard shows subscription cards
  test('admin home dashboard shows subscription cards', async ({ page, signInAs }) => {
    await signInAs('admin', '/')
    await page.waitForLoadState('networkidle')
    // seed:subscriptions also seeds admin@thecodeorigin.com
    await expect(page.getByText('Products and services')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('NordVPN').first()).toBeVisible()
    // NordPass appears in multiple plan names — match first occurrence
    await expect(page.getByText('NordPass').first()).toBeVisible()
  })
})
