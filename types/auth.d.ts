declare module '#nuxt-better-auth' {
  interface AuthUser {
    role?: string | null
    banned?: boolean | null
  }
}

export {}
