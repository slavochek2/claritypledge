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
//   inbox.sh delete   --store ... <ID> [--tombstone TEXT]
//   inbox.sh annotate --store ... <ID> --text TEXT
//   inbox.sh backfill --store ...
//
// `--file <path> --kind public|private` replaces `--store` (tests, fixtures).
//
// Exit codes: 0 ok · 1 check found problems · 2 usage/input error · 3 not found or
// ambiguous · 4 post-write verification failed · 5 lock timeout · 6 store absent.
//
// PRIVACY: errors name a path, a line and an ID — never a title or body.

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { execFileSync } from 'child_process'
import { parseStore, findById, formatId, kindOfId, countStates, type InboxKind, type ParsedStore } from '../lib/inbox'
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
  const rel = storeRel(kind)
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
  return { kind, path: join(root, rel), lockDir: join(lockBase, `inbox-${kind}.lock`) }
}

// ── lock ────────────────────────────────────────────────────────────────────

const sleepBuf = new Int32Array(new SharedArrayBuffer(4))
const sleep = (ms: number) => Atomics.wait(sleepBuf, 0, 0, ms)

const LOCK_STALE_MS = 120_000
const LOCK_TIMEOUT_MS = 20_000

function withLock<T>(t: Target, fn: () => T): T {
  // INBOX_TEST_NO_LOCK exists only so the concurrency test can prove the lock is
  // what keeps IDs unique (a control that must FAIL). Never set it anywhere else.
  if (process.env.INBOX_TEST_NO_LOCK === '1') return fn()
  const start = Date.now()
  for (;;) {
    try {
      mkdirSync(t.lockDir)
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      try {
        if (Date.now() - statSync(t.lockDir).mtimeMs > LOCK_STALE_MS) {
          rmSync(t.lockDir, { recursive: true, force: true })
          continue
        }
      } catch { /* lock vanished between mkdir and stat — retry */ }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new CliError(`lock held for over ${LOCK_TIMEOUT_MS / 1000}s: ${t.lockDir}`, 5)
      }
      sleep(25 + Math.floor(Math.random() * 50))
    }
  }
  try {
    return fn()
  } finally {
    rmSync(t.lockDir, { recursive: true, force: true })
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

function writeAtomic(path: string, text: string) {
  const tmp = join(dirname(path), `.${Date.now()}-${process.pid}.inbox.tmp`)
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

function testDelay() {
  const ms = Number(process.env.INBOX_TEST_DELAY_MS ?? 0)
  if (ms > 0) sleep(ms)
}

function one(parsed: ParsedStore, id: string, path: string) {
  const hits = findById(parsed, id)
  if (hits.length === 0) throw new CliError(`no entry ${id} in ${path}`, 3)
  if (hits.length > 1) throw new CliError(`${id} occurs ${hits.length} times in ${path} — fix the store first`, 3)
  return hits[0]
}

function assertIdForStore(t: Target, id: string | undefined) {
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
  for (const l of text.split('\n')) {
    if (/^## /.test(l) || /^\*\*(Status|ID|Next ID|due):\*\*/.test(l) || /^ {0,3}(```|~~~)/.test(l)) {
      throw new CliError(`${what} contains a line the store format reserves (heading, field, or fence)`, 2)
    }
  }
}

// ── commands ────────────────────────────────────────────────────────────────

function cmdAdd(t: Target, flags: Record<string, string>) {
  const title = (flags.title ?? '').trim()
  if (!title || title.includes('\n') || title.startsWith('#')) throw new CliError('--title must be one non-empty line', 2)
  const due = flags.due ?? 'week'
  if (due !== 'week' && due !== 'month') throw new CliError('--due must be week or month', 2)
  const body = readFileSync(0, 'utf-8').trim()
  if (!body) throw new CliError('the note body (stdin) is empty', 2)
  assertInert(body, 'body')
  if (/INBOX-/.test(title)) throw new CliError('title must not contain an inbox ID', 2)
  const date = new Date().toISOString().slice(0, 10)

  return withLock(t, () => {
    let text = readText(t)
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

    let lines = setNextId(text.replace(/\n*$/, '').split('\n'), parsed, n + 1)
    lines = [...lines, '', `## ${title}`, '', `**ID:** ${id}`, `**Date:** ${date}`, '**Status:** proposed', `**due:** ${due}`, '', body, '', '---', '']
    writeAtomic(t.path, lines.join('\n'))

    const after = parseStore(requireText(t), t.kind)
    const hits = findById(after, id)
    if (hits.length !== 1 || hits[0].state !== 'open' || after.nextId !== n + 1) {
      throw new CliError(`post-write check failed for ${id} in ${t.path} (occurrences: ${hits.length})`, 4)
    }
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
    if (/INBOX-/.test(tomb) || tomb.includes('\n') || tomb.includes('-->')) {
      throw new CliError('--tombstone must be one line, with no inbox ID and no "-->"', 2)
    }
  }
  withLock(t, () => {
    const text = requireText(t)
    const parsed = parseStore(text, t.kind)
    const s = one(parsed, id, t.path)
    testDelay()
    const lines = text.split('\n')
    const replacement = tomb ? [`<!-- ${tomb} -->`, ''] : []
    lines.splice(s.line - 1, s.endLine - s.line + 1, ...replacement)
    writeAtomic(t.path, lines.join('\n'))
    const after = parseStore(requireText(t), t.kind)
    if (findById(after, id).length !== 0) throw new CliError(`${id} still present after delete in ${t.path}`, 4)
    process.stdout.write(`deleted ${id} (was line ${s.line})\n`)
  })
}

function cmdAnnotate(t: Target, positional: string[], flags: Record<string, string>) {
  const id = positional[0]
  assertIdForStore(t, id)
  const note = (flags.text ?? '').trim()
  if (!note || note.includes('\n')) throw new CliError('--text must be one non-empty line', 2)
  assertInert(note, 'text')
  if (/INBOX-/.test(note)) throw new CliError('--text must not contain an inbox ID', 2)
  withLock(t, () => {
    const text = requireText(t)
    const s = one(parseStore(text, t.kind), id, t.path)
    const lines = text.split('\n')
    // Insert above the entry's closing `---` when it has one, else at its end.
    let at = s.endLine // 0-based index just past the section
    let k = s.endLine - 1
    while (k >= s.line && lines[k].trim() === '') k--
    if (lines[k]?.trim() === '---') at = k
    lines.splice(at, 0, note, '')
    writeAtomic(t.path, lines.join('\n'))
    const after = parseStore(requireText(t), t.kind)
    if (findById(after, id).length !== 1) throw new CliError(`post-annotate check failed for ${id}`, 4)
    process.stdout.write(`annotated ${id}\n`)
  })
}

function cmdBackfill(t: Target) {
  withLock(t, () => {
    const text = requireText(t)
    const parsed = parseStore(text, t.kind)
    let n = nextNumber(parsed)
    // Assign in file order, insert bottom-up so earlier line numbers stay valid.
    const plan = parsed.sections
      .filter((s) => s.reasons.includes('missing-id'))
      .map((s) => ({ s, id: formatId(t.kind, n++) }))
    let lines = text.split('\n')
    for (const { s, id } of [...plan].reverse()) {
      const afterHeading = s.line // 0-based index of the line below the heading
      if (lines[afterHeading] === '') lines.splice(afterHeading + 1, 0, `**ID:** ${id}`)
      else lines.splice(afterHeading, 0, '', `**ID:** ${id}`)
    }
    lines = setNextId(lines, parseStore(lines.join('\n'), t.kind), n)
    writeAtomic(t.path, lines.join('\n'))
    const after = parseStore(requireText(t), t.kind)
    const missing = after.sections.filter((s) => s.reasons.includes('missing-id') || s.reasons.includes('duplicate-id'))
    if (missing.length || after.nextId === null || after.nextId <= after.maxId) {
      throw new CliError(`backfill verification failed in ${t.path} (${missing.length} sections without a unique ID)`, 4)
    }
    process.stdout.write(`assigned ${plan.length} IDs; Next ID ${after.nextId}\n`)
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
  process.stdout.write(text.split('\n').slice(s.line - 1, s.endLine).join('\n') + '\n')
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
