/**
 * P1480 — a worktree's dev/e2e port must never be one Chromium refuses.
 *
 * Slot w10 used to compute 5000 + 10*100 = 6000, which Chromium blocks (ERR_UNSAFE_PORT, X11),
 * so every Playwright test in that slot died before the app loaded. The port is now defined once
 * in scripts/lib/worktree-port.mjs and every caller delegates to it.
 *
 * The oracle here is deliberately NOT the module under test: expected ports are written out as
 * the historical `5000 + N*100` scheme with the single 6000 -> 6050 remap, so a change to the
 * module that moves any other slot fails this file instead of redefining "correct".
 *
 * Three layers:
 *   1. The shared module, for every slot w1..w99, legacy1..9, named and main.
 *   2. Each real call site, evaluated from a fake checkout directory named like the slot —
 *      vite.config.ts and playwright.config.ts loaded through Vite's config loader,
 *      check-worktree-env.sh executed with bash. A copy of the config is placed in the fake
 *      directory because both configs derive the slot from their own location / cwd.
 *   3. A drift guard: no call site may carry its own copy of the formula again.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MODULE_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'worktree-port.mjs')

// Fetch standard "bad port" list (https://fetch.spec.whatwg.org/#port-blocking), 83 entries,
// read 2026-10-13. Kept here independently of the module's copy so the two are checked
// against each other rather than the module grading itself.
const FETCH_BAD_PORTS = [
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]

/** Today's port for slot N, before P1480: 5000 + N*100. Only 6000 (w10) moves, to 6050. */
function expectedSlotPort(n: number): number {
  const legacy = 5000 + n * 100
  return legacy === 6000 ? 6050 : legacy
}

type PortModule = {
  CHROMIUM_RESTRICTED_PORTS: ReadonlySet<number>
  worktreePort: (dir: string) => number
  worktreeSlot: (dir: string) => string | null
}

async function loadModule(): Promise<PortModule> {
  return (await import(/* @vite-ignore */ pathToFileURL(MODULE_PATH).href)) as PortModule
}

