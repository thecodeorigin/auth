# Phase 04 — Composable types + the "Add ability" form

**Deliverables:**
1. `app/composables/useApplicationsApi.ts` — `ClientDetail.abilities`, `ClientPatch.abilities`.
2. `layers/admin/app/components/Platform/PlatformAppAbilities.vue` — the role-grouped form.
3. `layers/admin/app/pages/platform/applications/[clientId].vue` — render the card.

Depends on Phase 03. Honours hard rules 1–3 (layout, Nuxt UI only/explicit imports, semantic
tokens) and rule 5 (admin Nitro routes via `useApplicationsApi`).

---

## Step 4.1 — Edit `app/composables/useApplicationsApi.ts`

Add the shared type import at the top and extend two interfaces (the `update` method already
forwards `ClientPatch`, so no method change):

```ts
import type { AbilityMap } from '#shared/abilities'
```

```ts
export interface ClientPatch {
  name?: string
  redirectUris?: string[]
  skipConsent?: boolean
  disabled?: boolean
  abilities?: AbilityMap // ← new
}

export interface ClientDetail {
  clientId: string
  name: string | null
  type: string | null
  public: boolean
  redirectUris: string[]
  skipConsent: boolean
  disabled: boolean
  createdAt: string | Date | null
  abilities?: AbilityMap // ← new (GET now returns it)
}
```

## Step 4.2 — Create `layers/admin/app/components/Platform/PlatformAppAbilities.vue`

Role-grouped editor. Each role group holds ability item groups; each item group = action select
+ subject input + a condition (key→value) editor with a **"self" quick-fill**. One Save writes
the whole map via `useApplicationsApi().update`.

```vue
<script setup lang="ts">
import type { AbilityAction, AbilityMap } from '#shared/abilities'
import { ABILITY_ACTIONS, BUILTIN_ROLE_KEYS } from '#shared/abilities'

const props = defineProps<{ clientId: string, abilities?: AbilityMap }>()
const emit = defineEmits<{ saved: [] }>()

const api = useApplicationsApi()
const toast = useToast()

interface EditCond { key: string, value: string }
interface EditRule { action: AbilityAction, subject: string, conditions: EditCond[] }
interface EditGroup { role: string, rules: EditRule[] }

const groups = ref<EditGroup[]>([])
const newRole = ref('')
const saving = ref(false)

const actionItems = ABILITY_ACTIONS.map(a => ({ label: a, value: a }))
const roleSuggestions = BUILTIN_ROLE_KEYS as readonly string[]

function fromMap(map: AbilityMap | undefined): EditGroup[] {
  if (!map)
    return []
  return Object.entries(map).map(([role, rules]) => ({
    role,
    rules: rules.map(r => ({
      action: r.action,
      subject: r.subject,
      conditions: r.conditions ? Object.entries(r.conditions).map(([key, value]) => ({ key, value })) : [],
    })),
  }))
}

// Re-seed local state whenever the loaded abilities change (e.g. after a reload).
watch(() => props.abilities, val => { groups.value = fromMap(val) }, { immediate: true, deep: true })

function addRole() {
  const role = newRole.value.trim()
  if (!role)
    return
  if (groups.value.some(g => g.role === role)) {
    toast.add({ title: `Role "${role}" already added`, color: 'warning' })
    return
  }
  groups.value.push({ role, rules: [] })
  newRole.value = ''
}
function removeRole(i: number) {
  groups.value.splice(i, 1)
}
function addRule(g: EditGroup) {
  g.rules.push({ action: 'view', subject: '', conditions: [] })
}
function removeRule(g: EditGroup, i: number) {
  g.rules.splice(i, 1)
}
function addCondition(r: EditRule) {
  r.conditions.push({ key: '', value: '' })
}
function addSelf(r: EditRule) {
  // "self" = limit to records the user owns. Default owner field `userId`; admin can rename.
  r.conditions.push({ key: 'userId', value: '${user.id}' })
}
function removeCondition(r: EditRule, i: number) {
  r.conditions.splice(i, 1)
}

function toMap(): AbilityMap {
  const out: AbilityMap = {}
  for (const g of groups.value) {
    const role = g.role.trim()
    if (!role)
      continue
    out[role] = g.rules
      .filter(r => r.subject.trim())
      .map((r) => {
        const conditions: Record<string, string> = {}
        for (const c of r.conditions) {
          const k = c.key.trim()
          const v = c.value.trim()
          if (k && v)
            conditions[k] = v
        }
        return Object.keys(conditions).length
          ? { action: r.action, subject: r.subject.trim(), conditions }
          : { action: r.action, subject: r.subject.trim() }
      })
  }
  return out
}

async function save() {
  saving.value = true
  try {
    await api.update(props.clientId, { abilities: toMap() })
    toast.add({ title: 'Abilities saved', color: 'success' })
    emit('saved')
  }
  catch (err) {
    // Server Zod is the authority (rejects subject:"all", reserved keys, bad placeholders, caps).
    toast.add({ title: 'Save failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard class="lg:col-span-2">
    <template #header>
      <div class="flex items-center justify-between gap-4">
        <h2 class="font-semibold text-highlighted">
          Abilities
        </h2>
        <UButton label="Save abilities" :loading="saving" @click="save" />
      </div>
    </template>

    <div class="space-y-5">
      <p class="text-sm text-muted">
        CASL rules emitted to this app's <span class="font-mono text-xs">userinfo</span>, grouped
        by the user's role. Use <span class="font-mono text-xs">${'{'}user.id{'}'}</span> in a
        condition value to scope a rule to the current user ("self"). Role keys match the
        resolved role name (built-ins suggested; custom org-role names are org-local).
      </p>

      <div v-if="!groups.length" class="text-sm text-muted italic">
        No abilities defined. Add a role below to start.
      </div>

      <div v-for="(g, gi) in groups" :key="gi" class="border border-default rounded p-4 space-y-3">
        <div class="flex items-center justify-between">
          <UBadge color="primary" variant="subtle" class="capitalize">
            {{ g.role }}
          </UBadge>
          <UButton
            icon="i-lucide-trash-2" color="error" variant="ghost" size="xs"
            :aria-label="`Remove role ${g.role}`" @click="removeRole(gi)"
          />
        </div>

        <!-- Item groups (one ability rule each) -->
        <div v-for="(r, ri) in g.rules" :key="ri" class="bg-elevated rounded p-3 space-y-3">
          <div class="flex flex-col sm:flex-row gap-2">
            <UFormField label="Action" class="sm:w-40">
              <USelect v-model="r.action" :items="actionItems" class="w-full" />
            </UFormField>
            <UFormField label="Subject" class="flex-1">
              <UInput v-model="r.subject" placeholder="e.g. Post" class="w-full" />
            </UFormField>
            <div class="flex items-end">
              <UButton
                icon="i-lucide-x" color="neutral" variant="ghost"
                aria-label="Remove ability" @click="removeRule(g, ri)"
              />
            </div>
          </div>

          <!-- Extra rule (conditions) -->
          <div class="space-y-2">
            <div v-for="(c, ci) in r.conditions" :key="ci" class="flex gap-2 items-center">
              <UInput v-model="c.key" placeholder="field (e.g. authorId)" class="flex-1" />
              <span class="text-muted text-xs">=</span>
              <UInput v-model="c.value" placeholder="value or ${'{'}user.id{'}'}" class="flex-1 font-mono text-xs" />
              <UButton
                icon="i-lucide-x" color="neutral" variant="ghost" size="xs"
                aria-label="Remove condition" @click="removeCondition(r, ci)"
              />
            </div>
            <div class="flex gap-2">
              <UButton icon="i-lucide-plus" variant="ghost" size="xs" label="Add condition" @click="addCondition(r)" />
              <UButton icon="i-lucide-user" variant="ghost" size="xs" label="Self (owner-only)" @click="addSelf(r)" />
            </div>
          </div>
        </div>

        <UButton icon="i-lucide-plus" variant="subtle" size="xs" label="Add ability" @click="addRule(g)" />
      </div>

      <!-- Add role -->
      <div class="flex gap-2 items-end border-t border-default pt-4">
        <UFormField label="Add role" class="flex-1">
          <UInput
            v-model="newRole" placeholder="owner / admin / member / custom…"
            class="w-full" list="role-suggestions" @keydown.enter="addRole"
          />
          <datalist id="role-suggestions">
            <option v-for="rk in roleSuggestions" :key="rk" :value="rk" />
          </datalist>
        </UFormField>
        <UButton icon="i-lucide-plus" label="Add role" variant="subtle" @click="addRole" />
      </div>
    </div>
  </UCard>
</template>
```

