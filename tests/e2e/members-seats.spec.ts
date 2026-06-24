/**
 * members-seats.spec.ts — Members card: search, pagination, add seat, remove member
 * Covers: T-076 to T-090
 *
 * Seeded state for nordpass-family (alice owns):
 *   Owner:   alice@seed.local
 *   Members: hao100319@gmail.com, quangtudng@gmail.com, longnt189@gmail.com,
 *            datntt98@gmail.com, minhpt2002@gmail.com
 *   Total: 6/6 seats
 *
 * IMPORTANT: Tests share alice's nordpass-family subscription (mutable state).
 * They run SERIAL to prevent parallel interference. All mutations clean up in
 * the same test so the suite stays idempotent on re-run.
 *
 * Toast assertion note: Nuxt UI v4 duplicates toast text into a hidden
 * aria-live <span> AND the visible toast <div data-slot="title">. Using the
 * text alone triggers a Playwright strict-mode violation (2 elements found).
 * We scope to [data-slot="title"] to target only the visible toast.
 */
import { expect, test } from './fixtures'

// Helper: wait for a toast with the given text (avoids strict-mode on aria-live duplicates)
function toastTitle(page: import('@playwright/test').Page, text: string | RegExp) {
  return page.locator('[data-slot="title"]').filter({ hasText: text })
}

