export default defineNuxtConfig({
  modules: ['@thecodeorigin/auth'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  devServer: { port: 3001 },
  auth: {
    issuer: 'http://localhost:3000/api/auth',
    clientId: '',
    routes: {
      signIn: '/auth/sign-in',
      callback: '/auth/callback',
      signOut: '/auth/sign-out',
      home: '/',
      error: '/',
    },
  },
})
