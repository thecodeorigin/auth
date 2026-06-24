# Nord Account Portal — User Stories & Acceptance Criteria

## Epic 1: Agent Sign-In (T-001 – T-006)

### US-1 Automation agent sign-in
As a test automation engineer, I want a dev-only endpoint that instantly authenticates any seeded persona so that browser tests are not blocked by email verification or password UX.

**Acceptance criteria**
- GET /api/auth/agent?role=admin|member|viewer&redirect=/path returns HTTP 302 with an HttpOnly session cookie for the matching seed user.
- The redirect param is honoured; the browser lands on the specified path after the redirect chain.
- The endpoint returns HTTP 404 in production (NODE_ENV=production).
- An unknown role value returns HTTP 400 or redirects to /sign-in without creating a session.

---

## Epic 2: Authentication & Session (T-007 – T-030)

### US-2 Email/password sign-in
As a registered user, I want to sign in with my email and password so that I can access the portal dashboard.

**Acceptance criteria**
- Valid credentials → redirect to / with authenticated session.
- Wrong password or unregistered email → inline UAlert error; no redirect.
- Empty email → Zod validation error "Enter a valid email"; no network request.
- Empty password → validation error "Password is required".
- Invalid email format → validation error.
- OIDC resume: if client_id is in the query, post-login redirect goes to /api/auth/oauth2/authorize rather than /.
- Session expired reason param → banner "Your session expired" visible on /sign-in.

### US-3 Registration & email verification
As a new user, I want to create an account with name, email, and a password of at least 8 characters, and then verify my email before accessing protected pages.

**Acceptance criteria**
- Valid registration → "Check your email" confirmation state shown.
- Duplicate email → inline error.
- Name empty, password < 8 chars, invalid email format → respective validation errors; no submission.
- Resend verification email button works from the sent state.

### US-4 Sign-out
As a signed-in user, I want to sign out so that my session is cleared.

**Acceptance criteria**
- Clicking Sign out clears the session cookie and redirects to /sign-in.
- Accessing / after sign-out redirects back to /sign-in.

### US-5 Profile management
As a member, I want to update my display name and avatar URL, and change my password or email from the Security page.

**Acceptance criteria**
- Name and avatar URL are editable; email and account ID are read-only.
- Profile save → toast "Profile updated".
- Change password: confirm field must match new password field; on mismatch, validation error "Passwords do not match".
- Successful password change → toast "Password changed"; other sessions revoked.
- Change email → verification email sent to new address.
- Active sessions table shows current session as "Current"; Revoke button available for other sessions.

### US-6 Impersonation
As an admin, I want to impersonate any user to debug their experience, with a persistent banner and destructive-action lockout while impersonating.

**Acceptance criteria**
- Impersonation banner visible across all dashboard pages while impersonating.
- Document title prefixed with [Impersonating].
- Destructive admin actions disabled during impersonation.
- Stop button in banner returns to admin session immediately.

---

## Epic 3: OIDC SSO (T-031 – T-040)

### US-7 Single sign-on across all clients
As a registered user, I want signing in once at the IdP to authenticate me across all registered OIDC clients without being prompted for credentials again.

**Acceptance criteria**
- One POST to /api/auth/sign-in/email provides a session cookie.
- Subsequent authorize requests for any registered client resolve to an authorization code without redirecting to /sign-in.
- id_token alg=RS256; sub, iss, aud claims present.
- Authorization codes are single-use; replay returns HTTP 400/401.

### US-8 PKCE enforcement for public clients
As a security engineer, I want public OIDC clients to require PKCE and be rejected if code_verifier is absent.

**Acceptance criteria**
- Public client with correct code_verifier receives token (HTTP 200).
- Public client with omitted code_verifier receives HTTP 400; no token issued.
- Confidential clients may use HTTP Basic auth at the token endpoint.
- Public clients must send client_id in the request body (no Authorization header).

---

## Epic 4: Authorization Scoping (T-041 – T-047)

