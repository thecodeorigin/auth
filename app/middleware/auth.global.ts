export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, waitForSession } = useUserSession()

  try {
    await waitForSession()
  }
  catch {
    // session fetch failed — treat as unauthenticated
  }

  const isPublic = to.meta.public === true || to.meta.unauthenticatedOnly === true

  if (loggedIn.value && to.meta.unauthenticatedOnly)
    return navigateTo('/')

  if (!loggedIn.value && !isPublic)
    return navigateTo(`/sign-in?redirect=${encodeURIComponent(to.fullPath)}`)
})
