import type { MongoAbility, RawRuleOf } from '@casl/ability'
import { createMongoAbility } from '@casl/ability'
import { abilitiesPlugin } from '@casl/vue'
import { roles as orgRoles } from '#shared/permissions'

/**
 * Derives a reactive CASL ability from the live better-auth session.
 *
 * - System admin (`user.role === 'admin'`) → superuser (`manage all`).
 * - Otherwise the active-org member role (written to `ability.orgRole` by the
 *   org switcher) is mapped through the shared `#shared/permissions` statement.
 *
 * Nav items gate via `$ability.can(action, subject)`; routes via the `can`
 * page-meta middleware. The ability instance is stable and `.update()`d on
 * change so `abilitiesPlugin` stays reactive.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { user } = useUserSession()
  const activeMemberRole = useState<string | null>('ability.orgRole', () => null)

  const ability = createMongoAbility<MongoAbility>([])
  nuxtApp.vueApp.use(abilitiesPlugin, ability, { useGlobalProperties: true })

  function buildRules(): RawRuleOf<MongoAbility>[] {
    if (user.value?.role === 'admin')
      return [{ action: 'manage', subject: 'all' }]

    const role = activeMemberRole.value as keyof typeof orgRoles | null
    const def = role ? orgRoles[role] : null
    if (!def)
      return []

    const statements = def.statements as unknown as Record<string, readonly string[]>
    const rules: RawRuleOf<MongoAbility>[] = []
    for (const [subject, actions] of Object.entries(statements)) {
      for (const action of actions)
        rules.push({ action, subject })
    }
    return rules
  }

  watch(
    () => [user.value?.role, activeMemberRole.value] as const,
    () => ability.update(buildRules()),
    { immediate: true },
  )

  return { provide: { ability } }
})
