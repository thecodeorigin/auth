/**
 * auth.spec.ts — Authentication flows
 * Covers: T-006 to T-030 (playwright rows)
 * Skips: T-023 (OIDC resume — needs real OIDC client), T-039/T-040 (external RPs)
 *
 * Root cause of form interaction failures:
 *   Nuxt 4 SSR delivers HTML immediately; the @nuxt/ui chunk containing UForm
 *   is loaded lazily. In dev mode, the lazy chunk may finish loading after
 *   waitForLoadState('networkidle'). Until it loads, the <form> has no
 *   Vue @submit.prevent handler — clicking the submit button triggers a native
 *   GET form submission which reloads the page and clears all fills.
 *
 * Fix: after networkidle, call waitForFormReady() which polls for Vue's internal
 * event-invoker property (_vei.submit) on the form element. Once that key exists
 * the UForm component has mounted and its @submit handler is live.
 */
import { expect, test } from './fixtures'

/**
 * Wait until Vue has hydrated the page's UForm component.
 *
 * Vue 3 uses a Symbol("_vei") key (not the string "_vei") for event invokers
 * and sets __vueParentComponent on DOM nodes it mounts/patches. We check
 * __vueParentComponent on the first <form> element as a reliable hydration signal.
 */
async function waitForFormReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(
    () => {
      const form = document.querySelector('form')
      if (!form)
        return false
      // Vue 3 sets __vueParentComponent (non-enumerable) on DOM elements it owns
      return !!(form as Record<string, unknown>).__vueParentComponent
    },
    null,
    { timeout: 10_000, polling: 100 },
  )
}

// T-006 — agent sign-in honours deep-link redirect
test('agent sign-in redirects to deep-link target', async ({ page, signInAs }) => {
  await signInAs('member', '/account/products/nordpass')
  await expect(page).toHaveURL(/\/account\/products\/nordpass/)
})

// T-007 — email/password sign-in success
test('email/password sign-in lands authenticated', async ({ page }) => {
  await page.goto('/sign-in')
  await waitForFormReady(page)
  await page.locator('input[type="email"]').fill('alice@seed.local')
  await page.locator('input[type="password"]').fill('Passw0rd!')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Alice Member' })).toBeVisible()
})

// T-008 — wrong password shows inline error
test('wrong password shows inline error', async ({ page }) => {
  await page.goto('/sign-in')
  await waitForFormReady(page)
  await page.locator('input[type="email"]').fill('alice@seed.local')
  await page.locator('input[type="password"]').fill('wrongpassword')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  // UAlert rendered by onSubmit when API returns an error
  // Nuxt UI v4 UAlert does not carry role="alert"; match on the error text instead
  await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 10_000 })
})

// T-010 — empty email shows Zod validation error
test('empty email shows validation error', async ({ page }) => {
  await page.goto('/sign-in')
  await waitForFormReady(page)
  // leave email empty, fill only password
  await page.locator('input[type="password"]').fill('Passw0rd!')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('Enter a valid email')).toBeVisible({ timeout: 8_000 })
})

// T-011 — empty password shows Zod validation error
test('empty password shows validation error', async ({ page }) => {
  await page.goto('/sign-in')
  await waitForFormReady(page)
  await page.locator('input[type="email"]').fill('alice@seed.local')
  // leave password empty
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('Password is required')).toBeVisible({ timeout: 8_000 })
})

// T-012 — invalid email format shows Zod validation error
test('invalid email format shows validation error on sign-in', async ({ page }) => {
  await page.goto('/sign-in')
  await waitForFormReady(page)
  await page.locator('input[type="email"]').fill('notanemail')
  await page.locator('input[type="password"]').fill('Passw0rd!')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('Enter a valid email')).toBeVisible({ timeout: 8_000 })
})

// T-013 — sign-up success shows "Check your email" state
test('sign-up with new email shows check-your-email state', async ({ page }) => {
  const unique = `e2e-signup-${Date.now()}@example.com`
  await page.goto('/sign-up')
  await waitForFormReady(page)
  // Name is the first input (autofocus), fill in order
  await page.locator('input').first().fill('E2E Test User')
  await page.locator('input[type="email"]').fill(unique)
  await page.locator('input[type="password"]').fill('Secure123!')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(unique)).toBeVisible()
})

// T-014 — duplicate email on sign-up: better-auth with requireEmailVerification:true
// shows "Check your email" for all addresses (no email enumeration by design).
test('duplicate email on sign-up shows check-your-email state', async ({ page }) => {
  await page.goto('/sign-up')
  await waitForFormReady(page)
  await page.locator('input').first().fill('Alice')
  await page.locator('input[type="email"]').fill('alice@seed.local')
  await page.locator('input[type="password"]').fill('Passw0rd!')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  // Security design: never reveal whether an email is already registered
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({ timeout: 15_000 })
})

// T-015 — empty name shows Zod validation error on sign-up
test('empty name shows validation error on sign-up', async ({ page }) => {
  await page.goto('/sign-up')
  await waitForFormReady(page)
  // leave name empty, fill email and password
  await page.locator('input[type="email"]').fill('test@example.com')
  await page.locator('input[type="password"]').fill('Secure123!')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page.getByText('Name is required')).toBeVisible({ timeout: 8_000 })
})

// T-016 — short password shows Zod validation error on sign-up
test('short password shows validation error on sign-up', async ({ page }) => {
  await page.goto('/sign-up')
  await waitForFormReady(page)
  await page.locator('input').first().fill('Test User')
  await page.locator('input[type="email"]').fill('test@example.com')
  await page.locator('input[type="password"]').fill('short')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page.getByText('At least 8 characters')).toBeVisible({ timeout: 8_000 })
})

