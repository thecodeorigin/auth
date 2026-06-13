const ORG_B = { id: 'org-b', name: 'Org B', slug: 'org-b' }

/**
 * Phase-2 authorization regression fixtures (AC3/AC4). Idempotent.
 * Creates a SECOND org with alice as a `viewer` member, scoped to the Express RP client ONLY
 * (a tier-0 exact memberAppScope grant). Org B is created via the adapter directly — NOT the org
 * plugin — so it does NOT receive an afterCreateOrganization '*' grant. This is what proves
 * default-closed per-app selection: Express RP → Org B (viewer); any other client → personal org.
 */
export default defineTask({
  meta: {
    name: 'seed:authz-fixtures',
    description: 'Phase-2 authz fixtures: Org B with alice as viewer scoped to the Express RP client only',
  },
  async run() {
    const auth = serverAuth()
    const ctx = await auth.$context
    const adapter = ctx.adapter
    const now = new Date()

    const alice = await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: 'alice@seed.local' }] })
    if (!alice)
      throw new Error('alice@seed.local not found — run seed:idp first')

    const express = await adapter.findOne<{ clientId: string }>({ model: 'oauthClient', where: [{ field: 'name', value: 'Express RP' }] })
    if (!express)
      throw new Error('Express RP client not found — run seed:idp first')

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
    await removeMemberAppScopes(org.id, alice.id)

    // tier-0 exact grant: alice may reach Express RP — and ONLY Express RP — inside Org B.
    // role:null → inherit the member's base role ('viewer'). Goes through the Phase-3 service.
    await setMemberAppScope({ organizationId: org.id, userId: alice.id, clientId: express.clientId, role: null })

    return {
      result: 'ok',
      aliceId: alice.id,
      orgB: org.id,
      personalOrg: `org-u-${alice.id}`,
      expressClientId: express.clientId,
    }
  },
})
