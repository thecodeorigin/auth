export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: [
    '@nuxt/eslint',
    '@nuxthub/core',
    '@onmax/nuxt-better-auth',
    'nuxt-resend',
    'nuxt-security',
  ],

  eslint: {
    config: {
      standalone: false,
      stylistic: false,
    },
  },

  nitro: {
    cloudflare: { nodeCompat: true },
    experimental: {
      tasks: true,
    },
    routeRules: {
      '/api/auth/**': { cors: false, security: { xssValidator: false } },
      '/api/**': { security: { csrf: false } },
      '/_nitro/**': { security: { csrf: false } },
    },
  },

  resend: {
    apiKey: process.env.NUXT_RESEND_API_KEY,
  },

  security: {
    enabled: true,
    hidePoweredBy: true,
    nonce: true,
    headers: {
      contentSecurityPolicy: {
        'default-src': ['\'self\''],
        'script-src': ['\'self\'', '\'nonce-{{nonce}}\'', '\'strict-dynamic\''],
        'style-src': ['\'self\'', '\'unsafe-inline\''],
        'img-src': ['\'self\'', 'data:'],
        'font-src': ['\'self\''],
        'connect-src': ['\'self\'', 'ws:', 'wss:'],
        'base-uri': ['\'self\''],
        'frame-ancestors': ['\'none\''],
        'object-src': ['\'none\''],
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: {
        maxAge: 15552000,
        includeSubdomains: true,
      },
    },
    requestSizeLimiter: {
      maxRequestSizeInBytes: 2000000,
      maxUploadFileRequestInBytes: 8000000,
      throwError: true,
    },
    rateLimiter: {
      tokensPerInterval: 150,
      interval: 300000,
      headers: false,
      driver: { name: 'lruCache' },
      whiteList: ['127.0.0.1', '::1', 'localhost'],
      throwError: true,
    },
    xssValidator: {
      throwError: true,
    },
    corsHandler: false,
  },

  runtimeConfig: {
    oidcClients: '',
    emailFrom: 'auth@thecodeorigin.com',
    googleClientId: '',
    googleClientSecret: '',
    githubClientId: '',
    githubClientSecret: '',
    adminUserIds: '',
    seedAdminEmail: 'admin@thecodeorigin.com',
    allowImpersonation: '',
    public: {
      siteUrl: '',
    },
  },

  $development: {
    devtools: { enabled: true },
    hub: {
      db: 'sqlite',
    },
  },

  $production: {
    hub: {
      db: {
        dialect: 'sqlite',
        driver: 'd1',
        connection: { databaseId: '37dbc73e-1c21-454f-b853-0b110e1867c7' },
      },
    },
    nitro: {
      preset: 'cloudflare-module',
      cloudflare: {
        wrangler: {
          name: 'thecodeorigin-auth',
          routes: [{ pattern: 'auth.thecodeorigin.com', custom_domain: true }],
          observability: { logs: { enabled: true, head_sampling_rate: 1 } },
        },
      },
    },
  },
})
