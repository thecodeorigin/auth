import { auth, signIn } from '../auth'

export default async function Page() {
  const session = await auth()
  if (!session) {
    return (
      <form
        action={async () => {
          'use server'
          await signIn('betterauth')
        }}
      >
        <button type="submit">Sign in with auth.example.com</button>
      </form>
    )
  }
  return <pre>{JSON.stringify(session.user, null, 2)}</pre>
}
