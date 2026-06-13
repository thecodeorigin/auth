# Phase 2 — Authentication hardening

**Goal:** Production-grade authentication: email verification + password reset (via Cloudflare Email), Google + GitHub social login, full auth UI, and CORS/trustedOrigins for all clients. Email failures must never permanently brick an account (debate E1).

**Depends on:** P1. **Unblocks:** P3+.

## Steps

### P2.1 — Cloudflare email helper (`server/utils/email.ts`)
Use the **`cloudflare-email-service`** skill for the exact binding setup. Send inside `event.waitUntil` so a slow/failed send never blocks the response (debate CF2), and log failures.
```ts
// Thin wrapper around Cloudflare Email Sending (binding) or REST. Replace internals per the skill.
export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  // throws on hard failure; callers log + surface a resend path.
}
```

### P2.2 — Enable verification + reset + social in `server/auth.config.ts`
```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,            // E1: pair with resend endpoints below
  sendResetPassword: async ({ user, url }) => {
    await sendEmail({ to: user.email, subject: 'Reset your password', html: `<a href="${url}">Reset</a>` })
  },
  // E2: confirm reset revokes existing sessions (Better Auth does by default — verify).
},
emailVerification: {
  sendOnSignUp: true,
  sendVerificationEmail: async ({ user, url }) => {
    await sendEmail({ to: user.email, subject: 'Verify your email', html: `<a href="${url}">Verify</a>` })
  },
},
socialProviders: {
  google: { clientId: runtimeConfig.googleClientId, clientSecret: runtimeConfig.googleClientSecret },
  github: { clientId: runtimeConfig.githubClientId, clientSecret: runtimeConfig.githubClientSecret },
},
trustedOrigins: [
  'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004',
  // prod origins added in P6: https://foo.example.com, https://bar.another.com, https://baz.third.com, ...
],
```
Add to `nuxt.config.ts` `runtimeConfig`: `googleClientId/googleClientSecret/githubClientId/githubClientSecret` (← `NUXT_GOOGLE_CLIENT_ID`, etc.). Add the values to `.env`. Register OAuth redirect URIs with Google/GitHub: `http://localhost:3000/api/auth/callback/google` and `.../callback/github` (prod equivalents in P6).

> No schema change expected from social/verification (uses existing `account`/`verification` tables). If `nuxt db generate` produces a diff, review and commit it.

### P2.3 — Resend + recovery (E1)
- Add a **resend-verification** action on the post-sign-up screen (Better Auth exposes `sendVerificationEmail`; wire a button) and a rate-limited **resend-reset** on `forgot-password.vue`.
- Decide unverified-account handling: a user whose verification email failed must be able to re-request it (don't leave an unrecoverable row). Admin manual-verify exists in P3 (guarded).

### P2.4 — Auth UI pages
Build with Nuxt UI (or plain, matching P1's style):
- `app/pages/sign-up.vue` — name/email/password → `signUp.email`; show "check your email" + resend.
- `app/pages/forgot-password.vue` — email → `forgetPassword`; rate-limited resend.
- `app/pages/reset-password.vue` — reads `token` from query → `resetPassword`.
- `app/pages/verify-email.vue` — handles the verification callback / success state.
- Extend `sign-in.vue` (P1) with "Continue with Google" / "Continue with GitHub" buttons → `signIn.social({ provider })`.

## Acceptance criteria
- [ ] New sign-up sends a verification email (observed in Cloudflare email logs / dev inbox); unverified user cannot complete a protected sign-in; resend works.
- [ ] Forgot-password sends a reset link; reset succeeds and **invalidates prior sessions**.
- [ ] "Continue with Google" and "Continue with GitHub" complete and create/link an account (use real dev OAuth apps or document the test creds).
- [ ] A failed email send is logged and the user has a resend path (no permanent lockout).
- [ ] All 4 localhost client origins are in `trustedOrigins`; the public Vue SPA origin (P4) can call `/api/auth/*` without CORS errors.

## Notes for cook
- Cookies: `Secure` + `SameSite=Lax` (OIDC redirect tolerates Lax; avoid `None` unless truly needed — debate H4).
- Email-change flows: ensure the verification token is bound to user **and** target email (debate E2).
