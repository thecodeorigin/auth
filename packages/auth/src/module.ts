import { addImportsDir, addPlugin, addRouteMiddleware, addServerHandler, addServerImportsDir, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'

export interface AuthRoutes {
  signIn: string
  callback: string
  signOut: string
  home: string
  error: string
}

export interface ModuleOptions {
  domain: string
  clientId: string
  clientSecret: string
  issuer?: string
  scopes?: string[]
  sessionStorageBase?: string
  sessionCookieName?: string
  routes?: Partial<AuthRoutes>
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@thecodeorigin/auth', configKey: 'auth' },
  defaults: {
    domain: '',
    clientId: '',
    clientSecret: '',
    scopes: ['openid', 'profile', 'email'],
    sessionStorageBase: 'auth',
    sessionCookieName: 'tco_auth',
    routes: { signIn: '/auth/sign-in', callback: '/auth/callback', signOut: '/auth/sign-out', home: '/', error: '/auth/sign-in' },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const routes = options.routes as AuthRoutes
    const issuer = options.issuer || (options.domain ? `https://${options.domain}/api/auth` : '')

    ;(nuxt.options.runtimeConfig as Record<string, unknown>).auth = defu(
      (nuxt.options.runtimeConfig as Record<string, unknown>).auth as object | undefined,
      { clientSecret: options.clientSecret, sessionStorageBase: options.sessionStorageBase, sessionCookieName: options.sessionCookieName },
    )
    ;(nuxt.options.runtimeConfig.public as Record<string, unknown>).auth = defu(
      (nuxt.options.runtimeConfig.public as Record<string, unknown>).auth as object | undefined,
      { domain: options.domain, clientId: options.clientId, issuer, scopes: options.scopes, routes },
    )

    addServerHandler({ route: routes.signIn, handler: resolver.resolve('./runtime/server/routes/sign-in.get') })
    addServerHandler({ route: routes.callback, handler: resolver.resolve('./runtime/server/routes/callback.get') })
    addServerHandler({ route: routes.signOut, handler: resolver.resolve('./runtime/server/routes/sign-out.get') })

    for (const [route, file] of [
      ['/api/_auth/session', 'session.get'],
      ['/api/_auth/organizations', 'organizations.get'],
      ['/api/_auth/organizations/switch', 'organizations/switch.post'],
      ['/api/_auth/impersonatable-users', 'impersonatable-users.get'],
      ['/api/_auth/impersonate', 'impersonate.post'],
      ['/api/_auth/stop-impersonating', 'stop-impersonating.post'],
    ] as const)
      addServerHandler({ route, handler: resolver.resolve(`./runtime/server/api/_auth/${file}`) })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addImportsDir(resolver.resolve('./runtime/app/composables'))
    addRouteMiddleware({ name: 'auth', path: resolver.resolve('./runtime/app/middleware/auth.global'), global: true })
    addRouteMiddleware({ name: 'casl', path: resolver.resolve('./runtime/app/middleware/casl.global'), global: true })
    addPlugin(resolver.resolve('./runtime/app/plugins/0.session'))
    addPlugin(resolver.resolve('./runtime/app/plugins/ability'))

    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolver.resolve('./runtime/types.d.ts') })
    })
  },
})
