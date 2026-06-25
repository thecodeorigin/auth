# Phase 03 — API routes (folded into existing client routes)

No new routes (YAGNI R5). Abilities are one more field on the existing client GET + PATCH,
both already `requireAdmin`-gated.

Depends on Phase 02.

---

## Step 3.1 — Edit `server/api/auth/oauth2/clients/[id].patch.ts`

Add `abilities` to the body schema using the shared map schema. The whole map is replaced on
PATCH (the form sends the full edited map), which is correct — it's a single document.

```ts
import { abilityMapSchema } from '#shared/abilities'
import { z } from 'zod'

const redirectUri = z.string().url().refine(
  uri => /^https?:\/\//i.test(uri),
  { message: 'Only http:// and https:// redirect URIs are permitted' },
)

const bodySchema = z.object({
  name: z.string().min(1).optional(),
  redirectUris: z.array(redirectUri).min(1).optional(),
  skipConsent: z.boolean().optional(),
  disabled: z.boolean().optional(),
  abilities: abilityMapSchema.optional(), // ← new
}).refine(
  obj => Object.values(obj).some(v => v !== undefined),
  { message: 'At least one field must be provided' },
)
```

The rest of the handler is unchanged — `clientUpdate(ctx.adapter, clientId, body)` already
handles `abilities` after Phase 02.

## Step 3.2 — `server/api/auth/oauth2/clients/[id].get.ts`

**No change needed.** It returns `clientGet(...)`, which now includes `abilities` (Phase 02c).

## Acceptance

- `pnpm exec nuxi typecheck` → 0; `pnpm lint` → 0.
- `PATCH /api/auth/oauth2/clients/:id` with
  `{ "abilities": { "member": [{ "action":"manage","subject":"Post","conditions":{"authorId":"${user.id}"} }] } }`
  returns `{ ok: true }`; a subsequent `GET` returns the same map under `abilities`.
- `PATCH` with `{ "abilities": { "member": [{ "action":"manage","subject":"all" }] } }`
  → 400 (Zod), proving `subject:"all"` is rejected at the boundary.
- After the PATCH, `GET` still shows the correct `clientId` (re-pin held) and an authorize/
  id_token flow for that client still scopes org/role correctly (full check in Phase 05).