### US-9 Per-app org and role tiering in id_token
As an OIDC relying party, I want the id_token to contain org and roles claims scoped specifically to my application based on the user's access grants.

**Acceptance criteria**
- Tier-0 exact grant for NordVPN client → org = Org B; roles = viewer.
- Default-closed deny: Nord Web client (no Org B grant) → org = personal org; personal = true.
- Clients with no access grant receive no org or roles claims.
- Personal org wildcard grant (*) applies as fallback when no exact match exists.
- Dynamic roles (e.g. project-viewer) appear correctly in claims.

---

## Epic 5: Entitlements (T-048 – T-054)

### US-10 Live subscription entitlement in userinfo
As an OIDC relying party, I want the /userinfo endpoint to return the user's current subscription status for my product so that I can gate access within my application.

**Acceptance criteria**
- NordPass client: entitlement.product = 'nordpass'; entitlement.active = true for an active sub.
- NordVPN client: entitlement.active = false for an expired sub.
- Expired subs return entitlement with active=false (not absent from response).
- No subscription → entitlement null or absent.
- Entitlement is NOT included in the id_token; accessible only via /userinfo.

---

## Epic 6: Home Dashboard (T-055 – T-062)

### US-11 Subscription overview on home page
As a member, I want the home dashboard to show my product subscriptions and alert me to any that have expired.

**Acceptance criteria**
- A SubscriptionProductCard is rendered for each seeded subscription.
- SubscriptionExpiryBanner appears if any subscription is expired; Renew link navigates to the product page.
- Empty state ("You don't have any products yet.") shown when the user has no subscriptions.
- Account settings and Available plans sidebar cards link to /account/profile and /account/plans respectively.

---

## Epic 7: Product Page (T-063 – T-075)

### US-12 Uniform product page with three conditional cards
As a member, I want each product's detail page to show contextual cards based on my subscription tier so that I can manage my plan directly.

**Acceptance criteria**
- Card 1 (Go to product): shown only when catalog product has a non-null appUrl; button opens the external URL in a new tab.
- Card 2 (Manage plan): shows "No active plan" + Buy now when tier=none; "Free plan active" + Upgrade when tier=free; active plan name + Manage plan when tier=paid.
- Buy now and Upgrade disabled with warning text when Polar is not configured.
- Card 3 (Members): rendered when tier is free or paid; absent when tier=none.
- Add seat button visible only when tier=paid AND plan.seats > 1.
- Upgrade hint text visible when tier=free AND a paid plan exists.
- Unknown product slug renders without JS error.
- Plans page shows all 6 catalog plans with correct names, formatted prices, and features.

---

## Epic 8: Members & Seats (T-076 – T-094)

### US-13 Family seat management
As a subscription owner, I want to add and remove family members from my multi-seat plan, with clear feedback and proper validation.

**Acceptance criteria**
- Owner row always present; label "Plan owner"; no Remove button on owner row.
- Member count shows X/Y in card header.
- Search filters by email substring, case-insensitive; resets to page 1 on query change.
- No results → "No members found."
- Pagination appears when member count > 8 (8 per page).
- Add seat modal: email field required; Add seat button disabled when empty; Enter key submits.
- Add seat success (free seat) → toast "Member added"; list refreshes.
- Add seat prorated charge → toast "Seat added — your card was charged a prorated amount".
- Duplicate email → HTTP 409; toast "This person is already a member".
- Invalid email format → HTTP 400 Zod error.
- Non-seatable plan → HTTP 409 "This plan does not support additional seats".
- Billing unavailable during charge → HTTP 503; toast.
- Cross-tenant access → HTTP 403 (requireOwnedSubscription guard enforced server-side).

---

## Epic 9: Billing (T-095 – T-101)

### US-14 Polar billing integration
As a member, I want clicking Manage plan to redirect me to the Polar customer portal, and clicking Buy now / Upgrade to start a Polar checkout.