test.describe('nordpass Members card', () => {
  test.describe.configure({ mode: 'serial' })

  // T-076 — Owner row shows alice email and "Plan owner" label
  test('owner row shows alice email and Plan owner label', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('alice@seed.local')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Plan owner')).toBeVisible()
  })

  // T-077 — Members header shows 6/6
  test('Members header shows 6/6', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    // Header text: "Members (6/6)"
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })
  })

  // T-078 — search filters by email substring
  test('search by email substring filters members', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })

    const searchInput = page.getByPlaceholder('Search email')
    await searchInput.fill('quang')
    // Only quangtudng@gmail.com should be visible
    await expect(page.getByText('quangtudng@gmail.com')).toBeVisible()
    await expect(page.getByText('hao100319@gmail.com')).not.toBeVisible()
    await expect(page.getByText('longnt189@gmail.com')).not.toBeVisible()
  })

  // T-079 — search is case-insensitive
  test('search is case-insensitive', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })

    const searchInput = page.getByPlaceholder('Search email')
    await searchInput.fill('HAO')
    await expect(page.getByText('hao100319@gmail.com')).toBeVisible()
  })

  // T-080 — no results text when search yields nothing
  test('no-match search shows No members found', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })

    const searchInput = page.getByPlaceholder('Search email')
    await searchInput.fill('zzznomatch')
    await expect(page.getByText('No members found.')).toBeVisible()
    // Member rows hidden
    await expect(page.getByText('alice@seed.local')).not.toBeVisible()
  })

  // T-083 — add a new seat then remove it (self-cleaning)
  test('add seat adds member and remove cleans up', async ({ page, signInAs }) => {
    const uniqueEmail = `seat-${Date.now()}@example.com`
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })

    // Click "Add seat"
    await page.getByRole('button', { name: /Add seat/i }).click()

    // Modal opens
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByPlaceholder('member@email.com').fill(uniqueEmail)

    // Submit
    await page.getByRole('dialog').getByRole('button', { name: /Add seat/i }).click()

    // Toast success (scope to [data-slot="title"] to avoid aria-live strict violation)
    await expect(toastTitle(page, 'Member added')).toBeVisible({ timeout: 8_000 })

    // Wait for modal to fully close before locating the row
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })

    // Member appears in list
    await expect(page.getByText(uniqueEmail)).toBeVisible({ timeout: 5_000 })

    // Count incremented (should now be 7/6 or 7/7 if capacity also grew)
    await expect(page.getByText(/Members \(7\//)).toBeVisible()

    // --- CLEANUP: remove the seat we just added ---
    // Find row by locating the email <p> then going up 2 parents to the row div
    const emailP = page.locator('p').filter({ hasText: uniqueEmail })
    const memberRow = emailP.locator('../..')
    await memberRow.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText(uniqueEmail)).not.toBeVisible({ timeout: 5_000 })
  })

  // T-084 — Add seat confirm button disabled when email empty
  test('Add seat button disabled when email is empty', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })

    await page.getByRole('button', { name: /Add seat/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // Email field is empty
    const submitBtn = page.getByRole('dialog').getByRole('button', { name: /Add seat/i })
    await expect(submitBtn).toBeDisabled()
    // Close modal
    await page.getByRole('dialog').getByRole('button', { name: /Cancel/i }).click()
  })

  // T-086 — duplicate email shows error toast
  test('duplicate email in Add seat shows error toast', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })

    await page.getByRole('button', { name: /Add seat/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // Enter an already-present email
    await page.getByRole('dialog').getByPlaceholder('member@email.com').fill('hao100319@gmail.com')
    await page.getByRole('dialog').getByRole('button', { name: /Add seat/i }).click()

    // Error toast (scope to [data-slot="title"] to avoid aria-live strict violation)
    await expect(toastTitle(page, /already a member|Could not add member/i)).toBeVisible({ timeout: 8_000 })

    // Close modal if still open
    const dialog = page.getByRole('dialog')
    const isOpen = await dialog.isVisible()
    if (isOpen)
      await dialog.getByRole('button', { name: /Cancel/i }).click()
  })

  // T-088 — Enter key in email input submits the Add seat form
  test('Enter key in email input submits Add seat', async ({ page, signInAs }) => {
    const uniqueEmail = `seat-enter-${Date.now()}@example.com`
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })

    await page.getByRole('button', { name: /Add seat/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const emailInput = page.getByRole('dialog').getByPlaceholder('member@email.com')
    await emailInput.fill(uniqueEmail)
    await emailInput.press('Enter')

    await expect(toastTitle(page, 'Member added')).toBeVisible({ timeout: 8_000 })

    // Wait for modal to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(uniqueEmail)).toBeVisible({ timeout: 5_000 })

    // --- CLEANUP ---
    const emailP = page.locator('p').filter({ hasText: uniqueEmail })
    const memberRow = emailP.locator('../..')
    await memberRow.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText(uniqueEmail)).not.toBeVisible({ timeout: 5_000 })
  })

  // T-089 — Remove a non-owner member (self-cleaning: add then remove)
  test('remove non-owner member decrements count', async ({ page, signInAs }) => {
    const uniqueEmail = `seat-rm-${Date.now()}@example.com`
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 8_000 })

    // Add first
    await page.getByRole('button', { name: /Add seat/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByPlaceholder('member@email.com').fill(uniqueEmail)
    await page.getByRole('dialog').getByRole('button', { name: /Add seat/i }).click()
    await expect(toastTitle(page, 'Member added')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(uniqueEmail)).toBeVisible({ timeout: 5_000 })

    // Now remove
    const emailP = page.locator('p').filter({ hasText: uniqueEmail })
    const memberRow = emailP.locator('../..')
    await memberRow.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText(uniqueEmail)).not.toBeVisible({ timeout: 8_000 })

    // Count decremented back to 6/6 (serial mode guarantees clean start state)
    await expect(page.getByText('Members (6/6)')).toBeVisible({ timeout: 5_000 })
  })

  // T-090 — Owner row has no Remove button
  test('owner row has no Remove button', async ({ page, signInAs }) => {
    await signInAs('member', '/account/products/nordpass')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('alice@seed.local')).toBeVisible({ timeout: 8_000 })

    // Locate alice's email <p>, go up 2 parents to the row div (p → div.flex-1 → div.py-3)
    const ownerEmailP = page.locator('p').filter({ hasText: /^alice@seed\.local$/ }).first()
    const ownerRow = ownerEmailP.locator('../..')
    await expect(ownerRow.getByRole('button', { name: /Remove/i })).not.toBeVisible()
  })
})
