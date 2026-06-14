import { organization } from '@nuxthub/db/schema'
import { eq } from 'drizzle-orm'

// Remove stray test orgs left behind by prior /cook + /verify sessions
// (alice "created" them, so they showed up in her org switcher). Idempotent.
// Refuses to touch personal orgs (slug `u-*`).
const TARGET_SLUGS = ['verify-walk', 'cook-test-med7tm']

export default defineTask({
  meta: { name: 'refactor:cleanup-test-orgs', description: 'Delete stray test orgs (Verify Walk / Cook Test) + all dependent rows' },
  async run() {
    const out: Record<string, string> = {}
    for (const slug of TARGET_SLUGS) {
      if (slug.startsWith('u-')) {
        out[slug] = 'refused (personal org)'
        continue
      }
      const org = await db.query.organization.findFirst({ where: eq(organization.slug, slug) })
      if (!org) {
        out[slug] = 'not found'
        continue
      }
      await orgDeleteCascade(org.id)
      out[slug] = `deleted (${org.id})`
    }
    return { result: 'ok', orgs: out }
  },
})
