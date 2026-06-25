const ORG_B = { id: 'org-b', name: 'Org B', slug: 'org-b' }

/**
 * Phase-2 authorization regression fixtures (AC3/AC4). Idempotent.
 * Creates a SECOND org with alice as a `viewer` member, scoped to the NordVPN client ONLY
 * (a tier-0 exact access grant). Org B is created via the adapter directly — NOT the org
 * plugin — so it does NOT receive an afterCreateOrganization '*' grant. This is what proves
 * default-closed per-app selection: NordVPN → Org B (viewer); any other client → personal org.
 */
export default defineTask({
  meta: {
    name: 'seed:authz-fixtures',
    description: 'Phase-2 authz fixtures: Org B with alice as viewer scoped to the NordVPN client only',
  },
  async run() {
    const auth = serverAuth()
    const ctx = await auth.$context
    const adapter = ctx.adapter
    const now = new Date()

    const alice = await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: 'alice@seed.local' }] })
    if (!alice)
      throw new Error('alice@seed.local not found — run seed:idp first')

    const nordvpn = await adapter.findOne<{ clientId: string }>({ model: 'oauthClient', where: [{ field: 'name', value: 'NordVPN' }] })
    if (!nordvpn)
      throw new Error('NordVPN client not found — run seed:idp first')

    const existingOrg = await adapter.findOne<{ id: string }>({ model: 'organization', where: [{ field: 'slug', value: ORG_B.slug }] })
    const org = existingOrg ?? await adapter.create<{ id: string }>({
      model: 'organization',
      data: { id: ORG_B.id, name: ORG_B.name, slug: ORG_B.slug, createdAt: now },
    })

    const existingMember = await adapter.findOne<{ id: string }>({
      model: 'member',
      where: [{ field: 'organizationId', value: org.id }, { field: 'userId', value: alice.id }],
    })
    if (existingMember)
      await adapter.update({ model: 'member', where: [{ field: 'id', value: existingMember.id }], update: { role: 'viewer' } })
    else
      await adapter.create({ model: 'member', data: { id: `mem-${org.id}-${alice.id}`, organizationId: org.id, userId: alice.id, role: 'viewer', createdAt: now } })

    // Reseeding seed:idp recreates clients with NEW clientIds, orphaning prior scope rows.
    // Clear alice's Org B scopes so the ONLY grant is the current Express RP client (deterministic).
    await accessClearMember(org.id, alice.id)

    // tier-0 exact grant: alice may reach NordVPN — and ONLY NordVPN — inside Org B.
    // role:null → inherit the member's base role ('viewer'). Goes through the Phase-3 service.
    await accessSet({ organizationId: org.id, userId: alice.id, clientId: nordvpn.clientId, role: null })

    // Per-app CASL abilities on NordVPN for role `viewer`. Goes through clientUpdate (the single
    // writer) — this also re-pins metadata.clientId, so authz-proof.mjs doubles as the
    // regression guard that id_token scoping survived the metadata write (R1).
    await clientUpdate(adapter, nordvpn.clientId, {
      abilities: {
        viewer: [
          { action: 'view', subject: 'Post' },
          // eslint-disable-next-line no-template-curly-in-string
          { action: 'manage', subject: 'Post', conditions: { authorId: '${user.id}' } },
        ],
      },
    })

    return {
      result: 'ok',
      aliceId: alice.id,
      orgB: org.id,
      personalOrg: `org-u-${alice.id}`,
      nordvpnClientId: nordvpn.clientId,
      abilitiesRole: 'viewer',
    }
  },
})
