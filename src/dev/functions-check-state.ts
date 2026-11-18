/**
 * P1705 (section C): the pure part of the dev-server "does TEST serve this branch's functions" mark.
 * No spawning, no DOM, no clock reads except through the arguments, so every state is unit-testable.
 *
 * The check is scripts/selfhosted/branch-functions-check.sh (P1312, extended by P1705 so a branch
 * with no function changes still compares the server with main's tip). Its first line is the status
 * and its exit code is the contract; scripts/lib/branch-functions-verdict.mjs parses both.
 *
 * States shown to the person: match, differs, unknown, stale. Only the first three come from a check;
 * stale is derived from age by displayState.
 */
import { parseCheckResult } from '../../scripts/lib/branch-functions-verdict.mjs'

/** Vite dev-channel custom event name, shared by the plugin (sender) and the page (receiver). */
export const FUNCTIONS_CHECK_EVENT = 'p1705:test-functions-check'
/** Sent by the page once its listener is up, asking for the latest result (sender: the banner). */
export const FUNCTIONS_CHECK_REQUEST = 'p1705:test-functions-check:request'
/** The check runs at dev-server start and then at this interval. */
export const CHECK_INTERVAL_MS = 30 * 60 * 1000

export type CheckKind = 'match' | 'differs' | 'unknown'
export type DisplayKind = CheckKind | 'stale'

export interface FunctionsCheckState {
  kind: CheckKind
  /** Epoch ms when the check finished. */
  checkedAt: number
  /** The check's first line, as printed. */
  line: string
  /** differs only: the function names, from the first line. */
  functions: string[]
  /** differs only: the branch (and time) the server's deploy record names. */
  branch: string
  /** differs only: the check's fix text, every line (commands stay indented). */
  fix: string[]
  /** unknown only: why the check could not run. */
  reason: string
}

export interface CheckInput {
  status: number | null
  stdout: string
  /** The check did not finish before the deadline and was killed. */
  timedOut?: boolean
  /** The check could not be started at all. */
  spawnError?: string
  /** The TEST host did not resolve, so the check was not run (unknown, never silence). */
  offline?: boolean
  now: number
}

const base = (kind: CheckKind, now: number, line: string): FunctionsCheckState =>
  ({ kind, checkedAt: now, line, functions: [], branch: '', fix: [], reason: '' })

/** From the check's exit code, output and timestamps to one state object. Never throws. */
export function toState(input: CheckInput): FunctionsCheckState {
  const { now } = input
  if (input.timedOut) {
    return { ...base('unknown', now, 'unknown: timed out'), reason: 'the check did not answer before its deadline' }
  }
  if (input.offline) {
    return { ...base('unknown', now, 'unknown: offline'), reason: 'offline: the TEST host name did not resolve, so the check did not run' }
  }
  if (input.spawnError) {
    return { ...base('unknown', now, 'unknown: not started'), reason: `the check could not be started (${input.spawnError})` }
  }
  const r = parseCheckResult({ status: input.status, stdout: input.stdout })
  // The check prints "no changed functions" only in its old form; it still counts as nothing to flag.
  if (r.state === 'match' || r.state === 'none') return base('match', now, r.line)
  if (r.state === 'differs') {
    const m = /^differs: (.*?) \(server has (.*)\)\s*$/.exec(r.line)
    // Every line, not just the indented commands: the unindented ones say where a command must run
    // ("From a clean checkout of main", "not from this branch"), and a command without that is unsafe.
    const fix = r.detail.split('\n').map((l) => l.trimEnd()).filter(Boolean)
    return {
      ...base('differs', now, r.line),
      functions: (m?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      branch: m?.[2] ?? '',
      fix,
    }
  }
  return { ...base('unknown', now, r.line), reason: r.line.replace(/^unknown:\s*/, '') }
}

/** Why a dev server must not run the check, or null. `env` is process.env. */
export function skipReason(env: Record<string, string | undefined>): string | null {
  if (env.VITEST) return 'running under Vitest'
  if (env.P1705_SKIP_FUNCTIONS_CHECK) return 'started by Playwright (its global setup runs the same check)'
  if (env.E2E_LOADTEST) return 'started by the load driver (its global setup runs the same check)'
  return null
}

export interface Display {
  kind: DisplayKind
  /** Age of the last check in whole minutes (0 when under a minute). */
  ageMinutes: number
  state: FunctionsCheckState
}

/** What to show now: the last state, or stale when it is older than one interval. */
export function displayState(state: FunctionsCheckState, now: number, intervalMs = CHECK_INTERVAL_MS): Display {
  const age = Math.max(0, now - state.checkedAt)
  return { kind: age > intervalMs ? 'stale' : state.kind, ageMinutes: Math.floor(age / 60000), state }
}
