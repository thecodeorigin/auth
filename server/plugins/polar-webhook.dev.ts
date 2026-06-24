// Dev-only: own an ngrok tunnel and reconcile a Polar (sandbox) webhook to its
// current URL on every boot, then inject the signing secret into runtimeConfig.
// serverAuth() rebuilds betterAuth() per request (D1 present → no cache), so the
// mutated polarWebhookSecret is honored by the webhooks() subplugin immediately.
// Silently no-ops without a Polar access token or ngrok authtoken (offline dev).
export default defineNitroPlugin(async (nitroApp) => {
  if (!import.meta.dev)
    return
  const rc = useRuntimeConfig()
  const ngrokAuthtoken = (rc.ngrok as { authtoken?: string } | undefined)?.authtoken || process.env.NUXT_NGROK_AUTHTOKEN
  if (!rc.polarAccessToken || !ngrokAuthtoken)
    return // offline dev: skip silently (everything else still works)

  // Computed specifier + @vite-ignore so Rollup never bundles @ngrok/ngrok (native
  // .node bindings can't compile for the Cloudflare Workers build). Dev-only: the
  // import.meta.dev guard above means this line never runs in production.
  const ngrokModule = '@ngrok/ngrok'
  const { connect } = await import(/* @vite-ignore */ ngrokModule)
  const port = Number(process.env.NITRO_PORT || process.env.PORT || 3000)
  let listener: Awaited<ReturnType<typeof connect>>
  try {
    listener = await connect({ addr: port, authtoken: ngrokAuthtoken })
  }
  catch (error) {
    console.error('[polar] ngrok tunnel failed — dev webhook not provisioned', error)
    return
  }

  const publicUrl = listener.url()
  if (!publicUrl) {
    console.warn('[polar] ngrok listener has no URL — dev webhook not provisioned')
    return
  }
  try {
    // runtimeConfig is read-only at runtime → stash on a global the auth config reads.
    setDevWebhookSecret(await ensureDevPolarWebhook(rc.polarAccessToken, publicUrl))
    console.log('[polar] tunnel + webhook ready →', `${publicUrl}/api/auth/polar/webhooks`)
  }
  catch (error) {
    console.error('[polar] dev webhook auto-provision failed', error)
  }

  nitroApp.hooks.hook('close', async () => {
    await listener.close().catch(() => {})
  })
})
