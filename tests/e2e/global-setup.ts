import process from 'node:process'

/**
 * Seed the demo data before the e2e run so every spec has deterministic state:
 * system admin, demo org + dynamic role, alice/bob/admin users, Nord OAuth
 * clients, Nord subscriptions (incl. NordPass Family 6/6), and the authz fixture.
 * Idempotent — safe to re-run.
 */
const TASKS = ['seed:idp', 'seed:subscriptions', 'seed:authz-fixtures']

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL || 'http://localhost:3000'
  for (const task of TASKS) {
    const res = await fetch(`${base}/_nitro/tasks/${task}`, { method: 'POST' })
    if (!res.ok)
      throw new Error(`Seed task ${task} failed: ${res.status} ${await res.text()}`)
    console.log(`[e2e seed] ${task} ok`)
  }
}
