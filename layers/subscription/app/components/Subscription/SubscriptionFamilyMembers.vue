<script setup lang="ts">
import type { FamilyMember } from '#shared/subscription'

const props = defineProps<{ subscriptionId: string, seats: number }>()
const api = useFamilyApi()
const toast = useToast()
const members = ref<FamilyMember[]>([])
const email = ref('')
const busy = ref(false)

function errMessage(err: unknown, fallback: string): string {
  return (err as { data?: { statusMessage?: string } })?.data?.statusMessage ?? fallback
}

async function load() {
  members.value = await api.members(props.subscriptionId)
}
onMounted(load)

async function add() {
  if (!email.value)
    return
  busy.value = true
  try {
    await api.add(props.subscriptionId, email.value)
    email.value = ''
    await load()
  }
  catch (err) {
    toast.add({ title: errMessage(err, 'Could not add member'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
async function remove(m: FamilyMember) {
  busy.value = true
  try {
    await api.remove(props.subscriptionId, m.id)
    await load()
  }
  catch (err) {
    toast.add({ title: errMessage(err, 'Could not remove member'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-highlighted">
          Your family plan ({{ members.length }}/{{ seats }} members added)
        </h3>
      </div>
    </template>
    <div class="divide-y divide-default">
      <div v-for="m in members" :key="m.id" class="flex items-center gap-3 py-3">
        <UIcon name="i-lucide-user" class="size-5 text-muted" />
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">
            {{ m.email }}
          </p>
          <p class="text-xs text-muted capitalize">
            {{ m.status === 'owner' ? 'Plan owner' : m.status }}
          </p>
        </div>
        <UButton
          v-if="m.status !== 'owner'" color="error" variant="ghost" size="sm" label="Remove"
          :disabled="busy" @click="remove(m)"
        />
      </div>
    </div>
    <template v-if="members.length < seats" #footer>
      <form class="flex gap-2" @submit.prevent="add">
        <UInput v-model="email" type="email" placeholder="member@email.com" class="flex-1" required />
        <UButton type="submit" label="Add member" :loading="busy" />
      </form>
    </template>
  </UCard>
</template>
