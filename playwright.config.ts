import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'

/**
 * E2E config for the Nord Account portal. Browser flows live in tests/e2e/.
 * Cross-application OIDC flows stay as node proof scripts in examples/.
 *
 * The dev server is started with NUXT_DEMO_MODE=true so the dev-only
 * "sign in as agent" endpoint (/api/_agent/sign-in) is available to the suite;
 * globalSetup seeds the demo data first.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NUXT_DEMO_MODE: 'true' },
  },
})
