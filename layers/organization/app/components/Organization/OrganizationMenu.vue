<script setup lang="ts">
interface OrgRow { id: string, name: string, slug?: string }

defineProps<{ collapsed?: boolean }>()

const { session } = useUserSession()
const orgApi = useOrgApi()
const toast = useToast()
const router = useRouter()
const { activeOrgSlug } = useActiveOrg()

const activeOrgId = computed(() => session.value?.activeOrganizationId ?? null)

const orgs = ref<OrgRow[]>([])
const loading = ref(false)
const open = ref(false)
const createModalOpen = ref(false)
const creating = ref(false)
const newName = ref('')

async function loadOrgs() {
  loading.value = true
  try {
    const { data } = await orgApi.list()
    orgs.value = (data ?? []).map(o => ({ id: o.id, name: o.name, slug: o.slug }))
  }
  finally {
    loading.value = false
  }
}

watch(open, (val) => {
  if (val)
    loadOrgs()
})
watch(createModalOpen, (val) => {
  if (!val)
    newName.value = ''
})

const activeName = computed(() =>
  orgs.value.find(o => o.id === activeOrgId.value)?.name ?? 'Organization')

async function select(id: string) {
  if (id === activeOrgId.value)
    return
  open.value = false
  await orgApi.setActive(id)
  if (import.meta.client)
    window.location.reload()
}

async function submitCreate() {
  const name = newName.value.trim()
  if (!name)
    return
  creating.value = true
  try {
    const { data, error } = await orgApi.create({ name })
    if (error)
      throw new Error(error.message ?? 'Failed to create organization')
    toast.add({ title: 'Organization created', color: 'success' })
    createModalOpen.value = false
    open.value = false
    if (data?.id)
      await orgApi.setActive(data.id)
    if (import.meta.client)
      window.location.reload()
  }
  catch (err) {
    toast.add({ title: 'Failed to create organization', description: (err as Error).message, color: 'error' })
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'center', collisionPadding: 12 }">
    <UButton
      :label="collapsed ? undefined : activeName"
      icon="i-lucide-building"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
    />

    <template #content>
      <div class="w-56 flex flex-col">
        <div class="max-h-60 overflow-y-auto py-1">
          <button
            v-for="org in orgs"
            :key="org.id"
            type="button"
            class="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-elevated cursor-pointer text-left"
            @click="select(org.id)"
          >
            <UIcon
              :name="org.id === activeOrgId ? 'i-lucide-check' : 'i-lucide-building'"
              class="size-4 shrink-0"
            />
            <span class="truncate">{{ org.name }}</span>
          </button>
          <div v-if="loading" class="px-3 py-1.5 text-sm text-muted">
            Loading…
          </div>
          <div v-else-if="orgs.length === 0" class="px-3 py-1.5 text-sm text-muted">
            No organizations found.
          </div>
        </div>

        <div class="border-t border-default p-1">
          <button
            type="button"
            class="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-elevated cursor-pointer text-left rounded"
            @click="open = false; activeOrgSlug && router.push(`/orgs/${activeOrgSlug}`)"
          >
            <UIcon name="i-lucide-settings" class="size-4 shrink-0 text-muted" />
            <span class="text-muted">Manage organization</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-elevated cursor-pointer text-left rounded"
            @click="open = false; createModalOpen = true"
          >
            <UIcon name="i-lucide-plus" class="size-4 shrink-0 text-muted" />
            <span class="text-muted">Create organization</span>
          </button>
        </div>
      </div>
    </template>
  </UPopover>

  <UModal v-model:open="createModalOpen" title="Create organization">
    <template #body>
      <UFormField label="Name" required>
        <UInput
          v-model="newName"
          placeholder="e.g. Acme Corp"
          class="w-full"
          autofocus
          @keydown.enter="submitCreate"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="createModalOpen = false" />
        <UButton label="Create" :loading="creating" :disabled="!newName.trim()" @click="submitCreate" />
      </div>
    </template>
  </UModal>
</template>
