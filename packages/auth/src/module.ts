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
  scopes?: string[]
  sessionStorageBase?: string
  sessionCookieName?: string
  routes?: Partial<AuthRoutes>
}

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    auth: {
      clientSecret: string
      sessionStorageBase: string
      sessionCookieName: string
    }
  }
  interface PublicRuntimeConfig {
    auth: {
      domain: string
      clientId: string
      routes: AuthRoutes
      scopes: string[]
    }
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@thecodeorigin/auth', configKey: 'auth' },
  defaults: {
    domain: '',
    scopes: ['openid', 'profile', 'email'],
    sessionStorageBase: 'auth',
    sessionCookieName: 'tco_auth',
    routes: { signIn: '/auth/sign-in', callback: '/auth/callback', signOut: '/auth/sign-out', home: '/', error: '/auth/sign-in' },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const routes = { signIn: '/auth/sign-in', callback: '/auth/callback', signOut: '/auth/sign-out', home: '/', error: '/auth/sign-in', ...options.routes } as AuthRoutes

    nuxt.options.runtimeConfig.auth = defu(nuxt.options.runtimeConfig.auth, {
      clientSecret: '',
      sessionStorageBase: options.sessionStorageBase!,
      sessionCookieName: options.sessionCookieName!,
    })
    nuxt.options.runtimeConfig.public.auth = defu(nuxt.options.runtimeConfig.public.auth, {
      domain: options.domain,
      clientId: '',
      routes,
      scopes: options.scopes!,
    })

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
