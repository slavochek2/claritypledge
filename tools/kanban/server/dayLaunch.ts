// P1399 Phase C: Start fixing opens one Claude session in the founder's terminal.
//
// The launch contract (spec §7 rule 9), enforced by the route in server/day.ts, with this module
// doing the only privileged act:
//   - the prompt is built by the server from the latest run plus the decisions file; the request
//     never carries prompt text;
//   - a FIXED command runs via execFile, no shell: osascript, a fixed AppleScript, a fixed
//     launcher, a prompt FILE (0600, in a private temp dir) and a working dir — no other argv;
//   - the launcher reads the file and deletes it, so the prompt never sits in argv or in `ps`.
// Ghostty accepts a scripted new tab: its AppleScript dictionary has `new tab … with
// configuration` (1.3.1), and a probe on 2026-10-04 (launcher /bin/echo) returned "tab" and added
// a tab to the founder's open window. With no window to put a tab in, the script opens a new
// window. If osascript fails the route answers with a copy fallback and records nothing.

import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

export type LaunchResult = { ok: true; how: 'tab' | 'window' } | { ok: false }
export type Launcher = (promptFile: string, workdir: string) => Promise<LaunchResult>

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export const osascriptLauncher: Launcher = (promptFile, workdir) =>
  new Promise((resolve) => {
    // KANBAN_DAY_LAUNCH=off: a board that must never open a terminal (the e2e suite) takes the
    // copy fallback instead.
    if (process.env.KANBAN_DAY_LAUNCH === 'off') return resolve({ ok: false })
    execFile(
      '/usr/bin/osascript',
      [join(SCRIPTS, 'day-launch.applescript'), join(SCRIPTS, 'day-launch.sh'), promptFile, workdir],
      { timeout: 15_000 },
      (err, stdout) => {
        if (err) return resolve({ ok: false })
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

/** The prompt goes to a private file; the launcher deletes it after reading. */
export function writePromptFile(prompt: string): { file: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'day-launch-'))
  const file = join(dir, 'prompt.txt')
  writeFileSync(file, prompt, { encoding: 'utf-8', mode: 0o600 })
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
