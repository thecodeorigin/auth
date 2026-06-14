import { Polar } from '@polar-sh/sdk'

const MANAGED_NAME = 'auth-hub dev (auto)' // tag so we only ever touch OUR endpoints
const WEBHOOK_PATH = '/api/auth/polar/webhooks'
const EVENTS = [
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'subscription.past_due',
  'order.paid',
] as const

interface ManagedEndpoint { id: string, url: string, name?: string | null }

/**
 * Reconcile the Polar (sandbox) webhook for the current dev URL and return a
 * usable signing secret. Idempotent across restarts:
 *   - deletes our stale managed endpoints (old ngrok URLs)
 *   - if an endpoint already targets this URL → reset its secret (recovers one)
 *   - else create it
 * Polar does not require the URL to be live at call time.
 */
export async function ensureDevPolarWebhook(accessToken: string, publicBaseUrl: string): Promise<string> {
  const polar = new Polar({ accessToken, server: 'sandbox' })
  const url = `${publicBaseUrl.replace(/\/$/, '')}${WEBHOOK_PATH}`

  // List all endpoints (handle pagination defensively across SDK shapes).
  const all: ManagedEndpoint[] = []
  const pager = await polar.webhooks.listWebhookEndpoints({})
  for await (const page of pager) {
    const p = page as unknown as { result?: { items?: ManagedEndpoint[] }, items?: ManagedEndpoint[] }
    const items = p.result?.items ?? p.items ?? []
    for (const e of items) all.push(e)
  }

  const ours = all.filter(e => e.name === MANAGED_NAME)
  const match = ours.find(e => e.url === url)

  // Clean stale managed endpoints (previous runs' URLs) — never deletes non-managed ones.
  for (const e of ours) {
    if (e.id !== match?.id)
      await polar.webhooks.deleteWebhookEndpoint({ id: e.id }).catch(() => {})
  }

  if (match) {
    const reset = await polar.webhooks.resetWebhookEndpointSecret({ id: match.id })
    return reset.secret
  }
  const created = await polar.webhooks.createWebhookEndpoint({
    url,
    name: MANAGED_NAME,
    format: 'raw',
    events: EVENTS as unknown as string[] as never, // SDK WebhookEventType enum
    // organizationId: <orgId>  // ONLY if polarAccessToken is a personal (non-org) token
  })
  return created.secret
}
