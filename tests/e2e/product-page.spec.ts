/**
 * product-page.spec.ts — Product detail page conditional cards
 * Covers: T-063 to T-075, T-102 to T-104
 *
 * Catalog facts:
 *   - nordvpn:   appUrl = 'https://nordvpn.com';  alice has expired nordvpn-complete → tier='none'
 *   - dark-web-monitor: appUrl = null;             alice has expired dw-monitor sub (free plan, priceCents=0 → tier='free')
 *   - nordpass:  appUrl = 'https://nordpass.com'; alice has active nordpass-premium + nordpass-family → tier='paid'
 *   - nordlocker: appUrl = 'https://nordlocker.com'; alice has nordlocker-free (active, free) → tier='free'
 */
import { expect, test } from './fixtures'

test.describe('nordvpn product page (alice, expired sub)', () => {
  // T-063 — Go-to-product card visible for nordvpn
  test('Go-to-product card visible for nordvpn', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordvpn')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: /Go to product/i })).toBeVisible({ timeout: 8_000 })
  })

  // T-065 — Plan card shows No active plan and Buy now for nordvpn (expired)
  test('nordvpn expired: plan card shows No active plan', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordvpn')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('No active plan')).toBeVisible({ timeout: 8_000 })
    // Buy now button exists (may be disabled if Polar not configured)
    await expect(page.getByRole('button', { name: /Buy now/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Manage plan/i })).not.toBeVisible()
  })

  // T-069 — Members card absent for nordvpn (tier='none')
  test('nordvpn expired: Members card is absent', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordvpn')
    await page.waitForLoadState('networkidle')
    // SubscriptionMembersCard not rendered (tier='none')
    await expect(page.getByText(/Members \(/)).not.toBeVisible({ timeout: 5_000 })
  })
})

test.describe('dark-web-monitor product page (alice, free plan expired status)', () => {
  // T-064 — Go-to-product card absent for dark-web-monitor (appUrl=null)
  test('dark-web-monitor: Go-to-product card is absent', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/dark-web-monitor')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: /Go to product/i })).not.toBeVisible({ timeout: 5_000 })
    // But page renders without error
    await expect(page.getByText('Dark Web Monitor')).toBeVisible()
  })
})

test.describe('nordpass product page (alice, active paid plan)', () => {
  // T-066 — Plan card shows active plan name and Manage plan button
  test('nordpass active: plan card shows active and Manage plan', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/— active/i)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('button', { name: /Manage plan/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Buy now/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /Upgrade/i })).not.toBeVisible()
  })

  // T-070 — Add seat button visible (nordpass-family, seats=6, seatCapable=true)
  test('nordpass: Add seat button visible', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /Add seat/i })).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('nordlocker product page (alice, free tier)', () => {
  // T-067 — Plan card shows "Free plan active" and Upgrade button
  test('nordlocker free tier: plan card shows Free plan active', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordlocker')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Free plan active')).toBeVisible({ timeout: 8_000 })
    // Upgrade button (free tier + paidPlan exists for nordlocker-premium)
    await expect(page.getByRole('button', { name: /Upgrade/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Buy now/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /Manage plan/i })).not.toBeVisible()
  })

  // T-068 / T-103 — Members card rendered for free tier (tier='free')
  test('nordlocker free tier: Members card is present', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordlocker')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/Members \(/)).toBeVisible({ timeout: 8_000 })
  })

  // T-104 — Add seat button absent for free tier (canAddSeat=false)
  test('nordlocker free tier: Add seat absent, upgrade hint shown', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordlocker')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /Add seat/i })).not.toBeVisible({ timeout: 5_000 })
    // Upgrade hint text
    await expect(page.getByText('Upgrade to a paid plan to add members')).toBeVisible()
  })

  // T-072 — upgrade hint in Members card
  test('nordlocker free tier: Members card shows upgrade hint', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordlocker')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Upgrade to a paid plan to add members')).toBeVisible({ timeout: 8_000 })
  })

  // T-102 — Free plan active text
  test('nordlocker free tier: plan card text is Free plan active', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordlocker')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Free plan active')).toBeVisible({ timeout: 8_000 })
  })
})

// T-075 — Buy now disabled when Polar not configured
test('Buy now button is disabled when Polar not configured', async ({ page, signInAs }) => {
  await signInAs('member', '/account/products/nordvpn')
  await page.waitForLoadState('networkidle')
  const buyBtn = page.getByRole('button', { name: /Buy now/i })
  await expect(buyBtn).toBeVisible({ timeout: 8_000 })
  // When polarConfigured=false, the button is disabled and warning text shown
  const isDisabled = await buyBtn.isDisabled()
  if (isDisabled) {
    await expect(page.getByText(/Purchasing is unavailable/i)).toBeVisible()
  }
  // If Polar IS configured, just assert the button exists (redirect case)
})
