import type { MongoAbility, RawRuleOf } from '@casl/ability'
import type { PublicSession } from '../../../contract'
import { createMongoAbility } from '@casl/ability'
import { abilitiesPlugin } from '@casl/vue'
import { watch } from 'vue'
import { defineNuxtPlugin, useState } from '#app'

export default defineNuxtPlugin((nuxtApp) => {
  const session = useState<PublicSession | null>('tco-auth-session', () => null)
  const ability = createMongoAbility<MongoAbility>([])
  nuxtApp.vueApp.use(abilitiesPlugin, ability, { useGlobalProperties: true })

  function rules(): RawRuleOf<MongoAbility>[] {
    const s = session.value
    if (!s)
      return []
    if (s.systemRole === 'admin')
      return [{ action: 'manage', subject: 'all' }]
    return (s.abilities ?? []).map(a => ({
      action: a.action,
      subject: a.subject,
      ...(a.conditions ? { conditions: a.conditions } : {}),
    }))
  }

  watch(session, () => ability.update(rules()), { immediate: true, deep: true })
  return { provide: { ability } }
})
