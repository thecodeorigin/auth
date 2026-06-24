/**
 * plans.spec.ts — Plans browse page
 * Covers: T-074, T-105
 *
 * Catalog has 6 plans: nordvpn-complete, dark-web-monitor, nordpass-premium,
 * nordpass-family, nordlocker-free, nordlocker-premium
 */
import { expect, test } from './fixtures'

test.describe('plans page', () => {
  // T-074 — Plans page renders plan cards with names, prices and "View product" button
  test('plans page shows plan cards with View product links', async ({ page, signInAs }) => {
    await signInAs('member', '/account/plans')
    await page.waitForLoadState('networkidle')

    // All 6 plans should have a "View product" link
    const viewButtons = page.getByRole('link', { name: /View product/i })
    await expect(viewButtons.first()).toBeVisible({ timeout: 8_000 })
    const count = await viewButtons.count()
    expect(count).toBeGreaterThanOrEqual(6)

    // Specific plans visible
    await expect(page.getByText('NordVPN Complete')).toBeVisible()
    await expect(page.getByText('NordPass Family')).toBeVisible()
    await expect(page.getByText('NordLocker Free, 3 GB')).toBeVisible()
  })

  // T-105 — NordLocker Free shows price "Free" with no billing interval suffix
  test('NordLocker Free shows "Free" with no billing interval', async ({ page, signInAs }) => {
    await signInAs('member', '/account/plans')
    await page.waitForLoadState('networkidle')

    // Scope to the specific plan card by navigating from the h3 heading up to
    // the UCard root (h3 → div.flex → UCard body → UCard root).
    // This avoids strict-mode issues caused by "NordLocker Free" text appearing
    // in multiple elements across the page.
    const card = page.locator('h3').filter({ hasText: 'NordLocker Free' }).locator('../../..')

    // The price <p> element contains exactly "Free" (priceCents=0 → price()="Free",
    // billingInterval='none' → no /month suffix rendered).
    // exact: true ensures we don't match the h3 "NordLocker Free, 3 GB" heading.
    await expect(card.getByText('Free', { exact: true })).toBeVisible({ timeout: 8_000 })
    await expect(card.getByText('/month')).not.toBeVisible()
    await expect(card.getByText('/year')).not.toBeVisible()
  })

  // View product button navigates to the correct product page
  test('View product on NordVPN Complete navigates to nordvpn page', async ({ page, signInAs }) => {
    await signInAs('member', '/account/plans')
    await page.waitForLoadState('networkidle')

    // Scope to the NordVPN Complete card (h3 → div.flex → body → card root).
    // Using locator('div').filter() on the outer div matches the whole grid;
    // going up from h3 targets only the specific card container.
    const card = page.locator('h3').filter({ hasText: 'NordVPN Complete' }).locator('../../..')
    await card.getByRole('link', { name: /View product/i }).click()
    await expect(page).toHaveURL(/\/account\/products\/nordvpn/)
  })
})
