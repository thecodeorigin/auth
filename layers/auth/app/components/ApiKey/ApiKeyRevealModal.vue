<script setup lang="ts">
const props = defineProps<{ apiKey: string | null }>()
const emit = defineEmits<{ acknowledged: [] }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const copied = ref(false)

watch(open, (v) => {
  if (v)
    copied.value = false
})

async function copy() {
  if (!props.apiKey)
    return
  try {
    await navigator.clipboard.writeText(props.apiKey)
    copied.value = true
    toast.add({ title: 'Copied to clipboard', color: 'success' })
  }
  catch {
    toast.add({ title: 'Copy failed', description: 'Select and copy the key manually.', color: 'error' })
  }
}

function acknowledge() {
  open.value = false
  emit('acknowledged')
}

// Block accidental navigation away before the key is copied.
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
  <UModal
    v-model:open="open"
    title="Copy your API key"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="This is the only time you'll see this key"
          description="Store it somewhere safe. It cannot be retrieved again once you close this dialog."
        />
        <div class="flex items-center gap-2">
          <UInput :model-value="apiKey ?? ''" readonly class="w-full font-mono text-xs" :ui="{ base: 'pr-2' }" />
          <UButton icon="i-lucide-copy" :color="copied ? 'success' : 'primary'" :label="copied ? 'Copied' : 'Copy'" @click="copy" />
        </div>
        <div class="flex justify-end">
          <UButton
            label="I've copied my key"
            :disabled="!copied"
            @click="acknowledge"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
