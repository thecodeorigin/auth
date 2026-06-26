const DEMO_ORG = { id: 'org-demo', name: 'Demo Org', slug: 'demo' }
const DYNAMIC_ROLE = 'project-viewer'
const DYNAMIC_ABILITY = { project: ['read'] }
const API_KEY_NAME = 'automation-test-key'

const TEST_USERS = [
  { email: 'alice@seed.local', name: 'Alice Member', password: 'Passw0rd!', orgRole: 'member' },
  { email: 'bob@seed.local', name: 'Bob Viewer', password: 'Passw0rd!', orgRole: DYNAMIC_ROLE },
]

const DEMO_CLIENTS = [
  { name: 'NordVPN', redirectUris: ['http://localhost:3001/callback'], public: false },
  { name: 'NordPass', redirectUris: ['http://localhost:3002/api/auth/callback/betterauth'], public: false },
  { name: 'NordLocker', redirectUris: ['http://localhost:3003/auth/oidc/callback'], public: false },
  { name: 'Nord Web', redirectUris: ['http://localhost:3004/callback'], public: true },
  { name: 'auth-module-playground', redirectUris: ['http://localhost:3001/auth/callback'], public: false },
]

export default defineTask({
  meta: {
    name: 'seed:idp',
    description: 'Seed system admin, demo org, dynamic role, test users, automation key, demo OAuth clients',
  },
  async run() {
    const auth = serverAuth()
    const ctx = await auth.$context
    const adapter = ctx.adapter
    const rc = useRuntimeConfig()
    const adminEmail = rc.seedAdminEmail || 'contact@thecodeorigin.com'
    const now = new Date()

    async function ensureUser(email: string, password: string, name: string, role?: string): Promise<string> {
      let found = await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: email }] })
      if (!found) {
        await auth.api.signUpEmail({ body: { email, password, name } }).catch(() => undefined)
        found = await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: email }] })
      }
      if (!found)
        throw new Error(`failed to create user ${email}`)
      await adapter.update({
        model: 'user',
        where: [{ field: 'id', value: found.id }],
        // Also reset `name` so test runs that mutate the display name (e.g.
        // profile-update tests) are idempotent after re-seeding.
        update: { emailVerified: true, name, updatedAt: now, ...(role ? { role } : {}) },
      })
      return found.id
    }

    const adminId = await ensureUser(adminEmail, 'AdminPass1!', 'System Admin', 'admin')
    const testUsers = []
    for (const testUser of TEST_USERS)
      testUsers.push({ ...testUser, id: await ensureUser(testUser.email, testUser.password, testUser.name) })

    const existingOrg = await adapter.findOne<{ id: string }>({ model: 'organization', where: [{ field: 'slug', value: DEMO_ORG.slug }] })
    const org = existingOrg ?? await adapter.create<{ id: string }>({
      model: 'organization',
      data: { id: DEMO_ORG.id, name: DEMO_ORG.name, slug: DEMO_ORG.slug, createdAt: now },
    })

    const permission = JSON.stringify(DYNAMIC_ABILITY)
    const existingRole = await adapter.findOne<{ id: string }>({
      model: 'organizationRole',
      where: [{ field: 'organizationId', value: org.id }, { field: 'role', value: DYNAMIC_ROLE }],
    })
    if (existingRole)
      await adapter.update({ model: 'organizationRole', where: [{ field: 'id', value: existingRole.id }], update: { permission, updatedAt: now } })
    else
      await adapter.create({ model: 'organizationRole', data: { id: `orole-${org.id}-${DYNAMIC_ROLE}`, organizationId: org.id, role: DYNAMIC_ROLE, permission, createdAt: now, updatedAt: now } })

    async function ensureMember(userId: string, role: string): Promise<void> {
      const existing = await adapter.findOne<{ id: string }>({
        model: 'member',
        where: [{ field: 'organizationId', value: org.id }, { field: 'userId', value: userId }],
      })
      if (existing)
        await adapter.update({ model: 'member', where: [{ field: 'id', value: existing.id }], update: { role } })
      else
        await adapter.create({ model: 'member', data: { id: `mem-${org.id}-${userId}`, organizationId: org.id, userId, role, createdAt: now } })
    }
    await ensureMember(adminId, 'owner')
    for (const testUser of testUsers)
      await ensureMember(testUser.id, testUser.orgRole)

    const seededClients = []
    for (const demo of DEMO_CLIENTS) {
      const existing = await adapter.findOne<{ clientId: string }>({ model: 'oauthClient', where: [{ field: 'name', value: demo.name }] })
      if (existing)
        await adapter.delete({ model: 'oauthClient', where: [{ field: 'clientId', value: existing.clientId }] })
      seededClients.push(await clientCreate(adapter, {
        name: demo.name,
        redirectUris: demo.redirectUris,
        public: demo.public,
        skipConsent: true,
      }))
    }

    if (import.meta.dev && seededClients.length) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(`${process.cwd()}/examples/.clients.json`, `${JSON.stringify(seededClients, null, 2)}\n`)
    }

    const keyUser = testUsers.find(user => user.email === 'bob@seed.local')
    let apiKeyValue: string | null = null
    if (keyUser) {
      const existingKey = await adapter.findOne<{ id: string }>({
        model: 'apikey',
        where: [{ field: 'referenceId', value: keyUser.id }, { field: 'name', value: API_KEY_NAME }],
      })
      if (!existingKey) {
        const created = await auth.api.createApiKey({ body: { name: API_KEY_NAME, userId: keyUser.id } })
        apiKeyValue = created.key
      }
    }

    return {
      result: 'ok',
      adminId,
      org: org.id,
      dynamicRole: DYNAMIC_ROLE,
      clients: seededClients.map(client => ({ name: client.name, clientId: client.clientId })),
      testUsers: testUsers.map(user => user.email),
      apiKey: apiKeyValue ?? '(already seeded)',
    }
  },
})