> **Nuxt UI notes for cook:** verify `USelect` `:items` prop shape against the installed
> @nuxt/ui v4 (`{ label, value }[]` is standard; if the version expects plain strings, pass
> `ABILITY_ACTIONS` directly). `<datalist>` is a native element used only as a typeahead hint
> for a `UInput` — acceptable (it's not a control replacement; rule 2 forbids raw
> button/input/table, which we don't use). If lint objects to `<datalist>`/`<option>`,
> replace with a `USelectMenu` (creatable) bound to `newRole`.

## Step 4.3 — Edit `layers/admin/app/pages/platform/applications/[clientId].vue`

**(a)** Import the component (with the other component imports at the top of `<script setup>`):

```ts
import PlatformAppAbilities from '#layers/admin/app/components/Platform/PlatformAppAbilities.vue'
```

**(b)** Render the card inside the `v-else-if="client"` grid, **between** the Redirect URIs
card and the Danger zone card:

```vue
        <!-- Abilities -->
        <PlatformAppAbilities :client-id="clientId" :abilities="client.abilities" @saved="load" />
```

`load()` already re-fetches the client (including `abilities`), so the form re-seeds from the
persisted map after each save (the `watch` in 4.2 picks it up).

## Acceptance

- `pnpm exec nuxi typecheck` → 0; `pnpm lint` → 0.
- Live: open `/platform/applications/:clientId` as sysadmin → Abilities card renders → Add role
  `member` → Add ability (`manage` / `Post`) → "Self (owner-only)" adds `userId = ${user.id}` →
  Save → toast success → reload page → the rule persists.
- Saving `subject = all` surfaces the server's 400 as an error toast (boundary holds).