// ---------------------------------------------------------------------------------------------
// 1. The shared module
// ---------------------------------------------------------------------------------------------
describe('P1480 shared port module', () => {
  const wt = (name: string) => `/repo/.claude/worktrees/${name}`

  it('keeps the restricted list equal to the Fetch standard list', async () => {
    const m = await loadModule()
    expect([...m.CHROMIUM_RESTRICTED_PORTS].sort((a, b) => a - b)).toEqual(FETCH_BAD_PORTS)
  })

  it('maps w1..w99 to 5000 + N*100 except w10, which moves off 6000 to 6050', async () => {
    const m = await loadModule()
    for (let n = 1; n <= 99; n++) {
      expect(m.worktreePort(wt(`w${n}`)), `w${n}`).toBe(expectedSlotPort(n))
    }
    expect(m.worktreePort(wt('w10'))).toBe(6050)
  })

  it('maps legacy claritypledge-1..9 exactly like wN', async () => {
    const m = await loadModule()
    for (let n = 1; n <= 9; n++) {
      expect(m.worktreePort(`/home/dev/Projects/claritypledge-${n}`), `legacy${n}`).toBe(
        expectedSlotPort(n),
      )
    }
  })

  it('gives no slot a restricted port, and the w1..w99 ports are unique', async () => {
    const m = await loadModule()
    const ports = Array.from({ length: 99 }, (_, i) => m.worktreePort(wt(`w${i + 1}`)))
    for (const p of ports) expect(FETCH_BAD_PORTS, `port ${p}`).not.toContain(p)
    expect(new Set(ports).size).toBe(99)
  })

  it('keeps the remapped port clear of every other slot, the 5800-5899 hash range and 5001', async () => {
    const m = await loadModule()
    const w10 = m.worktreePort(wt('w10'))
    const others = Array.from({ length: 99 }, (_, i) => i + 1)
      .filter((n) => n !== 10)
      .map((n) => m.worktreePort(wt(`w${n}`)))
    expect(others).not.toContain(w10)
    expect(w10 >= 5800 && w10 <= 5899).toBe(false)
    expect(w10).not.toBe(5001)
  })

  it('leaves the main checkout on 5001 and named worktrees in 5800-5899', async () => {
    const m = await loadModule()
    expect(m.worktreePort('/home/dev/Projects/public/claritypledge')).toBe(5001)
    for (const name of ['landing-v4-artistic', 'p1234canary', 'x']) {
      const p = m.worktreePort(wt(name))
      expect(p >= 5800 && p <= 5899, `${name} -> ${p}`).toBe(true)
      expect(FETCH_BAD_PORTS).not.toContain(p)
    }
  })

  it('keeps the slot names the Vite dep-cache directory is keyed on', async () => {
    const m = await loadModule()
    expect(m.worktreeSlot(wt('w10'))).toBe('w10')
    expect(m.worktreeSlot('/home/dev/claritypledge-3')).toBe('legacy3')
    expect(m.worktreeSlot(wt('landing-v4-artistic'))).toBe('landing-v4-artistic')
    expect(m.worktreeSlot('/home/dev/Projects/public/claritypledge')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------
// 2. Each real call site, run from a directory named like the slot
// ---------------------------------------------------------------------------------------------

/**
 * A fake checkout: a REAL directory with the slot's name (process.cwd() resolves symlinks, so a
 * symlinked directory would report the real worktree's name), holding copies of the two config
 * files and symlinks to what they import.
 */
function makeCheckout(root: string, rel: string): string {
  const dir = path.join(root, rel)
  mkdirSync(dir, { recursive: true })
  for (const entry of ['node_modules', 'src', 'e2e', 'scripts']) {
    symlinkSync(path.join(REPO_ROOT, entry), path.join(dir, entry))
  }
  copyFileSync(path.join(REPO_ROOT, 'vite.config.ts'), path.join(dir, 'vite.config.ts'))
  copyFileSync(path.join(REPO_ROOT, 'playwright.config.ts'), path.join(dir, 'playwright.config.ts'))
  return realpathSync(dir)
}

const VITE_ENTRY = pathToFileURL(
  path.join(REPO_ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js'),
).href

// Loads both configs exactly as their tools would, from the current directory, and prints the
// ports each would use. Vite's loader injects the original file URL for import.meta.url, so
// playwright.config.ts sees the fake checkout as its own directory.
const PROBE = `
const { loadConfigFromFile } = await import(${JSON.stringify(VITE_ENTRY)});
const load = async (f) => (await loadConfigFromFile(
  { command: 'serve', mode: 'development' }, process.cwd() + '/' + f, process.cwd(), 'silent')).config;
const vite = await load('vite.config.ts');
const pw = await load('playwright.config.ts');
console.log('P1480_PROBE ' + JSON.stringify({
  vite: vite.server.port,
  baseURL: pw.use.baseURL,
  webServerCommand: pw.webServer.command,
  webServerUrl: pw.webServer.url,
}));
`

function probeConfigs(dir: string) {
  const env = { ...process.env }
  delete env.CSP_SMOKE_URL
  delete env.PROD_SMOKE_URL
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', PROBE], {
    cwd: dir,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const line = out.split('\n').find((l) => l.startsWith('P1480_PROBE '))
  if (!line) throw new Error(`probe printed no result:\n${out}`)
  return JSON.parse(line.slice('P1480_PROBE '.length)) as {
    vite: number
    baseURL: string
    webServerCommand: string
    webServerUrl: string
  }
}

/** check-worktree-env.sh's own answer, via its print-only mode (touches no process). */
function checkerPort(dir: string): string {
  return execFileSync('bash', [path.join(REPO_ROOT, 'scripts', 'check-worktree-env.sh')], {
    cwd: dir,
    env: { ...process.env, CHECK_WORKTREE_ENV_PRINT_PORT: '1' },
    encoding: 'utf8',
  }).trim()
}

describe('P1480 call sites agree from a slot-named checkout', () => {
  let root: string
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'p1480-'))
  })
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  // Representative slots: the remapped one, both neighbours, the ends of the range, a legacy
  // checkout, a named worktree and the main checkout.
  const cases: Array<{ rel: string; expected: number | 'named' }> = [
    { rel: 'worktrees/w10', expected: 6050 },
    { rel: 'worktrees/w9', expected: 5900 },
    { rel: 'worktrees/w11', expected: 6100 },
    { rel: 'worktrees/w1', expected: 5100 },
    { rel: 'worktrees/w99', expected: 14900 },
    { rel: 'legacy/claritypledge-3', expected: 5300 },
    { rel: 'worktrees/p1480-named', expected: 'named' },
    { rel: 'main/claritypledge', expected: 5001 },
  ]

  for (const { rel, expected } of cases) {
    it(`${rel}: vite, playwright and the predev checker compute one port`, async () => {
      const dir = makeCheckout(root, rel)
      const probe = probeConfigs(dir)
      const checker = Number(checkerPort(dir))

      if (expected === 'named') {
        expect(probe.vite >= 5800 && probe.vite <= 5899).toBe(true)
      } else {
        expect(probe.vite).toBe(expected)
      }
      expect(probe.baseURL).toBe(`http://localhost:${probe.vite}`)
      expect(probe.webServerUrl).toBe(`http://localhost:${probe.vite}`)
      expect(probe.webServerCommand).toBe(`npm run dev -- --port ${probe.vite}`)
      expect(checker).toBe(probe.vite)
      expect(FETCH_BAD_PORTS).not.toContain(probe.vite)
    }, 60_000)
  }
})

// ---------------------------------------------------------------------------------------------
// 3. Drift guard — the formula lives in exactly one file
// ---------------------------------------------------------------------------------------------
describe('P1480 drift guard', () => {
  const callSites = [
    'vite.config.ts',
    'playwright.config.ts',
    'scripts/check-worktree-env.sh',
    'e2e/save-auth.ts',
  ]

  for (const file of callSites) {
    it(`${file} delegates to scripts/lib/worktree-port.mjs and has no formula of its own`, () => {
      const src = readFileSync(path.join(REPO_ROOT, file), 'utf8')
      expect(src).toContain('worktree-port.mjs')
      expect(src).not.toMatch(/5000\s*\+/)
      expect(src).not.toMatch(/5800\s*\+/)
    })
  }
})
