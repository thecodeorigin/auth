// Agent sign-in proof: the dev-only /api/_agent/sign-in endpoint establishes a
// real session for each seeded role (so node + browser automation isn't blocked),
// and refuses open redirects. Requires NUXT_AGENT_AUTH_ENABLED=true on the dev server.
const ORIGIN = process.env.IDP_ORIGIN || 'http://localhost:3000'

const setCookie = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

/** Sign in as a seeded role via the agent endpoint; returns the session cookie header. */
export async function agentLogin(role, redirect = '/') {
  const res = await fetch(`${ORIGIN}/api/_agent/sign-in?role=${role}&redirect=${encodeURIComponent(redirect)}`, { redirect: 'manual' })
  if (res.status !== 302)
    throw new Error(`agent sign-in for ${role} expected 302, got ${res.status} (is NUXT_AGENT_AUTH_ENABLED=true?)`)
  const cookie = setCookie(res)
  if (!cookie.includes('session_token'))
    throw new Error(`agent sign-in for ${role} set no session cookie`)
  return { cookie, location: res.headers.get('location') }
}

let failures = 0
function assert(label, actual, expected) {
  const ok = actual === expected
  console.log(`  ${ok ? '✓' : '✗'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ` — EXPECTED ${JSON.stringify(expected)}`}`)
  if (!ok)
    failures++
}

// Run as a standalone proof only when invoked directly (not when imported as a helper).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('agent-proof.mjs')) {
  const ROLES = [
    { role: 'admin', email: 'admin@thecodeorigin.com', sysAdmin: true },
    { role: 'member', email: 'alice@seed.local', sysAdmin: false },
    { role: 'viewer', email: 'bob@seed.local', sysAdmin: false },
  ]
  for (const { role, email, sysAdmin } of ROLES) {
    const { cookie } = await agentLogin(role)
    const session = await (await fetch(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } })).json()
    assert(`${role} session email`, session?.user?.email, email)
    assert(`${role} is system admin`, session?.user?.role === 'admin', sysAdmin)
  }
  // Open-redirect guard.
  const evil = await fetch(`${ORIGIN}/api/_agent/sign-in?role=member&redirect=https://evil.com`, { redirect: 'manual' })
  assert('open-redirect rejected → /', evil.headers.get('location'), '/')
  const proto = await fetch(`${ORIGIN}/api/_agent/sign-in?role=member&redirect=//evil.com`, { redirect: 'manual' })
  assert('protocol-relative redirect rejected → /', proto.headers.get('location'), '/')

  if (failures) {
    console.error(`\n❌ AGENT FAIL: ${failures} assertion(s).`)
    process.exit(1)
  }
  console.log('\n✅ AGENT PROVEN: dev-only sign-in works for every seeded role; open redirects refused.')
}
