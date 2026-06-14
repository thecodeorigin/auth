<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const is404 = computed(() => props.error?.statusCode === 404)
const title = computed(() => (is404.value ? 'Page not found' : 'Something went wrong'))
const description = computed(() =>
  is404.value
    ? 'The page you are looking for does not exist or has moved.'
    : (props.error?.statusMessage || 'An unexpected error occurred.'))

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="min-h-svh flex items-center justify-center p-4 bg-muted">
    <div class="w-full max-w-sm">
      <UCard>
        <div class="space-y-3 text-center">
          <UIcon :name="is404 ? 'i-lucide-map-pin-off' : 'i-lucide-triangle-alert'" class="size-10 text-error mx-auto" />
          <h1 class="text-lg font-semibold text-highlighted">
            {{ error?.statusCode }} — {{ title }}
          </h1>
          <p class="text-sm text-muted">
            {{ description }}
          </p>
          <UButton label="Back to Home" block @click="goHome" />
        </div>
      </UCard>
    </div>
  </div>
</template>
