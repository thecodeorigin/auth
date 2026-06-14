<script setup lang="ts">
import * as z from 'zod'

const emit = defineEmits<{ created: [] }>()
const open = defineModel<boolean>('open', { default: false })

const api = useUsersApi()
const toast = useToast()

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  role: z.enum(['user', 'admin']),
})
type Schema = z.output<typeof schema>

const state = reactive<{ name: string, email: string, password: string, role: 'user' | 'admin' }>({
  name: '',
  email: '',
  password: '',
  role: 'user',
})

const submitting = ref(false)

watch(open, (v) => {
  if (!v)
    Object.assign(state, { name: '', email: '', password: '', role: 'user' })
})

async function onSubmit(event: { data: Schema }) {
  submitting.value = true
  try {
    // SEC-VERIFY: admin-created users are marked verified so they can sign in.
    const { error } = await api.create({
      name: event.data.name,
      email: event.data.email,
      password: event.data.password,
      role: event.data.role,
      data: { emailVerified: true },
    })
    if (error)
      throw new Error(error.message ?? 'Failed to create user')
    toast.add({ title: 'User created', color: 'success' })
    open.value = false
    emit('created')
  }
  catch (err) {
    toast.add({ title: 'Failed to create user', description: (err as Error).message, color: 'error' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="New user">
    <template #body>
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Name" name="name" required>
          <UInput v-model="state.name" placeholder="Jane Doe" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Email" name="email" required>
          <UInput v-model="state.email" type="email" placeholder="jane@example.com" class="w-full" />
        </UFormField>
        <UFormField label="Password" name="password" required help="Minimum 8 characters">
          <UInput v-model="state.password" type="password" placeholder="••••••••" class="w-full" />
        </UFormField>
        <UFormField label="System role" name="role" required>
          <USelect
            v-model="state.role"
            :items="[{ label: 'User', value: 'user' }, { label: 'Admin', value: 'admin' }]"
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton type="submit" label="Create user" :loading="submitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