// T-017 — invalid email format shows Zod validation error on sign-up
test('invalid email format on sign-up shows error', async ({ page }) => {
  await page.goto('/sign-up')
  await waitForFormReady(page)
  await page.locator('input').first().fill('Test User')
  await page.locator('input[type="email"]').fill('bademail')
  await page.locator('input[type="password"]').fill('Secure123!')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page.getByText('Enter a valid email')).toBeVisible({ timeout: 8_000 })
})

// T-018 — resend email button appears in sent state
test('resend email button visible after sign-up', async ({ page }) => {
  const unique = `e2e-resend-${Date.now()}@example.com`
  await page.goto('/sign-up')
  await waitForFormReady(page)
  await page.locator('input').first().fill('Resend Test')
  await page.locator('input[type="email"]').fill(unique)
  await page.locator('input[type="password"]').fill('Secure123!')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({ timeout: 15_000 })
  const resendBtn = page.getByRole('button', { name: 'Resend email' })
  await expect(resendBtn).toBeVisible()
  await resendBtn.click()
  await expect(page.locator('p').filter({ hasText: /Verification email re-sent|Could not resend/ })).toBeVisible({ timeout: 8_000 })
})

// T-019 — sign out clears session and redirects to sign-in
test('sign out clears session', async ({ page, signInAs }) => {
  await signInAs('member', '/')
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 8_000 })
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in/)
})

// T-020 — anonymous / redirects to sign-in
test('anonymous root access redirects to sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in/)
})

// T-021 — session expired banner on sign-in
test('session-expired reason param shows warning banner', async ({ page }) => {
  await page.goto('/sign-in?reason=session_expired')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Your session expired')).toBeVisible({ timeout: 5_000 })
})

// T-022 — social sign-in buttons visible on sign-in page
test('social sign-in buttons visible', async ({ page }) => {
  await page.goto('/sign-in')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue with GitHub/i })).toBeVisible()
})

// T-024 — admin impersonates alice via user detail page
test('admin impersonates alice via user detail page', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/users')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('alice@seed.local')).toBeVisible({ timeout: 8_000 })

  // Click View user on alice's row
  const aliceRow = page.locator('tr').filter({ hasText: 'alice@seed.local' })
  await aliceRow.getByRole('link', { name: 'View user' }).click()
  await page.waitForLoadState('networkidle')

  // Impersonation card button — scoped to the main content panel by its id
  // avoids strict-mode conflict with the sidebar "Impersonate" popover trigger
  const panel = page.locator('#dashboard-panel-platform-user-detail')
  await expect(panel.getByRole('button', { name: 'Impersonate' })).toBeVisible({ timeout: 8_000 })
  await panel.getByRole('button', { name: 'Impersonate' }).click()

  // Page reloads at / with impersonation active
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(/alice@seed\.local/)).toBeVisible({ timeout: 10_000 })

  // Stop impersonating — cleanup
  await page.getByRole('button', { name: 'Stop' }).click()
  await page.waitForLoadState('networkidle')
})

// T-025 — stop impersonating restores admin session
test('stop impersonating restores admin session', async ({ page, signInAs }) => {
  await signInAs('admin', '/platform/users')
  await page.waitForLoadState('networkidle')

  const aliceRow = page.locator('tr').filter({ hasText: 'alice@seed.local' })
  await aliceRow.getByRole('link', { name: 'View user' }).click()
  await page.waitForLoadState('networkidle')

  const panel = page.locator('#dashboard-panel-platform-user-detail')
  await expect(panel.getByRole('button', { name: 'Impersonate' })).toBeVisible({ timeout: 8_000 })
  await panel.getByRole('button', { name: 'Impersonate' }).click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Stop' }).click()
  await page.waitForLoadState('networkidle')

  // Admin session restored — user menu shows admin name
  await expect(page.getByRole('button', { name: 'System Admin' })).toBeVisible({ timeout: 8_000 })
})

// T-026 — profile name update
test('member can update profile name', async ({ page, signInAs }) => {
  await signInAs('member', '/account/profile')
  await page.waitForLoadState('networkidle')
  const nameInput = page.getByLabel('Name')
  await expect(nameInput).toBeVisible({ timeout: 8_000 })
  await nameInput.fill('Alice Updated')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Profile updated', { exact: true })).toBeVisible({ timeout: 5_000 })
  // restore
  await nameInput.fill('Alice Member')
  await page.getByRole('button', { name: 'Save changes' }).click()
})

// T-027 — email field is read-only on profile page
test('email field is read-only on profile page', async ({ page, signInAs }) => {
  await signInAs('member', '/account/profile')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('input[disabled]').first()).toBeVisible({ timeout: 8_000 })
})

// T-028 — password mismatch shows validation error
test('password mismatch shows validation error', async ({ page, signInAs }) => {
  await signInAs('member', '/account/security')
  await page.waitForLoadState('networkidle')
  const pwInputs = page.locator('input[type="password"]')
  await expect(pwInputs.first()).toBeVisible()
  await pwInputs.nth(0).fill('Passw0rd!')
  await pwInputs.nth(1).fill('NewSecure1!')
  await pwInputs.nth(2).fill('DifferentPass!')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText(/Passwords do not match/i)).toBeVisible({ timeout: 5_000 })
})
