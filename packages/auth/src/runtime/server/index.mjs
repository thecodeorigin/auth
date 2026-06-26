import { createJiti } from "file:///D:/projects/better-auth/node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs";

const jiti = createJiti(import.meta.url, {
  "interopDefault": true,
  "alias": {
    "@thecodeorigin/auth": "D:/projects/better-auth/packages/auth"
  },
  "transformOptions": {
    "babel": {
      "plugins": []
    }
  }
})

/** @type {import("D:/projects/better-auth/packages/auth/src/runtime/server/index.mjs")} */
const _module = await jiti.import("D:/projects/better-auth/packages/auth/src/runtime/server/index.mjs");

export const getServerAuthSession = _module.getServerAuthSession;