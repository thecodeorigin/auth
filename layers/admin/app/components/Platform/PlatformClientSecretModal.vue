<script setup lang="ts">
const props = defineProps<{ clientId: string | null, clientSecret: string | null }>()
const emit = defineEmits<{ acknowledged: [] }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const copied = ref(false)

watch(open, (v) => {
  if (v)
    copied.value = false
})

async function copy() {
  if (!props.clientSecret)
    return
  try {
    await navigator.clipboard.writeText(props.clientSecret)
    copied.value = true
    toast.add({ title: 'Secret copied', color: 'success' })
  }
  catch {
    toast.add({ title: 'Copy failed', description: 'Copy the secret manually.', color: 'error' })
  }
}

function acknowledge() {
  open.value = false
  emit('acknowledged')
}

function beforeUnload(e: BeforeUnloadEvent) {
  if (open.value && !copied.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <UModal v-model:open="open" title="Client credentials" :dismissible="false" :close="false" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <div class="space-y-4">
        <UAlert color="warning" variant="soft" icon="i-lucide-triangle-alert" title="Copy the client secret now" description="This is the only time the secret will be shown. It cannot be retrieved again." />
        <UFormField label="Client ID">
          <UInput :model-value="clientId ?? ''" readonly class="w-full font-mono text-xs" />
        </UFormField>
        <UFormField label="Client secret">
          <div class="flex items-center gap-2">
            <UInput :model-value="clientSecret ?? ''" readonly class="w-full font-mono text-xs" />
            <UButton icon="i-lucide-copy" :color="copied ? 'success' : 'primary'" :label="copied ? 'Copied' : 'Copy'" @click="copy" />
          </div>
        </UFormField>
        <div class="flex justify-end">
          <UButton label="I've copied the secret" :disabled="!copied" @click="acknowledge" />
        </div>
      </div>
    </template>
  </UModal>
</template>
