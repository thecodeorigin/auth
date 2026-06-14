// Client-side augmentation of the better-auth session shape. The admin +
// organization + impersonation plugins add these fields at runtime; the base
// `#nuxt-better-auth` interfaces don't declare them, so the UI augments here.
declare module '#nuxt-better-auth' {
  interface AuthUser {
    role?: string | null
    banned?: boolean | null
    banReason?: string | null
    banExpires?: Date | string | null
  }
  interface AuthSession {
    impersonatedBy?: string | null
    activeOrganizationId?: string | null
  }
}

export {}
