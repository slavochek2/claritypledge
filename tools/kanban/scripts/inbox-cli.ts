// P1317: the inbox CLI — the only write path the skills use on the task inbox.
// Invoked through scripts/inbox.sh. Shares lib/inbox.ts with the board, so the
// board and /note, /weekly, /monthly, /prioritize, /create-spec agree on what an
// entry is.
//
//   inbox.sh list     --store public|private [--due week|month|all]
//   inbox.sh count    --store public|private
//   inbox.sh check    --store public|private         exit 1 on any unparseable section or a stale counter
//   inbox.sh show     --store ... <ID>
//   inbox.sh locate   --store ... <ID>
//   inbox.sh add      --store ... --title T [--due week|month]   (body on stdin; prints the new ID)
//   inbox.sh delete   --store ... <ID> [--tombstone TEXT]         open entries only
//   inbox.sh annotate --store ... <ID> --text TEXT               open entries only
//   inbox.sh backfill --store ...
//
// `--file <path> --kind public|private` replaces `--store` (tests, fixtures).
//
// Exit codes: 0 ok · 1 check found problems · 2 usage/input error · 3 not found, ambiguous,
// or not open · 4 post-write verification failed (the file is restored) · 5 lock timeout or
// lost · 6 store absent.
//
// PRIVACY: errors name a path, a line and an ID — never a title or body.

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, chmodSync } from 'fs'
import { dirname, join, basename } from 'path'
import { execFileSync } from 'child_process'
import { randomBytes } from 'crypto'
import { parseStore, findById, formatId, kindOfId, countStates, type InboxKind, type InboxSection, type ParsedStore } from '../lib/inbox'
import { resolveInboxRoot, storeRel } from '../server/inbox'

const PRIVATE_HEADER = `# Process Learnings (private)

Private half of the repo's deferred-work inbox — infra, credentials, absolute paths, and anything
else that must not reach the public repo. Same format and same close rule as
\`docs/process-learnings.md\`; \`/weekly\` step 2.5 reads both. This file is gitignored.

---
`

class CliError extends Error {
  constructor(message: string, public code: number) {
    super(message)
  }
}

// ── argument parsing ────────────────────────────────────────────────────────

interface Args {
  cmd: string
  positional: string[]
  flags: Record<string, string>
}

function parseArgs(argv: string[]): Args {
  const [cmd = '', ...rest] = argv
  const positional: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a.startsWith('--')) {
      const v = rest[i + 1]
      if (v === undefined) throw new CliError(`missing value for ${a}`, 2)
      flags[a.slice(2)] = v
      i++
    } else {
      positional.push(a)
    }
  }
  return { cmd, positional, flags }
}

interface Target {
  kind: InboxKind
  path: string
  lockDir: string
}

function resolveTarget(flags: Record<string, string>): Target {
  if (flags.file) {
    const kind = flags.kind
    if (kind !== 'public' && kind !== 'private') throw new CliError('--file needs --kind public|private', 2)
    return { kind, path: flags.file, lockDir: `${flags.file}.lock` }
  }
  const kind = flags.store
  if (kind !== 'public' && kind !== 'private') throw new CliError('--store public|private is required', 2)
  const projectRoot = process.env.INBOX_PROJECT_ROOT ?? process.cwd()
  const root = resolveInboxRoot(projectRoot)
  if (!root) throw new CliError(`cannot resolve the main checkout from ${projectRoot}`, 2)
  // The lock lives in the git common dir, outside every working tree, so it is
  // never staged and is shared by every worktree of the repository.
  let lockBase: string
  try {
    lockBase = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    lockBase = join(root, '.git')
  }
  return { kind, path: join(root, storeRel(kind)), lockDir: join(lockBase, `inbox-${kind}.lock`) }
}

// ── lock ────────────────────────────────────────────────────────────────────
//
// mkdir is the atomic acquire; the lock dir holds `owner` = "<pid> <random token>".
//   - A lock is reclaimed ONLY when its owner process is gone (or it was never stamped).
//     A slow-but-live owner is never reclaimed on age alone: an earlier rule did that, and
//     a paused writer that resumed would overwrite the new holder's write with its stale
//     snapshot (Codex review of P1317).
//   - Reclaiming runs under a second, short-lived mkdir mutex, so two waiters that both
//     judged the same lock stale cannot both remove it (Opus review, W7).
//   - Every write re-reads `owner` immediately before the rename and aborts if the token is
//     not ours, so even a wrongly reclaimed lock cannot produce a lost update.

const sleepBuf = new Int32Array(new SharedArrayBuffer(4))
const sleep = (ms: number) => Atomics.wait(sleepBuf, 0, 0, ms)

