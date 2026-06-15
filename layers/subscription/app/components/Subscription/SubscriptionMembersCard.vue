<script setup lang="ts">
import type { FamilyMember } from '#shared/subscription'

const props = defineProps<{
  subscriptionId: string | null
  ownerEmail: string
  seats: number
  canAddSeat: boolean
  upgradeHint: boolean // free tier → no Add seat, show an upgrade nudge
}>()

const emit = defineEmits<{ changed: [] }>()
const api = useFamilyApi()
const toast = useToast()
const members = ref<FamilyMember[]>([])
const loading = ref(false)
const q = ref('')
const page = ref(1)
const pageSize = 8

const addOpen = ref(false)
const email = ref('')
const adding = ref(false)

function ownerRow(): FamilyMember {
  return { id: 'owner', email: props.ownerEmail, userId: null, status: 'owner', createdAt: 0 }
}

async function load() {
  if (!props.subscriptionId) {
    members.value = [ownerRow()]
    return
  }
  loading.value = true
  try {
    const rows = await api.members(props.subscriptionId)
    // Always surface the owner even if no member rows exist yet.
    members.value = rows.some(r => r.status === 'owner') ? rows : [ownerRow(), ...rows]
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const filtered = computed(() => members.value.filter(m => m.email.toLowerCase().includes(q.value.trim().toLowerCase())))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(q, () => {
  page.value = 1
})

function errMessage(err: unknown, fallback: string): string {
  return (err as { data?: { statusMessage?: string } })?.data?.statusMessage ?? fallback
}
async function submitAdd() {
  if (!email.value || !props.subscriptionId)
    return
  adding.value = true
  try {
    const { charged } = await api.add(props.subscriptionId, email.value)
    toast.add({ title: charged ? 'Seat added — your card was charged a prorated amount' : 'Member added', color: 'success' })
    email.value = ''
    addOpen.value = false
    await load()
    emit('changed') // refresh capacity in the parent
  }
  catch (err) {
    toast.add({ title: errMessage(err, 'Could not add member'), color: 'error' })
  }
  finally {
    adding.value = false
  }
}
async function remove(m: FamilyMember) {
  if (!props.subscriptionId || m.status === 'owner')
    return
  try {
    await api.remove(props.subscriptionId, m.id)
    await load()
    emit('changed') // refresh capacity in the parent
  }
  catch (err) {
    toast.add({ title: errMessage(err, 'Could not remove member'), color: 'error' })
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-semibold text-highlighted">
          Members ({{ members.length }}/{{ seats }})
        </h3>
        <div class="flex items-center gap-2">
          <UInput v-model="q" icon="i-lucide-search" placeholder="Search email" size="sm" />
          <UButton v-if="canAddSeat" icon="i-lucide-plus" size="sm" label="Add seat" @click="addOpen = true" />
        </div>
      </div>
    </template>

    <div class="divide-y divide-default">
      <div v-for="m in paged" :key="m.id" class="flex items-center gap-3 py-3">
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
          @click="remove(m)"
        />
      </div>
      <p v-if="!loading && !filtered.length" class="py-6 text-center text-sm text-muted">
        No members found.
      </p>
    </div>

    <template v-if="filtered.length > pageSize" #footer>
      <UPagination v-model:page="page" :total="filtered.length" :items-per-page="pageSize" />
    </template>

    <p v-if="upgradeHint" class="text-xs text-muted mt-2">
      Upgrade to a paid plan to add members.
    </p>

    <UModal v-model:open="addOpen" title="Add a seat">
      <template #body>
        <p class="text-sm text-muted mb-3">
          Adding a seat beyond your plan's included seats charges a prorated amount to your card.
        </p>
        <UFormField label="Email" required>
          <UInput v-model="email" type="email" placeholder="member@email.com" class="w-full" autofocus @keydown.enter="submitAdd" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="addOpen = false" />
          <UButton label="Add seat" :loading="adding" :disabled="!email" @click="submitAdd" />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
