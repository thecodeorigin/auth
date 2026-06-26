import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'THECODEORIGIN Platform Documentation',
  description: 'Self-hosted OIDC identity provider, management console, and the @thecodeorigin/auth relying-party module',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Concepts', link: '/concepts' },
      { text: 'API', link: '/api' },
      { text: 'REST API', link: '/rest-api' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'Concepts',
        items: [
          { text: 'Entities & Relationships', link: '/concepts' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: '@thecodeorigin/auth API', link: '/api' },
          { text: 'Management REST API', link: '/rest-api' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/thecodeorigin/auth' },
    ],

    search: { provider: 'local' },
  },
})