const LOCK_TIMEOUT_MS = 20_000
const LOCK_UNSTAMPED_MS = 5_000
const TAKEOVER_STALE_MS = 5_000

let heldLock: { dir: string; token: string } | null = null

function lockIsStale(lockDir: string): boolean {
  let ageMs: number
  try {
    ageMs = Date.now() - statSync(lockDir).mtimeMs
  } catch {
    return false // vanished — just retry the acquire
  }
  let pid: number
  try {
    pid = Number(readFileSync(join(lockDir, 'owner'), 'utf-8').trim().split(' ')[0])
  } catch {
    return ageMs > LOCK_UNSTAMPED_MS // created but not yet stamped
  }
  if (!Number.isInteger(pid) || pid <= 0) return ageMs > LOCK_UNSTAMPED_MS
  try {
    process.kill(pid, 0)
    return false // owner is alive — never reclaimed, however old
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

function tryTakeover(lockDir: string): void {
  const mutex = `${lockDir}.takeover`
  try {
    mkdirSync(mutex)
  } catch {
    try {
      if (Date.now() - statSync(mutex).mtimeMs > TAKEOVER_STALE_MS) rmSync(mutex, { recursive: true, force: true })
    } catch { /* gone already */ }
    return // someone else is reclaiming; the caller retries the acquire
  }
  try {
    // Re-judge under the mutex: the lock may already have been replaced by a live owner.
    if (lockIsStale(lockDir)) rmSync(lockDir, { recursive: true, force: true })
  } finally {
    rmSync(mutex, { recursive: true, force: true })
  }
}

function assertLockHeld() {
  if (!heldLock) return // INBOX_TEST_NO_LOCK control only
  let owner = ''
  try {
    owner = readFileSync(join(heldLock.dir, 'owner'), 'utf-8').trim()
  } catch { /* lock dir gone */ }
  if (owner !== `${process.pid} ${heldLock.token}`) {
    throw new CliError(`lost the store lock before writing (${heldLock.dir}) — nothing was written`, 5)
  }
}

function withLock<T>(t: Target, fn: () => T): T {
  // INBOX_TEST_NO_LOCK exists only so the concurrency test can prove the lock is
  // what keeps IDs unique (a control that must FAIL). Never set it anywhere else.
  if (process.env.INBOX_TEST_NO_LOCK === '1') return fn()
  const token = randomBytes(8).toString('hex')
  const start = Date.now()
  for (;;) {
    try {
      mkdirSync(t.lockDir)
      writeFileSync(join(t.lockDir, 'owner'), `${process.pid} ${token}`)
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      if (lockIsStale(t.lockDir)) {
        tryTakeover(t.lockDir)
        continue
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new CliError(`lock held for over ${LOCK_TIMEOUT_MS / 1000}s by a live process: ${t.lockDir}`, 5)
      }
      sleep(25 + Math.floor(Math.random() * 50))
    }
  }
  heldLock = { dir: t.lockDir, token }
  try {
    return fn()
  } finally {
    let mine = false
    try {
      mine = readFileSync(join(t.lockDir, 'owner'), 'utf-8').trim() === `${process.pid} ${token}`
    } catch { /* already gone */ }
    if (mine) rmSync(t.lockDir, { recursive: true, force: true })
    heldLock = null
  }
}

// ── store io ────────────────────────────────────────────────────────────────

function readText(t: Target): string | null {
  try {
    return readFileSync(t.path, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

function requireText(t: Target): string {
  const text = readText(t)
  if (text === null) throw new CliError(`store absent: ${t.path}`, 6)
  return text
}

// Temp file + rename keeps a reader from ever seeing a half-written store. The temp name
// ends in `.inbox.tmp`, which .gitignore covers, so a crash between write and rename
// cannot leave a committable copy of the store behind (Opus review, N6). The original
// file mode is carried over, so a 600 private store stays 600 (W6).
function writeAtomic(path: string, text: string) {
  assertLockHeld()
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.inbox.tmp`)
  let mode: number | undefined
  try {
    mode = statSync(path).mode & 0o7777
  } catch { /* new file: default mode */ }
  writeFileSync(tmp, text, mode === undefined ? undefined : { mode })
  if (mode !== undefined) chmodSync(tmp, mode)
  renameSync(tmp, path)
}

/** Writes, then runs `verify` on a fresh parse; on failure restores the prior bytes (W2). */
function writeVerified(t: Target, before: string | null, after: string, verify: (p: ParsedStore) => string | null) {
  writeAtomic(t.path, after)
  const problem = verify(parseStore(requireText(t), t.kind))
  if (problem) {
    if (before === null) rmSync(t.path, { force: true })
    else writeAtomic(t.path, before)
    throw new CliError(`${problem} — the store was restored to its previous content`, 4)
  }
}

function testDelay() {
  const ms = Number(process.env.INBOX_TEST_DELAY_MS ?? 0)
  if (ms > 0) sleep(ms)
}

function one(parsed: ParsedStore, id: string, path: string): InboxSection {
  const hits = findById(parsed, id)
  if (hits.length === 0) throw new CliError(`no entry ${id} in ${path}`, 3)
  if (hits.length > 1) throw new CliError(`${id} occurs ${hits.length} times in ${path} — fix the store first`, 3)
  return hits[0]
}

/**
 * Mutations act on OPEN entries only. An unparseable section is a defect to fix at the
 * source, and resolving or dropping it through the normal path would erase whatever made
 * it malformed before anyone looked (Codex review of P1317). Fix the section by hand, re-run
 * `check`, then act on it.
 */
function oneOpen(parsed: ParsedStore, id: string, path: string): InboxSection {
  const s = one(parsed, id, path)
  if (s.state !== 'open') {
    throw new CliError(`${id} at ${path}:${s.line} is unparseable (${s.reasons.join(',')}) — fix it at the source first`, 3)
  }
  return s
}

function assertIdForStore(t: Target, id: string | undefined): asserts id is string {
  if (!id) throw new CliError('an entry ID is required', 2)
  if (kindOfId(id) !== t.kind) throw new CliError(`${id} is not a ${t.kind}-store ID`, 2)
}

/** Sets or inserts the preamble `**Next ID:**` line; returns new lines. */
function setNextId(lines: string[], parsed: ParsedStore, value: number): string[] {
  const out = [...lines]
  const line = `**Next ID:** ${value}`
  if (parsed.nextIdLine !== null) {
    out[parsed.nextIdLine - 1] = line
    return out
  }
  const firstSection = parsed.sections[0]?.line ?? out.length + 1
  const titleIdx = out.findIndex((l, i) => i < firstSection - 1 && /^# /.test(l))
  if (titleIdx === -1) out.splice(0, 0, line, '')
  else out.splice(titleIdx + 1, 0, '', line)
  return out
}

function nextNumber(parsed: ParsedStore): number {
  return Math.max(parsed.nextId ?? 1, parsed.maxId + 1)
}

// Body and title must not be able to forge structure the parser reads.
function assertInert(text: string, what: string) {
  for (const l of text.split(/\r?\n/)) {
    if (/^## /.test(l) || /^\*\*(Status|ID|Next ID|due):\*\*/.test(l) || /^ {0,3}(```|~~~)/.test(l) || /^ {0,3}<!--/.test(l)) {
      throw new CliError(`${what} contains a line the store format reserves (heading, field, fence, or comment)`, 2)
    }
  }
}

/**
 * The line range a delete removes: the heading through the entry's own content. Trailing
 * blank lines and single-line `<!-- … -->` tombstones sitting just above the next heading
 * belong to the file, not to this entry — an earlier version deleted a neighbour's
 * tombstone along with the entry above it (Opus review, W3).
 */
function deleteRange(lines: string[], s: InboxSection): { from: number; to: number } {
  let to = s.endLine - 1 // 0-based last line of the section
  while (to > s.line - 1 && (lines[to].trim() === '' || /^<!--.*-->\s*$/.test(lines[to]))) to--
  return { from: s.line - 1, to }
}

const ID_REASONS = new Set(['missing-id', 'malformed-id', 'multiple-id-lines', 'duplicate-id'])

// ── commands ────────────────────────────────────────────────────────────────

function cmdAdd(t: Target, flags: Record<string, string>) {
  const title = (flags.title ?? '').trim()
  if (!title || /[\r\n]/.test(title) || title.startsWith('#')) throw new CliError('--title must be one non-empty line', 2)
  const due = flags.due ?? 'week'
  if (due !== 'week' && due !== 'month') throw new CliError('--due must be week or month', 2)
  const body = readFileSync(0, 'utf-8').trim()
  if (!body) throw new CliError('the note body (stdin) is empty', 2)
  assertInert(body, 'body')
  if (/INBOX-/.test(title)) throw new CliError('title must not contain an inbox ID', 2)
  // A public note that names a private ID would disclose that private note (Opus review, N1).
  if (t.kind === 'public' && /INBOX-P\d/.test(body)) throw new CliError('a public note must not carry a private inbox ID', 2)
  const date = new Date().toISOString().slice(0, 10)

  return withLock(t, () => {
    const before = readText(t)
    let text = before
    if (text === null) {
      if (t.kind === 'public') throw new CliError(`public store absent: ${t.path} — it is committed; do not recreate it`, 6)
      mkdirSync(dirname(t.path), { recursive: true })
      text = PRIVATE_HEADER
    }
    const parsed = parseStore(text, t.kind)
    const n = nextNumber(parsed)
    if (parsed.nextId !== null && parsed.nextId <= parsed.maxId) {
      process.stderr.write(`inbox: counter ${parsed.nextId} was not above the highest ID ${parsed.maxId}; raised to ${n}\n`)
    }
    const id = formatId(t.kind, n)
    testDelay()

    let lines = setNextId(text.replace(/\s*$/, '').split(/\r?\n/), parsed, n + 1)
    lines = [...lines, '', `## ${title}`, '', `**ID:** ${id}`, `**Date:** ${date}`, '**Status:** proposed', `**due:** ${due}`, '', body, '', '---', '']
    writeVerified(t, before, lines.join('\n'), (after) => {
      const hits = findById(after, id)
      if (hits.length !== 1 || hits[0].state !== 'open' || after.nextId !== n + 1) {
        return `post-write check failed for ${id} in ${t.path} (occurrences: ${hits.length})`
      }
      return null
    })
    process.stdout.write(`${id}\n`)
  })
}

function cmdDelete(t: Target, positional: string[], flags: Record<string, string>) {
  const id = positional[0]
  assertIdForStore(t, id)
  const tomb = flags.tombstone
  if (tomb !== undefined) {
    // Tombstones must never carry an ID: a promoted private note's ID may not
    // survive anywhere, and a public ID in a tombstone reads as a live reference.
    if (/INBOX-/.test(tomb) || /[\r\n]/.test(tomb) || tomb.includes('-->')) {
      throw new CliError('--tombstone must be one line, with no inbox ID and no "-->"', 2)
    }
  }
  withLock(t, () => {
    const text = requireText(t)
    const parsed = parseStore(text, t.kind)
    const s = oneOpen(parsed, id, t.path)
    testDelay()
    const lines = text.split(/\r?\n/)
    const { from, to } = deleteRange(lines, s)
    lines.splice(from, to - from + 1, ...(tomb ? [`<!-- ${tomb} -->`] : []))
    writeVerified(t, text, lines.join('\n'), (after) => {
      if (findById(after, id).length !== 0) return `${id} still present after delete in ${t.path}`
      if (after.sections.length !== parsed.sections.length - 1) return `delete of ${id} changed more than one section in ${t.path}`
      return null
    })
    process.stdout.write(`deleted ${id} (was line ${s.line})\n`)
  })
}

function cmdAnnotate(t: Target, positional: string[], flags: Record<string, string>) {
  const id = positional[0]
  assertIdForStore(t, id)
  const note = (flags.text ?? '').trim()
  if (!note || /[\r\n]/.test(note)) throw new CliError('--text must be one non-empty line', 2)
  assertInert(note, 'text')
  if (/INBOX-/.test(note)) throw new CliError('--text must not contain an inbox ID', 2)
  withLock(t, () => {
    const text = requireText(t)
    const parsed = parseStore(text, t.kind)
    const s = oneOpen(parsed, id, t.path)
    const lines = text.split(/\r?\n/)
    // Insert above the entry's closing `---` when it has one, else after its last content line.
    const { to } = deleteRange(lines, s)
    const at = lines[to]?.trim() === '---' ? to : to + 1
    lines.splice(at, 0, note, '')
    writeVerified(t, text, lines.join('\n'), (after) => {
      const hit = findById(after, id)
      if (hit.length !== 1 || hit[0].state !== 'open' || after.sections.length !== parsed.sections.length) {
        return `post-annotate check failed for ${id}`
      }
      return null
    })
    process.stdout.write(`annotated ${id}\n`)
  })
}

function cmdBackfill(t: Target) {
  withLock(t, () => {
    const text = requireText(t)
    const parsed = parseStore(text, t.kind)
    // Only a MISSING ID is filled. A malformed, repeated or duplicate ID needs a human
    // decision about which record is real, so it is refused up front (Codex review).
    const needsHuman = parsed.sections.filter((s) => s.reasons.some((r) => r !== 'missing-id' && ID_REASONS.has(r)))
    if (needsHuman.length) {
      for (const s of needsHuman) process.stdout.write(`${t.path}:${s.line}\t${s.reasons.join(',')}\n`)
      throw new CliError(`${needsHuman.length} section(s) carry a malformed or duplicate ID — fix them by hand, then re-run backfill`, 3)
    }
    let n = nextNumber(parsed)
    // Assign in file order, insert bottom-up so earlier line numbers stay valid.
    const plan = parsed.sections
      .filter((s) => s.reasons.includes('missing-id'))
      .map((s) => ({ s, id: formatId(t.kind, n++) }))
    let lines = text.split(/\r?\n/)
    for (const { s, id } of [...plan].reverse()) {
      const afterHeading = s.line // 0-based index of the line below the heading
      if (lines[afterHeading] === '') lines.splice(afterHeading + 1, 0, `**ID:** ${id}`)
      else lines.splice(afterHeading, 0, '', `**ID:** ${id}`)
    }
    lines = setNextId(lines, parseStore(lines.join('\n'), t.kind), n)
    writeVerified(t, text, lines.join('\n'), (after) => {
      const bad = after.sections.filter((s) => s.reasons.some((r) => ID_REASONS.has(r)))
      if (bad.length || after.nextId === null || after.nextId <= after.maxId || after.sections.length !== parsed.sections.length) {
        return `backfill verification failed in ${t.path} (${bad.length} sections without a unique, well-formed ID)`
      }
      return null
    })
    process.stdout.write(`assigned ${plan.length} IDs; Next ID ${n}\n`)
  })
}

function cmdList(t: Target, flags: Record<string, string>) {
  const text = requireText(t)
  const due = flags.due ?? 'all'
  for (const s of parseStore(text, t.kind).sections) {
    if (due !== 'all' && s.due !== due) continue
    const cols = [s.id ?? '-', s.state, s.due, `L${s.line}`]
    if (s.state === 'unparseable') cols.push(`[${s.reasons.join(',')}]`)
    process.stdout.write(`${cols.join('\t')}\t${s.title}\n`)
  }
}

function cmdCount(t: Target) {
  const text = readText(t)
  if (text === null) {
    process.stdout.write(`${t.kind}\tABSENT\t${t.path}\n`)
    return
  }
  const parsed = parseStore(text, t.kind)
  const { open, unparseable } = countStates(parsed)
  process.stdout.write(`${t.kind}\topen ${open}\tunparseable ${unparseable}\tnext-id ${parsed.nextId ?? '-'}\tmax-id ${parsed.maxId}\n`)
}

function cmdCheck(t: Target): number {
  const parsed = parseStore(requireText(t), t.kind)
  let problems = 0
  for (const s of parsed.sections) {
    if (s.state === 'unparseable') {
      problems++
      process.stdout.write(`${t.path}:${s.line}\t${s.reasons.join(',')}\n`)
    }
  }
  if (parsed.nextId === null || parsed.nextId <= parsed.maxId) {
    problems++
    process.stdout.write(`${t.path}:${parsed.nextIdLine ?? 0}\tcounter ${parsed.nextId ?? 'missing'} is not above max ID ${parsed.maxId}\n`)
  }
  return problems ? 1 : 0
}

function cmdShow(t: Target, positional: string[], locateOnly: boolean) {
  const id = positional[0]
  assertIdForStore(t, id)
  const text = requireText(t)
  const s = one(parseStore(text, t.kind), id, t.path)
  if (locateOnly) {
    process.stdout.write(`${t.path}:${s.line}\n`)
    return
  }
  process.stdout.write(text.split(/\r?\n/).slice(s.line - 1, s.endLine).join('\n') + '\n')
}

function main(): number {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2))
  const t = resolveTarget(flags)
  switch (cmd) {
    case 'add': cmdAdd(t, flags); return 0
    case 'delete': cmdDelete(t, positional, flags); return 0
    case 'annotate': cmdAnnotate(t, positional, flags); return 0
    case 'backfill': cmdBackfill(t); return 0
    case 'list': cmdList(t, flags); return 0
    case 'count': cmdCount(t); return 0
    case 'check': return cmdCheck(t)
    case 'show': cmdShow(t, positional, false); return 0
    case 'locate': cmdShow(t, positional, true); return 0
    default:
      throw new CliError(`unknown command "${cmd}" — see the header of tools/kanban/scripts/inbox-cli.ts`, 2)
  }
}

try {
  process.exitCode = main()
} catch (err) {
  if (err instanceof CliError) {
    process.stderr.write(`inbox: ${err.message}\n`)
    process.exitCode = err.code
  } else {
    process.stderr.write(`inbox: unexpected ${(err as Error)?.name ?? 'error'}\n`)
    process.exitCode = 2
  }
}
