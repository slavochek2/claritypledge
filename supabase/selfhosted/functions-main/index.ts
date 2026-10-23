// P1557 self-hosted edge-runtime main router.
//
// Derived from the upstream Supabase docker `volumes/functions/main/index.ts` (release v1.26.08).
// Upstream has ONE global VERIFY_JWT switch. The hosted repo deploys create-and-sign and
// event-email-link without JWT verification and every other function with it, so a global switch
// is not parity: off exposes 19 functions, on breaks anonymous invitees and inbox links.
//
// Differences from upstream (everything else is verbatim):
//   1. The JWT decision is per function. Names in no-verify-jwt-functions.txt (a copy of
//      supabase/no-verify-jwt-functions.txt, written next to this file by
//      scripts/selfhosted/deploy-functions.sh) pass through; every other function needs a valid
//      HS256 Bearer JWT signed with JWT_SECRET that carries an unexpired `exp`. This router is
//      the only decider: the VERIFY_JWT env var is NOT read, so no env setting can switch
//      verification off for a function that is not on the list.
//   2. Fail closed: an unreadable or missing list means NO function is open.
//   3. The function name is validated before it becomes a filesystem path (no `main`, no
//      underscore-prefixed library dirs such as `_shared`).
//
// Not reproduced from the hosted gateway: ES256/RS256 tokens (this server runs legacy HS256 keys
// only; JWT_KEYS/JWT_JWKS are empty).
import * as jose from 'jsr:@panva/jose@6'

console.log('main function started')

const JWT_SECRET = Deno.env.get('JWT_SECRET')
const OPEN_LIST_PATH = '/home/deno/functions/main/no-verify-jwt-functions.txt'
const FUNCTION_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/

function loadOpenFunctions(): Set<string> {
  try {
    const names = Deno.readTextFileSync(OPEN_LIST_PATH)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'))
    console.log(`open (no JWT) functions: ${names.join(', ') || '(none)'}`)
    return new Set(names)
  } catch (e) {
    console.error(`cannot read ${OPEN_LIST_PATH}: no function will be open`, e)
    return new Set()
  }
}

const OPEN_FUNCTIONS = loadOpenFunctions()

function getAuthToken(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    throw new Error('Missing authorization header')
  }
  const [bearer, token] = authHeader.split(' ')
  if (bearer !== 'Bearer' || !token) {
    throw new Error(`Auth header is not 'Bearer {token}'`)
  }
  return token
}

async function isValidJWT(jwt: string): Promise<boolean> {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET not available for HS256 token verification')
    return false
  }
  try {
    await jose.jwtVerify(jwt, new TextEncoder().encode(JWT_SECRET), {
      algorithms: ['HS256'],
      requiredClaims: ['exp'],
    })
  } catch (e) {
    console.error('JWT verification error', e)
    return false
  }
  return true
}

function json(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const path_parts = url.pathname.split('/')
  const service_name = path_parts[1]

  if (!service_name || service_name === '') {
    return json(400, { msg: 'missing function name in request' })
  }
  if (!FUNCTION_NAME.test(service_name) || service_name === 'main') {
    return json(404, { msg: 'function not found' })
  }

  // OPTIONS is the CORS preflight and never carries credentials (same exemption as upstream).
  if (req.method !== 'OPTIONS' && !OPEN_FUNCTIONS.has(service_name)) {
    try {
      const bearerJwt = getAuthToken(req)
      if (!(await isValidJWT(bearerJwt))) {
        return json(401, { msg: 'Invalid JWT' })
      }
    } catch (e) {
      console.error(e)
      return json(401, { msg: String(e) })
    }
  }

  const servicePath = `/home/deno/functions/${service_name}`
  console.error(`serving the request with ${servicePath}`)

  const memoryLimitMb = 150
  const workerTimeoutMs = 1 * 60 * 1000
  const noModuleCache = false
  const importMapPath = null
  const envVarsObj = Deno.env.toObject()
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]])

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      importMapPath,
      envVars,
    })
    return await worker.fetch(req)
  } catch (e) {
    return json(500, { msg: String(e) })
  }
})
