import { useNuxtApp } from '#app'

export function useCasl() {
  const { $ability } = useNuxtApp() as { $ability: { can: (action: string, subject: string, field?: string) => boolean, cannot: (action: string, subject: string, field?: string) => boolean } }
  return {
    ability: $ability,
    can: (action: string, subject: string, field?: string) => $ability.can(action, subject, field),
    cannot: (action: string, subject: string, field?: string) => $ability.cannot(action, subject, field),
  }
}
