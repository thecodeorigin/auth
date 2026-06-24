import { planBySlug } from '#shared/catalog'

// Today = 2026-06-14. Dates chosen to match the Nord Account screenshots.
const DEC_14_2023 = Date.parse('2023-12-14T00:00:00Z')
const OCT_03_2027 = Date.parse('2027-10-03T00:00:00Z')
const SEP_14_2027 = Date.parse('2027-09-14T00:00:00Z')

// Who sees the simulated platform: the member persona AND the operator login.
const DEMO_EMAILS = ['alice@seed.local', 'contact@thecodeorigin.com']

// (planSlug, status, currentPeriodEnd) — matches the dashboard screenshot exactly.
const DEMO_SUBS: Array<{ planSlug: string, status: 'active' | 'expired', end: number | null }> = [
  { planSlug: 'nordvpn-complete', status: 'expired', end: DEC_14_2023 },
  { planSlug: 'dark-web-monitor', status: 'expired', end: DEC_14_2023 },
  { planSlug: 'nordpass-premium', status: 'active', end: OCT_03_2027 },
  { planSlug: 'nordpass-family', status: 'active', end: SEP_14_2027 },
  { planSlug: 'nordlocker-free', status: 'active', end: null },
]

const FAMILY_MEMBER_EMAILS = [
  'hao100319@gmail.com',
  'quangtudng@gmail.com',
  'longnt189@gmail.com',
  'datntt98@gmail.com',
  'minhpt2002@gmail.com',
]

export default defineTask({
  meta: { name: 'seed:subscriptions', description: 'Seed Nord product subscriptions + NordPass Family seats for demo users' },
  async run() {
    const auth = serverAuth()
    const ctx = await auth.$context
    const adapter = ctx.adapter

    const out: Record<string, unknown> = {}
    for (const email of DEMO_EMAILS) {
      const u = await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: email }] })
      if (!u) {
        out[email] = 'skipped (user not found — run seed:idp first)'
        continue
      }
      for (const s of DEMO_SUBS) {
        await subscriptionUpsert({
          userId: u.id,
          planSlug: s.planSlug,
          status: s.status,
          currentPeriodEnd: s.end,
          seats: planBySlug(s.planSlug)?.seats ?? 1,
          source: 'seed',
        })
      }

      // NordPass Family: owner seat + 5 members = 6/6 (fills the 6 pre-paid seats).
      const familyId = `sub-seed-${u.id}-nordpass-family`
      await familyEnsureOwner(familyId, email, u.id)
      await familyClearNonOwner(familyId) // deterministic: drop prior/extra members
      const familySub = await subscriptionGet(familyId)
      if (familySub) {
        for (const m of FAMILY_MEMBER_EMAILS)
          await familyAddMember(familySub, m)
      }
      out[email] = 'seeded'
    }
    return { result: 'ok', users: out }
  },
})
