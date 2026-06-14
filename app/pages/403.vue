<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })
</script>

<template>
  <UCard>
    <div class="space-y-3 text-center">
      <UIcon name="i-lucide-shield-x" class="size-10 text-error mx-auto" />
      <h1 class="text-lg font-semibold text-highlighted">
        Access denied
      </h1>
      <p class="text-sm text-muted">
        You don't have permission to view this page.
      </p>
      <UButton to="/" label="Back to Home" block />
    </div>
  </UCard>
</template>
