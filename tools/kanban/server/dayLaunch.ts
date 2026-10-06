// P1399 Phase C: Start fixing opens one Claude session in the founder's terminal.
//
// The launch contract (spec §7 rule 9), enforced by the route in server/day.ts, with this module
// doing the only privileged act:
//   - the prompt is built by the server from the latest run plus the decisions file; the request
//     never carries prompt text;
//   - a FIXED command runs via execFile, no shell: osascript, a fixed AppleScript, a fixed
//     launcher, a prompt FILE (0600, in a private 0700 temp dir), an ack file and a working dir;
//   - the prompt's text is never an argument: Claude starts with a one-line instruction naming the
//     file, and reads and deletes it itself;
//   - the launch counts only when the launcher touches the ack file, which it does once `claude`
//     exists in the founder's login shell, right before starting it (Phase C review: a tab that
//     opened is not a session that started).
// Ghostty accepts a scripted new tab: its AppleScript dictionary has `new tab … with
// configuration` (1.3.1), and a probe on 2026-10-04 (launcher /bin/echo) returned "tab" and added
// a tab to the founder's open window. With no window to put a tab in, the script opens a new
// window. If osascript fails the route answers with a copy fallback and records nothing.

import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

export type LaunchResult = { ok: true; how: 'tab' | 'window' } | { ok: false }
export type Launcher = (promptFile: string, ackFile: string, workdir: string) => Promise<LaunchResult>

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export const osascriptLauncher: Launcher = (promptFile, ackFile, workdir) =>
  new Promise((resolve) => {
    // KANBAN_DAY_LAUNCH=off: a board that must never open a terminal (the e2e suite) takes the
    // copy fallback instead.
    if (process.env.KANBAN_DAY_LAUNCH === 'off') return resolve({ ok: false })
    execFile(
      '/usr/bin/osascript',
      [join(SCRIPTS, 'day-launch.applescript'), join(SCRIPTS, 'day-launch.sh'), promptFile, ackFile, workdir],
      { timeout: 15_000 },
      (err, stdout) => {
        if (err) {
          // A code only (never the arguments or output): tells "not permitted" from a timeout.
          const e = err as NodeJS.ErrnoException & { killed?: boolean }
          console.warn(`[kanban] day: osascript failed (${e.killed ? 'timeout' : (e.code ?? 'error')})`)
          return resolve({ ok: false })
        }
        resolve({ ok: true, how: String(stdout).trim() === 'window' ? 'window' : 'tab' })
      },
    )
  })

let launcher: Launcher = osascriptLauncher
let clock: () => Date = () => new Date()

/** Tests move time to exercise the one-per-minute limit; null restores the real clock. */
export function setDayClock(c: (() => Date) | null): void {
  clock = c ?? (() => new Date())
}

export function dayClock(): Date {
  return clock()
}

/** Tests swap the launcher; null restores the real one. */
export function setDayLauncher(l: Launcher | null): void {
  launcher = l ?? osascriptLauncher
}

export function dayLauncher(): Launcher {
  return launcher
}

/** Where the session starts: the repo the board runs from, unless the launcher env says otherwise. */
export function launchWorkdir(): string {
  const d = process.env.KANBAN_DAY_LAUNCH_DIR
  return d && d.trim() ? d.trim() : REPO_ROOT
}

/** One collection = one prompt text; the same text is never sent twice. */
export function collectionHash(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16)
}

const LAUNCH_PREFIX = 'day-launch-'

/** The prompt goes to a private file (Claude reads and deletes it); the ack file is where the launcher says it started. */
export function writePromptFile(prompt: string): { file: string; ack: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), LAUNCH_PREFIX))
  const file = join(dir, 'prompt.txt')
  writeFileSync(file, prompt, { encoding: 'utf-8', mode: 0o600 })
  return { file, ack: join(dir, 'started'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Wait for the launcher's acknowledgement; false after `ms`. */
export async function waitForAck(ack: string, ms: number): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (existsSync(ack)) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return existsSync(ack)
}

/** Launch folders a session never read, older than a day, are removed (at server start). */
export function sweepLaunchDirs(maxAgeMs = 86_400_000): number {
  let n = 0
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith(LAUNCH_PREFIX)) continue
      const p = join(tmpdir(), name)
      try {
        if (Date.now() - statSync(p).mtimeMs > maxAgeMs) {
          rmSync(p, { recursive: true, force: true })
          n++
        }
      } catch {
        // gone already, or not ours to read
      }
    }
  } catch {
    // no temp dir listing: nothing to sweep
  }
  return n
}

/** How long the server waits for the launcher's acknowledgement (tests shorten it). */
export function ackWaitMs(): number {
  const v = Number(process.env.KANBAN_DAY_ACK_MS)
  return Number.isFinite(v) && v > 0 ? v : 20_000
}
