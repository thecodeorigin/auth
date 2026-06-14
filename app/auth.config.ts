import { apiKeyClient } from '@better-auth/api-key/client'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { defineClientAuth } from '@onmax/nuxt-better-auth/config'
import { polarClient } from '@polar-sh/better-auth/client'
import { adminClient, organizationClient } from 'better-auth/client/plugins'
import { ac, roles } from '#shared/permissions'

export default defineClientAuth({
  plugins: [
    adminClient(),
    organizationClient({
      ac,
      roles,
      dynamicAccessControl: { enabled: true },
    }),
    apiKeyClient(),
    oauthProviderClient(),
    polarClient(),
  ],
})
