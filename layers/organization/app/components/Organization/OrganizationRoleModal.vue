<script setup lang="ts">
import { statement } from '#shared/permissions'

interface RoleRow { name: string, builtin: boolean, permission: Record<string, string[]> }

const props = defineProps<{ role: RoleRow | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const orgApi = useOrgApi()
const toast = useToast()

const isEdit = computed(() => !!props.role)
const name = ref('')
const submitting = ref(false)

// subject -> verb -> boolean
const matrix = reactive<Record<string, Record<string, boolean>>>({})

function resetMatrix(seed?: Record<string, string[]>) {
  for (const [subject, verbs] of Object.entries(statement)) {
    matrix[subject] = {}
    for (const verb of verbs)
      matrix[subject][verb] = !!seed?.[subject]?.includes(verb)
  }
}

watch(open, (v) => {
  if (v) {
    name.value = props.role?.name ?? ''
    resetMatrix(props.role?.permission)
  }
})

function buildPermission(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [subject, verbs] of Object.entries(matrix)) {
    const picked = Object.entries(verbs).filter(([, on]) => on).map(([verb]) => verb)
    if (picked.length)
      out[subject] = picked
  }
  return out
}

const hasAnyPermission = computed(() => Object.values(matrix).some(verbs => Object.values(verbs).some(Boolean)))

async function submit() {
  if (!name.value.trim() || !hasAnyPermission.value)
    return
  submitting.value = true
  try {
    const permission = buildPermission()
    const { error } = isEdit.value
      ? await orgApi.updateRole({ roleName: props.role!.name, data: { permission } })
      : await orgApi.createRole({ role: name.value.trim(), permission })
    if (error)
      throw new Error(error.message ?? 'Failed to save role')
    toast.add({ title: isEdit.value ? 'Role updated' : 'Role created', color: 'success' })
    open.value = false
    emit('saved')
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Edit role' : 'Create role'" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Role name" required>
          <UInput v-model="name" :disabled="isEdit" placeholder="e.g. editor" class="w-full" />
        </UFormField>

        <div>
          <p class="text-sm font-medium mb-2">
            Permissions
          </p>
          <div class="space-y-3">
            <div v-for="(verbs, subject) in matrix" :key="subject" class="border border-default rounded p-3">
              <p class="text-sm font-medium capitalize mb-2">
                {{ subject }}
              </p>
              <div class="flex flex-wrap gap-3">
                <UCheckbox
                  v-for="(_on, verb) in verbs"
                  :key="verb"
                  v-model="verbs[verb]"
                  :label="verb"
                  class="capitalize"
                />
              </div>
            </div>
          </div>
          <p v-if="!hasAnyPermission" class="text-xs text-error mt-2">
            Select at least one permission.
          </p>
        </div>

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton :label="isEdit ? 'Save' : 'Create'" :loading="submitting" :disabled="!name.trim() || !hasAnyPermission" @click="submit" />
        </div>
      </div>
    </template>
  </UModal>
</template>
