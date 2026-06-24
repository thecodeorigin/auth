export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: [
    '@nuxt/eslint',
    '@nuxthub/core',
    '@onmax/nuxt-better-auth',
    'nuxt-resend',
    'nuxt-security',
    '@nuxt/ui',
    '@nuxt/icon',
    '@nuxt/fonts',
    '@nuxt/image',
    '@vueuse/nuxt',
  ],

  components: false,

  css: ['~/assets/css/main.css'],

  imports: {
    dirs: ['~/lib'],
  },

  eslint: {
    config: {
      standalone: false,
      stylistic: false,
    },
  },

  // Bundle icons locally → served as 'self', no CDN, no CSP change.
  icon: {
    clientBundle: { scan: true, sizeLimitKb: 512 },
    serverBundle: 'local',
  },

  vite: {
    optimizeDeps: { include: ['@casl/ability', '@casl/vue'] },
    server: { allowedHosts: ['.ngrok-free.app'] },
  },

  nitro: {
    cloudflare: { nodeCompat: true },
    imports: {
      dirs: ['server/services'],
    },
    experimental: {
      tasks: true,
    },
    routeRules: {
      // SEC-CSP: the OIDC surface keeps the strict img-src ('self' data:). The
      // avatar hosts are added to the GLOBAL CSP (for dashboard HTML pages), so
      // here we override img-src back to strict to keep /api/auth/** CSP
      // byte-identical to the pre-change OIDC headers (AC3).
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
        'img-src': ['\'self\'', 'data:', 'https://lh3.googleusercontent.com', 'https://avatars.githubusercontent.com'],
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
      driver: { name: 'cloudflare-r2-binding' },
      throwError: true,
    },
    xssValidator: {
      throwError: true,
    },
    corsHandler: false,
  },

  runtimeConfig: {
    emailFrom: 'auth@thecodeorigin.com',
    googleClientId: '',
    googleClientSecret: '',
    githubClientId: '',
    githubClientSecret: '',
    adminUserIds: '',
    seedAdminEmail: 'contact@thecodeorigin.com',
    allowImpersonation: '',
    demoMode: '', // NUXT_DEMO_MODE=true → dev-only demo/e2e mode: enables "sign in as agent" + relaxes Polar customer creation. Off by default.
    polarAccessToken: '',
    polarWebhookSecret: '',
    public: {
      siteUrl: '',
    },
  },

  $development: {
    devtools: { enabled: true },
    hub: {
      db: 'sqlite',
    },
    security: {
      rateLimiter: {
        driver: { name: 'lruCache' },
        whiteList: ['127.0.0.1', '::1', 'localhost'],
      },
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
