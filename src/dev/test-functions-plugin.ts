/**
 * P1705 (section C): dev-only Vite plugin. At dev-server start and every 30 minutes it runs
 * scripts/selfhosted/branch-functions-check.sh in a child process (never blocking Vite) and pushes
 * the result to the page over Vite's dev channel. The page side is src/dev/test-functions-banner.ts.
 *
 * Skips: offline, VITEST, dev servers started by Playwright (P1705_SKIP_FUNCTIONS_CHECK, set in
 * playwright.config.ts webServer.env) and by the load driver (E2E_LOADTEST). See skipReason.
 *
 * Test seams (environment, never set in real runs):
 *   CP_BRANCH_FUNCTIONS_CHECK          path of a script to run instead of the real check (same seam as e2e)
 *   P1705_FUNCTIONS_CHECK_TIMEOUT_MS   deadline for one check run (default 60000)
 */
import { execFile } from 'node:child_process'
import dns from 'node:dns'
import path from 'node:path'
import type { Plugin } from 'vite'
import { CHECK_INTERVAL_MS, FUNCTIONS_CHECK_EVENT, FUNCTIONS_CHECK_REQUEST, skipReason, toState, type FunctionsCheckState } from './functions-check-state'

const TEST_HOST = '136-85-1-126.sslip.io'

export interface RunOptions {
  repoDir: string
  env: Record<string, string | undefined>
  now?: () => number
}

/** Run the check once, in a child process, with a deadline. Always resolves to a state. */
export function runFunctionsCheck({ repoDir, env, now = Date.now }: RunOptions): Promise<FunctionsCheckState> {
  const script = env.CP_BRANCH_FUNCTIONS_CHECK || path.join(repoDir, 'scripts/selfhosted/branch-functions-check.sh')
  const timeout = Number(env.P1705_FUNCTIONS_CHECK_TIMEOUT_MS) > 0 ? Number(env.P1705_FUNCTIONS_CHECK_TIMEOUT_MS) : 60_000
  return new Promise((resolve) => {
    try {
      execFile('bash', [script], { cwd: repoDir, env: env as NodeJS.ProcessEnv, timeout, encoding: 'utf8' }, (err, stdout) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null
        if (e && e.killed) return resolve(toState({ status: null, stdout: '', timedOut: true, now: now() }))
        if (e && typeof e.code === 'string') return resolve(toState({ status: null, stdout: '', spawnError: e.code, now: now() }))
        resolve(toState({ status: e ? Number(e.code) : 0, stdout: String(stdout ?? ''), now: now() }))
      })
    } catch (err) {
      resolve(toState({ status: null, stdout: '', spawnError: (err as Error).message, now: now() }))
    }
  })
}

/** Online means the TEST host name resolves within two seconds. */
export function defaultIsOnline(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 2000)
    dns.lookup(TEST_HOST, (err) => { clearTimeout(timer); resolve(!err) })
  })
}

export interface PluginOptions {
  repoDir: string
  env?: Record<string, string | undefined>
  intervalMs?: number
  isOnline?: () => Promise<boolean>
  run?: (o: RunOptions) => Promise<FunctionsCheckState>
}

export function testFunctionsCheckPlugin(opts: PluginOptions): Plugin {
  const env = opts.env ?? process.env
  const intervalMs = opts.intervalMs ?? CHECK_INTERVAL_MS
  const isOnline = opts.isOnline ?? defaultIsOnline
  const run = opts.run ?? runFunctionsCheck
  return {
    name: 'p1705-test-functions-check',
    apply: 'serve',
    configureServer(server) {
      if (skipReason(env)) return
      let last: FunctionsCheckState | null = null
      const send = () => { if (last) server.ws.send({ type: 'custom', event: FUNCTIONS_CHECK_EVENT, data: last }) }
      const tick = async () => {
        try {
          if (!(await isOnline())) return
          last = await run({ repoDir: opts.repoDir, env })
          send()
        } catch (err) {
          console.warn('[P1705] the functions check failed to run:', (err as Error).message)
        }
      }
      // The banner module loads after the page's dev client connects, so a replay on connect would be
      // lost. The page asks once it is listening; only that page is answered.
      server.ws.on(FUNCTIONS_CHECK_REQUEST, (_data: unknown, client: { send: (event: string, payload?: unknown) => void }) => {
        if (last) client.send(FUNCTIONS_CHECK_EVENT, last)
      })
      const start = () => { void tick() }
      if (server.httpServer) server.httpServer.once('listening', start)
      else setTimeout(start, 0)
      const timer = setInterval(start, intervalMs)
      timer.unref()
      server.httpServer?.once('close', () => clearInterval(timer))
    },
  }
}
