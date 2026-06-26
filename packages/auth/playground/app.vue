<script setup lang="ts">
const { user, loggedIn, abilities, isImpersonating, impersonator, getOrganizations, getImpersonatableUsers, impersonate, stopImpersonating, switchOrganization, signIn, signOut } = useAuth()
const { can } = useCasl()
const candidates = ref<{ id: string, email: string, name: string | null }[]>([])

async function loadCandidates() {
  candidates.value = (await getImpersonatableUsers()).items
}
</script>

<template>
  <div style="padding:2rem;font-family:sans-serif">
    <button v-if="!loggedIn" @click="signIn('/')">
      Sign in with THECODEORIGIN
    </button>
    <template v-else>
      <p>{{ user?.email }} — impersonating: {{ isImpersonating }} (by {{ impersonator?.email }})</p>
      <p>abilities: {{ abilities.map(a => `${a.action}:${a.subject}`).join(', ') || '(none)' }} | can view project: {{ can('view', 'project') }}</p>
      <h3>Organizations</h3>
      <ul>
        <li v-for="o in getOrganizations()" :key="o.id">
          <button @click="switchOrganization(o.id)">
            {{ o.name }} ({{ o.role }})
          </button>
        </li>
      </ul>
      <h3>Impersonate</h3>
      <button @click="loadCandidates">
        Load candidates
      </button>
      <ul>
        <li v-for="c in candidates" :key="c.id">
          <button @click="impersonate(c.id)">
            {{ c.email }}
          </button>
        </li>
      </ul>
      <button v-if="isImpersonating" @click="stopImpersonating">
        Stop impersonating
      </button>
      <button @click="signOut">
        Sign out
      </button>
    </template>
  </div>
</template>
