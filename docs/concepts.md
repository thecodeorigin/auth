# Concepts

This page defines every entity in the platform and — just as importantly — **what
owns what**. The model has one rule that explains most of it:

> **Organizations group *people and their authorization*, not resources.**
> Applications are global. Orgs grant their members access to those global apps.

## The big picture

```
                       ┌─────────────────────────────┐
                       │            User             │  a human account
                       │  system role: admin | user  │
                       └──────┬───────────────┬──────┘
              any user        │               │   role = admin ONLY
              is a member of  │               │   creates / manages
                  ┌───────────┘               └───────────┐
                  ▼                                         ▼
        ┌────────────────────┐                    ┌────────────────────┐
        │   Organization     │                    │   Application       │
        │ (a group of people)│                    │ (an OAuth client)   │  GLOBAL
        └─────────┬──────────┘                    └─────────┬──────────┘
                  │ owns                                     │
   ┌──────────────┼───────────────┐         a user approves it (Consent)
   ▼              ▼               ▼          & is granted use (Access)
 Member      Invitation     OrganizationRole               │
 (user×role)  (pending)     (custom roles)                 ▼
                  │                                    ┌──────────┐
                  │                                    │ Consent  │ (user × app)
                  └────────── Access (memberAppScope) ─┴──────────┘
                       "which member may use which app, as what role"
```

Everything keyed to an `Organization` lives on the left; everything keyed to an
`Application` is global and lives on the right. **Only a system `admin` creates
or manages Applications** — a regular `user` never does; they only *consent to*
and *use* apps. The **Access** grant is the only bridge between the two sides.

## User

A human account — the root identity. Holds email, name, picture, password /
social logins, and a platform-level **system role** (`admin` or `user`).

On first verified sign-in, a user automatically gets a **personal
organization** (a one-person org), so every user always has at least one org
context.

The system role splits accounts into two very different kinds of actor — and
the split matters most around **Applications**, which are platform-global:

### User (system role `user`)

The default. A `user` is authorized **only through the organizations they belong
to**, and acts strictly within org scope:

- **Cannot create, edit, disable, or delete Applications.** Applications are
  platform-global (see [Application](#application-oauth-client)); creating one
  affects *every* organization, so it is an admin-only action. A `user` only
  ever **consents** to apps and **uses** the apps they've been granted
  [Access](#access-memberappscope) to.
- Manages people and authorization **inside their own orgs** — invite members,
  assign org roles, define custom `OrganizationRole`s, and grant per-member app
  Access — bounded by their own role (`owner` / `admin` / `member`) in each org.
- Manages their own account: profile, security, connected accounts, API keys,
  and their own consents.

Their sidebar is the member IA (Applications = *authorized apps*, Users =
*org members*, Invitations, API Keys, Settings) — never the `/platform/*`
surface.

### System admin (system role `admin`)

A platform operator. A system `admin` short-circuits every authorization check
to **`manage all`** and owns the platform-global surface that no `user` can
touch:

- **Creates, edits, disables, and deletes Applications** (`/platform/applications`)
  — the action that affects the whole platform.
- Manages all Users, Organizations, Consents, and identity Providers across
  every tenant (`/platform/*`), and can [impersonate](#impersonation) any
  non-admin user for support.

The admin surface is the authority; an org-level role never confers
platform-level (`/platform/*`) power.

## Organization

A named group of people with a unique `slug`. It is an **authorization
grouping**, not a tenant that holds resources. The row itself is thin (`name`,
`slug`, `logo`, `metadata`); the substance is in its children.

An organization **owns** four things (all cascade-deleted with the org):

| Child | What it is |
| --- | --- |
| **Member** | The `(organization, user, role)` join — who belongs, with which base role. |
| **Invitation** | A pending invite: `email`, `role`, `status`, `expiresAt`, `inviterId`. |
| **OrganizationRole** | **Custom roles** defined by the org — `(role, permission)` rows. Powered by better-auth `dynamicAccessControl` (max 10 roles/org). |
| **Access** (`memberAppScope`) | Per-member, per-app access grants. The bridge to Applications. |

An organization owns **no apps, no tokens, no consents** — those are
global/user-level.

> **D1 note.** Cloudflare D1 has no FK cascade at runtime. "Ownership" cascades
> are enforced in application code (org hooks in the IdP), not by the database.

## Member

The membership record: a `(organizationId, userId, role)` row. The `role` is the
member's **base role** in that org — one of the built-in `owner` / `admin` /
`member`, or a custom `OrganizationRole`. A user is a Member of every org they
belong to (including their personal org, where they are `owner`).

## Invitation

A pending request for an email address to join an organization at a given role.
It has a `status` (`pending` by default) and an `expiresAt`, and records who
sent it (`inviterId`). Accepting an invitation creates a Member.

## OrganizationRole (custom roles)

Beyond the three built-in roles, an org can define its own roles as
`(role, permission)` rows. This is better-auth's **dynamic access control** —
each role names a set of permission statements. Capped at **10 roles per
organization**.

## Application (OAuth client)

An **Application is an OAuth client** — a thing that wants to sign users in and
read their data through the IdP. This is what `@thecodeorigin/auth` registers and
uses.

Key facts:

- **Applications are global (platform-level), not owned by an organization.**
  There is no `organizationId` on an application. They're managed by system
  admins under **Applications** / `/platform/applications`.
- An application has a `clientId`, an optional hashed `clientSecret`,
  `redirectUris`, a `type` (`web` / `native` / `user-agent-based`), `public`
  (PKCE-only, no secret) and `skipConsent` flags, a `disabled` flag, and a
  per-role **ability map** (see [Ability](#ability)).
- The `clientSecret` is shown **exactly once** at create/rotate time and stored
  hashed — never re-fetchable.

> **Why global?** This mirrors how Auth0/Logto/Okta model a single-tenant IdP:
> apps belong to the tenant, and "organizations" are a B2B feature that get
> *granted access* to apps. The per-org connection here is the **Access** grant,
> not ownership.

## Access (`memberAppScope`)

The bridge between orgs and apps. Each row says: *within organization X, member
Y may use application Z, acting as role R.* It is **default-closed** — no row
means no access.

| Field | Meaning |
| --- | --- |
| `organizationId` + `userId` | the member this grant is for |
| `clientId` | the app — a specific `clientId`, **or `'*'`** for *all apps in this org* |
| `role` | the role to act as for this app — or `null` to **inherit** the member's base org role |

The creator of any organization is automatically granted `clientId: '*'`
(all-apps) access. This is the table the admin console edits under a member's
**Applications** access.

## Consent

A **Consent** is a user's recorded *"yes, I allow this app to access this data."*
It is the standard OAuth/OIDC authorization grant behind the *"App X wants to
access your profile and email — Allow?"* screen.

- One row = *user U approved app A for scopes S* — a **user × app** record (no
  org ownership).
- Stored so the user isn't re-prompted on every login; **deleting it revokes**
  the app's standing authorization (the user is prompted again next time).
- Apps with `skipConsent: true` (trusted / first-party) never create a consent
  row and never prompt.
- Admins can audit all consents across users and revoke any of them.

## Ability

A CASL rule — the unit of **authorization** carried to relying parties. An ability rule is
`{ action, subject, conditions? }` — for example `{ action: 'view', subject:
'project' }`. Abilities are:

1. **Defined per application, per role** — an app's ability map says "a `member`
   of an org using this app can `view:project`, an `admin` can `manage:project`",
   etc.
2. **Resolved live and emitted into the IdP's `userinfo`** response for the
   requesting client, based on the user's role in their active org.
3. **Rebuilt into a CASL `$ability`** in the relying party's browser, so
   `can('view', 'project')` and `definePageMeta({ can: ['project:view'] })` just
   work.

A system `admin` short-circuits to `manage all` (every ability). See
[`useCasl`](/api#usecasl) and [the ability plugin](/api#casl-ability-plugin).

## Entitlement

A **billing/subscription** fact attached to a user, sourced from Polar. The
entitlement shape is `{ product, plan, status, active, currentPeriodEnd }` and is
emitted into `userinfo` alongside claims and abilities, so a relying party can
gate features by plan. Like abilities, it is re-resolved live on every
`userinfo` request (never baked into the immutable id_token).

## Impersonation

A system admin can act **as** another user for support/debugging. Impersonation
is session-sourced and tightly bounded:

- It mints a **non-refreshable, 30-minute** access token acting as the target.
- The RP session records an `impersonator` so the UI can show a banner, prefix
  the title, and lock destructive actions.
- Start/stop are written to an **audit log**; admins cannot impersonate other
  admins or themselves, and an impersonating session cannot start a nested
  impersonation.

See [`useAuth().impersonate`](/api#impersonation-methods).

## Session

What a relying party holds after sign-in. The server keeps a **session record**
(in KV/storage) containing the user projection, abilities, organizations, active
org, entitlement, and the OIDC tokens. The browser only ever sees a **public
session** projection — **no tokens** — exposed through `useAuth()`.

| Projection | Where | Contains tokens? |
| --- | --- | --- |
| `SessionRecord` | server storage (KV) | Yes — access/refresh |
| `ServerAuthSession` | `getServerAuthSession()` in Nitro | No |
| `PublicSession` | `useAuth().session` in browser | No |

## Glossary at a glance

| Term | One-liner | Owned by |
| --- | --- | --- |
| **User** | a human account | — (root) |
| **Organization** | a group of people + their authorization | — |
| **Member** | a user's membership + base role in an org | Organization |
| **Invitation** | a pending membership offer | Organization |
| **OrganizationRole** | a custom role defined by an org | Organization |
| **Application** | an OAuth client (a relying-party app) | *global* (platform) |
| **Access** | which member may use which app, as what role | Organization ↔ Application |
| **Consent** | a user's "allow this app" grant | User × Application |
| **Ability** | a CASL authorization rule | Application × Role |
| **Entitlement** | a subscription/plan fact | User |
| **Session** | a signed-in user's server-held state | User (per RP) |
