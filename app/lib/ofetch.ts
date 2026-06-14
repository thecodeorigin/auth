import type { $Fetch } from 'nitropack'

declare module 'ofetch' {
  interface FetchOptions {
    silent?: boolean
  }
}

function interpolatePath(path: string, params: Record<string, string>) {
  return path.replace(/:(\w+)/g, (match, key) => {
    if (key in params) {
      const val = params[key]
      delete params[key]
      return String(val)
    }
    return match
  })
}

/**
 * Same-origin fetch factory for the 6 custom Nitro routes (everything else uses
 * the better-auth client). Sends JSON, forwards cookies on SSR, attaches the
 * nuxt-security CSRF header, and bounces to /sign-in on a 401.
 */
export const $http = $fetch.create({
  headers: { 'Content-Type': 'application/json' },
  onRequest(context) {
    const { options } = context

    if (!options.silent && import.meta.client) {
      useLoadingIndicator().start()
    }

    if (typeof context.request === 'string' && options.query) {
      context.request = interpolatePath(context.request, options.query as Record<string, string>)
    }

    if (import.meta.server) {
      const headers = useRequestHeaders(['cookie'])
      options.headers = { ...options.headers, ...headers } as typeof options.headers
    }
    // Our custom Nitro routes (/api/auth/**, /api/orgs/**) are CSRF-exempt via
    // routeRules (SameSite=Lax cookies already block cross-origin submission),
    // so no double-submit token header is attached here.
  },
  onResponse(context) {
    if (!context.options.silent && import.meta.client) {
      useLoadingIndicator().finish()
    }
  },
  onResponseError(error) {
    if (!error.options.silent && import.meta.client) {
      useLoadingIndicator().finish({ error: true })
    }

    if (error?.response?.status === 401 && import.meta.client) {
      const path = useRoute().fullPath
      // Don't bounce on the auth surface itself.
      if (!path.startsWith('/sign-in')) {
        navigateTo(`/sign-in?redirect=${encodeURIComponent(path)}&reason=session_expired`)
      }
    }
  },
}) as $Fetch