**Acceptance criteria**
- Manage plan → browser redirects to Polar portal URL; loading spinner shown during request.
- Portal unavailable → error toast; page stays loaded.
- Buy now / Upgrade → browser redirects to Polar checkout URL for the primary paid plan.
- Buy now / Upgrade disabled (with warning message) when polarConfigured=false.
- /api/billing/portal returns HTTP 401 for unauthenticated requests.
- /api/billing/config returns { polarConfigured: false } when POLAR_ACCESS_TOKEN is absent.

---

## Epic 10: Freemium (T-102 – T-106)

### US-15 Free-tier experience for NordLocker
As a NordLocker free-tier user, I want the product page to reflect my free plan clearly and prompt me to upgrade.

**Acceptance criteria**
- Plan card text = "Free plan active"; Upgrade button visible; no Manage plan or Buy now.
- Members card rendered (tier=free is not none).
- No Add seat button (canAddSeat=false; nordlocker-free has seats=1).
- Upgrade hint text "Upgrade to a paid plan to add members" shown.
- Plans page shows NordLocker Free with price "Free" (no billing interval suffix).

---

## Epic 11: Admin / Platform (T-107 – T-129)

### US-16 Admin console access
As an admin, I want exclusive access to /platform/* pages so that I can manage users, applications, and consents across the platform.

**Acceptance criteria**
- Admin sidebar shows platform nav items; member sidebar does not.
- Member accessing /platform/users or /platform/consents → redirect to /sign-in or /403.
- /api/admin/consents returns HTTP 403 for non-admin sessions.

### US-17 User management
As an admin, I want to list, search, and create users at /platform/users.

**Acceptance criteria**
- Infinite-scroll list with Name, Role badge, Status badge columns.
- Search by name/email filters list live.
- New user modal creates user; list reloads on success.

### US-18 Application management
As an admin, I want to create, view, and delete OIDC applications, with the client secret shown exactly once at creation.

**Acceptance criteria**
- Applications list visible to all authenticated users; Edit/Delete controls admin-only.
- Create: name required; at least one redirect URI required; URIs must be absolute; no fragment (#) allowed.
- On create success for confidential app: secret modal opens once; after dismiss, redirect to detail page.
- Delete: confirm dialog required; cancel leaves application intact.

### US-19 Consent management
As an admin, I want to view and revoke user OAuth consents at /platform/consents.

**Acceptance criteria**
- Consent list with User, Application, Scopes, Consented date columns.
- Revoke with confirm dialog → consent removed; toast "Consent revoked".
- Cancel → consent retained.
- Search by user email or app name filters the table.

### US-20 Per-app access grants
As an org owner/admin, I want to grant specific OIDC clients access to org members with optional role overrides.

**Acceptance criteria**
- Select member → grant table loads their current grants.
- Grant with specific app and role → row appears in current grants; toast "Access granted".
- Revoking the wildcard (*) grant shows a confirmation prompt.
- Revoke specific grant → grant removed from table.

---

## Epic 12: Permission Matrix (T-130 – T-142)

### US-21 Route and API authorization enforcement
As a security engineer, I want every protected route and API endpoint to enforce authentication and role checks so that unauthorized access is impossible.

**Acceptance criteria**
- Anonymous users → all protected routes redirect to /sign-in.
- Members → /platform/* routes and APIs return 403/redirect; no data leaked.
- Cross-tenant: alice cannot read or mutate bob's family subscription members (HTTP 403).
- Billing endpoints return HTTP 401 without a session.
- Admin impersonating a user sees that user's data; impersonation banner always visible; destructive actions disabled.
- Stopping impersonation restores the admin's own session.

---

## Epic 13: Org Management (T-138 – T-142)

### US-22 Organization member management
As an org owner or admin, I want to invite, promote, and remove members from my organization.

**Acceptance criteria**
- Invite: valid email + role → toast "Invitation sent"; invite appears in invitations list.
- Invite with blank email → Send invite button disabled.
- Change role of non-owner member → toast "Role updated"; badge reflects new role.
- Last owner: no role-change or Remove options available.
- Remove non-owner member → toast "Member removed"; member removed from table.
