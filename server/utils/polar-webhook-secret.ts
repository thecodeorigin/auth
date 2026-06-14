// Dev-only bridge for the auto-provisioned Polar webhook secret. Nitro's
// runtimeConfig is read-only at runtime, so the dev plugin (polar-webhook.dev.ts)
// can't write polarWebhookSecret into it. Instead it stashes the secret on a
// process global, and auth.config reads it as a fallback. serverAuth() rebuilds
// betterAuth() per request (D1 present → no cache), so the webhooks() subplugin
// picks up the secret on the actual webhook POST.
const KEY = '__polarDevWebhookSecret'

export function setDevWebhookSecret(secret: string): void {
  ;(globalThis as Record<string, unknown>)[KEY] = secret
}

export function getDevWebhookSecret(): string | undefined {
  return (globalThis as Record<string, unknown>)[KEY] as string | undefined
}
