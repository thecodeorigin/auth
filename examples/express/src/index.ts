import express from 'express'
import session from 'express-session'
import * as client from 'openid-client'
import { config, redirect_uri } from './auth.js'
import 'dotenv/config' // must load before ./auth.js, which reads process.env at import time

const app = express()
app.use(session({ secret: 'dev', resave: false, saveUninitialized: false }))

function decodeJwtHeader(jwt: string): Record<string, unknown> {
  const [header] = jwt.split('.')
  return JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
}

app.get('/login', async (req, res) => {
  const code_verifier = client.randomPKCECodeVerifier()
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier)
  const state = client.randomState()
  ;(req.session as any).verifier = code_verifier
  ;(req.session as any).state = state
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri,
    scope: 'openid profile email',
    code_challenge,
    code_challenge_method: 'S256',
    state,
  })
  res.redirect(url.href)
})

app.get('/callback', async (req, res) => {
  const tokens = await client.authorizationCodeGrant(
    config,
    new URL(req.originalUrl, 'http://localhost:3001'),
    {
      pkceCodeVerifier: (req.session as any).verifier,
      expectedState: (req.session as any).state,
    },
  )
  const claims = tokens.claims()!
  // Acceptance check (C1/C2): the id_token must be RS256 with a kid present in JWKS.
  const idTokenHeader = tokens.id_token ? decodeJwtHeader(tokens.id_token) : null
  const userinfo = await client.fetchUserInfo(config, tokens.access_token, claims.sub)
  ;(req.session as any).user = userinfo
  ;(req.session as any).idTokenHeader = idTokenHeader
  console.log('[express-rp] id_token header:', idTokenHeader)
  res.redirect('/')
})

app.get('/', (req, res) => {
  const u = (req.session as any).user
  const h = (req.session as any).idTokenHeader
  if (!u) {
    res.send('<a href="/login">Sign in with auth.example.com</a>')
    return
  }
  res.send(
    `<h3>id_token header (must be RS256 + kid):</h3><pre>${JSON.stringify(h, null, 2)}</pre>`
    + `<h3>userinfo:</h3><pre>${JSON.stringify(u, null, 2)}</pre>`
    + `<a href="/login">re-login</a>`,
  )
})

app.listen(3001, () => console.log('express RP on http://localhost:3001'))
