---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "THECODEORIGIN"
  text: "All in one Identity platform."
  tagline: Verify once, get access to all of THECODEORIGIN ecosystem.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Concepts
      link: /concepts
    - theme: alt
      text: API Reference
      link: /api

features:
  - title: Sign in with one module
    details: "Add @thecodeorigin/auth to a Nuxt app and you get the full OIDC Authorization Code + PKCE flow, a server-side session, useAuth(), and CASL abilities — no token handling in your code."
  - title: Built-in authorization
    details: "Per-app, per-role CASL abilities ride into the OIDC userinfo response and become a live $ability in the browser. Gate any page by the ability it requires."
  - title: A real management platform
    details: "Organizations, members, invitations, OAuth clients, consents, API keys, and impersonation — all driven by an admin-gated REST API you can call with a session or an API key."
---
